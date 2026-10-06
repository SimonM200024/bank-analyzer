// Slovenian display formatting and parsing shared by server and browser.
// Dates are stored as ISO strings (UTC-free local "YYYY-MM-DDTHH:mm:ss").

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

export function isoLocal(d, withTime = true) {
  if (!d) return null;
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${s}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : s;
}

// Grid style: "1. 10. 2026" and "1. 10. 2026 14:39"
export function fmtDate(v) {
  const d = toDate(v);
  return d ? `${d.getDate()}. ${pad(d.getMonth() + 1)}. ${d.getFullYear()}` : '';
}
export function fmtDateTime(v) {
  const d = toDate(v);
  return d ? `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}
// Cover sheet style: "17. 09. 2026"
export function fmtDatePadded(v) {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}. ${pad(d.getMonth() + 1)}. ${d.getFullYear()}` : '';
}
// Signature / event style: "05.10.2026 07:07:50"
export function fmtStamp(v) {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '';
}
// Extracted data style: "17.09.2026"
export function fmtDateCompact(v) {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : '';
}

export function fmtAmount(n, decimals = 2) {
  if (n == null || n === '' || Number.isNaN(+n)) return '';
  const neg = +n < 0;
  const fixed = Math.abs(+n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + grouped + (decimals ? ',' + dec : '');
}

// Accepts "13.275,30", "13275,30", "13275.30", "-84,43"
export function parseAmount(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  let t = String(s).trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Accepts "1. 10. 2026", "01.10.2026", "1.10.2026 14:39", "2026-10-01"
export function parseDate(s) {
  if (s == null || s === '') return null;
  if (s instanceof Date) return s;
  const t = String(s).trim();
  const iso = toDate(t);
  if (iso && /^\d{4}-/.test(t)) return iso;
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return d.getMonth() === +m[2] - 1 ? d : null;
}

export function dayKey(v) {
  const d = toDate(v) || parseDate(v);
  return d ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : null;
}

// Slovenian noun forms: 1 dokument, 2 dokumenta, 3-4 dokumenti, 5+ dokumentov
export function plural(n, one, two, few, many) {
  const m100 = Math.abs(n) % 100;
  if (m100 === 1) return one;
  if (m100 === 2) return two;
  if (m100 === 3 || m100 === 4) return few;
  return many;
}
export const docCount = (n) => `${n} ${plural(n, 'dokument', 'dokumenta', 'dokumenti', 'dokumentov')}`;
export function selectedLabel(n) {
  const verb = plural(n, 'Izbran', 'Izbrana', 'Izbrani', 'Izbranih');
  return `${verb} ${docCount(n)}`;
}

// Elapsed "1 dni(an), 2 uri, 58 minut" as in the access panel.
export function fmtElapsed(fromIso, nowDate = new Date()) {
  const d = toDate(fromIso);
  if (!d) return '';
  let mins = Math.max(0, Math.floor((nowDate - d) / 60000));
  const days = Math.floor(mins / 1440); mins -= days * 1440;
  const hours = Math.floor(mins / 60); mins -= hours * 60;
  return `${days} dni(an), ${hours} ${plural(hours, 'ura', 'uri', 'ure', 'ur')}, ${mins} minut`;
}

// Display masks from the "Stolpci" dialog. Date masks use d/dd/M/MM/yyyy/yy/HH/mm/ss,
// number masks use "#,##0.00" style (rendered with Slovenian separators).
export function applyMask(value, mask, type) {
  if (!mask || value == null || value === '') return null;
  if (type === 'date' || type === 'datetime') {
    const d = toDate(value);
    if (!d) return null;
    return mask.replace(/yyyy|yy|dd|d|MM|M|HH|H|mm|ss/g, (tok) => ({
      yyyy: d.getFullYear(), yy: pad(d.getFullYear() % 100), dd: pad(d.getDate()), d: d.getDate(),
      MM: pad(d.getMonth() + 1), M: d.getMonth() + 1, HH: pad(d.getHours()), H: d.getHours(),
      mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
    })[tok]);
  }
  if (type === 'number' || type === 'amount') {
    const dec = (mask.split('.')[1] || '').replace(/[^0#]/g, '').length;
    const grouped = mask.includes(',');
    let s = fmtAmount(value, dec);
    if (!grouped) s = s.replace(/\./g, '');
    return s;
  }
  if (mask === '>') return String(value).toUpperCase();
  if (mask === '<') return String(value).toLowerCase();
  return null;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function norm(s) {
  return String(s ?? '').toLocaleLowerCase('sl');
}
