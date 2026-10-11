import { databasePath } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { startScheduler, pushConfigured } from './notifications.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];

const db = openDatabase(databasePath());
const app = createApp(db, { corsOrigins });

if (pushConfigured()) startScheduler(db);
else console.log('Benachrichtigungen aus (VAPID-Schlüssel fehlen)');

const server = app.listen(PORT, HOST, () => {
  console.log(`🍽️  Schompf Backend läuft auf http://${HOST}:${PORT} (${databasePath()})`);
});

// Sauber beenden, damit SQLite die WAL-Datei zurückschreibt
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
