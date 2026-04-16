import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Opportunity Sources ──────────────────────────────────────────────────────
// Items you can act on right now: new tools, workflows, beta access, tactics.
// NOT news analysis. NOT opinion. Things you can USE.

export const opportunitySources: SourceAdapter[] = [

  // TLDR AI — daily digest of new AI tools and research, curated by a team
  // HIGH signal-to-noise ratio, actionable items every day
  createRssAdapter({
    id:       'rss_tldr_ai',
    name:     'TLDR AI',
    feedUrl:  'https://tldr.tech/api/rss/ai',
    category: Category.Opportunities,
    tags:     ['ai-tools', 'new-products', 'daily'],
  }),

  // ProductHunt AI — new AI products before they go mainstream
  // Filter: items with high votes = validated interest
  createRssAdapter({
    id:       'rss_producthunt_ai',
    name:     'ProductHunt AI',
    feedUrl:  'https://www.producthunt.com/feed?category=artificial-intelligence',
    category: Category.Opportunities,
    tags:     ['new-products', 'ai-tools', 'beta'],
  }),
];
