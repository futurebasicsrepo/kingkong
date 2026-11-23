import * as THREE from 'three';
import { createStage } from './engine/render.js';
import { Fx } from './engine/fx.js';
import { Audio } from './engine/audio.js';
import { Input } from './engine/input.js';
import { ChaseCam } from './engine/camera.js';
import { GEO, MeshBuilder } from './engine/build.js';
import { clamp, rand } from './engine/util.js';
import { Ape, APES } from './actors/ape.js';
import { Raccoon, Pigeon, makeRat, makeGator } from './actors/enemies.js';
import { Eagle } from './actors/eagle.js';
import { Bull } from './actors/bull.js';
import { STOPS, stopById, ORDINAL, GOLD_NAMES } from './stops.js';
import { Hud, Screens } from './ui/hud.js';

const SCORE = { raccoon: 100, thrower: 130, pigeon: 120, chief: 800, rat: 40, gator: 900, eagle: 2500, bull: 3000 };

// The healing snack and the hidden golden thing, as single meshes.
function snackGeometry(kind) {
  const mb = new MeshBuilder();
  if (kind === 'pizza') {
    // A slice: cheese on a thin base, crust along the wide end, pepperoni.
    const tri = new THREE.Shape();
    tri.moveTo(0, -2.2);
    tri.lineTo(1.9, 2.0);
    tri.lineTo(-1.9, 2.0);
    tri.closePath();
    mb.add(new THREE.ExtrudeGeometry(tri, { depth: 0.45, bevelEnabled: false }), 0xf2b640, 0, 0, -0.2);
    mb.add(GEO.cyl(8), 0xb8702a, 0, 2.05, 0, 2.0, 0.7, 0.55, 0, Math.PI / 2, Math.PI / 2);
    for (const [px, py] of [[0, 0.9], [-0.7, -0.2], [0.6, -0.4], [0.1, 1.6], [-0.9, 1.4], [0.9, 1.3]]) mb.add(GEO.cyl(10), 0xb2301e, px, py, 0.32, 0.38, 0.1, 0.38, 0, Math.PI / 2, 0);
  } else if (kind === 'apple') {
    mb.add(GEO.sphere(14, 10), 0xffffff, 0, 0, 0, 1.75, 1.6, 1.75);
    mb.add(GEO.cyl(6), 0xffffff, 0.1, 1.3, 0, 0.16, 1.1, 0.16, 0, 0, -0.2);
    mb.add(GEO.ico(0), 0xffffff, 0.75, 2.0, 0, 0.75, 0.16, 0.42, 0, 0, -0.5);
  } else {
    mb.add(new THREE.TorusKnotGeometry(1.7, 0.52, 48, 7, 2, 3), 0xb8702a, 0, 0, 0);
    for (let k = 0; k < 7; k++) mb.add(GEO.cube(), 0xf2eee4, Math.cos(k * 1.7) * 1.9, Math.sin(k * 2.3) * 1.5, 0.5, 0.18, 0.18, 0.18);
  }
  return mb.geometry();
}

// Which stops have been beaten on this device.
function cleared() {
  try {
    return JSON.parse(localStorage.getItem('cleared') || '[]');
  } catch {
    return [];
  }
}

// How hard the animals hit back. hp and dmg scale the animals; cool stretches
// the gaps between their attacks; tokens is how many may attack at once;
// quick and stuck speed up the boss and shorten the time he is stuck;
// drops and heal are how generous the pretzels are; armor means an animal
// that has started a swing cannot be jabbed out of it.
// How far back the camera sits.
export const VIEWS = {
  near: { name: 'Near', dist: 44, pitch: 0.4, fov: 55 },
  mid: { name: 'Mid', dist: 52, pitch: 0.43, fov: 57 },
  far: { name: 'Far', dist: 64, pitch: 0.48, fov: 60 },
};

export const LEVELS = {
  easy: { id: 'easy', name: 'Easy', hp: 0.8, dmg: 0.6, cool: 1.45, tokens: 1, bossHp: 0.75, quick: 1.2, stuck: 1.3, drops: 1.6, heal: 40 },
  normal: { id: 'normal', name: 'Normal', hp: 1, dmg: 1.15, cool: 1, tokens: 2, bossHp: 1, quick: 1, stuck: 1, drops: 1, heal: 25 },
  hard: { id: 'hard', name: 'Hard', hp: 1.35, dmg: 1.7, cool: 0.6, tokens: 3, bossHp: 1.35, quick: 0.8, stuck: 0.8, drops: 0.5, heal: 10, armor: true },
};


export class Game {
  constructor(canvas, ui) {
    const q = new URLSearchParams(location.search);
    this.query = q;
    let saved = null;
    try {
      saved = localStorage.getItem('quality');
    } catch {
      /* private mode */
    }
    let level = q.get('level');
    try {
      level = level || localStorage.getItem('level');
    } catch {
      /* private mode */
    }
    this.diff = LEVELS[level] || LEVELS.normal;
    let cityId = q.get('city');
    try {
      cityId = cityId || localStorage.getItem('city');
    } catch {
      /* private mode */
    }
    this.stop = stopById(cityId);
    this.stopIndex = STOPS.indexOf(this.stop);
    this.stage = createStage(canvas, { quality: q.get('quality') || saved || undefined });
    this.world = this.stop.build(this.stage.scene);
    this.fx = new Fx(this.stage.scene);
    this.audio = new Audio();
    this.hud = new Hud(ui, this);
    this.screens = new Screens(ui, this);
    this.input = new Input(canvas, ui);
    this.cam = new ChaseCam(this.stage.camera);
    // Phones get a wider shot by default; the pause menu cycles Near / Mid / Far.
    let view = q.get('view');
    try {
      view = view || localStorage.getItem('view');
    } catch {
      /* private mode */
    }
    this.setView(VIEWS[view] ? view : this.input.touch ? 'far' : 'mid');
    this.installed = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
    let pick = q.get('ape');
    try {
      pick = pick || localStorage.getItem('ape');
    } catch {
      /* private mode */
    }
    this.player = new Ape(this, APES.find((a) => a.id === pick) || APES[0]);
    this.stage.scene.add(this.player.root);
    this.hud.setName(this.player.name);
    this.missiles = [];
    this.fps = { t: 0, n: 0, good: 0 };
    this.governed = q.get('gov') !== '0';

    this.enemies = [];
    this.hazards = [];
    this.pickups = [];
    this.tokens = this.diff.tokens;
    this.barTarget = null;
    this.cut = null;
    this.time = 0;
    this.freeze = 0;
    this.slow = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.controlsOn = false;
    this.state = 'title';
    this.boss = null;
    this.bossActive = false;
    this.objectivePos = null;
    this.timers = [];
    this.seen = {};
    this.god = q.get('god') === '1';
    this.resetStats();

    const P = this.world.places;
    this.objectives = this.stop.objectives(P);
    this.checkpoint = 0;
    this.objIndex = 0;

    // A pillar of light over wherever the ape should go next.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 260, 20, 1, true).translate(0, 130, 0),
      new THREE.MeshBasicMaterial({ color: 0xff5a1c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })
    );
    this.beacon.renderOrder = 3;
    this.beacon.visible = false;
    this.stage.scene.add(this.beacon);

    // What heals the ape here (a soft pretzel, a slice of pizza) and what is hidden.
    this.snackGeo = snackGeometry(this.stop.snack);
    this.snackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x5a2a00, emissiveIntensity: 0.35 });
    this.goldGeo = snackGeometry(this.stop.gold);
    this.goldNames = GOLD_NAMES[this.stop.gold];
    this.coinGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.35, 14).rotateX(Math.PI / 2);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.3, metalness: 0.8, emissive: 0x7a4a00, emissiveIntensity: 0.6 });
    this.trashGeo = GEO.cyl(8, 0.9);
    this.trashMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6 });
    this.featherGeo = GEO.cube();
    this.featherMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 });

    this.onTreeFlattened = (t) => {
      this.fx.debris(t.x, 3, t.z, 4, t.color, 12, 0.9, 4);
      this.audio.play('tree');
      this.stats.score += 5;
    };
    this.onCarKicked = (c) => {
      const p = this.player;
      const kick = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
      // A kicked car flies at the nearest animal in front of him, if there is one.
      const tgt = this.nearestEnemy(c.x, c.z, 70, kick, 1.1, 40);
      if (tgt) {
        const dx = tgt.pos.x - c.x;
        const dz = tgt.pos.z - c.z;
        const T = clamp(Math.hypot(dx, dz) / 60, 0.35, 1.3);
        const ty = tgt.pos.y + tgt.height * 0.5;
        this.fx.chunk(c.x, 1.2, c.z, dx / T, (ty - 1.2 + 30 * T * T) / T, dz / T, 1, c.color, { sx: 2.1, sy: 1.5, sz: 4.6, life: T + 1.2 });
        this.missiles.push({ t: 0, T, tgt, x: tgt.pos.x, z: tgt.pos.z, dx: dx / (Math.hypot(dx, dz) || 1), dz: dz / (Math.hypot(dx, dz) || 1) });
      } else {
        const a = kick + rand(-0.4, 0.4);
        const sp = 24 + p.speed;
        this.fx.chunk(c.x, 1.2, c.z, Math.sin(a) * sp, rand(16, 30), Math.cos(a) * sp, 1, c.color, { sx: 2.1, sy: 1.5, sz: 4.6, life: 2.4 });
      }
      this.audio.play('car');
      this.stats.score += 10;
      this.stats.bill += 28000;
    };

    this.hud.buildMap(this.world);
    this.spawnBoss();
    this.placePlayer(P.start);
    addEventListener('resize', () => this.stage.resize());
    addEventListener('keydown', () => this.audio.unlock(), { once: false });
    addEventListener('pointerdown', () => this.audio.unlock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause();
    });

    this.placeGolds();
    try {
      localStorage.setItem('city', this.stop.id);
    } catch {
      /* private mode */
    }
    const jump = this.stop.starts[q.get('start')];
    if (jump !== undefined) this.checkpoint = jump;
    if (q.get('autoplay') || jump !== undefined) this.start();
    else this.screens.show('title');
  }

  resetStats() {
    this.stats = { score: 0, kos: 0, buildings: 0, bill: 0, bestCombo: 0, time: 0, gold: 0 };
  }

  after(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }

  // ---- flow --------------------------------------------------------------

  setView(id) {
    const order = Object.keys(VIEWS);
    if (id === 'next') id = order[(order.indexOf(this.view) + 1) % order.length];
    const v = VIEWS[id];
    if (!v) return;
    this.view = id;
    this.cam.wantDist = v.dist;
    this.cam.pitch = v.pitch;
    this.cam.fov = v.fov;
    try {
      localStorage.setItem('view', id);
    } catch {
      /* private mode */
    }
  }

  // Android and desktop Chrome can show their own install prompt; everything
  // else (iPhones above all) gets the steps spelled out.
  install() {
    const ask = window.__installPrompt;
    if (ask) {
      window.__installPrompt = null;
      ask.prompt();
      return;
    }
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.screens.show('install', { ios, android: /Android/.test(ua) });
  }

  setLevel(id) {
    const order = ['easy', 'normal', 'hard'];
    if (id === 'next') id = order[(order.indexOf(this.diff.id) + 1) % 3];
    const next = LEVELS[id];
    if (!next) return;
    this.tokens += next.tokens - this.diff.tokens;
    this.diff = next;
    try {
      localStorage.setItem('level', id);
    } catch {
      /* private mode */
    }
  }

  // Reload into another city (or this one), keeping the chosen settings.
  go(id, extra = '') {
    location.search = `?city=${id}${extra}`;
  }

  tourInfo() {
    const done = cleared();
    return {
      cities: STOPS.map((c) => ({ ...c, open: !!c.build, cleared: done.includes(c.id), here: c.id === this.stop.id })),
      level: this.diff.id,
    };
  }

  action(name) {
    if (name.startsWith('pick:')) return this.pickApe(name.slice(5));
    if (name.startsWith('start:')) {
      const id = name.slice(6);
      if (id === this.stop.id) this.start();
      else this.go(id, '&autoplay=1');
      return;
    }
    if (name.startsWith('level:')) {
      this.setLevel(name.slice(6));
      if (this.state === 'pause') this.screens.show('pause', this.pauseInfo());
      else this.screens.show('tour', this.tourInfo());
      return;
    }
    switch (name) {
      case 'install':
        this.install();
        break;
      case 'view':
        this.setView('next');
        this.screens.show('pause', this.pauseInfo());
        break;
      case 'select':
        this.showSelect();
        break;
      case 'tour':
        this.player.showcase = null;
        this.state = 'title';
        this.screens.show('tour', this.tourInfo());
        break;
      case 'title':
        this.screens.show('title');
        break;
      case 'start':
        this.start();
        break;
      case 'resume':
        this.resume();
        break;
      case 'retry':
        this.restartFromCheckpoint();
        break;
      case 'mute':
        this.audio.setMuted(!this.audio.muted);
        this.screens.show('pause', this.pauseInfo());
        break;
      case 'quality': {
        const next = this.stage.quality === 'high' ? 'low' : 'high';
        try {
          localStorage.setItem('quality', next);
        } catch {
          /* private mode */
        }
        this.go(this.stop.id, `&autoplay=1&quality=${next}`);
        break;
      }
      case 'again':
        this.go(this.stop.id, '&autoplay=1');
        break;
      case 'next': {
        const next = STOPS[this.stopIndex + 1];
        if (next && next.build) this.go(next.id, '&autoplay=1');
        break;
      }
      case 'quit':
        this.go(this.stop.id);
        break;
      case 'roam':
        this.screens.hide();
        this.hud.show(true);
        this.player.victory = false;
        this.state = 'play';
        this.controlsOn = true;
        break;
    }
  }

  // The line-up: the chosen ape stands on the museum terrace while the
  // player flicks through the five.
  showSelect() {
    const t = this.stop.stage(this.world.places);
    this.state = 'select';
    this.player.reset(t.x, t.z, t.yaw);
    this.player.pos.y = this.world.groundHeight(t.x, t.z);
    this.player.showcase = 'idle';
    this.screens.show('select', { apes: APES, current: this.player.variant.id });
  }

  pickApe(id) {
    const v = APES.find((a) => a.id === id);
    if (!v) return;
    this.player.setVariant(v);
    this.player.showcase = 'flex';
    this.flexT = 0.9;
    this.hud.setName(v.name);
    this.audio.play('roar');
    try {
      localStorage.setItem('ape', v.id);
    } catch {
      /* private mode */
    }
    this.screens.show('select', { apes: APES, current: v.id });
  }

  start() {
    this.player.showcase = null;
    if (this.input.touch) {
      // Phones: go full screen and sideways where the browser allows it.
      try {
        const el = document.documentElement;
        const p = el.requestFullscreen && el.requestFullscreen();
        if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      } catch {
        /* not allowed here */
      }
    }
    this.audio.unlock();
    this.screens.hide();
    this.hud.show(true);
    this.state = 'play';
    this.controlsOn = true;
    this.restartFromCheckpoint(true);
    this.audio.startMusic(0);
    if (this.checkpoint === 0) {
      this.screens.intro('STOP ' + ORDINAL[this.stopIndex], this.stop.name.toUpperCase(), this.stop.intro);
      this.hud.hint(this.input.touch ? '<b>Left thumb</b> to move &nbsp; <b>drag</b> to look' : '<b>W A S D</b> to move &nbsp; <b>drag the mouse</b> to look');
    }
  }

  pauseInfo() {
    return { muted: this.audio.muted, quality: this.stage.quality, level: this.diff.name, view: VIEWS[this.view].name };
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.hud.show(false);
    this.screens.show('pause', this.pauseInfo());
  }

  resume() {
    this.screens.hide();
    this.hud.show(true);
    this.state = 'play';
  }

  placePlayer(s) {
    this.player.reset(s.x, s.z, s.yaw ?? 0);
    this.cam.snap(this.player);
  }

  spawnBoss() {
    if (this.boss && !this.boss.remove) this.boss.rig.dispose();
    this.enemies = this.enemies.filter((e) => e !== this.boss);
    const P = this.world.places;
    this.boss = this.stop.boss === 'bull' ? new Bull(this, P.bull.x, P.bull.z) : new Eagle(this, 0, 0);
    this.enemies.push(this.boss);
    this.bossActive = false;
  }

  restartFromCheckpoint(first = false) {
    for (const e of this.enemies) if (e !== this.boss && !e.remove) e.rig.dispose();
    this.enemies = [];
    for (const h of this.hazards) h.mesh.removeFromParent();
    this.hazards = [];
    this.missiles = [];
    this.fx.clear();
    this.tokens = this.diff.tokens;
    this.barTarget = null;
    this.cut = null;
    this.timers = [];
    this.slow = 0;
    this.freeze = 0;
    this.combo = 0;
    this.spawnBoss();
    this.hud.showBoss(null);
    this.audio.heat = 0;
    const o = this.objectives[this.checkpoint];
    this.placePlayer(o.spawn);
    this.setObjective(this.checkpoint);
    this.screens.hide();
    this.hud.show(true);
    this.state = 'play';
    this.controlsOn = true;
    if (!first) this.hud.toast('ROUND TWO', '', 1400);
  }

  setObjective(i) {
    this.objIndex = i;
    const o = this.objectives[i];
    if (!o) {
      this.objectivePos = null;
      this.beacon.visible = false;
      return;
    }
    o.engaged = false;
    o.wave = 0;
    o.waveTimer = 0;
    this.objectivePos = o.at;
    this.beacon.position.set(o.at.x, 0, o.at.z);
    this.hud.setObjective(o.title, o.text);
  }

  completeObjective() {
    const o = this.objectives[this.objIndex];
    this.checkpoint = Math.min(this.objectives.length - 1, this.objIndex + 1);
    this.audio.play('objective');
    this.stats.score += 500;
    this.player.heal(this.diff.heal);
    if (o.type === 'wave') {
      this.hud.toast('CLEARED', o.title);
      for (let k = 0; k < 2; k++) this.dropPretzel(o.at.x + rand(-14, 14), o.at.z + rand(-14, 14));
      if (!this.seen.climb && !this.seen.climbTip) {
        this.seen.climbTip = true;
        this.after(3, () => {
          this.hud.hint(this.input.touch ? 'Tip: lean on a building to climb it, then <b>SLAM</b> to dive off' : 'Tip: run into a building to climb it, then <b>K</b> to dive off');
          this.after(8, () => this.hud.hint(''));
        });
      }
    } else if (o.type === 'gate') {
      this.hud.toast('OUT!', o.done);
      this.hud.hint('');
    } else if (o.type === 'climb') {
      this.hud.toast('TOP OF THE WORLD', o.done, 2600);
      this.hud.hint('');
      this.stats.score += 1000;
    }
    this.setObjective(this.objIndex + 1);
  }

  updateMission(dt) {
    const o = this.objectives[this.objIndex];
    if (!o) return;
    const p = this.player;
    const d = Math.hypot(p.pos.x - o.at.x, p.pos.z - o.at.z);
    this.beacon.visible = !o.engaged && d > 34;
    this.beacon.material.opacity = 0.16 + Math.sin(this.time * 3) * 0.05;

    if (o.type === 'gate') {
      if (d < 46 && !this.seen.gate) {
        this.seen.gate = true;
        this.hud.hint(this.input.touch ? 'Tap <b>PUNCH</b> to smash the gate' : 'Punch the gate: <b>J</b> or <b>click</b>');
      }
      // Out through the gate, or over the wall: either way he is out.
      const r = o.inside;
      const out = p.pos.x < r.x0 || p.pos.x > r.x1 || p.pos.z < r.z0 || p.pos.z > r.z1;
      if (this.world.gate.state !== 'up' || (out && p.onGround)) this.completeObjective();
    } else if (o.type === 'climb') {
      // Get to the top of one building. Animals come for him on the way up.
      if (d < 90 && !o.engaged) {
        o.engaged = true;
        this.hud.hint(this.input.touch ? 'Run into the wall and keep pushing to climb. <b>JUMP</b> lets go.' : 'Run into the wall and keep holding to climb. <b>Space</b> lets go.');
        this.after(8, () => this.hud.hint(''));
      }
      if (o.harass && !o.harassed && p.pos.y > 50 && d < 60) {
        o.harassed = true;
        this.hud.toast('INCOMING', 'Keep climbing', 1500);
        for (const [kind, count] of o.harass) for (let k = 0; k < count; k++) this.after(k * 0.3, () => this.spawnEnemy(kind, p.pos.x + rand(-40, 40), p.pos.z + rand(-40, 40)));
      }
      this.beacon.visible = p.pos.y < 20 && d > 34;
      if (p.onGround && p.pos.y >= o.height - 2 && d < 40) this.completeObjective();
    } else if (o.type === 'wave') {
      if (!o.engaged) {
        if (d < o.r) {
          o.engaged = true;
          this.hud.toast(o.call[0], o.call[1]);
          this.spawnWave(o, 0);
          if (!this.seen.combo) {
            this.seen.combo = true;
            this.hud.hint(this.input.touch ? 'Tap <b>PUNCH</b> three times for a combo. <b>SLAM</b> clears a crowd.' : 'Tap <b>J</b> three times for a combo. <b>K</b> slams. <b>Space</b> jumps.');
            this.after(9, () => this.hud.hint(''));
          }
        }
      } else if (!this.enemies.some((e) => !e.dead && !e.boss)) {
        o.waveTimer += dt;
        if (o.waveTimer > 0.9) {
          o.waveTimer = 0;
          o.wave++;
          if (o.wave >= o.waves.length) this.completeObjective();
          else this.spawnWave(o, o.wave);
        }
      }
    } else if (o.type === 'boss') {
      if (!o.engaged && d < o.r) {
        o.engaged = true;
        this.bossActive = true;
        this.barTarget = this.boss;
        this.hud.showBoss(this.boss);
        // The entrance: cut to him on the tower for a moment before he comes down.
        this.cut = { t: 0 };
        this.controlsOn = false;
        this.boss.taunt = true;
        this.after(2.5, () => {
          const b = this.boss;
          const p = this.player;
          this.cut = null;
          this.controlsOn = true;
          b.taunt = false;
          b.setState('enter');
          this.cam.yaw = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
          this.cam.snap(p, true);
        });
        this.screens.intro(o.call[0], this.boss.name, o.call[1]);
        this.audio.play(o.sound);
        this.audio.heat = 1;
        this.objectivePos = null;
        this.hud.setObjective('Boss fight', o.fight);
      }
    }
  }

  spawnWave(o, n) {
    const p = this.player;
    let i = 0;
    for (const [kind, count] of o.waves[n]) {
      for (let k = 0; k < count; k++) {
        // Ring the arena, but never right on top of the ape.
        let x = 0;
        let z = 0;
        for (let tries = 0; tries < 12; tries++) {
          const a = rand(Math.PI * 2);
          const r = rand(20, Math.min(40, o.r - 12));
          x = o.at.x + Math.cos(a) * r;
          z = o.at.z + Math.sin(a) * r;
          if (Math.hypot(x - p.pos.x, z - p.pos.z) > 22) break;
        }
        this.after(i++ * 0.22, () => this.spawnEnemy(kind, x, z));
      }
    }
  }

  spawnEnemy(kind, x, z) {
    let e;
    if (kind === 'chief' || kind === 'gator') {
      e = kind === 'gator' ? makeGator(this, x, z) : new Raccoon(this, x, z, false, true);
      if (kind === 'gator') {
        // Up out of a manhole.
        this.fx.ring(x, 0.5, z, 2, 14, 0.5, 0xd8d0c0);
        this.fx.debris(x, 1, z, 6, 0x3a3a3a, 18, 1.2, 1);
        this.world.trample(x, z, 3, this.onTreeFlattened, this.onCarKicked);
      }
      this.barTarget = e;
      this.hud.showBoss(e);
      this.hud.toast(e.name, e.title, 2200);
      this.audio.play('roar');
    } else if (kind === 'pigeon') e = new Pigeon(this, x, z);
    else if (kind === 'rat') e = makeRat(this, x, z);
    else e = new Raccoon(this, x, z, kind === 'thrower');
    if (kind !== 'pigeon') this.fx.dust(x, 1, z, 6, 3);
    this.enemies.push(e);
    return e;
  }

  summon(kind, n, x, z, spread, say) {
    for (let k = 0; k < n; k++) this.after(k * 0.25, () => this.spawnEnemy(kind, x + rand(-spread, spread), z + rand(-spread, spread)));
    if (say) this.hud.toast('BACKUP!', say, 1500);
  }

  summonPigeons(n) {
    this.summon('pigeon', n, this.boss.pos.x, this.boss.pos.z, 30, 'He called the flock');
  }

  // ---- combat ------------------------------------------------------------

  nearestEnemy(x, z, maxDist, aimYaw, cone, reach = 19) {
    let best = null;
    let bestScore = Infinity;
    const py = this.player.pos.y;
    for (const e of this.enemies) {
      if (!e.hurtable || e.pos.y > py + reach || e.pos.y + e.height < py - 4) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist + e.radius) continue;
      let off = Math.abs(Math.atan2(dx, dz) - aimYaw) % (Math.PI * 2);
      if (off > Math.PI) off = Math.PI * 2 - off;
      if (off > cone && d > 9) continue;
      const score = d + off * 9;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // A blow from the ape: hurts animals and buildings inside the circle.
  strike(h) {
    let hits = 0;
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.hurtable) continue;
      const dx = e.pos.x - h.x;
      const dz = e.pos.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > h.radius + e.radius) continue;
      if (e.pos.y > h.y + 19 || e.pos.y + e.height < h.y - 2) continue;
      let kx = h.dx || 0;
      let kz = h.dz || 0;
      if (h.radial || (!kx && !kz)) {
        const ox = e.pos.x - p.pos.x;
        const oz = e.pos.z - p.pos.z;
        const n = Math.hypot(ox, oz) || 1;
        kx = ox / n;
        kz = oz / n;
      }
      const hit = { dmg: h.dmg, dx: kx, dz: kz, knock: h.knock, launch: h.launch, heavy: h.heavy };
      if (!e.takeHit(hit)) continue;
      hits++;
      const hy = e.pos.y + e.height * 0.6;
      this.fx.spark(e.pos.x, hy, e.pos.z, h.heavy ? 7 : 4.5);
      this.hud.float(String(Math.round(hit.dealt ?? h.dmg)), e.pos.x, hy + 3, e.pos.z, h.heavy ? 'big' : '');
      if (e.kind === 'pigeon') this.fx.feathers(e.pos.x, hy, e.pos.z, 5, 0x9aa3b3);
      else if (e.kind === 'eagle') this.fx.feathers(e.pos.x, hy, e.pos.z, 7, 0x5a3f2c);
      else this.fx.debris(e.pos.x, hy, e.pos.z, 3, 0x9a9da6, 14, 0.5, 1);
    }
    const bell = this.world.places.liberty;
    if (bell && this.time - (this.bellT || -9) > 0.8 && h.y < 12 && Math.hypot(h.x - bell.x, h.z - bell.z) < h.radius + 5) {
      this.bellT = this.time;
      this.audio.play('bell');
      this.cam.shake(0.3);
      this.fx.ring(bell.x, 9, bell.z, 3, 26, 0.7, 0xffd98a);
      if (!this.seen.bell) {
        this.seen.bell = true;
        this.stats.score += 500;
        this.hud.toast('LET FREEDOM RING', 'Secret found: +500', 2200);
      } else {
        this.stats.score += 10;
      }
    }
    const res = this.world.damageAt(h.x, h.z, Math.max(5, h.radius * 0.7), h.dmg * 1.4);
    for (const b of res.hit) this.fx.dust(clamp(h.x, b.x - b.w / 2, b.x + b.w / 2), 5, clamp(h.z, b.z - b.d / 2, b.z + b.d / 2), 3, 2.5);
    for (const b of res.destroyed) this.onBuildingDown(b);
    if (hits) {
      this.combo += hits;
      this.comboTimer = 2.4;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      p.addRage(hits * (h.heavy ? 10 : 7));
      this.audio.play(h.heavy ? 'punchBig' : 'punch');
      this.freeze = Math.max(this.freeze, h.heavy ? 0.09 : 0.05);
      this.cam.shake(h.heavy ? 0.45 : 0.22);
      this.buzz(h.heavy ? 30 : 12);
    } else if (res.hit.length || res.destroyed.length) {
      this.audio.play('crack');
      this.cam.shake(0.14);
      p.addRage(1.5);
    }
    return hits;
  }

  onBuildingDown(b) {
    const big = clamp((b.w * b.d * b.h) / 9000, 0.4, 3);
    this.fx.debris(b.x, 2, b.z, Math.round(8 + big * 8), b.baseColor.getHex(), 22 + big * 6, 1.4 + big * 0.5, Math.min(b.h, 30));
    this.fx.dust(b.x, 3, b.z, Math.round(8 + big * 5), 4 + big * 2.5);
    this.fx.dustRing(b.x, 1, b.z, Math.max(b.w, b.d) * 0.7, 10, 4 + big);
    this.audio.play('crumble');
    this.cam.shake(0.3 + big * 0.12);
    this.stats.buildings++;
    this.stats.bill += b.w * b.d * b.h * 900;
    this.stats.score += Math.round(40 + big * 60);
    this.hud.float('+' + Math.round(40 + big * 60), b.x, Math.min(b.h, 24), b.z, 'good');
    if (b !== this.world.gate && Math.random() < 0.14 * this.diff.drops) this.dropPretzel(b.x + rand(-4, 4), b.z + rand(-4, 4));
  }

  // The ground-shaking part of a slam or a heavy landing.
  groundPound(x, z, r, power) {
    const y = this.world.groundHeight(x, z);
    this.fx.ring(x, y, z, 2, r, 0.45, 0xfff1d0);
    this.fx.dustRing(x, y + 0.8, z, r * 0.6, Math.round(8 + power * 10), 2.5 + power * 2);
    this.cam.shake(0.25 + power * 0.5);
    this.audio.play(power > 0.6 ? 'slam' : 'thud');
    this.world.trample(x, z, r * 0.7, this.onTreeFlattened, this.onCarKicked);
  }

  roarBlast(x, z) {
    this.fx.ring(x, this.player.pos.y, z, 4, 50, 0.6, 0xff6a2a);
    this.fx.ring(x, this.player.pos.y, z, 2, 30, 0.45, 0xffd23a);
    this.cam.shake(0.8);
    for (const e of this.enemies) {
      if (!e.hurtable) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) < 50) e.stun(3.2);
    }
    this.hud.toast('RAGE!', 'Double damage', 1300);
  }

  footstep(x, z, water) {
    this.audio.play(water > 0.4 ? 'splash' : 'step');
    this.cam.shake(0.05);
    if (water > 0.4) this.fx.dust(x, -0.5, z, 3, 2.2, 0xcfe6f5, 1.5);
    else this.fx.dust(x, this.player.pos.y + 0.6, z, 1, 1.6);
  }

  shake(amount, pos) {
    const d = pos ? Math.hypot(pos.x - this.player.pos.x, pos.z - this.player.pos.z) : 0;
    this.cam.shake(amount * clamp(1 - d / 160, 0.15, 1));
  }

  onEnemyKilled(e) {
    this.stats.kos++;
    const pts = SCORE[e.kind] || 100;
    this.stats.score += pts;
    this.hud.float(e.boss ? 'K.O.!' : 'KO +' + pts, e.pos.x, e.pos.y + e.height, e.pos.z, 'big');
    this.audio.play('ko');
    if (e.boss) return this.onBossDefeated();
    if (e === this.barTarget) {
      this.barTarget = null;
      this.hud.showBoss(null);
      this.slow = 0.6;
      this.hud.toast('DETHRONED', e.name + ' is out of here', 2000);
      for (let k = 0; k < 2; k++) this.dropPretzel(e.pos.x + rand(-8, 8), e.pos.z + rand(-8, 8));
    }
    if (Math.random() < 0.3 * this.diff.drops) this.dropPretzel(e.pos.x, e.pos.z);
  }

  onCounter(boss, say = 'Punched out of the sky') {
    this.hud.toast('COUNTER!', say, 1400);
    this.slow = 0.5;
    this.cam.shake(0.8);
    this.stats.score += 300;
    if (boss.kind === 'eagle') this.fx.feathers(boss.pos.x, boss.pos.y + 8, boss.pos.z, 16, 0x5a3f2c);
    else this.fx.dust(boss.pos.x, boss.pos.y + 4, boss.pos.z, 10, 4);
  }

  onBossDefeated() {
    this.bossActive = false;
    this.barTarget = null;
    this.hud.showBoss(null);
    this.slow = 1.6;
    this.audio.heat = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss) e.die(rand(-1, 1), rand(-1, 1), true);
    for (const h of this.hazards) h.t = h.delay + 9;
    this.hud.toast('BATTERED!', this.stop.bossName + ' is out of here', 3000);
    try {
      const done = cleared();
      if (!done.includes(this.stop.id)) localStorage.setItem('cleared', JSON.stringify([...done, this.stop.id]));
    } catch {
      /* private mode */
    }
    this.setObjective(this.objectives.length);
    this.after(2.6, () => {
      this.player.victory = true;
      this.controlsOn = false;
      this.audio.play('roar');
      this.audio.play('win');
    });
    this.after(6.2, () => {
      this.state = 'win';
      this.hud.show(false);
      const next = STOPS[this.stopIndex + 1];
      this.screens.show('win', { stats: this.stats, stop: this.stop, n: ORDINAL[this.stopIndex], next, level: this.diff.name, golds: this.golds.length, goldName: this.goldNames.short });
    });
  }

  // A short rumble on phones that support it.
  buzz(ms) {
    if (this.input.touch && navigator.vibrate) navigator.vibrate(ms);
  }

  onClimbStart() {
    if (this.seen.climb) return;
    this.seen.climb = true;
    this.hud.hint(this.input.touch ? 'Climbing! Push toward the wall to go up. <b>JUMP</b> leaps off, <b>SLAM</b> dives.' : 'Climbing! Hold toward the wall to go up. <b>Space</b> leaps off, <b>K</b> dives.');
    this.after(7, () => this.hud.hint(''));
  }

  onRoofReached(h) {
    if (h >= 110 && !this.seen.tower) {
      this.seen.tower = true;
      this.stats.score += 1000;
      this.audio.play('objective');
      this.hud.toast('KING OF THE CITY', 'Top of a tower: +1,000', 2600);
    } else if (h >= 8 && !this.seen.roof) {
      this.seen.roof = true;
      this.hud.toast('ROOFTOP!', 'Now dive off it', 1800);
    }
  }

  onBigDive(drop) {
    const pts = Math.round(drop * 4);
    this.stats.score += pts;
    this.slow = Math.max(this.slow, 0.25);
    this.buzz(60);
    this.hud.toast('MEGA DIVE', '+' + pts, 1400);
  }

  onPlayerHurt(dmg) {
    this.buzz(40);
    this.hud.hurtFlash();
    this.hud.float('-' + dmg, this.player.pos.x, this.player.pos.y + 16, this.player.pos.z, 'bad');
    this.audio.play('hurt');
    this.cam.shake(0.4);
    this.combo = 0;
    if (this.god) this.player.hp = 100;
  }

  onPlayerDead() {
    this.controlsOn = false;
    this.audio.play('lose');
    this.slow = 1.2;
    this.after(1.9, () => {
      this.state = 'dead';
      this.hud.show(false);
      this.screens.show('dead');
    });
  }

  // ---- things that fly at the ape -----------------------------------------

  throwTrash(from, tx, tz) {
    const T = 1.15;
    const g = 60;
    const y0 = from.pos.y + 8;
    const ty = this.standHeight(tx, tz);
    const mesh = new THREE.Mesh(this.trashGeo, this.trashMat);
    mesh.scale.set(1.5, 2.4, 1.5);
    mesh.castShadow = true;
    mesh.position.set(from.pos.x, y0, from.pos.z);
    this.stage.scene.add(mesh);
    this.hazards.push({
      kind: 'trash', mesh, t: 0, delay: T, x: tx, z: tz, y: ty, r: 6.5, dmg: 9,
      vx: (tx - from.pos.x) / T, vz: (tz - from.pos.z) / T, vy: (ty - y0 + 0.5 * g * T * T) / T, g,
      marker: this.fx.marker(tx, tz, 6.5, T, ty),
    });
    this.audio.play('swipe');
  }

  // Where something aimed at (x, z) should land: the roof the ape is standing
  // on if he is up on one, otherwise the street.
  standHeight(x, z) {
    const p = this.player;
    const ground = this.world.groundHeight(x, z);
    if ((p.onGround || p.state === 'climb') && p.pos.y > ground + 2 && Math.hypot(x - p.pos.x, z - p.pos.z) < 12) return p.pos.y;
    return ground;
  }

  // Something thrown down at the ape that lands after `delay`: an eagle's
  // feather, or one of Bullion's gold coins.
  featherStrike(from, tx, tz, delay, kind = 'feather') {
    const ty = this.standHeight(tx, tz);
    const coin = kind === 'coin';
    const mesh = new THREE.Mesh(coin ? this.coinGeo : this.featherGeo, coin ? this.coinMat : this.featherMat);
    if (coin) mesh.scale.setScalar(1.6);
    else mesh.scale.set(1.3, 0.3, 8);
    const sx = from.pos.x;
    const sy = from.pos.y + 10;
    const sz = from.pos.z;
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(tx, ty, tz);
    this.stage.scene.add(mesh);
    this.hazards.push({ kind, mesh, t: 0, delay, x: tx, z: tz, y: ty, r: 6, dmg: 9, sx, sy, sz, marker: this.fx.marker(tx, tz, 6, delay, ty) });
  }

  updateHazards(dt) {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (h.landed) {
        if (h.t > h.delay + 0.7) h.done = true;
        continue;
      }
      if (h.kind === 'trash') {
        h.vy -= h.g * dt;
        h.mesh.position.x += h.vx * dt;
        h.mesh.position.y += h.vy * dt;
        h.mesh.position.z += h.vz * dt;
        h.mesh.rotation.x += dt * 9;
        h.mesh.rotation.z += dt * 6;
      } else {
        const u = Math.min(1, h.t / h.delay);
        h.mesh.position.set(h.sx + (h.x - h.sx) * u, h.sy + (h.y + 2 - h.sy) * u, h.sz + (h.z - h.sz) * u);
      }
      if (h.t >= h.delay) {
        h.landed = true;
        h.marker.life = 0;
        this.fx.dust(h.x, h.y + 0.6, h.z, 4, 2.2);
        if (h.kind === 'trash') {
          this.fx.debris(h.x, h.y + 1, h.z, 5, 0x8a9096, 16, 0.7, 1);
          h.done = true;
        } else if (h.kind === 'coin') {
          this.fx.spark(h.x, h.y + 1.5, h.z, 3.5, 0xffe08a);
        } else {
          this.fx.feathers(h.x, h.y + 2, h.z, 2);
        }
        this.audio.play('thud');
        if (h.t < h.delay + 1 && Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < h.r && p.pos.y < h.y + 6) p.takeDamage(h.dmg, h.x, h.z, 16);
      }
    }
    if (this.hazards.some((h) => h.done)) {
      this.hazards = this.hazards.filter((h) => {
        if (h.done) h.mesh.removeFromParent();
        return !h.done;
      });
    }
  }

  // ---- golden pretzels: ten hidden round the city -------------------------

  placeGolds() {
    const spots = this.stop.golds(this.world);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.3, metalness: 0.7, emissive: 0xb06a00, emissiveIntensity: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.CylinderGeometry(1.6, 1.6, 44, 10, 1, true).translate(0, 16, 0);
    this.golds = spots.map(([x, z]) => {
      const mesh = new THREE.Mesh(this.goldGeo, mat);
      mesh.scale.setScalar(1.7);
      const light = new THREE.Mesh(beam, glow);
      light.renderOrder = 3;
      mesh.add(light);
      light.scale.setScalar(1 / 1.7);
      this.stage.scene.add(mesh);
      return { x, z, mesh, got: false, t: rand(6) };
    });
    this.stats.gold = 0;
    this.hud.setGold(0, this.golds.length);
    this.updateGolds(0);
  }

  updateGolds(dt) {
    const p = this.player;
    const w = this.world;
    for (const g of this.golds) {
      if (g.got) continue;
      g.t += dt;
      // They sit on whatever is there: the street, or a roof until it falls.
      const y = Math.max(w.groundHeight(g.x, g.z), w.roofAt(g.x, g.z, 1e9)) + 6 + Math.sin(g.t * 2.4) * 0.8;
      g.mesh.position.set(g.x, y, g.z);
      g.mesh.rotation.y += dt * 1.8;
      if (this.state === 'play' && Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 9 && Math.abs(p.pos.y + 6 - y) < 13) {
        g.got = true;
        g.mesh.removeFromParent();
        const n = ++this.stats.gold;
        const total = this.golds.length;
        this.stats.score += 250;
        this.audio.play('objective');
        this.fx.ring(g.x, y - 5, g.z, 2, 16, 0.5, 0xffd23a);
        this.hud.setGold(n, total);
        if (n === total) {
          this.stats.score += 2000;
          this.hud.toast(this.goldNames.all, 'All ' + total + ' ' + this.goldNames.plural + ': +2,000', 3200);
        } else {
          this.hud.toast(this.goldNames.one, n + ' of ' + total + ' found', 1800);
        }
      }
    }
  }

  dropPretzel(x, z) {
    if (this.pickups.length >= 10) return;
    const b = this.world.bounds;
    x = clamp(x, b.x0 + 4, b.x1 - 4);
    z = clamp(z, b.z0 + 4, b.z1 - 4);
    const mesh = new THREE.Mesh(this.snackGeo, this.snackMat);
    mesh.castShadow = true;
    mesh.position.set(x, this.world.groundHeight(x, z) + 4, z);
    this.stage.scene.add(mesh);
    this.pickups.push({ x, z, mesh, t: rand(6) });
  }

  updatePickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      k.t += dt;
      k.mesh.rotation.y += dt * 2.2;
      k.mesh.position.y = this.world.groundHeight(k.x, k.z) + 4 + Math.sin(k.t * 3) * 0.7;
      if (p.state !== 'dead' && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 7.5 && p.pos.y < k.mesh.position.y + 6) {
        k.done = true;
        p.heal(20);
        this.audio.play('pickup');
        this.hud.float('+20', k.x, k.mesh.position.y + 4, k.z, 'good');
        this.stats.score += 25;
      }
    }
    if (this.pickups.some((k) => k.done)) {
      this.pickups = this.pickups.filter((k) => {
        if (k.done) k.mesh.removeFromParent();
        return !k.done;
      });
    }
  }

  // ---- the frame ---------------------------------------------------------

  update(rawDt) {
    this.input.poll();
    if (this.input.take('pause')) {
      if (this.state === 'play') this.pause();
      else if (this.state === 'pause') this.resume();
    }
    if (this.input.take('mute')) this.audio.setMuted(!this.audio.muted);

    if (this.state === 'select') {
      const p = this.player;
      p.time += rawDt;
      if (this.flexT > 0 && (this.flexT -= rawDt) <= 0) p.showcase = 'idle';
      p.animate(rawDt);
      p.root.visible = true;
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      this.stage.camera.position.set(p.pos.x + fx * 44 - fz * 10, p.pos.y + 12, p.pos.z + fz * 44 + fx * 10);
      this.stage.camera.lookAt(p.pos.x, p.pos.y + 8, p.pos.z);
      if (this.stage.camera.fov !== 42) {
        this.stage.camera.fov = 42;
        this.stage.camera.updateProjectionMatrix();
      }
      this.time += rawDt;
      this.world.update(rawDt);
      this.fx.update(rawDt);
      this.stage.setFocus(p.pos.x, p.pos.y, p.pos.z);
      this.input.flush();
      return;
    }
    if (this.state === 'title' || this.state === 'win') {
      const o = this.stop.orbit;
      this.cam.orbit(rawDt, o.x, o.y, o.z, o.r, o.h, 0.06);
      this.time += rawDt;
      for (const e of this.enemies) e.update(rawDt);
      this.world.update(rawDt);
      this.fx.update(rawDt);
      this.stage.setFocus(o.x, 0, o.z);
      this.input.flush();
      return;
    }
    if (this.state === 'pause' || this.state === 'dead') {
      this.input.flush();
      return;
    }

    // Hit-stop and slow motion both stretch time for a moment.
    let dt = rawDt;
    if (this.freeze > 0) {
      this.freeze -= rawDt;
      dt *= 0.04;
    } else if (this.slow > 0) {
      this.slow -= rawDt;
      dt *= 0.3;
    }
    this.time += dt;
    this.stats.time += this.state === 'play' && this.controlsOn ? dt : 0;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    this.player.update(dt);
    // Lets traffic brake and pigeons on the plazas scatter as the ape comes by.
    if (this.world.setStomper) this.world.setStomper(this.player.pos.x, this.player.pos.z);
    for (const e of this.enemies) e.update(dt);
    // Keep animals on the ground from standing inside each other.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || a.boss || a.kind === 'pigeon') continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || b.boss || b.kind === 'pigeon') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const min = a.radius + b.radius + 0.5;
        if (d < min) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
    }
    if (this.enemies.some((e) => e.remove)) this.enemies = this.enemies.filter((e) => !e.remove);

    this.updateHazards(dt);
    this.updatePickups(dt);
    // Kicked cars arriving at the animal they were aimed at.
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt;
      if (m.t < m.T) continue;
      this.missiles.splice(i, 1);
      const e = m.tgt;
      if (e.hurtable && Math.hypot(e.pos.x - m.x, e.pos.z - m.z) < e.radius + 7 && e.takeHit({ dmg: 14, dx: m.dx, dz: m.dz, knock: 22, launch: 12, heavy: false })) {
        const hy = e.pos.y + e.height * 0.6;
        this.fx.spark(e.pos.x, hy, e.pos.z, 6);
        this.hud.float('14', e.pos.x, hy + 3, e.pos.z);
        this.audio.play('punch');
        this.combo++;
        this.comboTimer = 2.4;
        this.player.addRage(6);
      }
    }
    this.updateMission(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.player.rage >= 100 && this.player.rageMode <= 0 && !this.seen.rage) {
      this.seen.rage = true;
      this.hud.hint(this.input.touch ? 'Rage is full: tap <b>ROAR</b>' : 'Rage is full: press <b>L</b> to roar');
      this.after(7, () => this.hud.hint(''));
    }
    this.hud.el.classList.toggle('rage-ready', this.player.rage >= 100 && this.player.rageMode <= 0);

    this.world.update(dt);
    this.fx.update(dt);
    if (this.cut) {
      // A slow turn round the boss where he waits.
      const f = this.boss.cutFocus();
      const c = this.stage.camera;
      this.cut.t += rawDt;
      const a = f.a + this.cut.t * 0.12;
      c.position.set(f.x + Math.sin(a) * f.r, f.y + f.dy, f.z + Math.cos(a) * f.r);
      c.lookAt(f.x, f.y + f.look, f.z);
    } else {
      this.cam.update(rawDt, this);
    }
    this.updateGolds(dt);
    this.hud.update(this, rawDt);
    this.stage.setFocus(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.input.flush();
  }

  // Keeps the frame rate up on slower phones by drawing fewer pixels, and
  // gives them back when there is headroom.
  govern(raw) {
    const f = this.fps;
    if (raw > 0.5 || document.hidden) return;
    f.t += raw;
    f.n++;
    if (f.t < 1.5) return;
    const rate = f.n / f.t;
    f.t = 0;
    f.n = 0;
    const st = this.stage;
    if (!st.setScale) return;
    if (rate < 40 && st.scale > 0.5) {
      st.setScale(st.scale - (rate < 26 ? 0.15 : 0.08));
      f.good = 0;
    } else if (rate > 56 && st.scale < 1) {
      if (++f.good >= 4) {
        st.setScale(st.scale + 0.06);
        f.good = 0;
      }
    } else {
      f.good = 0;
    }
  }

  run() {
    let last = performance.now();
    const frame = (now) => {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw);
      last = now;
      // Resolution changes clear the canvas, so they happen before drawing.
      if (this.governed) this.govern(raw);
      this.update(dt);
      this.stage.render(dt);
      this.frames = (this.frames || 0) + 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
