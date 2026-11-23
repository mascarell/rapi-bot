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

// There was no shutdown hook before. Stop every timed job, then exit with the
// conventional 128 + signal number status. Exiting explicitly matters: as PID 1
// in a container the default action for these signals does not apply, so
// without it the process would ignore `docker stop` until it is killed.
const SHUTDOWN_SIGNALS = { SIGINT: 2, SIGTERM: 15 } as const;
for (const [signal, number] of Object.entries(SHUTDOWN_SIGNALS)) {
    process.once(signal, () => {
        getJobScheduler().cancelAll();
        process.exit(128 + number);
    });
}

app.listen(port);
