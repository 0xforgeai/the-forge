import pino from 'pino';
import config from './config.js';

const logger = pino({
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
});

export default logger;
