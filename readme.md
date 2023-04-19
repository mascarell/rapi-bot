## How to run the bot locally

Obviously you need a Discord bot, the official documentation is easy to follow and you can get your API keys there.

Check the .evn.example for the variables you need to setup

```bash
# Port of your app
WAIFUPORT=app port
# Token of the discord bot
WAIFUTOKEN=discord token
# I use thecatapi.com to send random cats when you mention the bot
CATAPI=thecatapi.com token
```

To run the bot in dev mode, you only need to install and run

```bash
# Install npm packages
npm install

# Test in dev ennvironment, you need the bot on your server
npm run dev
```

To run the bot on a server, you can use whatever method you prefer. I personally use PM2 on my server as I think it's probably one of the easiest ways.