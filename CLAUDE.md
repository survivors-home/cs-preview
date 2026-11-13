# CLAUDE.md – Funktionsdummy dynamische Seite „Menschen mit Krebs“

Vollständige Referenz: Übergabedokument „Übergabe: Funktionsdummy dynamische Seite Menschen mit Krebs“ (Stand 13.11.2026). Bei Abweichungen gilt dessen Hauptteil, nicht der Anhang.

## Auftrag

Klickbarer Prototyp der dynamischen Seite der Mediathek „Menschen mit Krebs“ für Smartphones im Hochformat. Echte Videosegmente aus der Wissensbasis `wissensbasis-mmk`, nur Darstellung und Bedienung. Gesprächsgrundlage für die Webagentur. Auslieferung über GitHub Pages.

Nicht im Umfang: Einstiegsdialog, Suche, Empfehlungslogik, Backend, Benutzerkonten.

## Feste Entscheidungen

- Repository öffentlich, Hosting GitHub Pages (`survivors-home.github.io/cs-preview/`)
- Statische Seite (HTML, CSS, JavaScript), keine Build-Kette, Daten als JSON
- Vimeo Premium; Player mit `controls=0`, Steuerung über player.js, eigene Bedienelemente als Ebene darüber
- Ein einziges Player-Objekt, Videowechsel per `loadVideo()` mit vollständiger URL inkl. `h`-Parameter
- Zwei Betriebsarten mit gleicher Adapter-Schnittstelle (play, pause, seek, rate, Zeitereignis): Simulation (Standard) und Vimeo (`?modus=vimeo`)
- Zielgeräte: iPhone (Safari), Android (Chrome), Hochformat
- Größtes Risiko: Autostart auf iOS – vor dem Ausbau auf echtem iPhone testen, Diagnoseanzeige abschaltbar

## Datenregeln

- Wissensbasis nur lesen, nie schreiben; `quellen/` nie verändern; Dateien der Wissensbasis nicht ins Repository kopieren
- `werkzeuge/export.py` erzeugt `daten/elemente.json`
- Übernehmen: Veranstaltung (ID, Titel, Reihe, Vimeo-ID, Privacy-Hash, Dauer, Segmenttabelle), Segment (ID, Start, Ende, Titel, Zusammenfassung, Themen), Wortlaut mit Wortzeiten, Personen (Bezeichnung im Text, Rolle)
- Nie übernehmen: `hinweis`, `einwilligung`, `bearbeitung`, Transkripthinweise, interne Notizen, Prüfvermerke. Nach jedem Export prüfen, dass keines dieser Felder in `daten/` steht
- Wortzeiten aus Deepgram `results.channels[0].alternatives[0].words[]`; Artefakt-Tokens nach `anleitung.md` entfernen
- Sprecher aus den Segmentdateien, nicht aus der Deepgram-Diarisierung; korrigierten Wortlaut anzeigen, Zeiten zuordnen, nicht zuordenbare Stellen melden
- Rollen: `daten/rollen.json`, von Hand gepflegt, Vorschlag vom Auftraggeber bestätigen lassen
- Glossar (3–5 Begriffe aus dem Pilot): Erklärtexte sichtbar als Entwurf kennzeichnen bis zur fachlichen Freigabe
- Platzhalter (andere Elementtypen, Beispiel-Zusatzinformationen) sichtbar kennzeichnen; keine erfundenen Kontaktdaten

## Inhaltsregeln (Organisation)

- Nur allgemeine wissenschaftliche Einordnung, keine individuellen Therapieempfehlungen
- Keine Produktnamen verschreibungspflichtiger Arzneimittel, keine Überlegenheits- oder Wirksamkeitsvergleiche, keine Off-Label-Darstellung
- Studieninhalte mit Phase und vorläufigem Charakter; „Noch keine zugelassene Therapie“ kennzeichnen, wo zutreffend
- Keine Heilsversprechen, keine Zeitprognosen; Verweis auf behandelnde Ärzte
- Hinweis dauerhaft erreichbar: „Diese Inhalte dienen ausschließlich der Information und ersetzen keine Diagnose oder Therapieentscheidung.“
- Keine Sponsorennamen im Dummy

## Gestaltungsregeln

- Farben: Light Violett `#AC3F90`, Dark Violett `#662483`, Dunkelgrau `#3C3C3B` (Fließtext), Grundfläche Weiß
- Theme-Farben der Website (`foreground`, `ecru-white`, `thunder`, `primary`) als CSS-Variablen mit gekennzeichneten Platzhalterwerten
- Expertenwissen und Erfahrung farblich unterscheidbar
- Logo nur mit gelieferter Datei: komplett, zweifarbig, auf Weiß, mit Schutzraum
- Schreibweisen: „Menschen mit Krebs“; „SURVIVORS HOME“ in Versalien, ohne Fettdruck, Unterstreichung, Apostroph, Einfärbung
- Deutsch, Präsens, keine Gendersprache, deutsche Anführungszeichen; Oberflächentexte ohne direkte Anrede
- Ruhig, gut lesbar, Zielgruppe ab 50; Bewegung nur als Antwort auf Bedienung; `prefers-reduced-motion` beachten
- Schrift in `rem`, Layout hält 200 % Textgröße, Touch-Flächen ≥ 44 × 44 px, sichtbarer Fokus

## Arbeitsweise

- Der Auftraggeber programmiert nicht: Alles, was er selbst tun muss (GitHub, Vimeo, Tests auf dem Telefon), als Schritt-für-Schritt-Klickanleitung
- Antworten auf Deutsch, knapp, sachlich; Unklares offen benennen statt raten
- Entwicklungszweig: `claude/ecstatic-brown-cfkhic`
