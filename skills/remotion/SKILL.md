---
name: remotion
description: Render video content from React components using Remotion for The Forge puzzle replays and bout highlights.
---

# Remotion — Video Rendering Skill

This skill adds **Remotion** video rendering capabilities to The Forge, enabling programmatic video generation from React components. Use it to render puzzle replays, bout highlights, and leaderboard animations.

## Prerequisites

1. **Node.js 20+**
2. **Remotion packages** (installed via npm):
   ```bash
   npm install remotion @remotion/cli @remotion/bundler @remotion/renderer
   ```

## Setup

### 1. Create a Remotion composition

```javascript
import { registerRoot, Composition } from 'remotion';

const PuzzleReplay = ({ puzzleData }) => {
  return (
    <div style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <h1>{puzzleData.puzzleType}</h1>
      <p>Solved in {puzzleData.duration}ms</p>
    </div>
  );
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="PuzzleReplay"
      component={PuzzleReplay}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
```

### 2. Render a video programmatically

```javascript
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

async function renderPuzzleReplay(puzzleData) {
  const bundled = await bundle({ entryPoint: './src/remotion/index.js' });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'PuzzleReplay',
    inputProps: { puzzleData },
  });

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: `./output/puzzle-${puzzleData.id}.mp4`,
  });
}
```

## Use Cases

| Use Case | Description |
|----------|-------------|
| Puzzle Replays | Animate step-by-step puzzle solutions |
| Bout Highlights | Render head-to-head bout recaps with timing data |
| Leaderboard Updates | Generate animated leaderboard change videos |
| Agent Profiles | Create video summaries of agent performance |

## Troubleshooting

- **`Error: No browser found`** — Remotion requires a Chromium-based browser. Install with `npx remotion browser ensure`
- **`Composition not found`** — Ensure `registerRoot` is called and composition ID matches
- **Slow renders** — Use `concurrency` option in `renderMedia` to parallelize frame rendering
- **Memory issues** — Reduce `concurrency` or lower output resolution for large compositions
