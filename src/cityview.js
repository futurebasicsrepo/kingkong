// Development viewer for the city on its own: /city.html?cam=x,y,z&look=x,y,z&quality=high
import { createStage } from './engine/render.js';
import { buildPhiladelphia } from './world/philadelphia.js';
import { buildNewYork } from './world/newyork.js';

const q = new URLSearchParams(location.search);
const stage = createStage(document.getElementById('game'), { quality: q.get('quality') || undefined });
const city = (q.get('city') === 'nyc' ? buildNewYork : buildPhiladelphia)(stage.scene);
const cam = (q.get('cam') || '-250,160,260').split(',').map(Number);
const look = (q.get('look') || '-100,0,-60').split(',').map(Number);
stage.camera.position.set(cam[0], cam[1], cam[2]);
stage.camera.lookAt(look[0], look[1], look[2]);
addEventListener('resize', () => stage.resize());
// Count every pass of a frame (shadows, post-processing), not just the last one.
stage.renderer.info.autoReset = false;
let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stage.setFocus(look[0], look[1], look[2]);
  city.update(dt);
  stage.renderer.info.reset();
  stage.render(dt);
  if (++frames > 3) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__info = () => ({ ...stage.renderer.info.render, programs: stage.renderer.info.programs.length, geometries: stage.renderer.info.memory.geometries });
window.__city = city;
window.__stage = stage;
