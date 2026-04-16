import { NormalizedItem, RankedItem, Category, Confidence } from '../types';
import { tierBonus, SOURCE_GOVERNANCE }                     from './sourceGovernance';
import { getUserInterests, UserInterest }                   from '../db/userSourcesRepo';

// ─── Source Weights ───────────────────────────────────────────────────────────
// Base signal density score. Tier bonus from sourceGovernance.ts is added on top.

export const SOURCE_WEIGHTS: Record<string, number> = {
  // Market Signals
  tg_spydell:          28,
  rss_exponentialview: 22,
  tg_markettwits:      18,
  tg_finance_instinct: 14,
  rss_tc_startups:     16,
  rss_hackernews:       8,

  // Crypto
  tg_hugsfund:            24,
  tg_bybit_announcements: 20,
  rss_theblock:           18,
  tg_falconinvestors:     17,
  tg_doubletop:           15,
  tg_finfalconx:          15,

  // Opportunities
  rss_tldr_ai:          20,
  rss_simon_willison:   28,
  rss_one_useful_thing: 23,
  rss_producthunt_ai:   12,

  // Learning
  rss_karpathy:         35,   // event-level when published
  rss_interconnects:    20,
  rss_import_ai:        18,
  rss_huggingface_blog: 13,
  rss_ycombinator:      14,
  rss_openai_news:      26,
  rss_google_ai_blog:   13,
  rss_mit_ai:           12,

  // Thinking
  rss_stratechery:      28,
  rss_notboring:        20,
  rss_pmarca:           18,
  tg_margulan:           8,
  tg_xb_prosmm:          9,

  // Podcasts
  rss_lex_fridman:      16,
  rss_invest_like_best: 18,
};

// ─── Category Weights ─────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<Category, number> = {
  [Category.AI]:             15,   // Technologies / AI Tools — highest priority
  [Category.Opportunities]:  13,
  [Category.MarketSignals]:  10,
  [Category.Thinking]:        9,
  [Category.Learning]:        8,
  [Category.Crypto]:          8,   // reduced to prevent crypto dominance
  [Category.Podcast]:         4,
  [Category.Macro]:           5,   // legacy
  [Category.Ideas]:           3,   // legacy
};

// ─── Freshness ────────────────────────────────────────────────────────────────

const FRESHNESS_RULES: Array<{ maxAgeMs: number; bonus: number }> = [
  { maxAgeMs:  4 * 3_600_000, bonus: 12 },
  { maxAgeMs: 12 * 3_600_000, bonus:  7 },
  { maxAgeMs: 24 * 3_600_000, bonus:  3 },
];

// ─── Signal Keywords ──────────────────────────────────────────────────────────

const SIGNAL_KEYWORDS: RegExp[] = [
  /\b(launched?|released?|announced?|introducing|shipped)\b/i,
  /\b(gpt|claude|gemini|llama|mistral|qwen|deepseek|o[123])\b/i,
  /\b(crash(ed)?|dump(ed)?|surged?|ath|all.?time.?high|rally)\b/i,
  /\b(fed|fomc|rate.?cut|rate.?hike|inflation|gdp|cpi)\b/i,
  /\b(acqui(red|sition)|ipo|merger|raised|funding|valuation)\b/i,
  /\b(hack(ed)?|exploit|breach|ban(ned)?|regulat)\b/i,
  /\b(breaking|urgent|alert)\b/i,
];

// ─── New Dimensions ───────────────────────────────────────────────────────────

const APPLICABILITY_HIGH: RegExp = /\b(tool|workflow|automation|prompt|tutorial|how.?to|template|plugin|integration|api|sdk|free|beta|open.?source|github|notebook|demo|guide|step.?by.?step|use.?case)\b/i;
const APPLICABILITY_LOW:  RegExp = /\b(analysis|opinion|theory|prediction|forecast|perspective|commentary|essay)\b/i;

function applicabilityScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (APPLICABILITY_HIGH.test(text)) return 10;
  if (APPLICABILITY_LOW.test(text))  return  0;
  return 3;
}

// "This just shipped" — максимальный буст, самый важный сигнал для early signal hunter
const LAUNCH_SIGNAL: RegExp = /\b(just.?(released?|launched?|shipped|dropped|announced)|introducing|now.?available|v\d+\.\d+|initial.?release|open.?sourced|released.?today|launches?|new.?feature|new.?model|new.?update|update.?released?)\b/i;
const NOVELTY_STRONG: RegExp = /\b(first|new|beta|early.?access|preview|announced|today)\b/i;
const NOVELTY_WEAK:   RegExp = /\b(overview|review|recap|retrospective|history|explained?|guide.?to|what.?is)\b/i;

function noveltyScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (LAUNCH_SIGNAL.test(text))  return 18;  // "just launched" → highest priority
  if (NOVELTY_STRONG.test(text)) return  8;
  if (NOVELTY_WEAK.test(text))   return  1;
  return 3;
}

const LEVERAGE_KEYWORDS: RegExp = /\b(automat(e|ion)|10x|save.?time|unfair|asymmetric|multiplier|competi(tive|tor)|moat|edge|leverage|scale|system|framework|arbitrage|underrated|hidden|most.?don.?t|few.?know)\b/i;
const HIGH_LEVERAGE_SOURCES = new Set(['rss_karpathy', 'rss_simon_willison', 'rss_stratechery', 'tg_spydell', 'rss_interconnects']);

function leverageScore(title: string, content: string, source: string): number {
  const text   = `${title} ${content}`;
  const srcBonus = HIGH_LEVERAGE_SOURCES.has(source) ? 6 : 0;
  return (LEVERAGE_KEYWORDS.test(text) ? 8 : 0) + srcBonus;
}

const PROFILE_MATCH: RegExp = /\b(ai|llm|agent|automation|workflow|crypto|bitcoin|defi|startup|founder|saas|product|revenue|growth|investment|venture|system|build|deploy|scale|tool|model)\b/i;
const PROFILE_NOISE: RegExp = /\b(celebrity|sports|gaming(?!.*ai)|fashion|lifestyle|cooking|travel|entertainment|movie|tv.?show)\b/i;

// Items with ZERO of: decision angle / idea / leverage / insight → score floor
const HAS_VALUE: RegExp = /\b(how|why|what|when|new|tool|build|launch|market|invest|ai|crypto|model|system|strategy|learn|growth|automat|insight|signal|opportunit|leverage|analys)\b/i;

function personalRelevanceScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (PROFILE_NOISE.test(text))              return -10;
  if (!HAS_VALUE.test(text))                 return  -5;  // no decision-relevant content
  if (PROFILE_MATCH.test(text))              return   8;
  return 0;
}

// ─── Confirmation Bonus ───────────────────────────────────────────────────────

function confirmationBonus(confirmationsCount: number): number {
  if (confirmationsCount >= 3) return 12;
  if (confirmationsCount >= 2) return  8;
  if (confirmationsCount >= 1) return  4;
  return 0;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function computeConfidence(
  score:        number,
  source:       string,
  confirmations: number,
): Confidence {
  const isCoreSource = SOURCE_GOVERNANCE[source]?.priorityTier === 'core';

  if (score >= 55 || (score >= 42 && confirmations >= 2) || (isCoreSource && score >= 48)) {
    return 'high';
  }
  if (score >= 32 || confirmations >= 1) {
    return 'medium';
  }
  return 'low';
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

const MAX_SCORE     = 100;
const DEFAULT_TOP_N =  22;

function computeScore(item: NormalizedItem): number {
  const text = `${item.title} ${item.content}`;
  const ageMs = Date.now() - item.timestamp.getTime();

  const fresh = FRESHNESS_RULES.find((r) => ageMs < r.maxAgeMs)?.bonus ?? 0;
  const signalBonus = Math.min(
    SIGNAL_KEYWORDS.filter((re) => re.test(text)).length * 5,
    10,
  );
  const srcWeight = SOURCE_WEIGHTS[item.source] ?? 5;

  const total =
    srcWeight +
    tierBonus(item.source) +
    (CATEGORY_WEIGHTS[item.category] ?? 3) +
    fresh +
    signalBonus +
    applicabilityScore(item.title, item.content) +
    noveltyScore(item.title, item.content) +
    leverageScore(item.title, item.content, item.source) +
    personalRelevanceScore(item.title, item.content) +
    confirmationBonus(item.confirmationsCount ?? 0) +
    interestScore(item.title, item.content);   // learned from user behaviour

  return Math.min(Math.max(total, 0), MAX_SCORE);
}

// ─── Category caps ────────────────────────────────────────────────────────────
// Prevent any single group from dominating the pool sent to the LLM.

const CATEGORY_CAP: Partial<Record<Category, number>> = {
  [Category.Crypto]:        5,   // max 5 crypto items (was flooding the brief)
  [Category.MarketSignals]: 4,   // max 4 market items
};

// ─── User Interest Score ──────────────────────────────────────────────────────
// Cached in-memory; refreshed each pipeline run via RankingService.setInterests()

let _interestCache: UserInterest[] = [];

/** Call once per pipeline run to refresh the interest cache from DB. */
export async function refreshInterestCache(): Promise<void> {
  try {
    _interestCache = await getUserInterests();
  } catch {
    _interestCache = [];
  }
}

function interestScore(title: string, content: string): number {
  if (_interestCache.length === 0) return 0;
  const text  = `${title} ${content}`.toLowerCase();
  let   score = 0;
  for (const { keyword, weight } of _interestCache) {
    if (text.includes(keyword)) {
      // Heavier keywords (added many times) give more boost, capped at 15
      score += Math.min(weight * 2, 6);
    }
  }
  return Math.min(score, 15);
}

// ─── RankingService ───────────────────────────────────────────────────────────

export class RankingService {
  private readonly topN: number;

  constructor(topN: number = DEFAULT_TOP_N) {
    this.topN = topN;
  }

  rank(items: NormalizedItem[]): RankedItem[] {
    const scored = items
      .map((item): RankedItem => {
        const score      = computeScore(item);
        const confidence = computeConfidence(score, item.source, item.confirmationsCount ?? 0);
        return { ...item, score, rank: 0, confidence };
      })
      .sort((a, b) => b.score - a.score);

    // Apply per-category caps before final slice
    const catCount = new Map<Category, number>();
    const capped: RankedItem[] = [];

    for (const item of scored) {
      const cap     = CATEGORY_CAP[item.category];
      const current = catCount.get(item.category) ?? 0;
      if (cap !== undefined && current >= cap) continue;
      catCount.set(item.category, current + 1);
      capped.push(item);
      if (capped.length >= this.topN) break;
    }

    return capped.map((item, index) => ({ ...item, rank: index + 1 }));
  }
}

export const rankingService = new RankingService();
