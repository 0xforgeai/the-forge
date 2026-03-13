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
import { startBootstrapJob } from './jobs/bootstrap.js';
import { startSupplyInvariantJob } from './jobs/supply-invariant.js';
import { startBondYieldJob } from './jobs/bond-yield.js';
import { startSettlementJob } from './jobs/settlement.js';
import { chainReady } from './chain.js';

// Route handlers
import walletRouter from './routes/wallet.js';
import puzzleRouter from './routes/puzzles.js';
import leaderboardRouter from './routes/leaderboard.js';
import transferRouter from './routes/transfer.js';
import adminRouter from './routes/admin.js';
import boutRouter from './routes/bouts.js';
import vaultRouter from './routes/vault.js';
import bondRouter from './routes/bonds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── BigInt JSON serialization (Prisma returns BigInt for Int8 columns) ─────
// Without this, JSON.stringify crashes on any response containing balance/amount/gas
BigInt.prototype.toJSON = function () {
    return Number(this);
};

const app = express();

// Trust Railway's reverse proxy (required for express-rate-limit behind proxy)
app.set('trust proxy', 1);

// ─── Global Middleware ─────────────────────────────────────

// M-1 fix: enable CSP with sensible defaults + Privy/wallet connect domains
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://auth.privy.io", "https://*.walletconnect.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", "https://auth.privy.io", "https://*.privy.io", "https://*.alchemy.com", "https://*.walletconnect.com", "wss://*.walletconnect.com", "https://rpc.walletconnect.com"],
            frameSrc: ["'self'", "https://auth.privy.io", "https://*.walletconnect.com"],
        },
    },
}));

// M-2 fix: restrict CORS to known origins (configure via env in production)
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
    origin: config.nodeEnv === 'production' ? allowedOrigins : true,
    credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Serve static landing page
app.use(express.static(join(__dirname, '..', 'public')));

// Simple request logger — H-2 fix: strip query params to avoid logging API keys
app.use((req, res, next) => {
    const start = Date.now();
    const skip = req.url === '/api/health' || req.url === '/api/events';
    res.on('finish', () => {
        if (!skip) {
            const cleanUrl = req.url.split('?')[0]; // strip query params
            logger.info({ method: req.method, url: cleanUrl, status: res.statusCode, ms: Date.now() - start }, 'request');
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

// H-9 fix: strict rate limit on registration — 3 per hour per IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many registrations. Try again in an hour.' },
});

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

// SSE event stream — H-1: still public but data is reduced in sse.js
app.get('/api/events', (req, res) => {
    sse.addClient(req, res);
});

// ─── Route Modules ─────────────────────────────────────────

// Wallet: /api/register (public + rate limited), /api/balance (auth), /api/profile/:name (public)
// H-9: apply strict register rate limiter
app.use('/api/register', registerLimiter);
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

// Bonds: /api/bonds/* — Victory OTC bond marketplace
app.use('/api/bonds', bondRouter);

// ─── Frontend SPA (serve built React app) ─────────────────
import { existsSync } from 'fs';

const frontendDist = join(__dirname, '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback: serve index.html for non-API routes (React Router handles routing)
    // Express 5 requires named wildcards: /{*splat} instead of *
    app.get('/{*splat}', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(join(frontendDist, 'index.html'));
    });
}

// ─── Error Handling ────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start ─────────────────────────────────────────────────

let server;

async function start() {
    try {
        await prisma.$connect();
        logger.info('Connected to database');

        startJobs();
        startBoutScheduler();
        startBootstrapJob();
        startSupplyInvariantJob();
        startBondYieldJob();
        startSettlementJob();

        server = app.listen(config.port, () => {
            logger.info({ port: config.port, env: config.nodeEnv, chainRelay: chainReady }, 'The Forge is live');
        });
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

// M-13 fix: graceful shutdown handler
async function shutdown(signal) {
    logger.info({ signal }, 'Received shutdown signal, closing gracefully...');

    // Close SSE connections
    sse.closeAll();

    // Close HTTP server (stops accepting new connections)
    if (server) {
        server.close(() => {
            logger.info('HTTP server closed');
        });
    }

    // Disconnect Prisma
    try {
        await prisma.$disconnect();
        logger.info('Database disconnected');
    } catch (err) {
        logger.error({ err }, 'Error disconnecting database');
    }

    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export default app;
