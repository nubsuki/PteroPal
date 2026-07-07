const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const folderConfig = require("../modules/folderConfig");
const backup = require("../modules/backup");

const router = express.Router();

// Initialize API routes
function init({ getConfiguredPanels, getAllServers }) {
  // Get all folders
  router.get("/folders", (req, res) => {
    res.json({ folders: folderConfig.getFolders() });
  });

  // Add folder
  router.post("/folders", express.json(), (req, res) => {
    const { name, path: folderPath } = req.body;

    if (!name || !folderPath) {
      return res.status(400).json({ error: "Name and path are required" });
    }

    const trimmedName = name.trim();
    const trimmedPath = folderPath.trim();

    if (!trimmedName || !trimmedPath) {
      return res.status(400).json({ error: "Name and path cannot be empty" });
    }

    const folders = folderConfig.addFolder(trimmedName, trimmedPath);
    res.json({ success: true, folders });
  });

  // Delete folder
  router.delete("/folders/:index", (req, res) => {
    const index = parseInt(req.params.index);

    if (isNaN(index)) {
      return res.status(400).json({ error: "Invalid index" });
    }

    const removed = folderConfig.removeFolder(index);
    if (removed) {
      res.json({ success: true, removed, folders: folderConfig.getFolders() });
    } else {
      res.status(404).json({ error: "Folder not found at that index" });
    }
  });

  // Browse filesystem directories
  router.get("/browse", async (req, res) => {
    const targetPath = req.query.path || "/";

    try {
      const items = await fs.readdir(targetPath, { withFileTypes: true });
      const directories = items
        .filter((item) => {
          try {
            return item.isDirectory();
          } catch {
            return false;
          }
        })
        .map((item) => ({
          name: item.name,
          path: path.join(targetPath, item.name).replace(/\\/g, "/"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        current: targetPath.replace(/\\/g, "/"),
        parent: path.dirname(targetPath).replace(/\\/g, "/"),
        directories,
      });
    } catch (error) {
      res
        .status(400)
        .json({ error: `Cannot read directory: ${error.message}` });
    }
  });

  // Test folder accessibility
  router.post("/test/folders", async (req, res) => {
    const folders = folderConfig.getFolders();
    const results = [];

    for (const folder of folders) {
      const accessible = await backup.checkDirectoryAccessible(folder.path);
      results.push({
        name: folder.name,
        path: folder.path,
        accessible,
        message: accessible ? "Accessible" : "Not accessible",
      });
    }

    res.json({ results });
  });

  // Test panel connectivity
  router.post("/test/panels", async (req, res) => {
    const panels = getConfiguredPanels();
    const results = [];

    for (const panel of panels) {
      try {
        const servers = await panel.getServers();
        results.push({
          name: panel.panelName,
          status: "online",
          serverCount: servers.length,
          message: `Online — ${servers.length} server(s) found`,
        });
      } catch (error) {
        results.push({
          name: panel.panelName,
          status: "error",
          serverCount: 0,
          message: `Failed — ${error.message}`,
        });
      }
    }

    if (panels.length === 0) {
      results.push({
        name: "No panels configured",
        status: "warning",
        serverCount: 0,
        message: "No panel API URLs or keys are configured",
      });
    }

    res.json({ results });
  });

  return router;
}

module.exports = { init };
