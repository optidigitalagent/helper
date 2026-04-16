import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// ─── ASCII guard ──────────────────────────────────────────────────────────────
// Supabase keys are used in HTTP headers which require ASCII-only values.
// Cyrillic lookalikes (е/а/о/р/с/т/у) are visually identical but break fetch.

function assertAscii(value: string, name: string): string {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 127) {
      throw new Error(
        `Env var ${name} contains a non-ASCII character at index ${i}: ` +
        `"${value[i]}" (code ${code}). ` +
        `This is likely a Cyrillic lookalike — go to Railway → Variables, ` +
        `delete ${name} and retype it manually (don't paste from a Cyrillic keyboard).`,
      );
    }
  }
  return value;
}

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!_client) {
    const url = assertAscii(config.supabase.url,        'SUPABASE_URL');
    const key = assertAscii(config.supabase.serviceKey, 'SUPABASE_SERVICE_KEY');
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: -1 } },
    });
  }
  return _client;
}
