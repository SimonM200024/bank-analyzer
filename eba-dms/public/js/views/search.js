// Iskanje: independently scrolling criteria, type/direction selectors, scope
// checkboxes, results grid with find input.
import { api, esc, el } from '../ui/core.js';
import { Grid, cellText } from '../ui/grid.js';
import { icon } from '../ui/icons.js';
import { dialog } from '../ui/dialog.js';
import { GENERAL_CRITERIA, CONTENT_FIELDS, OPS, PROFILES, CATEGORIES, DIRECTIONS, CLASSIFICATION, SIGNATURE_STATES, EVENT_ACTIONS, categoryLabel } from '/core/schema.js';
import { fmtDate, parseDate } from '/core/format.js';
import { resolveColumns } from './office.js';
import { columnsDialog, pickHolders } from '../dialogs.js';
import { mountPreview } from '../ui/preview.js';

let seq = 0;
const blankRow = (key) => ({ id: ++seq, key, op: null, value: '', extra: false });

function initialState() {
  return {
    types: { mode: 'in', ids: ['racun'] }, direction: '', active: true, archived: false,
    rows: [...GENERAL_CRITERIA, ...CONTENT_FIELDS].map((f) => blankRow(f.key)), results: null, find: '',
  };
}

export function mountSearch(app, pane, content) {
  const st = app.searchState ||= initialState();
  if (app.pendingSearch) {
    Object.assign(st, initialState());
    for (const pr of app.pendingSearch.rows) {
      const r = st.rows.find((x) => x.key === pr.key);
      Object.assign(r, { op: pr.op, value: pr.value });
    }
    st.types = app.pendingSearch.types;
    app.pendingSearch = null;
    st.autorun = true;
  }
  pane.style.width = Math.max(250, pane.offsetWidth) + 'px';
  pane.innerHTML = `<div class="crit-top">
      <div style="display:flex;justify-content:space-between;align-items:center"><span>Tip dokumenta:</span><span class="tb tsel" style="height:16px;padding:0" data-tip="Izberi tipe">${icon('filterIcon', 14)}</span></div>
      <div class="typesel"><button class="win types" style="flex:1;text-align:left;height:20px;border:1px solid #a9a9a9;background:#fff;padding:0 3px;display:flex;justify-content:space-between"><span class="tl"></span><span style="font-size:9px">▼</span></button></div>
      <div style="margin-top:3px">Smer:</div>
      <select class="win dir" style="width:100%"><option value=""></option>${DIRECTIONS.map((d) => `<option value="${d.id}">${d.label}</option>`).join('')}</select>
    </div>
    <div class="crit"></div>
    <div class="crit-bottom"><label class="chk"><input type="checkbox" class="act" ${st.active ? 'checked' : ''}> Aktivni dokumenti</label><br><label class="chk"><input type="checkbox" class="arc" ${st.archived ? 'checked' : ''}> Dokumenti v hrambi</label></div>
    <div class="crit-actions"><button class="tb clr">${icon('cross', 12)}Počisti</button><button class="tb go">${icon('zoomIn', 14)}Išči</button></div>`;
  content.innerHTML = `<div class="tabwrap" style="flex:1;display:flex;flex-direction:column;min-height:0;min-width:0"><div class="tabline"><span class="tab">Iskanje (<span class="n">0</span>)</span><span class="tb x" data-tip="Zapri iskanje">${icon('cross', 14)}</span><span class="tb nw" data-tip="Novo iskanje">${icon('plus', 14)}</span></div>
    <div class="findbar"><span>Najdi</span><input class="win find" value="${esc(st.find)}"></div>
    <div class="gridhost" style="flex:1;display:flex;min-height:0"></div></div>`;
  pane.querySelector('.dir').value = st.direction;
  const crit = pane.querySelector('.crit');

  const grid = new Grid(content.querySelector('.gridhost'), {
    columns: resolveColumns(app, 'search', 'racun'),
    sort: { id: 'posiljatelj', dir: 'asc' },
    rowClass: (r) => [r.inOffice ? '' : 'muted', r.unread ? 'unread' : ''].join(' '),
    onOpen: (r) => app.openDocument(r),
    onSelect: (rows) => app.setSelection(rows),
    onContext: (e, rows) => app.rowContextMenu(e, rows),
    chooser: async () => {
      const res = await columnsDialog('racun', grid.columns);
      if (!res) return;
      await app.savePersonal({ columns: { search: res } });
      grid.setColumns(resolveColumns(app, 'search', 'racun'));
    },
    onColumnsChange: (cols) => app.savePersonal({ columns: { search: cols.map((c) => ({ id: c.id, w: c.w, mask: c.mask || '' })) } }),
  });
  app.grid = grid;
  app.preview = mountPreview(app, content, { office: false });

  const fieldOf = (key) => GENERAL_CRITERIA.find((f) => f.key === key) || CONTENT_FIELDS.find((f) => f.key === key);
  function optionsFor(f) {
    if (f.options) return f.options;
    if (f.key === 'g_klasifikacija') return CLASSIFICATION.flatMap((n) => [n.code, ...(n.children || []).map((c) => c.code)]);
    if (f.key === 'g_oznake') return [...new Set(Object.values(app.me.tags).flat())];
    if (f.key === 'g_nosilec_akcije') return app.me.users.map((u) => u.id);
    if (f.key === 'g_podpis') return SIGNATURE_STATES;
    return [];
  }
  const optLabel = (f, v) => f.key === 'g_nosilec_akcije' ? app.me.users.find((u) => u.id === v)?.name || v : f.key === 'g_klasifikacija' ? (CLASSIFICATION.flatMap((n) => [n, ...(n.children || [])]).find((n) => n.code === v)?.label ? `${v} ${CLASSIFICATION.flatMap((n) => [n, ...(n.children || [])]).find((n) => n.code === v).label}` : v) : v;

  function rowHtml(f, r, first) {
    const profile = f.profile ? PROFILES[f.profile] : null;
    const op = r.op || profile?.[0];
    const actionSet = st.rows.some((x) => x.key === 'g_akcija' && x.value);
    const disabled = f.dependsOn && !actionSet;
    const opSel = profile ? `<select class="win op" ${disabled ? 'disabled' : ''}>${profile.map((o) => `<option value="${o}" ${o === op ? 'selected' : ''}>${OPS[o]}</option>`).join('')}</select>` : '';
    let val;
    const dis = disabled ? 'disabled' : '';
    switch (f.control) {
      case 'yn': val = `<label class="chk"><input type="checkbox" class="yn" data-v="da" ${r.value === 'da' ? 'checked' : ''}> Da</label><span style="flex:1"></span><label class="chk" style="margin-right:60px"><input type="checkbox" class="yn" data-v="ne" ${r.value === 'ne' ? 'checked' : ''}> Ne</label>`; break;
      case 'd': val = `<span class="val"><select class="win v" ${dis}><option value=""></option>${optionsFor(f).map((o) => `<option value="${esc(o)}" ${o === r.value ? 'selected' : ''}>${esc(optLabel(f, o))}</option>`).join('')}</select></span>`; break;
      case 'pd': val = `<span class="val"><input class="win v" readonly value="${esc(r.display || '')}" ${dis}></span><span class="ell" data-pick="holder">…</span>`; break;
      case 'pk': val = `<span class="val"><input class="win v" value="${esc(r.value)}" ${dis}></span><span class="ell" data-pick="class">…</span>`; break;
      case 'p': val = `<span class="val"><input class="win v" value="${esc(r.value)}" ${dis}></span><span class="ell" data-pick="${f.type === 'date' ? 'date' : ['g_prejemnik', 'g_posiljatelj'].includes(f.key) ? 'partner' : 'values'}">…</span>`; break;
      default: val = `<span class="val"><input class="win v" value="${esc(r.value)}" ${dis}></span>`;
    }
    return `<div class="row" data-r="${r.id}">${opSel}${val}</div>`;
  }

  function renderCrit() {
    const scroll = crit.scrollTop;
    const groups = [['Splošno', GENERAL_CRITERIA], ['Vsebinski podatki', CONTENT_FIELDS]];
    let html = '';
    for (const [band, fields] of groups) {
      html += `<div class="band">${band}</div>`;
      for (const f of fields) {
        const rows = st.rows.filter((r) => r.key === f.key);
        const actionSet = st.rows.some((x) => x.key === 'g_akcija' && x.value);
        const disabled = f.dependsOn && !actionSet;
        const pm = ['i', 'p', 'pk'].includes(f.control)
          ? `<span class="pm"><span class="tb add" data-k="${f.key}" style="height:14px;padding:0">${icon('plus', 12)}</span><span class="tb rem" data-k="${f.key}" style="height:14px;padding:0;${rows.length > 1 ? '' : 'opacity:.5'}">${icon(rows.length > 1 ? 'minusGreen' : 'minus', 12)}</span></span>` : '';
        html += `<div class="c${disabled ? ' disabled' : ''}" data-k="${f.key}"><div class="hd"><span class="l" title="${esc(f.label)}">${esc(f.label)}</span>${['yn'].includes(f.control) || f.dependsOn ? '' : pm}</div>${rows.map((r, i) => rowHtml(f, r, i === 0)).join('')}</div>`;
      }
    }
    crit.innerHTML = html;
    crit.scrollTop = scroll;
  }

  function typesLabel() {
    const t = st.types;
    pane.querySelector('.types .tl').textContent = t?.ids?.length ? `${t.mode === 'out' ? 'Ne vsebuje' : 'Vsebuje'}: ${t.ids.map(categoryLabel).join(', ')}` : '';
  }

  const rowById = (id) => st.rows.find((r) => r.id === +id);
  crit.addEventListener('input', (e) => {
    const rowEl = e.target.closest('[data-r]');
    if (!rowEl) return;
    const r = rowById(rowEl.dataset.r);
    if (e.target.classList.contains('v')) { r.value = e.target.value; r.partnerId = null; }
  });
  crit.addEventListener('change', (e) => {
    const rowEl = e.target.closest('[data-r]');
    if (!rowEl) return;
    const r = rowById(rowEl.dataset.r);
    if (e.target.classList.contains('op')) r.op = e.target.value;
    if (e.target.classList.contains('v')) { r.value = e.target.value; if (r.key === 'g_akcija') renderCrit(); }
    if (e.target.classList.contains('yn')) {
      const v = e.target.dataset.v;
      r.value = e.target.checked ? v : '';
      renderCrit();
    }
  });
  crit.addEventListener('click', async (e) => {
    const add = e.target.closest('.add'), rem = e.target.closest('.rem'), pick = e.target.closest('[data-pick]');
    if (add) {
      const idx = st.rows.map((r) => r.key).lastIndexOf(add.dataset.k);
      st.rows.splice(idx + 1, 0, { ...blankRow(add.dataset.k), extra: true });
      renderCrit();
    } else if (rem) {
      const idx = st.rows.map((r) => r.key).lastIndexOf(rem.dataset.k);
      if (st.rows.filter((r) => r.key === rem.dataset.k).length > 1) { st.rows.splice(idx, 1); renderCrit(); }
    } else if (pick) {
      const r = rowById(pick.closest('[data-r]').dataset.r);
      const f = fieldOf(r.key);
      const kind = pick.dataset.pick;
      if (kind === 'date') {
        const v = await datePicker(r.value);
        if (v != null) { r.value = v; renderCrit(); }
      } else if (kind === 'holder') {
        const cid = app.companyId === 'all' ? app.me.companies[0].id : app.companyId;
        const res = await pickHolders(app, cid, { title: f.label, multi: false });
        if (res) { r.value = res.ids[0]; r.display = [...app.me.roles.map((x) => [`role:${x.id}`, x.path]), ...app.me.users.map((u) => [`user:${u.id}`, u.name])].find(([id]) => id === r.value)?.[1] || r.value; renderCrit(); }
      } else if (kind === 'class') {
        const { classifyDialog } = await import('../dialogs.js');
        const v = await classifyDialog(r.value);
        if (v) { r.value = v; renderCrit(); }
      } else if (kind === 'partner') {
        const { pickPartner } = await import('./settings.js');
        const p = await pickPartner(app);
        if (p) { r.value = p.shortName; r.partnerId = p.id; renderCrit(); }
      } else if (kind === 'values') {
        const vals = [...new Set((st.results || []).map((x) => x.fields?.[r.key]).filter(Boolean))].sort();
        const v = await dialog({ title: f.label, width: 300, body: vals.length ? `<select class="win" size="10" style="width:100%;height:200px">${vals.map((x) => `<option>${esc(x)}</option>`).join('')}</select>` : '<div class="demo-note">Ni vrednosti v trenutnih rezultatih iskanja.</div>',
          buttons: [{ label: 'V redu', primary: true, action: (d) => d.q('select')?.value || null }, { label: 'Prekliči', value: null }] });
        if (v) { r.value = v; renderCrit(); }
      }
    }
  });

  pane.querySelector('.types').addEventListener('click', (e) => typePopup(e.currentTarget));
  pane.querySelector('.tsel').addEventListener('click', (e) => typePopup(pane.querySelector('.types')));
  function typePopup(anchor) {
    document.querySelector('.vfilter')?.remove();
    const pop = el(`<div class="vfilter"><div class="vals">${CATEGORIES.map((c) => `<label><input type="checkbox" value="${c.id}" ${st.types?.ids?.includes(c.id) ? 'checked' : ''}>${esc(c.label)}</label>`).join('')}</div>
      <div class="foot"><span data-m="in" class="${st.types?.mode === 'in' ? 'active' : ''}">Vsebuje</span><span data-m="out" class="${st.types?.mode === 'out' ? 'active' : ''}">Ne vsebuje</span><span data-m="clear">Počisti</span></div></div>`);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = r.left + 'px'; pop.style.top = r.bottom + 'px'; pop.style.minWidth = r.width + 'px';
    pop.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      const ids = [...pop.querySelectorAll('input:checked')].map((i) => i.value);
      st.types = m === 'clear' || !ids.length ? null : { mode: m, ids };
      pop.remove();
      typesLabel();
    });
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }
  pane.querySelector('.dir').addEventListener('change', (e) => { st.direction = e.target.value; });
  pane.querySelector('.act').addEventListener('change', (e) => { st.active = e.target.checked; });
  pane.querySelector('.arc').addEventListener('change', (e) => { st.archived = e.target.checked; });
  pane.querySelector('.clr').addEventListener('click', () => {
    const keep = { results: st.results };
    Object.assign(st, initialState(), keep);
    pane.querySelector('.dir').value = ''; pane.querySelector('.act').checked = true; pane.querySelector('.arc').checked = false;
    typesLabel(); renderCrit();
  });
  pane.querySelector('.go').addEventListener('click', () => run());
  crit.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); run(); } });
  content.querySelector('.x').addEventListener('click', () => { st.results = []; showResults(); });
  content.querySelector('.nw').addEventListener('click', () => { Object.assign(st, initialState()); mountSearch(app, pane, content); app.view = view; showResults(); });
  const find = content.querySelector('.find');
  find.addEventListener('input', () => { st.find = find.value; showResults(); });

  async function run() {
    const rows = st.rows.filter((r) => r.value !== '' || ['empty', 'notEmpty'].includes(r.op)).map((r) => {
      const f = fieldOf(r.key);
      const op = r.op || (f.profile ? PROFILES[f.profile][0] : null);
      return { key: r.key, op, value: r.value, partnerId: r.partnerId || undefined };
    });
    for (const r of rows) {
      const f = fieldOf(r.key);
      if (f.type === 'date' && r.value && !['empty', 'notEmpty'].includes(r.op) && !parseDate(r.value)) {
        const { alertBox } = await import('../ui/dialog.js');
        return alertBox(`Neveljaven datum v polju "${f.label}": ${r.value}. Uporabite obliko d. m. llll.`, { kind: 'error' });
      }
    }
    try {
      const res = await api('search', { companyId: app.companyId, criteria: { types: st.types, direction: st.direction, active: st.active, archived: st.archived, rows } });
      st.results = res.rows; st.limited = res.limited; st.total = res.total;
      showResults();
    } catch (e) { app.error(e); }
  }

  function showResults() {
    const q = st.find.trim().toLocaleLowerCase('sl');
    const rows = (st.results || []).filter((r) => !q || grid.columns.some((c) => cellText(c, r).toLocaleLowerCase('sl').includes(q)));
    grid.setRows(rows);
    content.querySelector('.tabline .n').textContent = rows.length;
    app.setListInfo({ shown: rows.length, total: st.limited ? st.total : rows.length, limited: !!st.limited });
    app.setSelection(grid.selectedRows());
  }

  typesLabel();
  renderCrit();
  const view = {
    refresh: async () => { if (st.autorun) { st.autorun = false; await run(); } else if (st.results) await run(); else showResults(); },
    grid, selection: () => grid.selectedRows(), focus: () => pane.querySelector('.crit input.v')?.focus(),
  };
  return view;
}

async function datePicker(current) {
  const d = parseDate(current);
  const iso = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  return dialog({
    title: 'Izberi datum', width: 260, help: false,
    body: `<input type="date" class="win dt" style="width:100%;height:24px" value="${iso}">`,
    buttons: [
      { label: 'Danes', action: () => fmtDate(new Date()) },
      { label: 'V redu', primary: true, action: (dd) => { const v = dd.q('.dt').value; return v ? fmtDate(`${v}T00:00:00`) : ''; } },
      { label: 'Prekliči', value: null },
    ],
  });
}
