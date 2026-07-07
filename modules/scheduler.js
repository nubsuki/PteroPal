const fs = require("fs-extra");
const backup = require("./backup");
const folderConfig = require("./folderConfig");
const googleDrive = require("./googleDrive");

/**
 * Check if current time matches the configured backup time
 * @returns {boolean} True if it's backup time
 */
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

/**
 * Shutdown a server using its panel module
 * @param {Object} server - Server object with panelModule
 */
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

/**
 * Orchestrate the shutdown, wait, and backup process
 * @param {Function} getAllServers - Function to get all servers
 */
async function initiateBackupSequence(getAllServers) {
  console.log("Starting backup process...");

  // Check if shutdown is enabled (defaults to true)
  const shouldShutdown = process.env.SHUTDOWN_BEFORE_BACKUP !== "false";

  if (shouldShutdown) {
    // Shutdown all servers from all configured panels
    const servers = await getAllServers();
    for (const server of servers) {
      await shutdownServer(server);
    }

    // Wait until all servers are offline
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
    fs.readFile("credentials.json", (err, content) => {
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

/**
 * Initialize the scheduler with dependencies
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllServers - Function to get all servers
 */
function init({ getAllServers }) {
  // Check time and perform scheduled backup if it's time
  async function checkTimeAndPerformActions() {
    if (isTimeBackup()) {
      console.log("Time for scheduled backup.");
      await initiateBackupSequence(getAllServers);
    } else {
      console.log("Not the time for backup.");
    }
  }

  // Periodic check every 60 seconds
  setInterval(async () => {
    console.log("-----------------------------------");
    console.log("Performing automatic server check");
    console.log(new Date().toLocaleString());

    // Check directory accessibility for all configured folders
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

    // Trigger time-based actions
    await checkTimeAndPerformActions();
  }, 60000); // 1 minute in milliseconds

  console.log("[Scheduler] Started. Checking every 60 seconds.");
}

module.exports = { init, initiateBackupSequence, isTimeBackup };
