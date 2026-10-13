import { databasePath } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { startScheduler, pushConfigured } from './notifications.js';

const PORT = process.env.PORT || 3000;
// Nur lokal lauschen: Caddy (auf demselben Rechner) ist der einzige Weg von außen
const HOST = process.env.HOST || '127.0.0.1';
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];

const db = openDatabase(databasePath());
const app = createApp(db, { corsOrigins });

// SCHEDULER=off (z.B. Dev-Instanz): keine automatischen Erinnerungen, Test-Nachrichten gehen trotzdem
if (process.env.SCHEDULER === 'off') console.log('Erinnerungen aus (SCHEDULER=off)');
else if (pushConfigured()) startScheduler(db);
else console.log('Benachrichtigungen aus (VAPID-Schlüssel fehlen)');

const server = app.listen(PORT, HOST, () => {
  console.log(`🍽️  Schompf Backend läuft auf http://${HOST}:${PORT} (${databasePath()})`);
});

// Sauber beenden, damit SQLite die WAL-Datei zurückschreibt
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
