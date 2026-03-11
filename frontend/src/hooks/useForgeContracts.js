import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import {
    FORGE_TOKEN_ADDRESS, FORGE_TOKEN_ABI,
    ARENA_VAULT_ADDRESS, ARENA_VAULT_ABI,
    COVENANT_NAMES,
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

// ─── Write Hooks ───────────────────────────────────────────

export function useApproveForge() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const approve = (amount) => {
        writeContract({
            address: FORGE_TOKEN_ADDRESS,
            abi: FORGE_TOKEN_ABI,
            functionName: 'approve',
            args: [ARENA_VAULT_ADDRESS, parseEther(amount)],
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
