import logger from './logger.js';

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
     */
    addClient(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
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
     * @param {string} event - Event name (e.g. 'puzzle.created')
     * @param {object} data - Event data
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
}

// Singleton
const sse = new SSEManager();
export default sse;
