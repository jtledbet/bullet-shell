import Phaser from 'phaser';
import { audioState, playCounts } from './audio';
import { pixelRatio } from './display';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const parent = document.getElementById('game')!;
const dpr = pixelRatio();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#020617',
  // The canvas is sized in device pixels and zoomed back down to CSS size, so dense phone
  // screens render sharp. Phaser's RESIZE mode only sizes in CSS pixels (and applies a stale
  // size on rotation), so fit() below does the sizing instead.
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(parent.clientWidth * dpr),
    height: Math.round(parent.clientHeight * dpr),
    zoom: 1 / dpr,
  },
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  // Sound is synthesised in audio.ts; Phaser's own sound manager would open a second audio context.
  audio: { noAudio: true },
  physics: { default: 'arcade', arcade: { debug: false } },
  // Mouse + two thumbs.
  input: { activePointers: 3 },
  scene: [BootScene, GameScene, UIScene],
});

/** Keeps the canvas matched to its container. Polled each frame: resize and rotation events are unreliable on phones. */
function fit() {
  const ratio = pixelRatio();
  const w = Math.round(parent.clientWidth * ratio);
  const h = Math.round(parent.clientHeight * ratio);
  if (w === 0 || h === 0) return;
  if (Math.abs(game.scale.zoom - 1 / ratio) > 1e-6) game.scale.setZoom(1 / ratio);
  if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
}
game.events.on(Phaser.Core.Events.POST_STEP, fit);

// Dev-only handle for poking at state from the console or test scripts.
if (import.meta.env.DEV) Object.assign(window, { game, audioDebug: () => ({ state: audioState(), counts: { ...playCounts } }) });
