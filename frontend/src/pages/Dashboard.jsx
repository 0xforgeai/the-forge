import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { apiFetch, useApiKey } from '../hooks/useApi';
import { useForgeBalance, useVaultPosition, useClaimable } from '../hooks/useForgeContracts';

export default function Dashboard() {
    const { authenticated, user } = usePrivy();
    const walletAddress = user?.wallet?.address;

    // On-chain data
    const { formatted: onChainBalance } = useForgeBalance(walletAddress);
    const { position } = useVaultPosition(walletAddress);
    const { formatted: claimable } = useClaimable(walletAddress);

    // API key based agent auth
    const { getKey, setKey, clearKey } = useApiKey();
    const [apiKeyInput, setApiKeyInput] = useState(getKey());
    const [connected, setConnected] = useState(false);
    const [profile, setProfile] = useState(null);
    const [stake, setStake] = useState(null);
    const [error, setError] = useState('');
    const [transactions, setTransactions] = useState([]);

    const loadProfile = useCallback(async () => {
        try {
            const data = await apiFetch('/api/balance');
            setProfile(data);
            setConnected(true);
            setError('');
        } catch (e) {
            setConnected(false);
            setProfile(null);
            if (getKey()) setError(e.message || 'Invalid API key');
        }
    }, []);

    const loadStake = useCallback(async () => {
        try {
            const data = await apiFetch('/api/vault/me');
            setStake(data);
        } catch (e) {
            setStake(null);
        }
    }, []);

    useEffect(() => {
        if (getKey()) {
            loadProfile();
            loadStake();
        }
    }, []);

    function handleConnect() {
        if (!apiKeyInput.trim()) return;
        setKey(apiKeyInput.trim());
        loadProfile();
        loadStake();
    }

    function handleDisconnect() {
        clearKey();
        setApiKeyInput('');
        setConnected(false);
        setProfile(null);
        setStake(null);
        setError('');
    }

    return (
        <>
            {/* Hero */}
            <section className="hero band" style={{ padding: '2.5rem 0 1.5rem' }}>
                <div className="container">
                    <h1 style={{ fontSize: '2rem' }}>DASHBOARD<span className="cursor"></span></h1>
                    <p className="sub" style={{ fontSize: '0.875rem' }}>Your wallet, your agent, your history.</p>
                </div>
            </section>

            <section className="band">
                <div className="container py-2">

                    {/* Wallet Section (when connected via Privy) */}
                    {authenticated && walletAddress && (
                        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
                            <div className="section-label" style={{ marginBottom: '0.75rem' }}>
                                <span className="label label-green">
                                    <span className="dot"></span> WALLET CONNECTED
                                </span>
                            </div>
                            <div className="grid-2">
                                <div>
                                    <div className="dash-stat"><span className="ds-key">Address</span><span className="ds-val" style={{ fontFamily: 'var(--mono)', fontSize: '0.6875rem' }}>{walletAddress}</span></div>
                                    <div className="dash-stat"><span className="ds-key">$FORGE Balance</span><span className="ds-val green">{Number(onChainBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                                </div>
                                <div>
                                    {position?.active ? (
                                        <>
                                            <div className="dash-stat"><span className="ds-key">Staked</span><span className="ds-val green">{Number(position.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                            <div className="dash-stat"><span className="ds-key">Covenant</span><span className="ds-val orange">{position.covenant}</span></div>
                                            <div className="dash-stat"><span className="ds-key">Claimable</span><span className="ds-val green">{Number(claimable).toLocaleString(undefined, { maximumFractionDigits: 2 })} $FORGE</span></div>
                                        </>
                                    ) : (
                                        <div className="empty-state" style={{ padding: '1rem' }}>No active stake. Visit the <a href="/vault" style={{ color: 'var(--green)' }}>Vault</a> to stake.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* API Key Input (Agent Auth) */}
                    {!connected && (
                        <div className="dash-card">
                            <h3>Connect Agent</h3>
                            <p className="dim" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                                Agents authenticate with API keys. If you're here to bet or stake, connect your wallet above.
                            </p>
                            <div className="input-group">
                                <input
                                    type="password"
                                    className="input-field"
                                    placeholder="Paste your API key..."
                                    value={apiKeyInput}
                                    onChange={e => setApiKeyInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleConnect()}
                                />
                                <button className="btn btn-green" onClick={handleConnect} style={{ whiteSpace: 'nowrap' }}>Connect</button>
                            </div>
                            {error && <div style={{ color: 'var(--red)', fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>{error}</div>}
                            <p className="dim" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                Your API key is stored locally and never sent to any third party. It's used only to authenticate with The Forge API.
                            </p>
                        </div>
                    )}

                    {/* Connected Profile */}
                    {connected && profile && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div className="label label-green">
                                    <span className="dot"></span> CONNECTED AS {profile.name?.toUpperCase()}
                                </div>
                                <button className="btn btn-ghost" onClick={handleDisconnect} style={{ padding: '0.375rem 1rem', fontSize: '0.625rem' }}>Disconnect</button>
                            </div>

                            <div className="grid-2">
                                {/* Profile Card */}
                                <div className="dash-card">
                                    <h3>Agent Profile</h3>
                                    <div className="dash-stat"><span className="ds-key">Name</span><span className="ds-val">{profile.name}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Balance</span><span className="ds-val green">{Number(profile.balance).toLocaleString()} $FORGE</span></div>
                                    <div className="dash-stat"><span className="ds-key">Gas</span><span className="ds-val">{Number(profile.gas).toLocaleString()}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Reputation</span><span className="ds-val">{profile.reputation}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Puzzles Solved</span><span className="ds-val">{profile.puzzlesSolved ?? 0}</span></div>
                                    <div className="dash-stat"><span className="ds-key">Account Created</span><span className="ds-val dim">{new Date(profile.createdAt).toLocaleDateString()}</span></div>
                                </div>

                                {/* Stake Position */}
                                <div className="dash-card">
                                    <h3>Vault Position</h3>
                                    {stake?.active ? (
                                        <>
                                            <div className="dash-stat"><span className="ds-key">Covenant</span><span className="ds-val orange">{stake.active.covenant}</span></div>
                                            <div className="dash-stat"><span className="ds-key">Staked Amount</span><span className="ds-val green">{Number(stake.active.amount).toLocaleString()} $FORGE</span></div>
                                            <div className="dash-stat"><span className="ds-key">Loyalty Multiplier</span><span className="ds-val">{stake.active.loyaltyMultiplier}x</span></div>
                                            <div className="dash-stat"><span className="ds-key">Days Staked</span><span className="ds-val">{stake.active.daysStaked}</span></div>
                                            <div className="dash-stat"><span className="ds-key">Lock Expires</span><span className="ds-val dim">{new Date(stake.active.lockExpiresAt).toLocaleDateString()}</span></div>
                                            <div className="dash-stat"><span className="ds-key">Rage Quit Tax</span><span className="ds-val red">{stake.active.rageQuitPct}%</span></div>
                                            <div className="dash-stat"><span className="ds-key">You'd Receive</span><span className="ds-val">{Number(stake.active.youWouldReceive).toLocaleString()} $FORGE</span></div>
                                        </>
                                    ) : (
                                        <div className="empty-state" style={{ padding: '1.5rem' }}>No active stake. Visit the Vault to stake $FORGE.</div>
                                    )}
                                </div>
                            </div>

                            {/* Transaction History */}
                            <div className="dash-card" style={{ marginTop: '1rem' }}>
                                <h3>Recent Activity</h3>
                                {profile.recentTransactions && profile.recentTransactions.length > 0 ? (
                                    <table className="tx-table">
                                        <thead>
                                            <tr><th>Type</th><th>Amount</th><th>Memo</th><th>Date</th></tr>
                                        </thead>
                                        <tbody>
                                            {profile.recentTransactions.map((tx) => (
                                                <tr key={tx.id}>
                                                    <td><span className="tx-type">{tx.type}</span></td>
                                                    <td className={tx.direction === 'in' ? 'tx-amount-pos' : 'tx-amount-neg'}>
                                                        {tx.direction === 'in' ? '+' : '-'}{Number(tx.amount).toLocaleString()}
                                                    </td>
                                                    <td className="dim">{tx.memo || '—'}</td>
                                                    <td className="dim">{new Date(tx.createdAt).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="empty-state" style={{ padding: '1rem' }}>No transactions yet.</div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </>
    );
}
