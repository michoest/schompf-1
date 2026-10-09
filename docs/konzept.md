# Schompf – Zielbild

Stand: 2026-10-09. Ergebnis des Reviews (#8). Fachliche Logik zuerst, Technik folgt daraus.

## Zweck

Ein Haushalt (zwei Personen) plant alle Mahlzeiten; der Einkauf ergibt sich daraus, im Laden wird nur noch abgehakt, beim Kochen ist das Rezept direkt in der App.

## Ablauf (alle 3–4 Tage, Einkaufstage Mi + Sa)

1. **Planen** (zu Hause): Für jede Mahlzeit bis zum nächsten Einkaufstag ein Gericht wählen → Liste erstellen.
2. **Vorrat prüfen** (zu Hause, sortiert nach Lagerort): abhaken, was noch da ist.
3. **Einkaufen** (Markt-Stände, dann Rewe; beide Handys, live): abhaken, was in den Wagen kommt.
4. **Kochen** (über den Tag): „Heute“ ansehen, Rezept in der App öffnen.

## Fachliche Begriffe

- **Mahlzeit**: Datum + Slot (Frühstück/Mittag/Abend), entweder *Gericht* (Portionen, Beilagen, weggelassene optionale Zutaten) oder *Eintrag ohne Einkauf* (bestellt, auswärts, Fertiggericht, Besuch, Reste). Status: geplant → zubereitet.
- **Einkauf**: ein Einkaufstag, deckt die Mahlzeiten bis zum nächsten Einkaufstag ab. Phasen: planen → Vorrat prüfen → einkaufen → erledigt.
- **Einkaufsliste**: wird aus dem Plan *berechnet* (nicht fortgeschrieben). Gespeichert werden nur Eingriffe pro Produkt und Einkauf:
  Zustand (offen / vorrätig / im Wagen / nicht nötig), Mengen-Override, „gibt's hier nicht“ (→ Ausweichladen).
  Pro Produkt genau eine Zeile; Planänderungen wirken sofort.
- **Freie Artikel**: gehören zu einem Einkauf – oder auf die **Merkliste „bei Gelegenheit“** (pro Laden, bleibt über Einkäufe hinweg, z.B. Waschmittel bei dm).
- **Produkt**: Name (Schatzisch), Einheit, Warengruppe, optional Laden-Ausnahme, optional *Grundvorrat* (Salz, Öl, …).
- **Warengruppe** (~25, ändert sich praktisch nie): bestimmt Lagerort zu Hause sowie bevorzugten Laden und Ausweichladen.
- **Laden**: hat eigene Abschnitte in Lauf-Reihenfolge, jeder Abschnitt fasst Warengruppen zusammen. Wird einmal eingerichtet, nicht im Alltag geändert.
- **Gericht**: Zutaten (Produkt, Menge, Einheit, optional), Beilagen, Portionen, Rezept (Schritte), Vorbereitungen mit Vorlauf (z.B. „12 h vorher einweichen“).
  Mengen-Feedback beim Kochen ändert das Gericht sofort; Änderungen werden mit Datum festgehalten.
- **Person/Gerät**: jedes Gerät ist einer Person zugeordnet (Link/QR, kein Passwort).

## Benachrichtigungen

- Die andere Person hat geplant bzw. die Liste erstellt.
- Vorbereitung am Vortag (aus den Vorbereitungen der geplanten Gerichte).
- Stumm zu den Kochzeiten 8, 12, 17 Uhr, Tipp öffnet das Rezept.

## Warengruppen

| Warengruppe | Zuerst → sonst | Lagerort |
|---|---|---|
| Gemüse | Markt Gemüsestand → Rewe | Kühlschrank |
| Salat & frische Kräuter | Markt Gemüsestand → Rewe | Kühlschrank |
| Pilze | Markt Gemüsestand → Rewe | Kühlschrank |
| Obst | Markt Gemüsestand → Rewe | Obstkorb |
| Kartoffeln & Zwiebeln | Markt Kartoffelstand → Rewe | Speisekammer |
| Brot & Brötchen | Schäfer → Rewe | Brotkasten |
| Fleisch | Markt Metzger → Rewe | Kühlschrank |
| Wurst & Schinken | Markt Metzger → Rewe | Kühlschrank |
| Käse | Markt Käsestand → Rewe | Kühlschrank |
| Frischkäse & Quark | Markt Frischkäsestand → Rewe | Kühlschrank |
| Milch, Sahne & Joghurt | Rewe | Kühlschrank |
| Butter & Eier | Rewe | Kühlschrank |
| Tiefkühl | Rewe | Tiefkühler |
| Nudeln, Reis & Getreide | Rewe | Speisekammer |
| Backzutaten | Rewe | Speisekammer |
| Konserven | Rewe | Speisekammer |
| Öl & Essig | Rewe | Speisekammer |
| Gewürze & Salz | Rewe | Gewürzregal |
| Saucen, Brühe & Würzmittel | Rewe | Speisekammer |
| Nüsse & Saaten | Rewe | Speisekammer |
| Frühstück & Aufstrich | Rewe | Speisekammer |
| Süßes & Snacks | Rewe | Speisekammer |
| Getränke | Rewe | Speisekammer |
| Drogerie & Haushalt | dm (Merkliste) | – |

**Rewe-Abschnitte** (Lauf-Reihenfolge): 1 Gemüse · 2 Obst · 3 Rest (Trockensortiment) · 4 Wurst/Käse (Kühlregal) · 5 Milch · 6 Wursttheke (Wurst & Schinken, Fleisch) · 7 Süßes · 8 Haushalt · 9 Getränke.
Offen: Lage von Butter & Eier und Tiefkühl.

**Markt**: einzelne Stände, Reihenfolge wie bisher in der App.

## Technik (folgt aus dem Obigen)

- SQLite auf dem Pi (eine Datei, Transaktionen statt verlorener Änderungen), Datenbank ist die einzige Quelle.
- Bearbeiten außerhalb der UI: Export/Import einzelner Gerichte als Datei, Übersicht aller Gerichte als Tabelle; Claude liest/schreibt direkt.
- Live-Sync per Server-Sent Events; Web-Push vom Pi (iPhone: PWA auf dem Home-Bildschirm).

## Etappen

1. Fundament: SQLite, Datenübernahme, Personen/Geräte, Export/Import, Tests.
2. Einkauf neu: berechnete Liste, Zustände, Warengruppen/Läden/Ausweichladen, Merkliste, schnelle Eingabe, Live-Sync, Rewe-Umbau. (#1, #2, #3, #6)
3. Kochen: „Heute“, Rezeptstruktur mit Vorbereitungen, Mengen-Feedback, alle Rezepte übernehmen, Schatzisch vereinheitlichen. (#5)
4. Benachrichtigungen. (#7)

Entwicklung auf Branch `dev`, Test auf schompf-dev.michoest.com mit Kopie der Live-Daten; Produktion bleibt bis zum Umstieg unverändert.
