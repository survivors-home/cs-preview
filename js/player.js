/*
 * Player-Adapter des Funktionsdummys „Menschen mit Krebs“
 *
 * Zwei Betriebsarten mit derselben Schnittstelle:
 *   - Simulation: interne Zeitachse, kein Video (läuft überall)
 *   - Vimeo: echter Vimeo-Player ohne Bedienoberfläche (controls=0), gesteuert über player.js
 *
 * Schnittstelle:
 *   const p = MMKPlayer.erzeugen(container, 'vimeo' | 'simulation', { onZeit, onStatus, onFehler, onLog })
 *   await p.laden(video, startSekunden)   video = { id, h, dauer }
 *   await p.abspielen()                   -> true/false (Start geklappt)
 *   p.pausieren()
 *   await p.springen(sekunden)
 *   await p.geschwindigkeit(1 | 2)        -> true/false
 *   await p.stumm(true | false)
 *   p.zeit()                              -> aktuelle Zeit, zwischen den Zeitmeldungen fortgeschrieben
 *   p.pausiert()                          -> true/false
 * Status-Werte: 'geladen', 'spielt', 'pausiert', 'puffert', 'ende'
 */
(function (global) {
  'use strict';

  const jetzt = () => performance.now();
  // Wartet höchstens ms Millisekunden auf ein Promise; liefert true (erfüllt) oder false (Frist abgelaufen)
  const frist = (p, ms) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);

  class Basis {
    constructor(opt) {
      this.opt = opt || {};
      this.rate = 1;
      this.istPausiert = true;
      this.t = 0;
      this.tStempel = jetzt();
    }
    log(text) { if (this.opt.onLog) this.opt.onLog(text); }
    melde(name, wert) { const f = this.opt['on' + name]; if (f) f(wert); }
    zeit() {
      return this.istPausiert ? this.t : this.t + ((jetzt() - this.tStempel) / 1000) * this.rate;
    }
    pausiert() { return this.istPausiert; }
  }

  /* ---------- Simulation ---------- */
  class Simulation extends Basis {
    constructor(container, opt) {
      super(opt);
      this.modus = 'simulation';
      this.container = container;
      this.dauer = Infinity;
      this.takt = null;
    }
    async laden(video, start) {
      this.pausieren();
      this.video = video;
      this.dauer = video.dauer || Infinity;
      this.t = start || 0;
      this.tStempel = jetzt();
      this.melde('Zeit', this.t);
      this.melde('Status', 'geladen');
      return true;
    }
    async abspielen() {
      if (!this.istPausiert) return true;
      this.tStempel = jetzt();
      this.istPausiert = false;
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
      return true;
    }
    pausieren() {
      if (this.istPausiert) return;
      this.t = this.zeit();
      this.istPausiert = true;
      clearInterval(this.takt);
      this.melde('Status', 'pausiert');
    }
    async springen(s) {
      this.t = Math.max(0, Math.min(s, this.dauer));
      this.tStempel = jetzt();
      this.melde('Zeit', this.t);
      return true;
    }
    async geschwindigkeit(r) {
      this.t = this.zeit();
      this.tStempel = jetzt();
      this.rate = r;
      return true;
    }
    async stumm() { return true; }
  }

  /* ---------- Vimeo ---------- */
  const EMBED = {
    controls: '0', playsinline: '1', autopause: '0', dnt: '1', title: '0',
    byline: '0', portrait: '0', keyboard: '0', speed: '1', pip: '0'
  };

  class VimeoAdapter extends Basis {
    constructor(container, opt) {
      super(opt);
      this.modus = 'vimeo';
      this.container = container;
      this.player = null;
      this.aktuell = null;
      this.ziel = null; // Sollzeit, falls ein Sprung vor dem Start nicht bestätigt wurde
    }
    static embedUrl(video) {
      const p = new URLSearchParams(EMBED);
      if (video.h) p.set('h', video.h);
      return 'https://player.vimeo.com/video/' + video.id + '?' + p.toString();
    }
    // Für loadVideo(): Player-URL mit h-Parameter (die Form vimeo.com/ID/HASH bleibt bei nicht gelisteten Videos ohne Antwort)
    static ladeUrl(video) {
      return 'https://player.vimeo.com/video/' + video.id + (video.h ? '?h=' + video.h : '');
    }
    async erstellen(video) {
      if (!global.Vimeo || !global.Vimeo.Player) throw new Error('player.js nicht geladen');
      const iframe = document.createElement('iframe');
      iframe.src = VimeoAdapter.embedUrl(video);
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('title', 'Video');
      this.container.appendChild(iframe);
      this.player = new global.Vimeo.Player(iframe);
      this.aktuell = video.id;
      this.ereignisse();
      await this.player.ready();
      this.log('Player bereit (' + video.id + ')');
    }
    ereignisse() {
      const p = this.player;
      p.on('timeupdate', (d) => {
        this.t = d.seconds;
        this.tStempel = jetzt();
        if (this.ziel !== null) {
          if (Math.abs(d.seconds - this.ziel) > 1.5) {
            this.log('Startposition nachgeholt: ' + this.ziel.toFixed(1) + ' s');
            this.player.setCurrentTime(this.ziel).catch(() => {});
          }
          this.ziel = null;
        }
        this.melde('Zeit', d.seconds);
      });
      p.on('play', () => this.log('Ereignis: play'));
      p.on('playing', () => {
        this.istPausiert = false;
        this.tStempel = jetzt();
        this.log('Ereignis: playing');
        this.melde('Status', 'spielt');
      });
      p.on('pause', (d) => {
        this.istPausiert = true;
        if (d && typeof d.seconds === 'number') this.t = d.seconds;
        this.log('Ereignis: pause');
        this.melde('Status', 'pausiert');
      });
      p.on('ended', () => { this.istPausiert = true; this.melde('Status', 'ende'); });
      p.on('bufferstart', () => this.melde('Status', 'puffert'));
      p.on('bufferend', () => this.melde('Status', this.istPausiert ? 'pausiert' : 'spielt'));
      p.on('seeked', (d) => { this.t = d.seconds; this.tStempel = jetzt(); });
      p.on('playbackratechange', (d) => { this.rate = d.playbackRate; this.log('Ereignis: Rate ' + d.playbackRate); });
      p.on('loaded', (d) => this.log('Ereignis: loaded ' + (d && d.id)));
      p.on('error', (e) => {
        this.log('Fehler (Ereignis): ' + (e && e.name) + ' – ' + (e && e.message));
        this.melde('Fehler', e);
      });
    }
    async laden(video, start) {
      this.istPausiert = true;
      if (!this.player) {
        await this.erstellen(video);
      } else if (this.aktuell !== video.id) {
        if (!(await frist(this.player.loadVideo(VimeoAdapter.ladeUrl(video)), 8000))) {
          throw new Error('loadVideo nach 8 s ohne Antwort (' + video.id + ')');
        }
        this.log('loadVideo ok (' + video.id + ')');
        this.aktuell = video.id;
        if (this.rate !== 1) await this.geschwindigkeit(this.rate);
      }
      // Startposition setzen, ohne zu warten: Vor dem ersten Abspielen bestätigt Vimeo den Sprung oft nicht.
      // Weicht die erste Zeitmeldung ab, wird der Sprung nachgeholt (siehe timeupdate).
      this.t = Math.max(0, start || 0);
      this.tStempel = jetzt();
      this.ziel = this.t;
      this.player.setCurrentTime(this.t).then(() => { this.ziel = null; }).catch((e) => this.log('setCurrentTime: ' + e.name + ' – ' + e.message));
      this.melde('Zeit', this.t);
      this.melde('Status', 'geladen');
      return true;
    }
    async abspielen() {
      try {
        const ok = await frist(this.player.play(), 4000);
        if (!ok) this.log('play() nach 4 s ohne Antwort');
        return ok;
      } catch (e) {
        this.log('play() abgelehnt: ' + e.name + ' – ' + e.message);
        this.melde('Fehler', e);
        return false;
      }
    }
    pausieren() {
      this.t = this.zeit();
      this.istPausiert = true;
      if (this.player) this.player.pause().catch((e) => this.log('pause(): ' + e.name));
    }
    async springen(s) {
      this.t = Math.max(0, s);
      this.tStempel = jetzt();
      this.ziel = this.t;
      try {
        const ok = await frist(this.player.setCurrentTime(this.t), 2000);
        if (ok) this.ziel = null;
        else this.log('setCurrentTime nach 2 s ohne Antwort, wird beim Start nachgeholt');
      } catch (e) { this.log('setCurrentTime: ' + e.name + ' – ' + e.message); }
      this.melde('Zeit', this.t);
      return true;
    }
    async geschwindigkeit(r) {
      try {
        if (!(await frist(this.player.setPlaybackRate(r), 3000))) {
          this.log('setPlaybackRate(' + r + ') nach 3 s ohne Antwort');
          return false;
        }
        this.t = this.zeit();
        this.tStempel = jetzt();
        this.rate = r;
        return true;
      } catch (e) {
        this.log('setPlaybackRate(' + r + ') abgelehnt: ' + e.name + ' – ' + e.message);
        return false;
      }
    }
    async stumm(an) {
      try {
        const ok = await frist(this.player.setMuted(!!an), 2000);
        if (!ok) this.log('setMuted nach 2 s ohne Antwort');
        return ok;
      } catch (e) {
        this.log('setMuted: ' + e.name + ' – ' + e.message);
        return false;
      }
    }
  }

  global.MMKPlayer = {
    erzeugen(container, modus, opt) {
      return modus === 'vimeo' ? new VimeoAdapter(container, opt) : new Simulation(container, opt);
    },
    modusAusUrl() {
      return new URLSearchParams(global.location.search).get('modus') === 'vimeo' ? 'vimeo' : 'simulation';
    }
  };
})(window);
