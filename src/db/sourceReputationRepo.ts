import { getDb }  from './client';
import { logger } from '../utils/logger';

export type SourceStatus = 'candidate' | 'tracked' | 'trusted' | 'rejected';

export interface SourceReputation {
  sourceId:     string;
  sourceName:   string;
  feedUrl:      string | null;
  avgQuality:   number;
  signalCount:  number;
  sentCount:    number;
  status:       SourceStatus;
  lastSignalAt: string | null;
  notes:        string | null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Record a quality signal for a source.
 * Called when: user submits a link, or items from this source are sent in a digest.
 */
export async function recordSourceSignal(
  sourceId:    string,
  sourceName:  string,
  feedUrl:     string | undefined,
  qualityScore: number,
  type:        'user_submit' | 'digest_sent',
): Promise<void> {
  try {
    const { data: existing } = await getDb()
      .from('source_reputation')
      .select('avg_quality, signal_count, sent_count')
      .eq('source_id', sourceId)
      .single();

    const prev       = existing ?? { avg_quality: 0, signal_count: 0, sent_count: 0 };
    const newCount   = (prev.signal_count as number) + 1;
    const newAvg     = ((prev.avg_quality as number) * (prev.signal_count as number) + qualityScore) / newCount;
    const newSent    = (prev.sent_count as number) + (type === 'digest_sent' ? 1 : 0);

    // Auto-promote: 3+ signals with avg≥65 → tracked; 6+ avg≥75 → trusted
    const currentStatus = (await getSourceStatus(sourceId)) ?? 'candidate';
    let newStatus: SourceStatus = currentStatus;
    if (currentStatus === 'candidate' && newCount >= 3 && newAvg >= 65) newStatus = 'tracked';
    if (currentStatus === 'tracked'   && newCount >= 6 && newAvg >= 75) newStatus = 'trusted';

    await getDb().from('source_reputation').upsert({
      source_id:      sourceId,
      source_name:    sourceName,
      feed_url:       feedUrl ?? null,
      avg_quality:    Math.round(newAvg * 10) / 10,
      signal_count:   newCount,
      sent_count:     newSent,
      status:         newStatus,
      last_signal_at: new Date().toISOString(),
    }, { onConflict: 'source_id' });
  } catch (err) {
    logger.warn(`[sourceReputation] recordSignal failed: ${(err as Error).message}`);
  }
}

export async function setSourceStatus(sourceId: string, status: SourceStatus): Promise<void> {
  const { error } = await getDb()
    .from('source_reputation')
    .update({ status })
    .eq('source_id', sourceId);
  if (error) throw new Error(`setSourceStatus failed: ${error.message}`);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSourceReputation(sourceId: string): Promise<SourceReputation | null> {
  const { data } = await getDb()
    .from('source_reputation')
    .select('*')
    .eq('source_id', sourceId)
    .single();
  return data ? rowToRep(data) : null;
}

async function getSourceStatus(sourceId: string): Promise<SourceStatus | null> {
  const { data } = await getDb()
    .from('source_reputation')
    .select('status')
    .eq('source_id', sourceId)
    .single();
  return data ? (data.status as SourceStatus) : null;
}

export async function listSourceReputations(
  status?: SourceStatus,
  limit = 20,
): Promise<SourceReputation[]> {
  let q = getDb()
    .from('source_reputation')
    .select('*')
    .order('avg_quality', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []).map(rowToRep);
}

/** Returns a map of sourceId → reputation bonus (0–15) for use in ranking. */
export async function getReputationBonuses(): Promise<Map<string, number>> {
  const { data } = await getDb()
    .from('source_reputation')
    .select('source_id, avg_quality, status')
    .in('status', ['tracked', 'trusted']);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const q      = row.avg_quality as number;
    const trusted = row.status === 'trusted';
    const bonus  = Math.min(trusted ? 15 : 10, Math.round((q - 60) / 4));
    if (bonus > 0) map.set(row.source_id as string, bonus);
  }
  return map;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function rowToRep(r: Record<string, unknown>): SourceReputation {
  return {
    sourceId:     r.source_id     as string,
    sourceName:   r.source_name   as string,
    feedUrl:      (r.feed_url     as string | null) ?? null,
    avgQuality:   r.avg_quality   as number,
    signalCount:  r.signal_count  as number,
    sentCount:    r.sent_count    as number,
    status:       r.status        as SourceStatus,
    lastSignalAt: (r.last_signal_at as string | null) ?? null,
    notes:        (r.notes        as string | null) ?? null,
  };
}
