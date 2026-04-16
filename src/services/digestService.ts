import Anthropic from '@anthropic-ai/sdk';
import OpenAI    from 'openai';
import {
  RankedItem,
  MorningBrief,
  DigestSection,
  Category,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
} from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const LLM_PROVIDER   = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'claude';
const OPENAI_MODEL   = process.env.OPENAI_MODEL   ?? 'gpt-4o-mini';
const CLAUDE_MODEL   = process.env.CLAUDE_MODEL   ?? 'claude-3-5-haiku-20241022';
const MAX_TOKENS     = 2400;
const TEMPERATURE    = 0.2;

/** Max items per category sent to LLM. Wide enough to have selection, narrow to avoid waste. */
const ITEMS_PER_CATEGORY = 4;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — early signal hunter. Не аналитик, не новостной бот.

РОЛЬ: AI/tech scout + idea generator + проводник по возможностям.

ПРОФИЛЬ ЧИТАТЕЛЯ:
- Строит AI-системы и автоматизации
- Ищет инструменты, которые дают edge прямо сейчас
- Хочет знать раньше других: что вышло, что работает, где возможность
- Нет времени на очевидное и мейнстрим

ФИЛОСОФИЯ ВЫВОДА:
Читатель открывает сообщение и должен почувствовать:
"это важно, хочу попробовать, надо действовать"
— НЕ: "ок, ещё одни новости"

ПРИОРИТЕТЫ (строго):
1. ТЕХНОЛОГИИ — что вышло нового (инструмент, фича, сервис, способ использования AI)
2. ВОЗМОЖНОСТИ — как заработать, какую идею реализовать, какой проект запустить
3. ИДЕИ — нестандартные гипотезы, тренды, куда всё идёт
4. РЫНОК — только 2-3 факта, не анализ
5. ПОДКАСТЫ / ЧТО ИЗУЧИТЬ — только если реально сильное

ЖЁСТКИЙ КРИТЕРИЙ:
Пункт попадает ТОЛЬКО если читатель может:
а) попробовать это сегодня, ИЛИ
б) использовать в своём проекте/бизнесе, ИЛИ
в) принять решение на основе этого

ФОРМАТ КАЖДОГО ПУНКТА:
**[Название](url)** → что это + как использовать/зачем (1 предложение, конкретно)

ПРАВИЛА:
- Максимум 10 bullets суммарно
- Пустые секции — не включай
- РЫНОК — максимум 3 коротких пункта (факт + вывод одной фразой)
- ИДЕИ — не новости, не пересказ. Только оригинальная мысль/гипотеза/сценарий
- ФИНАЛ — одна фраза: острая, про фокус/дисциплину. Не банальность, не мотивация
- Весь вывод на русском. Названия инструментов — на английском.

ФОРМАТ ВЫВОДА (без ## заголовков, строго):

РЫНОК:
- факт → вывод одной фразой (без ссылки если не нужно)

ТЕХНОЛОГИИ:
- **[Название](url)** → что это даёт, как использовать сегодня

ВОЗМОЖНОСТИ:
- **[Название](url)** → конкретная идея: что сделать + как заработать/применить

ИДЕИ:
[3–4 предложения. Гипотеза или тренд. Куда это ведёт. Что это значит для AI-builder'а. Не новости.]

ПОДКАСТЫ:
- **[Название](url)** → одна причина послушать

ЧТО ИЗУЧИТЬ:
- **[Название](url)** → конкретный навык/инструмент + зачем

ФОКУС:
[2–3 предложения. Где возможность сегодня. Что попробовать. Что игнорировать. Без воды.]

ФИНАЛ:
[Одна фраза. Про фокус, дисциплину, путь. Не мотивация.]`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

// Categories merged into РЫНОК — shown together, capped at 5 total
const MARKET_CATEGORIES = new Set([Category.MarketSignals, Category.Crypto]);

function itemLine(item: RankedItem, i: number): string {
  const confs = item.confirmationsCount && item.confirmationsCount > 0
    ? ` [×${item.confirmationsCount + 1} источника]`
    : '';
  const url = item.url ? `\nURL: ${item.url}` : '';
  return (
    `[${i + 1}] ${item.sourceName ?? item.source}${confs} — ${item.title}` +
    url +
    `\n${item.content.slice(0, 300)}`
  );
}

function buildUserPrompt(grouped: Map<Category, RankedItem[]>): string {
  const sections: string[] = [];

  // ── РЫНОК (merged market_signals + crypto, max 5 total) ───────────────────
  const marketItems = [
    ...(grouped.get(Category.MarketSignals) ?? []),
    ...(grouped.get(Category.Crypto)        ?? []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (marketItems.length > 0) {
    sections.push(`## РЫНОК\n${marketItems.map(itemLine).join('\n\n')}`);
  }

  // ── All other non-market categories in priority order ─────────────────────
  const otherOrder: Category[] = [
    Category.AI,
    Category.Opportunities,
    Category.Thinking,
    Category.Learning,
    Category.Podcast,
  ];

  for (const cat of otherOrder) {
    const items = grouped.get(cat);
    if (!items?.length) continue;
    const label = cat === Category.AI         ? 'ТЕХНОЛОГИИ'
                : cat === Category.Opportunities ? 'ВОЗМОЖНОСТИ'
                : cat === Category.Thinking    ? 'ИДЕИ'
                : cat === Category.Learning    ? 'ЧТО ИЗУЧИТЬ'
                : cat === Category.Podcast     ? 'ПОДКАСТЫ'
                : cat.toUpperCase();
    sections.push(`## ${label}\n${items.map(itemLine).join('\n\n')}`);
  }

  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    `Дата: ${date}.\n\n` +
    `Твоя задача: найти сигналы, которые стоит действия. Будь безжалостным — лучше 5 сильных пунктов чем 10 слабых.\n\n` +
    sections.join('\n\n---\n\n')
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

const SECTION_MARKERS: Array<{ key: string; category: Category }> = [
  { key: 'РЫНОК',         category: Category.MarketSignals },
  { key: 'ТЕХНОЛОГИИ',    category: Category.AI            },
  { key: 'ВОЗМОЖНОСТИ',   category: Category.Opportunities },
  { key: 'ИДЕИ',          category: Category.Thinking      },
  { key: 'ЧТО ИЗУЧИТЬ',  category: Category.Learning      },
  { key: 'ПОДКАСТЫ',      category: Category.Podcast       },
  // Legacy / English fallbacks
  { key: 'MARKET SIGNALS',  category: Category.MarketSignals },
  { key: 'TECHNOLOGIES',    category: Category.AI            },
  { key: 'OPPORTUNITIES',   category: Category.Opportunities },
  { key: 'THINKING',        category: Category.Thinking      },
  { key: 'LEARNING',        category: Category.Learning      },
  { key: 'PODCASTS',        category: Category.Podcast       },
  { key: 'CRYPTO RESEARCH', category: Category.Crypto        },
  { key: 'CRYPTO',          category: Category.Crypto        },
  { key: 'AI',              category: Category.AI            },
];

// Normalise a raw LLM line to a clean header key:
//   "## MARKET SIGNALS:"  →  "MARKET SIGNALS"
//   "WHAT MATTERS TODAY:" →  "WHAT MATTERS TODAY"
function normaliseHeader(line: string): string {
  return line.replace(/^#+\s*/, '').replace(/:?\s*$/, '').trim().toUpperCase();
}

// All headers that delimit a new block
const ALL_HEADERS = [
  // Russian
  'РЫНОК', 'ТЕХНОЛОГИИ', 'ВОЗМОЖНОСТИ', 'ИДЕИ', 'ЧТО ИЗУЧИТЬ', 'ПОДКАСТЫ', 'ФОКУС', 'ФИНАЛ',
  // English fallbacks
  'MARKET SIGNALS', 'TECHNOLOGIES', 'OPPORTUNITIES', 'THINKING', 'LEARNING',
  'PODCASTS', 'CRYPTO RESEARCH', 'CRYPTO', 'AI', 'FOCUS', 'CLOSING LINE',
];

function isHeaderLine(line: string): boolean {
  const key = normaliseHeader(line);
  return ALL_HEADERS.some((h) => key.startsWith(h));
}

/** Extract the content block following a given header. Stops at next header. */
function extractBlock(raw: string, header: string): string {
  const lines  = raw.split('\n');
  let capturing = false;
  const out: string[] = [];

  for (const line of lines) {
    const key = normaliseHeader(line);
    if (key.startsWith(header.toUpperCase())) {
      capturing = true;
      continue;
    }
    if (capturing) {
      if (isHeaderLine(line)) break;
      out.push(line);
    }
  }

  return out.join('\n').trim();
}

function parseResponse(
  raw: string,
  grouped: Map<Category, RankedItem[]>,
): Omit<MorningBrief, 'date'> {
  const sections: DigestSection[] = [];

  // Split into blocks at every header line
  const lines  = raw.split('\n');
  let currentKey: string | null = null;
  let currentLines: string[]    = [];

  const MENTOR_HEADERS = ['ФОКУС', 'ФИНАЛ', 'FOCUS', 'CLOSING LINE'];

  function flush(): void {
    if (!currentKey) return;
    if (MENTOR_HEADERS.some((h) => currentKey!.startsWith(h))) return; // handled separately

    const match = SECTION_MARKERS.find((m) => currentKey!.startsWith(m.key));
    if (!match) return;

    const summary = currentLines.join('\n').trim();
    if (!summary) return;

    sections.push({
      category: match.category,
      items:    grouped.get(match.category) ?? [],
      summary,
    });
  }

  for (const line of lines) {
    if (isHeaderLine(line)) {
      flush();
      currentKey   = normaliseHeader(line);
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }
  flush();

  // Fallback: if nothing parsed, show raw as single block without repeating mentor layer
  if (sections.length === 0) {
    const noMentor = raw
      .split('\n')
      .filter((l) => !isHeaderLine(l))
      .join('\n')
      .trim();
    sections.push({ category: Category.MarketSignals, items: [], summary: noMentor });
  }

  return {
    sections,
    focus:       extractBlock(raw, 'ФОКУС') || extractBlock(raw, 'FOCUS'),
    closingLine: extractBlock(raw, 'ФИНАЛ') || extractBlock(raw, 'CLOSING LINE'),
  };
}

// ─── DigestService ────────────────────────────────────────────────────────────

export class DigestService {
  async generateBrief(items: RankedItem[]): Promise<MorningBrief> {
    const grouped = this.groupByCategory(items);
    const prompt  = buildUserPrompt(grouped);
    const raw     = await callLLM(prompt);
    const parsed  = parseResponse(raw, grouped);

    return {
      date:        new Date().toISOString().slice(0, 10),
      sections:    parsed.sections,
      focus:       parsed.focus,
      closingLine: parsed.closingLine,
    };
  }

  private groupByCategory(items: RankedItem[]): Map<Category, RankedItem[]> {
    const map = new Map<Category, RankedItem[]>();

    for (const category of CATEGORY_ORDER) {
      const bucket = items
        .filter((i) => i.category === category)
        .sort((a, b) => b.score - a.score)
        .slice(0, ITEMS_PER_CATEGORY);

      if (bucket.length > 0) map.set(category, bucket);
    }

    return map;
  }
}

export const digestService = new DigestService();
