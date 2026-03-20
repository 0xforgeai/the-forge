import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BROWSER = '/usr/bin/google-chrome-stable';

async function render() {
  console.log('Bundling Remotion project...');
  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, './index.js'),
    webpackOverride: (config) => config,
  });

  console.log('Selecting StakingLive composition...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'StakingLive',
    browserExecutable: BROWSER,
    chromeMode: 'chrome-for-testing',
  });

  const outputPath = path.resolve(__dirname, '../../output/staking-live.mp4');
  console.log(`Rendering to ${outputPath}...`);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    browserExecutable: BROWSER,
    chromeMode: 'chrome-for-testing',
  });

  console.log(`Done! Video saved to ${outputPath}`);
}

render().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
