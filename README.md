# PteroPal - Game Server Manager & Backup Bot

![GHCR Pulls](https://ghcr-badge.elias.eu.org/shield/nubsuki/pteropal)
[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Donate-yellow?logo=buymeacoffee)](https://buymeacoffee.com/nubsuki)

PteroPal is a powerful tool designed to simplify the management and backup of game servers hosted on **Pterodactyl** and **Crafty Controller**. It features a modern web dashboard, Discord bot integration, and automated cloud backups.

Control your servers directly from Discord, perform automatic scheduled backups, and trigger manual backups on demand. Backups can be stored locally and optionally uploaded to Google Drive.

## Features

- **Web Dashboard**:
  - Manage and configure backup folders via an interactive UI.
  - One-click Google Drive connection and OAuth setup.
  - Test Panel connections and Drive backups directly from the browser.
- **Server Management (Discord & Automated)**:
  - Support for both **Pterodactyl** and **Crafty Controller**.
  - List all servers with their current status.
  - Start and Stop servers via Discord commands.
  - Real-time status updates during startup/shutdown.
- **Automated Scheduled Backups**:
  - Runs daily at a configurable time.
  - **Optional Shutdown**: Can automatically shut down servers before backup to ensure data integrity and free up resources.
  - **Storage**: Saves backups locally and optionally uploads to a dedicated `Petropal Backups` folder on Google Drive.
  - **Retention Policy**: Automatically cleans up old backups (local and cloud) based on a configured limit.
- **Manual Backups**:
  - Trigger a backup instantly via Web Dashboard or Discord command (`.backup`).
  - **Separate Storage**: Manual backups are stored in a dedicated folder (`manual_backups`) and a separate Google Drive folder.
  - **Permanent**: Manual backups are **not** subject to the automatic retention cleanup policy.
- **Flexible Configuration**:
  - Enable/Disable Google Drive uploads.
  - Enable/Disable server shutdown before backups.
  - Configurable backup paths and timezones.

## Prerequisites

- **Game Panel**: Pterodactyl Panel API Key OR Crafty Controller API Key.
- **Discord Bot**: A bot token from the Discord Developer Portal.
- **Google Cloud Project** (Optional): If you want Google Drive backups.
- **Docker** & **Docker Compose**: For containerized deployment.

### Web Dashboard Setup

Once PteroPal is running, access the web dashboard at `http://localhost:3000`. From here, you can:

1. Add and remove folders to backup.
2. Test your Panel API connections.
3. Manage your Google Drive connection.

### Google Drive Setup (Optional)

If `ENABLE_DRIVE_BACKUP` is set to `true`:

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project and enable the **Google Drive API**.
3.  Go to **Credentials** -> **Create Credentials** -> **OAuth 2.0 Client ID**.
4.  Application Type: **Web application**.
5.  Authorized Redirect URIs: `http://localhost:3000/auth` (or your public IP/domain if running remotely).
6.  Download the JSON file.
7.  Open the PteroPal **Web Dashboard** (`http://localhost:3000`).
8.  Under the Google Drive section, click **Upload credentials.json** and select the file you just downloaded.
9.  Click **Connect Google Drive** and authorize your account. You're done!

## Configuration Variables (`.env`)

| Variable                 | Description                                                                                        | Default     |
| :----------------------- | :------------------------------------------------------------------------------------------------- | :---------- |
| `DISCORD_TOKEN`          | Your Discord Bot Token.                                                                            | Required    |
| `DISCORD_PREFIX`         | Prefix for bot commands.                                                                           | `.`         |
| `DISCORD_NOTIFY_CHANNEL` | Optional Channel ID to send system alerts (e.g., Drive disconnected warnings).                     | Empty       |
| `PTERODACTYL_API_URL`    | URL to your Pterodactyl Panel.                                                                     | Optional    |
| `PTERODACTYL_API_KEY`    | Client API Key from Account Settings.                                                              | Optional    |
| `CRAFTY_API_URL`         | URL to your Crafty Controller.                                                                     | Optional    |
| `CRAFTY_API_KEY`         | API Token from Crafty User Settings.                                                               | Optional    |
| `FOLDER_NAMES`           | Comma-separated names for backups (Can also be managed via Web Dashboard).                         | Required    |
| `FOLDER_PATHS`           | Comma-separated paths to folders **inside the container** (Can also be managed via Web Dashboard). | Required    |
| `ENABLE_DRIVE_BACKUP`    | Set to `true` to upload to Google Drive.                                                           | `false`     |
| `SHUTDOWN_BEFORE_BACKUP` | `true` to stop servers before backing up (safer).                                                  | `true`      |
| `BACKUP_TIME`            | Time to run auto-backup (24h format, e.g., `14:30`).                                               | Required    |
| `TZ`                     | Timezone for the backup schedule (e.g., `Asia/Colombo`).                                           | System Time |
| `MAX_BACKUPS`            | Number of local auto-backups to keep (0 = infinite).                                               | `0`         |
| `MAX_DRIVE_BACKUPS`      | Number of Google Drive auto-backups to keep (0 = infinite).                                        | `0`         |

## Commands

- `.servers`
  - Lists all servers available to the API keys with their current status.
- `.start <number>`
  - Starts the server corresponding to the number from the list.
- `.stop <number>`
  - Stops the server corresponding to the number from the list.
- `.backup`
  - **Manual Backup**: Immediately creates a backup of all configured folders.
  - These backups are saved to the `manual_backups` folder (and "Folder - Manual Backups" on Drive).
  - They are **not** deleted by the retention policy.
- `.testalert`
  - Sends a test system alert to verify that the DISCORD_NOTIFY_CHANNEL is configured correctly.
- `.help`
  - Lists all commands and their descriptions.

## License

This project is provided for personal use.
