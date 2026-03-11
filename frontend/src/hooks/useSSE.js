import { useState, useEffect, useRef } from 'react';

export default function useSSE(url = '/api/events') {
    const [events, setEvents] = useState([]);
    const esRef = useRef(null);

    useEffect(() => {
        const es = new EventSource(url);
        esRef.current = es;

        es.onmessage = (e) => {
            try {
                const ev = JSON.parse(e.data);
                if (ev.type === 'heartbeat') return;
                setEvents((prev) => [
                    { ...ev, receivedAt: new Date().toISOString() },
                    ...prev.slice(0, 49),
                ]);
            } catch (err) {
                // ignore parse errors
            }
        };

        es.onerror = () => {
            // EventSource auto-reconnects; nothing special needed
        };

        return () => {
            es.close();
        };
    }, [url]);

    return events;
}
