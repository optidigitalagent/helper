import dotenv from 'dotenv';
dotenv.config();

function env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),

  supabase: {
    url:        env('SUPABASE_URL'),
    serviceKey: env('SUPABASE_SERVICE_KEY'),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model:  process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },

  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN'),
    chatId:   env('TELEGRAM_CHAT_ID'),
  },

  // Cron expression for morning digest. Default: 07:00 every day.
  digestCron: process.env.DIGEST_CRON ?? '0 7 * * *',

  // Timezone for cron scheduling and date comparisons
  timezone: process.env.TZ ?? process.env.TIMEZONE ?? 'Europe/Moscow',

  // How far back (hours) to look when collecting items for the digest
  lookbackHours: parseInt(process.env.LOOKBACK_HOURS ?? '24', 10),
};
