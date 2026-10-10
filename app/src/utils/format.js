// Anzeige-Helfer (Datum, Mengen) – Mengen spiegeln die Logik der API (domain/units.js)

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const DAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const toDate = s => new Date(`${s}T00:00:00`)
const pad = n => String(n).padStart(2, '0')

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date, days) {
  const d = toDate(date)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export function today() {
  return isoDate()
}

/** „Mi 14.10.“ */
export function shortDate(date) {
  const d = toDate(date)
  return `${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`
}

/** „Heute“, „Morgen“, sonst „Mittwoch, 14.10.“ */
export function longDate(date) {
  if (date === today()) return 'Heute'
  if (date === addDays(today(), 1)) return 'Morgen'
  if (date === addDays(today(), -1)) return 'Gestern'
  const d = toDate(date)
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`
}

export function weekdayShort(date) {
  return DAYS[toDate(date).getDay()]
}

/** Montag der Woche */
export function mondayOf(date) {
  const d = toDate(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}

export function formatNumber(value) {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

/** Menge mit Einheit; units = structure.units (code, singular, plural) */
export function formatAmount(amount, unitCode, units = []) {
  if (amount == null) return 'nach Bedarf'
  let value = amount
  let code = unitCode
  if (code === 'g' && amount >= 1000) { value = amount / 1000; code = 'kg' }
  if (code === 'ml' && amount >= 1000) { value = amount / 1000; code = 'l' }
  if (code === 'Stück') return formatNumber(value)
  const unit = units.find(u => u.code === code)
  const label = unit ? (value === 1 ? unit.singular : unit.plural) : code
  return `${formatNumber(value)} ${label}`
}

export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(',', '.')
  if (t.includes('/')) {
    const [a, b] = t.split('/').map(Number)
    return b ? a / b : NaN
  }
  return t === '' ? null : Number(t)
}
