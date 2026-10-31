#!/usr/bin/env node
/**
 * Dev-Instanz mit den Live-Daten auffrischen: node scripts/refresh-from-live.js <live.db> [--keep-auth <alte-dev.db>]
 *
 * Kopiert die Live-SQLite nach SQLITE_PATH (Server vorher stoppen). Logins der Live-Instanz werden verworfen;
 * mit --keep-auth bleiben die Geräte und Push-Abos der bisherigen Dev-DB (Person über den Namen zugeordnet),
 * damit man auf Dev angemeldet bleibt. Gesendete Erinnerungen werden geleert (Dev hat den Scheduler aus).
 */
import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'fs';
import { parseArgs } from 'util';
import { databasePath } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';

const { values: args, positionals } = parseArgs({ options: { 'keep-auth': { type: 'string' } }, allowPositionals: true });
const live = positionals[0];
if (!live || !existsSync(live)) { console.error('Live-Datenbank angeben'); process.exit(1); }

const target = databasePath();
for (const suffix of ['', '-wal', '-shm']) rmSync(target + suffix, { force: true });
const source = new Database(live, { readonly: true });
await source.backup(target);
source.close();

const db = openDatabase(target); // spielt neuere Migrationen ein, falls Dev weiter ist als Live
const prev = args['keep-auth'] && existsSync(args['keep-auth']) ? args['keep-auth'] : null;
if (prev) db.prepare('ATTACH DATABASE ? AS prev').run(prev); // ATTACH geht nicht innerhalb einer Transaktion
db.transaction(() => {
  db.exec('DELETE FROM push_subscriptions; DELETE FROM devices; DELETE FROM pairing_codes; DELETE FROM notifications_sent;');
  if (prev) {
    db.exec(`INSERT INTO devices (id, person_id, name, token_hash, created_at, last_seen_at, notify)
             SELECT d.id, p.id, d.name, d.token_hash, d.created_at, d.last_seen_at, d.notify
             FROM prev.devices d JOIN prev.persons pp ON pp.id = d.person_id JOIN main.persons p ON p.name = pp.name`);
    db.exec(`INSERT INTO push_subscriptions (endpoint, device_id, p256dh, auth, created_at)
             SELECT s.endpoint, s.device_id, s.p256dh, s.auth, s.created_at FROM prev.push_subscriptions s
             WHERE s.device_id IN (SELECT id FROM main.devices)`);
  }
})();
if (prev) db.exec('DETACH DATABASE prev');

const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
console.log(`Live-Daten übernommen: ${count('meals')} Mahlzeiten, ${count('dishes')} Gerichte, ${count('shopping_trips')} Einkäufe; ${count('devices')} Dev-Geräte behalten`);
db.close();
