const fs = require("fs-extra");
const { google } = require("googleapis");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = path.join(__dirname, "..", "config", "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "..", "config", "credentials.json");

let expressApp = null;
let authRouteRegistered = false; // Prevent duplicate /auth route registration

// Set Express app for OAuth callback routing
function setExpressApp(app) {
  expressApp = app;

  if (!authRouteRegistered) {
    authRouteRegistered = true;
    expressApp.get("/auth", (req, res) => {
      const code = req.query.code;
      if (code) {
        const oAuth2Client = loadCredentials();
        if (!oAuth2Client) {
          return res.status(500).send("Google Drive credentials.json not found.");
        }
        
        oAuth2Client.getToken(code, (err, token) => {
          if (err) {
            console.error("Error retrieving access token", err);
            return res.send("Authorization failed. Check console for details.");
          }
          oAuth2Client.setCredentials(token);
          fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log("Token stored to", TOKEN_PATH);
          });
          res.send(`
            <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f0f;color:#fff;">
              <div style="text-align:center">
                <h2 style="color:#4ade80">✅ Google Drive Connected!</h2>
                <p>Authorization successful. You can close this window.</p>
                <p style="opacity:0.5;font-size:0.875rem">Return to the PteroPal dashboard.</p>
              </div>
            </body></html>
          `);
        });
      } else {
        res.send("No authorization code provided.");
      }
    });
  }
}

// Check if credentials.json exists
function hasCredentials() {
  return fs.existsSync(CREDENTIALS_PATH);
}

// Check if token.json exists (Drive connected)
function hasToken() {
  return fs.existsSync(TOKEN_PATH);
}

// Get Drive connection status
function getConnectionStatus() {
  const driveEnabled = process.env.ENABLE_DRIVE_BACKUP !== "false";
  if (!driveEnabled) {
    return { enabled: false, hasCredentials: false, connected: false, reason: "Drive backup disabled via ENABLE_DRIVE_BACKUP" };
  }
  if (!hasCredentials()) {
    return { enabled: true, hasCredentials: false, connected: false, reason: "credentials.json not found" };
  }
  if (!hasToken()) {
    return { enabled: true, hasCredentials: true, connected: false, reason: "Not authorized — visit /api/drive/auth-url to connect" };
  }
  return { enabled: true, hasCredentials: true, connected: true, reason: "Connected" };
}

// Save uploaded credentials.json
function saveCredentials(data) {
  fs.ensureDirSync(path.dirname(CREDENTIALS_PATH));
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2));
}

// Delete credentials.json and token.json
function deleteCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    fs.removeSync(CREDENTIALS_PATH);
  }
  if (fs.existsSync(TOKEN_PATH)) {
    fs.removeSync(TOKEN_PATH);
  }
  authRouteRegistered = false;
}

// Load credentials and return OAuth2 client (without token)
function loadCredentials() {
  if (!hasCredentials()) return null;
  const content = fs.readJsonSync(CREDENTIALS_PATH);
  const { client_secret, client_id, redirect_uris } = content.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Generate OAuth URL for user to visit
function getAuthUrl() {
  const oAuth2Client = loadCredentials();
  if (!oAuth2Client) return null;
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

// Authorize with Google Drive API (legacy callback style)
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

// Request access token via browser OAuth
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  console.log("Or use the web dashboard to connect Google Drive.");
}

// Disconnect Google Drive (delete local token — does not revoke from Google)
function disconnect() {
  if (hasToken()) {
    fs.removeSync(TOKEN_PATH);
    authRouteRegistered = false; // Allow re-registration on next auth flow
    console.log("Token removed. Drive disconnected.");
    return true;
  }
  return false;
}

// Authorize using async/await (used by backup.js and scheduler.js)
async function authorizeAsync() {
  if (!hasCredentials()) {
    throw new Error("credentials.json not found at " + CREDENTIALS_PATH);
  }
  const content = fs.readJsonSync(CREDENTIALS_PATH);
  const { client_secret, client_id, redirect_uris } = content.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!hasToken()) {
    throw new Error("No Drive token found. Connect Google Drive from the dashboard.");
  }

  const token = fs.readJsonSync(TOKEN_PATH);
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

// Upload file to Google Drive
async function uploadZipFile(auth, folderId, zipFilePath) {
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = {
    name: path.basename(zipFilePath),
    parents: [folderId],
  };
  const media = {
    mimeType: "application/zip",
    body: fs.createReadStream(zipFilePath),
  };

  try {
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });
    console.log("Uploaded ZIP File Id:", file.data.id);
  } catch (err) {
    console.error("Error uploading ZIP file:", err.message);
    throw err;
  }
}

// Delete old backups in Drive
async function cleanupOldBackups(auth, folderId, maxBackups) {
  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, createdTime)",
      orderBy: "createdTime desc",
    });

    const files = res.data.files;
    if (files.length > maxBackups) {
      const filesToDelete = files.slice(maxBackups);
      console.log(
        `Cleaning up ${filesToDelete.length} old backups from Drive...`
      );
      for (const file of filesToDelete) {
        try {
          await drive.files.delete({ fileId: file.id });
          console.log(`Deleted old remote backup: ${file.name}`);
        } catch (error) {
          console.error(
            `Failed to delete remote backup ${file.name}:`,
            error.message
          );
        }
      }
    }
  } catch (error) {
    console.error("Error cleaning up remote backups:", error.message);
  }
}

module.exports = {
  authorize,
  authorizeAsync,
  setExpressApp,
  uploadZipFile,
  cleanupOldBackups,
  getConnectionStatus,
  getAuthUrl,
  saveCredentials,
  deleteCredentials,
  disconnect,
  hasCredentials,
  hasToken,
  SCOPES,
  TOKEN_PATH,
  CREDENTIALS_PATH,
};
