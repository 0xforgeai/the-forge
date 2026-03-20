import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, staticFile } from 'remotion';
import { COLORS } from './constants.js';

export function ForgeLogo({ scale = 1, glowIntensity = 1 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const glowPulse = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [10, 25]
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
      transform: `scale(${scaleSpring * scale})`,
    }}>
      <img
        src={staticFile('brand/forge-mark.png')}
        width={220 * scale}
        height={220 * scale}
        style={{
          filter: `drop-shadow(0 0 ${glowPulse * glowIntensity}px ${COLORS.green})`,
        }}
      />
    </div>
  );
}
