const fs = require("fs-extra");
const backup = require("./backup");
const folderConfig = require("./folderConfig");
const googleDrive = require("./googleDrive");

// Check if current time is scheduled backup time
function isTimeBackup() {
  const now = new Date();
  const options = {
    timeZone: process.env.TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const timeInConfiguredZone = now.toLocaleTimeString("en-US", options);
  return timeInConfiguredZone === process.env.BACKUP_TIME;
}

// Shut down server
async function shutdownServer(server) {
  try {
    await server.panelModule.sendPowerAction(server.id, "stop");
    console.log(
      `Server ${server.name} (${server.panel}) has been shut down.`
    );
  } catch (error) {
    console.error(
      `Error shutting down server ${server.name} (${server.panel}):`,
      error.message
    );
  }
}

// Orchestrate server shutdown, offline waiting, and backup execution
async function initiateBackupSequence(getAllServers) {
  console.log("Starting backup process...");

  const shouldShutdown = process.env.SHUTDOWN_BEFORE_BACKUP !== "false";

  if (shouldShutdown) {
    const servers = await getAllServers();
    for (const server of servers) {
      await shutdownServer(server);
    }

    console.log("Waiting for servers to go offline...");
    let allOffline = false;
    while (!allOffline) {
      allOffline = true;
      const currentServers = await getAllServers();
      for (const server of currentServers) {
        const status = await server.panelModule.getServerStatus(server.id);
        if (status !== "offline") {
          allOffline = false;
          console.log(
            `Server ${server.name} (${server.panel}) is still ${status}. Waiting...`
          );
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

  const enableDriveBackup = process.env.ENABLE_DRIVE_BACKUP !== "false";

  if (enableDriveBackup) {
    fs.readFile(path.join(__dirname, "..", "config", "credentials.json"), (err, content) => {
      if (err) return console.log("Error loading client secret file:", err);
      googleDrive.authorize(JSON.parse(content), backup.performBackup);
    });
  } else {
    console.log(
      "Google Drive backup is disabled. Performing local backup only."
    );
    await backup.performBackup(null);
  }
}

// Start interval checks for server status and backup schedule
function init({ getAllServers }) {
  async function checkTimeAndPerformActions() {
    if (isTimeBackup()) {
      console.log("Time for scheduled backup.");
      await initiateBackupSequence(getAllServers);
    } else {
      console.log("Not the time for backup.");
    }
  }

  // Periodic check (every 1 minute)
  setInterval(async () => {
    console.log("-----------------------------------");
    console.log("Performing automatic server check");
    console.log(new Date().toLocaleString());

    const folderPaths = folderConfig.getFolderPaths();

    for (const folderPath of folderPaths) {
      const trimmedPath = folderPath.trim();
      const isAccessible = await backup.checkDirectoryAccessible(trimmedPath);
      if (isAccessible) {
        console.log(`Files are accessible in: ${trimmedPath}`);
      } else {
        console.log(`Files are NOT accessible in: ${trimmedPath}`);
      }
    }

    console.log("Automatic check completed");
    console.log("-----------------------------------");

    await checkTimeAndPerformActions();
  }, 60000);

  console.log("[Scheduler] Started. Checking every 60 seconds.");
}

module.exports = { init, initiateBackupSequence, isTimeBackup };
