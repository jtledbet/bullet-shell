/** Fullscreen works in Android browsers and on desktop. iPhone Safari has no fullscreen API, so no button there. */
export const canFullscreen = () => !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';

/** Enters fullscreen (locking to landscape where the browser allows it), or leaves it. Must run inside a tap. */
export function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => orientation?.lock?.('landscape'))
    .catch(() => {});
}
