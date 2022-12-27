if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config();
}

const express = require('express');
const app = express();
const port = process.env.WAIFUPORT;
const router = require('./router');
const { initDiscordBot } = require('./discord');

app.use('/', router)

initDiscordBot();

app.listen(port, () => console.log(`App listening at port ${port}`));