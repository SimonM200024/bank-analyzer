// DOM helpers, API client, toast/tooltips.
export { escapeHtml as esc } from '/core/format.js';
import { escapeHtml } from '/core/format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function on(root, type, selector, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(op, args = {}) {
  const res = await fetch(`/api/${op}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args), credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && op !== 'login') { onUnauthorized(); throw new ApiError(data?.error || 'Seja je potekla.', 401); }
  if (!res.ok) throw new ApiError(data?.error || `Napaka ${res.status}`, res.status);
  return data;
}

export async function upload(file) {
  const res = await fetch('/api/upload', {
    method: 'POST', body: file, credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Nalaganje ni uspelo.', res.status);
  return data;
}

export const blobUrl = (id) => `/blob/${id}`;

let toastTimer = null;
export function toast(text, ms = 5000) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// Tooltip for truncated grid cells (native title is slow; this mimics Qt's quick tips)
let tipEl = null, tipTimer = null;
export function installTooltips() {
  document.addEventListener('mouseover', (e) => {
    const c = e.target.closest('[data-tip], td, th');
    clearTimeout(tipTimer);
    if (tipEl) tipEl.remove(), tipEl = null;
    if (!c) return;
    let text = c.dataset.tip;
    if (!text && (c.tagName === 'TD' || c.tagName === 'TH') && c.scrollWidth > c.clientWidth + 1) text = c.textContent.trim();
    if (!text) return;
    tipTimer = setTimeout(() => {
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      tipEl.textContent = text;
      document.body.appendChild(tipEl);
      const r = c.getBoundingClientRect();
      const x = Math.min(e.clientX + 6, innerWidth - tipEl.offsetWidth - 4);
      tipEl.style.left = x + 'px';
      tipEl.style.top = Math.min(r.bottom + 2, innerHeight - 24) + 'px';
    }, 450);
  });
  document.addEventListener('mousedown', () => { clearTimeout(tipTimer); if (tipEl) tipEl.remove(), tipEl = null; });
}

export function download(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFiles({ multiple = true, accept = '' } = {}) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.multiple = multiple; i.accept = accept;
    i.style.display = 'none';
    i.addEventListener('change', () => { resolve([...i.files]); i.remove(); });
    document.body.appendChild(i);
    i.click();
  });
}

export function h(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? (vals[i]?.__raw ?? escapeHtml(vals[i])) : ''), '');
}
export const raw = (s) => ({ __raw: s ?? '' });
