import { clamp } from './util.js';

// Keyboard, mouse, touch and gamepad, folded into one small interface:
//   moveX / moveY   -1..1, right and forward
//   lookX / lookY   camera turn since last frame (consumed by the camera)
//   take(action)    true once per press: 'punch' | 'slam' | 'jump' | 'roar' | 'pause'
const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyJ: 'punch', KeyF: 'punch', KeyK: 'slam', KeyE: 'slam', KeyL: 'roar', KeyR: 'roar', KeyQ: 'roar',
  Escape: 'pause', KeyP: 'pause', Enter: 'confirm', KeyM: 'mute',
};

export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.held = {};
    this.pressed = {};
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookId = -1;
    this.lastLook = { x: 0, y: 0 };
    this.drag = null;
    this.usedTouch = false;
    this.pad = { x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.held[a]) this.pressed[a] = true;
      this.held[a] = true;
    });
    addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.held[a] = false;
    });
    addEventListener('blur', () => (this.held = {}));

    // Mouse: drag to turn the camera, click to punch, right-click to slam.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return this.touchDown(e);
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this.touchMove(e);
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved > 6) {
        this.lookX += dx * 0.005;
        this.lookY += dy * 0.004;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'touch') return this.touchUp(e);
      if (this.drag && this.drag.moved <= 6) this.pressed[this.drag.button === 2 ? 'slam' : 'punch'] = true;
      this.drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      this.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    // Touch buttons live in the HUD; they call press() directly.
    this.stickEl = ui.querySelector('#stick');
    this.knobEl = ui.querySelector('#stick-knob');
  }

  press(action) {
    this.pressed[action] = true;
  }

  touchDown(e) {
    this.usedTouch = true;
    if (e.clientX < innerWidth * 0.45 && this.stick.id < 0) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      if (this.stickEl) {
        this.stickEl.style.display = 'block';
        this.stickEl.style.left = e.clientX + 'px';
        this.stickEl.style.top = e.clientY + 'px';
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      }
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  touchMove(e) {
    if (e.pointerId === this.stick.id) {
      const max = 56;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      this.stick.x = dx / max;
      this.stick.y = -dy / max;
      if (this.knobEl) this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId) {
      this.lookX += (e.clientX - this.lastLook.x) * 0.008;
      this.lookY += (e.clientY - this.lastLook.y) * 0.006;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  touchUp(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = -1;
      this.stick.x = this.stick.y = 0;
      if (this.stickEl) this.stickEl.style.display = 'none';
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
    }
  }

  // Call once at the start of each frame.
  poll() {
    let x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    let y = (this.held.up ? 1 : 0) - (this.held.down ? 1 : 0);
    x += this.stick.x;
    y += this.stick.y;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      x += dz(p.axes[0] || 0);
      y -= dz(p.axes[1] || 0);
      this.lookX += dz(p.axes[2] || 0) * 0.05;
      this.lookY += dz(p.axes[3] || 0) * 0.03;
      const map = { 0: 'jump', 2: 'punch', 3: 'slam', 1: 'roar', 5: 'punch', 7: 'slam', 9: 'pause' };
      this.padHeld = this.padHeld || {};
      for (const [i, a] of Object.entries(map)) {
        const down = p.buttons[i] && p.buttons[i].pressed;
        if (down && !this.padHeld[i]) this.pressed[a] = true;
        this.padHeld[i] = down;
      }
      break;
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.moveX = clamp(x, -1, 1);
    this.moveY = clamp(y, -1, 1);
  }

  take(action) {
    if (this.pressed[action]) {
      this.pressed[action] = false;
      return true;
    }
    return false;
  }

  // Call at the end of each frame.
  flush() {
    this.pressed = {};
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
  }
}
