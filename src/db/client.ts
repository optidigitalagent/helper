import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

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

// ─── Health check ─────────────────────────────────────────────────────────────

export async function supabaseHealthCheck(): Promise<boolean> {
  const urlStr = config.supabase.url;
  let hostname = urlStr;
  try { hostname = new URL(urlStr).hostname; } catch { /* keep raw */ }

  logger.info(`[supabase-health] checking connectivity to ${hostname}`);

  // Step 1 — DNS / raw TCP reachability via native fetch HEAD
  try {
    const keyPrefix = config.supabase.serviceKey.slice(0, 20) + '…';
    logger.info(`[supabase-health] SUPABASE_URL=${urlStr} | key prefix=${keyPrefix}`);

    const res = await fetch(`${urlStr}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey:        config.supabase.serviceKey,
        Authorization: `Bearer ${config.supabase.serviceKey}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    logger.info(`[supabase-health] TCP+TLS ok — HTTP status ${res.status}`);
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
    const cause = err.cause;
    logger.error(
      `[supabase-health] NETWORK ERROR — cannot reach ${hostname}\n` +
      `  error.name:          ${err.name}\n` +
      `  error.message:       ${err.message}\n` +
      `  cause.code:          ${cause?.code ?? 'n/a'}\n` +
      `  cause.syscall:       ${(cause as any)?.syscall ?? 'n/a'}\n` +
      `  cause.message:       ${cause?.message ?? 'n/a'}\n` +
      `\n` +
      `  ── Likely causes ──────────────────────────────────────────────\n` +
      `  ENOTFOUND  → DNS cannot resolve "${hostname}"\n` +
      `               • Supabase project deleted / paused / wrong ref ID\n` +
      `               • Check: https://supabase.com/dashboard → your project\n` +
      `               • Free-tier projects pause after 1 week of inactivity\n` +
      `  ECONNREFUSED → host exists but port 443 blocked (firewall/VPN)\n` +
      `  UNABLE_TO_VERIFY_LEAF_SIGNATURE → TLS/cert issue\n` +
      `  ───────────────────────────────────────────────────────────────`,
    );
    return false;
  }

  // Step 2 — Supabase API: SELECT to verify key + required tables exist
  const REQUIRED_TABLES = ['content_items', 'digests'] as const;
  for (const table of REQUIRED_TABLES) {
    try {
      const queryPromise = getDb().from(table).select('*').limit(1) as unknown as Promise<{ data: unknown; error: unknown }>;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`[timeout] Supabase SELECT on "${table}" timed out after 10s`)), 10_000)
      );
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        const pgErr = error as { message: string; code?: string; hint?: string; details?: string };
        if (pgErr.code === '42P01') {
          logger.error(
            `[supabase-health] MISSING TABLE "${table}"\n` +
            `  pg.code: 42P01\n` +
            `  → Table does not exist in this Supabase project.\n` +
            `  → Run the migration SQL to create all required tables.\n` +
            `  → Check: supabase.com/dashboard → your project → Table Editor`,
          );
        } else {
          logger.error(
            `[supabase-health] API ERROR on "${table}"\n` +
            `  pg.code:    ${pgErr.code ?? 'n/a'}\n` +
            `  pg.message: ${pgErr.message}\n` +
            `  pg.hint:    ${pgErr.hint ?? 'n/a'}\n` +
            `  pg.details: ${pgErr.details ?? 'n/a'}\n` +
            `\n` +
            `  ── Likely causes ──────────────────────────────────────────────\n` +
            `  42P01   → table "${table}" does not exist — run migrations\n` +
            `  PGRST301 → JWT invalid or expired — regenerate SUPABASE_SERVICE_KEY\n` +
            `  42501   → RLS policy blocking service_role — check RLS config\n` +
            `  23505   → unique constraint missing — check table schema\n` +
            `  ───────────────────────────────────────────────────────────────`,
          );
        }
        return false;
      }

      logger.info(`[supabase-health] OK — "${table}" accessible, got ${(data as unknown[])?.length ?? 0} row(s)`);
    } catch (e) {
      const err = e as Error & { cause?: Error };
      logger.error(
        `[supabase-health] UNEXPECTED THROW during SELECT on "${table}"\n` +
        `  name:    ${err.name}\n` +
        `  message: ${err.message}\n` +
        `  cause:   ${err.cause?.message ?? 'n/a'}\n` +
        `  stack:   ${err.stack?.split('\n').slice(0, 5).join('\n           ')}`,
      );
      return false;
    }
  }

  return true;
}
