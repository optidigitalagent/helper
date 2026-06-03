import { getDb }                               from './client';
import { CrmTask, CrmTaskStatus, ParsedCrmTask } from '../types/crmTask';

export interface CreateCrmTaskInput extends ParsedCrmTask {
  chat_id:  string;
  raw_text: string;
}

export async function createCrmTask(input: CreateCrmTaskInput): Promise<CrmTask> {
  const db = getDb();
  const { data, error } = await db
    .from('crm_tasks')
    .insert({
      chat_id:         input.chat_id,
      contact_name:    input.contact_name,
      contact_phone:   input.contact_phone ?? null,
      contact_type:    input.contact_type,
      agreement:       input.agreement,
      action_required: input.action_required,
      deadline_text:   input.deadline_text ?? null,
      deadline_at:     input.deadline_at ?? null,
      next_step:       input.next_step ?? null,
      comment:         input.comment ?? null,
      raw_text:        input.raw_text,
    })
    .select()
    .single();
  if (error) throw new Error(`createCrmTask: ${error.message}`);
  return data as CrmTask;
}

export async function listActiveCrmTasks(chatId: string): Promise<CrmTask[]> {
  const db = getDb();
  const { data, error } = await db
    .from('crm_tasks')
    .select('*')
    .eq('chat_id', chatId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listActiveCrmTasks: ${error.message}`);
  return (data ?? []) as CrmTask[];
}

export async function getAllActiveCrmTasks(): Promise<CrmTask[]> {
  const db = getDb();
  const { data, error } = await db
    .from('crm_tasks')
    .select('*')
    .eq('status', 'active')
    .order('deadline_at', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`getAllActiveCrmTasks: ${error.message}`);
  return (data ?? []) as CrmTask[];
}

export async function closeCrmTask(
  id: string,
  chatId: string,
  status: 'done' | 'cancelled',
): Promise<boolean> {
  const db = getDb();
  const { error, count } = await db
    .from('crm_tasks')
    .update({ status, completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('chat_id', chatId)
    .eq('status', 'active');
  if (error) throw new Error(`closeCrmTask: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function attachContactInfo(
  id: string,
  chatId: string,
  name: string,
  phone: string,
): Promise<boolean> {
  const db = getDb();
  const { error, count } = await db
    .from('crm_tasks')
    .update({ contact_name: name, contact_phone: phone })
    .eq('id', id)
    .eq('chat_id', chatId);
  if (error) throw new Error(`attachContactInfo: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getLastCrmTask(chatId: string): Promise<CrmTask | null> {
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const db = getDb();
  const { data } = await db
    .from('crm_tasks')
    .select('*')
    .eq('chat_id', chatId)
    .eq('status', 'active')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as CrmTask) ?? null;
}

export async function findCrmTasksByName(chatId: string, name: string): Promise<CrmTask[]> {
  const tasks = await listActiveCrmTasks(chatId);
  const lower = name.toLowerCase();
  return tasks.filter((t) => t.contact_name.toLowerCase().includes(lower));
}

export async function getCrmTasksForDigest(chatId?: string): Promise<CrmTask[]> {
  const db = getDb();
  let query = db
    .from('crm_tasks')
    .select('*')
    .eq('status', 'active');
  if (chatId) query = query.eq('chat_id', chatId);
  const { data } = await query.order('deadline_at', { ascending: true, nullsFirst: false });
  return (data ?? []) as CrmTask[];
}
