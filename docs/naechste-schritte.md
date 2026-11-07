# Nächste Schritte (Übergabe)

Stand: 2026-11-07. Für eine neue Session: zuerst `CLAUDE.md` lesen (Infrastruktur, Deploy, Regeln), dann `docs/konzept.md` (fachliches Zielbild), dann dieses Dokument.

## Stand

- Live (`main`) = Dev (`dev`), beide auf demselben Stand. Leines und Roßes sind mit ihren iPhones angemeldet, dazu die Geräte „Kairos“ und „Claude“.
- Commits ohne Claude-/Co-Authored-By-Zeilen (Wunsch des Nutzers; die Historie wurde am 2026-11-07 bereinigt).
- Seit Oktober umgesetzt (Details in den Commits):
  - **Durchgehende Einkaufsliste**: Ein Einkauf ist intern eine „Runde“. „Aus Plan holen“ übernimmt Gerichte bis zu einem Tag; „Einkauf fertig“
    nimmt Erledigtes (im Wagen, vorrätig, nicht nötig) weg, alles Offene wandert in die nächste Runde. „Später“ (Haltbarkeit) richtet sich nach heute.
    Neuer Bedarf auf einer erledigten Zeile öffnet sie wieder. Zubereitet/Löschen fragt, ob die offenen Zutaten dieses Essens von der Liste sollen.
  - **Orte pro Produkt** (Migration 005): Laden, Abschnitt, Ausweichladen, Aufbewahrung stehen am Produkt; die Warengruppe ist nur Vorschlag beim Anlegen.
    Läden seit 2026-11-01: maison de fruits, Metzgerei Klein, We, Schäfer, dm (`api/scripts/laeden-2026-11.js`).
  - **Heute woanders kaufen** (Migration 006): Laden/Abschnitt pro Listenzeile nur für die laufende Runde (Menü oder Ziehen); freie Artikel einsortieren.
    **Zuschlag pro Gericht** (z.B. 10 % Naschteig bei den Kuchen), nur für die Einkaufsliste.
  - **Oberfläche**: Einstellungen als eigene Seite (Version, Neu laden, Geräte, neues Gerät per Code in der App), Einkaufen mit Ladenkarten (fertige
    Läden klappen zu), Planen mit Mahlzeit-Symbolen, Kochen mit früheren/weiteren Tagen, neues App-Icon; Dev hat ein oranges DEV-Icon.
  - **MCP** (`api/src/mcp.js`): zusätzlich `get_context` (kompakt), `remove_from_shopping`, `readOnlyHint` an den Lese-Werkzeugen – genutzt von
    Hermes (`~/dev/hermes/hermes-0`, Sprach-Dispatcher) mit dem Token des Geräts „Claude“.
- Datenwerkzeuge: `scripts/pi.sh prod produkte-export > p.xlsx` / `produkte-import p.xlsx --probe` (Excel mit Auswahllisten);
  `npm run deploy:dev -- --refresh-db` kopiert jetzt die Live-SQLite nach Dev (Dev-Logins bleiben).

## Offen

- **Produkt-Zuordnung**: Der Nutzer geht die Tabelle `~/Downloads/schompf-produkte-live.xlsx` durch (Einkaufsort, Aufbewahrung …).
  Danach: `produkte-import - --probe` zeigen, nach OK übernehmen. Dazu passt die Kairos-Notiz „Einige Items vom Käsestand müssten zu Rewe“
  (archivieren, wenn die Tabelle übernommen ist). Antipastis steht vorläufig bei We › Rest.
- 7 Gerichte im Entwurf haben noch kein Rezept: Kelhuhn (4 Zutaten), Melette, Migiana (chefkoch-Link), Obstteller, Pinatsagne (chefkoch-Link),
  Pätzle mit Rahmpignons, Çaibowl – Rezepte liefert der Nutzer als Markdown in den Downloads.

## Etappe 3 (läuft über die Nutzung)

Anmerkungen aus der App: `scripts/pi.sh prod feedback` lesen · umsetzen (Gerichte via `scripts/pi.sh prod gericht <Name>` / `import - --probe`) ·
erledigen: `scripts/pi.sh prod erledigt <ID> <was geändert wurde>`. Wünsche kommen außerdem als Notizen in Kairos (Kategorie Apps/Schompf).

## Kleinere technische Punkte

- Live-Sync liest `/api/events` per fetch mit Authorization-Header (der alte `?token=`-Weg ist seit 2026-11-07 entfernt).
- Prod-API lauscht nur auf `127.0.0.1:3000`. Lokal ist Port 3000 oft von einem anderen Projekt belegt: API dann mit `PORT=3005` starten und
  Vite mit `VITE_API_PROXY=http://127.0.0.1:3005 npx vite --port 5174`.
- UI-Tests ad hoc mit Playwright (Chrome aus `/Applications`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). Ziehen testen mit Maus-Ereignissen
  (SortableJS läuft mit `forceFallback`).
