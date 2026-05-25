import OpenAI from 'openai';
import { config }        from '../config';
import { logger }        from '../utils/logger';
import { CaptureType, ParsedCapture, CaptureEntity } from '../types/capture';

// ─── Intent classification ────────────────────────────────────────────────────

const CALL_SUMMARY_RE = [
  /итог\w*\s+звонк/i,
  /итоги\s+звонков/i,
  /обзвон/i, /прозвонил/i,
  /тема.*звонк/i, /звонк.*итог/i,
];

const CAPTURE_CONTEXT_RE = [
  /отправил\s+инф/i, /написал\s+инф/i, /скинул\s+инф/i,
  /жду\s+информаци/i, /ждёт\s+ответ/i, /что\s+было/i,
];

function countActionVerbs(text: string): number {
  return (text.match(
    /\b(написал|отправил|позвонил|скинул|сделал|отправить|написать|позвонить|жду|ждать|договорился)\b/gi
  ) ?? []).length;
}

function countCapitalizedWords(text: string): number {
  const matches = text.match(/[А-ЯA-Z][а-яёa-z]{2,}(?:\s+[А-ЯA-Z][а-яёa-z]{2,})*/g) ?? [];
  return new Set(matches).size;
}

/** Returns the capture type if this text should be treated as a capture note, null if it's a regular reminder/task. */
export function detectCaptureType(text: string): CaptureType | null {
  // Explicit call summary markers
  if (CALL_SUMMARY_RE.some((p) => p.test(text))) return 'call_summary';

  const words      = text.trim().split(/\s+/).length;
  const actionVerbs = countActionVerbs(text);
  const entities   = countCapitalizedWords(text);

  if (words > 25) {
    const hasCallContext = CAPTURE_CONTEXT_RE.some((p) => p.test(text));
    if (hasCallContext || actionVerbs >= 3)  return 'call_summary';
    if (entities >= 4 || actionVerbs >= 2)   return 'client_notes';
    if (entities >= 2)                       return 'checklist';
    return 'raw_note';
  }

  return null; // regular reminder/task
}

// ─── LLM extraction ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — AI-ассистент для структурированного парсинга голосовых заметок, итогов звонков, чеклистов.

Распарси текст и верни ТОЛЬКО JSON без markdown-обёртки:

{
  "title": "Краткий заголовок до 60 символов",
  "topic": "Тема/контекст (null если неясно)",
  "entities": [
    {
      "name": "Название клиента/компании/контакта",
      "status": "Что уже сделано — отправил, написал, позвонил...",
      "context": "Дополнительный контекст: продукт, направление, канал",
      "next_action": "Конкретное следующее действие для этого клиента",
      "request": "Что клиент хочет / что нужно сделать для него"
    }
  ],
  "done_items": ["список уже выполненных действий"],
  "waiting_items": ["кто ждёт нашего ответа / мы ждём от кого"],
  "next_actions": ["конкретные следующие шаги в порядке приоритета"],
  "summary": "Резюме 2-3 предложения",
  "tags": ["теги"]
}

ПРАВИЛА:
- Каждый клиент/контакт/компания → отдельный объект в entities. НЕ объединяй.
- done_items — только явно выполненные действия
- waiting_items — кто ждёт или у кого ждём ответа
- Если поля нет — null или []
- Отвечай ТОЛЬКО JSON`;

interface LlmRaw {
  title?:         string;
  topic?:         string;
  entities?:      CaptureEntity[];
  done_items?:    string[];
  waiting_items?: string[];
  next_actions?:  string[];
  summary?:       string;
  tags?:          string[];
}

export async function parseCapture(rawText: string, type: CaptureType): Promise<ParsedCapture> {
  if (!config.openai.apiKey) {
    return fallback(rawText);
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });
  try {
    const res = await openai.chat.completions.create({
      model:           config.openai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Тип записи: ${type}\n\nТекст:\n${rawText}` },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.1,
      max_tokens:      2000,
    });

    const raw = JSON.parse(res.choices[0]?.message?.content ?? '{}') as LlmRaw;
    return {
      title:         (raw.title ?? rawText.slice(0, 60)).slice(0, 100),
      topic:         raw.topic ?? undefined,
      entities:      Array.isArray(raw.entities)      ? raw.entities      : [],
      done_items:    Array.isArray(raw.done_items)    ? raw.done_items    : [],
      waiting_items: Array.isArray(raw.waiting_items) ? raw.waiting_items : [],
      next_actions:  Array.isArray(raw.next_actions)  ? raw.next_actions  : [],
      summary:       raw.summary ?? rawText.slice(0, 300),
      tags:          Array.isArray(raw.tags)          ? raw.tags          : [],
    };
  } catch (err) {
    logger.warn(`[captureParser] LLM failed: ${(err as Error).message}`);
    return fallback(rawText);
  }
}

function fallback(text: string): ParsedCapture {
  return {
    title:         text.slice(0, 60) + (text.length > 60 ? '...' : ''),
    entities:      [],
    done_items:    [],
    waiting_items: [],
    next_actions:  [],
    summary:       text.slice(0, 300),
    tags:          [],
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatCaptureReply(note: { type: CaptureType; title: string; topic: string | null; entities: CaptureEntity[]; done_items: string[]; waiting_items: string[]; next_actions: string[]; id: string }): string {
  const lines: string[] = [];

  const EMOJI: Record<CaptureType, string> = {
    call_summary: '📞', checklist: '✅', client_notes: '👥', raw_note: '📝',
  };
  lines.push(`${EMOJI[note.type]} *Сохранено:* ${escMd(note.title)}`);
  if (note.topic) { lines.push(''); lines.push(`📌 *Тема:* ${escMd(note.topic)}`); }

  if (note.entities.length > 0) {
    lines.push('');
    lines.push(note.type === 'call_summary' ? '📞 *Клиенты:*' : '👥 *Контакты:*');
    note.entities.forEach((e, i) => {
      lines.push(`${i + 1}\\. *${escMd(e.name)}*`);
      if (e.status)      lines.push(`   Статус: ${escMd(e.status)}`);
      if (e.context)     lines.push(`   Контекст: ${escMd(e.context)}`);
      if (e.request)     lines.push(`   Запрос: ${escMd(e.request)}`);
      if (e.next_action) lines.push(`   Что дальше: ${escMd(e.next_action)}`);
    });
  }

  if (note.done_items.length > 0) {
    lines.push(''); lines.push('✅ *Что сделано:*');
    note.done_items.forEach((d) => lines.push(`\\- ${escMd(d)}`));
  }

  if (note.waiting_items.length > 0) {
    lines.push(''); lines.push('⏳ *Ждём ответа:*');
    note.waiting_items.forEach((w) => lines.push(`\\- ${escMd(w)}`));
  }

  if (note.next_actions.length > 0) {
    lines.push(''); lines.push('🧩 *Следующие действия:*');
    note.next_actions.forEach((a, i) => lines.push(`${i + 1}\\. ${escMd(a)}`));
  }

  lines.push('');
  lines.push(`🔖 ID: \`${note.id.slice(0, 8)}\``);

  return lines.join('\n');
}

function escMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
