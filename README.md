
---

# PteroPal - Pterodactyl Server Manager & Backup Bot

PteroPal is a Discord bot that simplifies the management and backup of game servers hosted on Pterodactyl. With easy-to-use commands, users can control their servers directly from Discord and automatically back up server data to Google Drive.

## Features

- **Pterodactyl Server Management:**
  - Manage servers directly from Discord using commands like:
    - `.servers` – View the list of servers.
    - `.start <number>` – Start a specific server.
    - `.stop <number>` – Stop a specific server.
  - Fetch server statuses and control server power actions using the Pterodactyl API.


- **Daily Backup to Google Drive:**

  The first backup starts as soon as the bot is launched. If any errors occur, you can address them right away. Ensure all servers are manually shut down before starting the bot to allow the backup process to run smoothly.
  - Every day, all active servers are automatically shut down at a specified time.
  - The backup process zips your files temporarily, uploads the zip files from specific folders on the local machine to Google Drive, and then removes the temporary files once the upload is complete.
  - OAuth2 authentication is used for Google Drive, with automatic directory creation for backups.

- **Resource Management:**
  - Servers are shut down during backups to free up VPS resources for other tasks.

## Prerequisites

- Pterodactyl server
- Google Cloud Console for Google Drive API credentials
- Discord bot token

## Installation

1. Create a folder named `pteropal` and add your JSON files there.
2. Create and edit the `docker-compose.yml` file to configure the environment:

    ```bash
    nano docker-compose.yml
    ```

    `docker-compose.yml`:

    ```yaml
    version: '3'
    services:
      pteropal:
        image: nubsuki/pteropal
        container_name: petropal
        volumes:
          - /pteropal/token.json:/app/token.json  # Mount the token file
          - /pteropal/credentials.json:/app/credentials.json  # Mount Google Drive credentials
          - /pterodactyl/volumes:/pterodactyl/volumes  # Mount the Pterodactyl Save directory
        environment:
          - DISCORD_TOKEN=# Discord bot token
          - PTERODACTYL_API_URL=# Pterodactyl API URL
          - PTERODACTYL_API_KEY=# Pterodactyl API key
          - FOLDER_NAMES=folder1,folder2  # Comma-separated folder names for backup
          - FOLDER_PATHS=/path/to/folder1,/path/to/folder2  # Corresponding folder paths
          - TZ=Asia/Colombo
          - SHUTDOWN_TIME= # Time for shutdown
          - BACKUP_TIME= # Time for backup
          - PUID=1000 # Set permissions
          - PGID=1000 # Set permissions
        ports:
          - "3000:3000"
        restart: unless-stopped
    ```

    Example `docker-compose.yml`:

    ```yaml
    version: '3.8'
    services:
      pteropal:
        image: nubsuki/pteropal
        container_name: petropal
        volumes:
          - /discordBot/pteropal/token.json:/app/token.json  # Mount the token file
          - /discordBot/pteropal/credentials.json:/app/credentials.json  # Mount Google Drive credentials
          - /var/lib/pterodactyl/volumes:/var/lib/pterodactyl/volumes # Mount the save directory
        environment:
          - DISCORD_TOKEN=your_discord_token  # Discord bot token
          - PTERODACTYL_API_URL=your_pterodactyl_api_url  # Pterodactyl API URL
          - PTERODACTYL_API_KEY=your_pterodactyl_api_key  # Pterodactyl API key
          - FOLDER_NAMES=Satisfactory,Minecraft  # Comma-separated folder names for backup
          - FOLDER_PATHS=/var/lib/pterodactyl/volumes/<volume-id>/.config/Epic/FactoryGame/Saved,/var/lib/pterodactyl/volumes/<volume-id>/world
          - TZ=Asia/Colombo
          - SHUTDOWN_TIME=04:55  # Time for shutdown
          - BACKUP_TIME=04:58    # Time for backup
          - PUID=998  # Set permissions
          - PGID=997  # Set permissions
        restart: unless-stopped
    ```

3. Start the bot:

    ```bash
    docker-compose up -d
    ```

## If you don't have a `token.json` file yet, remove this line from the `volumes` section:

    - /pteropal/token.json:/app/token.json

## Google Drive API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and sign in.

2. Create a new project:
   - Click on the project dropdown in the top-left corner.
   - Select "New Project" and give it a name (e.g., "Drive API Project").
   - Click "Create."

3. Enable the Google Drive API:
   - In the left sidebar, go to **APIs & Services > Library**.
   - Search for "Google Drive API" and click "Enable."

4. Create OAuth credentials:
   - Go to **APIs & Services > Credentials**.
   - Click **Create Credentials** and select **OAuth 2.0 Client ID**.
   - Choose **Web application**, add `http://localhost:3000` to the **Authorized redirect URIs**.
   - Select the scope for **Google Drive API** with `.../auth/drive.file`.
   - Download the credentials JSON, rename it to `credentials.json`, and place it in your bot folder.

5. Run the bot, which will prompt you with a link. Authorize your account via this link, and the bot will generate and save a `token.json` for future access.

## Common Error Fix (OAuth2 Callback Issue)

The authorization URL should look like this:

```
http://localhost:3000/auth?code=4/0AV...
```

But when opened in your browser, it may redirect to:

```
localhost:3000/?code=4/0...
```

If this happens, manually adjust the URL by adding `/auth` like this:

```
http://localhost:3000/auth?code=4/0...
```

### Example of URL Before Fix:

![Incorrect URL Example](./Assets/url.png)

### Example After Fix:

![Correct URL Example](./Assets/url_fix.png)

## Daily Backup Schedule

- – All active servers are shut down to free resources.
- – Backup process starts, uploading specific folders to Google Drive.

The bot automatically checks the server status every 1 minutes and handles backup and shutdown at 4:00 AM Sri Lanka time.

## License

This project is provided for personal use and is distributed "as-is.".

---