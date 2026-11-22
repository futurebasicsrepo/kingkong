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
  asphalt: 0x3a3e49,
  sidewalk: 0xa9a69e,
  plaza: 0xcfc8b8,
  grass: 0x62a850,
  grassDark: 0x4f9544,
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
  plane(640, 3200, 0, groundMaterial(1, 0x55664f));
  const bed = new THREE.MeshStandardMaterial({ color: 0x14303c, roughness: 1 });
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
  city.addSlab(-1600, -1600, -500, 1600, 0x8f9a84, 0.2);
  city.addSlab(-430, -1600, -399, 1600, COL.grass, 0.3);
  city.addSlab(399, -1600, 412, 1600, COL.sidewalk, 0.25);
  // Fairmount Park around the museum.
  city.addSlab(-430, -1600, -243, -243, COL.grass, 0.31);
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

  const parkTrees = (b, n, clearR = 14) => {
    for (let k = 0; k < n; k++) {
      const x = R(b.x0 + 4, b.x1 - 4);
      const z = R(b.z0 + 4, b.z1 - 4);
      if (Math.hypot(x - b.cx, z - b.cz) > clearR) tree(x, z);
    }
  };

  const fountain = (x, z, r, jet) => {
    d.cyl(r, 1.3, x, 0.3, z, 0xbdb6a6, 16);
    d.cyl(r - 1.2, 0.3, x, 1.4, z, 0x58a8d8, 16);
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
          city.addBuilding(brick ? 'brick' : 'office', x, z, R(22, 27), R(22, 27), R(22, 58), { color: brick ? pickc(BRICK) : pickc(OFFICE) });
        }
        continue;
      }

      if (zone === 'oldcity') {
        for (let a = 0; a < 3; a++) {
          for (let c = 0; c < 2; c++) {
            const x = b.x0 + 10 + a * 20;
            const z = b.z0 + 15 + c * 30;
            city.addBuilding('brick', x, z, R(16, 19), R(22, 27), R(12, 22), { color: pickc(BRICK) });
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

  // ---- City Hall ---------------------------------------------------------
  {
    const s = COL.stone;
    city.addBuilding('stone', 0, 0, 72, 72, 24, { fixed: true, color: s });
    city.addBuilding('stone', 0, -26, 20, 20, 80, { fixed: true, solid: false, color: s });
    const m = new MeshBuilder();
    m.box(68, 6, 68, 0, 24, 0, COL.slate); // mansard roof
    m.box(40, 1.2, 40, 0, 30, 0, 0x3b444e);
    for (const [cx, cz] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) {
      m.box(16, 34, 16, cx, 0, cz, s);
      m.cone(11.5, 12, cx, 34, cz, COL.slate, 4, Math.PI / 4);
    }
    for (const [cx, cz, w, dd] of [[0, 34, 22, 8], [-34, 0, 8, 22], [34, 0, 8, 22]]) {
      m.box(w, 32, dd, cx, 0, cz, s);
      m.cone(Math.max(w, dd) * 0.62, 9, cx, 32, cz, COL.slate, 4, Math.PI / 4);
    }
    // The tower, with its clock faces and William Penn on top.
    m.box(23, 2.5, 23, 0, 80, -26, s);
    m.cyl(10, 18, 0, 82.5, -26, s, 8);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      m.add(GEO.cyl(16), 0xf3e7b8, Math.sin(a) * 10, 91.5, -26 + Math.cos(a) * 10, 4.6, 0.5, 4.6, a, Math.PI / 2, 0);
      m.add(GEO.cube(), 0x2a2a2a, Math.sin(a) * 10.6, 92.6, -26 + Math.cos(a) * 10.6, 0.5, 3.4, 0.3, a);
    }
    m.cyl(11.2, 1.6, 0, 100.5, -26, s, 8);
    m.dome(9, 13, 0, 102, -26, COL.slate, 8);
    m.cyl(3.2, 5, 0, 114, -26, s, 8);
    m.cyl(1.9, 6.5, 0, 119, -26, COL.bronze, 6, 0.75); // Penn's coat
    m.ball(1.25, 0, 126.6, -26, COL.bronze);
    m.cyl(1.9, 0.4, 0, 127.5, -26, COL.bronze, 8); // hat brim
    m.cyl(1.0, 1.0, 0, 127.9, -26, COL.bronze, 8);
    d.merge(m);
    // Dilworth Park furniture on the west side: planters and lamps at the edges.
    for (const z of [-60, -30, 30, 60]) {
      d.box(8, 1.2, 3, -142, 0.3, z, 0x8d8a83);
      tree(-142, z, 0.8);
    }
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
    m.box(116, 6, 64, 0, 0, 0, 0xcbb894); // terrace
    m.box(88, 20, 22, 0, 6, -18, c); // main block
    m.prism(24, 7, 90, 0, 26, -18, COL.teal, Math.PI / 2);
    for (const s of [-1, 1]) {
      m.box(22, 17, 34, s * 40, 6, 9, c); // wings
      m.prism(24, 6, 36, s * 40, 23, 9, COL.teal);
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
    city.addSlab(x0 + 2, z0 + 2, x1 - 2, z1 - 2, 0x7fae5c, 0.3);
    city.addSlab(x1 + 2, g.z - 12, -500, g.z + 12, COL.sidewalk, 0.27);
    // The ape house: a rock den at the back of the yard.
    const rocks = [[-604, g.z - 6, 9], [-606, g.z + 8, 7], [-598, g.z + 16, 5.5], [-600, g.z - 20, 6.5], [-608, g.z - 28, 5]];
    for (const [rx, rz, rr] of rocks) d.ball(rr, rx, rr * 0.45, rz, 0x7c7f86, 1.2, 0.9, 1.1, 0);
    d.cyl(11, 0.14, -555, 0.3, g.z + 26, 0x58a8d8, 12);
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
