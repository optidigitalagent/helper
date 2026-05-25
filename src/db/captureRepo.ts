import { getDb }                       from './client';
import { CaptureNote, CaptureType, ParsedCapture } from '../types/capture';

export interface CreateCaptureInput extends ParsedCapture {
  chat_id:  string;
  type:     CaptureType;
  raw_text: string;
}

export async function createCaptureNote(input: CreateCaptureInput): Promise<CaptureNote> {
  const db = getDb();
  const { data, error } = await db
    .from('capture_notes')
    .insert({
      chat_id:       input.chat_id,
      type:          input.type,
      title:         input.title,
      topic:         input.topic ?? null,
      raw_text:      input.raw_text,
      summary:       input.summary,
      entities:      input.entities,
      done_items:    input.done_items,
      waiting_items: input.waiting_items,
      next_actions:  input.next_actions,
      tags:          input.tags,
      metadata:      {},
    })
    .select()
    .single();
  if (error) throw new Error(`createCaptureNote: ${error.message}`);
  return data as CaptureNote;
}

export async function listRecentNotes(chatId: string, limit = 10): Promise<CaptureNote[]> {
  const db = getDb();
  const { data, error } = await db
    .from('capture_notes')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentNotes: ${error.message}`);
  return (data ?? []) as CaptureNote[];
}

export async function getNoteByShortId(chatId: string, shortId: string): Promise<CaptureNote | null> {
  // shortId is the first 8 chars of uuid
  const notes = await listRecentNotes(chatId, 100);
  return notes.find((n) => n.id.startsWith(shortId)) ?? null;
}

export async function getNotesForDigest(tz: string, hours = 48): Promise<CaptureNote[]> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const db    = getDb();
  const { data } = await db
    .from('capture_notes')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as CaptureNote[];
}

export async function getAllNextActions(chatId: string, hours = 48): Promise<{ title: string; action: string }[]> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const db    = getDb();
  const { data } = await db
    .from('capture_notes')
    .select('title, next_actions')
    .eq('chat_id', chatId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  const result: { title: string; action: string }[] = [];
  for (const note of data ?? []) {
    for (const action of (note.next_actions as string[])) {
      result.push({ title: note.title as string, action });
    }
  }
  return result;
}
