// Skenirnica: scanner batches, import, demo OCR, templates, dispatch, intake log.

import { isoLocal, toDate, fmtDateTime, parseDate, dayKey } from '../core/format.js';
import { categoryLabel, CATEGORIES } from '../core/schema.js';
import { renderInvoicePage, renderAttachmentPage } from '../core/page-svg.js';
import { AccessError, flag, userCompanies } from './access.js';
import { hexId, ValidationError, validateHolder, takeUploadedBlob, extractFromPage, Service } from './service.js';
import { holderShort } from './access.js';
import { makeInvoiceSpec } from './demo-data.js';

const need = (c, m) => { if (!c) throw new ValidationError(m); };

function scanCompanies(svc, user) {
  return userCompanies(svc.s, user).filter((c) => flag(svc.s, user, c.id, 'scan')).map((c) => c.id);
}
function getBatch(svc, user, id) {
  const b = svc.s.batches.find((x) => x.id === id);
  if (!b) throw new ValidationError('Paket ne obstaja.');
  if (!scanCompanies(svc, user).includes(b.companyId)) throw new AccessError('Nimate dostopa do skenirnice tega podjetja.');
  return b;
}
function intakeDoc(b, id) {
  const d = b.docs.find((x) => x.id === id);
  if (!d) throw new ValidationError('Dokument v paketu ne obstaja.');
  return d;
}

export function batchGroup(svc, b) {
  const company = svc.company(b.companyId)?.name?.toUpperCase() || '';
  if (b.source) return `${b.source} - ${company}`;
  return `${(svc.user(b.operatorId)?.name || 'NEZNAN').toUpperCase()} - ${company}`;
}

function summary(svc, b) {
  return {
    id: b.id, companyId: b.companyId, group: batchGroup(svc, b), createdAt: b.createdAt, source: b.source,
    operator: svc.user(b.operatorId)?.name || '',
    docs: b.docs.map((d) => ({ ...d })),
    pageCount: b.docs.reduce((n, d) => n + d.pages.length, 0),
  };
}

export function newIntakeDoc(svc, user, b, patch = {}) {
  const prefs = svc.s.personal[user.id]?.scanner || {};
  const at = svc.now();
  const d = {
    id: hexId(8), direction: 'in', category: patch.category || 'racun', sender: '', senderPartnerId: null,
    receivedDate: prefs.noAutoDate === true ? '' : at.slice(0, 10), subject: '', comment: '', fields: {}, extracted: [],
    pages: [], templateId: null, colour: !!patch.colour, source: patch.source ?? '', ocr: patch.ocr !== false, createdAt: at,
  };
  Object.assign(d, patch);
  b.docs.push(d);
  return d;
}

function autoSubject(svc, user, d) {
  const prefs = svc.s.personal[user.id]?.scanner || {};
  if (prefs.noAutoSubject) return;
  if (d.subject) return;
  const label = categoryLabel(d.category);
  d.subject = d.sender ? `${label} od ${d.sender} (${fmtDateTime(svc.now())})` : '';
}

function applyOcr(svc, d, page) {
  if (!d.ocr || !page.mime.includes('svg')) return;
  const { extracted, meta } = extractFromPage(svc, page.blobId, d.category);
  if (!meta) return;
  d.extracted = extracted;
  for (const x of extracted) if (x.value != null && d.fields[x.key] == null) d.fields[x.key] = x.value;
  if (meta.values?.issuerName && !d.sender) d.sender = meta.values.issuerName;
  if (meta.issuer && !d.sender) d.sender = meta.issuer;
}

function matchPartner(svc, companyId, name) {
  if (!name) return null;
  const lc = name.toLocaleLowerCase('sl');
  return svc.s.partners.find((p) => p.companyId === companyId && (p.shortName.toLocaleLowerCase('sl') === lc || p.fullName.toLocaleLowerCase('sl') === lc)) || null;
}

// Demo scanner: produces a synthetic page (an invoice from a directory partner).
export function demoScanPage(svc, user, companyId, { colour, rngSeed } = {}) {
  const seed = rngSeed ?? (svc.s.meta.scanSeq = (svc.s.meta.scanSeq || 0) + 1) + 1000;
  const partners = svc.s.partners.filter((p) => p.companyId === companyId && !p.oneTime);
  const partner = partners[seed % partners.length];
  const spec = makeInvoiceSpec(seed, partner, svc.company(companyId), toDate(svc.now()));
  spec.grey = !colour;
  const { svg } = renderInvoicePage(spec);
  const blob = svc.store.putBlob(Buffer.from(svg), { mime: 'image/svg+xml', name: `sken_${String(seed).padStart(5, '0')}.svg`, owner: { type: 'batch' } });
  return { blob, partner, spec };
}

export const INTAKE_API = {
  listBatches(svc, user, a) {
    const cids = scanCompanies(svc, user);
    if (!cids.length) throw new AccessError('Nimate dostopa do skenirnice.');
    const want = a.companyId && a.companyId !== 'all' ? [a.companyId] : cids;
    const list = svc.s.batches.filter((b) => !b.dispatched && want.includes(b.companyId) && cids.includes(b.companyId))
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return { batches: list.map((b) => summary(svc, b)), templates: svc.s.templates.filter((t) => cids.includes(t.companyId)) };
  },
  getBatch(svc, user, a) { return summary(svc, getBatch(svc, user, a.id)); },

  newBatch(svc, user, a) {
    const cids = scanCompanies(svc, user);
    const cid = a.companyId && a.companyId !== 'all' ? a.companyId : cids[0];
    if (!cids.includes(cid)) throw new AccessError('Nimate dostopa do skenirnice tega podjetja.');
    const b = { id: hexId(8), companyId: cid, source: null, operatorId: user.id, createdAt: svc.now(), docs: [], dispatched: false };
    svc.s.batches.push(b);
    svc.commit();
    return summary(svc, b);
  },

  scanPages(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const prefs = svc.s.personal[user.id]?.scanner || {};
    const { blob, partner } = demoScanPage(svc, user, b.companyId, { colour: !!a.colour });
    blob.owner = { type: 'batch', id: b.id };
    const page = { blobId: blob.id, mime: blob.mime, name: blob.name };
    let d;
    if (a.intoDocId) { d = intakeDoc(b, a.intoDocId); d.pages.push(page); }
    else {
      d = newIntakeDoc(svc, user, b, { category: a.category || 'racun', colour: !!a.colour, source: '', ocr: a.ocr ?? !prefs.noOcrDefault });
      d.pages.push(page);
      applyOcr(svc, d, page);
      if (d.ocr) { d.sender = d.sender || partner.shortName; d.senderPartnerId = partner.id; }
      autoSubject(svc, user, d);
    }
    svc.log(user, 'Skener', 'scan', 'demo', `Demo skener (simulacija) – ${blob.name}`);
    svc.commit();
    return { batch: summary(svc, b), docId: d.id };
  },

  importFiles(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    need(Array.isArray(a.blobIds) && a.blobIds.length, 'Izberite datoteke za uvoz.');
    need(!a.category || CATEGORIES.some((c) => c.id === a.category), 'Neveljaven tip dokumenta.');
    const pages = a.blobIds.map((id) => {
      const m = takeUploadedBlob(svc, user, id, { type: 'batch', id: b.id });
      return { blobId: m.id, mime: m.mime, name: m.name };
    });
    const created = [];
    if (a.intoDocId) {
      const d = intakeDoc(b, a.intoDocId);
      d.pages.push(...pages);
    } else {
      const groups = a.perFile ? pages.map((p) => [p]) : [pages];
      for (const g of groups) {
        const d = newIntakeDoc(svc, user, b, { category: a.category || 'racun', colour: !!a.colour, source: 'Uvoz', ocr: a.ocr !== false });
        d.pages.push(...g);
        applyOcr(svc, d, g[0]);
        if (d.sender) { const p = matchPartner(svc, b.companyId, d.sender); if (p) d.senderPartnerId = p.id; }
        autoSubject(svc, user, d);
        created.push(d.id);
      }
    }
    svc.log(user, 'Uvoz', 'import', 'ok', `${pages.length} datotek uvoženih v paket (izvirne datoteke ohranjene)`);
    svc.commit();
    return { batch: summary(svc, b), created };
  },

  newDocNoImage(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const d = newIntakeDoc(svc, user, b, { category: a.category || 'racun', source: '', ocr: false });
    svc.commit();
    return { batch: summary(svc, b), docId: d.id };
  },

  attachToPrevious(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const i = b.docs.findIndex((x) => x.id === a.docId);
    need(i > 0, 'Prejšnjega dokumenta ni.');
    const [d] = b.docs.splice(i, 1);
    b.docs[i - 1].pages.push(...d.pages);
    svc.commit();
    return { batch: summary(svc, b), docId: b.docs[i - 1].id };
  },

  deleteIntake(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    if (a.docId) {
      const d = intakeDoc(b, a.docId);
      if (a.pageIndex != null) d.pages.splice(a.pageIndex, 1);
      else b.docs = b.docs.filter((x) => x.id !== a.docId);
    } else {
      need(!b.docs.length || a.force, 'Paket ni prazen.');
      svc.s.batches = svc.s.batches.filter((x) => x.id !== b.id);
      svc.commit();
      return { deleted: true };
    }
    svc.commit();
    return { batch: summary(svc, b) };
  },

  updateIntakeDoc(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const d = intakeDoc(b, a.docId);
    const p = a.patch || {};
    if (p.direction) need(['in', 'out', 'internal'].includes(p.direction), 'Neveljavna smer.');
    if (p.category) need(CATEGORIES.some((c) => c.id === p.category), 'Neveljaven tip.');
    for (const k of ['direction', 'category', 'sender', 'senderPartnerId', 'subject', 'receivedDate', 'comment']) if (k in p) d[k] = p[k];
    if (p.fields) d.fields = { ...d.fields, ...p.fields };
    if ('sender' in p && !p.senderPartnerId) { const m = matchPartner(svc, b.companyId, p.sender); d.senderPartnerId = m?.id || null; }
    svc.commit();
    return { batch: summary(svc, b) };
  },

  resetFields(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const d = intakeDoc(b, a.docId);
    d.fields = {};
    for (const x of d.extracted) if (x.value != null) d.fields[x.key] = x.value;
    d.templateId = null;
    svc.commit();
    return { batch: summary(svc, b) };
  },

  teachTemplate(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const d = intakeDoc(b, a.docId);
    need(d.sender, 'Za učenje predloge izpolnite pošiljatelja.');
    const keep = ['vrsta_dokumenta', 'oddelek', 'nacin_nabave', 'stroskovni_nosilec', 'nacin_placila', 'valuta'];
    const t = {
      id: hexId(6), companyId: b.companyId, name: a.name || `Predloga: ${d.sender}`, senderMatch: d.sender,
      defaults: { category: d.category, direction: d.direction, fields: Object.fromEntries(keep.filter((k) => d.fields[k] != null).map((k) => [k, d.fields[k]])) },
      createdAt: svc.now(), createdBy: user.id,
    };
    svc.s.templates = svc.s.templates.filter((x) => !(x.companyId === b.companyId && x.senderMatch === d.sender));
    svc.s.templates.push(t);
    d.templateId = t.id;
    svc.commit();
    return { template: t, batch: summary(svc, b) };
  },

  recognizeTemplates(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    let n = 0;
    for (const d of b.docs) {
      const t = svc.s.templates.find((x) => x.companyId === b.companyId && x.senderMatch && d.sender &&
        x.senderMatch.toLocaleLowerCase('sl') === d.sender.toLocaleLowerCase('sl'));
      if (!t) continue;
      d.templateId = t.id;
      d.category = t.defaults.category || d.category;
      d.direction = t.defaults.direction || d.direction;
      d.fields = { ...d.fields, ...t.defaults.fields };
      n++;
    }
    svc.commit();
    return { recognized: n, batch: summary(svc, b) };
  },

  dispatchIntake(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    const mode = a.mode || 'users';
    let targets = a.targets || [];
    if (mode === 'myoffice') targets = [`user:${user.id}`];
    need(targets.length, 'Izberite prejemnike.');
    if (mode === 'direct') need(targets.length === 1 && targets[0].startsWith('user:'), 'Izberite enega uporabnika.');
    for (const t of targets) validateHolder(svc, t, b.companyId);
    const list = (a.docIds?.length ? a.docIds : b.docs.map((d) => d.id)).map((id) => intakeDoc(b, id));
    need(list.length, 'Paket je prazen.');
    const created = [];
    for (const d of list) {
      created.push(dispatchOne(svc, user, b, d, targets).id);
      b.docs = b.docs.filter((x) => x.id !== d.id);
    }
    if (!b.docs.length) b.dispatched = true;
    svc.commit();
    return { created, batchDone: b.dispatched };
  },

  batchReport(svc, user, a) {
    const b = getBatch(svc, user, a.batchId);
    return {
      group: batchGroup(svc, b), createdAt: b.createdAt,
      rows: b.docs.map((d, i) => ({ n: i + 1, id: d.id, direction: d.direction, category: categoryLabel(d.category), sender: d.sender, subject: d.subject, receivedDate: d.receivedDate, pages: d.pages.length, comment: d.comment })),
    };
  },

  // ---------------------------------------------------------------- intake log
  searchIntakeLog(svc, user, a) {
    const cids = scanCompanies(svc, user);
    const c = a.criteria || {};
    const cid = c.companyId && c.companyId !== 'all' ? c.companyId : null;
    if (cid && !cids.includes(cid)) throw new AccessError('Nimate dostopa do dnevnika tega podjetja.');
    const dateOk = (v, crit) => {
      if (!crit?.value) return true;
      const want = dayKey(parseDate(crit.value));
      const have = dayKey(v);
      if (want == null) return true;
      if (have == null) return false;
      return crit.op === 'lt' ? have < want : have === want;
    };
    const lc = (s) => String(s || '').toLocaleLowerCase('sl');
    const rows = svc.s.intakeLog.filter((e) => cids.includes(e.companyId) && (!cid || e.companyId === cid) &&
      dateOk(e.sentAt, c.sentAt) && dateOk(e.receivedAt, c.receivedAt) && dateOk(e.createdAt, c.createdAt) &&
      (!c.sender || lc(e.sender).includes(lc(c.sender))) && (!c.recipient || lc(e.recipient).includes(lc(c.recipient))) &&
      (!c.category?.value || (c.category.op === 'notIn' ? e.category !== c.category.value : e.category === c.category.value)) &&
      (!c.direction || e.direction === c.direction));
    return { rows: [...rows].sort((x, y) => y.seq - x.seq) };
  },
  addLogEntry(svc, user, a) {
    const cids = scanCompanies(svc, user);
    const e = a.entry || {};
    const cid = e.companyId || cids[0];
    if (!cids.includes(cid)) throw new AccessError('Nimate dostopa do dnevnika tega podjetja.');
    need(e.subject, 'Vnesite predmet.');
    const entry = logEntry(svc, user, {
      companyId: cid, source: 'Ročni vnos', subject: String(e.subject), category: e.category || 'racun', sender: String(e.sender || ''),
      recipient: String(e.recipient || svc.company(cid).name), direction: e.direction || 'Prejeta pošta',
      sentAt: e.sentAt || null, receivedAt: e.receivedAt || svc.now(), manual: true, forwarded: '',
    });
    svc.commit();
    return entry;
  },
  deleteLogEntry(svc, user, a) {
    const cids = scanCompanies(svc, user);
    const e = svc.s.intakeLog.find((x) => x.id === a.id);
    need(e && cids.includes(e.companyId), 'Vnos ne obstaja.');
    need(e.manual, 'Brisati je mogoče le ročne vnose.');
    svc.s.intakeLog = svc.s.intakeLog.filter((x) => x.id !== a.id);
    svc.commit();
    return { ok: true };
  },
};

function logEntry(svc, user, p) {
  const seq = (svc.s.meta.logSeq = (svc.s.meta.logSeq || 0) + 1);
  const year = svc.now().slice(0, 4);
  const entry = {
    id: hexId(6), seq, protocol: `${year}-${String(seq).padStart(5, '0')}`, author: user.name, source: p.source,
    forwarded: p.forwarded || '', sif: '', batchId: p.batchId || '', docId: p.docId || '', subject: p.subject,
    category: p.category, recipient: p.recipient, sender: p.sender, createdAt: p.createdAt || svc.now(),
    sentAt: p.sentAt || null, receivedAt: p.receivedAt || null, direction: p.direction, companyId: p.companyId, manual: !!p.manual,
  };
  svc.s.intakeLog.push(entry);
  return entry;
}

const SOURCE_LABEL = { '': 'Skener', Uvoz: 'Uvoz', 'Moj-eRačun Plugin': 'Moj-eRačun Plugin' };

export function dispatchOne(svc, user, b, d, targets) {
  const company = svc.company(b.companyId);
  const at = svc.now();
  const f = { ...d.fields };
  if (d.category === 'racun') {
    f.datum_prejema ??= d.receivedDate || at.slice(0, 10);
    f.datum_opravljene_storitve ??= f.datum_opr_stor_izdaje_blaga ?? null;
    f.datum_zapadlosti ??= f.datum_zapadlosti_rok_placila ?? null;
    f.status ??= 'Prejet';
    f.izdajatelj ??= d.sender;
    f.prejemnik ??= company.name;
    f.valuta ??= 'EUR';
    f.valuta_racuna ??= f.valuta;
    f.naziv_izdajatelja ??= d.sender;
    f.naziv_kupca ??= company.name;
    f.placano ??= false;
  } else if (d.category === 'predracun') {
    f.izdajatelj ??= d.sender; f.prejemnik ??= company.name; f.valuta ??= 'EUR';
  } else if (d.category === 'pogodbe') {
    f.izdajatelj ??= d.sender; f.valuta ??= 'EUR';
  }
  const receivedAt = d.receivedDate ? (d.receivedDate.length > 10 ? d.receivedDate : `${d.receivedDate}T${at.slice(11)}`) : at;
  const doc = svc.newDocument({
    companyId: b.companyId, category: d.category, direction: d.direction, subject: d.subject || `${categoryLabel(d.category)} od ${d.sender || 'neznanega pošiljatelja'}`,
    sender: d.direction === 'out' ? company.name : d.sender, senderPartnerId: d.senderPartnerId,
    recipient: d.direction === 'out' ? d.sender : company.name, source: d.source, filename: d.pages[0]?.name || '',
    sentAt: d.sentAt || receivedAt, receivedAt, at, authorId: user.id, fields: f, extracted: d.extracted,
    pages: d.pages.map((p, i) => ({ ...p, label: `Stran ${i + 1}` })), templateName: svc.s.templates.find((t) => t.id === d.templateId)?.name || '',
    comments: d.comment ? [{ id: hexId(4), userId: user.id, at, text: d.comment }] : [],
  });
  for (const p of d.pages) { const m = svc.s.blobs[p.blobId]; if (m) m.owner = { type: 'doc', id: doc.id }; }
  const scanner = svc.s.users.find((u) => u.scannerFor === b.companyId);
  svc.event(doc, 'Nov', scanner || user, { at });
  svc.event(doc, 'Prejet', scanner || user, { at, detail: `Vir: ${SOURCE_LABEL[d.source] ?? d.source}` });
  if (scanner) {
    doc.signatures.push({ id: hexId(6), kind: 'signed', label: 'Podpisal(a)', name: `${scanner.name}, ${company.name.toUpperCase()}`, at, demo: true });
    svc.event(doc, 'Podpisan', scanner, { at, detail: 'Demo pečat skenirnice – brez certifikata.' });
  }
  if (d.comment) svc.event(doc, 'Komentar dodan', user, { at, detail: d.comment });
  svc.moveTo(doc, targets, at);
  svc.event(doc, 'Posredovan', user, { at, from: user.name, toUsers: targets.map((h) => holderShort(svc.s, h)).join(', ') });
  const entry = logEntry(svc, user, {
    companyId: b.companyId, source: SOURCE_LABEL[d.source] ?? d.source, forwarded: targets.map((h) => holderShort(svc.s, h)).join(', '),
    batchId: b.id, docId: doc.id, subject: doc.subject, category: d.category, recipient: doc.recipient, sender: doc.sender,
    createdAt: at, sentAt: doc.sentAt, receivedAt: doc.receivedAt, direction: d.direction === 'out' ? 'Poslana pošta' : d.direction === 'internal' ? 'Interna pošta' : 'Prejeta pošta',
  });
  doc.protocol = entry.protocol;
  doc.barcode = `EBA${String(entry.seq).padStart(8, '0')}`;
  return doc;
}

// Synthetic attachment page for multi-page fixtures.
export function attachmentBlob(svc, title, seed, grey) {
  const { svg } = renderAttachmentPage({ title, seed, grey });
  return svc.store.putBlob(Buffer.from(svg), { mime: 'image/svg+xml', name: `priloga_${seed}.svg`, owner: { type: 'batch' } });
}

export { Service, isoLocal };
