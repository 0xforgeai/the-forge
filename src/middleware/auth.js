import prisma from '../db.js';
import logger from '../logger.js';

/**
 * API-key authentication middleware.
 * Looks for `x-api-key` header or `apiKey` query param.
 * Attaches `req.wallet` on success.
 */
export async function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key. Include x-api-key header.' });
    }

    try {
        const wallet = await prisma.wallet.findUnique({ where: { apiKey } });
        if (!wallet) {
            return res.status(401).json({ error: 'Invalid API key.' });
        }
        req.wallet = wallet;
        next();
    } catch (err) {
        logger.error({ err }, 'Auth middleware error');
        return res.status(500).json({ error: 'Authentication failed.' });
    }
}

/**
 * Basic auth middleware for admin routes.
 */
export function adminAuth(adminUser, adminPass) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Forge Admin"');
            return res.status(401).json({ error: 'Admin authentication required.' });
        }

        const base64 = authHeader.slice(6);
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [user, pass] = decoded.split(':');

        if (user === adminUser && pass === adminPass) {
            return next();
        }

        res.setHeader('WWW-Authenticate', 'Basic realm="Forge Admin"');
        return res.status(401).json({ error: 'Invalid admin credentials.' });
    };
}
