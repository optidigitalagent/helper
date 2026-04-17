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

  // a16z AI research blog
  createRssAdapter({
    id:       'rss_a16z_future',
    name:     'a16z',
    feedUrl:  'https://a16z.com/category/ai-machine-learning/feed/',
    category: Category.Learning,
    tags:     ['vc', 'ai-strategy', 'tech-future', 'essays'],
  }),

  // The Batch (DeepLearning.AI) — Andrew Ng weekly, most important AI research
  createRssAdapter({
    id:       'rss_the_batch',
    name:     'The Batch (DeepLearning.AI)',
    feedUrl:  'https://www.deeplearning.ai/the-batch/feed/',
    category: Category.Learning,
    tags:     ['ai', 'research', 'weekly', 'andrew-ng'],
  }),

  // Towards AI — ML tutorials, research breakdowns, applied AI
  createRssAdapter({
    id:       'rss_towards_ai',
    name:     'Towards AI',
    feedUrl:  'https://towardsai.net/feed',
    category: Category.Learning,
    tags:     ['ml', 'tutorials', 'research', 'applied'],
  }),

  // Sebastian Ruder — NLP research, best multilingual AI analysis
  createRssAdapter({
    id:       'rss_ruder',
    name:     'Sebastian Ruder',
    feedUrl:  'https://ruder.io/rss/index.rss',
    category: Category.Learning,
    tags:     ['nlp', 'research', 'deep-dive'],
  }),

  // fast.ai — Jeremy Howard, practical deep learning (courses + blog)
  createRssAdapter({
    id:       'rss_fastai',
    name:     'fast.ai',
    feedUrl:  'https://www.fast.ai/index.xml',
    category: Category.Learning,
    tags:     ['deep-learning', 'practical', 'courses'],
  }),

  // Anthropic research blog (atom feed)
  createRssAdapter({
    id:       'rss_anthropic_research',
    name:     'Anthropic Research',
    feedUrl:  'https://www.anthropic.com/research/rss.xml',
    category: Category.Learning,
    tags:     ['ai', 'research', 'alignment', 'official'],
  }),

  // OpenAI research (separate from news)
  createRssAdapter({
    id:       'rss_openai_research',
    name:     'OpenAI Research',
    feedUrl:  'https://openai.com/research/rss.xml',
    category: Category.Learning,
    tags:     ['ai', 'research', 'papers', 'official'],
  }),

  // Papers With Code — new ML papers with code, daily
  createRssAdapter({
    id:       'rss_paperswithcode',
    name:     'Papers With Code',
    feedUrl:  'https://paperswithcode.com/rss.xml',
    category: Category.Learning,
    tags:     ['papers', 'ml', 'research', 'code'],
  }),

  // Google DeepMind blog
  createRssAdapter({
    id:       'rss_deepmind',
    name:     'Google DeepMind',
    feedUrl:  'https://deepmind.google/blog/rss.xml',
    category: Category.Learning,
    tags:     ['ai', 'research', 'deepmind', 'official'],
  }),
];
