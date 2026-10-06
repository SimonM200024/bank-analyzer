// Builds the fictional demo database. Documents are created by running the
// real intake and workflow operations with a simulated clock, so every audit
// trail, status, routing and count is produced by the same code the UI uses.

import { isoLocal } from '../core/format.js';
import { DOC_TYPES, PAYMENT_METHODS, DEPARTMENTS, COST_CARRIERS, PROCUREMENT } from '../core/schema.js';
import { renderInvoicePage, renderContractPage } from '../core/page-svg.js';
import { Service, API, hashPassword, hexId } from './service.js';
import { dispatchOne, attachmentBlob } from './intake.js';
import { intakeFromValues } from './adapters.js';
import { toBytes } from '../core/bytes.js';
import { BRAND } from '../core/brand.js';
import { COMPANIES, SUPPLIERS, CUSTOMERS, partnerRecord, makeInvoiceSpec, rng, pickR } from './demo-data.js';

const R = ['read', 'edit', 'initial', 'sign', 'forward', 'reject', 'dispatch', 'archive', 'delete', 'classify', 'grant', 'tag', 'pantheon'];
const without = (...x) => R.filter((a) => !x.includes(a));
const per = (racun, predracun = [], pogodbe = []) => ({ racun, predracun, pogodbe });

function roles() {
  const P = (c, path) => `${COMPANIES.find((x) => x.id === c).name}/${path}`;
  const role = (id, c, path, perms, extra = {}) => ({ id, companyId: c, path: P(c, path), name: path.split('/').pop(), perms, ...extra });
  return [
    role('r1', 'c1', 'Centrala/Finance/Sodelavec v oddelku računovodstva',
      per(['read', 'edit', 'initial', 'sign', 'forward', 'reject', 'dispatch', 'archive', 'classify', 'grant', 'tag', 'pantheon'], ['read', 'edit', 'forward', 'reject', 'archive', 'tag'], ['read', 'tag']),
      { scan: true, directory: true }),
    role('r2', 'c1', 'Centrala/Analitika/Analitik', per(['read', 'tag'], ['read'], ['read'])),
    role('r3', 'c1', 'Centrala/Direktor/Direktor', per(without('delete', 'pantheon'), without('delete', 'pantheon'), without('delete', 'pantheon')), { supervise: true }),
    role('r4', 'c1', 'Centrala/Finance/Vodja financ', per(without('delete'), without('delete'), ['read', 'edit', 'initial', 'forward', 'tag']), { supervise: true, directory: true }),
    role('r5', 'c1', 'Centrala/Uprava/Operativna direktorica', per(['read', 'initial', 'forward', 'reject', 'tag'], ['read', 'initial', 'forward', 'reject'], ['read', 'initial', 'forward']), { supervise: true }),
    role('r6', 'c1', 'Centrala/Upravnik', per(R, R, R), { admin: true, supervise: true, settings: true, scan: true, directory: true }),
    role('r7', 'c1', 'Centrala/Zunanji računovodski servis/Računovodja', per(['read'])),
    role('r8', 'c1', 'Centrala/Skenirnica', per(['read'], ['read'], ['read']), { scan: true }),
    role('r21', 'c2', 'Centrala/Računovodstvo', per(['read', 'edit', 'initial', 'forward', 'reject', 'archive', 'tag', 'pantheon', 'classify'], ['read', 'edit', 'forward'], ['read']), { scan: true, directory: true }),
    role('r22', 'c2', 'Centrala/Direktor', per(without('delete', 'pantheon'), without('delete'), without('delete')), { supervise: true }),
    role('r23', 'c2', 'Centrala/Upravnik', per(R, R, R), { admin: true, supervise: true, settings: true, scan: true, directory: true }),
    role('r24', 'c2', 'Centrala/Skenirnica', per(['read'], ['read'], ['read']), { scan: true }),
    role('r31', 'c3', 'Centrala/Računovodstvo', per(['read', 'edit', 'initial', 'forward', 'tag'], ['read'], ['read']), { scan: true, directory: true }),
    role('r33', 'c3', 'Centrala/Upravnik', per(R, R, R), { admin: true, supervise: true, settings: true, scan: true, directory: true }),
    role('r41', 'c4', 'Centrala/Računovodstvo', per(['read', 'edit', 'initial', 'forward', 'reject', 'tag', 'archive'], ['read', 'edit'], ['read']), { scan: true, directory: true }),
    role('r43', 'c4', 'Centrala/Upravnik', per(R, R, R), { admin: true, supervise: true, settings: true, scan: true, directory: true }),
  ];
}

function users() {
  const pw = hashPassword('demo');
  const u = (id, username, name, roleIds, extra = {}) => ({ id, username, name, roleIds, password: pw, defaultCompanyId: 'c1', ...extra });
  return [
    u('u1', 'mnovak', 'Maja Novak', ['r1', 'r41']),
    u('u2', 'jkovac', 'Jana Kovač', ['r3']),
    u('u3', 'pzupan', 'Peter Župan', ['r2']),
    u('u4', 'ahorvat', 'Andrej Horvat', ['r6', 'r23', 'r33', 'r43']),
    u('u5', 'tkrajnc', 'Tina Krajnc', ['r7']),
    u('u6', 'lmlakar', 'Luka Mlakar', ['r21'], { defaultCompanyId: 'c2' }),
    u('u7', 'bzorko', 'Barbara Zorko', ['r4']),
    u('u8', 'nkos', 'Nina Kos', ['r5']),
    u('u9', 'egolob', 'Eva Golob', ['r22'], { defaultCompanyId: 'c2' }),
    u('u10', 'skenirnica-lipnik', 'Skenirnica LIPNIK', ['r8'], { login: false, scannerFor: 'c1' }),
    u('u11', 'skenirnica-javor', 'Skenirnica JAVOR MG', ['r24'], { login: false, scannerFor: 'c2', defaultCompanyId: 'c2' }),
    u('u12', 'skenirnica-tisa', 'Skenirnica TISA 91', [], { login: false }),
  ];
}

export function baseState(now) {
  const partners = [];
  for (const c of COMPANIES) {
    SUPPLIERS.forEach((row, i) => partners.push(partnerRecord(i, row, c.id, 'supplier')));
    CUSTOMERS.forEach((row, i) => partners.push(partnerRecord(i, row, c.id, 'customer')));
  }
  return {
    meta: { version: 1, createdAt: now, demoInbox: 6, logSeq: 0, scanSeq: 0, pantheonSeq: 0 },
    companies: COMPANIES.map((c) => ({ ...c })), roles: roles(), users: users(), partners,
    documents: [], batches: [], intakeLog: [], templates: [],
    rules: [
      { id: 'rule1', companyId: 'c1', name: 'Potrjen s strani direktorice - v računovodstvo', trigger: 'initial', category: 'racun', direction: 'in', actorRoleIds: ['r3'], extStatus: 1, coverStatus: 'Potrjen', forwardTo: ['role:r1'] },
      { id: 'rule2', companyId: 'c1', name: 'Potrjen s strani vodje - direktorici', trigger: 'initial', category: 'racun', direction: 'in', actorRoleIds: ['r4', 'r5'], extStatus: 2, coverStatus: 'Potrjen vodja oddelka', forwardTo: ['role:r3'] },
      { id: 'rule3', companyId: 'c2', name: 'Potrjen s strani direktorja - v računovodstvo', trigger: 'initial', category: 'racun', direction: 'in', actorRoleIds: ['r22'], extStatus: 1, coverStatus: 'Potrjen', forwardTo: ['role:r21'] },
    ],
    tags: { c1: ['Nujno', 'Reklamacija', 'Za plačilo', 'Mesečni strošek'], c2: ['Nujno'], c3: [], c4: [] },
    personal: {},
    settings: {
      connections: [{
        id: 'conn1', status: 'Omogočena', name: 'Lipnik (demo)', type: 'PostgreSQL', testAgency: false, createdAt: now, auxiliary: false,
        dbName: 'eba_demo', username: 'eba_demo_user', password: 'demo-db-secret', server: 'localhost', port: 'Privzeto', file: '',
        useProxy: true, proxyName: 'Lokalni proxy (demo)', proxyUrl: 'http://127.0.0.1:8889', proxyPassword: 'demo-proxy-secret',
        mode: 'Samodejno', localScannerDb: '', extraVars: '', connectionId: '',
      }],
      system: { proxyMode: 'direct', proxy: '', proxyPort: 0, proxyAuth: false, env: [{ key: `${BRAND.env}_LIST_LIMIT`, value: '1000', concealed: false }], language: 'Slovenščina', logFolder: '', logLevel: '' },
    },
    integrationLog: [], outbox: [], blobs: {}, coverOverrides: {},
  };
}

// ---------------------------------------------------------------------------
export function buildFixtures(store, realNow = new Date()) {
  const base = new Date(realNow); base.setSeconds(0, 0);
  store.init(baseState(isoLocal(base)));
  let sim = new Date(base);
  const svc = new Service(store, { clock: () => sim });
  const at = (daysAgo, h, m, s = 0) => { const d = new Date(base); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, s, 0); return d; };
  const set = (d) => { sim = new Date(d); };
  const plus = (mins) => { sim = new Date(sim.getTime() + mins * 60000); return sim; };
  const U = (id) => svc.user(id);
  const r = rng(42);
  const save = store.save.bind(store);
  store.save = () => {}; // batch all fixture writes into one save

  const companyPartners = (cid) => svc.s.partners.filter((p) => p.companyId === cid && p.kind === 'supplier');

  // Create one incoming document via a batch + dispatch, as the given operator.
  function receive({ cid, operator, targets, partner, kind = 'racun', when, source = 'MOJERACUNPLUGIN', extraPages = 0, printIssueDate, fieldPatch = {}, grantRoles = [] }) {
    set(when);
    const company = svc.company(cid);
    const seed = Math.floor(r() * 1e6);
    let blob, values, regions;
    if (kind === 'pogodbe') {
      const spec = { seed, number: `P-${when.getFullYear()}/${String(Math.floor(r() * 900) + 100)}`, issuer: { ...partner, name: partner.fullName }, recipient: { ...company }, date: isoLocal(when, false),
        validFrom: isoLocal(when, false), validTo: `${when.getFullYear() + 1}-12-31`, value: Math.round(r() * 40000 + 2000), subjectText: pickR(r, ['vzdrževanje informacijske opreme', 'dobavo pisarniškega materiala', 'čiščenje prostorov', 'najem vozil', 'svetovalne storitve']) };
      const res = renderContractPage(spec);
      blob = store.putBlob(toBytes(res.svg), { mime: 'image/svg+xml', name: `pogodba_${seed}.svg`, owner: { type: 'batch' } });
      values = res.values; regions = res.regions;
      fieldPatch = { stevilka_pogodbe: spec.number, datum_pogodbe: spec.date, veljavnost_od: spec.validFrom, veljavnost_do: spec.validTo, vrednost_pogodbe: spec.value, ...fieldPatch };
    } else {
      const spec = makeInvoiceSpec(seed, partner, company, when, { kind, printIssueDate });
      const res = renderInvoicePage(spec);
      blob = store.putBlob(toBytes(res.svg), { mime: 'image/svg+xml', name: `${kind === 'predracun' ? 'predracun' : 'racun'}_${spec.number.replace(/[^A-Za-z0-9-]/g, '')}.svg`, owner: { type: 'batch' } });
      values = { ...res.values };
      regions = res.regions;
      if (printIssueDate === false) values.datum_racuna = spec.issueDate;
      if (kind === 'predracun') fieldPatch = { stevilka_predracuna: spec.number, datum_predracuna: spec.issueDate, skupni_znesek_racuna: res.values.total, datum_zapadlosti: spec.dueDate, ...fieldPatch };
      fieldPatch = { valuta: spec.currency, valuta_racuna: spec.currency, ...fieldPatch };
      if (kind === 'racun') {
        const net = res.values.net, vat = res.values.vat;
        fieldPatch = {
          skupni_neto_znesek_racuna: net, skupni_znesek_ddv: vat, koncni_znesek: res.values.total, ddv_osnovna_stopnja_osnova: net,
          ddv_osnovna_stopnja_stopnja: 22, ddv_osnovna_stopnja_znesek: vat, naslov_izdajatelja: partner.address, kraj_izdajatelja: partner.city,
          postna_stevilka_izdajatelja: partner.postal, davcna_st_izdajatelja: partner.taxNo, id_za_ddv_izdajatelja: partner.vatId,
          izdajateljev_trr: partner.trr, bic_koda_izdajatelejeve_banke: partner.bic, naziv_izdajateljeve_banke: partner.bank,
          koda_drzave_izdajatelja: partner.vatId.slice(0, 2), naziv_drzave_izdajatelja: partner.country, davcna_st_kupca: company.vatId.slice(2),
          id_za_ddv_kupca: company.vatId, naslov_kupca: company.address, kraj_kupca: company.city, postna_stevilka_kupca: company.postal,
          drzava_kupca: company.country, tip_racuna_sifra: 'Račun', funkcija_racuna_sifra: 'Original', kraj_izdaje_racuna: partner.city,
          nacin_placila: pickR(r, PAYMENT_METHODS), vrsta_dokumenta: pickR(r, DOC_TYPES), nacin_nabave: partner.country === 'SLOVENIJA' ? 'Rezident' : 'Nerezident',
          koda_namena_placila: 'OTHR', stevilka_narocila_kupceva: r() > 0.6 ? `NAR-${Math.floor(r() * 9000) + 1000}` : undefined,
          tables: undefined,
          ...fieldPatch,
        };
        for (const k of Object.keys(fieldPatch)) if (fieldPatch[k] === undefined) delete fieldPatch[k];
      }
    }
    const batch = { id: hexId(8), companyId: cid, source: source === 'MOJERACUNPLUGIN' ? 'MOJERACUNPLUGIN' : null, operatorId: operator.id, createdAt: isoLocal(when), docs: [], dispatched: false };
    svc.s.batches.push(batch);
    const d = intakeFromValues(svc, blob, partner, values, regions, isoLocal(when), source === 'MOJERACUNPLUGIN' ? 'Moj-eRačun Plugin' : 'Uvoz');
    d.category = kind;
    if (kind !== 'racun') {
      d.extracted = d.extracted.filter((x) => x.key in values || ['stevilka_pogodbe', 'datum_pogodbe'].includes(x.key));
      if (kind === 'predracun') {
        d.extracted = [['stevilka_predracuna', 'Številka predračuna', 'text'], ['datum_predracuna', 'Datum predračuna', 'date'], ['skupni_znesek_racuna', 'Znesek predračuna', 'amount']]
          .map(([key, label, type]) => ({ key, label, type, value: values[key] ?? null, region: regions[key] ? { page: 0, ...regions[key] } : null, pattern: '' }));
      }
      if (kind === 'pogodbe') {
        d.extracted = [['stevilka_pogodbe', 'Številka pogodbe', 'text'], ['datum_pogodbe', 'Datum pogodbe', 'date']]
          .map(([key, label, type]) => ({ key, label, type, value: values[key] ?? null, region: regions[key] ? { page: 0, ...regions[key] } : null, pattern: '' }));
      }
    }
    d.fields = { ...d.fields, ...fieldPatch };
    if (kind === 'racun' && fieldPatch.lines) delete d.fields.lines;
    for (let i = 0; i < extraPages; i++) {
      const b = attachmentBlob(svc, i === 0 ? 'Dobavnica' : 'Splošni pogoji', seed + i, false);
      d.pages.push({ blobId: b.id, mime: b.mime, name: b.name });
    }
    batch.docs.push(d);
    d.subject = `${kind === 'pogodbe' ? 'Pogodbe' : kind === 'predracun' ? 'Predračun' : 'Račun'} od ${partner.shortName} (${fmtShort(when)})`;
    const doc = dispatchOne(svc, operator, batch, d, targets);
    batch.docs = [];
    batch.dispatched = true;
    if (kind === 'racun') {
      const spec = makeInvoiceSpec(seed, partner, company, when, { kind, printIssueDate });
      doc.tables.lines = spec.lines.map((l, i) => ({ ident: `${4190 + i}${String(seed).slice(0, 3)}`, cena: l.price, kolic: l.qty, rabat: 0, ddv_pct: String(l.vatRate), ddv_s: '', ddv: '', znes: '', konto: '', odd: '', sn: '', dob: '', opo: '' }));
      doc.tables.taxes = [{ naziv: `DDV ${spec.lines[0].vatRate} %`, osnova: values.net, stopnja: spec.lines[0].vatRate, znesek: values.vat }];
    }
    if (grantRoles.length) {
      plus(1);
      API.grantAccess(svc, U('u4'), { id: doc.id, holders: grantRoles });
    }
    return doc;
  }

  const fmtShort = (d) => `${String(d.getDate()).padStart(2, '0')}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // Keep simulated follow-up actions inside office hours (07:00-17:59).
  function biz(d) {
    const x = new Date(d);
    if (x.getHours() < 7) x.setHours(7 + (x.getMinutes() % 3), x.getMinutes());
    if (x.getHours() > 17) { x.setDate(x.getDate() + 1); x.setHours(7 + (x.getMinutes() % 4), x.getMinutes()); }
    return x > base ? new Date(base.getTime() - 3600000) : x;
  }
  function open(doc, user, when) { set(biz(when)); API.getDocument(svc, user, { id: doc.id, open: true }); }

  function approveByDirector(doc, when, patch) {
    const jana = U('u2');
    open(doc, jana, when);
    plus(2);
    API.claim(svc, jana, { id: doc.id });
    if (patch) { plus(1); API.saveDocument(svc, jana, { id: doc.id, fields: patch }); }
    plus(0.05);
    API.initial(svc, jana, { id: doc.id });
  }

  // ------------------------------------------------------------- LIPNIK invoices
  const maja = U('u1');
  const suppliers = companyPartners('c1');
  const plan = [];
  const states = [
    ...Array(12).fill('prejet'), ...Array(4).fill('vodja'), ...Array(22).fill('potrjen'), ...Array(10).fill('kontroliran'),
    ...Array(12).fill('pantheon'), ...Array(4).fill('hramba'), ...Array(3).fill('zavrnjen'),
  ];
  // Older documents tend to be further along the workflow.
  const order = { pantheon: 0, hramba: 0, kontroliran: 1, potrjen: 2, zavrnjen: 2, vodja: 3, prejet: 3 };
  states.sort((a, b) => order[a] - order[b] || r() - 0.5);
  states.forEach((st, i) => {
    const daysAgo = Math.max(1, Math.round(38 - (i / states.length) * 36 + (r() - 0.5) * 3));
    plan.push({ st, when: at(daysAgo, 8 + Math.floor(r() * 9), Math.floor(r() * 60)) });
  });
  plan.sort((a, b) => a.when - b.when);

  for (const { st, when } of plan) {
    const partner = suppliers[Math.floor(r() * suppliers.length)];
    const viaVodja = st === 'vodja';
    const doc = receive({ cid: 'c1', operator: maja, targets: [viaVodja ? 'role:r4' : 'role:r3'], partner, when, extraPages: r() > 0.8 ? 1 : 0,
      source: r() > 0.25 ? 'MOJERACUNPLUGIN' : 'Uvoz', grantRoles: ['role:r2', 'role:r1'] });
    const t1 = biz(new Date(when.getTime() + (3 + r() * 40) * 3600000));
    if (st === 'prejet') { if (r() > 0.5) open(doc, U('u2'), t1); continue; }
    if (st === 'vodja') {
      const barbara = U('u7');
      open(doc, barbara, t1); plus(3); API.claim(svc, barbara, { id: doc.id }); plus(1); API.initial(svc, barbara, { id: doc.id });
      continue;
    }
    if (st === 'zavrnjen') {
      const jana = U('u2');
      open(doc, jana, t1); plus(2); API.claim(svc, jana, { id: doc.id }); plus(1);
      API.reject(svc, jana, { id: doc.id, reason: pickR(r, ['Napačen prejemnik', 'Manjka naročilnica', 'Dvojnik računa']) });
      continue;
    }
    approveByDirector(doc, t1, r() > 0.4 ? { oddelek: pickR(r, DEPARTMENTS), stroskovni_nosilec: pickR(r, COST_CARRIERS) } : null);
    const t2 = biz(new Date(t1.getTime() + (2 + r() * 30) * 3600000));
    if (st === 'potrjen') { if (r() > 0.4) open(doc, maja, t2); continue; }
    open(doc, maja, t2); plus(1);
    API.claim(svc, maja, { id: doc.id }); plus(2);
    API.setExternalStatus(svc, maja, { id: doc.id, code: 3 });
    if (st === 'kontroliran') continue;
    plus(30);
    API.saveDocument(svc, maja, { id: doc.id, fields: { placano: r() > 0.3, konto_obv: '2200', stevilka_temeljnice: `T-${Math.floor(r() * 900) + 100}` } });
    plus(5);
    API.pantheonTransfer(svc, maja, { id: doc.id });
    if (st === 'hramba') { plus(60 * 24); API.archive(svc, maja, { id: doc.id }); }
  }

  // ------------------------------------------------------------- representative invoice
  {
    const partner = suppliers[0];
    const when = at(6, 10, 30, 0);
    const doc = receive({ cid: 'c1', operator: maja, targets: ['role:r3'], partner, when, printIssueDate: false, grantRoles: ['role:r2', 'role:r1'] });
    doc.fields.vrsta_dokumenta = '1K00 - str. računi kartice';
    doc.fields.nacin_placila = '';
    doc.fields.placano = true;
    doc.fields.saldo = 0;
    doc.fields.nacin_nabave = 'Nerezident';
    const t1 = at(5, 7, 5, 10);
    approveByDirector(doc, t1, { oddelek: '1 - Uprava', stroskovni_nosilec: 'Splošno' });
    open(doc, U('u3'), at(5, 12, 36, 33));
    open(doc, U('u4'), at(1, 10, 5, 1));
    doc.fields.datum_racuna = doc.fields.datum_racuna || doc.extracted.find((x) => x.key === 'datum_racuna')?.value;
  }

  // ------------------------------------------------------------- pro formas
  const pros = [];
  for (let i = 0; i < 4; i++) {
    const partner = suppliers[(i * 7 + 3) % suppliers.length];
    const doc = receive({ cid: 'c1', operator: maja, targets: ['role:r1'], partner, kind: 'predracun', when: at(30 - i * 8, 11 + i, 10 + i * 7), source: 'Uvoz' });
    pros.push(doc);
    if (i !== 3) open(doc, maja, at(29 - i * 8, 9, 15));
  }
  // Link one pro forma with a paid invoice (expandable row).
  {
    const inv = svc.s.documents.find((d) => d.category === 'racun' && d.externalStatus === 4 && d.companyId === 'c1');
    set(at(3, 9, 0));
    API.linkDocuments(svc, maja, { id: pros[1].id, targetIds: [inv.id], kind: 'embedded' });
    inv.tables.proformas = [{ stevilka: pros[1].fields.stevilka_predracuna, znesek: pros[1].fields.skupni_znesek_racuna, datum: pros[1].fields.datum_predracuna, placano: true }];
  }

  // ------------------------------------------------------------- contracts
  for (let i = 0; i < 10; i++) {
    const partner = suppliers[(i * 5 + 1) % suppliers.length];
    const doc = receive({ cid: 'c1', operator: maja, targets: ['role:r3'], partner, kind: 'pogodbe', when: at(36 - i, 12, 8 + i * 3), source: 'Uvoz', grantRoles: ['role:r1'] });
    open(doc, U('u2'), at(35 - i, 8, 30));
    if (i % 3 === 0) { set(at(34 - i, 9, 0)); API.classify(svc, U('u2'), { id: doc.id, code: '03.01' }); }
  }

  // ------------------------------------------------------------- outgoing invoices
  const customers = svc.s.partners.filter((p) => p.companyId === 'c1' && p.kind === 'customer');
  const outStates = ['sent', 'queued', 'queued', 'signed', 'prep', 'prep'];
  outStates.forEach((st, i) => {
    const cust = customers[i % customers.length];
    const when = at(9 - i, 9 + i, 12);
    set(when);
    const company = svc.company('c1');
    const spec = makeInvoiceSpec(900 + i, { ...cust }, company, when, { number: `2026-${String(310 + i).padStart(5, '0')}` });
    spec.issuer = { name: company.name, address: company.address, postal: company.postal, city: company.city, country: company.country, vatId: company.vatId, trr: company.trr, bic: 'DEMOSI2X', bank: 'Demo banka d.d.' };
    spec.recipient = { name: cust.fullName, address: cust.address, postal: cust.postal, city: cust.city, country: cust.country, vatId: cust.vatId };
    const res = renderInvoicePage(spec);
    const blob = store.putBlob(toBytes(res.svg), { mime: 'image/svg+xml', name: `izdani_${spec.number}.svg`, owner: { type: 'doc' } });
    const doc = svc.newDocument({
      companyId: 'c1', category: 'racun', direction: 'out', subject: `Račun ${spec.number} za ${cust.shortName}`, sender: company.name,
      recipient: cust.shortName, recipientPartnerId: cust.id, source: '', filename: blob.name, authorId: 'u4', at: isoLocal(when),
      fields: { stevilka_racuna: spec.number, datum_racuna: spec.issueDate, datum_zapadlosti: spec.dueDate, datum_opravljene_storitve: spec.serviceDate,
        skupni_znesek_racuna: res.values.total, izdajatelj: company.name, prejemnik: cust.shortName, valuta: 'EUR', status: 'Prejet', placano: false },
      pages: [{ blobId: blob.id, mime: blob.mime, name: blob.name, label: 'Stran 1' }],
    });
    blob.owner = { type: 'doc', id: doc.id };
    svc.event(doc, 'Nov', U('u4'), { detail: 'Pripravljen iz demo predloge' });
    svc.moveTo(doc, ['role:r1'], isoLocal(when));
    if (i < 2) doc.readBy.push('u1');
    if (st !== 'prep') { plus(30); API.sign(svc, maja, { id: doc.id }); }
    if (st === 'queued' || st === 'sent') { plus(5); API.dispatchAction(svc, maja, { id: doc.id, op: 'toDispatch' }); }
    if (st === 'sent') { plus(10); const exchangeInbox = svc.s.meta.demoInbox; svc.s.meta.demoInbox = 0; API.sendReceive(svc, maja, { companyId: 'c1' }); svc.s.meta.demoInbox = exchangeInbox; }
  });

  // ------------------------------------------------------------- other companies
  const luka = U('u6');
  const javorSup = companyPartners('c2');
  for (let i = 0; i < 12; i++) {
    const doc = receive({ cid: 'c2', operator: luka, targets: ['role:r22'], partner: javorSup[(i * 3) % javorSup.length], when: at(25 - i * 2, 9 + (i % 7), 5 * i % 60) });
    if (i < 7) {
      const eva = U('u9');
      open(doc, eva, at(24 - i * 2, 14, 0)); plus(1); API.claim(svc, eva, { id: doc.id }); plus(1); API.initial(svc, eva, { id: doc.id });
    }
  }
  const andrej = U('u4');
  for (const [cid, n] of [['c3', 5], ['c4', 4]]) {
    const sup = companyPartners(cid);
    for (let i = 0; i < n; i++) {
      receive({ cid, operator: andrej, targets: [cid === 'c3' ? 'role:r31' : 'role:r41'], partner: sup[(i * 4 + 2) % sup.length], when: at(20 - i * 3, 10, 15), source: 'Uvoz' });
    }
  }

  // ------------------------------------------------------------- pending scanner batches
  const pending = [
    [12, 12, 47, 1, 0], [12, 13, 2, 2, 1], [11, 14, 2, 1, 1], [11, 17, 2, 1, 2], [10, 13, 32, 1, 0], [9, 14, 47, 3, 1], [1, 9, 17, 1, 0],
  ];
  const lipnik = svc.company('c1');
  for (const [d, h, m, nDocs, extra] of pending) {
    const when = at(d, h, m);
    set(when);
    const batch = { id: hexId(8), companyId: 'c1', source: 'MOJERACUNPLUGIN', operatorId: null, createdAt: isoLocal(when), docs: [], dispatched: false };
    for (let k = 0; k < nDocs; k++) {
      const partner = suppliers[Math.floor(r() * suppliers.length)];
      const spec = makeInvoiceSpec(Math.floor(r() * 1e6), partner, lipnik, when);
      const res = renderInvoicePage(spec);
      const blob = store.putBlob(toBytes(res.svg), { mime: 'image/svg+xml', name: `eracun_${spec.number.replace(/[^A-Za-z0-9-]/g, '')}.svg`, owner: { type: 'batch', id: batch.id } });
      const intake = intakeFromValues(svc, blob, partner, res.values, res.regions, isoLocal(when), 'Moj-eRačun Plugin');
      // Received e-invoices: sender not yet confirmed ("Neznan" on the batch card).
      intake.sender = '';
      for (let e = 0; e < extra; e++) {
        const b = attachmentBlob(svc, e === 0 ? 'Specifikacija' : 'Priloga', k + e + d, false);
        b.owner = { type: 'batch', id: batch.id };
        intake.pages.push({ blobId: b.id, mime: b.mime, name: b.name });
      }
      batch.docs.push(intake);
    }
    svc.s.batches.push(batch);
  }
  // Operator batches
  for (const [cid, op, d] of [['c1', 'u1', 1], ['c2', 'u6', 1]]) {
    const when = at(d, 11, 23);
    set(when);
    svc.s.batches.push({ id: hexId(8), companyId: cid, source: null, operatorId: op, createdAt: isoLocal(when), docs: [], dispatched: false });
    const b = svc.s.batches[svc.s.batches.length - 1];
    const partner = companyPartners(cid)[5];
    const spec = makeInvoiceSpec(777 + d, partner, svc.company(cid), when);
    const res = renderInvoicePage(spec);
    const blob = store.putBlob(toBytes(res.svg), { mime: 'image/svg+xml', name: `uvoz_${spec.number.replace(/[^A-Za-z0-9-]/g, '')}.svg`, owner: { type: 'batch', id: b.id } });
    const intake = intakeFromValues(svc, blob, partner, res.values, res.regions, isoLocal(when), 'Uvoz');
    intake.subject = `Račun od ${partner.shortName}`;
    b.docs.push(intake);
  }

  // Templates
  svc.s.templates.push({ id: hexId(6), companyId: 'c1', name: `Predloga: ${suppliers[2].shortName}`, senderMatch: suppliers[2].shortName,
    defaults: { category: 'racun', direction: 'in', fields: { vrsta_dokumenta: '1200 - stroškovni računi', oddelek: '4 - Logistika', stroskovni_nosilec: 'Splošno' } }, createdAt: isoLocal(at(20, 9, 0)), createdBy: 'u1' });

  // Some personal notes and tags for the main user
  const lipDocs = svc.s.documents.filter((d) => d.companyId === 'c1' && d.category === 'racun' && d.direction === 'in' && !d.archived);
  set(at(2, 8, 0));
  for (const d of lipDocs.slice(-12, -9)) if (svc.s.documents.includes(d)) { try { API.addNote(svc, maja, { id: d.id }); } catch { /* not readable */ } }
  for (const d of lipDocs.slice(-20, -18)) { try { API.addTag(svc, maja, { id: d.id, tag: 'Nujno' }); } catch { /* ignore */ } }

  svc.s.integrationLog = svc.s.integrationLog.slice(-200);
  store.save = save;
  store.save();
  return svc.s;
}
