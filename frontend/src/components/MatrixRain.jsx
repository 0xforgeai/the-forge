import { useEffect, useRef } from 'react';

export default function MatrixRain() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        c.width = window.innerWidth;
        c.height = window.innerHeight;
        const cols = Math.floor(c.width / 14);
        const drops = Array(cols).fill(1);
        const chars = 'FORGE$01ΣΔΩ█▓▒░αβγ'.split('');

        const interval = setInterval(() => {
            ctx.fillStyle = 'rgba(10,10,10,0.05)';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = '#4ADE80';
            ctx.font = '12px JetBrains Mono';
            for (let i = 0; i < drops.length; i++) {
                const ch = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(ch, i * 14, drops[i] * 14);
                if (drops[i] * 14 > c.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }, 50);

        const handleResize = () => {
            c.width = window.innerWidth;
            c.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return <canvas ref={canvasRef} id="matrix-bg" />;
}
