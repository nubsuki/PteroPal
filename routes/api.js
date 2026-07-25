const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const folderConfig = require("../modules/folderConfig");
const backup = require("../modules/backup");
const googleDrive = require("../modules/googleDrive");
const statusUpdater = require("../modules/statusUpdater");

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

  // Google Drive API

  // Get Drive connection status
  router.get("/drive/status", (req, res) => {
    res.json(googleDrive.getConnectionStatus());
  });

  // Upload credentials.json
  router.post("/drive/credentials", express.json(), (req, res) => {
    try {
      const data = req.body;
      if (!data || !data.web || !data.web.client_id) {
        return res.status(400).json({ error: "Invalid credentials format" });
      }
      googleDrive.saveCredentials(data);
      res.json({ success: true, message: "Credentials saved." });
    } catch (error) {
      res.status(500).json({ error: "Failed to save credentials." });
    }
  });

  // Delete credentials.json (and token if exists)
  router.delete("/drive/credentials", (req, res) => {
    try {
      googleDrive.deleteCredentials();
      res.json({ success: true, message: "Credentials removed." });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove credentials." });
    }
  });

  // Get OAuth URL for user to authorize Drive
  router.get("/drive/auth-url", (req, res) => {
    const url = googleDrive.getAuthUrl();
    if (!url) {
      return res.status(404).json({
        error: "credentials.json not found. Cannot generate auth URL.",
      });
    }
    res.json({ url });
  });

  // Disconnect Drive (remove local token only)
  router.delete("/drive/token", (req, res) => {
    const removed = googleDrive.disconnect();
    if (removed) {
      res.json({ success: true, message: "Google Drive disconnected." });
    } else {
      res
        .status(404)
        .json({ error: "No token found — Drive was not connected." });
    }
  });

  // Test Drive Backup manually from UI
  router.post("/drive/test", async (req, res) => {
    const status = googleDrive.getConnectionStatus();
    if (!status.enabled) {
      return res
        .status(400)
        .json({ error: "Drive backup is disabled in .env" });
    }

    // Create a dummy channel object to satisfy channel.send() in backup.js
    const dummyChannel = {
      send: (msg) => console.log(`[UI Test Backup] ${msg}`),
    };

    try {
      await backup.performManualBackup(dummyChannel);
      res.json({ success: true, message: "Manual backup completed." });
    } catch (err) {
      console.error("[UI Test Backup] Failed:", err);
      res.status(500).json({ success: false, error: "Backup failed. Check console for details." });
    }
  });

  // Get server metadata
  router.get("/servers/metadata", (req, res) => {
    try {
      const metadata = statusUpdater.loadServerMetadata();
      res.json(metadata);
    } catch (err) {
      res.status(500).json({ error: "Failed to load metadata" });
    }
  });

  // Get all servers
  router.get("/servers", async (req, res) => {
    try {
      const servers = await getAllServers();
      res.json({ servers });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  // Update server metadata
  router.post("/servers/metadata", (req, res) => {
    const { serverId, customName, description, iconUrl } = req.body;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    try {
      const metadata = statusUpdater.loadServerMetadata();
      metadata[serverId] = { customName, description, iconUrl };
      statusUpdater.saveServerMetadata(metadata);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save metadata" });
    }
  });

  return router;
}

module.exports = { init };
