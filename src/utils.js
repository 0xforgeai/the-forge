import crypto from 'crypto';
import config from './config.js';

/**
 * Canonicalize an answer based on its type.
 */
export function canonicalize(answer, answerType) {
    const trimmed = String(answer).trim();
    switch (answerType) {
        case 'NUMBER':
            return parseFloat(trimmed).toFixed(8);
        case 'CHOICE':
            return trimmed.toUpperCase();
        case 'STRING':
        default:
            return trimmed.toLowerCase();
    }
}

/**
 * HMAC-SHA256 hash of a canonicalized answer using the server secret.
 */
export function hashAnswer(answer, answerType) {
    const canonical = canonicalize(answer, answerType);
    return crypto
        .createHmac('sha256', config.hmacSecret)
        .update(canonical)
        .digest('hex');
}

/**
 * Verify a submitted answer against a stored hash.
 */
export function verifyAnswer(submittedAnswer, answerType, storedHash) {
    const hash = hashAnswer(submittedAnswer, answerType);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

/**
 * Generate a random API key.
 */
export function generateApiKey() {
    return `forge_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Validate tier config.
 */
export function validateTier(tier, stake, timeWindowSeconds) {
    const tierConfig = config.game.tiers[tier];
    if (!tierConfig) return { valid: false, error: `Invalid tier: ${tier}. Must be 1-5.` };
    if (stake < tierConfig.minStake)
        return { valid: false, error: `Tier ${tier} requires minimum stake of ${tierConfig.minStake}. Got ${stake}.` };
    if (timeWindowSeconds < tierConfig.minTime || timeWindowSeconds > tierConfig.maxTime)
        return {
            valid: false,
            error: `Tier ${tier} time window must be ${tierConfig.minTime}-${tierConfig.maxTime}s. Got ${timeWindowSeconds}s.`,
        };
    return { valid: true };
}
