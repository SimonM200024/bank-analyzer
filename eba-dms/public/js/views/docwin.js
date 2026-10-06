// Document window: menus, toolbar, header, thumbnails, Slika/Podatki canvas and
// six independent right-side panels.
import { api, esc, el, toast, download, pickFiles, upload, blobUrl, $ } from '../ui/core.js';
import { MenuBar, openMenu, menuKeydown, menusOpen, contextMenu } from '../ui/menu.js';
import { dialog, alertBox, confirmBox, promptBox, dialogsOpen } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import {
  fmtDatePadded, fmtStamp, fmtAmount, fmtDateCompact, fmtDateTime, parseAmount, parseDate, isoLocal, selectedLabel,
} from '/core/format.js';
import { SOURCES, EVENT_ACTIONS, EXTRA_EVENT_ACTIONS, EXTERNAL_STATUSES, coverFields, categoryLabel } from '/core/schema.js';
import { act } from '../actions.js';
import { pickHolders, classifyDialog, tagDialog, infoResult } from '../dialogs.js';

const TABS = [
  ['sigs', 'Podpisi', 'sigs', 'Podpisniki dokumenta'],
  ['trail', 'Sledi', 'trail', 'Dogodki na dokumentu'],
  ['cover', 'Spremni list', 'cover', 'Spremni list'],
  ['links', 'Povezave', 'links', 'Zadeva in povezave'],
  ['access', 'Dostop', 'people', 'Uporabniki in dostopi'],
  ['versions', 'Verzije', 'versions', 'Verzije dokumenta'],
];
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export async function mountDocWindow(app, docId, { channel }) {
  const W = {
    id: docId, doc: null, tab: store.get('eba-doc-tab', 'cover'), center: 'image', page: 0, zoom: 'auto', ruler: false,
    thumbs: true, details: app.personal.view?.details !== false, scope: 'main', dirty: false, linkedPages: [], highlight: null,
    evFilter: { action: '', user: '' }, linkFilter: '', linkSort: 'createdAt', versionSel: null,
  };
  document.body.innerHTML = `<div class="docwin app">
    <div class="menubar"></div>
    <div class="toolbar"></div>
    <div class="hdrs"></div>
    <div class="main"><div class="thumbs"></div><div class="center"></div><div class="side"></div><div class="rtabs"></div></div>
    <div class="statusbar"><span class="sel"></span><span class="right"><span class="kbd caps">CAPS</span><span class="kbd num">NUM</span><span class="kbd scrl">SCRL</span></span></div></div>`;
  const root = $('.docwin');
  const post = (m) => channel?.postMessage(m);

  async function load(open = false) {
    try {
      W.doc = await api('getDocument', { id: W.id, open });
    } catch (e) {
      root.innerHTML = `<div class="msg" style="padding:20px">${icon('cross', 24)}<div>${esc(e.message)}</div></div>`;
      document.title = 'EBA DMS';
      return false;
    }
    W.dirty = false;
    document.title = W.doc.title;
    post({ type: 'windowTitle', id: W.id, title: W.doc.title });
    if (open) post({ type: 'docChanged', ids: [W.id] });
    W.linkedPages = [];
    if (W.scope !== 'main') await loadLinkedPages();
    renderAll();
    return true;
  }

  async function loadLinkedPages() {
    const out = [];
    for (const l of W.doc.links) {
      if (W.scope === 'embedded' && l.kind !== 'embedded') continue;
      try {
        const d = await api('getDocument', { id: l.docId });
        d.pages.forEach((p, i) => out.push({ ...p, label: `${d.subject.slice(0, 18)} – ${i + 1}`, foreign: d.id }));
      } catch { /* no access */ }
    }
    W.linkedPages = out;
  }

  const pages = () => {
    const own = W.scope === 'embedded' ? [] : [...W.doc.pages, ...W.doc.attachmentsList.map((a, i) => ({ ...a, label: a.name || `Priponka ${i + 1}`, attachment: true }))];
    return [...own, ...W.linkedPages];
  };
  const allowed = () => W.doc.allowed;

  // ----------------------------------------------------------- render
  function renderAll() {
    renderMenus(); renderToolbar(); renderHeader(); renderThumbs(); renderCenter(); renderSide(); renderTabs();
    root.querySelector('.statusbar .sel').textContent = `${W.doc.companyName} · ${W.doc.claimedBy ? `Prevzel: ${W.doc.claimedBy}` : W.doc.holderName ? `V pisarni: ${W.doc.holderName}` : ''}`;
  }

  function renderMenus() {
    const a = allowed();
    const curPage = pages()[W.page];
    const isPdf = curPage?.mime === 'application/pdf';
    const menus = [
      { label: 'Dokument', mnemonic: 'D', items: () => [
        { label: 'Shrani', icon: 'save', shortcut: 'Ctrl+S', disabled: !(W.dirty && a.save), action: save },
        { label: 'Pošlji po elektronski pošti', action: () => act.mail(app, [W.doc], 'email') },
        { label: 'Pošlji sporočilo', action: () => act.mail(app, [W.doc], 'message') },
        { label: 'Izvoz', icon: 'export', action: () => act.exportDocs(appProxy, [W.doc]) },
        { label: 'Izvozi datoteko z bližnjico', action: () => act.exportDocs(appProxy, [W.doc], true) },
        { label: 'PDF', icon: 'pdf', disabled: !isPdf, title: isPdf ? '' : 'Trenutna stran ni PDF.', items: () => [
          { label: 'Odpri PDF v novem oknu', action: () => window.open(blobUrl(curPage.blobId), '_blank') },
          { label: 'Shrani PDF', action: () => { location.href = `${blobUrl(curPage.blobId)}?download=1`; } },
        ] },
        { label: 'Ogled podatkov', icon: 'columns', action: () => { W.center = 'data'; renderCenter(); } },
        { sep: true },
        { label: 'Natisni', icon: 'printer', shortcut: 'Ctrl+P', disabled: !a.print, action: printDoc },
        { sep: true },
        { label: 'Izhod', icon: 'exit', shortcut: 'Ctrl+W', action: closeWindow },
      ] },
      { label: 'Urejanje', mnemonic: 'U', items: () => [
        { label: 'Kopiraj tekst na dokumentu', action: copyText },
        { label: 'Kopiraj povezavo na dokument', shortcut: 'Ctrl+Shift+C', action: () => act.copyLink(app, [W.doc]) },
        { label: 'Kopiraj priponko', shortcut: 'Ctrl+C', disabled: !curPage, action: copyAttachment },
        { label: 'Prilepi priponko', shortcut: 'Ctrl+V', disabled: !(a.attach && store.get('eba-attach-clip', null)), action: pasteAttachment },
      ] },
      { label: 'Pogled', mnemonic: 'G', items: () => [
        { label: 'Cel zaslon', icon: 'fullscreen', shortcut: 'Ctrl+F', action: fullscreen },
        { label: 'Podrobnosti o dokumentu', shortcut: 'Ctrl+D', checked: W.details, action: toggleDetails },
        { sep: true },
        { label: 'Prikaži sličice', checked: W.thumbs, action: () => { W.thumbs = !W.thumbs; renderThumbs(); } },
        { label: 'Višina strani', icon: 'fitH', action: () => setZoom('height') },
        { label: 'Širina strani', icon: 'fitW', shortcut: 'Ctrl+0', action: () => setZoom('width') },
        { label: 'Povečaj', icon: 'zoomIn', shortcut: 'Ctrl++', action: () => zoomBy(1.2) },
        { label: 'Pomanjšaj', icon: 'zoomOut', shortcut: 'Ctrl+-', action: () => zoomBy(1 / 1.2) },
        { sep: true },
        { label: 'Ravnilo', icon: 'ruler', shortcut: 'Ctrl+R', checked: W.ruler, action: () => { W.ruler = !W.ruler; renderCenter(); } },
      ] },
      { label: 'Akcije', mnemonic: 'K', items: () => actionsMenu() },
      { label: 'Okno', mnemonic: 'K', items: () => [
        { label: 'EBA DMS (glavno okno)', action: () => { post({ type: 'focusMain' }); try { window.opener?.focus(); } catch { /* ignore */ } } },
        { label: document.title, checked: true, action: () => window.focus() },
      ] },
    ];
    const bar = new MenuBar(root.querySelector('.menubar'), menus, { brand: `<span style="display:flex;gap:2px">${['navFirst', 'navPrev', 'navNext', 'navLast'].map((n) => `<span class="tb nav" data-nav="${n}" title="${{ navFirst: 'Prvi dokument', navPrev: 'Prejšnji dokument', navNext: 'Naslednji dokument', navLast: 'Zadnji dokument' }[n]}" style="height:18px;padding:0 2px">${icon(n, 12)}</span>`).join('')}</span>` });
    W.menubar = bar;
    root.querySelector('.menubar').addEventListener('click', (e) => { const n = e.target.closest('[data-nav]'); if (n) navigate(n.dataset.nav); });
  }

  function actionsMenu() {
    const a = allowed();
    const d = W.doc;
    return [
      { label: 'V odpremo', shortcut: 'Ctrl+O', disabled: !a.toDispatch, action: () => docAct(() => act.dispatch(appProxy, [d], 'toDispatch')) },
      { sep: true },
      { label: 'Podpiši', icon: 'padlock', disabled: !a.sign, action: () => docAct(() => act.sign(appProxy, [d])) },
      { label: 'Parafiraj', icon: 'pen', disabled: !a.initialInWindow, items: () => [{ label: 'Potrdi', bold: true, action: () => docAct(() => act.initial(appProxy, [d])) }] },
      { label: 'Pripni', icon: 'attach', disabled: !a.attach, items: () => attachMenu() },
      { sep: true },
      { label: 'Prevzemi', icon: 'check', disabled: !a.claim, action: () => docAct(() => act.claim(appProxy, [d])) },
      { label: 'Zavrni', disabled: !a.rejectInWindow, action: () => docAct(() => act.reject(appProxy, [d])) },
      { label: 'Klasificiraj', icon: 'cube', shortcut: 'Ctrl+K', disabled: !a.classify, action: () => docAct(() => act.classify(appProxy, [{ ...d, classificationCode: d.classificationCode }])) },
      { label: 'Spreminjanje dokumenta', disabled: !a.modify, action: modifyDocument },
      { label: 'Posreduj', icon: 'forward', disabled: !a.forwardInWindow, action: () => docAct(() => act.forward(appProxy, [d])) },
      { label: 'Zunanji status', disabled: !a.extStatus, items: () => EXTERNAL_STATUSES.map((s) => ({ label: `${s.code} - ${s.label}`, checked: d.externalStatus === s.code, action: () => setExt(s.code) })) },
      { sep: true },
      { label: 'Uredi predlogo za spremni list', disabled: !a.editTemplate, title: a.editTemplate ? '' : 'Zahteva skrbniške pravice.', action: editTemplate },
      { label: 'Dodaj oznako', icon: 'tag', disabled: !a.tag, action: () => docAct(() => act.addTag(appProxy, [d])) },
      { label: 'Odstrani oznako', disabled: !(a.tag && d.tags.length), action: () => docAct(() => act.removeTag(appProxy, [d])) },
      { label: 'Dodeli dostop', icon: 'people', disabled: !a.grant, action: () => docAct(() => act.grant(appProxy, [d])) },
    ];
  }

  function attachMenu() {
    return [
      { label: 'Datoteko ...', action: attachFile },
      { label: 'Dokument iz odložišča (vloži)', disabled: !app.clipboard.filter((x) => x !== W.id).length, action: async () => {
        await docAct(async () => { const r = await api('linkDocuments', { id: W.id, targetIds: app.clipboard, kind: 'embedded' }); toast(`Vloženih dokumentov: ${r.linked}`); return r; });
      } },
    ];
  }

  // appProxy routes act.* refreshes to this window
  const appProxy = Object.assign(Object.create(app), {
    changed: (ids) => { post({ type: 'docChanged', ids }); load(false); },
    personal: app.personal,
  });
  async function docAct(fn) {
    if (W.dirty && !(await confirmDiscard())) return;
    return fn();
  }

  function renderToolbar() {
    const a = allowed();
    const d = W.doc;
    const tb = root.querySelector('.toolbar');
    const extSel = d.category === 'racun' && d.direction !== 'out';
    tb.innerHTML = `<button class="tb" data-a="save" ${W.dirty && a.save ? '' : 'disabled'}>${icon('save')}Shrani</button>
      <button class="tb" data-a="print" ${a.print ? '' : 'disabled'}>${icon('printer')}Natisni</button>
      <span class="tsep"></span>
      <button class="tb" data-a="attach" ${a.attach ? '' : 'disabled'}>${icon('attach')}Pripni<span class="dd">▼</span></button>
      <button class="tb" data-a="sign" ${a.sign ? '' : 'disabled'}>${icon('padlock')}Podpiši<span class="dd">▼</span></button>
      <button class="tb" data-a="initial" ${a.initialInWindow ? '' : 'disabled'}>${icon(a.initialInWindow ? 'pen' : 'penGrey')}Parafiraj<span class="dd">▼</span></button>
      <button class="tb" data-a="claim" ${a.claim ? '' : 'disabled'}>${icon('check')}Prevzemi</button>
      ${extSel ? `<select class="win ext" style="width:110px" ${a.extStatus ? '' : 'disabled'}>${EXTERNAL_STATUSES.map((s) => `<option value="${s.code}" ${s.code === d.externalStatus ? 'selected' : ''}>${s.code} - ${esc(s.label)}</option>`).join('')}</select>` : '<select class="win" style="width:110px" disabled><option></option></select>'}
      <span class="tsep"></span>
      <button class="tb" data-a="forward" ${a.forwardInWindow ? '' : 'disabled'}>${icon('forward')}Posreduj</button>
      <button class="tb" data-a="actions" ${W.doc.claimedById === app.me.user.id ? '' : 'disabled'}>${icon('actions')}Akcije<span class="dd">▼</span></button>
      <select class="win" style="width:120px" disabled title="Namen tega polja v zajemu ni bil ugotovljen; v repliki ni aktivno."><option></option></select>
      <span class="tsep"></span>
      <button class="tb" data-a="pantheon" ${a.pantheon ? '' : 'disabled'}>${icon('pantheon')}Prenesi v Pantheon</button>
      <button class="tb" data-a="pantheonLink" ${a.pantheon ? '' : 'disabled'}>${icon('pantheon')}Ročno poveži s Pantheon</button>`;
    tb.onclick = (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect();
      const d2 = W.doc;
      switch (b.dataset.a) {
        case 'save': save(); break;
        case 'print': printDoc(); break;
        case 'attach': openMenu(attachMenu(), r.left, r.bottom); break;
        case 'sign': openMenu([{ label: 'Podpiši (demo podpis)', bold: true, action: () => docAct(() => act.sign(appProxy, [d2])) }], r.left, r.bottom); break;
        case 'initial': openMenu([{ label: 'Potrdi', bold: true, action: () => docAct(() => act.initial(appProxy, [d2])) }], r.left, r.bottom); break;
        case 'claim': docAct(() => act.claim(appProxy, [d2])); break;
        case 'forward': docAct(() => act.forward(appProxy, [d2])); break;
        case 'actions': openMenu(actionsMenu(), r.left, r.bottom); break;
        case 'pantheon': docAct(() => act.pantheonTransfer(appProxy, [d2])); break;
        case 'pantheonLink': pantheonLink(); break;
        default:
      }
    };
    tb.querySelector('select.ext')?.addEventListener('change', (e) => setExt(+e.target.value));
  }

  function renderHeader() {
    const d = W.doc;
    const editable = allowed().save;
    const h = root.querySelector('.hdrs');
    h.innerHTML = `<span class="lab">Pošiljatelj:</span><input class="win hs" value="${esc(d.sender)}" ${editable ? '' : 'readonly'}>
      <span style="display:flex;gap:2px"><select class="win" disabled style="width:110px">${SOURCES.map((s) => `<option ${s === d.source ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></span>
      <span style="display:flex;gap:2px;align-items:center"><input class="win" value="${esc(d.filename)}" readonly style="width:${Math.min(900, Math.max(240, innerWidth * 0.33))}px"><button class="btn fn" style="min-width:22px;height:20px;padding:0" title="Prenesi izvorno datoteko">…</button></span>
      <span class="lab">Predmet:</span><input class="win hp" value="${esc(d.subject)}" ${editable ? '' : 'readonly'} style="grid-column: span 1">
      <span class="lab" style="grid-column: 3">Klas. št.:</span><input class="win" readonly value="${esc(d.classification || '')}" title="${esc(d.classification || '')}">`;
    h.querySelector('.hs').addEventListener('input', markDirty);
    h.querySelector('.hp').addEventListener('input', markDirty);
    h.querySelector('.fn').addEventListener('click', () => { const p = W.doc.pages[0]; if (p) location.href = `${blobUrl(p.blobId)}?download=1`; });
  }

  function renderThumbs() {
    const t = root.querySelector('.thumbs');
    t.classList.toggle('hidden', !W.thumbs);
    t.innerHTML = `<div class="scope"><select class="win" style="width:100%"><option value="main">Glavni dokument</option><option value="all">Vloženi in povezani</option><option value="embedded">Samo vloženi</option></select></div>
      <div class="list">${pages().map((p, i) => `<div class="thumb${i === W.page ? ' sel' : ''}" data-i="${i}">${thumbImg(p)}</div><div class="thumbcap">${esc(p.attachment ? p.label : p.foreign ? p.label : p.label || `Stran ${i + 1}`)}</div>`).join('') || '<div class="demo-note">Brez slike</div>'}</div>`;
    t.querySelector('select').value = W.scope;
    t.querySelector('select').addEventListener('change', async (e) => { W.scope = e.target.value; W.page = 0; await loadLinkedPages(); renderThumbs(); renderCenter(); });
    t.querySelector('.list').addEventListener('click', (e) => { const th = e.target.closest('.thumb'); if (!th) return; W.page = +th.dataset.i; W.highlight = null; renderThumbs(); W.center = 'image'; renderCenter(); });
  }
  function thumbImg(p) {
    if (p.mime?.startsWith('image/')) return `<img src="${blobUrl(p.blobId)}" alt="" loading="lazy">`;
    if (p.mime === 'application/pdf') return `<div class="ph" style="display:flex;align-items:center;justify-content:center">${icon('pdf', 40)}</div>`;
    return `<div class="ph" style="display:flex;align-items:center;justify-content:center;font-size:10px">${esc((p.name || '').split('.').pop())}</div>`;
  }

  // ----------------------------------------------------------- center
  function renderCenter() {
    const c = root.querySelector('.center');
    c.innerHTML = `<div class="vtabs"><span class="t ${W.center === 'image' ? 'active' : ''}" data-c="image">${icon('image')}Slika</span><span class="t ${W.center === 'data' ? 'active' : ''}" data-c="data">${icon('ball')}Podatki</span></div>
      <div class="${W.center === 'image' ? 'canvas' : 'datav'}"></div>`;
    c.querySelector('.vtabs').addEventListener('click', (e) => { const t = e.target.closest('[data-c]'); if (t) { W.center = t.dataset.c; renderCenter(); } });
    if (W.center === 'image') renderImage(c.querySelector('.canvas')); else renderData(c.querySelector('.datav'));
  }

  function zoomFactor(canvas) {
    const base = 794; // A4 width at 96 dpi
    const fitW = (canvas.clientWidth - 28) / base;
    const fitH = (canvas.clientHeight - 24) / (base * 842 / 595);
    if (W.zoom === 'width') return fitW;
    if (W.zoom === 'height') return fitH;
    if (W.zoom === 'auto') return Math.max(0.3, Math.min(fitW, 1.6));
    return W.zoom;
  }
  function renderImage(canvas) {
    const p = pages()[W.page];
    if (!p) { canvas.innerHTML = '<div style="color:#fff;padding:20px">Brez slike</div>'; return; }
    const z = zoomFactor(canvas);
    const w = Math.round(794 * z), h = Math.round(794 * z * 842 / 595);
    const ruler = W.ruler ? '<div class="ruler-h"></div>' : '';
    if (p.mime === 'application/pdf') {
      canvas.innerHTML = `${ruler}<div class="page" style="width:${w}px;height:${Math.max(h, canvas.clientHeight - 30)}px"><iframe class="pdf" src="${blobUrl(p.blobId)}" title="PDF"></iframe></div>`;
    } else if (p.mime?.startsWith('image/')) {
      const hl = W.highlight && W.highlight.page === W.page ? `<div style="position:absolute;border:2px solid #e100c8;background:rgba(225,0,200,.08);left:${W.highlight.x / 595 * 100}%;top:${W.highlight.y / 842 * 100}%;width:${W.highlight.w / 595 * 100}%;height:${W.highlight.h / 842 * 100}%"></div>` : '';
      canvas.innerHTML = `${ruler}<div class="page" style="width:${w}px;${p.mime.includes('svg') ? `height:${h}px` : ''}"><img src="${blobUrl(p.blobId)}" alt="${esc(p.name)}" draggable="false">${hl}</div>`;
    } else {
      canvas.innerHTML = `${ruler}<div class="page" style="width:${w}px;padding:30px">${icon('attach', 32)}<p>${esc(p.name)}</p><p class="demo-note">Predogled za to vrsto datoteke ni na voljo.</p><button class="btn dl">Prenesi</button></div>`;
      canvas.querySelector('.dl').onclick = () => { location.href = `${blobUrl(p.blobId)}?download=1`; };
    }
    if (W.highlight) setTimeout(() => canvas.querySelector('.page > div[style*="e100c8"]')?.scrollIntoView({ block: 'center' }), 50);
  }
  function setZoom(z) { W.zoom = z; if (W.center !== 'image') W.center = 'image'; renderCenter(); }
  function zoomBy(f) { const canvas = root.querySelector('.canvas'); const cur = canvas ? zoomFactor(canvas) : 1; W.zoom = Math.max(0.2, Math.min(5, cur * f)); renderCenter(); }

  function renderData(host) {
    const d = W.doc;
    const page0 = d.pages[0];
    const isSvg = page0?.mime?.includes('svg');
    const coverRows = [['vrsta_dokumenta', 'Vrsta dokumenta'], ['valuta', 'Valuta']].filter(([k]) => d.category === 'racun' || k === 'valuta');
    const snip = (x) => {
      if (!x.region || !page0) return 'Brez slike';
      if (isSvg) return `<img src="${blobUrl(page0.blobId)}#svgView(viewBox(${x.region.x},${x.region.y},${x.region.w},${x.region.h}))" alt="${esc(x.label)}" style="width:${Math.round(x.region.w / x.region.h * 28)}px">`;
      if (page0.mime?.startsWith('image/')) return `<div style="width:76px;height:28px;background:url(${blobUrl(page0.blobId)}) no-repeat;background-size:${595 / x.region.w * 76}px auto;background-position:-${x.region.x / x.region.w * 76}px -${x.region.y / x.region.w * 76}px"></div>`;
      return 'Brez slike';
    };
    const val = (x) => {
      if (x.value == null || x.value === '') return '';
      if (x.type === 'date') return fmtDateCompact(x.value);
      if (x.type === 'amount') return fmtAmount(x.value);
      return String(x.value);
    };
    const rows = d.extracted.length || coverRows.length ? `
      ${d.extracted.map((x, i) => `<tr data-i="${i}"><td>${icon('ball', 14)}</td><td title="${esc(x.label)}">${esc(x.label)}</td><td>${esc(val(x))}</td><td class="snip" data-snip="${i}">${snip(x)}</td><td>${esc(x.pattern || '')}</td></tr>`).join('')}
      <tr class="grp"><td></td><td>Spremni list</td><td></td><td></td><td></td></tr>
      ${coverRows.map(([k, l]) => `<tr><td>${icon('ball', 14)}</td><td>${esc(l)}</td><td title="${esc(d.fields[k] ?? '')}">${esc(d.fields[k] ?? '')}</td><td class="snip">Brez slike</td><td></td></tr>`).join('')}` : '';
    host.innerHTML = `<table class="dataview"><colgroup><col style="width:22px"><col style="width:98px"><col style="width:100px"><col style="width:100px"><col style="width:100px"></colgroup>
      <thead><tr><th></th><th>Opis</th><th>Vrednost</th><th>Slika</th><th>Vzorec</th></tr></thead><tbody>${rows}</tbody></table>
      ${d.extracted.length ? '' : `<div class="demo-note" style="padding:6px">${d.pages.length ? 'Za ta dokument ni prepoznanih podatkov (demo OCR prepozna le demo strani).' : 'Dokument nima slike.'}</div>`}`;
    host.querySelector('tbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-i]');
      host.querySelectorAll('tr.sel').forEach((x) => x.classList.remove('sel'));
      if (!tr) return;
      tr.classList.add('sel');
      const x = d.extracted[+tr.dataset.i];
      if (e.target.closest('[data-snip]') && x.region) { W.highlight = { ...x.region, page: 0 }; W.page = 0; W.center = 'image'; renderThumbs(); renderCenter(); }
    });
  }

  // ----------------------------------------------------------- side panels
  function renderTabs() {
    const r = root.querySelector('.rtabs');
    r.innerHTML = TABS.map(([id, label, ic]) => `<div class="rt ${W.tab === id ? 'active' : ''}" data-t="${id}" title="${label}">${icon(ic, 14)}${label}</div>`).join('');
    r.onclick = (e) => { const t = e.target.closest('[data-t]'); if (!t) return; W.tab = t.dataset.t; store.set('eba-doc-tab', W.tab); if (!W.details) { W.details = true; } renderSide(); renderTabs(); };
  }
  function renderSide() {
    const s = root.querySelector('.side');
    s.classList.toggle('hidden', !W.details);
    const t = TABS.find((x) => x[0] === W.tab) || TABS[2];
    s.innerHTML = `<div class="sh">${esc(t[3])}</div><div class="sc"></div>`;
    const sc = s.querySelector('.sc');
    ({ sigs: panelSigs, trail: panelTrail, cover: panelCover, links: panelLinks, access: panelAccess, versions: panelVersions })[t[0]](sc);
  }

  function panelSigs(sc) {
    const d = W.doc;
    const sigs = d.signatures;
    sc.innerHTML = `<div class="sigs"><div class="top"><span>Status dokumenta:</span><span class="valid">${sigs.length ? 'Dokument je veljaven!' : ''}</span>
      <span>Število podpisov: ${sigs.filter((x) => x.kind === 'signed').length}</span><span></span></div>
      ${sigs.length ? '<div class="demo-note" style="margin:-4px 0 6px">Demo zapis: kriptografska veljavnost ni preverjena.</div>' : ''}
      ${sigs.map((x, i) => `<div class="sigcard"><h4>${esc(x.label)}</h4><span class="lk">${icon(x.kind === 'signed' ? 'lockGreen' : 'lockOlive', 16)}</span>
        Ime:<div class="v tall">${esc(x.name)}</div>Datum:<div class="v">${esc(fmtStamp(x.at))}</div><span class="lnk" data-i="${i}">Prikaži podrobnosti</span></div>`).join('')}</div>`;
    sc.querySelectorAll('[data-i]').forEach((a) => a.addEventListener('click', () => {
      const x = sigs[+a.dataset.i];
      alertBox(`${x.label}\n\nIme: ${x.name}\nDatum: ${fmtStamp(x.at)}\nVrsta: ${x.kind === 'signed' ? 'podpis' : 'parafa (potrditev)'}\n\nTo je demo zapis replike. Certifikat, časovni žig in kriptografsko preverjanje niso implementirani, zato zapis nima pravne veljave.`, { title: 'Podrobnosti podpisa' });
    }));
  }

  function panelTrail(sc) {
    const d = W.doc;
    const actions = [...EVENT_ACTIONS, ...EXTRA_EVENT_ACTIONS].sort((a, b) => a.localeCompare(b, 'sl'));
    const f = W.evFilter;
    const evs = d.events.filter((e) => (!f.action || e.action === f.action || e.action.startsWith(f.action + ' ')) && (!f.user || e.userLabel.toLocaleLowerCase('sl').includes(f.user.toLocaleLowerCase('sl'))));
    const row = (l, v) => v ? `<span>${l}</span><span class="v">${esc(v)}</span>` : '';
    sc.innerHTML = `<div class="evs"><div>Id dokumenta:</div><div class="selectable" style="margin:2px 0 4px">${esc(d.id)}</div>
      <fieldset class="filter"><legend>Filter</legend><span>Akcija:</span><select class="win fa"><option value=""></option>${actions.map((a) => `<option ${a === f.action ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <span>Uporabnik:</span><input class="win fu" value="${esc(f.user)}"></fieldset>
      ${evs.map((e) => `<div class="ev">${row('Akcija:', e.action)}${row('Uporabnik:', e.userLabel)}${row('Čas:', fmtStamp(e.at))}${row('Pravilo:', e.rule)}${row('Od:', e.from)}${row('Uporabnikom:', e.toUsers)}${row('Polja:', e.fields)}${row('Status:', e.status)}${row('Uporabniki:', e.users)}${row('Opomba:', e.detail)}</div>`).join('')}</div>`;
    sc.querySelector('.fa').addEventListener('change', (e) => { f.action = e.target.value; panelTrail(sc); });
    const fu = sc.querySelector('.fu');
    fu.addEventListener('input', () => { f.user = fu.value; clearTimeout(W.fuT); W.fuT = setTimeout(() => { panelTrail(sc); const n = sc.querySelector('.fu'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
  }

  function fieldValueHtml(f, v, editable) {
    if (editable && !f.computed) {
      switch (f.type) {
        case 'date': return `<input data-k="${f.key}" data-t="date" placeholder="dd. mm. llll" value="${esc(v ? fmtDatePadded(v) : '')}">`;
        case 'amount': return `<input data-k="${f.key}" data-t="amount" value="${esc(v == null ? '' : fmtAmount(v))}" style="text-align:right">`;
        case 'bool': return `<label class="chk"><input type="checkbox" data-k="${f.key}" ${v ? 'checked' : ''}> ${v ? 'Da' : 'Ne'}</label>`;
        case 'enum': return `<select data-k="${f.key}"><option></option>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}${v && !f.options.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`;
        case 'multiline': return `<textarea data-k="${f.key}">${esc(v || '')}</textarea>`;
        default: return `<input data-k="${f.key}" value="${esc(v ?? '')}">`;
      }
    }
    if (f.type === 'date') return esc(v ? fmtDatePadded(v) : '');
    if (f.type === 'amount') return esc(v == null || v === '' ? '' : fmtAmount(v));
    if (f.type === 'bool') return `<span class="cbx${v ? ' on' : ''}"></span>${v ? 'Da' : 'Ne'}`;
    return esc(v ?? '');
  }

  function panelCover(sc) {
    const d = W.doc;
    const editable = allowed().save;
    let html = '<div class="cover">';
    for (const item of d.coverTemplate) {
      if (item.f) {
        if (item.f.hidden) continue;
        const v = W.pendingFields && item.f.key in W.pendingFields ? W.pendingFields[item.f.key] : d.fields[item.f.key];
        html += `<div class="fr${item.f.accent ? ' accent' : ''}"><span class="l" title="${esc(item.f.label)}">${esc(item.f.label)}</span><span class="v${item.f.type === 'multiline' ? ' multi' : ''}">${fieldValueHtml(item.f, v, editable)}</span></div>`;
      } else if (item.sep != null) {
        html += `<div class="sep">${esc(item.sep)}</div>`;
      } else if (item.table) {
        const t = item.table;
        const rows = (W.pendingTables?.[t.key] ?? d.tables[t.key]) || [];
        const cell = (c, r, ri) => {
          const v = r[c.key];
          if (editable) return `<td><input data-tk="${t.key}" data-r="${ri}" data-c="${c.key}" data-ty="${c.type}" value="${esc(c.type === 'amount' && v != null && v !== '' ? fmtAmount(v) : c.type === 'bool' ? (v ? 'Da' : '') : v ?? '')}"></td>`;
          if (c.type === 'amount') return `<td class="num">${esc(v == null || v === '' ? '' : fmtAmount(v))}</td>`;
          if (c.type === 'date') return `<td>${esc(v ? fmtDatePadded(v) : '')}</td>`;
          if (c.type === 'bool') return `<td>${v ? 'Da' : ''}</td>`;
          return `<td title="${esc(v ?? '')}">${esc(v ?? '')}</td>`;
        };
        const editRows = editable ? [...rows, {}] : rows;
        html += `<div class="cap">${esc(t.caption === 'Tabela povezanih predracunov' ? '' : t.caption)}</div>${t.caption === 'Tabela povezanih predracunov' ? `<div class="cap">${esc(t.caption)}</div>` : ''}
          <table class="sub"><tr>${t.columns.map((c) => `<th title="${esc(c.label)}">${esc(c.label)}</th>`).join('')}</tr>
          ${editRows.map((r, ri) => `<tr>${t.columns.map((c) => cell(c, r, ri)).join('')}</tr>`).join('')}</table>`;
      }
    }
    html += '</div>';
    sc.innerHTML = html;
    if (editable) {
      sc.addEventListener('input', markDirty);
      sc.addEventListener('change', (e) => { markDirty(); if (e.target.type === 'checkbox') e.target.parentElement.lastChild.textContent = e.target.checked ? ' Da' : ' Ne'; });
    }
  }

  function panelLinks(sc) {
    const d = W.doc;
    const q = W.linkFilter.toLocaleLowerCase('sl');
    const links = d.links.filter((l) => !q || `${l.row.subject} ${l.row.sender}`.toLocaleLowerCase('sl').includes(q))
      .sort((a, b) => W.linkSort === 'subject' ? a.row.subject.localeCompare(b.row.subject, 'sl') : W.linkSort === 'sender' ? a.row.sender.localeCompare(b.row.sender, 'sl') : (a.row.createdAt || '').localeCompare(b.row.createdAt || ''));
    if (W.linkDesc) links.reverse();
    sc.innerHTML = `<div style="padding:3px 6px 0">Iskanje in razvrščanje</div>
      <div style="padding:2px 6px"><input class="win lf" placeholder="Filter..." style="width:100%" value="${esc(W.linkFilter)}"></div>
      <div style="padding:2px 6px 4px;display:flex;gap:4px;align-items:center"><select class="win ls" style="flex:1"><option value="createdAt">Datum nastanka</option><option value="subject">Predmet</option><option value="sender">Pošiljatelj</option></select>
      <span class="tb sd" title="Obrni vrstni red">${icon('sortIcon')}</span><span class="tb rf" title="Osveži">${icon('refresh')}</span><span class="tb pc" title="Poveži z dokumenti iz odložišča">${icon('wrench')}</span></div>
      <div style="background:#a5a5a5;color:#fff;text-align:center;font-weight:700;font-style:italic;height:19px;line-height:19px">Povezani in vloženi dokumenti</div>
      <div class="ll">${links.map((l) => `<div class="node" data-id="${l.docId}" style="display:flex;gap:6px;padding:3px 6px;border-bottom:1px solid #eee;cursor:default">${icon(l.kind === 'embedded' ? 'clip' : l.kind === 'parent' ? 'folder' : 'links')}<div style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.row.subject)}</div><div class="demo-note">${esc(l.kind === 'embedded' ? 'Vložen' : l.kind === 'parent' ? 'Vložen v' : 'Povezan')} · ${esc(l.row.categoryLabel)} · ${esc(fmtDateTime(l.row.receivedAt))}</div></div></div>`).join('')}</div>`;
    sc.querySelector('.ls').value = W.linkSort;
    sc.querySelector('.ls').addEventListener('change', (e) => { W.linkSort = e.target.value; panelLinks(sc); });
    sc.querySelector('.lf').addEventListener('change', (e) => { W.linkFilter = e.target.value; panelLinks(sc); });
    sc.querySelector('.sd').addEventListener('click', () => { W.linkDesc = !W.linkDesc; panelLinks(sc); });
    sc.querySelector('.rf').addEventListener('click', () => load(false));
    sc.querySelector('.pc').addEventListener('click', async () => {
      if (!app.clipboard.filter((x) => x !== W.id).length) return alertBox('Odložišče je prazno. V seznamu dokumentov izberite "Dodaj na odložišče".');
      const r = await api('linkDocuments', { id: W.id, targetIds: app.clipboard }).catch((e) => alertBox(e.message, { kind: 'error' }));
      if (r) { toast(`Povezanih dokumentov: ${r.linked}`); appProxy.changed([W.id]); }
    });
    sc.querySelector('.ll').addEventListener('dblclick', (e) => { const n = e.target.closest('[data-id]'); if (n) window.open(`/#/doc/${n.dataset.id}`, `eba_doc_${n.dataset.id}`, `popup,width=${screen.availWidth},height=${screen.availHeight}`); });
    sc.querySelector('.ll').addEventListener('contextmenu', (e) => {
      const n = e.target.closest('[data-id]');
      if (!n) return;
      contextMenu(e, [
        { label: 'Odpri', bold: true, action: () => window.open(`/#/doc/${n.dataset.id}`, `eba_doc_${n.dataset.id}`, 'popup') },
        { label: 'Odstrani povezavo', disabled: !allowed().save, action: async () => { await api('unlinkDocument', { id: W.id, targetId: n.dataset.id }).catch((er) => alertBox(er.message)); appProxy.changed([W.id]); } },
      ]);
    });
  }

  function panelAccess(sc) {
    const d = W.doc;
    sc.innerHTML = `<table class="plain"><colgroup><col><col style="width:150px"><col style="width:46px"></colgroup>
      <thead><tr><th>Uporabnik</th><th>V pisarni od</th><th>Dostop</th></tr></thead>
      <tbody>${d.accessRows.map((r) => `<tr data-h="${esc(r.holder)}"><td style="white-space:normal;${r.current ? 'font-weight:700' : ''}" title="${esc(r.label)}">${esc(r.label)}</td><td style="white-space:pre-line">${esc(r.since)}</td><td style="text-align:center">${r.access ? icon('check', 14) : ''}</td></tr>`).join('')}</tbody></table>`;
    sc.querySelector('tbody').addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('tr[data-h]');
      if (!tr) return;
      contextMenu(e, [
        { label: 'Dodeli dostop ...', disabled: !allowed().grant, action: () => docAct(() => act.grant(appProxy, [W.doc])) },
        { label: 'Odvzemi dostop', disabled: !allowed().grant || !d.accessRows.find((r) => r.holder === tr.dataset.h)?.access, action: async () => {
          await api('revokeAccess', { id: W.id, holder: tr.dataset.h }).then(() => appProxy.changed([W.id])).catch((er) => alertBox(er.message, { kind: 'error' }));
        } },
      ]);
    });
  }

  function panelVersions(sc) {
    const d = W.doc;
    if (!d.versions.length) { sc.innerHTML = ''; return; }
    sc.innerHTML = `<table class="plain"><colgroup><col style="width:52px"><col style="width:120px"><col><col></colgroup>
      <thead><tr><th>Verzija</th><th>Datum</th><th>Uporabnik</th><th>Razlog</th></tr></thead>
      <tbody>${d.versions.map((v) => `<tr data-n="${v.n}" class="${W.versionSel === v.n ? 'sel' : ''}"><td>${v.n}</td><td>${esc(fmtDateTime(v.at))}</td><td>${esc(v.userName)}</td><td title="${esc(v.reason)}">${esc(v.reason)}</td></tr>`).join('')}</tbody></table>
      <div style="padding:6px;display:flex;gap:6px"><button class="btn vs" ${W.versionSel ? '' : 'disabled'}>Prikaži</button><button class="btn vr" ${W.versionSel && allowed().save ? '' : 'disabled'}>Obnovi</button></div>
      <div class="vinfo" style="padding:0 6px"></div>`;
    sc.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-n]'); if (tr) { W.versionSel = +tr.dataset.n; panelVersions(sc); } });
    sc.querySelector('.vs').addEventListener('click', () => {
      const v = d.versions.find((x) => x.n === W.versionSel);
      sc.querySelector('.vinfo').innerHTML = `<b>Verzija ${v.n}</b> – ${v.snapshot.pages.length} strani, ${v.snapshot.attachments.length} priponk<br>${[...v.snapshot.pages, ...v.snapshot.attachments].map((p) => `<a class="lnk" href="${blobUrl(p.blobId)}" target="_blank">${esc(p.name)}</a>`).join('<br>')}`;
    });
    sc.querySelector('.vr').addEventListener('click', async () => {
      if (!await confirmBox(`Obnovim verzijo ${W.versionSel}? Trenutna vsebina se ohrani kot nova verzija.`)) return;
      try { await api('restoreVersion', { id: W.id, n: W.versionSel }); toast('Verzija je obnovljena.'); appProxy.changed([W.id]); } catch (e) { alertBox(e.message, { kind: 'error' }); }
    });
  }

  // ----------------------------------------------------------- editing
  function markDirty() {
    if (!W.dirty) { W.dirty = true; renderToolbar(); }
  }
  function collect() {
    const fields = {};
    root.querySelectorAll('.cover [data-k]').forEach((i) => {
      const k = i.dataset.k;
      if (i.type === 'checkbox') fields[k] = i.checked;
      else if (i.dataset.t === 'amount') { const n = parseAmount(i.value); if (i.value.trim() && n == null) throw new Error(`Neveljaven znesek: ${i.value}`); fields[k] = n; }
      else if (i.dataset.t === 'date') { const d = parseDate(i.value); if (i.value.trim() && !d) throw new Error(`Neveljaven datum: ${i.value} (uporabite obliko dd. mm. llll)`); fields[k] = d ? isoLocal(d, false) : null; }
      else fields[k] = i.value;
    });
    const tables = {};
    root.querySelectorAll('.cover [data-tk]').forEach((i) => {
      const t = (tables[i.dataset.tk] ||= []);
      const r = (t[+i.dataset.r] ||= {});
      let v = i.value.trim();
      if (i.dataset.ty === 'amount') { const n = parseAmount(v); if (v && n == null) throw new Error(`Neveljaven znesek: ${v}`); v = n; }
      else if (i.dataset.ty === 'date') { const dd = parseDate(v); v = dd ? isoLocal(dd, false) : v; }
      else if (i.dataset.ty === 'bool') v = /^(da|1|true|x)$/i.test(v);
      r[i.dataset.c] = v;
    });
    for (const k of Object.keys(tables)) tables[k] = tables[k].filter((r) => r && Object.values(r).some((v) => v !== '' && v != null && v !== false));
    const hasCover = !!root.querySelector('.cover');
    return {
      fields: hasCover ? fields : undefined, tables: hasCover ? tables : undefined,
      subject: root.querySelector('.hdrs .hp')?.value, sender: root.querySelector('.hdrs .hs')?.value,
    };
  }
  async function save() {
    if (!W.dirty || !allowed().save) return true;
    try {
      const payload = collect();
      const r = await api('saveDocument', { id: W.id, ...payload });
      W.doc = r.doc; W.dirty = false;
      toast(r.changed ? 'Spremembe so shranjene.' : 'Ni sprememb.');
      post({ type: 'docChanged', ids: [W.id] });
      renderAll();
      return true;
    } catch (e) { await alertBox(e.message, { kind: 'error' }); return false; }
  }
  async function confirmDiscard() {
    const r = await dialog({ title: 'EBA DMS', help: false, body: `<div class="msg">${icon('help', 24)}<div>Dokument ima neshranjene spremembe. Ali jih želite shraniti?</div></div>`,
      buttons: [{ label: 'Da', primary: true, value: 'yes' }, { label: 'Ne', value: 'no' }, { label: 'Prekliči', value: null }], closeValue: null });
    if (r === 'yes') return save();
    if (r === 'no') { W.dirty = false; return true; }
    return false;
  }

  async function setExt(code) {
    if (code === W.doc.externalStatus) return;
    try { await api('setExternalStatus', { id: W.id, code }); appProxy.changed([W.id]); } catch (e) { alertBox(e.message, { kind: 'error' }); renderToolbar(); }
  }
  async function pantheonLink() {
    const ref = await promptBox('Številka dokumenta v Pantheonu:', W.doc.fields.stev_racuna_panteon || '', { title: 'Ročno poveži s Pantheon' });
    if (!ref) return;
    try { await api('pantheonLink', { id: W.id, ref }); toast('Povezava je zapisana (demo: brez preverjanja v ERP).'); appProxy.changed([W.id]); } catch (e) { alertBox(e.message, { kind: 'error' }); }
  }
  async function attachFile() {
    const files = await pickFiles({ multiple: false });
    if (!files.length) return;
    try { const b = await upload(files[0]); await api('attachFile', { id: W.id, blobId: b.id }); toast('Datoteka je pripeta; prejšnja vsebina je shranjena kot verzija.'); appProxy.changed([W.id]); } catch (e) { alertBox(e.message, { kind: 'error' }); }
  }
  async function modifyDocument() {
    if (!await confirmBox('Spreminjanje dokumenta zamenja strani z novimi datotekami. Trenutne strani se ohranijo kot verzija. Nadaljujem?')) return;
    const files = await pickFiles({ multiple: true, accept: 'image/*,application/pdf' });
    if (!files.length) return;
    try {
      const ids = [];
      for (const f of files) ids.push((await upload(f)).id);
      await api('replacePages', { id: W.id, blobIds: ids });
      W.page = 0;
      toast('Dokument je spremenjen; prejšnja vsebina je v zavihku Verzije.');
      appProxy.changed([W.id]);
    } catch (e) { alertBox(e.message, { kind: 'error' }); }
  }
  async function editTemplate() {
    const fields = coverFields(W.doc.category);
    const cur = Object.fromEntries(W.doc.coverTemplate.filter((x) => x.f).map((x) => [x.f.key, x.f]));
    const res = await dialog({
      title: `Predloga za spremni list – ${categoryLabel(W.doc.category)}`, width: 520,
      body: `<div class="demo-note" style="margin-bottom:6px">Velja za podjetje ${esc(W.doc.companyName)}. Skrita polja ostanejo v podatkih in iskanju.</div>
        <div class="whitebox" style="max-height:420px;overflow:auto"><table class="plain"><colgroup><col style="width:50px"><col><col></colgroup><thead><tr><th>Prikaži</th><th>Polje</th><th>Oznaka</th></tr></thead>
        <tbody>${fields.map((f) => `<tr data-k="${f.key}"><td style="text-align:center"><input type="checkbox" ${cur[f.key]?.hidden ? '' : 'checked'}></td><td>${esc(f.label)}</td><td><input class="lbl" value="${esc(cur[f.key]?.label !== f.label ? cur[f.key]?.label || '' : '')}" placeholder="${esc(f.label)}"></td></tr>`).join('')}</tbody></table></div>`,
      buttons: [{ label: 'V redu', primary: true, action: (dd) => Object.fromEntries(dd.qa('tbody tr').map((tr) => [tr.dataset.k, { hidden: !tr.querySelector('input[type=checkbox]').checked, label: tr.querySelector('.lbl').value.trim() }])) }, { label: 'Prekliči', value: null }],
    });
    if (!res) return;
    try { await api('editCoverTemplate', { companyId: W.doc.companyId, category: W.doc.category, overrides: res }); toast('Predloga je shranjena.'); load(false); } catch (e) { alertBox(e.message, { kind: 'error' }); }
  }

  // ----------------------------------------------------------- misc commands
  async function printDoc() {
    const own = W.doc.pages.filter((p) => p.mime.startsWith('image/'));
    const area = el(`<div class="print-area">${own.map((p) => `<img src="${blobUrl(p.blobId)}" style="width:100%;page-break-after:always">`).join('')}</div>`);
    document.body.appendChild(area);
    await Promise.all([...area.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    await api('recordOutput', { ids: [W.id], kind: 'print' }).catch(() => {});
    window.print();
    area.remove();
    load(false);
  }
  async function copyText() {
    const p = pages()[W.page];
    let text = '';
    if (p?.mime?.includes('svg')) {
      const svg = await (await fetch(blobUrl(p.blobId))).text();
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      text = [...doc.querySelectorAll('text')].map((t) => t.textContent).join('\n');
    }
    if (!text) return alertBox('Na tej strani ni besedila za kopiranje (OCR ni na voljo za to datoteko).');
    navigator.clipboard?.writeText(text).then(() => toast('Besedilo dokumenta je kopirano.'), () => download('besedilo.txt', text));
  }
  function copyAttachment() {
    const p = pages()[W.page];
    if (!p) return;
    store.set('eba-attach-clip', { docId: p.foreign || W.id, blobId: p.blobId, name: p.name });
    toast(`Priponka "${p.name}" je kopirana.`);
  }
  async function pasteAttachment() {
    const c = store.get('eba-attach-clip', null);
    if (!c) return;
    try { await api('copyAttachment', { id: W.id, sourceDocId: c.docId, blobId: c.blobId }); toast('Priponka je prilepljena.'); appProxy.changed([W.id]); } catch (e) { alertBox(e.message, { kind: 'error' }); }
  }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.(); }
  function toggleDetails() { W.details = !W.details; renderSide(); }
  async function closeWindow() {
    if (W.dirty && !(await confirmDiscard())) return;
    post({ type: 'windowClosed', id: W.id });
    window.close();
    setTimeout(() => { if (!window.closed) { location.hash = ''; location.reload(); } }, 150);
  }
  async function navigate(kind) {
    const list = store.get('eba-nav', []);
    if (!list.length) return toast('Seznam za premikanje ni na voljo.');
    const i = list.indexOf(W.id);
    const j = { navFirst: 0, navPrev: Math.max(0, i - 1), navNext: Math.min(list.length - 1, i + 1), navLast: list.length - 1 }[kind];
    if (j === i || list[j] == null) return;
    if (W.dirty && !(await confirmDiscard())) return;
    post({ type: 'windowClosed', id: W.id });
    W.id = list[j]; W.page = 0; W.highlight = null; W.versionSel = null;
    history.replaceState(null, '', `#/doc/${W.id}`);
    load(true);
  }

  // ----------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    if (menusOpen()) { if (menuKeydown(e)) { e.preventDefault(); e.stopPropagation(); } return; }
    if (dialogsOpen()) return;
    if (e.altKey && e.key.length === 1) { if (W.menubar?.mnemonic(e.key)) e.preventDefault(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inField = e.target.matches('input, textarea, select');
    const a = allowed();
    let h = true;
    if (ctrl && k === 's') save();
    else if (ctrl && k === 'p') { if (a.print) printDoc(); }
    else if (ctrl && k === 'w') closeWindow();
    else if (ctrl && k === 'f') fullscreen();
    else if (ctrl && k === 'd') toggleDetails();
    else if (ctrl && (k === '0')) setZoom('width');
    else if (ctrl && (k === '+' || k === '=')) zoomBy(1.2);
    else if (ctrl && k === '-') zoomBy(1 / 1.2);
    else if (ctrl && k === 'r') { W.ruler = !W.ruler; renderCenter(); }
    else if (ctrl && k === 'o') { if (a.toDispatch) docAct(() => act.dispatch(appProxy, [W.doc], 'toDispatch')); }
    else if (ctrl && k === 'k') { if (a.classify) docAct(() => act.classify(appProxy, [W.doc])); }
    else if (ctrl && e.shiftKey && k === 'c') act.copyLink(app, [W.doc]);
    else if (ctrl && k === 'c' && !inField) copyAttachment();
    else if (ctrl && k === 'v' && !inField) { if (a.attach) pasteAttachment(); }
    else if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    else h = false;
    if (h) e.preventDefault();
  });
  window.addEventListener('beforeunload', (e) => { post({ type: 'windowClosed', id: W.id }); if (W.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => { if (W.doc && W.center === 'image') renderCenter(); });
  channel?.addEventListener('message', (e) => {
    if (e.data?.type === 'docChanged' && e.data.ids?.includes(W.id) && !W.dirty) load(false);
    if (e.data?.type === 'logout') location.reload();
  });
  await load(true);
  return W;
}

export { selectedLabel };
