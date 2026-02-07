import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

const isDev = process.env.NODE_ENV === 'development';
const logLevel = (process.env.LOG_LEVEL as "debug" | "info" | "warning" | "error") || (isDev ? "debug" : "warning");

await configure({
    sinks: {
        console: getConsoleSink(),
    },
    loggers: [
        {
            category: ["bot"],
            lowestLevel: logLevel,
            sinks: ["console"],
        },
    ],
});

export const logger = getLogger(["bot"]);
export const discordLogger = getLogger(["bot", "discord"]);
export const gachaLogger = getLogger(["bot", "gacha"]);
export const embedFixLogger = getLogger(["bot", "embed-fix"]);
export const schedulerLogger = getLogger(["bot", "scheduler"]);
export const mediaLogger = getLogger(["bot", "media"]);
export const rulesLogger = getLogger(["bot", "rules"]);
