import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  AbsoluteFill,
  staticFile,
} from 'remotion';
import { MatrixRain } from './MatrixRain.jsx';
import { ForgeLogo } from './ForgeLogo.jsx';
import { COLORS, FONTS } from './constants.js';

// 8 seconds at 30fps = 240 frames
// Scene 1: Logo + "Staking is now live" reveal (0-3s, frames 0-89)
// Scene 2: Button "STAKE NOW" appears, matrix intensifies (3-6s, frames 90-179)
// Scene 3: CTA with vault link (6-8s, frames 180-239)

// ─── Scene 1: Announcement ───────────────────────────────────
function SceneAnnouncement() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 10, stiffness: 60 } });
  const headlineOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' });
  const headlineY = interpolate(frame, [25, 45], [40, 0], { extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: 'clamp' });

  // Pulsing green glow behind headline
  const glowPulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [15, 30]);

  return (
    <AbsoluteFill style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      gap: 20,
    }}>
      <div style={{ transform: `scale(${logoScale})` }}>
        <ForgeLogo scale={1.0} glowIntensity={1.5} />
      </div>

      <div style={{
        fontFamily: FONTS.mono,
        fontSize: 80,
        fontWeight: 700,
        color: COLORS.green,
        textShadow: `0 0 ${glowPulse}px ${COLORS.green}, 0 0 ${glowPulse * 2}px ${COLORS.greenGlow}`,
        letterSpacing: 6,
        textAlign: 'center',
        opacity: headlineOpacity,
        transform: `translateY(${headlineY}px)`,
        marginTop: 10,
      }}>
        STAKING IS NOW LIVE
      </div>

      <div style={{
        fontFamily: FONTS.sans,
        fontSize: 30,
        color: COLORS.text,
        opacity: subOpacity,
        textAlign: 'center',
        letterSpacing: 2,
      }}>
        Earn passive yield from every trial in The Forge
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 2: Stake Button + Matrix Surge ─────────────────────
function SceneStakeButton() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const btnScale = spring({ frame: frame - 5, fps, config: { damping: 12, stiffness: 80 } });
  const btnOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Button glow intensifies over time
  const btnGlow = interpolate(frame, [0, 60], [10, 40], { extrapolateRight: 'clamp' });
  const btnPulse = interpolate(Math.sin(frame * 0.18), [-1, 1], [0.97, 1.03]);

  // Stats fade in staggered
  const stat1Opacity = interpolate(frame, [25, 40], [0, 1], { extrapolateRight: 'clamp' });
  const stat2Opacity = interpolate(frame, [35, 50], [0, 1], { extrapolateRight: 'clamp' });
  const stat3Opacity = interpolate(frame, [45, 60], [0, 1], { extrapolateRight: 'clamp' });

  const stats = [
    { label: 'APY AT LAUNCH', value: '2,000%', opacity: stat1Opacity },
    { label: 'POOL SHARE', value: '75%', opacity: stat2Opacity },
    { label: 'LOCK PERIOD', value: 'FLEXIBLE', opacity: stat3Opacity },
  ];

  return (
    <AbsoluteFill style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      gap: 50,
    }}>
      {/* Lock icon */}
      <div style={{
        opacity: btnOpacity,
        transform: `scale(${btnScale})`,
      }}>
        <img
          src={staticFile('icons/lock-01.svg')}
          width={60}
          height={60}
          style={{
            filter: 'invert(78%) sepia(40%) saturate(500%) hue-rotate(90deg) brightness(95%)',
            opacity: 0.8,
          }}
        />
      </div>

      {/* STAKE NOW button */}
      <div style={{
        opacity: btnOpacity,
        transform: `scale(${btnScale * btnPulse})`,
        fontFamily: FONTS.mono,
        fontSize: 44,
        fontWeight: 700,
        color: COLORS.bgDeep,
        background: COLORS.green,
        padding: '24px 100px',
        borderRadius: 16,
        letterSpacing: 6,
        boxShadow: `0 0 ${btnGlow}px ${COLORS.green}, 0 0 ${btnGlow * 2}px ${COLORS.greenGlow}`,
        cursor: 'pointer',
      }}>
        STAKE NOW
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: 80,
        marginTop: 10,
      }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            opacity: stat.opacity,
          }}>
            <div style={{
              fontFamily: FONTS.mono,
              fontSize: 40,
              fontWeight: 700,
              color: COLORS.green,
              textShadow: `0 0 12px ${COLORS.greenGlow}`,
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: FONTS.mono,
              fontSize: 16,
              color: COLORS.textDim,
              letterSpacing: 3,
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 3: CTA with vault link ────────────────────────────
function SceneCTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const textOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });
  const linkOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp' });
  const linkScale = spring({ frame: frame - 20, fps, config: { damping: 15, stiffness: 100 } });
  const linkGlow = interpolate(Math.sin(frame * 0.15), [-1, 1], [10, 25]);

  return (
    <AbsoluteFill style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      gap: 30,
    }}>
      <div style={{ transform: `scale(${logoScale * 0.7})` }}>
        <ForgeLogo scale={0.7} glowIntensity={2} />
      </div>

      <div style={{
        fontFamily: FONTS.mono,
        fontSize: 56,
        fontWeight: 700,
        color: COLORS.green,
        textShadow: `0 0 20px ${COLORS.greenGlow}, 0 0 40px ${COLORS.greenGlow}`,
        letterSpacing: 6,
        textAlign: 'center',
        opacity: textOpacity,
      }}>
        START EARNING NOW
      </div>

      <div style={{
        fontFamily: FONTS.sans,
        fontSize: 26,
        color: COLORS.text,
        opacity: textOpacity,
        textAlign: 'center',
      }}>
        Stake $FORGE. Earn yield. Shape the arena.
      </div>

      {/* Vault link button */}
      <div style={{
        opacity: linkOpacity,
        transform: `scale(${linkScale})`,
        fontFamily: FONTS.mono,
        fontSize: 28,
        fontWeight: 700,
        color: COLORS.bgDeep,
        background: COLORS.green,
        padding: '18px 60px',
        borderRadius: 12,
        letterSpacing: 3,
        boxShadow: `0 0 ${linkGlow}px ${COLORS.green}, 0 0 ${linkGlow * 2}px ${COLORS.greenGlow}`,
      }}>
        forgeai.bet/vault
      </div>
    </AbsoluteFill>
  );
}

// ─── Main Composition ─────────────────────────────────────────
export function StakingLive() {
  const frame = useCurrentFrame();

  // Matrix rain intensifies when the STAKE button appears (frame 90+)
  const matrixBase = interpolate(frame, [0, 30], [0, 0.1], { extrapolateRight: 'clamp' });
  const matrixSurge = interpolate(frame, [90, 130], [0, 0.2], { extrapolateRight: 'clamp' });
  const matrixFade = interpolate(frame, [180, 200], [0, -0.08], { extrapolateRight: 'clamp' });
  const matrixOpacity = Math.max(0.05, matrixBase + matrixSurge + matrixFade);

  // Matrix speed also ramps up
  const matrixSpeed = interpolate(frame, [90, 130], [1, 2.5], { extrapolateRight: 'clamp' });

  const vignette = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
    pointerEvents: 'none',
    zIndex: 10,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      {/* Matrix rain — intensifies on stake button */}
      <MatrixRain opacity={matrixOpacity} speed={matrixSpeed} />

      {/* Scene 1: Announcement (0-3s) */}
      <Sequence from={0} durationInFrames={90}>
        <SceneAnnouncement />
      </Sequence>

      {/* Scene 2: Stake button + stats (3-6s) */}
      <Sequence from={90} durationInFrames={90}>
        <SceneStakeButton />
      </Sequence>

      {/* Scene 3: CTA (6-8s) */}
      <Sequence from={180} durationInFrames={60}>
        <SceneCTA />
      </Sequence>

      {/* Vignette overlay */}
      <div style={vignette} />

      {/* Scanline effect */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        pointerEvents: 'none',
        zIndex: 11,
      }} />
    </AbsoluteFill>
  );
}
