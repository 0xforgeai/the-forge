const STATUS_TAG = {
    SCHEDULED: 'tag-scheduled',
    REGISTRATION: 'tag-scheduled',
    BETTING: 'tag-betting',
    LIVE: 'tag-live',
    RESOLVING: 'tag-live',
    RESOLVED: 'tag-resolved',
    CANCELLED: 'tag-red',
};

export default function BoutCard({ bout }) {
    return (
        <div className="bout-card">
            <div className="bout-header">
                <span className="bout-title">{bout.title}</span>
                <span className={`bout-tag ${STATUS_TAG[bout.status] || 'tag-scheduled'}`}>{bout.status}</span>
            </div>
            <div className="bout-meta">
                <span className="val">{bout.puzzleType}</span> · T{bout.tier} · <span className="val">{bout.entrantCount ?? bout.totalEntrants}</span> entrants
            </div>
            <div className="bout-pool">
                <div>
                    <div className="bp-val">{Number(bout.totalBetPool).toLocaleString()}</div>
                    <div className="bp-label">Bet Pool ($F)</div>
                </div>
                <div>
                    <div className="bp-val">{bout.entrantCount ?? bout.totalEntrants}</div>
                    <div className="bp-label">Entrants</div>
                </div>
            </div>
            {bout.entrants && bout.entrants.length > 0 && (
                <div className="entrant-list">
                    {bout.entrants.slice(0, 6).map((e) => (
                        <div className="entrant" key={e.id}>
                            <span className="agent">{e.name}</span>
                            <span className="odds green">
                                {bout.totalBetPool > 0
                                    ? `${((e.totalBetsOn / Number(bout.totalBetPool)) * 100).toFixed(0)}%`
                                    : '—'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
