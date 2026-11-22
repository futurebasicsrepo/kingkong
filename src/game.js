import * as THREE from 'three';
import { createStage } from './engine/render.js';
import { buildPhiladelphia } from './world/philadelphia.js';
import { Fx } from './engine/fx.js';
import { Audio } from './engine/audio.js';
import { Input } from './engine/input.js';
import { ChaseCam } from './engine/camera.js';
import { GEO } from './engine/build.js';
import { clamp, rand } from './engine/util.js';
import { Ape, APES } from './actors/ape.js';
import { Raccoon, Pigeon } from './actors/enemies.js';
import { Eagle } from './actors/eagle.js';
import { Hud, Screens } from './ui/hud.js';

// The tour, in order, and who runs each city. Only the first stop is built so far.
export const TOUR = [
  { name: 'Philadelphia', rival: 'Baldwin, the Bald Eagle of Broad Street', open: true },
  { name: 'New York City', rival: 'Bullion, the Wall Street Bull' },
  { name: 'Santa Clara', rival: 'Nugget, the Gold Rush Grizzly' },
  { name: 'San Francisco', rival: 'Barker, the Sea Lion of the Bay' },
  { name: 'London', rival: 'Regent, the Lion of Trafalgar' },
  { name: 'Tokyo', rival: 'Kabuto, the Giant Stag Beetle' },
  { name: 'Paris', rival: 'Chanticleer, the Rooster of Paris' },
  { name: 'Shanghai', rival: 'Huangpu, the Tiger of the Bund' },
];

const SCORE = { raccoon: 100, thrower: 130, pigeon: 120, eagle: 2500 };

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
    this.stage = createStage(canvas, { quality: q.get('quality') || saved || undefined });
    this.world = buildPhiladelphia(this.stage.scene);
    this.fx = new Fx(this.stage.scene);
    this.audio = new Audio();
    this.hud = new Hud(ui, this);
    this.screens = new Screens(ui, this);
    this.input = new Input(canvas, ui);
    this.cam = new ChaseCam(this.stage.camera);
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
    this.tokens = 2;
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
    this.objectives = [
      { type: 'gate', title: 'Break out', text: 'Punch the zoo gate down', at: P.zooGate, spawn: P.start },
      {
        type: 'wave', title: 'Eakins Oval', text: 'Clear the Trash Pandas off the Art Museum steps', at: P.oval, r: 62,
        spawn: { x: -500, z: -262, yaw: Math.PI / 2 }, call: ['TRASH PANDAS', 'They got into the Schuylkill punch too'],
        waves: [[['raccoon', 3]], [['raccoon', 3], ['thrower', 2]]],
      },
      {
        type: 'wave', title: 'Logan Circle', text: 'Swat the pigeons off the Parkway', at: P.logan, r: 54,
        spawn: { x: P.oval.x + 10, z: P.oval.z + 10, yaw: 0.85 }, call: ['INCOMING', 'Jump and punch, or wait for the dive'],
        waves: [[['pigeon', 4]], [['pigeon', 3], ['raccoon', 3]], [['thrower', 2], ['pigeon', 3], ['raccoon', 3]]],
      },
      { type: 'boss', title: 'City Hall', text: 'Baldwin is waiting on the tower', at: P.dilworth, r: 70, spawn: { x: -117, z: -117, yaw: 0.6 } },
    ];
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

    // One shared pretzel.
    const tan = new THREE.MeshStandardMaterial({ color: 0xb8702a, roughness: 0.6, emissive: 0x5a2a00, emissiveIntensity: 0.5 });
    this.pretzelGeo = new THREE.TorusKnotGeometry(1.7, 0.52, 48, 7, 2, 3);
    this.pretzelMat = tan;
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

    const jump = { oval: 1, logan: 2, boss: 3 }[q.get('start')];
    if (jump !== undefined) this.checkpoint = jump;
    if (q.get('autoplay') || jump !== undefined) this.start();
    else this.screens.show('title');
  }

  resetStats() {
    this.stats = { score: 0, kos: 0, buildings: 0, bill: 0, bestCombo: 0, time: 0 };
  }

  after(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }

  // ---- flow --------------------------------------------------------------

  action(name) {
    if (name.startsWith('pick:')) return this.pickApe(name.slice(5));
    switch (name) {
      case 'select':
        this.showSelect();
        break;
      case 'tour':
        this.player.showcase = null;
        this.state = 'title';
        this.screens.show('tour', { cities: TOUR });
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
        this.screens.show('pause', { muted: this.audio.muted, quality: this.stage.quality });
        break;
      case 'quality': {
        const next = this.stage.quality === 'high' ? 'low' : 'high';
        try {
          localStorage.setItem('quality', next);
        } catch {
          /* private mode */
        }
        location.search = `?autoplay=1&quality=${next}`;
        break;
      }
      case 'again':
        location.search = '?autoplay=1';
        break;
      case 'quit':
        location.search = '';
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
    const t = this.world.places.terrace;
    this.state = 'select';
    this.player.reset(t.x, t.z, this.world.places.terraceYaw ?? 0.86);
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
      this.screens.intro('STOP ONE', 'PHILADELPHIA', 'Something in the Schuylkill made everything big. The zoo gate is shut. Not for long.');
      this.hud.hint(this.input.touch ? '<b>Left thumb</b> to move &nbsp; <b>drag</b> to look' : '<b>W A S D</b> to move &nbsp; <b>drag the mouse</b> to look');
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.screens.show('pause', { muted: this.audio.muted, quality: this.stage.quality });
  }

  resume() {
    this.screens.hide();
    this.state = 'play';
  }

  placePlayer(s) {
    this.player.reset(s.x, s.z, s.yaw ?? 0);
    this.cam.snap(this.player);
  }

  spawnBoss() {
    if (this.boss && !this.boss.remove) this.boss.rig.dispose();
    this.enemies = this.enemies.filter((e) => e !== this.boss);
    this.boss = new Eagle(this, 0, 0);
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
    this.tokens = 2;
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
    this.player.heal(25);
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
      this.hud.toast('OUT!', 'Cross the bridge to the Art Museum');
      this.hud.hint('');
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
      if (this.world.gate.state !== 'up') this.completeObjective();
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
        this.boss.setState('enter');
        this.hud.showBoss(this.boss);
        this.screens.intro('THE BOSS OF BROAD STREET', this.boss.name, 'Dodge the red marks. Hit him mid-swoop, or batter him while his talons are stuck.');
        this.audio.play('screech');
        this.audio.heat = 1;
        this.objectivePos = null;
        this.hud.setObjective('Boss fight', 'Batter Baldwin');
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
    if (kind === 'pigeon') e = new Pigeon(this, x, z);
    else e = new Raccoon(this, x, z, kind === 'thrower');
    if (kind !== 'pigeon') this.fx.dust(x, 1, z, 6, 3);
    this.enemies.push(e);
    return e;
  }

  summonPigeons(n) {
    const b = this.boss;
    for (let k = 0; k < n; k++) this.after(k * 0.25, () => this.spawnEnemy('pigeon', b.pos.x + rand(-30, 30), b.pos.z + rand(-30, 30)));
    this.hud.toast('BACKUP!', 'He called the flock', 1500);
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
    if (b !== this.world.gate && Math.random() < 0.14) this.dropPretzel(b.x + rand(-4, 4), b.z + rand(-4, 4));
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
    if (Math.random() < 0.3) this.dropPretzel(e.pos.x, e.pos.z);
  }

  onCounter(boss) {
    this.hud.toast('COUNTER!', 'Punched out of the sky', 1400);
    this.slow = 0.5;
    this.cam.shake(0.8);
    this.stats.score += 300;
    this.fx.feathers(boss.pos.x, boss.pos.y + 8, boss.pos.z, 16, 0x5a3f2c);
  }

  onBossDefeated() {
    this.bossActive = false;
    this.hud.showBoss(null);
    this.slow = 1.6;
    this.audio.heat = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss) e.die(rand(-1, 1), rand(-1, 1), true);
    for (const h of this.hazards) h.t = h.delay + 9;
    this.hud.toast('BATTERED!', 'Baldwin is out of here', 3000);
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
      this.screens.show('win', { stats: this.stats, next: TOUR[1].name });
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

  featherStrike(from, tx, tz, delay) {
    const ty = this.standHeight(tx, tz);
    const mesh = new THREE.Mesh(this.featherGeo, this.featherMat);
    mesh.scale.set(1.3, 0.3, 8);
    const sx = from.pos.x;
    const sy = from.pos.y + 10;
    const sz = from.pos.z;
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(tx, ty, tz);
    this.stage.scene.add(mesh);
    this.hazards.push({ kind: 'feather', mesh, t: 0, delay, x: tx, z: tz, y: ty, r: 6, dmg: 9, sx, sy, sz, marker: this.fx.marker(tx, tz, 6, delay, ty) });
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

  dropPretzel(x, z) {
    if (this.pickups.length >= 10) return;
    const b = this.world.bounds;
    x = clamp(x, b.x0 + 4, b.x1 - 4);
    z = clamp(z, b.z0 + 4, b.z1 - 4);
    const mesh = new THREE.Mesh(this.pretzelGeo, this.pretzelMat);
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
      this.cam.orbit(rawDt, -40, 40, -10, 290, 120, 0.06);
      this.time += rawDt;
      for (const e of this.enemies) e.update(rawDt);
      this.world.update(rawDt);
      this.fx.update(rawDt);
      this.stage.setFocus(-40, 0, -10);
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
    this.cam.update(rawDt, this);
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
