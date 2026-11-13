// Unified keyboard/mouse + gamepad input. Read state each frame via input.state.
export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    this.locked = false;
    addEventListener('keydown', (e) => { if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) { dom.requestPointerLock?.(); }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
  }
  // Normalised per-frame action state consumed by gameplay modules.
  poll() {
    const k = (c) => this.keys.has(c), p = (c) => this.pressed.has(c);
    const pad = navigator.getGamepads?.()[0];
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    let mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), my = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    let lx = this.mouse.dx * 0.0025, ly = this.mouse.dy * 0.0025;
    const s = {
      move: { x: mx, y: my }, look: { x: lx, y: ly },
      sprint: k('ShiftLeft'), dodge: p('Space'), lightAttack: this.mouse.leftPressed, heavyAttack: this.mouse.rightPressed,
      heavyHeld: this.mouse.right, guard: k('KeyQ'), interact: p('KeyE'), item: p('KeyR'), lockOn: p('KeyF') || p('Tab'), menu: p('Escape'),
    };
    if (pad) {
      s.move.x += dz(pad.axes[0]); s.move.y -= dz(pad.axes[1]); s.look.x += dz(pad.axes[2]) * 0.05; s.look.y += dz(pad.axes[3]) * 0.05;
      const b = (i) => pad.buttons[i]?.pressed;
      s.sprint ||= b(7); s.guard ||= b(6); s.dodge ||= b(1) && !this._pb1; s.lightAttack ||= b(3) && !this._pb3; s.heavyAttack ||= b(2) && !this._pb2; s.heavyHeld ||= b(2);
      s.lockOn ||= b(11) && !this._pb11; this._pb1 = b(1); this._pb2 = b(2); this._pb3 = b(3); this._pb11 = b(11);
    }
    this.touch?.apply(s);
    const len = Math.hypot(s.move.x, s.move.y); if (len > 1) { s.move.x /= len; s.move.y /= len; }
    this.pressed.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = this.mouse.rightPressed = false;
    return (this.state = s);
  }
}
