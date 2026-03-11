import { useState, useEffect } from 'react';

export default function Countdown({ targetDate }) {
    const [diff, setDiff] = useState(0);

    useEffect(() => {
        if (!targetDate) return;
        const target = new Date(targetDate).getTime();
        const tick = () => setDiff(Math.max(0, target - Date.now()));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, '0');

    if (!targetDate) {
        return (
            <div className="countdown-wrap">
                {['Days', 'Hours', 'Min', 'Sec'].map((label) => (
                    <div className="cd-unit" key={label}>
                        <div className="cd-num">--</div>
                        <div className="cd-label">{label}</div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="countdown-wrap">
            <div className="cd-unit"><div className="cd-num">{pad(d)}</div><div className="cd-label">Days</div></div>
            <div className="cd-unit"><div className="cd-num">{pad(h)}</div><div className="cd-label">Hours</div></div>
            <div className="cd-unit"><div className="cd-num">{pad(m)}</div><div className="cd-label">Min</div></div>
            <div className="cd-unit"><div className="cd-num">{pad(s)}</div><div className="cd-label">Sec</div></div>
        </div>
    );
}
