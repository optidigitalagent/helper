import Anthropic from '@anthropic-ai/sdk';
import OpenAI    from 'openai';
import {
  RankedItem,
  Category,
  SourceType,
  CATEGORY_ORDER,
} from '../types';
import { listPodcastInsights, PodcastInsight } from '../db/knowledgeRepo';

// ─── Config ───────────────────────────────────────────────────────────────────

const LLM_PROVIDER   = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'claude';
const OPENAI_MODEL   = process.env.OPENAI_MODEL   ?? 'gpt-4o-mini';
const CLAUDE_MODEL   = process.env.CLAUDE_MODEL   ?? 'claude-3-5-haiku-20241022';
const MAX_TOKENS     = 5500;
const TEMPERATURE    = 0.2;

// Per-category item cap sent to LLM
const ITEMS_PER_CATEGORY: Partial<Record<Category, number>> = {
  [Category.AI]:            8,
  [Category.Opportunities]: 6,
  [Category.MarketSignals]: 4,
  [Category.Crypto]:        3,
  [Category.Thinking]:      4,
  [Category.Learning]:      3,
  [Category.Podcast]:       2,
};
const DEFAULT_ITEMS_CAP = 3;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — personal intelligence assistant. Каждое утро готовишь 3 отдельных Telegram-сообщения.

ПРОФИЛЬ ЧИТАТЕЛЯ: строит AI-системы и автоматизации, ищет edge раньше других, нет времени на пересказы и мотивацию.

ПРИОРИТЕТ КОНТЕНТА: deep knowledge + инсайды > новости > хайп.
Хайп допустим только если есть конкретная польза. Без пользы — не включай.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

БЛОК 1 — РЫНОК, МАКРО, КРИПТА

Фоновый блок. Только то, что реально влияет на решения или бизнес.
2–4 пункта. Слабый сигнал — пропустить.

Формат каждого пункта — ссылка ПРЯМО в тексте:
• **[Заголовок новости](url)** — почему важно → что ожидать

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

БЛОК 2 — ТЕХНОЛОГИИ, AI, ИНСТРУМЕНТЫ

Главный блок. Приоритет: новые модели, tools, workflow, агенты, coding tools.
4–6 пунктов. ТОЛЬКО реальные данные из секции ниже, не придумывай инструменты.

Формат каждого пункта — ссылка ПРЯМО в тексте:
**[Название инструмента/новости](url)** — что это → зачем → конкретный use case

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

БЛОК 3 — ИНСАЙДЫ, DEEP KNOWLEDGE

Не пересказ новостей. Не повторяй блоки 1 и 2. ТОЛЬКО реальные данные.

🔍 DEEP INSIGHT — глубокий материал (эссе, разбор, интервью):
**[Название](url)** — суть → что даёт builder'у

🧠 ТРЕНДЫ — 1–3 тезиса. Нестандартная интерпретация.

🎙 ПОДКАСТЫ / ВИДЕО:
**[Название](url)** — одна причина послушать сейчас.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

БЛОК 4 — НАПРАВЛЕНИЕ ДНЯ

Одна короткая мысль. Стиль: подкасты предпринимателей (MFM, Tim Ferriss, Acquired).
НЕ мотивация ("верь в себя", "ты можешь"). Только про действие, скорость, фокус, системное мышление, тестирование идей.
1–2 предложения максимум. Одна острая фраза. Без заголовков и эмодзи.

Пример (не копируй, придумай своё):
"Рынок не ждёт пока ты додумаешь — запусти MVP за 48 часов и посмотри что сломается."
"Лучший способ понять тренд — построить что-то маленькое на его вершине и посмотреть что упадёт."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

БЛОК 5 — ФИЛОСОФИЯ

Цитата или мысль от великих предпринимателей, философов, писателей — о бизнесе, жизни, деньгах, людях, решениях.
НЕ про AI, крипту или технологии. Только вечные темы.
Авторы: Мангер, Баффет, Сенека, Марк Аврелий, Безос, Маск, Грэм, Далио, Талеб, Черчилль и подобные.
Формат: цитата в кавычках, затем с новой строки — имя автора курсивом.
1–3 предложения. Только если цитата реально сильная и точная.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЖЁСТКИЕ ПРАВИЛА:
- Русский язык. Названия продуктов/компаний — на английском.
- Ссылки только из предоставленных данных (поле ССЫЛКА:). Не придумывай URL.
- Ссылка всегда инлайн в тексте: **[Название](url)** — НЕ отдельной строкой после.
- Если данных нет совсем — пиши 2–3 тезиса из своих знаний БЕЗ ссылок (не придумывай URL).
- Если несколько источников про одно — оставь лучший.
- Никогда не пиши "нет данных" пользователю.
- Короткие блоки. Без длинных абзацев.`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

// Deep knowledge items get more content so LLM can extract the actual insight
const CONTENT_LIMIT_DEFAULT    = 400;
const CONTENT_LIMIT_DEEP       = 700;

function itemLine(item: RankedItem, i: number): string {
  const confs = item.confirmationsCount && item.confirmationsCount > 0
    ? ` [×${item.confirmationsCount + 1} источника]`
    : '';
  const isDeep = item.sourceType === SourceType.DeepKnowledge;
  const limit  = isDeep ? CONTENT_LIMIT_DEEP : CONTENT_LIMIT_DEFAULT;
  const typeTag = isDeep ? ' [DEEP]' : '';
  // URL inline so LLM always sees it next to the title
  const urlInline = item.url ? ` → ССЫЛКА: ${item.url}` : '';
  return (
    `[${i + 1}] ${item.sourceName ?? item.source}${typeTag}${confs} — ${item.title}${urlInline}` +
    `\n${item.content.slice(0, limit)}`
  );
}

function buildUserPrompt(grouped: Map<Category, RankedItem[]>, podcastInsights: PodcastInsight[] = []): string {
  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Блок 1: рынок + крипта ────────────────────────────────────────────────
  const marketItems = [
    ...(grouped.get(Category.MarketSignals) ?? []),
    ...(grouped.get(Category.Crypto)        ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);   // max 4 — фоновый блок

  // ── Блок 2: технологии + возможности ─────────────────────────────────────
  const techItems = [
    ...(grouped.get(Category.AI)            ?? []),
    ...(grouped.get(Category.Opportunities) ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ── Блок 3: deep knowledge + идеи + обучение + подкасты ──────────────────
  // Fallback: if deep sources are empty, pull from top AI/Opportunities items
  const ideasRaw = [
    ...(grouped.get(Category.Thinking) ?? []),
    ...(grouped.get(Category.Learning) ?? []),
    ...(grouped.get(Category.Podcast)  ?? []),
  ].sort((a, b) => b.score - a.score);

  const ideasItems = ideasRaw.length >= 3
    ? ideasRaw.slice(0, 8)
    : [
        ...ideasRaw,
        // pad with best AI items not already in techItems
        ...(grouped.get(Category.AI) ?? [])
          .filter((i) => !techItems.some((t) => t.id === i.id))
          .slice(0, 6 - ideasRaw.length),
      ].slice(0, 8);

  const sections: string[] = [
    `## Данные для БЛОКА 1 (РЫНОК/МАКРО/КРИПТА)\n${
      marketItems.length > 0
        ? marketItems.map((i, n) => itemLine(i, n)).join('\n\n')
        : '(нет свежих данных — напиши что рынки без новостей сегодня)'
    }`,
    `## Данные для БЛОКА 2 (ТЕХНОЛОГИИ/AI/ИНСТРУМЕНТЫ)\n${
      techItems.length > 0
        ? techItems.map((i, n) => itemLine(i, n)).join('\n\n')
        : '(нет свежих данных из источников — напиши 3–4 пункта из своих знаний: последние AI-инструменты, новые модели, workflow-хаки, интересные продукты. Без выдуманных ссылок — просто название без скобок.)'
    }`,
    `## Данные для БЛОКА 3 (ИДЕИ/МЫШЛЕНИЕ/ПОДКАСТЫ)\n${
      ideasItems.length > 0
        ? ideasItems.map((i, n) => itemLine(i, n)).join('\n\n')
        : '(нет свежих данных из источников — напиши 2–3 deep insight из своих знаний: тренды, нестандартные гипотезы, куда движется область. Без ссылок.)'
    }`,
  ];

  const insightsBlock = podcastInsights.length > 0
    ? `## Контекст из подкастов (используй для стиля БЛОКА 4)\n` +
      podcastInsights.map((p) =>
        `— ${p.source_name}: "${p.title}"\n  Суть: ${p.summary.slice(0, 150)}\n  Почему важно: ${p.why_it_matters.slice(0, 100)}`
      ).join('\n\n')
    : '';

  return (
    `Дата: ${date}.\n\n` +
    sections.join('\n\n---\n\n') +
    (insightsBlock ? `\n\n---\n\n${insightsBlock}` : '') +
    `\n\n---\n\n` +
    `Напиши строго 5 сообщений. Разделяй точно по маркерам:\n` +
    `===MSG1===\n[блок 1 — рынок]\n===MSG2===\n[блок 2 — технологии]\n===MSG3===\n[блок 3 — инсайды]\n===MSG4===\n[блок 4 — направление дня, 1-2 предложения]\n===MSG5===\n[ТОЛЬКО цитата + имя автора, максимум 3 строки]\n===END===`
  );
}

// ─── LLM clients ─────────────────────────────────────────────────────────────

async function callOpenAI(prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model:       OPENAI_MODEL,
    temperature: TEMPERATURE,
    max_tokens:  MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty response');
  return text;
}

async function callClaude(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: prompt }],
  });
  const block = res.content[0];
  if (block.type !== 'text') throw new Error('Claude returned non-text block');
  return block.text;
}

async function callLLM(prompt: string): Promise<string> {
  return LLM_PROVIDER === 'claude' ? callClaude(prompt) : callOpenAI(prompt);
}

// ─── Response parser ──────────────────────────────────────────────────────────

const MSG_HEADERS = [
  { marker: '===MSG1===', label: '📊 *РЫНОК И МАКРО*' },
  { marker: '===MSG2===', label: '🤖 *ТЕХНОЛОГИИ И ИНСТРУМЕНТЫ*' },
  { marker: '===MSG3===', label: '🔍 *ИНСАЙДЫ И DEEP KNOWLEDGE*' },
  { marker: '===MSG4===', label: '🎯 *НАПРАВЛЕНИЕ ДНЯ*' },
  { marker: '===MSG5===', label: '💡 *ФИЛОСОФИЯ*' },
];

function parseMessages(raw: string): string[] {
  const idx: number[] = MSG_HEADERS.map((h) => raw.indexOf(h.marker));
  const idxEnd = raw.indexOf('===END===');

  const result: string[] = [];

  for (let i = 0; i < MSG_HEADERS.length; i++) {
    const start = idx[i];
    if (start === -1) continue;

    const contentStart = start + MSG_HEADERS[i].marker.length;
    // End at next MSG marker or END marker
    const nextIdx = [idx[i + 1], idxEnd].filter((x) => x !== -1 && x > start);
    const end = nextIdx.length > 0 ? Math.min(...nextIdx) : raw.length;

    const body = raw.slice(contentStart, end).trim();
    if (!body) continue;

    result.push(`${MSG_HEADERS[i].label}\n\n${body}`);
  }

  // Fallback: if LLM ignored delimiters, return as single message
  if (result.length === 0) {
    result.push(raw.trim());
  }

  return result;
}

// ─── DigestService ────────────────────────────────────────────────────────────

export class DigestService {
  /** Returns an array of up to 4 ready-to-send Telegram message strings. */
  async generateBrief(items: RankedItem[]): Promise<string[]> {
    const grouped  = this.groupByCategory(items);
    const insights = await listPodcastInsights(5).catch(() => [] as PodcastInsight[]);
    const prompt   = buildUserPrompt(grouped, insights);
    const raw      = await callLLM(prompt);
    return parseMessages(raw);
  }

  private groupByCategory(items: RankedItem[]): Map<Category, RankedItem[]> {
    const map = new Map<Category, RankedItem[]>();

    for (const category of CATEGORY_ORDER) {
      const cap    = ITEMS_PER_CATEGORY[category] ?? DEFAULT_ITEMS_CAP;
      const bucket = items
        .filter((i) => i.category === category)
        .sort((a, b) => b.score - a.score)
        .slice(0, cap);

      if (bucket.length > 0) map.set(category, bucket);
    }

    return map;
  }
}

export const digestService = new DigestService();
