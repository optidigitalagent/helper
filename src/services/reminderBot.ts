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

// ─── Formatting ───────────────────────────────────────────────────────────────

const PRIORITY_ICON: Record<string, string> = { low: '⬇️', normal: '⬜', high: '🔴', urgent: '🚨' };

function formatItem(r: Reminder, idx: number): string {
  const tz   = r.timezone ?? 'Europe/Kyiv';
  const when = r.due_at
    ? new Date(r.due_at).toLocaleString('ru-RU', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
      })
    : r.due_date ?? '—';
  const icon = PRIORITY_ICON[r.priority] ?? '⬜';
  return `${idx}. ${icon} *${r.normalized_title}*\n   📅 ${when} | \`${r.id.slice(0, 8)}\``;
}

function formatConfirmation(r: Reminder): string {
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

// ─── Command handlers ─────────────────────────────────────────────────────────

function send(bot: TelegramBot, chatId: number, text: string): Promise<TelegramBot.Message> {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

async function handleSave(bot: TelegramBot, chatId: number, rawText: string): Promise<void> {
  // ── Route long / structured text to capture, short tasks to reminder ─────
  const captureType = detectCaptureType(rawText);
  if (captureType) {
    await handleCapture(bot, chatId, rawText, captureType);
    return;
  }

  const thinking = await send(bot, chatId, '⏳ Сохраняю...').catch(() => undefined);
  try {
    const parsed   = await parseReminder(rawText);
    const reminder = await createReminder({ chat_id: String(chatId), raw_text: rawText, ...parsed });
    const text     = formatConfirmation(reminder);
    if (thinking) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown',
      }).catch(async () => send(bot, chatId, text));
    } else {
      await send(bot, chatId, text);
    }
  } catch (err) {
    const msg = `❌ Не смог сохранить: ${(err as Error).message.slice(0, 200)}`;
    logger.error('[reminderBot] handleSave:', (err as Error).message);
    if (thinking) {
      await bot.editMessageText(msg, { chat_id: chatId, message_id: thinking.message_id }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, msg).catch(() => {});
    }
  }
}

async function handleCapture(
  bot: TelegramBot,
  chatId: number,
  rawText: string,
  captureType: ReturnType<typeof detectCaptureType> & {}
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
    logger.error('[reminderBot] handleCapture:', (err as Error).message);
    if (thinking) {
      await bot.editMessageText(msg, { chat_id: chatId, message_id: thinking.message_id }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, msg).catch(() => {});
    }
  }
}

async function handleTasks(bot: TelegramBot, chatId: number): Promise<void> {
  const list = await listActiveReminders(String(chatId));
  if (list.length === 0) {
    await send(bot, chatId, '📭 Нет активных задач.\n\nПросто напиши задачу — сохраню.');
    return;
  }
  const lines = list.map((r, i) => formatItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📋 *Задачи (${list.length}):*\n\n${lines}\n\n_/done <id> — выполнено | /delete <id> — удалить_`);
}

async function handleToday(bot: TelegramBot, chatId: number): Promise<void> {
  const tz   = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
  const list = await listTodayReminders(String(chatId), tz);
  if (list.length === 0) {
    await send(bot, chatId, '✅ На сегодня задач нет.');
    return;
  }
  const lines = list.map((r, i) => formatItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📅 *Сегодня (${list.length}):*\n\n${lines}`);
}

async function handleTomorrow(bot: TelegramBot, chatId: number): Promise<void> {
  const tz   = process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
  const list = await listTomorrowReminders(String(chatId), tz);
  if (list.length === 0) {
    await send(bot, chatId, '📭 На завтра задач нет.');
    return;
  }
  const lines = list.map((r, i) => formatItem(r, i + 1)).join('\n\n');
  await send(bot, chatId, `📅 *Завтра (${list.length}):*\n\n${lines}`);
}

async function handleDone(bot: TelegramBot, chatId: number, idPrefix: string | undefined): Promise<void> {
  if (!idPrefix) {
    await send(bot, chatId, '_/done <id> — закрыть задачу (первые 8 символов ID из /tasks)_');
    return;
  }
  const list  = await listActiveReminders(String(chatId));
  const match = list.find((r) => r.id.startsWith(idPrefix));
  if (!match) {
    await send(bot, chatId, `❌ Задача \`${idPrefix}\` не найдена.\n_/tasks — список задач_`);
    return;
  }
  await markReminderDone(match.id, String(chatId));
  await send(bot, chatId, `✅ *Выполнено:* ${match.normalized_title}`);
}

async function handleDelete(bot: TelegramBot, chatId: number, idPrefix: string | undefined): Promise<void> {
  if (!idPrefix) {
    await send(bot, chatId, '_/delete <id> — удалить задачу_');
    return;
  }
  const list  = await listActiveReminders(String(chatId));
  const match = list.find((r) => r.id.startsWith(idPrefix));
  if (!match) {
    await send(bot, chatId, `❌ Задача \`${idPrefix}\` не найдена.`);
    return;
  }
  await deleteReminder(match.id, String(chatId));
  await send(bot, chatId, `🗑 Удалено: ${match.normalized_title}`);
}

// ─── Capture commands ─────────────────────────────────────────────────────────

async function handleNotes(bot: TelegramBot, chatId: number): Promise<void> {
  const notes = await listRecentNotes(String(chatId), 10);
  if (notes.length === 0) {
    await send(bot, chatId, '📝 Заметок пока нет.\n\nОтправь голосовое или текст с итогами звонков — структурирую автоматически.');
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
    await send(bot, chatId, '_/note <id> — показать заметку. ID из /notes (первые 8 символов)_');
    return;
  }
  const note = await getNoteByShortId(String(chatId), shortId);
  if (!note) {
    await send(bot, chatId, `❌ Заметка \`${shortId}\` не найдена.\n_/notes — список заметок_`);
    return;
  }
  const text = formatCaptureReply(note);
  await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }).catch(
    () => bot.sendMessage(chatId, note.title + '\n\n' + note.summary).catch(() => {})
  );
}

async function handleActions(bot: TelegramBot, chatId: number): Promise<void> {
  const items = await getAllNextActions(String(chatId), 48);
  if (items.length === 0) {
    await send(bot, chatId, '✅ Нет активных следующих действий за последние 48 часов.');
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
    `*Capture & Reminder Bot*\n\n` +
    `🎙 *Голосовое / текст:*\n` +
    `Отправь итоги звонков, список дел, задачу — сохраню структурированно.\n\n` +
    `📋 *Задачи и напоминания:*\n` +
    `/tasks — все активные\n` +
    `/today — сегодня\n` +
    `/tomorrow — завтра\n` +
    `/done <id> — закрыть задачу\n` +
    `/delete <id> — удалить задачу\n\n` +
    `📌 *Заметки и итоги:*\n` +
    `/notes — последние 10 заметок\n` +
    `/note <id> — открыть заметку\n` +
    `/actions — все следующие шаги (48ч)\n\n` +
    `💡 *Примеры:*\n` +
    `_"напомни завтра в 10 проверить деплой"_\n` +
    `_"итоги звонков: smile makers — отправил инфу..."_\n` +
    `[Голосовое с несколькими клиентами → структурированный список]`
  );
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

  // /start
  bot.onText(/^\/start(@\w+)?$/, async (msg) => {
    await send(bot, msg.chat.id,
      `👋 *Reminder Bot*\n\nПиши или говори задачи — сохраню и покажу в утреннем дайджесте.\n\n/help — справка`
    ).catch(() => {});
  });

  bot.onText(/^\/tasks(@\w+)?$/, async (msg) => {
    await handleTasks(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/today(@\w+)?$/, async (msg) => {
    await handleToday(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/tomorrow(@\w+)?$/, async (msg) => {
    await handleTomorrow(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/done(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleDone(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/delete(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleDelete(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/help(@\w+)?$/, async (msg) => {
    await handleHelp(bot, msg.chat.id).catch(() => {});
  });

  // ── Capture commands ──────────────────────────────────────────────────────

  bot.onText(/^\/notes(@\w+)?$/, async (msg) => {
    await handleNotes(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/note(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    await handleNote(bot, msg.chat.id, match?.[2]).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
    );
  });

  bot.onText(/^\/actions(@\w+)?$/, async (msg) => {
    await handleActions(bot, msg.chat.id).catch((e) =>
      bot.sendMessage(msg.chat.id, `❌ ${(e as Error).message.slice(0, 200)}`).catch(() => {})
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
        await bot.editMessageText(`🎙 _"${transcribed}"_`, {
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
