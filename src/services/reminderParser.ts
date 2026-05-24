import OpenAI from 'openai';
import { config }      from '../config';
import { ParsedReminder, ReminderPriority } from '../types/reminder';
import { logger }      from '../utils/logger';

// ─── Rule-based helpers ───────────────────────────────────────────────────────

const RU_WEEKDAYS: Record<string, number> = {
  понедельник: 1, вторник: 2,
  среда: 3, среды: 3, среду: 3,
  четверг: 4,
  пятница: 5, пятницу: 5, пятницы: 5,
  суббота: 6, субботу: 6, субботы: 6,
  воскресенье: 0, воскресенья: 0, воскресению: 0,
};

const RU_MONTHS: Record<string, number> = {
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
  июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

function localNow(tz: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

function nextWeekday(dow: number, base: Date): Date {
  const d    = new Date(base);
  const diff = (dow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function ruleParseDate(text: string, tz: string): { due_date: string | null; due_at: string | null } {
  const lower = text.toLowerCase();
  const base  = localNow(tz);

  // Default hour from time-of-day words
  let hour   = 9;
  let minute = 0;

  const timeMatch = lower.match(/\b(\d{1,2})[:\.](\d{2})\b/);
  if (timeMatch) {
    hour   = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
  } else if (/утром|утро/.test(lower))        { hour = 9; }
  else if (/днём|в обед/.test(lower))         { hour = 13; }
  else if (/вечером|вечер/.test(lower))       { hour = 19; }
  else if (/ночью/.test(lower))               { hour = 22; }

  // "через N часов"
  const hoursMatch = lower.match(/через\s+(\d+)\s+час/);
  if (hoursMatch) {
    const ms     = parseInt(hoursMatch[1], 10) * 3_600_000;
    const target = new Date(Date.now() + ms);
    return {
      due_date: target.toLocaleDateString('sv', { timeZone: tz }),
      due_at:   target.toISOString(),
    };
  }

  // "через N минут"
  const minsMatch = lower.match(/через\s+(\d+)\s+мин/);
  if (minsMatch) {
    const ms     = parseInt(minsMatch[1], 10) * 60_000;
    const target = new Date(Date.now() + ms);
    return {
      due_date: target.toLocaleDateString('sv', { timeZone: tz }),
      due_at:   target.toISOString(),
    };
  }

  let target: Date | null = null;

  if (/сегодня/.test(lower)) {
    target = new Date(base);
    target.setHours(hour, minute, 0, 0);
  } else if (/послезавтра/.test(lower)) {
    target = new Date(base);
    target.setDate(target.getDate() + 2);
    target.setHours(hour, minute, 0, 0);
  } else if (/завтра/.test(lower)) {
    target = new Date(base);
    target.setDate(target.getDate() + 1);
    target.setHours(hour, minute, 0, 0);
  } else {
    for (const [word, dow] of Object.entries(RU_WEEKDAYS)) {
      if (lower.includes(word)) {
        target = nextWeekday(dow, base);
        target.setHours(hour, minute, 0, 0);
        break;
      }
    }
  }

  // "15 января" etc — overrides weekday if both present
  const dateMatch = lower.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/
  );
  if (dateMatch) {
    const day   = parseInt(dateMatch[1], 10);
    const month = RU_MONTHS[dateMatch[2]];
    const year  = base.getFullYear();
    target      = new Date(year, month, day, hour, minute, 0);
    if (target < base) target.setFullYear(year + 1);
  }

  if (!target) return { due_date: null, due_at: null };

  return {
    due_date: target.toLocaleDateString('sv', { timeZone: tz }),
    due_at:   target.toISOString(),
  };
}

function ruleParsePriority(text: string): ReminderPriority {
  const l = text.toLowerCase();
  if (/срочно|asap|немедленно/.test(l))       return 'urgent';
  if (/важно|важный|приоритет|критично/.test(l)) return 'high';
  if (/когда-нибудь|не срочно|низкий/.test(l))  return 'low';
  return 'normal';
}

function ruleParseTitle(text: string): string {
  return text
    .replace(/напомни(ть)?(\s+мне)?/gi, '')
    .replace(/сегодня|завтра|послезавтра/gi, '')
    .replace(/утром|вечером|днём|ночью/gi, '')
    .replace(/в\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/gi, '')
    .replace(/через\s+\d+\s+(час|минут)\w*/gi, '')
    .replace(/\b(\d{1,2})[:\.](\d{2})\b/g, '')
    .replace(/срочно|важно/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── LLM parsing ──────────────────────────────────────────────────────────────

const LLM_SYSTEM = `Ты — парсер задач и напоминаний. Извлекай из текста структуру.
Отвечай ТОЛЬКО валидным JSON без markdown-блоков.

Поля:
- title: краткое название задачи (до 80 символов, без воды)
- due_date: дата YYYY-MM-DD (null если не указана)
- due_time: время HH:MM 24h (null если не указано)
- priority: "low" | "normal" | "high" | "urgent"
- notes: дополнительный контекст (null если нет)
- tags: массив строк-тегов (пустой массив если нет)

Пример ответа:
{"title":"Проверить Railway deploy","due_date":"2025-01-15","due_time":"10:00","priority":"normal","notes":null,"tags":["railway","deploy"]}`;

interface LlmResult {
  title:    string;
  due_date: string | null;
  due_time: string | null;
  priority: ReminderPriority;
  notes:    string | null;
  tags:     string[];
}

async function llmParse(text: string, tz: string): Promise<ParsedReminder> {
  const openai  = new OpenAI({ apiKey: config.openai.apiKey });
  const nowStr  = new Date().toLocaleString('ru-RU', { timeZone: tz });
  const prompt  = `Текущее время (${tz}): ${nowStr}\n\nТекст задачи: "${text}"`;

  const response = await openai.chat.completions.create({
    model:       config.openai.model,
    messages:    [{ role: 'system', content: LLM_SYSTEM }, { role: 'user', content: prompt }],
    max_tokens:  300,
    temperature: 0,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';

  let parsed: LlmResult;
  try {
    parsed = JSON.parse(raw) as LlmResult;
  } catch {
    throw new Error('LLM вернул невалидный JSON');
  }

  const due_date = parsed.due_date ?? null;
  let due_at: string | null = null;
  if (due_date && parsed.due_time) {
    const [h, m] = parsed.due_time.split(':').map(Number);
    due_at = new Date(`${due_date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
  } else if (due_date) {
    due_at = new Date(`${due_date}T09:00:00`).toISOString();
  }

  return {
    normalized_title: (parsed.title ?? text).slice(0, 255),
    notes:            parsed.notes ?? null,
    due_at,
    due_date,
    priority:         parsed.priority ?? 'normal',
    tags:             Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseReminder(rawText: string): Promise<ParsedReminder> {
  const tz = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';

  if (config.openai.apiKey) {
    try {
      return await llmParse(rawText, tz);
    } catch (err) {
      logger.warn(`[reminderParser] LLM failed, using rule parser: ${(err as Error).message}`);
    }
  }

  const { due_at, due_date } = ruleParseDate(rawText, tz);
  return {
    normalized_title: ruleParseTitle(rawText) || rawText.slice(0, 80),
    notes:            null,
    due_at,
    due_date,
    priority:         ruleParsePriority(rawText),
    tags:             [],
  };
}
