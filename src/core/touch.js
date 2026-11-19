// Touch controls for tablets/phones (iPad Safari etc.).
// Left half: floating virtual stick (push to the rim = sprint). Right half: drag to look.
// Buttons: ATTACK (tap, combo), HEAVY (hold to charge, release to slash), DODGE, GUARD (hold),
// ITEM (use selected), NEXT (cycle item), LOCK (lock-on), MENU (pause).
// Sits under #ui-root (z-index 10) so the title / pause / chat overlays still receive taps.
import { t } from '../shared/i18n.js';

export function isTouchDevice() {
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 1);
}

export class TouchControls {
  constructor() {
    this.state = { mx: 0, my: 0, lookDx: 0, lookDy: 0, sprint: false, guard: false, heavyHeld: false };
    this.pressed = new Set(); // one-shot actions: light, heavy, dodge, item, lockOn
    this.stickId = null; this.lookId = null; this.lookLast = null;
    const css = document.createElement('style');
    css.textContent = `
      html,body{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none}
      .tc-root{position:fixed;inset:0;z-index:5;display:none}
      .tc-root.tc-on{display:block}
      .tc-zone{position:absolute;top:0;bottom:0}
      .tc-left{left:0;width:45%}.tc-right{right:0;width:55%}
      .tc-stick{position:absolute;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;pointer-events:none;
        border:2px solid rgba(246,226,170,.45);background:radial-gradient(circle,rgba(20,14,8,.15),rgba(20,14,8,.45));display:none}
      .tc-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
        background:radial-gradient(circle at 40% 35%,rgba(255,240,200,.85),rgba(190,150,80,.75));box-shadow:0 2px 8px rgba(0,0,0,.5)}
      .tc-hint{position:absolute;left:6%;bottom:16%;color:rgba(246,226,170,.55);font:600 13px/1.3 Georgia,serif;letter-spacing:.15em;pointer-events:none}
      .tc-btn{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;
        font:700 11px/1.1 Georgia,serif;letter-spacing:.08em;color:#f6e2aa;border:2px solid rgba(214,174,96,.8);
        background:radial-gradient(circle at 40% 30%,rgba(70,50,30,.75),rgba(15,10,6,.8));box-shadow:0 3px 10px rgba(0,0,0,.55)}
      .tc-btn.tc-down{transform:scale(.92);background:radial-gradient(circle at 40% 30%,rgba(160,110,50,.9),rgba(60,35,15,.9))}
      .tc-btn.tc-armed{border-color:#ffd070;box-shadow:0 0 12px rgba(255,190,80,.8)}
      .tc-menu{left:50%;top:10px;width:64px;height:30px;margin-left:-32px;border-radius:15px}
    `;
    document.head.appendChild(css);
    const root = (this.root = document.createElement('div')); root.className = 'tc-root';
    root.innerHTML = `<div class="tc-zone tc-left"></div><div class="tc-zone tc-right"></div>
      <div class="tc-stick"><div class="tc-knob"></div></div><div class="tc-hint">${t('touch.move')}</div>`;
    document.body.appendChild(root);
    this.stick = root.querySelector('.tc-stick'); this.knob = root.querySelector('.tc-knob');
    const hint = root.querySelector('.tc-hint');

    // Buttons: [label, action, right(px), bottom(px), size(px), mode]  mode: tap | hold
    const B = [
      [t('touch.attack'), 'light', 118, 150, 84, 'tap'],
      [t('touch.heavy'), 'heavy', 30, 210, 76, 'hold'],
      [t('touch.dodge'), 'dodge', 30, 124, 70, 'tap'],
      [t('touch.guard'), 'guard', 212, 120, 62, 'hold'],
      [t('touch.item'), 'item', 210, 196, 54, 'tap'],
      [t('touch.next'), 'next', 268, 160, 44, 'tap'],
      [t('touch.lock'), 'lockOn', 130, 250, 54, 'tap'],
      [t('touch.jump'), 'jump', 128, 56, 60, 'tap'],
      [t('touch.ride'), 'summon', 300, 140, 54, 'tap'], // taming: summon / ride / dismount the equipped construct
      [t('touch.rope'), 'rope', 300, 64, 60, 'tap'], // tap once to arm, then double-tap the target (tap again: cancel)
    ];
    for (const [label, act, r, b, size, mode] of B) {
      const el = document.createElement('div'); el.className = 'tc-btn'; el.textContent = label; el.dataset.act = act;
      Object.assign(el.style, { right: r + 'px', bottom: b + 'px', width: size + 'px', height: size + 'px' });
      root.appendChild(el);
      const down = (e) => {
        e.preventDefault(); e.stopPropagation(); el.classList.add('tc-down');
        if (act === 'next') { dispatchEvent(new WheelEvent('wheel', { deltaY: 120 })); return; }
        if (act === 'rope') { this.state.ropeHeld = !this.state.ropeHeld; this.ropeBtn = el; el.classList.toggle('tc-armed', this.state.ropeHeld); if (!this.state.ropeHeld) this.ropeCancel = true; return; }
        if (mode === 'hold') { if (act === 'guard') this.state.guard = true; if (act === 'heavy') { this.state.heavyHeld = true; this.pressed.add('heavy'); } }
        else this.pressed.add(act);
        if (act === 'light') this.state.lightHeld = true; // long press = sheathe / sheathed release = parry
      };
      const up = (e) => {
        e.preventDefault(); e.stopPropagation(); el.classList.remove('tc-down');
        if (act === 'guard') this.state.guard = false; if (act === 'heavy') this.state.heavyHeld = false; if (act === 'light') this.state.lightHeld = false;
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    // Context action (TALK / GATHER / CARVE…): hidden until setAction(label) is called.
    const actBtn = (this.actBtn = document.createElement('div')); actBtn.className = 'tc-btn tc-act'; actBtn.style.display = 'none';
    Object.assign(actBtn.style, { right: '210px', bottom: '270px', width: '78px', height: '78px', borderColor: 'rgba(246,226,170,.95)' }); root.appendChild(actBtn);
    actBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); actBtn.classList.add('tc-down'); this.pressed.add('interact'); }, { passive: false });
    actBtn.addEventListener('touchend', (e) => { e.preventDefault(); actBtn.classList.remove('tc-down'); }, { passive: false });
    const menu = document.createElement('div'); menu.className = 'tc-btn tc-menu'; menu.textContent = t('touch.menu'); root.appendChild(menu);
    menu.addEventListener('touchstart', (e) => { e.preventDefault(); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); }, { passive: false });

    const left = root.querySelector('.tc-left'), right = root.querySelector('.tc-right');
    const R = 58;
    left.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (this.stickId !== null) return;
      const t = e.changedTouches[0]; this.stickId = t.identifier; this.origin = { x: t.clientX, y: t.clientY };
      Object.assign(this.stick.style, { display: 'block', left: t.clientX + 'px', top: t.clientY + 'px' }); hint.style.display = 'none';
    }, { passive: false });
    right.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (this.lookId !== null) return;
      const t = e.changedTouches[0]; this.lookId = t.identifier; this.lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) {
          let dx = t.clientX - this.origin.x, dy = t.clientY - this.origin.y; const d = Math.hypot(dx, dy);
          const k = d > R ? R / d : 1; dx *= k; dy *= k;
          this.knob.style.transform = `translate(${dx}px,${dy}px)`;
          const m = Math.min(1, d / R); const a = Math.atan2(dy, dx);
          const dead = m < 0.12 ? 0 : m;
          this.state.mx = Math.cos(a) * dead; this.state.my = -Math.sin(a) * dead;
          this.state.sprint = d > R * 1.25;
        } else if (t.identifier === this.lookId) {
          this.state.lookDx += t.clientX - this.lookLast.x; this.state.lookDy += t.clientY - this.lookLast.y;
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    // double-tap (two short taps, < 0.33 s apart, < 40 px apart) on the open screen while ROPE is held → hook target.
    // Taps are tracked per touch id; dragging (camera / stick) never counts, so looking around cannot fire the hook.
    const taps = new Map(); let lastTap = null;
    addEventListener('touchstart', (e) => { if (!this.enabled) return; for (const t of e.changedTouches) taps.set(t.identifier, { x: t.clientX, y: t.clientY, at: performance.now(), moved: false }); }, { passive: true });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const q = taps.get(t.identifier); if (q && Math.hypot(t.clientX - q.x, t.clientY - q.y) > 14) q.moved = true; } }, { passive: true });
    const tapEnd = (t) => {
      const q = taps.get(t.identifier); taps.delete(t.identifier); if (!q || q.moved || performance.now() - q.at > 250 || !this.state.ropeHeld) return;
      const now = performance.now();
      if (lastTap && now - lastTap.at < 330 && Math.hypot(q.x - lastTap.x, q.y - lastTap.y) < 40) { this.state.ropeTarget = { x: q.x, y: q.y }; lastTap = null; }
      else lastTap = { x: q.x, y: q.y, at: now };
    };
    const end = (e) => {
      for (const t of e.changedTouches) tapEnd(t);
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) {
          this.stickId = null; this.state.mx = this.state.my = 0; this.state.sprint = false;
          this.stick.style.display = 'none'; this.knob.style.transform = '';
        } else if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    addEventListener('touchmove', (e) => { if (this.enabled) { e.preventDefault(); move(e); } }, { passive: false });
    addEventListener('touchend', (e) => this.enabled && end(e));
    addEventListener('touchcancel', (e) => this.enabled && end(e));
    // Block iOS pinch-zoom / double-tap zoom.
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  show() { this.enabled = true; this.root.classList.add('tc-on'); }
  hide() { this.enabled = false; this.root.classList.remove('tc-on'); }
  // Contextual action button; pass null to hide it.
  setAction(label) { if (this._act === label) return; this._act = label; this.actBtn.style.display = label ? 'flex' : 'none'; if (label) this.actBtn.textContent = label; }
  // Town mode: hide combat buttons (keeps stick, look, MENU and the context action).
  // ROPE button shows the hook cooldown
  setRopeCooldown(sec) { if (!this.ropeBtnEl) this.ropeBtnEl = [...this.root.querySelectorAll('.tc-btn')].find((b) => b.dataset.act === 'rope'); const b = this.ropeBtnEl; if (!b) return; const txt = sec > 0 ? String(Math.ceil(sec)) : t('touch.rope'); if (b.textContent !== txt) { b.textContent = txt; b.style.opacity = sec > 0 ? '0.55' : '1'; } }
  disarmRope() { this.state.ropeHeld = false; this.ropeBtn?.classList.remove('tc-armed'); }
  setGuardLabel(label) { const b = [...this.root.querySelectorAll('.tc-btn')].find((x) => x.dataset.act === 'guard'); if (b && b.textContent !== label) b.textContent = label; }
  setPeaceful(on) { for (const b of this.root.querySelectorAll('.tc-btn:not(.tc-menu):not(.tc-act)')) b.style.display = on ? 'none' : 'flex'; }
  // Merge into the Input action state (called from Input.poll).
  apply(s) {
    if (!this.enabled) return;
    const t = this.state;
    if (t.mx || t.my) { s.move.x = t.mx; s.move.y = t.my; }
    s.look.x += t.lookDx * 0.006; s.look.y += t.lookDy * 0.005; t.lookDx = t.lookDy = 0;
    s.ropeHeld ||= !!t.ropeHeld; if (t.ropeTarget) { s.ropeTarget = t.ropeTarget; t.ropeTarget = null; }
    s.sprint ||= t.sprint; s.guard ||= t.guard; s.heavyHeld ||= t.heavyHeld; s.lightHeld ||= t.lightHeld;
    const p = this.pressed;
    s.lightAttack ||= p.has('light'); s.heavyAttack ||= p.has('heavy'); s.dodge ||= p.has('dodge'); s.jump ||= p.has('jump');
    s.item ||= p.has('item'); s.lockOn ||= p.has('lockOn'); s.interact ||= p.has('interact'); s.summon ||= p.has('summon');
    p.clear();
  }
}
