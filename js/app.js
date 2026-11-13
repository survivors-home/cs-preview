/*
 * Oberfläche des Funktionsdummys „Menschen mit Krebs“
 *
 * Parameter: ?modus=vimeo (echte Wiedergabe, sonst Simulation), ?aufteilung=zwei-drittel, ?diagnose=1
 * Verlinkung eines Elements: #seg-<element-id>
 *
 * Wichtig für iOS (Test 13.11.2026): Ein Start mit Ton gelingt nur, wenn der Startbefehl im selben
 * Antippen an einen bereits geladenen Player geht. Deshalb rufen alle Bedienelemente
 * vorrat.starten() / vorrat.abspielen() als Erstes und ohne vorheriges await auf.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const parameter = new URLSearchParams(location.search);
  const MODUS = window.MMKVorrat.modusAusUrl();
  const DIAGNOSE = parameter.get('diagnose') === '1';
  const RUHIG = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MERK_SCHLUESSEL = 'mmk-merkliste-v1';
  const AUFTEILUNG_SCHLUESSEL = 'mmk-aufteilung';
  const VERLAUF_BEHALTEN = 2; // so viele zurückliegende Elemente behalten ihren Player

  const S = {
    daten: null, vorrat: null,
    warteschlange: [], vorschlaege: [], ausgeblendet: new Set(),
    verlauf: [], index: -1, popIgnorieren: 0,
    wortlaut: new Map(),
    aktivId: null, element: null, seg: null, segId: null, segIdZiel: null,
    worte: [], wortIndex: -1, absatzIndex: -1,
    marker: [], markerGezeigt: new Set(),
    mitlaufen: true, nutzerBis: 0, programmBis: 0,
    gesamt: false, segmentEnde: false, imSegment: false,
    rate: 1, angehalten: false, startTimer: null, miniTimer: null,
    merkliste: [], dialogInfo: null, dialogLiefVorher: false
  };

  /* ---------- Hilfen ---------- */
  function log(text) {
    if (!DIAGNOSE) return;
    const d = $('diagnose');
    d.hidden = false;
    d.textContent = (performance.now() / 1000).toFixed(1) + '  ' + text + '\n' + d.textContent.slice(0, 5000);
  }
  function uhr(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x;
  }
  function melde(text) {
    const m = $('meldung');
    m.textContent = text;
    m.hidden = false;
    clearTimeout(melde.t);
    melde.t = setTimeout(() => { m.hidden = true; }, 2600);
  }
  const el = (id) => S.daten.elemente[id];
  const istVideo = (e) => !!e && e.typ === 'videosegment';
  const veranstaltung = (e) => S.daten.veranstaltungen[e.veranstaltung];
  function videoVon(e) {
    const v = veranstaltung(e);
    return { id: v.vimeo.id, h: v.vimeo.h, dauer: v.dauer };
  }
  function typText(e) {
    if (!istVideo(e)) return 'Platzhalter · ' + e.typ_label;
    return { expertenwissen: 'Expertenwissen', erfahrung: 'Erfahrung', gemischt: 'Expertenwissen und Erfahrung', moderation: 'Gespräch' }[e.schwerpunkt] || 'Videosegment';
  }
  function ersterSatz(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/^.*?[.!?](\s|$)/);
    let s = m ? m[0].trim() : t;
    if (s.length > 125) s = s.slice(0, 122).replace(/\s+\S*$/, '') + ' …';
    return s;
  }

  /* ---------- Merkliste ---------- */
  function merkLaden() {
    try { S.merkliste = JSON.parse(localStorage.getItem(MERK_SCHLUESSEL) || '[]'); } catch (e) { S.merkliste = []; }
  }
  function merkSichern() {
    try { localStorage.setItem(MERK_SCHLUESSEL, JSON.stringify(S.merkliste)); } catch (e) { melde('Merken ist in diesem Browser nicht möglich'); }
  }
  const istGemerkt = (id) => S.merkliste.some((m) => m.id === id);
  function merkUmschalten(eintrag) {
    if (istGemerkt(eintrag.id)) S.merkliste = S.merkliste.filter((m) => m.id !== eintrag.id);
    else S.merkliste.push(eintrag);
    merkSichern();
    merkZeigen();
    melde(istGemerkt(eintrag.id) ? 'Zur Merkliste hinzugefügt' : 'Aus der Merkliste entfernt');
  }
  function merkKnopf(knopf, an) {
    knopf.setAttribute('aria-pressed', String(an));
    if (knopf.classList.contains('symbol')) {
      knopf.setAttribute('aria-label', an ? 'Gemerkt' : 'Merken');
      knopf.title = an ? 'Gemerkt' : 'Merken';
    } else {
      knopf.innerHTML = '<span aria-hidden="true">' + (an ? '★' : '☆') + '</span> ' + (an ? 'Gemerkt' : 'Merken');
    }
  }
  function merkZeigen() {
    $('merkZahl').textContent = S.merkliste.length;
    const ul = $('merkliste');
    ul.innerHTML = '';
    $('merklisteLeer').hidden = S.merkliste.length > 0;
    S.merkliste.forEach((m) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oeffnen';
      b.innerHTML = '<span class="art"></span><span class="titel"></span>';
      b.querySelector('.art').textContent = m.art;
      b.querySelector('.titel').textContent = m.titel;
      b.addEventListener('click', () => merkOeffnen(m));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'entfernen';
      x.textContent = '✕';
      x.setAttribute('aria-label', 'Entfernen: ' + m.titel);
      x.addEventListener('click', () => {
        S.merkliste = S.merkliste.filter((y) => y.id !== m.id);
        merkSichern();
        merkZeigen();
      });
      li.append(b, x);
      ul.appendChild(li);
    });
    if (S.element) merkKnopf($('merken'), istGemerkt(S.element.id));
    if (S.dialogInfo) merkKnopf($('infoMerken'), istGemerkt(S.dialogInfo.id));
  }
  function merkOeffnen(m) {
    leisteZu();
    if (m.typ === 'info') { infoOeffnen(m.id); return; }
    if (m.id === S.aktivId || !el(m.id)) return;
    const e = el(m.id);
    if (istVideo(e) && S.vorrat.hat(m.id)) S.vorrat.starten(m.id, e.start);
    aktivieren(m.id, { schonGestartet: istVideo(e) && S.vorrat.hat(m.id) });
  }

  /* ---------- Seitliche Leiste ---------- */
  function leisteAuf() {
    $('leiste').hidden = false;
    $('abdeckung').hidden = false;
    $('leisteAuf').setAttribute('aria-expanded', 'true');
    $('leisteZu').focus();
  }
  function leisteZu() {
    $('leiste').hidden = true;
    $('abdeckung').hidden = true;
    $('leisteAuf').setAttribute('aria-expanded', 'false');
  }
  function aufteilungSetzen(wert, speichern) {
    document.body.classList.toggle('aufteilung-zwei-drittel', wert === 'zwei-drittel');
    document.querySelectorAll('input[name="aufteilung"]').forEach((r) => { r.checked = r.value === wert; });
    if (speichern) { try { localStorage.setItem(AUFTEILUNG_SCHLUESSEL, wert); } catch (e) { /* egal */ } }
  }

  /* ---------- Status des Players ---------- */
  function statusSetzen(s) {
    const spielt = s === 'spielt';
    document.body.classList.toggle('spielt', spielt);
    if (spielt) {
      clearTimeout(S.startTimer);
      document.body.classList.remove('startet');
      $('ladeanzeige').hidden = true;
      $('endeHinweis').hidden = true;
    } else {
      $('ladeanzeige').hidden = s !== 'laedt';
    }
    document.body.classList.toggle('angehalten', S.angehalten && !spielt);
  }
  function startUeberwachen() {
    document.body.classList.add('startet');
    $('ladeanzeige').hidden = false;
    clearTimeout(S.startTimer);
    S.startTimer = setTimeout(() => {
      document.body.classList.remove('startet');
      if (S.vorrat.pausiert()) { $('ladeanzeige').hidden = true; log('Start nicht bestätigt'); }
    }, 6000);
  }

  /* ---------- Aktivieren eines Elements ---------- */
  // opt.schonGestartet: der Aufrufer hat vorrat.starten() bereits im Antippen ausgeführt
  // opt.verlaufIndex: Wechsel innerhalb des Verlaufs; sonst neuer Verlaufseintrag
  function aktivieren(id, opt) {
    opt = opt || {};
    const e = el(id);
    if (!e) return;
    animieren(S.element ? S.element.titel : null, opt.vonRect, e.titel, opt.verlaufIndex !== undefined && opt.verlaufIndex < S.index);
    if (opt.verlaufIndex !== undefined) {
      S.index = opt.verlaufIndex;
    } else {
      S.verlauf = S.verlauf.slice(0, S.index + 1);
      S.verlauf.push(id);
      S.index = S.verlauf.length - 1;
      const zustand = { i: S.index };
      if (opt.ersetzen) history.replaceState(zustand, '', '#seg-' + id);
      else history.pushState(zustand, '', '#seg-' + id);
    }
    S.vorschlaege = S.vorschlaege.filter((x) => x !== id);
    fuellen();
    anzeigen(id, !!opt.schonGestartet);
    vorschlaegeZeigen();
    playerPflegen();
  }

  function anzeigen(id, gestartet) {
    const e = el(id);
    S.aktivId = id;
    S.element = e;
    S.gesamt = false;
    S.segmentEnde = false;
    S.imSegment = false;
    S.mitlaufen = true;
    S.angehalten = false;
    S.markerGezeigt = new Set();
    clearTimeout(S.startTimer);
    document.body.classList.remove('startet');
    $('endeHinweis').hidden = true;
    $('miniInfo').hidden = true;
    $('haltHinweis').hidden = true;
    $('zeitleisteBereich').hidden = true;
    $('zurStelle').hidden = true;
    $('gesamt').classList.remove('betont');
    $('gesamt').setAttribute('aria-pressed', 'false');
    document.body.classList.toggle('ohne-video', !istVideo(e));

    $('startbild').classList.toggle('platzhalter', !istVideo(e));
    $('startbildTitel').textContent = e.titel;
    $('startbildTyp').textContent = istVideo(e)
      ? typText(e) + (MODUS === 'simulation' ? ' · Simulation ohne Video' : '')
      : 'Platzhalter · ' + e.typ_label;
    $('quelle').textContent = istVideo(e) ? veranstaltung(e).anzeigename : '';
    $('bildZeit').textContent = '';
    $('gesamt').hidden = !istVideo(e);
    merkKnopf($('merken'), istGemerkt(id));
    verlaufZeigen();

    if (istVideo(e)) {
      if (!gestartet) {
        S.vorrat.vorbereiten(id, videoVon(e), e.start);
        S.vorrat.zeigen(id);
      }
      if (S.rate !== 1) S.vorrat.geschwindigkeit(S.rate);
      statusSetzen(S.vorrat.pausiert() ? 'pausiert' : 'spielt');
      if (gestartet && S.vorrat.pausiert()) startUeberwachen();
      S.segIdZiel = id;
      transkriptLaden(e, id);
    } else {
      S.vorrat.zeigen(null);
      statusSetzen('pausiert');
      platzhalterText(e);
    }
  }

  /* ---------- Animation: Kachel rutscht nach oben, bisheriges Element nach hinten links ---------- */
  function animieren(alterTitel, vonRect, neuerTitel, zurueck) {
    if (RUHIG) return;
    const karte = $('karte').getBoundingClientRect();
    const geist = (klasse, text, r) => {
      const g = document.createElement('div');
      g.className = 'geist ' + klasse;
      g.textContent = text;
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', transformOrigin: 'top left' });
      document.body.appendChild(g);
      g.getBoundingClientRect();
      setTimeout(() => g.remove(), 600);
      return g;
    };
    if (alterTitel) {
      const g = geist('', alterTitel, karte);
      const richtung = zurueck ? 1 : -1;
      requestAnimationFrame(() => {
        g.style.transform = 'translateX(' + (richtung * karte.width * 0.92) + 'px) scale(0.92)';
        g.style.opacity = '0';
      });
    }
    if (vonRect) {
      const k = geist('kachel-geist', neuerTitel, vonRect);
      const dx = karte.left - vonRect.left, dy = karte.top - vonRect.top;
      const sx = karte.width / vonRect.width, sy = karte.height / vonRect.height;
      requestAnimationFrame(() => {
        k.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ')';
        k.style.opacity = '0';
      });
    }
  }

  /* ---------- Verlauf ---------- */
  function verlaufZeigen() {
    const zurueck = S.index > 0, vor = S.index < S.verlauf.length - 1;
    $('karteZurueck').hidden = !zurueck;
    $('karteVor').hidden = !vor;
    document.body.classList.toggle('hat-zurueck', zurueck);
    document.body.classList.toggle('hat-vor', vor);
    if (zurueck) $('verlaufZurueck').setAttribute('aria-label', 'Zurück zu: ' + el(S.verlauf[S.index - 1]).titel);
    if (vor) $('verlaufVor').setAttribute('aria-label', 'Weiter zu: ' + el(S.verlauf[S.index + 1]).titel);
  }
  // aus einer Geste (Antippen, Wischen): Start mit Ton im selben Antippen
  function verlaufGehen(richtung) {
    const ziel = S.index + richtung;
    if (ziel < 0 || ziel >= S.verlauf.length) return;
    const id = S.verlauf[ziel];
    const e = el(id);
    const bereit = istVideo(e) && S.vorrat.hat(id);
    if (bereit) S.vorrat.starten(id, e.start);
    aktivieren(id, { verlaufIndex: ziel, schonGestartet: bereit });
    S.popIgnorieren++;
    history.go(richtung);
  }
  window.addEventListener('popstate', (ev) => {
    if (S.popIgnorieren > 0) { S.popIgnorieren--; return; }
    const i = ev.state && typeof ev.state.i === 'number' ? ev.state.i : null;
    if (i === null || i === S.index || !S.verlauf[i]) return;
    aktivieren(S.verlauf[i], { verlaufIndex: i }); // Zurück-Taste des Browsers: ohne Start, Abspielen per Antippen
  });

  /* ---------- Vorschläge ---------- */
  function fuellen() {
    while (S.vorschlaege.length < 3 && S.warteschlange.length) {
      const id = S.warteschlange.shift();
      if (!el(id) || id === S.aktivId || S.verlauf.includes(id) || S.ausgeblendet.has(id) || S.vorschlaege.includes(id)) continue;
      S.vorschlaege.push(id);
    }
  }
  function vorschlaegeZeigen(neuId) {
    const ul = $('kacheln');
    ul.innerHTML = '';
    S.vorschlaege.forEach((id) => ul.appendChild(kachelBauen(id, id === neuId)));
    $('keineVorschlaege').hidden = S.vorschlaege.length > 0;
  }
  function kachelBauen(id, neu) {
    const e = el(id), video = istVideo(e);
    const li = document.createElement('li');
    li.className = 'kachel' + (neu ? ' neu' : '');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kachel-auswahl';
    const bild = document.createElement('span');
    bild.className = 'kachel-bild' + (video ? '' : ' platzhalter');
    bild.setAttribute('aria-hidden', 'true');
    bild.textContent = video ? veranstaltung(e).reihe : 'Platzhalter';
    const text = document.createElement('span');
    const typ = document.createElement('span');
    typ.className = 'kachel-typ typ-' + (video ? e.schwerpunkt : 'platzhalter');
    typ.textContent = typText(e) + (video ? ' · ' + uhr(e.ende - e.start) : '');
    const titel = document.createElement('span');
    titel.className = 'kachel-titel';
    titel.textContent = e.titel;
    const zus = document.createElement('span');
    zus.className = 'kachel-text';
    zus.textContent = ersterSatz(e.zusammenfassung);
    text.append(typ, titel, zus);
    b.append(bild, text);
    b.addEventListener('click', () => kachelAntippen(id, li));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ausblenden';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Ausblenden: ' + e.titel);
    x.addEventListener('click', () => ausblenden(id, li));
    li.append(b, x);
    return li;
  }
  function kachelAntippen(id, li) {
    const e = el(id);
    // zuerst starten: Videoanfrage sofort beim Antippen, nicht erst nach der Animation
    let gestartet = false;
    if (istVideo(e)) {
      S.vorrat.vorbereiten(id, videoVon(e), e.start);
      S.vorrat.starten(id, e.start);
      gestartet = true;
    }
    aktivieren(id, { schonGestartet: gestartet, vonRect: li.getBoundingClientRect() });
  }
  function ausblenden(id, li) {
    const weiter = () => {
      S.ausgeblendet.add(id);
      S.vorschlaege = S.vorschlaege.filter((x) => x !== id);
      const vorher = S.vorschlaege.slice();
      fuellen();
      const neu = S.vorschlaege.find((x) => !vorher.includes(x));
      vorschlaegeZeigen(neu);
      playerPflegen();
    };
    if (RUHIG) { weiter(); return; }
    li.style.opacity = '0';
    setTimeout(weiter, 250);
  }
  function playerPflegen() {
    const behalten = [S.aktivId];
    S.vorschlaege.forEach((id) => {
      const e = el(id);
      if (istVideo(e)) { S.vorrat.vorbereiten(id, videoVon(e), e.start); behalten.push(id); }
    });
    for (let k = 1; k <= VERLAUF_BEHALTEN; k++) if (S.verlauf[S.index - k]) behalten.push(S.verlauf[S.index - k]);
    if (S.verlauf[S.index + 1]) behalten.push(S.verlauf[S.index + 1]);
    S.vorrat.behalten(behalten);
    log('Player: ' + S.vorrat.plaetze.size);
  }

  /* ---------- Wortlaut ---------- */
  function wortlautLaden(vid) {
    if (!S.wortlaut.has(vid)) {
      S.wortlaut.set(vid, fetch(S.daten.veranstaltungen[vid].wortlaut).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }));
    }
    return S.wortlaut.get(vid);
  }
  async function transkriptLaden(e, segId) {
    const box = $('transkript');
    if (!S.gesamt || !S.seg) box.innerHTML = '<p class="transkript-hinweis">Wortlaut wird geladen …</p>';
    try {
      const d = await wortlautLaden(e.veranstaltung);
      if (S.aktivId !== e.id || S.segIdZiel !== segId) return;
      transkriptZeigen(segId ? d.segmente[segId] : null, segId);
    } catch (err) {
      box.innerHTML = '<p class="transkript-hinweis">Wortlaut nicht verfügbar.</p>';
      log('Wortlaut: ' + err.message);
    }
  }
  function sprecherText(ab) {
    const rolle = S.daten.typen[ab.typ] || '';
    if (['moderation', 'unklar', 'sprachausgabe'].includes(ab.person)) return [ab.name];
    if (ab.person === 'publikum') return ab.typ === 'publikumsfrage' ? ['Publikumsfrage'] : [rolle, 'Publikum'];
    return rolle ? [rolle, ab.name] : [ab.name];
  }
  function sprecherZeigen(ab) {
    const z = $('sprecher');
    z.className = 'sprecher' + (ab ? ' typ-' + ab.typ : ' leer');
    const teile = ab ? sprecherText(ab) : [''];
    $('sprecherRolle').textContent = teile[0] || '';
    $('sprecherName').textContent = teile[1] || '';
  }
  function transkriptZeigen(seg, segId) {
    const box = $('transkript');
    box.innerHTML = '';
    box.scrollTop = 0;
    S.seg = seg;
    S.segId = segId;
    S.worte = [];
    S.wortIndex = -1;
    S.absatzIndex = -1;
    S.marker = [];
    if (!seg) {
      box.innerHTML = '<p class="transkript-hinweis">Für diesen Teil der Veranstaltung gibt es keinen Wortlaut (zum Beispiel Begrüßung oder Abmoderation).</p>';
      sprecherZeigen(null);
      return;
    }
    const frag = document.createDocumentFragment();
    const absatzStart = [];
    seg.absaetze.forEach((ab, ai) => {
      absatzStart.push(S.worte.length);
      const p = document.createElement('p');
      p.className = 'absatz typ-' + ab.typ;
      const k = document.createElement('span');
      k.className = 'absatz-name';
      k.textContent = sprecherText(ab).join(' · ');
      p.appendChild(k);
      ab.w.forEach((wort, wi) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = wort;
        p.appendChild(s);
        p.appendChild(document.createTextNode(' '));
        S.worte.push({ t: ab.t[wi] / 100, el: s, a: ai });
      });
      frag.appendChild(p);
    });
    box.appendChild(frag);
    (seg.marker || []).forEach((m) => {
      const info = infoDaten(m.ref);
      if (!info) return;
      for (let k = 0; k < m.n; k++) {
        const w = S.worte[absatzStart[m.a] + m.i + k];
        if (!w) continue;
        w.el.classList.add('marke');
        w.el.dataset.ref = m.ref;
        if (k === 0) { w.el.setAttribute('role', 'button'); w.el.tabIndex = 0; w.el.setAttribute('aria-label', info.art + ': ' + info.titel); }
      }
      S.marker.push({ ref: m.ref, t: m.t / 100 });
    });
    sprecherZeigen(seg.absaetze[0]);
  }
  function platzhalterText(e) {
    S.seg = null;
    S.segId = null;
    S.worte = [];
    S.marker = [];
    const box = $('transkript');
    box.innerHTML = '<p><span class="kennzeichnung">Platzhalter</span></p><p class="ph"></p><p class="transkript-hinweis">Hier stünde je nach Typ der Wortlaut, ein Textauszug oder Kontaktinformationen. Keine echten Inhalte, keine Kontaktdaten.</p>';
    box.querySelector('.ph').textContent = e.zusammenfassung;
    sprecherZeigen(null);
  }
  function wortSuchen(t) {
    const w = S.worte;
    if (!w.length || t < w[0].t) return -1;
    let lo = 0, hi = w.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (w[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function wortSetzen(i) {
    const alt = S.worte[S.wortIndex];
    if (alt) alt.el.classList.remove('jetzt');
    S.wortIndex = i;
    const w = S.worte[i];
    if (!w) return;
    w.el.classList.add('jetzt');
    if (w.a !== S.absatzIndex) {
      S.absatzIndex = w.a;
      sprecherZeigen(S.seg.absaetze[w.a]);
    }
    if (S.mitlaufen) mitscrollen(w.el);
    $('zeileQuer').textContent = S.worte.slice(Math.max(0, i - 5), i + 7).map((x) => x.el.textContent).join(' ');
  }
  function mitscrollen(span) {
    const box = $('transkript');
    const oben = span.offsetTop;
    const h = box.clientHeight;
    const rel = oben - box.scrollTop;
    if (rel < h * 0.12 || rel > h * 0.62) {
      S.programmBis = performance.now() + 900;
      box.scrollTo({ top: Math.max(0, oben - h * 0.3), behavior: RUHIG ? 'auto' : 'smooth' });
    }
  }

  /* ---------- Zusatzinformationen ---------- */
  function infoDaten(ref) {
    const g = S.daten.glossar[ref];
    if (g) return { id: ref, art: 'Glossar', titel: g.begriff, text: g.text, status: g.status || '', url: '' };
    const z = S.daten.zusatzinfos[ref];
    if (z) {
      return {
        id: ref, art: z.art === 'download' ? 'Download' : 'Link', titel: z.titel, text: z.text,
        status: z.beispiel ? 'Beispiel – kein echter Inhalt' : '', url: z.url || ''
      };
    }
    return null;
  }
  function markerPruefen(t) {
    for (const m of S.marker) {
      if (!S.markerGezeigt.has(m.ref) && t >= m.t && t < m.t + 3) {
        S.markerGezeigt.add(m.ref);
        miniZeigen(m.ref);
      }
    }
  }
  function miniZeigen(ref) {
    const info = infoDaten(ref);
    if (!info) return;
    const b = $('miniInfo');
    b.innerHTML = '<b></b> <span></span>';
    b.querySelector('b').textContent = info.art + ':';
    b.querySelector('span').textContent = info.titel;
    b.dataset.ref = ref;
    b.hidden = false;
    clearTimeout(S.miniTimer);
    S.miniTimer = setTimeout(() => { b.hidden = true; }, 9000);
  }
  function infoOeffnen(ref) {
    const info = infoDaten(ref);
    if (!info) return;
    S.dialogInfo = info;
    S.dialogLiefVorher = !S.vorrat.pausiert();
    if (S.dialogLiefVorher) S.vorrat.pausieren();
    $('infoArt').textContent = info.art;
    $('infoTitel').textContent = info.titel;
    $('infoStatus').hidden = !info.status;
    $('infoStatus').textContent = info.status;
    $('infoText').textContent = info.text;
    const a = $('infoLink');
    a.hidden = !info.url;
    if (info.url) {
      a.href = info.url;
      a.textContent = 'Website öffnen: ' + new URL(info.url).hostname.replace(/^www\./, '');
    }
    merkKnopf($('infoMerken'), istGemerkt(info.id));
    $('infoDialog').hidden = false;
    $('infoSchliessen').focus();
  }
  function infoSchliessen() {
    $('infoDialog').hidden = true;
    if (S.dialogLiefVorher) S.vorrat.abspielen();
    S.dialogLiefVorher = false;
    S.dialogInfo = null;
  }

  /* ---------- Segmentende und ganze Veranstaltung ---------- */
  function segmentEnde() {
    S.segmentEnde = true;
    S.vorrat.pausieren();
    $('endeHinweis').hidden = false;
    $('gesamt').classList.add('betont');
  }
  function gesamtStarten(abspielen) {
    const e = S.element;
    if (!istVideo(e)) return;
    if (abspielen) S.vorrat.abspielen();
    S.gesamt = true;
    S.segmentEnde = false;
    $('endeHinweis').hidden = true;
    $('gesamt').classList.remove('betont');
    $('gesamt').setAttribute('aria-pressed', 'true');
    zeitleisteBauen();
    $('zeitleisteBereich').hidden = false;
  }
  function gesamtBeenden() {
    const e = S.element;
    S.gesamt = false;
    $('zeitleisteBereich').hidden = true;
    $('gesamt').setAttribute('aria-pressed', 'false');
    const t = S.vorrat.zeit();
    S.vorrat.pausieren();
    if (t < e.start - 1 || t > e.ende) S.vorrat.springen(e.start);
    S.segmentEnde = t >= e.ende;
    if (S.segId !== e.id) { S.segIdZiel = e.id; transkriptLaden(e, e.id); }
  }
  function zeitleisteBauen() {
    const e = S.element, v = veranstaltung(e), zl = $('zeitleiste');
    zl.innerHTML = '';
    zl.setAttribute('aria-valuemax', String(Math.round(v.dauer)));
    v.segmente.forEach((s) => {
      const d = document.createElement('div');
      d.className = 'zl-seg' + (s.id === e.id ? ' ursprung' : '');
      d.style.left = (s.start / v.dauer * 100) + '%';
      d.style.width = ((s.ende - s.start) / v.dauer * 100) + '%';
      d.dataset.id = s.id;
      zl.appendChild(d);
    });
    const pos = document.createElement('div');
    pos.className = 'zl-pos';
    pos.id = 'zlPos';
    zl.appendChild(pos);
  }
  function zeitleisteAktualisieren(t) {
    const v = veranstaltung(S.element);
    const pos = $('zlPos');
    if (pos) pos.style.left = Math.min(100, Math.max(0, t / v.dauer * 100)) + '%';
    $('zeitleisteZeit').textContent = uhr(t) + ' / ' + uhr(v.dauer);
    $('zeitleiste').setAttribute('aria-valuenow', String(Math.round(t)));
    $('zeitleiste').setAttribute('aria-valuetext', uhr(t));
  }
  function gesamtSegmentPruefen(t) {
    const v = veranstaltung(S.element);
    const s = v.segmente.find((x) => t >= x.start && t < x.ende);
    const ziel = s ? s.id : null;
    if (ziel === S.segIdZiel) return;
    S.segIdZiel = ziel;
    document.querySelectorAll('.zl-seg').forEach((d) => d.classList.toggle('aktuell', d.dataset.id === ziel));
    if (ziel) transkriptLaden(S.element, ziel);
    else transkriptZeigen(null, null);
  }

  /* ---------- Takt: Hervorhebung, Zeit, Zusatzinfos, Segmentende ---------- */
  function takt() {
    requestAnimationFrame(takt);
    const e = S.element;
    if (!istVideo(e)) return;
    const t = S.vorrat.zeit();
    const laeuft = !S.vorrat.pausiert();
    if (S.gesamt) {
      zeitleisteAktualisieren(t);
      $('bildZeit').textContent = uhr(t) + ' / ' + uhr(veranstaltung(e).dauer);
      gesamtSegmentPruefen(t);
    } else {
      $('bildZeit').textContent = uhr(Math.max(0, Math.min(t, e.ende) - e.start)) + ' / ' + uhr(e.ende - e.start);
    }
    if (S.worte.length) {
      const i = wortSuchen(t);
      if (i !== S.wortIndex) wortSetzen(i);
    }
    if (laeuft) markerPruefen(t);
    if (t >= e.start - 1 && t < e.ende) S.imSegment = true;
    if (!S.gesamt && !S.segmentEnde && S.imSegment && laeuft && t >= e.ende && t < e.ende + 30) segmentEnde();
  }

  /* ---------- Bedienung ---------- */
  function bedienungEinrichten() {
    $('grossAbspielen').addEventListener('click', () => {
      const e = S.element;
      if (!istVideo(e)) return;
      if (!S.vorrat.hat(e.id)) { S.vorrat.vorbereiten(e.id, videoVon(e), e.start); S.vorrat.zeigen(e.id); }
      S.vorrat.abspielen();
      if (S.vorrat.pausiert()) startUeberwachen();
    });
    $('zurueck10').addEventListener('click', () => S.vorrat.springen(Math.max(0, S.vorrat.zeit() - 10)));
    $('vor10').addEventListener('click', () => S.vorrat.springen(S.vorrat.zeit() + 10));
    $('tempo').addEventListener('click', () => {
      const ziel = S.rate === 2 ? 1 : 2;
      S.vorrat.geschwindigkeit(ziel).then((ok) => {
        if (!ok) {
          $('tempo').hidden = true;
          melde('Doppelte Geschwindigkeit ist nicht verfügbar');
          return;
        }
        S.rate = ziel;
        $('tempo').textContent = ziel + '×';
        $('tempo').setAttribute('aria-pressed', String(ziel === 2));
      });
    });

    // Videofläche: Gedrückthalten hält an, Loslassen setzt fort, kurzes Antippen wechselt Abspielen und Pause
    const ebene = $('ebene');
    let timer = null, gehalten = false, warAn = false, x0 = 0, y0 = 0, bewegt = false;
    ebene.addEventListener('contextmenu', (ev) => ev.preventDefault());
    ebene.addEventListener('pointerdown', (ev) => {
      if (!istVideo(S.element)) return;
      x0 = ev.clientX; y0 = ev.clientY; bewegt = false; gehalten = false;
      warAn = !S.vorrat.pausiert();
      timer = setTimeout(() => {
        timer = null;
        gehalten = true;
        if (warAn) {
          S.angehalten = true;
          S.vorrat.pausieren();
          $('haltHinweis').hidden = false;
          document.body.classList.add('angehalten');
        }
      }, 300);
    });
    ebene.addEventListener('pointermove', (ev) => {
      if (Math.abs(ev.clientX - x0) > 12 || Math.abs(ev.clientY - y0) > 12) {
        bewegt = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    });
    const loslassen = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        if (!bewegt) {
          if (S.vorrat.pausiert()) { S.vorrat.abspielen(); if (S.vorrat.pausiert()) startUeberwachen(); } else S.vorrat.pausieren();
        }
      } else if (gehalten) {
        $('haltHinweis').hidden = true;
        S.angehalten = false;
        document.body.classList.remove('angehalten');
        if (warAn) S.vorrat.abspielen();
      }
      gehalten = false;
    };
    ebene.addEventListener('pointerup', loslassen);
    ebene.addEventListener('pointercancel', () => { if (timer) clearTimeout(timer); timer = null; if (gehalten) loslassen(); });

    // Wischen über die Karte blättert im Verlauf; nicht am Bildschirmrand beginnen (Zurück-Geste von iOS)
    const karte = $('karte');
    let wx = 0, wy = 0, wischen = false;
    karte.addEventListener('pointerdown', (ev) => {
      wischen = ev.clientX > 28 && ev.clientX < window.innerWidth - 28;
      wx = ev.clientX; wy = ev.clientY;
    });
    karte.addEventListener('pointerup', (ev) => {
      if (!wischen) return;
      wischen = false;
      const dx = ev.clientX - wx, dy = ev.clientY - wy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) verlaufGehen(dx > 0 ? -1 : 1);
    });
    karte.addEventListener('pointercancel', () => { wischen = false; });
    $('verlaufZurueck').addEventListener('click', () => verlaufGehen(-1));
    $('verlaufVor').addEventListener('click', () => verlaufGehen(1));

    // Wortlaut: manuelles Scrollen setzt das Mitlaufen aus
    const tr = $('transkript');
    ['touchstart', 'wheel', 'keydown', 'pointerdown'].forEach((name) =>
      tr.addEventListener(name, () => { S.nutzerBis = performance.now() + 1500; }, { passive: true }));
    tr.addEventListener('scroll', () => {
      const n = performance.now();
      if (S.mitlaufen && n < S.nutzerBis && n > S.programmBis) {
        S.mitlaufen = false;
        $('zurStelle').hidden = false;
      }
    }, { passive: true });
    $('zurStelle').addEventListener('click', () => {
      S.mitlaufen = true;
      $('zurStelle').hidden = true;
      const w = S.worte[S.wortIndex];
      if (w) {
        S.programmBis = performance.now() + 900;
        tr.scrollTo({ top: Math.max(0, w.el.offsetTop - tr.clientHeight * 0.3), behavior: RUHIG ? 'auto' : 'smooth' });
      }
    });
    tr.addEventListener('click', (ev) => {
      const m = ev.target.closest('.marke');
      if (m) infoOeffnen(m.dataset.ref);
    });
    tr.addEventListener('keydown', (ev) => {
      const m = ev.target.closest && ev.target.closest('.marke');
      if (m && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); infoOeffnen(m.dataset.ref); }
    });

    $('miniInfo').addEventListener('click', () => {
      $('miniInfo').hidden = true;
      infoOeffnen($('miniInfo').dataset.ref);
    });
    $('infoSchliessen').addEventListener('click', infoSchliessen);
    $('infoMerken').addEventListener('click', () => {
      const i = S.dialogInfo;
      if (i) merkUmschalten({ id: i.id, typ: 'info', art: i.art, titel: i.titel });
    });
    $('infoDialog').addEventListener('click', (ev) => { if (ev.target === $('infoDialog')) infoSchliessen(); });

    $('merken').addEventListener('click', () => {
      const e = S.element;
      if (e) merkUmschalten({ id: e.id, typ: 'element', art: typText(e), titel: e.titel });
    });
    $('teilen').addEventListener('click', async () => {
      const e = S.element;
      if (!e) return;
      const url = location.origin + location.pathname + location.search + '#seg-' + e.id;
      if (navigator.share) {
        try { await navigator.share({ title: e.titel, text: e.titel + ' – Menschen mit Krebs', url }); } catch (err) { /* abgebrochen */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); melde('Link kopiert'); } catch (err) { melde(url); }
    });
    $('gesamt').addEventListener('click', () => { if (S.gesamt) gesamtBeenden(); else gesamtStarten(false); });
    $('endeGesamt').addEventListener('click', () => gesamtStarten(true));
    $('gesamtAnfang').addEventListener('click', () => S.vorrat.springen(0));
    $('gesamtSchliessen').addEventListener('click', gesamtBeenden);
    const zl = $('zeitleiste');
    zl.addEventListener('pointerdown', (ev) => {
      const r = zl.getBoundingClientRect();
      const anteil = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      S.vorrat.springen(anteil * veranstaltung(S.element).dauer);
      if (S.vorrat.pausiert()) S.vorrat.abspielen();
    });
    zl.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); S.vorrat.springen(S.vorrat.zeit() + 10); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); S.vorrat.springen(Math.max(0, S.vorrat.zeit() - 10)); }
    });

    $('leisteAuf').addEventListener('click', leisteAuf);
    $('leisteZu').addEventListener('click', leisteZu);
    $('abdeckung').addEventListener('click', leisteZu);
    document.querySelectorAll('input[name="aufteilung"]').forEach((r) =>
      r.addEventListener('change', () => aufteilungSetzen(r.value, true)));
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!$('infoDialog').hidden) infoSchliessen();
      else if (!$('leiste').hidden) leisteZu();
    });
  }

  function modusAnzeigen() {
    const andere = MODUS === 'vimeo' ? 'simulation' : 'vimeo';
    const p = new URLSearchParams(location.search);
    if (andere === 'vimeo') p.set('modus', 'vimeo'); else p.delete('modus');
    const ziel = location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash;
    const t = $('modusText');
    t.textContent = MODUS === 'vimeo'
      ? 'Betriebsart: echte Wiedergabe über Vimeo. '
      : 'Betriebsart: Simulation, die Zeit läuft ohne Video. ';
    const a = document.createElement('a');
    a.href = ziel;
    a.textContent = MODUS === 'vimeo' ? 'Zur Simulation wechseln' : 'Zur echten Wiedergabe wechseln';
    t.appendChild(a);
  }

  function skriptLaden(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Skript nicht geladen: ' + src));
      document.head.appendChild(s);
    });
  }

  async function start() {
    merkLaden();
    let aufteilung = parameter.get('aufteilung');
    if (!aufteilung) { try { aufteilung = localStorage.getItem(AUFTEILUNG_SCHLUESSEL); } catch (e) { /* egal */ } }
    aufteilungSetzen(aufteilung === 'zwei-drittel' ? 'zwei-drittel' : 'haelfte', false);
    let modus = MODUS;
    if (modus === 'vimeo' && !(window.Vimeo && window.Vimeo.Player)) {
      try { await skriptLaden('https://player.vimeo.com/api/player.js'); } catch (e) {
        modus = 'simulation';
        melde('Vimeo nicht erreichbar, Simulation aktiv');
      }
    }
    document.body.classList.add('modus-' + modus);
    S.daten = await fetch('daten/elemente.json').then((r) => r.json());
    S.vorrat = window.MMKVorrat.erzeugen($('playerStapel'), modus, {
      onStatus: statusSetzen,
      onLog: log
    });
    modusAnzeigen();
    merkZeigen();
    bedienungEinrichten();
    const ausLink = decodeURIComponent(location.hash.replace(/^#seg-/, ''));
    const startId = S.daten.elemente[ausLink] ? ausLink : S.daten.start;
    S.warteschlange = [S.daten.start].concat(S.daten.reihenfolge).filter((x) => x !== startId);
    aktivieren(startId, { ersetzen: true });
    document.body.classList.remove('laedt');
    requestAnimationFrame(takt);
    log('Start ' + startId + ', Modus ' + modus);
  }

  start().catch((e) => {
    document.body.classList.remove('laedt');
    $('transkript').textContent = 'Fehler beim Laden: ' + e.message;
  });
})();
