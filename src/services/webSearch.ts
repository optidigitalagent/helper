import { tavily } from '@tavily/core';
import { NormalizedItem, Category, SourceType } from '../types';
import { makeId } from '../utils/hash';
import { logger } from '../utils/logger';

const TAVILY_KEY = process.env.TAVILY_API_KEY ?? '';
const ENABLED    = Boolean(TAVILY_KEY);

// ─── Domain filters ───────────────────────────────────────────────────────────

// Only results from these high-quality domains (+ YouTube, GitHub always pass)
const TRUSTED_DOMAINS = [
  // AI / Tech
  'openai.com', 'anthropic.com', 'deepmind.google', 'google.com',
  'huggingface.co', 'arxiv.org', 'paperswithcode.com',
  'simonwillison.net', 'latent.space', 'interconnects.ai',
  'oneusefulthing.org', 'jack-clark.net', 'deeplearning.ai',
  'fast.ai', 'karpathy.ai', 'bounded-regret.ghost.io',
  // Business / Strategy
  'stratechery.com', 'notboring.co', 'lennysnewsletter.com',
  'paulgraham.com', 'fs.blog', 'ben-evans.com', 'profgalloway.com',
  // News (high quality)
  'techcrunch.com', 'wired.com', 'venturebeat.com', 'the-decoder.com',
  'technologyreview.com', 'theverge.com', 'arstechnica.com',
  'bloomberg.com', 'wsj.com', 'ft.com', 'reuters.com',
  // Crypto
  'theblock.co', 'coindesk.com', 'decrypt.co', 'messari.io',
  // Dev / Engineering
  'github.com', 'github.blog', 'engineering.atspotify.com',
  'netflixtechblog.com', 'engineering.fb.com', 'research.google',
  // YouTube (results come as youtube.com links)
  'youtube.com', 'youtu.be',
  // Learning
  'coursera.org', 'udemy.com', 'edx.org',
];

// Block these regardless
const BLOCKED_DOMAINS = [
  '.ru', '.рф', 'dzen.ru', 'vc.ru', 'habr.com', 'pikabu.ru',
  'vk.com', 'ok.ru', 'mail.ru', 'yandex.ru',
  'pinterest.com', 'quora.com', 'reddit.com', 'medium.com',
];

function isDomainAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (BLOCKED_DOMAINS.some((d) => host.endsWith(d.replace(/^\./, '')))) return false;
    return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const MIN_ITEMS_THRESHOLD = 3;

// English-only, specific queries → better results
const CATEGORY_QUERIES: Partial<Record<Category, string>> = {
  [Category.AI]:            'new AI model tool released 2025 site:openai.com OR site:anthropic.com OR site:huggingface.co OR site:github.com',
  [Category.Opportunities]: 'new open source AI tool automation workflow released 2025',
  [Category.MarketSignals]: 'tech market funding startup VC news analysis 2025',
  [Category.Crypto]:        'crypto bitcoin on-chain market analysis institutional 2025',
  [Category.Thinking]:      'startup founder strategy essay insight 2025',
  [Category.Learning]:      'AI deep learning tutorial explained research 2025 site:deeplearning.ai OR site:fast.ai OR site:arxiv.org',
  [Category.Podcast]:       'AI tech podcast interview episode 2025 site:youtube.com',
};

// ─── Converter ───────────────────────────────────────────────────────────────

function toItem(
  r: { title?: string; url: string; content?: string; publishedDate?: string },
  category: Category,
): NormalizedItem {
  const now       = new Date();
  const isYoutube = r.url.includes('youtube.com') || r.url.includes('youtu.be');
  return {
    id:         makeId('tavily', r.url),
    source:     'tavily_search',
    sourceName: isYoutube ? 'YouTube (Search)' : 'Web Search',
    sourceType: isYoutube ? SourceType.YouTube : SourceType.Website,
    title:      r.title ?? r.url,
    content:    (r.content ?? '').slice(0, 1500),
    url:        r.url,
    timestamp:  r.publishedDate ? new Date(r.publishedDate) : now,
    fetchedAt:  now,
    category,
    score:      0,
    tags:       ['web-search', isYoutube ? 'video' : 'article'],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
        const res   = await client.search(query, {
          searchDepth:   'advanced',
          maxResults:    8,
          includeAnswer: false,
        });
        const items = (res.results ?? [])
          .filter((r) => isDomainAllowed(r.url))
          .map((r) => toItem(r, cat));
        logger.info(`[webSearch] ${cat}: +${items.length} trusted items`);
        extra.push(...items);
      } catch (err) {
        logger.warn(`[webSearch] ${cat}: ${(err as Error).message}`);
      }
    });

  await Promise.allSettled(tasks);
  return extra;
}

export async function searchWeb(query: string, maxResults = 5): Promise<NormalizedItem[]> {
  if (!ENABLED) throw new Error('TAVILY_API_KEY не задан в .env');
  const client = tavily({ apiKey: TAVILY_KEY });
  const res    = await client.search(query, { searchDepth: 'advanced', maxResults });
  return (res.results ?? [])
    .filter((r) => isDomainAllowed(r.url))
    .map((r) => toItem(r, Category.AI));
}
