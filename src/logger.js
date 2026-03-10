import pino from 'pino';
import config from './config.js';

// Build transport for production log aggregation (Logtail / Betterstack)
const transport =
    config.nodeEnv === 'production' && process.env.LOGTAIL_TOKEN
        ? pino.transport({
            target: '@logtail/pino',
            options: { sourceToken: process.env.LOGTAIL_TOKEN },
        })
        : undefined;

const logger = pino(
    { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    transport,
);

export default logger;
