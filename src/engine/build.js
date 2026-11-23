import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decorMaterial, detail } from './materials.js';

// Set by the renderer before a city is built: on phones the instanced
// models (trees, cars, street furniture) are swapped for much lighter ones.
export { detail };

// Shared primitive geometry. Everything in the game is built from these.
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export const GEO = {
  // Unit box sitting on the ground: x and z from -0.5 to 0.5, y from 0 to 1.
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  // Unit box centred on the origin.
  cube: () => cached('cube', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 8, top = 1) =>
    cached(`cyl${seg}_${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg).translate(0, 0.5, 0)),
  cone: (seg = 8) => cached('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)),
  ico: (detail = 1) => cached('ico' + detail, () => new THREE.IcosahedronGeometry(1, detail)),
  sphere: (w = 10, h = 7) => cached(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  dome: (seg = 10) =>
    cached('dome' + seg, () => new THREE.SphereGeometry(1, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2)),
  // Triangular prism (a roof or a pediment): 1 wide, 1 high, 1 deep, base on the ground.
  prism: () =>
    cached('prism', () => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0.5, 0);
      s.lineTo(0, 1);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
    }),
  capsule: (seg = 8) => cached('cap' + seg, () => new THREE.CapsuleGeometry(1, 1, 3, seg)),
  ring: () => cached('ring', () => new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2)),
  disc: () => cached('disc', () => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),

  // A tree crown about one unit in radius: a cluster of lumpy lobes with
  // smooth normals and shading baked into the vertex colours (dark inside
  // and underneath, bright on top), so it reads as a mass of leaves.
  crown: () =>
    cached('crown' + detail.low, () => {
      const lobes = detail.low
        ? [[0, -0.05, 0, 0.82], [0.42, 0.12, 0.2, 0.6], [-0.38, 0.2, -0.22, 0.6], [0.02, 0.42, 0.02, 0.56]]
        : [
            [0, 0.04, 0, 0.76], [0.56, -0.14, 0.14, 0.5], [-0.5, -0.1, 0.3, 0.5], [-0.16, -0.16, -0.56, 0.5],
            [0.36, -0.1, -0.46, 0.46], [0.14, 0.48, 0.06, 0.5], [-0.32, 0.32, -0.14, 0.4],
          ];
      const hash = (x, y, z) => {
        const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        return n - Math.floor(n);
      };
      const parts = [];
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (const [lx, ly, lz, r] of lobes) {
        const g = new THREE.IcosahedronGeometry(1, detail.low ? 0 : 1);
        g.deleteAttribute('uv');
        const pos = g.attributes.position;
        const nor = g.attributes.normal;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).normalize();
          const bump = (1 + (detail.low ? 0.2 : 0.34) * (hash(Math.round(v.x * 50), Math.round(v.y * 50), Math.round(v.z * 50) + lx * 9) - 0.5)) * (v.y < -0.3 ? 0.82 : 1);
          n.copy(v);
          v.multiplyScalar(r * bump).add(n.clone().set(lx, ly, lz));
          pos.setXYZ(i, v.x, v.y, v.z);
          n.multiplyScalar(0.55).add(v.clone().normalize().multiplyScalar(0.75)).normalize();
          nor.setXYZ(i, n.x, n.y, n.z);
          const height = THREE.MathUtils.smoothstep(v.y, -0.75, 0.85);
          const outer = THREE.MathUtils.clamp(v.length() / 0.95, 0, 1);
          const shade = (0.42 + 0.63 * height) * (0.72 + 0.28 * outer);
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      }
      return mergeGeometries(parts, false);
    }),

  // A trunk one unit tall and one in radius at the foot, forking into limbs
  // that reach up into the crown. Scaled per tree like the plain cylinder.
  trunk: () =>
    cached('trunk' + detail.low, () => {
      if (detail.low) return new THREE.CylinderGeometry(0.6, 1, 1, 4).translate(0, 0.5, 0);
      const mb = new MeshBuilder();
      const bark = 0xffffff;
      mb.cyl(1, 0.2, 0, 0, 0, bark, 7, 0.8);
      mb.cyl(0.8, 0.82, 0, 0.18, 0, bark, 7, 0.7);
      // Limbs: [turn, lean, length, thickness]
      for (const [turn, lean, len, r] of [[0.4, 0.5, 0.55, 0.42], [2.5, 0.62, 0.5, 0.38], [4.3, 0.45, 0.58, 0.4], [1.5, 0.15, 0.6, 0.36]]) {
        mb.add(GEO.cyl(5, 0.55), bark, 0, 0.9, 0, r, len, r, turn, 0, lean * 3.2);
      }
      return mb.geometry();
    }),

  // A parked car, split in two so the paint can take an instance colour
  // while glass, tyres and lamps keep their own. Nose toward +z.
  carBody: () =>
    cached('carBody' + detail.low, () => {
      const mb = new MeshBuilder();
      mb.box(1.9, 0.5, 4.5, 0, 0.32, 0, 0xffffff);
      if (detail.low) {
        mb.box(1.62, 0.09, 1.9, 0, 1.47, -0.3, 0xffffff);
        return mb.geometry();
      }
      mb.box(1.86, 0.16, 3.0, 0, 0.82, -0.25, 0xffffff);
      mb.box(1.3, 0.08, 1.95, 0, 1.47, -0.3, 0xffffff);
      return mb.geometry();
    }),
  carCabin: () =>
    cached('carCabin' + detail.low, () => {
      const mb = new MeshBuilder();
      // The glasshouse leans in toward the roof, so screens and pillars slope.
      if (detail.low) mb.box(1.56, 0.65, 2.25, 0, 0.82, -0.3, 0x141c24);
      else mb.add(GEO.frustum(0.76), 0x141c24, 0, 0.84, -0.3, 1.7, 0.64, 2.75);
      if (detail.low) {
        // Two axle-wide blocks stand in for four tyres.
        for (const z of [1.42, -1.42]) mb.box(1.94, 0.66, 0.66, 0, 0.03, z, 0x0c0c0d);
        return mb.geometry();
      }
      for (const z of [1.42, -1.42]) {
        mb.add(GEO.cyl(8), 0x0c0c0d, 0.96, 0.36, z, 0.36, 0.26, 0.36, 0, 0, Math.PI / 2);
        mb.add(GEO.cyl(8), 0x0c0c0d, -0.7, 0.36, z, 0.36, 0.26, 0.36, 0, 0, Math.PI / 2);
      }
      mb.box(1.92, 0.2, 0.1, 0, 0.3, 2.24, 0x1a1a1b);
      mb.box(1.92, 0.2, 0.1, 0, 0.3, -2.24, 0x1a1a1b);
      for (const sx of [-1, 1]) {
        mb.box(0.42, 0.13, 0.05, sx * 0.62, 0.62, 2.25, 0xf2ecd2);
        mb.box(0.4, 0.12, 0.05, sx * 0.64, 0.66, -2.25, 0x9c1414);
      }
      return mb.geometry();
    }),

  // A city bus, split like the car: the paintwork takes the instance colour.
  busBody: () =>
    cached('busBody' + detail.low, () => {
      const mb = new MeshBuilder();
      mb.box(2.7, 2.55, 10.6, 0, 0.5, 0, 0xffffff);
      if (!detail.low) mb.box(2.1, 0.3, 3.2, 0, 3.05, -1.6, 0xffffff);
      return mb.geometry();
    }),
  busCabin: () =>
    cached('busCabin' + detail.low, () => {
      const mb = new MeshBuilder();
      const glass = 0x141c24;
      for (const sx of [-1, 1]) {
        mb.box(0.08, 0.95, 9.2, sx * 1.36, 1.85, -0.3, glass);
        mb.box(0.08, 0.3, 10.4, sx * 1.37, 1.3, 0, 0x1f7a78);
      }
      mb.box(2.4, 1.15, 0.08, 0, 1.7, 5.31, glass);
      mb.box(2.3, 0.8, 0.08, 0, 1.9, -5.31, glass);
      if (detail.low) {
        for (const z of [3.4, -3.2]) mb.box(2.76, 0.9, 0.9, 0, 0.03, z, 0x0c0c0d);
        return mb.geometry();
      }
      for (const z of [3.5, -3.3]) {
        mb.add(GEO.cyl(8), 0x0c0c0d, 1.42, 0.5, z, 0.5, 0.36, 0.5, 0, 0, Math.PI / 2);
        mb.add(GEO.cyl(8), 0x0c0c0d, -1.06, 0.5, z, 0.5, 0.36, 0.5, 0, 0, Math.PI / 2);
      }
      mb.box(1.7, 0.34, 0.06, 0, 2.72, 5.32, 0xe0a020);
      for (const sx of [-1, 1]) {
        mb.box(0.4, 0.2, 0.06, sx * 0.95, 0.8, 5.32, 0xf2ecd2);
        mb.box(0.36, 0.2, 0.06, sx * 0.95, 0.9, -5.32, 0x9c1414);
      }
      return mb.geometry();
    }),

  // A market stall: a trestle of produce under a striped canopy.
  stall: () =>
    cached('stall', () => {
      const mb = new MeshBuilder();
      mb.box(3.6, 0.9, 1.6, 0, 0, 0, 0x7a5a3a);
      const produce = [0xb5352a, 0xd98a2b, 0x4f8a3d, 0xd9c23b];
      for (let k = 0; k < 4; k++) mb.box(0.8, 0.35, 1.3, -1.35 + k * 0.9, 0.9, 0, produce[k]);
      for (const x of [-1.8, 1.8]) for (const z of [-0.9, 0.9]) mb.box(0.1, 3.0, 0.1, x, 0, z, 0x2c2f33);
      for (let k = 0; k < 6; k++) mb.box(0.68, 0.12, 2.5, -1.7 + k * 0.68, 3.0, 0.15, k % 2 ? 0xf2efe6 : 0xb3261c, 0, 0.12);
      return mb.geometry();
    }),

  // A box whose top is narrower than its base by the factor t: a mansard
  // roof, a plinth, a battered wall.
  frustum: (t = 0.6) =>
    cached('frustum' + t, () => {
      const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.99) pos.setXYZ(i, pos.getX(i) * t, 1, pos.getZ(i) * t);
      g.computeVertexNormals();
      return g;
    }),

  // Street furniture, at human size. Each faces +z.
  bench: () =>
    cached('bench', () => {
      const mb = new MeshBuilder();
      const wood = 0x6b4a2f;
      const iron = 0x26282a;
      mb.box(2.0, 0.08, 0.5, 0, 0.42, 0, wood);
      mb.box(2.0, 0.5, 0.07, 0, 0.55, -0.26, wood, 0, -0.15);
      for (const x of [-0.85, 0.85]) mb.box(0.07, 0.45, 0.5, x, 0, 0, iron);
      return mb.geometry();
    }),
  bin: () =>
    cached('bin', () => {
      const mb = new MeshBuilder();
      mb.cyl(0.36, 0.95, 0, 0, 0, 0x2f4034, 8, 1.12);
      mb.cyl(0.42, 0.08, 0, 0.95, 0, 0x1c1d1e, 8);
      return mb.geometry();
    }),
  hydrant: () =>
    cached('hydrant', () => {
      const mb = new MeshBuilder();
      const red = 0xb3261c;
      mb.cyl(0.2, 0.62, 0, 0, 0, red, 7);
      mb.dome(0.2, 0.16, 0, 0.62, 0, red, 7);
      mb.box(0.62, 0.14, 0.14, 0, 0.4, 0, red);
      mb.cyl(0.26, 0.07, 0, 0, 0, 0x7d7d7a, 7);
      return mb.geometry();
    }),
  shelter: () =>
    cached('shelter', () => {
      const mb = new MeshBuilder();
      const frame = 0x2c2f33;
      const glass = 0x7f97a6;
      mb.box(4.2, 0.12, 1.6, 0, 2.5, 0, frame);
      mb.box(4.0, 2.3, 0.06, 0, 0.2, -0.72, glass);
      for (const x of [-2.0, 2.0]) {
        mb.box(0.1, 2.5, 0.1, x, 0, -0.72, frame);
        mb.box(0.1, 2.5, 0.1, x, 0, 0.7, frame);
      }
      mb.box(0.06, 2.0, 1.3, -2.0, 0.3, 0, glass);
      mb.box(2.6, 0.08, 0.4, 0.3, 0.5, -0.45, 0x6b4a2f);
      mb.box(0.9, 1.5, 0.08, 1.5, 0.6, 0.72, 0xd8d2c0);
      return mb.geometry();
    }),

  // A cobra-head street lamp; the arm reaches along +x.
  lamp: () =>
    cached('lamp' + detail.low, () => {
      const mb = new MeshBuilder();
      const c = 0x41464a;
      if (detail.low) {
        mb.box(0.24, 8.9, 0.24, 0, 0, 0, c);
        mb.box(3.2, 0.16, 0.3, 1.6, 8.8, 0, c);
        return mb.geometry();
      }
      mb.cyl(0.3, 0.7, 0, 0, 0, c, 6);
      mb.cyl(0.15, 8.9, 0, 0, 0, c, 6, 0.75);
      mb.box(2.7, 0.13, 0.13, 1.3, 8.72, 0, c, 0, 0, 0.1);
      mb.box(1.0, 0.16, 0.38, 2.75, 8.92, 0, c);
      mb.box(0.7, 0.05, 0.26, 2.78, 8.86, 0, 0xfff1c2);
      return mb.geometry();
    }),

  // A traffic signal on a mast arm; the arm reaches along +x.
  signal: () =>
    cached('signal', () => {
      const mb = new MeshBuilder();
      const c = 0x35383b;
      mb.cyl(0.34, 0.8, 0, 0, 0, c, 6);
      mb.cyl(0.19, 6.9, 0, 0, 0, c, 6, 0.8);
      mb.box(8.4, 0.17, 0.17, 4.2, 6.55, 0, c, 0, 0, 0.03);
      for (const x of [4.4, 7.6]) {
        mb.box(0.46, 1.3, 0.34, x, 5.3, 0, 0x1b1c1d);
        mb.box(0.3, 0.3, 0.06, x, 6.2, 0.18, 0xb01c14);
        mb.box(0.3, 0.3, 0.06, x, 5.8, 0.18, 0x6b4a08);
        mb.box(0.3, 0.3, 0.06, x, 5.4, 0.18, 0x0f3d1c);
      }
      mb.box(0.5, 0.75, 0.3, 0.38, 3.0, 0, 0x1b1c1d);
      return mb.geometry();
    }),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Collects coloured primitives and bakes them into one mesh, so a whole
// landmark is a single draw call.
export class MeshBuilder {
  constructor() {
    this.parts = [];
  }

  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    // Round shapes keep their smooth normals; pyramids, prisms and other
    // few-sided shapes are faceted.
    const sides = geo.parameters && (geo.parameters.radialSegments ?? geo.parameters.segments);
    if ((sides && sides <= 5) || (geo.parameters && geo.parameters.detail === 0) || !g.attributes.normal) g.computeVertexNormals();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  // y is the bottom of the shape for all of these.
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    return this.add(GEO.box(), color, x, y, z, w, h, d, ry, rx, rz);
  }
  cyl(r, h, x, y, z, color, seg = 8, top = 1) {
    return this.add(GEO.cyl(seg, top), color, x, y, z, r, h, r);
  }
  cone(r, h, x, y, z, color, seg = 8, ry = 0) {
    return this.add(GEO.cone(seg), color, x, y, z, r, h, r, ry);
  }
  ball(r, x, y, z, color, sx = 1, sy = 1, sz = 1, detail = 1) {
    return this.add(GEO.ico(detail), color, x, y, z, r * sx, r * sy, r * sz);
  }
  dome(r, h, x, y, z, color, seg = 10) {
    return this.add(GEO.dome(seg), color, x, y, z, r, h, r);
  }
  prism(w, h, d, x, y, z, color, ry = 0) {
    return this.add(GEO.prism(), color, x, y, z, w, h, d, ry);
  }

  // Shift and turn everything added so far. Lets a landmark be modelled
  // around its own origin and then dropped into the city.
  place(x, z, ry = 0, y = 0) {
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    for (const g of this.parts) g.applyMatrix4(_m);
    return this;
  }

  merge(other) {
    this.parts.push(...other.parts);
    return this;
  }

  // The merged, flat-shaded geometry on its own.
  geometry() {
    const geo = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts = [];
    return geo;
  }

  build(material) {
    if (!this.parts.length) return new THREE.Group();
    const geo = this.geometry();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

export const staticMaterial = () => cached('staticMat', () => decorMaterial());
