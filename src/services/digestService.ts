import Anthropic from '@anthropic-ai/sdk';
import OpenAI    from 'openai';
import {
  RankedItem,
  Category,
  CATEGORY_ORDER,
} from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const LLM_PROVIDER   = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'claude';
const OPENAI_MODEL   = process.env.OPENAI_MODEL   ?? 'gpt-4o-mini';
const CLAUDE_MODEL   = process.env.CLAUDE_MODEL   ?? 'claude-3-5-haiku-20241022';
const MAX_TOKENS     = 3200;
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

const SYSTEM_PROMPT = `Ты — personal intelligence assistant. Каждое утро готовишь 3 отдельных Telegram-сообщения для человека, который строит AI-системы и ищет преимущество раньше других.

ПРОФИЛЬ ЧИТАТЕЛЯ:
- Строит AI-системы и автоматизации
- Ищет новые инструменты с практическим edge прямо сейчас
- Хочет знать раньше других: что вышло, что работает, где возможность
- Нет времени на пересказы, очевидное и мотивацию

────────────────────────────────────────────

БЛОК 1 — РЫНОК, МАКРО, КРИПТА, ГЕОПОЛИТИКА

Это фоновый блок. Короткий и по делу. Только сигналы, которые реально влияют на решения или бизнес.
Максимум 4-5 пунктов. Если нечего добавить — блок короче, не растягивай.

Формат каждого пункта (строго):
• **Что произошло** — почему важно одной фразой → что ожидать / какие последствия

────────────────────────────────────────────

БЛОК 2 — ТЕХНОЛОГИИ, AI, ИНСТРУМЕНТЫ, ПРОДУКТЫ

Главный блок. Приоритет: новые AI модели, tools, workflow, агенты, automation, coding tools, image/video tools, новые фичи.
5-7 пунктов. Каждый пункт — обязательно с direct link на первоисточник.

Формат каждого пункта (строго):
**[Название](url)** — что вышло / что даёт → как использовать → конкретный use case для AI-builder'а или автоматизатора

Показывай только то, что реально можно использовать или важно знать сегодня.
Если у источника нет URL — не придумывай, пропусти ссылку.

────────────────────────────────────────────

БЛОК 3 — ИДЕИ, МЫШЛЕНИЕ, ПОДКАСТЫ, НАПРАВЛЕНИЕ

Интерпретативный блок. Не пересказ новостей. Не повторяй то, что уже было в блоках 1 и 2.

Структура (включай только если есть реальный контент):

🧠 ИДЕИ И ТРЕНДЫ
2-3 абзаца. Гипотезы. Куда идёт тренд. Что это значит для builder'а. Нестандартные интерпретации. Не мотивация, не банальности.

🎙 ПОДКАСТЫ И ИНТЕРВЬЮ
Только если среди данных есть реально сильный эпизод.
**[Название](url)** — одна конкретная причина послушать именно сейчас.

📚 ЧТО ИЗУЧИТЬ
Только если есть реально полезный ресурс, курс, статья.
**[Название](url)** — конкретный навык или инструмент + зачем это нужно.

🎯 НАПРАВЛЕНИЕ
2-3 предложения. Где реальная возможность сегодня. Что попробовать. Что игнорировать. Без воды и мотивации.

_[Одна острая фраза в конце — про фокус, дисциплину или путь. Не банальность.]_

────────────────────────────────────────────

ЖЁСТКИЕ ПРАВИЛА:
- Весь текст на русском. Названия инструментов / продуктов / компаний — на английском.
- Никакого filler text, generic фраз, псевдоаналитики
- Не повторяй одну мысль в разных блоках
- Если секция пустая — пропусти её полностью
- Ссылки только из предоставленных данных — не придумывай`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

function itemLine(item: RankedItem, i: number): string {
  const confs = item.confirmationsCount && item.confirmationsCount > 0
    ? ` [×${item.confirmationsCount + 1} источника]`
    : '';
  const url = item.url ? `\nURL: ${item.url}` : '';
  return (
    `[${i + 1}] ${item.sourceName ?? item.source}${confs} — ${item.title}` +
    url +
    `\n${item.content.slice(0, 350)}`
  );
}

function buildUserPrompt(grouped: Map<Category, RankedItem[]>): string {
  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Блок 1: рынок + крипта ────────────────────────────────────────────────
  const marketItems = [
    ...(grouped.get(Category.MarketSignals) ?? []),
    ...(grouped.get(Category.Crypto)        ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // ── Блок 2: технологии + возможности ─────────────────────────────────────
  const techItems = [
    ...(grouped.get(Category.AI)            ?? []),
    ...(grouped.get(Category.Opportunities) ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ── Блок 3: идеи + обучение + подкасты ───────────────────────────────────
  const ideasItems = [
    ...(grouped.get(Category.Thinking) ?? []),
    ...(grouped.get(Category.Learning) ?? []),
    ...(grouped.get(Category.Podcast)  ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const sections: string[] = [
    `## Данные для БЛОКА 1 (РЫНОК/МАКРО/КРИПТА)\n${
      marketItems.length > 0
        ? marketItems.map(itemLine).join('\n\n')
        : '(нет данных)'
    }`,
    `## Данные для БЛОКА 2 (ТЕХНОЛОГИИ/AI/ИНСТРУМЕНТЫ)\n${
      techItems.length > 0
        ? techItems.map(itemLine).join('\n\n')
        : '(нет данных)'
    }`,
    `## Данные для БЛОКА 3 (ИДЕИ/МЫШЛЕНИЕ/ПОДКАСТЫ)\n${
      ideasItems.length > 0
        ? ideasItems.map(itemLine).join('\n\n')
        : '(нет данных)'
    }`,
  ];

  return (
    `Дата: ${date}.\n\n` +
    sections.join('\n\n---\n\n') +
    `\n\n---\n\n` +
    `Напиши строго 3 сообщения. Разделяй точно по маркерам:\n` +
    `===MSG1===\n[блок 1 — рынок]\n===MSG2===\n[блок 2 — технологии]\n===MSG3===\n[блок 3 — идеи]\n===END===`
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
  { marker: '===MSG3===', label: '🧠 *ИДЕИ И НАПРАВЛЕНИЕ*' },
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
  /** Returns an array of up to 3 ready-to-send Telegram message strings. */
  async generateBrief(items: RankedItem[]): Promise<string[]> {
    const grouped = this.groupByCategory(items);
    const prompt  = buildUserPrompt(grouped);
    const raw     = await callLLM(prompt);
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
