require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const fs = require("fs-extra");
const { google } = require("googleapis");
const path = require("path");
const express = require("express");
const app = express();
const PORT = 3000;
const archiver = require("archiver");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = "token.json";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PTERODACTYL_API_URL = process.env.PTERODACTYL_API_URL;
const PTERODACTYL_API_KEY = process.env.PTERODACTYL_API_KEY;

let authToken = null;

// Fetches all servers from the Pterodactyl API
async function getServers() {
  try {
    const response = await axios.get(`${PTERODACTYL_API_URL}/api/client`, {
      headers: {
        Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "Application/vnd.pterodactyl.v1+json",
      },
    });

    // Map server data to a simplified format
    const servers = await Promise.all(
      response.data.data.map(async (server) => ({
        id: server.attributes.identifier,
        name: server.attributes.name,
        status: await getServerStatus(server.attributes.identifier),
      }))
    );

    console.log("Servers fetched:", servers);
    return servers;
  } catch (error) {
    console.error("Error fetching servers:", error.message);
    return [];
  }
}

// Starts a specified server
async function startServer(serverId, serverName) {
  console.log(`Starting server: ${serverName} (ID: ${serverId})`);
  try {
    const initialStatus = await getServerStatus(serverId);
    console.log(`Initial status of ${serverName}: ${initialStatus}`);

    if (initialStatus === "running") {
      return `Server "${serverName}" is already running!`;
    }

    const response = await axios.post(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/power`,
      { signal: "start" },
      {
        headers: {
          Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "Application/vnd.pterodactyl.v1+json",
        },
      }
    );
    console.log(`Start server response for ${serverName}:`, response.data);

    // Wait for the server to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newStatus = await getServerStatus(serverId);
    console.log(`New status of ${serverName}: ${newStatus}`);

    if (newStatus === initialStatus) {
      return `Server "${serverName}" start command sent, but status remains ${newStatus}. It may take longer to fully start.`;
    } else {
      return `Server "${serverName}" status changed from ${initialStatus} to ${newStatus}`;
    }
  } catch (error) {
    console.error(`Error starting server ${serverName}:`, error.message);
    return `Failed to start server "${serverName}". Check console for details.`;
  }
}

// Stops a specified server
async function stopServer(serverId, serverName) {
  try {
    const initialStatus = await getServerStatus(serverId);
    console.log(`Initial status of ${serverName}: ${initialStatus}`);

    if (initialStatus === "offline") {
      return `Server "${serverName}" is already stopped!`;
    }

    const response = await axios.post(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/power`,
      { signal: "stop" },
      {
        headers: {
          Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "Application/vnd.pterodactyl.v1+json",
        },
      }
    );

    // Wait for the server to stop
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newStatus = await getServerStatus(serverId);

    if (newStatus === initialStatus) {
      return `Server "${serverName}" stop command sent, but status remains ${newStatus}. It may take longer to fully stop.`;
    } else {
      return `Server "${serverName}" status changed from ${initialStatus} to ${newStatus}`;
    }
  } catch (error) {
    console.error(`Error stopping server ${serverName}:`, error.message);
    return `Failed to stop server "${serverName}". Check console for details.`;
  }
}

// Handles incoming messages and commands from Discord
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(".")) return;

  const args = message.content.slice(1).trim().split(" ");
  const command = args[0].toLowerCase();

  if (command === "servers") {
    console.log("Executing servers command");
    try {
      const servers = await getServers();
      if (servers.length === 0) {
        return message.channel.send(
          "No servers available or there was an error fetching servers."
        );
      }

      const serverList = servers
        .map(
          (server, index) =>
            `${index + 1}. ${server.name} - Status: ${
              server.status || "Unknown"
            }`
        )
        .join("\n");

      await message.channel.send(
        `Available servers:\n${serverList}\n\nUse .start <number> to start a server.\nUse .stop <number> to stop a server.`
      );
    } catch (error) {
      message.channel.send("An error occurred while processing the command.");
    }
  }

  if (command === "start" && args[1]) {
    const serverIndex = parseInt(args[1]) - 1; // Convert to 0-based index
    const servers = await getServers();

    if (serverIndex < 0 || serverIndex >= servers.length) {
      return message.channel.send("Invalid server number.");
    }

    const server = servers[serverIndex];
    const result = await startServer(server.id, server.name);
    message.channel.send(result);
  }

  if (command === "stop" && args[1]) {
    const serverIndex = parseInt(args[1]) - 1; // Convert to 0-based index
    const servers = await getServers();

    if (serverIndex < 0 || serverIndex >= servers.length) {
      return message.channel.send("Invalid server number.");
    }

    const server = servers[serverIndex];
    const result = await stopServer(server.id, server.name);
    message.channel.send(result);
  }
});

// Logs in the Discord client
client.on("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);



// Checks if it's the specified backup time in the configured time zone
function isTimeBackup() {
  const now = new Date();
  const options = {
    timeZone: process.env.TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const timeInConfiguredZone = now.toLocaleTimeString("en-US", options);
  return timeInConfiguredZone === process.env.BACKUP_TIME;
}

// Function to check time and perform actions
async function checkTimeAndPerformActions() {
  // Check if it's the specified backup time
  if (isTimeBackup()) {
    console.log("Time for scheduled backup.");
    await initiateBackupSequence();
  } else {
    console.log("Not the time for backup.");
  }
}

// Orchestrates the shutdown, wait, and backup process
async function initiateBackupSequence() {
  console.log("Starting backup process...");

  // Check if shutdown is enabled (defaults to true)
  const shouldShutdown = process.env.SHUTDOWN_BEFORE_BACKUP !== "false";

  if (shouldShutdown) {
    // Shutdown all servers
    const servers = await getServers();
    for (const server of servers) {
      await shutdownServer(server.id, server.name);
    }

    // Wait until all servers are offline
    console.log("Waiting for servers to go offline...");
    let allOffline = false;
    while (!allOffline) {
      allOffline = true;
      for (const server of servers) {
        const status = await getServerStatus(server.id);
        if (status !== "offline") {
          allOffline = false;
          console.log(`Server ${server.name} is still ${status}. Waiting...`);
        }
      }
      if (!allOffline) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    console.log("All servers are offline. Proceeding with backup.");
  } else {
    console.log("Skipping server shutdown as per configuration.");
  }

  fs.readFile("credentials.json", (err, content) => {
    if (err) return console.log("Error loading client secret file:", err);
    authorize(JSON.parse(content), performBackup);
  });
}

// Initial backup sequence on startup
initiateBackupSequence();

// Periodically checks server status and performs actions based on time
setInterval(async () => {
  console.log("-----------------------------------");
  console.log("Performing automatic server check");
  console.log(new Date().toLocaleString());

  // Get folder paths from environment variable
  const folderPaths = process.env.FOLDER_PATHS.split(",");

  // Check directory accessibility
  for (const path of folderPaths) {
    const trimmedPath = path.trim(); // Trim any whitespace
    const isAccessible = await checkDirectoryAccessible(trimmedPath);
    if (isAccessible) {
      console.log(`Files are accessible in: ${trimmedPath}`);
    } else {
      console.log(`Files are NOT accessible in: ${trimmedPath}`);
    }
  }

  console.log("Automatic check completed");
  console.log("-----------------------------------");

  // Trigger time-based actions
  await checkTimeAndPerformActions();
}, 60000); // 1 minute in milliseconds

// Fetches the current status of a server
async function getServerStatus(serverId) {
  try {
    const response = await axios.get(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/resources`,
      {
        headers: {
          Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "Application/vnd.pterodactyl.v1+json",
        },
      }
    );
    return response.data.attributes.current_state;
  } catch (error) {
    console.error("Error fetching server status:", error.message);
    return "unknown";
  }
}

// Shuts down a specified server
async function shutdownServer(serverId, serverName) {
  try {
    await axios.post(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/power`,
      { signal: "stop" },
      {
        headers: {
          Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "Application/vnd.pterodactyl.v1+json",
        },
      }
    );
    console.log(`Server ${serverName} has been shut down.`);
  } catch (error) {
    console.error(`Error shutting down server ${serverName}:`, error.message);
  }
}

// Parse folder names and paths into arrays
const folderNames = process.env.FOLDER_NAMES.split(",");
const folderPaths = process.env.FOLDER_PATHS.split(",");

// Use LOCAL_BACKUP_DIR from env or default to "local_backups" in the current directory
const BACKUP_DIR =
  process.env.LOCAL_BACKUP_DIR || path.join(__dirname, "local_backups");

// Ensure the backup directory exists
fs.ensureDirSync(BACKUP_DIR);

// Performs backup logic
async function performBackup(auth) {
  console.log("Performing backup for all folders...");
  await backupToDrive(auth);
}

// Authorizes the application with Google Drive
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

// Gets access token for Google Drive
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  app.get("/auth", (req, res) => {
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

// Defines a route for the root URL
app.get("/", (req, res) => {
  if (req.query.code) {
    return res.redirect(`/auth?code=${encodeURIComponent(req.query.code)}`);
  }
  res.send("Welcome to the Backup Script!");
});

// Logs the folder names and paths
console.log("Folder Names:", folderNames);
console.log("Folder Paths:", folderPaths);

// Function to create a ZIP archive of the specified folder
async function createZipArchive(folderPath, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // compression level
    });

    output.on("close", () => {
      console.log(
        `Created ZIP archive: ${zipFilePath} (${archive.pointer()} total bytes)`
      );
      resolve();
    });

    archive.on("error", (err) => {
      console.error("Error creating ZIP archive:", err);
      reject(err);
    });

    archive.pipe(output);
    archive.directory(folderPath, false); // Add the folder to the archive
    archive.finalize();
  });
}

// Uploads the ZIP file to Google Drive
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

// Updates the backupToDrive function to handle compression
async function backupToDrive(auth) {
  const drive = google.drive({ version: "v3", auth });

  for (const [index, mainFolderName] of folderNames.entries()) {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const zipFilePath = path.join(
      BACKUP_DIR, // Save ZIP files in the backup directory
      `${mainFolderName}_backup_${dateTime}.zip`
    );

    console.log(
      `Creating ZIP archive for folder: ${mainFolderName} at path: ${folderPath}`
    );

    // Create a ZIP archive of the folder
    await createZipArchive(folderPath, zipFilePath);
    console.log(`Created ZIP archive: ${zipFilePath}`);

    // Check if the main folder exists in Google Drive
    drive.files.list(
      {
        q: `name='${mainFolderName}' and mimeType='application/vnd.google-apps.folder'`,
        fields: "files(id, name)",
      },
      async (err, res) => {
        if (err) {
          console.error("Error searching for main folder:", err);
          return;
        }

        const folders = res.data.files;
        let mainFolderId;

        if (folders.length > 0) {
          mainFolderId = folders[0].id;
        } else {
          const mainFolderMetadata = {
            name: mainFolderName,
            mimeType: "application/vnd.google-apps.folder",
          };

          const mainFolder = await drive.files.create({
            resource: mainFolderMetadata,
            fields: "id",
          });
          mainFolderId = mainFolder.data.id;
        }

        // Upload the ZIP file to Google Drive
        await uploadZipFile(auth, mainFolderId, zipFilePath);

        console.log(`Backup completed for ${mainFolderName}. File saved at: ${zipFilePath}`);
      }
    );
  }
}

// Starts the Express server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Function to check if a directory is accessible
async function checkDirectoryAccessible(path) {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    console.error(`Error accessing ${path}:`, error.message);
    return false;
  }
}
