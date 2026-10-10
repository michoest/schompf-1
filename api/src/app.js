import express from 'express';
import cors from 'cors';
import { ValidationError, listDishes, getDish, saveDish, deleteDish, getDishChanges } from './repo/dishes.js';
import { listProducts, getProduct, saveProduct, deleteProduct } from './repo/products.js';
import { listMeals, getMeal, saveMeal, deleteMeal } from './repo/meals.js';
import { getStructure } from './repo/structure.js';
import { authenticate, pairDevice } from './repo/auth.js';

/** Express-App auf einer geöffneten Datenbank (Tests übergeben eine In-Memory-DB). */
export function createApp(db, { corsOrigins = ['http://localhost:5173'] } = {}) {
  const app = express();
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Anmeldung: Einmal-Code gegen Geräte-Token tauschen (einziger Endpunkt ohne Token)
  app.post('/api/auth/pair', (req, res) => {
    const { token, person, device } = pairDevice(db, req.body.code, req.body.deviceName);
    res.status(201).json({ token, person, device });
  });

  app.use('/api', (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const auth = authenticate(db, header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!auth) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.person = auth.person;
    req.device = auth.device;
    next();
  });

  app.get('/api/auth/me', (req, res) => res.json({ person: req.person, device: req.device }));
  app.get('/api/structure', (req, res) => res.json(getStructure(db)));

  // Produkte
  app.get('/api/products', (req, res) => res.json(listProducts(db)));
  app.get('/api/products/:id', (req, res) => sendOr404(res, getProduct(db, req.params.id)));
  app.post('/api/products', (req, res) => res.status(201).json(saveProduct(db, req.body)));
  app.put('/api/products/:id', (req, res) => sendOr404(res, saveProduct(db, req.body, req.params.id)));
  app.delete('/api/products/:id', (req, res) => res.status(deleteProduct(db, req.params.id) ? 204 : 404).end());

  // Gerichte
  app.get('/api/dishes', (req, res) => res.json(listDishes(db)));
  app.get('/api/dishes/:id', (req, res) => sendOr404(res, getDish(db, req.params.id)));
  app.get('/api/dishes/:id/changes', (req, res) => res.json(getDishChanges(db, req.params.id)));
  app.post('/api/dishes', (req, res) => {
    const { id, ...input } = req.body;
    res.status(201).json(saveDish(db, input, { source: 'app', personId: req.person.id }).dish);
  });
  app.put('/api/dishes/:id', (req, res) => {
    if (!getDish(db, req.params.id)) return res.status(404).json({ error: 'Gericht nicht gefunden' });
    res.json(saveDish(db, { ...req.body, id: req.params.id }, { source: 'app', personId: req.person.id }).dish);
  });
  app.delete('/api/dishes/:id', (req, res) => res.status(deleteDish(db, req.params.id) ? 204 : 404).end());

  // Mahlzeiten
  app.get('/api/meals', (req, res) => res.json(listMeals(db, { from: req.query.from, to: req.query.to })));
  app.get('/api/meals/:id', (req, res) => sendOr404(res, getMeal(db, req.params.id)));
  app.post('/api/meals', (req, res) => res.status(201).json(saveMeal(db, req.body, { personId: req.person.id })));
  app.put('/api/meals/:id', (req, res) => sendOr404(res, saveMeal(db, req.body, { id: req.params.id, personId: req.person.id })));
  app.delete('/api/meals/:id', (req, res) => res.status(deleteMeal(db, req.params.id) ? 204 : 404).end());

  app.use((req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.messages.join('; '), details: err.messages });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  });

  return app;
}

function sendOr404(res, value) {
  if (value == null) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(value);
}
