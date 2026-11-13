# Übergabe: Funktionsdummy dynamische Seite Menschen mit Krebs

Stand: 13.11.2026
Herkunft: Konzeptarbeit im Claude-Chat (Projekt „Redaktionsassistent“). Das vollständige Konzept (Anhang) liegt nur im Claude-Projekt, nicht in diesem öffentlichen Repository, da es interne Einschätzungen enthält. Bei Abweichungen gilt der Hauptteil dieser Datei.

## 0. Einstieg für Claude Code

1. Diese Datei vollständig lesen.
2. Daraus eine kurze `CLAUDE.md` für das neue Repository ableiten (Auftrag, feste Entscheidungen, Datenregeln, Gestaltungsregeln). Diese Datei bleibt als Referenz im Repository.
3. Mit Abschnitt 9, Schritt 1 beginnen.

Sebastian programmiert nicht. Alles, was er selbst tun muss (GitHub-Einstellungen, Vimeo, Test auf dem Telefon), als konkrete Klickanleitung ausgeben, Schritt für Schritt.

## 1. Auftrag

Klickbarer Prototyp der neuen dynamischen Seite der Mediathek „Menschen mit Krebs“ für Smartphones im Hochformat.

- echte Videosegmente aus der Wissensbasis `wissensbasis-mmk`
- nur Darstellung und Bedienung, keine Such- oder Empfehlungslogik
- Zweck: ein Gefühl für die Darstellung bekommen; Gesprächsgrundlage für die Webagentur Merona
- Auslieferung über GitHub Pages

Nicht im Umfang: Einstiegsdialog, Suche, Empfehlungslogik, Backend, Benutzerkonten.

## 2. Feste Entscheidungen

| Thema | Entscheidung |
| --- | --- |
| Repository | öffentlich, auf Sebastians GitHub-Konto |
| Hosting | GitHub Pages |
| Vimeo-Tarif | Premium |
| Videotechnik | Vimeo-Player ohne Bedienoberfläche (`controls=0`), Steuerung über das Vimeo Player SDK (player.js), eigene Bedienelemente als Ebene darüber |
| Betriebsarten | Simulation (ohne Vimeo, interne Zeitachse) und Vimeo (echte Wiedergabe), umschaltbar per URL-Parameter, z. B. `?modus=vimeo` |
| Zielgerät | Smartphone im Hochformat; iPhone (Safari) und Android (Chrome) |
| Daten im Repository | nur Inhalte, die bereits veröffentlicht sind (siehe Abschnitt 4) |

## 3. Arbeitsumgebung

- Wissensbasis: lokaler Ordner `wissensbasis-mmk` (Pfad bei Sebastian erfragen)
- Regeln der Wissensbasis stehen dort in `anleitung.md` und `schema.md`; vor der Datenarbeit lesen
- Quelldateien in `quellen/` werden nie verändert
- In der Wissensbasis nichts schreiben; der Dummy liest nur
- neues Repository, Namensvorschlag: `mmk-dynamische-seite-dummy`

## 4. Daten

### Quellen

- Pilotveranstaltung: Beitrag 20323 „Klinische Studien für Krebsbetroffene“ (Veranstaltungsdatei, Segmentdateien, Personendateien)
- weitere Veranstaltungen mit `erfassungsstufe: 3`, falls vorhanden, damit Vorschläge auch aus anderen Veranstaltungen kommen
- Deepgram-JSON des finalen Masters je Veranstaltung (Pfad im Feld `deepgram_json` der Veranstaltungsdatei) für die Wortzeiten
- Vimeo-Link mit Privacy-Hash aus `quellen/zuordnung.md`

### Export-Skript

Ein Skript im Repository (z. B. `werkzeuge/export.py`) erzeugt aus der Wissensbasis eine reduzierte Datei `daten/elemente.json`. Die Dateien der Wissensbasis selbst werden nicht ins Repository kopiert.

Übernehmen:

- Veranstaltung: ID, Titel, Reihe, Vimeo-ID und Privacy-Hash, Dauer, Segmenttabelle
- Segment: ID, Start, Ende, Titel, Zusammenfassung, Themen
- Wortlaut mit Wortzeiten
- Personen: Bezeichnung im Text, Rolle

Nicht übernehmen:

- `hinweis` (Compliance-Hinweise), `einwilligung`, `bearbeitung`, Transkripthinweise, interne Notizen und Prüfvermerke
- Grund: Die Inhalte der Veranstaltungen sind veröffentlicht, diese Felder sind interne redaktionelle Einschätzungen und gehören nicht in ein öffentliches Repository

Nach dem Export prüfen und in der Rückmeldung bestätigen: Kein ausgeschlossenes Feld steht in `daten/`.

### Wortlaut und Zeiten

- Wortzeiten aus dem `words[]`-Array des Deepgram-JSON; Struktur `results.channels[0].alternatives[0]`
- Artefakt-Tokens wie in `anleitung.md` entfernen („Uhr“ als Einzelwort, „S1“, „S2“, Zahlwort mit Punkt und Ziffern, einzelne Ziffern ohne Satzbezug)
- Sprecherzuordnung aus den Segmentdateien übernehmen (dort korrigiert), nicht aus der Deepgram-Diarisierung; sie ist unzuverlässig
- Weicht der korrigierte Wortlaut der Segmentdatei vom Deepgram-Text ab (z. B. korrigierte Eigennamen), den korrigierten Wortlaut anzeigen und die Zeiten zuordnen; nicht zuordenbare Stellen in der Rückmeldung nennen

### Daten, die es noch nicht gibt

- **Rolle je Passage** (Experte, Betroffener, Angehöriger, Patientenvertreter, Moderation): im Dummy über eine kleine, von Hand gepflegte Datei `daten/rollen.json` je Person; Vorschlag aus den Personendateien ableiten und Sebastian zur Bestätigung vorlegen
- **Glossar:** 3 bis 5 Fachbegriffe, die im Pilot tatsächlich vorkommen; Erklärtexte sichtbar als Entwurf kennzeichnen, bis Sebastian sie fachlich freigibt; keine Produktnamen verschreibungspflichtiger Arzneimittel
- **Zusatzinformationen** (Links, Downloads): nur, was im Wortlaut tatsächlich genannt wird; sonst ein klar markiertes Beispiel
- **Startbilder:** erst fragen, ob der finale Master lokal liegt; dann Einzelbild am Startzeitpunkt jedes Segments per ffmpeg; sonst neutrale Fläche mit Segmenttitel
- **andere Elementtypen** (Einzelaussage, Textbeitrag, Selbsthilfegruppe): höchstens je ein Beispiel, sichtbar als Platzhalter gekennzeichnet; keine erfundenen Kontaktdaten

## 5. Funktionsumfang

### Layout

- oben aktive Kachel (Video 16:9 plus Textbereich), unten drei Vorschlagskacheln
- Höhenverhältnis per Variable umschaltbar (Hälfte oder zwei Drittel für die aktive Kachel), damit Sebastian beide Varianten vergleichen kann

### Aktive Kachel

- Video startet nach Auswahl einer Kachel
- Gedrückthalten auf der Videofläche pausiert, Loslassen setzt fort
- große Touch-Schaltflächen im Bild: −10 s, +10 s, 1× / 2×
- Name der Veranstaltung klein im Bild
- Transkript unter dem Video, aktuelle Stelle hervorgehoben, läuft automatisch mit
- manuelles Scrollen setzt das Mitlaufen aus; eine Schaltfläche führt zur aktuellen Stelle zurück
- Sprecher und Rolle stehen fest oben im Textbereich und wechseln beim Sprecherwechsel
- Expertenwissen und Erfahrung farblich unterscheidbar
- Segmentende: Video stoppt, die Schaltfläche für die ganze Veranstaltung wird hervorgehoben
- Zusatzinformation: im Text markiert, zum Zeitpunkt ein kleines Pop-up; Antippen vergrößert es und pausiert das Video; Schließen setzt fort

### Vorschläge

- drei Kacheln mit Bild, Titel, kurzer Zusammenfassung, Typ
- X blendet eine Kachel aus, die nächste rückt nach (feste Reihenfolge, keine Logik)
- Antippen: Kachel rutscht in etwa 0,5 s nach oben und wird aktiv; die Videoanfrage startet sofort beim Antippen, nicht erst nach der Animation

### Verlauf

- das vorherige Element rückt sichtbar nach hinten links
- horizontales Wischen blättert durch den Verlauf bis zum ersten Element
- Gesten nicht am Bildschirmrand beginnen lassen (Zurück-Geste von iOS)
- Zurück-Taste des Browsers blättert im Verlauf (History API)

### Merkliste

- Stern an jedem Element und jedem Pop-up
- Speicherung in `localStorage`
- Liste über eine seitliche Leiste erreichbar

### Teilen

- Web Share API; Link mit Element-ID im Hash (z. B. `#seg-…`)
- Aufruf des Links öffnet genau dieses Element

### Gesamtveranstaltung

- Schaltfläche in der aktiven Kachel
- Timeline über die volle Länge mit allen Segmenten; das Ausgangssegment ist markiert
- frei springen; Schließen führt zurück in den Stöbermodus, Verlauf und Vorschläge bleiben erhalten

### Querformat

- mit laufendem Video: Video füllt den Bildschirm per CSS, nur Steuerelemente, eine Transkriptzeile unten
- ohne Video: Hochformat-Layout mittig, keine weitere Änderung

### Barrierefreiheit

- Schriftgrößen in `rem`, Text bricht um statt abgeschnitten zu werden
- Layout hält bei 200 % Textgröße
- Touch-Flächen mindestens 44 × 44 px
- `prefers-reduced-motion` respektieren
- ausreichender Kontrast, sichtbarer Fokus

## 6. Technik

- statische Seite (HTML, CSS, JavaScript), keine Build-Kette; Daten als JSON
- `https://player.vimeo.com/api/player.js`
- ein einziges Player-Objekt; Videowechsel per `loadVideo()` mit vollständiger URL inklusive `h`-Parameter (nicht gelistete Videos)
- Einbettung mit `controls=0`; `allow="autoplay; fullscreen"` am iframe
- Zeit: `timeupdate` kommt etwa alle 250 ms; dazwischen per `requestAnimationFrame` fortschreiben, damit die Hervorhebung flüssig läuft
- Segmentende per `addCuePoint()` oder Zeitabgleich
- Geschwindigkeit per `setPlaybackRate(2)`; die Vimeo-Doku nennt dafür PRO- und Business-Konten. Mit Premium testen; bei Fehler die Schaltfläche ausblenden und melden
- Gesten über eine transparente Ebene über dem iframe; dort `-webkit-touch-callout: none` und `user-select: none`
- Adapter-Muster: Simulation und Vimeo bieten dieselbe Schnittstelle (play, pause, seek, rate, Zeitereignis), damit der Oberflächencode identisch bleibt

### Größtes Risiko: Autostart auf iOS

Laut Vimeo-Doku lässt sich die Wiedergabe auf iOS und einigen Mobilgeräten erst programmatisch starten, nachdem der Nutzer einmal im Player selbst getippt hat.

- als Erstes auf einem echten iPhone testen, vor dem Ausbau der übrigen Funktionen
- kleine Diagnoseanzeige (abschaltbar): Plattform, ob der Start geklappt hat, Fehlermeldungen von player.js
- Ausweichwege prüfen und Ergebnis melden, z. B. erster Start per Tipp direkt im Player oder stummer Start mit Ton-an-Schaltfläche

## 7. Gestaltung

- Organisationsfarben verbindlich: Light Violett `#AC3F90`, Dark Violett `#662483`, Dunkelgrau `#3C3C3B` (Fließtext); Grundfläche Weiß
- Theme-Farben der Website (`foreground`, `ecru-white`, `thunder`, `primary`): Hex-Werte liegen noch nicht vor; als CSS-Variablen anlegen, Platzhalterwerte kennzeichnen
- Expertenwissen und Erfahrung farblich trennen; Vorschlag zur Farbzuordnung machen
- Logo nur, wenn Sebastian eine Datei liefert; dann komplettes Logo, zweifarbig, auf Weiß, mit Schutzraum
- Schreibweisen: Mediathek als „Menschen mit Krebs“; „CancerSurvivor“ nicht zentral; „SURVIVORS HOME“ immer in Versalien, ohne Fettdruck, Unterstreichung, Apostroph oder Einfärbung
- Sprache: Deutsch, Präsens, keine Gendersprache, deutsche Anführungszeichen
- Oberflächentexte schlicht und handlungsbezogen; Anrede (du oder Sie) ist offen, daher möglichst ohne direkte Anrede formulieren
- Hinweis dauerhaft erreichbar: „Diese Inhalte dienen ausschließlich der Information und ersetzen keine Diagnose oder Therapieentscheidung.“
- keine Sponsorennamen im Dummy
- gestalterische Leitlinie: ruhig, gut lesbar, für Menschen ab 50 mit vergrößerter Systemschrift; keine dekorativen Effekte, Bewegung nur als Antwort auf Bedienung

## 8. Vimeo-Domainfreigabe (macht Sebastian)

Die Videos dürfen nur auf freigegebenen Domains laufen. Für den Dummy muss die GitHub-Pages-Domain je Video ergänzt werden.

1. Video in Vimeo öffnen (Einstellungsseite des Videos).
2. Oben rechts „Share“ / „Teilen“ wählen.
3. Reiter „Embed“ / „Einbetten“ öffnen.
4. Unter „Embed privacy“ bzw. „Where can this be embedded?“ die Option „Specific domains“ wählen (ist vermutlich schon aktiv, mit menschen-mit-krebs.de).
5. In „Allowed domains“ `<kontoname>.github.io` eintragen und mit „+“ oder Enter bestätigen.
6. Bestehende Domains stehen lassen.

Hinweise:

- nur die Domain eintragen, keine vollständige URL
- nicht `github.io` allein eintragen: Eine Domain schließt ihre direkten Subdomains ein, dann könnte jede GitHub-Pages-Seite die Videos einbetten
- bis zu 50 Domains je Video
- nur für die Videos nötig, die im Dummy vorkommen

Quellen: [Vimeo – domain-level privacy](https://help.vimeo.com/hc/en-us/articles/30030693052305-How-do-I-set-up-domain-level-privacy), [Vimeo – Subdomains](https://help.vimeo.com/hc/en-us/articles/13806764653201)

## 9. Arbeitsschritte

1. Repository anlegen und GitHub Pages aktivieren (Klickanleitung für Sebastian); Kontonamen festhalten und Sebastian die Domain für Abschnitt 8 nennen.
2. Wissensbasis lesen: `anleitung.md`, `schema.md`, Pilotdateien. Datenmodell kurz bestätigen lassen, vor allem Rolle und Sprecherzuordnung.
3. Export-Skript bauen, `daten/elemente.json` erzeugen, Ausschluss interner Felder prüfen.
4. Vimeo-Adapter mit minimaler Oberfläche; Autostart-Test auf dem iPhone durch Sebastian.
5. Ergebnis des Tests auswerten, Bedienkonzept bei Bedarf anpassen.
6. Vollständige Oberfläche nach Abschnitt 5, erst im Simulationsmodus, dann mit Vimeo.
7. Test durch Sebastian auf iPhone und Android, auch mit großer Systemschrift.
8. Rückmeldungen einarbeiten.
9. `README.md` für Merona: Zweck, Betriebsarten, Datenexport, bekannte Einschränkungen.

## 10. Abnahme

- läuft auf iPhone (Safari) und Android (Chrome)
- alle Funktionen aus Abschnitt 5 bedienbar
- Hervorhebung passt zum Ton (Stichprobe an drei Stellen, Zeiten nennen)
- Layout bei 200 % Textgröße ohne Überlappung
- kein ausgeschlossenes Feld der Wissensbasis im Repository
- `README.md` vorhanden

## 11. Offene Punkte, die der Dummy klären hilft

- Autostart auf iOS
- doppelte Geschwindigkeit mit Vimeo Premium
- Aufteilung aktive Kachel zu Vorschlägen (Hälfte oder zwei Drittel)
- Verhalten am Segmentende
- Rücksprung nach dem Vorauslesen im Transkript
- Rolle je Passage als Feld in `schema.md`
- Glossartexte: fachliche Freigabe
- Hex-Werte der Theme-Farben
