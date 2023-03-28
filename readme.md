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
# Si no tienes node instalado, instalalo paquete xd
npm install

# Para ejecutar el bot mientras desarrollas
npm run dev
```
