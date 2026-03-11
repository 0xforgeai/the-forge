// ─── Contract Addresses (Base Mainnet) ─────────────────────
export const FORGE_TOKEN_ADDRESS = '0xd6B46AC3A4aa34689c9a7dA211527c43e27b2551';
export const ARENA_VAULT_ADDRESS = '0x2c155449c1804Ca4a4D522eB6678a16c72B8e6Ff';

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
                    { name: 'active', type: 'bool' },
                    { name: 'covenant', type: 'uint8' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'stakedAt', type: 'uint256' },
                    { name: 'lockExpires', type: 'uint256' },
                    { name: 'loyaltyMultiplier', type: 'uint256' },
                    { name: 'rewardDebt', type: 'uint256' },
                    { name: 'unvestedRewards', type: 'uint256' },
                    { name: 'vestedRewards', type: 'uint256' },
                    { name: 'vestingStart', type: 'uint256' },
                    { name: 'totalClaimed', type: 'uint256' },
                    { name: 'totalTaxPaid', type: 'uint256' },
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

// Covenant enum mapping
export const COVENANTS = {
    FLAME: 0,
    STEEL: 1,
    OBSIDIAN: 2,
    ETERNAL: 3,
};

export const COVENANT_NAMES = ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'];
