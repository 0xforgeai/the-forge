// ─── Contract Addresses (Base Mainnet — V3) ────────────────
export const FORGE_TOKEN_ADDRESS = '0xf6c2965295ce2178f64832163a9a97ccf61a3aee';
export const ARENA_VAULT_ADDRESS = '0x77917FD54484552F7d2c8bace5270C40c3fc1380';
export const FORGE_ARENA_ADDRESS = '0x22FFDf9E88cEFE2781b9Ebe17eabd4388Ab6cff4';

// ─── ForgeToken ABI (minimal) ──────────────────────────────
export const FORGE_TOKEN_ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'totalSupply',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
    {
        name: 'burn',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'amount', type: 'uint256' }],
        outputs: [],
    },
];

// ─── ArenaVault ABI (minimal) ──────────────────────────────
export const ARENA_VAULT_ABI = [
    // Read functions
    {
        name: 'getPosition',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'amount', type: 'uint256' },
                    { name: 'unvestedRewards', type: 'uint256' },
                    { name: 'vestedRewards', type: 'uint256' },
                    { name: 'vestingStart', type: 'uint256' },
                    { name: 'totalEarned', type: 'uint256' },
                    { name: 'totalTaxPaid', type: 'uint256' },
                    { name: 'stakedAt', type: 'uint256' },
                    { name: 'lockExpiresAt', type: 'uint256' },
                    { name: 'lastYieldClaim', type: 'uint256' },
                    { name: 'rewardDebt', type: 'uint256' },
                    { name: 'covenant', type: 'uint8' },
                    { name: 'active', type: 'bool' },
                ],
            },
        ],
    },
    {
        name: 'getClaimable',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'getPendingYield',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'getLoyaltyMultiplier',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'totalStaked',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'activeStakerCount',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'rewardPerTokenStored',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'totalBurned',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    // Write functions
    {
        name: 'stake',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'amount', type: 'uint256' },
            { name: 'covenant', type: 'uint8' },
        ],
        outputs: [],
    },
    {
        name: 'unstake',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
    },
    {
        name: 'claimYield',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
    },
];

// ─── ForgeArena ABI (minimal) ──────────────────────────────
export const FORGE_ARENA_ABI = [
    // Read functions
    {
        name: 'getBout',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'id', type: 'bytes32' },
                    { name: 'status', type: 'uint8' },
                    {
                        name: 'config',
                        type: 'tuple',
                        components: [
                            { name: 'entryFee', type: 'uint256' },
                            { name: 'entryBurnBps', type: 'uint16' },
                            { name: 'betBurnBps', type: 'uint16' },
                            { name: 'protocolRakeBps', type: 'uint16' },
                            { name: 'agentPurseBps', type: 'uint16' },
                            { name: 'bettorPoolBps', type: 'uint16' },
                            { name: 'maxEntrants', type: 'uint8' },
                        ],
                    },
                    { name: 'totalEntryPool', type: 'uint256' },
                    { name: 'totalBetPool', type: 'uint256' },
                    { name: 'totalBurned', type: 'uint256' },
                    { name: 'entrantCount', type: 'uint8' },
                    { name: 'resolved', type: 'bool' },
                ],
            },
        ],
    },
    {
        name: 'getEntrants',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [
            {
                name: '',
                type: 'tuple[]',
                components: [
                    { name: 'wallet', type: 'address' },
                    { name: 'feePaid', type: 'uint256' },
                    { name: 'placement', type: 'uint8' },
                    { name: 'payout', type: 'uint256' },
                    { name: 'claimed', type: 'bool' },
                ],
            },
        ],
    },
    {
        name: 'getBets',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [
            {
                name: '',
                type: 'tuple[]',
                components: [
                    { name: 'bettor', type: 'address' },
                    { name: 'entrantIdx', type: 'uint8' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'payout', type: 'uint256' },
                    { name: 'claimed', type: 'bool' },
                ],
            },
        ],
    },
    {
        name: 'totalBoutsCreated',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'totalBurned',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'totalRakeToVault',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    // Write functions
    {
        name: 'enterBout',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [],
    },
    {
        name: 'placeBet',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'boutId', type: 'bytes32' },
            { name: 'entrantIdx', type: 'uint8' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
    {
        name: 'claimPayout',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [],
    },
    {
        name: 'claimBetPayout',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'boutId', type: 'bytes32' }],
        outputs: [],
    },
];

// Covenant enum mapping
export const COVENANTS = {
    FLAME: 0,
    STEEL: 1,
    OBSIDIAN: 2,
    ETERNAL: 3,
};

export const COVENANT_NAMES = ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'];

// BoutStatus enum mapping
export const BOUT_STATUS = {
    NONE: 0,
    OPEN: 1,
    LIVE: 2,
    RESOLVED: 3,
    CANCELLED: 4,
};

export const BOUT_STATUS_NAMES = ['NONE', 'OPEN', 'LIVE', 'RESOLVED', 'CANCELLED'];
