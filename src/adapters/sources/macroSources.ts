import { createTelegramAdapter } from '../base/telegramRssAdapter';
import { createRssAdapter }      from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Market Signals ───────────────────────────────────────────────────────────
// Macro moves, capital flows, geopolitical risk, deal flow.
// Rule: only sources that give NON-OBVIOUS signals before the mainstream picks up.

export const macroSources: SourceAdapter[] = [

  // ── Telegram ──────────────────────────────────────────────────────────────
  createTelegramAdapter({
    id:              'tg_finance_instinct',
    name:            'Finance Instinct',
    channelUsername: 'Finance_Instinct',
    category:        Category.MarketSignals,
    tags:            ['macro', 'finance', 'ru'],
  }),
  // Spydell — deep macro analysis, one of the best RU analysts
  createTelegramAdapter({
    id:              'tg_spydell',
    name:            'Spydell Finance',
    channelUsername: 'spydell_finance',
    category:        Category.MarketSignals,
    tags:            ['macro', 'us-market', 'data-driven'],
  }),
  // MarketTwits — RU market commentary, fast signals
  createTelegramAdapter({
    id:              'tg_markettwits',
    name:            'MarketTwits',
    channelUsername: 'markettwits',
    category:        Category.MarketSignals,
    tags:            ['macro', 'market', 'ru'],
  }),

  // ── RSS ───────────────────────────────────────────────────────────────────
  // Exponential View — Azeem Azhar, macro + tech convergence, unique framing
  createRssAdapter({
    id:       'rss_exponentialview',
    name:     'Exponential View',
    feedUrl:  'https://www.exponentialview.co/feed',
    category: Category.MarketSignals,
    tags:     ['macro', 'future', 'tech-convergence'],
  }),
  // TechCrunch Startups — deals, rounds, M&A — capital flow signal
  createRssAdapter({
    id:       'rss_tc_startups',
    name:     'TechCrunch Startups',
    feedUrl:  'https://techcrunch.com/category/startups/feed/',
    category: Category.MarketSignals,
    tags:     ['deals', 'vc', 'funding', 'startups'],
  }),
  // HackerNews — consensus signal from builders, often early indicator
  createRssAdapter({
    id:       'rss_hackernews',
    name:     'Hacker News Top',
    feedUrl:  'https://news.ycombinator.com/rss',
    category: Category.MarketSignals,
    tags:     ['tech', 'builders', 'signal'],
  }),
];
