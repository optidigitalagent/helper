import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Podcast Sources ──────────────────────────────────────────────────────────
// Only episodes where the guest or topic alone is signal.
// Rule: if you can predict the content without listening — skip it.
// Note: 0 items is normal — these activate when new episodes drop.

export const podcastSources: SourceAdapter[] = [

  // Lex Fridman — scientists, CEOs, researchers, depth interviews
  createRssAdapter({
    id:       'rss_lex_fridman',
    name:     'Lex Fridman Podcast',
    feedUrl:  'https://lexfridman.com/feed/podcast/',
    category: Category.Podcast,
    tags:     ['podcast', 'ai', 'science', 'founders'],
  }),

  // Invest Like the Best — Patrick O'Shaughnessy, best investor conversations
  createRssAdapter({
    id:       'rss_invest_like_best',
    name:     'Invest Like the Best',
    feedUrl:  'https://feeds.megaphone.fm/investlikethebest',
    category: Category.Podcast,
    tags:     ['podcast', 'investing', 'frameworks'],
  }),

  // All-In Podcast — Chamath, Jason, Sacks, Friedberg — tech, VC, politics, macro
  createRssAdapter({
    id:       'rss_all_in_pod',
    name:     'All-In Podcast',
    feedUrl:  'https://feeds.megaphone.fm/all-in-with-chamath-jason-sacks-friedberg',
    category: Category.Podcast,
    tags:     ['podcast', 'vc', 'tech', 'macro', 'founders'],
  }),

  // Hard Fork (NYT) — tech industry, AI policy, big tech, weekly
  createRssAdapter({
    id:       'rss_hard_fork',
    name:     'Hard Fork (NYT)',
    feedUrl:  'https://feeds.simplecast.com/l2i9YnTd',
    category: Category.Podcast,
    tags:     ['podcast', 'tech', 'ai-policy', 'industry'],
  }),

  // My First Million — Sam Parr + Shaan Puri, business ideas, opportunities
  createRssAdapter({
    id:       'rss_my_first_million',
    name:     'My First Million',
    feedUrl:  'https://feeds.megaphone.fm/my-first-million',
    category: Category.Podcast,
    tags:     ['podcast', 'business', 'ideas', 'opportunities'],
  }),
];
