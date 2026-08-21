import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Transaction, Member, AppSettings, DriveFileItem } from '../types';

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

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
const CUSTOM_CLIENT_ID_KEY = 'fbc_custom_oauth_client_id';

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

// Keep Firebase auth state listener
onAuthStateChanged(auth, async (user: User | null) => {
  if (!user) {
    if (!cachedAccessToken) {
      setCachedAuth(null, null);
    }
  } else if (!cachedUserProfile && user) {
    const profile: GoogleUserProfile = {
      id: user.uid,
      email: user.email || undefined,
      name: user.displayName || undefined,
      picture: user.photoURL || undefined,
    };
    cachedUserProfile = profile;
    authListeners.forEach((fn) => {
      try {
        fn(profile, cachedAccessToken);
      } catch (err) {
        console.error(err);
      }
    });
  }
});

export function getCustomClientId(): string {
  try {
    return localStorage.getItem(CUSTOM_CLIENT_ID_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setCustomClientId(clientId: string): void {
  try {
    if (clientId && clientId.trim()) {
      localStorage.setItem(CUSTOM_CLIENT_ID_KEY, clientId.trim());
    } else {
      localStorage.removeItem(CUSTOM_CLIENT_ID_KEY);
    }
  } catch (e) {
    // ignore
  }
}

export function getEffectiveClientId(): string {
  const custom = getCustomClientId();
  if (custom) return custom;
  return firebaseConfig.oAuthClientId || '';
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
  callback(getCachedUser(), getCachedToken());
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx > -1) authListeners.splice(idx, 1);
  };
}

// Helper to check for expired token / auth error and clear cached state immediately
function checkAndHandleAuthError(status: number, message?: string) {
  const isAuthError = 
    status === 401 ||
    status === 403 ||
    (typeof message === 'string' && (
      message.toLowerCase().includes('invalid authentication credentials') ||
      message.toLowerCase().includes('unauthenticated') ||
      message.toLowerCase().includes('access token') ||
      message.toLowerCase().includes('oauth 2 access token') ||
      message.toLowerCase().includes('invalid credentials')
    ));

  if (isAuthError) {
    setCachedAuth(null, null);
    throw new Error('Your Google session has expired or requires sign-in. Please click "Sign in with Google" to connect.');
  }
}

// Helper to ensure GSI script is loaded
async function ensureGoogleScriptLoaded(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity client')));
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
 * Initiates Google OAuth Sign In using Firebase Auth with Google Identity Services fallback
 */
export async function googleSignIn(): Promise<{ user: GoogleUserProfile; accessToken: string }> {
  // If custom client ID is explicitly provided, use GIS directly
  const customId = getCustomClientId();
  if (customId) {
    return googleSignInWithGIS(customId);
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.setCustomParameters({ prompt: 'select_account consent' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      const effectiveId = getEffectiveClientId();
      if (effectiveId) {
        return await googleSignInWithGIS(effectiveId);
      }
      throw new Error('Google sign-in completed, but no OAuth access token was returned.');
    }

    const userProfile: GoogleUserProfile = {
      id: result.user.uid,
      email: result.user.email || undefined,
      name: result.user.displayName || undefined,
      picture: result.user.photoURL || undefined,
    };

    setCachedAuth(accessToken, userProfile);
    return { user: userProfile, accessToken };
  } catch (err: any) {
    console.warn('Firebase Auth popup failed, attempting GIS fallback:', err);
    if (err?.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in cancelled. Please complete the Google sign-in window.');
    }

    const effectiveId = getEffectiveClientId();
    if (effectiveId) {
      try {
        return await googleSignInWithGIS(effectiveId);
      } catch (gisErr: any) {
        throw new Error(gisErr?.message || err?.message || 'Google sign-in authorization failed.');
      }
    }
    throw new Error(err?.message || 'Google sign-in authorization failed.');
  }
}

/**
 * Google Identity Services sign-in fallback
 */
async function googleSignInWithGIS(clientId: string): Promise<{ user: GoogleUserProfile; accessToken: string }> {
  await ensureGoogleScriptLoaded();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not ready. Please refresh the page and try again.');
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
          reject(new Error(err?.message || 'Google Sign-in failed. Check popup blockers or registered JavaScript origins.'));
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
    }
  });
}

export async function googleLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    // ignore
  }

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
  if (!token) {
    throw new Error('Please sign in to Google first.');
  }

  const query = encodeURIComponent("trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/json')");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=30&orderBy=modifiedTime%20desc`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `Failed to fetch Drive files (${res.status})`;
      checkAndHandleAuthError(res.status, errMsg);
      throw new Error(errMsg);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err: any) {
    checkAndHandleAuthError(0, err?.message);
    throw err;
  }
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
  if (!token) {
    throw new Error('Please sign in to Google first.');
  }

  const { transactions, members, settings, existingSpreadsheetId } = payload;
  const orgName = settings.organizationName || 'Fallah Behbood Committee';
  const sheetTitle = `${orgName} Ledger (Pampore)`;

  let spreadsheetId = existingSpreadsheetId;

  // 1. If spreadsheet ID exists, verify access
  if (spreadsheetId) {
    try {
      const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!checkRes.ok) {
        if (checkRes.status === 401) {
          const err = await checkRes.json().catch(() => ({}));
          checkAndHandleAuthError(401, err?.error?.message);
        }
        // If 404 / 403, create a new sheet
        spreadsheetId = undefined;
      }
    } catch (e: any) {
      if (e?.message?.includes('expired') || e?.message?.includes('sign-in')) {
        throw e;
      }
      spreadsheetId = undefined;
    }
  }

  // 2. If no spreadsheet ID exists, create a new Google Sheet
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
      const errMsg = err.error?.message || 'Failed to create Google Spreadsheet';
      checkAndHandleAuthError(createRes.status, errMsg);
      throw new Error(errMsg);
    }

    const createdData = await createRes.json();
    spreadsheetId = createdData.spreadsheetId;
  }

  // 3. Prepare Tab Data
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

  // 4. Batch Update Spreadsheet Values
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
    const errMsg = err.error?.message || 'Failed to update Google Sheet values';
    checkAndHandleAuthError(updateRes.status, errMsg);
    throw new Error(errMsg);
  }

  // 5. Retrieve web link from Drive API
  let webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  let fileName = sheetTitle;
  try {
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,webViewLink`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      if (fileData.webViewLink) webViewLink = fileData.webViewLink;
      if (fileData.name) fileName = fileData.name;
    }
  } catch (fErr) {
    // webViewLink is already set
  }

  return {
    spreadsheetId: spreadsheetId!,
    name: fileName,
    webViewLink,
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
  if (!token) {
    throw new Error('Please sign in to Google first.');
  }

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
    const errMsg = err.error?.message || 'Failed to save JSON backup to Google Drive';
    checkAndHandleAuthError(res.status, errMsg);
    throw new Error(errMsg);
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
  if (!token) {
    throw new Error('Please sign in to Google first.');
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    const errMsg = err.error?.message || 'Failed to retrieve file details from Google Drive';
    checkAndHandleAuthError(metaRes.status, errMsg);
    throw new Error(errMsg);
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
      const err = await downloadRes.json().catch(() => ({}));
      const errMsg = err.error?.message || 'Failed to download JSON backup file from Google Drive';
      checkAndHandleAuthError(downloadRes.status, errMsg);
      throw new Error(errMsg);
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

    if (!ledgerRes.ok && ledgerRes.status === 401) {
      const err = await ledgerRes.json().catch(() => ({}));
      checkAndHandleAuthError(401, err?.error?.message);
    }

    const membersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/'Members Directory'!A2:D1000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!membersRes.ok && membersRes.status === 401) {
      const err = await membersRes.json().catch(() => ({}));
      checkAndHandleAuthError(401, err?.error?.message);
    }

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

