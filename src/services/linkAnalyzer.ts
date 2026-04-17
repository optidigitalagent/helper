import axios     from 'axios';
import OpenAI    from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Category, SourceType, NormalizedItem } from '../types';
import { makeId }  from '../utils/hash';
import { logger }  from '../utils/logger';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ContentType   = 'video' | 'podcast' | 'article' | 'post' | 'channel' | 'interview' | 'tool' | 'site' | 'unknown';
export type KnowledgeType = 'news' | 'insight' | 'deep_knowledge' | 'tool' | 'learning' | 'podcast' | 'thinking';

export type Verdict = 'must_watch' | 'worth_watching' | 'can_skip' | 'skip';

export interface DiscoveredEntity {
  type:   'tool' | 'person' | 'channel' | 'source' | 'company';
  name:   string;
  url?:   string;
  notes?: string;
}

export interface SimilarSource {
  name: string;
  url:  string;   // website or direct RSS/feed URL
  why:  string;   // one line: why it's relevant
}

export interface LinkAnalysis {
  url:                 string;
  title:               string;
  source_name:         string;
  content_type:        ContentType;
  knowledge_type:      KnowledgeType;
  category:            Category;
  summary:             string;
  why_it_matters:      string;
  practical_value:     string;
  use_case:            string;
  quality_score:       number;      // 0–100
  should_save:         boolean;
  verdict:             Verdict;     // watch/skip decision
  should_track_source: boolean;     // add this source to watched list
  similar_sources:     SimilarSource[];
  discovered_entities: DiscoveredEntity[];
}

// ─── Content fetching ─────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;
const CONTENT_LIMIT    = 4_000;

function extractMeta(html: string, ...names: string[]): string {
  for (const name of names) {
    for (const re of [
      new RegExp(`<meta[^>]+(?:name|property)=["'](?:og:)?${name}["'][^>]+content=["']([^"']{1,500})["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:name|property)=["'](?:og:)?${name}["']`, 'i'),
    ]) {
      const m = html.match(re);
      if (m) return m[1].trim();
    }
  }
  return '';
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FetchedContent {
  title:       string;
  description: string;
  body:        string;
  domain:      string;
}

async function fetchContent(url: string): Promise<FetchedContent> {
  const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

  try {
    const res = await axios.get(url, {
      timeout:      FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      responseType: 'text',
      headers:      { 'User-Agent': 'Mozilla/5.0 (compatible; AnalysisBot/1.0)', Accept: 'text/html' },
    });

    const html        = typeof res.data === 'string' ? res.data : '';
    const title       = extractMeta(html, 'title') || html.match(/<title>([^<]{1,200})<\/title>/i)?.[1]?.trim() || '';
    const description = extractMeta(html, 'description');
    const body        = htmlToText(html).slice(0, CONTENT_LIMIT);

    return { title, description, body, domain };
  } catch (err) {
    logger.warn(`[linkAnalyzer] fetch failed: ${url} — ${(err as Error).message}`);
    return { title: '', description: '', body: '', domain };
  }
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'claude';
const OPENAI_MODEL = process.env.OPENAI_MODEL   ?? 'gpt-4o-mini';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL   ?? 'claude-3-5-haiku-20241022';

const ANALYSIS_SYSTEM = `Ты — аналитик контента для AI-builder'а. Анализируешь ссылку и возвращаешь ТОЛЬКО валидный JSON без markdown-обёртки.

JSON-схема ответа:
{
  "title": "название контента",
  "source_name": "источник / сайт / канал",
  "content_type": "video|podcast|article|post|channel|interview|tool|site|unknown",
  "knowledge_type": "news|insight|deep_knowledge|tool|learning|podcast|thinking",
  "category": "ai|market_signals|crypto|opportunities|learning|thinking|podcast",
  "summary": "суть в 1-2 предложениях — без воды",
  "why_it_matters": "одна конкретная причина, важная для builder'а",
  "practical_value": "что можно применить прямо сейчас",
  "use_case": "конкретный сценарий использования",
  "quality_score": 0-100,
  "should_save": true|false,
  "verdict": "must_watch|worth_watching|can_skip|skip",
  "should_track_source": true|false,
  "similar_sources": [
    { "name": "...", "url": "сайт или RSS", "why": "одна строка — почему стоит следить" }
  ],
  "discovered_entities": [
    { "type": "tool|person|channel|source|company", "name": "...", "url": "если есть", "notes": "зачем интересен" }
  ]
}

Правила оценки quality_score:
- 70–100: сильный инсайт, новый инструмент, глубокий разбор, ценный источник → should_save=true
- 40–69: полезная информация, но не уникальная
- 0–39: хайп без пользы, поверхностно, повтор известного

Правила verdict:
- must_watch: quality≥70, actionable, прямо сейчас полезно
- worth_watching: quality≥50, стоит изучить при наличии времени
- can_skip: quality≥30, интересно но не приоритетно
- skip: quality<30 или нерелевантно

should_track_source=true: если это регулярный источник (подкаст/канал/блог) с высоким качеством.
similar_sources: 2-3 реальных источника похожей тематики — только если уверен что они существуют.
Discovered entities: только реально упомянутые. Не придумывай.
Весь текст на русском, названия продуктов/инструментов — на английском.`;

async function callOpenAI(user: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res    = await client.chat.completions.create({
    model:       OPENAI_MODEL,
    temperature: 0.1,
    max_tokens:  1200,
    messages:    [{ role: 'system', content: ANALYSIS_SYSTEM }, { role: 'user', content: user }],
  });
  return res.choices[0]?.message?.content ?? '';
}

async function callClaude(user: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res    = await client.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: 1200,
    system:     ANALYSIS_SYSTEM,
    messages:   [{ role: 'user', content: user }],
  });
  const block = res.content[0];
  if (block.type !== 'text') throw new Error('Claude returned non-text block');
  return block.text;
}

function parseAnalysis(raw: string, url: string, domain: string): LinkAnalysis {
  const json = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  try {
    const p = JSON.parse(json);
    return {
      url,
      title:               p.title               ?? domain,
      source_name:         p.source_name         ?? domain,
      content_type:        p.content_type        ?? 'unknown',
      knowledge_type:      p.knowledge_type      ?? 'news',
      category:            p.category            ?? Category.AI,
      summary:             p.summary             ?? '',
      why_it_matters:      p.why_it_matters      ?? '',
      practical_value:     p.practical_value     ?? '',
      use_case:            p.use_case            ?? '',
      quality_score:       Math.min(100, Math.max(0, Number(p.quality_score ?? 50))),
      should_save:         Boolean(p.should_save),
      verdict:             (['must_watch','worth_watching','can_skip','skip'].includes(p.verdict) ? p.verdict : 'can_skip') as Verdict,
      should_track_source: Boolean(p.should_track_source),
      similar_sources:     Array.isArray(p.similar_sources) ? p.similar_sources : [],
      discovered_entities: Array.isArray(p.discovered_entities) ? p.discovered_entities : [],
    };
  } catch {
    logger.warn('[linkAnalyzer] failed to parse LLM JSON, returning fallback');
    return {
      url,
      title: domain, source_name: domain,
      content_type: 'unknown', knowledge_type: 'news', category: Category.AI,
      summary: 'Не удалось проанализировать контент.',
      why_it_matters: '', practical_value: '', use_case: '',
      quality_score: 0, should_save: false,
      verdict: 'skip' as Verdict,
      should_track_source: false, similar_sources: [],
      discovered_entities: [],
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Analyze a user-provided URL. Returns structured LinkAnalysis. */
export async function analyzeUrl(url: string): Promise<LinkAnalysis> {
  const content = await fetchContent(url);

  const userPrompt = [
    `URL: ${url}`,
    `Заголовок: ${content.title || '(не получен)'}`,
    `Описание: ${content.description || '(нет)'}`,
    `Контент:\n${content.body || '(не получен)'}`,
  ].join('\n\n');

  const raw = LLM_PROVIDER === 'claude'
    ? await callClaude(userPrompt)
    : await callOpenAI(userPrompt);

  return parseAnalysis(raw, url, content.domain);
}

/** Convert a high-quality LinkAnalysis into a NormalizedItem for the daily digest. */
export function analysisToItem(analysis: LinkAnalysis): NormalizedItem {
  const body = [
    analysis.summary,
    analysis.why_it_matters  ? `Почему важно: ${analysis.why_it_matters}`  : '',
    analysis.practical_value ? `Применение: ${analysis.practical_value}`   : '',
    analysis.use_case        ? `Кейс: ${analysis.use_case}`                 : '',
  ].filter(Boolean).join('\n\n');

  return {
    id:          makeId('analyzed_link', analysis.url),
    source:      'analyzed_link',
    sourceName:  analysis.source_name,
    sourceType:  SourceType.DeepKnowledge,
    title:       analysis.title,
    content:     body,
    url:         analysis.url,
    timestamp:   new Date(),
    fetchedAt:   new Date(),
    category:    analysis.category,
    score:       analysis.quality_score,
    tags:        ['manual', 'analyzed', analysis.knowledge_type],
  };
}
