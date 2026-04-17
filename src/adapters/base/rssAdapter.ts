import Parser from 'rss-parser';
import { NormalizedItem, Category, SourceType, SourceAdapter } from '../../types';
import { makeId } from '../../utils/hash';

const FETCH_TIMEOUT_MS = 9000;

const parser = new Parser({ timeout: FETCH_TIMEOUT_MS });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const race = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, race]).finally(() => clearTimeout(timer));
}

export interface RssAdapterConfig {
  id:          string;
  name:        string;
  feedUrl:     string;
  category:    Category;
  sourceType?: SourceType;   // override default RSS; use DeepKnowledge for long-form sources
  tags?:       string[];
}

export function createRssAdapter(cfg: RssAdapterConfig): SourceAdapter {
  return {
    id:   cfg.id,
    name: cfg.name,

    async fetch(since: Date | null): Promise<NormalizedItem[]> {
      const feed = await withTimeout(parser.parseURL(cfg.feedUrl), FETCH_TIMEOUT_MS, cfg.id);
      const now  = new Date();

      return (feed.items ?? [])
        .filter((item) => {
          if (!since) return true;
          const pub = item.pubDate ? new Date(item.pubDate) : null;
          return pub ? pub > since : true;
        })
        .map((item) => {
          const timestamp  = item.pubDate ? new Date(item.pubDate) : now;
          const uniqueKey  = item.link ?? item.guid ?? item.title ?? String(timestamp.getTime());
          const content    = item.contentSnippet ?? item.content ?? item.summary ?? '';

          return {
            id:         makeId(cfg.id, uniqueKey),
            source:     cfg.id,
            sourceName: cfg.name,
            sourceType: cfg.sourceType ?? SourceType.RSS,
            category:   cfg.category,
            title:      item.title ?? '(no title)',
            content:    content.slice(0, 2000),
            url:        item.link ?? undefined,
            timestamp,
            fetchedAt:  now,
            score:      0,
            tags:       cfg.tags ?? [],
            raw:        item as Record<string, unknown>,
          } satisfies NormalizedItem;
        });
    },
  };
}
