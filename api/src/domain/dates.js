// Datumsrechnung auf 'YYYY-MM-DD'-Strings (kalendarisch, ohne Zeitzonen-Verschiebung)

const toDate = s => new Date(`${s}T00:00:00Z`);
const fromDate = d => d.toISOString().slice(0, 10);

export function addDays(date, days) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

export function weekday(date) {
  return toDate(date).getUTCDay();
}

export function todayLocal(timeZone = 'Europe/Berlin') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Vorschlag für den nächsten Einkauf: vom nächsten Einkaufstag (ab heute, der noch nicht durch
 * einen Einkauf abgedeckt ist) bis zum Tag vor dem darauffolgenden Einkaufstag.
 *   Einkaufstage Mi + Sa: Di → Mi–Fr, Fr → Sa–Di, Sa → Sa–Di
 */
export function suggestTripRange(today, weekdays, coveredFroms = []) {
  if (!weekdays.length) return { date: today, coversFrom: today, coversTo: addDays(today, 3) };
  const covered = new Set(coveredFroms);
  let from = today;
  for (let i = 0; i < 21; i++) {
    const day = addDays(today, i);
    if (weekdays.includes(weekday(day)) && !covered.has(day)) { from = day; break; }
  }
  let to = addDays(from, 1);
  while (!weekdays.includes(weekday(to))) to = addDays(to, 1);
  return { date: from, coversFrom: from, coversTo: addDays(to, -1) };
}
