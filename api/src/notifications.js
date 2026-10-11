/**
 * Benachrichtigungen (Web-Push).
 *
 * Arten (pro Gerät abschaltbar):
 *   plan – jemand anderes hat geplant bzw. einen Einkauf erstellt
 *   prep – Vorbereitung fällig (z.B. „12 h vorher einweichen“), nachts vorgezogen auf 21 Uhr
 *   cook – zur Kochzeit der Mahlzeit (Slot-Zeit), Tipp öffnet das Rezept
 *   buy  – „Später kaufen“: am Tag, ab dem ein frisches Produkt gekauft werden sollte (ab 9 Uhr)
 *
 * dueNotifications() berechnet, was zu einem Zeitpunkt fällig ist (rein, testbar);
 * der Scheduler versendet das und merkt sich gesendete Schlüssel in notifications_sent.
 */
import webpush from 'web-push';
import { now as nowIso } from './db/index.js';
import { getCurrentTrip, buildTripList } from './repo/trips.js';
import { formatNumber } from './domain/units.js';

export const TYPES = ['plan', 'prep', 'cook', 'buy'];
const QUIET_START = 22;   // 22:00–07:00 keine Vorbereitungs-Erinnerungen
const QUIET_END = 7;
const QUIET_FALLBACK = 21; // stattdessen am Abend vorher um 21 Uhr
const COOK_WINDOW_MIN = 45; // Kochzeit-Erinnerung nur bis 45 Min. nach Slot-Zeit nachholen
const BUY_HOUR = 9;
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date, time) => new Date(`${date}T${time}:00`);
const dayLabel = date => DAYS[at(date, '12:00').getDay()];

// ---------------------------------------------------------------------------
// Was ist fällig?

export function dueNotifications(db, now = new Date()) {
  return [...duePreparations(db, now), ...dueCooking(db, now), ...dueLaterPurchases(db, now)];
}

function duePreparations(db, now) {
  const from = localDate(now);
  const to = localDate(new Date(now.getTime() + 4 * 86400_000));
  const meals = db.prepare(`SELECT m.id, m.date, m.servings, s.name AS slot_name, COALESCE(s.time, '12:00') AS time, d.id AS dish_id, d.name AS dish_name
                            FROM meals m JOIN dishes d ON d.id = m.dish_id JOIN meal_slots s ON s.id = m.slot_id
                            WHERE m.kind = 'dish' AND m.status = 'planned' AND m.date BETWEEN ? AND ?`).all(from, to);
  const prepsOf = db.prepare('SELECT text, lead_hours FROM dish_preparations WHERE dish_id = ? ORDER BY sort');
  const result = [];
  for (const meal of meals) {
    const mealAt = at(meal.date, meal.time);
    prepsOf.all(meal.dish_id).forEach((prep, index) => {
      const due = shiftOutOfQuietHours(new Date(mealAt.getTime() - prep.lead_hours * 3600_000));
      if (now >= due && now < mealAt) {
        result.push({
          key: `prep:${meal.id}:${index}`, type: 'prep',
          title: `Vorbereitung: ${meal.dish_name}`,
          body: `${prep.text} – für ${dayLabel(meal.date)} ${meal.slot_name}`,
          url: `/gericht/${meal.dish_id}?servings=${meal.servings}`,
        });
      }
    });
  }
  return result;
}

/** Erinnerungen, die nachts fällig wären, auf 21 Uhr am Abend davor vorziehen. */
export function shiftOutOfQuietHours(due) {
  const h = due.getHours();
  if (h >= QUIET_END && h < QUIET_START) return due;
  const shifted = new Date(due);
  if (h < QUIET_END) shifted.setDate(shifted.getDate() - 1);
  shifted.setHours(QUIET_FALLBACK, 0, 0, 0);
  return shifted;
}

function dueCooking(db, now) {
  const today = localDate(now);
  const meals = db.prepare(`SELECT m.id, m.servings, s.name AS slot_name, s.time, d.id AS dish_id, d.name AS dish_name, d.total_minutes
                            FROM meals m JOIN dishes d ON d.id = m.dish_id JOIN meal_slots s ON s.id = m.slot_id
                            WHERE m.kind = 'dish' AND d.kind != 'takeaway' AND m.status = 'planned' AND m.date = ? AND s.time IS NOT NULL`).all(today);
  return meals
    .filter(m => {
      const slotAt = at(today, m.time);
      return now >= slotAt && now < new Date(slotAt.getTime() + COOK_WINDOW_MIN * 60_000);
    })
    .map(m => ({
      key: `cook:${m.id}`, type: 'cook', silent: true,
      title: `${m.slot_name}: ${m.dish_name}`,
      body: [`${formatNumber(m.servings)} Portionen`, m.total_minutes ? `ca. ${m.total_minutes} Min.` : null].filter(Boolean).join(' · '),
      url: `/gericht/${m.dish_id}?servings=${m.servings}`,
    }));
}

function dueLaterPurchases(db, now) {
  if (now.getHours() < BUY_HOUR) return [];
  const trip = getCurrentTrip(db);
  if (!trip) return [];
  const today = localDate(now);
  const items = buildTripList(db, trip).items.filter(i => i.part === 'later' && i.state === 'open' && i.buyFrom && i.buyFrom <= today);
  if (!items.length) return [];
  const describe = i => {
    const meal = i.sources.find(s => s.type === 'meal');
    return `${i.name} ${i.display}${meal ? ` (für ${meal.dishName}, ${dayLabel(meal.date)})` : ''}`;
  };
  return [{
    key: `buy:${trip.id}:${today}`, type: 'buy',
    title: items.length === 1 ? `Heute kaufen: ${items[0].name}` : `Heute kaufen: ${items.length} Artikel`,
    body: items.map(describe).join(', '),
    url: '/einkauf',
  }];
}

// ---------------------------------------------------------------------------
// Versand

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured || !pushConfigured()) return configured;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://schompf.michoest.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/**
 * Nachricht an alle Geräte, die diese Art eingeschaltet haben.
 * exceptPersonId: Person, die die Änderung selbst gemacht hat (bekommt nichts).
 */
export async function sendPush(db, message, { exceptPersonId = null, deviceId = null } = {}) {
  if (!configure()) return 0;
  const subs = db.prepare(`SELECT s.endpoint, s.p256dh, s.auth, d.notify, d.person_id FROM push_subscriptions s
                           JOIN devices d ON d.id = s.device_id
                           WHERE (@deviceId IS NULL OR d.id = @deviceId)`).all({ deviceId });
  let sent = 0;
  for (const sub of subs) {
    if (exceptPersonId && sub.person_id === exceptPersonId) continue;
    if (!deviceId && JSON.parse(sub.notify)[message.type] === false) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.key ?? message.type, silent: !!message.silent }),
        { TTL: 6 * 3600 },
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      else console.error('Push fehlgeschlagen:', e.statusCode ?? e.message);
    }
  }
  return sent;
}

/** Fällige Erinnerungen jede Minute prüfen und einmalig versenden. */
export function startScheduler(db, { intervalMs = 60_000 } = {}) {
  const tick = async () => {
    try {
      for (const message of dueNotifications(db)) {
        const fresh = db.prepare('INSERT OR IGNORE INTO notifications_sent (key, sent_at) VALUES (?, ?)').run(message.key, nowIso()).changes;
        if (fresh) await sendPush(db, message);
      }
    } catch (e) {
      console.error('Benachrichtigungen:', e);
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}

/**
 * „X hat geplant“: Mahlzeiten-Änderungen einer Person sammeln und erst nach 10 Minuten Ruhe
 * eine einzige Nachricht an die anderen schicken.
 */
export function createPlanNotifier(db, { quietMs = 10 * 60_000 } = {}) {
  const pending = new Map(); // personId → { name, dates:Set, count, timer }
  function mealPlanned(person, date) {
    const entry = pending.get(person.id) ?? { name: person.name, dates: new Set(), count: 0, timer: null };
    entry.dates.add(date);
    entry.count++;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      pending.delete(person.id);
      const dates = [...entry.dates].sort();
      const range = dates.length === 1 ? `${dayLabel(dates[0])} ${dates[0].slice(8)}.${dates[0].slice(5, 7)}.` : `${dayLabel(dates[0])}–${dayLabel(dates.at(-1))}`;
      sendPush(db, { type: 'plan', key: `plan:${person.id}:${Date.now()}`, title: `${entry.name} hat geplant`, body: `${entry.count === 1 ? '1 Mahlzeit' : `${entry.count} Mahlzeiten`} für ${range}`, url: '/plan' }, { exceptPersonId: person.id });
    }, quietMs);
    entry.timer.unref?.(); // Prozess darf trotzdem beendet werden (Tests, Neustart)
    pending.set(person.id, entry);
  }
  function tripCreated(person, trip) {
    sendPush(db, { type: 'plan', key: `trip:${trip.id}`, title: `${person.name} hat einen Einkauf erstellt`, body: `für ${dayLabel(trip.coversFrom)}–${dayLabel(trip.coversTo)}`, url: '/einkauf' }, { exceptPersonId: person.id });
  }
  return { mealPlanned, tripCreated };
}
