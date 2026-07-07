const fs = require("fs-extra");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config", "folder_config.json");

let folders = [];

/**
 * Load folder configuration from JSON file, falling back to environment variables
 */
function loadConfig() {
  try {
    fs.ensureDirSync(path.dirname(CONFIG_PATH));
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readJsonSync(CONFIG_PATH);
      folders = data.folders || [];
      console.log(
        `[FolderConfig] Loaded ${folders.length} folder(s) from folder_config.json`
      );
    } else if (process.env.FOLDER_NAMES && process.env.FOLDER_PATHS) {
      // Fall back to environment variables
      const names = process.env.FOLDER_NAMES.split(",");
      const paths = process.env.FOLDER_PATHS.split(",");
      folders = names
        .map((name, i) => ({
          name: name.trim(),
          path: (paths[i] || "").trim(),
        }))
        .filter((f) => f.name && f.path);
      console.log(
        `[FolderConfig] Loaded ${folders.length} folder(s) from environment variables`
      );
      // Save to JSON so future restarts use the file
      saveConfig();
    } else {
      folders = [];
      console.log(
        "[FolderConfig] No folder configuration found. Configure via web UI."
      );
    }
  } catch (err) {
    console.error("[FolderConfig] Error loading config:", err.message);
    folders = [];
  }
}

/**
 * Save current folder configuration to JSON file
 */
function saveConfig() {
  try {
    fs.writeJsonSync(CONFIG_PATH, { folders }, { spaces: 2 });
    console.log(
      `[FolderConfig] Saved ${folders.length} folder(s) to folder_config.json`
    );
  } catch (err) {
    console.error("[FolderConfig] Error saving config:", err.message);
  }
}

/**
 * Get all configured folders as an array of { name, path } objects
 */
function getFolders() {
  return [...folders];
}

/**
 * Get folder names as an array of strings
 */
function getFolderNames() {
  return folders.map((f) => f.name);
}

/**
 * Get folder paths as an array of strings
 */
function getFolderPaths() {
  return folders.map((f) => f.path);
}

/**
 * Add a new folder to the configuration
 * @param {string} name - Friendly name for the folder
 * @param {string} folderPath - Absolute path to the folder
 * @returns {Array} Updated folders array
 */
function addFolder(name, folderPath) {
  folders.push({ name, path: folderPath });
  saveConfig();
  return getFolders();
}

/**
 * Remove a folder from the configuration by index
 * @param {number} index - Index of the folder to remove
 * @returns {Object|null} The removed folder, or null if index was invalid
 */
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
