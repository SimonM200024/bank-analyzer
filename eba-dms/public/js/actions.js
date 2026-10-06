// Document actions shared by the office grid, search results, toolbar and
// document windows. Enablement mirrors server rules; the server re-checks.
import { api, toast, download, exportDocs, canPrint, noPrint, blobUrl } from './ui/core.js';
import { alertBox, confirmBox, promptBox } from './ui/dialog.js';
import { pickHolders, classifyDialog, tagDialog, mailDialog, infoResult } from './dialogs.js';

export function perm(app, row, action) {
  return (app.me.perms[row.companyId]?.[row.category] || []).includes(action);
}
export function flagOf(app, companyId, name) {
  return !!app.me.flags[companyId]?.[name];
}

export const can = {
  sign: (app, rows) => rows.length > 0 && rows.every((r) => r.direction === 'out' && r.dispatchState === 'prep' && r.inOffice && perm(app, r, 'sign')),
  initial: (app, rows) => rows.length > 0 && rows.every((r) => r.inOffice && !r.archived && perm(app, r, 'initial')),
  classify: (app, rows) => rows.length > 0 && rows.every((r) => perm(app, r, 'classify')),
  forward: (app, rows) => rows.length > 0 && rows.every((r) => r.inOffice && !r.archived && perm(app, r, 'forward')),
  claim: (app, rows) => rows.length > 0 && rows.every((r) => r.inOffice && !r.archived && r.claimedBy !== app.me.user.name && ['edit', 'initial', 'forward', 'reject', 'sign'].some((a) => perm(app, r, a))),
  del: (app, rows) => rows.length > 0 && rows.every((r) => perm(app, r, 'delete')),
  toDispatch: (app, rows) => rows.length > 0 && rows.every((r) => r.direction === 'out' && r.dispatchState === 'prep' && perm(app, r, 'dispatch')),
  issue: (app, rows) => rows.length > 0 && rows.every((r) => r.direction === 'out' && ['prep', 'queued'].includes(r.dispatchState) && perm(app, r, 'dispatch')),
  returnToPrep: (app, rows) => rows.length > 0 && rows.every((r) => r.direction === 'out' && r.dispatchState === 'queued' && perm(app, r, 'dispatch')),
  archive: (app, rows) => rows.length > 0 && rows.every((r) => !r.archived && perm(app, r, 'archive')),
  unarchive: (app, rows) => rows.length > 0 && rows.every((r) => r.archived && perm(app, r, 'archive')),
  grant: (app, rows) => rows.length === 1 && perm(app, rows[0], 'grant'),
  tag: (app, rows) => rows.length > 0 && rows.every((r) => perm(app, r, 'tag')),
  untag: (app, rows) => rows.length > 0 && rows.every((r) => perm(app, r, 'tag')) && rows.some((r) => r.tags?.length),
  link: (app, rows) => rows.length === 1 && app.clipboard.some((id) => id !== rows[0].id),
  pantheon: (app, rows) => rows.length > 0 && rows.every((r) => r.category === 'racun' && r.direction === 'in' && perm(app, r, 'pantheon')),
};

async function run(app, op, args, { msg } = {}) {
  try {
    const r = await api(op, args);
    app.changed(args.ids || [args.id]);
    if (msg) toast(typeof msg === 'function' ? msg(r) : msg);
    return r;
  } catch (e) {
    await alertBox(e.message, { kind: 'error' });
    return null;
  }
}
const ids = (rows) => rows.map((r) => r.id);
const sameCompany = (rows) => new Set(rows.map((r) => r.companyId)).size === 1;

export const act = {
  async sign(app, rows) { return run(app, 'sign', { ids: ids(rows) }, { msg: 'Dokument je podpisan (demo podpis brez certifikata).' }); },
  async initial(app, rows) { return run(app, 'initial', { ids: ids(rows) }, { msg: 'Parafirano (Potrdi).' }); },
  async claim(app, rows) { return run(app, 'claim', { ids: ids(rows) }, { msg: 'Dokument je prevzet.' }); },
  async forward(app, rows) {
    if (!sameCompany(rows)) return alertBox('Posredujete lahko le dokumente istega podjetja.');
    const res = await pickHolders(app, rows[0].companyId, { title: 'Posreduj', notifyDefault: app.personal.other?.notifyForward !== false, withNote: true });
    if (!res) return null;
    return run(app, 'forward', { ids: ids(rows), targets: res.ids, notify: res.notify, note: res.note }, { msg: 'Dokument je posredovan.' });
  },
  async reject(app, rows) {
    const reason = await promptBox('Razlog zavrnitve:', '', { title: 'Zavrni', multiline: true });
    if (reason == null) return null;
    return run(app, 'reject', { ids: ids(rows), reason }, { msg: 'Dokument je zavrnjen in vrnjen pošiljatelju.' });
  },
  async classify(app, rows) {
    const code = await classifyDialog(rows.length === 1 ? rows[0].classificationCode : null);
    if (!code) return null;
    return run(app, 'classify', { ids: ids(rows), code }, { msg: 'Dokument je klasificiran.' });
  },
  async grant(app, rows) {
    const res = await pickHolders(app, rows[0].companyId, { title: 'Uredi dostop', notifyDefault: app.personal.other?.notifyGrant !== false, okLabel: 'Dodeli' });
    if (!res) return null;
    return run(app, 'grantAccess', { ids: ids(rows), holders: res.ids }, { msg: 'Dostop je dodeljen.' });
  },
  async del(app, rows) {
    if (!await confirmBox(rows.length === 1 ? 'Ali res želite izbrisati izbrani dokument?' : `Ali res želite izbrisati ${rows.length} dokumentov?`)) return null;
    return run(app, 'deleteDocuments', { ids: ids(rows) }, { msg: 'Izbrisano.' });
  },
  async dispatch(app, rows, op) { return run(app, 'dispatchAction', { ids: ids(rows), op }, { msg: { toDispatch: 'Dokument je v odpremi.', issue: 'Dokument je prestavljen v izdano.', returnToPrep: 'Dokument je vrnjen v pripravo.' }[op] }); },
  async markRead(app, rows, read) { return run(app, 'markRead', { ids: ids(rows), read }); },
  async archive(app, rows, restore = false) {
    if (!restore && !await confirmBox('Izbrane dokumente pošljem v hrambo? Dokumenti v hrambi niso več med živimi dokumenti.')) return null;
    return run(app, 'archive', { ids: ids(rows), restore }, { msg: restore ? 'Dokument je vzet iz hrambe.' : 'Dokumenti so v hrambi.' });
  },
  async addNote(app, rows) { return run(app, 'addNote', { ids: ids(rows) }); },
  async removeNote(app, rows, kind) { return run(app, 'removeNote', { ids: ids(rows), kind }); },
  async addTag(app, rows) {
    const tag = await tagDialog(app, rows[0].companyId);
    if (!tag) return null;
    const r = await run(app, 'addTag', { ids: ids(rows), tag });
    if (r && !app.me.tags[rows[0].companyId].includes(tag)) app.me.tags[rows[0].companyId].push(tag);
    return r;
  },
  async removeTag(app, rows) {
    const tags = [...new Set(rows.flatMap((r) => r.tags || []))];
    const tag = await tagDialog(app, rows[0].companyId, { remove: true, current: tags });
    if (!tag) return null;
    return run(app, 'removeTag', { ids: ids(rows), tag });
  },
  addToClipboard(app, rows) {
    for (const r of rows) if (!app.clipboard.includes(r.id)) app.clipboard.push(r.id);
    app.saveClipboard();
    toast(`Na odložišču: ${app.clipboard.length} dokumentov.`);
  },
  async linkFromClipboard(app, rows) {
    const r = await run(app, 'linkDocuments', { id: rows[0].id, targetIds: app.clipboard });
    if (r) toast(`Povezanih dokumentov: ${r.linked}.`);
    return r;
  },
  emptyClipboard(app) { app.clipboard = []; app.saveClipboard(); toast('Odložišče je izpraznjeno.'); },
  async mail(app, rows, kind) { return mailDialog(rows, kind); },
  async exportDocs(app, rows, shortcut = false) {
    if (exportDocs(ids(rows), shortcut) === undefined) setTimeout(() => app.changed(ids(rows)), 800);
  },
  async pantheonTransfer(app, rows) {
    const r = await run(app, 'pantheonTransfer', { ids: ids(rows) });
    if (r) await infoResult(r, 'Pantheon 5.5');
    return r;
  },
  copyLink(app, rows) {
    const text = rows.map((r) => `${location.origin}/#/doc/${r.id}`).join('\r\n');
    navigator.clipboard?.writeText(text).then(() => toast('Povezava na dokument je kopirana.'), () => download('povezava.txt', text));
  },
  async printDocs(app, rows) {
    if (!rows.length) return;
    if (!canPrint()) return noPrint();
    const pages = [];
    for (const r of rows) {
      try {
        const d = await api('getDocument', { id: r.id });
        for (const p of d.pages) pages.push({ p, d });
      } catch (e) { /* skip unreadable */ }
    }
    const area = document.createElement('div');
    area.className = 'print-area';
    area.innerHTML = pages.map(({ p }) => p.mime.startsWith('image/') ? `<img src="${blobUrl(p.blobId)}" style="width:100%;page-break-after:always">` : `<div style="page-break-after:always;font:14px Arial;padding:40px">${p.name} (PDF – natisnite iz pregledovalnika PDF)</div>`).join('');
    document.body.appendChild(area);
    await Promise.all([...area.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    await api('recordOutput', { ids: ids(rows), kind: 'print' }).catch(() => {});
    window.print();
    area.remove();
    app.changed(ids(rows));
  },
};
