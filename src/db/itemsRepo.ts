import { getDb } from './client';
import { NormalizedItem, Category, SourceType } from '../types';
import { makeId } from '../utils/hash';

/** Upsert items; returns estimated count of newly inserted rows */
export async function upsertItems(items: NormalizedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const rows = items.map((item) => ({
    id:           item.id,
    source_id:    item.source,
    source_name:  item.sourceName ?? item.source,
    category:     item.category,
    title:        item.title,
    body:         item.content,           // DB column is still "body"
    url:          item.url ?? null,
    published_at: item.timestamp.toISOString(),
    fetched_at:   (item.fetchedAt ?? new Date()).toISOString(),
    score:        item.score ?? 0,
    tags:         item.tags ?? [],
    raw:          item.raw ?? {},
  }));

  const { error, count } = await getDb()
    .from('content_items')
    .upsert(rows, { onConflict: 'id', count: 'estimated' });

  if (error) throw new Error(`upsertItems failed: ${error.message}`);
  return count ?? 0;
}

/** Fetch unsent items newer than `since`, ordered by score desc */
export async function getUnsentItems(
  since: Date,
  limit = 40,
): Promise<NormalizedItem[]> {
  const { data, error } = await getDb()
    .from('content_items')
    .select('*')
    .eq('sent', false)
    .gte('published_at', since.toISOString())
    .order('score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getUnsentItems failed: ${error.message}`);
  return (data ?? []).map(rowToItem);
}

/** Mark items as sent so they are excluded from future digests */
export async function markSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getDb()
    .from('content_items')
    .update({ sent: true })
    .in('id', ids);
  if (error) throw new Error(`markSent failed: ${error.message}`);
}

/** Persist a digest record for archiving */
export async function saveDigest(markdown: string, itemIds: string[]): Promise<void> {
  const { error } = await getDb()
    .from('digests')
    .insert({ markdown, item_ids: itemIds });
  if (error) throw new Error(`saveDigest failed: ${error.message}`);
}

/** Save a manually-added URL for inclusion in the next digest */
export async function saveManualItem(url: string, note: string): Promise<void> {
  const id    = makeId('manual', url);
  const title = note.trim() || url;
  const row   = {
    id,
    source_id:    'manual',
    source_name:  'Manual',
    category:     Category.Opportunities,   // manual = actionable by default
    title,
    body:         note.trim() || url,
    url,
    published_at: new Date().toISOString(),
    fetched_at:   new Date().toISOString(),
    score:        80,    // always high — user explicitly flagged it
    tags:         ['manual'],
    raw:          { addedManually: true },
    sent:         false,
  };

  const { error } = await getDb()
    .from('content_items')
    .upsert(row, { onConflict: 'id' });

  if (error) throw new Error(`saveManualItem failed: ${error.message}`);
}

export interface SourceStat {
  sourceId:   string;
  sourceName: string;
  total:      number;
  sent:       number;
  lastSeen:   string | null;
}

/** Per-source hit counts over the last `days` days */
export async function getSourceStats(days = 7): Promise<SourceStat[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await getDb()
    .from('content_items')
    .select('source_id, source_name, sent, published_at')
    .gte('published_at', since);

  if (error) throw new Error(`getSourceStats failed: ${error.message}`);

  const map = new Map<string, SourceStat>();
  for (const row of data ?? []) {
    const id   = row.source_id   as string;
    const name = row.source_name as string;
    const sent = row.sent        as boolean;
    const pub  = row.published_at as string;

    if (!map.has(id)) map.set(id, { sourceId: id, sourceName: name, total: 0, sent: 0, lastSeen: null });
    const stat = map.get(id)!;
    stat.total++;
    if (sent) stat.sent++;
    if (!stat.lastSeen || pub > stat.lastSeen) stat.lastSeen = pub;
  }

  return [...map.values()].sort((a, b) => b.sent - a.sent);
}

/** Get last saved digest */
export async function getLastDigest(): Promise<{ markdown: string; createdAt: string } | null> {
  const { data, error } = await getDb()
    .from('digests')
    .select('markdown, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`getLastDigest failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return { markdown: row.markdown as string, createdAt: row.created_at as string };
}

// ── Internal mapper ───────────────────────────────────────────────────────────

function rowToItem(row: Record<string, unknown>): NormalizedItem {
  return {
    id:         row.id          as string,
    source:     row.source_id   as string,
    sourceName: row.source_name as string,
    sourceType: SourceType.RSS,           // default; source of truth is the adapter
    category:   row.category    as Category,
    title:      row.title       as string,
    content:    row.body        as string, // DB column is "body"
    url:        (row.url as string | null) ?? undefined,
    timestamp:  new Date(row.published_at as string),
    fetchedAt:  new Date(row.fetched_at   as string),
    score:      row.score       as number,
    tags:       row.tags        as string[],
    raw:        (row.raw as Record<string, unknown>) ?? {},
  };
}
