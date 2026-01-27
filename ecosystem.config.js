module.exports = {
  apps: [
    {
      name: "salontraining-backend",
      script: "dist/src/server.js",
      instances: 1, // IMPORTANT: Only 1 instance to avoid port conflicts
      exec_mode: "fork", // Use fork mode, not cluster (single port)
      
      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      
      // Restart behavior
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "10s", // App must run at least 10s before considered stable
      restart_delay: 4000, // Wait 4 seconds between restarts to allow port release
      
      // Graceful shutdown
      kill_timeout: 10000, // Wait 10s for graceful shutdown before SIGKILL
      wait_ready: true, // Wait for process.send('ready') before considering app online
      listen_timeout: 30000, // Max 30s to wait for ready signal
      
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      
      // Memory management
      max_memory_restart: "500M",
    },
  ],
};
