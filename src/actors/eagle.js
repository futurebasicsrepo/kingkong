import * as THREE from 'three';
import { Rig } from './rig.js';
import { Enemy } from './enemies.js';
import { GEO } from '../engine/build.js';
import { clamp, clamp01, damp, rand } from '../engine/util.js';

// Baldwin, the bald eagle who runs City Hall. Named for the Baldwin
// Locomotive Works, hence the engineer's cap.
function buildEagle() {
  const brown = 0x4a3323;
  const brown2 = 0x64452f;
  const dark = 0x2c1e15;
  const white = 0xf2efe6;
  const yellow = 0xf0b429;
  const yellow2 = 0xc98a12;
  const cap = 0x35568c;
  const rig = new Rig({ roughness: 0.8 });
  const body = rig.joint('body', null, 0, 8.4, 0);
  rig.blob(body, brown, 0, 1.5, 0, 4.6, 6.2, 4.6);
  rig.blob(body, brown2, 0, 1.2, 2.1, 3.6, 4.7, 2.7);
  rig.blob(body, white, 0, 6.3, 0.6, 3.3, 2.2, 3.2);
  for (let k = -2; k <= 2; k++) rig.blob(body, white, k * 1.3, -4.4, -3.6 - Math.abs(k) * 0.2, 0.95, 0.32, 3.6, 0.5, k * 0.16, 0);

  const head = rig.joint('head', body, 0, 7.6, 1.2);
  rig.blob(head, white, 0, 0.6, 0.2, 2.7, 2.6, 2.9);
  rig.blob(head, yellow, 0, 0.15, 3.3, 1.0, 0.95, 1.9);
  rig.on(head).add(GEO.cone(5), yellow2, 0, 0.25, 4.85, 0.62, 1.7, 0.62, 0, Math.PI * 0.88, 0);
  for (const s of [-1, 1]) {
    rig.on(head).add(GEO.cube(), 0xd9d5ca, s * 1.3, 1.5, 2.25, 2.0, 0.55, 1.3, 0, 0, s * -0.42);
    rig.blob(head, 0xffd23a, s * 1.55, 0.78, 2.2, 0.5, 0.46, 0.36);
    rig.blob(head, 0x0a0a0b, s * 1.75, 0.78, 2.42, 0.24, 0.26, 0.2);
  }
  // The cap: blue with white ticking stripes and a short brim.
  rig.on(head).cyl(2.35, 1.6, 0, 2.5, -0.2, cap, 12);
  for (let k = 0; k < 6; k++) rig.on(head).add(GEO.cube(), white, Math.sin((k / 6) * Math.PI * 2) * 2.3, 3.3, -0.2 + Math.cos((k / 6) * Math.PI * 2) * 2.3, 0.22, 1.5, 0.22);
  rig.on(head).cyl(2.4, 0.3, 0, 4.1, -0.2, cap, 12);
  rig.on(head).box(3.4, 0.3, 2.4, 0, 2.5, 2.2, cap);
  const beak = rig.joint('beak', head, 0, -0.45, 2.5);
  rig.blob(beak, yellow2, 0, -0.2, 1.0, 0.8, 0.4, 1.4);

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const leg = rig.joint('leg' + side, body, s * 2.2, -3.6, 0.3);
    rig.blob(leg, brown, 0, -0.8, 0, 1.7, 2.2, 1.8);
    rig.on(leg).cyl(0.62, 2.7, 0, -4.5, 0, yellow, 6);
    for (const k of [-1, 0, 1]) {
      rig.blob(leg, yellow, k * 0.95, -4.55, 1.5, 0.46, 0.42, 1.6);
      rig.on(leg).add(GEO.cone(4), dark, k * 0.95, -4.5, 3.0, 0.3, 1.2, 0.3, 0, Math.PI * 0.62, 0);
    }
    rig.blob(leg, yellow, 0, -4.55, -1.0, 0.42, 0.4, 1.1);

    const wing = rig.joint('wing' + side, body, s * 4.2, 4.6, -0.4);
    rig.blob(wing, brown, s * 5, 0, 0, 5.6, 0.7, 3.6);
    rig.blob(wing, brown2, s * 4.6, 0.3, 1.0, 4.6, 0.5, 1.9);
    const tip = rig.joint('tip' + side, wing, s * 10, 0, 0);
    rig.blob(tip, dark, s * 5.5, 0, -0.3, 6.2, 0.5, 3.2);
    for (let k = 0; k < 5; k++) rig.on(tip).add(GEO.cube(), dark, s * 11.6, 0, 1.7 - k * 1.15, 5.6, 0.26, 0.9, s * (0.28 - k * 0.15));
  }
  return rig.finish();
}

const CRUISE = 38;

export class Eagle extends Enemy {
  constructor(game, x, z) {
    super(game, x, z, { kind: 'eagle', build: buildEagle, hp: 560, radius: 7, height: 21 });
    this.boss = true;
    this.name = 'BALDWIN';
    this.title = 'The Bald Eagle of Broad Street';
    this.scale = 1;
    this.stage = 1;
    this.script = 0;
    this.orbit = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.marker = null;
    this.struck = false;
    this.volley = 0;
    this.summons = 0;
    this.stuckFor = 3.4;
    this.pose = { pitch: 0.15, head: 0, leg: 0, beak: 0 };
    this.mode = 'fold';
    this.setState('perch');
  }

  get hurtable() {
    return !this.dead && this.state !== 'perch' && this.state !== 'enter';
  }

  // Where the entrance cut looks: up at him on the City Hall tower.
  cutFocus() {
    const pl = this.game.world.places.perch;
    return { x: pl.x, y: pl.y, z: pl.z, r: 78, dy: -6, look: 10, a: -0.75 };
  }

  clearMarker() {
    if (this.marker) {
      this.marker.life = 0;
      this.marker = null;
    }
  }

  takeHit(h) {
    if (!this.hurtable) return false;
    const g = this.game;
    let dmg = h.dmg;
    const countered = this.state === 'swoop';
    if (countered) dmg *= 1.6;
    this.hp -= dmg;
    this.flash = 1;
    h.dealt = dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.clearMarker();
      this.die(h.dx, h.dz, true);
      return true;
    }
    if (countered) {
      // Punched out of the sky mid-swoop.
      this.clearMarker();
      this.vel.set(this.dir.x * 30 + h.dx * 22, 16, this.dir.z * 30 + h.dz * 22);
      this.stuckFor = 4.4 * ((g.diff && g.diff.stuck) || 1);
      this.setState('crash');
      g.onCounter(this);
    }
    const s = this.hp / this.maxHp;
    this.stage = s > 0.66 ? 1 : s > 0.33 ? 2 : 3;
    return true;
  }

  stun() {
    // Too big to be stunned by a roar, but it does rattle him.
    this.flash = 0.6;
  }

  die(dx, dz) {
    this.dead = true;
    this.setState('dead');
    this.vel.set(dx * 40, 62, dz * 40);
    this.spin.set(rand(5, 8), rand(-3, 3), rand(4, 7));
    this.game.onEnemyKilled(this);
  }

  updateDead(dt) {
    this.vel.y -= 26 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.root.rotation.x += this.spin.x * dt;
    this.root.rotation.z += this.spin.z * dt;
    if (this.t > 0.2 && Math.random() < dt * 30) this.game.fx.feathers(this.pos.x, this.pos.y + 8, this.pos.z, 2);
    const k = clamp(1 - (this.t - 2.0) / 0.9, 0, 1);
    this.root.scale.setScalar(Math.max(0.001, k));
    if (this.t > 2.9) {
      this.game.fx.twinkle(this.pos.x, this.pos.y, this.pos.z, 3);
      this.remove = true;
      this.rig.dispose();
    }
  }

  flyTo(x, y, z, speed, dt, rate = 3) {
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(speed, d * rate);
    const k = 1 - Math.exp(-5 * dt);
    this.vel.x += ((dx / d) * sp - this.vel.x) * k;
    this.vel.y += ((dy / d) * sp - this.vel.y) * k;
    this.vel.z += ((dz / d) * sp - this.vel.z) * k;
    this.pos.addScaledVector(this.vel, dt);
    return d;
  }

  next() {
    // Each stage of the fight has its own running order.
    const scripts = {
      1: ['swoop', 'swoop', 'slam'],
      2: ['swoop', 'feathers', 'swoop', 'slam'],
      3: ['swoop', 'swoop', 'feathers', 'slam'],
    };
    if (this.summons < this.stage - 1) {
      this.summons++;
      return 'summon';
    }
    const list = scripts[this.stage];
    return list[this.script++ % list.length];
  }

  think(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const ground = w.groundHeight(this.pos.x, this.pos.z);
    const level = g.diff || { quick: 1, stuck: 1 };
    const quick = (this.stage === 3 ? 0.72 : this.stage === 2 ? 0.86 : 1) * level.quick;
    const alive = p.state !== 'dead' && !p.victory;
    this.glow = 0;
    let pitchT = 1.15;
    let headT = -1.0;
    let legT = 1.2;
    let beakT = 0;
    this.mode = 'fly';

    switch (this.state) {
      case 'perch': {
        const pl = g.world.places.perch;
        this.pos.set(pl.x, pl.y, pl.z);
        this.face(p.pos.x, p.pos.z, 3, dt);
        this.mode = 'fold';
        pitchT = 0.15;
        headT = 0.25;
        legT = 0;
        if (this.taunt) {
          // The entrance: wings out, beak open, screaming at the ape below.
          this.mode = 'hover';
          pitchT = 0.3;
          headT = -0.35;
          beakT = 1;
        }
        break;
      }
      case 'enter': {
        const a = g.world.places.dilworth;
        const d = this.flyTo(a.x, CRUISE, a.z, 70, dt, 1.4);
        this.face(a.x, a.z, 4, dt);
        beakT = this.t < 1.2 ? 0.7 : 0;
        if (d < 12 || this.t > 5) this.setState('hover');
        break;
      }
      case 'hover': {
        this.orbit += dt * 0.55;
        const r = 46;
        this.flyTo(p.pos.x + Math.cos(this.orbit) * r, p.pos.y + CRUISE + Math.sin(this.time * 1.4) * 2, p.pos.z + Math.sin(this.orbit) * r, 62, dt);
        this.face(p.pos.x, p.pos.z, 4, dt);
        if (alive && this.t > 1.5 * quick) {
          const move = this.next();
          if (move === 'swoop') this.beginSwoop(p);
          else if (move === 'slam') this.setState('slamTele');
          else if (move === 'feathers') {
            this.volley = 0;
            this.setState('feathers');
          } else this.setState('summon');
        }
        break;
      }
      case 'swoopTele':
        this.face(this.to.x, this.to.z, 10, dt);
        this.flyTo(this.from.x, this.from.y + 3, this.from.z, 20, dt);
        this.glow = 0.5 + Math.sin(this.t * 34) * 0.5;
        pitchT = 0.7;
        headT = -0.5;
        beakT = 0.8;
        if (this.t > 0.85 * quick) {
          this.struck = false;
          this.from.copy(this.pos);
          this.setState('swoop');
          g.audio.play('swoop');
        }
        break;
      case 'swoop': {
        const len = Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
        const u = clamp01((this.t * 96) / len);
        const low = clamp01(Math.abs(u - 0.47) / 0.47);
        this.pos.x = this.from.x + (this.to.x - this.from.x) * u;
        this.pos.z = this.from.z + (this.to.z - this.from.z) * u;
        this.pos.y = w.groundHeight(this.pos.x, this.pos.z) + 5 + (this.from.y - 5) * Math.pow(low, 1.7);
        this.vel.set(this.dir.x * 96, 0, this.dir.z * 96);
        this.mode = 'glide';
        pitchT = 1.3;
        headT = -1.1;
        legT = -0.5;
        if (!this.struck && this.pos.y < ground + 15 && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 9.5 && p.pos.y < this.pos.y + 12) {
          this.struck = p.takeDamage(18, this.pos.x - this.dir.x * 10, this.pos.z - this.dir.z * 10, 44);
        }
        if (Math.random() < dt * 20 && this.pos.y < ground + 12) g.fx.dust(this.pos.x, ground + 0.5, this.pos.z, 1, 2.4);
        if (u >= 1) {
          this.clearMarker();
          this.setState('hover');
          this.t = 0.9;
        }
        break;
      }
      case 'slamTele': {
        const lock = 1.0 * quick;
        if (this.t < lock) this.to.set(p.pos.x, 0, p.pos.z);
        if (!this.marker) this.marker = g.fx.marker(this.to.x, this.to.z, 17, 9, w.groundHeight(this.to.x, this.to.z));
        this.marker.x = this.to.x;
        this.marker.z = this.to.z;
        this.flyTo(this.to.x, p.pos.y + 42, this.to.z, 80, dt, 4);
        this.face(p.pos.x, p.pos.z, 4, dt);
        this.mode = 'hover';
        pitchT = 0.45;
        headT = 0.2;
        legT = 0;
        beakT = 0.5;
        this.glow = this.t > lock ? 0.5 + Math.sin(this.t * 40) * 0.5 : 0;
        if (this.t > lock + 0.45) {
          this.setState('slamDrop');
          g.audio.play('swoop');
        }
        break;
      }
      case 'slamDrop': {
        const gy = w.groundHeight(this.to.x, this.to.z);
        this.pos.x = damp(this.pos.x, this.to.x, 20, dt);
        this.pos.z = damp(this.pos.z, this.to.z, 20, dt);
        this.pos.y -= 135 * dt;
        this.mode = 'up';
        pitchT = 0.25;
        headT = 0.3;
        legT = -0.2;
        if (this.pos.y <= gy) {
          this.pos.y = gy;
          this.clearMarker();
          g.groundPound(this.pos.x, this.pos.z, 18, 1.1);
          w.damageAt(this.pos.x, this.pos.z, 13, 40);
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 17.5 && p.pos.y < gy + 5) p.takeDamage(22, this.pos.x, this.pos.z, 46);
          this.stuckFor = (this.stage === 3 ? 2.7 : this.stage === 2 ? 3.1 : 3.5) * level.stuck;
          this.vel.set(0, 0, 0);
          this.setState('stuck');
        }
        break;
      }
      case 'crash':
        this.vel.y -= 60 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.vel.x *= Math.exp(-1.0 * dt);
        this.vel.z *= Math.exp(-1.0 * dt);
        this.mode = 'tumble';
        pitchT = 0.6;
        if (this.pos.y <= ground) {
          this.pos.y = ground;
          g.groundPound(this.pos.x, this.pos.z, 12, 0.8);
          this.vel.set(0, 0, 0);
          this.setState('stuck');
        }
        break;
      case 'stuck':
        // Talons jammed in the paving: this is when he can be battered.
        this.pos.y = damp(this.pos.y, ground, 14, dt);
        this.mode = 'stuck';
        pitchT = 0.35 + Math.sin(this.time * 9) * 0.08;
        headT = 0.1 + Math.sin(this.time * 13) * 0.2;
        legT = 0;
        beakT = 0.4;
        if (this.t > this.stuckFor) {
          this.setState('takeoff');
          g.audio.play('flap');
        }
        break;
      case 'takeoff': {
        this.mode = 'hover';
        pitchT = 0.5;
        legT = 0.3;
        this.vel.x = damp(this.vel.x, 0, 4, dt);
        this.vel.z = damp(this.vel.z, 0, 4, dt);
        this.vel.y = damp(this.vel.y, 46, 5, dt);
        this.pos.addScaledVector(this.vel, dt);
        // The downdraught shoves the ape back.
        const dx = p.pos.x - this.pos.x;
        const dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < 24 && this.t < 0.5 && p.state !== 'dead') {
          p.vel.x += (dx / d) * 150 * dt;
          p.vel.z += (dz / d) * 150 * dt;
        }
        if (Math.random() < dt * 24) g.fx.dust(this.pos.x + rand(-9, 9), ground + 0.5, this.pos.z + rand(-9, 9), 1, 3);
        if (this.pos.y > ground + CRUISE - 4) this.setState('hover');
        break;
      }
      case 'feathers': {
        const dx = this.pos.x - p.pos.x;
        const dz = this.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.flyTo(p.pos.x + (dx / d) * 52, p.pos.y + 30, p.pos.z + (dz / d) * 52, 50, dt);
        this.face(p.pos.x, p.pos.z, 6, dt);
        this.mode = 'hover';
        pitchT = 0.6;
        headT = -0.2;
        legT = 0.6;
        const gap = 0.95 * quick;
        if (this.t > 0.5 + this.volley * gap && this.volley < 3) {
          this.volley++;
          const px = p.pos.x + p.vel.x * 0.55;
          const pz = p.pos.z + p.vel.z * 0.55;
          const sx = -dz / d;
          const sz = dx / d;
          for (let k = -2; k <= 2; k++) {
            const off = k * 9 + rand(-2, 2);
            g.featherStrike(this, px + sx * off + rand(-2, 2), pz + sz * off + rand(-2, 2), 0.85 + Math.abs(k) * 0.07);
          }
          g.audio.play('screech');
          this.flash = 0.3;
        }
        if (this.t > 0.5 + 3 * gap + 0.4) this.setState('hover');
        break;
      }
      case 'summon': {
        this.flyTo(p.pos.x, p.pos.y + 50, p.pos.z - 30, 50, dt);
        this.face(p.pos.x, p.pos.z, 5, dt);
        this.mode = 'hover';
        pitchT = 0.3;
        headT = -0.5;
        beakT = 1;
        if (this.t > 0.5 && !this.called) {
          this.called = true;
          g.audio.play('screech');
          g.summonPigeons(this.stage === 3 ? 4 : 3);
        }
        if (this.t > 1.8) {
          this.called = false;
          this.setState('hover');
        }
        break;
      }
    }

    this.applyPose(dt, pitchT, headT, legT, beakT);
  }

  beginSwoop(p) {
    const g = this.game;
    const w = g.world;
    this.from.copy(this.pos);
    let dx = p.pos.x + p.vel.x * 0.4 - this.pos.x;
    let dz = p.pos.z + p.vel.z * 0.4 - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.dir.set(dx, 0, dz);
    const b = w.bounds;
    this.to.set(clamp(this.pos.x + dx * (d + 58), b.x0 - 40, b.x1 + 40), 0, clamp(this.pos.z + dz * (d + 58), b.z0 - 40, b.z1 + 40));
    this.marker = g.fx.strip(this.from.x, this.from.z, this.to.x, this.to.z, 17, 3);
    this.setState('swoopTele');
    g.audio.play('screech');
  }

  applyPose(dt, pitchT, headT, legT, beakT) {
    const j = this.rig.joints;
    const P = this.pose;
    P.pitch = damp(P.pitch, pitchT, 7, dt);
    P.head = damp(P.head, headT, 8, dt);
    P.leg = damp(P.leg, legT, 8, dt);
    P.beak = damp(P.beak, beakT, 12, dt);
    j.body.rotation.x = P.pitch;
    j.body.rotation.z = this.mode === 'tumble' ? this.time * 9 : this.mode === 'stuck' ? Math.sin(this.time * 7) * 0.1 : 0;
    j.head.rotation.x = P.head;
    j.beak.rotation.x = P.beak * 0.6;
    j.legL.rotation.x = P.leg;
    j.legR.rotation.x = P.leg;
    const t = this.time;
    let wy = 0;
    let wz = 0;
    let ty = 0;
    let tz = 0;
    if (this.mode === 'fly') {
      wy = Math.sin(t * 5.5) * 0.55 + 0.08;
      ty = Math.sin(t * 5.5 - 0.9) * 0.5;
    } else if (this.mode === 'glide') {
      wy = 0.22;
      ty = 0.12 + Math.sin(t * 20) * 0.03;
    } else if (this.mode === 'hover') {
      wy = Math.sin(t * 9) * 0.5;
      wz = 0.25 + Math.sin(t * 9) * 0.45;
      ty = Math.sin(t * 9 - 0.8) * 0.4;
      tz = Math.sin(t * 9 - 0.8) * 0.3;
    } else if (this.mode === 'up') {
      wz = 1.05;
      tz = 0.35;
    } else if (this.mode === 'stuck' || this.mode === 'tumble') {
      wz = -0.45 + Math.sin(t * 10) * 0.4;
      tz = -0.3 + Math.sin(t * 10 - 1) * 0.3;
      wy = 0.2;
    } else {
      wz = -1.32;
      tz = -0.25;
      wy = 0.25;
    }
    j.wingL.rotation.set(0, wy, wz);
    j.wingR.rotation.set(0, -wy, -wz);
    j.tipL.rotation.set(0, ty, tz);
    j.tipR.rotation.set(0, -ty, -tz);
  }

  viewerPose(pose) {
    this.state = 'viewer';
    this.viewer = pose;
    this.pos.y = pose === 'fly' || pose === 'glide' ? 6 : 0;
    const map = { fly: ['fly', 1.15, -1.0, 1.2], glide: ['glide', 1.3, -1.1, -0.5], stuck: ['stuck', 0.35, 0.1, 0], perch: ['fold', 0.15, 0.25, 0], hover: ['hover', 0.45, 0.2, 0] };
    const m = map[pose] || map.perch;
    this.think = (dt) => {
      this.mode = m[0];
      this.applyPose(dt, m[1], m[2], m[3], pose === 'stuck' ? 0.5 : 0);
    };
  }
}
