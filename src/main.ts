import Phaser from 'phaser';
import { audioState, playCounts } from './audio';
import { musicState } from './music';
import { lowerQuality, pixelRatio } from './display';
import { canFullscreen, toggleFullscreen } from './fullscreen';
import { FULLSCREEN } from './controls';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

/** e.g. "v0.7.0 · 06e8797". Also in the pause menu. */
export const VERSION = `v${__APP_VERSION__} · ${__APP_COMMIT__}`;
console.info(`bullet shell ${VERSION}`);

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

// A machine that can't keep up: when frames stay slow for several seconds, draw fewer pixels.
// `?fullres` turns this off (test scripts use it).
const SLOW_FRAME_MS = 28;
const WATCH_MS = 3000;
const watchSpeed = !new URLSearchParams(window.location.search).has('fullres');
let watched = 0;
let frames = 0;
let slowSpells = 0;
game.events.on(Phaser.Core.Events.POST_STEP, () => {
  if (!watchSpeed || document.hidden || !document.hasFocus()) return void (watched = frames = 0);
  const ms = game.loop.rawDelta;
  // A one-off hitch (a tab switch, a load) isn't a trend.
  if (ms > 250) return;
  watched += ms;
  frames++;
  if (watched < WATCH_MS) return;
  slowSpells = watched / frames > SLOW_FRAME_MS ? slowSpells + 1 : 0;
  watched = frames = 0;
  if (slowSpells < 2) return;
  slowSpells = 0;
  if (lowerQuality()) console.info(`bullet shell: slow frames, drawing at ${pixelRatio().toFixed(2)}x`);
});

// The "turn your phone" screen's fullscreen button: fullscreen locks to landscape where the browser allows.
const rotateFull = document.getElementById('rotate-full');
if (rotateFull) {
  if (canFullscreen()) rotateFull.addEventListener('click', toggleFullscreen);
  else rotateFull.remove();
}

// F toggles fullscreen on a keyboard, like the corner button.
if (canFullscreen()) {
  window.addEventListener('keydown', (e) => {
    if (e.code === FULLSCREEN.code && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen();
  });
}

// Dev-only handle for poking at state from the console or test scripts.
if (import.meta.env.DEV) Object.assign(window, { game, audioDebug: () => ({ state: audioState(), counts: { ...playCounts }, music: musicState() }) });
