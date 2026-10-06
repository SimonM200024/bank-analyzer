// Skenirnica: Obdelava (processing), Paketi (global batches), Dnevnik (intake log).
import { api, esc, el, toast, upload, pickFiles, download, blobUrl, downloadBlob, isStandalone, canPrint, noPrint } from '../ui/core.js';
import { openMenu } from '../ui/menu.js';
import { dialog, alertBox, confirmBox, promptBox } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import { Grid } from '../ui/grid.js';
import { CATEGORIES, DIRECTIONS, EXTRACTION_FIELDS, categoryLabel, directionLabel } from '/core/schema.js';
import { fmtDateTime, fmtDateCompact, fmtDatePadded, fmtDate, fmtAmount, parseAmount, parseDate, isoLocal } from '/core/format.js';
import { pickHolders } from '../dialogs.js';

export function mountScanner(app, pane, content, toolbar) {
  const st = app.scanState ||= { batchId: null, docId: null, page: 0, fit: 'height', colour: false, collapsed: new Set(), find: '', logCrit: { direction: 'Prejeta pošta' } };
  const view = app.scanView;
  let cmd = null; // processing commands, set by mountProcess (toolbar is active only there)
  renderToolbar();
  if (view === 'packages') return mountPackages();
  if (view === 'log') return mountLog();
  return mountProcess();

  // ---------------------------------------------------------------- toolbar
  function renderToolbar() {
    const on = view === 'process';
    const v = app.personal.view || {};
    toolbar.className = `toolbar icons-${v.iconSize || 'small'} text-${v.textMode || 'beside'}${v.toolbar === false ? ' hidden' : ''}`;
    toolbar.innerHTML = `<button class="tb" data-a="scan" ${on ? '' : 'disabled'}>${icon('scan')}<span class="tl">Skeniraj</span><span class="dd" data-m="scan">▼</span></button>
      <button class="tb" data-a="import" ${on ? '' : 'disabled'}>${icon('import')}<span class="tl">Uvozi</span><span class="dd" data-m="import">▼</span></button>
      <button class="tb" data-a="send" ${on ? '' : 'disabled'}>${icon('sendUsers')}<span class="tl">Pošlji uporabnikom</span><span class="dd" data-m="send">▼</span></button>
      <button class="tb" data-a="comment" ${on ? '' : 'disabled'}>${icon('comment')}<span class="tl">Komentar</span></button>
      <span class="tsep"></span>
      <button class="tb" data-a="fitH" ${on ? '' : 'disabled'}>${icon('hHeight')}<span class="tl">Višina slike</span></button>
      <button class="tb" data-a="fitW" ${on ? '' : 'disabled'}>${icon('hWidth')}<span class="tl">Širina slike</span></button>
      <span class="spacer"></span>`;
    toolbar.onclick = (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b || b.disabled) return;
      const dd = e.target.closest('[data-m]');
      const r = b.getBoundingClientRect();
      if (dd) return openMenu(dropdown(dd.dataset.m), r.left, r.bottom);
      ({ scan: () => cmd.scan(), import: () => cmd.importFiles({}), send: () => cmd.send('users'), comment: () => cmd.comment(), fitH: () => cmd.fit('height'), fitW: () => cmd.fit('width') })[b.dataset.a]?.();
    };
  }
  function dropdown(m) {
    if (m === 'scan') return [
      { label: 'Skeniraj', bold: true, action: () => cmd.scan() },
      { label: 'Prikaži skenerjev dialog', action: () => scannerDialog() },
      { label: 'Izberi skener', action: () => scannerDialog(true) },
      { sep: true },
      { label: 'Skeniraj barvno', action: () => cmd.scan({ colour: true }) },
    ];
    if (m === 'import') return [{ label: 'Uvozi', bold: true, action: () => cmd.importFiles({}) }, { label: 'Uvozi barvno', action: () => cmd.importFiles({ colour: true }) }];
    return sendItems();
  }
  function sendItems() {
    return [
      { label: 'Pošlji uporabnikom', icon: 'sendUsers', shortcut: 'F4', action: () => cmd.send('users') },
      { label: 'Pošlji neposredno uporabniku', icon: 'forward', shortcut: 'Ctrl+F4', action: () => cmd.send('direct') },
      { label: 'Pošlji v mojo pisarno', shortcut: 'Ctrl+Shift+F4', action: () => cmd.send('myoffice') },
      { label: 'Pošlji v mojo pisarno in odpri', shortcut: 'Shift+F4', action: () => cmd.send('myoffice', true) },
    ];
  }
  async function scannerDialog(select = false) {
    await dialog({
      title: select ? 'Izberi skener' : 'Skener', width: 380, help: false,
      body: `<div class="whitebox" style="padding:4px"><label class="chk"><input type="radio" checked> Demo skener (simulacija)</label></div>
        <div class="demo-note" style="margin-top:8px">Strojna oprema skenerja (TWAIN/WIA) v demo rekreaciji ni povezana. Demo skener ustvari sintetično stran računa iz fiktivnega imenika.</div>`,
      buttons: [{ label: 'V redu', primary: true }],
    });
  }

  // ================================================================ OBDELAVA
  function mountProcess() {
    pane.style.width = '230px';
    pane.innerHTML = `<div class="intake" style="flex-direction:column;flex:1;min-height:0"><div class="list" style="width:auto;flex:1">
      <div style="padding:3px"><select class="win bsel" style="width:100%"></select></div><div class="items"></div><div class="count"></div></div></div>`;
    content.innerHTML = '<div class="intake"><div class="view" style="flex-direction:column"></div><div class="iform"></div></div>';
    let batches = [];
    let batch = null;

    async function load() {
      try {
        const r = await api('listBatches', { companyId: app.companyId });
        batches = r.batches;
        if (!batches.some((b) => b.id === st.batchId)) st.batchId = batches.find((b) => !b.source && b.operator === app.me.user.name)?.id || batches[0]?.id || null;
        batch = batches.find((b) => b.id === st.batchId) || null;
        if (batch && !batch.docs.some((d) => d.id === st.docId)) { st.docId = batch.docs[0]?.id || null; st.page = 0; }
        render();
      } catch (e) {
        pane.innerHTML = `<div class="grid-empty">${esc(e.message)}</div>`;
      }
    }
    async function reloadBatch(b) {
      if (b?.id) { batch = b; const i = batches.findIndex((x) => x.id === b.id); if (i >= 0) batches[i] = b; else batches.push(b); }
      render();
    }

    function render() {
      const sel = pane.querySelector('.bsel');
      sel.innerHTML = batches.map((b) => `<option value="${b.id}" ${b.id === st.batchId ? 'selected' : ''}>${esc(b.group)} · ${esc(fmtDateTime(b.createdAt))} (${b.docs.length})</option>`).join('') + '<option value="__new">Nov paket ...</option>';
      if (!batches.length) sel.value = '';
      const items = pane.querySelector('.items');
      const docs = batch?.docs || [];
      items.innerHTML = docs.map((d, i) => {
        const p = d.pages[0];
        return `<div class="item${d.id === st.docId ? ' sel' : ''}" data-id="${d.id}">${p ? `<img src="${blobUrl(p.blobId)}" alt="">` : `<div style="width:42px;height:58px;background:#fff;border:1px solid #b8b8b8;font-size:9px;display:flex;align-items:center;justify-content:center;text-align:center">Brez slike</div>`}
          <div style="min-width:0;font-size:11.5px"><b>${i + 1}. ${esc(categoryLabel(d.category))}</b><br>${esc(d.sender || 'Neznan')}<br><span class="demo-note">${d.pages.length} ${d.pages.length === 1 ? 'slika' : 'slik'}${d.templateId ? ' · predloga' : ''}${d.comment ? ' · komentar' : ''}</span></div></div>`;
      }).join('');
      const imgs = docs.reduce((n, d) => n + d.pages.length, 0);
      pane.querySelector('.count').textContent = `${docs.length} ${docs.length === 1 ? 'dokument' : 'dokumentov'}, ${imgs} ${imgs === 1 ? 'slika' : 'slik'}`;
      renderView(); renderForm();
      app.setListInfo({ shown: docs.length, total: docs.length, limited: false });
      app.setSelection([]);
      app.menubar?.refresh();
    }
    const curDoc = () => batch?.docs.find((d) => d.id === st.docId) || null;

    function renderView() {
      const v = content.querySelector('.view');
      const d = curDoc();
      if (!d) { v.innerHTML = `<div style="flex:1;background:#fff"></div>`; return; }
      const p = d.pages[st.page] || d.pages[0];
      const strip = d.pages.length > 1 ? `<div style="display:flex;gap:6px;padding:4px;background:#eef1f5;border-bottom:1px solid #ccd">${d.pages.map((pg, i) => `<div class="pg${i === st.page ? ' sel' : ''}" data-p="${i}" style="width:42px;height:58px;border:2px solid ${i === st.page ? '#3d8ee6' : '#ccc'};background:#fff">${pg.mime.startsWith('image/') ? `<img src="${blobUrl(pg.blobId)}" style="width:100%;height:100%;object-fit:contain">` : icon('pdf', 30)}</div>`).join('')}</div>` : '';
      let img = '<div style="padding:30px;color:#666">Dokument brez slike.</div>';
      if (p) {
        if (p.mime === 'application/pdf' && isStandalone()) img = `<div style="padding:30px;color:#fff">${esc(p.name)} – predogled PDF v tem predogledu ni na voljo.</div>`;
        else if (p.mime === 'application/pdf') img = `<iframe src="${blobUrl(p.blobId)}" style="width:100%;height:100%;border:0"></iframe>`;
        else if (p.mime.startsWith('image/')) img = `<img src="${blobUrl(p.blobId)}" style="${st.fit === 'height' ? 'height:calc(100% - 16px);width:auto' : 'width:calc(100% - 16px);height:auto'};margin:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">`;
        else img = `<div style="padding:30px">${esc(p.name)} – predogled ni na voljo.</div>`;
      }
      v.innerHTML = `${strip}<div class="pv" style="flex:1;overflow:auto;background:#a0a0a0;text-align:center;min-height:0">${img}</div>`;
      v.querySelectorAll('[data-p]').forEach((x) => {
        x.addEventListener('click', () => { st.page = +x.dataset.p; renderView(); });
        x.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu([{ label: 'Zbriši stran', icon: 'cross', action: async () => { const r = await api('deleteIntake', { batchId: batch.id, docId: d.id, pageIndex: +x.dataset.p }); st.page = 0; reloadBatch(r.batch); } }], e.clientX, e.clientY); });
      });
    }

    function renderForm() {
      const f = content.querySelector('.iform');
      const d = curDoc();
      if (!d) { f.innerHTML = `<div class="demo-note">${batch ? 'Paket je prazen. Skenirajte ali uvozite dokumente (Uvozi, Skeniraj).' : 'Ni paketov. Ustvarite nov paket (Obdelava › Nov paket) ali uvozite datoteke.'}</div>`; return; }
      const defs = EXTRACTION_FIELDS[d.category] || EXTRACTION_FIELDS.racun;
      const ex = Object.fromEntries((d.extracted || []).map((x) => [x.key, x]));
      const page0 = d.pages[0];
      const fmtV = (t, v) => v == null || v === '' ? '' : t === 'date' ? fmtDatePadded(v) : t === 'amount' ? fmtAmount(v) : String(v);
      f.innerHTML = `<div class="form" style="grid-template-columns:96px 1fr;gap:4px 6px">
        <label class="r">Smer:</label><select class="win" data-f="direction">${DIRECTIONS.map((x) => `<option value="${x.id}" ${x.id === d.direction ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
        <label class="r">Tip:</label><select class="win" data-f="category">${CATEGORIES.map((x) => `<option value="${x.id}" ${x.id === d.category ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
        <label class="r">${d.direction === 'out' ? 'Prejemnik:' : 'Pošiljatelj:'}</label><span style="display:flex"><input class="win" style="flex:1;min-width:0" data-f="sender" value="${esc(d.sender)}" placeholder="Neznan"><button class="btn pp" style="min-width:22px;height:20px;padding:0">…</button></span>
        <label class="r">Predmet:</label><input class="win" data-f="subject" value="${esc(d.subject)}">
        <label class="r">Datum prejema:</label><input class="win" data-f="receivedDate" value="${esc(d.receivedDate ? fmtDatePadded(d.receivedDate) : '')}" placeholder="dd. mm. llll">
        <label class="r" style="align-self:start">Komentar:</label><textarea class="win" rows="2" data-f="comment">${esc(d.comment)}</textarea>
        <label class="r">Predloga:</label><span>${esc(app.scanTemplates?.find((t) => t.id === d.templateId)?.name || '–')}</span>
        <label class="r">Vir:</label><span>${esc(d.source || 'Skener')}${d.ocr ? '' : ' (brez OCR)'}</span></div>
        <div style="margin:10px 0 4px;font-weight:700">Prepoznani podatki</div>
        <table class="plain" style="background:#fff"><colgroup><col style="width:120px"><col><col style="width:82px"></colgroup>
        ${defs.main.map(([k, label, t]) => {
          const x = ex[k];
          const snip = x?.region && page0?.mime.includes('svg') ? `<img src="${blobUrl(page0.blobId)}#svgView(viewBox(${x.region.x},${x.region.y},${x.region.w},${x.region.h}))" style="height:16px;max-width:80px">` : '<span class="demo-note">Brez slike</span>';
          return `<tr><td title="${esc(label)}">${esc(label)}</td><td><input data-x="${k}" data-t="${t}" value="${esc(fmtV(t, d.fields[k]))}"></td><td>${snip}</td></tr>`;
        }).join('')}</table>
        ${d.extracted?.length ? '' : `<div class="demo-note" style="margin-top:4px">${d.ocr ? 'Demo OCR prepozna le demo strani; za to datoteko podatki niso bili prepoznani.' : 'Uvoženo brez OCR.'}</div>`}
        <div class="demo-note" style="margin-top:10px">Spremembe se shranijo ob izhodu iz polja. Dokument v DMS ustvarite z ukazom Pošlji uporabnikom (F4).</div>`;
      f.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('change', () => saveField(i)));
      f.querySelectorAll('[data-x]').forEach((i) => i.addEventListener('change', () => saveExtracted(i)));
      f.querySelector('.pp').addEventListener('click', async () => {
        const { pickPartner } = await import('./settings.js');
        const p = await pickPartner(app, batch.companyId);
        if (p) { const r = await api('updateIntakeDoc', { batchId: batch.id, docId: d.id, patch: { sender: p.shortName, senderPartnerId: p.id } }); reloadBatch(r.batch); }
      });
    }
    async function saveField(i) {
      const d = curDoc();
      let v = i.value;
      if (i.dataset.f === 'receivedDate' && v) { const dd = parseDate(v); if (!dd) return alertBox('Neveljaven datum (dd. mm. llll).', { kind: 'error' }); v = isoLocal(dd, false); }
      try { const r = await api('updateIntakeDoc', { batchId: batch.id, docId: d.id, patch: { [i.dataset.f]: v } }); reloadBatch(r.batch); } catch (e) { app.error(e); }
    }
    async function saveExtracted(i) {
      const d = curDoc();
      let v = i.value.trim();
      if (i.dataset.t === 'amount' && v) { const n = parseAmount(v); if (n == null) return alertBox('Neveljaven znesek.', { kind: 'error' }); v = n; }
      if (i.dataset.t === 'date' && v) { const dd = parseDate(v); if (!dd) return alertBox('Neveljaven datum (dd. mm. llll).', { kind: 'error' }); v = isoLocal(dd, false); }
      try { const r = await api('updateIntakeDoc', { batchId: batch.id, docId: d.id, patch: { fields: { [i.dataset.x]: v === '' ? null : v } } }); reloadBatch(r.batch); } catch (e) { app.error(e); }
    }

    pane.querySelector('.bsel').addEventListener('change', async (e) => {
      if (e.target.value === '__new') return cmd.newBatch();
      st.batchId = e.target.value; batch = batches.find((b) => b.id === st.batchId); st.docId = batch?.docs[0]?.id || null; st.page = 0; render();
    });
    pane.querySelector('.items').addEventListener('mousedown', (e) => {
      const it = e.target.closest('.item');
      if (!it) return;
      st.docId = it.dataset.id; st.page = 0; render();
    });
    pane.querySelector('.items').addEventListener('contextmenu', (e) => {
      const it = e.target.closest('.item');
      if (!it) return;
      e.preventDefault(); st.docId = it.dataset.id; render();
      openMenu(processMenu(), e.clientX, e.clientY);
    });

    const needBatch = async () => {
      if (batch) return batch;
      const r = await api('newBatch', { companyId: app.companyId });
      st.batchId = r.id; batches.push(r); batch = r;
      return r;
    };

    cmd = {
      async newBatch() { try { const r = await api('newBatch', { companyId: app.companyId }); st.batchId = r.id; st.docId = null; batches.push(r); batch = r; render(); toast('Nov paket je ustvarjen.'); } catch (e) { app.error(e); } },
      async newNoImage(category = 'racun') { const b = await needBatch(); const r = await api('newDocNoImage', { batchId: b.id, category }); st.docId = r.docId; reloadBatch(r.batch); },
      async scan({ colour = false, category, intoDoc = false } = {}) {
        try {
          const b = await needBatch();
          const r = await api('scanPages', { batchId: b.id, colour, category, intoDocId: intoDoc ? st.docId : undefined, ocr: !app.personal.scanner?.noOcrDefault });
          st.docId = r.docId; st.page = intoDoc ? (curDoc()?.pages.length || 0) : 0;
          reloadBatch(r.batch);
          toast('Demo skener: sintetična stran je dodana (strojni skener ni povezan).');
        } catch (e) { app.error(e); }
      },
      async importFiles({ colour = false, ocr = true, perFile = false, askType = false, intoDoc = false }) {
        let category = 'racun';
        if (askType) {
          category = await dialog({ title: 'Uvozi dokumente kot', width: 300, body: `<div class="whitebox" style="padding:4px">${CATEGORIES.map((c, i) => `<label class="chk" style="display:flex;padding:2px"><input type="radio" name="c" value="${c.id}" ${i === 2 ? 'checked' : ''}> ${c.label}</label>`).join('')}</div>`,
            buttons: [{ label: 'V redu', primary: true, action: (d) => d.q('input:checked').value }, { label: 'Prekliči', value: null }] });
          if (!category) return;
        }
        const files = await pickFiles({ multiple: true, accept: 'image/*,application/pdf,.svg' });
        if (!files.length) return;
        try {
          const b = await needBatch();
          const ids = [];
          for (const f of files) ids.push((await upload(f)).id);
          const r = await api('importFiles', { batchId: b.id, blobIds: ids, ocr: ocr && !(app.personal.scanner?.noOcrDefault && !askType), perFile, category, colour, intoDocId: intoDoc ? st.docId : undefined });
          if (r.created?.length) st.docId = r.created[0];
          st.page = 0;
          reloadBatch(r.batch);
          toast(`Uvoženih datotek: ${files.length}. Izvirne datoteke so ohranjene nespremenjene.`);
        } catch (e) { app.error(e); }
      },
      async attachPrev() { try { const r = await api('attachToPrevious', { batchId: batch.id, docId: st.docId }); st.docId = r.docId; reloadBatch(r.batch); } catch (e) { app.error(e); } },
      async del() {
        const d = curDoc();
        if (!d) { if (batch && !batch.docs.length && await confirmBox('Izbrišem prazen paket?')) { await api('deleteIntake', { batchId: batch.id }); st.batchId = null; load(); } return; }
        if (!await confirmBox('Izbrišem izbrani dokument iz paketa?')) return;
        try { const r = await api('deleteIntake', { batchId: batch.id, docId: d.id }); st.docId = null; reloadBatch(r.batch); } catch (e) { app.error(e); }
      },
      exportImages() { const d = curDoc(); if (!d) return; if (isStandalone()) return downloadBlob(d.pages[0]?.blobId); d.pages.forEach((p, i) => setTimeout(() => { const a = document.createElement('a'); a.href = `${blobUrl(p.blobId)}?download=1`; a.download = p.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 300)); },
      async teach() {
        const d = curDoc();
        const name = await promptBox('Ime predloge:', `Predloga: ${d.sender || ''}`, { title: 'Uči predlogo' });
        if (!name) return;
        try { const r = await api('teachTemplate', { batchId: batch.id, docId: d.id, name }); app.scanTemplates = [...(app.scanTemplates || []), r.template]; toast('Predloga je shranjena. Uporabi se pri prepoznavi (F10) za istega pošiljatelja.'); reloadBatch(r.batch); } catch (e) { app.error(e); }
      },
      async resetFields() { try { const r = await api('resetFields', { batchId: batch.id, docId: st.docId }); reloadBatch(r.batch); toast('Polja so ponastavljena na prepoznane vrednosti.'); } catch (e) { app.error(e); } },
      async recognize() { try { const b = await needBatch(); const r = await api('recognizeTemplates', { batchId: b.id }); reloadBatch(r.batch); toast(`Prepoznane predloge: ${r.recognized} dokumentov.`); } catch (e) { app.error(e); } },
      async send(mode, open = false) {
        if (!batch?.docs.length) return alertBox('V paketu ni dokumentov za pošiljanje.');
        const d = curDoc();
        let targets = [];
        let docIds = batch.docs.map((x) => x.id);
        if (mode !== 'myoffice') {
          const res = await pickHolders(app, batch.companyId, { title: mode === 'direct' ? 'Pošlji neposredno uporabniku' : 'Pošlji uporabnikom', multi: mode !== 'direct', usersOnly: mode === 'direct',
            extraHtml: d && batch.docs.length > 1 ? `<div style="margin-top:6px"><label class="chk"><input type="radio" name="sc" value="all" checked> Vse dokumente v paketu (${batch.docs.length})</label>&nbsp;&nbsp;<label class="chk"><input type="radio" name="sc" value="one"> Samo izbrani dokument</label></div>` : '' });
          if (!res) return;
          targets = res.ids;
          if (res.scope === 'one') docIds = [d.id];
        }
        try {
          const r = await api('dispatchIntake', { batchId: batch.id, docIds, targets, mode });
          toast(`Ustvarjenih dokumentov: ${r.created.length}. Vpisani so v dnevnik skenirnice.`);
          if (open) for (const id of r.created) app.openDocument({ id, subject: '' });
          st.docId = null;
          load();
        } catch (e) { app.error(e); }
      },
      async comment() {
        const d = curDoc();
        if (!d) return;
        const c = await promptBox('Komentar:', d.comment, { title: 'Komentar', multiline: true });
        if (c == null) return;
        const r = await api('updateIntakeDoc', { batchId: batch.id, docId: d.id, patch: { comment: c } });
        reloadBatch(r.batch);
      },
      fit(f) { st.fit = f; renderView(); },
      async report(kind) {
        if (!batch) return;
        const r = await api('batchReport', { batchId: batch.id });
        if (kind === 'csv') {
          const lines = [['Zap. št.', 'Id', 'Smer', 'Tip', 'Pošiljatelj', 'Predmet', 'Datum prejema', 'Strani', 'Komentar'].join(';'),
            ...r.rows.map((x) => [x.n, x.id, directionLabel(x.direction), x.category, x.sender, x.subject, x.receivedDate ? fmtDate(x.receivedDate) : '', x.pages, x.comment].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))];
          download(`porocilo-paket-${batch.id}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
        } else printHtml(`<h3>Poročilo paketa: ${esc(r.group)} · ${esc(fmtDateTime(r.createdAt))}</h3><table border="1" cellspacing="0" cellpadding="3" style="font:11px Arial;border-collapse:collapse"><tr><th>#</th><th>Smer</th><th>Tip</th><th>Pošiljatelj</th><th>Predmet</th><th>Datum prejema</th><th>Strani</th></tr>${r.rows.map((x) => `<tr><td>${x.n}</td><td>${esc(directionLabel(x.direction))}</td><td>${esc(x.category)}</td><td>${esc(x.sender)}</td><td>${esc(x.subject)}</td><td>${esc(x.receivedDate ? fmtDate(x.receivedDate) : '')}</td><td>${x.pages}</td></tr>`).join('')}</table>`);
      },
      labels() {
        if (!batch?.docs.length) return;
        printHtml(batch.docs.map((d, i) => `<div style="display:inline-block;width:62mm;height:28mm;border:1px dashed #999;margin:3mm;padding:2mm;font:10px Arial;vertical-align:top">
          <b>${esc(app.me.companies.find((c) => c.id === batch.companyId)?.name || '')}</b><br>${esc(categoryLabel(d.category))} · ${esc(d.sender || 'Neznan')}<br>
          <div style="font:700 15px monospace;letter-spacing:2px;margin-top:2mm;background:repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 3px,#000 3px 4px,#fff 4px 7px);height:9mm"></div>${esc(d.id.toUpperCase())}</div>`).join(''));
      },
      fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else content.requestFullscreen?.(); },
    };

    function processMenu() {
      const d = curDoc();
      const idx = batch?.docs.findIndex((x) => x.id === st.docId) ?? -1;
      return [
        { label: 'Nov paket', icon: 'image', action: () => cmd.newBatch() },
        { label: 'Nov dokument brez slike', action: () => cmd.newNoImage() },
        { sep: true },
        { label: 'Priključi prejšnjemu dokumentu', disabled: !(idx > 0), action: () => cmd.attachPrev() },
        { label: 'Zbriši', icon: 'minusGreen', shortcut: 'Del', action: () => cmd.del() },
        { sep: true },
        { label: 'Skeniraj', icon: 'scan', items: () => [{ label: 'Skeniraj', bold: true, action: () => cmd.scan() }, { label: 'Skeniraj barvno', action: () => cmd.scan({ colour: true }) }] },
        { label: 'Skeniraj kot', items: () => CATEGORIES.map((c) => ({ label: c.label, action: () => cmd.scan({ category: c.id }) })) },
        { label: 'Skeniraj strani v dokument', icon: 'scan', disabled: !d, items: () => [{ label: 'Skeniraj', bold: true, action: () => cmd.scan({ intoDoc: true }) }, { label: 'Skeniraj barvno', action: () => cmd.scan({ intoDoc: true, colour: true }) }] },
        { sep: true },
        { label: 'Uvozi', icon: 'import', items: () => [{ label: 'Uvozi', bold: true, action: () => cmd.importFiles({}) }, { label: 'Uvozi barvno', action: () => cmd.importFiles({ colour: true }) }] },
        { label: 'Uvozi kot', icon: 'import', items: () => [
          { label: 'Uvozi dokumente kot', action: () => cmd.importFiles({ askType: true }) },
          { label: 'Uvozi dokumente kot brez OCR', action: () => cmd.importFiles({ askType: true, ocr: false }) },
          { sep: true },
          { label: 'Uvozi dokumente kot (vsaka datoteka kot dokument)', action: () => cmd.importFiles({ askType: true, perFile: true }) },
          { label: 'Uvozi dokumente kot brez OCR (vsaka datoteka kot dokument)', action: () => cmd.importFiles({ askType: true, perFile: true, ocr: false }) },
        ] },
        { label: 'Uvozi strani v dokument', icon: 'import', disabled: !d, action: () => cmd.importFiles({ intoDoc: true }) },
        { label: 'Izvozi izbrane slike', icon: 'export', disabled: !d?.pages.length, action: () => cmd.exportImages() },
        { sep: true },
        { label: 'Uči predlogo', icon: 'bulb', disabled: !d, action: () => cmd.teach() },
        { label: 'Ponastavi polja', icon: 'reset', disabled: !d, action: () => cmd.resetFields() },
        { sep: true },
        ...sendItems(),
        { sep: true },
        { label: 'Natisni poročilo', disabled: !batch, action: () => cmd.report('print') },
        { label: 'Izvozi poročilo', disabled: !batch, action: () => cmd.report('csv') },
        { sep: true },
        { label: 'Natisni nalepke', icon: 'printer', disabled: !batch?.docs.length, action: () => cmd.labels() },
        { label: 'Prepoznaj predloge dokumentov', shortcut: 'F10', action: () => cmd.recognize() },
        { label: 'Cel zaslon', action: () => cmd.fullscreen() },
        { label: 'Komentar', icon: 'comment', disabled: !d, action: () => cmd.comment() },
      ];
    }

    function keydown(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.target.matches('input, textarea, select')) return false;
      if (e.key === 'F4' && ctrl && e.shiftKey) cmd.send('myoffice');
      else if (e.key === 'F4' && ctrl) cmd.send('direct');
      else if (e.key === 'F4' && e.shiftKey) cmd.send('myoffice', true);
      else if (e.key === 'F4') cmd.send('users');
      else if (e.key === 'F10') cmd.recognize();
      else if (e.key === 'Delete') cmd.del();
      else return false;
      return true;
    }

    api('listBatches', { companyId: app.companyId }).then((r) => { app.scanTemplates = r.templates; }).catch(() => {});
    return { refresh: load, processMenu, keydown, selection: () => [], cmd };
  }

  // ================================================================ PAKETI
  function mountPackages() {
    pane.style.width = '250px';
    pane.innerHTML = `<div style="background:#7d8fa3;color:#fff;font-weight:700;padding:2px 6px;text-align:center">GLOBALNA SKENIRNICA</div><div class="tree" style="flex:1"></div>
      <div class="pane-foot" style="display:flex;justify-content:center"><span class="tb tpl">Predloge</span></div>`;
    content.innerHTML = `<div class="findbar"><span>Najdi</span><input class="win find" value="${esc(st.find)}"></div><div class="batch-cards" style="flex:1;overflow:auto"></div>`;
    let batches = [];
    const grouped = () => {
      const q = st.find.trim().toLocaleLowerCase('sl');
      const m = new Map();
      for (const b of batches) {
        const docs = b.docs.filter((d) => !q || `${d.sender} ${categoryLabel(d.category)} ${b.group} ${fmtDateTime(b.createdAt)}`.toLocaleLowerCase('sl').includes(q));
        if (q && !docs.length) continue;
        if (!m.has(b.group)) m.set(b.group, []);
        m.get(b.group).push({ ...b, shown: docs });
      }
      return m;
    };
    function render() {
      const g = grouped();
      pane.querySelector('.tree').innerHTML = [...g].map(([name, list]) => `<div class="node head" data-g="${esc(name)}"><span class="chev" data-tg="${esc(name)}">${st.collapsed.has(name) ? '›' : '⌄'}</span><span class="lbl" style="font-size:11.5px" title="${esc(name)}">${esc(name)}</span></div>
        ${st.collapsed.has(name) ? '' : list.map((b) => `<div class="node" data-b="${b.id}" style="padding-left:26px"><span class="ficon">${icon('image', 13)}</span><span class="lbl">${esc(fmtDateTime(b.createdAt))}</span></div>`).join('')}`).join('') || '<div class="grid-empty">Ni čakajočih paketov.</div>';
      const cards = content.querySelector('.batch-cards');
      cards.innerHTML = `<div class="bgroup" style="background:#7d8fa3;color:#fff">GLOBALNA SKENIRNICA</div>` + [...g].map(([name, list]) => `<div class="bgroup">${esc(name)}</div>` + list.map((b) => `<div class="bstamp" id="b-${b.id}">${esc(fmtDateTime(b.createdAt))}</div><div class="cards">${(b.shown.length ? b.shown : []).map((d) => `<div class="card" data-b="${b.id}" data-d="${d.id}" title="Dvoklik odpre dokument v Obdelavi">
          <div class="meta"><div>Smer: ${esc(directionLabel(d.direction))}<br>Tip: ${esc(categoryLabel(d.category))}<br>Pošiljatelj:<br>${esc(d.sender || 'Neznan')}</div><div>Datum prejema:<br>${esc(d.receivedDate ? fmtDateCompact(d.receivedDate) : '')}</div></div>
          ${d.pages.map((p, i) => `<div class="pg${i === 0 ? ' first' : ''}">${p.mime.startsWith('image/') ? `<img src="${blobUrl(p.blobId)}" alt="" loading="lazy">` : icon('pdf', 40)}</div>`).join('') || '<div class="pg" style="display:flex;align-items:center;justify-content:center;font-size:10px">Brez slike</div>'}</div>`).join('')}${b.shown.length ? '' : '<span class="demo-note" style="padding:4px">Prazen paket</span>'}</div>`).join('')).join('');
      const n = batches.reduce((s, b) => s + b.docs.length, 0);
      app.setListInfo({ shown: n, total: n, limited: false });
      app.setSelection([]);
    }
    async function load() {
      try { const r = await api('listBatches', { companyId: app.companyId }); batches = r.batches; app.scanTemplates = r.templates; render(); }
      catch (e) { content.innerHTML = `<div class="grid-empty">${esc(e.message)}</div>`; }
    }
    pane.querySelector('.tree').addEventListener('mousedown', (e) => {
      const tg = e.target.closest('[data-tg]');
      if (tg) { st.collapsed.has(tg.dataset.tg) ? st.collapsed.delete(tg.dataset.tg) : st.collapsed.add(tg.dataset.tg); render(); return; }
      const n = e.target.closest('[data-b]');
      if (n) { pane.querySelectorAll('.node.selected').forEach((x) => x.classList.remove('selected')); n.classList.add('selected'); document.getElementById(`b-${n.dataset.b}`)?.scrollIntoView({ block: 'start' }); }
    });
    content.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (!c) return; content.querySelectorAll('.card.sel').forEach((x) => x.classList.remove('sel')); c.classList.add('sel'); });
    content.addEventListener('dblclick', (e) => {
      const c = e.target.closest('.card');
      if (!c) return;
      st.batchId = c.dataset.b; st.docId = c.dataset.d; st.page = 0;
      app.scanView = 'process';
      document.querySelector(`.rail [data-v="process"]`)?.click();
    });
    content.querySelector('.find').addEventListener('input', (e) => { st.find = e.target.value; render(); });
    pane.querySelector('.tpl').addEventListener('click', () => templatesDialog());
    async function templatesDialog() {
      const list = app.scanTemplates || [];
      await dialog({ title: 'Predloge', width: 560, body: list.length ? `<table class="plain"><colgroup><col><col><col style="width:110px"></colgroup><thead><tr><th>Ime</th><th>Pošiljatelj</th><th>Privzeta polja</th></tr></thead>
        <tbody>${list.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.senderMatch)}</td><td title="${esc(Object.entries(t.defaults.fields).map(([k, v]) => `${k}: ${v}`).join(', '))}">${Object.keys(t.defaults.fields).length} polj</td></tr>`).join('')}</tbody></table>` : '<div class="demo-note">Ni predlog. Predlogo ustvarite v Obdelavi z ukazom Uči predlogo.</div>',
      buttons: [{ label: 'Zapri', primary: true }] });
    }
    return { refresh: load, selection: () => [] };
  }

  // ================================================================ DNEVNIK
  function mountLog() {
    pane.style.width = '250px';
    const c = st.logCrit;
    const companyOpts = app.me.companies.filter((x) => app.me.flags[x.id]?.scan);
    const dateCrit = (k, label) => `<div class="c"><div class="hd"><span class="l">${label}</span><span class="pm">${icon('plus', 12)}${icon('minus', 12)}</span></div>
      <div class="row"><select class="win op" data-k="${k}"><option value="eq">je enak</option><option value="lt">manj</option></select><span class="val"><input class="win v" data-k="${k}" value="${esc(c[k]?.value || '')}" placeholder="d. m. llll"></span><span class="ell" data-date="${k}">…</span></div></div>`;
    pane.innerHTML = `<div class="crit">${dateCrit('sentAt', 'Datum pošiljanja')}${dateCrit('receivedAt', 'Datum prejetja')}${dateCrit('createdAt', 'Datum nastanka')}
      <div class="c"><div class="hd"><span class="l">Pošiljatelj:</span></div><div class="row"><span class="val"><input class="win v" data-k="sender" value="${esc(c.sender || '')}"></span><span class="ell" data-partner="sender">…</span></div></div>
      <div class="c"><div class="hd"><span class="l">Prejemnik:</span></div><div class="row"><span class="val"><input class="win v" data-k="recipient" value="${esc(c.recipient || '')}"></span><span class="ell" data-partner="recipient">…</span></div></div>
      <div class="c"><div class="hd"><span class="l">Tip dokumenta</span></div><div class="row"><select class="win op" data-k="category"><option value="in">v</option><option value="notIn">ni v</option></select><span class="val"><select class="win v" data-k="category"><option value=""></option>${CATEGORIES.map((x) => `<option value="${x.id}">${x.label}</option>`).join('')}</select></span></div></div>
      <div class="c"><div class="hd"><span class="l">Smer</span></div><select class="win v" data-k="direction" style="width:100%"><option value=""></option>${['Prejeta pošta', 'Poslana pošta', 'Interna pošta'].map((x) => `<option ${x === c.direction ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="c"><div class="hd"><span class="l">Org. enota</span></div><select class="win v" data-k="companyId" style="width:100%">${companyOpts.map((x) => `<option value="${x.id}" ${x.id === (c.companyId || app.companyId) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
      <div class="crit-actions"><button class="tb clr">${icon('cross', 12)}Počisti</button><button class="tb go">${icon('zoomIn', 14)}Išči</button></div>`;
    content.innerHTML = '<div class="gridhost" style="flex:1;display:flex;min-height:0"></div><div class="graybar"><button class="tb add">' + icon('plus') + 'Dodaj ročni vnos</button><button class="tb del" disabled>' + icon('minus') + 'Zbriši</button><span style="flex:1"></span><button class="tb prn">' + icon('printer') + 'Natisni</button></div>';
    const T = (id, label, get, type = 'text', w = 100, header) => ({ id, label, header, get, type, w });
    const cols = [
      T('protocol', 'Protokol', (r) => r.protocol, 'text', 80), T('author', 'Avtor', (r) => r.author, 'text', 100), T('source', 'Vir', (r) => r.source, 'text', 100),
      T('forwarded', 'Posredovano', (r) => r.forwarded, 'text', 100), T('sif', 'Šif', (r) => r.sif, 'text', 22), T('batch', 'Id paketa', (r) => r.batchId, 'text', 200),
      T('doc', 'Id dokumenta', (r) => r.docId, 'text', 200), T('subject', 'Predmet', (r) => r.subject, 'text', 100), T('cat', 'Tip dokumenta', (r) => categoryLabel(r.category), 'text', 100),
      T('rec', 'Prejemnik', (r) => r.recipient, 'text', 200), T('snd', 'Pošiljatelj', (r) => r.sender, 'text', 200), T('cr', 'Datum nastanka', (r) => r.createdAt, 'datetime', 140),
      T('sent', 'Datum pošiljanja', (r) => r.sentAt, 'datetime', 140), T('recv', 'Datum prejetja', (r) => r.receivedAt, 'datetime', 140), T('seq', 'Zap. št', (r) => r.seq, 'text', 40),
    ];
    const grid = new Grid(content.querySelector('.gridhost'), {
      columns: cols, rowKey: (r) => r.id, sort: { id: 'seq', dir: 'desc' },
      onSelect: (rows) => { content.querySelector('.del').disabled = !(rows.length === 1 && rows[0].manual); app.setSelection(rows); },
      onOpen: (r) => { if (r.docId) app.openDocument({ id: r.docId, subject: r.subject }); },
    });
    app.grid = grid;
    function readCrit() {
      for (const i of pane.querySelectorAll('[data-k]')) {
        const k = i.dataset.k;
        if (['sentAt', 'receivedAt', 'createdAt', 'category'].includes(k)) {
          c[k] ||= {};
          if (i.classList.contains('op')) c[k].op = i.value; else c[k].value = i.value;
        } else c[k] = i.value;
      }
    }
    async function load() {
      readCrit();
      try {
        const r = await api('searchIntakeLog', { criteria: { ...c, companyId: c.companyId || app.companyId } });
        grid.setRows(r.rows);
        app.setListInfo({ shown: r.rows.length, total: r.rows.length, limited: false });
        app.setSelection(grid.selectedRows());
      } catch (e) { app.error(e); }
    }
    pane.querySelector('.go').addEventListener('click', load);
    pane.querySelector('.clr').addEventListener('click', () => { st.logCrit = { direction: '' }; document.querySelector('.rail [data-v="log"]')?.click(); });
    pane.addEventListener('click', async (e) => {
      const dk = e.target.closest('[data-date]')?.dataset.date;
      if (dk) {
        const v = await dialog({ title: 'Izberi datum', width: 260, help: false, body: '<input type="date" class="win dt" style="width:100%;height:24px">', buttons: [{ label: 'V redu', primary: true, action: (d) => d.q('.dt').value }, { label: 'Prekliči', value: null }] });
        if (v) pane.querySelector(`input[data-k="${dk}"]`).value = fmtDate(`${v}T00:00:00`);
      }
      const pk = e.target.closest('[data-partner]')?.dataset.partner;
      if (pk) {
        const { pickPartner } = await import('./settings.js');
        const p = await pickPartner(app);
        if (p) pane.querySelector(`input[data-k="${pk}"]`).value = p.shortName;
      }
    });
    content.querySelector('.add').addEventListener('click', async () => {
      const res = await dialog({ title: 'Ročni vnos v dnevnik', width: 440,
        body: `<div class="form"><label class="r">Predmet:</label><input class="win su" autofocus><label class="r">Pošiljatelj:</label><input class="win se"><label class="r">Prejemnik:</label><input class="win re">
          <label class="r">Tip dokumenta:</label><select class="win ca">${CATEGORIES.map((x) => `<option value="${x.id}" ${x.id === 'racun' ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
          <label class="r">Smer:</label><select class="win di"><option>Prejeta pošta</option><option>Poslana pošta</option><option>Interna pošta</option></select>
          <label class="r">Datum prejetja:</label><input class="win dr" value="${fmtDate(new Date())}"></div>`,
        buttons: [{ label: 'V redu', icon: 'check', primary: true, action: async (d) => {
          const dr = parseDate(d.q('.dr').value);
          if (d.q('.dr').value && !dr) throw new Error('Neveljaven datum.');
          return api('addLogEntry', { entry: { subject: d.q('.su').value, sender: d.q('.se').value, recipient: d.q('.re').value, category: d.q('.ca').value, direction: d.q('.di').value, receivedAt: dr ? isoLocal(dr) : null, companyId: c.companyId || (app.companyId === 'all' ? undefined : app.companyId) } });
        } }, { label: 'Prekliči', icon: 'cross', value: null }] });
      if (res) load();
    });
    content.querySelector('.del').addEventListener('click', async () => {
      const [r] = grid.selectedRows();
      if (!r || !await confirmBox('Izbrišem ročni vnos?')) return;
      try { await api('deleteLogEntry', { id: r.id }); load(); } catch (e) { app.error(e); }
    });
    content.querySelector('.prn').addEventListener('click', () => printHtml(grid.toPrintHtml('Dnevnik skenirnice')));
    return { refresh: load, selection: () => grid.selectedRows() };
  }
}

function printHtml(html) {
  if (!canPrint()) return noPrint();
  const area = el(`<div class="print-area">${html}</div>`);
  document.body.appendChild(area);
  window.print();
  area.remove();
}
