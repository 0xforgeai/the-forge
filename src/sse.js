import logger from './logger.js';

const MAX_SSE_CLIENTS = 500; // M-8 fix: prevent memory exhaustion

/**
 * Server-Sent Events manager.
 * Clients subscribe via GET /api/events.
 * Server pushes game events to all connected clients.
 */
class SSEManager {
    constructor() {
        this.clients = new Set();
    }

    /**
     * Handle a new SSE connection.
     * M-8 fix: reject connections beyond MAX_SSE_CLIENTS.
     */
    addClient(req, res) {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            res.status(503).json({ error: 'Too many active connections. Try again later.' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });

        // Send a comment to keep connection alive
        res.write(':ok\n\n');

        const client = { id: Date.now(), res };
        this.clients.add(client);
        logger.info({ clientId: client.id, total: this.clients.size }, 'SSE client connected');

        req.on('close', () => {
            this.clients.delete(client);
            logger.info({ clientId: client.id, total: this.clients.size }, 'SSE client disconnected');
        });
    }

    /**
     * Broadcast an event to all connected clients.
     * H-1 fix: data is passed directly — callers should avoid sensitive fields.
     * @param {string} event - Event name (e.g. 'puzzle.created')
     * @param {object} data - Event data (keep minimal — no wallet IDs, balances, etc.)
     */
    broadcast(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        let sent = 0;
        for (const client of this.clients) {
            try {
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
