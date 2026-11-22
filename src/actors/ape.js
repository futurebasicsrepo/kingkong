import * as THREE from 'three';
import { Rig } from './rig.js';
import { GEO } from '../engine/build.js';
import { clamp, clamp01, damp, dampAngle, lerp } from '../engine/util.js';

const C = {
  fur: 0x212127,
  fur2: 0x2d2d34,
  silver: 0x6a6f79,
  skin: 0x2f2f37,
  muzzle: 0x3e3e47,
  eye: 0xd08a2e,
  pupil: 0x0a0a0b,
  tooth: 0xf1ead9,
  mouth: 0x4a1616,
  scarfA: 0xff4a1c,
  scarfB: 0xf3eee4,
  wrap: 0xe9e2d0,
};

export const APE = { radius: 4.6, speed: 27, jump: 37, gravity: 84, maxHp: 100 };

// dur: whole move, hit: when it lands, reach: how far ahead the blow is
// centred, radius: how wide it is.
export const ATTACKS = {
  jab: { dur: 0.3, hit: 0.11, dmg: 10, reach: 8.5, radius: 7.5, knock: 16, launch: 0, lunge: 14, next: 'cross' },
  cross: { dur: 0.32, hit: 0.12, dmg: 12, reach: 8.5, radius: 7.5, knock: 20, launch: 0, lunge: 14, next: 'smash' },
  smash: { dur: 0.6, hit: 0.27, dmg: 22, reach: 8, radius: 11, knock: 34, launch: 24, lunge: 9, heavy: true, next: null },
  slam: { dur: 0.86, hit: 0.38, dmg: 26, reach: 4, radius: 20, knock: 42, launch: 30, lunge: 0, heavy: true, radial: true, next: null },
  land: { dur: 0.42, hit: -1, dmg: 0, reach: 0, radius: 0, knock: 0, launch: 0, lunge: 0, next: null },
};

const THIGH = 2.6;
const SHIN = 2.5;
const SOLE = 0.65;
const legExtent = (th, kn) => SOLE + SHIN * Math.cos(th + kn) + THIGH * Math.cos(th) - 0.1;

function buildApe() {
  const rig = new Rig();
  const tilt = rig.joint('tilt');
  const hips = rig.joint('hips', tilt, 0, 5.2, 0);
  rig.blob(hips, C.fur, 0, 0.7, -0.3, 3.1, 2.4, 2.7);

  const spine = rig.joint('spine', hips, 0, 1.3, 0);
  rig.blob(spine, C.fur, 0, 1.3, 0.2, 3.6, 2.7, 3.0);

  const chest = rig.joint('chest', spine, 0, 3.0, 0);
  rig.blob(chest, C.fur, 0, 1.3, 0.1, 4.7, 3.3, 3.3);
  rig.blob(chest, C.skin, 1.8, 1.5, 2.25, 2.0, 1.55, 1.15);
  rig.blob(chest, C.skin, -1.8, 1.5, 2.25, 2.0, 1.55, 1.15);
  rig.blob(chest, C.silver, 0, 0.1, -1.75, 3.3, 3.2, 1.75);
  rig.blob(spine, C.silver, 0, 1.2, -1.5, 2.7, 2.2, 1.7);
  rig.blob(chest, C.fur, 0, 3.3, -0.7, 3.3, 1.7, 2.5);
  // A supporter's scarf: eight striped arcs round the neck.
  for (let k = 0; k < 8; k++) {
    rig.on(chest).add(new THREE.TorusGeometry(2.45, 0.82, 7, 3, Math.PI / 4 + 0.02), k % 2 ? C.scarfB : C.scarfA, 0, 4.0, 0.95, 1, 1, 1, (k * Math.PI) / 4, Math.PI / 2 - 0.12, 0);
  }
  const scarf = rig.joint('scarf', chest, 1.9, 3.7, 3.1);
  for (let k = 0; k < 5; k++) rig.on(scarf).box(1.7, 0.92, 0.4, 0, -0.92 * (k + 1), 0, k % 2 ? C.scarfB : C.scarfA);
  for (let k = 0; k < 4; k++) rig.on(scarf).box(0.22, 0.7, 0.2, -0.6 + k * 0.4, -5.3, 0, C.scarfA);

  const head = rig.joint('head', chest, 0, 4.1, 1.6);
  rig.blob(head, C.fur, 0, 1.0, -0.1, 2.15, 2.3, 2.3);
  rig.blob(head, C.fur, 0, 2.6, -0.9, 1.3, 1.7, 1.9); // crest
  rig.blob(head, C.fur, 0, 1.42, 1.72, 2.05, 0.58, 0.85); // brow ridge
  rig.blob(head, C.skin, 0, 0.55, 1.5, 1.8, 1.4, 1.05);
  rig.blob(head, C.muzzle, 0, -0.2, 2.15, 1.5, 1.0, 1.15);
  rig.blob(head, C.mouth, 0, -0.78, 1.9, 1.1, 0.45, 0.95);
  for (const s of [-1, 1]) {
    rig.blob(head, C.pupil, s * 0.45, 0.02, 3.18, 0.3, 0.2, 0.2);
    rig.blob(head, C.eye, s * 0.86, 0.95, 2.28, 0.34, 0.3, 0.25);
    rig.blob(head, C.pupil, s * 0.86, 0.95, 2.47, 0.17, 0.18, 0.12);
    rig.blob(head, C.skin, s * 2.1, 0.9, 0.1, 0.35, 0.6, 0.48);
    rig.on(head).add(GEO.cone(5), C.tooth, s * 0.72, -0.5, 2.85, 0.24, 0.75, 0.24, 0, Math.PI, 0); // upper fangs
  }
  const jaw = rig.joint('jaw', head, 0, -0.7, 1.2);
  rig.blob(jaw, C.muzzle, 0, -0.35, 0.95, 1.35, 0.55, 1.15);
  for (const s of [-1, 1]) rig.on(jaw).cone(0.22, 0.7, s * 0.62, -0.05, 1.75, C.tooth, 5);
  rig.on(jaw).box(1.0, 0.25, 0.25, 0, -0.02, 1.86, C.tooth);

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = rig.joint('sh' + side, chest, s * 4.6, 2.4, 0.1);
    rig.blob(sh, C.fur, 0, 0, 0, 2.05, 2.05, 2.05);
    rig.blob(sh, C.fur, s * 0.1, -2.3, 0, 1.65, 2.75, 1.75);
    const el = rig.joint('el' + side, sh, 0, -4.5, 0);
    rig.blob(el, C.fur2, 0, -2.0, 0.1, 1.8, 2.75, 1.9);
    rig.on(el).cyl(1.5, 1.3, 0, -4.7, 0.1, C.wrap, 12);
    rig.blob(el, C.skin, 0, -5.4, 0.3, 1.8, 1.5, 1.95);
    rig.blob(el, C.wrap, 0, -5.85, 1.1, 1.55, 0.8, 0.9);

    const hip = rig.joint('hip' + side, hips, s * 2.0, 0.1, 0.1);
    rig.blob(hip, C.fur, 0, -1.2, 0.1, 1.85, 2.2, 2.05);
    const knee = rig.joint('knee' + side, hip, 0, -THIGH, 0);
    rig.blob(knee, C.fur, 0, -1.2, -0.1, 1.35, 1.8, 1.45);
    const ankle = rig.joint('ankle' + side, knee, 0, -SHIN, 0);
    rig.blob(ankle, C.skin, 0, 0, 0.9, 1.45, SOLE, 2.3);
  }
  rig.finish();
  rig.addSilhouette(0xff6a2a);
  return rig;
}

const POSE_KEYS = ['tilt', 'lift', 'bob', 'lean', 'roll', 'twist', 'headX', 'headY', 'jaw', 'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR', 'thL', 'knL', 'thR', 'knR', 'scarf'];

export class Ape {
  constructor(game) {
    this.game = game;
    this.rig = buildApe();
    this.root = this.rig.root;
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.pose = {};
    this.tp = {};
    for (const k of POSE_KEYS) this.pose[k] = this.tp[k] = 0;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.pos.set(x, this.game.world ? this.game.world.groundHeight(x, z) : 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.hp = APE.maxHp;
    this.rage = 0;
    this.rageMode = 0;
    this.state = 'free';
    this.t = 0;
    this.attack = null;
    this.queued = 0;
    this.comboNext = 'jab';
    this.comboTimer = 0;
    this.onGround = true;
    this.invuln = 0;
    this.flash = 0;
    this.phase = 0;
    this.speed = 0;
    this.lockYaw = yaw;
    this.lunge = 0;
    this.stepTimer = 0;
    this.time = 0;
    this.victory = false;
    this.computeTarget(0);
    Object.assign(this.pose, this.tp);
    this.applyPose();
  }

  get fx() {
    return Math.sin(this.yaw);
  }
  get fz() {
    return Math.cos(this.yaw);
  }

  // ---- control -----------------------------------------------------------

  update(dt) {
    const g = this.game;
    const inp = g.input;
    const world = g.world;
    this.time += dt;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.state !== 'attack') this.comboNext = 'jab';
    if (this.rageMode > 0) {
      this.rageMode -= dt;
      this.rage = clamp01(this.rageMode / 8) * 100;
    }

    let wx = 0;
    let wz = 0;
    if (g.controlsOn && this.state !== 'dead') {
      const cy = g.cam.yaw;
      const fx = Math.sin(cy);
      const fz = Math.cos(cy);
      wx = fx * inp.moveY + -fz * inp.moveX;
      wz = fz * inp.moveY + fx * inp.moveX;
      const m = Math.hypot(wx, wz);
      if (m > 1) {
        wx /= m;
        wz /= m;
      }
    }
    const wishMag = Math.hypot(wx, wz);
    const water = world.waterAmount(this.pos.x, this.pos.z);
    const raging = this.rageMode > 0;

    // Buttons. Presses are remembered for a moment so combos feel forgiving.
    if (g.controlsOn && this.state !== 'dead') {
      if (inp.take('punch')) this.queued = 0.28;
      if (inp.take('jump') && this.onGround && (this.state === 'free' || (this.state === 'attack' && this.attack.hit))) {
        this.vel.y = APE.jump;
        this.onGround = false;
        this.state = 'air';
        this.attack = null;
        g.audio.play('jump');
      }
      if (inp.take('slam')) {
        if (!this.onGround && this.state === 'air') {
          this.state = 'dive';
          this.vel.y = -70;
          g.audio.play('whoosh');
        } else if (this.onGround && (this.state === 'free' || (this.state === 'attack' && this.attack.hit && this.attack.kind !== 'slam'))) {
          this.startAttack('slam');
        }
      }
      if (inp.take('roar') && this.rage >= 100 && this.rageMode <= 0 && this.onGround && this.state !== 'hurt' && this.state !== 'roar') {
        this.state = 'roar';
        this.t = 0;
        this.roared = false;
        this.attack = null;
        g.audio.play('roar');
      }
    }
    this.queued -= dt;

    if (this.queued > 0) {
      if (this.state === 'free') {
        this.queued = 0;
        this.startAttack(this.comboNext, wx, wz);
      } else if (this.state === 'air' && this.vel.y < 22) {
        // An air punch: same blow, no lunge.
        this.queued = 0;
        this.startAttack('cross', wx, wz);
      } else if (this.state === 'attack' && this.attack.hit && this.attack.t > ATTACKS[this.attack.kind].hit + 0.07) {
        const next = ATTACKS[this.attack.kind].next;
        if (next && this.onGround) {
          this.queued = 0;
          this.startAttack(next, wx, wz);
        }
      }
    }

    // State timers.
    if (this.state === 'attack') {
      const a = this.attack;
      const d = ATTACKS[a.kind];
      a.t += dt;
      if (!a.hit && a.t >= d.hit) {
        a.hit = true;
        if (d.hit >= 0) this.landBlow(a.kind);
      }
      if (a.t >= d.dur) {
        this.state = this.onGround ? 'free' : 'air';
        this.comboNext = d.next || 'jab';
        this.comboTimer = 0.5;
        this.attack = null;
      }
    } else if (this.state === 'roar') {
      if (!this.roared && this.t > 0.38) {
        this.roared = true;
        this.rageMode = 8;
        g.roarBlast(this.pos.x, this.pos.z);
      }
      if (this.t > 1.15) this.state = 'free';
    } else if (this.state === 'hurt') {
      if (this.t > 0.3) this.state = this.onGround ? 'free' : 'air';
    }

    // Horizontal movement.
    let maxSpeed = APE.speed * (raging ? 1.2 : 1) * lerp(1, 0.6, water);
    const accel = 120;
    if (this.state === 'attack') {
      const a = this.attack;
      this.yaw = dampAngle(this.yaw, this.lockYaw, 24, dt);
      if (!a.hit && this.onGround) {
        this.vel.x = this.fx * this.lunge;
        this.vel.z = this.fz * this.lunge;
      } else {
        maxSpeed *= this.onGround ? 0.15 : 0.8;
      }
      if (a.hit || !this.onGround) this.steer(wx, wz, maxSpeed, this.onGround ? 160 : 60, dt);
    } else if (this.state === 'free' || this.state === 'air') {
      this.steer(wx, wz, maxSpeed, this.onGround ? accel : 70, dt);
      if (wishMag > 0.12) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), this.onGround ? 11 : 6, dt);
    } else {
      this.steer(0, 0, 0, this.state === 'dive' ? 200 : 70, dt);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveCircle(this.pos, APE.radius, this.pos.y);
    const b = world.bounds;
    this.pos.x = clamp(this.pos.x, b.x0, b.x1);
    this.pos.z = clamp(this.pos.z, b.z0, b.z1);

    // Vertical movement.
    const ground = world.groundHeight(this.pos.x, this.pos.z);
    if (!this.onGround) {
      this.vel.y -= APE.gravity * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.onGround = true;
        const dive = this.state === 'dive';
        const hard = dive || this.vel.y < -30;
        this.vel.y = 0;
        if (dive) {
          g.strike({ x: this.pos.x, z: this.pos.z, y: this.pos.y, radius: 23, dmg: 32 * (raging ? 1.8 : 1), knock: 46, launch: 32, radial: true, heavy: true });
          g.groundPound(this.pos.x, this.pos.z, 23, 1);
          this.state = 'attack';
          this.attack = { kind: 'land', t: 0, hit: true };
          this.lockYaw = this.yaw;
        } else {
          if (this.state === 'air') this.state = 'free';
          if (hard) g.groundPound(this.pos.x, this.pos.z, 9, 0.35);
        }
      }
    } else {
      this.pos.y = Math.abs(ground - this.pos.y) > 9 ? ground : damp(this.pos.y, ground, 16, dt);
    }

    // Footfalls: shake, dust, and whatever was parked in the way.
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.speed > 4) {
      this.phase += (this.speed / 15) * Math.PI * 2 * dt;
      this.stepTimer -= dt * (this.speed / APE.speed);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.28;
        g.footstep(this.pos.x, this.pos.z, water);
      }
      world.trample(this.pos.x + this.fx * 2, this.pos.z + this.fz * 2, 5.5, g.onTreeFlattened, g.onCarKicked);
    }

    this.animate(dt);
  }

  steer(wx, wz, maxSpeed, accel, dt) {
    const tx = wx * maxSpeed;
    const tz = wz * maxSpeed;
    const dx = tx - this.vel.x;
    const dz = tz - this.vel.z;
    const d = Math.hypot(dx, dz);
    const step = accel * dt;
    if (d <= step) {
      this.vel.x = tx;
      this.vel.z = tz;
    } else {
      this.vel.x += (dx / d) * step;
      this.vel.z += (dz / d) * step;
    }
  }

  startAttack(kind, wx = 0, wz = 0) {
    const d = ATTACKS[kind];
    const g = this.game;
    this.state = 'attack';
    this.attack = { kind, t: 0, hit: false };
    const aim = Math.hypot(wx, wz) > 0.2 ? Math.atan2(wx, wz) : this.yaw;
    const tgt = kind === 'slam' ? null : g.nearestEnemy(this.pos.x, this.pos.z, 30, aim, 1.9);
    if (tgt) {
      const dx = tgt.pos.x - this.pos.x;
      const dz = tgt.pos.z - this.pos.z;
      this.lockYaw = Math.atan2(dx, dz);
      const gap = Math.hypot(dx, dz) - tgt.radius - (d.reach - 2.5);
      this.lunge = clamp(gap / d.hit, 0, 80);
    } else {
      this.lockYaw = aim;
      this.lunge = d.lunge;
    }
    if (!this.onGround) this.lunge = 0;
    g.audio.play(d.heavy ? 'whooshBig' : 'whoosh');
  }

  landBlow(kind) {
    const d = ATTACKS[kind];
    const g = this.game;
    const boost = this.rageMode > 0 ? 1.8 : 1;
    const x = this.pos.x + this.fx * d.reach;
    const z = this.pos.z + this.fz * d.reach;
    g.strike({ x, z, y: this.pos.y, radius: d.radius, dmg: d.dmg * boost, knock: d.knock, launch: d.launch, dx: this.fx, dz: this.fz, radial: !!d.radial, heavy: !!d.heavy });
    if (kind === 'slam') g.groundPound(x, z, d.radius, 0.9);
    else if (kind === 'smash' && this.onGround) g.groundPound(x, z, 8, 0.4);
  }

  addRage(n) {
    if (this.rageMode > 0) return;
    this.rage = Math.min(100, this.rage + n);
  }

  heal(n) {
    this.hp = Math.min(APE.maxHp, this.hp + n);
  }

  takeDamage(dmg, fromX, fromZ, knock = 22) {
    if (this.invuln > 0 || this.state === 'roar' || this.state === 'dead' || this.victory) return false;
    const g = this.game;
    this.hp -= dmg;
    this.invuln = 0.75;
    this.flash = 1;
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * knock;
    this.vel.z = (dz / d) * knock;
    this.attack = null;
    this.t = 0;
    g.onPlayerHurt(dmg);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      g.onPlayerDead();
    } else {
      this.state = 'hurt';
    }
    return true;
  }

  // ---- animation ---------------------------------------------------------

  computeTarget() {
    const P = this.tp;
    const s = clamp01(this.speed / APE.speed);
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);
    const t = this.time;

    // Knuckle-walk: opposite arm and leg swing together.
    P.tilt = 0;
    P.lift = 0;
    P.lean = lerp(0.48, 0.74, s);
    P.roll = sn * 0.07 * s;
    P.twist = -sn * 0.16 * s;
    const armBase = -P.lean - 0.14;
    P.shLx = armBase - sn * 0.6 * s;
    P.shRx = armBase + sn * 0.6 * s;
    P.shLz = P.shRz = 0.15;
    P.elL = -0.12 - Math.max(0, cs) * 0.75 * s;
    P.elR = -0.12 - Math.max(0, -cs) * 0.75 * s;
    P.thL = -0.5 + sn * 0.6 * s;
    P.thR = -0.5 - sn * 0.6 * s;
    P.knL = 0.95 + Math.max(0, -cs) * 0.85 * s;
    P.knR = 0.95 + Math.max(0, cs) * 0.85 * s;
    P.bob = Math.abs(sn) * 0.4 * s + Math.sin(t * 1.7) * 0.07 * (1 - s);
    P.headX = -P.lean * 0.72 + Math.sin(t * 0.8) * 0.03;
    P.headY = Math.sin(t * 0.37) * 0.22 * (1 - s);
    P.jaw = 0;
    P.scarf = -P.lean + 0.25 * s + Math.sin(t * 5) * 0.08 * (0.3 + s);
    let rate = 14;

    const guard = () => {
      P.lean = 0.26;
      P.roll = 0;
      P.twist = 0;
      P.bob = 0;
      P.thL = -0.72;
      P.thR = -0.22;
      P.knL = 0.9;
      P.knR = 0.8;
      P.shLx = P.shRx = -1.0;
      P.elL = P.elR = -1.95;
      P.shLz = P.shRz = 0.28;
      P.headX = -0.18;
      P.headY = 0;
    };

    if (this.victory) {
      P.lean = -0.08;
      P.shLx = P.shRx = -2.9;
      P.shLz = P.shRz = 0.45;
      P.elL = P.elR = -0.3 + Math.sin(t * 9) * 0.25;
      P.headX = -0.45;
      P.jaw = 0.7;
      P.thL = P.thR = -0.3;
      P.knL = P.knR = 0.6;
      P.bob = Math.abs(Math.sin(t * 9)) * 0.5;
    } else if (this.state === 'attack') {
      const a = this.attack;
      const d = ATTACKS[a.kind];
      rate = 26;
      guard();
      const pre = a.t < d.hit - 0.07;
      const hit = !pre && a.t < d.hit + 0.11;
      if (a.kind === 'jab') {
        if (pre) {
          P.twist = 0.45;
          P.shLx = -0.4;
          P.elL = -2.3;
        } else if (hit) {
          P.lean = 0.42;
          P.twist = -0.78;
          P.shLx = -1.42 - P.lean;
          P.elL = -0.04;
        }
      } else if (a.kind === 'cross') {
        if (pre) {
          P.twist = -0.5;
          P.shRx = -0.4;
          P.elR = -2.3;
        } else if (hit) {
          P.lean = 0.46;
          P.twist = 0.9;
          P.shRx = -1.42 - P.lean;
          P.elR = -0.04;
          P.thR = -0.6;
        }
      } else if (a.kind === 'smash' || a.kind === 'slam') {
        const big = a.kind === 'slam';
        if (pre) {
          P.lean = big ? -0.32 : -0.2;
          P.lift = big ? 2.6 : 0.9;
          P.shLx = P.shRx = -3.0;
          P.elL = P.elR = -0.45;
          P.headX = -0.5;
          P.jaw = 0.55;
          P.thL = P.thR = -0.3;
          P.knL = P.knR = 0.5;
        } else if (hit || a.t < d.hit + 0.22) {
          P.lean = big ? 1.0 : 0.86;
          P.shLx = P.shRx = big ? -1.15 : -1.3;
          P.elL = P.elR = -0.03;
          P.headX = -0.7;
          P.thL = P.thR = big ? -1.05 : -0.8;
          P.knL = P.knR = big ? 1.55 : 1.2;
          P.jaw = 0.3;
        }
      } else {
        // Recovering from a dive: fists planted.
        P.lean = 0.95;
        P.shLx = P.shRx = -1.15;
        P.elL = P.elR = -0.05;
        P.thL = P.thR = -1.05;
        P.knL = P.knR = 1.55;
        P.headX = -0.7;
      }
    } else if (this.state === 'air' || this.state === 'dive') {
      rate = 16;
      const rising = this.vel.y > 4;
      P.lean = this.state === 'dive' ? -0.15 : 0.2;
      P.roll = P.twist = P.bob = 0;
      if (this.state === 'dive') {
        P.shLx = P.shRx = -3.0;
        P.elL = P.elR = -0.3;
        P.shLz = P.shRz = 0.2;
      } else {
        P.shLx = P.shRx = rising ? -2.5 : -1.5;
        P.shLz = P.shRz = rising ? 0.3 : 0.95;
        P.elL = P.elR = -0.5;
      }
      P.thL = -1.15;
      P.thR = -0.85;
      P.knL = 1.6;
      P.knR = 1.3;
      P.headX = -0.2;
    } else if (this.state === 'roar') {
      rate = 22;
      const beat = Math.sin(this.t * 36);
      P.lean = -0.12;
      P.roll = P.twist = 0;
      P.headX = -0.55;
      P.jaw = 0.8;
      P.shLz = P.shRz = 0.8;
      P.shLx = P.shRx = -0.75;
      P.elL = -2.05 + (beat > 0 ? 0.4 : 0);
      P.elR = -2.05 + (beat < 0 ? 0.4 : 0);
      P.thL = P.thR = -0.32;
      P.knL = P.knR = 0.66;
      P.bob = 0;
    } else if (this.state === 'hurt') {
      rate = 24;
      P.lean = -0.25;
      P.headX = -0.5;
      P.shLx = P.shRx = 0.15;
      P.shLz = P.shRz = 0.7;
      P.elL = P.elR = -0.6;
      P.jaw = 0.5;
    } else if (this.state === 'dead') {
      rate = 5;
      P.tilt = -1.5;
      P.lift = 2.2;
      P.lean = -0.1;
      P.shLx = P.shRx = -0.4;
      P.shLz = P.shRz = 1.1;
      P.elL = P.elR = -0.3;
      P.thL = -0.9;
      P.thR = -0.4;
      P.knL = P.knR = 0.5;
      P.headX = 0.2;
      P.jaw = 0.3;
      P.bob = 0;
    }
    return rate;
  }

  applyPose() {
    const p = this.pose;
    const j = this.rig.joints;
    j.tilt.rotation.x = p.tilt;
    j.tilt.position.y = p.lift;
    j.hips.position.y = Math.max(legExtent(p.thL, p.knL), legExtent(p.thR, p.knR)) + p.bob;
    j.spine.rotation.set(p.lean * 0.6, 0, p.roll);
    j.chest.rotation.set(p.lean * 0.4, p.twist, 0);
    j.head.rotation.set(p.headX, p.headY, 0);
    j.jaw.rotation.x = p.jaw;
    j.shL.rotation.set(p.shLx, 0, p.shLz);
    j.elL.rotation.x = p.elL;
    j.shR.rotation.set(p.shRx, 0, -p.shRz);
    j.elR.rotation.x = p.elR;
    j.hipL.rotation.x = p.thL;
    j.kneeL.rotation.x = p.knL;
    j.ankleL.rotation.x = -(p.thL + p.knL);
    j.hipR.rotation.x = p.thR;
    j.kneeR.rotation.x = p.knR;
    j.ankleR.rotation.x = -(p.thR + p.knR);
    j.scarf.rotation.x = p.scarf;
    this.root.rotation.y = this.yaw;
  }

  animate(dt) {
    const rate = this.computeTarget();
    for (const k of POSE_KEYS) this.pose[k] = damp(this.pose[k], this.tp[k], rate, dt);
    this.applyPose();
    // Flash white when hurt, glow orange while raging, blink while invulnerable.
    if (this.flash > 0) this.rig.setFlash(this.flash * 0.9, 0xff3b2f);
    else if (this.rageMode > 0) this.rig.setFlash(0.22 + Math.sin(this.time * 14) * 0.1, 0xff5a1c);
    else this.rig.setFlash(0);
    this.root.visible = !(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.time * 22) % 2 === 0 && this.flash <= 0);
  }
}
