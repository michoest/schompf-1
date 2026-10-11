import { createHash, randomBytes, randomInt } from 'crypto';
import { newId, now } from '../db/index.js';
import { ValidationError } from './dishes.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne leicht verwechselbare Zeichen
const CODE_TTL_HOURS = 24;

const hash = token => createHash('sha256').update(token).digest('hex');

export function createPerson(db, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new ValidationError(['Name fehlt']);
  if (db.prepare('SELECT 1 FROM persons WHERE name = ?').get(trimmed)) throw new ValidationError([`Person „${trimmed}“ gibt es schon`]);
  const id = newId();
  db.prepare('INSERT INTO persons (id, name) VALUES (?, ?)').run(id, trimmed);
  return { id, name: trimmed };
}

export function listPersons(db) {
  return db.prepare('SELECT id, name FROM persons ORDER BY name').all();
}

/** Einmal-Code, mit dem sich ein Gerät dieser Person anmeldet (standardmäßig 24 h gültig). */
export function createPairingCode(db, personName, { hours = CODE_TTL_HOURS } = {}) {
  const person = db.prepare('SELECT id, name FROM persons WHERE name = ? OR id = ?').get(personName, personName);
  if (!person) throw new ValidationError([`Person „${personName}“ unbekannt`]);
  db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(now());
  const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
  db.prepare('INSERT INTO pairing_codes (code, person_id, expires_at) VALUES (?, ?, ?)').run(code, person.id, expiresAt);
  return { code, person, expiresAt };
}

/** Code gegen ein dauerhaftes Geräte-Token tauschen. Der Code ist danach verbraucht. */
export function pairDevice(db, code, deviceName) {
  return db.transaction(() => {
    const normalized = String(code ?? '').trim().toUpperCase();
    const row = db.prepare('SELECT * FROM pairing_codes WHERE code = ? AND expires_at >= ?').get(normalized, now());
    if (!row) throw new ValidationError(['Code ungültig oder abgelaufen']);
    db.prepare('DELETE FROM pairing_codes WHERE code = ?').run(normalized);
    const token = randomBytes(32).toString('base64url');
    const device = { id: newId(), name: String(deviceName ?? '').trim() || 'Gerät' };
    db.prepare('INSERT INTO devices (id, person_id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(device.id, row.person_id, device.name, hash(token), now(), now());
    const person = db.prepare('SELECT id, name FROM persons WHERE id = ?').get(row.person_id);
    return { token, device, person };
  })();
}

/** Token prüfen → { device, person } oder null. */
export function authenticate(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT d.id AS device_id, d.name AS device_name, d.last_seen_at, p.id AS person_id, p.name AS person_name
                          FROM devices d JOIN persons p ON p.id = d.person_id WHERE d.token_hash = ?`).get(hash(token));
  if (!row) return null;
  // last_seen höchstens alle 10 Minuten schreiben
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 600_000) {
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now(), row.device_id);
  }
  return { device: { id: row.device_id, name: row.device_name }, person: { id: row.person_id, name: row.person_name } };
}

export function listDevices(db) {
  return db.prepare(`SELECT d.id, d.name, p.name AS person, d.created_at, d.last_seen_at
                     FROM devices d JOIN persons p ON p.id = d.person_id ORDER BY p.name, d.created_at`).all();
}

export function revokeDevice(db, id) {
  return db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
}
