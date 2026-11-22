import * as THREE from 'three';
import { City } from './city.js';
import { GEO, MeshBuilder } from '../engine/build.js';
import { groundMaterial, waterMaterial } from '../engine/materials.js';
import { mulberry32, distToSegment, lerp } from '../engine/util.js';

// Philadelphia, squeezed to about a kilometre across but laid out the way the
// real city is: Penn's street grid between two rivers, City Hall on the
// crossing of Broad and Market, the Parkway cutting diagonally out to the Art
// Museum, Old City and Independence Hall to the east, the zoo over the
// Schuylkill to the north-west. North is -z, east is +x.

const PITCH = 78; // one block plus one street
const HALF_STREET = 9;

const COL = {
  asphalt: 0x4c4c4d,
  sidewalk: 0xa9a69e,
  plaza: 0xcfc8b8,
  grass: 0x768a4c,
  grassDark: 0x687d45,
  water: 0x2f80ba,
  stone: 0xcfc7b6,
  slate: 0x47525e,
  museum: 0xdcb878,
  teal: 0x4d8590,
  bridgeBlue: 0x5584bd,
  bronze: 0x7a6038,
};

const BRICK = [0x9c4a3a, 0xa8553f, 0x8a3f33, 0xb0694d, 0x7d3b34, 0xc08a62, 0xd9c7a5, 0x94483c, 0xa34f3e];
const OFFICE = [0xb9b2a3, 0x9aa3ad, 0xc7bca8, 0x8d949c, 0xa58f7a, 0xb8a58c, 0x7f8790];
const GLASS = [0x6c8fae, 0x55789a, 0x7fa3bd, 0x486c8c, 0x8fb0c4, 0x5f8f9e];
const LEAVES = [0x4f9a45, 0x5fae4f, 0x3f8a3d, 0x58a34a, 0xd98a2b, 0xc8572a, 0xe0b23a, 0xb5522c];
const CARS = [0xe8e6df, 0x23262b, 0xb8bcc2, 0xc0392b, 0x2d6fb5, 0xe2b93b, 0x3d7d57, 0x6d7780];

// Named places the mission script and the HUD refer to.
export const PLACES = {
  start: { x: -584, z: -262, yaw: Math.PI / 2 },
  zooGate: { x: -520, z: -262 },
  oval: { x: -302, z: -282, r: 46 },
  logan: { x: -195, z: -190, r: 40 },
  dilworth: { x: -92, z: 0, r: 60 },
  cityHall: { x: 0, z: 0 },
  perch: { x: 0, y: 128, z: -26 },
  museum: { x: -368.7, z: -339.4 },
  liberty: { x: 273, z: -60 },
};

const PARKWAY = { ax: -100, az: -108, bx: PLACES.oval.x, bz: PLACES.oval.z };

const block = (i, j) => ({
  x0: i * PITCH + HALF_STREET,
  x1: (i + 1) * PITCH - HALF_STREET,
  z0: j * PITCH + HALF_STREET,
  z1: (j + 1) * PITCH - HALF_STREET,
  cx: i * PITCH + PITCH / 2,
  cz: j * PITCH + PITCH / 2,
});

function zoneOf(i, j) {
  if (j >= -1 && j <= 0 && i >= -2 && i <= 0) return 'plaza'; // Penn Square and Dilworth Park
  if (i === -2 && j === -2) return 'jfk';
  if (i === -3 && j === -3) return 'logan';
  if (i <= -4 && j <= -4) return 'fairmount';
  if (i === -3 && j === 2) return 'park'; // Rittenhouse Square
  if (i === 2 && j === 1) return 'park'; // Washington Square
  if (i === 3 && j === -3) return 'park'; // Franklin Square
  if (i === 3 && (j === -2 || j === -1)) return 'mall';
  if (i === 3 && j === 0) return 'indy';
  if (i >= -4 && i <= -1 && j >= -2 && j <= 1) return 'tower';
  if (i >= 0 && i <= 1 && j >= -2 && j <= 1) return 'office';
  if (i >= 2 && j >= -2 && j <= 1) return 'oldcity';
  if ((j === -3 || j === 2) && i <= 1) return 'office';
  return 'rowhouse';
}

function signPlane(text, w, h, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = fg;
  g.font = `900 ${Math.round(cv.height * 0.72)}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + cv.height * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

export function buildPhiladelphia(scene) {
  const rng = mulberry32(1682); // the year the city was laid out
  const R = (a, b) => a + rng() * (b - a);
  const pickc = (arr) => arr[Math.floor(rng() * arr.length)];
  const city = new City(scene, { x0: -626, x1: 438, z0: -392, z1: 392 });
  const d = city.decor;

  const nearParkway = (x, z, pad) => distToSegment(x, z, PARKWAY.ax, PARKWAY.az, PARKWAY.bx, PARKWAY.bz) < pad;
  const tree = (x, z, s = R(0.85, 1.35)) => city.addTree(x, z, s, pickc(LEAVES));

  // ---- land and water ----------------------------------------------------
  // Street paint (crossings, stop lines) is drawn by the asphalt itself, from the grid.
  const grid = { pitch: PITCH, half: HALF_STREET, x0: -399, x1: 399, z0: -399, z1: 399 };
  const land = city.asphalt(COL.asphalt, grid);
  const plane = (x0, x1, y, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 6400).rotateX(-Math.PI / 2), mat);
    m.position.set((x0 + x1) / 2, y, 0);
    m.receiveShadow = true;
    city.group.add(m);
    return m;
  };
  plane(-3200, -500, 0, city.asphalt(COL.asphalt));
  plane(-430, 412, 0, land);
  plane(640, 3200, 0, groundMaterial(1, 0x5c6a4a));
  const bed = new THREE.MeshLambertMaterial({ color: 0x14303c });
  plane(-500, -430, -6, bed);
  plane(412, 640, -6, bed);
  const waterMat = waterMaterial(0x1d4c5c);
  city.waterMat = waterMat;
  plane(-500, -430, -1, waterMat).receiveShadow = false;
  plane(412, 640, -1, waterMat).receiveShadow = false;
  city.addWater(-500, -430);
  city.addWater(412, 640);
  for (const x of [-500.6, -429.4, 412.6, 639.4]) d.box(1.2, 6.2, 3200, x, -6, 0, 0x8d8a83);

  // West bank, river trail, waterfront.
  city.addSlab(-3200, -3200, -500, 3200, 0x8d9084, 0.2);
  city.addSlab(-430, -3200, -399, 3200, COL.grass, 0.3);
  city.addSlab(399, -3200, 412, 3200, COL.sidewalk, 0.25);
  // Beyond the last streets the land is a pale blur of suburbs, not bare road.
  city.addSlab(-399, -3200, 399, -640, 0x86857c, 0.2);
  city.addSlab(-399, 640, 399, 3200, 0x86857c, 0.2);
  // Fairmount Park around the museum.
  city.addSlab(-430, -3200, -243, -243, COL.grass, 0.31);
  // Penn Square and Dilworth Park, one sheet of stone.
  city.addSlab(-147, -69, 69, 69, COL.plaza, 0.3);

  // ---- bridges -----------------------------------------------------------
  const bridge = (z, width, color, truss) => {
    city.addBridge(-500, -430, z - width / 2, z + width / 2);
    d.box(74, 1.6, width, -465, -1.35, z, 0x55585f);
    d.box(74, 0.12, width - 5, -465, 0.2, z, COL.asphalt);
    for (const px of [-482, -448]) d.box(5, 5, width - 3, px, -6, z, 0x8d8a83);
    for (const s of [-1, 1]) {
      d.box(74, 1.3, 0.7, -465, 0.25, z + (s * width) / 2, color);
      if (truss) {
        for (let k = 0; k <= 6; k++) {
          const x = -498 + k * 11;
          const h = 3 + Math.sin((k / 6) * Math.PI) * 9;
          d.box(0.8, h, 0.8, x, 0.25, z + (s * width) / 2, color);
          if (k < 6) {
            const h2 = 3 + Math.sin(((k + 1) / 6) * Math.PI) * 9;
            const len = Math.hypot(11, h2 - h);
            d.box(len, 0.8, 0.8, x + 5.5, 0.25 + (h + h2) / 2 - 0.4, z + (s * width) / 2, color, 0, 0, Math.atan2(h2 - h, 11));
          }
        }
      }
    }
  };
  bridge(PLACES.zooGate.z, 24, 0x3f6b52, true);
  bridge(0, 26, 0x8a8f96, false);
  bridge(234, 20, 0x8a8f96, false);

  // ---- the street grid ---------------------------------------------------
  const openArea = (x, z) =>
    (x > -150 && x < 72 && z > -72 && z < 72) || (x < -240 && z < -240) || (x > -228 && x < -162 && z > -228 && z < -162);
  for (let k = -5; k <= 5; k++) {
    const s = k * PITCH;
    for (let t = -384; t <= 384; t += 12) {
      // north-south street at x = s
      if (!openArea(s, t) && Math.abs(((t % PITCH) + PITCH) % PITCH) > 10 && s > -400)
        city.addDash(s, t, k === 0 ? 12 : 4.5, false, k === 0 ? 0xe2b93b : 0xe9e4d4, k === 0 ? 0.8 : 0.5);
      // east-west street at z = s
      if (!openArea(t, s) && Math.abs(((t % PITCH) + PITCH) % PITCH) > 10)
        city.addDash(t, s, k === 0 ? 12 : 4.5, true, k === 0 ? 0xe2b93b : 0xe9e4d4, k === 0 ? 0.8 : 0.5);
    }
  }

  const towerAt = (x, z, w, dd, h, o = {}) => {
    const color = o.color ?? pickc(GLASS);
    if (nearParkway(x, z, Math.max(w, dd) / 2 + 18)) return;
    const tiers = [];
    if (h > 70) {
      tiers.push({ w: w * 0.8, d: dd * 0.8, h: h * 0.16 });
      if (o.spire || rng() < 0.5) tiers.push({ w: w * 0.56, d: dd * 0.56, h: h * 0.1 });
    }
    city.addBuilding(o.style || 'glass', x, z, w, dd, h * 0.74, {
      color,
      tiers,
      spire: o.spire ? { r: Math.min(w, dd) * 0.4, h: h * 0.2, color: o.spireColor ?? 0x5f7f96 } : null,
    });
  };

  // The things bolted onto a city building: a canopy over the door on the
  // street side, a blade sign at a corner, a timber water tank or a
  // billboard on the roof. ox and oz say which way the street is.
  const AWNINGS = [0x7a1f1a, 0x1f4a36, 0x1e3a66, 0x2b2b2d, 0x8a6a1e];
  const dress = (bld, ox, oz, brick) => {
    const sx = Math.sign(ox);
    const sz = Math.sign(oz);
    const top = bld.top;
    if (sz !== 0 && rng() < 0.7) city.addAttachment(bld, R(-0.2, 0.2) * bld.w, sz * (bld.d / 2 + 1.1), R(5, 9), 2.4, 0.3, 3.5, pickc(AWNINGS));
    if (sx !== 0 && rng() < 0.55) city.addAttachment(bld, sx * (bld.w / 2 + 1.1), R(-0.2, 0.2) * bld.d, 2.4, R(5, 9), 0.3, 3.5, pickc(AWNINGS));
    if (sz !== 0 && rng() < 0.3) city.addAttachment(bld, sx * (bld.w / 2 - 1.4) || bld.w / 2 - 1.4, sz * (bld.d / 2 + 0.9), 0.4, 1.7, R(5, 8), 5.5, pickc(AWNINGS));
    if (brick && rng() < 0.4 && bld.tiers.length === 0) {
      // A water tank on legs.
      const tx = R(-0.25, 0.25) * bld.w;
      const tzz = R(-0.25, 0.25) * bld.d;
      city.addAttachment(bld, tx, tzz, 2.6, 2.6, 2.2, top, 0x3a3d40);
      city.addAttachment(bld, tx, tzz, 3.4, 3.4, 3.6, top + 2.2, 0x6a4e37);
      city.addAttachment(bld, tx, tzz, 3.8, 3.8, 0.4, top + 5.8, 0x4a4038);
    } else if (!brick && rng() < 0.18 && bld.tiers.length === 0) {
      // A billboard facing the street.
      const fz = sz || 1;
      city.addAttachment(bld, 0, fz * (bld.d / 2 - 1.2), 0.5, 0.5, 3, top, 0x2c2f33);
      city.addAttachment(bld, 0, fz * (bld.d / 2 - 1.0), bld.w * 0.7, 0.4, 4.2, top + 3, pickc([0xe9e2d0, 0xc23a2a, 0x24588f, 0xe0b23a]));
    }
  };

  const parkTrees = (b, n, clearR = 14) => {
    for (let k = 0; k < n; k++) {
      const x = R(b.x0 + 4, b.x1 - 4);
      const z = R(b.z0 + 4, b.z1 - 4);
      if (Math.hypot(x - b.cx, z - b.cz) > clearR) tree(x, z);
    }
  };

  const fountain = (x, z, r, jet) => {
    d.cyl(r, 1.3, x, 0.3, z, 0xbdb6a6, 16);
    d.cyl(r - 1.2, 0.3, x, 1.4, z, 0x2f5f78, 16);
    d.cyl(r * 0.22, 3, x, 0.3, z, 0xa9a294, 8);
    d.cone(r * 0.12, jet, x, 3.3, z, 0xd8f0ff, 6);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      d.cone(r * 0.06, jet * 0.5, x + Math.cos(a) * r * 0.55, 1.5, z + Math.sin(a) * r * 0.55, 0xd8f0ff, 5);
    }
  };

  for (let i = -5; i <= 4; i++) {
    for (let j = -5; j <= 4; j++) {
      const b = block(i, j);
      const zone = zoneOf(i, j);
      if (zone === 'plaza' || zone === 'fairmount') continue;

      if (zone === 'park' || zone === 'jfk' || zone === 'mall') {
        city.addSlab(b.x0, b.z0, b.x1, b.z1, zone === 'mall' ? COL.grassDark : COL.grass, 0.32);
        if (zone === 'park') {
          parkTrees(b, 26);
          d.cyl(5, 0.5, b.cx, 0.32, b.cz, COL.plaza, 12);
        } else if (zone === 'jfk') {
          parkTrees(b, 10, 20);
          fountain(b.cx, b.cz, 11, 16);
        } else {
          for (let t = b.z0 + 5; t < b.z1; t += 11) {
            tree(b.x0 + 4, t);
            tree(b.x1 - 4, t);
          }
        }
        continue;
      }

      city.addSlab(b.x0, b.z0, b.x1, b.z1, COL.sidewalk);
      if (zone === 'logan' || zone === 'indy') continue;

      if (zone === 'tower') {
        const far = Math.max(Math.abs(i + 2.5), Math.abs(j + 0.5));
        const tall = () => R(70, 150) * (far > 1.6 ? 0.7 : 1);
        const kind = rng();
        if (i === -3 && j === -1) {
          towerAt(b.cx, b.cz - 4, 34, 44, 215, { color: 0x7fa3bd });
        } else if (i === -3 && j === 0) {
          towerAt(b.cx - 13, b.cz - 12, 28, 28, 185, { color: 0x4f7ea8, spire: true, spireColor: 0x4f7ea8 });
          towerAt(b.cx + 13, b.cz + 13, 26, 26, 150, { color: 0x4f7ea8, spire: true, spireColor: 0x4f7ea8 });
        } else if (kind < 0.3) {
          towerAt(b.cx, b.cz, 40, 40, tall() + 20, { spire: rng() < 0.4 });
        } else if (kind < 0.65) {
          towerAt(b.cx - 15, b.cz, 26, 52, tall());
          towerAt(b.cx + 15, b.cz, 24, 44, tall() * 0.7, { style: 'office', color: pickc(OFFICE) });
        } else {
          for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
            if (nearParkway(b.cx + ox, b.cz + oz, 34)) continue;
            const glass = rng() < 0.6;
            towerAt(b.cx + ox, b.cz + oz, 25, 25, tall() * R(0.5, 1), { style: glass ? 'glass' : 'office', color: glass ? undefined : pickc(OFFICE) });
          }
        }
        continue;
      }

      if (zone === 'office') {
        for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
          const x = b.cx + ox;
          const z = b.cz + oz;
          if (nearParkway(x, z, 36)) continue;
          const brick = rng() < 0.35;
          const w = R(22, 27);
          const dd = R(22, 27);
          const h = R(22, 58);
          const color = brick ? pickc(BRICK) : pickc(OFFICE);
          const shape = rng();
          let bld;
          if (shape < 0.28 && h > 34) {
            // A shaft rising from a wider podium.
            const ph = R(9, 14);
            bld = city.addBuilding(brick ? 'brick' : 'office', x, z, w, dd, ph, { color, hp: (w * dd * h) / 420, tiers: [{ w: w - R(5, 8), d: dd - R(5, 8), h: h - ph }] });
          } else if (shape < 0.55 && h > 30) {
            // A setback crown.
            const th = R(5, 9);
            bld = city.addBuilding(brick ? 'brick' : 'office', x, z, w, dd, h - th, { color, hp: (w * dd * h) / 420, tiers: [{ w: w * R(0.62, 0.8), d: dd * R(0.62, 0.8), h: th }] });
          } else {
            bld = city.addBuilding(brick ? 'brick' : 'office', x, z, w, dd, h, { color });
          }
          dress(bld, ox, oz, brick);
        }
        continue;
      }

      if (zone === 'oldcity') {
        for (let a = 0; a < 3; a++) {
          for (let c = 0; c < 2; c++) {
            const x = b.x0 + 10 + a * 20;
            const z = b.z0 + 15 + c * 30;
            const bld = city.addBuilding('brick', x, z, R(16, 19), R(22, 27), R(12, 22), { color: pickc(BRICK) });
            dress(bld, 0, c === 0 ? -1 : 1, true);
          }
        }
        continue;
      }

      // Row houses: two terraces back to back with a yard between them.
      const alongX = (i + j) % 2 === 0;
      const church = rng() < 0.1;
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < 6; k++) {
          const u = -25 + k * 10;
          const v = row === 0 ? -18 : 18;
          const x = b.cx + (alongX ? u : v);
          const z = b.cz + (alongX ? v : u);
          if (nearParkway(x, z, 34)) continue;
          if (church && row === 0 && k < 2) {
            if (k === 0)
              city.addBuilding('stone', b.cx + (alongX ? -20 : v), b.cz + (alongX ? v : -20), alongX ? 20 : 24, alongX ? 24 : 20, 20, {
                color: 0xb9ae98,
                spire: { r: 5.5, h: 22, color: 0x4a5560 },
              });
            continue;
          }
          const h = R(9, 13.5);
          city.addBuilding('brick', x, z, alongX ? 9.6 : 23, alongX ? 23 : 9.6, h, { color: pickc(BRICK), hp: 20 });
        }
      }
      if (!nearParkway(b.cx, b.cz, 30)) {
        tree(b.cx + R(-18, 18) * (alongX ? 1 : 0.2), b.cz + R(-18, 18) * (alongX ? 0.2 : 1), R(0.7, 1));
        tree(b.cx + R(-18, 18) * (alongX ? 1 : 0.2), b.cz + R(-18, 18) * (alongX ? 0.2 : 1), R(0.7, 1));
      }
    }
  }

  // Parked cars along the kerbs.
  for (let i = -5; i <= 4; i++) {
    for (let j = -5; j <= 4; j++) {
      const zone = zoneOf(i, j);
      if (zone === 'plaza' || zone === 'fairmount') continue;
      const b = block(i, j);
      for (let t = -24; t <= 24; t += 8) {
        if (rng() < 0.3 && !nearParkway(b.cx + t, b.z0 - 2.4, 26)) city.addCar(b.cx + t, b.z0 - 2.4, Math.PI / 2, pickc(CARS));
        if (rng() < 0.3 && !nearParkway(b.x0 - 2.4, b.cz + t, 26)) city.addCar(b.x0 - 2.4, b.cz + t, 0, pickc(CARS));
      }
    }
  }

  // Street lamps along every kerb and signals at the junctions.
  for (let i = -5; i <= 4; i++) {
    for (let j = -5; j <= 4; j++) {
      const zone = zoneOf(i, j);
      if (zone === 'plaza' || zone === 'fairmount') continue;
      const b = block(i, j);
      const o = (i + j) % 2 === 0 ? 15 : -15;
      const spots = [
        [b.cx + o, b.z0 - 0.5, Math.PI / 2],
        [b.cx - o, b.z1 + 0.5, -Math.PI / 2],
        [b.x0 - 0.5, b.cz - o, Math.PI],
        [b.x1 + 0.5, b.cz + o, 0],
      ];
      for (const [x, z, rot] of spots) if (!nearParkway(x, z, 22)) city.addProp('lamp', x, z, rot);
    }
  }
  for (let i = -5; i <= 5; i++) {
    for (let j = -5; j <= 5; j++) {
      const x = i * PITCH;
      const z = j * PITCH;
      if (openArea(x, z) || nearParkway(x, z, 40) || (x < -240 && z < -230)) continue;
      city.addProp('signal', x + 9.7, z + 9.7, Math.PI);
      city.addProp('signal', x - 9.7, z - 9.7, 0);
    }
  }

  // The small things a pavement carries: a hydrant and a litter bin near
  // each corner, bus shelters downtown, benches round the squares.
  for (let i = -5; i <= 4; i++) {
    for (let j = -5; j <= 4; j++) {
      const zone = zoneOf(i, j);
      if (zone === 'plaza' || zone === 'fairmount') continue;
      const b = block(i, j);
      if (nearParkway(b.cx, b.cz, 46)) continue;
      city.addProp('hydrant', b.x0 + 1.0, b.z0 + R(5, 9), 0);
      city.addProp('bin', b.x1 - 1.2, b.z1 - R(4, 8), 0);
      if (rng() < 0.5) city.addProp('hydrant', b.x1 - R(6, 12), b.z1 - 1.0, 0);
      if ((zone === 'office' || zone === 'tower' || zone === 'oldcity') && rng() < 0.6) {
        if (rng() < 0.5) city.addProp('shelter', b.cx + R(-12, 12), b.z0 + 1.6, Math.PI);
        else city.addProp('shelter', b.x1 - 1.6, b.cz + R(-12, 12), Math.PI / 2);
      }
      if (zone === 'park' || zone === 'jfk' || zone === 'mall' || zone === 'logan') {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.2;
          const r = zone === 'park' ? 9 : 25;
          city.addProp('bench', b.cx + Math.sin(a) * r, b.cz + Math.cos(a) * r, a + Math.PI);
          if (k % 4 === 0) city.addProp('bin', b.cx + Math.sin(a + 0.25) * r, b.cz + Math.cos(a + 0.25) * r, 0);
        }
      }
    }
  }

  // ---- City Hall ---------------------------------------------------------
  // Second Empire: a square block round a courtyard, mansard roofs with
  // dormers, a pavilion at each corner and in the middle of each side, and
  // the clock tower on the north side with William Penn on top.
  {
    const s = COL.stone;
    const trim = 0xe2dccb;
    const slate = COL.slate;
    const patina = 0x5d6a5a;
    const fixed = { fixed: true, solid: false, color: s };
    city.addBuilding('stone', 0, 0, 72, 72, 24, { fixed: true, color: s });
    city.addBuilding('stone', 0, -26, 20, 20, 80, fixed);
    const m = new MeshBuilder();
    m.box(73.6, 1.5, 73.6, 0, 0.3, 0, 0xa59f92); // granite base course
    m.box(74.2, 1.0, 74.2, 0, 23.2, 0, trim); // main cornice
    m.add(GEO.frustum(0.9), slate, 0, 24.2, 0, 70, 7, 70);
    m.box(58, 0.5, 58, 0, 31.2, 0, 0x33393f);
    // Dormers along the mansard, between the pavilions.
    for (const u of [-18, -13.5, 13.5, 18]) {
      for (const [dx, dz, ry] of [[u, 34.2, 0], [u, -34.2, 0], [34.2, u, Math.PI / 2], [-34.2, u, Math.PI / 2]]) {
        if (dz < -30 && Math.abs(dx) < 12) continue;
        m.box(2.6, 3.6, 2.6, dx, 24.6, dz, trim, ry);
        m.prism(3.2, 1.5, 3.0, dx, 28.2, dz, slate, ry);
      }
    }

    // Corner pavilions.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = sx * 30;
      const cz = sz * 30;
      city.addBuilding('stone', cx, cz, 16, 16, 34, fixed);
      m.box(17.6, 1.0, 17.6, cx, 33.2, cz, trim);
      m.add(GEO.frustum(0.42), slate, cx, 34.2, cz, 16.6, 11, 16.6);
      m.box(7.4, 0.6, 7.4, cx, 45.2, cz, trim);
      m.cyl(0.25, 3.2, cx, 45.8, cz, 0x33393f, 5);
      for (const o of [-4.4, 4.4]) {
        // Paired columns through the upper floors, on both street faces.
        m.cyl(0.8, 13, cx + sx * 8.9, 9.6, cz + o, trim, 10);
        m.cyl(0.8, 13, cx + o, 9.6, cz + sz * 8.9, trim, 10);
      }
      m.box(2.2, 1.2, 11.4, cx + sx * 8.9, 22.6, cz, trim);
      m.box(11.4, 1.2, 2.2, cx, 22.6, cz + sz * 8.9, trim);
      m.box(2.4, 1.0, 11.6, cx + sx * 8.9, 8.6, cz, trim);
      m.box(11.6, 1.0, 2.4, cx, 8.6, cz + sz * 8.9, trim);
    }

    // Centre pavilions on the south, east and west, each with an arched portal.
    for (const [px, pz, ry] of [[0, 34, 0], [34, 0, Math.PI / 2], [-34, 0, -Math.PI / 2]]) {
      const alongX = ry === 0;
      const w = alongX ? 22 : 8;
      const dd = alongX ? 8 : 22;
      city.addBuilding('stone', px, pz, w, dd, 32, fixed);
      const part = new MeshBuilder();
      part.box(23.4, 1.0, 9.4, 0, 31.2, 0, trim);
      part.add(GEO.frustum(0.62), slate, 0, 32.2, 0, 22.4, 9, 8.6);
      part.box(13, 0.5, 4.6, 0, 41.2, 0, trim);
      // Portal: a dark archway in a pale surround, columns either side, a balcony over it.
      part.box(9.6, 13, 0.5, 0, 0.3, 4.1, trim);
      part.add(GEO.cyl(18), trim, 0, 13.3, 4.1, 4.8, 0.5, 4.8, 0, Math.PI / 2, 0);
      part.box(7, 12, 0.5, 0, 0.3, 4.35, 0x241f1b);
      part.add(GEO.cyl(18), 0x241f1b, 0, 12.3, 4.35, 3.5, 0.5, 3.5, 0, Math.PI / 2, 0);
      for (const o of [-9, -6.4, 6.4, 9]) part.cyl(0.8, 15, o, 1.8, 5.0, trim, 10);
      part.box(21, 1.0, 2.8, 0, 16.8, 5.0, trim);
      part.box(21, 1.3, 0.3, 0, 17.8, 6.2, trim);
      for (const o of [-8, 0, 8]) part.cyl(0.55, 4.2, o, 26.4, 4.6, patina, 6, 0.6); // statues in the attic storey
      part.place(px, pz, ry);
      m.merge(part);
    }

    // The tower.
    const tz = -26;
    for (const [ox, oz] of [[-9.4, -9.4], [9.4, -9.4], [-9.4, 9.4], [9.4, 9.4]]) m.box(2.8, 80, 2.8, ox, 0, tz + oz, trim);
    for (const y of [32, 56]) m.box(22.4, 1.3, 22.4, 0, y, tz, trim);
    m.box(24.4, 2.6, 24.4, 0, 80, tz, trim);
    for (const [ox, oz] of [[-10.6, -10.6], [10.6, -10.6], [-10.6, 10.6], [10.6, 10.6]]) {
      // The bronze groups at the corners of the cornice.
      m.cyl(1.4, 4.6, ox, 82.6, tz + oz, patina, 6, 0.6);
      m.ball(1.0, ox, 88, tz + oz, patina);
    }
    m.cyl(10, 18, 0, 82.6, tz, s, 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      m.cyl(0.7, 15, Math.sin(a) * 10.5, 83.6, tz + Math.cos(a) * 10.5, trim, 8);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const sx = Math.sin(a);
      const cz2 = Math.cos(a);
      m.add(GEO.cyl(20), 0x2d2a26, sx * 9.9, 91.6, tz + cz2 * 9.9, 5.4, 0.5, 5.4, a, Math.PI / 2, 0);
      m.add(GEO.cyl(20), 0xf1e6bd, sx * 10.15, 91.6, tz + cz2 * 10.15, 4.6, 0.5, 4.6, a, Math.PI / 2, 0);
      m.add(GEO.cube(), 0x1d1b19, sx * 10.75, 92.9, tz + cz2 * 10.75, 0.5, 3.6, 0.2, a);
      m.add(GEO.cube(), 0x1d1b19, sx * 10.75 + cz2 * 1.1, 91.9, tz + cz2 * 10.75 - sx * 1.1, 0.5, 2.6, 0.2, a, 0, 1.2);
    }
    m.cyl(11.4, 1.6, 0, 100.6, tz, trim, 8);
    m.dome(9, 13, 0, 102.2, tz, slate, 12);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      m.cyl(0.35, 5, Math.sin(a) * 2.9, 114.2, tz + Math.cos(a) * 2.9, trim, 6);
    }
    m.cyl(2.5, 5, 0, 114.2, tz, s, 8);
    m.cyl(3.6, 0.7, 0, 119.2, tz, trim, 8);
    m.cyl(1.9, 6.5, 0, 119.9, tz, COL.bronze, 8, 0.72); // Penn's coat
    m.ball(1.25, 0, 127.4, tz, COL.bronze);
    m.cyl(1.9, 0.4, 0, 128.2, tz, COL.bronze, 10); // hat brim
    m.cyl(1.0, 1.0, 0, 128.6, tz, COL.bronze, 10);
    d.merge(m);

    // Dilworth Park on the west side: planters at the far edge, lamps round the square.
    for (const z of [-60, -30, 30, 60]) {
      d.box(8, 1.2, 3, -142, 0.3, z, 0x8d8a83);
      tree(-142, z, 0.8);
      city.addProp('bench', -137.5, z + 6, Math.PI / 2);
      city.addProp('bin', -137.5, z - 5, 0);
    }
    for (let t = -130; t <= 60; t += 27) {
      city.addProp('lamp', t, -66, Math.PI / 2);
      city.addProp('lamp', t, 66, -Math.PI / 2);
    }
    for (const z of [-44, 0, 44]) city.addProp('lamp', -145, z, 0);
  }

  // ---- Benjamin Franklin Parkway ------------------------------------------
  {
    const { ax, az, bx, bz } = PARKWAY;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const rot = Math.atan2(-uz, ux);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    d.box(len, 0.1, 26, mx, 0.3, mz, COL.asphalt, rot);
    d.box(len, 0.1, 0.7, mx, 0.36, mz, 0xe2b93b, rot);
    for (const s of [-1, 1]) d.box(len, 0.12, 9, mx - uz * s * 18, 0.36, mz + ux * s * 18, COL.grass, rot);
    const flags = [0xc0392b, 0x2d6fb5, 0xf2f2f2, 0x2e8b57, 0xe2b93b, 0xe67e22, 0x8e44ad, 0x16a085];
    let f = 0;
    for (let t = 14; t < len - 44; t += 13) {
      const x = ax + ux * t;
      const z = az + uz * t;
      if (Math.hypot(x - PLACES.logan.x, z - PLACES.logan.z) < 36) continue;
      for (const s of [-1, 1]) {
        tree(x - uz * s * 19, z + ux * s * 19, 1.1);
        if (Math.round(t / 13) % 2 === 0) {
          const px = x - uz * s * 13.6;
          const pz = z + ux * s * 13.6;
          d.cyl(0.22, 15, px, 0.3, pz, 0xd8d8d8, 5);
          d.box(4.2, 2.6, 0.2, px + ux * 2.1, 12.2, pz + uz * 2.1, flags[f++ % flags.length], rot);
        }
      }
    }
    // Logan Circle.
    const L = PLACES.logan;
    d.cyl(30, 0.12, L.x, 0.3, L.z, COL.asphalt, 28);
    d.cyl(20, 0.14, L.x, 0.4, L.z, COL.grass, 24);
    fountain(L.x, L.z, 12, 13);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      tree(L.x + Math.cos(a) * 17, L.z + Math.sin(a) * 17, 0.9);
    }
    // Eakins Oval, in front of the museum steps.
    const O = PLACES.oval;
    d.cyl(44, 0.12, O.x, 0.31, O.z, COL.asphalt, 32);
    d.cyl(33, 0.14, O.x, 0.4, O.z, COL.plaza, 28);
    d.cyl(33, 0.02, O.x, 0.54, O.z, 0xc4bca9, 5);
    city.mapShapes = [
      { type: 'line', ax, az, bx, bz, w: 26, color: '#4a4f5c' },
      { type: 'circle', x: L.x, z: L.z, r: 30, color: '#4a4f5c' },
      { type: 'circle', x: L.x, z: L.z, r: 14, color: '#58a8d8' },
      { type: 'circle', x: O.x, z: O.z, r: 44, color: '#4a4f5c' },
      { type: 'circle', x: O.x, z: O.z, r: 33, color: '#cfc8b8' },
    ];
  }

  // ---- Philadelphia Museum of Art -----------------------------------------
  {
    const M = PLACES.museum;
    const yaw = Math.atan2(PARKWAY.ax - PARKWAY.bx, PARKWAY.az - PARKWAY.bz);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const toWorld = (lx, lz) => ({ x: M.x + lx * cos + lz * sin, z: M.z - lx * sin + lz * cos });
    const c = COL.museum;
    const m = new MeshBuilder();
    const hall = { fixed: true, solid: false, color: c, rot: yaw, y: 6 };
    m.box(116, 6, 64, 0, 0, 0, 0xcbb894); // terrace
    m.box(117, 0.7, 65, 0, 5.6, 0, 0xd9c9a4);
    const mainAt = toWorld(0, -18);
    city.addBuilding('stone', mainAt.x, mainAt.z, 88, 22, 20, hall); // main block
    m.box(90, 1.2, 24, 0, 25.2, -18, 0xe6cf98);
    m.prism(24, 7, 90, 0, 26.4, -18, COL.teal, Math.PI / 2);
    // Bronze doors behind the columns, and banners hung between them.
    for (const ox of [-10, 0, 10]) m.box(4.6, 9.5, 0.5, ox, 6, -6.9, 0x3b2f24);
    for (const [ox, bc] of [[-12.5, 0xa3271f], [-2.5, 0x1f4f8f], [7.5, 0xc79a2a]]) m.box(3.0, 9, 0.25, ox + 2.5, 11, -3.1, bc);
    for (const s of [-1, 1]) {
      const wingAt = toWorld(s * 40, 9);
      city.addBuilding('stone', wingAt.x, wingAt.z, 22, 34, 17, hall); // wings
      m.box(23.4, 1.0, 35.4, s * 40, 22.4, 9, 0xe6cf98);
      m.prism(24, 6, 36, s * 40, 23.4, 9, COL.teal);
      // Urns at the head of the steps.
      m.cyl(1.3, 1.6, s * 30.5, 6.6, 31, 0xbfae88, 8);
      m.cyl(0.9, 2.2, s * 30.5, 8.2, 31, 0x5d6a5a, 8, 1.5);
      for (const ox of [-7.5, -2.5, 2.5, 7.5]) m.cyl(1.15, 13, s * 40 + ox, 6, 27.5, 0xefd9a6, 8);
      m.box(22, 2, 4, s * 40, 19, 27.5, c);
      m.prism(22, 5, 4, s * 40, 21, 27.5, 0xe6c98c);
    }
    for (let k = 0; k < 8; k++) m.cyl(1.4, 16, -17.5 + k * 5, 6, -4, 0xefd9a6, 8);
    m.box(42, 2.4, 6, 0, 22, -4.5, c);
    m.prism(42, 7.5, 6, 0, 24.4, -4.5, 0xe6c98c);
    m.prism(34, 5.5, 0.6, 0, 25, -1.3, 0x7ea7b0); // the coloured pediment figures
    for (let k = 0; k < 5; k++) m.box(54, 5 - k, 4, 0, 0, 34 + k * 4, 0xd6c6a3); // the steps
    for (const s of [-1, 1]) m.box(3, 6.6, 20, s * 28.5, 0, 42, 0xc4b08a);
    m.place(M.x, M.z, yaw);
    d.merge(m);
    const main = toWorld(0, -18);
    city.addCollider(main.x, main.z, 88, 22, 40, yaw);
    for (const s of [-1, 1]) {
      const w = toWorld(s * 40, 9);
      city.addCollider(w.x, w.z, 22, 34, 36, yaw);
    }
    city.addHeightZone(M.x, M.z, 116, 64, yaw, () => 6);
    const st = toWorld(0, 42);
    city.addHeightZone(st.x, st.z, 54, 20, yaw, (lx, lz) => Math.max(1, 5 - Math.floor((lz + 10) / 4)));
    PLACES.steps = toWorld(0, 60);
    PLACES.terrace = toWorld(0, 24);

    // Fairmount Park trees, kept clear of the building and the Oval.
    for (let k = 0; k < 150; k++) {
      const x = R(-426, -246);
      const z = R(-420, -246);
      const dx = x - M.x;
      const dz = z - M.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < 66 && lz > -40 && lz < 70) continue;
      if (Math.hypot(x - PLACES.oval.x, z - PLACES.oval.z) < 52) continue;
      if (nearParkway(x, z, 28)) continue;
      if (Math.abs(z - PLACES.zooGate.z) < 20 && x < -380) continue;
      tree(x, z);
    }
  }

  // River trail trees.
  for (let z = -230; z < 390; z += 15) if (Math.abs(z) > 22 && Math.abs(z - 234) > 18) tree(-414 + R(-4, 4), z + R(-3, 3));

  // ---- Independence Hall, the Mall and the Liberty Bell -------------------
  {
    const b = block(3, 0);
    const brick = 0x9a4534;
    const white = 0xf0ece2;
    const x = b.cx;
    const z = b.cz + 2;
    city.addBuilding('brick', x, z, 44, 16, 13, { fixed: true, color: brick });
    for (const s of [-1, 1]) city.addBuilding('brick', x + s * 34, z, 14, 13, 9, { fixed: true, color: brick });
    const m = new MeshBuilder();
    m.prism(18, 5, 45, x, 13, z, 0x5a6068, Math.PI / 2);
    for (const s of [-1, 1]) {
      m.prism(15, 3.5, 15, x + s * 34, 9, z, 0x5a6068, Math.PI / 2);
      m.box(12, 5, 6, x + s * 22, 0, z, white);
    }
    m.box(46, 0.8, 17.5, x, 12.6, z, white);
    // The bell tower on the south side.
    m.box(11, 26, 11, x, 0, z + 10, brick);
    m.box(12.4, 1.2, 12.4, x, 26, z + 10, white);
    m.box(8.5, 8, 8.5, x, 27.2, z + 10, white);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      m.add(GEO.cyl(12), 0x2a2a2a, x + Math.sin(a) * 4.35, 31.2, z + 10 + Math.cos(a) * 4.35, 2.4, 0.3, 2.4, a, Math.PI / 2, 0);
    }
    m.cyl(3.6, 6, x, 35.2, z + 10, white, 8);
    m.cyl(2.6, 4, x, 41.2, z + 10, white, 8);
    m.cone(2.4, 9, x, 45.2, z + 10, 0x5a6068, 8);
    d.merge(m);
    city.addCollider(x, z + 10, 11, 11, 50);
    for (let t = b.x0 + 4; t < b.x1; t += 12) tree(t, b.z1 - 5, 0.9);

    // The Liberty Bell, scaled up to monument size so it reads from across the Mall.
    const L = PLACES.liberty;
    const pts = [
      [0.01, 9.6], [1.3, 9.5], [2.3, 8.6], [2.8, 6.6], [3.1, 4.2], [3.6, 2.2], [4.5, 0.8], [5.2, 0], [4.6, 0],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bell = new THREE.LatheGeometry(pts, 12);
    d.cyl(8, 1.6, L.x, 0.3, L.z, 0xbdb6a6, 10);
    for (const s of [-1, 1]) d.box(1.4, 15, 1.6, L.x + s * 6.4, 1.9, L.z, 0x5b4332);
    d.box(15.5, 2.2, 2.2, L.x, 15.2, L.z, 0x5b4332);
    d.add(bell, 0x8a6a36, L.x, 4.6, L.z, 1.05, 1.05, 1.05);
    d.box(0.35, 5.5, 0.4, L.x + 1.2, 4.8, L.z + 3.7, 0x2a2118, 0, -0.13, 0.12); // the crack
    city.addCollider(L.x, L.z, 15, 6, 17);
  }

  // ---- Chinatown Friendship Gate ------------------------------------------
  {
    const x = PITCH;
    const z = -117;
    const red = 0xc0392b;
    for (const s of [-1, 1]) {
      d.box(2.6, 21, 2.6, x + s * 10.4, 0, z, red);
      d.box(4, 1.5, 4, x + s * 10.4, 0, z, 0x8d8a83);
    }
    d.box(27, 2.2, 2.2, x, 21, z, 0x2d6fb5);
    d.box(25, 1.4, 1.8, x, 17.6, z, 0xe2b93b);
    d.prism(8, 3.4, 32, x, 23.2, z, 0x2e7d5b, Math.PI / 2);
    d.box(14, 2.4, 2, x, 26.2, z, red);
    d.prism(7, 3, 19, x, 28.6, z, 0x2e7d5b, Math.PI / 2);
  }

  // ---- Benjamin Franklin Bridge -------------------------------------------
  {
    const z = -156;
    const c = COL.bridgeBlue;
    city.addBuilding('stone', 400, z, 22, 30, 26, { fixed: true, color: 0xb9b2a3 });
    d.box(560, 2.6, 24, 690, 22, z, c);
    d.box(560, 0.3, 20, 690, 24.6, z, COL.asphalt);
    const towers = [500, 690];
    for (const tx of towers) {
      for (const s of [-1, 1]) d.box(5, 96, 4.4, tx, -6, z + s * 12.5, c);
      for (const y of [30, 52, 74, 86]) d.box(4, 3, 25, tx, y, z, c);
    }
    const cable = (x0, y0, x1, y1, sag) => {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const p = (t) => [lerp(x0, x1, t), lerp(y0, y1, t) - sag * 4 * t * (1 - t)];
        const [xa, ya] = p(t0);
        const [xb, yb] = p(t1);
        const len = Math.hypot(xb - xa, yb - ya);
        for (const s of [-1, 1]) {
          d.box(len + 0.4, 0.9, 0.9, (xa + xb) / 2, (ya + yb) / 2 - 0.45, z + s * 12.5, c, 0, 0, Math.atan2(yb - ya, xb - xa));
          if (k > 0) d.box(0.35, ya - 24.6, 0.35, xa, 24.6, z + s * 12.5, c);
        }
      }
    };
    // The stiffening truss along each side of the deck.
    for (const sd of [-1, 1]) {
      d.box(560, 0.9, 0.9, 690, 16.5, z + sd * 12, c);
      for (let x = 418; x < 960; x += 14) {
        const up = Math.round((x - 418) / 14) % 2 === 0 ? 1 : -1;
        d.box(Math.hypot(14, 5.5), 0.7, 0.7, x + 7, 19.2, z + sd * 12, c, 0, 0, up * Math.atan2(5.5, 14));
      }
    }
    // Cross-bracing between the tower legs.
    for (const tx of towers) {
      for (const [y0, y1] of [[33, 52], [55, 74]]) {
        const len = Math.hypot(25, y1 - y0);
        const tilt = Math.atan2(y1 - y0, 25);
        d.box(1.2, 1.2, len, tx, (y0 + y1) / 2 - 0.6, z, c, 0, tilt, 0);
        d.box(1.2, 1.2, len, tx, (y0 + y1) / 2 - 0.6, z, c, 0, -tilt, 0);
      }
    }
    cable(402, 27, 500, 90, 6);
    cable(500, 90, 690, 90, 52);
    cable(690, 90, 880, 27, 6);
    // Penn's Landing piers.
    for (const pz of [-40, 60, 170]) d.box(46, 1.8, 13, 434, -1.4, pz, 0x8a7a66);
  }

  // ---- West bank: the zoo and 30th Street Station -------------------------
  {
    const wall = 0x9b8f7c;
    const g = PLACES.zooGate;
    const x0 = -616;
    const x1 = -520;
    const z0 = g.z - 48;
    const z1 = g.z + 48;
    const seg = (cx, cz, w, dd) => {
      d.box(w, 10, dd, cx, 0, cz, wall);
      d.box(w + 0.8, 0.8, dd + 0.8, cx, 10, cz, 0x7d7362);
      city.addCollider(cx, cz, w, dd, 10.8);
    };
    seg((x0 + x1) / 2, z0, 100, 4);
    seg((x0 + x1) / 2, z1, 100, 4);
    seg(x0, g.z, 4, 96);
    seg(x1, (z0 + g.z - 13) / 2, 4, g.z - 13 - z0);
    seg(x1, (z1 + g.z + 13) / 2, 4, z1 - g.z - 13);
    for (const s of [-1, 1]) {
      d.box(6, 15, 6, x1, 0, g.z + s * 14.5, 0x8a7f6d);
      d.cone(4.6, 3, x1, 15, g.z + s * 14.5, 0x3f6b52, 4, Math.PI / 4);
    }
    d.box(3, 3.4, 30, x1, 15.5, g.z, 0x3f6b52);
    for (const s of [-1, 1]) {
      const sign = signPlane('ZOO', 16, 5.2, '#2f5a43', '#f3eee4');
      sign.position.set(x1 + s * 1.9, 21.8, g.z);
      sign.rotation.y = (s * Math.PI) / 2;
      city.group.add(sign);
    }
    d.box(3.4, 6, 18, x1, 18.9, g.z, 0x2f5a43);
    // The gate itself can be punched down.
    city.gate = city.addBuilding('plain', x1, g.z, 2.4, 23, 10.5, { color: 0x3f6b52, hp: 26 });
    city.addSlab(x0 + 2, z0 + 2, x1 - 2, z1 - 2, 0x7a9150, 0.3);
    city.addSlab(x1 + 2, g.z - 12, -500, g.z + 12, COL.sidewalk, 0.27);
    // The ape house: a rock den at the back of the yard.
    const rocks = [[-604, g.z - 6, 9], [-606, g.z + 8, 7], [-598, g.z + 16, 5.5], [-600, g.z - 20, 6.5], [-608, g.z - 28, 5]];
    for (const [rx, rz, rr] of rocks) d.ball(rr, rx, rr * 0.45, rz, 0x7c7f86, 1.2, 0.9, 1.1, 0);
    d.cyl(11, 0.14, -555, 0.3, g.z + 26, 0x2f5f78, 12);
    for (const [tx, tz] of [[-540, g.z - 36], [-580, g.z - 38], [-590, g.z + 38], [-534, g.z + 36], [-562, g.z - 30]]) tree(tx, tz, 1.3);

    // 30th Street Station.
    const sx = -574;
    city.addBuilding('stone', sx, 6, 62, 124, 27, { fixed: true, color: 0xd2cab8 });
    d.box(40, 5, 100, sx, 27, 6, 0xc5bda9);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) d.cyl(2.2, 22, sx + s * 34.5, 0.2, -14 + k * 8, 0xe2dccb, 8);
      d.box(8, 4.5, 50, sx + s * 34.5, 22.2, 6, 0xd2cab8);
    }
    // University City blocks and a few houses north of the station.
    for (const [bx, bz, w, dd, h] of [[-590, 120, 34, 30, 30], [-548, 126, 30, 40, 22], [-584, 190, 40, 34, 46], [-545, 196, 26, 30, 18], [-590, 290, 36, 44, 26], [-546, 300, 28, 34, 36], [-572, 356, 60, 30, 20]]) {
      city.addBuilding(h > 28 ? 'office' : 'brick', bx, bz, w, dd, h, { color: h > 28 ? pickc(OFFICE) : pickc(BRICK) });
    }
    for (let k = 0; k < 7; k++) city.addBuilding('brick', -606 + k * 10, -110, 9.6, 22, R(9, 13), { color: pickc(BRICK), hp: 20 });
    for (let k = 0; k < 7; k++) city.addBuilding('brick', -606 + k * 10, -164, 9.6, 22, R(9, 13), { color: pickc(BRICK), hp: 20 });
    for (let k = 0; k < 46; k++) {
      const x = R(-624, -506);
      const z = R(-390, 390);
      const inZoo = x < x1 + 6 && z > z0 - 6 && z < z1 + 6;
      const inStation = x < -536 && z > -62 && z < 74;
      const onRoad = Math.abs(z - g.z) < 16 || Math.abs(z) < 18;
      const inTown = (z > 96 && z < 380 && x < -524) || (z > -180 && z < -96);
      if (!inZoo && !inStation && !onRoad && !inTown) tree(x, z);
    }
  }

  // ---- far-off city, beyond the edge of play ------------------------------
  for (let x = -400; x <= 400; x += 40) {
    for (const [z, hi] of [[-436, 30], [-490, 55], [436, 26], [490, 44], [550, 70]]) {
      if (z < 0 && x < -230) continue;
      const brick = rng() < 0.5;
      city.addBuilding(brick ? 'brick' : 'office', x + R(-6, 6), z, R(24, 34), R(26, 40), R(10, hi), { solid: false, color: brick ? pickc(BRICK) : pickc(OFFICE) });
    }
  }
  for (let z = -420; z <= 420; z += 44) {
    city.addBuilding('brick', -680 + R(-8, 8), z, R(26, 36), R(26, 36), R(10, 30), { solid: false, color: pickc(BRICK) });
    if (rng() < 0.6) city.addBuilding('office', -760 + R(-10, 10), z + 12, R(28, 40), R(28, 40), R(20, 60), { solid: false, color: pickc(OFFICE) });
    if (rng() < 0.55) city.addBuilding('office', 690 + R(-20, 30), z, R(26, 40), R(26, 40), R(14, 60), { solid: false, color: pickc(OFFICE) });
  }

  city.finalize();
  city.places = PLACES;
  city.name = 'Philadelphia';
  return city;
}
