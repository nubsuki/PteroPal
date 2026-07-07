const fs = require("fs-extra");
const { google } = require("googleapis");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = "token.json";

// Express app reference for OAuth callback route
let expressApp = null;

/**
 * Set the Express app instance for OAuth route registration
 * Must be called before authorize() if first-time auth is needed
 * @param {Object} app - Express app instance
 */
function setExpressApp(app) {
  expressApp = app;
}

/**
 * Authorize with Google Drive API
 * Reads saved token or initiates OAuth flow
 * @param {Object} credentials - OAuth2 credentials from credentials.json
 * @param {Function} callback - Called with authorized OAuth2 client
 */
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

/**
 * Get a new access token via OAuth2 flow
 * Registers /auth route on Express app for the callback
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("Authorize this app by visiting this url:", authUrl);

  if (expressApp) {
    expressApp.get("/auth", (req, res) => {
      const code = req.query.code;
      if (code) {
        oAuth2Client.getToken(code, (err, token) => {
          if (err) return console.error("Error retrieving access token", err);
          oAuth2Client.setCredentials(token);
          fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log("Token stored to", TOKEN_PATH);
          });
          callback(oAuth2Client);
          res.send("Authorization successful. You can close this window.");
        });
      } else {
        res.send("No authorization code provided.");
      }
    });
  }
}

/**
 * Upload a ZIP file to Google Drive
 * @param {Object} auth - Authorized OAuth2 client
 * @param {string} folderId - Google Drive folder ID to upload into
 * @param {string} zipFilePath - Local path to the ZIP file
 */
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
    console.error("Error uploading ZIP file:", err);
  }
}

/**
 * Clean up old backups from a Google Drive folder
 * @param {Object} auth - Authorized OAuth2 client
 * @param {string} folderId - Google Drive folder ID to clean
 * @param {number} maxBackups - Maximum number of backups to keep
 */
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
  setExpressApp,
  uploadZipFile,
  cleanupOldBackups,
  SCOPES,
  TOKEN_PATH,
};
