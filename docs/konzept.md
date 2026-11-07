# Schompf – Zielbild

Stand: 2026-11-07 (ursprünglich 2026-10-09, Review #8). Fachliche Logik zuerst, Technik folgt daraus.

## Zweck

Ein Haushalt (zwei Personen) plant alle Mahlzeiten; der Einkauf ergibt sich daraus, im Laden wird nur noch abgehakt, beim Kochen ist das Rezept direkt in der App.

## Ablauf (alle 3–4 Tage, Einkaufstage Mi + Sa)

1. **Planen** (zu Hause): Für jede Mahlzeit bis zum nächsten Einkaufstag ein Gericht wählen → **Aus Plan holen** (bis zu einem Tag).
2. **Vorrat prüfen** (zu Hause, sortiert nach Aufbewahrung): abhaken, was noch da ist.
3. **Einkaufen** (maison de fruits, Metzgerei Klein, Rewe, Bäckerei Schäfer, dm; beide Handys, live): abhaken, was in den Wagen kommt → **Einkauf fertig**.
4. **Kochen** (über den Tag): „Kochen“ ansehen, Rezept in der App öffnen, als zubereitet markieren.

## Datenmodell (fachlich)

**Stammdaten**
- **Person**: Name; ein oder mehrere Geräte, jedes per eigenem Login-Link (kein Passwort).
- **Laden**: Name, Farbe, **Abschnitte** in Lauf-Reihenfolge. Einmal einrichten, nicht im Alltag ändern.
- **Warengruppe** (~25): Einordnung der Produkte und **Vorschlag** beim Anlegen (Laden, Abschnitt, Ausweichladen, Aufbewahrung) – danach gilt, was am Produkt steht.
- **Lagerort**: Kühlschrank, Speisekammer, Gewürzregal, Obstkorb, Brotkasten, Tiefkühler (Reihenfolge = Weg durch die Küche).
- **Produkt**: Name (Schatzisch), übliche Einheit, Warengruppe, **Laden + Abschnitt, Ausweichladen, Aufbewahrung** (ausdrücklich pro Produkt – Frischkäse kann woanders herkommen als Käse),
  *Grundvorrat* ja/nein, optional Haltbarkeit in Tagen (nur wenige Produkte, z.B. Hackleisch). Pflege in der App (Produkte) oder als Excel-Tabelle.
- **Einheiten**: feste Liste mit Umrechnung (g/kg, ml/l, Stück, EL, TL, Zehe, Bund, Packung, Dose, Prise, Scheibe); Singular/Plural gleich, ohne Einheit = Stück.

**Gerichte**
- **Gericht**: Name, Art (*Kochen* / *Fertig kaufen* / *Holen*), Status (aktiv / Entwurf), Grundportionen, Kategorien (Dels, Lat, Toffels, …), Quell-Link,
  optional **Zuschlag beim Einkaufen** in % (z.B. 10 % Naschteig bei Kuchen; nur die Einkaufsliste rechnet ihn drauf, Rezeptmengen bleiben).
  - **Zutaten** (Mengen pro Portion): Produkt, Menge, Einheit; optional mit Standard „meist dabei“ oder „manchmal“ – beim Planen ist der Standard vorausgewählt, die Mahlzeit speichert nur Abweichungen.
  - **Bestandteile/Beilagen**: andere Gerichte mit Mengenfaktor, fest (immer dabei, z.B. Runch → Meladenrot mit Ei) oder optional (Auswahl, z.B. Rillen → Toffellat, …).
  - **Rezept**: Schritte mit Mengen-Platzhaltern `{Zutat}` bzw. `{Zutat, 1/2}` (Menge für die geplanten Portionen; beim Speichern geprüft, Umbenennen zieht mit); **Vorbereitungen** mit Vorlauf (z.B. „12 h vorher einweichen“).
  - **Änderungsprotokoll**: Mengen-Feedback beim Kochen ändert das Gericht sofort, mit Datum.
  - *Holen*-Gerichte haben keine Zutaten (optional „wo“), erzeugen keinen Einkauf.

**Planung**
- **Mahlzeit**: Datum + Slot, Inhalt = *Gericht* (Portionen, gewählte Beilagen, weggelassene optionale Zutaten) | *Reste* | *Freitext* (Einmaliges, Unentschiedenes, Besuch). Nur Gerichte mit Zutaten erzeugen Bedarf.
  Status geplant → zubereitet; wer hat eingetragen.
- **Slots**: Frühstück 8, Mittag 12, Abend 17 Uhr (Uhrzeiten nur für Erinnerungen, nicht in der Oberfläche).
- **Kochen**: Die Kochansicht zeigt die geplanten (= eingekauften) Portionen; Umstellen ist möglich, wird aber deutlich als Abweichung markiert.

**Einkaufsliste** (durchgehend, seit 2026-10-27)
- Es gibt immer genau **eine Einkaufsliste**. Was draufsteht, bleibt, bis es erledigt ist – nichts verschwindet nebenbei.
- **Aus Plan holen** (ausdrücklich, bis zu einem Tag): Gerichte ab heute, die noch nicht auf der Liste stehen und nicht zubereitet sind, kommen drauf;
  ihr Bedarf (Mengen pro Portion × Portionen, Zuschlag) wird dabei **eingefroren**. Spätere Planänderungen ändern die Liste nur, wenn man es beim
  Bearbeiten der Mahlzeit ausdrücklich wählt; neu Hinzugekommenes ist „neu“ markiert.
- Pro Produkt eine Zeile mit Zustand (offen / vorrätig / im Wagen / nicht nötig), geänderter Menge, „gibt's hier nicht“ (→ Ausweichladen); wer, wann.
- **Einkauf fertig**: Im Wagen, vorrätig oder „nicht nötig“ ist erledigt und verschwindet. Alles Offene (samt geänderter Menge) bleibt auf der Liste.
  Intern ist jeder Einkauf eine „Runde“; vergangene Runden bleiben erhalten.
- Kommt neuer Bedarf auf eine schon erledigte Zeile (z.B. weiteres Gericht mit Ghetti, die schon im Wagen sind), steht die Zeile mit dem neuen Bedarf wieder offen da.
- **Zubereitet** oder **Mahlzeit gelöscht**: Die App fragt, ob die noch offenen Zutaten dieses Essens von der Liste sollen (nur ihr Anteil; Gekauftes bleibt).
  Verschieben lässt die Liste unverändert.
- **Heute woanders kaufen**: Laden/Abschnitt einer Zeile nur für die laufende Runde ändern (Menü oder lange drücken und ziehen); danach gilt wieder der Ort am Produkt.
- **Freier Artikel** (von Hand oder von Kairos/Claude): steht auf der Liste, lässt sich in Laden und Abschnitt einsortieren; exakter Produktname zählt beim Produkt mit.
  Oder auf der **Merkliste „bei Gelegenheit“** eines Ladens (bleibt über Einkäufe hinweg, z.B. Waschmittel bei dm).
- **Grundvorrat** erscheint beim Vorrat-Check zusammengeklappt am Ende, vorab als vorrätig markiert; man tippt nur an, was fehlt.
- **Später kaufen**: Produkte mit Haltbarkeit stehen bis zu ihrem Kauftag unter „Später kaufen – ab <Tag>“ und ab dann von selbst in der normalen Liste (+ Erinnerung an dem Tag).

**Übernahme der bisherigen Daten**
- Kategorien → Warengruppen (Vorschlag, dann Korrektur); Läden neu mit Rewe-Struktur.
- Alle Mahlzeiten bleiben; Freitext „Reste…“ → *Reste*.
- Ner → *Holen* (ohne Zutat); Coli → *Fertig kaufen*; Kelhuhn → Entwurf; Picknick wird gelöscht; `published` → Status.
- Leischküchle bekommt Toffellat als optionale Beilage.
- Alte Einkaufsliste wird nicht übernommen, nur noch offene manuelle Artikel als freie Artikel.

## Benachrichtigungen

- Die andere Person hat geplant bzw. Gerichte aus dem Plan auf die Liste geholt.
- Vorbereitung am Vortag (aus den Vorbereitungen der geplanten Gerichte).
- „Später kaufen“: am Tag, ab dem ein frisches Produkt gekauft werden sollte.
- Stumm zu den Kochzeiten 8, 12, 17 Uhr, Tipp öffnet das Rezept.

## Läden und Warengruppen

**Läden** (seit 2026-11-01, Lauf-Reihenfolge): maison de fruits (Obst · Gemüse · Kräuter & Salat) · Metzgerei Klein (Fleisch · Wurst · Käse) ·
Rewe/We (Müse · Obst · Rest · Wurst/Käse · Milch · Eier · Wursttheke · Butter · Süßes · Tiefkühl · Haushalt · Getränke) · Bäckerei Schäfer (Theke) · dm.
Markt und Netto werden nicht mehr genutzt.

**Warengruppen** schlagen beim Anlegen eines Produkts vor (danach zählt das Produkt):

| Warengruppe | Vorschlag Laden → sonst | Aufbewahrung |
|---|---|---|
| Obst | maison de fruits → Rewe | Obstkorb |
| Gemüse, Pilze, Kartoffeln & Zwiebeln | maison de fruits → Rewe | Kühlschrank / Speisekammer |
| Salat & frische Kräuter | maison de fruits → Rewe | Kühlschrank |
| Fleisch, Wurst & Schinken | Metzgerei Klein → Rewe | Kühlschrank |
| Käse, Frischkäse & Quark | Metzgerei Klein → Rewe | Kühlschrank |
| Brot & Brötchen | Schäfer | Brotkasten |
| Milch, Butter, Eier, Tiefkühl, Trockensortiment, Gewürze, Getränke … | Rewe | je nach Gruppe |
| Drogerie & Haushalt | dm | – |

## Technik (folgt aus dem Obigen)

- SQLite auf dem Pi (eine Datei, Transaktionen statt verlorener Änderungen), Datenbank ist die einzige Quelle.
- Bearbeiten außerhalb der UI: Export/Import einzelner Gerichte als Datei, Übersicht aller Gerichte als Tabelle; Claude liest/schreibt direkt.
- Live-Sync per Server-Sent Events; Web-Push vom Pi (iPhone: PWA auf dem Home-Bildschirm).
- MCP-Server (`/mcp`) für Claude und Hermes (Sprachbefehle): Plan lesen/planen, Gerichte, Einkaufsliste lesen/ergänzen/zurücknehmen, Anmerkungen.

## Etappen

1. Fundament: SQLite, Datenübernahme, Personen/Geräte, Export/Import, Tests.
2. Einkauf neu: berechnete Liste, Zustände, Warengruppen/Läden/Ausweichladen, Merkliste, schnelle Eingabe, Live-Sync, Rewe-Umbau. (#1, #2, #3, #6)
3. Kochen: „Heute“, Rezeptstruktur mit Vorbereitungen, Mengen-Feedback, alle Rezepte übernehmen, Schatzisch vereinheitlichen. (#5)
4. Benachrichtigungen. (#7)

Entwicklung auf Branch `dev`, Test auf schompf-dev.michoest.com mit Kopie der Live-Daten; Produktion bleibt bis zum Umstieg unverändert.
