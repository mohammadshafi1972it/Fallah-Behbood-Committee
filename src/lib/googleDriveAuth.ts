import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Transaction, Member, AppSettings, DriveFileItem } from '../types';

// Initialize Firebase App instance safely (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Provider with Drive & Sheets scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory access token cache
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Keep token in session storage as fallback across page refresh in active session
const SESSION_TOKEN_KEY = 'fbc_google_access_token';
try {
  const saved = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (saved) cachedAccessToken = saved;
} catch (e) {
  // ignore
}

export function setCachedToken(token: string | null) {
  cachedAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch (e) {
    // ignore
  }
}

export function getCachedToken(): string | null {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch (e) {
      // ignore
    }
  }
  return cachedAccessToken;
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getCachedToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      setCachedToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in succeeded, but no OAuth access token was returned.');
    }

    setCachedToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const googleLogout = async () => {
  setCachedToken(null);
  await signOut(auth);
};

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

  // 1. If no spreadsheet ID exists or not found, create a new Google Sheet
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
  // First inspect file metadata
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
    // Read sheets
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
