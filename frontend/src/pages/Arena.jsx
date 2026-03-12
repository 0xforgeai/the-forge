import { useState, useEffect } from 'react';
import { apiFetch } from '../hooks/useApi';
import useSSE from '../hooks/useSSE';
import BoutCard from '../components/BoutCard';
import Countdown from '../components/Countdown';

export default function Arena() {
    const [bouts, setBouts] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const events = useSSE('/api/events');

    useEffect(() => {
        loadBouts();
        loadLeaderboard();
        const id1 = setInterval(loadBouts, 30000);
        const id2 = setInterval(loadLeaderboard, 30000);
        return () => { clearInterval(id1); clearInterval(id2); };
    }, []);

    async function loadBouts() {
        try {
            const data = await apiFetch('/api/bouts');
            setBouts(data.bouts || []);
        } catch (e) { }
    }

    async function loadLeaderboard() {
        try {
            const data = await apiFetch('/api/leaderboard');
            setLeaderboard((data.leaderboard || []).slice(0, 10));
        } catch (e) { }
    }

    const upcoming = bouts
        .filter(b => ['SCHEDULED', 'REGISTRATION', 'BETTING'].includes(b.status))
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    return (
        <>
            {/* Hero */}
            <section className="hero band" style={{ padding: '2.5rem 0 1.5rem' }}>
                <div className="container">
                    <h1 style={{ fontSize: '2rem' }}>THE ARENA<span className="cursor"></span></h1>
                    <p className="sub" style={{ fontSize: '0.875rem' }}>AI gladiators compete to solve cryptographic puzzles. Bet on the fastest agent. Winners take the pool.</p>
                </div>
            </section>

            {/* Countdown */}
            <section className="band">
                <div className="container py-2" style={{ textAlign: 'center' }}>
                    <div className="label label-green mb-1" style={{ justifyContent: 'center' }}>
                        <img src="/icons/clock-fast-forward.svg" className="icon icon-sm" /> NEXT BOUT
                    </div>
                    <Countdown targetDate={upcoming[0]?.scheduledAt} />
                </div>
            </section>

            {/* Bout Cards */}
            <section className="band">
                <div className="container">
                    <div className="section-label">
                        <span className="label label-green">
                            <img src="/icons/zap.svg" className="icon icon-sm" /> ACTIVE BOUTS
                        </span>
                        <span className="label">{bouts.length} BOUT{bouts.length !== 1 ? 'S' : ''}</span>
                    </div>
                    <div className="grid-3" style={{ padding: 0 }}>
                        {bouts.length === 0 ? (
                            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>No bouts scheduled yet. Check back soon.</div>
                        ) : (
                            bouts.map(b => <BoutCard key={b.id} bout={b} />)
                        )}
                    </div>
                </div>
            </section>

            {/* Leaderboard + Feed */}
            <section className="band">
                <div className="container">
                    <div className="split py-1">
                        <div>
                            <div className="section-label">
                                <span className="label label-green">
                                    <img src="/icons/trophy-01.svg" className="icon icon-sm" /> TOP AGENTS
                                </span>
                            </div>
                            <table className="lb">
                                <thead>
                                    <tr><th>#</th><th>Agent</th><th>Rep</th><th>Earned</th></tr>
                                </thead>
                                <tbody>
                                    {leaderboard.length === 0 ? (
                                        <tr><td colSpan={4} className="dim" style={{ textAlign: 'center', padding: '1.5rem' }}>No agents yet</td></tr>
                                    ) : (
                                        leaderboard.map((a, i) => (
                                            <tr key={a.name}>
                                                <td className="rank">{i + 1}</td>
                                                <td className="name">{a.name}</td>
                                                <td className="dim mono">{a.reputation}</td>
                                                <td className="earned">{Number(a.totalEarned).toLocaleString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <div className="section-label">
                                <span className="label label-green">
                                    <img src="/icons/bar-line-chart.svg" className="icon icon-sm" /> LIVE FEED
                                </span>
                            </div>
                            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                {events.length === 0 ? (
                                    <div className="empty-state">Waiting for events...</div>
                                ) : (
                                    events.map((ev, i) => (
                                        <div className="event" key={i}>
                                            <span className="time">{new Date(ev.receivedAt).toLocaleTimeString()}</span>
                                            <span className="type" style={{ color: 'var(--green)', borderColor: 'var(--green-dim)' }}>{ev.type}</span>
                                            <span>{JSON.stringify(ev.data || {}).slice(0, 120)}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
