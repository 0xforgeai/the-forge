import React from 'react';
import { Composition } from 'remotion';
import { ForgePromo } from './ForgePromo.jsx';
import { StakingLive } from './StakingLive.jsx';
import { WIDTH, HEIGHT, FPS, DURATION_FRAMES } from './constants.js';

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="ForgePromo"
        component={ForgePromo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
      <Composition
        id="StakingLive"
        component={StakingLive}
        durationInFrames={240}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
    </>
  );
}
