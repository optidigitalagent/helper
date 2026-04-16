import { createTelegramAdapter } from '../base/telegramRssAdapter';
import { createRssAdapter }      from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── AI Tools & Research ──────────────────────────────────────────────────────
// Real tools. Real research. No "top 10 AI tools" lists.
// Criteria: must give actionable signal — new model, new capability, new workflow.

export const aiTechSources: SourceAdapter[] = [

  // ── Official model/lab releases ───────────────────────────────────────────

  createRssAdapter({
    id:       'rss_openai_news',
    name:     'OpenAI',
    feedUrl:  'https://openai.com/news/rss.xml',
    category: Category.AI,
    tags:     ['ai', 'openai', 'official'],
  }),

  // Anthropic blog — Claude releases, safety research, product announcements
  createRssAdapter({
    id:       'rss_anthropic_blog',
    name:     'Anthropic',
    feedUrl:  'https://www.anthropic.com/rss.xml',
    category: Category.AI,
    tags:     ['ai', 'anthropic', 'official', 'claude'],
  }),

  createRssAdapter({
    id:       'rss_huggingface_blog',
    name:     'Hugging Face',
    feedUrl:  'https://huggingface.co/blog/feed.xml',
    category: Category.AI,
    tags:     ['ai', 'models', 'open-source'],
  }),

  createRssAdapter({
    id:       'rss_google_ai_blog',
    name:     'Google DeepMind Blog',
    feedUrl:  'https://blog.research.google/atom.xml',
    category: Category.AI,
    tags:     ['ai', 'google', 'research'],
  }),

  // MIT Technology Review AI section
  createRssAdapter({
    id:       'rss_mit_ai',
    name:     'MIT Technology Review AI',
    feedUrl:  'https://www.technologyreview.com/feed/',
    category: Category.AI,
    tags:     ['ai', 'research', 'tech'],
  }),

  // ── Practitioner signal — people who actually BUILD with AI ──────────────

  // Simon Willison — best practical LLM tooling blog on the internet
  createRssAdapter({
    id:       'rss_simon_willison',
    name:     'Simon Willison',
    feedUrl:  'https://simonwillison.net/atom/everything/',
    category: Category.AI,
    tags:     ['ai', 'llm', 'tools', 'practical'],
  }),

  // One Useful Thing — Ethan Mollick (Wharton), AI in real work
  createRssAdapter({
    id:       'rss_one_useful_thing',
    name:     'One Useful Thing',
    feedUrl:  'https://www.oneusefulthing.org/feed',
    category: Category.AI,
    tags:     ['ai', 'productivity', 'research-backed'],
  }),

  // Import AI — Jack Clark (ex-OpenAI), weekly research digest
  createRssAdapter({
    id:       'rss_import_ai',
    name:     'Import AI',
    feedUrl:  'https://jack-clark.net/feed/',
    category: Category.AI,
    tags:     ['ai', 'research', 'weekly'],
  }),

  // LangChain Blog — practical agents, new integrations, workflow patterns
  createRssAdapter({
    id:       'rss_langchain_blog',
    name:     'LangChain Blog',
    feedUrl:  'https://blog.langchain.dev/rss/',
    category: Category.AI,
    tags:     ['ai', 'agents', 'langchain', 'workflow'],
  }),

  // Latent Space — AI practitioners: new models, lab research, deep analysis
  // One of the best signals for what's actually happening in AI
  createRssAdapter({
    id:       'rss_latent_space',
    name:     'Latent Space',
    feedUrl:  'https://www.latent.space/feed',
    category: Category.AI,
    tags:     ['ai', 'practitioners', 'research', 'builders'],
  }),

  // ── Telegram ──────────────────────────────────────────────────────────────

  createTelegramAdapter({
    id:              'tg_xb_prosmm',
    name:            'XB ProSMM',
    channelUsername: 'xb_prosmm',
    category:        Category.AI,
    tags:            ['ai', 'marketing', 'tools', 'ru'],
  }),
];
