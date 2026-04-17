import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Opportunity Sources ──────────────────────────────────────────────────────
// Items you can act on right now: new tools, workflows, beta access, tactics.
// NOT news analysis. NOT opinion. Things you can USE.

export const opportunitySources: SourceAdapter[] = [

  // TLDR AI — daily digest of new AI tools and research, curated by a team
  createRssAdapter({
    id:       'rss_tldr_ai',
    name:     'TLDR AI',
    feedUrl:  'https://tldr.tech/api/rss/ai',
    category: Category.Opportunities,
    tags:     ['ai-tools', 'new-products', 'daily'],
  }),

  // Ben's Bites — daily AI digest focused on what's new and actionable
  createRssAdapter({
    id:       'rss_bensbites',
    name:     "Ben's Bites",
    feedUrl:  'https://bensbites.com/feed',
    category: Category.Opportunities,
    tags:     ['ai-tools', 'launches', 'daily', 'curated'],
  }),

  // The Rundown AI — daily briefing, new tools and use cases
  createRssAdapter({
    id:       'rss_rundown_ai',
    name:     'The Rundown AI',
    feedUrl:  'https://www.therundown.ai/rss',
    category: Category.Opportunities,
    tags:     ['ai-tools', 'daily', 'curated'],
  }),

  // AI Valley — launches, tools, automation workflows
  createRssAdapter({
    id:       'rss_aivalley',
    name:     'AI Valley',
    feedUrl:  'https://aivalley.ai/feed/',
    category: Category.Opportunities,
    tags:     ['ai-tools', 'new-products', 'launches'],
  }),

  // ProductHunt AI — new AI products before they go mainstream
  createRssAdapter({
    id:       'rss_producthunt_ai',
    name:     'ProductHunt AI',
    feedUrl:  'https://www.producthunt.com/feed?category=artificial-intelligence',
    category: Category.Opportunities,
    tags:     ['new-products', 'ai-tools', 'beta'],
  }),
];
