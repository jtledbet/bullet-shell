/**
 * What the player presses for each action, in one place. Keyboard only for now; when
 * controllers arrive, this is where their buttons (and the glyphs shown on screen) will be chosen.
 */
export const POWER = {
  /** Phaser's key name, for `keydown-<key>`. */
  key: 'E',
  /** What is shown on the power button, and on the card that introduces a power. */
  glyph: 'e',
  /** The mouse button that does the same, also named on that card. */
  mouse: 'right-click',
};

export const FULLSCREEN = {
  /** KeyboardEvent.code. Listened for on the page itself: browsers only allow fullscreen from inside the key press. */
  code: 'KeyF',
};
