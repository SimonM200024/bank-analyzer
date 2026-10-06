// Dense data grid: filter-arrow row, sortable/resizable headers, striped rows,
// multi-select, value filters (Vsebuje / Ne vsebuje / Počisti), masks, expandable rows.
import { fmtDate, fmtDateTime, fmtAmount, applyMask, escapeHtml as esc } from '/core/format.js';
import { icon } from './icons.js';

export function cellText(col, row) {
  const v = col.get(row);
  if (col.mask) { const m = applyMask(v, col.mask, col.type); if (m != null) return m; }
  switch (col.type) {
    case 'date': return fmtDate(v);
    case 'datetime': return fmtDateTime(v);
    case 'amount': return v == null || v === '' ? '' : fmtAmount(v);
    case 'bool': return v ? 'Da' : '';
    case 'sig': return v && v !== 'Ni podpisan' ? v : '';
    case 'note': return v === 'yellow' ? 'Zaznamek' : v === 'blue' ? 'Moder zaznamek' : '';
    case 'attach': return v ? 'Priponka' : '';
    default: return v == null ? '' : String(v);
  }
}

function sortValue(col, row) {
  const v = col.get(row);
  if (col.type === 'amount') return v == null || v === '' ? -Infinity : Number(v);
  if (col.type === 'date' || col.type === 'datetime') return v || '';
  if (col.type === 'note') return v === 'yellow' ? 2 : v === 'blue' ? 1 : 0;
  if (col.type === 'attach') return v || 0;
  return cellText(col, row).toLocaleLowerCase('sl');
}

function cellHtml(col, row) {
  const v = col.get(row);
  switch (col.type) {
    case 'sig': return v && v !== 'Ni podpisan' ? icon('lock', 15) : '';
    case 'note': return v === 'yellow' ? icon('star', 13) : v === 'blue' ? icon('starBlue', 13) : '';
    case 'attach': return v ? icon('clip', 14) : '';
    default: return esc(cellText(col, row));
  }
}

export class Grid {
  constructor(host, opts) {
    this.host = host;
    this.o = { rowKey: (r) => r.id, rowClass: () => '', ...opts };
    this.columns = opts.columns || [];
    this.rows = [];
    this.view = [];
    this.sel = new Set();
    this.anchor = null;
    this.cursor = null;
    this.sort = opts.sort || null;
    this.filters = opts.filters || {};
    this.expanded = new Set();
    host.classList.add('gridwrap');
    host.tabIndex = 0;
    host.innerHTML = '';
    this.table = document.createElement('table');
    this.table.className = 'grid';
    host.appendChild(this.table);
    if (opts.chooser || opts.onClearFilters) {
      const ic = document.createElement('div');
      ic.className = 'gridicons';
      ic.innerHTML = `${opts.onClearFilters ? `<span class="clr" data-tip="Počisti filtre stolpcev">${icon('crossSmall', 12)}</span>` : ''}${opts.chooser ? `<span class="cho" data-tip="Stolpci">${icon('filterIcon', 13)}</span>` : ''}`;
      host.appendChild(ic);
      ic.querySelector('.cho')?.addEventListener('click', () => opts.chooser());
      ic.querySelector('.clr')?.addEventListener('click', () => { this.filters = {}; this.refresh(); opts.onClearFilters?.(); });
    }
    this.bind();
  }

  setColumns(cols) { this.columns = cols; this.refresh(); }
  setRows(rows, { keepSelection = true } = {}) {
    this.rows = rows;
    if (!keepSelection) this.sel.clear();
    const keys = new Set(rows.map(this.o.rowKey));
    for (const k of [...this.sel]) if (!keys.has(k)) this.sel.delete(k);
    this.refresh();
  }
  selectedRows() { return this.view.filter((r) => this.sel.has(this.o.rowKey(r))); }
  visibleRows() { return this.view.filter((r) => !r.__child); }
  select(keys, { scroll = true } = {}) {
    this.sel = new Set(keys);
    this.cursor = keys[keys.length - 1] ?? null;
    this.anchor = this.cursor;
    this.paintSelection(scroll);
    this.o.onSelect?.(this.selectedRows());
  }

  applyFilters(rows) {
    return rows.filter((r) => Object.entries(this.filters).every(([id, f]) => {
      const col = this.columns.find((c) => c.id === id);
      if (!col || !f?.values?.length) return true;
      const t = cellText(col, r) || '(Prazno)';
      const hit = f.values.includes(t);
      return f.mode === 'out' ? !hit : hit;
    }));
  }

  computeView() {
    let rows = this.applyFilters(this.rows);
    if (this.sort) {
      const col = this.columns.find((c) => c.id === this.sort.id);
      if (col) {
        const dir = this.sort.dir === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const x = sortValue(col, a), y = sortValue(col, b);
          return (x < y ? -1 : x > y ? 1 : 0) * dir;
        });
      }
    }
    const out = [];
    for (const r of rows) {
      out.push(r);
      const k = this.o.rowKey(r);
      if (this.expanded.has(k) && this.o.childrenOf) for (const c of this.o.childrenOf(r)) out.push({ ...c, __child: true, __parent: k });
    }
    this.view = out;
  }

  refresh() {
    this.computeView();
    const cols = this.columns;
    const totalW = cols.reduce((s, c) => s + (c.w || 100), 0);
    const head = `<colgroup>${cols.map((c) => `<col style="width:${c.w || 100}px">`).join('')}</colgroup>
      <thead><tr class="f">${cols.map((c) => `<th data-col="${esc(c.id)}"><span class="ftri${this.filters[c.id]?.values?.length ? ' on' : ''}" data-f="${esc(c.id)}">▼</span></th>`).join('')}</tr>
      <tr class="h">${cols.map((c) => {
        const s = this.sort?.id === c.id ? `<span class="srt">${this.sort.dir === 'desc' ? '⌄' : '⌃'}</span>` : '';
        return `<th data-col="${esc(c.id)}" title="${esc(c.label)}">${s}${esc(c.header || c.label)}<span class="rz" data-rz="${esc(c.id)}"></span></th>`;
      }).join('')}</tr></thead>`;
    const body = this.view.length ? this.view.map((r) => this.rowHtml(r)).join('') : '';
    this.table.style.width = totalW + 'px';
    this.table.innerHTML = head + `<tbody>${body}</tbody>`;
    if (!this.view.length && this.o.emptyText) this.table.insertAdjacentHTML('beforeend', `<caption style="caption-side:bottom;text-align:left" class="grid-empty">${esc(this.o.emptyText)}</caption>`);
    this.paintSelection(false);
  }

  rowHtml(r) {
    const k = this.o.rowKey(r);
    const cls = [this.o.rowClass(r), r.__child ? 'child' : ''].filter(Boolean).join(' ');
    const kids = !r.__child && this.o.childrenOf ? this.o.childrenOf(r) : [];
    return `<tr data-k="${esc(k)}" class="${cls}">${this.columns.map((c, i) => {
      const cl = c.type === 'amount' ? 'num' : ['sig', 'note', 'attach'].includes(c.type) ? 'ic' : '';
      let pre = '';
      if (i === 0 && kids.length) pre = `<span class="exp" data-exp="${esc(k)}">${this.expanded.has(k) ? '⌄' : '›'}</span>`;
      if (i === 0 && r.__child) pre = '<span class="exp"></span>&nbsp;';
      return `<td class="${cl}">${pre}${cellHtml(c, r)}</td>`;
    }).join('')}</tr>`;
  }

  paintSelection(scroll) {
    let last = null;
    for (const tr of this.table.tBodies[0]?.rows || []) {
      const on = this.sel.has(tr.dataset.k);
      tr.classList.toggle('sel', on);
      if (tr.dataset.k === this.cursor) last = tr;
    }
    if (scroll && last) {
      const hr = this.table.tHead.getBoundingClientRect().height;
      const top = last.offsetTop - hr, bottom = last.offsetTop + last.offsetHeight;
      if (top < this.host.scrollTop) this.host.scrollTop = top;
      else if (bottom > this.host.scrollTop + this.host.clientHeight) this.host.scrollTop = bottom - this.host.clientHeight;
    }
  }

  keyIndex(k) { return this.view.findIndex((r) => this.o.rowKey(r) === k); }

  bind() {
    const host = this.host;
    host.addEventListener('mousedown', (e) => {
      const exp = e.target.closest('[data-exp]');
      if (exp) {
        const k = exp.dataset.exp;
        this.expanded.has(k) ? this.expanded.delete(k) : this.expanded.add(k);
        this.refresh(); e.preventDefault(); return;
      }
      const ftri = e.target.closest('[data-f]');
      if (ftri) { e.preventDefault(); this.openValueFilter(ftri.dataset.f, ftri); return; }
      const rz = e.target.closest('[data-rz]');
      if (rz) { this.startResize(e, rz.dataset.rz); return; }
      const tr = e.target.closest('tbody tr');
      if (!tr) return;
      const k = tr.dataset.k;
      if (e.button === 2 && this.sel.has(k)) return;
      if (e.shiftKey && this.anchor) {
        const a = this.keyIndex(this.anchor), b = this.keyIndex(k);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        this.sel = new Set(this.view.slice(lo, hi + 1).map(this.o.rowKey));
      } else if (e.ctrlKey || e.metaKey) {
        this.sel.has(k) ? this.sel.delete(k) : this.sel.add(k);
        this.anchor = k;
      } else { this.sel = new Set([k]); this.anchor = k; }
      this.cursor = k;
      this.paintSelection(false);
      this.o.onSelect?.(this.selectedRows());
    });
    host.addEventListener('click', (e) => {
      const th = e.target.closest('thead tr.h th');
      if (!th || e.target.closest('[data-rz]') || this.resizing) return;
      const id = th.dataset.col;
      this.sort = this.sort?.id === id ? { id, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' };
      this.refresh();
      this.o.onSort?.(this.sort);
    });
    host.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tbody tr');
      if (tr && !e.target.closest('[data-exp]')) this.o.onOpen?.(this.view[this.keyIndex(tr.dataset.k)]);
    });
    host.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('tbody tr');
      if (!tr) return;
      if (!this.sel.has(tr.dataset.k)) { this.sel = new Set([tr.dataset.k]); this.cursor = this.anchor = tr.dataset.k; this.paintSelection(false); this.o.onSelect?.(this.selectedRows()); }
      this.o.onContext?.(e, this.selectedRows());
    });
    host.addEventListener('keydown', (e) => {
      if (!this.view.length) return;
      const i = this.cursor ? this.keyIndex(this.cursor) : -1;
      let n = null;
      if (e.key === 'ArrowDown') n = Math.min(this.view.length - 1, i + 1);
      else if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = this.view.length - 1;
      else if (e.key === 'PageDown') n = Math.min(this.view.length - 1, i + Math.floor(host.clientHeight / 20) - 2);
      else if (e.key === 'PageUp') n = Math.max(0, i - Math.floor(host.clientHeight / 20) + 2);
      else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); this.o.onOpen?.(this.view[i]); return; }
      else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.select(this.view.map(this.o.rowKey), { scroll: false }); return; }
      if (n == null) return;
      e.preventDefault();
      const k = this.o.rowKey(this.view[n]);
      if (e.shiftKey && this.anchor) {
        const a = this.keyIndex(this.anchor);
        const [lo, hi] = a < n ? [a, n] : [n, a];
        this.sel = new Set(this.view.slice(lo, hi + 1).map(this.o.rowKey));
      } else { this.sel = new Set([k]); this.anchor = k; }
      this.cursor = k;
      this.paintSelection(true);
      this.o.onSelect?.(this.selectedRows());
    });
  }

  startResize(e, id) {
    e.preventDefault();
    const col = this.columns.find((c) => c.id === id);
    const startX = e.clientX, startW = col.w || 100;
    this.resizing = true;
    const colEl = this.table.querySelectorAll('col')[this.columns.indexOf(col)];
    const move = (ev) => {
      col.w = Math.max(16, startW + ev.clientX - startX);
      colEl.style.width = col.w + 'px';
      this.table.style.width = this.columns.reduce((s, c) => s + (c.w || 100), 0) + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setTimeout(() => { this.resizing = false; }, 0);
      this.o.onColumnsChange?.(this.columns);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  openValueFilter(id, anchor) {
    document.querySelector('.vfilter')?.remove();
    const col = this.columns.find((c) => c.id === id);
    if (!col) return;
    const others = { ...this.filters }; delete others[id];
    const saved = this.filters; this.filters = others;
    const base = this.applyFilters(this.rows); this.filters = saved;
    const vals = [...new Set(base.map((r) => cellText(col, r) || '(Prazno)'))].sort((a, b) => (a === '(Prazno)' ? -1 : b === '(Prazno)' ? 1 : a.localeCompare(b, 'sl')));
    const cur = this.filters[id];
    const pop = document.createElement('div');
    pop.className = 'vfilter';
    pop.innerHTML = `<div class="vals">${vals.map((v) => `<label title="${esc(v)}"><input type="checkbox" value="${esc(v)}" ${cur?.values?.includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>
      <div class="foot"><span data-m="in" class="${cur?.mode === 'in' ? 'active' : ''}">Vsebuje</span><span data-m="out" class="${cur?.mode === 'out' ? 'active' : ''}">Ne vsebuje</span><span data-m="clear">Počisti</span></div>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left - 120, innerWidth - pop.offsetWidth - 4) + 'px';
    pop.style.top = r.bottom + 'px';
    if (parseFloat(pop.style.left) < 0) pop.style.left = '2px';
    pop.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      const checked = [...pop.querySelectorAll('input:checked')].map((i) => i.value);
      if (m === 'clear' || !checked.length) delete this.filters[id];
      else this.filters[id] = { mode: m, values: checked };
      pop.remove();
      this.refresh();
      this.o.onFilter?.(this.filters);
    });
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }

  toTSV() {
    const cols = this.columns.filter((c) => !['sig', 'note', 'attach'].includes(c.type) || true);
    const lines = [cols.map((c) => c.label).join('\t')];
    for (const r of this.visibleRows()) lines.push(cols.map((c) => cellText(c, r).replace(/\t|\n/g, ' ')).join('\t'));
    return lines.join('\r\n');
  }

  toPrintHtml(title) {
    return `<h3 style="font:600 14px Segoe UI,Arial">${esc(title)}</h3><table style="border-collapse:collapse;font:11px Segoe UI,Arial">
      <tr>${this.columns.map((c) => `<th style="border:1px solid #999;padding:2px 4px;text-align:left">${esc(c.header || c.label)}</th>`).join('')}</tr>
      ${this.visibleRows().map((r) => `<tr>${this.columns.map((c) => `<td style="border:1px solid #ccc;padding:1px 4px">${esc(cellText(c, r))}</td>`).join('')}</tr>`).join('')}</table>`;
  }
}
