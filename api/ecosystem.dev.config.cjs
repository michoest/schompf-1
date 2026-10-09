// Dev-Instanz auf dem Pi (Checkout ~/dev/schompf-dev, Branch dev)
module.exports = {
    apps: [{
        name: 'schompf-dev-api',
        script: 'src/server.js',
        env: {
            NODE_ENV: 'production',
            PORT: 3010,
        },
        exp_backoff_restart_delay: 100,
        max_memory_restart: '250M'
    }]
};
