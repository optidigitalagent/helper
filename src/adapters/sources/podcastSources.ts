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

  // Hard Fork (NYT) — tech industry, AI policy, big tech, weekly
  createRssAdapter({
    id:       'rss_hard_fork',
    name:     'Hard Fork (NYT)',
    feedUrl:  'https://feeds.simplecast.com/l2i9YnTd',
    category: Category.Podcast,
    tags:     ['podcast', 'tech', 'ai-policy', 'industry'],
  }),

  // All-In Podcast — Chamath, Sacks, Friedberg, Calacanis: markets + tech + deals
  createRssAdapter({
    id:       'rss_all_in_pod',
    name:     'All-In Podcast',
    feedUrl:  'https://feeds.megaphone.fm/allinthepodcast',
    category: Category.Podcast,
    tags:     ['podcast', 'markets', 'vc', 'tech'],
  }),

  // My First Million — Sam Parr + Shaan Puri: startup ideas, business models
  createRssAdapter({
    id:       'rss_my_first_million',
    name:     'My First Million',
    feedUrl:  'https://feeds.megaphone.fm/myfirstmillion',
    category: Category.Podcast,
    tags:     ['podcast', 'startups', 'business-models', 'ideas'],
  }),

  // The Knowledge Project (Farnam Street) — mental models, decision-making
  createRssAdapter({
    id:       'rss_knowledge_project',
    name:     'The Knowledge Project',
    feedUrl:  'https://feeds.simplecast.com/gfhNCLae',
    category: Category.Podcast,
    tags:     ['podcast', 'mental-models', 'decision-making', 'frameworks'],
  }),

  // a16z Podcast — tech strategy, startups, markets from inside VC
  createRssAdapter({
    id:       'rss_a16z_podcast',
    name:     'a16z Podcast',
    feedUrl:  'https://feeds.megaphone.fm/a16z',
    category: Category.Podcast,
    tags:     ['podcast', 'vc', 'tech-strategy', 'startups'],
  }),

  // Tim Ferriss Show — world-class performers, routines, mental models
  createRssAdapter({
    id:       'rss_tim_ferriss',
    name:     'The Tim Ferriss Show',
    feedUrl:  'https://rss.art19.com/tim-ferriss-show',
    category: Category.Podcast,
    tags:     ['podcast', 'philosophy', 'habits', 'billionaires', 'performance'],
  }),

  // Acquired — deep dives on greatest companies (Amazon, Apple, Berkshire, LVMH)
  createRssAdapter({
    id:       'rss_acquired',
    name:     'Acquired',
    feedUrl:  'https://acquired.fm/rss',
    category: Category.Podcast,
    tags:     ['podcast', 'business-history', 'strategy', 'founders'],
  }),

  // Founders — David Senra reads biographies of great entrepreneurs
  createRssAdapter({
    id:       'rss_founders_pod',
    name:     'Founders Podcast',
    feedUrl:  'https://feeds.simplecast.com/dHoohVNH',
    category: Category.Podcast,
    tags:     ['podcast', 'biography', 'philosophy', 'business-history', 'wealth'],
  }),

  // Diary of a CEO — Steven Bartlett, raw conversations with top founders
  createRssAdapter({
    id:       'rss_diary_of_ceo',
    name:     'Diary of a CEO',
    feedUrl:  'https://feeds.megaphone.fm/diaryofaceo',
    category: Category.Podcast,
    tags:     ['podcast', 'founders', 'mindset', 'wealth', 'life'],
  }),

  // Naval — Naval Ravikant on wealth, happiness, philosophy
  createRssAdapter({
    id:       'rss_naval',
    name:     'Naval',
    feedUrl:  'https://nav.al/podcast/rss',
    category: Category.Podcast,
    tags:     ['podcast', 'philosophy', 'wealth', 'happiness', 'naval'],
  }),

  // Masters of Scale — Reid Hoffman, how iconic companies grew
  createRssAdapter({
    id:       'rss_masters_of_scale',
    name:     'Masters of Scale',
    feedUrl:  'https://feeds.simplecast.com/tDBwK1gV',
    category: Category.Podcast,
    tags:     ['podcast', 'growth', 'founders', 'strategy', 'business'],
  }),
];
