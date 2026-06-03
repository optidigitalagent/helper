// Sets dummy env vars before any module that imports config.ts is loaded.
// Must be loaded via ts-node -r / --require BEFORE the test file.
process.env.SUPABASE_URL            = process.env.SUPABASE_URL            || 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY    || 'dummy-service-key';
process.env.TELEGRAM_BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN      || 'dummy-telegram-token';
process.env.TELEGRAM_CHAT_ID        = process.env.TELEGRAM_CHAT_ID        || '123456';
