/**
 * PM2 Ecosystem Configuration — Neon Reptilia Game Server
 *
 * Cluster mode: one Node.js process per CPU core.
 * WebSocket sticky sessions are handled at the Nginx level via ip_hash,
 * so each player's connection always lands on the same worker.
 *
 * Note: The C++ N-API game engine is loaded per-process.
 * Room state is NOT shared across workers (by design — rooms are isolated).
 */
module.exports = {
  apps: [
    {
      name:         'neon-reptilia',
      script:       'server/dist/server.js',
      instances:    'max',        // One process per CPU core
      exec_mode:    'cluster',
      watch:        false,

      // Memory safety: restart if process exceeds 512 MB
      max_memory_restart: '512M',

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT:     3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },

      // Logging
      log_date_format:   'YYYY-MM-DD HH:mm:ss',
      out_file:          './logs/out.log',
      error_file:        './logs/error.log',
      merge_logs:        true,

      // Graceful shutdown: wait up to 5s for open connections to close
      kill_timeout:      5000,
      listen_timeout:    3000,

      // Crash recovery: exponential back-off, max 10 restarts in 15 minutes
      max_restarts:      10,
      min_uptime:        '5s',
      restart_delay:     1000,
    },
  ],
};
