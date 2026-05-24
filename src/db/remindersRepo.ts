import { getDb }             from './client';
import { Reminder, ParsedReminder } from '../types/reminder';

export interface CreateReminderInput extends ParsedReminder {
  chat_id:  string;
  raw_text: string;
  user_id?: string | null;
}

export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  const db = getDb();
  const { data, error } = await db
    .from('reminders')
    .insert({
      chat_id:          input.chat_id,
      raw_text:         input.raw_text,
      normalized_title: input.normalized_title,
      notes:            input.notes ?? null,
      due_at:           input.due_at ?? null,
      due_date:         input.due_date ?? null,
      priority:         input.priority,
      tags:             input.tags,
      user_id:          input.user_id ?? null,
      timezone:         process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
    })
    .select()
    .single();
  if (error) throw new Error(`createReminder: ${error.message}`);
  return data as Reminder;
}

export async function listActiveReminders(chatId: string): Promise<Reminder[]> {
  const db = getDb();
  const { data, error } = await db
    .from('reminders')
    .select('*')
    .eq('chat_id', chatId)
    .eq('status', 'active')
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`listActiveReminders: ${error.message}`);
  return (data ?? []) as Reminder[];
}

export async function listTodayReminders(chatId: string, tz: string): Promise<Reminder[]> {
  const today = new Date().toLocaleDateString('sv', { timeZone: tz });
  const db    = getDb();
  const { data, error } = await db
    .from('reminders')
    .select('*')
    .eq('chat_id', chatId)
    .eq('status', 'active')
    .eq('due_date', today)
    .order('due_at', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listTodayReminders: ${error.message}`);
  return (data ?? []) as Reminder[];
}

export async function listTomorrowReminders(chatId: string, tz: string): Promise<Reminder[]> {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv', { timeZone: tz });
  const db       = getDb();
  const { data, error } = await db
    .from('reminders')
    .select('*')
    .eq('chat_id', chatId)
    .eq('status', 'active')
    .eq('due_date', tomorrow)
    .order('due_at', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listTomorrowReminders: ${error.message}`);
  return (data ?? []) as Reminder[];
}

export async function markReminderDone(id: string, chatId: string): Promise<boolean> {
  const db = getDb();
  const { error, count } = await db
    .from('reminders')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('chat_id', chatId)
    .eq('status', 'active');
  if (error) throw new Error(`markReminderDone: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function deleteReminder(id: string, chatId: string): Promise<boolean> {
  const db = getDb();
  const { error, count } = await db
    .from('reminders')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('chat_id', chatId);
  if (error) throw new Error(`deleteReminder: ${error.message}`);
  return (count ?? 0) > 0;
}

export interface RemindersForDigest {
  today:    Reminder[];
  tomorrow: Reminder[];
  overdue:  Reminder[];
}

export async function getRemindersForDigest(tz: string): Promise<RemindersForDigest> {
  const now          = new Date();
  const todayStr     = now.toLocaleDateString('sv', { timeZone: tz });
  const tomorrowStr  = new Date(now.getTime() + 86_400_000).toLocaleDateString('sv', { timeZone: tz });

  const db = getDb();

  const [todayRes, tomorrowRes, overdueRes] = await Promise.all([
    db.from('reminders').select('*')
      .eq('status', 'active').eq('due_date', todayStr)
      .order('due_at', { ascending: true }),
    db.from('reminders').select('*')
      .eq('status', 'active').eq('due_date', tomorrowStr)
      .order('due_at', { ascending: true }),
    db.from('reminders').select('*')
      .eq('status', 'active').lt('due_date', todayStr)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true }),
  ]);

  return {
    today:    (todayRes.data    ?? []) as Reminder[],
    tomorrow: (tomorrowRes.data ?? []) as Reminder[],
    overdue:  (overdueRes.data  ?? []) as Reminder[],
  };
}
