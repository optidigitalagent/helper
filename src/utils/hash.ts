import crypto from 'crypto';

/** Deterministic ID from source + unique key (url, message id, etc.) */
export function makeId(sourceId: string, uniqueKey: string): string {
  return crypto
    .createHash('sha256')
    .update(`${sourceId}::${uniqueKey}`)
    .digest('hex')
    .slice(0, 24);
}
