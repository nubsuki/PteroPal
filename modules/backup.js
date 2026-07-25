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

// Ensure backup root directories exist
fs.ensureDirSync(BACKUP_DIR);
fs.ensureDirSync(MANUAL_BACKUP_DIR);

// Create a ZIP archive of a folder
async function createZipArchive(folderPath, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      console.log(
        `Created ZIP archive: ${zipFilePath} (${archive.pointer()} total bytes)`,
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

// Helper to get or create a Drive folder by name and parent
async function getOrCreateDriveFolder(drive, folderName, parentId = null) {
  let q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  } else {
    q += ` and 'root' in parents`;
  }

  const res = await drive.files.list({ q, fields: "files(id, name)" });
  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const metadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const created = await drive.files.create({ resource: metadata, fields: "id" });
  return created.data.id;
}

// Process scheduled backups for all folders (local & Google Drive)
async function processBackups(auth) {
  const folderNames = folderConfig.getFolderNames();
  const folderPaths = folderConfig.getFolderPaths();
  let drive = null;
  let rootBackupFolderId = null;
  let driveLocalFolderId = null;

  if (auth) {
    drive = google.drive({ version: "v3", auth });
    try {
      // Pteropal Backups/
      rootBackupFolderId = await getOrCreateDriveFolder(drive, "Pteropal Backups");
      // Pteropal Backups/local_backups/
      driveLocalFolderId = await getOrCreateDriveFolder(drive, "local_backups", rootBackupFolderId);
    } catch (err) {
      console.error("Failed to access or create Drive folder structure:", err.message);
      drive = null; // Disable drive uploads for this run
    }
  }

  for (const [index, mainFolderName] of folderNames.entries()) {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");

    // Local: local_backups/<FolderName>/
    const localSubDir = path.join(BACKUP_DIR, mainFolderName);
    fs.ensureDirSync(localSubDir);

    const zipFilePath = path.join(
      localSubDir,
      `${mainFolderName}_backup_${dateTime}.zip`,
    );

    console.log(
      `Creating ZIP archive for folder: ${mainFolderName} at path: ${folderPath}`,
    );

    // Create a ZIP archive of the folder
    await createZipArchive(folderPath, zipFilePath);

    const maxBackups = parseInt(process.env.MAX_BACKUPS) || 0;
    const maxDriveBackupsEnv = process.env.MAX_DRIVE_BACKUPS;
    const maxDriveBackups =
      maxDriveBackupsEnv !== undefined && maxDriveBackupsEnv !== ""
        ? parseInt(maxDriveBackupsEnv)
        : maxBackups;

    // Handle Google Drive Backup if auth is provided
    // Structure: Pteropal Backups/local_backups/<FolderName>/
    if (drive && driveLocalFolderId) {
      try {
        const serverFolderId = await getOrCreateDriveFolder(drive, mainFolderName, driveLocalFolderId);

        // Upload the ZIP file to Google Drive
        await googleDrive.uploadZipFile(auth, serverFolderId, zipFilePath);
        console.log(`Backup uploaded to Drive for ${mainFolderName}.`);

        // Cleanup old Drive backups
        if (!isNaN(maxDriveBackups) && maxDriveBackups > 0) {
          await googleDrive.cleanupOldBackups(auth, serverFolderId, maxDriveBackups);
        }
      } catch (err) {
        console.error(`Error during Drive backup for ${mainFolderName}:`, err);
      }
    }

    console.log(
      `Backup process completed for ${mainFolderName}. File saved at: ${zipFilePath}`,
    );

    // Cleanup local backups inside the per-folder subdir
    if (!isNaN(maxBackups) && maxBackups > 0) {
      await cleanupLocalBackups(localSubDir, mainFolderName, maxBackups);
    } else {
      console.log("MAX_BACKUPS is 0 or undefined. Keeping all backups.");
    }
  }
}

// Clean up old local backups for a specific folder prefix inside a given directory
async function cleanupLocalBackups(backupDir, folderName, maxBackups) {
  try {
    const files = await fs.readdir(backupDir);
    const backupFiles = [];

    for (const file of files) {
      if (file.startsWith(`${folderName}_`) && file.endsWith(".zip")) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        backupFiles.push({ name: file, path: filePath, ctime: stats.ctime });
      }
    }

    backupFiles.sort((a, b) => b.ctime - a.ctime);

    if (backupFiles.length > maxBackups) {
      const filesToDelete = backupFiles.slice(maxBackups);
      console.log(
        `Cleaning up ${filesToDelete.length} old local backups for ${folderName}...`,
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

// Check if folder exists and is accessible
async function checkDirectoryAccessible(dirPath) {
  try {
    await fs.access(dirPath);
    return true;
  } catch (error) {
    console.error(`Error accessing ${dirPath}:`, error.message);
    return false;
  }
}

// Perform scheduled backup orchestration
async function performBackup(auth) {
  console.log("Performing backup for all folders...");
  await processBackups(auth);
}

// Trigger manual backup from Discord command
async function performManualBackup(channel) {
  channel.send("Manual backup triggered");

  const enableDriveBackup = process.env.ENABLE_DRIVE_BACKUP !== "false";
  let auth = null;

  if (enableDriveBackup) {
    try {
      auth = await googleDrive.authorizeAsync();
    } catch (err) {
      console.error("Drive auth failed:", err.message);
      channel.send(
        `⚠️ Google Drive not connected — performing local backup only. Connect Drive from the dashboard: http://localhost:3000`
      );
    }
  }

  await executeManualBackup(auth, channel);
}

// Execute manual backup sequence
async function executeManualBackup(auth, channel) {
  console.log("Starting manual backup execution...");
  const folderNames = folderConfig.getFolderNames();
  const folderPaths = folderConfig.getFolderPaths();
  let drive = null;
  let rootBackupFolderId = null;
  let driveManualFolderId = null;

  if (auth) {
    drive = google.drive({ version: "v3", auth });
    try {
      // Pteropal Backups/
      rootBackupFolderId = await getOrCreateDriveFolder(drive, "Pteropal Backups");
      // Pteropal Backups/manual_backups/
      driveManualFolderId = await getOrCreateDriveFolder(drive, "manual_backups", rootBackupFolderId);
    } catch (err) {
      console.error("Failed to access or create Drive folder structure:", err.message);
      drive = null;
    }
  }

  for (const [index, mainFolderName] of folderNames.entries()) {
    const folderPath = folderPaths[index];
    const dateTime = new Date().toISOString().replace(/[:.]/g, "-");

    // Local: manual_backups/<FolderName>/
    const manualSubDir = path.join(MANUAL_BACKUP_DIR, mainFolderName);
    fs.ensureDirSync(manualSubDir);

    const zipFilePath = path.join(
      manualSubDir,
      `${mainFolderName}_manual_backup_${dateTime}.zip`,
    );

    console.log(
      `Creating manual ZIP archive for folder: ${mainFolderName} at path: ${folderPath}`,
    );
    channel.send(`Creating backup for ${mainFolderName}...`);

    try {
      // Create a ZIP archive of the folder
      await createZipArchive(folderPath, zipFilePath);
      channel.send(`Successfully saved local backup for ${mainFolderName}.`);

      // Handle Google Drive Backup if auth is provided
      // Structure: Pteropal Backups/manual_backups/<FolderName>/
      if (drive && driveManualFolderId) {
        try {
          const serverFolderId = await getOrCreateDriveFolder(drive, mainFolderName, driveManualFolderId);

          // Upload the ZIP file to Google Drive
          await googleDrive.uploadZipFile(auth, serverFolderId, zipFilePath);
          console.log(`Manual backup uploaded to Drive for ${mainFolderName}.`);
          channel.send(
            `Successfully uploaded manual backup to Drive for ${mainFolderName}.`,
          );
        } catch (err) {
          console.error(
            `Error during Drive manual backup for ${mainFolderName}:`,
            err,
          );
          channel.send(
            `Failed to upload manual backup to Drive for ${mainFolderName}.`,
          );
        }
      }
    } catch (error) {
      console.error(
        `Error creating manual backup for ${mainFolderName}:`,
        error,
      );
      channel.send(
        `Error creating backup for ${mainFolderName}. Check console for details.`,
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
