import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/world/city.js';
import { angDiff, distToSegment, mulberry32 } from '../src/engine/util.js';

const makeCity = () => new City(new THREE.Scene(), { x0: -100, x1: 100, z0: -100, z1: 100 });

test('a circle is pushed out of a building', () => {
  const city = makeCity();
  city.addCollider(0, 0, 20, 20, 30);
  const pos = { x: 11, z: 0 };
  city.resolveCircle(pos, 4, 0);
  assert.ok(Math.abs(pos.x - 14) < 1e-6, `x was ${pos.x}`);
  const inside = { x: 1, z: 0.5 };
  city.resolveCircle(inside, 4, 0);
  assert.ok(Math.abs(inside.x) >= 14 - 1e-6 || Math.abs(inside.z) >= 14 - 1e-6);
});

test('a turned building collides in its own frame', () => {
  const city = makeCity();
  city.addCollider(0, 0, 40, 4, 30, Math.PI / 4);
  const far = { x: 0, z: 12 };
  city.resolveCircle(far, 2, 0);
  assert.deepEqual(far, { x: 0, z: 12 });
  const near = { x: 0.5, z: 1 };
  city.resolveCircle(near, 2, 0);
  assert.ok(Math.hypot(near.x, near.z) > 2);
});

test('something above the roof is not pushed', () => {
  const city = makeCity();
  city.addCollider(0, 0, 20, 20, 10);
  const pos = { x: 0, z: 0 };
  city.resolveCircle(pos, 4, 12);
  assert.deepEqual(pos, { x: 0, z: 0 });
});

test('the camera ray stops at a tall building and clears a low one', () => {
  const city = makeCity();
  city.addCollider(0, 0, 10, 10, 50);
  const t = city.rayBlock(-30, 10, 0, 30, 10, 0);
  assert.ok(Math.abs(t - 25 / 60) < 1e-6, `t was ${t}`);
  assert.equal(city.rayBlock(-30, 60, 0, 30, 60, 0), 1);
});

test('rivers are deep, bridges are dry', () => {
  const city = makeCity();
  city.addWater(-20, 20);
  city.addBridge(-20, 20, -5, 5);
  assert.equal(city.waterAmount(0, 50), 1);
  assert.equal(city.waterAmount(0, 0), 0);
  assert.equal(city.waterAmount(40, 50), 0);
  assert.ok(city.groundHeight(0, 50) < -3);
  assert.equal(city.groundHeight(0, 0), 0);
});

test('raised zones lift the ground', () => {
  const city = makeCity();
  city.addHeightZone(50, 50, 20, 20, 0, () => 6);
  assert.equal(city.groundHeight(50, 50), 6);
  assert.equal(city.groundHeight(80, 50), 0);
});

test('math helpers', () => {
  assert.ok(Math.abs(angDiff(3, -3) - (Math.PI * 2 - 6)) < 1e-9);
  assert.equal(distToSegment(0, 5, -10, 0, 10, 0), 5);
  const a = mulberry32(7);
  const b = mulberry32(7);
  assert.equal(a(), b());
});

test('roofs can be stood on, and setbacks are separate ledges', () => {
  const city = makeCity();
  city.addBuilding('brick', 0, 0, 20, 20, 30, { tiers: [{ w: 10, d: 10, h: 20 }] });
  assert.equal(city.roofAt(0, 0, 5), 0, 'not from the street');
  assert.equal(city.roofAt(8, 0, 31), 30, 'the body roof');
  assert.equal(city.roofAt(0, 0, 31), 30, 'the tier is too high to step onto');
  assert.equal(city.roofAt(0, 0, 51), 50, 'the top of the tier');
  // On the ledge the tier wall still pushes back; from the street it does not.
  const ledge = { x: 6, z: 0 };
  city.resolveCircle(ledge, 2, 30);
  assert.ok(ledge.x >= 7 - 1e-6, `ledge x was ${ledge.x}`);
  const street = { x: 30, z: 0 };
  city.resolveCircle(street, 2, 0);
  assert.deepEqual(street, { x: 30, z: 0 });
});

test('knocking a building down removes every ledge', () => {
  const city = makeCity();
  const b = city.addBuilding('brick', 0, 0, 20, 20, 30, { hp: 10, tiers: [{ w: 10, d: 10, h: 20 }] });
  city.finalize = () => {};
  b.mesh = { setMatrixAt() {}, setColorAt() {}, instanceMatrix: {}, instanceColor: null };
  const res = city.damageAt(12, 0, 5, 50);
  assert.equal(res.destroyed.length, 1);
  assert.equal(city.roofAt(0, 0, 100), 0);
});
