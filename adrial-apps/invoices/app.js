/* Adrial Apps · Invoices
 * Stores PDF invoices in this browser (IndexedDB), reads them with pdf.js + parser.js,
 * and shows costs by month, category and vendor. Nothing is uploaded anywhere.
 */
(function () {
  'use strict';

  var P = window.InvoiceParser;
  var PDFJS = window.pdfjsLib;
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  if (PDFJS) PDFJS.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var UI_KEY = 'adrial-invoices-ui';
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DEFAULT_SETTINGS = { ownNames: ['Adrial'], ownTaxIds: [], categories: P.DEFAULT_CATEGORIES.slice() };
  var STATUS_LABEL = { review: 'To check', paid: 'Paid', overdue: 'Overdue', unpaid: 'Unpaid' };

  var state = {
    invoices: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    rules: {},
    filters: { year: '', month: '', cat: '', status: '', q: '', vendor: '' },
    sort: { key: 'issueDate', dir: -1 },
    queue: [],
    current: null,
    previewDoc: null
  };

  // ---------- DOM helpers ----------

  function $(id) { return document.getElementById(id); }

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  var ICONS = {
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    sortUp: '<path d="m6 15 6-6 6 6"/>',
    sortDown: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }

  // ---------- formatting ----------

  var moneyFmt = {};
  function money(v, cur) {
    if (v == null || isNaN(v)) return '–';
    cur = cur || 'EUR';
    if (!moneyFmt[cur]) {
      try { moneyFmt[cur] = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: cur }); }
      catch (e) { moneyFmt[cur] = { format: function (x) { return x.toFixed(2) + ' ' + cur; } }; }
    }
    return moneyFmt[cur].format(v);
  }
  var intFmt = new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 0 });
  function moneyAxis(v) { return intFmt.format(v) + ' €'; }
  var dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  function dateStr(iso) {
    if (!iso) return '–';
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? iso : dateFmt.format(d);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function amountText(v) { return v == null || isNaN(v) ? '' : v.toFixed(2).replace('.', ','); }
  function parseAmount(s) {
    s = String(s || '').trim().replace(/[€$£\s]|EUR|USD|GBP|CHF/gi, '');
    if (!s) return null;
    var n = P.toNumber(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function slug(s) {
    return P.norm(s || '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function niceName(inv) {
    var parts = [inv.issueDate || 'undated', slug(inv.vendor) || 'invoice'];
    if (inv.number) parts.push(slug(inv.number));
    return parts.join('_') + '.pdf';
  }

  // ---------- derived values ----------

  function isEur(inv) { return !inv.currency || inv.currency === 'EUR'; }
  function eurOf(inv) { return isEur(inv) ? inv.total : inv.eur; }
  function ratio(inv) { return isEur(inv) ? 1 : (inv.eur != null && inv.total ? inv.eur / inv.total : null); }
  function vatEur(inv) { var r = ratio(inv); return inv.vat == null || r == null ? null : inv.vat * r; }
  function netEur(inv) { var r = ratio(inv); return inv.net == null || r == null ? null : inv.net * r; }
  function dateOf(inv) { return inv.issueDate || String(inv.addedAt || '').slice(0, 10); }
  function isOverdue(inv) { return !inv.paid && !!inv.dueDate && inv.dueDate < todayIso(); }
  function statusOf(inv) {
    if (inv.status === 'review') return 'review';
    if (inv.paid) return 'paid';
    return isOverdue(inv) ? 'overdue' : 'unpaid';
  }
  function sum(list, f) { return list.reduce(function (s, x) { var v = f(x); return v == null || isNaN(v) ? s : s + v; }, 0); }

  // ---------- storage (IndexedDB) ----------

  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = indexedDB.open('adrial-invoices', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' }).createIndex('hash', 'hash');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('Storage is blocked by another tab')); };
    });
    return dbPromise;
  }
  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var result;
        var r = fn(t.objectStore(store));
        if (r && 'onsuccess' in r) r.onsuccess = function () { result = r.result; };
        t.oncomplete = function () { resolve(result); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('Storage error')); };
      });
    });
  }
  var idb = {
    all: function (s) { return tx(s, 'readonly', function (os) { return os.getAll(); }); },
    get: function (s, k) { return tx(s, 'readonly', function (os) { return os.get(k); }); },
    put: function (s, v) { return tx(s, 'readwrite', function (os) { return os.put(v); }); },
    del: function (s, k) { return tx(s, 'readwrite', function (os) { return os.delete(k); }); },
    clear: function (s) { return tx(s, 'readwrite', function (os) { return os.clear(); }); }
  };
  function saveSettings() { return idb.put('kv', { key: 'settings', value: state.settings }); }
  function saveRules() { return idb.put('kv', { key: 'rules', value: state.rules }); }

  function requestPersist() {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) { if (!p && navigator.storage.persist) return navigator.storage.persist(); }).then(updateStorageLine).catch(function () {});
    }
  }
  function updateStorageLine() {
    var line = $('storage-line');
    if (!navigator.storage || !navigator.storage.estimate) return;
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)]).then(function (r) {
      var mb = (r[0].usage || 0) / 1048576;
      line.textContent = 'Stored only in this browser · ' + (mb < 0.1 ? '<0.1' : mb.toFixed(1)) + ' MB used' + (r[1] ? ' · protected from automatic clean-up' : '');
      $('s-storage').textContent = line.textContent + '. Invoices never leave this device unless you export them.';
    }).catch(function () {});
  }

  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ filters: state.filters, sort: state.sort })); } catch (e) { /* ignore */ }
  }
  function loadUi() {
    try {
      var ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (ui && ui.filters) Object.assign(state.filters, ui.filters);
      if (ui && ui.sort) state.sort = ui.sort;
      return !!ui;
    } catch (e) { return false; }
  }

  // ---------- external libraries (loaded on demand) ----------

  var scriptCache = {};
  function loadScript(url) {
    if (!scriptCache[url]) {
      scriptCache[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = function () { delete scriptCache[url]; reject(new Error('Could not load ' + url)); };
        document.head.appendChild(s);
      });
    }
    return scriptCache[url];
  }

  // ---------- toasts & tooltip ----------

  function toast(message, opts) {
    opts = opts || {};
    var box = $('toasts');
    var p = el('p', { text: message });
    var node = el('div', { class: 'toast', role: opts.progress ? 'status' : null }, [opts.progress ? el('span', { class: 'spin', 'aria-hidden': 'true' }) : null, p]);
    if (opts.action) node.append(el('button', { type: 'button', text: opts.action.label, onclick: function () { opts.action.run(); close(); } }));
    box.append(node);
    var timer = null;
    function close() { if (timer) clearTimeout(timer); node.remove(); }
    if (!opts.progress) timer = setTimeout(close, opts.ms || 5200);
    return { update: function (m) { p.textContent = m; }, close: close };
  }

  var tip = null;
  function showTip(target, rows) {
    tip = tip || $('tooltip');
    tip.textContent = '';
    rows.forEach(function (r) { tip.append(el('span', { class: r[0], text: r[1] })); });
    tip.hidden = false;
    var rect = target.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var x = Math.min(Math.max(8, rect.left + rect.width / 2 - tw / 2), window.innerWidth - tw - 8);
    var y = rect.top - th - 10;
    if (y < 8) y = rect.bottom + 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  // ---------- reading PDFs ----------

  async function sha256(buf) {
    if (window.crypto && crypto.subtle) {
      var h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return 'size-' + buf.byteLength;
  }

  function pageLines(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.transform) return;
      var x = it.transform[4];
      var y = it.transform[5];
      var h = Math.abs(it.transform[3]) || it.height || 10;
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].y - y) <= Math.max(2, h * 0.45)) { row = rows[i]; break; } }
      if (!row) { row = { y: y, h: h, items: [] }; rows.push(row); }
      row.items.push({ x: x, w: it.width || 0, str: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var out = '';
      var lastEnd = null;
      r.items.forEach(function (it) {
        if (lastEnd !== null) {
          var gap = it.x - lastEnd;
          if (gap > r.h * 1.4) out += '   ';
          else if (gap > r.h * 0.12 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
        }
        out += it.str;
        lastEnd = it.x + it.w;
      });
      return out.replace(/\s+$/, '');
    }).filter(function (l) { return l.trim() !== ''; });
  }

  async function extractLines(buf) {
    var pdf = await PDFJS.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    var lines = [];
    var pages = Math.min(pdf.numPages, 15);
    for (var p = 1; p <= pages; p++) {
      var page = await pdf.getPage(p);
      var tc = await page.getTextContent();
      lines = lines.concat(pageLines(tc.items));
    }
    var n = pdf.numPages;
    pdf.destroy();
    return { lines: lines, pages: n };
  }

  function parserOptions() {
    return { ownNames: state.settings.ownNames, ownTaxIds: state.settings.ownTaxIds, rules: state.rules };
  }

  function possibleDuplicate(inv) {
    var v = P.norm(inv.vendor);
    return state.invoices.find(function (o) {
      if (o.id === inv.id) return false;
      if (inv.number && o.number && o.number === inv.number && (!v || P.norm(o.vendor) === v)) return true;
      return v && P.norm(o.vendor) === v && o.total != null && o.total === inv.total && o.issueDate && o.issueDate === inv.issueDate;
    }) || null;
  }

  function makeInvoice(file, hash, ext, parsed, readError) {
    var inv = {
      id: uid(),
      hash: hash,
      fileName: file.name,
      size: file.size,
      pages: ext.pages || 0,
      addedAt: new Date().toISOString(),
      vendor: parsed.vendor || '',
      detectedVendor: parsed.vendor || '',
      vendorTaxId: parsed.vendorTaxId || '',
      number: parsed.number || '',
      issueDate: parsed.issueDate || null,
      dueDate: parsed.dueDate || null,
      currency: parsed.currency || 'EUR',
      total: parsed.total,
      vat: parsed.vat,
      net: parsed.net,
      eur: null,
      category: parsed.category || 'Other',
      notes: '',
      paid: false,
      paidDate: null,
      status: 'review',
      scanned: !!parsed.scanned,
      readError: !!readError,
      confidence: parsed.confidence || {},
      text: (ext.lines || []).join('\n').slice(0, 40000)
    };
    if (state.settings.categories.indexOf(inv.category) === -1 && inv.category !== 'Other') inv.category = 'Other';
    var dup = possibleDuplicate(inv);
    if (dup) inv.duplicateOf = dup.id;
    return inv;
  }

  async function importFiles(fileList) {
    var all = Array.from(fileList || []);
    var files = all.filter(function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name); });
    if (!files.length) { toast(all.length ? 'Only PDF files can be added.' : 'No files selected.'); return; }
    if (!PDFJS) { toast('The PDF reader did not load. Check your connection and reload the page.'); return; }
    requestPersist();
    var added = [];
    var dupes = 0;
    var failed = [];
    var t = toast('Reading ' + plural(files.length, 'PDF', 'PDFs') + '…', { progress: true });
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      t.update('Reading ' + (i + 1) + ' of ' + files.length + ': ' + f.name);
      try {
        var buf = await f.arrayBuffer();
        var hash = await sha256(buf);
        if (state.invoices.some(function (x) { return x.hash === hash; })) { dupes++; continue; }
        var ext = { lines: [], pages: 0 };
        var readError = false;
        try { ext = await extractLines(buf); } catch (e) { readError = true; }
        var parsed = P.parseInvoice(ext.lines, parserOptions());
        var inv = makeInvoice(f, hash, ext, parsed, readError);
        await idb.put('files', { id: inv.id, blob: new Blob([buf], { type: 'application/pdf' }) });
        await idb.put('invoices', inv);
        state.invoices.push(inv);
        added.push(inv);
      } catch (e) {
        console.error(e);
        failed.push(f.name);
      }
    }
    t.close();
    // if the year filter would hide everything just added, jump to the year of the new invoices
    if (added.length && state.filters.year && !added.some(function (x) { return dateOf(x).slice(0, 4) === state.filters.year; })) {
      state.filters.year = dateOf(added[0]).slice(0, 4);
      state.filters.month = '';
      saveUi();
    }
    render();
    updateStorageLine();
    var msg = [];
    if (added.length) msg.push(plural(added.length, 'invoice', 'invoices') + ' added');
    if (dupes) msg.push(plural(dupes, 'duplicate', 'duplicates') + ' skipped');
    if (failed.length) msg.push(failed.length + ' could not be saved');
    if (msg.length) toast(msg.join(' · ') + '.');
    if (added.length) openDetail(added[0].id, added.map(function (x) { return x.id; }));
  }

  // ---------- filtering ----------

  function filtered(opts) {
    opts = opts || {};
    var f = state.filters;
    var q = P.norm(String(f.q || '').trim());
    return state.invoices.filter(function (inv) {
      var d = dateOf(inv);
      if (f.year && d.slice(0, 4) !== f.year) return false;
      if (f.year && f.month && !opts.ignoreMonth && d.slice(5, 7) !== f.month) return false;
      if (f.cat && !opts.ignoreCat && inv.category !== f.cat) return false;
      if (f.vendor && !opts.ignoreVendor && inv.vendor !== f.vendor) return false;
      if (f.status) {
        if (f.status === 'review' && inv.status !== 'review') return false;
        if (f.status === 'paid' && !inv.paid) return false;
        if (f.status === 'unpaid' && inv.paid) return false;
        if (f.status === 'overdue' && !isOverdue(inv)) return false;
      }
      if (q) {
        var hay = P.norm([inv.vendor, inv.number, inv.category, inv.notes, inv.fileName, inv.vendorTaxId, inv.text].join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // ---------- rendering ----------

  function render() {
    var has = state.invoices.length > 0;
    $('onboard').hidden = has;
    $('dash').hidden = !has;
    renderReviewBanner();
    if (!has) return;
    renderFilters();
    var list = filtered();
    renderKpis(list);
    renderMonthChart(filtered({ ignoreMonth: true }));
    renderBars($('c-cat'), groupBy(filtered({ ignoreCat: true }), 'category'), state.filters.cat, function (name) {
      state.filters.cat = state.filters.cat === name ? '' : name; saveUi(); render();
    }, 12);
    var vendors = groupBy(filtered({ ignoreVendor: true }), 'vendor');
    $('c-ven-note').textContent = vendors.length ? plural(vendors.length, 'vendor', 'vendors') : '';
    renderBars($('c-ven'), vendors, state.filters.vendor, function (name) {
      state.filters.vendor = state.filters.vendor === name ? '' : name; saveUi(); render();
    }, 8);
    renderTable(list);
    var dl = $('vendor-list');
    dl.textContent = '';
    Array.from(new Set(state.invoices.map(function (x) { return x.vendor; }).filter(Boolean))).sort().forEach(function (v) { dl.append(el('option', { value: v })); });
  }

  function renderReviewBanner() {
    var n = state.invoices.filter(function (x) { return x.status === 'review'; }).length;
    $('review-banner').hidden = n === 0;
    $('review-text').textContent = n === 1 ? '1 invoice is waiting to be checked.' : n + ' invoices are waiting to be checked.';
  }

  function setOptions(select, options, value) {
    select.textContent = '';
    options.forEach(function (o) { select.append(el('option', { value: o[0], text: o[1] })); });
    select.value = value;
    if (select.value !== value) select.value = options.length ? options[0][0] : '';
  }

  function renderFilters() {
    var f = state.filters;
    var years = Array.from(new Set(state.invoices.map(function (x) { return dateOf(x).slice(0, 4); }).concat([String(new Date().getFullYear())]))).sort().reverse();
    setOptions($('f-year'), [['', 'All years']].concat(years.map(function (y) { return [y, y]; })), f.year);
    setOptions($('f-month'), [['', 'All months']].concat(MONTH_LONG.map(function (m, i) { return [pad(i + 1), m]; })), f.month);
    $('f-month').disabled = !f.year;
    var cats = state.settings.categories.slice();
    state.invoices.forEach(function (x) { if (x.category && cats.indexOf(x.category) === -1) cats.push(x.category); });
    setOptions($('f-cat'), [['', 'All']].concat(cats.map(function (c) { return [c, c]; })), f.cat);
    $('f-status').value = f.status;
    if ($('f-q').value !== f.q) $('f-q').value = f.q;
    $('f-vendor-chip').hidden = !f.vendor;
    $('f-vendor-name').textContent = f.vendor;
  }

  function periodLabel() {
    var f = state.filters;
    if (f.year && f.month) return MONTH_LONG[+f.month - 1] + ' ' + f.year;
    if (f.year) return f.year;
    return 'all years';
  }

  function renderKpis(list) {
    var f = state.filters;
    var spent = sum(list, eurOf);
    var missingEur = list.filter(function (x) { return eurOf(x) == null; }).length;
    $('k-spent-label').textContent = f.year ? 'Spent in ' + periodLabel() : 'Spent · all years';
    $('k-spent').textContent = money(spent);
    var sub = $('k-spent-sub');
    sub.textContent = '';
    sub.className = 'sub';
    if (missingEur) {
      sub.append(icon('alert'), ' ' + plural(missingEur, 'invoice', 'invoices') + ' without an amount in EUR');
    } else if (f.year && !f.month) {
      // compare with the same stretch of the previous year
      var prevYear = String(+f.year - 1);
      var cutoff = f.year === String(new Date().getFullYear()) ? todayIso().slice(5) : '12-31';
      var prevList = state.invoices.filter(function (inv) {
        var d = dateOf(inv);
        if (d.slice(0, 4) !== prevYear || d.slice(5) > cutoff) return false;
        return matchesNonDate(inv);
      });
      var prev = sum(prevList, eurOf);
      if (prev > 0) {
        var pct = Math.round(((spent - prev) / prev) * 100);
        sub.append(icon(pct >= 0 ? 'up' : 'down'), ' ' + Math.abs(pct) + '% vs ' + prevYear + (cutoff === '12-31' ? '' : ' to date'));
      } else {
        sub.textContent = plural(list.length, 'invoice', 'invoices');
      }
    } else {
      sub.textContent = plural(list.length, 'invoice', 'invoices');
    }

    if (f.year && f.month) {
      $('k-avg-label').textContent = 'Average invoice';
      $('k-avg').textContent = list.length ? money(spent / list.length) : '–';
      $('k-avg-sub').textContent = plural(list.length, 'invoice', 'invoices');
    } else {
      var months;
      if (f.year) months = f.year === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : 12;
      else {
        var ds = list.map(dateOf).filter(Boolean).sort();
        if (ds.length) {
          var a = ds[0];
          var b = ds[ds.length - 1];
          months = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + 1;
        } else months = 1;
      }
      $('k-avg-label').textContent = 'Monthly average';
      $('k-avg').textContent = money(spent / Math.max(1, months));
      $('k-avg-sub').textContent = 'over ' + plural(months, 'month', 'months');
    }

    $('k-vat').textContent = money(sum(list, vatEur));
    $('k-vat-sub').textContent = 'Net ' + money(sum(list, netEur));

    var unpaid = list.filter(function (x) { return !x.paid; });
    var overdue = unpaid.filter(isOverdue);
    $('k-unpaid').textContent = money(sum(unpaid, eurOf));
    var us = $('k-unpaid-sub');
    us.textContent = '';
    if (!unpaid.length) us.textContent = 'All paid';
    else {
      us.append(plural(unpaid.length, 'invoice', 'invoices'));
      if (overdue.length) us.append(' · ', el('span', { class: 'bad' }, [icon('clock'), ' ' + overdue.length + ' overdue · ' + money(sum(overdue, eurOf))]));
    }
  }

  // every filter except the period (used for year-over-year comparison)
  function matchesNonDate(inv) {
    var f = state.filters;
    if (f.cat && inv.category !== f.cat) return false;
    if (f.vendor && inv.vendor !== f.vendor) return false;
    if (f.status === 'review' && inv.status !== 'review') return false;
    if (f.status === 'paid' && !inv.paid) return false;
    if (f.status === 'unpaid' && inv.paid) return false;
    if (f.status === 'overdue' && !isOverdue(inv)) return false;
    var q = P.norm(String(f.q || '').trim());
    if (q && P.norm([inv.vendor, inv.number, inv.category, inv.notes, inv.fileName, inv.vendorTaxId, inv.text].join(' ')).indexOf(q) === -1) return false;
    return true;
  }

  function niceScale(max) {
    if (!(max > 0)) return { top: 100, step: 25 };
    var raw = max / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    return { top: Math.ceil(max / step) * step, step: step };
  }

  function renderMonthChart(list) {
    var f = state.filters;
    var box = $('c-month');
    var labels = $('c-month-labels');
    box.textContent = '';
    labels.textContent = '';
    var months = [];
    if (f.year) {
      for (var m = 1; m <= 12; m++) months.push({ key: f.year + '-' + pad(m), y: f.year, m: m });
    } else {
      var now = new Date();
      for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), y: String(d.getFullYear()), m: d.getMonth() + 1 });
      }
    }
    var byKey = {};
    months.forEach(function (mo) { mo.total = 0; mo.vat = 0; mo.count = 0; byKey[mo.key] = mo; });
    list.forEach(function (inv) {
      var mo = byKey[dateOf(inv).slice(0, 7)];
      if (!mo) return;
      var v = eurOf(inv);
      if (v != null) mo.total += v;
      mo.vat += vatEur(inv) || 0;
      mo.count++;
    });
    $('c-month-note').textContent = (f.year ? f.year : 'Last 12 months') + ' · incl. VAT, in EUR · select a month to filter';
    var max = Math.max.apply(null, months.map(function (x) { return x.total; }));
    var scale = niceScale(max);
    for (var v = 0; v <= scale.top + 1e-9; v += scale.step) {
      var pct = (v / scale.top) * 100;
      box.append(el('div', { class: 'gridline' + (v === 0 ? ' base' : ''), style: 'top:' + (100 - pct) + '%' }));
      box.append(el('span', { class: 'tick num', style: 'top:' + (100 - pct) + '%', text: moneyAxis(v) }));
    }
    var row = el('div', { class: 'cols-row' });
    var maxKey = max > 0 ? months.filter(function (x) { return x.total === max; })[0].key : null;
    months.forEach(function (mo) {
      var selected = f.year && f.month === pad(mo.m) && f.year === mo.y;
      var heightPct = scale.top ? (mo.total / scale.top) * 100 : 0;
      var bar = el('span', { class: 'bar', style: 'height:' + heightPct + '%' });
      var label = MONTH_LONG[mo.m - 1] + ' ' + mo.y + ': ' + money(mo.total) + ', ' + plural(mo.count, 'invoice', 'invoices');
      var col = el('button', {
        type: 'button',
        class: 'col' + (f.month && !selected ? ' dim' : ''),
        'aria-label': label,
        'aria-pressed': selected ? 'true' : 'false',
        onclick: function () {
          if (selected) state.filters.month = '';
          else { state.filters.year = mo.y; state.filters.month = pad(mo.m); }
          saveUi(); render();
        },
        onpointerenter: function () { showTip(bar.offsetHeight ? bar : col, [['tv', money(mo.total)], ['tl', MONTH_LONG[mo.m - 1] + ' ' + mo.y], ['tm', plural(mo.count, 'invoice', 'invoices') + ' · VAT ' + money(mo.vat)]]); },
        onpointerleave: hideTip,
        onfocus: function () { showTip(bar.offsetHeight ? bar : col, [['tv', money(mo.total)], ['tl', MONTH_LONG[mo.m - 1] + ' ' + mo.y], ['tm', plural(mo.count, 'invoice', 'invoices') + ' · VAT ' + money(mo.vat)]]); },
        onblur: hideTip
      }, [bar]);
      if (mo.total > 0 && (mo.key === maxKey || selected)) {
        col.append(el('span', { class: 'cap num', style: 'bottom:' + heightPct + '%', text: moneyAxis(Math.round(mo.total)) }));
      }
      row.append(col);
      labels.append(el('span', { class: selected ? 'on' : '', text: MONTH_SHORT[mo.m - 1] + (!f.year && mo.m === 1 ? ' ’' + mo.y.slice(2) : '') }));
    });
    box.append(row);
  }

  function groupBy(list, field) {
    var map = {};
    list.forEach(function (inv) {
      var k = inv[field] || (field === 'vendor' ? 'Unknown vendor' : 'Other');
      if (!map[k]) map[k] = { name: k, total: 0, count: 0 };
      var v = eurOf(inv);
      if (v != null) map[k].total += v;
      map[k].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  function renderBars(listEl, groups, active, onPick, limit) {
    listEl.textContent = '';
    if (!groups.length) { listEl.append(el('li', {}, [el('p', { class: 'empty-note', text: 'Nothing here yet for these filters.' })])); return; }
    var total = groups.reduce(function (s, g) { return s + g.total; }, 0) || 1;
    var max = groups[0].total || 1;
    groups.slice(0, limit).forEach(function (g) {
      var on = active === g.name;
      var share = Math.round((g.total / total) * 100);
      listEl.append(el('li', {}, [el('button', {
        type: 'button',
        class: 'hbar' + (on ? ' on' : ''),
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': g.name + ': ' + money(g.total) + ', ' + share + '% of the total, ' + plural(g.count, 'invoice', 'invoices'),
        onclick: function () { onPick(g.name); }
      }, [
        el('span', { class: 'name', text: g.name }),
        el('span', { class: 'track' }, [el('span', { class: 'fill', style: 'display:block;width:' + Math.max(1.5, (g.total / max) * 100) + '%' })]),
        el('span', { class: 'val num' }, [money(g.total), el('small', { text: share + '% · ' + plural(g.count, 'invoice', 'invoices') })])
      ])]));
    });
    if (groups.length > limit) {
      var rest = groups.slice(limit);
      listEl.append(el('li', {}, [el('p', { class: 'muted', style: 'margin:6px 8px 0;font-size:13px', text: '+ ' + plural(rest.length, 'more', 'more') + ' · ' + money(rest.reduce(function (s, g) { return s + g.total; }, 0)) })]));
    }
  }

  function renderTable(list) {
    var s = state.sort;
    var sorted = list.slice().sort(function (a, b) {
      var va = s.key === 'eur' ? eurOf(a) : s.key === 'issueDate' ? dateOf(a) : a[s.key];
      var vb = s.key === 'eur' ? eurOf(b) : s.key === 'issueDate' ? dateOf(b) : b[s.key];
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      if (typeof va === 'string') return va.localeCompare(vb, 'sl') * s.dir;
      return (va - vb) * s.dir;
    });
    var body = $('t-body');
    body.textContent = '';
    sorted.forEach(function (inv) {
      var st = statusOf(inv);
      var pill = el('span', { class: 'pill' + (st === 'paid' ? ' ok' : st === 'review' ? ' warn' : st === 'overdue' ? ' bad' : '') }, [
        st === 'paid' ? icon('check') : st === 'overdue' ? icon('clock') : st === 'review' ? icon('eye') : null, STATUS_LABEL[st]
      ]);
      var totalCell = el('td', { class: 'r num' });
      if (isEur(inv)) totalCell.append(el('strong', { style: 'font-weight:500', text: money(inv.total) }));
      else {
        totalCell.append(el('strong', { style: 'font-weight:500', text: inv.eur != null ? money(inv.eur) : '–' }));
        totalCell.append(el('span', { class: 'foreign', text: money(inv.total, inv.currency) + (inv.eur == null ? ' · needs EUR' : '') }));
      }
      var tr = el('tr', { 'data-id': inv.id }, [
        el('td', { class: 'date num', text: dateStr(inv.issueDate) }),
        el('td', {}, [el('button', { type: 'button', class: 'vendor-btn', 'data-open': inv.id }, [
          el('span', { class: 'v', text: inv.vendor || inv.fileName }),
          el('span', { class: 'n', text: inv.number || (inv.vendor ? inv.fileName : '') })
        ])]),
        el('td', { class: 'muted', text: inv.category }),
        el('td', { class: 'r num muted', text: isEur(inv) ? money(inv.net) : money(inv.net, inv.currency) }),
        el('td', { class: 'r num muted', text: isEur(inv) ? money(inv.vat) : money(inv.vat, inv.currency) }),
        totalCell,
        el('td', { class: 'date num', text: inv.paid ? (inv.paidDate ? 'Paid ' + dateStr(inv.paidDate) : 'Paid') : dateStr(inv.dueDate) }),
        el('td', {}, [pill])
      ]);
      body.append(tr);
    });
    $('t-empty').hidden = sorted.length > 0;
    $('t-note').textContent = plural(sorted.length, 'invoice', 'invoices') + ' · ' + money(sum(sorted, eurOf));
    document.querySelectorAll('thead th[data-sort]').forEach(function (th) {
      var btn = th.querySelector('button');
      var old = btn.querySelector('svg');
      if (old) old.remove();
      if (th.dataset.sort === s.key) {
        th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending');
        btn.append(icon(s.dir > 0 ? 'sortUp' : 'sortDown'));
      } else th.removeAttribute('aria-sort');
    });
  }

  // ---------- detail / review dialog ----------

  var openToken = 0;

  function fillCategorySelect(select, value) {
    var cats = state.settings.categories.slice();
    if (value && cats.indexOf(value) === -1) cats.push(value);
    if (cats.indexOf('Other') === -1) cats.push('Other');
    setOptions(select, cats.map(function (c) { return [c, c]; }), value || 'Other');
  }

  function openDetail(id, queue) {
    var inv = state.invoices.find(function (x) { return x.id === id; });
    if (!inv) return;
    state.current = inv;
    if (queue) state.queue = queue;
    var token = ++openToken;
    var dlg = $('detail');
    var qi = state.queue.indexOf(id);
    var inQueue = qi !== -1 && state.queue.length > 0 && inv.status === 'review';
    $('d-eyebrow').textContent = inQueue
      ? 'TO CHECK · ' + (qi + 1) + ' OF ' + state.queue.length
      : (STATUS_LABEL[statusOf(inv)] + ' · ' + inv.fileName).toUpperCase();
    $('d-title').textContent = inv.vendor || inv.fileName;
    $('d-vendor').value = inv.vendor || '';
    $('d-number').value = inv.number || '';
    $('d-taxid').value = inv.vendorTaxId || '';
    $('d-issue').value = inv.issueDate || '';
    $('d-due').value = inv.dueDate || '';
    fillCategorySelect($('d-cat'), inv.category);
    var cur = $('d-cur');
    if (!Array.from(cur.options).some(function (o) { return o.value === inv.currency; })) cur.append(el('option', { value: inv.currency, text: inv.currency }));
    cur.value = inv.currency || 'EUR';
    $('d-total').value = amountText(inv.total);
    $('d-vat').value = amountText(inv.vat);
    $('d-net').value = amountText(inv.net);
    $('d-eur').value = amountText(inv.eur);
    $('d-paid').checked = !!inv.paid;
    $('d-paid-date').value = inv.paidDate || '';
    $('d-notes').value = inv.notes || '';
    $('d-remember').checked = true;
    $('d-text').textContent = inv.text || '(no text was found in this PDF)';
    document.querySelectorAll('#detail .tag[data-for]').forEach(function (t) {
      var c = (inv.confidence || {})[t.dataset.for];
      t.hidden = inv.status !== 'review' || !(c === 'low' || c === 'none' || c == null);
    });
    $('d-skip').hidden = !inQueue || qi === state.queue.length - 1;
    $('d-save').textContent = inQueue && qi < state.queue.length - 1 ? 'Save & next' : 'Save';
    $('d-scanned').hidden = !(inv.scanned || inv.readError);
    $('d-ocr-status').textContent = '';
    $('d-ocr').disabled = false;
    syncDetailUi();
    renderAlerts(inv);
    if (!dlg.open) dlg.showModal();
    $('d-pages').textContent = '';
    renderPreview(inv, token);
    setTimeout(function () {
      var firstCheck = document.querySelector('#detail .tag[data-for]:not([hidden])');
      var target = firstCheck ? firstCheck.closest('.f').querySelector('input,select') : $('d-vendor');
      if (target) target.focus();
    }, 30);
  }

  function renderAlerts(inv) {
    var box = $('d-alerts');
    box.textContent = '';
    var add = function (kind, text) { box.append(el('div', { class: 'alert ' + kind }, [icon('alert'), el('span', { text: text })])); };
    if (inv.readError) add('bad', 'This PDF could not be read (it may be password-protected). The file is saved; enter the details by hand.');
    if (inv.duplicateOf) {
      var o = state.invoices.find(function (x) { return x.id === inv.duplicateOf; });
      if (o) add('warn', 'Looks like a duplicate of ' + (o.vendor || o.fileName) + (o.number ? ' ' + o.number : '') + ' from ' + dateStr(o.issueDate) + '. Delete one if it is the same invoice.');
    }
  }

  function syncDetailUi() {
    var cur = $('d-cur').value;
    $('d-eur-wrap').hidden = cur === 'EUR';
    $('d-paid-date-wrap').hidden = !$('d-paid').checked;
    var total = parseAmount($('d-total').value);
    var vat = parseAmount($('d-vat').value);
    var net = parseAmount($('d-net').value);
    var hint = $('d-math');
    hint.textContent = '';
    if (total == null) { hint.textContent = 'Enter the total to include this invoice in your costs.'; return; }
    if (vat != null && net != null) {
      var diff = Math.round((net + vat - total) * 100) / 100;
      if (Math.abs(diff) < 0.015) hint.textContent = 'Net + VAT = total ✓';
      else {
        hint.append('Net + VAT is ' + money(Math.abs(diff), cur) + (diff > 0 ? ' more' : ' less') + ' than the total. ');
        hint.append(el('button', { type: 'button', text: 'Set net to total − VAT', onclick: function () { $('d-net').value = amountText(Math.round((total - vat) * 100) / 100); syncDetailUi(); } }));
      }
    } else if (vat != null && net == null) {
      hint.append(el('button', { type: 'button', text: 'Fill net as total − VAT', onclick: function () { $('d-net').value = amountText(Math.round((total - vat) * 100) / 100); syncDetailUi(); } }));
    }
  }

  async function renderPreview(inv, token) {
    var holder = $('d-pages');
    if (state.previewDoc) { try { state.previewDoc.destroy(); } catch (e) { /* ignore */ } state.previewDoc = null; }
    try {
      var rec = await idb.get('files', inv.id);
      if (!rec || token !== openToken) return;
      var buf = await rec.blob.arrayBuffer();
      if (!PDFJS) throw new Error('pdf.js missing');
      var pdf = await PDFJS.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
      if (token !== openToken) { pdf.destroy(); return; }
      state.previewDoc = pdf;
      var width = Math.min(760, (holder.clientWidth || 520));
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var count = Math.min(pdf.numPages, 6);
      for (var p = 1; p <= count; p++) {
        var page = await pdf.getPage(p);
        if (token !== openToken) return;
        var base = page.getViewport({ scale: 1 });
        var vp = page.getViewport({ scale: (width / base.width) * dpr });
        var canvas = el('canvas', { 'aria-label': 'Page ' + p + ' of ' + pdf.numPages });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = width + 'px';
        holder.append(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
      if (pdf.numPages > count) holder.append(el('p', { class: 'more', text: '+ ' + (pdf.numPages - count) + ' more pages — download the PDF to see them all.' }));
    } catch (e) {
      if (token === openToken) holder.append(el('p', { class: 'more', text: 'The preview could not be shown. You can still download the PDF.' }));
    }
  }

  function collectDetail() {
    var inv = state.current;
    inv.vendor = $('d-vendor').value.trim();
    inv.number = $('d-number').value.trim();
    inv.vendorTaxId = $('d-taxid').value.replace(/\s/g, '').toUpperCase();
    inv.issueDate = $('d-issue').value || null;
    inv.dueDate = $('d-due').value || null;
    inv.category = $('d-cat').value || 'Other';
    inv.currency = $('d-cur').value || 'EUR';
    inv.total = parseAmount($('d-total').value);
    inv.vat = parseAmount($('d-vat').value);
    inv.net = parseAmount($('d-net').value);
    inv.eur = inv.currency === 'EUR' ? null : parseAmount($('d-eur').value);
    inv.paid = $('d-paid').checked;
    inv.paidDate = inv.paid ? ($('d-paid-date').value || todayIso()) : null;
    inv.notes = $('d-notes').value.trim();
    inv.updatedAt = new Date().toISOString();
    return inv;
  }

  function learnRule(inv) {
    if (!inv.vendor) return;
    var rule = { vendor: inv.vendor, category: inv.category, updatedAt: new Date().toISOString() };
    if (inv.vendorTaxId) state.rules['id:' + inv.vendorTaxId] = rule;
    else {
      var needle = P.norm(inv.detectedVendor || inv.vendor).trim();
      if (needle.length >= 5 && P.norm(inv.text || '').indexOf(needle) !== -1) state.rules['name:' + needle] = rule;
      else return;
    }
    return saveRules();
  }

  async function saveDetail() {
    var inv = collectDetail();
    var wasReview = inv.status === 'review';
    inv.status = 'ok';
    delete inv.duplicateOf;
    var dup = possibleDuplicate(inv);
    if (dup) inv.duplicateOf = dup.id;
    try {
      await idb.put('invoices', inv);
      if ($('d-remember').checked) await learnRule(inv);
    } catch (e) {
      toast('Could not save: ' + e.message);
      return;
    }
    render();
    var qi = state.queue.indexOf(inv.id);
    if (wasReview && qi !== -1 && qi < state.queue.length - 1) {
      var next = state.queue.slice(qi + 1).find(function (id) { var x = state.invoices.find(function (i) { return i.id === id; }); return x && x.status === 'review'; });
      if (next) { openDetail(next); return; }
    }
    $('detail').close();
    toast('Saved ' + (inv.vendor || inv.fileName) + '.');
  }

  function skipDetail() {
    var qi = state.queue.indexOf(state.current.id);
    var next = state.queue[qi + 1];
    if (next) openDetail(next); else $('detail').close();
  }

  async function deleteCurrent() {
    var inv = state.current;
    if (!inv) return;
    if (!window.confirm('Delete ' + (inv.vendor || inv.fileName) + (inv.number ? ' ' + inv.number : '') + '? The PDF is removed from this browser.')) return;
    await idb.del('files', inv.id);
    await idb.del('invoices', inv.id);
    state.invoices = state.invoices.filter(function (x) { return x.id !== inv.id; });
    var qi = state.queue.indexOf(inv.id);
    state.queue = state.queue.filter(function (id) { return id !== inv.id; });
    render();
    updateStorageLine();
    var next = qi !== -1 ? state.queue[qi] : null;
    if (next) openDetail(next); else $('detail').close();
    toast('Invoice deleted.');
  }

  async function downloadCurrent() {
    var inv = state.current;
    var rec = inv && await idb.get('files', inv.id);
    if (rec) saveBlob(rec.blob, niceName(inv));
  }

  async function runOcr() {
    var inv = state.current;
    if (!inv || !state.previewDoc) return;
    var status = $('d-ocr-status');
    var btn = $('d-ocr');
    btn.disabled = true;
    status.textContent = 'Loading OCR (first time takes a while)…';
    try {
      await loadScript(TESSERACT_URL);
      var worker = await window.Tesseract.createWorker('slv+eng');
      var lines = [];
      var pdf = state.previewDoc;
      var count = Math.min(pdf.numPages, 3);
      for (var p = 1; p <= count; p++) {
        status.textContent = 'Reading page ' + p + ' of ' + count + '…';
        var page = await pdf.getPage(p);
        var vp = page.getViewport({ scale: 2.2 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        var res = await worker.recognize(canvas);
        lines = lines.concat(String(res.data.text || '').split('\n'));
      }
      await worker.terminate();
      var parsed = P.parseInvoice(lines, parserOptions());
      var fill = function (id, value, fmt) { var input = $(id); if (!input.value && value != null && value !== '') input.value = fmt ? fmt(value) : value; };
      fill('d-vendor', parsed.vendor);
      fill('d-number', parsed.number);
      fill('d-taxid', parsed.vendorTaxId);
      fill('d-issue', parsed.issueDate);
      fill('d-due', parsed.dueDate);
      fill('d-total', parsed.total, amountText);
      fill('d-vat', parsed.vat, amountText);
      fill('d-net', parsed.net, amountText);
      if (parsed.currency && $('d-cur').value === 'EUR' && parsed.currency !== 'EUR') $('d-cur').value = parsed.currency;
      if (parsed.category && parsed.category !== 'Other' && $('d-cat').value === 'Other') $('d-cat').value = parsed.category;
      inv.text = lines.join('\n').slice(0, 40000);
      inv.ocr = true;
      $('d-text').textContent = inv.text;
      status.textContent = 'Done. Check the fields — OCR makes mistakes.';
      syncDetailUi();
    } catch (e) {
      console.error(e);
      status.textContent = 'OCR could not run here (' + e.message + '). Enter the amounts by hand.';
      btn.disabled = false;
    }
  }

  // ---------- export, backup, restore ----------

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function stamp() { return todayIso(); }
  function dec(v) { return v == null || isNaN(v) ? '' : v.toFixed(2).replace('.', ','); }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(list) {
    var head = ['Invoice date', 'Due date', 'Vendor', 'Vendor VAT ID', 'Invoice number', 'Category', 'Currency', 'Net', 'VAT', 'Total', 'Total EUR', 'Paid', 'Paid on', 'Status', 'Notes', 'File'];
    var rows = list.map(function (inv) {
      return [inv.issueDate, inv.dueDate, inv.vendor, inv.vendorTaxId, inv.number, inv.category, inv.currency, dec(inv.net), dec(inv.vat), dec(inv.total), dec(eurOf(inv)), inv.paid ? 'yes' : 'no', inv.paidDate, STATUS_LABEL[statusOf(inv)], inv.notes, niceName(inv)];
    });
    return '﻿' + [head].concat(rows).map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
  }
  function sortedForExport(list) { return list.slice().sort(function (a, b) { return dateOf(a) < dateOf(b) ? -1 : 1; }); }

  function exportCsv() {
    var list = sortedForExport(filtered());
    if (!list.length) { toast('No invoices to export with these filters.'); return; }
    saveBlob(new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' }), 'invoices-' + stamp() + '.csv');
  }

  async function exportZip(kind) {
    var list = kind === 'backup' ? state.invoices.slice() : sortedForExport(filtered());
    if (!list.length) { toast('No invoices to export.'); return; }
    var t = toast('Preparing the .zip…', { progress: true });
    try {
      await loadScript(JSZIP_URL);
      var zip = new window.JSZip();
      var used = {};
      for (var i = 0; i < list.length; i++) {
        var inv = list[i];
        t.update('Adding ' + (i + 1) + ' of ' + list.length + '…');
        var rec = await idb.get('files', inv.id);
        if (!rec) continue;
        if (kind === 'backup') zip.file('files/' + inv.id + '.pdf', rec.blob);
        else {
          var name = niceName(inv);
          var base = name.replace(/\.pdf$/, '');
          var n = 2;
          while (used[name]) name = base + '-' + (n++) + '.pdf';
          used[name] = true;
          zip.file('pdf/' + name, rec.blob);
        }
      }
      if (kind === 'backup') {
        zip.file('invoices.json', JSON.stringify({ app: 'adrial-invoices', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, rules: state.rules, invoices: list }, null, 1));
      } else {
        zip.file('invoices.csv', toCsv(list));
      }
      var blob = await zip.generateAsync({ type: 'blob' });
      t.close();
      saveBlob(blob, (kind === 'backup' ? 'invoices-backup-' : 'invoices-for-accountant-') + stamp() + '.zip');
    } catch (e) {
      t.close();
      toast('Export failed: ' + e.message);
    }
  }

  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 500) : ''; }
  function numOrNull(v) { return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null; }
  function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function cleanInvoice(o) {
    return {
      id: str(o.id, 80) || uid(), hash: str(o.hash, 128), fileName: str(o.fileName, 260) || 'invoice.pdf',
      size: typeof o.size === 'number' ? o.size : 0, pages: typeof o.pages === 'number' ? o.pages : 0,
      addedAt: str(o.addedAt, 40) || new Date().toISOString(), updatedAt: str(o.updatedAt, 40) || undefined,
      vendor: str(o.vendor, 200), detectedVendor: str(o.detectedVendor, 200), vendorTaxId: str(o.vendorTaxId, 30),
      number: str(o.number, 80), issueDate: isoOrNull(o.issueDate), dueDate: isoOrNull(o.dueDate),
      currency: /^[A-Z]{3}$/.test(o.currency) ? o.currency : 'EUR', total: numOrNull(o.total), vat: numOrNull(o.vat),
      net: numOrNull(o.net), eur: numOrNull(o.eur), category: str(o.category, 80) || 'Other', notes: str(o.notes, 4000),
      paid: o.paid === true, paidDate: isoOrNull(o.paidDate), status: o.status === 'review' ? 'review' : 'ok',
      scanned: o.scanned === true, readError: o.readError === true, ocr: o.ocr === true,
      confidence: o.confidence && typeof o.confidence === 'object' ? o.confidence : {}, text: str(o.text, 40000)
    };
  }

  async function restoreBackup(file) {
    var t = toast('Reading the backup…', { progress: true });
    try {
      await loadScript(JSZIP_URL);
      var zip = await window.JSZip.loadAsync(file);
      var jsonFile = zip.file('invoices.json');
      if (!jsonFile) throw new Error('this is not an Invoices backup');
      var data = JSON.parse(await jsonFile.async('string'));
      if (!data || data.app !== 'adrial-invoices' || !Array.isArray(data.invoices)) throw new Error('this is not an Invoices backup');
      var added = 0;
      var skipped = 0;
      for (var i = 0; i < data.invoices.length; i++) {
        var inv = cleanInvoice(data.invoices[i] || {});
        if (state.invoices.some(function (x) { return x.id === inv.id || (inv.hash && x.hash === inv.hash); })) { skipped++; continue; }
        var pdf = zip.file('files/' + inv.id + '.pdf');
        if (!pdf) { skipped++; continue; }
        var blob = new Blob([await pdf.async('arraybuffer')], { type: 'application/pdf' });
        await idb.put('files', { id: inv.id, blob: blob });
        await idb.put('invoices', inv);
        state.invoices.push(inv);
        added++;
        t.update('Restored ' + added + '…');
      }
      if (data.rules && typeof data.rules === 'object') {
        Object.keys(data.rules).forEach(function (k) {
          var r = data.rules[k];
          if (!state.rules[k] && r && typeof r.vendor === 'string') state.rules[k] = { vendor: str(r.vendor, 200), category: str(r.category, 80) || 'Other' };
        });
        await saveRules();
      }
      if (data.settings && Array.isArray(data.settings.categories)) {
        data.settings.categories.forEach(function (c) { if (typeof c === 'string' && state.settings.categories.indexOf(c) === -1) state.settings.categories.push(c.slice(0, 80)); });
        await saveSettings();
      }
      t.close();
      requestPersist();
      render();
      updateStorageLine();
      toast('Restored ' + plural(added, 'invoice', 'invoices') + (skipped ? ' · ' + skipped + ' already here or missing' : '') + '.');
    } catch (e) {
      t.close();
      toast('Could not restore: ' + e.message + '.');
    }
  }

  // ---------- settings ----------

  function openSettings() {
    var s = state.settings;
    $('s-own').value = s.ownNames.join(', ');
    $('s-ownids').value = s.ownTaxIds.join(', ');
    $('s-cats').value = s.categories.join('\n');
    renderRules();
    updateStorageLine();
    $('settings').showModal();
  }
  function renderRules() {
    var ul = $('s-rules');
    ul.textContent = '';
    var keys = Object.keys(state.rules).sort(function (a, b) { return state.rules[a].vendor.localeCompare(state.rules[b].vendor); });
    $('s-rules-help').hidden = keys.length > 0;
    if (!keys.length) { ul.append(el('li', {}, [el('span', { class: 'muted', text: 'None yet.' })])); return; }
    keys.forEach(function (k) {
      var r = state.rules[k];
      ul.append(el('li', {}, [
        el('span', {}, [el('strong', { style: 'font-weight:500', text: r.vendor }), ' → ' + r.category, el('br'), el('small', { text: k.indexOf('id:') === 0 ? 'VAT ID ' + k.slice(3) : 'Name on PDF: ' + k.slice(5) })]),
        el('button', { type: 'button', class: 'btn small ghost', text: 'Forget', onclick: function () { delete state.rules[k]; saveRules(); renderRules(); } })
      ]));
    });
  }
  function saveSettingsForm() {
    var split = function (s) { return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean); };
    state.settings.ownNames = split($('s-own').value);
    state.settings.ownTaxIds = split($('s-ownids').value).map(function (x) { return x.replace(/\s/g, '').toUpperCase(); });
    var cats = $('s-cats').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    if (cats.indexOf('Other') === -1) cats.push('Other');
    state.settings.categories = Array.from(new Set(cats));
    saveSettings();
    $('settings').close();
    render();
    toast('Settings saved.');
  }
  async function wipeAll() {
    if (!window.confirm('Delete every invoice and setting from this browser? This cannot be undone.')) return;
    await idb.clear('files');
    await idb.clear('invoices');
    await idb.clear('kv');
    state.invoices = [];
    state.rules = {};
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    $('settings').close();
    render();
    updateStorageLine();
    toast('Everything was deleted.');
  }

  // ---------- events ----------

  function bind() {
    var fileInput = $('file-input');
    $('add-btn').addEventListener('click', function () { fileInput.click(); });
    $('add-btn-2').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { var files = Array.from(fileInput.files || []); fileInput.value = ''; importFiles(files); });

    var menu = $('export-menu');
    menu.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        menu.removeAttribute('open');
        var act = b.dataset.act;
        if (act === 'csv') exportCsv();
        else if (act === 'accountant') exportZip('accountant');
        else if (act === 'backup') exportZip('backup');
        else if (act === 'restore') $('restore-input').click();
      });
    });
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.removeAttribute('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.open) { menu.removeAttribute('open'); menu.querySelector('summary').focus(); } });
    $('restore-input').addEventListener('change', function () { var f = this.files[0]; this.value = ''; if (f) restoreBackup(f); });

    $('settings-btn').addEventListener('click', openSettings);
    $('s-close').addEventListener('click', function () { $('settings').close(); });
    $('s-cancel').addEventListener('click', function () { $('settings').close(); });
    $('settings-form').addEventListener('submit', function (e) { e.preventDefault(); saveSettingsForm(); });
    $('s-wipe').addEventListener('click', wipeAll);

    $('review-btn').addEventListener('click', function () {
      var ids = state.invoices.filter(function (x) { return x.status === 'review'; }).sort(function (a, b) { return a.addedAt < b.addedAt ? -1 : 1; }).map(function (x) { return x.id; });
      if (ids.length) openDetail(ids[0], ids);
    });

    var onFilter = function (key, input) {
      input.addEventListener('change', function () {
        state.filters[key] = input.value;
        if (key === 'year' && !input.value) state.filters.month = '';
        saveUi();
        render();
      });
    };
    onFilter('year', $('f-year'));
    onFilter('month', $('f-month'));
    onFilter('cat', $('f-cat'));
    onFilter('status', $('f-status'));
    var qTimer = null;
    $('f-q').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { state.filters.q = v; saveUi(); render(); }, 160);
    });
    $('f-vendor-clear').addEventListener('click', function () { state.filters.vendor = ''; saveUi(); render(); });

    document.querySelectorAll('thead th[data-sort] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.parentElement.dataset.sort;
        if (state.sort.key === key) state.sort.dir = -state.sort.dir;
        else state.sort = { key: key, dir: key === 'vendor' || key === 'category' ? 1 : -1 };
        saveUi();
        render();
      });
    });
    $('t-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) openDetail(tr.dataset.id, []);
    });

    var dlg = $('detail');
    $('detail-form').addEventListener('submit', function (e) { e.preventDefault(); saveDetail(); });
    $('d-close').addEventListener('click', function () { dlg.close(); });
    $('d-skip').addEventListener('click', skipDetail);
    $('d-delete').addEventListener('click', deleteCurrent);
    $('d-download').addEventListener('click', downloadCurrent);
    $('d-ocr').addEventListener('click', runOcr);
    ['d-cur', 'd-paid', 'd-total', 'd-vat', 'd-net'].forEach(function (id) {
      $(id).addEventListener('input', syncDetailUi);
      $(id).addEventListener('change', syncDetailUi);
    });
    $('d-paid').addEventListener('change', function () { if (this.checked && !$('d-paid-date').value) $('d-paid-date').value = todayIso(); });
    dlg.addEventListener('close', function () {
      openToken++;
      state.queue = [];
      if (state.previewDoc) { try { state.previewDoc.destroy(); } catch (e) { /* ignore */ } state.previewDoc = null; }
      $('d-pages').textContent = '';
    });

    var overlay = $('drop-overlay');
    var depth = 0;
    var hasFiles = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; };
    window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
    window.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      importFiles(e.dataTransfer.files);
    });
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  // ---------- start ----------

  async function start() {
    bind();
    var hadUi = loadUi();
    try {
      var rows = await Promise.all([idb.all('invoices'), idb.get('kv', 'settings'), idb.get('kv', 'rules')]);
      state.invoices = rows[0] || [];
      if (rows[1] && rows[1].value) state.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), rows[1].value);
      if (rows[2] && rows[2].value) state.rules = rows[2].value;
    } catch (e) {
      console.error(e);
      $('storage-error').hidden = false;
    }
    if (!hadUi) {
      var thisYear = String(new Date().getFullYear());
      var years = state.invoices.map(function (x) { return dateOf(x).slice(0, 4); }).sort();
      state.filters.year = years.indexOf(thisYear) !== -1 || !years.length ? thisYear : years[years.length - 1];
    }
    render();
    updateStorageLine();
  }

  // exposed for the end-to-end test only
  window.__invoicesApp = { state: state, importFiles: importFiles };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
