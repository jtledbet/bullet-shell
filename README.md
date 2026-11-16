# Bullet Shell

Working title. Play the latest build at https://ledsec.dev/bullet-shell/.

A mobile-first, landscape, top-down survival shooter: survive waves, collect XP, pick upgrades.

## Controls

- **Touch:** left thumb anywhere on the left half moves (floating stick). Right thumb on the right half aims. Lift it and shots auto-aim at the nearest enemy.
- **Desktop:** WASD / arrows move. Hold the mouse button to aim; release to auto-aim. Esc or P pauses, M mutes.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, also exposed on your LAN for phone testing
npm run build      # typecheck + production build into dist/
npm run deploy     # build and publish to https://ledsec.dev/bullet-shell/
```

To play on a phone, run `npm run dev` and open the `Network:` URL it prints, with the phone on the same Wi-Fi.

## Layout

```
src/
  main.ts              Phaser config, device-pixel canvas sizing
  display.ts           Pixel ratio and texture scale
  upgrades.ts          Player stats and the level-up upgrade pool
  audio.ts             Synthesised sound effects (Web Audio, no asset files)
  storage.ts           Saved mute setting and best run (localStorage)
  input/TwinStick.ts   Floating twin touch joysticks
  scenes/
    BootScene.ts       Generates placeholder textures
    GameScene.ts       World, player, enemies, bullets, XP, spawning
    UIScene.ts         Screen-space HUD, sticks, menus
```

## Design notes

- The camera follows the player in an arena larger than the screen. Zoom keeps the visible world area constant (about 960x540), so screen size doesn't change how much you can see. Portrait can be added later without rebalancing.
- The canvas renders in device pixels (pixel ratio capped at 3) and is zoomed back down to CSS size, so it stays sharp on phone screens. The UI scene lays out in CSS pixels and zooms its camera by the pixel ratio; textures are generated at 4x (`TEX_SCALE`) and drawn scaled down.
- Enemies spawn just outside the camera view, relative to the camera.
- Bullets, enemies, and gems are pooled (no per-shot allocation of game objects).
- Menus ignore taps for 400 ms after opening, and a choice needs press and release on the same card, so a thumb lifting mid-fight can't pick an upgrade by accident.
- Sound is generated in code, and starts on the first touch or key press because browsers block audio before that. The mute setting and the longest run are saved in the browser's localStorage, so they are per device and per browser.
