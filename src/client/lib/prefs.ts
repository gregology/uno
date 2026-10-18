/** Small per-phone preferences. Storage can be unavailable (private mode), so every access is guarded. */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the phone just won't remember this.
  }
}

function randomToken(): string {
  // crypto.randomUUID needs a secure context; getRandomValues works on plain http too (LAN testing).
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let sessionToken: string | null = null;

/** Identifies this phone to the server so it can reclaim its seat after a reconnect. */
export function getToken(): string {
  sessionToken ??= read('uno.token');
  if (!sessionToken) {
    sessionToken = randomToken();
    write('uno.token', sessionToken);
  }
  return sessionToken;
}

export const prefs = {
  get name() {
    return read('uno.name') ?? '';
  },
  set name(value: string) {
    write('uno.name', value);
  },
  get avatar() {
    return read('uno.avatar');
  },
  set avatar(value: string | null) {
    if (value) write('uno.avatar', value);
  },
  get muted() {
    return read('uno.muted') === '1';
  },
  set muted(value: boolean) {
    write('uno.muted', value ? '1' : '0');
  },
};
