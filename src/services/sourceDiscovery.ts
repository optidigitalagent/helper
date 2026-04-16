import axios  from 'axios';
import Parser from 'rss-parser';
import { logger } from '../utils/logger';

const parser = new Parser();

// Common feed paths to probe
const FEED_PATHS = [
  '/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml',
  '/feed/podcast/', '/blog/feed', '/blog/rss.xml',
  '/index.xml', '/feeds/posts/default',
];

/** Try to fetch and parse a URL as an RSS/Atom feed. Returns true if valid. */
async function isValidFeed(url: string): Promise<boolean> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Extract RSS/Atom links from HTML <link rel="alternate"> tags. */
function extractFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  const re = /<link[^>]+type=["'](application\/(rss|atom)\+xml|text\/xml)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[3];
    links.push(href.startsWith('http') ? href : new URL(href, baseUrl).toString());
  }
  // Also try href-first variant
  const re2 = /<link[^>]+href=["']([^"']+)["'][^>]+type=["'](application\/(rss|atom)\+xml|text\/xml)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    const href = m[1];
    links.push(href.startsWith('http') ? href : new URL(href, baseUrl).toString());
  }
  return [...new Set(links)];
}

export interface DiscoveryResult {
  feedUrl:  string;
  siteName: string;
}

/**
 * Given any URL, try to discover an RSS/Atom feed.
 * Returns null if nothing found.
 */
export async function discoverFeed(inputUrl: string): Promise<DiscoveryResult | null> {
  // 1. Maybe the URL itself is already a feed
  if (await isValidFeed(inputUrl)) {
    return { feedUrl: inputUrl, siteName: new URL(inputUrl).hostname };
  }

  const base = (() => {
    try { return new URL(inputUrl).origin; } catch { return null; }
  })();
  if (!base) return null;

  // 2. Fetch the HTML page and look for <link rel="alternate">
  try {
    const res  = await axios.get(inputUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)' },
      maxRedirects: 5,
    });
    const html     = typeof res.data === 'string' ? res.data : '';
    const htmlLinks = extractFeedLinksFromHtml(html, base);

    for (const link of htmlLinks) {
      if (await isValidFeed(link)) {
        const siteName = html.match(/<title>([^<]{1,60})<\/title>/i)?.[1]?.trim()
          ?? new URL(inputUrl).hostname;
        return { feedUrl: link, siteName };
      }
    }

    // 3. Probe common paths
    for (const path of FEED_PATHS) {
      const candidate = `${base}${path}`;
      if (await isValidFeed(candidate)) {
        const siteName = html.match(/<title>([^<]{1,60})<\/title>/i)?.[1]?.trim()
          ?? new URL(inputUrl).hostname;
        return { feedUrl: candidate, siteName };
      }
    }
  } catch (err) {
    logger.warn(`[sourceDiscovery] failed to fetch ${inputUrl}: ${(err as Error).message}`);
  }

  return null;
}

/** Extract meaningful keywords from a text string (for interest tracking). */
export function extractKeywords(text: string): string[] {
  const STOP = new Set([
    'the','and','for','with','that','this','from','have','been','will',
    'are','was','not','but','what','how','why','when','can','you','your',
    'our','its','all','more','new','use','get','has','had','his','her',
    'они','это','как','что','для','или','при','его','её','все','уже',
    'есть','если','будет','были','еще','так','нет',
  ]);

  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')   // strip URLs
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .slice(0, 15);                     // top 15 words per item
}
