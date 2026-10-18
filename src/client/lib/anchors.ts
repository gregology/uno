/**
 * Named DOM elements that animations fly between (the deck, the discard pile,
 * each player's badge, cards in your hand). Measured just before a new state renders.
 */
const elements = new Map<string, HTMLElement>();
const refs = new Map<string, (el: HTMLElement | null) => () => void>();

export function anchor(key: string): (el: HTMLElement | null) => () => void {
  let ref = refs.get(key);
  if (!ref) {
    ref = (el) => {
      if (el) elements.set(key, el);
      return () => {
        // An element animating out must not unregister the one that replaced it.
        if (elements.get(key) === el) elements.delete(key);
      };
    };
    refs.set(key, ref);
  }
  return ref;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxOf(key: string): Box | null {
  const el = elements.get(key);
  if (!el?.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
}
