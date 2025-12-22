import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Routes
import dishesRouter from './routes/dishes.js';
import productsRouter from './routes/products.js';
import vendorsRouter from './routes/vendors.js';
import categoriesRouter from './routes/categories.js';
import mealsRouter from './routes/meals.js';
import shoppingListRouter from './routes/shoppingList.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/dishes', dishesRouter);
app.use('/api/products', productsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/meals', mealsRouter);
app.use('/api/shopping-list', shoppingListRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Interner Serverfehler', details: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Nicht gefunden' });
});

app.listen(PORT, HOST, () => {
  console.log(`🍽️  Schompf Backend läuft auf http://${HOST}:${PORT}`);
});
