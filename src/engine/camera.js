import * as THREE from 'three';
import { clamp, damp, dampAngle, angDiff, rand } from './util.js';

// A chase camera that stays behind the ape, swings to keep fights on screen,
// and pulls in rather than sitting behind a skyscraper.
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 48;
    this.wantDist = 48;
    this.curDist = 48;
    this.target = new THREE.Vector3();
    this.trauma = 0;
    this.manual = 0;
    this.fov = 55;
    this.cine = null;
  }

  // Jump straight to the chase position. keepYaw leaves the heading as set.
  snap(player, keepYaw = false) {
    if (!keepYaw) this.yaw = player.yaw;
    this.manual = 0;
    this.target.set(player.pos.x, player.pos.y + 9, player.pos.z);
    this.curDist = this.wantDist;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt, game) {
    const { player, input, world } = game;
    const cam = this.camera;

    if (input.lookX || input.lookY) {
      this.yaw -= input.lookX;
      this.pitch = clamp(this.pitch + input.lookY, 0.12, 1.15);
      this.manual = 2.2;
    }
    if (input.zoom) this.wantDist = clamp(this.wantDist + input.zoom * 5, 30, 80);
    this.manual -= dt;

    const boss = game.boss && !game.boss.dead && game.boss.state !== 'perch' ? game.boss : null;
    if (this.manual <= 0 && game.controlsOn) {
      if (boss) {
        // Keep the boss in front of the camera.
        const want = Math.atan2(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z);
        this.yaw = dampAngle(this.yaw, want, 1.1, dt);
      } else if (player.speed > 6 && player.state !== 'attack') {
        const moveYaw = Math.atan2(player.vel.x, player.vel.z);
        const off = Math.abs(angDiff(this.yaw, moveYaw));
        // Follow the way he runs, unless he is running at the camera.
        if (off < 2.3) this.yaw = dampAngle(this.yaw, moveYaw, game.enemies.length ? 0.5 : 1.3, dt);
      }
    }

    const wantDist = this.wantDist + (boss ? 16 : 0);
    const wantPitch = this.pitch + (boss ? 0.06 : 0);
    this.target.x = damp(this.target.x, player.pos.x, 12, dt);
    this.target.z = damp(this.target.z, player.pos.z, 12, dt);
    this.target.y = damp(this.target.y, player.pos.y + 9 + (boss ? 3 : 0), 6, dt);

    // If a building is in the way, first try swinging the camera up over it;
    // only then shorten the boom.
    const sy = Math.sin(this.yaw);
    const cyaw = Math.cos(this.yaw);
    const probe = (pitch) => {
      const c = Math.cos(pitch);
      return world.rayBlock(this.target.x, this.target.y, this.target.z, this.target.x - sy * c * wantDist, this.target.y + Math.sin(pitch) * wantDist, this.target.z - cyaw * c * wantDist);
    };
    let t = probe(wantPitch);
    let lift = 0;
    for (const up of [0.28, 0.56, 0.84]) {
      if (t > 0.8 || wantPitch + up > 1.3) break;
      const t2 = probe(wantPitch + up);
      if (t2 > t + 0.08) {
        t = t2;
        lift = up;
      }
    }
    this.lift = damp(this.lift || 0, lift, lift > (this.lift || 0) ? 6 : 1.5, dt);
    const pitch = wantPitch + this.lift;
    const cy = Math.cos(pitch);
    const dx = -sy * cy;
    const dy = Math.sin(pitch);
    const dz = -cyaw * cy;
    const clear = Math.max(20, probe(pitch) * wantDist - 3);
    this.curDist = clear < this.curDist ? damp(this.curDist, clear, 14, dt) : damp(this.curDist, clear, 2.5, dt);

    cam.position.set(this.target.x + dx * this.curDist, Math.max(2.5, this.target.y + dy * this.curDist), this.target.z + dz * this.curDist);
    cam.lookAt(this.target.x, this.target.y + 2, this.target.z);

    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      cam.position.x += rand(-1, 1) * s * 2.2;
      cam.position.y += rand(-1, 1) * s * 2.2;
      cam.rotation.z += rand(-1, 1) * s * 0.035;
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
    }

    const fov = this.fov + clamp(player.speed / 27, 0, 1.3) * 5 + (player.rageMode > 0 ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 5, dt);
      cam.updateProjectionMatrix();
    }
  }

  // A fixed shot for the title screen and cut-ins.
  orbit(dt, cx, cy, cz, radius, height, speed) {
    this.cineT = (this.cineT || 0) + dt * speed;
    this.camera.position.set(cx + Math.sin(this.cineT) * radius, height, cz + Math.cos(this.cineT) * radius);
    this.camera.lookAt(cx, cy, cz);
  }
}
