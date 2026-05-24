/**
 * PM2 production config.
 * Usage:
 *   npm run build                         # compile TypeScript → dist/
 *   pm2 start ecosystem.config.js         # start / reload
 *   pm2 save                              # persist across reboot
 */
module.exports = {
  apps: [
    {
      name: 'helper-agent',
      script: 'dist/index.js',
      cwd: __dirname,

      // Load .env automatically (PM2 ≥ 5.3)
      env_file: '.env',

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      restart_delay: 5000,

      // Log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Do not watch files — restarts on change are unwanted in production
      watch: false,
    },
  ],
};
