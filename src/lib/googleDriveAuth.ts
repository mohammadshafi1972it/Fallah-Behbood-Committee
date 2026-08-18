import firebaseConfig from '../../firebase-applet-config.json';
import { Transaction, Member, AppSettings, DriveFileItem } from '../types';

// Global declaration for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any; details?: string }) => void;
            error_callback?: (error: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export interface GoogleUserProfile {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const TOKEN_STORAGE_KEY = 'fbc_google_access_token';
const USER_STORAGE_KEY = 'fbc_google_user_profile';

let cachedAccessToken: string | null = null;
let cachedUserProfile: GoogleUserProfile | null = null;
const authListeners: Array<(user: GoogleUserProfile | null, token: string | null) => void> = [];

// Initialize from storage
try {
  const savedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
  if (savedToken) cachedAccessToken = savedToken;
  const savedUser = sessionStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(USER_STORAGE_KEY);
  if (savedUser) cachedUserProfile = JSON.parse(savedUser);
} catch (e) {
  // ignore
}

export function setCachedAuth(token: string | null, user: GoogleUserProfile | null) {
  cachedAccessToken = token;
  cachedUserProfile = user;
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    if (user) {
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(USER_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch (e) {
    // ignore
  }

  authListeners.forEach((fn) => {
    try {
      fn(user, token);
    } catch (err) {
      console.error(err);
    }
  });
}

export function getCachedToken(): string | null {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }
  return cachedAccessToken;
}

export function getCachedUser(): GoogleUserProfile | null {
  if (!cachedUserProfile) {
    try {
      const savedUser = sessionStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(USER_STORAGE_KEY);
      if (savedUser) cachedUserProfile = JSON.parse(savedUser);
    } catch (e) {
      // ignore
    }
  }
  return cachedUserProfile;
}

export function subscribeAuth(callback: (user: GoogleUserProfile | null, token: string | null) => void) {
  authListeners.push(callback);
  // Trigger immediate current state
  callback(getCachedUser(), getCachedToken());
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx > -1) authListeners.splice(idx, 1);
  };
}

// Helper to ensure GSI script is loaded
async function ensureGoogleScriptLoaded(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity client')));
      // In case it already loaded
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity client'));
    document.head.appendChild(script);
  });
}

/**
 * Initiates Google OAuth Sign In using Google Identity Services (GIS)
 */
export async function googleSignIn(): Promise<{ user: GoogleUserProfile; accessToken: string }> {
  await ensureGoogleScriptLoaded();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not ready. Please try again.');
  }

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('OAuth Client ID is missing in configuration.');
  }

  return new Promise((resolve, reject) => {
    let handled = false;

    try {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (response) => {
          if (handled) return;
          handled = true;

          if (response.error) {
            reject(new Error(response.details || response.error || 'Google sign-in authorization failed.'));
            return;
          }

          if (!response.access_token) {
            reject(new Error('No access token returned by Google.'));
            return;
          }

          const accessToken = response.access_token;

          // Fetch user profile info
          let userProfile: GoogleUserProfile = { email: 'Google Account User' };
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userInfoRes.ok) {
              userProfile = await userInfoRes.json();
            }
          } catch (uErr) {
            console.warn('Could not fetch user profile details:', uErr);
          }

          setCachedAuth(accessToken, userProfile);
          resolve({ user: userProfile, accessToken });
        },
        error_callback: (err) => {
          if (handled) return;
          handled = true;
          console.error('GIS Error callback:', err);
          reject(new Error(err?.message || 'Google Sign-in failed. Check popup blockers.'));
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
    }
  });
}

export async function googleLogout() {
  const token = getCachedToken();
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {
      // ignore
    }
  }
  setCachedAuth(null, null);
}

// ==========================================
// GOOGLE DRIVE & GOOGLE SHEETS API OPERATIONS
// ==========================================

export async function fetchDriveFilesList(token: string): Promise<DriveFileItem[]> {
  const query = encodeURIComponent("trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/json')");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=30&orderBy=modifiedTime%20desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to fetch Drive files (${res.status})`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function syncLedgerToGoogleSheet(
  token: string,
  payload: {
    transactions: Transaction[];
    members: Member[];
    settings: AppSettings;
    existingSpreadsheetId?: string;
  }
): Promise<{ spreadsheetId: string; name: string; webViewLink: string; syncedAt: string }> {
  const { transactions, members, settings, existingSpreadsheetId } = payload;
  const orgName = settings.organizationName || 'Fallah Behbood Committee';
  const sheetTitle = `${orgName} Ledger (Pampore)`;

  let spreadsheetId = existingSpreadsheetId;

  // 1. If no spreadsheet ID exists, create a new Google Sheet
  if (!spreadsheetId) {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title: sheetTitle },
        sheets: [
          { properties: { title: 'Ledger Entries' } },
          { properties: { title: 'Members Directory' } },
          { properties: { title: 'Monthly Summary' } },
        ],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to create Google Spreadsheet');
    }

    const createdData = await createRes.json();
    spreadsheetId = createdData.spreadsheetId;
  }

  // 2. Prepare Tab Data
  const ledgerHeader = [
    'Date',
    'Type',
    'Ledger No',
    'Name / Paid To',
    'Head / Fund',
    'Amount (Rs.)',
    'For Month',
    'Receipt/Voucher No',
    'Payment Mode',
    'Remarks',
  ];

  const ledgerRows = (transactions || []).map((t) => [
    t.date || '',
    t.type || '',
    t.ledgerNo || '',
    t.type === 'Income' ? t.memberName || '' : t.paidTo || '',
    t.head || '',
    t.amount || 0,
    t.forMonth || '',
    t.receiptVoucherNo || '',
    t.mode || '',
    t.remarks || '',
  ]);

  const membersHeader = ['Ledger No', 'Member Name', 'Phone / WhatsApp', 'Standard Monthly Due (Rs.)'];
  const membersRows = (members || []).map((m) => [
    m.ledgerNo || '',
    m.name || '',
    m.phone || '',
    m.monthlyDue || 150,
  ]);

  const summaryHeader = ['Metric', 'Value'];
  const totalIncome = transactions.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalExpenditure = transactions.filter((t) => t.type === 'Expenditure').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const opening = Number(settings.openingBalance) || 0;
  const net = opening + totalIncome - totalExpenditure;

  const summaryRows = [
    ['Organization Name', orgName],
    ['Opening Balance (Rs.)', opening],
    ['Total Income Recorded (Rs.)', totalIncome],
    ['Total Expenditure Recorded (Rs.)', totalExpenditure],
    ['Net Cash in Hand / Bank (Rs.)', net],
    ['Total Active Members', members.length],
    ['Total Ledger Records', transactions.length],
    ['Last Synced Timestamp', new Date().toLocaleString()],
  ];

  // 3. Batch Update Spreadsheet Values
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: "'Ledger Entries'!A1",
            values: [ledgerHeader, ...ledgerRows],
          },
          {
            range: "'Members Directory'!A1",
            values: [membersHeader, ...membersRows],
          },
          {
            range: "'Monthly Summary'!A1",
            values: [summaryHeader, ...summaryRows],
          },
        ],
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update Google Sheet values');
  }

  // 4. Retrieve web link from Drive API
  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,webViewLink`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const fileData = await fileRes.json().catch(() => ({}));

  return {
    spreadsheetId: spreadsheetId!,
    name: fileData.name || sheetTitle,
    webViewLink: fileData.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    syncedAt: new Date().toISOString(),
  };
}

export async function saveJsonBackupToDrive(
  token: string,
  payload: {
    transactions: Transaction[];
    members: Member[];
    settings: AppSettings;
    existingFileId?: string;
  }
): Promise<{ fileId: string; name: string; webViewLink?: string }> {
  const fileName = 'Fallah_Behbood_Committee_Ledger_Backup.json';
  const jsonContent = JSON.stringify(
    {
      transactions: payload.transactions,
      members: payload.members,
      settings: payload.settings,
      exportedAt: new Date().toISOString(),
      version: '2.0',
    },
    null,
    2
  );

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    closeDelimiter;

  let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
  let method = 'POST';

  if (payload.existingFileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${payload.existingFileId}?uploadType=multipart&fields=id,name,webViewLink`;
    method = 'PATCH';
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to save JSON backup to Google Drive');
  }

  const data = await res.json();
  return {
    fileId: data.id,
    name: data.name,
    webViewLink: data.webViewLink,
  };
}

export async function loadFileFromGoogleDrive(
  token: string,
  fileId: string
): Promise<{
  transactions: Transaction[];
  members: Member[];
  settings?: AppSettings;
}> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!metaRes.ok) {
    throw new Error('Failed to retrieve file details from Google Drive');
  }

  const meta = await metaRes.json();

  if (meta.mimeType === 'application/json') {
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!downloadRes.ok) {
      throw new Error('Failed to download JSON backup file from Google Drive');
    }

    const json = await downloadRes.json();
    return {
      transactions: json.transactions || [],
      members: json.members || [],
      settings: json.settings,
    };
  } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const ledgerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/'Ledger Entries'!A2:J10000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const membersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/'Members Directory'!A2:D1000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const ledgerData = await ledgerRes.json().catch(() => ({ values: [] }));
    const membersData = await membersRes.json().catch(() => ({ values: [] }));

    const transactions: Transaction[] = (ledgerData.values || []).map((row: any[], i: number) => ({
      id: `drive-import-${i}-${Date.now()}`,
      date: row[0] || '',
      type: (row[1] as any) || 'Income',
      ledgerNo: row[2] || '',
      memberName: row[1] === 'Income' ? row[3] || '' : '',
      paidTo: row[1] === 'Expenditure' ? row[3] || '' : '',
      head: row[4] || 'Other',
      amount: parseFloat(row[5]) || 0,
      forMonth: row[6] || '',
      receiptVoucherNo: row[7] || '',
      mode: (row[8] as any) || 'Cash',
      remarks: row[9] || '',
      createdAt: new Date().toISOString(),
    }));

    const members: Member[] = (membersData.values || [])
      .map((row: any[]) => ({
        ledgerNo: String(row[0] || '').trim(),
        name: String(row[1] || '').trim(),
        phone: String(row[2] || '').trim(),
        monthlyDue: parseFloat(row[3]) || 150,
      }))
      .filter((m: Member) => m.ledgerNo && m.name);

    return {
      transactions,
      members,
    };
  } else {
    throw new Error('Unsupported file type. Please select a JSON backup or a Google Spreadsheet.');
  }
}
