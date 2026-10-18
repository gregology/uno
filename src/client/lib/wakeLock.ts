/** Keep the screen on while at the table. Supported by iOS Safari 16.4+ and Chromium. */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied or unsupported (e.g. low battery mode); the game still works.
  }
}

document.addEventListener('visibilitychange', () => void acquire());

export function keepAwake(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else {
    void sentinel?.release();
    sentinel = null;
  }
}
