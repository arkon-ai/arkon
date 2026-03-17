// PM2 process manager config for Arkon
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [{
    name: 'arkon',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_rotate: true
  }]
};
