import * as THREE from 'three';
import { angDiff, clamp01 } from '../engine/util.js';

const MAP = { x0: -640, x1: 452, z0: -400, z1: 400 };
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const _v = new THREE.Vector3();

// The in-game overlay: health, rage, objective, minimap, boss bar, floating
// numbers and the touch controls. Plain DOM over the canvas.
export class Hud {
  constructor(ui, game) {
    this.game = game;
    ui.insertAdjacentHTML(
      'beforeend',
      `<div id="hud" class="hidden">
        <div class="hud-tl">
          <div class="who"><b></b><span id="score">0</span></div>
          <div class="bar hp"><i id="hp"></i></div>
          <div class="bar rage"><i id="rage"></i><em id="rage-tip">ROAR</em></div>
          <div id="gold"></div>
        </div>
        <div class="hud-tc">
          <div id="objective"><b></b><span></span></div>
          <div id="compass"><i>&#9650;</i><span></span></div>
        </div>
        <div class="hud-tr">
          <canvas id="minimap" width="352" height="258"></canvas>
          <button id="pause-btn" aria-label="Pause">II</button>
        </div>
        <div id="boss" class="hidden"><div class="boss-name"><b></b><span></span></div><div class="bar"><i id="boss-hp"></i></div></div>
        <div id="combo"></div>
        <div id="toast"><b></b><span></span></div>
        <div id="hint"></div>
        <div id="floaters"></div>
        <div id="hurt"></div>
        <div id="stick"><div id="stick-knob"></div></div>
        <div id="btns">
          <button data-a="roar" class="b-roar">ROAR</button>
          <button data-a="jump" class="b-jump">JUMP</button>
          <button data-a="slam" class="b-slam">SLAM</button>
          <button data-a="punch" class="b-punch">PUNCH</button>
        </div>
      </div>`
    );
    const $ = (s) => ui.querySelector(s);
    this.el = $('#hud');
    this.hp = $('#hp');
    this.rage = $('#rage');
    this.rageBar = this.rage.parentElement;
    this.score = $('#score');
    this.objective = $('#objective');
    this.compass = $('#compass');
    this.boss = $('#boss');
    this.bossHp = $('#boss-hp');
    this.combo = $('#combo');
    this.toastEl = $('#toast');
    this.hintEl = $('#hint');
    this.floaters = $('#floaters');
    this.hurt = $('#hurt');
    this.map = $('#minimap');
    this.mapCtx = this.map.getContext('2d');
    this.pool = [];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      this.floaters.appendChild(s);
      this.pool.push(s);
    }
    this.poolNext = 0;
    this.lastScore = -1;
    this.lastCombo = 0;

    for (const b of ui.querySelectorAll('#btns button')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        game.audio.unlock();
        game.input.press(b.dataset.a);
        b.classList.add('down');
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    }
    // pointerdown, not click: fast taps elsewhere must not swallow the pause.
    $('#pause-btn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      game.input.press('pause');
    });
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
  }

  setGold(n, total) {
    const el = this.el.querySelector('#gold');
    el.textContent = `GOLD ${n}/${total}`;
    el.classList.remove('pop');
    void el.offsetWidth;
    if (n) el.classList.add('pop');
  }

  setName(name) {
    this.el.querySelector('.who b').textContent = name.toUpperCase();
  }

  // Draws the parts of the map that never change, once.
  buildMap(world) {
    const w = this.map.width;
    const h = this.map.height;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    this.sx = w / (MAP.x1 - MAP.x0);
    this.sz = h / (MAP.z1 - MAP.z0);
    const X = (x) => (x - MAP.x0) * this.sx;
    const Z = (z) => (z - MAP.z0) * this.sz;
    g.fillStyle = '#2a2d36';
    g.fillRect(0, 0, w, h);
    for (const s of world.slabs) {
      g.fillStyle = css(s.color);
      g.globalAlpha = 0.9;
      g.fillRect(X(s.x - s.w / 2), Z(s.z - s.d / 2), s.w * this.sx, s.d * this.sz);
    }
    g.globalAlpha = 1;
    for (const wz of world.waterZones) {
      g.fillStyle = '#2f80ba';
      g.fillRect(X(wz.x0), 0, (wz.x1 - wz.x0) * this.sx, h);
    }
    for (const b of world.bridges) {
      g.fillStyle = '#8d8a83';
      g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * this.sx, (b.z1 - b.z0) * this.sz);
    }
    for (const s of world.mapShapes || []) {
      if (s.type === 'line') {
        g.strokeStyle = s.color;
        g.lineWidth = s.w * this.sx;
        g.beginPath();
        g.moveTo(X(s.ax), Z(s.az));
        g.lineTo(X(s.bx), Z(s.bz));
        g.stroke();
      } else {
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(X(s.x), Z(s.z), s.r * this.sx, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Landmarks.
    const P = world.places;
    g.fillStyle = '#f3eee4';
    for (const p of [P.cityHall, P.museum, P.liberty]) {
      g.beginPath();
      g.arc(X(p.x), Z(p.z), 5, 0, Math.PI * 2);
      g.fill();
    }
    this.mapStatic = cv;
  }

  update(game, dt) {
    const p = game.player;
    this.hp.style.transform = `scaleX(${clamp01(p.hp / 100)})`;
    this.hp.classList.toggle('low', p.hp < 30);
    this.rage.style.transform = `scaleX(${clamp01(p.rage / 100)})`;
    this.rageBar.classList.toggle('full', p.rage >= 100 && p.rageMode <= 0);
    this.rageBar.classList.toggle('on', p.rageMode > 0);
    if (game.stats.score !== this.lastScore) {
      this.lastScore = game.stats.score;
      this.score.textContent = game.stats.score.toLocaleString();
    }
    if (game.combo !== this.lastCombo) {
      this.lastCombo = game.combo;
      if (game.combo >= 3) {
        this.combo.innerHTML = `<b>${game.combo}</b> HIT COMBO`;
        this.combo.classList.remove('pop');
        void this.combo.offsetWidth;
        this.combo.classList.add('pop');
      }
      this.combo.classList.toggle('on', game.combo >= 3);
    }
    const big = game.barTarget;
    if (big && !big.dead) this.bossHp.style.transform = `scaleX(${clamp01(big.hp / big.maxHp)})`;
    this.hurt.style.opacity = Math.max(0, (this.hurtT = (this.hurtT || 0) - dt * 2.2));

    // Compass: an arrow toward the objective, and how far it is.
    const o = game.objectivePos;
    if (o) {
      const dx = o.x - p.pos.x;
      const dz = o.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const rel = angDiff(game.cam.yaw, Math.atan2(dx, dz));
      this.compass.firstElementChild.style.transform = `rotate(${-rel}rad)`;
      this.compass.lastElementChild.textContent = d > 30 ? Math.round(d) + ' m' : 'HERE';
      this.compass.classList.remove('hidden');
    } else {
      this.compass.classList.add('hidden');
    }
    this.drawMap(game);
  }

  drawMap(game) {
    if (!this.mapStatic) return;
    const g = this.mapCtx;
    const X = (x) => (x - MAP.x0) * this.sx;
    const Z = (z) => (z - MAP.z0) * this.sz;
    g.drawImage(this.mapStatic, 0, 0);
    const o = game.objectivePos;
    if (o) {
      const r = 8 + Math.sin(game.time * 5) * 3;
      g.strokeStyle = '#ff4a1c';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(X(o.x), Z(o.z), r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ffd23a';
    for (const pk of game.pickups) g.fillRect(X(pk.x) - 2, Z(pk.z) - 2, 4, 4);
    // Golden pretzels still to find: a ringed gold dot.
    g.strokeStyle = '#0c0c0d';
    g.lineWidth = 2;
    for (const gp of game.golds || []) {
      if (gp.got) continue;
      g.beginPath();
      g.arc(X(gp.x), Z(gp.z), 5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const e of game.enemies) {
      if (e.dead) continue;
      g.fillStyle = e.boss ? '#ff2a1a' : '#ff6a5a';
      g.beginPath();
      g.arc(X(e.pos.x), Z(e.pos.z), e.boss ? 7 : 4, 0, Math.PI * 2);
      g.fill();
    }
    const p = game.player;
    g.save();
    g.translate(X(p.pos.x), Z(p.pos.z));
    g.rotate(-p.yaw + Math.PI);
    g.fillStyle = '#fff';
    g.strokeStyle = '#0c0c0d';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6.5, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6.5, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  setObjective(title, text) {
    this.objective.firstElementChild.textContent = title;
    this.objective.lastElementChild.textContent = text;
    // On phones the full sentence shows for a few seconds, then only the title stays.
    this.objective.classList.remove('mini');
    clearTimeout(this.miniTimer);
    this.miniTimer = setTimeout(() => this.objective.classList.add('mini'), 6000);
    this.objective.classList.remove('pop');
    void this.objective.offsetWidth;
    this.objective.classList.add('pop');
  }

  showBoss(boss) {
    this.boss.classList.toggle('hidden', !boss);
    if (boss) {
      this.boss.querySelector('b').textContent = boss.name;
      this.boss.querySelector('span').textContent = boss.title;
    }
  }

  toast(title, sub = '', ms = 2600) {
    this.toastEl.firstElementChild.textContent = title;
    this.toastEl.lastElementChild.textContent = sub;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  hint(text) {
    this.hintEl.innerHTML = text || '';
    this.hintEl.classList.toggle('on', !!text);
  }

  hurtFlash() {
    this.hurtT = 1;
  }

  // A number or word that pops out of the world and floats up.
  float(text, x, y, z, cls = '') {
    _v.set(x, y, z).project(this.game.stage.camera);
    if (_v.z > 1) return;
    const s = this.pool[this.poolNext];
    this.poolNext = (this.poolNext + 1) % this.pool.length;
    s.textContent = text;
    s.className = '';
    void s.offsetWidth;
    s.className = 'go ' + cls;
    s.style.left = ((_v.x + 1) / 2) * innerWidth + (Math.random() * 30 - 15) + 'px';
    s.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
  }
}

// Full-screen cards: title, tour map, pause, knocked out, city cleared.
export class Screens {
  constructor(ui, game) {
    this.game = game;
    ui.insertAdjacentHTML('beforeend', '<div id="screen" class="hidden"></div><div id="card" class="hidden"></div>');
    this.el = ui.querySelector('#screen');
    this.card = ui.querySelector('#card');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      game.audio.unlock();
      game.audio.play('ui');
      game.action(b.dataset.act);
    });
  }

  hide() {
    this.el.classList.add('hidden');
    this.current = null;
  }

  show(name, data = {}) {
    this.current = name;
    this.el.className = 'screen-' + name;
    this.el.innerHTML = this[name](data);
  }

  // The banner that slides in when a stop begins.
  intro(kicker, title, line) {
    this.card.innerHTML = `<small>${kicker}</small><b>${title}</b><span>${line}</span>`;
    this.card.classList.remove('hidden', 'go');
    void this.card.offsetWidth;
    this.card.classList.add('go');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => this.card.classList.add('hidden'), 3600);
  }

  controls(touch) {
    return touch
      ? `<ul class="keys"><li><b>Left thumb</b> move</li><li><b>Drag right side</b> look</li><li><b>PUNCH</b> tap for a three-hit combo</li><li><b>SLAM</b> shockwave, or dive from a jump</li><li><b>ROAR</b> when the orange bar is full</li><li><b>Lean on a building</b> to climb it</li></ul>`
      : `<ul class="keys"><li><b>W A S D</b> move</li><li><b>Mouse drag</b> look</li><li><b>J</b> or <b>click</b> punch, tap for a combo</li><li><b>K</b> or <b>right-click</b> slam</li><li><b>Space</b> jump, then <b>K</b> to dive</li><li><b>L</b> roar when the orange bar is full</li><li><b>Run into a building</b> to climb it</li></ul>`;
  }

  title() {
    return `<div class="title">
        <small>STOP ONE: PHILADELPHIA</small>
        <h1>SILVERBACK</h1>
        <h2>WORLD TOUR</h2>
        <p>One very large ape. Eight cities. A lot of animals who had it coming.</p>
        <button class="big" data-act="select">PLAY</button>
        ${this.game.installed ? '' : '<button data-act="install">Get the app</button>'}
        ${this.controls(this.game.input.touch)}
      </div>`;
  }

  // Choose your ape. The chosen one is standing in the scene behind this.
  select({ apes, current }) {
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const cur = apes.find((a) => a.id === current) || apes[0];
    const cards = apes
      .map(
        (a) => `<button class="ape ${a.id === current ? 'on' : ''}" data-act="pick:${a.id}" style="--a:${hex(a.scarf[0])};--b:${hex(a.scarf[1])}">
          <i></i><b>${a.name}</b>
        </button>`
      )
      .join('');
    return `<div class="select"><div class="select-top"><small>CHOOSE YOUR APE</small><h2>${cur.name.toUpperCase()}</h2><p>${cur.line}</p></div>
      <div class="select-bottom"><div class="apes">${cards}</div><button class="big" data-act="tour">NEXT</button></div></div>`;
  }

  levels(level) {
    return `<div class="levels">${['easy', 'normal', 'hard'].map((id) => `<button class="${id === level ? 'on' : ''}" data-act="level:${id}">${id.toUpperCase()}</button>`).join('')}</div>`;
  }

  tour({ cities, level }) {
    const cards = cities
      .map(
        (c, i) => `<button class="stop ${c.open ? 'open' : 'locked'}" ${c.open ? 'data-act="start"' : 'disabled'}>
          <i>${String(i + 1).padStart(2, '0')}</i>
          <b>${c.name}</b>
          <span>${c.rival}</span>
          <em>${c.open ? 'PLAY NOW' : 'COMING SOON'}</em>
        </button>`
      )
      .join('');
    return `<div class="tour"><small>THE ROUTE</small><h2>WORLD TOUR</h2><div class="stops">${cards}</div>${this.levels(level)}<button class="link" data-act="select">Back</button></div>`;
  }

  pause({ muted, quality, level, view }) {
    return `<div class="panel pause"><h2>PAUSED</h2>
        <div class="menu">
          <button class="big" data-act="resume">RESUME</button>
          <button data-act="retry">Restart from checkpoint</button>
          <button data-act="level:next">Difficulty: ${level}</button>
          <button data-act="view">Camera: ${view}</button>
          <button data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
          <button data-act="quality">Graphics: ${quality}</button>
          <button data-act="quit">Quit to title</button>
        </div>
        ${this.controls(this.game.input.touch)}
      </div>`;
  }

  // How to put the game on a home screen, for whichever device this is.
  install({ ios, android }) {
    const steps = ios
      ? ['Open this page in <b>Safari</b> (not inside another app).', 'Tap the <b>Share</b> button: the square with an arrow pointing up.', 'Scroll down and choose <b>Add to Home Screen</b>, then <b>Add</b>.', 'Open <b>Silverback</b> from your home screen. It runs full screen, sideways.']
      : android
        ? ['Open this page in <b>Chrome</b>.', 'Tap the <b>three dots</b> menu at the top right.', 'Choose <b>Add to Home screen</b> or <b>Install app</b>.', 'Open <b>Silverback</b> from your home screen.']
        : ['In Chrome or Edge, click the <b>install</b> icon at the right of the address bar.', 'Or open the browser menu and choose <b>Install Silverback</b>.', 'On a phone, open this page there and use Get the app again.'];
    return `<div class="panel"><small>PLAY IT LIKE AN APP</small><h2>ADD TO HOME SCREEN</h2><ol class="steps">${steps.map((t) => `<li>${t}</li>`).join('')}</ol><button class="big" data-act="title">GOT IT</button></div>`;
  }

  dead() {
    return `<div class="panel"><small>${this.game.player.name.toUpperCase()} IS DOWN</small><h2>KNOCKED OUT</h2><p>Shake it off. The tour is not over.</p><button class="big" data-act="retry">GET UP</button><button data-act="quit">Quit to title</button></div>`;
  }

  win({ stats, next, level, golds }) {
    const m = Math.floor(stats.time / 60);
    const s = String(Math.floor(stats.time % 60)).padStart(2, '0');
    return `<div class="panel win"><small>STOP ONE CLEARED</small><h2>PHILADELPHIA IS YOURS</h2>
        <div class="stats">
          <div><b>${stats.score.toLocaleString()}</b><span>Score</span></div>
          <div><b>${m}:${s}</b><span>Time</span></div>
          <div><b>${stats.kos}</b><span>Animals battered</span></div>
          <div><b>${stats.bestCombo}</b><span>Best combo</span></div>
          <div><b>${stats.gold}/${golds}</b><span>Golden pretzels</span></div>
          <div><b>${level}</b><span>Difficulty</span></div>
          <div><b>${stats.buildings}</b><span>Buildings flattened</span></div>
          <div><b>$${Math.round(stats.bill).toLocaleString()}</b><span>Damage bill</span></div>
        </div>
        <p>Next stop: <b>${next}</b>. Coming soon.</p>
        <button class="big" data-act="again">PLAY AGAIN</button><button data-act="roam">Keep roaming Philly</button>
      </div>`;
  }
}
