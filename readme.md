# Loot and Waifus Bot

## Overview

The Loot and Waifus Bot is a Discord bot designed to manage daily resets and provide various utilities for gacha games. It includes features such as sending daily reset messages, playing music in voice channels, and responding to specific commands with images or text.

### Key Features

- **Daily Reset Notifications**: Sends messages to a designated channel about daily resets, special interception bosses, and tribe tower alerts.
- **24/7 Music Playback**: Connects to a voice channel to play music continuously from a specified folder.
- **Command Responses**: Responds to specific text commands with images, videos, or text messages.
- **Role and Channel Management**: Interacts with specific roles and channels to provide tailored experiences.
- **Chat Command Rate Limiting**: Prevents spam by limiting users to 3 chat commands per hour per guild.

## Chat Command Rate Limiting

### TLDR

- **Limit**: 3 chat commands per hour per user per guild
- **Scope**: All chat commands are automatically rate limited (except in #rapi-bot channel)
- **Violator Tracking**: Users with 5+ attempts are tracked as violators
- **Commands**: 
  - `/spam check` - Check your status (ephemeral embed)
  - `/spam stats` - View guild stats with top violators (Mods/King only)
  - `/spam reset <user>` - Reset user limit (Mods/King only)

### How It Works

- Tracks usage per user per guild (not global)
- Ignores #rapi-bot channel (allows unlimited spam there)
- Automatically cleans up expired data every 2 hours
- Shows temporary warning messages (auto-deleted after 5 seconds)
- Tracks violators (users who attempt 5+ commands)
- Uses slash commands with ephemeral responses
- Requires Mods or King role for admin functions
- Logs all rate limit events to console

### Configuration

Edit `src/utils/chatCommandRateLimiter.ts` to change limits:

```typescript
export const CHAT_COMMAND_RATE_LIMIT = {
    maxCommands: 3,        // Commands per hour
    windowMs: 60 * 60 * 1000,       // 1 hour
    cleanupIntervalMs: 2 * 60 * 60 * 1000 // 2 hours
} as const;
```

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
