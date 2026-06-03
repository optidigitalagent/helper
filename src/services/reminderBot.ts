import TelegramBot from 'node-telegram-bot-api';
import OpenAI       from 'openai';
import axios        from 'axios';
import { Readable } from 'stream';
import { config }   from '../config';
import { logger }   from '../utils/logger';
import { parseReminder } from './reminderParser';
import {
  createReminder,
  listActiveReminders,
  listTodayReminders,
  listTomorrowReminders,
  markReminderDone,
  deleteReminder,
} from '../db/remindersRepo';
import { Reminder } from '../types/reminder';
import { detectCaptureType, parseCapture, formatCaptureReply } from './captureParser';
import {
  createCaptureNote,
  listRecentNotes,
  getNoteByShortId,
  getAllNextActions,
} from '../db/captureRepo';
import {
  detectCloseCommand,
  detectCloseByIndex,
  detectContactAttachment,
  detectCrmTranscript,
  parseCrmTranscript,
} from './crmParser';
import {
  createCrmTask,
  listActiveCrmTasks,
  closeCrmTask,
  getLastCrmTask,
  attachContactInfo,
} from '../db/crmTasksRepo';
import { matchCrmTasksByName } from '../utils/crmMatch';
import { CrmTask, CrmContactType } from '../types/crmTask';

// ─── Bot singleton ────────────────────────────────────────────────────────────

let _bot: TelegramBot | null = null;

export function getReminderBot(): TelegramBot | null { return _bot; }

// ─── Voice transcription ──────────────────────────────────────────────────────

async function transcribeVoice(fileUrl: string): Promise<string> {
  const openai = new OpenAI({ apiKey: config.openai.apiKey });
  const { data: buf } = await axios.get<Buffer>(fileUrl, { responseType: 'arraybuffer' });
  const readable = Readable.from(Buffer.from(buf)) as NodeJS.ReadableStream & { name?: string };
  readable.name  = 'voice.ogg';
  const model    = (process.env.REMINDER_AUDIO_TRANSCRIPTION_MODEL ?? 'whisper-1') as 'whisper-1';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result   = await openai.audio.transcriptions.create({ file: readable as any, model, language: 'ru' });
  return result.text.trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(bot: TelegramBot, chatId: number, text: string): Promise<TelegramBot.Message> {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ─── CRM formatting ───────────────────────────────────────────────────────────

const CONTACT_TYPE_RU: Record<CrmContactType, string> = {
  client: 'Клиент', partner: 'Партнёр', lead: 'Лид', other: 'Контакт',
};

function fmtCrmTask(t: CrmTask, idx: number): string {
  const lines: string[] = [];
  const type = CONTACT_TYPE_RU[t.contact_type] ?? t.contact_type;
  lines.push(`${idx}. *${t.contact_name}*${t.contact_phone ? ` ${t.contact_phone}` : ''} — ${type}`);
  if (t.agreement)       lines.push(`   📋 ${t.agreement}`);
  lines.push(`   ✅ ${t.action_required}`);
  if (t.deadline_text)   lines.push(`   📅 ${t.deadline_text}`);
  if (t.next_step)       lines.push(`   ➡️ ${t.next_step}`);
  if (t.comment)         lines.push(`   💬 ${t.comment}`);
  return lines.join('\n');
}

function formatCrmCreateConfirmation(tasks: CrmTask[]): string {
  const count = tasks.length;
  const noun  = count === 1 ? 'задача' : count < 5 ? 'задачи' : 'задач';
  const lines = [`✅ *Создано ${count} ${noun}*\n`];
  tasks.forEach((t, i) => lines.push(fmtCrmTask(t, i + 1) + (i < tasks.length - 1 ? '\n' : '')));
  lines.push('\n_[имя] выполнено · crm <номер> выполнено_');
  return lines.join('\n');
}

function formatCrmList(tasks: CrmTask[]): string {
  if (tasks.length === 0) {
    return (
      '📋 Нет активных CRM задач.\n\n' +
      'Отправь голосовое с итогами разговора — создам задачи автоматически.'
    );
  }
  const count = tasks.length;
  const noun  = count === 1 ? 'задача' : count < 5 ? 'задачи' : 'задач';
  const lines = [`📋 *CRM — ${count} активных ${noun}*\n`];
  tasks.forEach((t, i) => lines.push(fmtCrmTask(t, i + 1) + (i < tasks.length - 1 ? '\n' : '')));
  lines.push('\n_[имя] выполнено · crm <номер> выполнено_');
  return lines.join('\n');
}

export function formatCrmBrief(tasks: CrmTask[]): string {
  if (tasks.length === 0) return '';
  const date  = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
  });
  const lines = [`📋 *CRM — ${date}*\n`];
  tasks.forEach((t) => {
    const dl = t.deadline_text ? ` | 📅 ${t.deadline_text}` : '';
    lines.push(`• *${t.contact_name}* → ${t.action_required}${dl}`);
  });
  lines.push('\n_/crm — подробно | crm <номер> выполнено — закрыть_');
  return lines.join('\n');
}

// ─── CRM handlers ─────────────────────────────────────────────────────────────

async function handleCrmClose(
  bot: TelegramBot,
  chatId: number,
  name: string,
  action: 'done' | 'cancelled',
): Promise<void> {
  const tasks = await listActiveCrmTasks(String(chatId));
  const { exact, fuzzy } = matchCrmTasksByName(tasks, name);

  // Single exact match → safe to close
  if (exact.length === 1) {
    await closeCrmTask(exact[0].id, String(chatId), action);
    const icon = action === 'done' ? '✅' : '🚫';
    const verb = action === 'done' ? 'Выполнено' : 'Отменено';
    await send(bot, chatId, `${icon} *${verb}:* ${exact[0].contact_name}\n_${exact[0].action_required}_`);
    return;
  }

  // No match at all
  if (exact.length === 0 && fuzzy.length === 0) {
    await send(bot, chatId, `❌ Не нашёл активную задачу по имени "${name}".\n_/crm — список задач_`);
    return;
  }

  // Multiple exact or any fuzzy → ask to clarify, show with positions from the /crm list
  const candidates = exact.length > 0 ? exact : fuzzy;
  const lines = [`⚠️ По запросу *"${name}"* нашёл ${candidates.length} — уточни:\n`];
  candidates.forEach((t) => {
    const pos = tasks.findIndex((tt) => tt.id === t.id) + 1;
    const dl  = t.deadline_text ? ` | 📅 ${t.deadline_text}` : '';
    lines.push(`${pos}. *${t.contact_name}*${dl}`);
    lines.push(`   → ${t.action_required}`);
  });
  lines.push('\n_crm <номер> выполнено — например: crm 1 выполнено_');
  await send(bot, chatId, lines.join('\n'));
}

async function handleCrmCloseByIndex(
  bot: TelegramBot,
  chatId: number,
  index: number,
  action: 'done' | 'cancelled',
): Promise<void> {
  const tasks = await listActiveCrmTasks(String(chatId));
  const task  = tasks[index - 1];

  if (!task) {
    const count = tasks.length;
    await send(bot, chatId,
      `❌ Задача №${index} не найдена. Активных задач: ${count}.\n_/crm — список_`,
    );
    return;
  }

  await closeCrmTask(task.id, String(chatId), action);
  const icon = action === 'done' ? '✅' : '🚫';
  const verb = action === 'done' ? 'Выполнено' : 'Отменено';
  await send(bot, chatId, `${icon} *${verb}:* ${task.contact_name}\n_${task.action_required}_`);
}

async function handleContactAttach(
  bot: TelegramBot,
  chatId: number,
  name: string,
  phone: string,
): Promise<void> {
  const lastTask = await getLastCrmTask(String(chatId));

  if (!lastTask) {
    await send(bot, chatId, `ℹ️ Нет недавних задач для привязки.\n_Имя: ${name}, Тел: ${phone}_`);
    return;
  }

  await attachContactInfo(lastTask.id, String(chatId), name, phone);
  await send(
    bot, chatId,
    `🔗 *Привязано к задаче:*\n*${name}* (${phone})\n→ ${lastTask.action_required}`,
  );
}

async function handleCrmCreate(
  bot: TelegramBot,
  chatId: number,
  rawText: string,
): Promise<boolean> {
  const thinking = await send(bot, chatId, '🔄 Анализирую разговор...').catch(() => undefined);

  const parsed = await parseCrmTranscript(rawText);

  if (parsed.length === 0) {
    if (thinking) bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
    return false;
  }

  try {
    const saved = await Promise.all(
      parsed.map((p) => createCrmTask({ chat_id: String(chatId), raw_text: rawText, ...p })),
    );
    const text = formatCrmCreateConfirmation(saved);

    if (thinking) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown',
      }).catch(async () => send(bot, chatId, text));
    } else {
      await send(bot, chatId, text);
    }
    return true;
  } catch (err) {
    const msg = `❌ Ошибка: ${(err as Error).message.slice(0, 200)}`;
    logger.error('[reminderBot] handleCrmCreate:', (err as Error).message);
    if (thinking) {
      await bot.editMessageText(msg, { chat_id: chatId, message_id: thinking.message_id }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, msg).catch(() => {});
    }
    return true;
  }
}

async function handleCrmList(bot: TelegramBot, chatId: number): Promise<void> {
  const tasks = await listActiveCrmTasks(String(chatId));
  await send(bot, chatId, formatCrmList(tasks));
}

// ─── Existing reminder formatting ─────────────────────────────────────────────

const PRIORITY_ICON: Record<string, string> = { low: '⬇️', normal: '⬜', high: '🔴', urgent: '🚨' };

function formatReminderItem(r: Reminder, idx: number): string {
  const tz   = r.timezone ?? 'Europe/Kyiv';
  const when = r.due_at
    ? new Date(r.due_at).toLocaleString('ru-RU', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
      })
    : r.due_date ?? '—';
  const icon = PRIORITY_ICON[r.priority] ?? '⬜';
  return `${idx}. ${icon} *${r.normalized_title}*\n   📅 ${when} | \`${r.id.slice(0, 8)}\``;
}

function formatReminderConfirmation(r: Reminder): string {
  const tz   = r.timezone ?? 'Europe/Kyiv';
  const when = r.due_at
    ? new Date(r.due_at).toLocaleString('ru-RU', {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit',
      })
    : r.due_date ?? 'без даты';
  const icon = { low: '⬇️', normal: '✅', high: '🔴', urgent: '🚨' }[r.priority] ?? '✅';
  return `${icon} *Сохранено*\n\n📝 ${r.normalized_title}\n📅 ${when}`;
}

// ─── Existing reminder handlers ───────────────────────────────────────────────

async function handleReminderSave(bot: TelegramBot, chatId: number, rawText: string): Promise<void> {
  const thinking = await send(bot, chatId, '⏳ Сохраняю...').catch(() => undefined);
  try {
    const parsed   = await parseReminder(rawText);
    const reminder = await createReminder({ chat_id: String(chatId), raw_text: rawText, ...parsed });
    const text     = formatReminderConfirmation(reminder);
    if (thinking) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown',
      }).catch(async () => send(bot, chatId, text));
    } else {
      await send(bot, chatId, text);
    }
  } catch (err) {
    const msg = `❌ Не смог сохранить: ${(err as Error).message.slice(0, 200)}`;
    logger.error('[reminderBot] handleReminderSave:', (err as Error).message);
    if (thinking) {
      await bot.editMessageText(msg, { chat_id: chatId, message_id: thinking.message_id }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, msg).catch(() => {});
    }
  }
}

async function handleCaptureSave(
  bot: TelegramBot,
  chatId: number,
  rawText: string,
  captureType: ReturnType<typeof detectCaptureType> & {},
): Promise<void> {
  const thinking = await send(bot, chatId, '🔄 Анализирую и структурирую...').catch(() => undefined);
  try {
    const parsed = await parseCapture(rawText, captureType);
    const note   = await createCaptureNote({ chat_id: String(chatId), type: captureType, raw_text: rawText, ...parsed });
    const text   = formatCaptureReply(note);

    if (thinking) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: thinking.message_id, parse_mode: 'MarkdownV2',
      }).catch(async () => bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }).catch(() => {}));
    } else {
      await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }).catch(() => {});
    }
  } catch (err) {
    const msg = `❌ Не смог структурировать: ${(err as Error).message.slice(0, 200)}`;
    logger.error('[reminderBot] handleCaptureSave:', (err as Error).message);
    if (thinking) {
      await bot.editMessageText(msg, { chat_id: chatId, message_id: thinking.message_id }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, msg).catch(() => {});
    }
  }
}

// ─── Main message router ──────────────────────────────────────────────────────

async function handleSave(bot: TelegramBot, chatId: number, rawText: string): Promise<void> {
  // 1a. Close by list index: "crm 3 выполнено" / "закрыть crm 2"
  const closeByIdx = detectCloseByIndex(rawText);
  if (closeByIdx) {
    await handleCrmCloseByIndex(bot, chatId, closeByIdx.index, closeByIdx.action);
    return;
  }

  // 1b. CRM close by name: "SunCity выполнено" / "FavorAuto отменить"
  const closeCmd = detectCloseCommand(rawText);
  if (closeCmd) {
    await handleCrmClose(bot, chatId, closeCmd.name, closeCmd.action);
    return;
  }

  // 2. Contact attachment: "Name\n+380..."
  const attachment = detectContactAttachment(rawText);
  if (attachment) {
    await handleContactAttach(bot, chatId, attachment.name, attachment.phone);
    return;
  }

  // 3. CRM transcript (long business text / call recording)
  if (detectCrmTranscript(rawText)) {
    const handled = await handleCrmCreate(bot, chatId, rawText);
    if (handled) return;
    // No contacts found — fall through to capture/reminder
  }

  // 4. Existing capture flow (checklists, call summaries without CRM structure)
  const captureType = detectCaptureType(rawText);
  if (captureType) {
    await handleCaptureSave(bot, chatId, rawText, captureType);
    return;
  }

  // 5. Regular personal reminder
  await handleReminderSave(bot, chatId, rawText);
}

// ─── Reminder command handlers ────────────────────────────────────────────────

async function handleTasks(bot: TelegramBot, chatId: number): Promise<void> {
  const list = await listActiveReminders(String(chatId));
  if (list.length === 0) {
    await send(bot, chatId, '📭 Нет активных напоминаний.\n\nПросто напиши задачу — сохраню.');
    return;
  }
  const lines = list.map((r, i) => formatReminderItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📋 *Напоминания (${list.length}):*\n\n${lines}\n\n_/done <id> — выполнено | /delete <id> — удалить_`);
}

async function handleToday(bot: TelegramBot, chatId: number): Promise<void> {
  const tz   = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
  const list = await listTodayReminders(String(chatId), tz);
  if (list.length === 0) {
    await send(bot, chatId, '✅ На сегодня напоминаний нет.');
    return;
  }
  const lines = list.map((r, i) => formatReminderItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📅 *Сегодня (${list.length}):*\n\n${lines}`);
}

async function handleTomorrow(bot: TelegramBot, chatId: number): Promise<void> {
  const tz   = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
  const list = await listTomorrowReminders(String(chatId), tz);
  if (list.length === 0) {
    await send(bot, chatId, '📭 На завтра напоминаний нет.');
    return;
  }
  const lines = list.map((r, i) => formatReminderItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📅 *Завтра (${list.length}):*\n\n${lines}`);
}

async function handleDone(bot: TelegramBot, chatId: number, idPrefix: string | undefined): Promise<void> {
  if (!idPrefix) {
    await send(bot, chatId, '_/done <id> — закрыть напоминание (первые 8 символов ID из /tasks)_');
    return;
  }
  const list  = await listActiveReminders(String(chatId));
  const match = list.find((r) => r.id.startsWith(idPrefix));
  if (!match) {
    await send(bot, chatId, `❌ Напоминание \`${idPrefix}\` не найдено.\n_/tasks — список_`);
    return;
  }
  await markReminderDone(match.id, String(chatId));
  await send(bot, chatId, `✅ *Выполнено:* ${match.normalized_title}`);
}

async function handleDelete(bot: TelegramBot, chatId: number, idPrefix: string | undefined): Promise<void> {
  if (!idPrefix) {
    await send(bot, chatId, '_/delete <id> — удалить напоминание_');
    return;
  }
  const list  = await listActiveReminders(String(chatId));
  const match = list.find((r) => r.id.startsWith(idPrefix));
  if (!match) {
    await send(bot, chatId, `❌ Напоминание \`${idPrefix}\` не найдено.`);
    return;
  }
  await deleteReminder(match.id, String(chatId));
  await send(bot, chatId, `🗑 Удалено: ${match.normalized_title}`);
}

// ─── Capture command handlers ─────────────────────────────────────────────────

async function handleNotes(bot: TelegramBot, chatId: number): Promise<void> {
  const notes = await listRecentNotes(String(chatId), 10);
  if (notes.length === 0) {
    await send(bot, chatId, '📝 Заметок пока нет.');
    return;
  }
  const TYPE_EMOJI: Record<string, string> = {
    call_summary: '📞', checklist: '✅', client_notes: '👥', raw_note: '📝',
  };
  const lines = [`📋 *Последние заметки:*\n`];
  notes.forEach((n, i) => {
    const emoji  = TYPE_EMOJI[n.type] ?? '📝';
    const date   = new Date(n.created_at).toLocaleDateString('ru-RU');
    const shortId = n.id.slice(0, 8);
    lines.push(`${i + 1}\\. ${emoji} *${n.title.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')}*`);
    lines.push(`   ${date}  →  /note ${shortId}`);
  });
  await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' }).catch(() => {});
}

async function handleNote(bot: TelegramBot, chatId: number, shortId: string | undefined): Promise<void> {
  if (!shortId) {
    await send(bot, chatId, '_/note <id> — открыть заметку_');
    return;
  }
  const note = await getNoteByShortId(String(chatId), shortId);
  if (!note) {
    await send(bot, chatId, `❌ Заметка \`${shortId}\` не найдена.\n_/notes — список_`);
    return;
  }
  const text = formatCaptureReply(note);
  await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }).catch(
    () => bot.sendMessage(chatId, note.title + '\n\n' + note.summary).catch(() => {}),
  );
}

async function handleActions(bot: TelegramBot, chatId: number): Promise<void> {
  const items = await getAllNextActions(String(chatId), 48);
  if (items.length === 0) {
    await send(bot, chatId, '✅ Нет следующих действий за последние 48 часов.');
    return;
  }
  const lines = [`🧩 *Следующие действия (48ч):*\n`];
  items.slice(0, 20).forEach(({ title, action }, i) => {
    const t = title.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
    const a = action.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
    lines.push(`${i + 1}\\. \\[${t}\\] ${a}`);
  });
  await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' }).catch(() => {});
}

async function handleHelp(bot: TelegramBot, chatId: number): Promise<void> {
  await send(bot, chatId,
    `*CRM & Reminder Bot*\n\n` +
    `🎙 *Голосовое / текст:*\n` +
    `Запись разговора → CRM-задачи по контактам автоматически\n` +
    `[Имя] выполнено — закрыть CRM задачу\n` +
    `[Имя]\\n[+Телефон] — привязать к последней задаче\n\n` +
    `📋 *CRM задачи:*\n` +
    `/crm — все активные\n\n` +
    `📅 *Личные напоминания:*\n` +
    `/tasks — все активные\n` +
    `/today — сегодня\n` +
    `/tomorrow — завтра\n` +
    `/done <id> — выполнено\n` +
    `/delete <id> — удалить\n\n` +
    `📌 *Заметки:*\n` +
    `/notes — последние 10\n` +
    `/note <id> — открыть\n` +
    `/actions — следующие шаги (48ч)\n\n` +
    `💡 *Примеры закрытия:*\n` +
    `_SunCity выполнено_ — точное имя\n` +
    `_crm 1 выполнено_ — по номеру из /crm\n` +
    `_закрыть crm 2_ — по номеру\n` +
    `_FavorAuto отменить_ — отменить задачу`
  );
}

// ─── Proactive CRM brief ──────────────────────────────────────────────────────

export async function sendCrmBrief(): Promise<void> {
  const bot    = _bot;
  const chatId = config.reminder.defaultChatId;
  if (!bot || !chatId) return;

  try {
    const tasks = await listActiveCrmTasks(chatId);
    if (tasks.length === 0) return;

    const text = formatCrmBrief(tasks);
    await bot.sendMessage(parseInt(chatId, 10), text, { parse_mode: 'Markdown' });
    logger.info(`[reminderBot] CRM brief sent: ${tasks.length} tasks`);
  } catch (err) {
    logger.warn('[reminderBot] CRM brief failed:', (err as Error).message);
  }
}

// ─── Startup / shutdown ───────────────────────────────────────────────────────

export async function startReminderBot(): Promise<void> {
  const token = process.env.REMINDER_BOT_TOKEN;
  if (!token) {
    logger.info('[reminderBot] REMINDER_BOT_TOKEN not set — skipping');
    return;
  }

  _bot = new TelegramBot(token, {
    polling: { autoStart: false, interval: 2000, params: { timeout: 30 } },
  });
  const bot = _bot;

  try { await bot.deleteWebHook(); } catch { /* non-fatal */ }

  let last409 = 0;
  bot.on('polling_error', (err) => {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('409')) {
      const now = Date.now();
      if (now - last409 > 30_000) {
        logger.warn('[reminderBot] 409 conflict — waiting...');
        last409 = now;
      }
    } else {
      logger.warn('[reminderBot] polling error:', msg.slice(0, 120));
    }
  });

  bot.onText(/^\/start(@\w+)?$/, async (msg) => {
    await send(bot, msg.chat.id,
      `👋 *CRM & Reminder Bot*\n\n` +
      `Отправь запись разговора — создам CRM-задачи.\n` +
      `Скажи "[Имя] выполнено" — закрою задачу.\n\n` +
      `/crm — активные CRM задачи\n/help — справка`,
    ).catch(() => {});
  });

  bot.onText(/^\/crm(@\w+)?$/, async (msg) => {
    await handleCrmList(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/tasks(@\w+)?$/, async (msg) => {
    await handleTasks(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/today(@\w+)?$/, async (msg) => {
    await handleToday(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/tomorrow(@\w+)?$/, async (msg) => {
    await handleTomorrow(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/done(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleDone(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/delete(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleDelete(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/help(@\w+)?$/, async (msg) => {
    await handleHelp(bot, msg.chat.id).catch(() => {});
  });

  bot.onText(/^\/notes(@\w+)?$/, async (msg) => {
    await handleNotes(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/note(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleNote(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  bot.onText(/^\/actions(@\w+)?$/, async (msg) => {
    await handleActions(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {}),
    );
  });

  // Voice messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bot as any).on('voice', async (msg: TelegramBot.Message) => {
    const fileId = msg.voice?.file_id;
    if (!fileId) return;

    if (!config.openai.apiKey) {
      await bot.sendMessage(msg.chat.id, '❌ OpenAI API key не настроен — голосовые сообщения недоступны.').catch(() => {});
      return;
    }

    const thinking = await send(bot, msg.chat.id, '🎙 Распознаю голос...').catch(() => undefined);
    let transcribed: string;
    try {
      const fileInfo = await bot.getFile(fileId);
      const fileUrl  = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
      transcribed    = await transcribeVoice(fileUrl);
      if (!transcribed) {
        const errMsg = '🤷 Не смог распознать голосовое сообщение.';
        if (thinking) {
          await bot.editMessageText(errMsg, { chat_id: msg.chat.id, message_id: thinking.message_id }).catch(() => {});
        } else {
          await bot.sendMessage(msg.chat.id, errMsg).catch(() => {});
        }
        return;
      }
      logger.info(`[reminderBot] voice transcribed: "${transcribed.slice(0, 80)}"`);
      if (thinking) {
        await bot.editMessageText(`🎙 _"${transcribed.slice(0, 200)}${transcribed.length > 200 ? '...' : ''}"_`, {
          chat_id: msg.chat.id, message_id: thinking.message_id, parse_mode: 'Markdown',
        }).catch(() => {});
      }
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Ошибка распознавания: ${(err as Error).message.slice(0, 200)}`).catch(() => {});
      return;
    }

    await handleSave(bot, msg.chat.id, transcribed);
  });

  // Text messages
  bot.on('message', async (msg) => {
    if (msg.voice) return;
    const text = msg.text ?? '';
    if (!text || text.startsWith('/')) return;
    await handleSave(bot, msg.chat.id, text).catch((e) => {
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {});
    });
  });

  await bot.startPolling();
  logger.info('[reminderBot] polling started');
}

export async function stopReminderBot(): Promise<void> {
  if (_bot) {
    await _bot.stopPolling().catch(() => {});
    _bot = null;
  }
}
