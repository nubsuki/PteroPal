require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const fs = require("fs-extra");
const { google } = require("googleapis");
const path = require("path");
const express = require("express");
const app = express();
const PORT = 3000;

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
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);

// Periodically checks server status and performs actions based on time
setInterval(async () => {
  console.log("-----------------------------------");
  console.log("Performing automatic server check");
  console.log(new Date().toLocaleString());
  const servers = await getServers();

  // Check if it's 4 AM in Sri Lanka and shut down all servers
  if (isSLTimeSS()) {
    for (const server of servers) {
      const shutdownResult = await shutdownServer(server.id, server.name);
      console.log(shutdownResult);
    }
  } else {
    console.log(`Skipping check.`);
  }

  // Check if it's 4:20 AM in Sri Lanka and backup all servers
  if (isSLTimeBackup()) {
    fs.readFile("credentials.json", (err, content) => {
      if (err) return console.log("Error loading client secret file:", err);
      authorize(JSON.parse(content), performBackup);
    });
  } else {
    console.log("Not the time for backup.");
  }

  console.log("Automatic check completed");
  console.log("-----------------------------------");
}, 60000); // 1 minutes in milliseconds

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

// Checks if it's 4 AM in Sri Lanka
function isSLTimeSS() {
  const now = new Date();
  const options = {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
  };
  const timeInSriLanka = now.toLocaleTimeString("en-US", options);
  return timeInSriLanka === "04:00 AM";
}

// Checks if it's 4:20 AM in Sri Lanka
function isSLTimeBackup() {
  const now = new Date();
  const options = {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
  };
  const timeInSriLanka = now.toLocaleTimeString("en-US", options);
  return timeInSriLanka === "04:20 AM";
}
//BackUP function

// Parse folder names and paths into arrays
const folderNames = process.env.FOLDER_NAMES.split(",");
const folderPaths = process.env.FOLDER_PATHS.split(",");

// Performs backup logic
function performBackup(auth) {
  console.log("Performing backup...");
  backupToDrive(auth);
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
        res.send(`Authorization code received: <strong>${code}</strong>`);
      });
    } else {
      res.send("No authorization code provided.");
    }
  });
}

// Defines a route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to the Backup Script!");
});

// Logs the folder names and paths
console.log("Folder Names:", folderNames);
console.log("Folder Paths:", folderPaths);

// Updates the backupToDrive function to handle multiple folders
function backupToDrive(auth) {
  const drive = google.drive({ version: "v3", auth });

  folderNames.forEach((mainFolderName, index) => {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const subFolderName = `save data ${dateTime}`;

    drive.files.list(
      {
        q: `name='${mainFolderName}' and mimeType='application/vnd.google-apps.folder'`,
        fields: "files(id, name)",
      },
      (err, res) => {
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

          drive.files.create(
            {
              resource: mainFolderMetadata,
              fields: "id",
            },
            (err, mainFolder) => {
              if (err) {
                console.error("Error creating main folder:", err);
                return;
              }
              mainFolderId = mainFolder.data.id;
              createSubfolder(
                drive,
                mainFolderId,
                subFolderName,
                auth,
                folderPath
              );
            }
          );
          return;
        }

        createSubfolder(drive, mainFolderId, subFolderName, auth, folderPath);
      }
    );
  });
}

// Creates a subfolder in Google Drive
function createSubfolder(drive, mainFolderId, subFolderName, auth, folderPath) {
  const subFolderMetadata = {
    name: subFolderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [mainFolderId],
  };

  drive.files.create(
    {
      resource: subFolderMetadata,
      fields: "id",
    },
    (err, subFolder) => {
      if (err) {
        console.error("Error creating subfolder:", err);
      } else {
        uploadFiles(auth, subFolder.data.id, folderPath);
      }
    }
  );
}

// Uploads files to Google Drive
function uploadFiles(auth, folderId, folderPath) {
  const drive = google.drive({ version: "v3", auth });

  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error("Error reading folder:", err);
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(folderPath, file);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Error getting file stats:", err);
          return;
        }

        if (stats.isFile()) {
          const fileMetadata = {
            name: file,
            parents: [folderId],
          };
          const media = {
            mimeType: "application/octet-stream",
            body: fs.createReadStream(filePath),
          };

          drive.files.create(
            {
              resource: fileMetadata,
              media: media,
              fields: "id",
            },
            (err, file) => {
              if (err) {
                console.error("Error uploading file:", err);
              } else {
                console.log("Uploaded File Id:", file.data.id);
              }
            }
          );
        } else if (stats.isDirectory()) {
          const folderMetadata = {
            name: file,
            mimeType: "application/vnd.google-apps.folder",
            parents: [folderId],
          };

          drive.files.create(
            {
              resource: folderMetadata,
              fields: "id",
            },
            (err, folder) => {
              if (err) {
                console.error("Error creating folder in Drive:", err);
              } else {
                uploadFiles(auth, folder.data.id, filePath);
              }
            }
          );
        }
      });
    });
  });
}

// Starts the Express server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
