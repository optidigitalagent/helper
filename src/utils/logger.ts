// ─── Logger ───────────────────────────────────────────────────────────────────

export const logger = {
  info:  (...args: unknown[]) => console.log('[INFO]',  new Date().toISOString(), ...args),
  warn:  (...args: unknown[]) => console.warn('[WARN]',  new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', new Date().toISOString(), ...args),
};

// ─── Throttled error logger ───────────────────────────────────────────────────
// Prevents log floods when the same error fires in a tight loop.
// Logs the first occurrence immediately, then once per `intervalMs`.

const _throttleMap = new Map<string, number>();

export function throttledError(prefix: string, detail: string, intervalMs = 30_000): void {
  const key = `${prefix}::${detail}`;
  const now = Date.now();
  const last = _throttleMap.get(key) ?? 0;
  if (now - last < intervalMs) return;
  _throttleMap.set(key, now);
  logger.error(prefix, detail);
}
