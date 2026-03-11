export default function StatsBar({ items }) {
    return (
        <div className="stats-bar" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
            {items.map((item, i) => (
                <div key={i}>
                    <div className="sb-val">{item.value}</div>
                    <div className="sb-label">{item.label}</div>
                </div>
            ))}
        </div>
    );
}
