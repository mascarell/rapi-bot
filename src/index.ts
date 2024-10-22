import 'dotenv/config';
import express from 'express';
import { initDiscordBot } from './discord';
import router from './router';

const app = express();
const port = process.env.WAIFUPORT || 3000;

app.use('/', router);

initDiscordBot();

app.listen(port, () => console.log(`App listening at port ${port}`));
