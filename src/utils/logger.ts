// ─── Safe serializer ──────────────────────────────────────────────────────────
// Never pass raw Error or response objects to console — they may contain
// circular HTTP structures that Node serializes into thousands of lines.

function safe(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error)   return arg.message;
  if (arg === null || arg === undefined) return String(arg);
  try {
    const s = JSON.stringify(arg);
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

export const logger = {
  info:  (...args: unknown[]) => console.log( '[INFO]',  new Date().toISOString(), ...args.map(safe)),
  warn:  (...args: unknown[]) => console.warn('[WARN]',  new Date().toISOString(), ...args.map(safe)),
  error: (...args: unknown[]) => console.error('[ERROR]', new Date().toISOString(), ...args.map(safe)),
};

// ─── Throttled error logger ───────────────────────────────────────────────────

const _throttleMap = new Map<string, number>();

export function throttledError(prefix: string, detail: string, intervalMs = 30_000): void {
  const key = `${prefix}::${detail.slice(0, 80)}`;
  const now = Date.now();
  if ((now - (_throttleMap.get(key) ?? 0)) < intervalMs) return;
  _throttleMap.set(key, now);
  logger.error(prefix, detail);
}
