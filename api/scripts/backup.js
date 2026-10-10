#!/usr/bin/env node
// Konsistente Kopie der SQLite-Datenbank (auch während der Server läuft): node scripts/backup.js <ziel>
import Database from 'better-sqlite3';
import { databasePath } from '../src/config.js';

const target = process.argv[2];
if (!target) { console.error('Ziel angeben'); process.exit(1); }
const db = new Database(databasePath(), { readonly: true });
await db.backup(target);
db.close();
