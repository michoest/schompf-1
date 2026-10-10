import dotenv from 'dotenv';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(API_DIR, '.env'), quiet: true });

/** Pfad der SQLite-Datei (SQLITE_PATH, relativ zum api-Ordner), Standard data/schompf.db. */
export function databasePath() {
  const path = process.env.SQLITE_PATH || 'data/schompf.db';
  return isAbsolute(path) || path === ':memory:' ? path : join(API_DIR, path);
}
