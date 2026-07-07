const fs = require("fs-extra");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config", "folder_config.json");

let folders = [];

// Load folder configuration from JSON or fallback to env vars
function loadConfig() {
  try {
    fs.ensureDirSync(path.dirname(CONFIG_PATH));
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readJsonSync(CONFIG_PATH);
      folders = data.folders || [];
      console.log(
        `[FolderConfig] Loaded ${folders.length} folder(s) from folder_config.json`,
      );
    } else if (process.env.FOLDER_NAMES && process.env.FOLDER_PATHS) {
      const names = process.env.FOLDER_NAMES.split(",");
      const paths = process.env.FOLDER_PATHS.split(",");
      folders = names
        .map((name, i) => ({
          name: name.trim(),
          path: (paths[i] || "").trim(),
        }))
        .filter((f) => f.name && f.path);
      console.log(
        `[FolderConfig] Loaded ${folders.length} folder(s) from environment variables`,
      );
      saveConfig();
    } else {
      folders = [];
      console.log(
        "[FolderConfig] No folder configuration found. Configure via web UI.",
      );
    }
  } catch (err) {
    console.error("[FolderConfig] Error loading config:", err.message);
    folders = [];
  }
}

// Save configuration to JSON
function saveConfig() {
  try {
    fs.writeJsonSync(CONFIG_PATH, { folders }, { spaces: 2 });
    console.log(
      `[FolderConfig] Saved ${folders.length} folder(s) to folder_config.json`,
    );
  } catch (err) {
    console.error("[FolderConfig] Error saving config:", err.message);
  }
}

function getFolders() {
  return [...folders];
}

function getFolderNames() {
  return folders.map((f) => f.name);
}

function getFolderPaths() {
  return folders.map((f) => f.path);
}

// Add folder
function addFolder(name, folderPath) {
  folders.push({ name, path: folderPath });
  saveConfig();
  return getFolders();
}

// Remove folder by index
function removeFolder(index) {
  if (index >= 0 && index < folders.length) {
    const removed = folders.splice(index, 1);
    saveConfig();
    return removed[0];
  }
  return null;
}

// Load configuration on module initialization
loadConfig();

module.exports = {
  getFolders,
  getFolderNames,
  getFolderPaths,
  addFolder,
  removeFolder,
  loadConfig,
  saveConfig,
};
