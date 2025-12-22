import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default database structure
const defaultData = {
  dishes: [],
  products: [],
  vendors: [],
  categories: [],
  meals: [],
  settings: {
    defaultServings: 2,
    mealSlots: [
      { id: 'breakfast', name: 'Frühstück', order: 0 },
      { id: 'lunch', name: 'Mittagessen', order: 1 },
      { id: 'dinner', name: 'Abendessen', order: 2 }
    ],
    shoppingDays: ['wednesday', 'saturday'],
    defaultFreshnessDays: 7
  }
};

// Ensure data directory exists
const dbPath = process.env.DB_PATH || join(__dirname, '../../data/db.json');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, defaultData);

// Read data from file
await db.read();

// If file is empty, write defaults
if (!db.data) {
  db.data = defaultData;
  await db.write();
}

// Ensure all collections exist
const collections = ['dishes', 'products', 'vendors', 'categories', 'meals'];
for (const collection of collections) {
  if (!db.data[collection]) {
    db.data[collection] = [];
  }
}
if (!db.data.settings) {
  db.data.settings = defaultData.settings;
}
await db.write();

export default db;
