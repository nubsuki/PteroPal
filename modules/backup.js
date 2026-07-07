const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const { google } = require("googleapis");
const folderConfig = require("./folderConfig");
const googleDrive = require("./googleDrive");

// Backup directories
const BACKUP_DIR =
  process.env.LOCAL_BACKUP_DIR || path.join(__dirname, "..", "local_backups");
const MANUAL_BACKUP_DIR = path.join(__dirname, "..", "manual_backups");

// Ensure backup directories exist
fs.ensureDirSync(BACKUP_DIR);
fs.ensureDirSync(MANUAL_BACKUP_DIR);

/**
 * Create a ZIP archive of the specified folder
 * @param {string} folderPath - Path to the folder to archive
 * @param {string} zipFilePath - Destination path for the ZIP file
 */
async function createZipArchive(folderPath, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
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
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

/**
 * Process scheduled backups for all configured folders
 * Handles both local and Google Drive backups
 * @param {Object|null} auth - Google OAuth2 client, or null for local-only backup
 */
async function processBackups(auth) {
  const folderNames = folderConfig.getFolderNames();
  const folderPaths = folderConfig.getFolderPaths();
  let drive = null;

  if (auth) {
    drive = google.drive({ version: "v3", auth });
  }

  for (const [index, mainFolderName] of folderNames.entries()) {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const zipFilePath = path.join(
      BACKUP_DIR,
      `${mainFolderName}_backup_${dateTime}.zip`
    );

    console.log(
      `Creating ZIP archive for folder: ${mainFolderName} at path: ${folderPath}`
    );

    // Create a ZIP archive of the folder
    await createZipArchive(folderPath, zipFilePath);
    console.log(`Created ZIP archive: ${zipFilePath}`);

    const maxBackups = parseInt(process.env.MAX_BACKUPS);

    // Handle Google Drive Backup if auth is provided
    if (drive) {
      try {
        const res = await drive.files.list({
          q: `name='${mainFolderName}' and mimeType='application/vnd.google-apps.folder'`,
          fields: "files(id, name)",
        });

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
        await googleDrive.uploadZipFile(auth, mainFolderId, zipFilePath);
        console.log(`Backup uploaded to Drive for ${mainFolderName}.`);

        // Cleanup old Drive backups
        if (!isNaN(maxBackups) && maxBackups > 0) {
          await googleDrive.cleanupOldBackups(auth, mainFolderId, maxBackups);
        }
      } catch (err) {
        console.error(`Error during Drive backup for ${mainFolderName}:`, err);
      }
    }

    console.log(
      `Backup process completed for ${mainFolderName}. File saved at: ${zipFilePath}`
    );

    // Cleanup local backups
    if (!isNaN(maxBackups) && maxBackups > 0) {
      await cleanupLocalBackups(BACKUP_DIR, mainFolderName, maxBackups);
    } else {
      console.log("MAX_BACKUPS is 0 or undefined. Keeping all backups.");
    }
  }
}

/**
 * Clean up old local backups for a specific folder
 * @param {string} backupDir - Directory containing backups
 * @param {string} folderName - Folder name prefix to match
 * @param {number} maxBackups - Maximum backups to keep
 */
async function cleanupLocalBackups(backupDir, folderName, maxBackups) {
  try {
    const files = await fs.readdir(backupDir);
    const backupFiles = [];

    for (const file of files) {
      if (file.startsWith(`${folderName}_backup_`) && file.endsWith(".zip")) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        backupFiles.push({ name: file, path: filePath, ctime: stats.ctime });
      }
    }

    // Sort by creation time descending (newest first)
    backupFiles.sort((a, b) => b.ctime - a.ctime);

    if (backupFiles.length > maxBackups) {
      const filesToDelete = backupFiles.slice(maxBackups);
      console.log(
        `Cleaning up ${filesToDelete.length} old local backups for ${folderName}...`
      );
      for (const file of filesToDelete) {
        await fs.remove(file.path);
        console.log(`Deleted old local backup: ${file.name}`);
      }
    }
  } catch (error) {
    console.error("Error cleaning up local backups:", error.message);
  }
}

/**
 * Check if a directory is accessible
 * @param {string} dirPath - Path to check
 * @returns {boolean} True if accessible
 */
async function checkDirectoryAccessible(dirPath) {
  try {
    await fs.access(dirPath);
    return true;
  } catch (error) {
    console.error(`Error accessing ${dirPath}:`, error.message);
    return false;
  }
}

/**
 * Perform scheduled backup
 * @param {Object|null} auth - Google OAuth2 client
 */
async function performBackup(auth) {
  console.log("Performing backup for all folders...");
  await processBackups(auth);
}

/**
 * Perform manual backup triggered via Discord command
 * @param {Object} channel - Discord channel to send status messages to
 */
async function performManualBackup(channel) {
  channel.send("Manual backup triggered");

  const enableDriveBackup = process.env.ENABLE_DRIVE_BACKUP !== "false";

  if (enableDriveBackup) {
    fs.readFile(path.join(__dirname, "..", "config", "credentials.json"), (err, content) => {
      if (err) {
        console.log("Error loading client secret file:", err);
        channel.send("Error loading Drive credentials. Check console.");
        return;
      }
      googleDrive.authorize(JSON.parse(content), (auth) =>
        executeManualBackup(auth, channel)
      );
    });
  } else {
    await executeManualBackup(null, channel);
  }
}

/**
 * Execute manual backup for all configured folders
 * @param {Object|null} auth - Google OAuth2 client
 * @param {Object} channel - Discord channel for status messages
 */
async function executeManualBackup(auth, channel) {
  console.log("Starting manual backup execution...");
  const folderNames = folderConfig.getFolderNames();
  const folderPaths = folderConfig.getFolderPaths();
  let drive = null;

  if (auth) {
    drive = google.drive({ version: "v3", auth });
  }

  for (const [index, mainFolderName] of folderNames.entries()) {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const zipFilePath = path.join(
      MANUAL_BACKUP_DIR,
      `${mainFolderName}_manual_backup_${dateTime}.zip`
    );

    console.log(
      `Creating manual ZIP archive for folder: ${mainFolderName} at path: ${folderPath}`
    );
    channel.send(`Creating backup for ${mainFolderName}...`);

    try {
      // Create a ZIP archive of the folder
      await createZipArchive(folderPath, zipFilePath);
      console.log(`Created manual ZIP archive: ${zipFilePath}`);
      channel.send(`Successfully saved local backup for ${mainFolderName}.`);

      // Handle Google Drive Backup if auth is provided
      if (drive) {
        try {
          const manualFolderName = `${mainFolderName} - Manual Backups`;
          const res = await drive.files.list({
            q: `name='${manualFolderName}' and mimeType='application/vnd.google-apps.folder'`,
            fields: "files(id, name)",
          });

          const folders = res.data.files;
          let mainFolderId;

          if (folders.length > 0) {
            mainFolderId = folders[0].id;
          } else {
            const mainFolderMetadata = {
              name: manualFolderName,
              mimeType: "application/vnd.google-apps.folder",
            };

            const mainFolder = await drive.files.create({
              resource: mainFolderMetadata,
              fields: "id",
            });
            mainFolderId = mainFolder.data.id;
          }

          // Upload the ZIP file to Google Drive
          await googleDrive.uploadZipFile(auth, mainFolderId, zipFilePath);
          console.log(
            `Manual backup uploaded to Drive for ${mainFolderName}.`
          );
          channel.send(
            `Successfully uploaded manual backup to Drive for ${mainFolderName}.`
          );
        } catch (err) {
          console.error(
            `Error during Drive manual backup for ${mainFolderName}:`,
            err
          );
          channel.send(
            `Failed to upload manual backup to Drive for ${mainFolderName}.`
          );
        }
      }
    } catch (error) {
      console.error(
        `Error creating manual backup for ${mainFolderName}:`,
        error
      );
      channel.send(
        `Error creating backup for ${mainFolderName}. Check console for details.`
      );
    }
  }
  channel.send("Backup completed");
}

module.exports = {
  createZipArchive,
  processBackups,
  cleanupLocalBackups,
  checkDirectoryAccessible,
  performBackup,
  performManualBackup,
  executeManualBackup,
  BACKUP_DIR,
  MANUAL_BACKUP_DIR,
};
