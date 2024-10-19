## Before You Run the Bot

There are several functionalities that the Rapi BOT will perform if you have the proper channels and roles set up:

- **#nikke Channel**: This channel is used to send the daily reset message, including special interception boss notifications and open tribe tower alerts. It pings the role "Nikke", so ensure both the channel and role are correctly set up. Note that the role name is case-sensitive: "Nikke".
- **#rapi-radio Voice Channel**: The bot connects to this channel to play music 24/7. The music is sourced from the radio folder, which you can customize to suit your server's needs.
- **"Grounded" Role**: Users with this role will be ignored by the bot, and commands will not work for them.

## How to Run the Bot Locally

To run the bot, you need a Discord bot account. The official Discord documentation provides guidance on obtaining your API keys.

Check the `.env.example` file for the environment variables you need to set up:

```bash
# Port of your app
WAIFUPORT=
# Token of the Discord bot
WAIFUTOKEN=
# API key for thecatapi.com to send random cat images when the bot is mentioned
CATAPI=
# Client ID from the OAuth2 section of the Discord Developer Portal
CLIENTID=
```

### Running the Bot in Development Mode

To run the bot in development mode, follow these steps:

1. **Install npm packages**:
   ```bash
   npm install
   ```

2. **Test in the development environment** (ensure the bot is added to your server):
   ```bash
   npm run dev
   ```

### Running the Bot on a Server

To run the bot on a server, you can use any method you prefer. Personally, I recommend using PM2, as it is one of the easiest ways to manage Node.js applications on a server.
