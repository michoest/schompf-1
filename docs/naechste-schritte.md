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
**MCP-Server** (`api/src/mcp.js`, `POST /mcp`, Geräte-Token): list_plan, search_dishes, get_dish, get_shopping, add_to_shopping
(= Eingang), plan_meal (ändert die Liste nicht), list_feedback, add_feedback. Auf Dev deployt; dort fehlt im Caddyfile noch
`handle /mcp` (Prod-Domain leitet alles an die API). Anbindung in Claude Code: eigenes Gerät „Claude“ (Code per `pi.sh prod code Roßes`),
`claude mcp add --transport http schompf https://schompf-api.michoest.com/mcp --header "Authorization: Bearer <token>"`.
claude.ai/Desktop-Connectoren bräuchten OAuth – bisher nicht gebaut.

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

Stand 2026-10-13: Alle aktiven Kochgerichte haben ein Rezept (#5 geschlossen); nur die Entwürfe sind noch ohne.
Erledigt: Clette-Mengen (Gläser/Guette 0,5 pro Portion), Tortillas → Tillas, Fenchel → Nchel (Gericht + Nchelnolle),
Birne/Linsen/Thunfisch bleiben bewusst hochdeutsch, Nanenrot ist jetzt Kuchen (12 Stück), Vorbereitungen bei Chersli (12 h) und
Linsen und Pätzle (24 h). Sagne wird immer am Tag selbst gemacht (keine Vorbereitung).

## Kleinere technische Punkte

- „neu“-Markierung in der Einkaufsliste erst ab 5 s nach Erstellen des Einkaufs (Toleranz in `buildTripList`).
- Live-Sync liest `/api/events` seit 2026-10-13 per fetch mit Authorization-Header. Der Query-Parameter `?token=` wird nur noch für alte, gecachte
  App-Versionen angenommen – in einigen Wochen in `api/src/app.js` (`requireDevice`) entfernen.
- Prod-API lauscht seit 2026-10-13 nur auf `127.0.0.1:3000` (Standard in `server.js`, `HOST` in `api/.env`); `pi5.local:3000` ist nicht mehr erreichbar.
- UI-Tests laufen bisher ad hoc mit Playwright (Chrome aus `/Applications`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) gegen `npm run dev`; lokale DB siehe CLAUDE.md → Entwicklung.
