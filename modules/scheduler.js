const fs = require("fs-extra");
const path = require("path");
const backup = require("./backup");
const folderConfig = require("./folderConfig");
const googleDrive = require("./googleDrive");
const statusUpdater = require("./statusUpdater");
const discord = require("./discord");

// Check if current time is scheduled backup time
function isTimeBackup() {
  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = {
    timeZone: tz,
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
async function initiateBackupSequence(getAllServers, notifyFn = null) {
  console.log("Starting backup process...");

  const shouldShutdown = process.env.SHUTDOWN_BEFORE_BACKUP !== "false";

  if (shouldShutdown) {
    const servers = await getAllServers();
    for (const server of servers) {
      await shutdownServer(server);
    }

    console.log("Waiting for servers to go offline...");
    let allOffline = false;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (120 * 5s)

    while (!allOffline && attempts < maxAttempts) {
      attempts++;
      allOffline = true;
      const currentServers = await getAllServers();
      for (const server of currentServers) {
        const status = await server.panelModule.getServerStatus(server.id);
        if (status !== "offline") {
          allOffline = false;
          console.log(
            `Server ${server.name} (${server.panel}) is still ${status}. Waiting... (${attempts}/${maxAttempts})`
          );
        }
      }
      if (!allOffline) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    
    if (!allOffline) {
      console.warn("Timed out waiting for servers to go offline. Proceeding with backup.");
    } else {
      console.log("All servers are offline. Proceeding with backup.");
    }
  } else {
    console.log("Skipping server shutdown as per configuration.");
  }

  const enableDriveBackup = process.env.ENABLE_DRIVE_BACKUP !== "false";
  let auth = null;

  if (enableDriveBackup) {
    try {
      auth = await googleDrive.authorizeAsync();
    } catch (err) {
      console.warn("Google Drive not connected:", err.message);
      if (notifyFn) {
        notifyFn("⚠️ Google Drive is not connected. Running local backup only.");
      }
    }
  } else {
    console.log("Google Drive backup disabled. Performing local backup only.");
  }

  await backup.performBackup(auth);
}

// Start interval checks for server status and backup schedule
function init({ getAllServers, notifyFn }) {
  let isBackupRunning = false;   // Prevents overlapping backup runs
  let lastBackupMinute = null;   // Prevents same minute from triggering twice

  async function checkTimeAndPerformActions() {
    if (!isTimeBackup()) {
      console.log("Not the time for backup.");
      return;
    }

    const currentMinute = new Date().toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    if (lastBackupMinute === currentMinute) {
      console.log("Scheduled backup already triggered this minute. Skipping.");
      return;
    }
    if (isBackupRunning) {
      console.log("Backup already in progress. Skipping duplicate trigger.");
      return;
    }

    lastBackupMinute = currentMinute;
    isBackupRunning = true;
    console.log("Time for scheduled backup.");
    try {
      await initiateBackupSequence(getAllServers, notifyFn);
    } finally {
      isBackupRunning = false;
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

    // Update status embeds
    await statusUpdater.updateAllEmbeds(discord.client, getAllServers);

    await checkTimeAndPerformActions();
  }, 60000);

  console.log("[Scheduler] Started. Checking every 60 seconds.");
}

module.exports = { init, initiateBackupSequence, isTimeBackup };
