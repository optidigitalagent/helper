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
    botToken:     env('TELEGRAM_BOT_TOKEN'),
    chatId:       env('TELEGRAM_CHAT_ID'),
    publicAccess: (process.env.PUBLIC_BOT_ENABLED ?? 'true').toLowerCase() !== 'false',
    publicRateLimitPerHour: Math.max(
      1,
      parseInt(process.env.PUBLIC_RATE_LIMIT_PER_HOUR ?? '30', 10) || 30,
    ),
  },

  // Cron expression for morning digest. Default: 07:00 every day.
  digestCron: process.env.DIGEST_CRON ?? '0 7 * * *',

  // Timezone for cron scheduling and date comparisons
  timezone: process.env.TZ ?? process.env.TIMEZONE ?? 'Europe/Moscow',

  // How far back (hours) to look when collecting items for the digest
  lookbackHours: parseInt(process.env.LOOKBACK_HOURS ?? '24', 10),

  reminder: {
    botToken:        process.env.REMINDER_BOT_TOKEN ?? '',
    defaultTimezone: process.env.REMINDER_DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
    audioModel:      process.env.REMINDER_AUDIO_TRANSCRIPTION_MODEL ?? 'whisper-1',
    defaultChatId:   process.env.REMINDER_DEFAULT_CHAT_ID ?? '',
  },

  distribution: {
    botToken:       process.env.TELEGRAM_DISTRIBUTION_BOT_TOKEN ?? '',
    allowedUserIds: (process.env.ALLOWED_USER_IDS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean),
  },
};
