// Integration boundaries. Every adapter here is a local demo: it records what
// would have happened in the integration log and never contacts a network
// service, mail server, ERP, registry or database. Real adapters can replace
// these objects once credentials and wire contracts are supplied.

import { toDate, isoLocal } from '../core/format.js';
import { renderInvoicePage } from '../core/page-svg.js';
import { can, inOffice } from './access.js';
import { makeInvoiceSpec } from './demo-data.js';
import { toBytes } from '../core/bytes.js';
import { BRAND } from '../core/brand.js';

const DEMO = 'demo';

export const exchange = {
  // "Pošlji/Prejmi": send the dispatch queue, receive from the demo inbox.
  sendReceive(svc, user, companyIds) {
    const now = svc.now();
    let sent = 0;
    for (const doc of svc.s.documents) {
      if (doc.deleted || doc.direction !== 'out' || doc.dispatch?.state !== 'queued') continue;
      if (!companyIds.includes(doc.companyId)) continue;
      if (!can(svc.s, user, doc.companyId, doc.category, 'dispatch') || !inOffice(svc.s, user, doc, now)) continue;
      doc.dispatch = { state: 'sent', at: now, adapter: `${BRAND.exchange} (demo)` };
      svc.event(doc, 'Poslan', user, { detail: `${BRAND.exchange} (demo adapter): dokument ni bil dejansko poslan.` });
      sent++;
    }
    let received = 0;
    const inbox = svc.s.meta.demoInbox || 0;
    const cid = companyIds.find((c) => c === 'c1') || companyIds[0];
    if (inbox > 0 && cid && svc.s.users.some((u) => u.scannerFor === cid)) {
      const n = Math.min(2, inbox);
      const company = svc.company(cid);
      const partners = svc.s.partners.filter((p) => p.companyId === cid && !p.oneTime);
      const batch = { id: Math.random().toString(16).slice(2, 18).padEnd(16, '0'), companyId: cid, source: 'MOJERACUNPLUGIN', operatorId: null, createdAt: now, docs: [], dispatched: false };
      for (let i = 0; i < n; i++) {
        const seed = 5000 + (svc.s.meta.demoInboxSeq = (svc.s.meta.demoInboxSeq || 0) + 1);
        const partner = partners[seed % partners.length];
        const spec = makeInvoiceSpec(seed, partner, company, toDate(now));
        const { svg, values, regions } = renderInvoicePage(spec);
        const blob = svc.store.putBlob(toBytes(svg), { mime: 'image/svg+xml', name: `eracun_${seed}.svg`, owner: { type: 'batch', id: batch.id } });
        batch.docs.push(intakeFromValues(svc, blob, partner, values, regions, now, 'Moj-eRačun Plugin'));
      }
      svc.s.batches.push(batch);
      svc.s.meta.demoInbox = inbox - n;
      received = n;
    }
    svc.log(user, 'Pošlji/Prejmi', 'exchange', DEMO, `Poslano (simulirano): ${sent}, prejeto iz demo nabiralnika: ${received}`);
    return {
      sent, received, remaining: svc.s.meta.demoInbox || 0,
      message: `Pošlji/Prejmi (demo): ${sent} dokumentov označenih kot poslanih (brez dejanskega pošiljanja), ` +
        `${received} novih e-računov v Skenirnici › Paketi. Vir: demo nabiralnik, ne zunanja storitev.`,
    };
  },
};

export function intakeFromValues(svc, blob, partner, values, regions, at, source) {
  const extracted = [
    ['datum_opr_stor_izdaje_blaga', 'Datum opr. stor./ izdaje blaga', 'date'], ['datum_racuna', 'Datum računa', 'date'],
    ['datum_zapadlosti_rok_placila', 'Datum zapadlosti, rok plačila', 'date'], ['sklic_placila', 'Sklic plačila', 'text'],
    ['skupni_znesek_racuna', 'Skupni znesek računa', 'amount'], ['stevilka_racuna', 'Številka računa', 'text'],
  ].map(([key, label, type]) => ({ key, label, type, value: values[key] ?? null, region: regions[key] ? { page: 0, ...regions[key] } : null, pattern: '' }));
  const fields = {};
  for (const x of extracted) if (x.value != null) fields[x.key] = x.value;
  return {
    id: Math.random().toString(16).slice(2, 18).padEnd(16, '0'), direction: 'in', category: 'racun', sender: partner.shortName, senderPartnerId: partner.id,
    receivedDate: at.slice(0, 10), subject: '', comment: '', fields, extracted, pages: [{ blobId: blob.id, mime: blob.mime, name: blob.name }],
    templateId: null, colour: true, source, ocr: true, createdAt: at,
  };
}

export const pantheon = {
  transfer(svc, user, doc) {
    const at = svc.now();
    if (!doc.fields.stev_racuna_panteon) {
      const seq = (svc.s.meta.pantheonSeq = (svc.s.meta.pantheonSeq || 0) + 1);
      doc.fields.stev_racuna_panteon = `DEMO-${at.slice(2, 4)}-${String(seq).padStart(6, '0')}`;
    }
    doc.pantheon = { ref: doc.fields.stev_racuna_panteon, at, demo: true };
    if (doc.externalStatus !== 4) {
      const prev = doc.externalStatus;
      doc.externalStatus = 4;
      svc.event(doc, 'Spremenjen zunanji status', user, { status: `${extText(prev)} -> 4 - Prenešen v Pantheon` });
    }
    svc.event(doc, 'Izvožen', user, { detail: `Pantheon 5.5 (demo adapter), referenca ${doc.pantheon.ref}. Povezave s pravim ERP ni bilo.` });
    svc.log(user, 'Pantheon 5.5', 'transfer', DEMO, `${doc.id} -> ${doc.pantheon.ref}`);
  },
  link(svc, user, doc, ref) {
    const prev = doc.fields.stev_racuna_panteon;
    doc.fields.stev_racuna_panteon = ref;
    doc.pantheon = { ref, at: svc.now(), manual: true, demo: true };
    svc.event(doc, 'Sprememba na spremnem listu', user, { fields: `Štev. računa (Panteon): ${ref}`, prev: { stev_racuna_panteon: prev } });
    svc.log(user, 'Pantheon 5.5', 'manual-link', DEMO, `${doc.id} -> ${ref} (ročna povezava, brez preverjanja v ERP)`);
  },
  sync(svc, user, what) {
    svc.log(user, 'Pantheon 5.5', `sync-${what}`, DEMO, 'Demo adapter: povezava s Pantheonom ni nastavljena; ničesar ni bilo sinhronizirano.');
    return { ok: false, demo: true, message: `Sinhronizacija ${what === 'partners' ? 'partnerjev' : 'podatkov'} (demo): povezava s Pantheon 5.5 ni nastavljena, zato ni bilo prenesenih podatkov. Dogodek je zapisan v dnevnik.` };
  },
};

function extText(code) {
  const map = { 0: '0 - Prejet', 1: '1 - Potrjen', 2: '2 - Potrjen vodja oddelka', 3: '3 - Kontroliran', 4: '4 - Prenešen v Pantheon' };
  return map[code] ?? '';
}

export const email = {
  send(svc, user, { to, subject, body, docIds, kind }) {
    const entry = { at: svc.now(), kind, to: String(to), subject: String(subject || ''), body: String(body || ''), docIds, userId: user.id, demo: true, delivered: false };
    svc.s.outbox.push(entry);
    svc.log(user, kind === 'message' ? 'Sporočilo' : 'E-pošta', 'send', DEMO, `Shranjeno v lokalni izhodni predal, ni poslano: ${entry.to}`);
    return { ok: true, demo: true, message: 'Sporočilo je shranjeno v lokalni demo izhodni predal. E-pošta ni bila poslana (poštni strežnik ni povezan).' };
  },
};

export const registry = {
  search(svc, user) {
    svc.log(user, 'Zunanji viri', 'search', DEMO, 'Iskanje po zunanjih virih ni povezano.');
    return { message: 'Iskanje po zunanjih virih ni povezano (demo). Prikazani so le lokalni zadetki.' };
  },
};

export const database = {
  test(svc, user, c) {
    const problems = [];
    if (!c.dbName) problems.push('ime baze');
    if (c.type !== 'SQLite' && !c.server) problems.push('strežnik');
    if (c.type === 'SQLite' && !c.file) problems.push('datoteka');
    svc.log(user, 'Baza podatkov', 'test', DEMO, `Test povezave ${c.name || ''}: ${problems.length ? 'manjka ' + problems.join(', ') : 'nastavitve izpolnjene'}`);
    return {
      ok: false, demo: true,
      message: problems.length
        ? `Demo test povezave: manjka ${problems.join(', ')}.`
        : 'Demo test povezave: nastavitve so izpolnjene, vendar adapter za bazo ni povezan, zato povezava ni bila preverjena. Replika uporablja lokalno datoteko data/state.json.',
    };
  },
  maintenance(svc, user, op) {
    const label = op === 'create' ? 'Ustvari bazo' : 'Posodobi bazo';
    svc.log(user, 'Baza podatkov', op, DEMO, `${label}: ni izvedeno (demo).`);
    return { ok: false, demo: true, message: `${label} (demo): replika ne upravlja zunanje baze. Lokalne demo podatke ponastavite z ukazom "npm run reset".` };
  },
};

export { isoLocal };
