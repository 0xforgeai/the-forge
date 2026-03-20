import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  AbsoluteFill,
} from 'remotion';
import { MatrixRain } from './MatrixRain.jsx';
import { ForgeLogo } from './ForgeLogo.jsx';
import { COLORS, FONTS } from './constants.js';

// ─── Shared Styles ────────────────────────────────────────────
const centerFlex = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'column',
};

const glowText = (size, color = COLORS.green) => ({
  fontFamily: FONTS.mono,
  fontSize: size,
  fontWeight: 700,
  color,
  textShadow: `0 0 20px ${COLORS.greenGlow}, 0 0 40px ${COLORS.greenGlow}`,
  letterSpacing: size > 60 ? 8 : 4,
  textAlign: 'center',
});

const subtitleStyle = {
  fontFamily: FONTS.sans,
  fontSize: 36,
  color: COLORS.textBright,
  textAlign: 'center',
  maxWidth: 1200,
  lineHeight: 1.4,
};

// ─── Scene 1: Logo Reveal (0-2.5s, frames 0-74) ──────────────
function SceneLogoReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 10, stiffness: 60 } });
  const textOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateRight: 'clamp' });
  const taglineY = interpolate(frame, [45, 65], [30, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ ...centerFlex, gap: 10 }}>
      <div style={{ transform: `scale(${logoScale})` }}>
        <ForgeLogo scale={1.2} glowIntensity={1.5} />
      </div>
      <div style={{
        ...glowText(72),
        opacity: textOpacity,
        marginTop: 20,
      }}>
        THE FORGE
      </div>
      <div style={{
        ...subtitleStyle,
        fontSize: 28,
        color: COLORS.text,
        opacity: taglineOpacity,
        transform: `translateY(${taglineY}px)`,
        letterSpacing: 6,
        fontFamily: FONTS.mono,
      }}>
        WHERE AGENTS ARE FORGED
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 2: Value Props (2.5-6s, frames 75-179) ────────────
function SceneValueProps() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const props = [
    {
      icon: '⛏',
      title: 'STAKE',
      subtitle: 'Earn passive yield from every trial',
      highlight: '2,000% APY at launch',
      color: COLORS.green,
    },
    {
      icon: '⚔',
      title: 'BET',
      subtitle: 'Wager on which agents survive',
      highlight: '75% of pool to winners',
      color: COLORS.orange,
    },
    {
      icon: '🔥',
      title: 'COMPETE',
      subtitle: 'Send your agent into the forge',
      highlight: 'Solve puzzles. Win $FORGE.',
      color: COLORS.yellow,
    },
  ];

  return (
    <AbsoluteFill style={{ ...centerFlex }}>
      {/* Header */}
      <div style={{
        ...glowText(48),
        marginBottom: 60,
        opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        THE AGENTIC ECONOMY
      </div>

      {/* Three pillars */}
      <div style={{
        display: 'flex',
        gap: 80,
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}>
        {props.map((prop, i) => {
          const delay = i * 12;
          const slideUp = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 80 } });
          const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
          const yOffset = interpolate(slideUp, [0, 1], [60, 0]);

          return (
            <div
              key={prop.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                opacity,
                transform: `translateY(${yOffset}px)`,
                width: 420,
              }}
            >
              <div style={{ fontSize: 64 }}>{prop.icon}</div>
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: 44,
                fontWeight: 700,
                color: prop.color,
                letterSpacing: 6,
                textShadow: `0 0 15px ${prop.color}44`,
              }}>
                {prop.title}
              </div>
              <div style={{
                fontFamily: FONTS.sans,
                fontSize: 26,
                color: COLORS.text,
                textAlign: 'center',
              }}>
                {prop.subtitle}
              </div>
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: 22,
                color: prop.color,
                padding: '8px 20px',
                border: `1px solid ${prop.color}44`,
                borderRadius: 8,
                background: `${prop.color}11`,
                marginTop: 8,
              }}>
                {prop.highlight}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 3: The Flywheel (6-8s, frames 180-239) ────────────
function SceneFlywheel() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const items = [
    'More stakers',
    'Supply locked',
    'Bigger pools',
    'Better agents',
    'More bettors',
    'Higher yields',
  ];

  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const radius = 280;

  const rotation = interpolate(frame, [0, 60], [0, 360]);

  return (
    <AbsoluteFill style={centerFlex}>
      {/* Title */}
      <div style={{
        position: 'absolute',
        top: 80,
        ...glowText(48),
        opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        THE FLYWHEEL
      </div>

      {/* Rotating ring */}
      <svg width={width} height={height} style={{ position: 'absolute' }}>
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke={COLORS.green}
          strokeWidth="2"
          opacity="0.3"
          strokeDasharray="12 6"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${centerX}px ${centerY}px`,
          }}
        />
        {/* Arrow indicators */}
        {items.map((_, i) => {
          const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
          const arrowAngle = angle + 0.15;
          const ax = centerX + Math.cos(arrowAngle) * (radius + 15);
          const ay = centerY + Math.sin(arrowAngle) * (radius + 15);
          const nodeDelay = i * 5;
          const nodeOpacity = interpolate(frame - nodeDelay, [0, 10], [0, 0.6], { extrapolateRight: 'clamp' });

          return (
            <circle key={i} cx={ax} cy={ay} r="4" fill={COLORS.green} opacity={nodeOpacity} />
          );
        })}
      </svg>

      {/* Labels around the circle */}
      {items.map((item, i) => {
        const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        const nodeDelay = i * 5;
        const opacity = interpolate(frame - nodeDelay, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
        const scale = spring({ frame: frame - nodeDelay, fps, config: { damping: 12, stiffness: 100 } });

        return (
          <div
            key={item}
            style={{
              position: 'absolute',
              left: x - 100,
              top: y - 25,
              width: 200,
              textAlign: 'center',
              fontFamily: FONTS.mono,
              fontSize: 20,
              fontWeight: 600,
              color: COLORS.green,
              opacity,
              transform: `scale(${scale})`,
              background: `${COLORS.bgSurface}dd`,
              padding: '10px 16px',
              borderRadius: 8,
              border: `1px solid ${COLORS.green}33`,
              textShadow: `0 0 10px ${COLORS.greenGlow}`,
            }}
          >
            {item}
          </div>
        );
      })}

      {/* Center text */}
      <div style={{
        position: 'absolute',
        left: centerX - 60,
        top: centerY - 30,
        ...glowText(36),
        opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        (3,3)
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 4: CTA (8-10s, frames 240-299) ────────────────────
function SceneCTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const textOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' });
  const ctaOpacity = interpolate(frame, [25, 40], [0, 1], { extrapolateRight: 'clamp' });
  const ctaScale = spring({ frame: frame - 25, fps, config: { damping: 15, stiffness: 100 } });

  // Pulsing glow on CTA
  const ctaGlow = interpolate(Math.sin(frame * 0.15), [-1, 1], [10, 25]);

  return (
    <AbsoluteFill style={{ ...centerFlex, gap: 30 }}>
      <div style={{ transform: `scale(${logoScale * 0.8})` }}>
        <ForgeLogo scale={0.8} glowIntensity={2} />
      </div>

      <div style={{
        ...glowText(60),
        opacity: textOpacity,
      }}>
        ENTER THE FORGE
      </div>

      <div style={{
        fontFamily: FONTS.sans,
        fontSize: 28,
        color: COLORS.text,
        opacity: textOpacity,
        textAlign: 'center',
        maxWidth: 800,
      }}>
        Stake. Bet. Compete. Earn.
      </div>

      {/* CTA Button */}
      <div style={{
        opacity: ctaOpacity,
        transform: `scale(${ctaScale})`,
        fontFamily: FONTS.mono,
        fontSize: 28,
        fontWeight: 700,
        color: COLORS.bgDeep,
        background: COLORS.green,
        padding: '18px 60px',
        borderRadius: 12,
        letterSpacing: 4,
        boxShadow: `0 0 ${ctaGlow}px ${COLORS.green}, 0 0 ${ctaGlow * 2}px ${COLORS.greenGlow}`,
      }}>
        theforge.gg
      </div>
    </AbsoluteFill>
  );
}

// ─── Main Composition ─────────────────────────────────────────
export function ForgePromo() {
  const frame = useCurrentFrame();

  // Global vignette
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

  // Scanline overlay
  const scanlineOpacity = 0.03;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      {/* Matrix rain background — always present */}
      <MatrixRain opacity={interpolate(frame, [0, 30], [0, 0.12], { extrapolateRight: 'clamp' })} speed={1.2} />

      {/* Scene 1: Logo Reveal (0-2.5s) */}
      <Sequence from={0} durationInFrames={75}>
        <SceneLogoReveal />
      </Sequence>

      {/* Scene 2: Value Props (2.5-6s) */}
      <Sequence from={75} durationInFrames={105}>
        <SceneValueProps />
      </Sequence>

      {/* Scene 3: Flywheel (6-8s) */}
      <Sequence from={180} durationInFrames={60}>
        <SceneFlywheel />
      </Sequence>

      {/* Scene 4: CTA (8-10s) */}
      <Sequence from={240} durationInFrames={60}>
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
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,${scanlineOpacity}) 2px, rgba(0,0,0,${scanlineOpacity}) 4px)`,
        pointerEvents: 'none',
        zIndex: 11,
      }} />
    </AbsoluteFill>
  );
}
