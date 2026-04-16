import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: -1 } },
    });
  }
  return _client;
}
