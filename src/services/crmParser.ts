import OpenAI from 'openai';
import { config }          from '../config';
import { logger }          from '../utils/logger';
import { ParsedCrmTask, CrmContactType } from '../types/crmTask';

// ─── Close command detection ──────────────────────────────────────────────────

export const DONE_VERBS    = /^(выполнено|готово|сделано|закрыть|завершить|закрыт)$/i;
export const CANCEL_VERBS  = /^(отменить|убрать|удалить|отмена)$/i;

export function detectCloseCommand(
  text: string,
): { name: string; action: 'done' | 'cancelled' } | null {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 6) return null;

  const last = words[words.length - 1];
  if (DONE_VERBS.test(last)) {
    return { name: words.slice(0, -1).join(' '), action: 'done' };
  }
  if (CANCEL_VERBS.test(last)) {
    return { name: words.slice(0, -1).join(' '), action: 'cancelled' };
  }
  return null;
}

// "закрыть crm 3" | "crm 3 выполнено" | "crm 3 отменить"
const CLOSE_BY_IDX_DONE_RE = /^закрыть\s+crm\s+(\d+)$/i;
const CLOSE_BY_IDX_VERB_RE = /^crm\s+(\d+)\s+(\S+)$/i;

export function detectCloseByIndex(
  text: string,
): { index: number; action: 'done' | 'cancelled' } | null {
  const t = text.trim();

  const m1 = CLOSE_BY_IDX_DONE_RE.exec(t);
  if (m1) return { index: parseInt(m1[1], 10), action: 'done' };

  const m2 = CLOSE_BY_IDX_VERB_RE.exec(t);
  if (m2) {
    const verb = m2[2];
    if (DONE_VERBS.test(verb))   return { index: parseInt(m2[1], 10), action: 'done' };
    if (CANCEL_VERBS.test(verb)) return { index: parseInt(m2[1], 10), action: 'cancelled' };
  }

  return null;
}

// ─── Contact attachment detection ────────────────────────────────────────────

const PHONE_RE = /\+?[\d][\d\s\(\)\-]{8,}/;

export function detectContactAttachment(
  text: string,
): { name: string; phone: string } | null {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 3) return null;

  const phoneIdx = lines.findIndex((l) => PHONE_RE.test(l));
  if (phoneIdx === -1) return null;

  const nameLine = lines.find((_, i) => i !== phoneIdx);
  if (!nameLine) return null;
  if (PHONE_RE.test(nameLine)) return null;
  if (nameLine.split(/\s+/).length > 5) return null;

  return {
    name:  nameLine,
    phone: lines[phoneIdx].replace(/[\s]/g, ''),
  };
}

// ─── CRM transcript detection ─────────────────────────────────────────────────

const CRM_SIGNALS = [
  /клиент/i,
  /договорил/i,
  /показать/i,
  /коммерческ/i,
  /предложен/i,
  /встреч/i,
  /перезвон/i,
  /звонк/i,
  /проект/i,
  /партнёр/i,
  /лид\b/i,
  /обзвон/i,
  /позвонил/i,
];

export function detectCrmTranscript(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  if (words < 15) return false;
  const signalCount = CRM_SIGNALS.filter((re) => re.test(text)).length;
  return signalCount >= 2 || (signalCount >= 1 && words >= 50);
}

// ─── LLM parsing ──────────────────────────────────────────────────────────────

interface LlmRaw {
  tasks?: LlmTask[];
}

interface LlmTask {
  contact_name:     string;
  contact_phone?:   string | null;
  contact_type?:    string;
  agreement?:       string;
  action_required:  string;
  deadline_text?:   string | null;
  deadline_at?:     string | null;
  next_step?:       string | null;
  comment?:         string | null;
}

const VALID_TYPES = new Set<string>(['client', 'partner', 'lead', 'other']);

function toContactType(v?: string): CrmContactType {
  return VALID_TYPES.has(v ?? '') ? (v as CrmContactType) : 'client';
}

function safeIso(v?: string | null): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

export async function parseCrmTranscript(rawText: string): Promise<ParsedCrmTask[]> {
  if (!config.openai.apiKey) return [];

  const tz     = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
  const nowStr = new Date().toLocaleString('ru-RU', { timeZone: tz });

  const system = `Ты — CRM-ассистент. Анализируй текст и извлекай задачи по каждому контакту.
Текущее время (${tz}): ${nowStr}

Верни ТОЛЬКО JSON-объект с ключом "tasks" — массив задач. Один объект = один контакт.

{
  "tasks": [
    {
      "contact_name":    "Название компании или имя контакта",
      "contact_phone":   "+380..." или null,
      "contact_type":    "client" | "partner" | "lead" | "other",
      "agreement":       "Что договорились — кратко 1 строка",
      "action_required": "Что нужно СДЕЛАТЬ — конкретно",
      "deadline_text":   "Завтра 18:00" или null,
      "deadline_at":     "YYYY-MM-DDTHH:MM:SS" или null,
      "next_step":       "Встреча / Звонок / Отправить КП / etc." или null,
      "comment":         "Важная деталь" или null
    }
  ]
}

ПРАВИЛА:
- Каждый клиент / компания = отдельный объект. НИКОГДА не объединяй.
- action_required = конкретное следующее действие (что нужно сделать)
- agreement = что уже договорено / что ждут от нас
- Если нет конкретных задач и обязательств — вернуть { "tasks": [] }
- Отвечай ТОЛЬКО JSON`;

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  try {
    const res = await openai.chat.completions.create({
      model:           config.openai.model,
      messages:        [
        { role: 'system', content: system },
        { role: 'user',   content: rawText },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.1,
      max_tokens:      2000,
    });

    const raw  = JSON.parse(res.choices[0]?.message?.content ?? '{}') as LlmRaw;
    const arr  = Array.isArray(raw.tasks) ? raw.tasks : [];

    return arr
      .filter((t): t is LlmTask => Boolean(t?.contact_name && t?.action_required))
      .map((t) => ({
        contact_name:    String(t.contact_name).slice(0, 100),
        contact_phone:   t.contact_phone ? String(t.contact_phone).slice(0, 30) : null,
        contact_type:    toContactType(t.contact_type),
        agreement:       String(t.agreement ?? '').slice(0, 500),
        action_required: String(t.action_required).slice(0, 500),
        deadline_text:   t.deadline_text ? String(t.deadline_text).slice(0, 100) : null,
        deadline_at:     safeIso(t.deadline_at),
        next_step:       t.next_step ? String(t.next_step).slice(0, 100) : null,
        comment:         t.comment  ? String(t.comment).slice(0, 500)  : null,
      }));
  } catch (err) {
    logger.warn(`[crmParser] LLM failed: ${(err as Error).message}`);
    return [];
  }
}
