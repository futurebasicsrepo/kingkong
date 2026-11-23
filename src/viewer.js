// Development viewer for characters: /view.html?who=ape&pose=run&phase=1.2&angle=0.6&dist=38
import * as THREE from 'three';
import { createStage } from './engine/render.js';
import { Ape, ATTACKS, APES } from './actors/ape.js';
import { Raccoon, Pigeon } from './actors/enemies.js';
import { Eagle } from './actors/eagle.js';
import { Bull } from './actors/bull.js';
import { makeRat, makeGator } from './actors/enemies.js';

const q = new URLSearchParams(location.search);
const who = q.get('who') || 'ape';
const pose = q.get('pose') || 'idle';
const stage = createStage(document.getElementById('game'), { quality: 'high' });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8f8f8a, roughness: 1 }));
ground.receiveShadow = true;
stage.scene.add(ground);

// Builds an enemy with just enough of a fake game around it to stand still and pose.
function makeViewerActor(who, game, pose) {
  game.fx = { marker: () => ({}), dust() {}, twinkle() {}, feathers() {} };
  game.audio = { play() {} };
  game.tokens = 0;
  game.shake = () => {};
  game.world = { groundHeight: () => 0, resolveCircle() {}, bounds: { x0: -999, x1: 999, z0: -999, z1: 999 }, places: { perch: { x: 0, y: 0, z: 0 } } };
  game.player = { pos: new THREE.Vector3(0, 0, 40), vel: new THREE.Vector3(), state: 'free', takeDamage() {} };
  let e;
  if (who === 'bull') {
    e = new Bull(game, 0, 0);
    e.state = pose || 'perch';
    e.taunt = pose === 'taunt';
    e.think = (dt) => {
      const m = { charge: [1.6, 0.6, 0, 0], perch: [0, 0.15, 0, 0], taunt: [0, -0.5, 0, 0.6], stuck: [0, 0.7, 0.08, 0], tired: [0, 0.5, 0, 0] }[pose] || [0, 0.15, 0, 0];
      e.applyPose(dt, ...m);
    };
  } else if (who === 'rat') {
    e = makeRat(game, 0, 0);
    e.state = pose === 'windup' ? 'windup' : 'viewer';
    e.scale = 1;
  } else if (who === 'gator') {
    e = makeGator(game, 0, 0);
    e.state = pose === 'windup' ? 'poundWind' : 'viewer';
    e.scale = 1;
  } else if (who === 'eagle') {
    e = new Eagle(game, 0, 0);
    e.viewerPose(pose);
  } else if (who === 'pigeon') {
    e = new Pigeon(game, 0, 0);
    e.pos.y = pose === 'dazed' ? 0 : 3;
    e.state = pose === 'dazed' ? 'dazed' : 'viewer';
    e.stunT = 999;
  } else {
    e = new Raccoon(game, 0, 0, who === 'thrower');
    e.state = pose === 'windup' ? 'windup' : 'viewer';
    e.scale = 1;
  }
  e.yaw = 0;
  e.viewerTick = (dt) => {
    e.t = 0.1;
    e.update(dt);
    e.root.rotation.y = 0;
  };
  return e;
}

const game = { world: null, stage };
let actor;
let tick = () => {};
if (who === 'ape') {
  actor = new Ape(game, APES.find((v) => v.id === q.get('v')) || APES[0]);
  const a = actor;
  if (pose === 'run') a.speed = 27;
  else if (pose === 'walk') a.speed = 10;
  else if (ATTACKS[pose]) {
    a.state = 'attack';
    a.attack = { kind: pose, t: ATTACKS[pose].hit + (q.get('pre') ? -0.12 : 0.02), hit: true };
  } else if (pose === 'victory') a.victory = true;
  else if (pose === 'climb') {
    a.state = 'climb';
  } else if (pose !== 'idle') a.state = pose;
  a.phase = +(q.get('phase') || 0.9);
  a.t = 0.1;
  tick = (dt) => {
    if (q.get('play')) a.phase += dt * 9;
    a.time += dt;
    a.animate(dt);
    a.root.visible = true;
  };
} else {
  actor = makeViewerActor(who, game, pose);
  tick = (dt) => actor.viewerTick(dt);
}
stage.scene.add(actor.root);
const angle = +(q.get('angle') || 0.7);
const dist = +(q.get('dist') || 40);
const h = +(q.get('h') || 12);
stage.camera.fov = 40;
stage.camera.position.set(Math.sin(angle) * dist, h, Math.cos(angle) * dist);
stage.camera.lookAt(0, +(q.get('ly') || 7), 0);
stage.resize();
let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let i = 0; i < 4; i++) tick(dt);
  stage.setFocus(0, 0, 0);
  stage.render(dt);
  if (++frames > 20) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
