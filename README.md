
# PteroPal - Pterodactyl Server Manager & Backup Bot

PteroPal is a powerful Discord bot designed to simplify the management and backup of game servers hosted on Pterodactyl. It allows you to control servers directly from Discord, perform automatic scheduled backups, and trigger manual backups on demand. Backups can be stored locally and optionally uploaded to Google Drive.

## Features

*   **Server Management**:
    *   List all servers with their current status.
    *   Start and Stop servers via Discord commands.
    *   Real-time status updates during startup/shutdown.
*   **Automated Scheduled Backups**:
    *   Runs daily at a configurable time.
    *   **Optional Shutdown**: Can automatically shut down servers before backup to ensure data integrity and free up resources.
    *   **Storage**: Saves backups locally and optionally uploads to Google Drive.
    *   **Retention Policy**: Automatically cleans up old backups (local and cloud) based on a configured limit.
*   **Manual Backups**:
    *   Trigger a backup instantly via Discord command (`.backup`).
    *   **Separate Storage**: Manual backups are stored in a dedicated folder (`manual_backups`) and a separate Google Drive folder.
    *   **Permanent**: Manual backups are **not** subject to the automatic retention cleanup policy.
*   **Flexible Configuration**:
    *   Enable/Disable Google Drive uploads.
    *   Enable/Disable server shutdown before backups.
    *   Configurable backup paths and timezones.

## Prerequisites

*   **Pterodactyl Panel**: API URL and Client API Key.
*   **Discord Bot**: A bot token from the Discord Developer Portal.
*   **Google Cloud Project** (Optional): If you want Google Drive backups.
*   **Docker** & **Docker Compose**: For containerized deployment.

### Google Drive Setup (Optional)

If `ENABLE_DRIVE_BACKUP` is set to `true`:

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project and enable the **Google Drive API**.
3.  Go to **Credentials** -> **Create Credentials** -> **OAuth 2.0 Client ID**.
4.  Application Type: **Web application**.
5.  Authorized Redirect URIs: `http://localhost:3000/auth` (or your public IP/domain if running remotely).
6.  Download the JSON file, rename it to `credentials.json`, and place it in your config folder (mapped volume).
7.  When the bot starts for the first time, check the logs (`docker logs pteropal`). It will provide a URL.
8.  Visit the URL to authorize the bot. The generated `token.json` will be saved automatically.

## Configuration Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | Your Discord Bot Token. | Required |
| `DISCORD_PREFIX` | Prefix for bot commands. | `.` |
| `PTERODACTYL_API_URL` | URL to your Pterodactyl Panel. | Required |
| `PTERODACTYL_API_KEY` | Client API Key from Account Settings. | Required |
| `FOLDER_NAMES` | Comma-separated names for your backups (e.g., `Server1,Server2`). | Required |
| `FOLDER_PATHS` | Comma-separated paths to the folders **inside the container** to backup. | Required |
| `LOCAL_BACKUP_DIR` | Directory inside container for auto backups. | `./local_backups` |
| `ENABLE_DRIVE_BACKUP` | Set to `true` to upload to Google Drive. | `false` |
| `SHUTDOWN_BEFORE_BACKUP` | `true` to stop servers before backing up (safer). | `true` |
| `BACKUP_TIME` | Time to run auto-backup (24h format, e.g., `14:30`). | Required |
| `TZ` | Timezone for the backup schedule (e.g., `America/New_York`). | System Time |
| `MAX_BACKUPS` | Number of auto-backups to keep (0 = infinite). | `0` |

## Commands

*   `.servers`
    *   Lists all servers available to the API key with their current status.
*   `.start <number>`
    *   Starts the server corresponding to the number from the list.
*   `.stop <number>`
    *   Stops the server corresponding to the number from the list.
*   `.backup`
    *   **Manual Backup**: Immediately creates a backup of all configured folders.
    *   These backups are saved to the `manual_backups` folder (and "Folder - Manual Backups" on Drive).
    *   They are **not** deleted by the retention policy.
*   `.help`
    *   Lists all commands and their descriptions.

## License

This project is provided for personal use.
