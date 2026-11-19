// Unified keyboard/mouse + gamepad input. Read state each frame via input.state.
export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    this.locked = false;
    addEventListener('keydown', (e) => { if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.ropeArmed) { // grappling hook: press G once, then double-click the target (the crosshair while the mouse is captured)
        const now = performance.now(); if (now - (this._lastClick || 0) < 350) { this.ropeTarget = this.locked ? 'center' : { x: e.clientX, y: e.clientY }; this._lastClick = 0; } else this._lastClick = now;
        return;
      }
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
      heavyHeld: this.mouse.right, lightHeld: this.mouse.left, jump: p('KeyC'), guard: k('KeyQ'), interact: p('KeyE'), item: p('KeyR'), lockOn: p('KeyF') || p('Tab'), menu: p('Escape'), ropeHeld: false, ropeTarget: this.ropeTarget || null,
    };
    if (pad) {
      s.move.x += dz(pad.axes[0]); s.move.y -= dz(pad.axes[1]); s.look.x += dz(pad.axes[2]) * 0.05; s.look.y += dz(pad.axes[3]) * 0.05;
      const b = (i) => pad.buttons[i]?.pressed;
      s.sprint ||= b(7); s.guard ||= b(6); s.dodge ||= b(1) && !this._pb1; s.lightAttack ||= b(3) && !this._pb3; s.heavyAttack ||= b(2) && !this._pb2; s.heavyHeld ||= b(2); s.lightHeld ||= b(3); s.jump ||= b(0) && !this._pb0; this._pb0 = b(0);
      if (b(4) && !this._pb4) this.ropeArmed = !this.ropeArmed; this._pb4 = b(4); if (this.ropeArmed && b(0) && !this._pb0r) { s.ropeTarget = 'center'; s.jump = false; } this._pb0r = b(0); // LB arms, A fires at the crosshair
      s.lockOn ||= b(11) && !this._pb11; this._pb1 = b(1); this._pb2 = b(2); this._pb3 = b(3); this._pb11 = b(11);
    }
    if (p('KeyG')) this.ropeArmed = !this.ropeArmed; // one press arms the hook (again: cancel)
    this.touch?.apply(s);
    if (this.touch?.ropeCancel) { this.ropeArmed = false; this.touch.ropeCancel = false; } else if (this.touch?.state?.ropeHeld) this.ropeArmed = true;
    s.ropeHeld = !!this.ropeArmed;
    if (s.ropeTarget) { this.ropeArmed = false; if (this.touch) this.touch.disarmRope(); } // fired: the hook disarms
    const len = Math.hypot(s.move.x, s.move.y); if (len > 1) { s.move.x /= len; s.move.y /= len; }
    if (s.ropeHeld) { s.lightAttack = false; s.lightHeld = false; } // while aiming the hook, clicks / taps aim, they do not attack
    this.pressed.clear(); this.ropeTarget = null; this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = this.mouse.rightPressed = false;
    return (this.state = s);
  }
}
