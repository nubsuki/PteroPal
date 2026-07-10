require("dotenv").config();
const express = require("express");
const path = require("path");

const folderConfig = require("./modules/folderConfig");
const googleDrive = require("./modules/googleDrive");
const backup = require("./modules/backup");
const discord = require("./modules/discord");
const scheduler = require("./modules/scheduler");
const apiRoutes = require("./routes/api");

const pterodactylPanel = require("./pterodactylPanel");
const craftyPanel = require("./craftyPanel");

const app = express();
const PORT = 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

googleDrive.setExpressApp(app);

// Get all configured game panels
function getConfiguredPanels() {
  const panels = [];
  if (pterodactylPanel.isConfigured()) {
    panels.push(pterodactylPanel);
  }
  if (craftyPanel.isConfigured()) {
    panels.push(craftyPanel);
  }
  return panels;
}

// Fetch servers from configured panels
async function getAllServers() {
  const panels = getConfiguredPanels();
  const allServers = [];

  for (const panel of panels) {
    try {
      const servers = await panel.getServers();
      for (const server of servers) {
        allServers.push({
          ...server,
          panel: panel.panelName,
          panelModule: panel,
        });
      }
    } catch (error) {
      console.error(
        `Error fetching servers from ${panel.panelName}:`,
        error.message,
      );
    }
  }
  return allServers;
}

// Serve main page
app.get("/", (req, res) => {
  if (req.query.code) {
    return res.redirect(`/auth?code=${encodeURIComponent(req.query.code)}`);
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API routes
app.use("/api", apiRoutes.init({ getConfiguredPanels, getAllServers }));

console.log("Folder Names:", folderConfig.getFolderNames());
console.log("Folder Paths:", folderConfig.getFolderPaths());

// Initialize Discord bot
discord.init({
  getAllServers,
  getConfiguredPanels,
  performManualBackup: backup.performManualBackup,
});

// Initialize scheduler
scheduler.init({ getAllServers, notifyFn: discord.sendNotification });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
