// Osebne nastavitve, Nastavitve (database/system) and Imenik podjetij.
// Dialogs edit a working copy: Uveljavi applies and stays open, V redu applies
// and closes, Prekliči / X discard anything not yet applied.
import { api, esc, el, toast } from '../ui/core.js';
import { dialog, alertBox, confirmBox, promptBox, showError, tri, cycleTri } from '../ui/dialog.js';
import { icon, large } from '../ui/icons.js';
import { Grid } from '../ui/grid.js';
import { fmtDatePadded, fmtDateTime, parseDate, isoLocal } from '/core/format.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const MASK = '••••••••';

function catDialog({ title, cats, render, apply, canApply = true, width = 702, height = 732, help }) {
  let cur = cats[0][0];
  const body = el(`<div class="catdlg"><div class="cats">${cats.map(([id, label, ic]) => `<div class="it" data-c="${id}">${large(ic, 32)}<span>${label}</span></div>`).join('')}</div><div class="panel"><h2></h2><div class="pc"></div></div></div>`);
  const show = () => {
    body.querySelectorAll('.cats .it').forEach((x) => x.classList.toggle('active', x.dataset.c === cur));
    const c = cats.find((x) => x[0] === cur);
    body.querySelector('h2').textContent = c[3] || c[1];
    const pc = body.querySelector('.pc');
    pc.innerHTML = '';
    render(cur, pc);
  };
  body.querySelector('.cats').addEventListener('click', (e) => { const it = e.target.closest('[data-c]'); if (it) { cur = it.dataset.c; show(); } });
  return dialog({
    title, width, height, body, help,
    footLeft: '<button class="btn hlp">Help</button>',
    onOpen: (d) => {
      d.body.style.padding = '0';
      d.q('.hlp').addEventListener('click', () => alertBox(help || 'Pomoč za to okno: glejte README.md.', { title: 'Help' }));
      show();
    },
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, action: async (d) => { if (canApply) await apply(); return true; } },
      { label: 'Prekliči', icon: 'cross', value: false },
      { label: 'Uveljavi', disabled: !canApply, action: async (d) => { await apply(); toast('Nastavitve so uveljavljene.'); show(); return false; } },
    ],
    closeValue: false,
  });
}

const chk3 = (key, v, label, bold = false) => `<label class="chk" data-tri="${key}" style="margin:4px 0;${bold ? 'font-weight:700' : ''}"><span class="cbx3 ${tri(v)}"></span>${esc(label)}</label>`;
const chk = (key, v, label) => `<label class="chk" style="margin:4px 0"><input type="checkbox" data-b="${key}" ${v ? 'checked' : ''}> ${esc(label)}</label>`;

// ============================================================== personal
export async function personalSettingsDialog(app) {
  const work = clone(app.personal);
  let selSub = null;
  const userName = (id) => app.me.users.find((u) => u.id === id)?.name || id;
  const companyName = (id) => app.me.companies.find((c) => c.id === id)?.name || 'Vsa podjetja';

  function render(cat, pc) {
    if (cat === 'subst') {
      pc.style.padding = '0';
      pc.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div class="whitebox" style="flex:1;overflow:auto;border-left:0;border-right:0"><table class="plain"><colgroup><col><col><col style="width:90px"><col style="width:90px"><col style="width:85px"><col></colgroup>
        <thead><tr><th>Podjetje</th><th>Nadomešča</th><th>Od</th><th>Do</th><th>Obveščanje</th><th>Opis</th></tr></thead>
        <tbody>${work.substitutions.map((s, i) => `<tr data-i="${i}" class="${selSub === i ? 'sel' : ''}"><td>${esc(companyName(s.companyId))}</td><td>${esc(userName(s.substituteUserId))}</td><td>${esc(fmtDatePadded(s.from))}</td><td>${esc(fmtDatePadded(s.to))}</td><td>${s.notify ? 'Da' : 'Ne'}</td><td>${esc(s.desc)}</td></tr>`).join('')}</tbody></table></div>
        <div class="graybar"><button class="tb add">Dodaj</button><button class="tb edit" ${selSub == null ? 'disabled' : ''}>Uredi</button><button class="tb cancel" ${selSub == null ? 'disabled' : ''}>Prekliči</button></div></div>`;
      pc.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) { selSub = +tr.dataset.i; render(cat, pc); } });
      pc.querySelector('.add').addEventListener('click', async () => { const s = await substForm(app, null); if (s) { work.substitutions.push(s); render(cat, pc); } });
      pc.querySelector('.edit').addEventListener('click', async () => { const s = await substForm(app, work.substitutions[selSub]); if (s) { work.substitutions[selSub] = s; render(cat, pc); } });
      pc.querySelector('.cancel').addEventListener('click', async () => { if (await confirmBox('Prekličem izbrano nadomeščanje?')) { work.substitutions.splice(selSub, 1); selSub = null; render(cat, pc); } });
    } else if (cat === 'scan') {
      const s = work.scanner;
      pc.innerHTML = `<fieldset class="fieldset"><legend>Uvoz slik</legend>${chk('moveImported', s.moveImported, 'Premakni uvožene slike')}
        <div style="display:flex;gap:4px;align-items:center;margin:2px 0 8px">Mapa: <input class="win" data-s="moveFolder" style="flex:1" value="${esc(s.moveFolder)}" ${s.moveImported ? '' : 'disabled'}><button class="btn" data-browse="moveFolder" style="min-width:24px" ${s.moveImported ? '' : 'disabled'}>…</button></div>
        ${chk('renameImported', s.renameImported, 'Preimenuj uvožene slike')}
        <div style="display:flex;gap:4px;align-items:center;margin:2px 0">Novo ime: <input class="win" data-s="renamePattern" style="flex:1" value="${esc(s.renamePattern)}" ${s.renameImported ? '' : 'disabled'}></div></fieldset>
        <fieldset class="fieldset"><legend>Mape</legend><div class="form" style="grid-template-columns:auto 1fr auto">
        <label>Mapa za uvoz slik:</label><input class="win" data-s="importFolder" value="${esc(s.importFolder)}"><button class="btn" data-browse="importFolder" style="min-width:24px">…</button>
        <label>Mapa za izvoz slik:</label><input class="win" data-s="exportFolder" value="${esc(s.exportFolder)}"><button class="btn" data-browse="exportFolder" style="min-width:24px">…</button></div></fieldset>
        <fieldset class="fieldset"><legend>Ostalo</legend>
        ${chk('noAutoSubject', s.noAutoSubject, 'Ob skeniranju ne izpolni predmeta na dokumenta samodejno')}<br>
        ${chk3('noAutoDate', s.noAutoDate, 'Ob skeniranju ne izpolni datuma na dokumentu samodejno')}<br>
        ${chk('showClassification', s.showClassification, 'Prikaži klasifikacijski seznam po prenosu v vložišče')}<br>
        ${chk('noOcrDefault', s.noOcrDefault, 'Privzeto skeniranje brez OCR')}<br>${chk('errorsOnlyData', s.errorsOnlyData, 'Seznam napak le pri podatkih')}<br>
        ${chk('selectFirst', s.selectFirst, 'Ob skeniranju izberi prvi dokument')}</fieldset>
        <div class="demo-note">V brskalniku se uvožene datoteke naložijo; izvirniki na disku ostanejo nespremenjeni, zato nastavitvi premikanja in preimenovanja nimata učinka v tej repliki.</div>`;
      pc.addEventListener('change', (e) => {
        if (e.target.dataset.b) { s[e.target.dataset.b] = e.target.checked; render(cat, pc); }
        if (e.target.dataset.s) s[e.target.dataset.s] = e.target.value;
      });
      bindTri(pc, s);
      pc.querySelectorAll('[data-browse]').forEach((b) => b.addEventListener('click', async () => {
        const v = await promptBox('Pot do mape (brskanje po disku v brskalniku ni mogoče):', s[b.dataset.browse], { title: 'Izberi mapo' });
        if (v != null) { s[b.dataset.browse] = v; render(cat, pc); }
      }));
    } else {
      const o = work.other;
      pc.innerHTML = `<fieldset class="fieldset"><legend>Zapiranje programa</legend>${chk3('trayOnClose', o.trayOnClose, 'Ob zapiranju se naj program zmanjša v sistemsko vrstico')}</fieldset>
        <fieldset class="fieldset"><legend>Obveščanje</legend>${chk3('notifyForward', o.notifyForward, 'Ob posredovanju dokumenta privzemi obveščanje novih uporabnikov', true)}<br>
        ${chk3('notifyGrant', o.notifyGrant, 'Ob dodeljevanju dostopa privzemi obveščanje novih uporabnikov', true)}<br>${chk3('noPopup', o.noPopup, 'Ob prejemu obvestila ne prikaži obvestilnega okna')}</fieldset>
        <fieldset class="fieldset"><legend>Ostalo</legend>${chk('keepScrollbar', o.keepScrollbar, 'Ne skrivaj drsnika')}</fieldset>
        <fieldset class="fieldset"><legend>Stolpci v seznamu dokumentov</legend><button class="btn rst">Ponastavi</button> <span class="demo-note rstn">${work.__resetColumns ? 'Stolpci bodo ponastavljeni ob potrditvi.' : ''}</span></fieldset>
        <div class="demo-note">Polno modro polje pomeni privzeto (podedovano) vrednost; klik preklaplja privzeto → da → ne.</div>`;
      bindTri(pc, o);
      pc.addEventListener('change', (e) => { if (e.target.dataset.b) o[e.target.dataset.b] = e.target.checked; });
      pc.querySelector('.rst').addEventListener('click', () => { work.__resetColumns = true; pc.querySelector('.rstn').textContent = 'Stolpci bodo ponastavljeni ob potrditvi.'; });
    }
  }
  function bindTri(pc, obj) {
    pc.querySelectorAll('[data-tri]').forEach((l) => l.addEventListener('click', (e) => {
      e.preventDefault();
      const k = l.dataset.tri;
      obj[k] = cycleTri(obj[k]);
      l.querySelector('.cbx3').className = `cbx3 ${tri(obj[k])}`;
    }));
  }
  async function apply() {
    const patch = { substitutions: work.substitutions, scanner: work.scanner, other: work.other };
    if (work.__resetColumns) patch.resetColumns = true;
    app.personal = await api('savePersonal', patch);
    work.__resetColumns = false;
    if (patch.resetColumns) app.view?.refresh();
  }
  return catDialog({ title: 'Osebne nastavitve', cats: [['subst', 'Nadomeščanje', 'subst'], ['scan', 'Skenirnica', 'scanSettings'], ['other', 'Ostalo', 'other']], render, apply,
    help: 'Nadomeščanje: v izbranem obdobju nadomestni uporabnik vidi in obdeluje dokumente iz vaše pisarne.' });
}

async function substForm(app, s) {
  const users = app.me.users.filter((u) => u.id !== app.me.user.id);
  return dialog({
    title: 'Nadomeščanje', width: 420,
    body: `<div class="form"><label class="r">Podjetje:</label><select class="win co"><option value="">Vsa podjetja</option>${app.me.companies.map((c) => `<option value="${c.id}" ${c.id === s?.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <label class="r">Nadomešča:</label><select class="win us">${users.map((u) => `<option value="${u.id}" ${u.id === s?.substituteUserId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <label class="r">Od:</label><input class="win fr" value="${esc(s ? fmtDatePadded(s.from) : fmtDatePadded(isoLocal(new Date(), false)))}" placeholder="dd. mm. llll">
      <label class="r">Do:</label><input class="win to" value="${esc(s ? fmtDatePadded(s.to) : '')}" placeholder="dd. mm. llll">
      <label class="r">Obveščanje:</label><label class="chk"><input type="checkbox" class="no" ${s?.notify ? 'checked' : ''}> Obveščaj nadomestnega uporabnika</label>
      <label class="r">Opis:</label><input class="win de" value="${esc(s?.desc || '')}"></div>`,
    buttons: [{ label: 'V redu', icon: 'check', primary: true, action: (d) => {
      const f = parseDate(d.q('.fr').value), t = parseDate(d.q('.to').value);
      if (!f || !t) throw new Error('Vnesite veljavno obdobje (dd. mm. llll).');
      if (t < f) throw new Error('Datum "Do" je pred datumom "Od".');
      return { id: s?.id, companyId: d.q('.co').value, substituteUserId: d.q('.us').value, from: isoLocal(f, false), to: isoLocal(t, false), notify: d.q('.no').checked, desc: d.q('.de').value };
    } }, { label: 'Prekliči', icon: 'cross', value: null }],
  });
}

// ============================================================== app settings
export async function appSettingsDialog(app) {
  let data;
  try { data = await api('getAppSettings'); } catch (e) { return app.error(e); }
  const work = clone(data);
  let selConn = 0;
  const dis = work.canEdit ? '' : 'disabled';

  function render(cat, pc) {
    if (cat === 'db') {
      const c = work.connections[selConn] || {};
      pc.style.padding = '0';
      pc.innerHTML = `${work.canEdit ? '' : '<div class="demo-note" style="padding:4px 8px">Nastavitve lahko spreminja le skrbnik (upravnik). Prikaz je samo za branje.</div>'}
        <div class="whitebox" style="height:170px;overflow:auto;margin:0 0 0 0"><table class="plain"><colgroup><col style="width:100px"><col><col style="width:100px"><col style="width:120px"><col style="width:110px"></colgroup>
        <thead><tr><th>Status</th><th>Baza/Podjetje</th><th>Vrsta baze</th><th>Povezava na testno agencijo</th><th>Datum nastanka</th></tr></thead>
        <tbody>${work.connections.map((x, i) => `<tr data-i="${i}" class="${i === selConn ? 'sel' : ''}"><td><span class="led ${x.status === 'Omogočena' ? '' : 'off'}" style="width:11px;height:11px;border-radius:50%;display:inline-block;vertical-align:-1px;background:${x.status === 'Omogočena' ? '#29a12a' : '#c62828'}"></span> ${esc(x.status)}</td><td>${esc(x.name)}</td><td>${esc(x.type)}</td><td><input type="checkbox" disabled ${x.testAgency ? 'checked' : ''}></td><td>${esc(fmtDateTime(x.createdAt))}</td></tr>`).join('')}</tbody></table></div>
        <div class="graybar"><button class="tb add" ${dis}>${icon('plus')}Dodaj</button><button class="tb rem" ${work.connections.length > 1 && work.canEdit ? '' : 'disabled'}>${icon('minus')}Odstrani</button><button class="tb cp" ${dis}>Kopiraj</button><button class="tb rn" ${dis}>Preimenuj</button><button class="tb stt" ${dis}>Status ▾</button><span style="flex:1"></span><button class="tb clip">Kopiraj na odložišče</button></div>
        <div style="padding:6px 8px"><fieldset class="fieldset"><legend>Nastavitve povezave do baze podatkov</legend><div class="form conn" style="grid-template-columns:auto 1fr">
        <label class="r">Vrsta baze:</label><span style="display:flex;gap:8px"><select class="win" data-c="type" style="flex:1" ${dis}>${['PostgreSQL', 'SQLite', 'Microsoft SQL Server'].map((t) => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select><label class="chk"><input type="checkbox" data-c="auxiliary" ${c.auxiliary ? 'checked' : ''} ${dis}> Pomožna povezava</label></span>
        <label class="r">Ime baze:</label><input class="win" data-c="dbName" value="${esc(c.dbName)}" ${dis}>
        <label class="r">Uporabniško ime:</label><input class="win" data-c="username" value="${esc(c.username)}" ${dis}>
        <label class="r">Geslo:</label><input class="win" type="password" data-c="password" value="${esc(c.password)}" autocomplete="new-password" ${dis}>
        <label class="r">Strežnik:</label><input class="win" data-c="server" value="${esc(c.server)}" ${dis || (c.type === 'SQLite' ? 'disabled' : '')}>
        <label class="r">Vrata:</label><input class="win" data-c="port" value="${esc(c.port)}" ${dis}>
        <label class="r">Datoteka:</label><span style="display:flex;gap:2px"><input class="win" style="flex:1" data-c="file" value="${esc(c.file)}" ${c.type === 'SQLite' && work.canEdit ? '' : 'disabled'}><button class="btn" style="min-width:24px" disabled>…</button></span>
        <span></span><label class="chk"><input type="checkbox" data-c="useProxy" ${c.useProxy ? 'checked' : ''} ${dis}> Uporabi proxy povezavo</label>
        <label class="r">Proxy povezava:</label><input class="win" data-c="proxyName" value="${esc(c.proxyName)}" ${c.useProxy && work.canEdit ? '' : 'disabled'}>
        <label class="r">Proxy url:</label><input class="win" data-c="proxyUrl" value="${esc(c.proxyUrl)}" ${c.useProxy && work.canEdit ? '' : 'disabled'}>
        <label class="r">Proxy geslo:</label><input class="win" type="password" data-c="proxyPassword" value="${esc(c.proxyPassword)}" autocomplete="new-password" ${c.useProxy && work.canEdit ? '' : 'disabled'}>
        <label class="r">Način povezave</label><select class="win" data-c="mode" ${dis}>${['Samodejno', 'Neposredno', 'Preko proxyja'].map((t) => `<option ${t === c.mode ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="r">Lokalna baza<br>za skenirnico</label><span style="display:flex;gap:4px"><select class="win" style="flex:1" data-c="localScannerDb" ${dis}><option value=""></option>${work.connections.filter((x, i) => i !== selConn).map((x) => `<option ${x.name === c.localScannerDb ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><span class="tb clrl" ${dis}>${icon('cross', 12)}</span></span>
        <label class="r" style="align-self:start">Dodatne spremenljivke</label><textarea class="win" rows="2" data-c="extraVars" ${dis}>${esc(c.extraVars)}</textarea></div></fieldset>
        <div class="graybar"><button class="tb test">Testiraj povezavo</button><button class="tb upd" ${dis}>Posodobi bazo</button><button class="tb crt" ${dis}>Ustvari bazo</button></div>
        <fieldset class="fieldset" style="margin-top:8px"><legend>Povezava</legend><div class="form"><label class="r">Id povezave:</label><input class="win" data-c="connectionId" value="${esc(c.connectionId)}" ${dis}>
        <span></span><label class="chk"><input type="checkbox" data-c="testAgency" ${c.testAgency ? 'checked' : ''} ${dis}> Povezava na testno agencijo</label></div></fieldset></div>`;
      pc.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) { selConn = +tr.dataset.i; render(cat, pc); } });
      pc.querySelectorAll('[data-c]').forEach((i) => i.addEventListener('change', () => {
        c[i.dataset.c] = i.type === 'checkbox' ? i.checked : i.value;
        if (['type', 'useProxy', 'testAgency'].includes(i.dataset.c)) render(cat, pc);
      }));
      pc.querySelector('.clrl')?.addEventListener('click', () => { if (work.canEdit) { c.localScannerDb = ''; render(cat, pc); } });
      pc.querySelector('.add').addEventListener('click', async () => { const n = await promptBox('Ime nove povezave:', 'Nova povezava'); if (n) { work.connections.push({ status: 'Omogočena', name: n, type: 'PostgreSQL', createdAt: isoLocal(new Date()), port: 'Privzeto', mode: 'Samodejno', password: '', proxyPassword: '' }); selConn = work.connections.length - 1; render(cat, pc); } });
      pc.querySelector('.rem').addEventListener('click', async () => { if (await confirmBox(`Odstranim povezavo "${c.name}"?`)) { work.connections.splice(selConn, 1); selConn = 0; render(cat, pc); } });
      pc.querySelector('.cp').addEventListener('click', () => { const copy = { ...clone(c), id: undefined, name: `${c.name} (kopija)`, createdAt: isoLocal(new Date()), password: c.password === MASK ? '' : c.password, proxyPassword: c.proxyPassword === MASK ? '' : c.proxyPassword }; work.connections.push(copy); selConn = work.connections.length - 1; render(cat, pc); toast('Kopija povezave ne vsebuje shranjenih gesel.'); });
      pc.querySelector('.rn').addEventListener('click', async () => { const n = await promptBox('Novo ime:', c.name); if (n) { c.name = n; render(cat, pc); } });
      pc.querySelector('.stt').addEventListener('click', (e) => {
        import('../ui/menu.js').then(({ openMenu }) => { const r = e.target.getBoundingClientRect(); openMenu(['Omogočena', 'Onemogočena'].map((x) => ({ label: x, checked: c.status === x, action: () => { c.status = x; render(cat, pc); } })), r.left, r.bottom); });
      });
      pc.querySelector('.clip').addEventListener('click', () => {
        const text = `Baza: ${c.name}\nVrsta: ${c.type}\nIme baze: ${c.dbName}\nStrežnik: ${c.server}\nVrata: ${c.port}\nUporabnik: ${c.username}`;
        navigator.clipboard?.writeText(text).then(() => toast('Nastavitve povezave (brez gesel) so kopirane.'));
      });
      pc.querySelector('.test').addEventListener('click', async () => { const r = await api('testConnection', { connection: c }); alertBox(r.message, { title: 'Testiraj povezavo' }); });
      pc.querySelector('.upd').addEventListener('click', async () => { const r = await api('databaseMaintenance', { op: 'update' }).catch((e) => ({ message: e.message })); alertBox(r.message, { title: 'Posodobi bazo' }); });
      pc.querySelector('.crt').addEventListener('click', async () => { const r = await api('databaseMaintenance', { op: 'create' }).catch((e) => ({ message: e.message })); alertBox(r.message, { title: 'Ustvari bazo' }); });
    } else {
      const s = work.system;
      const manual = s.proxyMode === 'manual';
      let selEnv = null;
      const renderSys = () => {
        pc.innerHTML = `<fieldset class="fieldset"><legend>Nastavitve strežnika proxy</legend>
          ${[['direct', 'Neposrednoa povezava do interneta'], ['system', 'Uporabi sistemske nastavitve'], ['manual', 'Ročna nastavitve proxy']].map(([k, l]) => `<label class="chk" style="display:flex;margin:3px 0"><input type="radio" name="px" value="${k}" ${s.proxyMode === k ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0 3px 18px"><span>Proxy:</span><input class="win" data-s="proxy" style="flex:1" value="${esc(s.proxy)}" ${s.proxyMode === 'manual' && work.canEdit ? '' : 'disabled'}><span>Vrata:</span><input class="win" data-s="proxyPort" style="width:60px" value="${esc(s.proxyPort)}" ${s.proxyMode === 'manual' && work.canEdit ? '' : 'disabled'}></div>
          <label class="chk" style="margin-left:18px"><input type="checkbox" data-s="proxyAuth" ${s.proxyAuth ? 'checked' : ''} ${s.proxyMode === 'manual' && work.canEdit ? '' : 'disabled'}> Uporabi proxy avtentikacijo</label></fieldset>
          <fieldset class="fieldset"><legend>Okoljske spremenljivke</legend><div class="whitebox" style="height:300px;overflow:auto"><table class="plain"><colgroup><col style="width:40%"><col></colgroup><thead><tr><th>Ključ</th><th>Vrednost</th></tr></thead>
          <tbody>${s.env.map((e, i) => `<tr data-i="${i}" class="${selEnv === i ? 'sel' : ''}"><td><input data-e="key" value="${esc(e.key)}" ${dis}></td><td><input data-e="value" type="${e.concealed ? 'password' : 'text'}" value="${esc(e.value)}" autocomplete="new-password" ${dis}></td></tr>`).join('')}</tbody></table></div>
          <div class="graybar"><button class="tb ea" ${dis}>${icon('plus')}Dodaj</button><button class="tb ec" ${dis}>${icon('plus')}Dodaj zakrito</button><button class="tb er" ${selEnv == null || !work.canEdit ? 'disabled' : ''}>${icon('minusGreen')}Odstrani</button></div>
          <div class="demo-note">EBA_LIST_LIMIT omeji število prikazanih dokumentov v seznamih (prikaže se obvestilo o omejenem prikazu).</div></fieldset>
          <fieldset class="fieldset"><legend>Ostale nastavitve</legend><div class="form" style="grid-template-columns:auto 1fr auto auto auto">
          <label>Jezik:</label><select class="win" style="grid-column:span 4" ${dis}><option>Slovenščina</option></select>
          <label>Log folder:</label><span style="display:flex;gap:2px"><input class="win" style="flex:1" data-s="logFolder" value="${esc(s.logFolder)}" ${dis}><button class="btn lf" style="min-width:24px" ${dis}>…</button></span>
          <label>Nivo logiranja:</label><select class="win" data-s="logLevel" style="width:110px" ${dis}>${['', 'Napake', 'Opozorila', 'Informacije', 'Razhroščevanje'].map((x) => `<option ${x === s.logLevel ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <button class="btn sf">Pokaži datoteko</button></div></fieldset>`;
        pc.querySelectorAll('input[name=px]').forEach((r) => r.addEventListener('change', () => { s.proxyMode = r.value; renderSys(); }));
        pc.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('change', () => { s[i.dataset.s] = i.type === 'checkbox' ? i.checked : i.value; }));
        pc.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) { selEnv = +tr.dataset.i; pc.querySelectorAll('tbody tr').forEach((x) => x.classList.toggle('sel', x === tr)); pc.querySelector('.er').disabled = !work.canEdit; } });
        pc.querySelectorAll('[data-e]').forEach((i) => i.addEventListener('change', () => { s.env[+i.closest('tr').dataset.i][i.dataset.e] = i.value; }));
        pc.querySelector('.ea').addEventListener('click', () => { s.env.push({ key: '', value: '', concealed: false }); selEnv = s.env.length - 1; renderSys(); });
        pc.querySelector('.ec').addEventListener('click', () => { s.env.push({ key: '', value: '', concealed: true }); selEnv = s.env.length - 1; renderSys(); });
        pc.querySelector('.er').addEventListener('click', () => { if (selEnv != null) { s.env.splice(selEnv, 1); selEnv = null; renderSys(); } });
        pc.querySelector('.lf').addEventListener('click', async () => { const v = await promptBox('Pot do mape za dnevnike:', s.logFolder); if (v != null) { s.logFolder = v; renderSys(); } });
        pc.querySelector('.sf').addEventListener('click', async () => {
          const r = await api('logFile');
          dialog({ title: 'Dnevniška datoteka (demo)', width: 900, body: `<pre class="selectable" style="margin:0;max-height:60vh;overflow:auto;background:#fff;border:1px solid #aaa;padding:6px;font-size:11px">${esc(r.text)}</pre>`, buttons: [{ label: 'Zapri', primary: true }] });
        });
      };
      renderSys();
    }
  }
  async function apply() {
    const saved = await api('saveAppSettings', { connections: work.connections, system: work.system });
    Object.assign(work, clone(saved));
    app.me.listLimit = (saved.system.env.find((e) => e.key === 'EBA_LIST_LIMIT') || {}).value;
    app.view?.refresh();
  }
  return catDialog({ title: 'Nastavitve', width: 752, height: 782, canApply: work.canEdit, render, apply,
    cats: [['db', 'Baza podatkov', 'db', 'Povezava z bazo podatkov'], ['sys', 'Sistem', 'system', 'Sistemske nastavitve']],
    help: 'Replika shranjuje podatke lokalno (data/state.json). Povezave z bazo so demo nastavitve; Testiraj povezavo se izrecno označi kot demo test.' });
}

// ============================================================== directory
export function pickPartner(app, companyId) { return directoryDialog(app, { pick: true, companyId }); }

export async function directoryDialog(app, { pick = false, companyId } = {}) {
  const cid = companyId || (app.companyId === 'all' ? app.me.companies[0].id : app.companyId);
  const canEdit = (c) => !!app.me.flags[c]?.directory;
  let state = { companyId: cid, rows: [], total: 0, shown: 0, searched: false, notice: '' };
  const body = el(`<div style="display:flex;flex-direction:column;height:100%;gap:6px">
    <fieldset class="fieldset" style="margin:0"><legend>Iskalni pogoji</legend><div class="form">
      <label class="r">Ime podjetja:</label><input class="win q" data-q="name" autofocus>
      <label class="r">Naslov podjetja:</label><input class="win q" data-q="address">
      <label class="r">Davčna številka:</label><input class="win q" data-q="taxNo">
      <label class="r">Zunanji id:</label><input class="win q" data-q="externalId">
      <label class="r">Moje podjetje:</label><select class="win co">${app.me.companies.map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <span></span><label class="chk"><input type="checkbox" class="ext"> Išči po zunanjih virih</label></div></fieldset>
    <div class="graybar"><button class="tb go">${icon('zoomIn')}Išči</button><button class="tb clr">${icon('cross', 12)}Počisti</button><span style="flex:1"></span><button class="tb rf" disabled>${icon('refresh')}Osveži</button></div>
    <div class="gh" style="flex:1;min-height:0;display:flex;border:1px solid #a9a9a9"></div>
    <div class="cnt" style="min-height:15px"></div>
    <div class="graybar"><button class="tb add">${icon('plus')}Dodaj</button><button class="tb rem" disabled>${icon('minusGreen')}Odstrani</button><button class="tb ed" disabled>${icon('cover')}Uredi</button><span style="flex:1"></span>
      <button class="tb one">Enkratni partner</button><button class="tb reg" disabled title="Uvoz iz registra transakcijskih računov ni povezan (zunanji register ni na voljo v demo načinu).">Uvozi iz registra tr. računov</button></div></div>`);
  const T = (id, label, key, w) => ({ id, label, get: (r) => r[key], type: 'text', w });
  let grid;
  const res = await dialog({
    title: 'Imenik podjetij', width: 755, height: 698, body,
    onOpen: (d) => {
      d.body.style.display = 'flex'; d.body.style.flexDirection = 'column';
      grid = new Grid(body.querySelector('.gh'), {
        columns: [T('n', 'Ime', 'shortName', 200), T('a', 'Naslov', 'address', 160), T('k', 'Kraj', 'city', 100), T('p', 'Poštna št.', 'postal', 80), T('po', 'Pošta', 'post', 100),
          T('d', 'Država', 'country', 100), T('t', 'Davčna št.', 'taxNo', 90), T('m', 'Matična št.', 'regNo', 100), T('v', 'Vir', 'source', 70), T('z', 'Zunanji id', 'externalId', 90)],
        sort: { id: 'n', dir: 'desc' },
        onSelect: (rows) => { const e = rows.length === 1 && canEdit(state.companyId); body.querySelector('.ed').disabled = !(rows.length === 1); body.querySelector('.rem').disabled = !e; },
        onOpen: (r) => { if (pick) d.q('.dfoot .btn.primary').click(); else edit(r); },
      });
      const run = async () => {
        const q = Object.fromEntries([...body.querySelectorAll('.q')].map((i) => [i.dataset.q, i.value]));
        try {
          const r = await api('searchPartners', { companyId: state.companyId, ...q, external: body.querySelector('.ext').checked });
          state = { ...state, rows: r.rows, total: r.total, shown: r.shown, searched: true, notice: r.externalNotice || '' };
          grid.setRows(r.rows, { keepSelection: false });
          body.querySelector('.cnt').textContent = `${r.shown}/${r.total} zadetkov${r.externalNotice ? ' · ' + r.externalNotice : ''}`;
          body.querySelector('.rf').disabled = false;
        } catch (e) { showError(d, e); }
      };
      body.querySelector('.go').addEventListener('click', run);
      body.querySelector('.rf').addEventListener('click', run);
      body.querySelectorAll('.q').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(); } }));
      body.querySelector('.clr').addEventListener('click', () => { body.querySelectorAll('.q').forEach((i) => { i.value = ''; }); grid.setRows([], { keepSelection: false }); body.querySelector('.cnt').textContent = ''; body.querySelector('.rf').disabled = true; });
      body.querySelector('.co').addEventListener('change', (e) => { state.companyId = e.target.value; body.querySelector('.add').disabled = !canEdit(state.companyId); body.querySelector('.one').disabled = !canEdit(state.companyId); if (state.searched) run(); });
      body.querySelector('.add').disabled = !canEdit(state.companyId);
      body.querySelector('.one').disabled = !canEdit(state.companyId);
      const edit = async (p, oneTime = false) => { const saved = await partnerForm(app, p, state.companyId, oneTime); if (saved && state.searched) run(); return saved; };
      body.querySelector('.add').addEventListener('click', () => edit(null));
      body.querySelector('.ed').addEventListener('click', () => edit(grid.selectedRows()[0]));
      body.querySelector('.one').addEventListener('click', async () => {
        const p = await edit(null, true);
        if (p && pick) d.close(p);
      });
      body.querySelector('.rem').addEventListener('click', async () => {
        const p = grid.selectedRows()[0];
        if (!p || !await confirmBox(`Odstranim partnerja "${p.shortName}" iz imenika?`)) return;
        try { await api('deletePartner', { id: p.id }); run(); } catch (e) { showError(d, e); }
      });
    },
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, action: () => (pick ? grid.selectedRows()[0] || null : true) },
      { label: 'Prekliči', icon: 'cross', value: null },
      { label: 'Pomoč', action: () => { alertBox('Lokalno iskanje po imeniku izbranega podjetja. Iskanje po zunanjih virih in uvoz iz registra v demo načinu nista povezana.', { title: 'Pomoč' }); return false; } },
    ],
  });
  return res;
}

async function partnerForm(app, p, companyId, oneTime = false) {
  const v = p || { companyId, country: 'SLOVENIJA', contacts: [] };
  const can = !!app.me.flags[companyId]?.directory;
  const ro = can ? '' : 'readonly';
  const F = (k, label) => `<label class="r">${label}</label><input class="win" data-p="${k}" value="${esc(v[k] ?? '')}" ${ro}>`;
  const contacts = [...(v.contacts || [])];
  const contactRows = () => [...contacts, {}].map((c, i) => `<tr data-i="${i}"><td style="width:14px;color:#777">${i === contacts.length ? '*' : ''}</td>${['name', 'email', 'phone', 'desc'].map((k) => `<td><input data-ct="${k}" value="${esc(c[k] || '')}" ${ro}></td>`).join('')}</tr>`).join('');
  return dialog({
    title: oneTime ? 'Enkratni partner' : 'Vnos imenika', width: 503,
    body: `<div class="form" style="grid-template-columns:118px 1fr">
      ${F('fullName', 'Polno ime podjetja:')}${F('shortName', 'Kratko ime podjetja*:')}${F('representative', 'Pooblaščenec:')}${F('taxNo', 'Davčna številka:')}${F('regNo', 'Matična številka:')}
      ${F('email', 'Email:')}${F('web', 'Spletni naslov:')}${F('ean', 'EAN lokacijska št.:')}${F('phone', 'Telefon:')}${F('fax', 'Fax:')}${F('address', 'Naslov:')}${F('city', 'Kraj:')}
      ${F('postal', 'Poštna številka:')}${F('post', 'Pošta:')}
      <label class="r">Država:</label><select class="win" data-p="country" ${can ? '' : 'disabled'}>${['SLOVENIJA', 'HRVAŠKA', 'AVSTRIJA', 'ITALIJA', 'MADŽARSKA', 'NEMČIJA', 'IRSKA', 'NIZOZEMSKA'].map((c) => `<option ${c === String(v.country).toUpperCase() ? 'selected' : ''}>${c}</option>`).join('')}${v.country && !['SLOVENIJA', 'HRVAŠKA', 'AVSTRIJA', 'ITALIJA', 'MADŽARSKA', 'NEMČIJA', 'IRSKA', 'NIZOZEMSKA'].includes(String(v.country).toUpperCase()) ? `<option selected>${esc(v.country)}</option>` : ''}</select>
      <label class="r">Id za DDV:</label><span style="display:flex;gap:8px"><input class="win" style="flex:1" data-p="vatId" value="${esc(v.vatId || '')}" ${ro}><label class="chk"><input type="checkbox" data-p="vatPayer" ${v.vatPayer ? 'checked' : ''} ${can ? '' : 'disabled'}> Zavezanec za DDV</label></span>
      ${F('externalId', 'Zunanji id:')}
      <label class="r">Podjetje vnosa:</label><select class="win" disabled><option>${esc(app.me.companies.find((c) => c.id === companyId)?.name || '')}</option></select>
      ${F('ebaId', 'EBA Id:')}</div>
      <div class="whitebox" style="margin-top:10px;height:100px;overflow:auto"><table class="plain ct"><colgroup><col style="width:14px"><col><col><col><col></colgroup><thead><tr><th></th><th>Ime</th><th>Email</th><th>Telefon</th><th>Opis</th></tr></thead><tbody>${contactRows()}</tbody></table></div>
      ${can ? '' : '<div class="demo-note">Vaša vloga nima pravice urejanja imenika.</div>'}`,
    onOpen: (d) => {
      d.q('.ct tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr');
        const i = +tr.dataset.i;
        if (i === contacts.length) { contacts.push({}); tr.querySelector('td').textContent = ''; d.q('.ct tbody').insertAdjacentHTML('beforeend', `<tr data-i="${contacts.length}"><td style="width:14px;color:#777">*</td>${['name', 'email', 'phone', 'desc'].map((k) => `<td><input data-ct="${k}"></td>`).join('')}</tr>`); }
        contacts[i][e.target.dataset.ct] = e.target.value;
      });
    },
    buttons: [
      { label: 'V redu', icon: 'check', primary: true, disabled: !can, action: async (d) => {
        const partner = { id: p?.id, companyId, contacts };
        d.qa('[data-p]').forEach((i) => { partner[i.dataset.p] = i.type === 'checkbox' ? i.checked : i.value; });
        const saved = await api('savePartner', { partner, oneTime });
        toast(oneTime ? 'Enkratni partner je ustvarjen (ni prikazan v imeniku).' : 'Partner je shranjen.');
        return saved;
      } },
      { label: 'Prekliči', icon: 'cross', value: null },
    ],
  });
}
