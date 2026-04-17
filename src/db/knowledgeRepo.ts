import { getDb }   from './client';
import { makeId }  from '../utils/hash';
import { upsertItems } from './itemsRepo';
import { LinkAnalysis, DiscoveredEntity, analysisToItem } from '../services/linkAnalyzer';
import { addInterestKeywords } from './userSourcesRepo';
import { logger } from '../utils/logger';

// ─── analyzed_links ───────────────────────────────────────────────────────────
// Table DDL: see src/db/migrations/knowledge_tables.sql

export async function saveAnalysis(analysis: LinkAnalysis): Promise<string> {
  const id  = makeId('analyzed_link', analysis.url);
  const row = {
    id,
    url:             analysis.url,
    title:           analysis.title,
    source_name:     analysis.source_name,
    content_type:    analysis.content_type,
    knowledge_type:  analysis.knowledge_type,
    category:        analysis.category,
    summary:         analysis.summary,
    why_it_matters:  analysis.why_it_matters,
    practical_value: analysis.practical_value,
    use_case:        analysis.use_case,
    quality_score:   analysis.quality_score,
    should_save:     analysis.should_save,
    raw_analysis:    analysis as unknown as Record<string, unknown>,
    created_at:      new Date().toISOString(),
  };

  const { error } = await getDb()
    .from('analyzed_links')
    .upsert(row, { onConflict: 'id' });

  if (error) throw new Error(`saveAnalysis failed: ${error.message}`);
  return id;
}

// ─── discovered_entities ──────────────────────────────────────────────────────

export async function saveDiscoveredEntities(
  entities:    DiscoveredEntity[],
  mentionedIn: string,
): Promise<void> {
  if (entities.length === 0) return;

  const rows = entities.map((e) => ({
    id:           makeId('entity', `${e.type}_${e.name}`),
    entity_type:  e.type,
    name:         e.name,
    url:          e.url  ?? null,
    mentioned_in: mentionedIn,
    notes:        e.notes ?? null,
    created_at:   new Date().toISOString(),
  }));

  const { error } = await getDb()
    .from('discovered_entities')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw new Error(`saveDiscoveredEntities failed: ${error.message}`);
}

// ─── Ingest into daily digest pipeline ───────────────────────────────────────

/**
 * Persist a high-quality analysis into the content_items table
 * so it naturally flows into the next /brief.
 * Also extracts interest keywords for future ranking.
 */
export async function ingestAnalysisForDigest(analysis: LinkAnalysis): Promise<void> {
  const item = analysisToItem(analysis);
  await upsertItems([item]);
  logger.info(`[knowledgeRepo] ingested analyzed link for digest: ${item.id}`);

  // Extract keywords for interest tracking
  const kwText = `${analysis.knowledge_type} ${analysis.category} ${
    analysis.discovered_entities.map((e) => e.name).join(' ')
  } ${analysis.title}`;

  const keywords = kwText
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 10);

  await addInterestKeywords(keywords).catch(() => {});
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface StoredAnalysis {
  id:            string;
  url:           string;
  title:         string;
  source_name:   string;
  knowledge_type: string;
  quality_score: number;
  should_save:   boolean;
  created_at:    string;
}

/** List recent analyzed links, newest first. */
export async function listAnalyzedLinks(limit = 20): Promise<StoredAnalysis[]> {
  const { data, error } = await getDb()
    .from('analyzed_links')
    .select('id, url, title, source_name, knowledge_type, quality_score, should_save, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];   // graceful — table might not exist yet
  return (data ?? []) as StoredAnalysis[];
}

/** List discovered entities, optionally filtered by type. */
export async function listDiscoveredEntities(
  type?: DiscoveredEntity['type'],
  limit = 30,
): Promise<{ name: string; url: string | null; notes: string | null; entity_type: string }[]> {
  let query = getDb()
    .from('discovered_entities')
    .select('name, url, notes, entity_type')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('entity_type', type);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as { name: string; url: string | null; notes: string | null; entity_type: string }[];
}
