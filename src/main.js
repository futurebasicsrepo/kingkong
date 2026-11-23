import { Game } from './game.js';

// iPhones ignore "user-scalable=no", and a fast double tap on a button zooms
// the whole page. A game of fast taps has to refuse that by hand.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    // Menus keep their normal taps (they are protected in CSS instead).
    const inMenu = e.target instanceof Element && e.target.closest('#screen');
    if (!inMenu && e.timeStamp - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = e.timeStamp;
  },
  { passive: false }
);
document.addEventListener(
  'touchmove',
  (e) => {
    const inMenu = e.target instanceof Element && e.target.closest('#screen');
    if (!inMenu || e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
// If the page ends up zoomed anyway, snap it back.
if (window.visualViewport) {
  const meta = document.querySelector('meta[name="viewport"]');
  const base = meta.content;
  visualViewport.addEventListener('resize', () => {
    if (visualViewport.scale > 1.02) {
      meta.content = base.replace('initial-scale=1,', 'initial-scale=1.0001,');
      requestAnimationFrame(() => (meta.content = base));
    }
  });
}

// "Add to home screen": Android and desktop Chrome hand over a prompt to show later.
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

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
