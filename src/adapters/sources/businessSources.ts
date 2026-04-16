import { createTelegramAdapter } from '../base/telegramRssAdapter';
import { createRssAdapter }      from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Thinking & Strategy ──────────────────────────────────────────────────────
// Founders, investors, contrarian thinkers.
// These sources don't report news — they reframe how you see the world.

export const businessSources: SourceAdapter[] = [

  // ── Tier 1 — gold standard thinking ──────────────────────────────────────

  // Stratechery — Ben Thompson, best tech strategy analysis
  createRssAdapter({
    id:       'rss_stratechery',
    name:     'Stratechery',
    feedUrl:  'https://stratechery.com/feed/',
    category: Category.Thinking,
    tags:     ['tech-strategy', 'business-models'],
  }),

  // Not Boring — Packy McCormick, business strategy + vision
  createRssAdapter({
    id:       'rss_notboring',
    name:     'Not Boring',
    feedUrl:  'https://www.notboring.co/feed',
    category: Category.Thinking,
    tags:     ['strategy', 'business', 'tech'],
  }),

  // Marc Andreessen Substack — direct thinking from a16z founder
  createRssAdapter({
    id:       'rss_pmarca',
    name:     'pmarca (Marc Andreessen)',
    feedUrl:  'https://pmarca.substack.com/feed',
    category: Category.Thinking,
    tags:     ['vc', 'tech-thinking', 'contrarian'],
  }),

  // Lenny's Newsletter — product strategy, growth, builder frameworks
  // Most practical newsletter for product-minded builders
  createRssAdapter({
    id:       'rss_lennys',
    name:     "Lenny's Newsletter",
    feedUrl:  'https://www.lennysnewsletter.com/feed',
    category: Category.Thinking,
    tags:     ['product', 'growth', 'frameworks', 'builders'],
  }),

  // ── Telegram ──────────────────────────────────────────────────────────────

  createTelegramAdapter({
    id:              'tg_margulan',
    name:            'Margulan Seissembai',
    channelUsername: 'MargulanSeissembai',
    category:        Category.Thinking,
    tags:            ['business', 'entrepreneurship', 'cis'],
  }),
];
