// Common dialogs used from the office, search and document windows.
import { api, esc, toast } from './ui/core.js';
import { dialog, alertBox, showError } from './ui/dialog.js';
import { icon } from './ui/icons.js';
import { CLASSIFICATION, allColumns, categoryLabel } from '/core/schema.js';

// Holder picker (users and roles of a company). Returns array of "user:x"/"role:y".
export async function pickHolders(app, companyId, { title = 'Posreduj', multi = true, usersOnly = false, notifyDefault = null, withNote = false, okLabel = 'V redu', preselect = [], extraHtml = '' } = {}) {
  const roles = app.me.roles.filter((r) => r.companyId === companyId);
  const users = app.me.users.filter((u) => u.roleIds.some((rid) => roles.some((r) => r.id === rid)));
  const rows = [
    ...(usersOnly ? [] : roles.map((r) => ({ id: `role:${r.id}`, label: r.path, kind: 'Vloga' }))),
    ...users.map((u) => ({ id: `user:${u.id}`, label: u.name, kind: 'Uporabnik', sub: u.roleIds.map((rid) => roles.find((r) => r.id === rid)?.name).filter(Boolean).join(', ') })),
  ];
  const body = `<div style="display:flex;gap:6px;margin-bottom:6px"><input class="win flt" placeholder="Filter..." style="flex:1" autofocus></div>
    <div class="whitebox" style="height:300px;overflow:auto"><table class="plain"><colgroup><col style="width:24px"><col><col style="width:90px"></colgroup>
    <tbody>${rows.map((r) => `<tr data-id="${esc(r.id)}"><td><input type="${multi ? 'checkbox' : 'radio'}" name="h" value="${esc(r.id)}" ${preselect.includes(r.id) ? 'checked' : ''}></td><td title="${esc(r.label)}">${esc(r.label)}${r.sub ? ` <span class="demo-note">(${esc(r.sub)})</span>` : ''}</td><td>${r.kind}</td></tr>`).join('')}</tbody></table></div>
    ${notifyDefault !== null ? `<label class="chk" style="margin-top:6px"><input type="checkbox" class="notify" ${notifyDefault ? 'checked' : ''}> Obvesti nove uporabnike (demo: zapis v lokalni izhodni predal)</label>` : ''}
    ${withNote ? '<div style="margin-top:6px">Opomba:<textarea class="win note" rows="2" style="width:100%"></textarea></div>' : ''}${extraHtml}`;
  const res = await dialog({
    title, width: 560, body,
    onOpen: (d) => {
      d.q('.flt').addEventListener('input', (e) => {
        const q = e.target.value.toLocaleLowerCase('sl');
        d.qa('tbody tr').forEach((tr) => { tr.style.display = tr.textContent.toLocaleLowerCase('sl').includes(q) ? '' : 'none'; });
      });
      d.qa('tbody tr').forEach((tr) => tr.addEventListener('dblclick', () => { tr.querySelector('input').checked = true; d.q('.dfoot .btn.primary').click(); }));
    },
    buttons: [
      { label: okLabel, icon: 'check', primary: true, action: (d) => {
        const ids = d.qa('tbody input:checked').map((i) => i.value);
        if (!ids.length) throw new Error('Izberite vsaj enega prejemnika.');
        return { ids, notify: d.q('.notify')?.checked || false, note: d.q('.note')?.value || '', scope: d.q('input[name=sc]:checked')?.value || 'all' };
      } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
  return res;
}

export async function classifyDialog(current) {
  const opts = CLASSIFICATION.flatMap((n) => [{ code: n.code, label: `${n.code} ${n.label}`, lvl: 0 }, ...(n.children || []).map((c) => ({ code: c.code, label: `${c.code} ${c.label}`, lvl: 1 }))]);
  return dialog({
    title: 'Klasificiraj', width: 420,
    body: `<div class="whitebox" style="height:260px;overflow:auto">${opts.map((o) => `<label class="chk" style="display:flex;padding:2px 4px 2px ${6 + o.lvl * 18}px"><input type="radio" name="k" value="${o.code}" ${o.code === current ? 'checked' : ''}> ${icon('folder')} ${esc(o.label)}</label>`).join('')}</div>
      <div class="demo-note" style="margin-top:6px">Klasifikacijski načrt je fiktiven demo načrt.</div>`,
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, action: (d) => { const v = d.q('input:checked')?.value; if (!v) throw new Error('Izberite vozlišče.'); return v; } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
}

export async function tagDialog(app, companyId, { remove = false, current = [] } = {}) {
  const list = remove ? current : app.me.tags[companyId] || [];
  return dialog({
    title: remove ? 'Odstrani oznako' : 'Dodaj oznako', width: 340,
    body: `${list.length ? `<div class="whitebox" style="max-height:200px;overflow:auto;padding:3px">${list.map((t) => `<label class="chk" style="display:flex;padding:2px"><input type="radio" name="t" value="${esc(t)}"> ${icon('tag')} ${esc(t)}</label>`).join('')}</div>` : '<div class="demo-note">Ni oznak.</div>'}
      ${remove ? '' : '<div style="margin-top:6px">Nova oznaka: <input class="win nt" style="width:100%"></div>'}`,
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, action: (d) => { const v = d.q('.nt')?.value.trim() || d.q('input[name=t]:checked')?.value; if (!v) throw new Error('Izberite ali vnesite oznako.'); return v; } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
}

export async function mailDialog(rows, kind = 'email') {
  const subj = rows.length === 1 ? rows[0].subject : `${rows.length} dokumentov`;
  return dialog({
    title: kind === 'email' ? 'Pošlji po elektronski pošti' : 'Pošlji sporočilo o dokumentu', width: 520,
    body: `<div class="form"><label class="r">Za:</label><input class="win to" autofocus>
      <label class="r">Zadeva:</label><input class="win su" value="${esc(subj)}">
      <label class="r" style="align-self:start">Sporočilo:</label><textarea class="win bo" rows="6"></textarea></div>
      <div class="demo-note" style="margin-top:8px">Demo: sporočilo se shrani v lokalni izhodni predal, ne pošlje se. ${kind === 'email' ? 'Dokumenti bi bili priloženi.' : 'Prejemnik bi dobil povezavo na dokument.'}</div>`,
    buttons: [
      { label: 'Pošlji', icon: 'mail', primary: true, action: async (d) => {
        const r = await api('sendMail', { ids: rows.map((x) => x.id), to: d.q('.to').value, subject: d.q('.su').value, body: d.q('.bo').value, kind: kind === 'email' ? 'email' : 'message' });
        toast(r.message);
        return true;
      } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
}

// Column chooser ("Stolpci") with display masks.
export async function columnsDialog(category, current) {
  const all = allColumns(category);
  const cur = new Map(current.map((c) => [c.id, c]));
  const general = all.filter((c) => !c.id.startsWith('c:')).sort((a, b) => a.label.localeCompare(b.label, 'sl'));
  const content = all.filter((c) => c.id.startsWith('c:')).sort((a, b) => a.label.localeCompare(b.label, 'sl'));
  const row = (c) => `<tr data-id="${esc(c.id)}"><td><label class="chk"><input type="checkbox" ${cur.has(c.id) ? 'checked' : ''}> ${esc(c.label)}</label></td><td><input class="mask" value="${esc(cur.get(c.id)?.mask || '')}" placeholder="${c.type === 'date' || c.type === 'datetime' ? 'npr. dd.MM.yyyy' : c.type === 'amount' ? 'npr. #,##0.00' : ''}"></td></tr>`;
  return dialog({
    title: 'Stolpci', width: 568, height: 637,
    body: `<div style="display:flex;flex-direction:column;height:100%"><input class="win flt" placeholder="Filter..." style="width:100%;margin-bottom:8px" autofocus>
      <div class="whitebox" style="flex:1;overflow:auto"><table class="plain"><colgroup><col><col style="width:125px"></colgroup>
      <thead><tr><th>Polje</th><th>Prikazna maska</th></tr></thead><tbody>${general.map(row).join('')}
      <tr class="band"><td colspan="2" style="background:#6f8fae;color:#fff;font-weight:700">${esc(categoryLabel(category))}</td></tr>${content.map(row).join('')}</tbody></table></div></div>`,
    onOpen: (d) => {
      d.body.style.display = 'flex'; d.body.style.flexDirection = 'column';
      d.q('.flt').addEventListener('input', (e) => {
        const q = e.target.value.toLocaleLowerCase('sl');
        d.qa('tbody tr[data-id]').forEach((tr) => { tr.style.display = tr.textContent.toLocaleLowerCase('sl').includes(q) ? '' : 'none'; });
      });
    },
    buttons: [
      { label: 'V redu', primary: true, action: (d) => {
        const chosen = [];
        // keep existing order for already-visible columns, append new ones
        const checked = new Map(d.qa('tbody tr[data-id]').filter((tr) => tr.querySelector('input[type=checkbox]').checked).map((tr) => [tr.dataset.id, tr.querySelector('.mask').value.trim()]));
        for (const c of current) if (checked.has(c.id)) { chosen.push({ id: c.id, w: c.w, mask: checked.get(c.id) }); checked.delete(c.id); }
        for (const [id, mask] of checked) chosen.push({ id, w: all.find((c) => c.id === id)?.w, mask });
        if (!chosen.length) throw new Error('Izberite vsaj en stolpec.');
        return chosen;
      } },
      { label: 'Prekliči', value: null },
    ],
  });
}

export function aboutDialog() {
  return dialog({
    title: 'O programu', help: false, dim: true,
    body: `<div class="about"><div class="emb">eba</div><h1>EBA DMS</h1>
      <div>Demo rekreacija · verzija 0.1 (lokalna)</div>
      <div style="margin:8px 0">Uporabniški vmesnik po vzoru namizne aplikacije EBA DMS 4.1.<br>Vsi podatki so fiktivni. Integracije, podpisi in skeniranje so simulirani.</div>
      <div class="demo-note">Neodvisna demo rekreacija za interno predstavitev; ni izdelek ali last EBA, d.o.o.</div>
      <div style="margin-top:6px"><span class="lnk" data-readme>README.md</span></div></div>`,
    onOpen: (d) => d.q('[data-readme]').addEventListener('click', () => window.open('/README.md', '_blank')),
    buttons: [{ label: 'Zapri', primary: true }],
  });
}

export async function changePasswordDialog() {
  return dialog({
    title: 'Spremeni geslo', width: 360,
    body: `<div class="form"><label class="r">Staro geslo:</label><input class="win o" type="password" autofocus>
      <label class="r">Novo geslo:</label><input class="win n" type="password"><label class="r">Ponovi geslo:</label><input class="win p" type="password"></div>`,
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, action: async (d) => { await api('changePassword', { old: d.q('.o').value, next: d.q('.n').value, repeat: d.q('.p').value }); toast('Geslo je spremenjeno.'); } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
}

export async function lockScreen(app) {
  await dialog({
    title: 'Program je zaklenjen', help: false, dim: true, width: 360, closeValue: undefined,
    body: `<div class="msg">${icon('key', 24)}<div>Program je zaklenjen za uporabnika <b>${esc(app.me.user.name)}</b>.<br>Za nadaljevanje vnesite geslo.</div></div><input class="win pw" type="password" style="width:100%" autofocus>`,
    onOpen: (d) => { d.q('.tbar .x').style.display = 'none'; },
    buttons: [{ label: 'Odkleni', icon: 'key', primary: true, action: async (d) => { await api('verifyPassword', { password: d.q('.pw').value }); return true; } }],
  }).then((v) => { if (v !== true) return lockScreen(app); return v; });
}

export async function infoResult(res, title = 'EBA DMS') {
  if (res?.message) await alertBox(res.message, { title });
}

export { showError };
