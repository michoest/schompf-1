# Nächste Schritte (Übergabe)

Stand: 2026-10-12. Für eine neue Session: zuerst `CLAUDE.md` lesen (Infrastruktur, Deploy, Regeln), dann `docs/konzept.md` (fachliches Zielbild), dann dieses Dokument.

## Stand

- Neue Version ist seit 2026-10-11 **live** (`main`, schompf.michoest.com + schompf-api.michoest.com). Etappen 1, 2 und 4 aus `docs/konzept.md` sind umgesetzt:
  SQLite, Personen/Geräte-Login, Warengruppen/Läden, eingefrorene Einkaufsliste mit ausdrücklichem „Liste anpassen“,
  Live-Sync, Web-Push-Erinnerungen, Anmerkungen (Feedback), Zubereitungszeiten, eigene Mahlzeiten/Snacks.
- Nutzer (Roßes) ist angemeldet und hat Benachrichtigungen in der Safari-Web-App. Leines hat einen Anmeldecode (gültig bis 18.10.); ob sie angemeldet ist: `scripts/pi.sh prod geraete`.
- Branches: `dev` = `main` (Stand gleich). Weiterentwicklung auf `dev`, Test auf schompf-dev.michoest.com.

## Als Nächstes: MCP-Server + Anbindung Kairos

Wunsch des Nutzers (2026-10-12):
1. **MCP-Server für Schompf** mit den wichtigsten Tools und Ressourcen, damit Claude z.B. beantworten kann „Was essen wir nächste Woche?“.
2. **Kairos → Schompf**: Landet in der Todo-App Kairos ein Eintrag in der Kategorie „Einkaufen“, soll er direkt nach Schompf –
   so, als hätte man unten im Tab Einkaufen etwas eingetippt. Kairos soll nichts über Schompf-Logik wissen, nur ein Item (oder eine Liste) schicken.

**Stand 2026-10-12:** Spec liegt in `kairos-1/docs/schompf-schnittstelle.md`. Schompf-Seite `POST /api/inbox` ist live (`api/src/repo/inbox.js`,
Migration 003). Entschieden: Ziel = aktueller Einkauf wie in der App, sonst Merkliste der Warengruppe, sonst We; Notiz nur bei unbekannten
Produkten in Klammern; keine Push-Meldung. Kairos-Seite (Übergabe per Tipp, `handoff`) baut die kairos-1-Session; Kairos wird Gerät von Roßes.
Offen: **Schompf-MCP-Server** (Empfehlung in der Spec: `add_to_shopping` nutzt `addInboxItems`).

### Wichtig zu Kairos
- Maßgeblich ist **kairos-1** (`~/dev/kairos-1`, GitHub michoest/kairos-1, privat, läuft auf pi5 unter kairos.michoest.com, PM2 `kairos-1-api` :3012).
  Die alte Kairos-Version (`~/dev/kairos`, PM2 `kairos-api`) ist abgeschaltet – nicht verwenden.
- kairos-1 hat schon einen eigenen MCP-Server (in Claude Code als „kairos“ eingetragen) und plant einen Capture-Endpunkt (`POST /api/capture`).
  Vor dem Entwurf `~/dev/kairos-1` (CLAUDE.md, docs/) ansehen: Wie sind dort MCP und Events gebaut? Wo ließe sich „Kategorie Einkaufen → an Schompf“ anhängen?

### Entwurf (zur Abstimmung mit dem Nutzer)
- **Schompf-Eingang** `POST /api/intake` mit Integrations-Token (eigenes „Gerät“ pro Integration, z.B. `kairos`, Person = wer es erfasst hat):
  nimmt `items: ["2 Trone", "Waschmittel"]` und verarbeitet sie wie die Schnellzeile im Einkaufs-Tab
  (`addFreeItem` in `api/src/repo/trips.js`: exakter Produktname → zählt beim Produkt mit, sonst freier Artikel; nie per Wortanfang).
  Offene Frage: Wohin, wenn gerade kein offener Einkauf existiert – Merkliste des bevorzugten Ladens oder „Eingang“ für den nächsten Einkauf?
- **MCP-Server**: am besten als Streamable-HTTP-Endpunkt in der API (`/mcp`, gleicher Token-Mechanismus), damit Claude (Code/Desktop/claude.ai) ihn remote nutzen kann.
  Mögliche Tools: `plan_lesen(von, bis)`, `gericht_suchen`, `gericht_lesen`, `mahlzeit_planen`, `einkaufsliste_lesen`, `artikel_hinzufuegen`,
  `anmerkung_schreiben`, `anmerkungen_lesen`. Ressourcen: Wochenplan, aktuelle Einkaufsliste, Gerichte-Bibliothek.
  Gleiche Regeln wie die App: Einkaufsliste nur ausdrücklich ändern (Mahlzeit planen ohne `syncTrip`, außer gewünscht).
- **Kairos-Seite**: Listener auf Ereignisse „Eintrag in Kategorie Einkaufen“ → `POST /api/intake` an Schompf; danach Eintrag in Kairos erledigen/markieren. Konfiguration (URL, Token) in Kairos' `.env`.

## Etappe 3 (läuft über die Nutzung)

Der Nutzer schreibt Anmerkungen in der App (Gericht → Sprechblase, oder Zahnrad → Feedback geben).
Auslesen: `scripts/pi.sh prod feedback` · umsetzen (Gerichte via `scripts/pi.sh prod gericht <Name>` / `import - --probe`) · erledigen: `scripts/pi.sh prod erledigt <ID> <was geändert wurde>`.

Bekannte inhaltliche Punkte:
- Mengen pro Portion stimmen nicht überall (z.B. Clette: ganze Gläser pro Portion; Bissotto: 0,5 Schalotten pro Portion).
- Schatzisch vereinheitlichen (neue Produkte heißen teils noch hochdeutsch: Birne, Linsen, Thunfisch, Tortillas …; „Saures Sahne“ ist zusammengeführt).
- Nanenrot: Platzhalter `{Nane, 0,5}` – ganze Menge gemeint? Zeit 5 Min. vs. verlinktes Bananenbrot (70 Min.) – nachfragen.
- Vorbereitungen (Erinnerung am Vortag) sind bisher nur bei der Ghurtbombe hinterlegt.

## Kleinere technische Punkte

- „neu“-Markierung in der Einkaufsliste erst ab 5 s nach Erstellen des Einkaufs (Toleranz in `buildTripList`).
- SSE-Token steht als Query-Parameter in Caddy-Warnlogs (bei abgebrochenen Verbindungen) – ggf. auf kurzlebiges Event-Token umstellen.
- Prod-API lauscht auf `0.0.0.0:3000` (`HOST` in `api/.env`); `127.0.0.1` würde reichen (Caddy ist lokal).
- UI-Tests laufen bisher ad hoc mit Playwright (Chrome aus `/Applications`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) gegen `npm run dev`; lokale DB siehe CLAUDE.md → Entwicklung.
