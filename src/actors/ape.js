import * as THREE from 'three';
import { Rig } from './rig.js';
import { GEO } from '../engine/build.js';
import { clamp, clamp01, damp, dampAngle, lerp } from '../engine/util.js';

// The five apes. They play the same; the differences are looks.
export const APES = [
  { id: 'trevor', name: 'Trevor', line: 'Big scarf. Bigger fists.', fur: 0x1e1e24, fur2: 0x2a2a32, skin: 0x2f2f37, saddle: 0x767b84, scarf: [0xff4a1c, 0xf3eee4], band: 0xe9e2d0, extra: 'wraps' },
  { id: 'lukas', name: 'Lukas', line: 'Never takes the cap off.', fur: 0x35261d, fur2: 0x443126, skin: 0x33292b, saddle: 0x8c8073, scarf: [0x2d6fd6, 0xf3eee4], band: 0x2d6fd6, extra: 'cap' },
  { id: 'sloan', name: 'Sloan', line: 'Fastest hands on the Parkway.', fur: 0x272a36, fur2: 0x333746, skin: 0x2d2e38, saddle: 0xb4bac6, scarf: [0x8e44ad, 0xffd23a], band: 0xffd23a, extra: 'headband' },
  { id: 'calvin', name: 'Calvin', line: 'Too cool to run. Runs anyway.', fur: 0x44261a, fur2: 0x573223, skin: 0x35282a, saddle: 0x9b6e4e, scarf: [0x1f9d55, 0xf3eee4], band: 0x1f9d55, extra: 'shades' },
  { id: 'zo', name: 'Zo', line: 'Loudest roar in the zoo.', fur: 0x17171b, fur2: 0x222228, skin: 0x2a2a31, saddle: 0x5f636c, scarf: [0xffd23a, 0x141418], band: 0x22c1c3, extra: 'mohawk' },
];

const FACE = { eye: 0xd9912f, pupil: 0x09090a, white: 0xfdfbf4, tooth: 0xf1ead9, mouth: 0x521a1a };

export const APE = { radius: 4.6, speed: 27, jump: 37, gravity: 84, maxHp: 100, climb: 21 };

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

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

// A gorilla, built the way one is put together: a barrel chest over a pot
// belly, arms longer and far heavier than the legs, a crested skull, a heavy
// brow and a broad flat nose. Chunky, but the proportions are the real ones.
export function buildApe(v = APES[0]) {
  const rig = new Rig({ roughness: 0.82 });
  const { fur, fur2, skin, saddle } = v;
  const skin2 = new THREE.Color(skin).multiplyScalar(1.25).getHex();

  // A tapered limb segment hanging down from the joint.
  const limb = (j, color, top, bottom, len, x = 0, y = 0, z = 0) => rig.on(j).add(new THREE.CylinderGeometry(top, bottom, len, 12, 1), color, x, y - len / 2, z);
  // A lock of fur: a cone pointing along (dx, dy, dz).
  const tuft = (j, color, x, y, z, r, h, dx, dy, dz) => {
    _q.setFromUnitVectors(_up, _d.set(dx, dy, dz).normalize());
    _e.setFromQuaternion(_q, 'YXZ');
    rig.on(j).add(GEO.cone(5), color, x, y, z, r, h, r, _e.y, _e.x, _e.z);
  };

  const tilt = rig.joint('tilt');
  const hips = rig.joint('hips', tilt, 0, 5.2, 0);
  rig.blob(hips, fur, 0, 0.6, -0.3, 3.3, 2.5, 2.9);

  const spine = rig.joint('spine', hips, 0, 1.3, 0);
  rig.blob(spine, fur, 0, 1.2, 0.45, 3.9, 3.0, 3.4); // pot belly
  rig.blob(spine, saddle, 0, 1.1, -1.85, 3.1, 2.4, 1.6);

  const chest = rig.joint('chest', spine, 0, 3.0, 0);
  rig.blob(chest, fur, 0, 1.3, 0, 4.9, 3.5, 3.4);
  rig.blob(chest, fur, 0, 3.4, -0.9, 3.7, 2.0, 2.7); // the hump of muscle behind the neck
  rig.blob(chest, saddle, 0, 0.5, -2.1, 3.9, 3.3, 1.6);
  rig.blob(chest, saddle, 0, 2.1, -2.15, 3.0, 1.6, 1.3);
  for (const s of [-1, 1]) {
    rig.blob(chest, skin, s * 1.95, 1.6, 2.4, 2.15, 1.65, 1.05); // bare chest
    rig.blob(chest, fur, s * 3.7, 0.5, -0.4, 1.7, 2.7, 2.3); // lats
    tuft(chest, fur, s * 3.2, 4.2, -1.2, 0.9, 1.7, s * 0.6, 0.7, -0.5);
    tuft(chest, fur, s * 1.5, 4.9, -1.6, 0.9, 1.6, s * 0.2, 0.8, -0.6);
    tuft(chest, fur, s * 4.6, -0.6, -0.6, 0.8, 1.8, s * 0.5, -0.8, -0.2);
  }
  tuft(chest, fur, 0, 5.0, -1.9, 0.9, 1.6, 0, 0.7, -0.7);

  // The scarf: striped arcs round the neck and a tail down the front.
  for (let k = 0; k < 8; k++) {
    rig.on(chest).add(new THREE.TorusGeometry(2.55, 0.85, 7, 3, Math.PI / 4 + 0.02), v.scarf[k % 2], 0, 4.0, 1.0, 1, 1, 1, (k * Math.PI) / 4, Math.PI / 2 - 0.14, 0);
  }
  const scarf = rig.joint('scarf', chest, 2.0, 3.7, 3.2);
  for (let k = 0; k < 5; k++) rig.on(scarf).box(1.75, 0.94, 0.42, 0, -0.94 * (k + 1), 0, v.scarf[k % 2]);
  for (let k = 0; k < 4; k++) rig.on(scarf).box(0.24, 0.72, 0.2, -0.6 + k * 0.4, -5.42, 0, v.scarf[0]);

  const head = rig.joint('head', chest, 0, 4.0, 1.9);
  rig.blob(head, fur, 0, 0.9, -0.2, 2.3, 2.3, 2.5);
  rig.blob(head, fur, 0, 2.4, -1.1, 1.5, 2.1, 2.3); // sagittal crest
  rig.blob(head, skin, 0, 0.45, 1.55, 1.9, 1.5, 1.1);
  rig.blob(head, skin, 0, 1.38, 1.78, 2.3, 0.62, 0.92); // brow ridge
  rig.blob(head, skin2, 0, -0.45, 2.25, 1.62, 0.86, 1.3); // muzzle
  rig.blob(head, skin2, 0, 0.26, 2.72, 1.02, 0.6, 0.62); // the broad nose
  rig.blob(head, FACE.mouth, 0, -0.82, 1.9, 1.2, 0.48, 1.0);
  for (const s of [-1, 1]) {
    rig.blob(head, FACE.pupil, s * 0.43, 0.16, 3.22, 0.3, 0.23, 0.2); // nostrils
    rig.blob(head, FACE.pupil, s * 0.9, 0.92, 2.22, 0.56, 0.42, 0.3);
    rig.blob(head, FACE.eye, s * 0.9, 0.9, 2.43, 0.31, 0.29, 0.22);
    rig.blob(head, FACE.pupil, s * 0.9, 0.9, 2.6, 0.16, 0.17, 0.1);
    rig.blob(head, FACE.white, s * 0.82, 1.0, 2.68, 0.065, 0.065, 0.05);
    rig.blob(head, fur, s * 1.95, 0.1, 0.9, 1.0, 1.35, 1.25); // cheeks
    rig.blob(head, skin, s * 2.32, 0.85, 0.2, 0.4, 0.62, 0.3); // ears
    rig.on(head).add(GEO.cone(5), FACE.tooth, s * 0.78, -0.55, 2.98, 0.24, 0.8, 0.24, 0, Math.PI, 0);
    tuft(head, fur, s * 2.2, -0.5, 0.6, 0.7, 1.3, s * 0.5, -0.8, 0.1);
  }
  if (v.extra !== 'cap' && v.extra !== 'mohawk') for (let k = 0; k < 3; k++) tuft(head, fur, 0, 3.9 - k * 0.2, -0.6 - k * 0.9, 0.7, 1.3, 0, 0.8, -0.6);
  const jaw = rig.joint('jaw', head, 0, -0.75, 1.1);
  rig.blob(jaw, skin2, 0, -0.35, 1.0, 1.5, 0.62, 1.45);
  rig.blob(jaw, fur, 0, -0.78, 0.6, 1.3, 0.62, 1.0);
  rig.on(jaw).box(1.3, 0.24, 0.22, 0, 0.02, 2.12, FACE.tooth);
  for (const s of [-1, 1]) rig.on(jaw).cone(0.22, 0.7, s * 0.66, 0.0, 2.05, FACE.tooth, 5);

  // What each ape wears.
  if (v.extra === 'cap') {
    rig.on(head).add(GEO.dome(12), v.scarf[0], 0, 2.0, -0.55, 2.65, 2.6, 2.95);
    rig.on(head).box(3.0, 0.3, 2.4, 0, 2.1, -4.1, v.scarf[0]);
    rig.blob(head, v.scarf[1], 0, 4.6, -0.55, 0.3, 0.2, 0.3);
    rig.on(head).box(1.5, 0.9, 0.15, 0, 2.3, 2.38, v.scarf[1]);
  } else if (v.extra === 'headband') {
    rig.on(head).add(new THREE.TorusGeometry(2.12, 0.34, 6, 18), v.scarf[1], 0, 1.88, -0.1, 1, 1.12, 1, 0, Math.PI / 2 - 0.32, 0);
    for (const s of [-1, 1]) rig.on(head).box(0.6, 0.18, 2.0, s * 0.45, 1.0, -3.2, v.scarf[1], s * 0.25, 0.55, 0);
  } else if (v.extra === 'shades') {
    for (const s of [-1, 1]) {
      rig.on(head).box(1.15, 0.72, 0.25, s * 0.9, 0.56, 2.62, 0x0b0d12);
      rig.on(head).box(0.16, 0.2, 2.4, s * 1.85, 0.86, 1.5, 0x0b0d12);
    }
    rig.on(head).box(0.8, 0.18, 0.2, 0, 1.0, 2.66, 0xd4af37);
  } else if (v.extra === 'mohawk') {
    for (let k = 0; k < 6; k++) tuft(head, v.band, 0, 3.1 + Math.sin((k / 5) * Math.PI) * 1.0, 1.0 - k * 0.72, 0.62, 1.9 + Math.sin((k / 5) * Math.PI) * 0.8, 0, 0.9, -0.25 - k * 0.08);
  }

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = rig.joint('sh' + side, chest, s * 4.9, 2.5, 0);
    rig.blob(sh, fur, 0, 0.1, 0, 2.25, 2.25, 2.25);
    limb(sh, fur, 1.95, 1.6, 4.3, 0, -0.3);
    tuft(sh, fur, s * 1.2, 0.6, -0.6, 0.9, 1.6, s * 0.8, 0.3, -0.5);
    tuft(sh, fur, s * 0.6, -3.2, -1.3, 0.8, 1.7, s * 0.2, -0.5, -0.8);
    const el = rig.joint('el' + side, sh, 0, -4.6, 0);
    rig.blob(el, fur, 0, 0, 0, 1.75, 1.75, 1.75);
    // Gorilla forearms get thicker toward the wrist, under long hair.
    limb(el, fur2, 1.7, 2.05, 3.7, 0, -0.1, 0.1);
    rig.blob(el, fur2, 0, -3.75, 0.1, 2.05, 1.1, 2.05);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      tuft(el, fur2, Math.cos(a) * 1.5, -3.6, 0.1 + Math.sin(a) * 1.5, 0.75, 1.5, Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5 - 0.2);
    }
    rig.on(el).cyl(1.55, 1.0, 0, -4.95, 0.15, v.band, 12);
    rig.blob(el, skin, 0, -5.45, 0.4, 1.75, 1.05, 1.95); // hand
    for (const f of [-1.08, -0.36, 0.36, 1.08]) rig.blob(el, v.extra === 'wraps' ? v.band : skin2, f, -6.0, 1.35, 0.5, 0.74, 0.62); // knuckles
    rig.blob(el, skin2, s * -1.65, -5.25, 1.1, 0.5, 0.5, 0.85); // thumb

    const hip = rig.joint('hip' + side, hips, s * 2.1, 0.1, 0.1);
    rig.blob(hip, fur, s * 0.2, -0.9, 0.1, 2.0, 2.0, 2.15);
    limb(hip, fur, 1.95, 1.5, THIGH, 0, 0, 0.1);
    tuft(hip, fur, s * 1.4, -1.6, -0.6, 0.8, 1.5, s * 0.6, -0.7, -0.3);
    const knee = rig.joint('knee' + side, hip, 0, -THIGH, 0);
    rig.blob(knee, fur, 0, 0, 0.1, 1.5, 1.5, 1.55);
    limb(knee, fur, 1.4, 1.15, SHIN, 0, 0, -0.05);
    const ankle = rig.joint('ankle' + side, knee, 0, -SHIN, 0);
    rig.blob(ankle, skin, 0, 0, 0.95, 1.5, SOLE, 2.35);
    rig.blob(ankle, skin2, s * -1.35, -0.05, 1.5, 0.55, 0.48, 0.95); // the thumb-like big toe
    for (const f of [-0.75, -0.1, 0.55, 1.1]) rig.blob(ankle, skin2, s * f * 0.9 + s * 0.3, -0.1, 3.1, 0.34, 0.4, 0.5);
  }
  rig.finish();
  rig.addSilhouette(0xff6a2a);
  return rig;
}

const POSE_KEYS = ['tilt', 'lift', 'bob', 'lean', 'roll', 'twist', 'headX', 'headY', 'jaw', 'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR', 'thL', 'knL', 'thR', 'knR', 'scarf'];

export class Ape {
  constructor(game, variant = APES[0]) {
    this.game = game;
    this.root = new THREE.Group();
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.pose = {};
    this.tp = {};
    for (const k of POSE_KEYS) this.pose[k] = this.tp[k] = 0;
    this.setVariant(variant);
    this.reset(0, 0, 0);
  }

  // Swap which ape this is. Everything but the model carries over.
  setVariant(v) {
    if (this.rig) this.rig.dispose();
    this.variant = v;
    this.name = v.name;
    this.rig = buildApe(v);
    this.root.add(this.rig.root);
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
    this.time = this.time || 0;
    this.victory = false;
    this.climb = null;
    this.wallYaw = 0;
    this.pushT = 0;
    this.peakY = 0;
    this.climbDir = 0;
    this.computeTarget();
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

    const live = g.controlsOn && this.state !== 'dead';
    let wx = 0;
    let wz = 0;
    if (live) {
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
    if (live) {
      if (inp.take('punch')) this.queued = 0.28;
      if (inp.take('jump')) {
        if (this.state === 'climb') this.leapOff(false);
        else if (this.onGround && (this.state === 'free' || (this.state === 'attack' && this.attack.hit))) {
          this.vel.y = APE.jump;
          this.onGround = false;
          this.peakY = this.pos.y;
          this.state = 'air';
          this.attack = null;
          g.audio.play('jump');
        }
      }
      if (inp.take('slam')) {
        if (this.state === 'climb') this.leapOff(true);
        else if (!this.onGround && this.state === 'air') {
          this.state = 'dive';
          this.vel.y = Math.min(this.vel.y, -70);
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

    const prevY = this.pos.y;
    if (this.state === 'climb') {
      this.climbWall(dt, wx, wz, wishMag, raging);
    } else {
      // Horizontal movement.
      let maxSpeed = APE.speed * (raging ? 1.2 : 1) * lerp(1, 0.6, water);
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
        this.steer(wx, wz, maxSpeed, this.onGround ? 120 : 70, dt);
        if (wishMag > 0.12) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), this.onGround ? 11 : 6, dt);
      } else {
        this.steer(0, 0, 0, this.state === 'dive' ? 200 : 70, dt);
      }

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const wall = world.resolveCircle(this.pos, APE.radius, this.pos.y);
      const b = world.bounds;
      this.pos.x = clamp(this.pos.x, b.x0, b.x1);
      this.pos.z = clamp(this.pos.z, b.z0, b.z1);

      // Lean on a wall for a moment and he starts to climb it.
      let pushing = false;
      const rise = wall ? wall.h - this.pos.y : 0;
      if (wall && live && wishMag > 0.5 && (this.state === 'free' || this.state === 'air') && rise > 0.6) {
        const n = this.wallNormal(wall);
        if (n && wx * n.x + wz * n.z > 0.72) {
          pushing = true;
          this.pushT += dt;
          // A kerb-high ledge is hopped at once; a real wall takes a moment's lean.
          if (this.pushT > (!this.onGround || rise < 5 ? 0.04 : 0.28)) this.startClimb(wall, n);
        }
      }
      if (!pushing) this.pushT = 0;
    }

    // Vertical movement. Roofs count as ground once he is above them.
    if (this.state !== 'climb') {
      const ground = Math.max(world.groundHeight(this.pos.x, this.pos.z), world.roofAt(this.pos.x, this.pos.z, prevY + 1.3));
      if (!this.onGround) {
        this.vel.y -= APE.gravity * dt;
        this.pos.y += this.vel.y * dt;
        this.peakY = Math.max(this.peakY, this.pos.y);
        if (this.pos.y <= ground && this.vel.y <= 0) {
          this.pos.y = ground;
          this.onGround = true;
          const dive = this.state === 'dive';
          const hard = dive || this.vel.y < -30;
          const drop = Math.max(0, this.peakY - ground);
          this.vel.y = 0;
          if (dive) {
            // The higher he dropped from, the bigger the crater.
            const radius = 23 + Math.min(34, drop * 0.3);
            const dmg = (32 + Math.min(70, drop * 0.55)) * (raging ? 1.8 : 1);
            g.strike({ x: this.pos.x, z: this.pos.z, y: this.pos.y, radius, dmg, knock: 46 + Math.min(30, drop * 0.3), launch: 32, radial: true, heavy: true });
            g.groundPound(this.pos.x, this.pos.z, radius, 1 + Math.min(1, drop / 80));
            if (drop > 40) g.onBigDive(drop);
            this.state = 'attack';
            this.attack = { kind: 'land', t: 0, hit: true };
            this.lockYaw = this.yaw;
          } else {
            if (this.state === 'air') this.state = 'free';
            if (hard) g.groundPound(this.pos.x, this.pos.z, 9 + Math.min(10, drop * 0.2), 0.35 + Math.min(0.5, drop / 100));
          }
        }
      } else if (ground < this.pos.y - 2.2) {
        // Walked off an edge.
        this.onGround = false;
        this.vel.y = 0;
        this.peakY = this.pos.y;
        if (this.state === 'free') this.state = 'air';
      } else {
        this.pos.y = damp(this.pos.y, ground, 16, dt);
      }
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
      if (this.pos.y < 3) world.trample(this.pos.x + this.fx * 2, this.pos.z + this.fz * 2, 5.5, g.onTreeFlattened, g.onCarKicked);
    }

    this.animate(dt);
  }

  // The direction from the ape into the wall he is touching.
  wallNormal(c) {
    const dx = this.pos.x - c.cx;
    const dz = this.pos.z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const ex = clamp(lx, -c.hx, c.hx) - lx;
    const ez = clamp(lz, -c.hz, c.hz) - lz;
    const d = Math.hypot(ex, ez);
    if (d < 0.01) return null;
    return { x: (ex * c.cos + ez * c.sin) / d, z: (-ex * c.sin + ez * c.cos) / d };
  }

  startClimb(c, n) {
    this.state = 'climb';
    this.climb = c;
    this.wallYaw = Math.atan2(n.x, n.z);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.pushT = 0;
    this.attack = null;
    this.peakY = this.pos.y;
    if (c.h - this.pos.y > 6) this.game.onClimbStart();
  }

  // Hand over hand up the side of a building: push toward the wall to go up,
  // pull away to come down, let go of the stick to hang.
  climbWall(dt, wx, wz, wishMag, raging) {
    const world = this.game.world;
    const c = this.climb;
    this.yaw = dampAngle(this.yaw, this.wallYaw, 14, dt);
    this.vel.set(0, 0, 0);
    const nx = Math.sin(this.wallYaw);
    const nz = Math.cos(this.wallYaw);
    const along = wx * nx + wz * nz;
    this.climbDir = wishMag < 0.25 ? 0 : along > -0.35 ? 1 : -1;
    const speed = APE.climb * (raging ? 1.25 : 1);
    this.pos.y += this.climbDir * speed * dt;
    this.phase += this.climbDir * dt * 9;
    this.peakY = Math.max(this.peakY, this.pos.y);
    if (c.dead) {
      this.state = 'air';
      this.vel.y = 0;
      return;
    }
    const floor = world.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y >= c.h - 0.2) {
      // Over the parapet. If a setback rises straight ahead, keep climbing it.
      this.pos.y = c.h;
      this.pos.x += nx * (APE.radius + 1.3);
      this.pos.z += nz * (APE.radius + 1.3);
      const next = world.resolveCircle(this.pos, APE.radius, this.pos.y);
      if (next && next.building && next.building === c.building && next.h > c.h + 3) {
        this.climb = next;
        return;
      }
      this.state = 'free';
      this.onGround = true;
      this.climb = null;
      this.game.onRoofReached(c.h);
    } else if (this.pos.y <= floor && this.climbDir < 0) {
      this.pos.y = floor;
      this.state = 'free';
      this.onGround = true;
      this.climb = null;
    } else {
      world.resolveCircle(this.pos, APE.radius, this.pos.y);
    }
  }

  // Let go of the wall: a jump kicks away from it, a slam drops into a dive.
  leapOff(dive) {
    const nx = Math.sin(this.wallYaw);
    const nz = Math.cos(this.wallYaw);
    this.climb = null;
    this.onGround = false;
    this.yaw = this.wallYaw + Math.PI;
    this.vel.x = -nx * (dive ? 26 : 20);
    this.vel.z = -nz * (dive ? 26 : 20);
    if (dive) {
      this.state = 'dive';
      this.vel.y = -30;
      this.game.audio.play('whoosh');
    } else {
      this.state = 'air';
      this.vel.y = 30;
      this.game.audio.play('jump');
    }
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
    dmg = Math.max(1, Math.round(dmg * ((g.diff && g.diff.dmg) || 1)));
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
    // A hit knocks him off a wall.
    if (this.state === 'climb') {
      this.climb = null;
      this.vel.y = 0;
    }
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

    if (this.victory || this.showcase === 'flex') {
      P.lean = -0.08;
      P.shLx = P.shRx = -2.9;
      P.shLz = P.shRz = 0.45;
      P.elL = P.elR = -0.3 + Math.sin(t * 9) * 0.25;
      P.headX = -0.45;
      P.jaw = 0.7;
      P.thL = P.thR = -0.3;
      P.knL = P.knR = 0.6;
      P.bob = Math.abs(Math.sin(t * 9)) * 0.5;
    } else if (this.state === 'climb') {
      rate = 18;
      P.lean = -0.06;
      P.roll = sn * 0.08;
      P.twist = sn * 0.18;
      P.bob = 0;
      P.shLx = -2.75 + sn * 0.38;
      P.shRx = -2.75 - sn * 0.38;
      P.shLz = P.shRz = 0.22;
      P.elL = -0.55 - Math.max(0, -sn) * 0.7;
      P.elR = -0.55 - Math.max(0, sn) * 0.7;
      P.thL = -1.0 - sn * 0.45;
      P.thR = -1.0 + sn * 0.45;
      P.knL = 1.5 + sn * 0.4;
      P.knR = 1.5 - sn * 0.4;
      P.headX = -0.55;
      P.headY = 0;
      P.scarf = 0.1;
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
    // Flash red when hurt, glow orange while raging, blink while invulnerable.
    if (this.flash > 0) this.rig.setFlash(this.flash * 0.9, 0xff3b2f);
    else if (this.rageMode > 0) this.rig.setFlash(0.22 + Math.sin(this.time * 14) * 0.1, 0xff5a1c);
    else this.rig.setFlash(0);
    this.root.visible = !(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.time * 22) % 2 === 0 && this.flash <= 0);
  }
}
