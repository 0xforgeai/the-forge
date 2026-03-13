import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import {
    FORGE_TOKEN_ADDRESS, FORGE_TOKEN_ABI,
    ARENA_VAULT_ADDRESS, ARENA_VAULT_ABI,
    FORGE_ARENA_ADDRESS, FORGE_ARENA_ABI,
    COVENANT_NAMES, BOUT_STATUS_NAMES,
} from '../config/contracts';

// ─── ForgeToken Reads ──────────────────────────────────────

export function useForgeBalance(address) {
    const { data, ...rest } = useReadContract({
        address: FORGE_TOKEN_ADDRESS,
        abi: FORGE_TOKEN_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 15_000 },
    });
    return { balance: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function useForgeTotalSupply() {
    const { data, ...rest } = useReadContract({
        address: FORGE_TOKEN_ADDRESS,
        abi: FORGE_TOKEN_ABI,
        functionName: 'totalSupply',
        query: { refetchInterval: 60_000 },
    });
    return { totalSupply: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function useForgeAllowance(owner, spender) {
    const { data, ...rest } = useReadContract({
        address: FORGE_TOKEN_ADDRESS,
        abi: FORGE_TOKEN_ABI,
        functionName: 'allowance',
        args: owner && spender ? [owner, spender] : undefined,
        query: { enabled: !!(owner && spender), refetchInterval: 10_000 },
    });
    return { allowance: data, ...rest };
}

// ─── ArenaVault Reads ──────────────────────────────────────

export function useVaultPosition(address) {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'getPosition',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 15_000 },
    });

    const position = data ? {
        active: data.active,
        covenant: COVENANT_NAMES[data.covenant] || 'UNKNOWN',
        covenantId: Number(data.covenant),
        amount: formatEther(data.amount),
        amountRaw: data.amount,
        stakedAt: Number(data.stakedAt),
        lockExpires: Number(data.lockExpires),
        loyaltyMultiplier: Number(data.loyaltyMultiplier) / 100,
        totalClaimed: formatEther(data.totalClaimed),
        totalTaxPaid: formatEther(data.totalTaxPaid),
    } : null;

    return { position, raw: data, ...rest };
}

export function useClaimable(address) {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'getClaimable',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 15_000 },
    });
    return { claimable: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function usePendingYield(address) {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'getPendingYield',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 15_000 },
    });
    return { pending: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function useLoyaltyMultiplier(address) {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'getLoyaltyMultiplier',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 30_000 },
    });
    return { multiplier: data ? Number(data) / 100 : 1, ...rest };
}

export function useVaultTotalStaked() {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'totalStaked',
        query: { refetchInterval: 30_000 },
    });
    return { totalStaked: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function useVaultStakerCount() {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'activeStakerCount',
        query: { refetchInterval: 30_000 },
    });
    return { count: data ? Number(data) : 0, ...rest };
}

export function useVaultTotalBurned() {
    const { data, ...rest } = useReadContract({
        address: ARENA_VAULT_ADDRESS,
        abi: ARENA_VAULT_ABI,
        functionName: 'totalBurned',
        query: { refetchInterval: 30_000 },
    });
    return { totalBurned: data, formatted: data ? formatEther(data) : '0', ...rest };
}

// ─── ForgeArena Reads ──────────────────────────────────────

export function useArenaBout(boutId) {
    const { data, ...rest } = useReadContract({
        address: FORGE_ARENA_ADDRESS,
        abi: FORGE_ARENA_ABI,
        functionName: 'getBout',
        args: boutId ? [boutId] : undefined,
        query: { enabled: !!boutId, refetchInterval: 15_000 },
    });

    const bout = data ? {
        id: data.id,
        status: BOUT_STATUS_NAMES[data.status] || 'UNKNOWN',
        statusId: Number(data.status),
        entryFee: formatEther(data.config.entryFee),
        entryBurnBps: Number(data.config.entryBurnBps),
        betBurnBps: Number(data.config.betBurnBps),
        maxEntrants: Number(data.config.maxEntrants),
        totalEntryPool: formatEther(data.totalEntryPool),
        totalBetPool: formatEther(data.totalBetPool),
        totalBurned: formatEther(data.totalBurned),
        entrantCount: Number(data.entrantCount),
        resolved: data.resolved,
    } : null;

    return { bout, raw: data, ...rest };
}

export function useArenaEntrants(boutId) {
    const { data, ...rest } = useReadContract({
        address: FORGE_ARENA_ADDRESS,
        abi: FORGE_ARENA_ABI,
        functionName: 'getEntrants',
        args: boutId ? [boutId] : undefined,
        query: { enabled: !!boutId, refetchInterval: 15_000 },
    });
    return { entrants: data || [], ...rest };
}

export function useArenaBets(boutId) {
    const { data, ...rest } = useReadContract({
        address: FORGE_ARENA_ADDRESS,
        abi: FORGE_ARENA_ABI,
        functionName: 'getBets',
        args: boutId ? [boutId] : undefined,
        query: { enabled: !!boutId, refetchInterval: 15_000 },
    });
    return { bets: data || [], ...rest };
}

export function useArenaTotalBurned() {
    const { data, ...rest } = useReadContract({
        address: FORGE_ARENA_ADDRESS,
        abi: FORGE_ARENA_ABI,
        functionName: 'totalBurned',
        query: { refetchInterval: 30_000 },
    });
    return { totalBurned: data, formatted: data ? formatEther(data) : '0', ...rest };
}

export function useArenaTotalBouts() {
    const { data, ...rest } = useReadContract({
        address: FORGE_ARENA_ADDRESS,
        abi: FORGE_ARENA_ABI,
        functionName: 'totalBoutsCreated',
        query: { refetchInterval: 30_000 },
    });
    return { totalBouts: data ? Number(data) : 0, ...rest };
}

// ─── Write Hooks ───────────────────────────────────────────

export function useApproveForge(spender = ARENA_VAULT_ADDRESS) {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const approve = (amount) => {
        writeContract({
            address: FORGE_TOKEN_ADDRESS,
            abi: FORGE_TOKEN_ABI,
            functionName: 'approve',
            args: [spender, parseEther(amount)],
        });
    };

    return { approve, hash, isPending, isConfirming, isSuccess, error };
}

export function useStakeForge() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const stake = (amount, covenantId) => {
        writeContract({
            address: ARENA_VAULT_ADDRESS,
            abi: ARENA_VAULT_ABI,
            functionName: 'stake',
            args: [parseEther(amount), covenantId],
        });
    };

    return { stake, hash, isPending, isConfirming, isSuccess, error };
}

export function useUnstakeForge() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const unstake = () => {
        writeContract({
            address: ARENA_VAULT_ADDRESS,
            abi: ARENA_VAULT_ABI,
            functionName: 'unstake',
        });
    };

    return { unstake, hash, isPending, isConfirming, isSuccess, error };
}

export function useClaimYield() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const claim = () => {
        writeContract({
            address: ARENA_VAULT_ADDRESS,
            abi: ARENA_VAULT_ABI,
            functionName: 'claimYield',
        });
    };

    return { claim, hash, isPending, isConfirming, isSuccess, error };
}

// ─── ForgeArena Write Hooks ────────────────────────────────

export function useEnterBout() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const enter = (boutId) => {
        writeContract({
            address: FORGE_ARENA_ADDRESS,
            abi: FORGE_ARENA_ABI,
            functionName: 'enterBout',
            args: [boutId],
        });
    };

    return { enter, hash, isPending, isConfirming, isSuccess, error };
}

export function usePlaceBet() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const bet = (boutId, entrantIdx, amount) => {
        writeContract({
            address: FORGE_ARENA_ADDRESS,
            abi: FORGE_ARENA_ABI,
            functionName: 'placeBet',
            args: [boutId, entrantIdx, parseEther(amount)],
        });
    };

    return { bet, hash, isPending, isConfirming, isSuccess, error };
}

export function useClaimBoutPayout() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const claimPayout = (boutId) => {
        writeContract({
            address: FORGE_ARENA_ADDRESS,
            abi: FORGE_ARENA_ABI,
            functionName: 'claimPayout',
            args: [boutId],
        });
    };

    return { claimPayout, hash, isPending, isConfirming, isSuccess, error };
}

export function useClaimBetPayout() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const claimBetPayout = (boutId) => {
        writeContract({
            address: FORGE_ARENA_ADDRESS,
            abi: FORGE_ARENA_ABI,
            functionName: 'claimBetPayout',
            args: [boutId],
        });
    };

    return { claimBetPayout, hash, isPending, isConfirming, isSuccess, error };
}
