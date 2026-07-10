const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DISCORD_PREFIX = process.env.DISCORD_PREFIX || ".";
const DISCORD_NOTIFY_CHANNEL = process.env.DISCORD_NOTIFY_CHANNEL || null;

// Channel used for sending system notifications (e.g. Drive disconnected)
let notifyChannel = null;

// Initialize Discord bot
function init({ getAllServers, getConfiguredPanels, performManualBackup }) {
  // Start server
  async function startServer(server, channel) {
    const { id: serverId, name: serverName, panelModule } = server;
    console.log(
      `Starting server: ${serverName} (ID: ${serverId}) on ${panelModule.panelName}`,
    );
    try {
      const initialStatus = await panelModule.getServerStatus(serverId);
      console.log(`Initial status of ${serverName}: ${initialStatus}`);

      if (initialStatus === "running") {
        channel.send(
          `Server "${serverName}" (${panelModule.panelName}) is already running!`,
        );
        return;
      }

      await panelModule.sendPowerAction(serverId, "start");
      console.log(`Start command sent for ${serverName}`);
      channel.send(
        `Server "${serverName}" (${panelModule.panelName}) start command sent. Waiting for it to come online...`,
      );

      const maxRetries = 60; // 5 minutes (60 * 5s)
      let retries = 0;

      const pollInterval = setInterval(async () => {
        retries++;
        const currentStatus = await panelModule.getServerStatus(serverId);
        console.log(
          `Checking status for ${serverName}: ${currentStatus} (Attempt ${retries}/${maxRetries})`,
        );

        if (currentStatus === "running") {
          channel.send(
            `Server "${serverName}" (${panelModule.panelName}) is now ONLINE!`,
          );
          clearInterval(pollInterval);
        } else if (retries >= maxRetries) {
          channel.send(
            `Server "${serverName}" (${panelModule.panelName}) took too long to start. Please check the panel.`,
          );
          clearInterval(pollInterval);
        }
      }, 5000);
    } catch (error) {
      console.error(`Error starting server ${serverName}:`, error.message);
      channel.send(
        `Failed to start server "${serverName}" (${panelModule.panelName}). Check console for details.`,
      );
    }
  }

  // Stop server
  async function stopServer(server, channel) {
    const { id: serverId, name: serverName, panelModule } = server;
    try {
      const initialStatus = await panelModule.getServerStatus(serverId);
      console.log(`Initial status of ${serverName}: ${initialStatus}`);

      if (initialStatus === "offline") {
        channel.send(
          `Server "${serverName}" (${panelModule.panelName}) is already stopped!`,
        );
        return;
      }

      await panelModule.sendPowerAction(serverId, "stop");

      channel.send(
        `Server "${serverName}" (${panelModule.panelName}) stop command sent. Waiting for it to go offline...`,
      );

      const maxRetries = 60; // 5 minutes (60 * 5s)
      let retries = 0;

      const pollInterval = setInterval(async () => {
        retries++;
        const currentStatus = await panelModule.getServerStatus(serverId);
        console.log(
          `Checking status for ${serverName}: ${currentStatus} (Attempt ${retries}/${maxRetries})`,
        );

        if (currentStatus === "offline") {
          channel.send(
            `Server "${serverName}" (${panelModule.panelName}) is now OFFLINE!`,
          );
          clearInterval(pollInterval);
        } else if (retries >= maxRetries) {
          channel.send(
            `Server "${serverName}" (${panelModule.panelName}) took too long to stop. Please check the panel.`,
          );
          clearInterval(pollInterval);
        }
      }, 5000);
    } catch (error) {
      console.error(`Error stopping server ${serverName}:`, error.message);
      channel.send(
        `Failed to stop server "${serverName}" (${panelModule.panelName}). Check console for details.`,
      );
    }
  }

  // Message handler
  client.on("messageCreate", async (message) => {
    // Track last channel used for fallback notifications
    if (!message.author.bot && message.content.startsWith(DISCORD_PREFIX)) {
      if (!notifyChannel) notifyChannel = message.channel;
    }

    if (!message.content.startsWith(DISCORD_PREFIX)) return;

    const args = message.content.slice(DISCORD_PREFIX.length).trim().split(" ");
    const command = args[0].toLowerCase();

    if (command === "servers") {
      console.log("Executing servers command");
      try {
        const servers = await getAllServers();
        if (servers.length === 0) {
          return message.channel.send(
            "No servers available or there was an error fetching servers.",
          );
        }

        let serverList = "";
        let currentPanel = "";
        servers.forEach((server, index) => {
          if (server.panel !== currentPanel) {
            currentPanel = server.panel;
            serverList += `\n**${currentPanel}**\n`;
          }
          serverList += `${index + 1}. ${server.name} - Status: ${
            server.status || "Unknown"
          }\n`;
        });

        await message.channel.send(
          `Available servers:${serverList}\nUse ${DISCORD_PREFIX}start <number> to start a server.\nUse ${DISCORD_PREFIX}stop <number> to stop a server.\nUse ${DISCORD_PREFIX}backup to trigger a manual backup.`,
        );
      } catch (error) {
        message.channel.send("An error occurred while processing the command.");
      }
    }

    if (command === "start" && args[1]) {
      const serverIndex = parseInt(args[1]) - 1;
      const servers = await getAllServers();

      if (serverIndex < 0 || serverIndex >= servers.length) {
        return message.channel.send("Invalid server number.");
      }

      const server = servers[serverIndex];
      await startServer(server, message.channel);
    }

    if (command === "stop" && args[1]) {
      const serverIndex = parseInt(args[1]) - 1;
      const servers = await getAllServers();

      if (serverIndex < 0 || serverIndex >= servers.length) {
        return message.channel.send("Invalid server number.");
      }

      const server = servers[serverIndex];
      await stopServer(server, message.channel);
    }

    if (command === "backup") {
      await performManualBackup(message.channel);
    }

    if (command === "testalert") {
      message.channel.send("Triggering test system alert...");
      sendNotification(
        "🔔 **System Alert Test**: If you are seeing this, PteroPal's system alerts are correctly configured!"
      );
    }

    if (command === "help") {
      const panels = getConfiguredPanels();
      const panelList = panels.map((p) => p.panelName).join(", ") || "None";

      const helpMessage = `
**PteroPal Bot Commands**

**Active Panels:** ${panelList}

**${DISCORD_PREFIX}servers**
Lists all servers from all configured panels with their current status.

**${DISCORD_PREFIX}start <number>**
Starts the server corresponding to the number from the server list.
*Example: ${DISCORD_PREFIX}start 1*

**${DISCORD_PREFIX}stop <number>**
Stops the server corresponding to the number from the server list.
*Example: ${DISCORD_PREFIX}stop 1*

**${DISCORD_PREFIX}backup**
Triggers an immediate manual backup for all configured folders.
*These backups are saved to a separate 'manual_backups' folder and are not deleted automatically.*

**${DISCORD_PREFIX}testalert**
Sends a test system alert to verify that the DISCORD_NOTIFY_CHANNEL is configured correctly.

**${DISCORD_PREFIX}help**
Shows this help message.

**Made By Nubsuki**
GitHub: [PteroPal](https://github.com/nubsuki/PteroPal).`;
      message.channel.send(helpMessage);
    }
  });

  // Logs in the Discord client
  client.on("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const panels = getConfiguredPanels();
    console.log(
      `Active panels: ${panels.map((p) => p.panelName).join(", ") || "None"}`,
    );

    // Set up the notify channel
    if (DISCORD_NOTIFY_CHANNEL) {
      notifyChannel = client.channels.cache.get(DISCORD_NOTIFY_CHANNEL) || null;
      if (notifyChannel) {
        console.log(`[Discord] Notify channel set to: #${notifyChannel.name}`);
      } else {
        console.warn(`[Discord] DISCORD_NOTIFY_CHANNEL "${DISCORD_NOTIFY_CHANNEL}" not found.`);
      }
    }
  });

  if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
  } else {
    console.log("[Discord] No DISCORD_TOKEN provided. Discord bot disabled.");
  }
}

// Send a notification to the configured notify channel
function sendNotification(message) {
  if (notifyChannel) {
    notifyChannel.send(message).catch((err) =>
      console.error("[Discord] Failed to send notification:", err.message)
    );
  } else {
    console.log("[Discord] Notification (no channel set):", message);
  }
}

module.exports = { init, sendNotification };
