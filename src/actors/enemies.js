import * as THREE from 'three';
import { Rig } from './rig.js';
import { GEO } from '../engine/build.js';
import { clamp, damp, dampAngle, rand } from '../engine/util.js';

// ---- models --------------------------------------------------------------

function buildRaccoon(thrower) {
  const fur = 0x7b7e87;
  const dark = 0x202127;
  const light = 0xdcd8cf;
  const scarf = thrower ? 0x2e8b57 : 0xc0392b;
  const rig = new Rig();
  const body = rig.joint('body', null, 0, 2.65, 0);
  rig.blob(body, fur, 0, 1.8, 0, 2.5, 2.9, 2.3);
  rig.blob(body, light, 0, 1.5, 1.15, 1.8, 2.1, 1.35);
  rig.on(body).add(GEO.cone(4), scarf, 0, 4.1, 2.0, 1.5, 1.9, 0.5, 0, Math.PI, 0);
  rig.on(body).add(new THREE.TorusGeometry(1.9, 0.45, 6, 12), scarf, 0, 4.0, 0.4, 1, 1, 1, 0, Math.PI / 2, 0);

  const head = rig.joint('head', body, 0, 4.5, 0.5);
  rig.blob(head, fur, 0, 1.3, 0, 2.4, 1.9, 2.0);
  rig.blob(head, light, 0, 0.75, 1.9, 1.0, 0.8, 1.1);
  rig.blob(head, dark, 0, 0.92, 2.95, 0.42, 0.32, 0.3);
  for (const s of [-1, 1]) {
    rig.blob(head, light, s * 1.95, 0.8, 0.35, 1.0, 0.9, 0.9);
    rig.blob(head, dark, s * 1.0, 1.45, 1.5, 1.0, 0.62, 0.62);
    rig.blob(head, 0xffe07a, s * 0.95, 1.5, 2.02, 0.3, 0.3, 0.2);
    rig.blob(head, dark, s * 0.95, 1.5, 2.2, 0.14, 0.15, 0.1);
    rig.on(head).cone(0.7, 1.25, s * 1.5, 2.6, 0, dark, 5);
    rig.on(head).box(1.0, 0.24, 0.3, s * 0.95, 1.85, 1.95, light, 0, 0, s * -0.45);
  }

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const arm = rig.joint('arm' + side, body, s * 2.5, 3.4, 0.3);
    rig.blob(arm, fur, 0, -1.4, 0, 0.88, 1.95, 0.88);
    rig.blob(arm, dark, 0, -3.1, 0.2, 0.98, 0.88, 1.05);
    for (const c of [-0.5, 0, 0.5]) rig.on(arm).add(GEO.cone(4), light, c, -3.5, 1.0, 0.16, 0.7, 0.16, 0, Math.PI * 0.7, 0);
    const leg = rig.joint('leg' + side, body, s * 1.3, 0.1, 0);
    rig.blob(leg, fur, 0, -1.1, 0, 1.12, 1.5, 1.18);
    rig.blob(leg, dark, 0, -2.2, 0.7, 0.98, 0.45, 1.6);
  }
  const tail = rig.joint('tail', body, 0, 0.9, -1.9);
  for (let k = 0; k < 6; k++) rig.blob(tail, k % 2 ? dark : fur, 0, k * 0.8, -0.85 * k, 1.3 - k * 0.07, 1.0, 1.1);
  return rig.finish();
}

function buildPigeon() {
  const gray = 0x8d97a8;
  const gray2 = 0x6f7889;
  const dark = 0x2d3038;
  const rig = new Rig();
  const body = rig.joint('body', null, 0, 2.4, 0);
  rig.blob(body, gray, 0, 0, 0, 2.3, 2.1, 3.3);
  rig.blob(body, 0xb4bcc8, 0, -0.35, 1.3, 1.9, 1.7, 1.9);
  rig.blob(body, 0x3fae8c, 0, 1.5, 2.2, 1.35, 1.5, 1.3);
  rig.blob(body, 0x8e5bb5, 0, 0.85, 2.55, 1.3, 0.8, 1.1);
  rig.blob(body, gray2, 0, -0.1, -3.5, 1.5, 0.32, 1.9);
  rig.blob(body, dark, 0, -0.1, -4.6, 1.3, 0.28, 0.8);
  const head = rig.joint('head', body, 0, 2.9, 2.6);
  rig.blob(head, gray2, 0, 0, 0, 1.2, 1.15, 1.3);
  rig.on(head).add(GEO.cone(5), dark, 0, -0.15, 1.05, 0.32, 1.15, 0.32, 0, Math.PI / 2, 0);
  rig.blob(head, 0xf2f2f2, 0, 0.12, 1.15, 0.36, 0.25, 0.3);
  for (const s of [-1, 1]) {
    rig.blob(head, 0xff8a1e, s * 0.95, 0.2, 0.5, 0.3, 0.3, 0.2);
    rig.blob(head, dark, s * 1.1, 0.2, 0.52, 0.15, 0.15, 0.12);
  }
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const wing = rig.joint('wing' + side, body, s * 1.9, 0.9, 0.2);
    rig.blob(wing, gray2, s * 3.3, 0, -0.3, 3.5, 0.36, 2.0);
    rig.on(wing).box(5, 0.2, 0.5, s * 3.4, 0.2, -0.9, dark);
    rig.on(wing).box(4.2, 0.2, 0.45, s * 3.2, 0.2, -1.7, dark);
    rig.blob(wing, dark, s * 6.3, 0, -0.6, 1.4, 0.26, 1.3);
    const leg = rig.joint('leg' + side, body, s * 0.8, -1.6, 0.2);
    rig.on(leg).cyl(0.22, 1.2, 0, -1.0, 0, 0xe58b6b, 5);
    rig.on(leg).box(0.9, 0.2, 1.4, 0, -0.95, 0.5, 0xe58b6b);
  }
  return rig.finish();
}

// ---- shared behaviour ----------------------------------------------------

export class Enemy {
  constructor(game, x, z, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.rig = cfg.build();
    this.root = this.rig.root;
    this.pos = this.root.position;
    this.pos.set(x, game.world ? game.world.groundHeight(x, z) : 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = rand(Math.PI * 2);
    this.hp = this.maxHp = cfg.hp;
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.kind = cfg.kind;
    this.state = 'spawn';
    this.t = 0;
    this.time = rand(10);
    this.flash = 0;
    this.stunT = 0;
    this.dead = false;
    this.remove = false;
    this.air = false;
    this.token = false;
    this.cool = rand(0.5, 2);
    this.wx = 0;
    this.wz = 0;
    this.spin = new THREE.Vector3();
    this.scale = 0.01;
    this.glow = 0;
    game.stage.scene.add(this.root);
  }

  get hurtable() {
    return !this.dead && this.state !== 'spawn';
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  distTo(p) {
    return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
  }

  face(x, z, rate, dt) {
    this.yaw = dampAngle(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  releaseToken() {
    if (this.token) {
      this.token = false;
      this.game.tokens++;
    }
  }

  takeToken() {
    if (this.token) return true;
    if (this.game.tokens <= 0) return false;
    this.game.tokens--;
    this.token = true;
    return true;
  }

  // h: { dmg, dx, dz, knock, launch, heavy }
  takeHit(h) {
    if (!this.hurtable) return false;
    this.hp -= h.dmg;
    this.flash = 1;
    this.releaseToken();
    if (this.hp <= 0) {
      this.die(h.dx, h.dz, h.heavy);
      return true;
    }
    this.vel.x = h.dx * h.knock;
    this.vel.z = h.dz * h.knock;
    if (h.launch > 0) {
      this.vel.y = h.launch;
      this.air = true;
    }
    this.stunT = h.heavy ? 0.85 : 0.4;
    this.setState('hit');
    return true;
  }

  stun(seconds) {
    if (!this.hurtable) return;
    this.releaseToken();
    this.stunT = seconds;
    this.setState('hit');
  }

  die(dx, dz, heavy) {
    this.dead = true;
    this.releaseToken();
    this.setState('dead');
    const p = heavy ? 1.25 : 1;
    this.vel.set(dx * rand(48, 70) * p, rand(40, 58) * p, dz * rand(48, 70) * p);
    this.spin.set(rand(-9, 9), rand(-6, 6), rand(-9, 9));
    this.game.onEnemyKilled(this);
  }

  // Beaten animals go spinning off over the rooftops and twinkle out.
  updateDead(dt) {
    this.vel.y -= 46 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.root.rotation.x += this.spin.x * dt;
    this.root.rotation.y += this.spin.y * dt;
    this.root.rotation.z += this.spin.z * dt;
    const k = clamp(1 - (this.t - 0.9) / 0.7, 0, 1);
    this.root.scale.setScalar(Math.max(0.001, k));
    if (this.t > 1.6) {
      this.game.fx.twinkle(this.pos.x, this.pos.y, this.pos.z);
      this.remove = true;
      this.rig.dispose();
    }
  }

  groundPhysics(dt, speed, accel = 60) {
    const w = this.game.world;
    if (this.air) {
      this.vel.y -= 70 * dt;
      this.pos.y += this.vel.y * dt;
      this.vel.x *= Math.exp(-0.6 * dt);
      this.vel.z *= Math.exp(-0.6 * dt);
    } else {
      const tx = this.wx * speed;
      const tz = this.wz * speed;
      const k = 1 - Math.exp(-(accel / 10) * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    w.resolveCircle(this.pos, this.radius, this.pos.y);
    const b = w.bounds;
    this.pos.x = clamp(this.pos.x, b.x0, b.x1);
    this.pos.z = clamp(this.pos.z, b.z0, b.z1);
    const ground = w.groundHeight(this.pos.x, this.pos.z);
    if (this.air) {
      if (this.pos.y <= ground && this.vel.y <= 0) {
        this.pos.y = ground;
        this.air = false;
        this.vel.y = 0;
        this.game.fx.dust(this.pos.x, ground + 0.5, this.pos.z, 5, 2.2);
      }
    } else {
      this.pos.y = damp(this.pos.y, ground, 14, dt);
    }
  }

  update(dt) {
    this.t += dt;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.dead) {
      this.updateDead(dt);
    } else {
      this.think(dt);
      this.root.rotation.y = this.yaw;
      this.root.scale.setScalar(this.scale);
    }
    if (this.flash > 0) this.rig.setFlash(this.flash, 0xffffff);
    else if (this.glow > 0) this.rig.setFlash(this.glow * 0.7, 0xff2a1a);
    else this.rig.setFlash(0);
  }
}

// ---- raccoons: the Trash Pandas -------------------------------------------

export class Raccoon extends Enemy {
  constructor(game, x, z, thrower = false) {
    super(game, x, z, { kind: thrower ? 'thrower' : 'raccoon', build: () => buildRaccoon(thrower), hp: thrower ? 32 : 44, radius: 3, height: 8 });
    this.thrower = thrower;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.arm = 0;
    this.lean = 0;
    this.throwCool = rand(1.5, 3);
    this.struck = false;
  }

  think(dt) {
    const g = this.game;
    const p = g.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    let speed = 15;
    let armT = 0;
    let leanT = 0;
    this.wx = this.wz = 0;
    this.glow = 0;
    this.cool -= dt;
    this.throwCool -= dt;
    const alive = p.state !== 'dead' && !p.victory;

    switch (this.state) {
      case 'spawn':
        this.scale = Math.min(1, this.t / 0.45);
        if (this.t > 0.5) this.setState('chase');
        break;
      case 'chase': {
        this.scale = 1;
        this.face(p.pos.x, p.pos.z, 7, dt);
        if (!alive) break;
        const want = this.thrower ? 34 : 7.5;
        if (this.thrower && dist < 60 && dist > 16 && this.throwCool <= 0) {
          this.setState('throwWind');
          break;
        }
        if (dist > want + 2) {
          this.wx = nx;
          this.wz = nz;
        } else if (this.thrower && dist < want - 8) {
          this.wx = -nx;
          this.wz = -nz;
        } else if (!this.thrower && this.cool <= 0 && this.takeToken()) {
          this.setState('windup');
        } else {
          // Circle while waiting for a turn.
          this.wx = -nz * this.strafe * 0.7 + (dist > want + 4 ? nx * 0.5 : dist < want ? -nx * 0.6 : 0);
          this.wz = nx * this.strafe * 0.7 + (dist > want + 4 ? nz * 0.5 : dist < want ? -nz * 0.6 : 0);
          speed = 9;
          if (Math.random() < dt * 0.3) this.strafe *= -1;
        }
        break;
      }
      case 'windup':
        this.face(p.pos.x, p.pos.z, 10, dt);
        armT = -2.7;
        leanT = -0.3;
        this.glow = 0.5 + Math.sin(this.t * 40) * 0.5;
        if (this.t > 0.5) {
          this.setState('attack');
          this.struck = false;
          this.vel.x = Math.sin(this.yaw) * 34;
          this.vel.z = Math.cos(this.yaw) * 34;
          g.audio.play('swipe');
        }
        break;
      case 'attack':
        armT = -1.0;
        leanT = 0.55;
        this.wx = Math.sin(this.yaw) * (this.t < 0.16 ? 1 : 0);
        this.wz = Math.cos(this.yaw) * (this.t < 0.16 ? 1 : 0);
        speed = 34;
        if (!this.struck && this.t > 0.08) {
          const hx = this.pos.x + Math.sin(this.yaw) * 4.5;
          const hz = this.pos.z + Math.cos(this.yaw) * 4.5;
          if (Math.hypot(p.pos.x - hx, p.pos.z - hz) < 7.2 && p.pos.y < this.pos.y + 7) {
            this.struck = true;
            p.takeDamage(8, this.pos.x, this.pos.z, 20);
          }
        }
        if (this.t > 0.55) {
          this.releaseToken();
          this.cool = rand(0.8, 1.7);
          this.setState('chase');
        }
        break;
      case 'throwWind':
        this.face(p.pos.x, p.pos.z, 10, dt);
        armT = -2.9;
        leanT = -0.35;
        this.glow = 0.4 + Math.sin(this.t * 30) * 0.4;
        if (this.t > 0.6) {
          g.throwTrash(this, p.pos.x + p.vel.x * 0.5, p.pos.z + p.vel.z * 0.5);
          this.throwCool = rand(2.6, 4.2);
          this.setState('throwEnd');
        }
        break;
      case 'throwEnd':
        armT = -0.8;
        leanT = 0.4;
        if (this.t > 0.45) this.setState('chase');
        break;
      case 'hit':
        leanT = -0.5;
        armT = 0.9;
        if (!this.air && this.t > this.stunT) {
          this.cool = Math.max(this.cool, 0.5);
          this.setState('chase');
        }
        break;
    }

    const moving = !this.air && (this.wx || this.wz);
    this.groundPhysics(dt, speed);

    // Pose.
    const j = this.rig.joints;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const sw = moving ? Math.sin(this.time * 13) * clamp(sp / 12, 0, 1) : 0;
    this.arm = damp(this.arm, armT, 22, dt);
    this.lean = damp(this.lean, leanT, 16, dt);
    j.body.rotation.x = this.lean + (this.air ? Math.sin(this.time * 14) * 0.5 : 0);
    j.body.rotation.z = sw * 0.12 + (this.state === 'hit' && !this.air ? Math.sin(this.time * 18) * 0.15 : 0);
    j.legL.rotation.x = sw * 0.8;
    j.legR.rotation.x = -sw * 0.8;
    j.armL.rotation.x = this.arm - sw * 0.6;
    j.armR.rotation.x = this.arm + sw * 0.6;
    j.armL.rotation.z = 0.25;
    j.armR.rotation.z = -0.25;
    j.head.rotation.x = -this.lean * 0.6;
    j.head.rotation.z = this.state === 'hit' ? Math.sin(this.time * 16) * 0.3 : 0;
    j.tail.rotation.x = -0.5 + Math.sin(this.time * 3) * 0.12;
    j.tail.rotation.y = Math.sin(this.time * 6) * 0.45;
  }
}

// ---- pigeons ---------------------------------------------------------------

const HOVER = 21;

export class Pigeon extends Enemy {
  constructor(game, x, z) {
    super(game, x, z, { kind: 'pigeon', build: buildPigeon, hp: 22, radius: 2.8, height: 6.5 });
    this.pos.y = 70;
    this.orbit = rand(Math.PI * 2);
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.cool = rand(1.5, 4);
    this.target = new THREE.Vector3();
    this.marker = null;
    this.pitch = 0;
    this.fold = 0;
    this.scale = 1;
  }

  // Pigeons deal with being hit in their own way: they drop out of the sky.
  takeHit(h) {
    const was = this.hurtable;
    const r = super.takeHit(h);
    if (was && !this.dead) {
      this.air = true;
      if (this.vel.y < 6) this.vel.y = 6;
      this.setState('fall');
    }
    this.clearMarker();
    return r;
  }

  stun(seconds) {
    if (!this.hurtable) return;
    this.releaseToken();
    this.clearMarker();
    this.air = true;
    this.stunT = seconds;
    this.setState('fall');
  }

  die(dx, dz, heavy) {
    this.clearMarker();
    super.die(dx, dz, heavy);
  }

  clearMarker() {
    if (this.marker) {
      this.marker.life = 0;
      this.marker = null;
    }
  }

  think(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const ground = w.groundHeight(this.pos.x, this.pos.z);
    this.glow = 0;
    this.cool -= dt;
    let pitchT = 0.1;
    let foldT = 0;
    let flap = 16;
    const alive = p.state !== 'dead' && !p.victory;

    switch (this.state) {
      case 'spawn':
      case 'hover': {
        // Circle the ape, just out of reach.
        this.orbit += this.orbitDir * dt * 0.9;
        const tx = p.pos.x + Math.cos(this.orbit) * 30;
        const tz = p.pos.z + Math.sin(this.orbit) * 30;
        const ty = p.pos.y + HOVER + Math.sin(this.time * 2.2) * 1.5;
        const k = 1 - Math.exp(-2.4 * dt);
        this.vel.set((tx - this.pos.x) * 2.4, (ty - this.pos.y) * 2.4, (tz - this.pos.z) * 2.4);
        this.pos.x += (tx - this.pos.x) * k;
        this.pos.y += (ty - this.pos.y) * k;
        this.pos.z += (tz - this.pos.z) * k;
        this.face(p.pos.x, p.pos.z, 5, dt);
        if (this.state === 'spawn' && Math.abs(this.pos.y - ty) < 4) this.setState('hover');
        if (this.state === 'hover' && alive && this.cool <= 0 && this.takeToken()) {
          this.target.set(p.pos.x + p.vel.x * 0.35, 0, p.pos.z + p.vel.z * 0.35);
          this.target.y = w.groundHeight(this.target.x, this.target.z);
          this.marker = g.fx.marker(this.target.x, this.target.z, 7, 1.4, this.target.y);
          g.audio.play('coo');
          this.setState('aim');
        }
        break;
      }
      case 'aim':
        this.face(this.target.x, this.target.z, 12, dt);
        this.glow = 0.5 + Math.sin(this.t * 40) * 0.5;
        pitchT = 0.6;
        this.pos.y += dt * 4;
        if (this.t > 0.7) this.setState('dive');
        break;
      case 'dive': {
        pitchT = 1.1;
        foldT = 1;
        flap = 0;
        const dx = this.target.x - this.pos.x;
        const dy = this.target.y - this.pos.y;
        const dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const step = 78 * dt;
        if (d <= step || this.pos.y <= ground + 0.3) {
          this.pos.y = Math.max(ground, this.target.y);
          g.fx.dust(this.pos.x, this.pos.y + 0.5, this.pos.z, 7, 2.6);
          g.shake(0.25, this.pos);
          g.audio.play('thud');
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 7.5 && p.pos.y < this.pos.y + 6) p.takeDamage(10, this.pos.x, this.pos.z, 18);
          this.clearMarker();
          this.releaseToken();
          this.stunT = 1.9;
          this.setState('dazed');
        } else {
          this.pos.x += (dx / d) * step;
          this.pos.y += (dy / d) * step;
          this.pos.z += (dz / d) * step;
        }
        break;
      }
      case 'fall':
        foldT = 0.7;
        flap = 30;
        this.vel.y -= 60 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.vel.x *= Math.exp(-1.2 * dt);
        this.vel.z *= Math.exp(-1.2 * dt);
        w.resolveCircle(this.pos, this.radius, this.pos.y);
        if (this.pos.y <= ground) {
          this.pos.y = ground;
          this.air = false;
          g.fx.dust(this.pos.x, ground + 0.5, this.pos.z, 5, 2);
          this.stunT = Math.max(this.stunT, 1.2);
          this.setState('dazed');
        }
        break;
      case 'dazed':
        foldT = 0.85;
        flap = 0;
        this.pos.y = damp(this.pos.y, ground, 12, dt);
        if (this.t > this.stunT) {
          this.cool = rand(2.2, 4.5);
          this.setState('hover');
        }
        break;
      case 'hit':
        this.setState('fall');
        break;
    }
    const b = w.bounds;
    this.pos.x = clamp(this.pos.x, b.x0, b.x1);
    this.pos.z = clamp(this.pos.z, b.z0, b.z1);

    const j = this.rig.joints;
    this.pitch = damp(this.pitch, pitchT, 10, dt);
    this.fold = damp(this.fold, foldT, 12, dt);
    const fl = Math.sin(this.time * flap) * (1 - this.fold);
    j.body.rotation.x = this.pitch;
    j.body.rotation.z = this.state === 'dazed' ? Math.sin(this.time * 9) * 0.18 : 0;
    j.wingL.rotation.z = 0.15 + fl * 0.8 - this.fold * 1.1;
    j.wingR.rotation.z = -(0.15 + fl * 0.8 - this.fold * 1.1);
    j.wingL.rotation.y = this.fold * 0.7;
    j.wingR.rotation.y = -this.fold * 0.7;
    j.head.rotation.x = -this.pitch * 0.7 + Math.sin(this.time * 7) * 0.08;
    j.head.rotation.z = this.state === 'dazed' ? Math.sin(this.time * 6) * 0.5 : 0;
    j.legL.rotation.x = this.state === 'dazed' ? 0 : 0.9;
    j.legR.rotation.x = this.state === 'dazed' ? 0 : 0.9;
  }
}
