const fs = require("fs-extra");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const STATUS_MESSAGES_FILE =
  process.env.STATUS_MESSAGES_FILE ||
  path.join(__dirname, "..", "config", "statusMessages.json");
const SERVER_METADATA_FILE =
  process.env.SERVER_METADATA_FILE ||
  path.join(__dirname, "..", "config", "serverMetadata.json");

// Ensure config dir exists
fs.ensureDirSync(path.join(__dirname, "..", "config"));

function loadStatusMessages() {
  if (fs.existsSync(STATUS_MESSAGES_FILE)) {
    try {
      return fs.readJsonSync(STATUS_MESSAGES_FILE);
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveStatusMessages(messages) {
  fs.writeJsonSync(STATUS_MESSAGES_FILE, messages, { spaces: 2 });
}

function loadServerMetadata() {
  if (fs.existsSync(SERVER_METADATA_FILE)) {
    try {
      return fs.readJsonSync(SERVER_METADATA_FILE);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveServerMetadata(metadata) {
  fs.writeJsonSync(SERVER_METADATA_FILE, metadata, { spaces: 2 });
}

function trackStatusMessage(serverId, channelId, messageId) {
  const messages = loadStatusMessages();
  const existing = messages.find((m) => m.messageId === messageId);
  if (!existing) {
    messages.push({ serverId, channelId, messageId });
    saveStatusMessages(messages);
  }
}

function removeStatusMessage(messageId) {
  let messages = loadStatusMessages();
  messages = messages.filter((m) => m.messageId !== messageId);
  saveStatusMessages(messages);
}

// Generates the Rich Embed for a given server
function createStatusEmbed(server, status, metadata) {
  const name = metadata?.customName || server.name;
  const description =
    metadata?.description ||
    `Status monitor for ${server.name} on ${server.panel}`;
  const iconUrl = metadata?.iconUrl || null;

  let color = 0x808080; // Gray
  if (status === "running")
    color = 0x00ff00; // Green
  else if (status === "offline")
    color = 0xff0000; // Red
  else if (status === "starting" || status === "stopping") color = 0xffff00; // Yellow

  const embed = new EmbedBuilder()
    .setTitle(name)
    .setDescription(
      `${description}\n\nCurrent Status: **${status.toUpperCase()}**`,
    )
    .setColor(color)
    .setTimestamp(); // This handles the "last updated time" via Discord UI

  if (iconUrl) {
    try {
      embed.setThumbnail(iconUrl);
    } catch (err) {
      console.error("Invalid thumbnail URL", iconUrl);
    }
  }

  return embed;
}

async function updateAllEmbeds(client, getAllServers) {
  const messages = loadStatusMessages();
  if (messages.length === 0) return;

  const metadataMap = loadServerMetadata();
  let servers = [];
  try {
    servers = await getAllServers();
  } catch (err) {
    console.error("Failed to fetch servers for status update:", err.message);
    return;
  }

  const invalidMessageIds = [];

  for (const trackInfo of messages) {
    const { serverId, channelId, messageId } = trackInfo;

    // Find server
    const server = servers.find((s) => String(s.id) === String(serverId));
    if (!server) continue;

    // Fetch status
    let status = "unknown";
    try {
      status = await server.panelModule.getServerStatus(serverId);
    } catch (err) {
      console.error(`Failed to get status for ${server.name} during update.`);
    }

    // Fetch Discord channel and message
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) throw new Error("Channel not found");

      const msg = await channel.messages.fetch(messageId);
      if (!msg) throw new Error("Message not found");

      const embed = createStatusEmbed(server, status, metadataMap[serverId]);
      await msg.edit({ content: "", embeds: [embed] });
    } catch (err) {
      const isPermanentError =
        err.code === 10008 || // Unknown Message
        err.code === 10003 || // Unknown Channel
        err.message === "Channel not found" ||
        err.message === "Message not found";
      if (isPermanentError) {
        console.error(
          `Status message ${messageId} is permanently gone (${err.message}). Removing from tracking.`,
        );
        invalidMessageIds.push(messageId);
      } else {
        console.error(
          `Transient error updating status message ${messageId}: ${err.message}. Keeping in tracking.`,
        );
      }
    }
  }

  if (invalidMessageIds.length > 0) {
    let currentMessages = loadStatusMessages();
    currentMessages = currentMessages.filter(
      (m) => !invalidMessageIds.includes(m.messageId),
    );
    saveStatusMessages(currentMessages);
  }
}

module.exports = {
  loadServerMetadata,
  saveServerMetadata,
  trackStatusMessage,
  removeStatusMessage,
  createStatusEmbed,
  updateAllEmbeds,
};
