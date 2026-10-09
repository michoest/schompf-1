# Schompf – Zielbild

Stand: 2026-10-09. Ergebnis des Reviews (#8). Fachliche Logik zuerst, Technik folgt daraus.

## Zweck

Ein Haushalt (zwei Personen) plant alle Mahlzeiten; der Einkauf ergibt sich daraus, im Laden wird nur noch abgehakt, beim Kochen ist das Rezept direkt in der App.

## Ablauf (alle 3–4 Tage, Einkaufstage Mi + Sa)

1. **Planen** (zu Hause): Für jede Mahlzeit bis zum nächsten Einkaufstag ein Gericht wählen → Liste erstellen.
2. **Vorrat prüfen** (zu Hause, sortiert nach Lagerort): abhaken, was noch da ist.
3. **Einkaufen** (Markt-Stände, dann Rewe; beide Handys, live): abhaken, was in den Wagen kommt.
4. **Kochen** (über den Tag): „Heute“ ansehen, Rezept in der App öffnen.

## Datenmodell (fachlich)

**Stammdaten**
- **Person**: Name; ein oder mehrere Geräte, jedes per eigenem Login-Link (kein Passwort).
- **Laden**: Name, Farbe, **Abschnitte** in Lauf-Reihenfolge (Markt: Stände). Jeder Abschnitt fasst Warengruppen zusammen. Einmal einrichten, nicht im Alltag ändern.
- **Warengruppe** (~25): Lagerort, bevorzugter Laden, Ausweichladen.
- **Lagerort**: Kühlschrank, Speisekammer, Gewürzregal, Obstkorb, Brotkasten, Tiefkühler (Reihenfolge = Weg durch die Küche).
- **Produkt**: Name (Schatzisch), übliche Einheit, Warengruppe, optional Laden-Ausnahme, *Grundvorrat* ja/nein, optional Haltbarkeit in Tagen (nur wenige Produkte, z.B. Hackleisch).
- **Einheiten**: feste Liste mit Umrechnung (g/kg, ml/l, Stück, EL, TL, Zehe, Bund, Packung, Dose, Prise, Scheibe); Singular/Plural gleich, ohne Einheit = Stück.

**Gerichte**
- **Gericht**: Name, Art (*Kochen* / *Fertig kaufen* / *Holen*), Status (aktiv / Entwurf), Grundportionen, Kategorien (Dels, Lat, Toffels, …), Quell-Link.
  - **Zutaten**: Produkt, Menge, Einheit, optional ja/nein.
  - **Bestandteile/Beilagen**: andere Gerichte mit Mengenfaktor, fest (immer dabei, z.B. Runch → Meladenrot mit Ei) oder optional (Auswahl, z.B. Rillen → Toffellat, …).
  - **Rezept**: Schritte; **Vorbereitungen** mit Vorlauf (z.B. „12 h vorher einweichen“).
  - **Änderungsprotokoll**: Mengen-Feedback beim Kochen ändert das Gericht sofort, mit Datum.
  - *Holen*-Gerichte haben keine Zutaten (optional „wo“), erzeugen keinen Einkauf.

**Planung**
- **Mahlzeit**: Datum + Slot, Inhalt = *Gericht* (Portionen, gewählte Beilagen, weggelassene optionale Zutaten) | *Reste* | *Freitext* (Einmaliges, Unentschiedenes, Besuch). Nur Gerichte mit Zutaten erzeugen Bedarf.
  Status geplant → zubereitet; wer hat eingetragen.
- **Slots**: Frühstück 8, Mittag 12, Abend 17 Uhr.

**Einkauf**
- **Einkauf**: Datum, abgedeckter Zeitraum (bis zum nächsten Einkaufstag), Phase (planen → Vorrat prüfen → einkaufen → erledigt), erstellt von. Vergangene Einkäufe bleiben erhalten.
- **Bedarf**: immer aus dem Plan berechnet, nie gespeichert. Pro Produkt genau eine Zeile; Planänderungen wirken sofort.
- **Eingriff** (pro Einkauf × Produkt): Zustand (offen / vorrätig / im Wagen / nicht nötig), geänderte Menge, „gibt's hier nicht“ (→ Ausweichladen); wer, wann.
- **Freier Artikel**: gehört zu einem Einkauf – oder zur **Merkliste „bei Gelegenheit“** eines Ladens (bleibt über Einkäufe hinweg, z.B. Waschmittel bei dm).
- **Grundvorrat** erscheint beim Vorrat-Check zusammengeklappt am Ende, vorab als vorrätig markiert; man tippt nur an, was fehlt.
- **Später kaufen**: Produkte mit Haltbarkeit, die zum Einkaufsdatum zu früh wären, stehen im Abschnitt „Später kaufen – ab <Tag>“ (+ Erinnerung an dem Tag).

**Übernahme der bisherigen Daten**
- Kategorien → Warengruppen (Vorschlag, dann Korrektur); Läden neu mit Rewe-Struktur.
- Alle Mahlzeiten bleiben; Freitext „Reste…“ → *Reste*.
- Ner → *Holen* (ohne Zutat); Coli → *Fertig kaufen*; Kelhuhn → Entwurf; Picknick wird gelöscht; `published` → Status.
- Leischküchle bekommt Toffellat als optionale Beilage.
- Alte Einkaufsliste wird nicht übernommen, nur noch offene manuelle Artikel als freie Artikel.

## Benachrichtigungen

- Die andere Person hat geplant bzw. die Liste erstellt.
- Vorbereitung am Vortag (aus den Vorbereitungen der geplanten Gerichte).
- „Später kaufen“: am Tag, ab dem ein frisches Produkt gekauft werden sollte.
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
| Butter | Rewe | Kühlschrank |
| Eier | Rewe | Kühlschrank |
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

**Rewe-Abschnitte** (Lauf-Reihenfolge): 1 Gemüse · 2 Obst · 3 Rest (Trockensortiment) · 4 Wurst/Käse (Kühlregal) · 5 Milch · 6 Eier · 7 Wursttheke (Wurst & Schinken, Fleisch) · 8 Butter · 9 Süßes · 10 Tiefkühl · 11 Haushalt · 12 Getränke.

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
