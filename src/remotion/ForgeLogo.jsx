import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS } from './constants.js';

export function ForgeLogo({ scale = 1, showWordmark = false, glowIntensity = 1 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const glowPulse = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [4, 10]
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
      transform: `scale(${scaleSpring * scale})`,
    }}>
      {/* Anvil-F Logo Mark */}
      <svg viewBox="0 0 512 512" width={200 * scale} height={200 * scale}>
        <defs>
          <filter id="logoGlow">
            <feGaussianBlur stdDeviation={glowPulse * glowIntensity} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#5AEE90' }} />
            <stop offset="100%" style={{ stopColor: '#4ADE80' }} />
          </linearGradient>
        </defs>
        <g transform="translate(256,256)" filter="url(#logoGlow)">
          <g fill="none" stroke="url(#greenGrad)" strokeWidth="4" strokeLinecap="round">
            {/* Base (anvil foot) */}
            <path d="M-50,120 L50,120 L50,100 L30,100 L30,80 L-30,80 L-30,100 L-50,100 Z" fill="#4ADE80" stroke="none" />
            {/* Stem */}
            <rect x="-22" y="-20" width="44" height="100" fill="#4ADE80" stroke="none" />
            {/* Anvil top / F crossbar area */}
            <path d="M-80,-20 L120,-20 L130,-50 L120,-80 L-60,-80 L-80,-80 L-90,-50 Z" fill="#4ADE80" stroke="none" />
            {/* Horn */}
            <path d="M-90,-50 L-130,-45 L-140,-40" stroke="#4ADE80" strokeWidth="8" fill="none" />
            {/* F bars */}
            <path d="M30,-80 L120,-80" stroke={COLORS.bgDeep} strokeWidth="3" />
            <path d="M22,-20 L90,-20" stroke={COLORS.bgDeep} strokeWidth="3" />
            {/* Circuit traces */}
            <path d="M-10,75 L-10,20 L-10,-15" stroke={COLORS.bgDeep} strokeWidth="2.5" />
            <path d="M10,75 L10,30 L10,-15" stroke={COLORS.bgDeep} strokeWidth="2.5" />
            <path d="M0,75 L0,-15" stroke={COLORS.bgDeep} strokeWidth="2.5" />
            <path d="M-10,40 L-40,40 L-40,-15" stroke={COLORS.bgDeep} strokeWidth="2" />
            <path d="M10,20 L40,20 L40,-15" stroke={COLORS.bgDeep} strokeWidth="2" />
            <path d="M-10,0 L-55,0 L-55,-40 L-30,-40" stroke={COLORS.bgDeep} strokeWidth="2" />
            <path d="M10,10 L60,10 L60,-50 L80,-50" stroke={COLORS.bgDeep} strokeWidth="2" />
            {/* Circuit nodes */}
            <circle cx="-40" cy="40" r="3" fill={COLORS.bgDeep} />
            <circle cx="40" cy="20" r="3" fill={COLORS.bgDeep} />
            <circle cx="-55" cy="0" r="3" fill={COLORS.bgDeep} />
            <circle cx="60" cy="10" r="3" fill={COLORS.bgDeep} />
            <circle cx="-30" cy="-40" r="3" fill={COLORS.bgDeep} />
            <circle cx="80" cy="-50" r="3" fill={COLORS.bgDeep} />
            {/* Horn traces */}
            <path d="M-80,-50 L-110,-48 L-125,-43" stroke={COLORS.bgDeep} strokeWidth="2" />
            <path d="M-75,-40 L-100,-38" stroke={COLORS.bgDeep} strokeWidth="2" />
            <circle cx="-100" cy="-38" r="2.5" fill={COLORS.bgDeep} />
          </g>
        </g>
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <div style={{
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 64 * scale,
          fontWeight: 700,
          color: COLORS.green,
          letterSpacing: 12,
          textShadow: `0 0 ${glowPulse * glowIntensity}px ${COLORS.greenGlow}`,
        }}>
          THE FORGE
        </div>
      )}
    </div>
  );
}
