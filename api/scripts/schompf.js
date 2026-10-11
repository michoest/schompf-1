#!/usr/bin/env node
/**
 * Werkzeug für die Arbeit an den Daten außerhalb der App.
 * Ausgaben gehen nach stdout, damit es auch per SSH funktioniert (scripts/pi.sh).
 *
 *   gericht <Name>                 Gericht als Datei ausgeben
 *   gerichte <Ordner>              alle Gerichte als Dateien in einen Ordner schreiben
 *   import <Datei|-> … [--probe]   Gericht(e) aus Datei(en) übernehmen (- = stdin); --probe zeigt nur die Änderungen
 *   uebersicht                     alle Gerichte als Tabelle (CSV)
 *   verlauf <Name>                 Änderungsprotokoll eines Gerichts
 *   person <Name>                  Person anlegen
 *   umbenennen <Alt> <Neu>         Person umbenennen
 *   code <Person> [Tage]           Anmeldecode für ein neues Gerät (Standard 1 Tag gültig)
 *   feedback [alle]                offene (bzw. alle) Anmerkungen
 *   erledigt <ID> [Notiz]          Anmerkung als erledigt markieren (ID-Anfang genügt)
 *   vapid                          neue Schlüssel für Benachrichtigungen (Zeilen für .env)
 *   geraete                        angemeldete Geräte
 *   abmelden <Geräte-ID>           Gerät abmelden
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { openDatabase } from '../src/db/index.js';
import { databasePath } from '../src/config.js';
import { getDish, listDishes, saveDish, getDishChanges, ValidationError } from '../src/repo/dishes.js';
import { dishToFile, fileToDish } from '../src/domain/dishFile.js';
import { dishOverviewCsv } from '../src/domain/overview.js';
import { createPerson, createPairingCode, listDevices, revokeDevice } from '../src/repo/auth.js';
import { listFeedback, resolveFeedback } from '../src/repo/feedback.js';
import webpush from 'web-push';

class Rollback extends Error {}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter(a => a.startsWith('--')));
const args = rest.filter(a => !a.startsWith('--'));
const db = openDatabase(databasePath());

const fileName = name => name.replace(/[\/\\:*?"<>|]/g, '-') + '.md';

try {
  switch (command) {
    case 'gericht': {
      const dish = getDish(db, args.join(' '));
      if (!dish) fail(`Gericht „${args.join(' ')}“ nicht gefunden`);
      process.stdout.write(dishToFile(dish));
      break;
    }
    case 'gerichte': {
      const dir = args[0] ?? fail('Ordner angeben');
      mkdirSync(dir, { recursive: true });
      const dishes = listDishes(db);
      for (const dish of dishes) writeFileSync(join(dir, fileName(dish.name)), dishToFile(dish));
      console.log(`${dishes.length} Gerichte nach ${dir} geschrieben`);
      break;
    }
    case 'import': {
      if (!args.length) fail('Datei angeben (oder - für stdin)');
      const dryRun = flags.has('--probe');
      for (const file of args) {
        const text = readFileSync(file === '-' ? 0 : file, 'utf8');
        const input = fileToDish(text);
        const label = input.name ?? file;
        if (dryRun) {
          // In einer Transaktion speichern und zurückrollen, um die Änderungen zu sehen
          let summary;
          try {
            db.transaction(() => { summary = saveDish(db, input, { source: 'import' }).summary; throw new Rollback(); })();
          } catch (e) { if (!(e instanceof Rollback)) throw e; }
          console.log(`${label}: ${summary || 'keine Änderungen'} (Probe, nichts gespeichert)`);
        } else {
          const { summary } = saveDish(db, input, { source: 'import' });
          console.log(`${label}: ${summary || 'keine Änderungen'}`);
        }
      }
      break;
    }
    case 'uebersicht':
      process.stdout.write(dishOverviewCsv(db, listDishes(db)));
      break;
    case 'verlauf': {
      const dish = getDish(db, args.join(' ')) ?? fail(`Gericht „${args.join(' ')}“ nicht gefunden`);
      for (const c of getDishChanges(db, dish.id)) console.log(`${c.at.slice(0, 16).replace('T', ' ')}  ${c.person ?? c.source}: ${c.summary}`);
      break;
    }
    case 'person':
      console.log('Angelegt:', createPerson(db, args.join(' ')).name);
      break;
    case 'umbenennen': {
      const [from, to] = args;
      if (!from || !to) fail('Aufruf: umbenennen <Alt> <Neu>');
      const changed = db.prepare('UPDATE persons SET name = ? WHERE name = ?').run(to, from).changes;
      console.log(changed ? `${from} heißt jetzt ${to}` : `Person „${from}“ nicht gefunden`);
      break;
    }
    case 'code': {
      const days = /^\d+$/.test(args.at(-1) ?? '') && args.length > 1 ? Number(args.pop()) : 1;
      const { code, person, expiresAt } = createPairingCode(db, args.join(' '), { hours: days * 24 });
      console.log(`Anmeldecode für ${person.name}: ${code} (gültig bis ${new Date(expiresAt).toLocaleString('de-DE')})`);
      break;
    }
    case 'feedback': {
      const items = listFeedback(db, { status: args[0] === 'alle' ? null : 'open' });
      if (!items.length) console.log('Keine offenen Anmerkungen');
      for (const f of items) {
        console.log(`[${f.id.slice(0, 8)}] ${f.createdAt.slice(0, 16).replace('T', ' ')}  ${f.person ?? '?'} → ${f.dishName ?? 'allgemein'}${f.status === 'done' ? '  (erledigt)' : ''}`);
        console.log(`    ${f.text.replace(/\n/g, '\n    ')}`);
        if (f.resolution) console.log(`    ✓ ${f.resolution}`);
      }
      break;
    }
    case 'erledigt': {
      const [id, ...note] = args;
      const f = resolveFeedback(db, id ?? '', { status: 'done', resolution: note.join(' ') || null });
      console.log(f ? `Erledigt: ${f.dishName ?? 'allgemein'} – ${f.text.slice(0, 60)}` : 'Anmerkung nicht gefunden');
      break;
    }
    case 'vapid': {
      const keys = webpush.generateVAPIDKeys();
      console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
      break;
    }
    case 'geraete':
      for (const d of listDevices(db)) console.log(`${d.id}  ${d.person} – ${d.name} (zuletzt ${d.last_seen_at?.slice(0, 16).replace('T', ' ') ?? '–'})`);
      break;
    case 'abmelden':
      console.log(revokeDevice(db, args[0]) ? 'Abgemeldet' : 'Gerät nicht gefunden');
      break;
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('\n').filter(l => l.startsWith(' *')).map(l => l.slice(3)).join('\n'));
  }
} catch (e) {
  if (e instanceof ValidationError) fail(e.messages.join('\n'));
  fail(e.message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

