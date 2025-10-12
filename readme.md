# Loot and Waifus Bot

## Overview

The Loot and Waifus Bot is a Discord bot designed to manage daily resets and provide various utilities for gacha games. It includes features such as sending daily reset messages, playing music in voice channels, and responding to specific commands with images or text.

### Key Features

- **Daily Reset Notifications**: Sends messages to a designated channel about daily resets, special interception bosses, and tribe tower alerts.
- **24/7 Music Playback**: Connects to a voice channel to play music continuously from a specified folder.
- **Command Responses**: Responds to specific text commands with images, videos, or text messages.
- **Role and Channel Management**: Interacts with specific roles and channels to provide tailored experiences.
- **Hourly Rate Limiting**: Users are limited to 3 chat commands per hour, resetting at the top of every hour (UTC).
- **/age Command**: Shows how long the bot has been running (system uptime).
- **/spam Command**:
  - `/spam check` shows your current spam status, including:
    - Commands remaining
    - Time until reset (top of the hour)
    - Most used chat command
    - Your usage rank
    - Server average
  - `/spam stats` (Moderator Only: requires 'mods' role or admin permission) shows:
    - User activity
    - Violation tracking
    - System health
    - Top violators
    - Most spammed chat commands
    - Recommendations
  - `/spam reset` (Moderator Only) resets a user's rate limit in the current server.

## Permissions

- **Moderator commands** require the 'mods' role or Discord administrator permission.
- The 'king' role is no longer required or checked.

## Notes

- All chat commands are dynamically rate-limited; no static list is maintained.
- Rate limits reset for everyone at the top of each hour (UTC), not on a rolling window.
- Stats and limits are tracked per server (guild) unless otherwise noted.

## Prerequisites

- A Discord bot account with the necessary permissions.
- Node.js and npm installed on your machine.
- Docker and Docker Compose installed if you plan to run the bot in a container.

## Environment Variables

Create a `.env` file in the root of your project directory with the following variables:

```plaintext
WAIFUPORT=8080
WAIFUTOKEN=your_discord_bot_token
CATAPI=your_catapi_token
CLIENTID=your_discord_client_id
```

## Running the Bot Locally

### Development Mode

1. **Install npm packages**:
   ```bash
   npm install
   ```

2. **Run the bot in development mode**:
   ```bash
   npm run dev
   ```

### Production Mode

1. **Build the TypeScript project**:
   ```bash
   npm run build
   ```

2. **Run the bot**:
   ```bash
   npm run start
   ```

## Running the Bot with Docker

1. **Build and run the Docker container**:
   ```bash
   docker-compose up --build
   ```

2. **Stop the Docker container**:
   ```bash
   docker-compose down
   ```

## Setting Up Discord Channels and Roles

- **#nikke Channel**: Used for daily reset messages. Ensure the "Nikke" role is set up for notifications.
- **#rapi-radio Voice Channel**: The bot connects here to play music.
- **"Grounded" Role**: Users with this role will be ignored by the bot.

## Additional Information

- **Music Source**: Customize the music played by the bot by adding files to the `radio` folder.
- **Command Customization**: Add or modify commands by editing the files in the `src/commands` directory.

For more detailed setup and configuration, refer to the official Discord documentation for bot setup and permissions.

## Managing Daily Reset Messages

The bot uses a modular daily reset service to send automated messages for multiple games. To add or remove games:

### Adding a New Game

1. **Edit `src/utils/data/gamesResetConfig.ts`**:
   - Add a logo URL constant at the top (e.g., `const GAME_LOGO_URL = ...`)
   - Create a new config object following the `DailyResetConfig` interface:
     ```typescript
     const newGameResetConfig: DailyResetConfig = {
       game: 'Game Name',
       channelName: 'discord-channel-name',
       roleName: 'RoleName', // Optional - omit if no role ping needed
       resetTime: { hour: 19, minute: 0 }, // UTC time
       timezone: 'UTC',
       embedConfig: {
         title: 'ATTENTION PLAYERS!',
         description: 'Your message here',
         color: 0x00FF00, // Hex color code
         footer: { text: 'Footer text', iconURL: RAPI_BOT_THUMBNAIL_URL },
         thumbnail: GAME_LOGO_URL,
         author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL }
       },
       checklist: [
         { name: '**Task Name**', value: 'Task description' }
       ],
       mediaConfig: {
         cdnPath: 'dailies/game-name/', // Path to images on CDN
         extensions: [...DEFAULT_IMAGE_EXTENSIONS],
         trackLast: 10
       }
     };
     ```
   - Add your config to the `dailyResetServiceConfig.games` array

2. **Upload media assets**:
   - Add images/GIFs to your CDN at the path specified in `mediaConfig.cdnPath`
   - Add a game logo to `assets/logos/` on your CDN

3. **Restart the bot** for changes to take effect

### Removing a Game

1. **Edit `src/utils/data/gamesResetConfig.ts`**:
   - Remove the game's config object
   - Remove its logo URL constant
   - Remove it from the `dailyResetServiceConfig.games` array

2. **Restart the bot** for changes to take effect

### Dev Mode Testing

When `NODE_ENV=development`, daily reset messages trigger every 5 minutes instead of at their scheduled times, making it easy to test changes without waiting.

---

For more details, see the code or use `/help` in Discord.
