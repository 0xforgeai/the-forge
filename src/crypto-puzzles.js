/**
 * Computational Puzzle Engine
 *
 * Generates and verifies 4 types of cryptographic challenges:
 * - HASH_PREFIX:    Find input whose SHA-256 starts with a target prefix
 * - ITERATED_HASH:  Compute SHA-256 iterated N times on a seed
 * - PROOF_OF_WORK:  Find nonce where SHA-256(challenge + nonce) < target
 * - FACTORING:      Factor a semiprime (product of two primes)
 *
 * Design principle: HARD to solve, INSTANT to verify.
 */

import crypto from 'crypto';

// ─── HASH PREFIX ────────────────────────────────────────────
// "Find any string X such that SHA-256(X) starts with this prefix"
// Difficulty: each hex char doubles the search space (16x)

function generateHashPrefix(tier) {
    // Tier 1: 4 hex chars (~65K attempts)
    // Tier 2: 5 hex chars (~1M attempts)
    // Tier 3: 6 hex chars (~16M attempts)
    // Tier 4: 7 hex chars (~268M attempts)
    // Tier 5: 8 hex chars (~4B attempts)
    const prefixLen = tier + 3;
    const prefix = crypto.randomBytes(4).toString('hex').slice(0, prefixLen);

    return {
        puzzleType: 'HASH_PREFIX',
        challenge: {
            algorithm: 'sha256',
            prefix,
            prefixLength: prefixLen,
        },
        prompt: `Find any string whose SHA-256 hash starts with "${prefix}". Submit the input string (not the hash).`,
        title: `Hash Prefix: ${prefix}...`,
        // The "answer" is any valid preimage — no single answer to store
        answerHash: prefix, // We store the prefix as the verification target
    };
}

function verifyHashPrefix(answer, challengeData) {
    const hash = crypto.createHash('sha256').update(answer).digest('hex');
    return hash.startsWith(challengeData.prefix);
}

// ─── ITERATED HASH ──────────────────────────────────────────
// "Compute SHA-256 applied N times to this seed"
// Pure computation — no shortcut, must iterate

function generateIteratedHash(tier) {
    // Tier 1: 100K iterations
    // Tier 2: 500K iterations
    // Tier 3: 2M iterations
    // Tier 4: 5M iterations
    // Tier 5: 10M iterations
    const iterations = [100_000, 500_000, 2_000_000, 5_000_000, 10_000_000][tier - 1];
    const seed = crypto.randomBytes(32).toString('hex');

    // Pre-compute the answer
    let current = seed;
    for (let i = 0; i < iterations; i++) {
        current = crypto.createHash('sha256').update(current).digest('hex');
    }
    const answer = current;

    return {
        puzzleType: 'ITERATED_HASH',
        challenge: {
            algorithm: 'sha256',
            seed,
            iterations,
        },
        prompt: `Compute SHA-256 applied ${iterations.toLocaleString()} times to the seed "${seed}". Submit the final hex hash.`,
        title: `Hash Chain: ${iterations.toLocaleString()} iterations`,
        answerHash: answer,
    };
}

function verifyIteratedHash(answer, challengeData, storedAnswerHash) {
    // M-4 fix: use storedAnswerHash (the pre-computed answer) instead of
    // non-existent challengeData._computedAnswer. This function is now
    // only called from verifyCryptoPuzzle which passes storedAnswerHash.
    return answer.toLowerCase().trim() === (storedAnswerHash || '').toLowerCase();
}

// ─── PROOF OF WORK ──────────────────────────────────────────
// "Find a nonce where SHA-256(challenge + nonce) has N leading zero bits"
// Like Bitcoin mining, but smaller scale

function generateProofOfWork(tier) {
    // Tier 1: 16 leading zero bits (~65K attempts)
    // Tier 2: 20 leading zero bits (~1M attempts)
    // Tier 3: 24 leading zero bits (~16M attempts)
    // Tier 4: 28 leading zero bits (~268M attempts)
    // Tier 5: 32 leading zero bits (~4B attempts)
    const zeroBits = [16, 20, 24, 28, 32][tier - 1];
    const challenge = crypto.randomBytes(32).toString('hex');

    // Compute the target: a hash with zeroBits leading zeros
    const targetBytes = Math.ceil(zeroBits / 8);
    const target = '0'.repeat(Math.floor(zeroBits / 4));

    return {
        puzzleType: 'PROOF_OF_WORK',
        challenge: {
            algorithm: 'sha256',
            challenge,
            zeroBits,
            target, // hex prefix of zeros needed
        },
        prompt: `Find a nonce (any string) where SHA-256("${challenge}" + nonce) starts with ${zeroBits / 4} zero hex characters ("${target}"). Submit the nonce.`,
        title: `Proof of Work: ${zeroBits}-bit difficulty`,
        answerHash: challenge, // Store challenge for verification
    };
}

function verifyProofOfWork(answer, challengeData) {
    const combined = challengeData.challenge + answer;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    return hash.startsWith(challengeData.target);
}

// ─── FACTORING ──────────────────────────────────────────────
// "Factor this semiprime N = p × q"

function generatePrime(bits) {
    // Generate a random prime of approximately `bits` bits
    // For small primes we can brute-force
    const min = 2 ** (bits - 1);
    const max = 2 ** bits;

    while (true) {
        const candidate = min + Math.floor(Math.random() * (max - min));
        if (isPrime(candidate)) return candidate;
    }
}

function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
}

function generateFactoring(tier) {
    // Tier 1: two ~16-bit primes → ~32-bit semiprime (trivial)
    // Tier 2: two ~20-bit primes → ~40-bit semiprime
    // Tier 3: two ~24-bit primes → ~48-bit semiprime
    // Tier 4: two ~26-bit primes → ~52-bit semiprime (approaching JS int limit)
    // Tier 5: two ~26-bit primes → different pair, still within safe integers
    const bits = [16, 20, 24, 26, 26][tier - 1];

    const p = generatePrime(bits);
    const q = generatePrime(bits);
    // Ensure p !== q
    if (p === q) return generateFactoring(tier);
    const n = p * q;

    // Ensure we're within safe integer range
    if (n > Number.MAX_SAFE_INTEGER) return generateFactoring(tier);

    const factors = [Math.min(p, q), Math.max(p, q)];

    return {
        puzzleType: 'FACTORING',
        challenge: {
            semiprime: n,
            factorBits: bits,
        },
        prompt: `Factor this semiprime: ${n}. Submit the two prime factors separated by a comma (smaller first). Example: "p,q"`,
        title: `Factor: ${n}`,
        answerHash: `${factors[0]},${factors[1]}`,
    };
}

function verifyFactoring(answer, challengeData) {
    // Parse p,q from answer
    const parts = answer.replace(/\s/g, '').split(',').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return false;
    const [a, b] = parts.sort((x, y) => x - y);
    return a * b === challengeData.semiprime && isPrime(a) && isPrime(b);
}

// ─── PUBLIC API ─────────────────────────────────────────────

const GENERATORS = {
    HASH_PREFIX: generateHashPrefix,
    ITERATED_HASH: generateIteratedHash,
    PROOF_OF_WORK: generateProofOfWork,
    FACTORING: generateFactoring,
};

const VERIFIERS = {
    HASH_PREFIX: verifyHashPrefix,
    ITERATED_HASH: verifyIteratedHash,
    PROOF_OF_WORK: verifyProofOfWork,
    FACTORING: verifyFactoring,
};

/**
 * Generate a computational puzzle.
 * @param {'HASH_PREFIX'|'ITERATED_HASH'|'PROOF_OF_WORK'|'FACTORING'} puzzleType
 * @param {number} tier - Difficulty tier 1-5
 * @returns {{ puzzleType, challenge, prompt, title, answerHash }}
 */
export function generatePuzzle(puzzleType, tier) {
    const gen = GENERATORS[puzzleType];
    if (!gen) throw new Error(`Unknown puzzle type: ${puzzleType}`);
    return gen(tier);
}

/**
 * Verify a submitted answer against a computational puzzle.
 * @param {string} answer - The submitted answer
 * @param {string} puzzleType - HASH_PREFIX, ITERATED_HASH, PROOF_OF_WORK, FACTORING
 * @param {object} challengeData - The puzzle's challenge parameters
 * @param {string} storedAnswerHash - The stored answer/hash for direct comparison puzzles
 * @returns {boolean}
 */
export function verifyCryptoPuzzle(answer, puzzleType, challengeData, storedAnswerHash) {
    // For ITERATED_HASH and FACTORING, we compare against pre-computed answer
    if (puzzleType === 'ITERATED_HASH') {
        return answer.toLowerCase().trim() === storedAnswerHash.toLowerCase();
    }
    if (puzzleType === 'FACTORING') {
        return verifyFactoring(answer, challengeData);
    }
    // For HASH_PREFIX and PROOF_OF_WORK, we verify cryptographically
    const verifier = VERIFIERS[puzzleType];
    if (!verifier) throw new Error(`Unknown puzzle type: ${puzzleType}`);
    return verifier(answer, challengeData);
}

/** Check if a puzzle type is computational (vs. custom/trivia) */
export function isComputational(puzzleType) {
    return puzzleType !== 'CUSTOM';
}

export const PUZZLE_TYPES = Object.keys(GENERATORS);
