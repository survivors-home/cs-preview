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
    }
    static embedUrl(video) {
      const p = new URLSearchParams(EMBED);
      if (video.h) p.set('h', video.h);
      return 'https://player.vimeo.com/video/' + video.id + '?' + p.toString();
    }
    static seitenUrl(video) {
      return 'https://vimeo.com/' + video.id + (video.h ? '/' + video.h : '');
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
      p.on('timeupdate', (d) => { this.t = d.seconds; this.tStempel = jetzt(); this.melde('Zeit', d.seconds); });
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
        try {
          await this.player.loadVideo(VimeoAdapter.seitenUrl(video));
          this.log('loadVideo per URL ok');
        } catch (e1) {
          this.log('loadVideo per URL fehlgeschlagen: ' + e1.name + ' – ' + e1.message);
          await this.player.loadVideo({ url: VimeoAdapter.embedUrl(video) });
          this.log('loadVideo per Embed-URL ok');
        }
        this.aktuell = video.id;
        if (this.rate !== 1) await this.geschwindigkeit(this.rate);
      }
      await this.springen(start || 0);
      this.melde('Status', 'geladen');
      return true;
    }
    async abspielen() {
      try {
        await this.player.play();
        return true;
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
      try { await this.player.setCurrentTime(this.t); } catch (e) { this.log('setCurrentTime: ' + e.name + ' – ' + e.message); }
      this.melde('Zeit', this.t);
      return true;
    }
    async geschwindigkeit(r) {
      try {
        await this.player.setPlaybackRate(r);
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
      try { await this.player.setMuted(!!an); return true; } catch (e) {
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
