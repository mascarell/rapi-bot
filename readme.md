## Before you run the bot

There are a couple functionalities that Rapi BOT will do if you have the proper channels set up

- #nikke channel to send the daily reset message with special interception boss and open tribe tower. This pings the role "Nikke", so you need both the channel and role for it to work. The role IT'S CASE SENSITIVE, "Nikke".
- #rapi-radio voice channel for the bot to connect and play music 24/7, it's the music on the radio folder, feel free to change it to fit your server
- "Grounded" role on your server. The bot will ignore everyone with this role and commands will not work for them

## How to run the bot locally

Obviously you need a Discord bot, the official documentation is easy to follow and you can get your API keys there.

Check the .evn.example for the variables you need to setup

```bash
# Port of your app
WAIFUPORT=
# Token of the discord bot
WAIFUTOKEN=
# I use thecatapi.com to send random cats when you mention the bot
CATAPI=
# client id from OAuth2 discord dev portal
CLIENTID=
```

To run the bot in dev mode, you only need to install and run

```bash
# Install npm packages
npm install

# Test in dev ennvironment, you need the bot on your server
npm run dev
```

To run the bot on a server, you can use whatever method you prefer. I personally use PM2 on my server as I think it's probably one of the easiest ways.