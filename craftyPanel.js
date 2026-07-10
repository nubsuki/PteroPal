const axios = require("axios");
const https = require("https");

const CRAFTY_API_URL = process.env.CRAFTY_API_URL;
const CRAFTY_API_KEY = process.env.CRAFTY_API_KEY;

// Create an Axios instance that accepts self-signed certificates
const craftyAxios = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

// Check if Crafty Controller is configured
function isConfigured() {
  return !!(CRAFTY_API_URL && CRAFTY_API_KEY);
}

// Common headers for Crafty API requests
function getHeaders() {
  return {
    Authorization: `Bearer ${CRAFTY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Fetches the current status of a server
async function getServerStatus(serverId) {
  try {
    const response = await craftyAxios.get(
      `${CRAFTY_API_URL}/api/v2/servers/${serverId}/stats`,
      { headers: getHeaders() }
    );

    const stats = response.data.data;
    // Crafty returns running state in the stats
    if (stats && stats.running) {
      return "running";
    }
    return "offline";
  } catch (error) {
    console.error(
      `[Crafty] Error fetching server status for ${serverId}:`,
      error.message
    );
    return "unknown";
  }
}

// Fetches all servers from the Crafty Controller API
async function getServers() {
  try {
    const response = await craftyAxios.get(
      `${CRAFTY_API_URL}/api/v2/servers`,
      { headers: getHeaders() }
    );

    // Crafty API may nest servers differently depending on version
    const serverData = response.data.data || response.data || [];

    const servers = await Promise.all(
      serverData.map(async (server) => {
        const serverId = server.server_id || server.id;
        const serverName = server.server_name || server.name;
        const status = await getServerStatus(serverId);
        return {
          id: serverId,
          name: serverName,
          status,
        };
      })
    );

    console.log("[Crafty] Servers fetched:", servers);
    return servers;
  } catch (error) {
    console.error("[Crafty] Error fetching servers:", error.message);
    return [];
  }
}

// Sends a power action (start/stop) to a server
async function sendPowerAction(serverId, signal) {
  try {
    let action;
    if (signal === "start") {
      action = "start_server";
    } else if (signal === "stop") {
      action = "stop_server";
    } else if (signal === "restart") {
      action = "restart_server";
    } else {
      throw new Error(`Unknown power signal: ${signal}`);
    }

    await craftyAxios.post(
      `${CRAFTY_API_URL}/api/v2/servers/${serverId}/action/${action}`,
      {},
      { headers: getHeaders() }
    );
    console.log(
      `[Crafty] Power action "${signal}" sent to server ${serverId}`
    );
  } catch (error) {
    console.error(
      `[Crafty] Error sending power action "${signal}" to ${serverId}:`,
      error.message
    );
    throw error;
  }
}

module.exports = {
  isConfigured,
  getServers,
  getServerStatus,
  sendPowerAction,
  panelName: "Crafty Controller",
};
