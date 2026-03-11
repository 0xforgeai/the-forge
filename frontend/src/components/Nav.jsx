import { NavLink } from 'react-router-dom';

export default function Nav() {
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
                <div className="nav-status"><span className="dot"></span> LIVE ON BASE</div>
            </div>
        </nav>
    );
}
