import * as THREE from 'three';
import { City } from './city.js';
import { GEO, MeshBuilder, detail } from '../engine/build.js';
import { groundMaterial, waterMaterial } from '../engine/materials.js';
import { mulberry32, distToSegment, lerp } from '../engine/util.js';

// New York City: Manhattan below 110th Street, squeezed to fit, laid out the
// way the real island is. The grid runs between the Hudson (west) and the
// East River, with long blocks east to west and short ones north to south;
// Broadway cuts across it on the diagonal through Times Square and past the
// Flatiron. Central Park fills the north, the Financial District the south,
// and the harbour and the Statue of Liberty lie beyond Battery Park.
// North is -z, east is +x.

const AVE = 100; // avenue to avenue, east-west
const ST = 56; // street to street, north-south
const HX = 11; // half an avenue's width
const HZ = 8; // half a street's width
const OFFX = 50; // avenues stand at x = 50 + k * 100
const ISLAND = { x0: -300, x1: 280, z0: -640, z1: 572 };
const PARK = { x0: -139, x1: 39, z0: -640, z1: -456 };

const COL = {
  asphalt: 0x4a4a4c,
  sidewalk: 0xa8a59d,
  plaza: 0xc9c2b2,
  pavers: 0x8f8b84,
  grass: 0x768a4c,
  grassDark: 0x687d45,
  stone: 0xcfc6ae,
  slate: 0x47525e,
  copper: 0x6aa58f,
  bridge: 0xb7a88c,
};

const BRICK = [0x8e4a38, 0x9c5440, 0x7a3d32, 0xa86a4c, 0x6e4636, 0xb5835e, 0xc9b79a, 0x8a5a44, 0x5e3f33, 0x9a4a3a];
const STONE = [0xcfc6ae, 0xbfb49c, 0xd8d0bf, 0xa89f8f, 0xc4b8a0, 0xb0a593, 0xd2c8b4];
const GLASS = [0x6c8fae, 0x55789a, 0x7fa3bd, 0x486c8c, 0x8fb0c4, 0x4f6f86, 0x9db7c9];
const LEAVES = [0x5a8f45, 0x6a9a4a, 0x4a7f3d, 0xd98a2b, 0xc8572a, 0xe0b23a, 0xb5522c, 0xa8742a];
const AUTUMN = [0xd98a2b, 0xc8572a, 0xe0b23a, 0xb5522c, 0x9a7a2a];
const TAXI = 0xf2c11d;
const CARS = [TAXI, TAXI, TAXI, TAXI, TAXI, 0xe8e6df, 0x23262b, 0xb8bcc2, 0x2d6fb5, 0x6d7780];
const AWNINGS = [0x7a1f1a, 0x1f4a36, 0x1e3a66, 0x2b2b2d, 0x8a6a1e, 0xb8302a];
const SHOP = ['PIZZA', 'DELI', 'BAGELS', 'BODEGA', 'DINER', 'NEWS', 'SLICE', 'HOT DOGS', 'LAUNDRY', 'NAILS'];

// Broadway, as a line through four points: Columbus Circle, across Fifth by
// Madison Square, past Union Square, down to Bowling Green.
const BROADWAY = [
  [-150, -448],
  [50, -110],
  [126, 56],
  [10, 462],
];

// Named places the mission script and the HUD refer to.
export const PLACES = {
  start: { x: -340, z: -200, yaw: Math.PI / 2 },
  gate: { x: -305, z: -200 },
  times: { x: -50, z: -279 },
  empire: { x: 100, z: -140, top: 168 },
  chrysler: { x: 185, z: -252 },
  flatiron: { x: 72, z: -15 },
  wall: { x: 20, z: 430 },
  battery: { x: 0, z: 515 },
  bull: { x: 0, z: 548 },
  lake: { x: -75, z: -598 },
  columbus: { x: -150, z: -448 },
  bridge: { x: 300, z: 364 },
  arch: { x: 0, z: 124 },
  statue: { x: -170, z: 900 },
};

// Block i runs between avenues (i = -1 and 5 are the strips by the rivers),
// block j between streets.
function block(i, j) {
  let x0 = -250 + AVE * i + HX;
  let x1 = -150 + AVE * i - HX;
  if (i === -1) {
    x0 = ISLAND.x0 + 4;
    x1 = -250 - HX;
  } else if (i === 5) {
    x0 = 250 + HX;
    x1 = ISLAND.x1 - 4;
  }
  const z0 = j * ST + HZ;
  const z1 = (j + 1) * ST - HZ;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

function zoneOf(i, j) {
  if (i === -1 || i === 5) return 'edge';
  if ((i === 1 || i === 2) && j <= -9) return 'park';
  if (j >= 8 && i >= 1 && i <= 3) return 'arena';
  if (j >= 8) return 'battery';
  if (i === 0 && (j === 6 || j === 7)) return 'wtc';
  if (i === 3 && j === -3) return 'esb';
  if (i === 4 && j === -5) return 'chrysler';
  if (i === 3 && j === -8) return 'gap';
  if (i === 3 && (j === -2 || j === 1 || j === 5)) return 'square';
  if (i === 3 && j === -1) return 'flatiron';
  if (i === 2 && j === 2) return 'washington';
  if (i === 4 && j === 6) return 'bridge';
  if (i === 3 && j === 7) return 'nyse';
  if (i === 2 && j === 7) return 'wallplaza';
  if ((i === 1 || i === 2) && j >= -6 && j <= -4) return 'times';
  if (j <= -9) return 'uptown';
  if (j <= -3) return 'midtown';
  if (j >= 5) return 'fidi';
  if (j >= 3 && (i === 1 || i === 2)) return 'loft';
  return 'village';
}

// The pedestrian plazas of Times Square, between Seventh Avenue and Broadway.
const inTimesPlaza = (x, z, pad = 0) => x > -84 - pad && x < -14 + pad && z > -332 - pad && z < -224 + pad;

function nearBroadway(x, z, pad) {
  for (let k = 0; k < BROADWAY.length - 1; k++) {
    const [ax, az] = BROADWAY[k];
    const [bx, bz] = BROADWAY[k + 1];
    if (distToSegment(x, z, ax, az, bx, bz) < pad) return true;
  }
  return false;
}

function signPlane(text, w, h, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = fg;
  g.font = `900 ${Math.round(cv.height * 0.7)}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + cv.height * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

export function buildNewYork(scene) {
  const rng = mulberry32(1624); // the year New Amsterdam was founded
  const R = (a, b) => a + rng() * (b - a);
  const pickc = (arr) => arr[Math.floor(rng() * arr.length)];
  const city = new City(scene, { x0: -385, x1: 315, z0: -632, z1: 605 });
  const d = city.decor;
  const tree = (x, z, s = R(0.85, 1.3)) => city.addTree(x, z, s, pickc(LEAVES));

  // ---- land and water ----------------------------------------------------
  const rect = (x0, x1, z0, z1, y, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    city.group.add(m);
    return m;
  };
  const grid = { pitchX: AVE, pitchZ: ST, offX: OFFX, offZ: 0, halfX: HX, halfZ: HZ, pitch: AVE, half: HX, x0: ISLAND.x0, x1: ISLAND.x1, z0: ISLAND.z0, z1: ISLAND.z1 };
  rect(ISLAND.x0, ISLAND.x1, -3200, ISLAND.z1, 0, city.asphalt(COL.asphalt, grid));
  const shore = city.asphalt(COL.asphalt);
  rect(-3200, -430, -3200, ISLAND.z1, 0, shore); // New Jersey
  rect(410, 3200, -3200, ISLAND.z1, 0, shore); // Brooklyn
  rect(-3200, 3200, 1500, 3200, 0, groundMaterial(1, 0x5c6a4a)); // the far shore of the bay
  const bed = new THREE.MeshLambertMaterial({ color: 0x14303c });
  const waterMat = waterMaterial(0x1d4c5c);
  city.waterMat = waterMat;
  for (const [x0, x1, z0, z1] of [
    [-430, ISLAND.x0, -3200, ISLAND.z1],
    [ISLAND.x1, 410, -3200, ISLAND.z1],
    [-3200, 3200, ISLAND.z1, 1500],
  ]) {
    rect(x0, x1, z0, z1, -6, bed);
    rect(x0, x1, z0, z1, -1, waterMat).receiveShadow = false;
  }
  city.addWater(-430, ISLAND.x0, -Infinity, 640);
  city.addWater(ISLAND.x1, 410, -Infinity, 640);
  city.addWater(-3200, 3200, ISLAND.z1, 1500);
  // Sea walls round the island.
  d.box(1.2, 6.2, ISLAND.z1 + 3200, ISLAND.x0 - 0.6, -6, (ISLAND.z1 - 3200) / 2, 0x8d8a83);
  d.box(1.2, 6.2, ISLAND.z1 + 3200, ISLAND.x1 + 0.6, -6, (ISLAND.z1 - 3200) / 2, 0x8d8a83);
  d.box(ISLAND.x1 - ISLAND.x0 + 1.2, 6.2, 1.2, (ISLAND.x0 + ISLAND.x1) / 2, -6, ISLAND.z1 + 0.6, 0x8d8a83);
  d.box(1.2, 6.2, ISLAND.z1 + 3200, -430.6, -6, (ISLAND.z1 - 3200) / 2, 0x8d8a83);
  d.box(1.2, 6.2, ISLAND.z1 + 3200, 410.6, -6, (ISLAND.z1 - 3200) / 2, 0x8d8a83);
  city.addSlab(-3200, -3200, -430, ISLAND.z1, 0x86857c, 0.2);
  city.addSlab(410, -3200, 3200, ISLAND.z1, 0x8a867c, 0.2);
  city.addSlab(ISLAND.x0, -3200, ISLAND.x1, ISLAND.z0 - 20, 0x86857c, 0.2);

  // ---- Broadway ------------------------------------------------------------
  for (let k = 0; k < BROADWAY.length - 1; k++) {
    const [ax, az] = BROADWAY[k];
    const [bx, bz] = BROADWAY[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(-(bz - az), bx - ax);
    d.box(len + 18, 0.08, 18, (ax + bx) / 2, 0.3, (az + bz) / 2, COL.asphalt, rot);
    d.box(len, 0.06, 0.5, (ax + bx) / 2, 0.36, (az + bz) / 2, 0xe9e4d4, rot);
  }
  city.mapShapes = BROADWAY.slice(1).map(([bx, bz], k) => ({ type: 'line', ax: BROADWAY[k][0], az: BROADWAY[k][1], bx, bz, w: 18, color: '#4a4f5c' }));

  // ---- lane paint on the avenues and the big crosstown streets -------------
  const paved = (x, z) => !inTimesPlaza(x, z) && !(x > PARK.x0 - 4 && x < PARK.x1 + 4 && z < PARK.z1 + 4) && !(z > 452 && x > -142 && x < 142) && !(x > -242 && x < -158 && z > 340 && z < 444);
  for (let k = 0; k < 6; k++) {
    const x = -250 + k * AVE;
    for (let z = ISLAND.z0 + 6; z < ISLAND.z1 - 6; z += 12) {
      if (Math.abs(((z % ST) + ST) % ST) < 12 || Math.abs(((z % ST) + ST) % ST) > ST - 12) continue;
      if (paved(x, z)) city.addDash(x, z, k === 3 ? 10 : 4.5, false, k === 3 ? 0xe2b93b : 0xe9e4d4, k === 3 ? 0.7 : 0.5);
    }
  }
  for (const m of [-7, -4, -3, -1, 1, 3, 5]) {
    const z = m * ST;
    for (let x = ISLAND.x0 + 6; x < ISLAND.x1 - 6; x += 12) {
      const u = (((x - OFFX) % AVE) + AVE) % AVE;
      if (u < 16 || u > AVE - 16) continue;
      if (paved(x, z)) city.addDash(x, z, 4.5, true, 0xe9e4d4, 0.5);
    }
  }

  // ---- helpers for buildings ------------------------------------------------
  // A tower with New York's setbacks: the taller it is, the more times it steps in.
  const tower = (style, x, z, w, dd, h, color, o = {}) => {
    const tiers = [];
    let body = h;
    if (h > 95) {
      body = h * 0.55;
      tiers.push({ w: w * 0.8, d: dd * 0.8, h: h * 0.22 });
      tiers.push({ w: w * 0.6, d: dd * 0.6, h: h * 0.14 });
      tiers.push({ w: w * 0.4, d: dd * 0.4, h: h * 0.09 });
    } else if (h > 60) {
      body = h * 0.72;
      tiers.push({ w: w * 0.74, d: dd * 0.74, h: h * 0.2 });
      if (rng() < 0.5) tiers.push({ w: w * 0.5, d: dd * 0.5, h: h * 0.08 });
    }
    return city.addBuilding(style, x, z, w, dd, body, {
      color,
      tiers,
      fixed: !!o.fixed,
      spire: o.spire ? { r: Math.min(w, dd) * 0.18, h: h * 0.18, color: o.spireColor ?? 0x8a939c } : null,
    });
  };
  const blocked = (x, z, r) => nearBroadway(x, z, r + 10) || inTimesPlaza(x, z, r);

  // The things bolted onto a city building: an awning, a blade sign, a water
  // tower on the roof. sz says which way the street is.
  const dress = (bld, sz, brick) => {
    if (sz && rng() < 0.6) city.addAttachment(bld, R(-0.2, 0.2) * bld.w, sz * (bld.d / 2 + 1.1), Math.min(bld.w - 1, R(5, 9)), 2.4, 0.3, 3.5, pickc(AWNINGS));
    if (sz && rng() < 0.25) city.addAttachment(bld, bld.w / 2 - 1.4, sz * (bld.d / 2 + 0.9), 0.4, 1.7, R(5, 8), 5.5, pickc(AWNINGS));
    if (brick && rng() < 0.55 && bld.tiers.length === 0) {
      // A timber water tank on steel legs: the New York roof.
      const tx = R(-0.2, 0.2) * bld.w;
      const tz = R(-0.2, 0.2) * bld.d;
      const top = bld.top;
      city.addAttachment(bld, tx, tz, 2.8, 2.8, 2.4, top, 0x3a3d40);
      city.addAttachment(bld, tx, tz, 3.6, 3.6, 3.8, top + 2.4, 0x6a4e37);
      city.addAttachment(bld, tx, tz, 2.6, 2.6, 1.0, top + 6.2, 0x4a4038);
    }
  };
  // Zig-zag fire escapes on a tenement's street front.
  const fireEscape = (bld, sz) => {
    const floors = Math.floor(bld.h / 3.6);
    const fw = Math.min(bld.w * 0.6, 6.5);
    for (let f = 1; f < floors; f++) city.addAttachment(bld, 0, sz * (bld.d / 2 + 0.75), fw, 1.4, 0.22, f * 3.6, 0x1f2124);
    for (const s of [-1, 1]) city.addAttachment(bld, s * fw * 0.5, sz * (bld.d / 2 + 1.35), 0.16, 0.16, (floors - 1) * 3.6 - 2.6, 3.6, 0x1f2124);
  };

  const parkTrees = (b, n, clear = 12) => {
    for (let k = 0; k < n; k++) {
      const x = R(b.x0 + 4, b.x1 - 4);
      const z = R(b.z0 + 4, b.z1 - 4);
      if (Math.hypot(x - b.cx, z - b.cz) > clear && !nearBroadway(x, z, 12)) tree(x, z);
    }
  };
  const fountain = (x, z, r, jet) => {
    d.cyl(r, 1.3, x, 0.3, z, 0xbdb6a6, 24);
    d.cyl(r + 0.6, 0.35, x, 0.3, z, 0xa9a294, 24);
    d.cyl(r - 1.2, 0.3, x, 1.4, z, 0x2f5f78, 20);
    d.cyl(r * 0.3, 1.9, x, 0.3, z, 0xa9a294, 12, 0.78);
    d.cyl(r * 0.2, 1.5, x, 2.2, z, 0xb7b0a2, 12, 0.6);
    city.addFountain(x, 4.0, z, r, jet, 1.8);
  };

  // ---- the blocks ------------------------------------------------------------
  const special = {};
  for (let j = -11; j <= 9; j++) {
    for (let i = -1; i <= 5; i++) {
      const b = block(i, j);
      if (b.z1 < ISLAND.z0 || b.z0 > ISLAND.z1) continue;
      const zone = zoneOf(i, j);
      if (zone === 'park' || zone === 'arena') continue;
      if (zone === 'edge') {
        // Hudson River Park and the East River esplanade.
        city.addSlab(b.x0, b.z0 - HZ, b.x1, b.z1 + HZ, COL.plaza, 0.26);
        city.addSlab(b.x0 + 2, b.z0, b.x1 - (i === -1 ? 12 : 4), b.z1, COL.grass, 0.3);
        for (let z = b.z0 + 4; z < b.z1; z += 13) if (Math.abs(z - PLACES.gate.z) > 30) tree(b.cx - (i === -1 ? 5 : 0), z, R(0.8, 1.1));
        continue;
      }
      if (zone === 'square' || zone === 'washington') {
        city.addSlab(b.x0, b.z0, b.x1, b.z1, COL.grass, 0.32);
        city.addLeaves(b.x0, b.z0, b.x1, b.z1, 14, AUTUMN);
        parkTrees(b, 22, zone === 'washington' ? 16 : 10);
        special[zone + j] = b;
        continue;
      }
      if (zone === 'wallplaza' || zone === 'bridge') {
        city.addSlab(b.x0, b.z0, b.x1, b.z1, COL.pavers, 0.3);
        if (zone === 'wallplaza') for (const [x, z] of [[b.x0 + 5, b.z0 + 5], [b.x1 - 5, b.z0 + 5], [b.x0 + 5, b.z1 - 5], [b.x1 - 5, b.z1 - 5]]) tree(x, z, 0.8);
        continue;
      }
      city.addSlab(b.x0, b.z0, b.x1, b.z1, COL.sidewalk);
      if (zone === 'wtc' || zone === 'esb' || zone === 'chrysler' || zone === 'flatiron' || zone === 'nyse' || zone === 'gap') {
        special[zone] = b;
        continue;
      }

      if (zone === 'times') {
        // Tall towers wrapped in screens, facing the plazas.
        for (const [ox, oz] of [[-20, -10], [20, -10], [-20, 10], [20, 10]]) {
          const w = R(26, 34);
          const dd = R(16, 19);
          const x = b.cx + ox;
          const z = b.cz + oz;
          if (blocked(x, z, Math.max(w, dd) / 2)) continue;
          const h = R(55, 120);
          const glass = rng() < 0.5;
          const bld = tower(glass ? 'glass' : 'office', x, z, w, dd, h, glass ? pickc(GLASS) : pickc(STONE));
          const toward = x < -50 ? 2 : 3;
          const faceW = bld.d;
          for (let k = 0; k < 3; k++) {
            const y = 5 + k * R(11, 15);
            if (y + 10 > bld.h) break;
            city.addBillboard(bld, toward, 0, y, Math.max(6, faceW - 2), R(7, 10), Math.floor(rng() * 8));
          }
          city.addBillboard(bld, oz < 0 ? 1 : 0, 0, R(8, 14), Math.min(bld.w - 2, 20), R(8, 12), Math.floor(rng() * 8));
        }
        continue;
      }

      if (zone === 'midtown' || zone === 'fidi' || zone === 'uptown' || zone === 'battery') {
        const tall = zone === 'fidi' ? R(80, 170) : zone === 'midtown' ? R(70, 160) : zone === 'uptown' ? R(40, 80) : R(30, 90);
        const kind = rng();
        const style = () => {
          const r = rng();
          if (zone === 'uptown') return r < 0.6 ? 'stone' : 'brick';
          return r < 0.45 ? 'office' : r < 0.8 ? 'glass' : 'stone';
        };
        const col = (s) => (s === 'glass' ? pickc(GLASS) : s === 'brick' ? pickc(BRICK) : pickc(STONE));
        if (kind < 0.35) {
          // One big tower on the whole block.
          const s = style();
          const w = R(54, 66);
          if (!blocked(b.cx, b.cz, w / 2)) tower(s, b.cx, b.cz, w, R(30, 36), tall, col(s), { spire: rng() < 0.25 });
        } else if (kind < 0.7) {
          for (const ox of [-20, 20]) {
            const s = style();
            const w = R(30, 36);
            if (!blocked(b.cx + ox, b.cz, w / 2)) tower(s, b.cx + ox, b.cz, w, R(30, 36), tall * R(0.55, 1), col(s));
          }
        } else {
          for (const [ox, oz] of [[-20, -10], [20, -10], [-20, 10], [20, 10]]) {
            const s = style();
            const w = R(30, 36);
            if (blocked(b.cx + ox, b.cz + oz, w / 2)) continue;
            const bld = tower(s, b.cx + ox, b.cz + oz, w, R(16, 19), tall * R(0.35, 0.8), col(s));
            dress(bld, oz < 0 ? -1 : 1, s === 'brick');
          }
        }
        continue;
      }

      // Lofts (cast-iron SoHo) and tenements (the Village, Chelsea, the Lower
      // East Side): two rows of narrow buildings back to back.
      const loft = zone === 'loft';
      for (const row of [-1, 1]) {
        let x = b.x0;
        let first = true;
        while (x < b.x1 - 6) {
          const w = Math.min(loft ? R(14, 22) : R(8, 13), b.x1 - x);
          const cx = x + w / 2;
          const cz = b.cz + row * 10;
          x += w;
          if (blocked(cx, cz, w / 2)) {
            first = false;
            continue;
          }
          const brown = !loft && rng() < 0.22;
          const h = loft ? R(18, 28) : brown ? R(11, 15) : R(13, 24);
          const style = loft ? 'stone' : 'brick';
          const color = loft ? pickc([0xd8d0bf, 0xcfc6ae, 0xbcb5a8, 0xe0d6c2, 0xa9a196]) : brown ? 0x6b4a3a : pickc(BRICK);
          const bld = city.addBuilding(style, cx, cz, w - 0.3, 19.5, h, { color, hp: loft ? 36 : 22 });
          if (brown) city.addAttachment(bld, 0, row * (bld.d / 2 + 1.6), 3.2, 3.2, 1.9, 0, 0x7a5a48); // the stoop
          else if (!loft && rng() < 0.5) fireEscape(bld, row);
          dress(bld, row, !loft);
          if (rng() < 0.28) city.addSign(bld, row > 0 ? 0 : 1, 0, 3.4, Math.min(w - 1.5, 8), 1.7, pickc(SHOP));
          if ((first || x >= b.x1 - 6) && rng() < 0.2) city.addMural(bld, first ? 3 : 2, 0, 3, 15, Math.min(10, h - 4), Math.floor(rng() * 4), rng());
          first = false;
        }
      }
    }
  }

  // Parked cars along the streets: mostly taxis, of course.
  for (let j = -8; j <= 7; j++) {
    for (let i = 0; i <= 4; i++) {
      const zone = zoneOf(i, j);
      if (zone === 'park' || zone === 'arena' || zone === 'times') continue;
      const b = block(i, j);
      for (let t = b.x0 + 5; t < b.x1 - 5; t += 9) {
        if (rng() < 0.2 && !nearBroadway(t, b.z0 - 2.4, 14)) city.addCar(t, b.z0 - 2.4, Math.PI / 2, pickc(CARS));
        if (rng() < 0.2 && !nearBroadway(t, b.z1 + 2.4, 14)) city.addCar(t, b.z1 + 2.4, -Math.PI / 2, pickc(CARS));
      }
    }
  }

  // Lamps on the kerbs, signals at the junctions, hydrants and bins.
  for (let j = -8; j <= 7; j++) {
    for (let i = 0; i <= 4; i++) {
      const zone = zoneOf(i, j);
      if (zone === 'park' || zone === 'arena') continue;
      const b = block(i, j);
      for (const [x, z, rot] of [[b.cx - 20, b.z0 - 0.5, Math.PI / 2], [b.cx + 20, b.z1 + 0.5, -Math.PI / 2]]) {
        if (!nearBroadway(x, z, 12) && !inTimesPlaza(x, z)) city.addProp('lamp', x, z, rot);
      }
      if (zone !== 'square' && zone !== 'washington') {
        city.addProp('hydrant', b.x0 + 1.0, b.z0 + R(4, 8), 0);
        city.addProp('bin', b.x1 - 1.2, b.z1 - R(3, 7), 0);
      } else {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          city.addProp('bench', b.cx + Math.sin(a) * 10, b.cz + Math.cos(a) * 10, a + Math.PI);
        }
      }
    }
  }
  for (let k = 0; k < 6; k++) {
    for (let m = -10; m <= 8; m++) {
      const x = -250 + k * AVE;
      const z = m * ST;
      if (!paved(x, z) || nearBroadway(x, z, 26) || z < ISLAND.z0 + 10) continue;
      city.addProp('signal', x + HX + 0.8, z + HZ + 0.8, Math.PI);
      city.addProp('signal', x - HX - 0.8, z - HZ - 0.8, 0);
    }
  }

  // ---- Central Park ----------------------------------------------------------
  {
    const P = PARK;
    city.addSlab(P.x0, P.z0 - 200, P.x1, P.z1, COL.grass, 0.32);
    // A low stone wall round the edge, open at the gates.
    for (const [x0, x1, z] of [[P.x0, P.x1, P.z1]]) {
      for (let x = x0; x < x1; x += 24) d.box(18, 1.4, 0.9, x + 9, 0.3, z - 0.6, 0xa49c8a);
    }
    for (const x of [P.x0, P.x1]) for (let z = P.z0; z < P.z1; z += 24) d.box(0.9, 1.4, 18, x + (x === P.x0 ? 0.6 : -0.6), 0.3, z + 9, 0xa49c8a);
    // The Mall: a straight promenade under elms, down to Bethesda Terrace.
    const ma = { ax: -32, az: -466, bx: -58, bz: -556 };
    const mlen = Math.hypot(ma.bx - ma.ax, ma.bz - ma.az);
    const mrot = Math.atan2(-(ma.bz - ma.az), ma.bx - ma.ax);
    d.box(mlen, 0.08, 9, (ma.ax + ma.bx) / 2, 0.33, (ma.az + ma.bz) / 2, COL.plaza, mrot);
    for (let t = 8; t < mlen - 6; t += 10) {
      const x = ma.ax + ((ma.bx - ma.ax) * t) / mlen;
      const z = ma.az + ((ma.bz - ma.az) * t) / mlen;
      const ux = (ma.bx - ma.ax) / mlen;
      const uz = (ma.bz - ma.az) / mlen;
      for (const s of [-1, 1]) tree(x - uz * s * 8, z + ux * s * 8, 1.25);
      if (Math.round(t / 10) % 2 === 0) for (const s of [-1, 1]) city.addProp('bench', x - uz * s * 5.2, z + ux * s * 5.2, mrot + (s > 0 ? 0 : Math.PI));
    }
    // Bethesda Terrace and its fountain, on the shore of the Lake.
    d.box(30, 0.5, 14, -62, 0.32, -566, COL.plaza);
    for (let k = 0; k < 3; k++) d.box(14 - k * 3, 0.5, 2, -62, 0.32 + k * 0.4, -558 - k * 2, 0xbfb6a4);
    fountain(-62, -566, 6, 6);
    // The Lake and the Pond.
    const pond = (x, z, r) => {
      city.addPond(x, z, r);
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), waterMat);
      m.position.set(x, 0.36, z);
      city.group.add(m);
    };
    pond(PLACES.lake.x, PLACES.lake.z, 24);
    pond(-42, -608, 17);
    pond(18, -480, 13);
    // Rocky outcrops of Manhattan schist, one big enough to stand on.
    const rr = mulberry32(1858);
    const rock = (x, z, s) => d.add(GEO.ico(0), pickc([0x7c7f86, 0x8a857b, 0x6f726f]), x, s * 0.35, z, s * 1.4, s * 0.8, s * 1.1, rr() * 6, rr() * 0.4, rr() * 0.4);
    for (const [x, z, s] of [[-105, -495, 8], [-96, -500, 5], [-112, -489, 5], [-10, -520, 4], [-120, -600, 6], [20, -600, 5], [-30, -632, 6]]) rock(x, z, s);
    city.addCollider(-105, -495, 16, 12, 5);
    // Belvedere Castle on its rock at the north end.
    d.box(14, 9, 12, -20, 0, -628, 0x8c877c);
    d.cyl(3.4, 16, -14, 0, -624, 0x8c877c, 10);
    d.cone(4, 5, -14, 16, -624, COL.slate, 10);
    for (let k = 0; k < 5; k++) d.box(1.6, 1.4, 1.2, -26 + k * 3, 9, -622, 0x8c877c);
    city.addCollider(-20, -628, 14, 12, 9);
    // Trees everywhere else.
    for (let k = 0; k < (detail.low ? 110 : 170); k++) {
      const x = R(P.x0 + 4, P.x1 - 4);
      const z = R(P.z0 + 4, P.z1 - 4);
      if (Math.hypot(x - PLACES.lake.x, z - PLACES.lake.z) < 30 || Math.hypot(x + 42, z + 608) < 22 || Math.hypot(x - 18, z + 480) < 18) continue;
      if (x < -70 && x > -135 && z > -560 && z < -480) continue; // Sheep Meadow stays open
      if (distToSegment(x, z, ma.ax, ma.az, ma.bx, ma.bz) < 12) continue;
      tree(x, z);
    }
    city.addLeaves(P.x0, P.z0, P.x1, P.z1, 60, AUTUMN);
    city.addFlock(-62, -556, 18);
  }

  // ---- Columbus Circle and Grand Army Plaza -------------------------------
  {
    const C = PLACES.columbus;
    d.cyl(20, 0.12, C.x, 0.3, C.z, COL.asphalt, 32);
    d.cyl(12, 0.14, C.x, 0.4, C.z, COL.plaza, 28);
    d.cyl(1.6, 22, C.x, 0.4, C.z, 0xe8e2d4, 12);
    d.cyl(2.6, 2, C.x, 0.4, C.z, 0xbdb6a6, 12);
    const g = special.gap;
    city.addSlab(g.x0, g.z0, g.x0 + 32, g.z1, COL.plaza, 0.3);
    fountain(g.x0 + 16, g.cz, 8, 8);
    // A French château of a hotel with a green copper roof.
    city.addBuilding('stone', g.x1 - 22, g.cz, 40, 36, 50, { color: 0xebe4d6, tiers: [{ w: 36, d: 32, h: 9, style: 'plain', color: 0x5f8a6e }] });
  }

  // ---- Times Square ----------------------------------------------------------
  {
    city.addSlab(-84, -332, -14, -224, COL.pavers, 0.3);
    // The red steps: a glowing grandstand facing south down the square.
    const sx = -50;
    const sz = -312;
    for (let k = 0; k < 6; k++) d.box(24, 0.8 + k * 0.8, 20 - k * 3.2, sx, 0.3, sz - k * 1.6, 0xc8201e);
    city.addHeightZone(sx, sz, 24, 20, 0, (lx, lz) => 1.1 + 0.8 * Math.min(5, Math.floor((10 - lz) / 3.2)));
    for (const [x, z] of [[-70, -240], [-30, -240], [-72, -320], [-28, -320]]) city.addProp('bench', x, z, 0);
    city.addFlock(-50, -258, 18);
  }

  // ---- the Empire State Building --------------------------------------------
  const esb = (() => {
    const E = PLACES.empire;
    const lime = 0xcfc6ae;
    const b = city.addBuilding('office', E.x, E.z, 74, 36, 22, {
      fixed: true,
      color: lime,
      roof: false,
      tiers: [
        { w: 50, d: 30, h: 88 },
        { w: 40, d: 24, h: 20 },
        { w: 32, d: 19, h: 16 },
        { w: 24, d: 15, h: 12 },
        { w: 16, d: 11, h: 10 },
      ],
    });
    // The mooring mast and the antenna.
    const m = new MeshBuilder();
    m.cyl(5.4, 1.2, 0, E.top, 0, lime, 16);
    m.cyl(4.2, 12, 0, E.top + 1.2, 0, lime, 16, 0.92);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m.box(0.9, 10, 0.4, Math.sin(a) * 4.0, E.top + 2, Math.cos(a) * 4.0, 0x2a3038, a);
    }
    m.cyl(3.0, 6, 0, E.top + 13.2, 0, 0xdcd4c0, 12, 0.8);
    m.dome(2.5, 2.6, 0, E.top + 19.2, 0, 0xdcd4c0, 12);
    m.cyl(1.0, 7, 0, E.top + 21.6, 0, 0xb9b2a3, 8, 0.7);
    m.cyl(0.4, 24, 0, E.top + 28.6, 0, 0x9aa0a6, 6, 0.4);
    // Art deco wings at the setbacks.
    for (const s of [-1, 1]) m.box(6, 18, 6, s * 21, 110, 0, lime);
    // A gold canopy over the Fifth Avenue door.
    m.box(1.6, 1.0, 12, -37.6, 6.5, 0, 0xc9a23a);
    m.box(0.6, 6, 6, -37.2, 0.3, 0, 0x2a2420);
    m.place(E.x, E.z);
    d.merge(m);
    return b;
  })();

  // ---- the Chrysler Building ------------------------------------------------
  const chrysler = (() => {
    const C = PLACES.chrysler;
    const steel = 0xcfd3d8;
    const b = city.addBuilding('office', C.x, C.z, 36, 36, 64, {
      fixed: true,
      color: 0xd9d6cf,
      roof: false,
      tiers: [
        { w: 28, d: 28, h: 40 },
        { w: 22, d: 22, h: 22 },
      ],
    });
    const top = 126;
    const m = new MeshBuilder();
    // The terraced crown of stainless-steel arches, each with its windows.
    for (let k = 0; k < 6; k++) {
      const r = 11 - k * 1.65;
      const y = top + k * 4.2;
      m.cyl(r, 4.2, 0, y, 0, steel, 16, 0.86);
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2 + 0.2;
        m.cone(0.75, 2.4, Math.sin(a) * r * 0.9, y + 0.6, Math.cos(a) * r * 0.9, 0x1f252c, 3, a);
      }
    }
    m.cone(1.2, 34, 0, top + 25, 0, steel, 8);
    // The eagle gargoyles at the corners of the setback.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(1.6, 1.2, 5, sx * 13, 104, sz * 13, steel, Math.atan2(sx, sz));
    m.place(C.x, C.z);
    d.merge(m);
    city.addBuilding('office', 222, C.z, 30, 34, 84, { color: pickc(STONE), tiers: [{ w: 22, d: 26, h: 18 }] });
    return b;
  })();

  // ---- the Flatiron ----------------------------------------------------------
  {
    const tri = new THREE.Shape();
    const T = [63.5, -47];
    const SW = [63, -9];
    const SE = [81, -9];
    tri.moveTo(T[0], -T[1]);
    tri.lineTo(SW[0], -SW[1]);
    tri.lineTo(SE[0], -SE[1]);
    tri.closePath();
    const H = 46;
    const geo = new THREE.ExtrudeGeometry(tri, { depth: H, bevelEnabled: false }).rotateX(-Math.PI / 2);
    d.add(geo, 0xd8c8a8, 0, 0, 0);
    const cap = new THREE.ExtrudeGeometry(tri, { depth: 1.2, bevelEnabled: false }).rotateX(-Math.PI / 2);
    d.add(cap, 0xc2b293, 0, H, 0);
    // Rows of windows on all three faces.
    const dark = 0x232a31;
    const face = (ax, az, bx, bz, nx, nz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(-(bz - az), bx - ax);
      const n = Math.floor(len / 2.2);
      for (let f = 0; f < 12; f++) {
        const y = 3.4 + f * 3.55;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          d.box(1.1, 1.9, 0.3, ax + (bx - ax) * t + nx * 0.12, y, az + (bz - az) * t + nz * 0.12, dark, rot);
        }
      }
    };
    face(T[0], T[1], SW[0], SW[1], -1, 0);
    face(SW[0], SW[1], SE[0], SE[1], 0, 1);
    face(T[0], T[1], SE[0], SE[1], 0.9, -0.42);
    for (const [cx, cz, w, dd] of [[66.2, -40.6, 6.4, 12.7], [69.1, -27.9, 12.2, 12.7], [72, -15.3, 18, 12.6]]) city.addCollider(cx, cz, w, dd, H);
    // The rest of the block east of Broadway: older office buildings.
    const b = special.flatiron;
    for (const x of [112, 130]) city.addBuilding('stone', x, b.cz, 16, 34, R(30, 44), { color: pickc(STONE) });
  }

  // ---- One World Trade Center and the plaza round it -----------------------
  {
    const b = special.wtc;
    city.addSlab(b.x0, b.z0 - ST, b.x1, b.z1, COL.pavers, 0.3);
    const tiers = [];
    for (let k = 0; k < 7; k++) tiers.push({ w: 38 - k * 4, d: 38 - k * 4, h: 20 });
    city.addBuilding('glass', -200, 372, 42, 42, 26, { fixed: true, color: 0x7f9fb6, tiers, spire: { r: 1.4, h: 60, color: 0xc9ced4 } });
    for (let k = 0; k < 18; k++) {
      const x = R(b.x0 + 4, b.x1 - 4);
      const z = R(b.z0 - ST + 4, b.z1 - 4);
      if (Math.abs(x + 200) < 26 && Math.abs(z - 372) < 26) continue;
      if (Math.abs(x + 178) < 18 && Math.abs(z - 425) < 17) continue;
      tree(x, z, 0.9);
    }
    city.addBuilding('glass', -178, 425, 26, 24, 110, { color: 0x6c8fae, tiers: [{ w: 20, d: 18, h: 20 }] });
  }

  // ---- Wall Street and the Exchange -----------------------------------------
  {
    const b = special.nyse;
    city.addBuilding('stone', 98, 418, 52, 34, 30, { fixed: true, color: 0xd8d2c4 });
    const m = new MeshBuilder();
    const z = 435.6;
    for (let k = 0; k < 6; k++) {
      const x = 80 + k * 7.2;
      m.box(3.2, 1, 3.2, x, 0.3, z + 1.2, 0xcfc7b4);
      m.cyl(1.4, 17, x, 1.3, z + 1.2, 0xe6e0cf, 12, 0.9);
      m.cyl(1.4, 1.2, x, 18.3, z + 1.2, 0xe6e0cf, 12, 1.4);
    }
    m.box(42, 3.2, 4.6, 98, 19.5, z + 1.2, 0xd8d2c4);
    m.prism(42, 6, 4.6, 98, 22.7, z + 1.2, 0xd8d2c4);
    m.prism(36, 4.2, 0.6, 98, 23.3, z + 3.6, 0xbfb6a2);
    d.merge(m);
    void b;
    city.addFlock(10, 425, 14);
  }

  // ---- Washington Square and its arch ----------------------------------------
  {
    const A = PLACES.arch;
    const white = 0xeae5d8;
    for (const s of [-1, 1]) d.box(5, 19, 6, A.x + s * 7, 0.3, A.z, white);
    d.box(19, 7, 6, A.x, 19.3, A.z, white);
    d.box(20, 1.0, 6.6, A.x, 26.3, A.z, 0xd8d2c4);
    d.box(20.4, 1.6, 7, A.x, 27.3, A.z, white);
    fountain(A.x, A.z + 18, 8, 7);
    city.addFlock(A.x + 10, A.z + 24, 16);
  }

  // ---- squares ---------------------------------------------------------------
  for (const key of ['square-2', 'square1', 'square5']) {
    const b = special[key];
    if (!b) continue;
    fountain(b.cx + 6, b.cz, 5, 5);
    city.addFlock(b.cx - 10, b.cz, 12);
  }

  // ---- Battery Park: the arena ------------------------------------------------
  {
    const x0 = -139;
    const x1 = 139;
    const z0 = 456;
    const z1 = ISLAND.z1;
    city.addSlab(x0, z0, x1, z1, COL.grass, 0.3);
    city.addSlab(x0 + 10, z0 + 14, x1 - 10, z1 - 10, COL.pavers, 0.32);
    city.addSlab(-30, z0, 50, z0 + 18, COL.plaza, 0.33); // Bowling Green's paving
    for (let x = x0 + 6; x < x1; x += 14) {
      tree(x, z0 + 5, 1.0);
      tree(x, z1 - 4, 0.95);
    }
    for (let z = z0 + 18; z < z1 - 8; z += 14) {
      tree(x0 + 5, z, 1.0);
      tree(x1 - 5, z, 1.0);
    }
    // Castle Clinton, the old round fort.
    d.cyl(13, 9, -104, 0.3, 538, 0xb98a68, 24);
    d.cyl(13.6, 0.8, -104, 9.3, 538, 0x9c7458, 24);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      d.box(1.4, 3, 0.6, -104 + Math.sin(a) * 13.1, 2.5, 538 + Math.cos(a) * 13.1, 0x2a2420, a);
    }
    city.addCollider(-104, 538, 22, 22, 9.3);
    // The ferry terminal at the water's edge.
    city.addBuilding('stone', 104, 552, 40, 20, 16, { fixed: true, color: 0x7e8b90, roof: false });
    d.box(34, 6, 0.5, 104, 8, 541.8, 0x2a3138);
    for (let x = 0; x < 2; x++) city.addProp('lamp', -60 + x * 120, 490, 0);
    city.addFlock(20, 500, 18);
  }

  // ---- the container pier: where New York begins -----------------------------
  {
    const g = PLACES.gate;
    const red = 0xb03a2a;
    const pz = g.z;
    // The pier itself, and the others up and down the river.
    const pier = (z, w) => {
      city.addBridge(-372, ISLAND.x0, z - w / 2, z + w / 2);
      d.box(72, 1.2, w, -336, -1, z, 0x7a6a58);
      for (let x = -370; x < -300; x += 9) for (const s of [-1, 1]) d.cyl(0.7, 5, x, -6, z + s * (w / 2 - 1), 0x4a4038, 6);
    };
    pier(pz, 44);
    for (const z of [-424, -312, -88, 24, 136, 248]) pier(z, 24);
    // An open-top container big enough for an ape.
    const wall = (cx, cz, w, dd) => {
      d.box(w, 24, dd, cx, 0.2, cz, red);
      city.addCollider(cx, cz, w, dd, 24.2);
    };
    wall(-331, pz - 11, 52, 1.6);
    wall(-331, pz + 11, 52, 1.6);
    wall(-357, pz, 1.6, 22);
    // Corrugated sides and the corner castings.
    for (let x = -356; x <= -306; x += 2.6) for (const s of [-1, 1]) d.box(0.7, 23, 0.4, x, 0.6, pz + s * 11.9, 0x9a3224);
    for (const x of [-357, -305]) for (const s of [-1, 1]) for (const y of [0.2, 22.2]) d.box(2, 2, 2, x, y, pz + s * 11, 0x5a2a22);
    for (const s of [-1, 1]) {
      const sign = signPlane('FRAGILE', 30, 7, '#b03a2a', '#f3eee4');
      sign.position.set(-331, 15, pz + s * 12.15);
      sign.rotation.y = s > 0 ? 0 : Math.PI;
      city.group.add(sign);
      const arrows = signPlane('THIS WAY UP', 20, 3.6, '#b03a2a', '#f3eee4');
      arrows.position.set(-331, 8, pz + s * 12.15);
      arrows.rotation.y = s > 0 ? 0 : Math.PI;
      city.group.add(arrows);
    }
    // The doors: the gate the ape punches through. Their bars fall with them.
    city.gate = city.addBuilding('plain', -305, pz, 2.4, 22, 22, { color: 0x9a3224, hp: 26 });
    for (const f of [-1, 1]) {
      for (const oz of [-7, -2.5, 2.5, 7]) city.addAttachment(city.gate, f * 1.4, oz, 0.35, 0.35, 21, 0.4, 0xc9c3b6);
      for (const oz of [-5, 5]) city.addAttachment(city.gate, f * 1.5, oz, 0.5, 1.6, 0.5, 10, 0xe2b93b);
    }
    // A container ship tied up alongside.
    const hz = pz - 44;
    d.box(110, 8, 20, -372, -6, hz, 0x2b2f36);
    d.box(110, 1.2, 20.4, -372, 2, hz, 0x8a2a22);
    d.box(14, 14, 18, -420, 2, hz, 0xe8e4da);
    d.box(10, 3, 14, -420, 16, hz, 0xe8e4da);
    const boxes = [0xb03a2a, 0x2f6aa3, 0x3f7a4a, 0xe2b93b, 0x8a8f96, 0xc0612a];
    for (let x = -400; x < -322; x += 7) for (let y = 0; y < 3; y++) if (rng() < 0.85) d.box(6.6, 3.2, 17, x, 3.2 + y * 3.3, hz, pickc(boxes));
  }

  // ---- the Brooklyn Bridge -----------------------------------------------------
  {
    const z = PLACES.bridge.z;
    const c = COL.bridge;
    const dark = 0x1d2124;
    // A stone viaduct from street level up to the deck, which the ape can walk.
    d.box(82, 3, 18, 240.66, 6.07, z, c, 0, 0, Math.atan2(18, 80));
    for (const x of [218, 238, 258]) d.box(5, ((x - 200) / 80) * 18 - 1, 16, x, 0, z, c);
    d.box(220, 2.6, 18, 386, 15.4, z, 0x6e6a62);
    d.box(220, 0.3, 14, 386, 18, z, COL.asphalt);
    for (const s of [-1, 1]) d.box(220, 2.4, 0.6, 386, 18, z + s * 8.6, 0x5a5650);
    city.addHeightZone(257.5, z, 115, 12, 0, (lx) => {
      const x = 257.5 + lx;
      return x < 280 ? Math.max(0, ((x - 200) / 80) * 18) : 18;
    });
    city.addBridge(268, 480, z - 7, z + 7);
    // The two Gothic towers, each with a pair of pointed arches.
    for (const tx of [312, 394]) {
      d.box(15, 74, 30, tx, -6, z, c);
      d.box(17, 2, 32, tx, 66, z, 0xa89a80);
      for (const s of [-1, 1]) {
        d.box(15.4, 24, 6.4, tx, 16, z + s * 6.5, dark);
        d.prism(6.4, 5, 15.4, tx, 40, z + s * 6.5, dark, Math.PI / 2);
        d.box(15.4, 8, 2.4, tx, 52, z + s * 9, 0x9c8e74);
      }
    }
    // Cables: the main cables, the hangers, and the diagonal stays.
    const cable = (x0, y0, x1, y1, sag) => {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const p = (t) => [lerp(x0, x1, t), lerp(y0, y1, t) - sag * 4 * t * (1 - t)];
        const [xa, ya] = p(k / n);
        const [xb, yb] = p((k + 1) / n);
        const len = Math.hypot(xb - xa, yb - ya);
        for (const s of [-1, 1]) {
          d.box(len + 0.3, 0.7, 0.7, (xa + xb) / 2, (ya + yb) / 2 - 0.35, z + s * 8, 0x6e6a62, 0, 0, Math.atan2(yb - ya, xb - xa));
          if (k > 0 && ya > 19) d.box(0.25, ya - 18, 0.25, xa, 18, z + s * 8, 0x6e6a62);
        }
      }
    };
    cable(262, 22, 312, 66, 4);
    cable(312, 66, 394, 66, 26);
    cable(394, 66, 460, 22, 4);
    for (const tx of [312, 394]) {
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= 4; k++) {
          const bx = tx + dir * k * 9;
          const len = Math.hypot(bx - tx, 62 - 18);
          for (const s of [-1, 1]) d.box(len, 0.3, 0.3, (tx + bx) / 2, (62 + 18) / 2 - 0.15, z + s * 8, 0x8a857a, 0, 0, Math.atan2(18 - 62, bx - tx));
        }
      }
    }
  }

  // ---- the Statue of Liberty, out in the harbour --------------------------------
  {
    const S = PLACES.statue;
    const m = new MeshBuilder();
    m.cyl(44, 2, 0, -1.6, 0, COL.grass, 24);
    for (const r of [0, Math.PI / 4]) m.box(34, 6, 34, 0, 0.4, 0, 0xb7ad98, r);
    m.box(15, 24, 15, 0, 6.4, 0, 0xb9b1a2);
    m.box(17, 1.5, 17, 0, 30.4, 0, 0xa89f8f);
    m.box(12, 3, 12, 0, 31.9, 0, 0xb9b1a2);
    const cu = COL.copper;
    const y0 = 34.9;
    m.cyl(5.2, 22, 0, y0, 0, cu, 12, 0.55);
    m.ball(3.4, 0, y0 + 23, 0, cu, 1.25, 1.1, 0.9);
    m.ball(2.2, 0, y0 + 27.6, 0.3, cu);
    for (let k = 0; k < 7; k++) {
      const a = ((k - 3) / 3) * 1.1;
      m.add(GEO.cone(4), cu, Math.sin(a) * 1.8, y0 + 28.4, 0.3 + Math.cos(a) * 1.8, 0.28, 3, 0.28, 0, Math.cos(a) * 1.1, -Math.sin(a) * 1.1);
    }
    // The raised right arm and its torch; the tablet in the left.
    m.add(GEO.cyl(8), cu, 3.6, y0 + 24, 0, 0.95, 13, 0.95, 0, 0, -0.16);
    m.cyl(1.4, 1.6, 5.7, y0 + 36.6, 0, 0xc9a23a, 10, 1.3);
    m.cone(1.3, 3.4, 5.7, y0 + 38.2, 0, 0xf2b632, 8);
    m.box(3.2, 5.2, 1.0, -3.6, y0 + 15, 1.6, cu, 0, 0.2, 0.15);
    m.place(S.x, S.z, 0.64);
    d.merge(m);
  }

  // ---- the city beyond the edge of play ---------------------------------------
  for (let z = -600; z <= 520; z += 46) {
    const nj = rng() < 0.4 ? R(60, 140) : R(16, 50);
    city.addBuilding(nj > 60 ? 'glass' : 'office', -470 - R(0, 40), z, R(26, 40), R(26, 40), nj, { solid: false, color: nj > 60 ? pickc(GLASS) : pickc(STONE) });
    city.addBuilding('office', -560 - R(0, 60), z + 14, R(28, 40), R(28, 40), R(12, 46), { solid: false, color: pickc(STONE) });
    city.addBuilding('brick', 440 + R(0, 30), z, R(26, 36), R(26, 36), R(12, 34), { solid: false, color: pickc(BRICK) });
    if (rng() < 0.6) city.addBuilding('office', 520 + R(0, 60), z + 10, R(26, 40), R(26, 40), R(16, 70), { solid: false, color: pickc(STONE) });
  }
  for (let x = -280; x <= 260; x += 42) {
    city.addBuilding(rng() < 0.5 ? 'stone' : 'brick', x + R(-6, 6), -680 - R(0, 20), R(28, 38), R(26, 36), R(30, 80), { solid: false, color: pickc(STONE) });
    city.addBuilding('brick', x + R(-6, 6), -760 - R(0, 30), R(28, 38), R(26, 36), R(20, 60), { solid: false, color: pickc(BRICK) });
  }

  // ---- life: traffic, steam, birds, beacons ----------------------------------
  {
    const thin = detail.low ? 0.4 : 1;
    const lane = (ax, az, bx, bz, n, speed, buses = 0) => city.addLane(ax, az, bx, bz, Math.max(2, Math.round(n * thin)), speed, detail.low ? Math.min(buses, 1) : buses, CARS);
    lane(50, -440, 50, 380, 7, 12, 1); // Fifth Avenue
    lane(-150, -440, -150, 440, 6, 12, 1); // Eighth Avenue
    lane(-50, -440, -50, -340, 2, 11); // Seventh, north of Times Square
    lane(-50, -214, -50, 380, 5, 12); // and south of it
    lane(150, -630, 150, 380, 6, 12, 1); // Park Avenue
    lane(-250, -630, -250, 440, 6, 13); // Eleventh Avenue
    lane(250, -630, 250, 300, 5, 13); // First Avenue
    lane(-290, -392, 270, -392, 5, 11); // 57th Street
    lane(-290, -168, 270, -168, 5, 11); // 34th Street
    lane(-290, 56, 270, 56, 4, 11); // 14th Street
    lane(-290, 168, 270, 168, 4, 11); // Houston Street
    lane(-290, 280, 270, 280, 4, 11); // Canal Street

    const rv = mulberry32(1904); // the year the subway opened
    for (let k = 0; k < 24; k++) {
      const x = -250 + Math.floor(rv() * 6) * AVE + (rv() < 0.5 ? -4.5 : 4.5);
      const z = Math.floor(rv() * 20 - 10) * ST + 18;
      if (!paved(x, z) || nearBroadway(x, z, 14)) continue;
      d.box(1.7, 0.05, 1.7, x, 0.02, z, 0x18181a);
      city.addVent(x, z);
    }
    for (const [x, z, n] of [[-30, -100, 14], [120, -80, 14], [140, 90, 14], [-120, 300, 12]]) city.addFlock(x, z, n);

    const tall = city.buildings.filter((b) => b.solid && !b.fixed).sort((a, b) => b.top - a.top).slice(0, detail.low ? 4 : 8);
    for (const b of tall) city.addBeacon(b, b.x, b.top + 0.9, b.z);
    city.addBeacon(esb, PLACES.empire.x, PLACES.empire.top + 53, PLACES.empire.z);
    city.addBeacon(chrysler, PLACES.chrysler.x, 160, PLACES.chrysler.z);
  }

  city.finalize();
  city.places = PLACES;
  city.name = 'New York City';
  return city;
}
