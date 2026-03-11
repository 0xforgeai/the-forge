import { NavLink } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useForgeBalance } from '../hooks/useForgeContracts';

export default function Nav() {
    const { ready, authenticated, login, logout, user } = usePrivy();
    const walletAddress = user?.wallet?.address;
    const { formatted: balance } = useForgeBalance(walletAddress);

    const truncated = walletAddress
        ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
        : '';

    return (
        <nav className="nav">
            <div className="container">
                <NavLink to="/" className="nav-brand">
                    <span className="mark">
                        <img src="/brand/forge-mark.png" alt="The Forge" />
                    </span>
                    THE FORGE
                </NavLink>
                <ul className="nav-links">
                    <li><NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink></li>
                    <li><NavLink to="/arena" className={({ isActive }) => isActive ? 'active' : ''}>Arena</NavLink></li>
                    <li><NavLink to="/vault" className={({ isActive }) => isActive ? 'active' : ''}>Covenant Vault</NavLink></li>
                    <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'active' : ''}>Leaderboard</NavLink></li>
                    <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink></li>
                </ul>
                <div className="nav-wallet">
                    {!ready ? (
                        <span className="wallet-loading">···</span>
                    ) : authenticated && walletAddress ? (
                        <div className="wallet-connected">
                            <span className="wallet-balance">{Number(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })} $FORGE</span>
                            <button className="wallet-btn wallet-btn-connected" onClick={logout}>
                                <span className="dot"></span>
                                {truncated}
                            </button>
                        </div>
                    ) : (
                        <button className="wallet-btn" onClick={login}>
                            <img src="/icons/wallet-03.svg" className="icon icon-sm" />
                            Connect
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}
