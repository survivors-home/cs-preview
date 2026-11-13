# CLAUDE.md – Funktionsdummy dynamische Seite „Menschen mit Krebs“

Referenz: `UEBERGABE.md` (Hauptteil der Übergabe vom 13.11.2026). Bei Abweichungen gilt `UEBERGABE.md`, ergänzt um die Festlegungen unten.

## Auftrag

- klickbarer Prototyp der dynamischen Seite der Mediathek „Menschen mit Krebs“ für Smartphones im Hochformat (iPhone Safari, Android Chrome)
- echte Videosegmente aus der Wissensbasis `wissensbasis-mmk`; nur Darstellung und Bedienung
- Zweck: Gesprächsgrundlage für die Webagentur Merona
- nicht im Umfang: Einstiegsdialog, Suche, Empfehlungslogik, Backend, Benutzerkonten

## Feste Entscheidungen

- Repository öffentlich: `github.com/survivors-home/cs-preview`; einziger und Standardzweig: `claude/ecstatic-brown-cfkhic`
- Auslieferung: GitHub Pages, `https://survivors-home.github.io/cs-preview/`; `.nojekyll` liegt im Repository
- Sitzungen mit Schreibzugriff (Claude Code) pushen auf den Standardzweig. Sitzungen ohne Schreibzugriff (Cowork) ersetzen Textdateien über Claude in Chrome im GitHub-Webeditor und committen dort; sonst lädt Sebastian per Drag-and-drop hoch („Add file → Upload files“) und Claude committet. Nach jedem Commit per `git clone` und `diff` prüfen. Lesen geht immer per `git clone` (öffentlich).
- Datenexport braucht Zugriff auf die Wissensbasis auf Sebastians Mac; das geht nur aus einer Sitzung, die mit dem Mac verbunden ist.
- statische Seite (HTML, CSS, JavaScript), keine Build-Kette, Daten als JSON
- Vimeo-Player mit `controls=0`, Steuerung über player.js
- **Je sichtbarer Kachel ein eigener, vorgeladener Player** (aktives Element, drei Vorschläge, zwei Elemente zurück und eines vor im Verlauf), iframe mit Startzeit `#t=`; kein `loadVideo()`. Grund: iPhone-Test 13.11.2026 – Ton gibt es nur, wenn der Startbefehl im selben Antippen an einen bereits geladenen Player geht. `vorrat.starten()` / `vorrat.abspielen()` daher immer als Erstes und ohne vorheriges `await` im Klick-Handler aufrufen.
- Adapter: `js/player-vorrat.js` (Simulation und Vimeo mit gleicher Schnittstelle). `js/player.js` gehört nur zu `test-vimeo.html`.
- Betriebsarten: Simulation (Standard) und Vimeo (`?modus=vimeo`); weitere Parameter `?aufteilung=zwei-drittel`, `?diagnose=1`; Element-Link `#seg-<id>`
- Vimeo Premium; 2× per `setPlaybackRate` funktioniert (Desktop und iPhone geprüft)
- Tonzustand aus `getMuted()`/`getVolume()` ist auf dem iPhone nicht verlässlich; nur Hörtest zählt
- `loadVideo()` nur mit `https://player.vimeo.com/video/ID?h=HASH`, die Form `vimeo.com/ID/HASH` bleibt ohne Antwort
- echte Wiedergabe nur auf freigegebener Domain `survivors-home.github.io` (in Vimeo je Video eintragen)
- keine Master-Videos lokal: Startbilder als neutrale Fläche mit Segmenttitel
- Rolle im Textbereich = Typ der Passage aus der Segmentdatei (`sprecher[].typ`): „Expertenwissen · Name“, „Erfahrung · Name“, „Moderation · Name“; keine `rollen.json`
- Inhalte: Pilot „Klinische Studien“ komplett plus Bewegung/Sport/Fatigue, CLL, BRCA1 und ich, Lymphome – Ängste (Auswahl und feste Reihenfolge in `werkzeuge/auswahl.json`)
- Glossar: nur „Phase-1-Studie“ (Entwurf, Freigabe durch Sebastian ausstehend)

## Datenregeln

- Wissensbasis bei Sebastian: `~/Library/Mobile Documents/com~apple~CloudDocs/wissensbasis-mmk` (iCloud Drive). Nur lesen, nie schreiben. Regeln dort in `anleitung.md` und `schema.md`.
- Export: `python3 werkzeuge/export.py "<pfad-zur-wissensbasis>"` erzeugt `daten/elemente.json` (Index, Veranstaltungen, Elemente, Glossar, Zusatzinfos) und `daten/wortlaut/<veranstaltung>.json` (Wortlaut mit Wortzeiten in Hundertstelsekunden). Dateien der Wissensbasis nie ins Repository kopieren.
- Nicht übernehmen: `hinweis`, `einwilligung`, `bearbeitung`, Transkripthinweise, `interessenkonflikt`, `anrede_korrespondenz`, `aliases`, `sponsorenbereich`, Deepgram-Metadaten, `patient_journey`, `krebsarten`, Kernaussagen. Das Skript prüft das am Ende und bricht bei Verstoß ab.
- Personen (Freigabe Sebastian 13.11.2026): Name, Rolle, `funktion` je Veranstaltung (ohne interne Herkunftsvermerke wie „(laut Begrüßung)“), `website`, Foto. Fotos stammen von der Veranstaltungsseite bei SURVIVORS HOME; ohne Foto wird keins angezeigt. Anzeige im Personen-Fenster (Info-Symbol hinter dem Namen in der Sprecherzeile), merkbar.
- Sponsorennamen im Wortlaut werden als „[Sponsor]“ maskiert.
- von Hand gepflegt: `inhalte/glossar.json`, `inhalte/zusatzinfos.json`, `inhalte/platzhalter.json`, `inhalte/personen.json` (Foto-Adresse je Person-ID: `{"<id>": {"foto": "<url>"}}`); Fundstellen und Zeiten berechnet das Skript.
- Platzhalter und Beispiele sichtbar kennzeichnen; keine erfundenen Kontaktdaten; in eigenen Texten keine Produktnamen verschreibungspflichtiger Arzneimittel, keine Wirksamkeits- oder Überlegenheitsaussagen.
- Vorschlagsliste ohne Segmente mit Hinweis auf eigenes Angebot, Off-Label-, Überlegenheits- oder Sponsorbezug.

## Inhaltsregeln (Organisation)

- nur allgemeine wissenschaftliche Einordnung, keine individuellen Therapieempfehlungen, keine Bewertung einzelner Patientensituationen
- keine Produktnamen verschreibungspflichtiger Arzneimittel, keine Überlegenheits- oder Wirksamkeitsvergleiche, keine Off-Label-Darstellung
- Studieninhalte mit Phase und vorläufigem Charakter; „Noch keine zugelassene Therapie“ kennzeichnen, wo zutreffend
- keine Heilsversprechen, keine Zeitprognosen; Verweis auf die behandelnden Ärzte

## Gestaltung

- Farben: Light Violett `#AC3F90`, Dark Violett `#662483`, Dunkelgrau `#3C3C3B` (Fließtext), Grundfläche Weiß; Variablen in `css/basis.css`
- Theme-Farben der Website (`foreground`, `ecru-white`, `thunder`, `primary`) sind Platzhalter, bis Hex-Werte vorliegen
- Vorschlag Rollenfarben: Expertenwissen Dark Violett, Erfahrung Light Violett; zusätzlich immer Textlabel (nicht nur Farbe)
- „SURVIVORS HOME“ in Versalien, ohne Fettdruck, Unterstreichung, Apostroph, Einfärbung; Mediathek als „Menschen mit Krebs“
- Deutsch, Präsens, keine Gendersprache, deutsche Anführungszeichen; Oberflächentexte ohne direkte Anrede
- Hinweis dauerhaft erreichbar: „Diese Inhalte dienen ausschließlich der Information und ersetzen keine Diagnose oder Therapieentscheidung.“
- keine Sponsorennamen; ruhig, gut lesbar, Zielgruppe ab 50; Bewegung nur als Antwort auf Bedienung
- Schrift in `rem`, Layout hält 200 % Textgröße, Touch-Flächen mindestens 44 × 44 px, `prefers-reduced-motion`, sichtbarer Fokus

## GitHub Pages

- keine Dateien oder Ordner mit führendem Unterstrich (Jekyll ignoriert sie)
- in Markdown-Dateien keine doppelten geschweiften Klammern und keine Kombination aus geschweifter Klammer und Prozentzeichen (Liquid-Syntax, bricht den Pages-Build ab)

## Arbeitsweise mit Sebastian

- programmiert nicht: alles, was er tun muss, als nummerierte Klickanleitung
- knapp, sachlich, Deutsch, keine Gendersprache, offene Kritik
- Stand und Entscheidungen zusätzlich im Claude-Projekt „Redaktionsassistent CS“ unter `claude/dummy-dynamische-seite-stand.md`

## Stand (Abschnitt 9 der Übergabe)

| Schritt | Stand |
| --- | --- |
| 1 Repository, GitHub Pages | erledigt |
| 2 Wissensbasis gelesen, Datenmodell | bestätigt 13.11.2026 |
| 3 Export-Skript, `daten/` | erledigt 13.11.2026; 99,7 % der Wortzeiten direkt aus Deepgram |
| 4 Vimeo-Adapter, Autostart-Test | erledigt; iPhone: Start mit Ton nur mit vorgeladenem Player je Kachel (`test-ton.html`, Variante 3) |
| 5 Auswertung | erledigt 13.11.2026: Player-Vorrat statt eines Players |
| 6 Oberfläche | erster Stand 13.11.2026 (`index.html`, `css/app.css`, `js/app.js`, `js/player-vorrat.js`), in Simulation automatisiert geprüft, live |
| 7 Test iPhone und Android | offen |
| 8 Rückmeldungen | offen |
| 9 README für Merona | offen |
