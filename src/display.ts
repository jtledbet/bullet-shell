/** Device pixels per CSS pixel, capped to keep fill cost sane on very dense screens. */
const deviceRatio = () => Math.min(window.devicePixelRatio || 1, 3);

/**
 * Lowered a step at a time when frames stay slow (see main.ts): a machine that can't keep up
 * draws fewer pixels, trading some sharpness for speed. Never below MIN_RATIO pixels per CSS pixel.
 */
let quality = 1;
const MIN_RATIO = 0.6;

/** Pixels drawn per CSS pixel. */
export const pixelRatio = () => deviceRatio() * quality;

/** Drops the render size one step. Returns false once it is as low as it goes. */
export function lowerQuality() {
  const next = Math.max(MIN_RATIO / deviceRatio(), quality * 0.8);
  if (next >= quality) return false;
  quality = next;
  return true;
}

/**
 * Textures are generated this many times larger than their world size, then drawn scaled
 * down, so they stay sharp when the camera zooms in on dense or large screens.
 * Texture sizes are kept power-of-two so mipmaps keep the downscale clean.
 */
export const TEX_SCALE = 4;
