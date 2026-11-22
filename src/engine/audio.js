// All sound is synthesised in the browser: no audio files to load.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.last = {};
  }

  // Browsers only allow sound after a tap or key press.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.wantMusic && !this.musicOn) this.startMusic(this.heat);
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, len);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.wantMusic) this.startMusic(this.heat);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  tone(type, f0, f1, dur, vol, when = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  noise(dur, vol, f0, f1, q = 0.8, type = 'lowpass', when = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    switch (name) {
      case 'whoosh':
        this.noise(0.14, 0.25, 900, 2600, 1.2, 'bandpass');
        break;
      case 'whooshBig':
        this.noise(0.3, 0.35, 400, 1800, 1.0, 'bandpass');
        break;
      case 'punch':
        this.tone('sine', 170, 55, 0.14, 0.9);
        this.noise(0.09, 0.5, 2200, 500);
        break;
      case 'punchBig':
        this.tone('sine', 140, 38, 0.3, 1);
        this.tone('square', 90, 40, 0.12, 0.3);
        this.noise(0.2, 0.6, 1800, 300);
        break;
      case 'slam':
        this.tone('sine', 110, 28, 0.6, 1);
        this.noise(0.55, 0.8, 900, 80);
        break;
      case 'thud':
        this.tone('sine', 120, 45, 0.18, 0.6);
        this.noise(0.12, 0.3, 700, 150);
        break;
      case 'step':
        this.tone('sine', 78, 40, 0.11, 0.38);
        this.noise(0.07, 0.1, 500, 120);
        break;
      case 'splash':
        this.noise(0.25, 0.3, 3000, 600, 0.7, 'bandpass');
        break;
      case 'jump':
        this.noise(0.2, 0.2, 300, 1400, 1.2, 'bandpass');
        break;
      case 'crumble':
        this.noise(1.1, 0.75, 1400, 90);
        this.tone('sine', 70, 30, 0.8, 0.6);
        break;
      case 'crack':
        this.noise(0.16, 0.4, 2600, 500);
        break;
      case 'car':
        this.noise(0.18, 0.4, 3200, 900, 3, 'bandpass');
        this.tone('square', 320, 120, 0.1, 0.12);
        break;
      case 'tree':
        this.noise(0.22, 0.28, 2400, 700, 0.8, 'highpass');
        break;
      case 'hurt':
        this.tone('sawtooth', 210, 90, 0.26, 0.4);
        this.noise(0.12, 0.3, 1200, 300);
        break;
      case 'roar': {
        const o = this.tone('sawtooth', 190, 70, 1.1, 0.55);
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 28;
        lg.gain.value = 22;
        lfo.connect(lg).connect(o.frequency);
        lfo.start();
        lfo.stop(now + 1.2);
        this.tone('square', 95, 45, 1.1, 0.3);
        this.noise(1.0, 0.45, 900, 250, 0.9, 'bandpass');
        break;
      }
      case 'screech':
        this.tone('sawtooth', 1500, 2700, 0.16, 0.22);
        this.tone('sawtooth', 2700, 1300, 0.45, 0.22, 0.15);
        break;
      case 'swoop':
        this.noise(0.9, 0.4, 300, 2400, 1.4, 'bandpass');
        break;
      case 'flap':
        this.noise(0.25, 0.3, 500, 200);
        this.noise(0.25, 0.3, 500, 200, 0.8, 'lowpass', 0.3);
        break;
      case 'coo':
        this.tone('sine', 520, 380, 0.12, 0.2);
        this.tone('sine', 480, 340, 0.16, 0.2, 0.14);
        break;
      case 'swipe':
        this.noise(0.12, 0.2, 1800, 4000, 1.5, 'bandpass');
        break;
      case 'pickup':
        this.tone('triangle', 660, 660, 0.08, 0.3);
        this.tone('triangle', 990, 990, 0.14, 0.3, 0.08);
        break;
      case 'ko':
        this.tone('triangle', 900, 1800, 0.12, 0.2);
        break;
      case 'objective':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.3, i * 0.1));
        break;
      case 'win':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.3, 0.16, i * 0.13));
        break;
      case 'lose':
        [330, 277, 233, 175].forEach((f, i) => this.tone('sawtooth', f, f * 0.94, 0.4, 0.2, i * 0.28));
        break;
      case 'ui':
        this.tone('triangle', 440, 660, 0.07, 0.2);
        break;
    }
  }

  // A looping drum-and-bass groove; `heat` turns it up for the boss.
  startMusic(heat = 0) {
    this.heat = heat;
    this.wantMusic = true;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    const bass = [55, 55, 0, 55, 65.4, 0, 55, 0, 49, 49, 0, 49, 73.4, 0, 65.4, 0];
    const tick = () => {
      if (!this.musicOn) return;
      const bpm = this.heat ? 132 : 104;
      const s16 = 60 / bpm / 4;
      while (this.nextTime < this.ctx.currentTime + 0.2) {
        const when = this.nextTime - this.ctx.currentTime;
        const s = this.step % 16;
        if (s % 8 === 0 || (this.heat && s === 10)) this.tone('sine', 150, 42, 0.22, 0.9, when, this.music);
        if (s % 8 === 4) this.noise(0.14, 0.45, 2400, 900, 0.7, 'bandpass', when, this.music);
        if (s % 2 === 0) this.noise(0.03, s % 4 === 2 ? 0.16 : 0.08, 9000, 7000, 0.5, 'highpass', when, this.music);
        const f = bass[s];
        if (f) this.tone('sawtooth', f, f, s16 * 1.7, 0.2, when, this.music);
        if (this.heat && s % 4 === 3) this.tone('square', 220, 220, s16, 0.05, when, this.music);
        this.nextTime += s16;
        this.step++;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }

  stopMusic() {
    this.wantMusic = false;
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }
}
