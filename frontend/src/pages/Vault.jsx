import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSwitchChain, useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { useToast } from '../components/Toast';
import { apiFetch } from '../hooks/useApi';
import StatsBar from '../components/StatsBar';
import {
    useForgeBalance, useForgeAllowance,
    useVaultPosition, useClaimable, usePendingYield, useLoyaltyMultiplier,
    useApproveForge, useStakeForge, useUnstakeForge, useClaimYield,
    useVaultTotalStaked, useVaultStakerCount,
} from '../hooks/useForgeContracts';
import { ARENA_VAULT_ADDRESS, COVENANTS } from '../config/contracts';

export default function Vault() {
    const { authenticated, user } = usePrivy();
    const walletAddress = user?.wallet?.address;
    const { show: toast } = useToast();
    const { chainId } = useAccount();
    const { switchChain } = useSwitchChain();

    // API data
    const [vaultInfo, setVaultInfo] = useState(null);

    // On-chain reads
    const { formatted: balance } = useForgeBalance(walletAddress);
    const { allowance } = useForgeAllowance(walletAddress, ARENA_VAULT_ADDRESS);
    const { position } = useVaultPosition(walletAddress);
    const { formatted: claimable } = useClaimable(walletAddress);
    const { formatted: pending } = usePendingYield(walletAddress);
    const { multiplier: loyaltyMultiplier } = useLoyaltyMultiplier(walletAddress);
    const { formatted: totalStakedOnChain } = useVaultTotalStaked();
    const { count: stakerCount } = useVaultStakerCount();

    // Write hooks
    const { approve, isPending: approving, isSuccess: approved, error: approveError } = useApproveForge();
    const { stake, isPending: staking, isConfirming: stakingConfirming, isSuccess: staked, error: stakeError } = useStakeForge();
    const { unstake, isPending: unstaking, isConfirming: unstakeConfirming, isSuccess: unstaked, error: unstakeError } = useUnstakeForge();
    const { claim, isPending: claiming, isConfirming: claimConfirming, isSuccess: claimed, error: claimError } = useClaimYield();

    // Stake form
    const [amount, setAmount] = useState('');
    const [covenant, setCovenant] = useState(COVENANTS.FLAME);

    useEffect(() => {
        loadVault();
        const id = setInterval(loadVault, 15000);
        return () => clearInterval(id);
    }, []);

    // Surface contract errors as toasts
    useEffect(() => { if (approveError) toast(approveError.shortMessage || approveError.message, 'error'); }, [approveError]);
    useEffect(() => { if (stakeError) toast(stakeError.shortMessage || stakeError.message, 'error'); }, [stakeError]);
    useEffect(() => { if (unstakeError) toast(unstakeError.shortMessage || unstakeError.message, 'error'); }, [unstakeError]);
    useEffect(() => { if (claimError) toast(claimError.shortMessage || claimError.message, 'error'); }, [claimError]);

    async function loadVault() {
        try {
            const data = await apiFetch('/api/vault/info');
            setVaultInfo(data);
        } catch (e) { toast(e.message || 'Failed to load vault info', 'error'); }
    }

    async function ensureBase() {
        if (chainId !== base.id) {
            try {
                await switchChain({ chainId: base.id });
            } catch (e) {
                toast('Please switch your wallet to Base network', 'error');
                return false;
            }
        }
        return true;
    }

    async function handleStake() {
        if (!amount || Number(amount) <= 0) return;
        if (!(await ensureBase())) return;
        const needed = BigInt(Math.floor(Number(amount) * 1e18));
        if (!allowance || allowance < needed) {
            approve(amount);
        } else {
            stake(amount, covenant);
        }
    }

    // After approval, trigger stake
    useEffect(() => {
        if (approved && amount) {
            stake(amount, covenant);
        }
    }, [approved]);


    return (
        <>
            {/* Hero */}
            <section className="hero band" style={{ padding: '3rem 0 2rem' }}>
                <div className="container">
                    <h1 style={{ fontSize: '2rem' }}>COVENANT VAULT<span className="cursor"></span></h1>
                    <p className="sub" style={{ fontSize: '0.875rem' }}>Stake $FORGE. Choose your commitment. Earn from every trial the forge runs. The longer you stay, the more you take home.</p>
                </div>
            </section>

            {/* Vault Stats */}
            <StatsBar items={[
                { value: totalStakedOnChain !== '0' ? Number(totalStakedOnChain).toLocaleString(undefined, { maximumFractionDigits: 0 }) : (vaultInfo ? Number(vaultInfo.totalStaked).toLocaleString() : '—'), label: 'Total Staked' },
                { value: stakerCount > 0 ? stakerCount : (vaultInfo?.totalStakers ?? '—'), label: 'Stakers' },
                { value: vaultInfo ? `${vaultInfo.avgLoyaltyMultiplier}x` : '—', label: 'Avg Multiplier' },
                { value: vaultInfo ? Number(vaultInfo.totalBurned).toLocaleString() : '—', label: 'Total Burned' },
            ]} />

            {/* Your Position (On-Chain) */}
            {authenticated && walletAddress && (
                <section className="band">
                    <div className="container">
                        <div className="section-label">
                            <span className="label label-green">
                                <img src="/icons/wallet-03.svg" className="icon icon-sm" /> YOUR POSITION
                            </span>
                        </div>

                        {position?.active ? (
                            <div className="grid-2">
                                {/* Position Info */}
                                <div className="dash-card">
                                    <h3>Active Stake</h3>
                                    <div className="dash-stat"><span className="ds-key">Covenant</span><span className="ds-val orange">{position.covenant}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Staked</span><span className="ds-val green">{Number(position.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                    <div className="dash-stat"><span className="ds-key">Loyalty</span><span className="ds-val">{loyaltyMultiplier}x</span></div>
                                    <div className="dash-stat"><span className="ds-key">Lock Expires</span><span className="ds-val dim">{new Date(position.lockExpires * 1000).toLocaleDateString()}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Claimable Yield</span><span className="ds-val green">{Number(claimable).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                    <div className="dash-stat"><span className="ds-key">Pending Yield</span><span className="ds-val dim">{Number(pending).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                    <div className="dash-stat"><span className="ds-key">Total Earned</span><span className="ds-val">{Number(position.totalEarned).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                </div>

                                {/* Actions */}
                                <div className="dash-card">
                                    <h3>Actions</h3>
                                    <div className="action-group">
                                        <button
                                            className="btn btn-green btn-full"
                                            onClick={() => claim()}
                                            disabled={claiming || claimConfirming || Number(claimable) === 0}
                                        >
                                            {claiming ? 'Signing...' : claimConfirming ? 'Confirming...' : claimed ? '✓ Claimed' : `Claim ${Number(claimable).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE`}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-full"
                                            onClick={() => unstake()}
                                            disabled={unstaking || unstakeConfirming}
                                            style={{ marginTop: '0.5rem' }}
                                        >
                                            {unstaking ? 'Signing...' : unstakeConfirming ? 'Confirming...' : unstaked ? '✓ Unstaked' : 'Unstake (Rage Quit)'}
                                        </button>
                                        {position.lockExpires > Date.now() / 1000 && (
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--red)', marginTop: '0.375rem' }}>
                                                <img src="/icons/lock-04.svg" className="icon icon-sm icon-red" style={{ verticalAlign: '-3px' }} /> Lock active — cannot unstake until {new Date(position.lockExpires * 1000).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="dash-card">
                                <h3>Enter the Covenant</h3>
                                <p className="dim" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
                                    Wallet balance: <span className="green">{Number(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })} $FORGE</span>
                                </p>
                                <div className="stake-form">
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            className="input-field"
                                            placeholder="Amount to stake..."
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            min="0"
                                        />
                                        <button className="btn btn-ghost" onClick={() => setAmount(Math.floor(Number(balance)).toString())} style={{ whiteSpace: 'nowrap', fontSize: '0.625rem' }}>MAX</button>
                                    </div>
                                    <div className="covenant-select">
                                        {Object.entries(COVENANTS).map(([name, id]) => (
                                            <button
                                                key={id}
                                                className={`covenant-btn ${covenant === id ? 'covenant-active' : ''}`}
                                                onClick={() => setCovenant(id)}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        className="btn btn-green btn-full"
                                        onClick={handleStake}
                                        disabled={!amount || Number(amount) <= 0 || approving || staking || stakingConfirming}
                                        style={{ marginTop: '0.75rem' }}
                                    >
                                        {approving ? 'Approving...' : staking ? 'Signing...' : stakingConfirming ? 'Confirming...' : staked ? '✓ Staked!' : 'Stake $FORGE'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Covenants */}
            <section className="band">
                <div className="container">
                    <div className="section-label">
                        <span className="label label-green">
                            <img src="/icons/shield-01.svg" className="icon icon-sm" /> THE COVENANT
                        </span>
                        <span className="label">CHOOSE YOUR COMMITMENT</span>
                    </div>
                    <div className="grid-3" style={{ padding: 0 }}>
                        {/* Flame */}
                        <div className="bout-card cov-flame">
                            <div className="bout-header">
                                <span className="bout-title">
                                    <img src="/icons/zap-fast.svg" className="icon icon-sm icon-orange" /> FLAME
                                </span>
                                <span className="bout-tag tag-betting">1 DAY</span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Entry tier. Minimal lock. Start earning from the forge immediately.</div>
                            <div className="bout-pool">
                                <div><div className="bp-val" style={{ color: 'var(--text)' }}>—</div><div className="bp-label">APY Bonus</div></div>
                                <div><div className="bp-val" style={{ color: 'var(--text)' }}>1×</div><div className="bp-label">Rage Tax</div></div>
                            </div>
                        </div>
                        {/* Steel */}
                        <div className="bout-card cov-steel">
                            <div className="bout-header">
                                <span className="bout-title">
                                    <img src="/icons/shield-02.svg" className="icon icon-sm" /> STEEL
                                </span>
                                <span className="bout-tag tag-live" style={{ animation: 'none' }}>3 DAYS</span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Committed. You believe in what's being built here.</div>
                            <div className="bout-pool">
                                <div><div className="bp-val green">+50%</div><div className="bp-label">APY Bonus</div></div>
                                <div><div className="bp-val orange">2×</div><div className="bp-label">Rage Tax</div></div>
                            </div>
                        </div>
                        {/* Obsidian */}
                        <div className="bout-card cov-obsidian">
                            <div className="bout-header">
                                <span className="bout-title">
                                    <img src="/icons/shield-03.svg" className="icon icon-sm icon-purple" /> OBSIDIAN
                                </span>
                                <span className="bout-tag" style={{ color: 'var(--purple)', borderColor: 'var(--purple)' }}>7 DAYS</span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Maximum conviction. Top-tier yield. You're part of the foundation.</div>
                            <div className="bout-pool">
                                <div><div className="bp-val purple">+150%</div><div className="bp-label">APY Bonus</div></div>
                                <div><div className="bp-val red">3×</div><div className="bp-label">Rage Tax</div></div>
                            </div>
                        </div>
                    </div>

                    {/* Eternal */}
                    <div className="bout-card cov-eternal" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div className="bout-header">
                            <span className="bout-title">
                                <img src="/icons/lock-04.svg" className="icon icon-sm icon-red" /> ETERNAL
                            </span>
                            <span className="bout-tag tag-red">30 DAYS — NO UNSTAKE</span>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>No exit for 30 days. In return: the highest yield in the protocol. You don't just stake. You become the forge.</div>
                        <div className="bout-pool">
                            <div><div className="bp-val red" style={{ textShadow: '0 0 10px rgba(255,51,51,0.3)' }}>+300%</div><div className="bp-label">APY Bonus</div></div>
                            <div><div className="bp-val dim">∞</div><div className="bp-label">Lock Period</div></div>
                            <div><div className="bp-val red"><img src="/icons/lock-04.svg" className="icon icon-sm icon-red" /></div><div className="bp-label">Badge</div></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Vault Mechanics */}
            <section className="band">
                <div className="container">
                    <div className="split py-2">
                        {/* Left: Yield Sources + Betting Advantage */}
                        <div>
                            <div className="section-label mb-1">
                                <span className="label label-green">
                                    <img src="/icons/wallet-03.svg" className="icon icon-sm" /> YIELD SOURCES
                                </span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text)', marginBottom: '1rem' }}>
                                Deposit $FORGE into the Covenant Vault. Your stake earns from every trial — rake, burns, emissions, rage quit taxes. Lock longer, earn more.
                            </div>
                            <div className="entrant"><span className="agent">Protocol Rake (5% of all bets)</span><span className="odds green">50% → you</span></div>
                            <div className="entrant"><span className="agent">Rage Quit Taxes</span><span className="odds green">100% → you</span></div>
                            <div className="entrant"><span className="agent">Treasury Emissions</span><span className="odds green">15% weekly</span></div>
                            <div className="entrant"><span className="agent">Losing Bet Burns</span><span className="odds orange">25% → you</span></div>

                            <div className="section-label mt-2 mb-1">
                                <span className="label label-green">
                                    <img src="/icons/line-chart-up-04.svg" className="icon icon-sm" /> STAKER BETTING ADVANTAGE
                                </span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>
                                Your bet <span className="bright">weight = amount × loyalty multiplier</span>. A 3x staker betting 1,000 has the payout weight of 3,000. Staking isn't just yield. It's edge.
                            </div>
                        </div>
                        {/* Right: Loyalty + Rage Quit */}
                        <div>
                            <div className="section-label mb-1">
                                <span className="label label-green">
                                    <img src="/icons/star-06.svg" className="icon icon-sm" /> LOYALTY MULTIPLIER
                                </span>
                            </div>
                            {[
                                ['Day 1', '1.0x', ''],
                                ['Day 2', '1.2x', ''],
                                ['Day 3', '1.5x', ''],
                                ['Day 4', '2.0x', ''],
                                ['Day 5', '2.5x', ''],
                            ].map(([day, mult]) => (
                                <div className="entrant" key={day}><span className="agent">{day}</span><span className="odds">{mult}</span></div>
                            ))}
                            <div className="entrant"><span className="agent">Day 6+</span><span className="odds green" style={{ textShadow: 'var(--green-glow)' }}>3.0x MAX</span></div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--red)', marginTop: '0.5rem' }}>
                                <img src="/icons/shield-off.svg" className="icon icon-sm icon-red" style={{ verticalAlign: '-3px' }} /> Unstaking resets multiplier to 1.0x. Permanently.
                            </div>

                            <div className="section-label mt-2 mb-1">
                                <span className="label label-green">
                                    <img src="/icons/shield-dollar.svg" className="icon icon-sm icon-red" /> RAGE QUIT TAX
                                </span>
                            </div>
                            {[
                                ['Unstake Day 1', '50% lost', 'red'],
                                ['Unstake Day 2', '40% lost', 'red'],
                                ['Unstake Day 3', '30% lost', 'orange'],
                                ['Unstake Day 4', '20% lost', 'orange'],
                                ['Unstake Day 5', '10% lost', 'dim'],
                                ['Unstake Day 6', '5% lost', 'dim'],
                                ['After Day 6', '0% — free', 'green'],
                            ].map(([day, tax, cls]) => (
                                <div className="entrant" key={day}><span className="agent">{day}</span><span className={`odds ${cls}`}>{tax}</span></div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Vault API */}
            <section className="band">
                <div className="container py-2">
                    <div className="section-label">
                        <span className="label label-green">
                            <img src="/icons/database-03.svg" className="icon icon-sm" /> VAULT API
                        </span>
                    </div>
                    <div className="ep"><span className="method get">GET</span><span className="path">/api/vault/info</span><span className="desc">Public vault stats</span></div>
                    <div className="ep"><span className="method get">GET</span><span className="path">/api/vault/me</span><span className="desc">Your active stake</span></div>
                    <div className="ep"><span className="method post">POST</span><span className="path">/api/vault/stake</span><span className="desc">Stake with covenant</span></div>
                    <div className="ep"><span className="method post">POST</span><span className="path">/api/vault/unstake</span><span className="desc">Rage quit (if allowed)</span></div>
                </div>
            </section>
        </>
    );
}
