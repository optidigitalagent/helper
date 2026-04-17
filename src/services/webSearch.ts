import { tavily } from '@tavily/core';
import { NormalizedItem, Category, SourceType } from '../types';
import { makeId } from '../utils/hash';
import { logger } from '../utils/logger';

// ─── Config ───────────────────────────────────────────────────────────────────

const TAVILY_KEY = process.env.TAVILY_API_KEY ?? '';
const ENABLED    = Boolean(TAVILY_KEY);

// ─── Search queries per category ─────────────────────────────────────────────
// Each query is used when that category has < MIN_ITEMS_THRESHOLD items

const MIN_ITEMS_THRESHOLD = 3;

const CATEGORY_QUERIES: Partial<Record<Category, string>> = {
  [Category.AI]:            'new AI tools models released latest 2025',
  [Category.Opportunities]: 'new AI productivity automation tools open source',
  [Category.MarketSignals]: 'stock market macro economy tech funding news today',
  [Category.Crypto]:        'crypto bitcoin market on-chain analysis today',
  [Category.Thinking]:      'startup founder strategy business model insight essay',
  [Category.Learning]:      'AI machine learning deep dive research explained',
  [Category.Podcast]:       'tech AI podcast episode interview latest',
};

// ─── Converter ───────────────────────────────────────────────────────────────

function tavilyResultToItem(
  r: { title?: string; url: string; content?: string; publishedDate?: string },
  category: Category,
): NormalizedItem {
  const now = new Date();
  return {
    id:         makeId('tavily', r.url),
    source:     'tavily_search',
    sourceName: 'Web Search',
    sourceType: SourceType.Website,
    title:      r.title ?? r.url,
    content:    (r.content ?? '').slice(0, 1500),
    url:        r.url,
    timestamp:  r.publishedDate ? new Date(r.publishedDate) : now,
    fetchedAt:  now,
    category,
    score:      0,
    tags:       ['web-search', 'auto'],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SearchResult {
  category: Category;
  items:    NormalizedItem[];
}

/**
 * For each category that has fewer than MIN_ITEMS_THRESHOLD items,
 * run a Tavily search and return additional NormalizedItems.
 * Safe to call even if TAVILY_API_KEY is not set — returns [] silently.
 */
export async function fillGapsWithSearch(
  grouped: Map<Category, NormalizedItem[]>,
): Promise<NormalizedItem[]> {
  if (!ENABLED) return [];

  const client = tavily({ apiKey: TAVILY_KEY });
  const extra: NormalizedItem[] = [];

  const tasks = (Object.entries(CATEGORY_QUERIES) as [Category, string][])
    .filter(([cat]) => (grouped.get(cat)?.length ?? 0) < MIN_ITEMS_THRESHOLD)
    .map(async ([cat, query]) => {
      try {
        const res = await client.search(query, {
          searchDepth: 'basic',
          maxResults:  5,
          includeAnswer: false,
        });
        const items = (res.results ?? []).map((r) => tavilyResultToItem(r, cat));
        logger.info(`[webSearch] ${cat}: +${items.length} items via Tavily`);
        extra.push(...items);
      } catch (err) {
        logger.warn(`[webSearch] search failed for ${cat}: ${(err as Error).message}`);
      }
    });

  await Promise.allSettled(tasks);
  return extra;
}

/**
 * Run a single ad-hoc search query. Used by /search bot command.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<NormalizedItem[]> {
  if (!ENABLED) throw new Error('TAVILY_API_KEY не задан в .env');
  const client = tavily({ apiKey: TAVILY_KEY });
  const res    = await client.search(query, { searchDepth: 'advanced', maxResults });
  return (res.results ?? []).map((r) => tavilyResultToItem(r, Category.AI));
}
