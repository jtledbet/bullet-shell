import { devLog } from './devlog';

/** Fullscreen works in Android browsers and on desktop. iPhone Safari has no fullscreen API, so no button there. */
export const canFullscreen = () => !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';

/** Enters fullscreen (locking to landscape where the browser allows it), or leaves it. Must run inside a tap. */
export function toggleFullscreen() {
  if (document.fullscreenElement) {
    devLog('toggle: leaving fullscreen');
    void document.exitFullscreen().catch((e) => devLog(`leaving fullscreen failed: ${e}`));
    return;
  }
  devLog('toggle: asking for fullscreen');
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      devLog('fullscreen granted');
      if (!orientation?.lock) return devLog('no landscape lock in this browser');
      return orientation.lock('landscape').then(
        () => devLog('landscape locked'),
        (e) => devLog(`landscape lock refused: ${e}`),
      );
    })
    .catch((e) => devLog(`fullscreen refused: ${e}`));
}
