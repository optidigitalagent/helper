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
];
