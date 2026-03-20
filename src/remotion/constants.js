// Brand constants for The Forge promo video
export const COLORS = {
  green: '#4ADE80',
  greenDim: '#3BB368',
  greenGlow: 'rgba(74, 222, 128, 0.25)',
  orange: '#ff6b2b',
  yellow: '#ffd700',
  purple: '#8b5cf6',
  red: '#ff3333',
  bgDeep: '#0a0a0a',
  bgSurface: '#111111',
  bgRaised: '#1a1a1a',
  text: '#c8c8c8',
  textDim: '#555555',
  textBright: '#e8e8e8',
  border: '#1e1e1e',
};

export const FONTS = {
  mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Courier New', monospace",
  sans: "'Inter', -apple-system, sans-serif",
};

// Video specs: 12 seconds at 30fps = 360 frames
export const FPS = 30;
export const DURATION_SECONDS = 12;
export const DURATION_FRAMES = FPS * DURATION_SECONDS;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Matrix rain characters from the brand
export const MATRIX_CHARS = 'FORGE$01ΣΔΩ█▓▒░αβγ'.split('');
