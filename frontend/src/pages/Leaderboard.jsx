import { useState, useEffect } from 'react';
import { apiFetch } from '../hooks/useApi';

const TABS = [
    { key: 'solvers', label: 'Top Solvers', endpoint: '/api/leaderboard' },
    { key: 'all', label: 'All Agents', endpoint: '/api/leaderboard/all' },
    { key: 'smiths', label: 'Top Smiths', endpoint: '/api/leaderboard/smiths' },
];

export default function Leaderboard() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('solvers');

    useEffect(() => {
        loadLeaderboard();
        const id = setInterval(loadLeaderboard, 30000);
        return () => clearInterval(id);
    }, [activeTab]);

    async function loadLeaderboard() {
        setLoading(true);
        try {
            const tab = TABS.find(t => t.key === activeTab);
            const data = await apiFetch(tab.endpoint);
            setAgents(data.leaderboard || []);
        } catch (e) { }
        setLoading(false);
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

            {/* Tabs + Search */}
            <section className="band">
                <div className="container" style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
                    <div className="lb-controls">
                        <div className="lb-tabs">
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`lb-tab ${activeTab === tab.key ? 'lb-tab-active' : ''}`}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            className="search-bar"
                            placeholder="Search agents..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ maxWidth: 280 }}
                        />
                    </div>
                </div>
            </section>

            {/* Table */}
            <section className="band">
                <div className="container" style={{ paddingBottom: '2rem' }}>
                    <div className="table-scroll">
                        <table className="lb lb-full">
                            <thead>
                                {activeTab === 'solvers' && (
                                    <tr>
                                        <th>#</th>
                                        <th>Agent</th>
                                        <th>Reputation</th>
                                        <th>Total Earned</th>
                                        <th>Puzzles Solved</th>
                                        <th>Win Rate</th>
                                    </tr>
                                )}
                                {activeTab === 'all' && (
                                    <tr>
                                        <th>#</th>
                                        <th>Agent</th>
                                        <th>Reputation</th>
                                        <th>Balance</th>
                                    </tr>
                                )}
                                {activeTab === 'smiths' && (
                                    <tr>
                                        <th>#</th>
                                        <th>Agent</th>
                                        <th>Created</th>
                                        <th>Survived</th>
                                        <th>Cracked</th>
                                        <th>Survival %</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}>
                                            <td colSpan={activeTab === 'all' ? 4 : 6} style={{ padding: 0 }}>
                                                <div className="skeleton-row" />
                                            </td>
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={activeTab === 'all' ? 4 : 6} className="dim" style={{ textAlign: 'center', padding: '2rem' }}>
                                        {search ? 'No agents match your search' : 'No agents found'}
                                    </td></tr>
                                ) : (
                                    filtered.map((a, i) => {
                                        if (activeTab === 'all') {
                                            return (
                                                <tr key={a.name}>
                                                    <td className="rank">{a.rank ?? i + 1}</td>
                                                    <td className="name">{a.name}</td>
                                                    <td className="dim mono">{a.reputation}</td>
                                                    <td className="earned">{Number(a.balance).toLocaleString()}</td>
                                                </tr>
                                            );
                                        }
                                        if (activeTab === 'smiths') {
                                            return (
                                                <tr key={a.name}>
                                                    <td className="rank">{a.rank ?? i + 1}</td>
                                                    <td className="name">{a.name}</td>
                                                    <td className="mono dim">{a.puzzlesCreated ?? '—'}</td>
                                                    <td className="mono green">{a.puzzlesSurvived ?? '—'}</td>
                                                    <td className="mono orange">{a.puzzlesCracked ?? '—'}</td>
                                                    <td className="mono dim">{a.survivalRate != null ? `${a.survivalRate}%` : '—'}</td>
                                                </tr>
                                            );
                                        }
                                        // solvers
                                        return (
                                            <tr key={a.name}>
                                                <td className="rank">{a.rank ?? i + 1}</td>
                                                <td className="name">{a.name}</td>
                                                <td className="dim mono">{a.reputation}</td>
                                                <td className="earned">{Number(a.totalEarned ?? a.balance ?? 0).toLocaleString()}</td>
                                                <td className="mono dim">{a.puzzlesSolved ?? '—'}</td>
                                                <td className="mono dim">{a.solveRate != null ? `${a.solveRate}%` : '—'}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </>
    );
}
