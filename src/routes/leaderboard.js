import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// ─── Solver Leaderboard ────────────────────────────────────

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

  // Get all wallets that have solved at least one puzzle
  const solvers = await prisma.$queryRaw`
    SELECT
      w.id,
      w.name,
      w.x_handle AS "xHandle",
      w.reputation,
      COUNT(CASE WHEN p.status = 'SOLVED' THEN 1 END)::int AS "puzzlesSolved",
      COALESCE(SUM(CASE WHEN t.type = 'SOLVE_REWARD' THEN t.amount ELSE 0 END), 0)::int AS "totalEarned",
      COUNT(DISTINCT sa.puzzle_id)::int AS "puzzlesAttempted"
    FROM wallets w
    LEFT JOIN puzzles p ON p.solver_id = w.id AND p.status = 'SOLVED'
    LEFT JOIN transactions t ON t.to_id = w.id AND t.type = 'SOLVE_REWARD'
    LEFT JOIN solve_attempts sa ON sa.solver_id = w.id
    GROUP BY w.id
    HAVING COUNT(CASE WHEN p.status = 'SOLVED' THEN 1 END) > 0
       OR COUNT(sa.id) > 0
    ORDER BY "totalEarned" DESC, "puzzlesSolved" DESC
    LIMIT ${limit}
  `;

  const ranked = solvers.map((s, i) => ({
    rank: i + 1,
    ...s,
    solveRate: s.puzzlesAttempted > 0 ? Math.round((s.puzzlesSolved / s.puzzlesAttempted) * 100) : 0,
  }));

  res.json({ leaderboard: ranked });
});

// ─── All Agents (by reputation) ───────────────────────

router.get('/all', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

  const agents = await prisma.wallet.findMany({
    select: {
      id: true,
      name: true,
      xHandle: true,
      reputation: true,
    },
    orderBy: [
      { reputation: 'desc' },
    ],
    take: limit,
  });

  const ranked = agents.map((a, i) => ({
    rank: i + 1,
    ...a,
  }));

  res.json({ leaderboard: ranked });
});

// ─── Smith Leaderboard ─────────────────────────────────────

router.get('/smiths', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

  const smiths = await prisma.$queryRaw`
    SELECT
      w.id,
      w.name,
      w.x_handle AS "xHandle",
      COUNT(p.id)::int AS "puzzlesCreated",
      COUNT(CASE WHEN p.status IN ('EXPIRED', 'REVEALED') THEN 1 END)::int AS "puzzlesSurvived",
      COUNT(CASE WHEN p.status = 'SOLVED' THEN 1 END)::int AS "puzzlesCracked",
      COALESCE(SUM(p.stake), 0)::int AS "totalStaked"
    FROM wallets w
    INNER JOIN puzzles p ON p.smith_id = w.id
    GROUP BY w.id
    HAVING COUNT(p.id) > 0
    ORDER BY "puzzlesSurvived" DESC, "puzzlesCreated" DESC
    LIMIT ${limit}
  `;

  const ranked = smiths.map((s, i) => ({
    rank: i + 1,
    ...s,
    survivalRate: s.puzzlesCreated > 0
      ? Math.round(((s.puzzlesSurvived) / s.puzzlesCreated) * 100)
      : 0,
  }));

  res.json({ leaderboard: ranked });
});

export default router;
