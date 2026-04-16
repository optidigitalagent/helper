import { createRssAdapter } from '../base/rssAdapter';
import { SourceAdapter, Category } from '../../types';

// ─── Podcast Sources ──────────────────────────────────────────────────────────
// Only shows where the guest or topic alone is signal.
// Rule: if you can predict the content without listening — skip it.
// Note: 0 items is normal — these activate when new episodes drop.

export const podcastSources: SourceAdapter[] = [

  // Lex Fridman — scientists, CEOs, researchers, depth interviews
  createRssAdapter({
    id:       'rss_lex_fridman',
    name:     'Lex Fridman Podcast',
    feedUrl:  'https://lexfridman.com/feed/podcast/',
    category: Category.Podcast,
    tags:     ['podcast', 'ai', 'science', 'founders'],
  }),

  // Invest Like the Best — Patrick O'Shaughnessy, best investor format
  createRssAdapter({
    id:       'rss_invest_like_best',
    name:     'Invest Like the Best',
    feedUrl:  'https://feeds.megaphone.fm/investlikethebest',
    category: Category.Podcast,
    tags:     ['podcast', 'investing', 'frameworks'],
  }),
];
