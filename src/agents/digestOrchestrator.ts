import { RankedItem, Category } from '../types';
import { getDefaultProvider }   from './providers';
import { logger }               from '../utils/logger';

// ─── Per-block system prompts ─────────────────────────────────────────────────
// Each agent sees only its slice of data and writes only its block.

const BLOCK1_SYSTEM = `Ты — аналитик рынков. Пишешь ТОЛЬКО блок "РЫНОК, МАКРО, КРИПТА" для личного дайджеста.
2–4 пункта. Только то, что реально влияет на решения или бизнес. Слабый сигнал — пропустить.
Формат каждого пункта:
• **[Заголовок новости](url)** — почему важно → что ожидать
Ссылки ТОЛЬКО из данных (поле ССЫЛКА:). Инлайн. Русский язык. Без воды.`;

const BLOCK2_SYSTEM = `Ты — AI/Tech аналитик. Пишешь ТОЛЬКО блок "ТЕХНОЛОГИИ, AI, ИНСТРУМЕНТЫ" для личного дайджеста.
4–6 пунктов. ТОЛЬКО реальные данные из входных данных, не придумывай инструменты.
Формат каждого пункта:
**[Название инструмента/новости](url)** — что это → зачем → конкретный use case
Ссылки только из данных. Инлайн. Русский язык. Без хайпа без пользы.`;

const BLOCK3_SYSTEM = `Ты — куратор знаний и трендов. Пишешь ТОЛЬКО блок "ИНСАЙДЫ, DEEP KNOWLEDGE" для личного дайджеста.
Не пересказ новостей. ТОЛЬКО реальные данные из входных данных.

Секции:
🔍 DEEP INSIGHT — глубокий материал (эссе, разбор, интервью):
**[Название](url)** — суть → что даёт builder'у

🧠 ТРЕНДЫ — 1–3 тезиса. Нестандартная интерпретация. Куда идёт область.

🎙 ПОДКАСТЫ / ВИДЕО:
**[Название](url)** — одна причина послушать сейчас.

Ссылки инлайн. Русский язык.`;

const BLOCK4_SYSTEM = `Ты — стратегический советник. Пишешь ТОЛЬКО "направление дня" для личного дайджеста.
Одна короткая мысль. 1–2 предложения максимум. Одна острая фраза.
Стиль: подкасты предпринимателей (Tim Ferriss, Acquired, MFM).
НЕ мотивация ("верь в себя", "ты можешь"). Только про действие, скорость, фокус, системное мышление.
Без заголовков и эмодзи. Выведи только саму фразу.`;

const BLOCK5_SYSTEM = `Ты — куратор философии. Пишешь ТОЛЬКО блок "ФИЛОСОФИЯ" для личного дайджеста.
Цитата или мысль от великих предпринимателей, философов.
Авторы: Мангер, Баффет, Сенека, Марк Аврелий, Безос, Маск, Далио, Талеб, Черчилль и подобные.
НЕ про AI или технологии. Только вечные темы.
Формат: цитата в кавычках, затем с новой строки — имя автора курсивом.
1–3 предложения. Только реально сильная и точная мысль.`;

// ─── Labels (same as digestService) ──────────────────────────────────────────

const MSG_LABELS = [
  '📊 *РЫНОК И МАКРО*',
  '🤖 *ТЕХНОЛОГИИ И ИНСТРУМЕНТЫ*',
  '🔍 *ИНСАЙДЫ И DEEP KNOWLEDGE*',
  '🎯 *НАПРАВЛЕНИЕ ДНЯ*',
  '💡 *ФИЛОСОФИЯ*',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemsToBlock(items: RankedItem[]): string {
  if (items.length === 0) return '(нет свежих данных из источников)';
  return items.map((item, i) => {
    const urlInline = item.url ? ` → ССЫЛКА: ${item.url}` : '';
    const confs     = item.confirmationsCount && item.confirmationsCount > 0
      ? ` [×${item.confirmationsCount + 1} источника]` : '';
    return (
      `[${i + 1}] ${item.sourceName ?? item.source}${confs} — ${item.title}${urlInline}\n` +
      item.content.slice(0, 500)
    );
  }).join('\n\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a 5-block digest by running each block through a dedicated agent
 * in parallel. Drops and logs any block that fails — remaining blocks still send.
 */
export async function generateBriefWithAgents(ranked: RankedItem[]): Promise<string[]> {
  const provider = getDefaultProvider();
  const date     = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ── Slice items per block ──────────────────────────────────────────────────
  const MARKET_CATS = new Set([Category.MarketSignals, Category.Crypto, Category.Macro]);
  const TECH_CATS   = new Set([Category.AI, Category.Opportunities]);
  const DEEP_CATS   = new Set([Category.Thinking, Category.Learning, Category.Podcast]);

  const market = ranked.filter(i => MARKET_CATS.has(i.category)).sort((a,b) => b.score - a.score).slice(0, 4);
  const tech   = ranked.filter(i => TECH_CATS.has(i.category)).sort((a,b) => b.score - a.score).slice(0, 8);
  const deep   = ranked.filter(i => DEEP_CATS.has(i.category)).sort((a,b) => b.score - a.score);

  // Pad deep block with best tech items if sparse
  const deepFinal = deep.length >= 3
    ? deep.slice(0, 8)
    : [
        ...deep,
        ...tech.filter(i => !deep.some(d => d.id === i.id)).slice(0, 6 - deep.length),
      ].slice(0, 8);

  // Block 4 context = top 5 items across all categories
  const top5 = ranked.slice(0, 5);

  // ── Run all 5 blocks in parallel ─────────────────────────────────────────
  const settled = await Promise.allSettled([
    provider.call(BLOCK1_SYSTEM, `Дата: ${date}\n\nДанные:\n${itemsToBlock(market)}`,   900),
    provider.call(BLOCK2_SYSTEM, `Дата: ${date}\n\nДанные:\n${itemsToBlock(tech)}`,     1200),
    provider.call(BLOCK3_SYSTEM, `Дата: ${date}\n\nДанные:\n${itemsToBlock(deepFinal)}`, 1200),
    provider.call(BLOCK4_SYSTEM, `Дата: ${date}\n\nКонтекст дня:\n${itemsToBlock(top5)}`, 300),
    provider.call(BLOCK5_SYSTEM, `Дата: ${date}`, 300),
  ]);

  const messages: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled' && r.value.trim()) {
      messages.push(`${MSG_LABELS[i]}\n\n${r.value.trim()}`);
    } else {
      const reason = r.status === 'rejected' ? (r.reason as Error).message : 'empty response';
      logger.warn(`[digestOrchestrator] block ${i + 1} failed: ${reason}`);
    }
  }

  logger.info(`[digestOrchestrator] generated ${messages.length}/5 blocks`);
  return messages;
}
