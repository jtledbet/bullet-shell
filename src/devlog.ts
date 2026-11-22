import Phaser from 'phaser';
import { devOn } from './storage';

/**
 * `?dev` only: a small on-page log of fullscreen, focus, size and error events, for catching bugs
 * that only happen on a real phone. Plain HTML over the game, so it still shows if the game stops
 * drawing, and it never takes a tap. Nothing leaves the page.
 */
const MAX_LINES = 14;
const lines: string[] = [];
const t0 = performance.now();
let body: HTMLDivElement | undefined;

/** Adds a timestamped line (seconds since the page loaded). Does nothing without `?dev`. */
export function devLog(msg: string) {
  if (!body) return;
  lines.push(`${((performance.now() - t0) / 1000).toFixed(2)}  ${msg}`);
  if (lines.length > MAX_LINES) lines.shift();
  body.textContent = lines.join('\n');
}

const fsState = () => (document.fullscreenElement ? 'fullscreen' : 'not fullscreen');
const windowSize = () => `${innerWidth}x${innerHeight}`;

export function startDevLog(game: Phaser.Game) {
  if (!devOn()) return;
  const box = document.createElement('div');
  box.id = 'devlog';
  box.style.cssText =
    'position:fixed;left:8px;top:40%;max-width:70vw;z-index:1000;pointer-events:none;font:10px/1.35 monospace;color:#cbd5e1;background:rgba(2,6,23,.75);padding:4px 6px;';
  const head = document.createElement('div');
  head.style.color = '#fbbf24';
  body = document.createElement('div');
  body.style.whiteSpace = 'pre';
  box.append(head, body);
  document.body.append(box);

  // The frame count runs on its own timer, so a game that has stopped shows as a count that stops climbing.
  let frames = 0;
  game.events.on(Phaser.Core.Events.POST_STEP, () => frames++);
  const drawHead = () => {
    head.textContent = `frames ${frames} · ${fsState()} · window ${windowSize()} · canvas ${game.canvas.width}x${game.canvas.height} · ${screen.orientation?.type ?? 'no orientation'}`;
  };
  drawHead();
  setInterval(drawHead, 250);

  const log = (target: EventTarget, type: string, text: () => string) => target.addEventListener(type, () => devLog(text()));
  log(document, 'fullscreenchange', () => `fullscreenchange: now ${fsState()}`);
  log(document, 'fullscreenerror', () => 'fullscreenerror');
  log(document, 'visibilitychange', () => `page ${document.visibilityState}`);
  log(window, 'blur', () => 'window lost focus');
  log(window, 'focus', () => 'window got focus');
  log(window, 'resize', () => `resize: window ${windowSize()}`);
  if (screen.orientation) log(screen.orientation, 'change', () => `orientation: ${screen.orientation.type}`);
  log(game.canvas, 'webglcontextlost', () => 'webgl context lost');
  log(game.canvas, 'webglcontextrestored', () => 'webgl context restored');
  window.addEventListener('error', (e) => devLog(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => devLog(`unhandled: ${String(e.reason)}`));
  const browser = navigator.userAgent.match(/Android [\d.]+|Chrome\/[\d.]+|Firefox\/[\d.]+|Version\/[\d.]+ Safari/g)?.join(' ') ?? 'unknown browser';
  devLog(`log started · ${browser}`);
}
