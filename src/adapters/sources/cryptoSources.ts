import { createTelegramAdapter } from '../base/telegramRssAdapter';
import { createRssAdapter }      from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Crypto Research ──────────────────────────────────────────────────────────
// Only on-chain signal, exchange moves, and research. No generic crypto news.

export const cryptoSources: SourceAdapter[] = [

  // ── Telegram (public preview works) ──────────────────────────────────────
  createTelegramAdapter({
    id:              'tg_hugsfund',
    name:            'HugsFund',
    channelUsername: 'HugsFund',
    category:        Category.Crypto,
    tags:            ['crypto', 'analysis'],
  }),
  createTelegramAdapter({
    id:              'tg_falconinvestors',
    name:            'Falcon Investors',
    channelUsername: 'falconinvestors',
    category:        Category.Crypto,
    tags:            ['crypto', 'investing'],
  }),
  createTelegramAdapter({
    id:              'tg_finfalconx',
    name:            'FinFalconX',
    channelUsername: 'finfalconx',
    category:        Category.Crypto,
    tags:            ['crypto', 'analysis'],
  }),
  createTelegramAdapter({
    id:              'tg_doubletop',
    name:            'DoubleTop',
    channelUsername: 'doubletop',
    category:        Category.Crypto,
    tags:            ['crypto', 'technical'],
  }),
  createTelegramAdapter({
    id:              'tg_bybit_announcements',
    name:            'Bybit Announcements',
    channelUsername: 'Bybit_Announcements',
    category:        Category.Crypto,
    tags:            ['crypto', 'exchange', 'listing'],
  }),

  // ── RSS: research-grade crypto sources ───────────────────────────────────
  // The Block — institutional crypto news, data-driven
  createRssAdapter({
    id:       'rss_theblock',
    name:     'The Block',
    feedUrl:  'https://www.theblock.co/rss.xml',
    category: Category.Crypto,
    tags:     ['crypto', 'institutional', 'data'],
  }),

  // CoinDesk — market moves, institutional flows, on-chain data
  createRssAdapter({
    id:       'rss_coindesk',
    name:     'CoinDesk',
    feedUrl:  'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: Category.Crypto,
    tags:     ['crypto', 'markets', 'institutional'],
  }),

  // Decrypt — products, regulation, DeFi signals
  createRssAdapter({
    id:       'rss_decrypt',
    name:     'Decrypt',
    feedUrl:  'https://decrypt.co/feed',
    category: Category.Crypto,
    tags:     ['crypto', 'defi', 'products', 'regulation'],
  }),
];
