/** Device pixels per CSS pixel, capped to keep fill cost sane on very dense screens. */
export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 3);

/**
 * Textures are generated this many times larger than their world size, then drawn scaled
 * down, so they stay sharp when the camera zooms in on dense or large screens.
 * Texture sizes are kept power-of-two so mipmaps keep the downscale clean.
 */
export const TEX_SCALE = 4;
