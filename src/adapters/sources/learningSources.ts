import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Learning & Deep Research ─────────────────────────────────────────────────
// Not tutorials. Not listicles.
// Sources that change how you think, not just what you know.

export const learningSources: SourceAdapter[] = [

  // Andrej Karpathy — rare posts, always essential (neural nets, LLMs, education)
  createRssAdapter({
    id:       'rss_karpathy',
    name:     'Andrej Karpathy',
    feedUrl:  'https://karpathy.github.io/feed.xml',
    category: Category.Learning,
    tags:     ['ai', 'deep-learning', 'rare-gold'],
  }),

  // Interconnects — Nathan Lambert, AI alignment + RLHF from inside the labs
  createRssAdapter({
    id:       'rss_interconnects',
    name:     'Interconnects (Nathan Lambert)',
    feedUrl:  'https://www.interconnects.ai/feed',
    category: Category.Learning,
    tags:     ['ai', 'rlhf', 'alignment', 'lab-insider'],
  }),

  // Y Combinator blog — startup insights, what YC is seeing in AI
  createRssAdapter({
    id:       'rss_ycombinator',
    name:     'Y Combinator',
    feedUrl:  'https://www.ycombinator.com/blog/rss.xml',
    category: Category.Learning,
    tags:     ['startups', 'vc', 'founder-insights'],
  }),

  // a16z Future — essays from Andreessen Horowitz on tech, AI, crypto, biotech
  // Strategic-level thinking from investors with portfolio visibility
  createRssAdapter({
    id:       'rss_a16z_future',
    name:     'a16z Future',
    feedUrl:  'https://a16z.com/feed/',
    category: Category.Learning,
    tags:     ['vc', 'ai-strategy', 'tech-future', 'essays'],
  }),

  // Paul Graham essays — rare, but always reshape how you think
  createRssAdapter({
    id:       'rss_paulgraham',
    name:     'Paul Graham',
    feedUrl:  'http://www.paulgraham.com/rss.html',
    category: Category.Learning,
    tags:     ['essays', 'startups', 'thinking', 'rare-gold'],
  }),
];
