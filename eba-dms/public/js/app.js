// Application bootstrap: login, main shell (menus, modules, toolbar, rail,
// status bar), module switching and document windows.
import { api, esc, el, toast, download, pickFiles, setUnauthorizedHandler, installTooltips, isStandalone, canPrint, noPrint, $ } from './ui/core.js';
import { BRAND } from '/core/brand.js';
import { MenuBar, openMenu, contextMenu, menuKeydown, menusOpen, closeMenus } from './ui/menu.js';
import { dialog, alertBox, dialogsOpen } from './ui/dialog.js';
import { icon, large } from './ui/icons.js';
import { selectedLabel, fmtDateTime, isoLocal } from '/core/format.js';
import { can, act } from './actions.js';
import { aboutDialog, changePasswordDialog, lockScreen, infoResult } from './dialogs.js';
import { mountOffice } from './views/office.js';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('eba-dms') : null;

const app = {
  me: null, personal: null, companyId: null, module: 'docs', docView: 'office', scanView: 'process',
  office: { scope: 'live', folderId: 'in/racun', sorts: {}, filters: {}, collapsed: new Set() },
  clipboard: (() => { try { return JSON.parse(sessionStorage.getItem('eba-clipboard') || '[]'); } catch { return []; } })(),
  view: null, grid: null, selection: [], listInfo: { shown: 0, total: 0, limited: false }, windows: new Map(),
  saveClipboard() { try { sessionStorage.setItem('eba-clipboard', JSON.stringify(this.clipboard)); } catch { /* ignore */ } },
  async savePersonal(patch) { this.personal = await api('savePersonal', patch); return this.personal; },
  error(e) { console.error(e); alertBox(e.message || String(e), { kind: 'error' }); },
  changed(ids) { channel?.postMessage({ type: 'docChanged', ids }); this.view?.refresh(); },
};
window.ebaApp = app; // for diagnostics in the console

// The app renders into its own root so the page's <style>/<script> (which sit
// in <body> in the published build) are never replaced.
function rootEl() {
  let r = document.getElementById('dms-root');
  if (!r) { r = document.createElement('div'); r.id = 'dms-root'; document.body.appendChild(r); }
  return r;
}

// ============================================================= login
function showLogin(message = '') {
  rootEl().innerHTML = '';
  const w = el(`<div class="login"><div class="dlg">
    <div class="tbar"><span class="t">${BRAND.name} – Prijava</span></div>
    <div class="dbody"><div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
      <div class="about" style="padding:0;width:auto;background:none"><div class="emb" style="width:54px;height:54px;font-size:18px;margin:0">${BRAND.mark}</div></div>
      <div><b style="font-size:15px">${BRAND.name}</b><div class="demo-note">Demo rekreacija · fiktivni podatki${isStandalone() ? ' · stanje se hrani v tem brskalniku' : ''}</div></div></div>
      <div class="form"><label class="r">Uporabniško ime:</label><input class="win u" autofocus autocomplete="username">
      <label class="r">Geslo:</label><input class="win p" type="password" autocomplete="current-password"></div>
      <div class="err" style="min-height:16px;margin-top:6px">${esc(message)}</div>
      <div class="demo-note">Demo uporabniki (geslo <b>demo</b>): mnovak – računovodstvo, jkovac – direktorica, bzorko – vodja financ,
      pzupan – analitik, tkrajnc – zunanji računovodja, ahorvat – upravnik, lmlakar – JAVOR MG.</div></div>
    <div class="dfoot"><button class="btn primary go">${icon('key')}Prijava</button></div></div></div>`);
  rootEl().appendChild(w);
  const go = async () => {
    try {
      await api('login', { username: w.querySelector('.u').value, password: w.querySelector('.p').value });
      start();
    } catch (e) { w.querySelector('.err').textContent = e.message; }
  };
  w.querySelector('.go').addEventListener('click', go);
  w.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  w.querySelector('.u').focus();
}
setUnauthorizedHandler(() => showLogin('Seja je potekla. Prijavite se ponovno.'));

async function logout(text) {
  await api('logout').catch(() => {});
  channel?.postMessage({ type: 'logout' });
  showLogin(text || '');
}

// ============================================================= shell
async function start() {
  try { app.me = await api('whoami'); } catch (e) { if (e.status === 401) return showLogin(); throw e; }
  app.personal = app.me.personal;
  app.companyId = app.me.defaultCompanyId;
  if (!isStandalone() && location.hash.startsWith('#/doc/')) {
    const { mountDocWindow } = await import('./views/docwin.js');
    return mountDocWindow(app, location.hash.slice(6), { channel });
  }
  renderShell();
}

const companyName = () => app.companyId === 'all' ? 'Vsa podjetja' : app.me.companies.find((c) => c.id === app.companyId)?.name;
function windowTitle() { return `${BRAND.name} - ${companyName()} [${app.me.user.name}] • Internal Authentication`; }

function renderShell() {
  rootEl().innerHTML = `<div class="app">
    <div class="menubar"></div>
    <div class="modstrip"></div>
    <div class="toolbar"></div>
    <div class="body"><div class="rail"></div><div class="pane"></div><div class="splitter"></div><div class="content"></div></div>
    <div class="statusbar"><span class="sel"></span><span class="right"><span class="cnt"></span><span class="led" title="Povezava s strežnikom"></span><span class="led" title="Sinhronizacija (lokalno)"></span><span class="clock"></span>
      <span class="kbd caps">CAPS</span><span class="kbd num">NUM</span><span class="kbd scrl">SCRL</span></span></div></div>`;
  document.title = windowTitle();
  app.menubar = new MenuBar($('.menubar'), mainMenus(), { brand: `<span class="wordmark">${BRAND.mark}</span>` });
  renderModstrip();
  bindSplitter();
  switchModule(app.module);
  tickClock();
  setInterval(tickClock, 15000);
}

function renderModstrip() {
  const ms = $('.modstrip');
  const scan = app.me.companies.some((c) => app.me.flags[c.id]?.scan);
  ms.innerHTML = `<div class="modtab ${app.module === 'docs' ? 'active' : ''}" data-m="docs">${large('docs', 18)}Dokumenti</div>
    ${scan ? `<div class="modtab ${app.module === 'scanner' ? 'active' : ''}" data-m="scanner">${large('scanner', 18)}Skenirnica</div>` : ''}`;
  ms.onclick = (e) => { const t = e.target.closest('[data-m]'); if (t) switchModule(t.dataset.m); };
}

function bindSplitter() {
  const sp = $('.splitter'), pane = $('.pane');
  sp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = pane.offsetWidth;
    const mv = (ev) => { pane.style.width = Math.max(120, Math.min(600, w0 + ev.clientX - x0)) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
}

async function switchModule(m) {
  app.module = m;
  renderModstrip();
  app.menubar = new MenuBar($('.menubar'), mainMenus(), { brand: `<span class="wordmark">${BRAND.mark}</span>` });
  await mountView();
}

function railItems() {
  if (app.module === 'scanner') return [['process', 'process', 'Obdelava'], ['packages', 'packages', 'Paketi'], ['log', 'log', 'Dnevnik']];
  const sup = app.me.companies.some((c) => app.me.flags[c.id]?.supervise);
  return [['office', 'office', 'Pisarna'], ['search', 'search', 'Iskanje'], ...(sup ? [['supervision', 'supervise', 'Skrbništvo']] : [])];
}

async function mountView() {
  const rail = $('.rail');
  const cur = app.module === 'scanner' ? app.scanView : app.docView;
  rail.innerHTML = railItems().map(([id, ic, label]) => `<div class="it ${id === cur ? 'active' : ''}" data-v="${id}">${large(ic, 32)}<span>${label}</span></div>`).join('');
  rail.onclick = (e) => {
    const t = e.target.closest('[data-v]');
    if (!t) return;
    if (app.module === 'scanner') app.scanView = t.dataset.v; else app.docView = t.dataset.v;
    mountView();
  };
  const pane = $('.pane'), content = $('.content');
  pane.style.display = ''; $('.splitter').style.display = '';
  app.selection = []; app.grid = null;
  content.innerHTML = ''; pane.innerHTML = '';
  if (app.module === 'docs') {
    renderDocToolbar();
    if (app.docView === 'office') app.view = mountOffice(app, pane, content);
    else if (app.docView === 'search') { const { mountSearch } = await import('./views/search.js'); app.view = mountSearch(app, pane, content); }
    else { const { mountSupervision } = await import('./views/supervision.js'); app.view = mountSupervision(app, pane, content); }
  } else {
    const { mountScanner } = await import('./views/scanner.js');
    app.view = mountScanner(app, pane, content, $('.toolbar'));
  }
  app.menubar.refresh();
  await app.view.refresh();
  setTimeout(() => app.view?.focus?.(), 0);
}

// ------------------------------------------------------------- toolbar
function renderDocToolbar() {
  const tb = $('.toolbar');
  const v = app.personal.view || {};
  tb.className = `toolbar icons-${v.iconSize || 'small'} text-${v.textMode || 'beside'}${v.toolbar === false ? ' hidden' : ''}`;
  tb.innerHTML = `<button class="tb split" data-a="sendrecv" title="Pošlji/Prejmi">${icon('sendrecv')}<span class="tl">Pošlji/Prejmi</span><span class="dd" data-a="sendrecvMenu">▼</span></button>
    <span class="tsep"></span>
    <button class="tb" data-a="sign">${icon('padlock')}<span class="tl">Podpiši</span></button>
    <button class="tb" data-a="initial">${icon('pen')}<span class="tl">Parafiraj</span></button>
    <button class="tb" data-a="classify">${icon('cube')}<span class="tl">Klasificiraj</span></button>
    <span class="tsep"></span>
    <button class="tb" data-a="forward">${icon('forward')}<span class="tl">Posreduj</span></button>
    <span class="spacer"></span>
    <select class="win company-select" title="Podjetje"><option value="all">Vsa podjetja</option>${app.me.companies.map((c) => `<option value="${c.id}" ${c.id === app.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  tb.querySelector('.company-select').value = app.companyId;
  tb.onclick = (e) => {
    if (e.target.closest('[data-a="sendrecvMenu"]')) {
      e.stopPropagation();
      const r = e.target.getBoundingClientRect();
      openMenu([{ label: 'Pošlji/Prejmi', bold: true, action: () => sendReceive() }, { label: 'Dnevnik integracij', action: () => showLog() }], r.left - 80, r.bottom + 2);
      return;
    }
    const b = e.target.closest('button[data-a]');
    if (!b || b.disabled) return;
    const rows = app.selection;
    ({ sendrecv: () => sendReceive(), sign: () => act.sign(app, rows), initial: () => act.initial(app, rows), classify: () => act.classify(app, rows), forward: () => act.forward(app, rows) })[b.dataset.a]?.();
  };
  tb.querySelector('.company-select').onchange = (e) => { app.companyId = e.target.value; document.title = windowTitle(); app.view?.refresh(); };
  updateToolbar();
}

function updateToolbar() {
  const tb = $('.toolbar');
  if (!tb || app.module !== 'docs') return;
  const rows = app.selection;
  const office = app.docView === 'office';
  const set = (a, on) => { const b = tb.querySelector(`[data-a="${a}"]`); if (b) b.disabled = !on; };
  set('sign', office && can.sign(app, rows));
  set('initial', office && can.initial(app, rows));
  set('classify', office && can.classify(app, rows));
  set('forward', office && can.forward(app, rows));
}

async function sendReceive() {
  try {
    const r = await api('sendReceive', { companyId: app.companyId });
    await infoResult(r, 'Pošlji/Prejmi');
    app.changed([]);
  } catch (e) { app.error(e); }
}
async function showLog() {
  const r = await api('logFile');
  await dialog({ title: 'Dnevnik integracij (demo)', width: 900, body: `<pre class="selectable" style="margin:0;max-height:60vh;overflow:auto;background:#fff;border:1px solid #aaa;padding:6px;font-size:11px">${esc(r.text)}</pre>`, buttons: [{ label: 'Zapri', primary: true }] });
}

// ------------------------------------------------------------- selection & status
app.setSelection = (rows) => {
  app.selection = rows;
  $('.statusbar .sel').textContent = selectedLabel(rows.length);
  updateToolbar();
  app.menubar?.refresh();
};
app.setListInfo = (info) => {
  app.listInfo = info;
  const c = $('.statusbar .cnt');
  c.textContent = `Število dokumentov: ${info.limited ? `${info.shown}/${info.total}` : info.total}`;
  document.querySelector('.limited')?.remove();
  if (info.limited && app.grid) {
    const n = el(`<div class="limited"><span class="x">✕</span><b>${icon('info')} Prikazano je omejeno število dokumentov</b>V seznamu niso prikazani vsi rezultati.<br>Če iskanega dokumenta ni v seznamu, uporabite filtre nad stolpci, da zožite izbor.</div>`);
    n.querySelector('.x').onclick = () => n.remove();
    app.grid.host.parentElement.appendChild(n);
  }
};
function tickClock() {
  const c = $('.statusbar .clock');
  if (c) c.textContent = fmtDateTime(isoLocal(new Date()));
}
document.addEventListener('keydown', (e) => {
  if (e.getModifierState) {
    $('.statusbar .caps')?.classList.toggle('on', e.getModifierState('CapsLock'));
    $('.statusbar .num')?.classList.toggle('on', e.getModifierState('NumLock'));
    $('.statusbar .scrl')?.classList.toggle('on', e.getModifierState('ScrollLock'));
  }
});

// ------------------------------------------------------------- open documents
app.openDocument = async (row) => {
  if (!row) return;
  if (isStandalone()) return openOverlay(row.id);
  try { localStorage.setItem('eba-nav', JSON.stringify((app.grid?.visibleRows() || []).map((r) => r.id))); } catch { /* ignore */ }
  const w = window.open(`/#/doc/${row.id}`, `eba_doc_${row.id}`, `popup,width=${screen.availWidth},height=${screen.availHeight},left=0,top=0`);
  if (!w) { location.hash = `#/doc/${row.id}`; location.reload(); return; }
  app.windows.set(row.id, { win: w, title: row.subject });
  w.focus();
};
// Standalone build: document windows open inside the page.
async function openOverlay(id) {
  try { localStorage.setItem('eba-nav', JSON.stringify((app.grid?.visibleRows() || []).map((r) => r.id))); } catch { /* ignore */ }
  app.overlay?.close();
  const { mountDocWindow } = await import('./views/docwin.js');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const prevTitle = document.title;
  app.overlay = await mountDocWindow(app, id, {
    channel: null, host,
    onChanged: () => app.view?.refresh(),
    onClose: () => { host.remove(); app.overlay = null; document.title = prevTitle; app.menubar?.activate(); app.view?.focus?.(); },
  });
}

channel?.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'docChanged') app.view?.refresh();
  if (m.type === 'windowTitle' && app.windows.has(m.id)) app.windows.get(m.id).title = m.title;
  if (m.type === 'windowClosed') app.windows.delete(m.id);
  if (m.type === 'focusMain') window.focus();
  if (m.type === 'logout' && app.me) showLogin('Odjavljeni ste bili v drugem oknu.');
});

// ------------------------------------------------------------- context menu
app.rowContextMenu = (e, rows) => {
  const one = rows.length === 1 ? rows[0] : null;
  contextMenu(e, [
    { label: 'Izbriši', icon: 'cross', shortcut: 'Del', disabled: !can.del(app, rows), action: () => act.del(app, rows) },
    { label: 'Podpiši', icon: 'padlock', disabled: !can.sign(app, rows), action: () => act.sign(app, rows) },
    { label: 'Parafiraj', icon: 'pen', disabled: !can.initial(app, rows), action: () => act.initial(app, rows) },
    { label: 'V odpremo', disabled: !can.toDispatch(app, rows), action: () => act.dispatch(app, rows, 'toDispatch') },
    { label: 'Prestavi dokument neposredno v izdano', disabled: !can.issue(app, rows), action: () => act.dispatch(app, rows, 'issue') },
    { label: 'Vrni v pripravo', disabled: !can.returnToPrep(app, rows), action: () => act.dispatch(app, rows, 'returnToPrep') },
    { sep: true },
    { label: 'Označi kot prebrano', action: () => act.markRead(app, rows, true) },
    { label: 'Označi kot neprebrano', action: () => act.markRead(app, rows, false) },
    { sep: true },
    { label: 'Izbrane dokumente v hrambo', disabled: !can.archive(app, rows), action: () => act.archive(app, rows) },
    { label: 'Vzemi iz hrambe', disabled: !can.unarchive(app, rows), action: () => act.archive(app, rows, true) },
    { sep: true },
    { label: 'Pošlji po elektronski pošti', action: () => act.mail(app, rows, 'email') },
    { label: 'Pošlji sporočilo o dokumentu', action: () => act.mail(app, rows, 'message') },
    { sep: true },
    { label: 'Dodaj na odložišče', action: () => act.addToClipboard(app, rows) },
    { label: 'Poveži z dokumenti iz odložišča', shortcut: 'Ctrl+V', disabled: !can.link(app, rows), action: () => act.linkFromClipboard(app, rows) },
    { label: 'Klasificiraj', icon: 'cube', shortcut: 'Ctrl+K', disabled: !can.classify(app, rows), action: () => act.classify(app, rows) },
    { label: 'Pokaži v klasifikaciji', disabled: !(one && one.classification), action: () => showInClassification(one) },
    { label: 'Uredi dostop', disabled: !can.grant(app, rows), action: () => act.grant(app, rows) },
    { label: 'Prevzemi', icon: 'check', disabled: !can.claim(app, rows), action: () => act.claim(app, rows) },
    { sep: true },
    { label: 'Dodaj zaznamek', icon: 'star', action: () => act.addNote(app, rows) },
    { label: 'Odstrani zaznamek', icon: 'starOutline', disabled: !rows.some((r) => r.note === 'yellow'), action: () => act.removeNote(app, rows, 'yellow') },
    { label: 'Odstrani moder zaznamek', icon: 'starBlue', disabled: !rows.some((r) => r.note === 'blue'), action: () => act.removeNote(app, rows, 'blue') },
    { sep: true },
    { label: 'Dodaj oznako', icon: 'tag', disabled: !can.tag(app, rows), action: () => act.addTag(app, rows) },
    { label: 'Odstrani oznako', disabled: !can.untag(app, rows), action: () => act.removeTag(app, rows) },
  ]);
};

async function showInClassification(row) {
  app.module = 'docs';
  app.docView = 'search';
  app.pendingSearch = { rows: [{ key: 'g_klas_vozlisce', op: 'eq', value: row.classification.split(' ')[0] }], types: null };
  await mountView();
}

// ============================================================= menus
function mainMenus() {
  const sel = () => app.selection;
  const scanner = app.module === 'scanner';
  const v = () => app.personal.view || {};
  const setView = async (patch) => { await app.savePersonal({ view: patch }); if (!scanner) renderDocToolbar(); else app.view?.refresh(); };
  const menus = [
    { label: 'Datoteka', mnemonic: 'D', items: () => [
      { label: 'Odjava', action: () => logout() },
      { label: 'Zakleni program', action: () => lockScreen(app) },
      { sep: true },
      { label: 'Izvoz', icon: 'export', disabled: !sel().length, action: () => act.exportDocs(app, sel()) },
      { label: 'Pošlji po elektronski pošti', disabled: !sel().length, action: () => act.mail(app, sel(), 'email') },
      { label: 'Pošlji sporočilo o dokumentu', disabled: !sel().length, action: () => act.mail(app, sel(), 'message') },
      { sep: true },
      { label: 'Uvozi nastavitveno datoteko', action: () => importSettings() },
      { sep: true },
      { label: 'Natisni', icon: 'printer', shortcut: 'Ctrl+P', disabled: !sel().length, action: () => act.printDocs(app, sel()) },
      { label: 'Natisni seznam', disabled: !app.grid, action: () => printList() },
      { sep: true },
      { label: 'Izhod', icon: 'exit', shortcut: 'Ctrl+Q', action: () => exitApp() },
    ] },
    { label: 'Urejanje', mnemonic: 'U', items: () => [
      { label: 'Izbriši', icon: 'cross', shortcut: 'Del', disabled: !can.del(app, sel()), action: () => act.del(app, sel()) },
      { label: 'Kopiraj seznam', shortcut: 'Ctrl+C', disabled: !app.grid, action: () => copyList() },
      { label: 'Kopiraj povezavo na dokument', shortcut: 'Ctrl+Shift+C', disabled: !sel().length, action: () => act.copyLink(app, sel()) },
    ] },
    { label: 'Pogled', mnemonic: 'G', items: () => [
      { label: 'Velikost ikon', items: () => [['small', 'Majhne'], ['medium', 'Srednje'], ['large', 'Velike']].map(([k, l]) => ({ label: l, checked: (v().iconSize || 'small') === k, action: () => setView({ iconSize: k }) })) },
      { label: 'Tekst ob ikonah', items: () => [['none', 'Brez teksta'], ['beside', 'Tekst ob ikonah'], ['under', 'Tekst pod ikonami']].map(([k, l]) => ({ label: l, checked: (v().textMode || 'beside') === k, action: () => setView({ textMode: k }) })) },
      { label: 'Orodne vrstice', items: () => [{ label: scanner ? 'Skenirnica' : 'Dokumenti', checked: v().toolbar !== false, action: () => setView({ toolbar: v().toolbar === false }) }] },
      { label: 'Osveži', icon: 'refresh', shortcut: 'F5', action: () => app.view?.refresh() },
      { label: 'Pogled dokumenta', items: [], disabled: true, title: 'Na voljo v oknu dokumenta.' },
      { label: 'Podrobnosti o dokumentu', shortcut: 'Ctrl+D', checked: v().details !== false, action: () => setView({ details: v().details === false }) },
    ] },
  ];
  if (!scanner) {
    menus.push({ label: 'Akcija', mnemonic: 'K', items: () => [
      { label: 'Podpiši', icon: 'padlock', disabled: !(app.docView === 'office' && can.sign(app, sel())), action: () => act.sign(app, sel()) },
      { label: 'Parafiraj', icon: 'pen', disabled: !(app.docView === 'office' && can.initial(app, sel())), action: () => act.initial(app, sel()) },
      { label: 'Izprazni odložišče', disabled: !app.clipboard.length, action: () => act.emptyClipboard(app) },
      { sep: true },
      { label: 'Posodobi indeks za iskanje za izbrane dokumente', disabled: !sel().length, action: () => toast(`Indeks za iskanje je posodobljen za ${sel().length} dokumentov. (Replika indeksira sproti ob vsaki spremembi.)`) },
      { label: 'Posodobi število dokumentov v mapah', action: async () => { await app.view?.refresh(); toast('Število dokumentov v mapah je posodobljeno.'); } },
    ] });
  }
  menus.push(
    { label: 'Orodja', mnemonic: 'O', items: () => [
      { label: 'Imenik', icon: 'book', action: async () => (await import('./views/settings.js')).directoryDialog(app) },
      { label: 'Varnostna kopija', icon: 'backup', disabled: !app.me.companies.some((c) => app.me.flags[c.id]?.admin), title: 'Le za upravnika', action: () => backup() },
      { label: 'Osebne nastavitve', action: async () => (await import('./views/settings.js')).personalSettingsDialog(app) },
      { label: 'Nastavitve', action: async () => (await import('./views/settings.js')).appSettingsDialog(app) },
      { label: 'Spremeni geslo', action: () => changePasswordDialog() },
    ] },
    { label: 'Okno', mnemonic: 'K', items: () => windowMenu() },
    { label: 'Pantheon 5.5', items: () => [
      { label: 'Sinhroniziraj partnerje', action: () => pantheonSync('partners') },
      { label: 'Sinhroniziraj podatke', action: () => pantheonSync('data') },
      { sep: true },
      { label: 'Prenesi dokumente v Pantheon', icon: 'pantheon', disabled: !can.pantheon(app, sel()), action: () => act.pantheonTransfer(app, sel()) },
      { sep: true },
      { label: 'Posodobi šifrante', disabled: true, title: 'Ni na voljo: šifranti Pantheona v demo načinu niso povezani.' },
      { label: 'Resetiraj šifrante', disabled: true, title: 'Ni na voljo: šifranti Pantheona v demo načinu niso povezani.' },
    ] },
  );
  if (scanner) menus.push({ label: 'Obdelava', disabled: () => app.scanView !== 'process', items: () => app.view?.processMenu?.() || [] });
  menus.push({ label: 'Pomoč', mnemonic: 'P', items: () => [
    { label: `${BRAND.name} navodila`, icon: 'help', shortcut: 'F1', action: () => helpDialog() },
    { label: 'Jezik', items: [{ label: 'Slovenščina', checked: true, action: () => {} }, { label: 'English', disabled: true, title: 'Prevod ni na voljo v demo rekreaciji.' }] },
    { sep: true },
    ...(isStandalone() ? [{ label: 'Ponastavi demo podatke', action: () => resetDemo() }] : []),
    { label: 'O programu', icon: 'info', action: () => aboutDialog() },
  ] });
  return menus;
}

function windowMenu() {
  for (const [id, w] of app.windows) if (w.win.closed) app.windows.delete(id);
  return [
    { label: windowTitle(), checked: true, action: () => window.focus() },
    ...[...app.windows.entries()].map(([id, w]) => ({ label: w.title, action: () => { if (!w.win.closed) w.win.focus(); } })),
  ];
}

async function resetDemo() {
  const { confirmBox } = await import('./ui/dialog.js');
  if (!await confirmBox('Ponastavim vse demo podatke na začetno stanje? Vse spremembe v tem brskalniku bodo izgubljene.')) return;
  await window.__DMS_LOCAL__.reset();
  showLogin('Demo podatki so ponastavljeni. Prijavite se ponovno.');
}

async function pantheonSync(what) {
  try { await infoResult(await api('pantheonSync', { what, companyId: app.companyId }), 'Pantheon 5.5'); } catch (e) { app.error(e); }
}
async function backup() {
  try {
    const r = await api('backup');
    download(`eba-demo-varnostna-kopija-${r.createdAt.slice(0, 10)}.json`, JSON.stringify(r, null, 2), 'application/json');
    toast('Varnostna kopija (lokalni izvoz stanja) je prenesena.');
  } catch (e) { app.error(e); }
}
async function importSettings() {
  const [f] = await pickFiles({ multiple: false, accept: '.json,application/json' });
  if (!f) return;
  try {
    app.personal = await api('importSettingsFile', { data: await f.text() });
    toast('Nastavitve so uvožene.');
    switchModule(app.module);
  } catch (e) { app.error(e); }
}
function copyList() {
  const text = app.grid.toTSV();
  navigator.clipboard?.writeText(text).then(() => toast(`Seznam (${app.grid.visibleRows().length} vrstic) je kopiran v odložišče.`), () => download('seznam.tsv', text));
}
function printList() {
  if (!canPrint()) return noPrint();
  const area = el(`<div class="print-area">${app.grid.toPrintHtml(`${companyName()} – seznam dokumentov`)}</div>`);
  document.body.appendChild(area);
  window.print();
  area.remove();
}
async function exitApp() {
  await api('logout').catch(() => {});
  channel?.postMessage({ type: 'logout' });
  for (const [, w] of app.windows) try { w.win.close(); } catch { /* ignore */ }
  window.close();
  rootEl().innerHTML = '<div class="login"><div class="dlg"><div class="tbar"><span class="t">' + BRAND.name + '</span></div><div class="dbody">Program je zaprt. To okno lahko zaprete.</div><div class="dfoot"><button class="btn primary" onclick="location.reload()">Ponovno zaženi</button></div></div></div>';
}
function helpDialog() {
  return dialog({ title: `${BRAND.name} navodila`, width: 640, body: `<div class="selectable" style="line-height:1.5">
    <b>Moduli</b><br>• <b>Dokumenti › Pisarna</b> – mape VHODNI/IZHODNI, obseg (spodaj levo), dvoklik odpre dokument v novem oknu.<br>
    • <b>Iskanje</b> – pogoji levo (zelen + doda alternativo za isto polje), <i>Išči</i> spodaj desno.<br>
    • <b>Skrbništvo</b> – pregled dokumentov po pisarnah (za vloge s skrbništvom).<br>
    • <b>Skenirnica</b> – Obdelava (skeniraj/uvozi, polja, pošlji uporabnikom), Paketi (globalna skenirnica), Dnevnik.<br><br>
    <b>Potek računa</b>: prejem → direktorica <i>Prevzemi</i> in <i>Parafiraj (Potrdi)</i> → pravilo posreduje v računovodstvo (zunanji status 0 → 1).<br><br>
    <b>Bližnjice</b>: Del, Ctrl+C, Ctrl+Shift+C, Ctrl+D, Ctrl+V, Ctrl+K, Ctrl+P, Ctrl+Q, F1, Alt+črka za menije.<br><br>
    <span class="demo-note">Integracije (${BRAND.exchange}, Moj-eRačun, AS2, IMAP, Microsoft Exchange, Pantheon, e-pošta, skener, OCR, register) so demo adapterji,
    ki ne kličejo zunanjih storitev. Podpisi so demo zapisi brez kriptografske veljavnosti. ${isStandalone() ? 'Ta predogled teče v brskalniku: stanje se hrani le v vašem brskalniku, prenosi datotek in tiskanje niso na voljo. Ponastavitev: Pomoč › Ponastavi demo podatke.' : 'Podrobnosti: README.md.'}</span></div>`,
    buttons: [{ label: 'Zapri', primary: true }] });
}

// ============================================================= keyboard
document.addEventListener('keydown', (e) => {
  if (!app.me || app.overlay || (!isStandalone() && location.hash.startsWith('#/doc/'))) return;
  if (menusOpen()) { if (menuKeydown(e)) { e.preventDefault(); e.stopPropagation(); } return; }
  if (dialogsOpen()) return;
  if (e.key === 'Alt') { document.body.classList.add('alt'); return; }
  if (e.altKey && e.key.length === 1 && app.menubar) { if (app.menubar.mnemonic(e.key)) e.preventDefault(); return; }
  const inField = e.target.matches('input, textarea, select');
  const k = e.key.toLowerCase();
  const rows = app.selection;
  const ctrl = e.ctrlKey || e.metaKey;
  let handled = true;
  if (e.key === 'F1') helpDialog();
  else if (e.key === 'F5') app.view?.refresh();
  else if (ctrl && k === 'p') { if (rows.length) act.printDocs(app, rows); }
  else if (ctrl && k === 'q') exitApp();
  else if (ctrl && k === 'd') { const d = app.personal.view?.details !== false; app.savePersonal({ view: { details: !d } }).then(() => toast(`Podrobnosti o dokumentu: ${!d ? 'vklopljene' : 'izklopljene'}`)); }
  else if (app.module === 'scanner') handled = app.view?.keydown?.(e) || false;
  else if (inField) handled = false;
  else if (e.key === 'Delete' && can.del(app, rows)) act.del(app, rows);
  else if (ctrl && e.shiftKey && k === 'c' && rows.length) act.copyLink(app, rows);
  else if (ctrl && k === 'c' && app.grid) copyList();
  else if (ctrl && k === 'v' && can.link(app, rows)) act.linkFromClipboard(app, rows);
  else if (ctrl && k === 'k' && can.classify(app, rows)) act.classify(app, rows);
  else handled = false;
  if (handled) e.preventDefault();
});
document.addEventListener('keyup', (e) => { if (e.key === 'Alt') document.body.classList.remove('alt'); });

installTooltips();
start().catch((e) => { rootEl().textContent = 'Napaka pri zagonu: ' + e.message; });
export default app;
