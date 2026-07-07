const fs = require("fs-extra");
const { google } = require("googleapis");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = path.join(__dirname, "..", "config", "token.json");

let expressApp = null;

// Set Express app for OAuth callback routing
function setExpressApp(app) {
  expressApp = app;
}

// Authorize with Google Drive API
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
    console.error("Error uploading ZIP file:", err);
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
  setExpressApp,
  uploadZipFile,
  cleanupOldBackups,
  SCOPES,
  TOKEN_PATH,
};
