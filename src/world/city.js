import * as THREE from 'three';
import { GEO, MeshBuilder, staticMaterial, detail } from '../engine/build.js';
import { buildingMaterial, groundMaterial, foliageMaterial } from '../engine/materials.js';
import { clamp, clamp01, lerp, smooth } from '../engine/util.js';

const CELL = 40;
const cellKey = (ix, iz) => ix + 512 + (iz + 512) * 1024;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RUBBLE = new THREE.Color(0x6f6a63);

// Small things (paint, trunks, lamps, cars) are physically based on 'high'
// and plain diffuse on phones, where their shine would not be worth its cost.
const simpleMaterial = (opts) => {
  if (!detail.low) return new THREE.MeshStandardMaterial(opts);
  const { roughness, metalness, ...rest } = opts;
  return new THREE.MeshLambertMaterial(rest);
};

// A city is a flat piece of land with rivers, a lot of box buildings drawn as
// instances, and a few hand-built landmarks. This class owns the parts every
// city shares: drawing, collision, and knocking buildings down. Each city file
// (philadelphia.js, ...) fills one in.
export class City {
  constructor(scene, bounds) {
    this.scene = scene;
    this.bounds = bounds;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.cells = new Map();
    this.colliders = [];
    this.queryId = 0;

    this.buildings = [];
    this.pending = { brick: [], office: [], glass: [], stone: [], plain: [] };
    this.spires = [];
    this.meshes = {};
    this.animating = new Set();

    this.slabs = [];
    this.trees = [];
    this.treeCells = new Map();
    this.cars = [];
    this.carCells = new Map();
    this.props = [];
    this.propCount = {};
    this.propCells = new Map();
    this.dashes = [];

    this.waterZones = [];
    this.bridges = [];
    this.heightZones = [];
    this.mapFeatures = [];
    this.decor = new MeshBuilder();
  }

  // ---- colliders -------------------------------------------------------

  addCollider(cx, cz, w, d, h, rot = 0, building = null) {
    const c = {
      cx,
      cz,
      hx: w / 2,
      hz: d / 2,
      h,
      rot,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      building,
      y0: 0,
      dead: false,
      q: 0,
    };
    const r = Math.hypot(c.hx, c.hz);
    const x0 = Math.floor((cx - r) / CELL);
    const x1 = Math.floor((cx + r) / CELL);
    const z0 = Math.floor((cz - r) / CELL);
    const z1 = Math.floor((cz + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = cellKey(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(c);
      }
    }
    this.colliders.push(c);
    return c;
  }

  // Calls fn for every live collider whose cell touches the given box.
  forNear(x0, z0, x1, z1, fn) {
    const q = ++this.queryId;
    const ix0 = Math.floor(x0 / CELL);
    const ix1 = Math.floor(x1 / CELL);
    const iz0 = Math.floor(z0 / CELL);
    const iz1 = Math.floor(z1 / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = this.cells.get(cellKey(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.dead || c.q === q) continue;
          c.q = q;
          fn(c);
        }
      }
    }
  }

  // Pushes a circle (a character's feet) out of any building it overlaps.
  // Returns the building that was touched, if any.
  resolveCircle(pos, r, feetY = 0) {
    let touched = null;
    this.forNear(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (c) => {
      if (feetY >= c.h - 0.5 || feetY + 14 <= c.y0) return;
      const dx = pos.x - c.cx;
      const dz = pos.z - c.cz;
      let lx = dx * c.cos - dz * c.sin;
      let lz = dx * c.sin + dz * c.cos;
      const qx = clamp(lx, -c.hx, c.hx);
      const qz = clamp(lz, -c.hz, c.hz);
      const ex = lx - qx;
      const ez = lz - qz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) return;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        lx = qx + (ex / d) * r;
        lz = qz + (ez / d) * r;
      } else {
        const px = c.hx - Math.abs(lx);
        const pz = c.hz - Math.abs(lz);
        if (px < pz) lx = Math.sign(lx || 1) * (c.hx + r);
        else lz = Math.sign(lz || 1) * (c.hz + r);
      }
      pos.x = c.cx + lx * c.cos + lz * c.sin;
      pos.z = c.cz - lx * c.sin + lz * c.cos;
      touched = c;
    });
    return touched;
  }

  // How far along the line from a to b the view is first blocked by a
  // building (1 = clear). Used to keep the camera out from behind towers.
  rayBlock(ax, ay, az, bx, by, bz) {
    let best = 1;
    this.forNear(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (c) => {
      const oax = ax - c.cx;
      const oaz = az - c.cz;
      const obx = bx - c.cx;
      const obz = bz - c.cz;
      const lax = oax * c.cos - oaz * c.sin;
      const laz = oax * c.sin + oaz * c.cos;
      const dx = obx * c.cos - obz * c.sin - lax;
      const dz = obx * c.sin + obz * c.cos - laz;
      let t0 = 0;
      let t1 = 1;
      if (Math.abs(dx) < 1e-6) {
        if (Math.abs(lax) > c.hx) return;
      } else {
        let a = (-c.hx - lax) / dx;
        let b = (c.hx - lax) / dx;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (Math.abs(dz) < 1e-6) {
        if (Math.abs(laz) > c.hz) return;
      } else {
        let a = (-c.hz - laz) / dz;
        let b = (c.hz - laz) / dz;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (t0 > t1) return;
      const y = lerp(ay, by, t0);
      if (y < c.h && y >= c.y0 && t0 < best) best = t0;
    });
    return best;
  }

  // The highest roof under a point that is no higher than a character could
  // step onto from feetY. 0 when there is nothing to stand on but the street.
  roofAt(x, z, feetY) {
    let top = 0;
    this.forNear(x, z, x, z, (c) => {
      if (c.h > feetY || c.h <= top) return;
      const dx = x - c.cx;
      const dz = z - c.cz;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx + 0.6 && Math.abs(lz) <= c.hz + 0.6) top = c.h;
    });
    return top;
  }

  // ---- land ------------------------------------------------------------

  // The asphalt that lies under the whole city. Pass the street grid
  // ({ pitch, half, x0, x1, z0, z1 }) to have crossings painted at junctions.
  asphalt(color, grid = null) {
    return groundMaterial(0, color, grid);
  }

  addWater(x0, x1) {
    this.waterZones.push({ x0, x1 });
  }

  addBridge(x0, x1, z0, z1) {
    this.bridges.push({ x0, x1, z0, z1 });
  }

  // 0 on dry land, rising to 1 a few steps into a river.
  waterAmount(x, z) {
    let amt = 0;
    for (const w of this.waterZones) {
      if (x <= w.x0 || x >= w.x1) continue;
      amt = Math.max(amt, clamp01(Math.min(x - w.x0, w.x1 - x) / 6));
    }
    if (amt <= 0) return 0;
    for (const b of this.bridges) {
      if (x < b.x0 - 6 || x > b.x1 + 6) continue;
      const dz = Math.max(b.z0 - z, z - b.z1);
      amt = Math.min(amt, clamp01(dz / 5));
    }
    return smooth(amt);
  }

  // A raised area that characters can stand on (steps, terraces).
  // heightAt gets the point in the zone's own frame and returns a height.
  addHeightZone(cx, cz, w, d, rot, heightAt) {
    this.heightZones.push({ cx, cz, hx: w / 2, hz: d / 2, cos: Math.cos(rot), sin: Math.sin(rot), heightAt });
  }

  groundHeight(x, z) {
    let h = 0;
    for (const zn of this.heightZones) {
      const dx = x - zn.cx;
      const dz = z - zn.cz;
      const lx = dx * zn.cos - dz * zn.sin;
      const lz = dx * zn.sin + dz * zn.cos;
      if (Math.abs(lx) > zn.hx || Math.abs(lz) > zn.hz) continue;
      h = Math.max(h, zn.heightAt(lx, lz));
    }
    const w = this.waterAmount(x, z);
    return w > 0 ? h - 3.4 * w : h;
  }

  addSlab(x0, z0, x1, z1, color, h = 0.25, y = 0) {
    this.slabs.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, y, color });
  }

  addDash(x, z, len, alongX, color = 0xe9e4d4, width = 0.6) {
    this.dashes.push({ x, z, len, alongX, color, width });
  }

  addTree(x, z, size = 1, color = 0x4f9a45) {
    const t = { x, z, size, color, flat: 0, idx: this.trees.length };
    this.trees.push(t);
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    let list = this.treeCells.get(k);
    if (!list) this.treeCells.set(k, (list = []));
    list.push(t);
  }

  addCar(x, z, rot, color) {
    const c = { x, z, rot, color, gone: false, idx: this.cars.length };
    this.cars.push(c);
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    let list = this.carCells.get(k);
    if (!list) this.carCells.set(k, (list = []));
    list.push(c);
  }

  // Street furniture: kind names a model in GEO (lamp, signal, bench, bin,
  // hydrant, shelter). It has no collision; it just folds flat when something
  // big walks over it.
  addProp(kind, x, z, rot = 0) {
    // Phones get the lamps and nothing else.
    if (detail.low && kind !== 'lamp') return;
    this.propCount[kind] = (this.propCount[kind] || 0) + 1;
    const p = { kind, x, z, rot, down: false, idx: this.propCount[kind] - 1 };
    this.props.push(p);
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    let cell = this.propCells.get(k);
    if (!cell) this.propCells.set(k, (cell = []));
    cell.push(p);
  }

  // ---- buildings -------------------------------------------------------

  // opts: rot, color, hp, solid (collides), fixed (cannot be knocked down),
  // tiers [{w, d, h}] stacked on top, spire {r, h, color}, roof (false to
  // leave the roof bare).
  addBuilding(style, x, z, w, d, h, opts = {}) {
    const b = {
      style,
      x,
      z,
      w,
      d,
      h,
      rot: opts.rot || 0,
      y: opts.y || 0,
      color: new THREE.Color(opts.color ?? 0xb0a090),
      baseColor: null,
      fixed: !!opts.fixed,
      solid: opts.solid !== false,
      hp: 0,
      maxHp: 0,
      state: 'up',
      t: 0,
      wobble: 0,
      scaleY: 1,
      idx: -1,
      tiers: [],
      roofs: [],
      spire: null,
      collider: null,
    };
    b.baseColor = b.color.clone();
    b.maxHp = b.hp = opts.hp ?? clamp((w * d * h) / 420, 18, 320);
    this.pending[style].push(b);
    let y = b.y + h;
    let topW = w;
    let topD = d;
    for (const t of opts.tiers || []) {
      const tier = { style: t.style || style, w: t.w, d: t.d, h: t.h, y, idx: -1, color: new THREE.Color(t.color ?? opts.color ?? 0xb0a090) };
      this.pending[tier.style].push(tier);
      tier.isTier = true;
      b.tiers.push(tier);
      y += t.h;
      topW = t.w;
      topD = t.d;
    }
    if (opts.spire) {
      b.spire = { r: opts.spire.r, h: opts.spire.h, y, color: new THREE.Color(opts.spire.color ?? 0x55606a), idx: this.spires.length };
      this.spires.push(b);
    } else if (style !== 'plain' && opts.roof !== false && !b.fixed && !detail.low) {
      this.addRoofPlant(b, topW, topD, y);
    }
    b.top = y + (b.spire ? b.spire.h : 0);
    b.colliders = [];
    if (b.solid) {
      // One collider for the body and one for each setback above it, so an
      // ape can stand on every ledge and has to climb each wall.
      b.collider = this.addCollider(x, z, w, d, b.y + h, b.rot, b);
      b.collider.y0 = b.y;
      b.colliders.push(b.collider);
      for (const t of b.tiers) {
        const c = this.addCollider(x, z, t.w, t.d, t.y + t.h, b.rot, b);
        c.y0 = t.y;
        c.tier = true;
        b.colliders.push(c);
      }
    }
    this.buildings.push(b);
    return b;
  }

  // Fixes a plain box to a building at an offset from its centre and a
  // height: a canopy, a sign, a water tank. It is drawn with the roof plant,
  // so it shrinks away when the building comes down, and it has no collider.
  addAttachment(b, ox, oz, w, d, h, y, color) {
    if (detail.low) return;
    const item = { style: 'plain', ox, oz, w, d, h, y, idx: -1, color: new THREE.Color(color), isRoof: true };
    this.pending.plain.push(item);
    b.roofs.push(item);
  }

  // The clutter every real roof carries: lift overruns and plant rooms on
  // big buildings, a stair bulkhead on middling ones, chimneys on houses.
  // It is laid out from the building's position so it is the same each run.
  addRoofPlant(b, w, d, y) {
    let seed = (Math.abs(Math.round(b.x * 13.7 + b.z * 71.3 + w * 3.1)) % 2147483646) + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const put = (ox, oz, rw, rd, rh, color) => {
      const item = { style: 'plain', ox, oz, w: rw, d: rd, h: rh, y, idx: -1, color: new THREE.Color(color), isRoof: true };
      this.pending.plain.push(item);
      b.roofs.push(item);
    };
    const small = Math.min(w, d);
    const steel = [0x8b8f93, 0x74797e, 0x9a9c9a, 0x6a6f74];
    if (small < 12) {
      // A row house: a chimney by the party wall, sometimes a roof hatch.
      const along = w < d;
      const cx = (along ? 0.3 : 0.32) * w * (rnd() < 0.5 ? -1 : 1);
      const cz = (along ? 0.3 : 0.3) * d * (rnd() < 0.5 ? -1 : 1);
      put(cx, cz, 1.3, 1.3, 1.6 + rnd() * 0.8, b.baseColor.clone().multiplyScalar(0.62).getHex());
      if (rnd() < 0.45) put(-cx * 0.4, -cz * 0.5, 1.8, 1.8, 0.7, 0x55585c);
    } else if (small < 22) {
      put((rnd() - 0.5) * w * 0.4, (rnd() - 0.5) * d * 0.4, 3.4, 4.2, 2.9, b.baseColor.clone().multiplyScalar(0.7).getHex());
      if (rnd() < 0.7) put((rnd() - 0.5) * w * 0.55, (rnd() - 0.5) * d * 0.55, 2.4, 2.4, 1.5, steel[Math.floor(rnd() * 4)]);
    } else {
      put((rnd() - 0.5) * w * 0.2, (rnd() - 0.5) * d * 0.2, w * (0.34 + rnd() * 0.16), d * (0.3 + rnd() * 0.16), 3.2 + rnd() * 2.4, steel[Math.floor(rnd() * 4)]);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const side = rnd() < 0.5 ? -1 : 1;
        put(side * w * (0.3 + rnd() * 0.08), (rnd() - 0.5) * d * 0.6, 2.6, 3.4 + rnd() * 2, 1.6 + rnd(), steel[Math.floor(rnd() * 4)]);
      }
    }
  }

  // Turns everything queued by the city file into meshes. Call once.
  finalize() {
    const boxGeo = GEO.box();
    for (const style of Object.keys(this.pending)) {
      const list = this.pending[style];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(boxGeo, buildingMaterial(style), list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.meshes[style] = mesh;
      list.forEach((item, i) => {
        item.idx = i;
        item.mesh = mesh;
      });
      this.group.add(mesh);
    }
    if (this.spires.length) {
      const mesh = new THREE.InstancedMesh(GEO.cone(4), simpleMaterial({ color: 0xffffff, flatShading: true, roughness: 0.35, metalness: 0.6 }), this.spires.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.meshes.spire = mesh;
      this.group.add(mesh);
    }
    for (const b of this.buildings) this.writeBuilding(b);
    for (const mesh of Object.values(this.meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Pavement, lawns and plazas.
    if (this.slabs.length) {
      const mesh = new THREE.InstancedMesh(boxGeo, groundMaterial(1), this.slabs.length);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.slabs.forEach((s, i) => {
        _m.compose(_p.set(s.x, s.y, s.z), _q.identity(), _s.set(s.w, s.h, s.d));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.set(s.color));
      });
      this.meshes.slab = mesh;
      this.group.add(mesh);
    }

    // Lane markings: road paint, a little worn.
    if (this.dashes.length) {
      const mesh = new THREE.InstancedMesh(boxGeo, simpleMaterial({ color: 0xffffff, roughness: 0.7 }), this.dashes.length);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.dashes.forEach((d, i) => {
        _m.compose(_p.set(d.x, 0.005, d.z), _q.identity(), d.alongX ? _s.set(d.len, 0.03, d.width * 0.55) : _s.set(d.width * 0.55, 0.03, d.len));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.set(d.color).multiplyScalar(0.72));
      });
      this.meshes.dash = mesh;
      this.group.add(mesh);
    }

    // Trees: a trunk and a many-lobed crown each.
    if (this.trees.length) {
      const trunk = new THREE.InstancedMesh(GEO.trunk(), simpleMaterial({ color: 0x3a2f27, roughness: 0.95 }), this.trees.length);
      const crown = new THREE.InstancedMesh(GEO.crown(), foliageMaterial(), this.trees.length);
      crown.receiveShadow = true;
      // The crowns are the heaviest thing in the city, so they do not draw
      // into the shadow map themselves: a twenty-triangle stand-in that is
      // invisible to the camera casts each tree's shadow instead.
      const shade = new THREE.InstancedMesh(GEO.ico(0), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), this.trees.length);
      shade.castShadow = true;
      trunk.frustumCulled = crown.frustumCulled = shade.frustumCulled = false;
      this.meshes.trunk = trunk;
      this.meshes.crown = crown;
      this.meshes.treeShade = shade;
      for (const t of this.trees) this.writeTree(t);
      this.group.add(trunk, crown, shade);
    }

    // Parked cars: painted bodywork, and the glass, tyres and lamps.
    if (this.cars.length) {
      const body = new THREE.InstancedMesh(GEO.carBody(), simpleMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.55 }), this.cars.length);
      const cabin = new THREE.InstancedMesh(GEO.carCabin(), simpleMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.5 }), this.cars.length);
      body.castShadow = !detail.low;
      body.receiveShadow = true;
      body.frustumCulled = cabin.frustumCulled = false;
      this.meshes.carBody = body;
      this.meshes.carCabin = cabin;
      for (const c of this.cars) this.writeCar(c);
      this.group.add(body, cabin);
    }

    // Street lamps and traffic signals.
    for (const kind of new Set(this.props.map((p) => p.kind))) {
      const list = this.props.filter((p) => p.kind === kind);
      const mesh = new THREE.InstancedMesh(GEO[kind](), simpleMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 }), list.length);
      mesh.frustumCulled = false;
      this.meshes[kind] = mesh;
      for (const p of list) this.writeProp(p);
      this.group.add(mesh);
    }

    const decor = this.decor.build(staticMaterial());
    this.group.add(decor);
  }

  writeBuilding(b) {
    const jx = b.wobble > 0 ? Math.sin(b.t * 70) * b.wobble * 1.6 : 0;
    const jz = b.wobble > 0 ? Math.cos(b.t * 55) * b.wobble * 1.6 : 0;
    _q.setFromAxisAngle(UP, b.rot);
    const spread = 1 + (1 - b.scaleY) * 0.12;
    _m.compose(_p.set(b.x + jx, b.y, b.z + jz), _q, _s.set(b.w * spread, Math.max(0.01, b.h * b.scaleY), b.d * spread));
    b.mesh.setMatrixAt(b.idx, _m);
    b.mesh.setColorAt(b.idx, b.color);
    const k = clamp01((b.scaleY - 0.25) / 0.75);
    for (const t of b.tiers) {
      _m.compose(_p.set(b.x + jx, t.y * b.scaleY, b.z + jz), _q, _s.set(t.w * k + 0.001, Math.max(0.01, t.h * k), t.d * k + 0.001));
      t.mesh.setMatrixAt(t.idx, _m);
      t.mesh.setColorAt(t.idx, t.color);
      t.mesh.instanceMatrix.needsUpdate = true;
    }
    if (b.roofs.length) {
      const cos = Math.cos(b.rot);
      const sin = Math.sin(b.rot);
      for (const r of b.roofs) {
        const rx = b.x + jx + r.ox * cos + r.oz * sin;
        const rz = b.z + jz - r.ox * sin + r.oz * cos;
        _m.compose(_p.set(rx, r.y * b.scaleY, rz), _q, _s.set(r.w * k + 0.001, Math.max(0.01, r.h * k), r.d * k + 0.001));
        r.mesh.setMatrixAt(r.idx, _m);
        r.mesh.setColorAt(r.idx, r.color);
      }
      b.roofs[0].mesh.instanceMatrix.needsUpdate = true;
    }
    if (b.spire) {
      const sp = b.spire;
      _q.setFromAxisAngle(UP, b.rot + Math.PI / 4);
      _m.compose(_p.set(b.x + jx, sp.y * b.scaleY, b.z + jz), _q, _s.set(sp.r * k + 0.001, Math.max(0.01, sp.h * k), sp.r * k + 0.001));
      this.meshes.spire.setMatrixAt(sp.idx, _m);
      this.meshes.spire.setColorAt(sp.idx, sp.color);
      this.meshes.spire.instanceMatrix.needsUpdate = true;
    }
    b.mesh.instanceMatrix.needsUpdate = true;
    if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
  }

  writeTree(t) {
    const k = 1 - t.flat * 0.88;
    const s = t.size;
    _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.set(0.5 * s, 4.6 * s * k, 0.5 * s));
    this.meshes.trunk.setMatrixAt(t.idx, _m);
    const wide = 3.5 * s * (1 + t.flat * 0.5);
    _m.compose(_p.set(t.x, 6.9 * s * k, t.z), _q.setFromAxisAngle(UP, t.x * 0.37 + t.z), _s.set(wide, 3.9 * s * k, wide));
    this.meshes.crown.setMatrixAt(t.idx, _m);
    this.meshes.crown.setColorAt(t.idx, _c.set(t.color));
    this.meshes.treeShade.setMatrixAt(t.idx, _m);
    this.meshes.trunk.instanceMatrix.needsUpdate = true;
    this.meshes.crown.instanceMatrix.needsUpdate = true;
    this.meshes.treeShade.instanceMatrix.needsUpdate = true;
    if (this.meshes.crown.instanceColor) this.meshes.crown.instanceColor.needsUpdate = true;
  }

  writeCar(c) {
    const k = c.gone ? 0.0001 : 1;
    _q.setFromAxisAngle(UP, c.rot);
    _m.compose(_p.set(c.x, 0, c.z), _q, _s.set(k, k, k));
    this.meshes.carBody.setMatrixAt(c.idx, _m);
    this.meshes.carBody.setColorAt(c.idx, _c.set(c.color));
    this.meshes.carCabin.setMatrixAt(c.idx, _m);
    this.meshes.carBody.instanceMatrix.needsUpdate = true;
    this.meshes.carCabin.instanceMatrix.needsUpdate = true;
    if (this.meshes.carBody.instanceColor) this.meshes.carBody.instanceColor.needsUpdate = true;
  }

  writeProp(p) {
    const mesh = this.meshes[p.kind];
    _q.setFromAxisAngle(UP, p.rot);
    _m.compose(_p.set(p.x, 0.25, p.z), _q, p.down ? _s.set(1.15, 0.03, 1.15) : _s.set(1, 1, 1));
    mesh.setMatrixAt(p.idx, _m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Hurts every building within radius of a point. Returns what happened so
  // the game can add dust, score and sound.
  damageAt(x, z, radius, dmg) {
    const out = { hit: [], destroyed: [] };
    this.forNear(x - radius, z - radius, x + radius, z + radius, (c) => {
      const b = c.building;
      if (!b || b.state !== 'up' || c.tier) return;
      const dx = x - c.cx;
      const dz = z - c.cz;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const ex = Math.max(0, Math.abs(lx) - c.hx);
      const ez = Math.max(0, Math.abs(lz) - c.hz);
      if (ex * ex + ez * ez > radius * radius) return;
      if (b.fixed) {
        out.hit.push(b);
        return;
      }
      b.hp -= dmg;
      b.wobble = 0.3;
      this.animating.add(b);
      if (b.hp <= 0) {
        b.state = 'falling';
        b.t = 0;
        for (const bc of b.colliders) bc.dead = true;
        out.destroyed.push(b);
      } else {
        b.color.copy(b.baseColor).multiplyScalar(0.55 + 0.45 * (b.hp / b.maxHp));
        out.hit.push(b);
      }
    });
    return out;
  }

  // Flattens trees and returns cars near a point, for whoever is stomping by.
  trample(x, z, r, onTree, onCar) {
    const ix0 = Math.floor((x - r) / CELL);
    const ix1 = Math.floor((x + r) / CELL);
    const iz0 = Math.floor((z - r) / CELL);
    const iz1 = Math.floor((z + r) / CELL);
    const r2 = r * r;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = cellKey(ix, iz);
        const trees = this.treeCells.get(k);
        if (trees) {
          for (const t of trees) {
            if (t.flat > 0) continue;
            if ((t.x - x) ** 2 + (t.z - z) ** 2 > r2) continue;
            t.flat = 0.01;
            this.animating.add(t);
            onTree && onTree(t);
          }
        }
        const cars = this.carCells.get(k);
        if (cars) {
          for (const c of cars) {
            if (c.gone) continue;
            if ((c.x - x) ** 2 + (c.z - z) ** 2 > r2) continue;
            c.gone = true;
            this.writeCar(c);
            onCar && onCar(c);
          }
        }
        const props = this.propCells.get(k);
        if (props) {
          for (const p of props) {
            if (p.down) continue;
            if ((p.x - x) ** 2 + (p.z - z) ** 2 > r2) continue;
            p.down = true;
            this.writeProp(p);
          }
        }
      }
    }
  }

  update(dt) {
    for (const o of this.animating) {
      if (o.flat !== undefined) {
        o.flat = Math.min(1, o.flat + dt * 6);
        this.writeTree(o);
        if (o.flat >= 1) this.animating.delete(o);
        continue;
      }
      o.t += dt;
      o.wobble = Math.max(0, o.wobble - dt);
      if (o.state === 'falling') {
        const k = clamp01(o.t / 0.95);
        o.scaleY = lerp(1, Math.min(0.07, 2.6 / o.h), k * k);
        o.color.copy(o.baseColor).lerp(RUBBLE, k);
        o.wobble = (1 - k) * 0.35;
        if (k >= 1) {
          o.state = 'rubble';
          o.wobble = 0;
        }
      }
      this.writeBuilding(o);
      if (o.state !== 'falling' && o.wobble <= 0) this.animating.delete(o);
    }
  }
}
