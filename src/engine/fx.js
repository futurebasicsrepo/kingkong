import * as THREE from 'three';
import { GEO } from './build.js';
import { rand } from './util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

// Short-lived visual effects. Everything is pooled and instanced, so a big
// brawl costs a handful of draw calls and no garbage.
export class Fx {
  constructor(scene) {
    this.scene = scene;

    // Tumbling chunks: rubble, feathers, splinters.
    this.chunkMax = 260;
    this.chunks = [];
    this.chunkMesh = new THREE.InstancedMesh(GEO.cube(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), this.chunkMax);
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.castShadow = true;
    for (let i = 0; i < this.chunkMax; i++) {
      this.chunks.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, g: 60, drag: 0 });
      this.chunkMesh.setMatrixAt(i, HIDE);
      this.chunkMesh.setColorAt(i, _c.set(0xffffff));
    }
    this.chunkNext = 0;
    scene.add(this.chunkMesh);

    // Dust puffs: soft blobs that swell and fade by shrinking.
    this.puffMax = 180;
    this.puffs = [];
    this.puffMesh = new THREE.InstancedMesh(GEO.ico(1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.82, depthWrite: false }), this.puffMax);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 3;
    for (let i = 0; i < this.puffMax; i++) {
      this.puffs.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 });
      this.puffMesh.setMatrixAt(i, HIDE);
      this.puffMesh.setColorAt(i, _c.set(0xffffff));
    }
    this.puffNext = 0;
    scene.add(this.puffMesh);

    // Shockwave rings on the ground.
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(GEO.ring(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, r0: 1, r1: 10 });
    }

    // Impact flashes.
    this.sparks = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(GEO.ico(0), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 1, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.sparks.push({ mesh: m, life: 0, max: 0.14, size: 3 });
    }

    // Warning marks: where something is about to land.
    this.marks = [];
    for (let i = 0; i < 20; i++) {
      const fill = new THREE.Mesh(GEO.disc(), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.28, depthWrite: false }));
      const edge = new THREE.Mesh(GEO.ring(), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.9, depthWrite: false }));
      const strip = new THREE.Mesh(GEO.plane(), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, depthWrite: false }));
      for (const m of [fill, edge, strip]) {
        m.visible = false;
        m.renderOrder = 3;
        scene.add(m);
      }
      this.marks.push({ fill, edge, strip, life: 0, max: 1, x: 0, z: 0, y: 0, r: 1, isStrip: false });
    }
    this.time = 0;
  }

  chunk(x, y, z, vx, vy, vz, size, color, opts = {}) {
    const i = this.chunkNext;
    this.chunkNext = (i + 1) % this.chunkMax;
    const c = this.chunks[i];
    c.life = opts.life ?? rand(0.9, 1.7);
    c.x = x;
    c.y = y;
    c.z = z;
    c.vx = vx;
    c.vy = vy;
    c.vz = vz;
    c.rx = rand(6.3);
    c.ry = rand(6.3);
    c.rz = rand(-8, 8);
    c.sx = size * (opts.sx ?? rand(0.6, 1.3));
    c.sy = size * (opts.sy ?? rand(0.5, 1.1));
    c.sz = size * (opts.sz ?? rand(0.6, 1.3));
    c.g = opts.g ?? 60;
    c.drag = opts.drag ?? 0;
    this.chunkMesh.setColorAt(i, _c.set(color).multiplyScalar(rand(0.75, 1.1)));
    this.chunkMesh.instanceColor.needsUpdate = true;
  }

  debris(x, y, z, n, color, speed = 26, size = 1.6, spreadY = 6) {
    for (let k = 0; k < n; k++) {
      const a = rand(Math.PI * 2);
      const sp = rand(0.3, 1) * speed;
      this.chunk(x + rand(-2, 2), y + rand(spreadY), z + rand(-2, 2), Math.cos(a) * sp, rand(0.4, 1.2) * speed, Math.sin(a) * sp, size, color);
    }
  }

  feathers(x, y, z, n, color = 0xf2efe6) {
    for (let k = 0; k < n; k++) {
      const a = rand(Math.PI * 2);
      this.chunk(x, y, z, Math.cos(a) * rand(4, 16), rand(4, 16), Math.sin(a) * rand(4, 16), 1, color, { sx: 0.5, sy: 0.08, sz: 1.9, g: 12, drag: 1.5, life: rand(1.2, 2.2) });
    }
  }

  dust(x, y, z, n = 6, size = 3, color = 0xcfc8ba, spread = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.puffNext;
      this.puffNext = (i + 1) % this.puffMax;
      const p = this.puffs[i];
      const a = rand(Math.PI * 2);
      const sp = rand(2, 9) * spread;
      p.life = p.max = rand(0.5, 1.1);
      p.x = x + Math.cos(a) * rand(size) * 0.6;
      p.y = y + rand(size * 0.4);
      p.z = z + Math.sin(a) * rand(size) * 0.6;
      p.vx = Math.cos(a) * sp;
      p.vy = rand(1, 5);
      p.vz = Math.sin(a) * sp;
      p.size = size * rand(0.6, 1.2);
      this.puffMesh.setColorAt(i, _c.set(color).multiplyScalar(rand(0.85, 1.05)));
    }
    this.puffMesh.instanceColor.needsUpdate = true;
  }

  // A burst of dust rolling outward along the ground.
  dustRing(x, y, z, r, n = 14, size = 3.5) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand(0.3);
      this.dust(x + Math.cos(a) * r * 0.5, y, z + Math.sin(a) * r * 0.5, 1, size, 0xcfc8ba, 2.2);
    }
  }

  ring(x, y, z, r0, r1, dur = 0.45, color = 0xffffff) {
    const r = this.rings.find((o) => o.life <= 0) || this.rings[0];
    r.life = r.max = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.mesh.position.set(x, y + 0.6, z);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
  }

  spark(x, y, z, size = 4, color = 0xfff3c4) {
    const s = this.sparks.find((o) => o.life <= 0) || this.sparks[0];
    s.life = s.max = 0.13;
    s.size = size;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(rand(3), rand(3), rand(3));
    s.mesh.material.color.set(color);
    s.mesh.visible = true;
  }

  twinkle(x, y, z, k = 1) {
    this.spark(x, y, z, 7 * k, 0xffffff);
    this.dust(x, y, z, 4, 2.5 * k, 0xffffff);
  }

  // A round warning mark. Returns a handle: set .life = 0 to clear it early,
  // or move .x / .z to slide it.
  marker(x, z, r, dur, y = 0) {
    const m = this.marks.find((o) => o.life <= 0) || this.marks[0];
    m.life = m.max = dur;
    m.x = x;
    m.z = z;
    m.y = y;
    m.r = r;
    m.isStrip = false;
    return m;
  }

  // A long warning strip from a to b.
  strip(ax, az, bx, bz, width, dur) {
    const m = this.marks.find((o) => o.life <= 0) || this.marks[0];
    m.life = m.max = dur;
    m.isStrip = true;
    m.x = (ax + bx) / 2;
    m.z = (az + bz) / 2;
    m.y = 0;
    m.len = Math.hypot(bx - ax, bz - az);
    m.r = width;
    m.rot = Math.atan2(bx - ax, bz - az);
    return m;
  }

  clear() {
    for (const m of this.marks) m.life = 0;
    for (const c of this.chunks) c.life = 0;
    for (const p of this.puffs) p.life = 0;
  }

  update(dt) {
    this.time += dt;
    let any = false;
    for (let i = 0; i < this.chunkMax; i++) {
      const c = this.chunks[i];
      if (c.life <= 0) continue;
      any = true;
      c.life -= dt;
      c.vy -= c.g * dt;
      if (c.drag) {
        const k = Math.exp(-c.drag * dt);
        c.vx *= k;
        c.vz *= k;
        if (c.vy < -6) c.vy = -6;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y < 0.3 && c.vy < 0) {
        c.y = 0.3;
        c.vy *= -0.35;
        c.vx *= 0.6;
        c.vz *= 0.6;
        c.rz *= 0.5;
      }
      c.rx += c.rz * dt;
      c.ry += c.rz * 0.7 * dt;
      if (c.life <= 0) {
        this.chunkMesh.setMatrixAt(i, HIDE);
        continue;
      }
      const k = Math.min(1, c.life / 0.3);
      _e.set(c.rx, c.ry, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.sx * k, c.sy * k, c.sz * k));
      this.chunkMesh.setMatrixAt(i, _m);
    }
    if (any) this.chunkMesh.instanceMatrix.needsUpdate = true;

    any = false;
    for (let i = 0; i < this.puffMax; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        this.puffMesh.setMatrixAt(i, HIDE);
        continue;
      }
      const u = 1 - p.life / p.max;
      const k = Math.exp(-2.5 * dt);
      p.vx *= k;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.size * Math.sin(Math.PI * Math.pow(u, 0.55)) + 0.01;
      _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s * 0.8, s));
      this.puffMesh.setMatrixAt(i, _m);
    }
    if (any) this.puffMesh.instanceMatrix.needsUpdate = true;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const u = 1 - Math.max(0, r.life) / r.max;
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) ** 2);
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - u) * 0.8;
      if (r.life <= 0) r.mesh.visible = false;
    }

    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const u = 1 - Math.max(0, s.life) / s.max;
      s.mesh.scale.setScalar(s.size * (0.4 + u));
      s.mesh.material.opacity = 1 - u * u;
      if (s.life <= 0) s.mesh.visible = false;
    }

    for (const m of this.marks) {
      const on = m.life > 0;
      if (on) m.life -= dt;
      const show = m.life > 0;
      const pulse = 0.75 + Math.sin(this.time * 18) * 0.25;
      if (m.isStrip) {
        m.fill.visible = m.edge.visible = false;
        m.strip.visible = show;
        if (show) {
          m.strip.position.set(m.x, m.y + 0.7, m.z);
          m.strip.rotation.y = m.rot;
          m.strip.scale.set(m.r, 1, m.len);
          m.strip.material.opacity = 0.2 + pulse * 0.16;
        }
      } else {
        m.strip.visible = false;
        m.fill.visible = m.edge.visible = show;
        if (show) {
          const grow = Math.min(1, (m.max - m.life) / Math.min(0.35, m.max));
          m.fill.position.set(m.x, m.y + 0.65, m.z);
          m.edge.position.set(m.x, m.y + 0.7, m.z);
          m.fill.scale.set(m.r * grow, 1, m.r * grow);
          m.edge.scale.set(m.r, 1, m.r);
          m.fill.material.opacity = 0.16 + pulse * 0.16;
        }
      }
    }
  }
}
