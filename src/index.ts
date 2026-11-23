import 'dotenv/config';
import './utils/logger.js';
import express from 'express';
import { initDiscordBot } from './discord.js';
import router from './router.js';
import { getJobScheduler } from './services/scheduler/jobScheduler.js';

const app = express();
const port = process.env.WAIFUPORT || 3000;

app.use('/', router);

initDiscordBot();

// There was no shutdown hook before. Stop every timed job, then let the signal
// do what it always did (the handler is gone after `once`, so re-raising it
// ends the process with the usual exit status).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        getJobScheduler().cancelAll();
        process.kill(process.pid, signal);
    });
}

app.listen(port);
