import * as THREE from 'three';
import { Rig } from './rig.js';
import { Enemy } from './enemies.js';
import { GEO } from '../engine/build.js';
import { clamp, clamp01, damp, dampAngle, rand } from '../engine/util.js';

// Bullion, the Wall Street Bull: New York's boss. A huge bull in a
// pinstripe waistcoat and a red tie, with a gold ring through his nose.
function buildBull() {
  const hide = 0x3a2820;
  const hide2 = 0x4b3428;
  const muzzle = 0x5c4038;
  const dark = 0x15100d;
  const horn = 0xe9dcc0;
  const hornTip = 0x3e3329;
  const suit = 0x232a3d;
  const pin = 0x9aa3b8;
  const shirt = 0xf2efe6;
  const tie = 0xc0392b;
  const gold = 0xd4af37;
  const rig = new Rig({ roughness: 0.78 });

  // The body runs along z, head forward (+z).
  const body = rig.joint('body', null, 0, 9.5, 0);
  rig.blob(body, hide, 0, 0, -1.2, 5.0, 4.8, 8.2);
  rig.blob(body, hide2, 0, 1.7, 3.6, 5.5, 5.4, 4.4); // the hump over the shoulders
  rig.blob(body, hide, 0, 0.5, -6.6, 4.5, 4.2, 3.2); // rump
  // A waistcoat round the chest, with pinstripes and a gold watch chain.
  rig.blob(body, suit, 0, 0.3, 3.4, 5.75, 5.2, 4.35);
  rig.blob(body, shirt, 0, 1.9, 6.6, 1.7, 2.6, 1.25); // shirt front, under the tie
  rig.blob(body, tie, 0, 3.3, 7.65, 0.6, 0.48, 0.38); // the knot
  rig.on(body).add(GEO.cone(4), tie, 0, 3.0, 7.75, 0.85, 3.6, 0.3, 0, Math.PI, 0);
  rig.blob(body, pin, 0, -2.3, 6.2, 3.4, 0.25, 1.9); // the waistcoat's lower edge
  rig.on(body).add(new THREE.TorusGeometry(2.0, 0.16, 5, 16, Math.PI), gold, 2.6, -0.6, 7.0, 1, 0.7, 1, 0.5, 0, Math.PI);
  for (const y of [-0.2, -1.5]) rig.blob(body, gold, 1.1, y, 7.55, 0.3, 0.3, 0.16);

  const head = rig.joint('head', body, 0, 2.6, 7.4);
  rig.blob(head, hide2, 0, 0.6, 0.6, 3.0, 3.1, 3.2);
  rig.blob(head, hide, 0, 2.2, -0.4, 2.6, 1.7, 2.5); // the poll between the horns
  rig.blob(head, muzzle, 0, -1.2, 3.0, 2.3, 1.9, 2.1);

  for (const s of [-1, 1]) {
    rig.blob(head, dark, s * 0.85, -1.4, 4.95, 0.45, 0.42, 0.25); // nostrils
    rig.blob(head, 0xf3eadc, s * 1.7, 1.2, 2.35, 0.55, 0.5, 0.42);
    rig.blob(head, dark, s * 1.78, 1.15, 2.7, 0.26, 0.3, 0.2);
    rig.on(head).box(1.5, 0.35, 0.5, s * 1.55, 1.75, 2.45, dark, 0, 0, s * 0.35); // angry brows
    rig.blob(head, hide, s * 3.1, 1.6, -0.3, 1.3, 0.55, 0.8); // ears
    // Horns sweep out, then up.
    rig.on(head).add(GEO.cyl(8, 0.75), horn, s * 2.4, 2.4, 0.1, 0.85, 3.2, 0.85, 0, 0, -s * 1.25);
    rig.on(head).add(GEO.cone(8), horn, s * 5.1, 3.3, 0.1, 0.65, 2.6, 0.65, 0, 0, -s * 0.35);
    rig.on(head).add(GEO.cone(8), hornTip, s * 5.55, 5.25, 0.1, 0.3, 1.1, 0.3, 0, 0, -s * 0.2);
  }
  rig.on(head).add(new THREE.TorusGeometry(0.95, 0.22, 6, 18), gold, 0, -2.25, 5.0, 1, 1, 1, 0, 0, 0);

  for (const [name, x, z] of [['legFL', 3.1, 4.6], ['legFR', -3.1, 4.6], ['legBL', 3.0, -5.6], ['legBR', -3.0, -5.6]]) {
    const leg = rig.joint(name, body, x, -2.6, z);
    rig.blob(leg, hide, 0, -0.6, 0, 1.7, 2.6, 1.9);
    rig.on(leg).add(GEO.cyl(8, 0.85), hide, 0, -6.4, 0, 1.05, 4.2, 1.05);
    rig.on(leg).cyl(1.15, 1.2, 0, -6.9, 0.1, dark, 8);
  }
  const tail = rig.joint('tail', body, 0, 1.8, -9.2);
  rig.on(tail).add(GEO.cyl(6, 0.6), hide, 0, -5, 0, 0.32, 5, 0.32);
  rig.blob(tail, dark, 0, -5.4, 0, 0.6, 1.0, 0.6);
  return rig.finish();
}

const SPEED = 92;

export class Bull extends Enemy {
  constructor(game, x, z) {
    super(game, x, z, { kind: 'bull', build: buildBull, hp: 660, radius: 9, height: 20 });
    this.boss = true;
    this.name = 'BULLION';
    this.title = 'The Wall Street Bull';
    this.scale = 1;
    this.size = 1.25;
    this.home = new THREE.Vector3(x, 0, z);
    this.yaw = Math.PI;
    this.stage = 1;
    this.script = 0;
    this.summons = 0;
    this.orbit = 0;
    this.dir = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.run = 0;
    this.len = 0;
    this.struck = false;
    this.marker = null;
    this.volley = 0;
    this.stuckFor = 3.6;
    this.pose = { pitch: 0, head: 0, gait: 0, rear: 0 };
    this.stride = 0;
    this.setState('perch');
  }

  get hurtable() {
    return !this.dead && this.state !== 'perch' && this.state !== 'enter';
  }

  // Where the entrance cut looks: at him, from the side the ape comes from.
  cutFocus() {
    return { x: this.pos.x, y: this.pos.y + 11, z: this.pos.z, r: 52, dy: 4, look: 0, a: Math.PI - 0.55 };
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
    const open = this.state === 'stuck' || this.state === 'tired' || this.state === 'stagger';
    if (open) dmg *= 1.4;
    // A ground slam or a dive while he paws the ground knocks him off his feet.
    const countered = h.heavy && h.radial && this.state === 'chargeTele';
    if (countered) dmg *= 1.5;
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
      this.clearMarker();
      this.stuckFor = 3.0;
      this.setState('stagger');
      g.onCounter(this, 'Knocked him off his feet');
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
    this.clearMarker();
    this.setState('dead');
    this.vel.set(dx * 36, 58, dz * 36);
    this.spin.set(rand(3, 5), rand(-2, 2), rand(3, 6));
    this.game.onEnemyKilled(this);
  }

  updateDead(dt) {
    this.vel.y -= 24 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.root.rotation.x += this.spin.x * dt;
    this.root.rotation.z += this.spin.z * dt;
    if (this.t > 0.2 && Math.random() < dt * 20) this.game.fx.spark(this.pos.x + rand(-6, 6), this.pos.y + rand(4, 14), this.pos.z + rand(-6, 6), 3, 0xffd23a);
    const k = clamp(1 - (this.t - 2.0) / 0.9, 0, 1);
    this.root.scale.setScalar(Math.max(0.001, k) * this.size);
    if (this.t > 2.9) {
      this.game.fx.twinkle(this.pos.x, this.pos.y, this.pos.z, 3);
      this.remove = true;
      this.rig.dispose();
    }
  }

  next() {
    const scripts = {
      1: ['charge', 'charge', 'stomp'],
      2: ['charge', 'coins', 'charge', 'stomp'],
      3: ['charge', 'charge', 'coins', 'stomp', 'charge'],
    };
    if (this.summons < this.stage - 1) {
      this.summons++;
      return 'summon';
    }
    const list = scripts[this.stage];
    return list[this.script++ % list.length];
  }

  // Lines up a charge at where the ape is heading and marks it on the ground.
  beginCharge(p) {
    const g = this.game;
    let dx = p.pos.x + p.vel.x * 0.35 - this.pos.x;
    let dz = p.pos.z + p.vel.z * 0.35 - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.dir.set(dx, 0, dz);
    this.len = clamp(d + 50, 70, 150);
    this.marker = g.fx.strip(this.pos.x, this.pos.z, this.pos.x + dx * this.len, this.pos.z + dz * this.len, 18, 3);
    this.setState('chargeTele');
    g.audio.play('snort');
  }

  think(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const level = g.diff || { quick: 1, stuck: 1 };
    const quick = (this.stage === 3 ? 0.72 : this.stage === 2 ? 0.86 : 1) * level.quick;
    const alive = p.state !== 'dead' && !p.victory;
    const ground = w.groundHeight(this.pos.x, this.pos.z);
    const dxp = p.pos.x - this.pos.x;
    const dzp = p.pos.z - this.pos.z;
    const distP = Math.hypot(dxp, dzp);
    this.glow = 0;
    this.goreCool = (this.goreCool || 0) - dt;
    let gaitT = 0;
    let headT = 0;
    let pitchT = 0;
    let rearT = 0;

    switch (this.state) {
      case 'perch':
        // Waiting by the water, pawing at the paving.
        this.pos.y = ground;
        this.yaw = dampAngle(this.yaw, Math.PI, 3, dt);
        headT = this.taunt ? -0.5 : 0.15 + Math.sin(this.time * 1.3) * 0.06;
        rearT = this.taunt ? 0.55 + Math.sin(this.time * 6) * 0.05 : 0;
        if (this.taunt && Math.random() < dt * 3) g.fx.dust(this.pos.x + rand(-4, 4), ground + 1, this.pos.z + rand(-4, 4), 1, 2.2);
        break;
      case 'enter':
        this.setState('circle');
        g.audio.play('snort');
        break;
      case 'circle': {
        // Trot round the ape at a distance, sizing him up.
        this.orbit += dt * 0.45;
        const r = 46;
        const tx = p.pos.x + Math.cos(this.orbit) * r - this.pos.x;
        const tz = p.pos.z + Math.sin(this.orbit) * r - this.pos.z;
        const d = Math.hypot(tx, tz) || 1;
        const sp = Math.min(26, d * 2.5);
        this.vel.x = damp(this.vel.x, (tx / d) * sp, 4, dt);
        this.vel.z = damp(this.vel.z, (tz / d) * sp, 4, dt);
        this.move(dt);
        this.face(p.pos.x, p.pos.z, 4, dt);
        gaitT = clamp01(Math.hypot(this.vel.x, this.vel.z) / 26);
        if (alive && distP < 24 && this.t > 0.5 && this.goreCool <= 0) {
          // Too close: a hook of the horns to throw the ape back.
          this.setState('goreTele');
          g.audio.play('snort');
        } else if (alive && this.t > 1.5 * quick) {
          const move = this.next();
          if (move === 'charge') this.beginCharge(p);
          else if (move === 'stomp') {
            this.to.set(p.pos.x, 0, p.pos.z);
            this.marker = g.fx.marker(this.to.x, this.to.z, 17, 9, g.standHeight(this.to.x, this.to.z));
            this.setState('stompTele');
            g.audio.play('bellow');
          } else if (move === 'coins') {
            this.volley = 0;
            this.setState('coins');
          } else this.setState('summon');
        }
        break;
      }
      case 'goreTele':
        this.vel.set(0, 0, 0);
        this.face(p.pos.x, p.pos.z, 9, dt);
        headT = 0.85;
        this.glow = 0.5 + Math.sin(this.t * 40) * 0.5;
        if (this.t > 0.55 * quick) {
          this.struck = false;
          this.setState('gore');
          g.audio.play('swipe');
        }
        break;
      case 'gore': {
        headT = -0.7;
        const fx = this.pos.x + Math.sin(this.yaw) * 11;
        const fz = this.pos.z + Math.cos(this.yaw) * 11;
        if (!this.struck && this.t > 0.08 && Math.hypot(p.pos.x - fx, p.pos.z - fz) < 13 && p.pos.y < this.pos.y + 10) {
          this.struck = p.takeDamage(10, this.pos.x, this.pos.z, 58);
        }
        if (this.t > 0.45) {
          this.goreCool = 2.8 * quick;
          this.setState('backoff');
        }
        break;
      }
      case 'backoff': {
        // Trots off to give himself room for the next charge.
        const n = distP || 1;
        this.vel.x = damp(this.vel.x, (-dxp / n) * 24, 5, dt);
        this.vel.z = damp(this.vel.z, (-dzp / n) * 24, 5, dt);
        this.move(dt);
        this.face(p.pos.x, p.pos.z, 4, dt);
        gaitT = -0.8;
        if (this.t > 1.1 || distP > 40) this.setState('circle');
        break;
      }
      case 'chargeTele':
        // Head down, pawing the ground: the red strip shows where he will go.
        this.vel.set(0, 0, 0);
        this.yaw = dampAngle(this.yaw, Math.atan2(this.dir.x, this.dir.z), 10, dt);
        headT = 0.55;
        pitchT = 0.12;
        this.glow = 0.5 + Math.sin(this.t * 34) * 0.5;
        this.stride += dt * 9;
        if (Math.random() < dt * 8) g.fx.dust(this.pos.x + this.dir.x * 9, ground + 0.6, this.pos.z + this.dir.z * 9, 1, 2.2);
        if (this.t > 1.0 * quick) {
          this.run = 0;
          this.struck = false;
          this.setState('charge');
          g.audio.play('swoop');
        }
        break;
      case 'charge': {
        headT = 0.6;
        gaitT = 1.6;
        const step = SPEED * dt;
        this.run += step;
        // Whatever is in the way comes down, unless it is too strong.
        const ax = this.pos.x + this.dir.x * 10;
        const az = this.pos.z + this.dir.z * 10;
        const res = w.damageAt(ax, az, 7, 140);
        for (const b of res.destroyed) g.onBuildingDown(b);
        this.vel.set(this.dir.x * SPEED, 0, this.dir.z * SPEED);
        const bx = this.pos.x;
        const bz = this.pos.z;
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        const wall = w.resolveCircle(this.pos, 7, this.pos.y);
        const blocked = wall && Math.hypot(this.pos.x - bx, this.pos.z - bz) < step * 0.5;
        this.clampToMap();
        this.pos.y = damp(this.pos.y, w.groundHeight(this.pos.x, this.pos.z), 12, dt);
        if (Math.random() < dt * 30) g.fx.dust(this.pos.x - this.dir.x * 8, ground + 0.6, this.pos.z - this.dir.z * 8, 1, 3);
        if (!this.struck && distP < 13 && p.pos.y < this.pos.y + 8) {
          this.struck = p.takeDamage(20, this.pos.x - this.dir.x * 10, this.pos.z - this.dir.z * 10, 54);
        }
        if (blocked || res.hit.length) {
          // Horns in the wall.
          this.clearMarker();
          g.groundPound(this.pos.x + this.dir.x * 9, this.pos.z + this.dir.z * 9, 12, 0.9);
          this.vel.set(0, 0, 0);
          this.stuckFor = (this.stage === 3 ? 3.0 : 3.6) * level.stuck;
          this.setState('stuck');
          g.hud.toast('STUCK!', 'Now batter him', 1200);
        } else if (this.run >= this.len) {
          this.clearMarker();
          this.setState('skid');
        }
        break;
      }
      case 'skid':
        headT = 0.3;
        this.vel.x = damp(this.vel.x, 0, 5, dt);
        this.vel.z = damp(this.vel.z, 0, 5, dt);
        this.move(dt);
        if (Math.random() < dt * 30) g.fx.dust(this.pos.x, ground + 0.6, this.pos.z, 1, 2.6);
        if (this.t > 0.55) {
          this.stuckFor = (this.stage === 3 ? 1.5 : 2.0) * level.stuck;
          this.setState('tired');
        }
        break;
      case 'stuck':
        // Horns jammed in a wall: shaking his head to get free.
        this.vel.set(0, 0, 0);
        headT = 0.7 + Math.sin(this.time * 14) * 0.15;
        pitchT = 0.08;
        if (this.t > this.stuckFor) {
          this.setState('recover');
          g.audio.play('snort');
        }
        break;
      case 'stagger':
        this.vel.set(0, 0, 0);
        headT = -0.3;
        pitchT = Math.sin(this.time * 10) * 0.08;
        this.root.rotation.z = Math.sin(this.time * 8) * 0.12;
        if (this.t > this.stuckFor) {
          this.root.rotation.z = 0;
          this.setState('circle');
        }
        break;
      case 'tired':
        // Out of breath, head hanging.
        this.vel.set(0, 0, 0);
        headT = 0.5 + Math.sin(this.time * 4) * 0.08;
        if (Math.random() < dt * 2) g.fx.dust(this.pos.x + Math.sin(this.yaw) * 12, this.pos.y + 6, this.pos.z + Math.cos(this.yaw) * 12, 1, 1.4, 0xf3f3f3);
        if (this.t > this.stuckFor) this.setState('circle');
        break;
      case 'recover':
        // Backing out of the hole he made.
        this.vel.set(-this.dir.x * 10, 0, -this.dir.z * 10);
        this.move(dt);
        gaitT = -0.6;
        if (this.t > 0.6) this.setState('circle');
        break;
      case 'stompTele':
        // Rearing up over the ape's spot; it lands where the red ring is.
        this.vel.set(0, 0, 0);
        this.face(this.to.x, this.to.z, 6, dt);
        rearT = 0.85;
        this.glow = this.t > 0.5 ? 0.5 + Math.sin(this.t * 40) * 0.5 : 0;
        if (this.t > 0.95 * quick) {
          this.from.copy(this.pos);
          this.setState('leap');
        }
        break;
      case 'leap': {
        const T = 0.8;
        const u = clamp01(this.t / T);
        this.pos.x = this.from.x + (this.to.x - this.from.x) * u;
        this.pos.z = this.from.z + (this.to.z - this.from.z) * u;
        const gy = w.groundHeight(this.pos.x, this.pos.z);
        this.pos.y = gy + Math.sin(u * Math.PI) * 32;
        rearT = 0.3 - u * 0.5;
        gaitT = 1;
        if (u >= 1) {
          this.clearMarker();
          const ty = g.standHeight(this.to.x, this.to.z);
          g.groundPound(this.pos.x, this.pos.z, 17, 1.2);
          const res = w.damageAt(this.pos.x, this.pos.z, 12, 60);
          for (const b of res.destroyed) g.onBuildingDown(b);
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 17.5 && p.pos.y < ty + 5) p.takeDamage(22, this.pos.x, this.pos.z, 46);
          this.pos.y = gy;
          this.stuckFor = (this.stage === 3 ? 2.0 : 2.6) * level.stuck;
          this.setState('tired');
        }
        break;
      }
      case 'coins': {
        // Tosses gold coins over his shoulder; each lands on a red mark.
        this.vel.set(0, 0, 0);
        this.face(p.pos.x, p.pos.z, 6, dt);
        rearT = 0.25 + Math.sin(this.t * 8) * 0.1;
        headT = -0.4;
        const gap = 0.85 * quick;
        if (this.t > 0.5 + this.volley * gap && this.volley < 3) {
          this.volley++;
          const px = p.pos.x + p.vel.x * 0.5;
          const pz = p.pos.z + p.vel.z * 0.5;
          for (let k = 0; k < 5; k++) {
            const a = rand(Math.PI * 2);
            const r = k === 0 ? 0 : rand(6, 18);
            g.featherStrike(this, px + Math.cos(a) * r, pz + Math.sin(a) * r, 0.8 + k * 0.06, 'coin');
          }
          g.audio.play('pickup');
          this.flash = 0.25;
        }
        if (this.t > 0.5 + 3 * gap + 0.4) this.setState('circle');
        break;
      }
      case 'summon':
        this.vel.set(0, 0, 0);
        headT = -0.7;
        rearT = 0.35;
        if (this.t > 0.5 && !this.called) {
          this.called = true;
          g.audio.play('bellow');
          g.summon('rat', this.stage === 3 ? 6 : 4, this.pos.x, this.pos.z, 28, 'He called in the rats');
        }
        if (this.t > 1.6) {
          this.called = false;
          this.setState('circle');
        }
        break;
    }

    this.applyPose(dt, gaitT, headT, pitchT, rearT);
  }

  move(dt) {
    const w = this.game.world;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    w.resolveCircle(this.pos, 7, this.pos.y);
    this.clampToMap();
    this.pos.y = damp(this.pos.y, w.groundHeight(this.pos.x, this.pos.z), 12, dt);
  }

  clampToMap() {
    const b = this.game.world.bounds;
    this.pos.x = clamp(this.pos.x, b.x0, b.x1);
    this.pos.z = clamp(this.pos.z, b.z0, b.z1);
  }

  applyPose(dt, gaitT, headT, pitchT, rearT) {
    const j = this.rig.joints;
    const P = this.pose;
    P.gait = damp(P.gait, gaitT, 8, dt);
    P.head = damp(P.head, headT, 8, dt);
    P.pitch = damp(P.pitch, pitchT, 8, dt);
    P.rear = damp(P.rear, rearT, 9, dt);
    this.stride += dt * (6 + Math.abs(P.gait) * 7) * Math.sign(P.gait || 1);
    const sw = Math.sin(this.stride) * Math.min(1, Math.abs(P.gait));
    const pawing = this.state === 'chargeTele' ? Math.max(0, Math.sin(this.time * 9)) : 0;
    // Rearing lifts the front end; legs fold under.
    j.body.rotation.x = -P.rear + P.pitch + Math.abs(sw) * 0.04;
    j.body.position.y = 9.5 + P.rear * 4.5 + Math.abs(Math.cos(this.stride)) * 0.6 * Math.min(1, Math.abs(P.gait));
    j.head.rotation.x = P.head;
    j.head.rotation.y = this.state === 'stuck' ? Math.sin(this.time * 12) * 0.25 : 0;
    j.legFL.rotation.x = sw * 0.75 - P.rear * 1.1 - pawing * 0.9;
    j.legFR.rotation.x = -sw * 0.75 - P.rear * 0.9;
    j.legBL.rotation.x = -sw * 0.7 + P.rear * 0.5;
    j.legBR.rotation.x = sw * 0.7 + P.rear * 0.5;
    j.tail.rotation.x = 0.35 + Math.sin(this.time * 3) * 0.1 + (this.state === 'charge' ? 0.6 : 0);
    j.tail.rotation.z = Math.sin(this.time * 5) * 0.35;
  }
}
