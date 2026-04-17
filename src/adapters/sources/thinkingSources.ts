import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category, SourceType } from '../../types';

// ─── Deep Knowledge Sources ───────────────────────────────────────────────────
// Long-form: essays, research, interviews, systemic breakdowns.
// Criterion: gives you a mental model or decision framework, not just facts.
// Use prefix "deep_" so normalizer tags them as SourceType.DeepKnowledge.

export const thinkingSources: SourceAdapter[] = [

  // Paul Graham — rare essays, founder thinking, startup philosophy
  createRssAdapter({
    id:         'deep_paulgraham',
    name:       'Paul Graham',
    feedUrl:    'http://www.paulgraham.com/rss.html',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['essays', 'startups', 'thinking', 'rare-gold'],
  }),

  // Farnam Street — mental models, decision making, systems thinking
  createRssAdapter({
    id:         'deep_farnamstreet',
    name:       'Farnam Street',
    feedUrl:    'https://fs.blog/feed/',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['mental-models', 'decision-making', 'systems'],
  }),

  // Ben Evans — tech strategy, market structure, big-picture tech analysis
  createRssAdapter({
    id:         'deep_benevans',
    name:       'Benedict Evans',
    feedUrl:    'https://www.ben-evans.com/benedictevans/rss.xml',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['tech-strategy', 'market-analysis', 'big-picture'],
  }),

  // Not Boring — deep dives on tech companies, products, and business models
  createRssAdapter({
    id:         'deep_notboring',
    name:       'Not Boring (Packy McCormick)',
    feedUrl:    'https://www.notboring.co/feed',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['business-models', 'tech-companies', 'deep-dives'],
  }),

  // Scott Galloway — blunt analysis of tech, business, culture
  createRssAdapter({
    id:         'deep_scottgalloway',
    name:       'Scott Galloway (No Mercy/No Malice)',
    feedUrl:    'https://profgalloway.com/feed/',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['tech-critique', 'business', 'contrarian'],
  }),

  // Lenny's Newsletter — product, growth, hiring. Practitioners, not theory
  createRssAdapter({
    id:         'deep_lennys',
    name:       "Lenny's Newsletter",
    feedUrl:    'https://www.lennysnewsletter.com/feed',
    category:   Category.Thinking,
    sourceType: SourceType.DeepKnowledge,
    tags:       ['product', 'growth', 'saas', 'practical'],
  }),
];
