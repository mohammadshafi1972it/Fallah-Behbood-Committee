import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

// Helper to get OAuth2 client
function getOAuth2Client(req?: express.Request) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  
  // Construct redirect URI dynamically from APP_URL or host
  let appUrl = process.env.APP_URL || "";
  if (!appUrl && req) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    appUrl = `${protocol}://${host}`;
  }
  appUrl = appUrl.replace(/\/$/, "");

  const redirectUri = `${appUrl}/api/auth/google/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Helper to get authenticated Google Auth client from user cookies
async function getAuthenticatedClient(req: express.Request, res?: express.Response) {
  const accessToken = req.cookies.g_access_token;
  const refreshToken = req.cookies.g_refresh_token;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const oauth2Client = getOAuth2Client(req);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Automatically refresh access token if missing or expired, but refresh token exists
  if (!accessToken && refreshToken) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const newAccess = refreshed.credentials.access_token;
      if (newAccess) {
        oauth2Client.setCredentials({ access_token: newAccess, refresh_token: refreshToken });
        if (res) {
          res.cookie("g_access_token", newAccess, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          });
        }
      }
    } catch (err) {
      console.error("Failed to refresh Google OAuth token:", err);
      return null;
    }
  }

  return oauth2Client;
}

// ==================== API ROUTES ==================== //

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Google OAuth Auth URL
app.get("/api/auth/google/url", (req, res) => {
  const oauth2Client = getOAuth2Client(req);
  if (!process.env.OAUTH_CLIENT_ID) {
    return res.status(400).json({ error: "OAUTH_CLIENT_ID environment variable is missing." });
  }

  const scopes = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });

  res.json({ url });
});

// Google OAuth Callback
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send("Authorization code missing.");
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.access_token) {
      res.cookie("g_access_token", tokens.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    if (tokens.refresh_token) {
      res.cookie("g_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Drive Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a; }
            .card { text-align: center; padding: 2.5rem; background: white; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; max-width: 420px; width: 90%; }
            .icon { width: 56px; height: 56px; color: #16a34a; margin-bottom: 1rem; }
            h2 { margin: 0 0 0.5rem 0; font-size: 1.35rem; font-weight: 700; color: #0f172a; }
            p { margin: 0; color: #64748b; font-size: 0.9rem; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h2>Google Drive Connected!</h2>
            <p>Authentication successful. You can close this window now.</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(function() { window.close(); }, 1000);
              } else {
                window.location.href = '/?google_auth=success';
              }
            } catch(e) {
              window.location.href = '/?google_auth=success';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Error exchanging OAuth code:", error);
    res.status(500).send(`Authentication failed: ${error.message || error}`);
  }
});

// Google OAuth Status
app.get("/api/auth/google/status", async (req, res) => {
  const authClient = await getAuthenticatedClient(req, res);
  if (!authClient) {
    return res.json({ authenticated: false });
  }

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userInfo = await oauth2.userinfo.get();
    return res.json({
      authenticated: true,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    });
  } catch (err) {
    return res.json({ authenticated: false });
  }
});

// Google Logout
app.post("/api/auth/google/logout", (_req, res) => {
  res.clearCookie("g_access_token", { secure: true, sameSite: "none" });
  res.clearCookie("g_refresh_token", { secure: true, sameSite: "none" });
  res.json({ success: true });
});

// List Google Drive Files & Spreadsheets
app.get("/api/google/drive/files", async (req, res) => {
  const authClient = await getAuthenticatedClient(req, res);
  if (!authClient) {
    return res.status(401).json({ error: "Google OAuth not authenticated." });
  }

  try {
    const drive = google.drive({ version: "v3", auth: authClient });
    const response = await drive.files.list({
      q: "trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/json')",
      fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
      pageSize: 30,
      orderBy: "modifiedTime desc",
    });

    res.json({ files: response.data.files || [] });
  } catch (error: any) {
    console.error("Drive list error:", error);
    res.status(500).json({ error: error.message || "Failed to list Google Drive files" });
  }
});

// Export / Sync to Google Sheets
app.post("/api/google/drive/sync-sheet", async (req, res) => {
  const authClient = await getAuthenticatedClient(req, res);
  if (!authClient) {
    return res.status(401).json({ error: "Google OAuth not authenticated." });
  }

  const { spreadsheetId, sheetTitle, data } = req.body;
  if (!data || !data.transactions || !data.members) {
    return res.status(400).json({ error: "Invalid data payload." });
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    let targetId = spreadsheetId;
    const title = sheetTitle || "Fallah Behbood Committee Ledger (Pampore)";

    // If no spreadsheetId provided, create a new Google Spreadsheet
    if (!targetId) {
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [
            { properties: { title: "Ledger Entries" } },
            { properties: { title: "Members Directory" } },
            { properties: { title: "Monthly Summary" } },
            { properties: { title: "Payments" } },
          ],
        },
      });
      targetId = createRes.data.spreadsheetId;
    }

    // Format Ledger Entries
    const ledgerHeader = ["Date", "Type", "Ledger No", "Name / Paid To", "Head", "Amount (Rs.)", "For Month", "Receipt/Voucher No", "Mode", "Remarks"];
    const ledgerRows = (data.transactions || []).map((t: any) => [
      t.date || "",
      t.type || "",
      t.ledgerNo || "",
      t.type === "Income" ? (t.memberName || "") : (t.paidTo || ""),
      t.head || "",
      t.amount || 0,
      t.forMonth || "",
      t.receiptVoucherNo || "",
      t.mode || "",
      t.remarks || "",
    ]);

    // Format Members Directory
    const membersHeader = ["Ledger No", "Name", "Monthly Due (Rs.)"];
    const membersRows = (data.members || []).map((m: any) => [
      m.ledgerNo || "",
      m.name || "",
      m.monthlyDue || 150,
    ]);

    // Format Monthly Summary
    const monthlyHeader = ["Opening Balance", data.settings?.openingBalance || 0];

    // Clear and batch update values
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: targetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
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
            values: [monthlyHeader],
          },
        ],
      },
    });

    // Get file web link
    const fileRes = await drive.files.get({
      fileId: targetId,
      fields: "id, name, webViewLink",
    });

    res.json({
      success: true,
      spreadsheetId: targetId,
      name: fileRes.data.name,
      webViewLink: fileRes.data.webViewLink,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sheets sync error:", error);
    res.status(500).json({ error: error.message || "Failed to sync to Google Sheets" });
  }
});

// Save complete JSON Backup directly to Google Drive
app.post("/api/google/drive/save-backup", async (req, res) => {
  const authClient = await getAuthenticatedClient(req, res);
  if (!authClient) {
    return res.status(401).json({ error: "Google OAuth not authenticated." });
  }

  const { fileId, fileName, data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "Data payload required." });
  }

  try {
    const drive = google.drive({ version: "v3", auth: authClient });
    const content = JSON.stringify(data, null, 2);
    const title = fileName || "Fallah_Behbood_Committee_Ledger_Backup.json";

    if (fileId) {
      // Update existing backup file
      const updated = await drive.files.update({
        fileId,
        media: {
          mimeType: "application/json",
          body: content,
        },
        fields: "id, name, webViewLink, modifiedTime",
      });
      return res.json({
        success: true,
        file: updated.data,
        syncedAt: new Date().toISOString(),
      });
    } else {
      // Create new backup file
      const created = await drive.files.create({
        requestBody: {
          name: title,
          mimeType: "application/json",
        },
        media: {
          mimeType: "application/json",
          body: content,
        },
        fields: "id, name, webViewLink, modifiedTime",
      });
      return res.json({
        success: true,
        file: created.data,
        syncedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Drive save backup error:", error);
    res.status(500).json({ error: error.message || "Failed to save backup to Google Drive" });
  }
});

// Load JSON Backup or Google Sheet from Drive
app.get("/api/google/drive/load-file/:fileId", async (req, res) => {
  const authClient = await getAuthenticatedClient(req, res);
  if (!authClient) {
    return res.status(401).json({ error: "Google OAuth not authenticated." });
  }

  const fileId = req.params.fileId;
  try {
    const drive = google.drive({ version: "v3", auth: authClient });
    const fileMeta = await drive.files.get({ fileId, fields: "id, name, mimeType" });

    if (fileMeta.data.mimeType === "application/json") {
      const contentRes = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
      );
      let parsed = JSON.parse(contentRes.data as string);
      return res.json({ success: true, file: fileMeta.data, data: parsed });
    } else if (fileMeta.data.mimeType === "application/vnd.google-apps.spreadsheet") {
      const sheets = google.sheets({ version: "v4", auth: authClient });
      
      // Read Ledger Entries
      const ledgerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: "'Ledger Entries'!A2:J10000",
      });

      // Read Members
      const membersRes = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: "'Members Directory'!A2:C1000",
      });

      const transactions = (ledgerRes.data.values || []).map((row: any, i: number) => ({
        id: `drive-import-${i}-${Date.now()}`,
        date: row[0] || "",
        type: row[1] || "Income",
        ledgerNo: row[2] || "",
        memberName: row[1] === "Income" ? (row[3] || "") : "",
        paidTo: row[1] === "Expenditure" ? (row[3] || "") : "",
        head: row[4] || "Other",
        amount: parseFloat(row[5]) || 0,
        forMonth: row[6] || "",
        receiptVoucherNo: row[7] || "",
        mode: row[8] || "Cash",
        remarks: row[9] || "",
        createdAt: new Date().toISOString(),
      }));

      const members = (membersRes.data.values || []).map((row: any) => ({
        ledgerNo: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        monthlyDue: parseFloat(row[2]) || 150,
      })).filter((m: any) => m.ledgerNo && m.name);

      return res.json({
        success: true,
        file: fileMeta.data,
        data: {
          members,
          transactions,
          settings: { openingBalance: 0 },
        },
      });
    } else {
      return res.status(400).json({ error: "Unsupported file format. Select a JSON or Google Sheet file." });
    }
  } catch (error: any) {
    console.error("Drive load file error:", error);
    res.status(500).json({ error: error.message || "Failed to load file from Google Drive" });
  }
});

// ==================== VITE MIDDLEWARE / STATIC SERVING ==================== //

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
