import * as THREE from 'three';
import { GEO, detail } from '../engine/build.js';
import { sharedUniforms, simpleMaterial } from '../engine/materials.js';

// Everything in a city that moves on its own or is painted on: traffic,
// fountain spray, steam, falling leaves, flags, beacon lights, flocks of
// birds, murals and shop signs. A city file queues these through the City's
// add* methods; they are built once and then cost almost nothing per frame.
// The spray, flags and lights are animated entirely in their shaders.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const TURN = 2.7; // radius of a U-turn, and how far a lane sits from the centre line

// Words a corner shop can carry. Generic on purpose: no real businesses.
export const SHOP_WORDS = ['PIZZA', 'STEAKS', 'DELI', 'HOAGIES', 'PRETZELS', 'WATER ICE', 'BAKERY', 'MARKET'];
const SHOP_INKS = [['#b3261c', '#f6efdc'], ['#f6efdc', '#1d1d1f'], ['#1f4a36', '#f6efdc'], ['#f2c230', '#1d1d1f'], ['#24588f', '#f6efdc'], ['#f6efdc', '#b3261c'], ['#5b3a24', '#f2e2b8'], ['#1d1d1f', '#f2c230']];

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const rr = (a, b) => a + rnd() * (b - a);

export class CityLife {
  constructor(city) {
    this.city = city;
    this.lanes = [];
    this.vehicles = [];
    this.sprays = [];
    this.flags = [];
    this.flocks = [];
    this.birds = [];
    this.murals = [];
    this.signs = [];
    this.meshes = {};
    this.stomp = { x: 0, z: 0, t: -99 };
    this.time = 0;
  }

  // ---- queued by the city file -------------------------------------------

  // A street that traffic runs up one side of and back down the other.
  // buses: how many of the n vehicles are buses.
  addLane(ax, az, bx, bz, n, speed = 11, buses = 0, colors = [0xb8bcc2]) {
    const len = Math.hypot(bx - ax, bz - az);
    const lane = { ax, az, bx, bz, ux: (bx - ax) / len, uz: (bz - az) / len, len, loop: 2 * len + 2 * Math.PI * TURN, speed, first: this.vehicles.length, n };
    this.lanes.push(lane);
    for (let k = 0; k < n; k++) {
      const bus = k < buses;
      this.vehicles.push({
        lane, bus, s: ((k + rr(0.1, 0.6)) / n) * lane.loop, v: speed, gone: 0, grow: 1,
        color: bus ? 0xe9e4d6 : colors[Math.floor(rnd() * colors.length)], x: 0, z: 0, rot: 0, hx: 0, hz: 1, idx: 0,
      });
    }
  }

  spray(x, y, z, vx, vy, vz, phase, period, gravity, size0, size1, color, wobble = 0, squash = 1, mode = 0, owner = null) {
    this.sprays.push({ x, y, z, vx, vy, vz, phase, rate: 1 / period, gravity, size0, size1, color, wobble, squash, mode, owner });
  }

  // Water thrown up from a basin: one tall jet in the middle and a ring of
  // smaller ones arcing inward.
  addFountain(x, y, z, r, height, ringY = y) {
    const g = 20;
    const k = detail.low ? 0.5 : 1;
    let y0 = y;
    const jet = (ox, oz, h, vxz, n, s0, s1, ax = 0, az = 0) => {
      const vy = Math.sqrt(2 * g * h);
      const T = (2 * vy) / g;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        this.spray(x + ox, y0, z + oz, ax + Math.cos(a) * vxz, vy * rr(0.94, 1.04), az + Math.sin(a) * vxz, i / n + rr(0, 0.5 / n), T, g, s0, s1, 0xe4f1f8);
      }
    };
    jet(0, 0, height, 0.5, Math.round(26 * k), 0.4, 0.95);
    jet(0, 0, height * 0.55, 1.5, Math.round(12 * k), 0.35, 0.8);
    const ring = detail.low ? 5 : 8;
    y0 = ringY;
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const ox = Math.cos(a) * r * 0.72;
      const oz = Math.sin(a) * r * 0.72;
      const h = height * 0.3;
      const T = (2 * Math.sqrt(2 * g * h)) / g;
      jet(ox, oz, h, 0.12, Math.round(8 * k), 0.26, 0.5, (-ox * 0.78) / T, (-oz * 0.78) / T);
    }
  }

  // Steam rising from a grate in the road.
  addVent(x, z) {
    const n = detail.low ? 3 : 5;
    for (let i = 0; i < n; i++) this.spray(x, 0.4, z, rr(0.3, 0.7), rr(2.2, 2.9), rr(-0.3, 0.3), i / n, 3.4, -0.25, 0.45, 2.3, 0xd6d6d2, 0.25, 0.8);
  }

  // Leaves coming down over a patch of park.
  addLeaves(x0, z0, x1, z1, n, colors) {
    const count = Math.round(n * (detail.low ? 0.5 : 1));
    for (let i = 0; i < count; i++) {
      this.spray(rr(x0, x1), rr(7, 12), rr(z0, z1), rr(0.6, 1.6), -rr(1.3, 1.9), rr(-0.5, 0.7), rnd(), rr(5, 7), 0, 0.42, 0.42, colors[Math.floor(rnd() * colors.length)], rr(0.8, 1.6), 0.16);
    }
  }

  // A red light that blinks on top of a tower until the tower comes down.
  addBeacon(building, x, y, z) {
    this.spray(x, y, z, 0, 0, 0, rnd(), 1.4, 0, 1.0, 1.0, 0xff2a1a, 0, 1, 1, building);
  }

  // A flag flying from a point: w long, h deep, the hoist at (x, y, z).
  addFlag(x, y, z, w, h, rot, color) {
    this.flags.push({ x, y, z, w, h, rot, color });
  }

  // Ordinary-size birds pecking about; they go up when the stomper gets near.
  addFlock(x, z, n, radius = 9) {
    const count = Math.round(n * (detail.low ? 0.5 : 1));
    const flock = { x, z, up: false, calm: 0, first: this.birds.length, n: count };
    this.flocks.push(flock);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * radius;
      const hx = x + Math.cos(a) * d;
      const hz = z + Math.sin(a) * d;
      this.birds.push({ flock, hx, hz, x: hx, y: 0, z: hz, rot: rnd() * 6.3, fly: 0, delay: 0, th: rnd() * 6.3, rad: rr(13, 24), alt: rr(11, 20), w: rr(0.8, 1.25) * (rnd() < 0.5 ? 1 : -1), hop: rr(1, 6), tx: hx, tz: hz, size: rr(0.85, 1.2) });
    }
  }

  // A mural on one wall of a building. face: 0 +z, 1 -z, 2 +x, 3 -x. u is the
  // offset along the wall from its centre, y the height of the bottom edge.
  addMural(b, face, u, y, w, h, kind, hue) {
    this.murals.push({ b, face, u, y, w, h, kind, hue });
  }

  // A shop sign: one of SHOP_WORDS, on a wall like a mural.
  addSign(b, face, u, y, w, h, word) {
    this.signs.push({ b, face, u, y, w, h, word });
  }

  // ---- building ----------------------------------------------------------

  // Where a panel on a building's wall sits in the world.
  wallMatrix(o, lift) {
    const b = o.b;
    const out = (face) => (face < 2 ? b.d / 2 : b.w / 2) + lift;
    let lx = 0;
    let lz = 0;
    let ry = 0;
    if (o.face === 0) {
      lx = o.u;
      lz = out(0);
    } else if (o.face === 1) {
      lx = -o.u;
      lz = -out(1);
      ry = Math.PI;
    } else if (o.face === 2) {
      lx = out(2);
      lz = -o.u;
      ry = Math.PI / 2;
    } else {
      lx = -out(3);
      lz = o.u;
      ry = -Math.PI / 2;
    }
    const cos = Math.cos(b.rot);
    const sin = Math.sin(b.rot);
    _q.setFromAxisAngle(UP, b.rot + ry);
    _m.compose(_p.set(b.x + lx * cos + lz * sin, (b.y || 0) + o.y + o.h / 2, b.z - lx * sin + lz * cos), _q, _s.set(o.w, o.h, 1));
    return _m;
  }

  onFall(b, fn) {
    (b.onFall || (b.onFall = [])).push(fn);
  }

  build() {
    const group = this.city.group;
    const low = detail.low;

    // Traffic: the same car as the parked ones, and a bus.
    const cars = this.vehicles.filter((v) => !v.bus);
    const buses = this.vehicles.filter((v) => v.bus);
    const pair = (list, bodyGeo, cabinGeo) => {
      if (!list.length) return null;
      const body = new THREE.InstancedMesh(bodyGeo, simpleMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.55 }), list.length);
      const cabin = new THREE.InstancedMesh(cabinGeo, simpleMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.4 }), list.length);
      body.castShadow = !low;
      body.receiveShadow = true;
      body.frustumCulled = cabin.frustumCulled = false;
      list.forEach((v, i) => {
        v.idx = i;
        v.body = body;
        v.cabin = cabin;
        body.setColorAt(i, _c.set(v.color));
      });
      group.add(body, cabin);
      return { body, cabin };
    };
    this.carMeshes = pair(cars, GEO.carBody(), GEO.carCabin());
    this.busMeshes = pair(buses, GEO.busBody(), GEO.busCabin());
    for (const v of this.vehicles) this.placeVehicle(v);

    // Spray, steam, leaves and beacons: one instanced mesh, moved in the shader.
    if (this.sprays.length) {
      const n = this.sprays.length;
      const geo = new THREE.OctahedronGeometry(1, 0);
      const vel = new Float32Array(n * 3);
      const par = new Float32Array(n * 4);
      const siz = new Float32Array(n * 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 aVel;\nattribute vec4 aPar;\nattribute vec4 aSiz;\nuniform float uTime;')
          .replace(
            '#include <begin_vertex>',
            `float cyc = fract(uTime * aPar.y + aPar.x);
            float age = cyc / aPar.y;
            vec3 off = aVel * age;
            off.y -= 0.5 * aPar.z * age * age;
            off.x += sin(age * 2.1 + aPar.x * 40.0) * aSiz.z;
            off.z += cos(age * 1.7 + aPar.x * 23.0) * aSiz.z;
            float sz = mix(aSiz.x, aSiz.y, cyc) * smoothstep(0.0, 0.06, cyc) * (1.0 - smoothstep(0.86, 1.0, cyc));
            if (aSiz.w > 0.5) {
              off = vec3(0.0);
              sz = aSiz.x * step(0.5, cyc);
            }
            vec3 transformed = position * vec3(sz, sz * aPar.w, sz) + off;`
          );
      };
      mat.customProgramCacheKey = () => 'city-spray';
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.frustumCulled = false;
      this.sprays.forEach((sp, i) => {
        vel.set([sp.vx, sp.vy, sp.vz], i * 3);
        par.set([sp.phase, sp.rate, sp.gravity, sp.squash], i * 4);
        siz.set([sp.size0, sp.size1, sp.wobble, sp.mode], i * 4);
        mesh.setMatrixAt(i, _m.makeTranslation(sp.x, sp.y, sp.z));
        mesh.setColorAt(i, _c.set(sp.color));
        if (sp.owner) this.onFall(sp.owner, () => {
          mesh.setMatrixAt(i, HIDE);
          mesh.instanceMatrix.needsUpdate = true;
        });
      });
      geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(vel, 3));
      geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4));
      geo.setAttribute('aSiz', new THREE.InstancedBufferAttribute(siz, 4));
      this.meshes.spray = mesh;
      group.add(mesh);
    }

    // Flags: a strip of cloth that ripples away from its pole.
    if (this.flags.length) {
      const geo = new THREE.PlaneGeometry(1, 1, low ? 4 : 8, 1).translate(0.5, 0, 0);
      const mat = simpleMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vFlag;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float fph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
            transformed.z += (sin(position.x * 6.0 - uTime * 5.5 + fph) * 0.17 + sin(position.x * 2.3 - uTime * 3.1 + fph) * 0.12) * position.x;
            transformed.y += sin(uTime * 2.0 + fph) * 0.04 * position.x;
            vFlag = vec3(position.x, position.y + 0.5, fract(abs(fph) * 0.37));`
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFlag;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            {
              // Three bands, upright or level, the middle one pale: flags in general, nobody's in particular.
              float band = floor((vFlag.z > 0.5 ? vFlag.x : vFlag.y) * 3.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.88, 0.82), step(0.5, band) * step(band, 1.5) * 0.92);
              diffuseColor.rgb *= 0.86 + 0.14 * sin(vFlag.x * 6.0);
            }`
          );
      };
      mat.customProgramCacheKey = () => 'city-flag' + (low ? '-low' : '');
      const mesh = new THREE.InstancedMesh(geo, mat, this.flags.length);
      mesh.frustumCulled = false;
      this.flags.forEach((f, i) => {
        _q.setFromAxisAngle(UP, f.rot);
        mesh.setMatrixAt(i, _m.compose(_p.set(f.x, f.y, f.z), _q, _s.set(f.w, f.h, 1)));
        mesh.setColorAt(i, _c.set(f.color));
      });
      group.add(mesh);
    }

    // Birds: two triangles each, flapped in the shader while they fly.
    if (this.birds.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.45, 0.75, 0, -0.1, 0, 0, -0.3, 0, 0, 0.45, 0, 0, -0.3, -0.75, 0, -0.1, 0, 0.12, 0.5, 0.12, 0, 0, -0.12, 0, 0]), 3));
      geo.computeVertexNormals();
      const fly = new Float32Array(this.birds.length);
      geo.setAttribute('aFly', new THREE.InstancedBufferAttribute(fly, 1));
      const mat = new THREE.MeshLambertMaterial({ color: 0x5f6672, side: THREE.DoubleSide });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aFly;\nuniform float uTime;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += step(0.4, abs(position.x)) * sin(uTime * 19.0 + instanceMatrix[3].x * 3.0) * 0.45 * aFly;');
      };
      mat.customProgramCacheKey = () => 'city-bird';
      const mesh = new THREE.InstancedMesh(geo, mat, this.birds.length);
      mesh.frustumCulled = false;
      this.meshes.bird = mesh;
      this.birdFly = geo.attributes.aFly;
      this.birds.forEach((b, i) => {
        b.idx = i;
        this.placeBird(b);
      });
      group.add(mesh);
    }

    // Murals: bold shapes drawn by the shader from a seed.
    if (this.murals.length) {
      const n = this.murals.length;
      const geo = new THREE.PlaneGeometry(1, 1);
      const look = new Float32Array(n * 3);
      const mat = simpleMaterial({ color: 0xffffff, roughness: 0.9 });
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 aLook;\nvarying vec4 vMural;\nvarying float vMuralHue;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMural = vec4(uv, length(instanceMatrix[0].xyz) / length(instanceMatrix[1].xyz), aLook.x);\nvMuralHue = aLook.y;');
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec4 vMural;
            varying float vMuralHue;
            vec3 muralInk(float i) {
              // Four strong colours a third of the wheel apart, plus cream.
              vec3 c = 0.5 + 0.5 * cos(6.2831 * (vMuralHue + i * 0.27 + vec3(0.0, 0.33, 0.67)));
              c = mix(vec3(dot(c, vec3(0.33))), c, 0.82) * 0.92;
              return mix(c, vec3(0.93, 0.89, 0.78), step(3.5, i));
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            {
              vec2 p = vec2(vMural.x * vMural.z, vMural.y);
              float asp = vMural.z;
              float kind = vMural.w;
              float ink = 0.0;
              if (kind < 0.5) {
                // A sun coming up behind hills.
                vec2 c = vec2(asp * 0.5, 0.32);
                float ang = atan(p.y - c.y, p.x - c.x);
                ink = mod(floor(ang * 5.1 + 20.0), 2.0);
                if (length(p - c) < 0.2) ink = 2.0;
                if (p.y < 0.26 + 0.08 * sin(p.x * 7.0)) ink = 3.0;
                if (p.y < 0.13 + 0.05 * sin(p.x * 4.0 + 2.0)) ink = 4.0;
              } else if (kind < 1.5) {
                // Rolling bands.
                ink = mod(floor((p.y + 0.09 * sin(p.x * 5.0 + floor(p.y * 4.0))) * 6.0), 5.0);
              } else if (kind < 2.5) {
                // Overlapping discs.
                ink = 4.0;
                if (length(p - vec2(asp * 0.3, 0.58)) < 0.3) ink = 0.0;
                if (length(p - vec2(asp * 0.62, 0.42)) < 0.26) ink = 1.0;
                if (length(p - vec2(asp * 0.5, 0.7)) < 0.16) ink = 2.0;
                if (abs(length(p - vec2(asp * 0.76, 0.72)) - 0.14) < 0.035) ink = 3.0;
                if (p.y < 0.12) ink = 3.0;
              } else {
                // A quilt of triangles.
                vec2 g = p * 4.5;
                vec2 id = floor(g);
                vec2 f = fract(g);
                float flip = step(f.x + f.y, 1.0);
                ink = mod(floor(fract(sin(dot(id + flip * 0.37, vec2(12.99, 78.23))) * 43758.5) * 5.0), 5.0);
              }
              vec3 col = muralInk(ink);
              vec2 edge = min(vMural.xy, 1.0 - vMural.xy) * vec2(asp, 1.0);
              col = mix(vec3(0.16, 0.15, 0.14), col, step(0.025, min(edge.x, edge.y)));
              diffuseColor.rgb = col * (0.86 + 0.14 * fract(sin(dot(floor(p * 60.0), vec2(1.7, 9.2))) * 437.5));
            }`
          );
      };
      mat.customProgramCacheKey = () => 'city-mural' + (low ? '-low' : '');
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.murals.forEach((o, i) => {
        look.set([o.kind, o.hue, 0], i * 3);
        mesh.setMatrixAt(i, this.wallMatrix(o, 0.14));
        this.onFall(o.b, () => {
          mesh.setMatrixAt(i, HIDE);
          mesh.instanceMatrix.needsUpdate = true;
        });
      });
      geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 3));
      group.add(mesh);
    }

    // Shop signs: all the words on one sheet, one row each.
    if (this.signs.length && typeof document !== 'undefined') {
      const rows = SHOP_WORDS.length;
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = rows * 96;
      const g = cv.getContext('2d');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      SHOP_WORDS.forEach((word, r) => {
        const [bg, fg] = SHOP_INKS[r % SHOP_INKS.length];
        g.fillStyle = bg;
        g.fillRect(0, r * 96, 512, 96);
        g.strokeStyle = fg;
        g.lineWidth = 5;
        g.strokeRect(7, r * 96 + 7, 498, 82);
        g.fillStyle = fg;
        g.font = `900 ${word.length > 7 ? 54 : 64}px Impact, "Arial Black", sans-serif`;
        g.fillText(word, 256, r * 96 + 52);
      });
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const n = this.signs.length;
      const geo = new THREE.PlaneGeometry(1, 1);
      const row = new Float32Array(n);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aRow;')
          .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2(uv.x, (uv.y + ${rows - 1}.0 - aRow) / ${rows}.0);`);
      };
      mat.customProgramCacheKey = () => 'city-sign';
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.frustumCulled = false;
      this.signs.forEach((o, i) => {
        row[i] = Math.max(0, SHOP_WORDS.indexOf(o.word));
        mesh.setMatrixAt(i, this.wallMatrix(o, 0.22));
        this.onFall(o.b, () => {
          mesh.setMatrixAt(i, HIDE);
          mesh.instanceMatrix.needsUpdate = true;
        });
      });
      geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(row, 1));
      group.add(mesh);
    }
    this.built = true;
  }

  // ---- traffic -----------------------------------------------------------

  // Works out where a vehicle is on its lane's loop: up the right-hand side,
  // round a U-turn, back down the other side, round again.
  placeVehicle(v) {
    const l = v.lane;
    const arc = Math.PI * TURN;
    const rx = -l.uz;
    const rz = l.ux;
    let s = v.s;
    let x;
    let z;
    let hx;
    let hz;
    if (s < l.len) {
      x = l.ax + l.ux * s + rx * TURN;
      z = l.az + l.uz * s + rz * TURN;
      hx = l.ux;
      hz = l.uz;
    } else if (s < l.len + arc) {
      const a = (s - l.len) / TURN;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      x = l.bx + rx * TURN * c + l.ux * TURN * sn;
      z = l.bz + rz * TURN * c + l.uz * TURN * sn;
      hx = l.ux * c - rx * sn;
      hz = l.uz * c - rz * sn;
    } else if (s < 2 * l.len + arc) {
      s -= l.len + arc;
      x = l.bx - l.ux * s - rx * TURN;
      z = l.bz - l.uz * s - rz * TURN;
      hx = -l.ux;
      hz = -l.uz;
    } else {
      const a = (s - 2 * l.len - arc) / TURN;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      x = l.ax - rx * TURN * c - l.ux * TURN * sn;
      z = l.az - rz * TURN * c - l.uz * TURN * sn;
      hx = -l.ux * c + rx * sn;
      hz = -l.uz * c + rz * sn;
    }
    v.x = x;
    v.z = z;
    v.hx = hx;
    v.hz = hz;
    v.rot = Math.atan2(hx, hz);
    if (!v.body) return;
    if (v.gone > 0) {
      v.body.setMatrixAt(v.idx, HIDE);
      v.cabin.setMatrixAt(v.idx, HIDE);
    } else {
      _q.setFromAxisAngle(UP, v.rot);
      _m.compose(_p.set(x, 0, z), _q, _s.setScalar(v.grow));
      v.body.setMatrixAt(v.idx, _m);
      v.cabin.setMatrixAt(v.idx, _m);
    }
  }

  // Tell the city where the big thing is, once a frame. Optional: without it
  // traffic never brakes and the birds never fly.
  setStomper(x, z) {
    this.stomp.x = x;
    this.stomp.z = z;
    this.stomp.t = this.time;
  }

  // Knocks away any moving vehicle inside the circle.
  trample(x, z, r, onCar) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.gone > 0) continue;
      const reach = r + (v.bus ? 3.2 : 1.2);
      if ((v.x - x) ** 2 + (v.z - z) ** 2 > reach * reach) continue;
      v.gone = 14 + ((i * 7) % 11);
      v.grow = 0;
      this.placeVehicle(v);
      v.body.instanceMatrix.needsUpdate = true;
      v.cabin.instanceMatrix.needsUpdate = true;
      onCar && onCar(v);
    }
  }

  placeBird(b) {
    const s = b.size;
    _q.setFromAxisAngle(UP, b.rot);
    this.meshes.bird.setMatrixAt(b.idx, _m.compose(_p.set(b.x, b.y + 0.35, b.z), _q, _s.set(s, s, s)));
  }

  update(dt) {
    if (!this.built) return;
    this.time += dt;
    const st = this.stomp;
    const live = this.time - st.t < 0.5;

    // Traffic.
    const vs = this.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const l = v.lane;
      let target = l.speed;
      if (v.gone > 0) {
        // A kicked vehicle keeps its slot in the queue and comes back once
        // nobody is close enough to see it pop in.
        v.gone -= dt;
        if (v.gone <= 0) {
          const far = !live || (v.x - st.x) ** 2 + (v.z - st.z) ** 2 > 110 * 110;
          v.gone = far ? 0 : 3;
          v.v = l.speed;
        }
      } else {
        const ahead = vs[l.first + ((i - l.first + 1) % l.n)];
        if (ahead !== v && ahead.gone <= 0) {
          const gap = (ahead.s - v.s + l.loop) % l.loop;
          const room = (v.bus ? 9 : 5.5) + (ahead.bus ? 6 : 2.5);
          if (gap < room) target = 0;
          else if (gap < room + 8) target = Math.min(target, ahead.v);
        }
        if (live) {
          const dx = st.x - v.x;
          const dz = st.z - v.z;
          const fwd = dx * v.hx + dz * v.hz;
          if (fwd > 0 && fwd < 19 && Math.abs(dx * v.hz - dz * v.hx) < 6) target = 0;
        }
        v.v += (target - v.v) * (1 - Math.exp(-(target < v.v ? 7 : 2.2) * dt));
        if (v.grow < 1) v.grow = Math.min(1, v.grow + dt * 2.5);
      }
      v.s = (v.s + (v.gone > 0 ? l.speed : v.v) * dt) % l.loop;
      this.placeVehicle(v);
    }
    if (this.carMeshes) {
      this.carMeshes.body.instanceMatrix.needsUpdate = true;
      this.carMeshes.cabin.instanceMatrix.needsUpdate = true;
    }
    if (this.busMeshes) {
      this.busMeshes.body.instanceMatrix.needsUpdate = true;
      this.busMeshes.cabin.instanceMatrix.needsUpdate = true;
    }

    // Birds.
    if (this.birds.length) {
      let flyChanged = false;
      for (const f of this.flocks) {
        const d2 = live ? (f.x - st.x) ** 2 + (f.z - st.z) ** 2 : 1e9;
        if (!f.up && d2 < 28 * 28) {
          f.up = true;
          f.calm = 0;
          for (let i = f.first; i < f.first + f.n; i++) this.birds[i].delay = ((i * 37) % 10) * 0.045;
        } else if (f.up) {
          f.calm = d2 > 46 * 46 ? f.calm + dt : 0;
          if (f.calm > 5) f.up = false;
        }
      }
      for (let i = 0; i < this.birds.length; i++) {
        const b = this.birds[i];
        const f = b.flock;
        if (f.up) {
          if (b.delay > 0) {
            b.delay -= dt;
            continue;
          }
          if (b.fly < 1) {
            b.fly = 1;
            this.birdFly.array[i] = 1;
            flyChanged = true;
            b.th = Math.atan2(b.z - f.z, b.x - f.x);
          }
          b.th += b.w * dt;
          const k = 1 - Math.exp(-1.6 * dt);
          const tx = f.x + Math.cos(b.th) * b.rad;
          const tz = f.z + Math.sin(b.th) * b.rad;
          b.rot = Math.atan2(tx - b.x, tz - b.z);
          b.x += (tx - b.x) * k;
          b.z += (tz - b.z) * k;
          b.y += (b.alt + Math.sin(this.time * 1.3 + i) * 1.5 - b.y) * k;
        } else if (b.fly > 0) {
          // Glide back down to where it was pecking.
          const k = 1 - Math.exp(-1.4 * dt);
          b.rot = Math.atan2(b.hx - b.x, b.hz - b.z);
          b.x += (b.hx - b.x) * k;
          b.z += (b.hz - b.z) * k;
          b.y += (0 - b.y) * k;
          if (b.y < 0.25 && Math.abs(b.x - b.hx) < 0.6) {
            b.y = 0;
            b.fly = 0;
            this.birdFly.array[i] = 0;
            flyChanged = true;
          }
        } else {
          // On the ground: a few steps now and then.
          b.hop -= dt;
          if (b.hop <= 0) {
            b.hop = 2 + ((i * 13) % 7) * 0.6;
            b.tx = b.hx + Math.sin(i * 1.7 + this.time) * 1.6;
            b.tz = b.hz + Math.cos(i * 2.3 + this.time) * 1.6;
            b.rot = Math.atan2(b.tx - b.x, b.tz - b.z);
          }
          const dx = b.tx - b.x;
          const dz = b.tz - b.z;
          if (dx * dx + dz * dz < 0.02) continue;
          b.x += dx * Math.min(1, dt * 2);
          b.z += dz * Math.min(1, dt * 2);
        }
        this.placeBird(b);
      }
      this.meshes.bird.instanceMatrix.needsUpdate = true;
      if (flyChanged) this.birdFly.needsUpdate = true;
    }
  }
}
