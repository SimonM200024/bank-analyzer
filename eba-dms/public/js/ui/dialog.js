// Modal dialogs. Cancel/Escape/X always close without committing anything.
import { esc, el } from './core.js';
import { icon } from './icons.js';

const stack = [];
export const dialogsOpen = () => stack.length > 0;

const appIcon = '<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0b3d91"/><path d="M4 5h8M4 8h6M4 11h8" stroke="#fff" stroke-width="1.6"/></svg>';

export function dialog({ title, body = '', buttons = [], width, height, help, onOpen, dim = false, className = '', closeValue = null, footLeft = '' }) {
  return new Promise((resolve) => {
    const ov = el(`<div class="overlay${dim ? ' dim' : ''}"></div>`);
    const d = el(`<div class="dlg ${className}" role="dialog" aria-label="${esc(title)}">
      <div class="tbar">${appIcon}<span class="t">${esc(title)}</span>${help !== false ? '<span class="b help" title="Pomoč">?</span>' : ''}<span class="b x" title="Zapri">✕</span></div>
      <div class="dbody"></div>
      ${buttons.length || footLeft ? `<div class="dfoot">${footLeft ? `<span class="left">${footLeft}</span>` : ''}</div>` : ''}
    </div>`);
    if (width) d.style.width = typeof width === 'number' ? width + 'px' : width;
    if (height) d.style.height = typeof height === 'number' ? height + 'px' : height;
    const bodyEl = d.querySelector('.dbody');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const api = {
      el: d, body: bodyEl,
      q: (s) => d.querySelector(s), qa: (s) => [...d.querySelectorAll(s)],
      close(v) {
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        ov.remove();
        document.removeEventListener('keydown', key, true);
        resolve(v);
      },
      setBusy(b) { d.querySelectorAll('.dfoot .btn').forEach((x) => { x.disabled = b; }); },
    };
    const foot = d.querySelector('.dfoot');
    buttons.forEach((b) => {
      const btn = el(`<button class="btn${b.primary ? ' primary' : ''}" ${b.disabled ? 'disabled' : ''} data-b="${esc(b.label)}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`);
      btn.addEventListener('click', async () => {
        if (b.action) {
          try {
            const r = await b.action(api);
            if (r === false) return;
            api.close(r === undefined ? b.value ?? b.label : r);
          } catch (e) { showError(api, e); }
        } else api.close(b.value ?? b.label);
      });
      foot.appendChild(btn);
    });
    d.querySelector('.tbar .x').addEventListener('click', () => api.close(closeValue));
    d.querySelector('.tbar .help')?.addEventListener('click', () => {
      alertBox(help || 'Pomoč za to okno v demo rekreaciji ni na voljo. Glejte README.md (poglavje "Uporaba").', { title: 'Pomoč', kind: 'info' });
    });
    function key(e) {
      if (stack[stack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(closeValue); }
      if (e.key === 'Enter' && !e.target.matches('textarea, select, button') && !e.target.closest('.no-enter')) {
        const primary = d.querySelector('.dfoot .btn.primary:not(:disabled)');
        if (primary) { e.preventDefault(); e.stopPropagation(); primary.click(); }
      }
    }
    document.addEventListener('keydown', key, true);
    ov.appendChild(d);
    document.body.appendChild(ov);
    stack.push(api);
    onOpen?.(api);
    const f = d.querySelector('[autofocus]') || d.querySelector('.dbody input:not([disabled]), .dbody select, .dbody textarea');
    (f || d.querySelector('.dfoot .btn.primary') || d).focus?.();
  });
}

export function showError(api, e) {
  let er = api.el.querySelector('.dfoot .err');
  if (!er) { er = document.createElement('span'); er.className = 'err left'; api.el.querySelector('.dfoot')?.prepend(er); }
  er.textContent = e?.message || String(e);
}

export function alertBox(text, { title = 'EBA DMS', kind = 'info' } = {}) {
  const ic = kind === 'error' ? 'cross' : kind === 'warn' ? 'help' : 'info';
  return dialog({ title, help: false, body: `<div class="msg">${icon(ic, 24)}<div>${esc(text)}</div></div>`, buttons: [{ label: 'V redu', primary: true }] });
}

export async function confirmBox(text, { title = 'EBA DMS', ok = 'Da', cancel = 'Ne' } = {}) {
  const r = await dialog({ title, help: false, body: `<div class="msg">${icon('help', 24)}<div>${esc(text)}</div></div>`,
    buttons: [{ label: ok, primary: true, value: true }, { label: cancel, value: false }], closeValue: false });
  return r === true;
}

export async function promptBox(label, value = '', { title = 'EBA DMS', multiline = false } = {}) {
  const input = multiline ? `<textarea class="win" rows="4" style="width:100%" autofocus>${esc(value)}</textarea>` : `<input class="win" style="width:100%" value="${esc(value)}" autofocus>`;
  const r = await dialog({ title, help: false, width: 380, body: `<div style="margin-bottom:6px">${esc(label)}</div>${input}`,
    buttons: [{ label: 'V redu', icon: 'check', primary: true, action: (d) => d.q('input,textarea').value }, { label: 'Prekliči', icon: 'cross', value: null }] });
  return r;
}

// Tri-state checkbox helper used by settings dialogs (null = inherited/default).
export function tri(v) { return v === true ? 'on' : v === null || v === undefined ? 'mixed' : ''; }
export function cycleTri(v) { return v === null || v === undefined ? true : v === true ? false : null; }
