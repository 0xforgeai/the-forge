import prisma from './db.js';
import config from './config.js';
import logger from './logger.js';

const MAX_SSE_CLIENTS = 500; // M-8 fix: prevent memory exhaustion

/**
 * Server-Sent Events manager.
 * Clients subscribe via GET /api/events.
 * Server pushes game events to all connected clients.
 *
 * H-1 fix: In production, requires x-api-key header for full event data.
 * Unauthenticated clients in production are rejected.
 * In development, unauthenticated clients are allowed with reduced data.
 */
class SSEManager {
    constructor() {
        this.clients = new Set();
    }

    /**
     * Handle a new SSE connection.
     * M-8 fix: reject connections beyond MAX_SSE_CLIENTS.
     * H-1 fix: validate API key in production.
     */
    async addClient(req, res) {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            res.status(503).json({ error: 'Too many active connections. Try again later.' });
            return;
        }

        // H-1: Authenticate in production
        const apiKey = req.headers['x-api-key'];
        let authenticated = false;

        if (apiKey) {
            try {
                const wallet = await prisma.wallet.findUnique({ where: { apiKey } });
                if (wallet) {
                    authenticated = true;
                }
            } catch (err) {
                logger.error({ err }, 'SSE auth lookup error');
            }
        }

        if (config.nodeEnv === 'production' && !authenticated) {
            res.status(401).json({ error: 'SSE requires authentication in production. Include x-api-key header.' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });

        // Send a comment to keep connection alive
        res.write(':ok\n\n');

        const client = { id: Date.now(), res, authenticated };
        this.clients.add(client);
        logger.info({ clientId: client.id, authenticated, total: this.clients.size }, 'SSE client connected');

        req.on('close', () => {
            this.clients.delete(client);
            logger.info({ clientId: client.id, total: this.clients.size }, 'SSE client disconnected');
        });
    }

    /**
     * Broadcast an event to all connected clients.
     * H-1 fix: unauthenticated clients (dev only) receive reduced event data.
     * @param {string} event - Event name (e.g. 'puzzle.created')
     * @param {object} data - Event data (full version for authenticated clients)
     * @param {object} [publicData] - Optional reduced data for unauthenticated clients
     */
    broadcast(event, data, publicData) {
        const fullPayload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const publicPayload = publicData
            ? `event: ${event}\ndata: ${JSON.stringify(publicData)}\n\n`
            : fullPayload;

        let sent = 0;
        for (const client of this.clients) {
            try {
                const payload = client.authenticated ? fullPayload : publicPayload;
                client.res.write(payload);
                sent++;
            } catch (err) {
                logger.error({ err, clientId: client.id }, 'Failed to send SSE event');
                this.clients.delete(client);
            }
        }
        logger.debug({ event, sent, total: this.clients.size }, 'SSE broadcast');
    }

    /**
     * M-13 fix: close all SSE connections for graceful shutdown.
     */
    closeAll() {
        for (const client of this.clients) {
            try {
                client.res.end();
            } catch (err) {
                // ignore — client may already be disconnected
            }
        }
        this.clients.clear();
        logger.info('All SSE clients disconnected (shutdown)');
    }
}

// Singleton
const sse = new SSEManager();
export default sse;

