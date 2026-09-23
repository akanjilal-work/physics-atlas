// Per-viewer challenge progress. Browser storage may be unavailable, so every
// access is guarded and the app works without it.

const KEY = (topic: string) => `physics-atlas:done:${topic}`;

export function getDone(topic: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY(topic));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markDone(topic: string, id: string): void {
  try {
    const s = getDone(topic);
    s.add(id);
    localStorage.setItem(KEY(topic), JSON.stringify([...s]));
  } catch {
    /* storage unavailable */
  }
}

export function resetDone(topic: string): void {
  try {
    localStorage.removeItem(KEY(topic));
  } catch {
    /* storage unavailable */
  }
}
