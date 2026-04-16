import { SourceAdapter } from '../types';
import { createRssAdapter } from './base/rssAdapter';
import { getUserSources }   from '../db/userSourcesRepo';
import { logger }           from '../utils/logger';

/** Load user-added RSS sources from Supabase and return as adapters. */
export async function loadUserAdapters(): Promise<SourceAdapter[]> {
  try {
    const sources = await getUserSources();
    if (sources.length === 0) return [];

    const adapters = sources.map((s) =>
      createRssAdapter({
        id:       s.id,
        name:     s.name,
        feedUrl:  s.feedUrl,
        category: s.category,
        tags:     ['user-added'],
      }),
    );

    logger.info(`[userSources] loaded ${adapters.length} user source(s)`);
    return adapters;
  } catch (err) {
    logger.warn('[userSources] failed to load:', err);
    return [];
  }
}
