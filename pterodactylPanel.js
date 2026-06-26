const axios = require("axios");

const PTERODACTYL_API_URL = process.env.PTERODACTYL_API_URL;
const PTERODACTYL_API_KEY = process.env.PTERODACTYL_API_KEY;

const headers = {
  Authorization: `Bearer ${PTERODACTYL_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "Application/vnd.pterodactyl.v1+json",
};

// Check if Pterodactyl is configured
function isConfigured() {
  return !!(PTERODACTYL_API_URL && PTERODACTYL_API_KEY);
}

// Fetches the current status of a server
async function getServerStatus(serverId) {
  try {
    const response = await axios.get(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/resources`,
      { headers }
    );
    return response.data.attributes.current_state;
  } catch (error) {
    console.error(
      `[Pterodactyl] Error fetching server status for ${serverId}:`,
      error.message
    );
    return "unknown";
  }
}

// Fetches all servers from the Pterodactyl API
async function getServers() {
  try {
    const response = await axios.get(`${PTERODACTYL_API_URL}/api/client`, {
      headers,
    });

    const servers = await Promise.all(
      response.data.data.map(async (server) => ({
        id: server.attributes.identifier,
        name: server.attributes.name,
        status: await getServerStatus(server.attributes.identifier),
      }))
    );

    console.log("[Pterodactyl] Servers fetched:", servers);
    return servers;
  } catch (error) {
    console.error("[Pterodactyl] Error fetching servers:", error.message);
    return [];
  }
}

// Sends a power action (start/stop) to a server
async function sendPowerAction(serverId, signal) {
  try {
    await axios.post(
      `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/power`,
      { signal },
      { headers }
    );
    console.log(
      `[Pterodactyl] Power action "${signal}" sent to server ${serverId}`
    );
  } catch (error) {
    console.error(
      `[Pterodactyl] Error sending power action "${signal}" to ${serverId}:`,
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
  panelName: "Pterodactyl",
};
