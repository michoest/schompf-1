import express from 'express';
import cors from 'cors';
import { ValidationError, listDishes, getDish, saveDish, deleteDish, getDishChanges } from './repo/dishes.js';
import { listProducts, getProduct, saveProduct, deleteProduct } from './repo/products.js';
import { listMeals, getMeal, saveMeal, deleteMeal } from './repo/meals.js';
import { getStructure } from './repo/structure.js';
import { authenticate, pairDevice } from './repo/auth.js';
import {
  suggestTrip, getTrip, getCurrentTrip, listTrips, createTrip, updateTrip, buildTripList,
  setTripItem, addFreeItem, updateFreeItem, deleteFreeItem, syncMealToTrip, previewMealSync,
} from './repo/trips.js';
import { createEventHub } from './events.js';
import { addFeedback, listFeedback, resolveFeedback } from './repo/feedback.js';
import { TYPES, pushConfigured, sendPush, createPlanNotifier } from './notifications.js';

/** Express-App auf einer geöffneten Datenbank (Tests übergeben eine In-Memory-DB). */
export function createApp(db, { corsOrigins = ['http://localhost:5173'] } = {}) {
  const app = express();
  const events = createEventHub();
  app.locals.events = events;
  const planNotifier = createPlanNotifier(db);
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
    // EventSource kann keine Header setzen → für /api/events Token als Query-Parameter
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.path === '/events' ? req.query.token : null);
    const auth = authenticate(db, token);
    if (!auth) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.person = auth.person;
    req.device = auth.device;
    next();
  });

  // Jede erfolgreiche Änderung an alle Geräte melden
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET') {
      const scope = req.path.split('/')[1];
      res.on('finish', () => {
        if (res.statusCode < 400) events.publish({ scope, by: req.person.name, deviceId: req.device.id });
      });
    }
    next();
  });

  app.get('/api/events', (req, res) => events.subscribe(req, res, req));

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
  // syncTrip: Einkaufsliste ausdrücklich mitändern (sonst bleibt sie, wie sie ist)
  app.post('/api/meals/preview', (req, res) => {
    const { id = null, remove = false, ...input } = req.body;
    res.json(previewMealSync(db, input, { id, remove, saveMeal }));
  });
  app.post('/api/meals', (req, res) => {
    const { syncTrip, ...input } = req.body;
    let meal = saveMeal(db, input, { personId: req.person.id });
    if (syncTrip) { syncMealToTrip(db, meal.id); meal = getMeal(db, meal.id); }
    planNotifier.mealPlanned(req.person, meal.date);
    res.status(201).json(meal);
  });
  app.put('/api/meals/:id', (req, res) => {
    const { syncTrip, ...input } = req.body;
    const meal = saveMeal(db, input, { id: req.params.id, personId: req.person.id });
    if (meal && syncTrip) syncMealToTrip(db, meal.id);
    sendOr404(res, meal && getMeal(db, meal.id));
  });
  app.delete('/api/meals/:id', (req, res) => {
    if (req.query.syncTrip === '1') syncMealToTrip(db, req.params.id, { remove: true });
    res.status(deleteMeal(db, req.params.id) ? 204 : 404).end();
  });

  // Einkäufe
  app.get('/api/trips/suggestion', (req, res) => res.json(suggestTrip(db)));
  app.get('/api/trips', (req, res) => res.json(listTrips(db)));
  app.get('/api/trips/current', (req, res) => {
    const trip = getCurrentTrip(db);
    res.json(trip ? buildTripList(db, trip) : null);
  });
  app.get('/api/trips/:id', (req, res) => {
    const trip = getTrip(db, req.params.id);
    sendOr404(res, trip && buildTripList(db, trip));
  });
  app.post('/api/trips', (req, res) => {
    const trip = createTrip(db, req.body, req.person.id);
    planNotifier.tripCreated(req.person, trip);
    res.status(201).json(buildTripList(db, trip));
  });
  app.put('/api/trips/:id', (req, res) => {
    const trip = updateTrip(db, req.params.id, req.body);
    sendOr404(res, trip && buildTripList(db, trip));
  });
  app.put('/api/trips/:id/items/:productId/:part', (req, res) =>
    sendOr404(res, setTripItem(db, req.params.id, req.params.productId, req.params.part, req.body, req.person.id)));
  app.post('/api/trips/:id/free-items', (req, res) =>
    res.status(201).json(addFreeItem(db, { ...req.body, tripId: req.params.id, storeId: null }, req.person.id)));

  // Freie Artikel / Merkliste („bei Gelegenheit“, an einen Laden gebunden)
  app.post('/api/free-items', (req, res) => res.status(201).json(addFreeItem(db, { ...req.body, tripId: null }, req.person.id)));
  app.put('/api/free-items/:id', (req, res) => sendOr404(res, updateFreeItem(db, req.params.id, req.body)));
  app.delete('/api/free-items/:id', (req, res) => res.status(deleteFreeItem(db, req.params.id) ? 204 : 404).end());

  // Anmerkungen (Feedback) zu Gerichten oder allgemein
  app.get('/api/feedback', (req, res) => res.json(listFeedback(db, { status: req.query.status ?? null, dishId: req.query.dishId ?? null })));
  app.post('/api/feedback', (req, res) => res.status(201).json(addFeedback(db, req.body, req.person.id)));
  app.put('/api/feedback/:id', (req, res) => sendOr404(res, resolveFeedback(db, req.params.id, req.body)));

  // Benachrichtigungen (Web-Push) dieses Geräts
  app.get('/api/push/config', (req, res) => {
    const device = db.prepare('SELECT notify FROM devices WHERE id = ?').get(req.device.id);
    const subscribed = db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE device_id = ?').get(req.device.id).n > 0;
    res.json({ enabled: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null, subscribed, settings: JSON.parse(device.notify) });
  });
  app.post('/api/push/subscribe', (req, res) => {
    const { endpoint, keys } = req.body.subscription ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new ValidationError(['Abo unvollständig']);
    db.prepare(`INSERT INTO push_subscriptions (endpoint, device_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(endpoint, req.device.id, keys.p256dh, keys.auth, new Date().toISOString());
    res.status(201).json({ subscribed: true });
  });
  app.delete('/api/push/subscribe', (req, res) => {
    db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(req.device.id);
    res.status(204).end();
  });
  app.put('/api/push/settings', (req, res) => {
    const current = JSON.parse(db.prepare('SELECT notify FROM devices WHERE id = ?').get(req.device.id).notify);
    for (const type of TYPES) if (type in req.body) current[type] = !!req.body[type];
    db.prepare('UPDATE devices SET notify = ? WHERE id = ?').run(JSON.stringify(current), req.device.id);
    res.json(current);
  });
  app.post('/api/push/test', async (req, res, next) => {
    try {
      const sent = await sendPush(db, { type: 'test', key: 'test', title: 'Schompf', body: 'So sehen Benachrichtigungen aus.', url: '/kochen' }, { deviceId: req.device.id });
      res.json({ sent });
    } catch (e) { next(e); }
  });

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
