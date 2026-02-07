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

// Single logger export for all bot operations
export const logger = getLogger(["bot"]);
