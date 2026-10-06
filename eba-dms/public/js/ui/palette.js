// Modern theme: command palette (Ctrl+Shift+P). One search box for documents,
// folders, views and every menu command.
import { esc } from './core.js';
import { icon } from './icons.js';
import { fmtDate } from '/core/format.js';

// Case- and diacritic-insensitive ("racun" finds "Račun").
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sl');

let open = null;
export const paletteOpen = () => !!open;

// Flatten menu definitions into "Meni › Ukaz" entries (enabled leaves only).
export function menuCommands(menus) {
  const out = [];
  const walk = (items, path) => {
    for (const it of (typeof items === 'function' ? items() : items) || []) {
      if (it.sep || it.disabled) continue;
      if (it.items) { walk(it.items, [...path, it.label]); continue; }
      if (it.action) out.push({ label: it.label, path: path.join(' › '), icon: it.icon, shortcut: it.shortcut, run: it.action });
    }
  };
  for (const m of menus) if (!m.noPalette && !(typeof m.disabled === 'function' ? m.disabled() : m.disabled)) walk(m.items, [m.label]);
  return out;
}

export function openPalette({ commands, places, docs, onDoc, placeholder = 'Išči dokumente, mape in ukaze …' }) {
  if (open) { open.input.focus(); return; }
  const root = document.createElement('div');
  root.className = 'cmdp';
  root.innerHTML = `<div class="box" role="dialog" aria-label="Iskanje ukazov">
    <input type="text" placeholder="${esc(placeholder)}" aria-label="Iskanje" spellcheck="false" autocomplete="off">
    <div class="list" role="listbox"></div>
    <div class="foot"><span>↑↓ izbira</span><span>Enter odpri</span><span>Esc zapri</span></div></div>`;
  document.body.appendChild(root);
  const input = root.querySelector('input'), list = root.querySelector('.list');
  let docRows = [], items = [], cur = 0;
  open = { input };
  const prevFocus = document.activeElement;

  const close = () => { root.remove(); open = null; document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); };

  const score = (text, q) => {
    const t = fold(text);
    if (!q) return 1;
    if (t.startsWith(q)) return 3;
    if (t.includes(` ${q}`)) return 2;
    return t.includes(q) ? 1 : 0;
  };

  function render() {
    const q = fold(input.value.trim());
    const groups = [];
    const pick = (arr, text, limit) => arr.map((x) => [x, score(text(x), q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([x]) => x);
    if (q) {
      const party = (r) => (r.direction === 'out' ? r.recipient : r.sender) || '';
      const d = pick(docRows, (r) => `${r.subject} ${party(r)} ${r.fields?.stevilka_racuna || ''}`, 8);
      if (d.length) groups.push(['Dokumenti', d.map((r) => ({ kind: 'doc', row: r, icon: 'docs', t: r.subject, s: `${r.externalStatusLabel || r.categoryLabel}${r.receivedAt || r.createdAt ? ' · ' + fmtDate(r.receivedAt || r.createdAt) : ''}` }))]);
    }
    const p = pick(places, (x) => `${x.label} ${x.path || ''}`, q ? 8 : 6);
    if (p.length) groups.push(['Pogledi in mape', p.map((x) => ({ kind: 'cmd', ...x, t: x.label, s: x.path || '' }))]);
    const c = pick(commands, (x) => `${x.label} ${x.path}`, q ? 12 : 8);
    if (c.length) groups.push(['Ukazi', c.map((x) => ({ kind: 'cmd', ...x, t: x.label, s: x.shortcut || x.path }))]);
    items = groups.flatMap(([, g]) => g);
    cur = Math.min(cur, Math.max(0, items.length - 1));
    let i = 0;
    list.innerHTML = groups.length ? groups.map(([g, arr]) => `<div class="grp">${esc(g)}</div>${arr.map((x) => {
      const n = i++;
      return `<div class="it${n === cur ? ' on' : ''}" role="option" data-i="${n}">${icon(x.icon || 'command', 18)}<span class="t">${esc(x.t)}</span><span class="s">${esc(x.s || '')}</span></div>`;
    }).join('')}`).join('') : '<div class="empty">Ni zadetkov.</div>';
    list.querySelector('.it.on')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(x) {
    if (!x) return;
    close();
    if (x.kind === 'doc') onDoc(x.row); else x.run();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (!items.length) return;
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); choose(items[cur]); return; }
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { cur = 0; render(); });
  list.addEventListener('mousemove', (e) => {
    const it = e.target.closest('.it');
    if (it && +it.dataset.i !== cur) { cur = +it.dataset.i; list.querySelectorAll('.it').forEach((n) => n.classList.toggle('on', +n.dataset.i === cur)); }
  });
  list.addEventListener('click', (e) => { const it = e.target.closest('.it'); if (it) choose(items[+it.dataset.i]); });
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  render();
  input.focus();
  Promise.resolve(docs?.()).then((rows) => { if (open && rows) { docRows = rows; render(); } }).catch(() => {});
}

