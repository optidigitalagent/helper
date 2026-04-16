// ─────────────────────────────────────────────────────────────────────────────
// Core type system for Personal AI Analyst
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ─────────────────────────────────────────────────────────────────────

/** Content categories for the Personal AI Analyst brief. */
export enum Category {
  // Primary categories
  MarketSignals = 'market_signals',   // macro + market movements + capital flows
  Crypto        = 'crypto',           // crypto research + on-chain signals
  Opportunities = 'opportunities',    // new tools, workflows, beta products, tactics you can use NOW
  Learning      = 'learning',         // deep research, papers, rare insights — worth studying
  Thinking      = 'thinking',         // founder/investor frameworks + contrarian views
  Podcast       = 'podcast',          // new episodes from signal sources
  // Legacy aliases (kept for DB backward-compat)
  AI     = 'ai',
  Macro  = 'macro',
  Ideas  = 'ideas',
}

/** Where a content item originated. */
export enum SourceType {
  Telegram = 'telegram',
  YouTube  = 'youtube',
  RSS      = 'rss',
  Website  = 'website',
  Official = 'official',
  Mock     = 'mock',
}

// ── Raw layer ─────────────────────────────────────────────────────────────────

/**
 * Data exactly as received from an external source — no transformation applied.
 * Adapters convert this into NormalizedItem.
 */
export interface RawSourceItem {
  source:     string;     // machine source ID, e.g. "tg_hugsfund"
  sourceType: SourceType;
  title:      string;
  content:    string;
  url?:       string;
  timestamp:  string;     // ISO string; adapter converts to Date on normalization
  category?:  Category;   // pre-set by adapter; if absent, auto-detected from content
}

// ── Normalized layer ──────────────────────────────────────────────────────────

/**
 * A single piece of content after normalization.
 * All adapters output this shape — ready for dedup, scoring, and digest.
 */
export interface NormalizedItem {
  id:          string;      // deterministic hash: sha256(source + url/title)
  source:      string;      // machine source ID
  sourceType:  SourceType;
  title:       string;
  content:     string;      // cleaned body text, max ~2000 chars
  url?:        string;
  timestamp:   Date;        // publish time
  category:    Category;
  language?:   string;      // ISO 639-1, e.g. "en", "ru"
  score?:      number;      // 0–100, assigned by scorer; undefined before scoring

  // Practical extras (not in the public spec, but needed internally)
  sourceName?: string;                  // human-readable label, e.g. "HugsFund"
  tags?:       string[];
  fetchedAt?:  Date;
  raw?:        Record<string, unknown>; // original payload, for debugging only

  // Clustering (computed after normalization, before ranking)
  clusterId?:          string;          // shared by items about the same story
  confirmationsCount?: number;          // how many sources cover this story
  isPrimary?:          boolean;         // is this the best item in its cluster
}

// ── Ranked layer ──────────────────────────────────────────────────────────────

/**
 * An item that has been scored and ranked.
 * `score` is required here (vs. optional in NormalizedItem).
 */
export type Confidence = 'high' | 'medium' | 'low';

export interface RankedItem extends NormalizedItem {
  score:      number;      // overrides optional — guaranteed present
  rank:       number;      // 1 = most important in its category
  confidence: Confidence;  // computed from score + confirmations + source tier
}

// ── Digest layer ──────────────────────────────────────────────────────────────

/** One category section of the morning brief. */
export interface DigestSection {
  category: Category;
  items:    RankedItem[];
  summary:  string;         // LLM-generated paragraph for this section
}

/** The complete morning briefing sent to Telegram. */
export interface MorningBrief {
  date:        string;          // ISO date string, e.g. "2026-04-06"
  sections:    DigestSection[];
  focus:       string;          // direction for the day — no motivation, no fluff
  closingLine: string;          // one sharp phrase to carry through the day
}

// ── Source adapter contract ───────────────────────────────────────────────────

/** Every source connector must implement this interface. */
export interface SourceAdapter {
  /** Unique machine ID, e.g. "tg_hugsfund" */
  id:   string;
  /** Human-readable label */
  name: string;
  /** Pull latest items. Pass null to fetch without a time filter. */
  fetch(since: Date | null): Promise<NormalizedItem[]>;
}

// ── Utility types ─────────────────────────────────────────────────────────────

/** All valid Category string values, useful for runtime checks. */
export const CATEGORIES: Record<Category, Category> = {
  [Category.MarketSignals]: Category.MarketSignals,
  [Category.Crypto]:        Category.Crypto,
  [Category.Opportunities]: Category.Opportunities,
  [Category.Learning]:      Category.Learning,
  [Category.Thinking]:      Category.Thinking,
  [Category.Podcast]:       Category.Podcast,
  [Category.AI]:            Category.AI,
  [Category.Macro]:         Category.Macro,
  [Category.Ideas]:         Category.Ideas,
};

/** Display labels for each category used in digest output. */
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.MarketSignals]: '📊 РЫНОК',
  [Category.AI]:            '🤖 ТЕХНОЛОГИИ',
  [Category.Opportunities]: '💡 ВОЗМОЖНОСТИ',
  [Category.Crypto]:        '📊 РЫНОК',   // merged into РЫНОК block
  [Category.Learning]:      '📚 ЧТО ИЗУЧИТЬ',
  [Category.Thinking]:      '🧠 ИДЕИ',
  [Category.Podcast]:       '🎙 ПОДКАСТЫ',
  // Legacy
  [Category.Macro]: '📊 РЫНОК',
  [Category.Ideas]: '🧠 ИДЕИ',
};

/** Ordered list of categories as they appear in the digest (priority top→bottom). */
export const CATEGORY_ORDER: Category[] = [
  Category.MarketSignals,
  Category.AI,            // Technologies / AI Tools — guaranteed slot
  Category.Opportunities,
  Category.Crypto,
  Category.Learning,
  Category.Thinking,
  Category.Podcast,
];
