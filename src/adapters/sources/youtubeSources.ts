import { createYoutubeAdapter } from '../base/youtubeAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── YouTube Sources ──────────────────────────────────────────────────────────
// Videos, lectures, interviews, deep-dives.
// Wrong channel IDs fail silently (SKIP in logs) — no crashes.

export const youtubeSources: SourceAdapter[] = [

  // ── AI / ML ───────────────────────────────────────────────────────────────

  // Lex Fridman — long-form interviews: AI researchers, founders, scientists
  createYoutubeAdapter({
    id:        'yt_lexfridman',
    name:      'Lex Fridman (YouTube)',
    channelId: 'UCSHZKyawb77ixDdsGog4iWA',
    category:  Category.Podcast,
    tags:      ['interview', 'ai', 'science', 'deep'],
  }),

  // Two Minute Papers — rapid summaries of AI research papers
  createYoutubeAdapter({
    id:        'yt_twominutepapers',
    name:      'Two Minute Papers',
    channelId: 'UCbfYPyITQ-7l4upoX8nvctg',
    category:  Category.Learning,
    tags:      ['ai', 'research', 'papers', 'summaries'],
  }),

  // Yannic Kilcher — deep ML paper reviews, technical but accessible
  createYoutubeAdapter({
    id:        'yt_yannic',
    name:      'Yannic Kilcher',
    channelId: 'UCZHmQk67mSJgfCCTn7xBfew',
    category:  Category.Learning,
    tags:      ['ai', 'ml', 'papers', 'technical'],
  }),

  // 3Blue1Brown — visual math and AI explainers (rare but exceptional)
  createYoutubeAdapter({
    id:        'yt_3blue1brown',
    name:      '3Blue1Brown',
    channelId: 'UCYO_jab_esuFRV4b17AJtAg',
    category:  Category.Learning,
    tags:      ['math', 'ai', 'explainer', 'rare-gold'],
  }),

  // ── Business / Startups ───────────────────────────────────────────────────

  // Y Combinator — startup school lectures, founder talks
  createYoutubeAdapter({
    id:        'yt_ycombinator',
    name:      'Y Combinator (YouTube)',
    channelId: 'UCcefcZRL2oaA_uBNeo5UNqg',
    category:  Category.Thinking,
    tags:      ['startups', 'founders', 'vc', 'advice'],
  }),

  // All-In Podcast — Chamath, Jason, Sacks, Friedberg: markets + tech + culture
  createYoutubeAdapter({
    id:        'yt_allin',
    name:      'All-In Podcast (YouTube)',
    channelId: 'UCESLZhusAkFfsNsApnjF_Cg',
    category:  Category.Podcast,
    tags:      ['podcast', 'markets', 'tech', 'vc'],
  }),

  // Anthropic YouTube — official talks, research, demos
  createYoutubeAdapter({
    id:        'yt_anthropic',
    name:      'Anthropic (YouTube)',
    channelId: 'UCVanE3TRPBNEhMkbrNQ56tg',
    category:  Category.Learning,
    tags:      ['ai', 'claude', 'research', 'official'],
  }),

  // OpenAI YouTube — demos, DevDay, research talks
  createYoutubeAdapter({
    id:        'yt_openai',
    name:      'OpenAI (YouTube)',
    channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A',
    category:  Category.Learning,
    tags:      ['ai', 'gpt', 'demos', 'official'],
  }),

  // AI Explained — clear breakdowns of new models and capabilities
  createYoutubeAdapter({
    id:        'yt_ai_explained',
    name:      'AI Explained',
    channelId: 'UCNJ1Ymd5yFuUPtn21xtRbbw',
    category:  Category.Learning,
    tags:      ['ai', 'explainer', 'models', 'analysis'],
  }),

  // Matt Wolfe — Future Tools, AI tools reviews and news
  createYoutubeAdapter({
    id:        'yt_mattwolfe',
    name:      'Matt Wolfe (Future Tools)',
    channelId: 'UCx4t4yLuHQ5nSJoHXoMQNTA',
    category:  Category.Opportunities,
    tags:      ['ai-tools', 'reviews', 'news', 'practical'],
  }),

  // Lenny Rachitsky — product strategy, growth, founder talks
  createYoutubeAdapter({
    id:        'yt_lenny',
    name:      "Lenny's Podcast (YouTube)",
    channelId: 'UCjAmvZDUGM2BwOExH3mMaeg',
    category:  Category.Thinking,
    tags:      ['product', 'growth', 'founders', 'strategy'],
  }),

  // ── Русскоязычные: бизнес, философия, миллиардеры ─────────────────────────

  // Оскар Хартманн — интервью с миллиардерами, бизнес-философия
  createYoutubeAdapter({
    id:        'yt_hartmann',
    name:      'Оскар Хартманн',
    channelId: 'UCFJnZHIusOlHr-pbYVHmr-A',
    category:  Category.Thinking,
    tags:      ['ru', 'interview', 'billionaires', 'philosophy', 'business'],
  }),

  // BigMoney (Евгений Черняк) — интервью с предпринимателями, бизнес-истории
  createYoutubeAdapter({
    id:        'yt_bigmoney',
    name:      'BigMoney (Евгений Черняк)',
    channelId: 'UCBXknSneBtw2iA8BQsXqiTw',
    category:  Category.Thinking,
    tags:      ['ru', 'interview', 'entrepreneurs', 'business', 'mindset'],
  }),

  // Бизнес-Секреты (Тиньков) — интервью с основателями компаний
  createYoutubeAdapter({
    id:        'yt_biznes_sekrety',
    name:      'Бизнес-Секреты',
    channelId: 'UC_ErLqdnmXGMH-pccUQjwyA',
    category:  Category.Thinking,
    tags:      ['ru', 'interview', 'founders', 'business-secrets'],
  }),

  // Портнягин (Трансформатор) — бизнес, предпринимательство
  createYoutubeAdapter({
    id:        'yt_portnyagin',
    name:      'Портнягин',
    channelId: 'UCeNpzcxM-hUhnabwC7oZeYw',
    category:  Category.Thinking,
    tags:      ['ru', 'business', 'entrepreneur', 'mindset'],
  }),

  // Forbes Russia — интервью с богатыми людьми, бизнес-истории
  createYoutubeAdapter({
    id:        'yt_forbes_russia',
    name:      'Forbes Russia',
    channelId: 'UCr2LSro_9yZvng8HR2eDExA',
    category:  Category.Thinking,
    tags:      ['ru', 'billionaires', 'business', 'interview', 'wealth'],
  }),

  // Саидмурод Давлатов — философия успеха, бизнес, мотивация
  createYoutubeAdapter({
    id:        'yt_davlatov',
    name:      'Саидмурод Давлатов',
    channelId: 'UCVtFh_62yrW-vj95T0TvYiw',
    category:  Category.Thinking,
    tags:      ['ru', 'philosophy', 'success', 'business', 'wealth'],
  }),
];
