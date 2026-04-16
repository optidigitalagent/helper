import { RawSourceItem, NormalizedItem, Category, SourceType } from '../types';
import { makeId } from '../utils/hash';

// ─── Category detection ───────────────────────────────────────────────────────

// ─── Opportunities reclassification ──────────────────────────────────────────
// Items from AI/Learning sources that match "opportunity" patterns get
// promoted to Opportunities — they're actionable, not just informational.

const OPPORTUNITY_PATTERN: RegExp = /\b(new tool|just (released?|launched?|shipped|dropped)|beta|open.?source|free|introducing|github\.com|workflow|automation|prompt|plugin|api.?(access|key|released?)|tutorial|how.?to.?(use|build|create)|template|notebook|demo|course|free.?course|certification|program|free.?access|early.?access)\b/i;

/** Sources whose content should be checked for opportunity reclassification */
const OPPORTUNITY_SOURCE_PREFIXES = ['rss_', 'tg_xb'];

function maybePromoteToOpportunities(
  category: Category,
  title: string,
  content: string,
  source: string,
): Category {
  // Only reclassify from AI-adjacent categories (not from market/crypto)
  const reclassifiable = [Category.AI, Category.Learning, Category.Thinking] as Category[];
  if (!reclassifiable.includes(category)) return category;
  if (!OPPORTUNITY_SOURCE_PREFIXES.some((p) => source.startsWith(p))) return category;
  if (OPPORTUNITY_PATTERN.test(`${title} ${content}`)) return Category.Opportunities;
  return category;
}

// ─── Category keyword detection ───────────────────────────────────────────────

const CATEGORY_KEYWORDS: Partial<Record<Category, RegExp>> = {
  [Category.Crypto]:        /\b(btc|eth|bitcoin|ethereum|crypto|token|defi|nft|blockchain|altcoin|stablecoin|market.?cap|on.?chain|exchange|wallet|solana|sol|bnb|xrp|bybit|binance|coinbase)\b/i,
  [Category.MarketSignals]: /\b(inflation|fed|federal.?reserve|fomc|interest.?rate|cpi|gdp|recession|treasury|yield|dollar|macro|economy|s&p|nasdaq|deal|funding|m&a|ipo|vc)\b/i,
  [Category.Opportunities]: /\b(new tool|just.?released?|beta|plugin|workflow|automation|free.?course|certification|how.?to.?build|open.?source.?release)\b/i,
  [Category.AI]:            /\b(ai|artificial.?intelligence|model|gpt|llm|claude|gemini|neural|transformer|agent|inference|fine.?tun|embedding|hugging.?face|openai|anthropic|deepmind|mistral|llama|rlhf)\b/i,
  [Category.Thinking]:      /\b(founder|entrepreneur|startup|strategy|leadership|framework|mental.?model|decision|philosophy|growth|saas|business.?model|venture)\b/i,
  [Category.Podcast]:       /\b(episode|podcast|interview|guest|listen|host|show)\b/i,
  [Category.Learning]:      /\b(course|tutorial|paper|research|study|learn|guide|deep.?dive|book|lecture)\b/i,
  // Legacy
  [Category.Macro]:  /\b(inflation|fed|rate|gdp|recession|macro|economy)\b/i,
  [Category.Ideas]:  /\b(idea|mindset|productivity|build|marketing|revenue)\b/i,
};

// Priority order: first match wins
const CATEGORY_PRIORITY: Category[] = [
  Category.Crypto,
  Category.Opportunities,
  Category.AI,
  Category.MarketSignals,
  Category.Thinking,
  Category.Podcast,
  Category.Learning,
];

/**
 * Detect category from combined title + content text.
 * If `preset` is provided (set by the adapter), it takes precedence.
 * Then runs Opportunities promotion pass.
 */
function detectCategory(title: string, content: string, source: string, preset?: Category): Category {
  let category: Category;

  if (preset !== undefined) {
    category = preset;
  } else {
    const text = `${title} ${content}`;
    category = Category.Crypto; // safe default
    for (const cat of CATEGORY_PRIORITY) {
      const re = CATEGORY_KEYWORDS[cat];
      if (re && re.test(text)) { category = cat; break; }
    }
  }

  return maybePromoteToOpportunities(category, title, content, source);
}

// ─── Source type inference ────────────────────────────────────────────────────

const SOURCE_TYPE_HINTS: Array<{ pattern: RegExp; type: SourceType }> = [
  { pattern: /^tg_/,      type: SourceType.Telegram },
  { pattern: /^yt_/,      type: SourceType.YouTube  },
  { pattern: /^rss_/,     type: SourceType.RSS      },
  { pattern: /^official_/,type: SourceType.Official },
  { pattern: /^mock/,     type: SourceType.Mock     },
];

/**
 * If the adapter already provided a sourceType, use it.
 * Otherwise infer from the source ID prefix.
 */
function resolveSourceType(raw: RawSourceItem): SourceType {
  if (raw.sourceType) return raw.sourceType;
  for (const { pattern, type } of SOURCE_TYPE_HINTS) {
    if (pattern.test(raw.source)) return type;
  }
  return SourceType.Website;
}

// ─── Language detection ───────────────────────────────────────────────────────

/** Lightweight heuristic — good enough for RU vs EN without an external lib. */
function detectLanguage(text: string): string {
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) ?? []).length;
  const ratio = cyrillicChars / Math.max(text.length, 1);
  return ratio > 0.15 ? 'ru' : 'en';
}

// ─── Text cleaning ────────────────────────────────────────────────────────────

// Patterns removed during cleaning
const JUNK_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/g,           // inline URLs (keep the url field instead)
  /\s*[@#]\w+/g,               // @mentions and #hashtags
  /\s*[📌📢🔔💬🚀🙏👇👆🔗💡🎯⚡️]+/gu, // common Telegram emoji decorators
  /\n{3,}/g,                   // excess blank lines
  /[ \t]{2,}/g,                // multiple spaces / tabs
];

/** Strip junk, normalize whitespace, trim. */
function cleanText(raw: string): string {
  let text = raw;
  for (const pattern of JUNK_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Trim title and collapse any internal whitespace runs. */
function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ─── Timestamp parsing ────────────────────────────────────────────────────────

/**
 * Parse an ISO string or unix epoch (string) to Date.
 * Returns current time on parse failure rather than throwing.
 */
function parseTimestamp(raw: string): Date {
  // Unix epoch in seconds (10 digits)
  if (/^\d{10}$/.test(raw.trim())) {
    return new Date(parseInt(raw, 10) * 1000);
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// ─── NormalizerService ────────────────────────────────────────────────────────

export class NormalizerService {
  /**
   * Convert an array of raw source items into normalized items.
   * Each item is cleaned, categorized, and assigned a deterministic ID.
   */
  normalize(items: RawSourceItem[]): NormalizedItem[] {
    return items.map((raw) => this.normalizeOne(raw));
  }

  private normalizeOne(raw: RawSourceItem): NormalizedItem {
    const title     = cleanTitle(raw.title);
    const content   = cleanText(raw.content).slice(0, 2000);
    const timestamp = parseTimestamp(raw.timestamp);
    const category  = detectCategory(title, content, raw.source, raw.category);
    const sourceType = resolveSourceType(raw);
    const language  = detectLanguage(`${title} ${content}`);
    const id        = makeId(raw.source, raw.url ?? title);

    return {
      id,
      source:     raw.source,
      sourceType,
      title,
      content,
      url:        raw.url,
      timestamp,
      category,
      language,
      fetchedAt:  new Date(),
    };
  }
}

export const normalizer = new NormalizerService();
