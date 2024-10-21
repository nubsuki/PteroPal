pteodactyle mange and back up discord bot 

this for easy access for discord users who host there own games in pterodacty 


Listens for commands in Discord (like .servers, .start <number>, .stop <number>) to manage the Pterodactyl servers.
Retrieves the server list from Pterodactyl and allows starting/stopping servers by issuing commands from Discord.

Pterodactyl API Integration:

Fetches server statuses and controls server power actions (start/stop)

Google Drive Backup:

Every day at 4:00 AM Sri Lanka time, all active servers are shut down. At 4:20 AM, a backup process starts, uploading specific folders from the local machine to Google Drive

It uses OAuth2 authentication for Google Drive and supports the automatic creation of directories in Google Drive to store backups.

The script checks the server status every 2 minutes and handles backup and shutdown automatically at 4 AM Sri Lanka time


How to install 

mkdir -p /discordBot
cd /discordBot
git clone https://github.com/nubsuki/Shaper.git

cd Shaper

nano docker-compose.yml


version: '3'
services:
  shaper:
    build:
      context: .
    container_name: shaper-bot
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - PTERODACTYL_API_URL=${PTERODACTYL_API_URL}
      - PTERODACTYL_API_KEY=${PTERODACTYL_API_KEY}
      - FOLDER_NAMES=${satisfactory,minecraft}
      - FOLDER_PATHS=${E:/Desktop/satisfactory/Saved,E:/Desktop/minecraft/world}
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - /discordBot/Shaper:/app/data #edit Path to where you gonna clone the Bot 


