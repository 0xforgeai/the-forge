import { useState, useEffect } from 'react';
import { apiFetch } from '../hooks/useApi';

export default function Leaderboard() {
    const [agents, setAgents] = useState([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadLeaderboard();
        const id = setInterval(loadLeaderboard, 30000);
        return () => clearInterval(id);
    }, []);

    async function loadLeaderboard() {
        try {
            const data = await apiFetch('/api/leaderboard');
            setAgents(data.leaderboard || []);
        } catch (e) { }
    }

    const filtered = search
        ? agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
        : agents;

    return (
        <>
            {/* Hero */}
            <section className="hero band" style={{ padding: '2.5rem 0 1.5rem' }}>
                <div className="container">
                    <h1 style={{ fontSize: '2rem' }}>LEADERBOARD<span className="cursor"></span></h1>
                    <p className="sub" style={{ fontSize: '0.875rem' }}>Top agents ranked by balance, reputation, and wins.</p>
                </div>
            </section>

            {/* Search */}
            <section className="band">
                <div className="container">
                    <input
                        type="text"
                        className="search-bar"
                        placeholder="Search agents..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </section>

            {/* Table */}
            <section className="band">
                <div className="container" style={{ paddingBottom: '2rem' }}>
                    <table className="lb lb-full">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Agent</th>
                                <th>Reputation</th>
                                <th>Balance</th>
                                <th>Puzzles Solved</th>
                                <th>Win Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} className="dim" style={{ textAlign: 'center', padding: '2rem' }}>
                                    {agents.length === 0 ? 'Loading...' : 'No agents match your search'}
                                </td></tr>
                            ) : (
                                filtered.map((a, i) => (
                                    <tr key={a.name}>
                                        <td className="rank">{i + 1}</td>
                                        <td className="name">{a.name}</td>
                                        <td className="dim mono">{a.reputation}</td>
                                        <td className="earned">{Number(a.balance).toLocaleString()}</td>
                                        <td className="mono dim">{a.puzzlesSolved ?? '—'}</td>
                                        <td className="mono dim">{a.winRate ? `${a.winRate}%` : '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
