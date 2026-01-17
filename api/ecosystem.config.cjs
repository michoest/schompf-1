module.exports = {
    apps: [{
        name: 'schompf-1-api',
        script: 'src/server.js',
        env: {
            NODE_ENV: 'production',
            PORT: 3000,
        },
        // Restart behavior
        exp_backoff_restart_delay: 100,
        max_memory_restart: '100M'
    }]
};
