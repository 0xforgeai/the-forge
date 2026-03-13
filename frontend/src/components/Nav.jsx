import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useForgeBalance } from '../hooks/useForgeContracts';

export default function Nav() {
    const { ready, authenticated, login, logout, user } = usePrivy();
    const walletAddress = user?.wallet?.address;
    const { formatted: balance } = useForgeBalance(walletAddress);
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();

    const truncated = walletAddress
        ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
        : '';

    // Close menu on navigation
    function handleNavClick() {
        setMenuOpen(false);
    }

    return (
        <nav className="nav">
            <div className="container">
                <NavLink to="/" className="nav-brand" onClick={handleNavClick}>
                    <span className="mark">
                        <img src="/brand/forge-mark.png" alt="The Forge" />
                    </span>
                    THE FORGE
                </NavLink>

                {/* Hamburger toggle (mobile only) */}
                <button
                    className={`nav-hamburger ${menuOpen ? 'open' : ''}`}
                    onClick={() => setMenuOpen(!menuOpen)}
                    aria-label="Toggle menu"
                    aria-expanded={menuOpen}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <ul className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
                    <li><NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Home</NavLink></li>
                    <li><NavLink to="/arena" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Arena</NavLink></li>
                    <li><NavLink to="/vault" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Covenant Vault</NavLink></li>
                    <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Leaderboard</NavLink></li>
                    <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Dashboard</NavLink></li>
                    <li><a href="/docs.html" onClick={handleNavClick}>Docs</a></li>
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
