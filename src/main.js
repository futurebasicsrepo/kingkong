import { Game } from './game.js';

const loading = document.getElementById('loading');
try {
  const game = new Game(document.getElementById('game'), document.getElementById('ui'));
  game.run();
  window.__game = game;
  window.__info = () => game.stage.renderer.info.render;
  // Test hook: advance the simulation without waiting for frames.
  window.__step = (n, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) game.update(dt);
  };
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__ready = true;
      if (loading) {
        loading.style.opacity = '0';
        setTimeout(() => loading.remove(), 600);
      }
    })
  );
} catch (err) {
  console.error(err);
  if (loading) loading.textContent = 'This browser could not start the game (WebGL 2 is needed).';
}
