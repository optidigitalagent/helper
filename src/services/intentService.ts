import OpenAI    from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { searchWeb } from './webSearch';
import { getUnsentItems } from '../db/itemsRepo';
import { Category, SourceType } from '../types';
import { logger } from '../utils/logger';

// ─── Intent types ─────────────────────────────────────────────────────────────

export type Intent =
  | 'ideas'        // хочу идеи, вдохновение
  | 'learning'     // хочу изучить тему, понять
  | 'tools'        // новые инструменты, что попробовать
  | 'market'       // рынки, макро, крипта
  | 'watch'        // хочу посмотреть видео/подкаст
  | 'deep_dive'    // хочу разобраться глубоко
  | 'quick_update' // что нового, кратко
  | 'philosophy'   // мышление, фреймворки, стратегия
  | 'unknown';

interface IntentClassification {
  intent:       Intent;
  topic:        string;   // конкретная тема если есть
  searchQuery:  string;   // English query for Tavily
  formats:      string[]; // video|podcast|article|course|tool|thread
  categories:   Category[];
}

// ─── Format hints per intent ──────────────────────────────────────────────────

const FORMAT_HINTS: Record<Intent, string> = {
  ideas:        'Give 1 podcast + 1 article + 1 short read. Focus on inspiration and new angles.',
  learning:     'Explain the topic in 2-3 sentences, then give best materials: course/video first, then articles.',
  tools:        'List 3-5 specific tools/products with one-line description and link. Practical only.',
  market:       'Give a brief market summary + 3 signal items with context.',
  watch:        'Recommend ONLY videos and podcasts — no articles. Give title, who, why watch now.',
  deep_dive:    'One deep-dive: best long-form, research paper, or course on this topic.',
  quick_update: 'Bullet points only. What happened, why it matters. No fluff.',
  philosophy:   'Recommend a podcast or long-form essay. Give a key idea from it.',
  unknown:      'Give a short useful answer and 2-3 relevant links.',
};

// ─── LLM setup ────────────────────────────────────────────────────────────────

const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'claude';
const OPENAI_MODEL  = process.env.OPENAI_MODEL  ?? 'gpt-4o-mini';
const CLAUDE_MODEL  = process.env.CLAUDE_MODEL  ?? 'claude-3-5-haiku-20241022';

async function llmCall(system: string, user: string, maxTokens = 800): Promise<string> {
  if (LLM_PROVIDER === 'claude') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res    = await client.messages.create({
      model: CLAUDE_MODEL, max_tokens: maxTokens,
      system, messages: [{ role: 'user', content: user }],
    });
    const block = res.content[0];
    return block.type === 'text' ? block.text : '';
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res    = await client.chat.completions.create({
    model: OPENAI_MODEL, temperature: 0.1, max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return res.choices[0]?.message?.content ?? '';
}

// ─── Step 1: classify intent ──────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `Classify the user's message into an intent and return ONLY valid JSON.

Intents:
- ideas: wants inspiration, fresh angles, "хочу идеи"
- learning: wants to understand a topic, "хочу понять X", "объясни X"
- tools: wants new tools/products, "что нового в AI", "инструменты"
- market: wants market/crypto/macro info
- watch: wants video or podcast, "хочу посмотреть/послушать"
- deep_dive: wants deep research on a topic
- quick_update: wants a quick summary of recent news
- philosophy: wants mindset/strategy/frameworks
- unknown: unclear or greeting

Return JSON:
{
  "intent": "...",
  "topic": "extracted topic in English (empty if general)",
  "searchQuery": "specific English Tavily search query",
  "formats": ["video","podcast","article","course","tool"],
  "categories": ["ai","opportunities","learning","thinking","market_signals","crypto","podcast"]
}`;

async function classifyIntent(text: string): Promise<IntentClassification> {
  try {
    const raw  = await llmCall(CLASSIFY_SYSTEM, text, 300);
    const json = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const p    = JSON.parse(json);
    return {
      intent:      p.intent      ?? 'unknown',
      topic:       p.topic       ?? '',
      searchQuery: p.searchQuery ?? text,
      formats:     Array.isArray(p.formats)    ? p.formats    : ['article'],
      categories:  Array.isArray(p.categories) ? p.categories : [Category.AI],
    };
  } catch {
    return {
      intent: 'unknown', topic: '', searchQuery: text,
      formats: ['article'], categories: [Category.AI],
    };
  }
}

// ─── Step 2: gather content ───────────────────────────────────────────────────

async function gatherContent(cls: IntentClassification): Promise<{ title: string; url: string; body: string; type: string }[]> {
  const results: { title: string; url: string; body: string; type: string }[] = [];

  // First: check existing DB for relevant unsent items (free)
  try {
    const since = new Date(Date.now() - 7 * 24 * 3_600_000); // 7 days
    const dbItems = await getUnsentItems(since, 30, cls.categories as Category[]);
    for (const item of dbItems.slice(0, 6)) {
      const type = item.sourceType === SourceType.YouTube ? 'video'
        : item.sourceType === 'podcast' as SourceType  ? 'podcast'
        : 'article';
      if (cls.formats.length > 0 && !cls.formats.includes(type) && !cls.formats.includes('article')) continue;
      results.push({ title: item.title, url: item.url ?? '', body: item.content.slice(0, 300), type });
    }
  } catch { /* graceful */ }

  // Supplement with Tavily if we need more or DB is sparse
  if (results.length < 3) {
    try {
      const webItems = await searchWeb(cls.searchQuery, 5);
      for (const item of webItems) {
        const type = item.sourceType === SourceType.YouTube ? 'video' : 'article';
        results.push({ title: item.title, url: item.url ?? '', body: item.content.slice(0, 300), type });
      }
    } catch { /* Tavily not configured */ }
  }

  return results.slice(0, 8);
}

// ─── Step 3: format response ─────────────────────────────────────────────────

const FORMAT_SYSTEM = `Ты — персональный куратор контента и эксперт.
Отвечай на РУССКОМ. Названия инструментов/продуктов — на английском.
Формат: Telegram Markdown. Компактно, без воды. Максимум 10 строк.
ВАЖНО: Если найденных материалов нет или мало — отвечай из своих знаний.
Объясни тему просто: что это, как работает, где используется, зачем нужно.
НИКОГДА не пиши "ничего не найдено" — всегда давай полезный ответ.`;

async function formatResponse(
  userText: string,
  cls: IntentClassification,
  content: { title: string; url: string; body: string; type: string }[],
): Promise<string> {
  const hint = FORMAT_HINTS[cls.intent];
  const contentBlock = content.length > 0
    ? content.map((c, i) => `[${i + 1}] ${c.type.toUpperCase()}: ${c.title}\nURL: ${c.url}\n${c.body}`).join('\n\n')
    : '(no content found)';

  const prompt = `Запрос пользователя: "${userText}"
Тема: ${cls.topic || 'общая'}
Инструкция: ${hint}

Найденные материалы:
${contentBlock}

Ответь пользователю — дай рекомендацию в нужном формате.`;

  try {
    return await llmCall(FORMAT_SYSTEM, prompt, 600);
  } catch (err) {
    logger.warn(`[intent] format LLM failed: ${(err as Error).message}`);
    return content.length > 0
      ? content.slice(0, 3).map((c) => `• [${c.title}](${c.url})`).join('\n')
      : 'Ничего не нашлось. Попробуй /search <тема>';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Minimum text length to treat as an intent query (not random noise) */
const MIN_QUERY_LENGTH = 4;

/** Keywords that signal an intent query */
const INTENT_TRIGGERS = /хочу|найди|покажи|дай|что нового|интересует|посоветуй|хочется|что такое|объясни|как работает|расскажи|что это|что происходит|что значит|want|find|show|give me|looking for|recommend|tell me|explain|what is|how does|how to|best|top|latest/i;

export function isIntentQuery(text: string): boolean {
  if (text.length < MIN_QUERY_LENGTH) return false;
  if (text.includes('?')) return true;
  return INTENT_TRIGGERS.test(text);
}

export async function handleIntentQuery(userText: string): Promise<string> {
  logger.info(`[intent] query: "${userText.slice(0, 80)}"`);
  const cls     = await classifyIntent(userText);
  logger.info(`[intent] classified as: ${cls.intent} / topic: "${cls.topic}"`);
  const content = await gatherContent(cls);
  return formatResponse(userText, cls, content);
}

/** Simple conversational reply — no search, no DB, just LLM */
export async function chatReply(text: string): Promise<string> {
  const system = `Ты — умный помощник в Telegram. Отвечай коротко и по делу на русском языке.
Если вопрос про технологии, AI, бизнес, крипту — дай полезный ответ из своих знаний.
Если простое приветствие или болтовня — ответь кратко и дружелюбно.
Без вступлений, без воды. Telegram Markdown.`;
  return llmCall(system, text, 400);
}

/** Explain any topic from model knowledge — used as search fallback */
export async function explainTopic(query: string): Promise<string> {
  const system = `Ты — эксперт. Объясняй темы простым языком на русском.
Структура ответа (Telegram Markdown, без воды):
• Что это — 1–2 предложения
• Как работает — 2–3 предложения
• Где используется / зачем — 1–2 предложения
Максимум 8 строк. Названия продуктов/технологий — на английском.
Не пиши заголовки — сразу суть.`;
  return llmCall(system, query, 500);
}
