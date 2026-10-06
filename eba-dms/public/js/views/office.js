// Pisarna: folder tree, scope picker, document grid.
import { api, esc } from '../ui/core.js';
import { Grid } from '../ui/grid.js';
import { icon } from '../ui/icons.js';
import { FOLDERS, SCOPES, findFolder, columnById, defaultColumnsFor } from '/core/schema.js';
import { columnsDialog } from '../dialogs.js';

export function resolveColumns(app, key, category) {
  const saved = app.personal.columns?.[key];
  const list = saved?.length ? saved : defaultColumnsFor(key).map((id) => ({ id }));
  return list.map((c) => {
    const def = columnById(c.id, category);
    return def ? { ...def, w: c.w || def.w, mask: c.mask || '' } : null;
  }).filter(Boolean);
}

export function treeHtml(folders, { selected, counts = {}, showBadges = true, depth = 0, collapsed = new Set() }) {
  return folders.map((f) => {
    const head = depth === 0;
    const kids = f.children?.length;
    const open = !collapsed.has(f.id);
    const badge = showBadges && !head && !f.view && counts[f.id]?.unread ? `<span class="badge">${counts[f.id].unread}</span>` : '';
    const node = `<div class="node${head ? ' head' : ''}${f.view ? ' view' : ''}${selected === f.id ? ' selected' : ''}" data-id="${esc(f.id)}" style="padding-left:${depth * 14}px">
      <span class="chev" data-tg="${kids ? esc(f.id) : ''}">${kids ? (open ? '⌄' : '›') : ''}</span>${head || f.view ? '' : `<span class="ficon">${icon('folder')}</span>`}<span class="lbl">${esc(f.label)}</span>${badge}</div>`;
    return node + (kids && open ? treeHtml(f.children, { selected, counts, showBadges, depth: depth + 1, collapsed }) : '');
  }).join('');
}

export function mountOffice(app, pane, content) {
  const st = app.office;
  pane.innerHTML = `<div class="tree"></div><div class="pane-foot"><select class="win scope" title="Obseg prikaza">${SCOPES.map((s) => `<option value="${s.id}" ${s.id === st.scope ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>`;
  content.innerHTML = '<div class="gridhost" style="flex:1;display:flex;min-height:0"></div>';
  const tree = pane.querySelector('.tree');
  let counts = {};
  let folder = findFolder(st.folderId) || findFolder('in/racun');

  const grid = new Grid(content.querySelector('.gridhost'), {
    columns: resolveColumns(app, st.folderId, folder.category),
    sort: st.sorts[st.folderId] || { id: 'datum_prejetja', dir: 'asc' },
    rowClass: (r) => [r.inOffice ? '' : 'muted', r.unread ? 'unread' : ''].join(' '),
    childrenOf: (r) => r.childRows || [],
    onOpen: (r) => app.openDocument(r),
    onSelect: (rows) => app.setSelection(rows),
    onContext: (e, rows) => app.rowContextMenu(e, rows),
    onSort: (s) => { st.sorts[st.folderId] = s; },
    onFilter: () => app.setSelection(grid.selectedRows()),
    onColumnsChange: (cols) => saveCols(cols),
    chooser: () => chooseColumns(),
    onClearFilters: () => app.setSelection(grid.selectedRows()),
    emptyText: '',
  });
  app.grid = grid;

  function saveCols(cols) {
    app.savePersonal({ columns: { [st.folderId]: cols.map((c) => ({ id: c.id, w: c.w, mask: c.mask || '' })) } });
  }
  async function chooseColumns() {
    const res = await columnsDialog(folder.category || 'racun', grid.columns);
    if (!res) return;
    await app.savePersonal({ columns: { [st.folderId]: res } });
    grid.setColumns(resolveColumns(app, st.folderId, folder.category));
  }

  function renderTree() {
    tree.innerHTML = treeHtml(FOLDERS, { selected: st.folderId, counts, collapsed: st.collapsed });
  }

  tree.addEventListener('mousedown', (e) => {
    const tg = e.target.closest('[data-tg]');
    if (tg && tg.dataset.tg) {
      const id = tg.dataset.tg;
      st.collapsed.has(id) ? st.collapsed.delete(id) : st.collapsed.add(id);
      renderTree(); return;
    }
    const n = e.target.closest('.node');
    if (!n || n.classList.contains('head')) return;
    st.folderId = n.dataset.id;
    folder = findFolder(st.folderId);
    renderTree();
    grid.filters = st.filters[st.folderId] || {};
    grid.sort = st.sorts[st.folderId] || { id: 'datum_prejetja', dir: 'asc' };
    grid.setColumns(resolveColumns(app, st.folderId, folder.category));
    load({ keepSelection: false });
  });
  pane.querySelector('.scope').addEventListener('change', (e) => { st.scope = e.target.value; load({ keepSelection: false }); });

  let seq = 0;
  async function load({ keepSelection = true } = {}) {
    const my = ++seq;
    const args = { companyId: app.companyId, scope: st.scope, folderId: st.folderId };
    try {
      const [c, list] = await Promise.all([api('folderCounts', args), api('listDocuments', args)]);
      if (my !== seq) return;
      counts = c;
      renderTree();
      st.rowsById = new Map(list.rows.map((r) => [r.id, r]));
      grid.filters = st.filters[st.folderId] ||= {};
      grid.setRows(list.rows, { keepSelection });
      app.setListInfo({ shown: list.rows.length, total: list.total, limited: list.limited });
      app.setSelection(grid.selectedRows());
    } catch (e) { app.error(e); }
  }

  return {
    refresh: () => load(),
    grid,
    selection: () => grid.selectedRows(),
    focus: () => grid.host.focus(),
  };
}
