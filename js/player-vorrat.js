/*
 * Player-Vorrat des Funktionsdummys „Menschen mit Krebs“
 *
 * Befund iPhone-Test 13.11.2026 (iOS 18.7, Safari): Ton gibt es nur, wenn der Startbefehl im selben
 * Antippen an einen bereits geladenen Player geht. Ein einzelner Player mit loadVideo() startet nach
 * dem Videowechsel stumm oder gar nicht. Deshalb hält der Vorrat je sichtbarer Kachel einen eigenen,
 * vorgeladenen Player bereit (iframe mit Startzeit im Fragment #t=).
 *
 * Befund 13.11.2026, 11:08: Der erste Start nach dem Laden der Seite kommt auf dem iPhone oft stumm
 * (Vimeo schaltet selbst stumm, getMuted() = true). Nach einem Antippen von „Ton an“ laufen alle Player
 * dieser Seite mit Ton. Der Vorrat meldet den Zustand deshalb über onStumm; die Oberfläche bietet dann
 * „Ton einschalten“ an.
 *
 * Schnittstelle (Simulation und Vimeo gleich):
 *   const v = MMKVorrat.erzeugen(container, 'vimeo' | 'simulation', { onZeit, onStatus, onStumm, onLog })
 *   v.vorbereiten(schluessel, video, start)   video = { id, h, dauer }; legt den Player an, falls nötig
 *   v.hat(schluessel)                         -> true, wenn ein Player bereitliegt
 *   v.starten(schluessel, start)              im Antippen aufrufen, ohne vorheriges await
 *   v.zeigen(schluessel)                      aktiv machen, ohne abzuspielen
 *   v.behalten([schluessel, …])               alle anderen Player entfernen (der aktive bleibt)
 *   v.abspielen() / v.pausieren()             im Antippen aufrufen
 *   v.springen(sekunden)
 *   v.geschwindigkeit(1 | 2)                  -> Promise<boolean>
 *   v.tonAn()                                 im Antippen aufrufen, hebt die Stummschaltung auf
 *   v.zeit(), v.pausiert(), v.stumm()         Zeit wird zwischen den Zeitmeldungen fortgeschrieben
 * Simulation: ?simstumm=1 lässt den ersten Start stumm melden (zum Prüfen der Oberfläche)
 * Status-Meldungen des aktiven Players: 'spielt', 'pausiert', 'laedt', 'ende'
 */
(function (global) {
  'use strict';

  const jetzt = () => performance.now();
  const EMBED = {
    controls: '0', playsinline: '1', autopause: '0', dnt: '1', title: '0',
    byline: '0', portrait: '0', keyboard: '0', muted: '0'
  };

  function embedUrl(video, start) {
    const p = new URLSearchParams(EMBED);
    if (video.h) p.set('h', video.h);
    return 'https://player.vimeo.com/video/' + video.id + '?' + p.toString() +
      (start ? '#t=' + Math.floor(start) + 's' : '');
  }

  class Platz {
    constructor(vorrat, schluessel, video, start) {
      this.vorrat = vorrat;
      this.schluessel = schluessel;
      this.video = video;
      this.t = start || 0;
      this.tStempel = jetzt();
      this.rate = 1;
      this.spielt = false;
      this.gespielt = false;
      this.ziel = null;
      this.stumm = false;
    }
    zeit() { return this.spielt ? this.t + ((jetzt() - this.tStempel) / 1000) * this.rate : this.t; }
    melde(name, wert) { if (this.vorrat.aktiv === this) this.vorrat.melde(name, wert); }
  }

  class VimeoPlatz extends Platz {
    constructor(vorrat, schluessel, video, start) {
      super(vorrat, schluessel, video, start);
      this.box = document.createElement('div');
      this.box.className = 'player-platz';
      const f = document.createElement('iframe');
      f.src = embedUrl(video, start);
      f.setAttribute('allow', 'autoplay; fullscreen');
      f.setAttribute('title', 'Video');
      f.setAttribute('tabindex', '-1');
      this.box.appendChild(f);
      vorrat.container.appendChild(this.box);
      const p = this.p = new global.Vimeo.Player(f);
      p.on('timeupdate', (d) => {
        this.t = d.seconds;
        this.tStempel = jetzt();
        if (this.ziel !== null) {
          if (Math.abs(d.seconds - this.ziel) > 1.5) {
            p.setCurrentTime(this.ziel).catch(() => {});
            this.t = this.ziel;
          }
          this.ziel = null;
        }
        this.melde('Zeit', this.t);
      });
      p.on('playing', () => { this.spielt = true; this.gespielt = true; this.tStempel = jetzt(); this.melde('Status', 'spielt'); this.tonPruefen(); });
      p.on('volumechange', () => this.tonPruefen());
      p.on('pause', (d) => { this.spielt = false; if (d && typeof d.seconds === 'number') this.t = d.seconds; this.melde('Status', 'pausiert'); });
      p.on('ended', () => { this.spielt = false; this.melde('Status', 'ende'); });
      p.on('bufferstart', () => this.melde('Status', 'laedt'));
      p.on('bufferend', () => this.melde('Status', this.spielt ? 'spielt' : 'pausiert'));
      p.on('seeked', (d) => { this.t = d.seconds; this.tStempel = jetzt(); });
      p.on('playbackratechange', (d) => { this.rate = d.playbackRate; });
      p.on('error', (e) => vorrat.log(schluessel + ': ' + e.name + ' – ' + e.message));
    }
    abspielen(start) {
      if (typeof start === 'number' && this.gespielt) {
        this.ziel = start;
        this.t = start;
        this.p.setCurrentTime(start).catch(() => {});
      }
      this.p.setMuted(false).catch(() => {});
      this.p.play().catch((e) => this.vorrat.log('play: ' + e.name));
    }
    tonPruefen() {
      this.p.getMuted().then((m) => {
        this.stumm = m === true;
        if (this.stumm) this.vorrat.log(this.schluessel + ': stumm');
        this.melde('Stumm', this.stumm);
      }).catch(() => {});
    }
    tonAn() {
      this.p.setMuted(false).catch(() => {});
      this.p.setVolume(1).catch(() => {});
      this.stumm = false;
      this.vorrat.tonFrei = true;
      this.melde('Stumm', false);
      setTimeout(() => this.tonPruefen(), 800);
    }
    pausieren() {
      this.t = this.zeit();
      this.spielt = false;
      this.p.pause().catch(() => {});
    }
    springen(s) {
      this.t = Math.max(0, s);
      this.tStempel = jetzt();
      this.ziel = this.t;
      this.p.setCurrentTime(this.t).then(() => { this.ziel = null; }).catch(() => {});
      this.melde('Zeit', this.t);
    }
    geschwindigkeit(r) {
      const frist = new Promise((res) => setTimeout(() => res(false), 3000));
      const aufruf = this.p.setPlaybackRate(r).then(() => {
        this.t = this.zeit();
        this.tStempel = jetzt();
        this.rate = r;
        return true;
      }).catch(() => false);
      return Promise.race([aufruf, frist]);
    }
    entfernen() {
      try { this.p.destroy(); } catch (e) { /* egal */ }
      this.box.remove();
    }
  }

  class SimPlatz extends Platz {
    constructor(vorrat, schluessel, video, start) {
      super(vorrat, schluessel, video, start);
      this.dauer = video.dauer || Infinity;
      this.takt = null;
    }
    abspielen(start) {
      if (typeof start === 'number' && this.gespielt) this.t = start;
      if (this.spielt) return;
      this.tStempel = jetzt();
      this.spielt = true;
      this.gespielt = true;
      clearInterval(this.takt);
      this.takt = setInterval(() => {
        const t = this.zeit();
        if (t >= this.dauer) {
          this.t = this.dauer;
          this.pausieren();
          this.melde('Status', 'ende');
        }
        this.melde('Zeit', Math.min(t, this.dauer));
      }, 250);
      this.melde('Status', 'spielt');
      if (this.vorrat.simStumm && !this.vorrat.tonFrei) this.stumm = true;
      this.melde('Stumm', this.stumm);
    }
    tonAn() {
      this.vorrat.tonFrei = true;
      this.stumm = false;
      this.melde('Stumm', false);
    }
    pausieren() {
      if (!this.spielt) return;
      this.t = this.zeit();
      this.spielt = false;
      clearInterval(this.takt);
      this.melde('Status', 'pausiert');
    }
    springen(s) {
      this.t = Math.max(0, Math.min(s, this.dauer));
      this.tStempel = jetzt();
      this.melde('Zeit', this.t);
    }
    geschwindigkeit(r) {
      this.t = this.zeit();
      this.tStempel = jetzt();
      this.rate = r;
      return Promise.resolve(true);
    }
    entfernen() { clearInterval(this.takt); }
  }

  class Vorrat {
    constructor(container, modus, opt) {
      this.container = container;
      this.modus = modus;
      this.opt = opt || {};
      this.plaetze = new Map();
      this.aktiv = null;
      this.tonFrei = false;
      this.simStumm = modus === 'simulation' && new URLSearchParams(global.location.search).get('simstumm') === '1';
    }
    log(text) { if (this.opt.onLog) this.opt.onLog(text); }
    melde(name, wert) { const f = this.opt['on' + name]; if (f) f(wert); }
    hat(schluessel) { return this.plaetze.has(schluessel); }
    vorbereiten(schluessel, video, start) {
      if (!video) return null;
      if (!this.plaetze.has(schluessel)) {
        const P = this.modus === 'vimeo' ? VimeoPlatz : SimPlatz;
        this.plaetze.set(schluessel, new P(this, schluessel, video, start));
      }
      return this.plaetze.get(schluessel);
    }
    zeigen(schluessel) {
      const platz = this.plaetze.get(schluessel) || null;
      this.plaetze.forEach((x) => {
        if (x !== platz && x.spielt) x.pausieren();
        if (x.box) x.box.classList.toggle('aktiv', x === platz);
      });
      this.aktiv = platz;
      this.melde('Stumm', !!(platz && platz.stumm));
      return platz;
    }
    starten(schluessel, start) {
      const platz = this.zeigen(schluessel);
      if (platz) platz.abspielen(start);
      return platz;
    }
    behalten(liste) {
      const bleiben = new Set(liste);
      this.plaetze.forEach((x, k) => {
        if (!bleiben.has(k) && x !== this.aktiv) {
          x.entfernen();
          this.plaetze.delete(k);
        }
      });
    }
    abspielen() { if (this.aktiv) this.aktiv.abspielen(); }
    tonAn() { if (this.aktiv) this.aktiv.tonAn(); }
    stumm() { return !!(this.aktiv && this.aktiv.stumm); }
    pausieren() { if (this.aktiv) this.aktiv.pausieren(); }
    springen(s) { if (this.aktiv) this.aktiv.springen(s); }
    geschwindigkeit(r) { return this.aktiv ? this.aktiv.geschwindigkeit(r) : Promise.resolve(false); }
    zeit() { return this.aktiv ? this.aktiv.zeit() : 0; }
    pausiert() { return !this.aktiv || !this.aktiv.spielt; }
  }

  global.MMKVorrat = {
    erzeugen(container, modus, opt) { return new Vorrat(container, modus, opt); },
    modusAusUrl() {
      return new URLSearchParams(global.location.search).get('modus') === 'vimeo' ? 'vimeo' : 'simulation';
    }
  };
})(window);
