import Parser from 'rss-parser';
import { NormalizedItem, Category, SourceType, SourceAdapter } from '../../types';
import { makeId } from '../../utils/hash';

const parser = new Parser();

export interface RssAdapterConfig {
  id:       string;
  name:     string;
  feedUrl:  string;
  category: Category;
  tags?:    string[];
}

export function createRssAdapter(cfg: RssAdapterConfig): SourceAdapter {
  return {
    id:   cfg.id,
    name: cfg.name,

    async fetch(since: Date | null): Promise<NormalizedItem[]> {
      const feed = await parser.parseURL(cfg.feedUrl);
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
            sourceType: SourceType.RSS,
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
