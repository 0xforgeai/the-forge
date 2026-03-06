import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import config from './config.js';
import logger from './logger.js';
import prisma from './db.js';
import sse from './sse.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { startJobs } from './jobs/expiry.js';
import { startBoutScheduler } from './jobs/bout-scheduler.js';

// Route handlers
import walletRouter from './routes/wallet.js';
import puzzleRouter from './routes/puzzles.js';
import leaderboardRouter from './routes/leaderboard.js';
import transferRouter from './routes/transfer.js';
import adminRouter from './routes/admin.js';
import boutRouter from './routes/bouts.js';
import vaultRouter from './routes/vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ─── Global Middleware ─────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static landing page
app.use(express.static(join(__dirname, '..', 'public')));

// Simple request logger (replaces pino-http which was causing hangs)
app.use((req, res, next) => {
    const start = Date.now();
    const skip = req.url === '/api/health' || req.url === '/api/events';
    res.on('finish', () => {
        if (!skip) {
            logger.info({ method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - start }, 'request');
        }
    });
    next();
});

// Rate limiting: 60 requests per minute per IP
app.use(
    '/api',
    rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests. Slow down.' },
    })
);

// ─── Public Routes ─────────────────────────────────────────

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
    } catch (err) {
        res.status(503).json({ status: 'error', error: 'Database unreachable' });
    }
});

// Game stats (public)
app.get('/api/stats', async (req, res) => {
    const [totalPuzzles, statusCounts, totalWallets, totalSolved] = await Promise.all([
        prisma.puzzle.count(),
        prisma.puzzle.groupBy({ by: ['status'], _count: true }),
        prisma.wallet.count(),
        prisma.puzzle.count({ where: { status: 'SOLVED' } }),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count]));

    res.json({
        totalPuzzles,
        totalSolved,
        totalAgents: totalWallets,
        activePuzzles: (byStatus.OPEN || 0) + (byStatus.PICKED || 0),
        solveRate: totalPuzzles > 0 ? Math.round((totalSolved / totalPuzzles) * 100) : 0,
        byStatus,
    });
});

// SSE event stream (public)
app.get('/api/events', (req, res) => {
    sse.addClient(req, res);
});

// ─── Route Modules ─────────────────────────────────────────

// Wallet: /api/register (public), /api/balance (auth), /api/profile/:name (public)
app.use('/api', walletRouter);

// Puzzles: /api/puzzles/* — auth handled per-route inside the router
app.use('/api/puzzles', puzzleRouter);

// Leaderboard: /api/leaderboard (public)
app.use('/api/leaderboard', leaderboardRouter);

// Transfer: /api/transfer (auth handled inside router)
app.use('/api/transfer', transferRouter);

// Admin: /api/admin/* (basic auth handled inside router)
app.use('/api/admin', adminRouter);

// Bouts: /api/bouts/* — scheduled arena events with betting
app.use('/api/bouts', boutRouter);

// Vault: /api/vault/* — Arena Vault staking
app.use('/api/vault', vaultRouter);

// ─── Error Handling ────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start ─────────────────────────────────────────────────

async function start() {
    try {
        await prisma.$connect();
        logger.info('Connected to database');

        startJobs();
        startBoutScheduler();

        app.listen(config.port, () => {
            logger.info({ port: config.port, env: config.nodeEnv }, '🔥 The Forge is live');
        });
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

start();

export default app;
