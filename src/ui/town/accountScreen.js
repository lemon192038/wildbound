// Account gate shown over the live 3D town: connecting → (offline/retry) → sign in / create account.
import { el, esc, swallowTouch } from './common.js';
import { fieldUrl } from './dockPanel.js';
import { t, serverMsg, langToggleHtml, bindLangToggle } from '../../shared/i18n.js';

const EMBLEM = `<svg viewBox="0 0 120 120" class="tw-emblem" aria-hidden="true"><defs><linearGradient id="twG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="#d9b673"/><stop offset="1" stop-color="#7c531b"/></linearGradient>
  <linearGradient id="twE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
  <path d="M60 6 L104 30 L104 74 C104 94 84 108 60 116 C36 108 16 94 16 74 L16 30 Z" fill="rgba(12,8,6,.75)" stroke="url(#twG)" stroke-width="2.4"/>
  <path d="M60 14 L96 34 L96 73 C96 89 80 101 60 108 C40 101 24 89 24 73 L24 34 Z" fill="none" stroke="rgba(217,182,115,.35)" stroke-width="1"/>
  <path d="M38 30 C44 44 42 60 34 74 M52 26 C58 44 58 64 50 84 M68 26 C74 44 74 64 66 84 M82 30 C88 44 86 60 78 74" stroke="url(#twE)" stroke-width="5" stroke-linecap="round" fill="none" transform="translate(4 4) skewX(-12)"/></svg>`;

export function createAccountScreen(root, acct, { onReady }) {
  let node = null; let mode = 'login'; let busy = false;
  const offline = () => { location.href = fieldUrl('hunt', 'varkhul'); };
  function frame(inner) {
    if (!node) {
      node = el('div', 'tw-gate', '', root); swallowTouch(node);
      node.addEventListener('keydown', (e) => e.stopPropagation());
    }
    node.innerHTML = `<div class="tw-gate-brand">${EMBLEM}<div class="tw-gate-word">WILDBOUND</div><div class="tw-gate-tag">${t('gate.tag')}</div></div>
      <div class="tw-gate-card tw-frame">${inner}</div>
      <button class="tw-link tw-gate-off" data-a="offline">${t('gate.offline')}</button>${langToggleHtml('tw-gate-lang')}`;
    node.querySelector('[data-a=offline]').addEventListener('click', offline); bindLangToggle(node);
    return node;
  }
  function connecting(text = t('gate.connecting')) { frame(`<div class="tw-gate-wait"><span class="tw-spin"></span><p>${esc(text)}</p></div>`); }
  function unreachable() {
    frame(`<div class="tw-gate-wait err"><b>${t('gate.unreachable')}</b><p>${t('gate.unreachableSub')}</p>
      <button class="tw-btn tw-primary tw-big" data-a="retry">${t('gate.retry')}</button></div>`);
    node.querySelector('[data-a=retry]').addEventListener('click', () => boot());
  }
  function form(message = '', kind = 'err') {
    const reg = mode === 'register';
    frame(`<div class="tw-gate-tabs" role="tablist"><button class="tw-tab ${reg ? '' : 'on'}" data-m="login" role="tab">${t('gate.signIn')}</button><button class="tw-tab ${reg ? 'on' : ''}" data-m="register" role="tab">${t('gate.create')}</button></div>
      <form class="tw-form" novalidate autocomplete="on">
        <label><span>${t('gate.name')}</span><input class="tw-input" name="name" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" minlength="3" maxlength="16" required placeholder="${t('gate.namePh')}" enterkeyhint="next"></label>
        <label><span>${t('gate.pw')}</span><input class="tw-input" name="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="8" maxlength="72" required placeholder="${reg ? t('gate.pwPh') : '••••••••'}" enterkeyhint="${reg ? 'next' : 'go'}"></label>
        ${reg ? `<label><span>${t('gate.pw2')}</span><input class="tw-input" name="pw2" type="password" autocomplete="new-password" maxlength="72" required placeholder="${t('gate.pw2Ph')}" enterkeyhint="go"></label>` : ''}
        <p class="tw-form-msg ${kind}" role="alert">${esc(serverMsg(message))}</p>
        <button class="tw-btn tw-primary tw-big" type="submit">${reg ? t('gate.createBtn') : t('gate.enter')}</button>
        <p class="tw-form-alt">${reg ? `${t('gate.already')} <button type="button" class="tw-link" data-m="login">${t('gate.signInLink')}</button>` : `${t('gate.new')} <button type="button" class="tw-link" data-m="register">${t('gate.createLink')}</button>`}</p>
      </form>`);
    const f = node.querySelector('form'); const prev = form.last || {};
    f.name.value = prev.name || ''; setTimeout(() => (f.name.value ? f.pw : f.name).focus({ preventScroll: true }), 50);
    node.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { form.last = { name: f.name.value }; mode = b.dataset.m; form(); }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (busy) return;
      const name = f.name.value.trim().replace(/\s+/g, ' '), pw = f.pw.value; const msg = f.querySelector('.tw-form-msg');
      const bad = (t, input) => { msg.className = 'tw-form-msg err'; msg.textContent = t; input?.focus(); input?.classList.add('bad'); };
      f.querySelectorAll('.bad').forEach((i) => i.classList.remove('bad'));
      if (!/^[\p{L}\p{N}_\- ]{3,16}$/u.test(name)) return bad(t('acct.badName'), f.name);
      if (pw.length < 8 || pw.length > 72) return bad(t('acct.badPw'), f.pw);
      if (reg && f.pw2.value !== pw) return bad(t('acct.pwMismatch'), f.pw2);
      busy = true; const sub = f.querySelector('[type=submit]'); sub.disabled = true; sub.innerHTML = `<span class="tw-spin sm"></span> ${reg ? t('gate.creating') : t('gate.signingIn')}`;
      msg.className = 'tw-form-msg'; msg.textContent = '';
      const r = await (reg ? acct.register(name, pw) : acct.login(name, pw)).catch(() => ({ ok: false, message: t('srv.oops') }));
      busy = false; form.last = { name };
      if (r?.ok) { hide(); onReady?.(r.state, reg); return; }
      sub.disabled = false; sub.textContent = reg ? t('gate.createBtn') : t('gate.enter'); bad(serverMsg(r?.message || 'Request failed', r?.error), r?.error === 'taken' || r?.error === 'bad_name' ? f.name : f.pw);
    });
  }
  async function boot() {
    connecting();
    const up = await acct.probe(); if (!up) return unreachable();
    if (acct.loggedIn) { hide(); onReady?.(acct.state, false); return; }
    const s = await acct.restore();
    if (s) { hide(); onReady?.(s, false); } else form();
  }
  function hide() { if (!node) return; const n = node; node = null; n.classList.add('out'); setTimeout(() => n.remove(), 450); }
  return { boot, show: (msg, kind) => { mode = 'login'; form(msg, kind); }, hide, get open() { return !!node; } };
}
