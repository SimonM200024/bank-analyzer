// Menu bar and popup menus with keyboard navigation and Alt mnemonics.
// Item: { label, action, shortcut, icon, disabled, checked, items (submenu, array or fn), sep, bold, title }
import { icon } from './icons.js';
import { esc } from './core.js';

let chain = []; // open popup menus (root first)
let closeHandlers = [];

function resolve(v) { return typeof v === 'function' ? v() : v; }

export function closeMenus() {
  for (const m of chain) m.el.remove();
  chain = [];
  const hs = closeHandlers; closeHandlers = [];
  hs.forEach((f) => f());
}

function render(items) {
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  items.forEach((it, i) => {
    if (it.sep) { el.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
    const dis = resolve(it.disabled);
    const sub = it.items != null;
    const ic = it.checked ? '<span class="check">✓</span>' : it.icon ? icon(it.icon) : '';
    el.insertAdjacentHTML('beforeend', `<div class="row${dis ? ' disabled' : ''}${it.bold ? ' default' : ''}" data-i="${i}" role="menuitem" aria-disabled="${!!dis}"${it.title ? ` title="${esc(it.title)}"` : ''}>
      <span class="ic">${ic}</span><span class="lbl">${esc(it.label)}</span><span class="sc">${esc(it.shortcut || '')}</span><span class="sub">${sub ? '▶' : ''}</span></div>`);
  });
  return el;
}

export function openMenu(items, x, y, { level = 0, onClose, alignRight = false } = {}) {
  if (level === 0) closeMenus();
  chain = chain.slice(0, level);
  items = resolve(items);
  const el = render(items);
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  let left = alignRight ? x - r.width : x;
  if (left + r.width > innerWidth) left = Math.max(0, innerWidth - r.width - 2);
  let top = y;
  if (top + r.height > innerHeight) top = Math.max(0, innerHeight - r.height - 2);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  const m = { el, items, active: -1, level };
  chain[level] = m;
  if (onClose) closeHandlers.push(onClose);

  el.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const i = +row.dataset.i;
    if (m.active === i) return;
    setActive(m, i);
    const it = items[i];
    if (it.items && !resolve(it.disabled)) openSub(m, i);
    else chain.slice(level + 1).forEach((c) => c.el.remove()), chain = chain.slice(0, level + 1);
  });
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    activate(m, +row.dataset.i);
  });
  return m;
}

function setActive(m, i) {
  m.active = i;
  m.el.querySelectorAll('.row').forEach((r) => r.classList.toggle('active', +r.dataset.i === i));
}

function openSub(m, i) {
  const row = m.el.querySelector(`.row[data-i="${i}"]`);
  const r = row.getBoundingClientRect();
  const sub = openMenu(m.items[i].items, r.right - 2, r.top - 3, { level: m.level + 1 });
  return sub;
}

function activate(m, i) {
  const it = m.items[i];
  if (!it || it.sep || resolve(it.disabled)) return;
  if (it.items) { const s = openSub(m, i); setActive(s, firstEnabled(s.items, -1, 1)); return; }
  closeMenus();
  menubarState.bar?.clearOpen();
  if (it.action) setTimeout(() => it.action(), 0);
}

function firstEnabled(items, from, dir) {
  for (let k = 1; k <= items.length; k++) {
    const i = (from + dir * k + items.length * 2) % items.length;
    if (!items[i].sep && !resolve(items[i].disabled)) return i;
  }
  return -1;
}

export function contextMenu(e, items) {
  e.preventDefault();
  menubarState.bar?.clearOpen();
  openMenu(items, e.clientX, e.clientY);
}

// ---------------------------------------------------------------- menu bar
const menubarState = { bar: null };

export class MenuBar {
  // menus: [{ label, mnemonic, items, disabled }]
  constructor(host, menus, { brand = '' } = {}) {
    // Replace the host element so listeners from a previous MenuBar are dropped.
    const el = host.cloneNode(false);
    host.replaceWith(el);
    this.el = el; this.menus = menus; this.openIdx = -1;
    el.innerHTML = menus.map((m, i) => {
      const lbl = m.mnemonic ? m.label.replace(new RegExp(m.mnemonic, 'i'), (c) => `<u>${c}</u>`) : esc(m.label);
      return `<div class="mi${resolve(m.disabled) ? ' disabled' : ''}" data-i="${i}">${lbl}</div>`;
    }).join('') + (brand ? `<div class="brand">${brand}</div>` : '');
    el.addEventListener('mousedown', (e) => {
      const mi = e.target.closest('.mi');
      if (!mi) return;
      e.preventDefault();
      const i = +mi.dataset.i;
      if (this.openIdx === i) { closeMenus(); this.clearOpen(); } else this.open(i);
    });
    el.addEventListener('mouseover', (e) => {
      const mi = e.target.closest('.mi');
      if (mi && this.openIdx >= 0 && +mi.dataset.i !== this.openIdx) this.open(+mi.dataset.i);
    });
    menubarState.bar = this;
  }
  refresh() {
    this.el.querySelectorAll('.mi').forEach((mi) => mi.classList.toggle('disabled', !!resolve(this.menus[+mi.dataset.i].disabled)));
  }
  clearOpen() {
    this.openIdx = -1;
    this.el.querySelectorAll('.mi.open').forEach((x) => x.classList.remove('open'));
  }
  open(i, { keyboard = false } = {}) {
    const m = this.menus[i];
    if (!m || resolve(m.disabled)) return;
    const mi = this.el.querySelector(`.mi[data-i="${i}"]`);
    const r = mi.getBoundingClientRect();
    this.clearOpen();
    const menu = openMenu(m.items, r.left, r.bottom, { onClose: () => this.clearOpen() });
    this.openIdx = i;
    mi.classList.add('open');
    if (keyboard) setActive(menu, firstEnabled(menu.items, -1, 1));
  }
  mnemonic(ch) {
    const hits = this.menus.map((m, i) => ({ m, i })).filter(({ m }) => m.mnemonic && m.mnemonic.toLowerCase() === ch.toLowerCase() && !resolve(m.disabled));
    if (!hits.length) return false;
    // Duplicate mnemonics (Akcija/Okno both report Alt+K) cycle like native menus.
    const cur = hits.findIndex((h) => h.i === this.openIdx);
    const next = hits[(cur + 1) % hits.length];
    this.open(next.i, { keyboard: true });
    return true;
  }
}

// ---------------------------------------------------------------- keyboard
export function menuKeydown(e) {
  if (!chain.length) return false;
  const m = chain[chain.length - 1];
  const bar = menubarState.bar;
  switch (e.key) {
    case 'Escape':
      if (chain.length > 1) { m.el.remove(); chain.pop(); } else { closeMenus(); bar?.clearOpen(); }
      return true;
    case 'ArrowDown': setActive(m, firstEnabled(m.items, m.active, 1)); return true;
    case 'ArrowUp': setActive(m, firstEnabled(m.items, m.active < 0 ? 0 : m.active, -1)); return true;
    case 'ArrowRight': {
      const it = m.items[m.active];
      if (it?.items && !resolve(it.disabled)) { const s = openSub(m, m.active); setActive(s, firstEnabled(s.items, -1, 1)); }
      else if (bar && bar.openIdx >= 0) bar.open((bar.openIdx + 1) % bar.menus.length, { keyboard: true });
      return true;
    }
    case 'ArrowLeft':
      if (chain.length > 1) { m.el.remove(); chain.pop(); }
      else if (bar && bar.openIdx >= 0) bar.open((bar.openIdx - 1 + bar.menus.length) % bar.menus.length, { keyboard: true });
      return true;
    case 'Enter': case ' ': if (m.active >= 0) activate(m, m.active); return true;
    default:
      if (e.altKey && bar && e.key.length === 1) return bar.mnemonic(e.key);
      return true; // swallow other keys while a menu is open
  }
}

export function menusOpen() { return chain.length > 0; }

document.addEventListener('mousedown', (e) => {
  if (!chain.length) return;
  if (e.target.closest('.menu') || e.target.closest('.menubar .mi')) return;
  closeMenus();
  menubarState.bar?.clearOpen();
}, true);
window.addEventListener('blur', () => { closeMenus(); menubarState.bar?.clearOpen(); });
