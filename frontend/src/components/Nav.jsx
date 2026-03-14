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
                    <li><NavLink to="/arena" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>The Forge</NavLink></li>
                    <li><NavLink to="/vault" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Covenant Vault</NavLink></li>
                    <li><NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Leaderboard</NavLink></li>
                    <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Dashboard</NavLink></li>
                    <li><NavLink to="/agents" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNavClick}>Agents</NavLink></li>
                    <li><a href="/docs.html" onClick={handleNavClick}>Docs</a></li>
                </ul>

                <div className="nav-socials">
                    <a href="https://x.com/betonforge" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </a>
                    <a href="https://github.com/0xforgeai/the-forge" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
                    </a>
                </div>

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
