// Skrbništvo: documents per office for supervising roles.
import { api, esc } from '../ui/core.js';
import { Grid } from '../ui/grid.js';
import { FOLDERS, findFolder } from '/core/schema.js';
import { treeHtml, resolveColumns } from './office.js';
import { columnsDialog } from '../dialogs.js';

const SUP_FOLDERS = FOLDERS.map((f) => ({ ...f, children: f.children.map((c) => ({ ...c, children: undefined })) }));

export function mountSupervision(app, pane, content) {
  const st = app.supState ||= { roleId: '', folderId: null, collapsed: new Set() };
  pane.innerHTML = `<div style="padding:4px 3px"><select class="win role" style="width:100%" title="Vloga / organizacijska enota"><option value=""></option></select></div><div class="tree"></div>`;
  const tree = pane.querySelector('.tree');
  let roles = [];
  let grid = null;

  function renderTree() { tree.innerHTML = treeHtml(SUP_FOLDERS, { selected: st.folderId, showBadges: false, collapsed: st.collapsed }); }

  function renderOverview(counts) {
    app.grid = null;
    content.innerHTML = `<div style="display:flex;flex:1;min-height:0"><div style="flex:1;padding:8px 10px"><div style="font:700 15px var(--font)">Skrbništvo</div>
      <div class="demo-note" style="margin-top:6px">Izberite mapo na levi za seznam dokumentov po pisarnah${st.roleId ? ' izbrane vloge' : ''}.</div></div>
      <div style="width:300px;padding:8px 8px 0 6px;border-left:1px solid #b5b5b5;margin:8px 0">
        <table class="plain sumt"><colgroup><col><col style="width:80px"></colgroup>
        <tr><th style="background:#a5a5a5;color:#fff;font-weight:700">Mapa</th><th style="background:#a5a5a5;color:#fff;font-weight:700;text-align:right">Št. dok.</th></tr>
        ${['VHODNI', 'IZHODNI', 'INTERNI'].map((k) => `<tr><td style="border-bottom:1px solid #aaa"><span class="lnk" data-top="${k}">${k}</span></td><td style="text-align:right;border-bottom:1px solid #aaa">${counts[k]}</td></tr>`).join('')}
        <tr><td><b>Skupaj:</b></td><td style="text-align:right"><b>${counts.total}</b></td></tr></table></div></div>`;
    content.querySelectorAll('[data-top]').forEach((a) => a.addEventListener('click', () => {
      const top = SUP_FOLDERS.find((f) => f.label === a.dataset.top);
      if (top?.children?.length) { st.folderId = top.children[top.children.length - 1].id; load(); }
    }));
    app.setListInfo({ shown: counts.total, total: counts.total, limited: false });
    app.setSelection([]);
  }

  function renderGrid(rows) {
    if (!grid || !content.contains(grid.host)) {
      content.innerHTML = '<div class="gridhost" style="flex:1;display:flex;min-height:0"></div>';
      grid = new Grid(content.querySelector('.gridhost'), {
        columns: resolveColumns(app, 'supervision', findFolder(st.folderId)?.category || 'racun'),
        rowKey: (r) => r.rowKey,
        sort: { id: 'datum_v_pisarni', dir: 'asc' },
        rowClass: (r) => (r.unread ? 'unread' : ''),
        onOpen: (r) => app.openDocument(r),
        onSelect: (rs) => app.setSelection(rs),
        onContext: (e, rs) => app.rowContextMenu(e, rs),
        chooser: async () => {
          const res = await columnsDialog(findFolder(st.folderId)?.category || 'racun', grid.columns);
          if (!res) return;
          await app.savePersonal({ columns: { supervision: res } });
          grid.setColumns(resolveColumns(app, 'supervision', findFolder(st.folderId)?.category || 'racun'));
        },
      });
      app.grid = grid;
    }
    grid.setRows(rows);
    app.setListInfo({ shown: rows.length, total: rows.length, limited: false });
    app.setSelection(grid.selectedRows());
  }

  async function load() {
    try {
      const r = await api('supervision', { companyId: app.companyId, roleId: st.roleId || undefined, folderId: st.folderId || undefined });
      if (!roles.length) {
        roles = r.roles;
        pane.querySelector('.role').insertAdjacentHTML('beforeend', roles.map((x) => `<option value="${x.id}" title="${esc(x.path)}">${esc(x.name)}</option>`).join(''));
        pane.querySelector('.role').value = st.roleId;
      }
      renderTree();
      if (st.folderId) renderGrid(r.rows); else renderOverview(r.counts);
    } catch (e) {
      content.innerHTML = `<div class="grid-empty">${esc(e.message)}</div>`;
    }
  }

  tree.addEventListener('mousedown', (e) => {
    const tg = e.target.closest('[data-tg]');
    if (tg && tg.dataset.tg) { st.collapsed.has(tg.dataset.tg) ? st.collapsed.delete(tg.dataset.tg) : st.collapsed.add(tg.dataset.tg); renderTree(); return; }
    const n = e.target.closest('.node');
    if (!n) return;
    st.folderId = n.classList.contains('head') ? null : n.dataset.id;
    load();
  });
  pane.querySelector('.role').addEventListener('change', (e) => { st.roleId = e.target.value; load(); });

  return { refresh: load, selection: () => grid?.selectedRows() || [], focus: () => grid?.host.focus() };
}
