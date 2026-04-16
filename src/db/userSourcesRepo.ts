import { getDb } from './client';
import { Category } from '../types';
import { makeId }   from '../utils/hash';

// ─── User Sources ─────────────────────────────────────────────────────────────

export interface UserSource {
  id:       string;
  name:     string;
  feedUrl:  string;
  category: Category;
}

export async function getUserSources(): Promise<UserSource[]> {
  const { data, error } = await getDb()
    .from('user_sources')
    .select('id, name, feed_url, category')
    .eq('active', true);

  if (error) {
    // Table might not exist yet — fail gracefully
    return [];
  }

  return (data ?? []).map((r) => ({
    id:       r.id       as string,
    name:     r.name     as string,
    feedUrl:  r.feed_url as string,
    category: (r.category as Category) ?? Category.Opportunities,
  }));
}

export async function saveUserSource(
  name:    string,
  feedUrl: string,
  category: Category = Category.Opportunities,
): Promise<void> {
  const id = makeId('user_source', feedUrl);
  const { error } = await getDb()
    .from('user_sources')
    .upsert({ id, name, feed_url: feedUrl, category, active: true }, { onConflict: 'feed_url' });

  if (error) throw new Error(`saveUserSource failed: ${error.message}`);
}

export async function listUserSources(): Promise<UserSource[]> {
  const { data, error } = await getDb()
    .from('user_sources')
    .select('id, name, feed_url, category, active, created_at')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => ({
    id:       r.id       as string,
    name:     r.name     as string,
    feedUrl:  r.feed_url as string,
    category: (r.category as Category) ?? Category.Opportunities,
  }));
}

export async function deleteUserSource(feedUrl: string): Promise<void> {
  const { error } = await getDb()
    .from('user_sources')
    .update({ active: false })
    .eq('feed_url', feedUrl);

  if (error) throw new Error(`deleteUserSource failed: ${error.message}`);
}

// ─── User Interests ───────────────────────────────────────────────────────────

export interface UserInterest {
  keyword: string;
  weight:  number;
}

export async function getUserInterests(): Promise<UserInterest[]> {
  const { data, error } = await getDb()
    .from('user_interests')
    .select('keyword, weight')
    .order('weight', { ascending: false })
    .limit(60);

  if (error) return [];
  return (data ?? []).map((r) => ({
    keyword: r.keyword as string,
    weight:  r.weight  as number,
  }));
}

/** Increment weight for each keyword; insert if new. */
export async function addInterestKeywords(keywords: string[]): Promise<void> {
  if (keywords.length === 0) return;

  // Upsert: if keyword exists → increment weight; else insert weight=1
  // Supabase doesn't support increment-on-conflict natively,
  // so we fetch existing then upsert updated values.
  const { data: existing } = await getDb()
    .from('user_interests')
    .select('keyword, weight')
    .in('keyword', keywords);

  const existMap = new Map<string, number>(
    (existing ?? []).map((r) => [r.keyword as string, r.weight as number]),
  );

  const rows = keywords.map((kw) => ({
    keyword:    kw,
    weight:     (existMap.get(kw) ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await getDb()
    .from('user_interests')
    .upsert(rows, { onConflict: 'keyword' });

  if (error) throw new Error(`addInterestKeywords failed: ${error.message}`);
}
