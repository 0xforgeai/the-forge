import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, random } from 'remotion';
import { COLORS, MATRIX_CHARS } from './constants.js';

// Deterministic matrix rain for Remotion (no canvas, pure SVG/div for frame-perfect rendering)
export function MatrixRain({ opacity = 0.15, speed = 1 }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const colWidth = 14;
  const rowHeight = 14;
  const cols = Math.floor(width / colWidth);
  const rows = Math.floor(height / rowHeight) + 5;

  // Pre-generate column data deterministically
  const columns = useMemo(() => {
    return Array.from({ length: cols }, (_, colIndex) => {
      const startOffset = Math.floor(random(`col-start-${colIndex}`) * rows);
      const columnSpeed = 0.8 + random(`col-speed-${colIndex}`) * 0.6;
      const chars = Array.from({ length: rows * 3 }, (_, rowIndex) => {
        const charIndex = Math.floor(random(`char-${colIndex}-${rowIndex}`) * MATRIX_CHARS.length);
        return MATRIX_CHARS[charIndex];
      });
      return { startOffset, columnSpeed, chars };
    });
  }, [cols, rows]);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width,
      height,
      overflow: 'hidden',
      opacity,
    }}>
      {columns.map((col, colIndex) => {
        const yOffset = (frame * speed * col.columnSpeed + col.startOffset * rowHeight) % (rows * rowHeight);

        return Array.from({ length: rows }, (_, rowIndex) => {
          const y = (rowIndex * rowHeight + yOffset) % (rows * rowHeight) - rowHeight * 2;
          if (y < -rowHeight || y > height + rowHeight) return null;

          // Fade based on position in column
          const distFromHead = (rows - rowIndex) / rows;
          const charOpacity = Math.max(0, 1 - distFromHead * 1.5);

          // Occasionally swap characters for shimmer effect
          const charSwapFrame = Math.floor(random(`swap-${colIndex}-${rowIndex}`) * 20);
          const shouldSwap = frame % 20 === charSwapFrame;
          const charIdx = shouldSwap
            ? Math.floor(random(`swap-char-${colIndex}-${rowIndex}-${frame}`) * MATRIX_CHARS.length)
            : rowIndex % col.chars.length;

          return (
            <span
              key={`${colIndex}-${rowIndex}`}
              style={{
                position: 'absolute',
                left: colIndex * colWidth,
                top: y,
                color: COLORS.green,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                lineHeight: '14px',
                opacity: charOpacity,
                textShadow: charOpacity > 0.8 ? `0 0 8px ${COLORS.green}` : 'none',
              }}
            >
              {col.chars[charIdx]}
            </span>
          );
        });
      })}
    </div>
  );
}
