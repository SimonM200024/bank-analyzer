// Domain service: all queries and commands. The HTTP layer exposes the methods
// in `API`; each receives the authenticated user and validated arguments.

import crypto from 'node:crypto';
import {
  isoLocal, fmtDateTime, fmtDatePadded, fmtStamp, fmtElapsed, toDate, fmtAmount,
} from '../core/format.js';
import {
  findFolder, FOLDERS, categoryLabel, extStatusLabel, extStatusText, EXTERNAL_STATUSES, COVER_TEMPLATES,
  coverFields, coverTables, classificationLabel, EXTRACTION_FIELDS, SIGNATURE_STATES, directionLabel, CATEGORIES,
} from '../core/schema.js';
import { readDemoMetadata, renderInvoicePage } from '../core/page-svg.js';
import {
  AccessError, userCompanies, rolesIn, holdersOf, can, flag, anyFlag, canRead, inOffice, assertRead, assertCan,
  holderLabel, holderShort,
} from './access.js';
import { matchCriteria } from './search.js';
import * as adapters from './adapters.js';
import { BRAND } from '../core/brand.js';

export const MASK = '••••••••';
const DEFAULT_LIST_LIMIT = 1000;

export function hexId(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }
export function hashPassword(pw, salt = hexId(8)) {
  return `${salt}:${crypto.createHash('sha256').update(salt + ':' + pw).digest('hex')}`;
}
export function checkPassword(pw, stored) {
  const [salt] = String(stored).split(':');
  return hashPassword(pw, salt) === stored;
}

export class ValidationError extends Error { constructor(msg) { super(msg); this.code = 400; } }

export class Service {
  constructor(store, { clock } = {}) {
    this.store = store;
    this.clock = clock || (() => new Date());
    this.sessions = new Map();
  }
  get s() { return this.store.state; }
  now() { return isoLocal(this.clock()); }
  commit() { this.store.save(); }

  // ---------------------------------------------------------------- lookups
  user(id) { return this.s.users.find((u) => u.id === id); }
  company(id) { return this.s.companies.find((c) => c.id === id); }
  role(id) { return this.s.roles.find((r) => r.id === id); }
  doc(id) { return this.s.documents.find((d) => d.id === id); }

  listLimit() {
    const env = (this.s.settings.system.env || []).find((e) => e.key.endsWith('_LIST_LIMIT'));
    const n = parseInt(env?.value, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIST_LIMIT;
  }

  companyScope(user, companyId) {
    const mine = userCompanies(this.s, user).map((c) => c.id);
    if (!companyId || companyId === 'all') return mine;
    if (!mine.includes(companyId)) throw new AccessError('Nimate dostopa do izbranega podjetja.');
    return [companyId];
  }

  // ---------------------------------------------------------------- events
  event(doc, action, user, extra = {}) {
    const e = { id: hexId(6), at: extra.at || this.now(), action, userId: user?.id || null, userLabel: extra.userLabel || user?.name || 'Sistem' };
    for (const k of ['rule', 'from', 'toUsers', 'fields', 'status', 'users', 'detail', 'prev']) if (extra[k] != null) e[k] = extra[k];
    doc.events.push(e);
    return e;
  }
  log(user, adapter, op, outcome, detail) {
    this.s.integrationLog.push({ at: this.now(), userId: user?.id || null, adapter, op, outcome, detail });
    if (this.s.integrationLog.length > 2000) this.s.integrationLog.splice(0, this.s.integrationLog.length - 2000);
  }

  // ---------------------------------------------------------------- summaries
  signatureState(doc) {
    if (!doc.signatures.length) return SIGNATURE_STATES[0];
    return SIGNATURE_STATES[2];
  }
  noteFor(user, doc) {
    const holders = holdersOf(this.s, user, doc.companyId);
    const mine = doc.notes.filter((n) => holders.has(n.holder));
    if (mine.some((n) => n.kind === 'yellow')) return 'yellow';
    if (mine.some((n) => n.kind === 'blue')) return 'blue';
    return null;
  }

  row(user, doc, extra = {}) {
    const now = this.now();
    const loc = doc.location[0];
    const longest = this.longestHolder(doc);
    const initials = doc.signatures.filter((x) => x.kind === 'approve');
    const lastInit = initials[initials.length - 1];
    return {
      id: doc.id, companyId: doc.companyId, companyName: this.company(doc.companyId)?.name, category: doc.category,
      categoryLabel: categoryLabel(doc.category), direction: doc.direction, subject: doc.subject,
      sender: doc.sender, recipient: doc.recipient, createdAt: doc.createdAt, sentAt: doc.sentAt,
      receivedAt: doc.receivedAt, modifiedAt: doc.modifiedAt, externalStatus: doc.externalStatus,
      externalStatusLabel: doc.externalStatus == null ? '' : extStatusLabel(doc.externalStatus),
      status: doc.fields?.status || '', signatureState: this.signatureState(doc), note: this.noteFor(user, doc),
      attachments: doc.attachments.length, unread: !doc.readBy.includes(user.id), inOffice: inOffice(this.s, user, doc, now),
      tags: doc.tags, archived: doc.archived, archivedAt: doc.archivedAt, archivedBy: doc.archivedBy ? this.user(doc.archivedBy)?.name : '',
      classification: doc.classification ? classificationLabel(doc.classification) : '',
      holderName: doc.location.map((l) => holderShort(this.s, l.holder)).join(', '),
      officeSince: loc?.since || null, timeInOffice: loc ? fmtElapsed(loc.since, toDate(now)) : '',
      longestHolder: longest ? holderShort(this.s, longest) : '', author: this.user(doc.authorId)?.name || '',
      hasComments: doc.comments.length > 0, initialed: initials.length > 0,
      lastInitial: lastInit ? `${lastInit.name} (${fmtDateTime(lastInit.at)})` : '',
      externalId: doc.externalId || '', externalId2: doc.externalId2 || '', protocol: doc.protocol || '', barcode: doc.barcode || '',
      retentionUntil: doc.retentionUntil || null, personalData: !!doc.personalData, archival: !!doc.archival,
      certExpiry: doc.certExpiry || null, template: doc.templateName || '', exportStatus: doc.pantheon?.ref ? 'Prenesen' : '',
      exportError: '', protocolError: '', protocolAddress: '', viewPurpose: '',
      dispatchState: doc.dispatch?.state || null, claimedBy: doc.claimedBy ? this.user(doc.claimedBy)?.name : null,
      fields: doc.fields,
      children: doc.links.filter((l) => l.kind === 'embedded' || l.kind === 'link').map((l) => l.docId)
        .filter((id) => canRead(this.s, user, this.doc(id), now)),
      ...extra,
    };
  }

  longestHolder(doc) {
    const now = toDate(this.now());
    const totals = new Map();
    for (const h of doc.officeHistory || []) {
      const ms = (h.to ? toDate(h.to) : now) - toDate(h.from);
      totals.set(h.holder, (totals.get(h.holder) || 0) + ms);
    }
    let best = null, bestMs = -1;
    for (const [h, ms] of totals) if (ms > bestMs) { best = h; bestMs = ms; }
    return best;
  }

  // ---------------------------------------------------------------- location
  moveTo(doc, holders, at) {
    for (const h of doc.officeHistory) if (!h.to) h.to = at;
    doc.location = holders.map((holder) => ({ holder, since: at }));
    for (const holder of holders) {
      doc.officeHistory.push({ holder, from: at, to: null });
      if (!doc.access.some((a) => a.holder === holder)) doc.access.push({ holder, grantedAt: at });
    }
    doc.claimedBy = null;
  }

  // ---------------------------------------------------------------- creation
  newDocument(spec) {
    const at = spec.at || this.now();
    const doc = {
      id: hexId(16), companyId: spec.companyId, category: spec.category, direction: spec.direction || 'in',
      subject: spec.subject || '', sender: spec.sender || '', senderPartnerId: spec.senderPartnerId || null,
      recipient: spec.recipient || '', recipientPartnerId: spec.recipientPartnerId || null,
      source: spec.source ?? 'Uvoz', filename: spec.filename || '', createdAt: at, sentAt: spec.sentAt || at,
      receivedAt: spec.receivedAt || at, modifiedAt: at, authorId: spec.authorId || null,
      externalStatus: spec.category === 'racun' && spec.direction !== 'out' ? (spec.externalStatus ?? 0) : null,
      fields: spec.fields || {}, tables: spec.tables || { taxes: [], lines: [], postings: [], proformas: [] },
      extracted: spec.extracted || [], pages: spec.pages || [], attachments: spec.attachments || [],
      links: [], location: [], access: [], officeHistory: [], claimedBy: null, claimedAt: null,
      readBy: [], notes: [], tags: [], comments: spec.comments || [], archived: false, archivedAt: null, archivedBy: null,
      retentionUntil: spec.retentionUntil || null, personalData: !!spec.personalData, archival: !!spec.archival,
      classification: spec.classification || null, signatures: [], versions: [], events: [],
      dispatch: spec.direction === 'out' ? { state: 'prep', at } : null, pantheon: null,
      externalId: spec.externalId || '', externalId2: '', protocol: spec.protocol || '', barcode: spec.barcode || '',
      templateName: spec.templateName || '', deleted: false, certExpiry: null,
    };
    this.recompute(doc);
    this.s.documents.push(doc);
    return doc;
  }

  recompute(doc) {
    if (doc.category === 'racun') {
      const total = Number(doc.fields.skupni_znesek_racuna);
      if (Number.isFinite(total)) doc.fields.saldo = doc.fields.placano ? 0 : -total;
    }
  }

  // ---------------------------------------------------------------- full doc
  allowed(user, doc) {
    const now = this.now();
    const c = (a) => can(this.s, user, doc.companyId, doc.category, a);
    const office = inOffice(this.s, user, doc, now);
    const mine = doc.claimedBy === user.id;
    const out = doc.direction === 'out';
    const st = doc.dispatch?.state;
    const anyWork = ['edit', 'initial', 'forward', 'reject', 'sign'].some(c);
    return {
      claim: office && !mine && anyWork && !doc.archived,
      save: mine && c('edit'), print: mine || !office, attach: mine && c('edit'), modify: mine && c('edit'),
      initial: office && c('initial') && !doc.archived, initialInWindow: mine && c('initial'),
      sign: out && c('sign') && st === 'prep' && office, forward: office && c('forward') && !doc.archived,
      forwardInWindow: mine && c('forward'), reject: office && c('reject') && !out && !doc.archived,
      rejectInWindow: mine && c('reject') && !out,
      extStatus: mine && c('edit') && doc.category === 'racun' && !out,
      classify: c('classify'), grant: c('grant'), tag: c('tag'),
      archive: c('archive') && !doc.archived, unarchive: c('archive') && doc.archived,
      delete: c('delete'), toDispatch: out && c('dispatch') && st === 'prep',
      issue: out && c('dispatch') && (st === 'prep' || st === 'queued'), returnToPrep: out && c('dispatch') && st === 'queued',
      pantheon: c('pantheon') && doc.category === 'racun' && !out,
      editTemplate: flag(this.s, user, doc.companyId, 'settings'),
    };
  }

  fullDoc(user, doc) {
    const now = this.now();
    const company = this.company(doc.companyId);
    const tpl = this.coverTemplate(doc.companyId, doc.category);
    // Users and access: every role path in the company plus explicitly granted users.
    const nowD = toDate(now);
    const holders = [
      ...this.s.roles.filter((r) => r.companyId === doc.companyId).map((r) => `role:${r.id}`),
      ...doc.access.map((a) => a.holder).filter((h) => h.startsWith('user:')),
      ...doc.location.map((l) => l.holder).filter((h) => h.startsWith('user:')),
    ];
    const accessRows = [...new Set(holders)].map((h) => {
      const loc = doc.location.find((l) => l.holder === h);
      return {
        holder: h, label: holderLabel(this.s, h), current: !!loc,
        since: loc ? `${fmtElapsed(loc.since, nowD)}\n${fmtDateTime(loc.since)}` : '',
        access: !!loc || doc.access.some((a) => a.holder === h),
      };
    });
    const links = doc.links.map((l) => {
      const t = this.doc(l.docId);
      if (!t || !canRead(this.s, user, t, now)) return null;
      return { ...l, row: this.row(user, t) };
    }).filter(Boolean);
    return {
      ...this.row(user, doc),
      title: `${categoryLabel(doc.category)} [${this.windowRole(user, doc)}]`,
      companyName: company?.name, source: doc.source, filename: doc.filename,
      classificationCode: doc.classification, fields: doc.fields, tables: doc.tables, extracted: doc.extracted,
      pages: doc.pages, attachmentsList: doc.attachments, signatures: doc.signatures,
      events: [...doc.events].reverse(), accessRows, links, versions: [...doc.versions].reverse(),
      coverTemplate: tpl, comments: doc.comments, pantheon: doc.pantheon, dispatch: doc.dispatch,
      claimedById: doc.claimedBy, allowed: this.allowed(user, doc), extStatusText: extStatusText(doc.externalStatus),
    };
  }

  windowRole(user, doc) {
    const holders = holdersOf(this.s, user, doc.companyId, this.now());
    const at = doc.location.find((l) => holders.has(l.holder));
    if (at) return holderShort(this.s, at.holder);
    const r = rolesIn(this.s, user, doc.companyId)[0];
    return r ? r.name : user.name;
  }

  coverTemplate(companyId, category) {
    const ov = this.s.coverOverrides?.[companyId]?.[category] || {};
    return (COVER_TEMPLATES[category] || []).map((item) => {
      if (!item.f) return item;
      const o = ov[item.f.key] || {};
      return { f: { ...item.f, label: o.label || item.f.label, hidden: !!o.hidden, baseLabel: item.f.label } };
    });
  }

  // ---------------------------------------------------------------- queries
  scopeFilter(user, scope, now) {
    return (doc) => {
      if (doc.deleted) return false;
      switch (scope) {
        case 'office': return !doc.archived && inOffice(this.s, user, doc, now);
        case 'notes': return this.noteFor(user, doc) != null;
        case 'dispatch': return doc.direction === 'out' && doc.dispatch?.state === 'queued';
        default: return !doc.archived;
      }
    };
  }

  folderFilter(folderId) {
    const f = findFolder(folderId);
    if (!f) return () => true;
    return (doc) => {
      if (f.direction && doc.direction !== f.direction) return false;
      if (f.category && doc.category !== f.category) return false;
      if (f.extStatus && !f.extStatus.includes(doc.externalStatus)) return false;
      return true;
    };
  }

  readable(user, companyIds) {
    const now = this.now();
    return this.s.documents.filter((d) => companyIds.includes(d.companyId) && canRead(this.s, user, d, now));
  }

  limitRows(user, docs) {
    const limit = this.listLimit();
    const sorted = [...docs].sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
    const shown = sorted.slice(0, limit);
    const rows = shown.map((d) => this.row(user, d));
    for (const r of rows) {
      if (r.children.length) r.childRows = r.children.map((id) => this.row(user, this.doc(id), { children: [] }));
    }
    return { rows, total: docs.length, limited: docs.length > limit, limit };
  }
}

// ============================================================================
// API: name -> (svc, user, args) => result. Mutating calls commit at the end.
// ============================================================================
const need = (cond, msg) => { if (!cond) throw new ValidationError(msg); };
const ids = (a) => (Array.isArray(a.ids) ? a.ids : a.id ? [a.id] : []);

function forEachDoc(svc, user, a, fn) {
  const list = ids(a);
  need(list.length, 'Izberite dokument.');
  const results = [];
  for (const id of list) results.push(fn(svc.doc(id)));
  svc.commit();
  return { ok: true, count: results.length, docs: list.map((id) => svc.doc(id)).filter((d) => d && !d.deleted && canRead(svc.s, user, d, svc.now())).map((d) => svc.row(user, d)) };
}

function requireOffice(svc, user, doc) {
  if (!inOffice(svc.s, user, doc, svc.now())) throw new AccessError('Dokument ni v vaši pisarni.');
}

function runRules(svc, user, doc, trigger) {
  const actorRoleIds = rolesIn(svc.s, user, doc.companyId).map((r) => r.id);
  for (const rule of svc.s.rules.filter((r) => r.companyId === doc.companyId && r.trigger === trigger && r.enabled !== false)) {
    if (rule.category && rule.category !== doc.category) continue;
    if (rule.direction && rule.direction !== doc.direction) continue;
    if (rule.actorRoleIds?.length && !rule.actorRoleIds.some((r) => actorRoleIds.includes(r))) continue;
    const at = svc.now();
    if (rule.extStatus != null && doc.externalStatus !== rule.extStatus) {
      const prev = doc.externalStatus;
      doc.externalStatus = rule.extStatus;
      svc.event(doc, 'Spremenjen zunanji status', user, { at, status: `${extStatusText(prev)} -> ${extStatusText(rule.extStatus)}` });
    }
    if (rule.coverStatus && doc.fields.status !== rule.coverStatus) {
      const prev = doc.fields.status;
      doc.fields.status = rule.coverStatus;
      svc.event(doc, 'Sprememba na spremnem listu', user, { at, userLabel: `${user.name} (Pravilo)`, fields: `Status: ${rule.coverStatus}`, prev: { status: prev } });
    }
    if (rule.forwardTo?.length) {
      svc.moveTo(doc, rule.forwardTo, at);
      svc.event(doc, 'Posredovan', user, { at, from: `${user.name} (Pravilo '${rule.name}')`, toUsers: rule.forwardTo.map((h) => holderShort(svc.s, h)).join(', ') });
    }
    const later = isoLocal(new Date(toDate(at).getTime() + 2000));
    svc.event(doc, 'Izvedeno pravilo', user, { at: later, rule: rule.name });
  }
}

function diffFields(doc, patch, tpl) {
  const changes = [];
  const prev = {};
  for (const item of tpl) {
    if (!item.f || item.f.computed) continue;
    const k = item.f.key;
    if (!(k in patch)) continue;
    let v = patch[k];
    if (item.f.type === 'amount') v = v === '' || v == null ? null : Number(v);
    if (item.f.type === 'bool') v = !!v;
    if (item.f.type === 'date') v = v || null;
    const old = doc.fields[k] ?? null;
    if ((old ?? null) !== (v ?? null) && !(old == null && v === '')) {
      prev[k] = old;
      doc.fields[k] = v;
      let shown = v;
      if (item.f.type === 'date') shown = v ? fmtDatePadded(v) : '';
      if (item.f.type === 'amount') shown = v == null ? '' : fmtAmount(v);
      if (item.f.type === 'bool') shown = v ? 'Da' : 'Ne';
      changes.push(`${item.f.baseLabel || item.f.label}: ${shown ?? ''}`);
    }
  }
  return { changes, prev };
}

function snapshotContent(doc) {
  return { pages: structuredClone(doc.pages), attachments: structuredClone(doc.attachments), subject: doc.subject };
}

function pushVersion(svc, user, doc, reason) {
  doc.versions.push({ n: doc.versions.length + 1, at: svc.now(), userId: user.id, userName: user.name, reason, snapshot: snapshotContent(doc) });
}

export const API = {
  // ------------------------------------------------------------ bootstrap
  whoami(svc, user) {
    const companies = userCompanies(svc.s, user);
    const cids = companies.map((c) => c.id);
    const perms = {};
    const flags = {};
    for (const c of companies) {
      perms[c.id] = {};
      for (const cat of CATEGORIES) {
        perms[c.id][cat.id] = ['read', 'edit', 'initial', 'sign', 'forward', 'reject', 'dispatch', 'archive', 'delete', 'classify', 'grant', 'tag', 'pantheon']
          .filter((a) => can(svc.s, user, c.id, cat.id, a));
      }
      flags[c.id] = Object.fromEntries(['supervise', 'scan', 'settings', 'admin', 'directory'].map((f) => [f, flag(svc.s, user, c.id, f)]));
    }
    return {
      user: { id: user.id, name: user.name, username: user.username },
      companies, defaultCompanyId: user.defaultCompanyId && cids.includes(user.defaultCompanyId) ? user.defaultCompanyId : cids[0],
      roles: svc.s.roles.filter((r) => cids.includes(r.companyId)).map((r) => ({ id: r.id, companyId: r.companyId, name: r.name, path: r.path })),
      users: svc.s.users.filter((u) => u.login !== false && u.roleIds.some((rid) => cids.includes(svc.role(rid)?.companyId)))
        .map((u) => ({ id: u.id, name: u.name, roleIds: u.roleIds.filter((rid) => cids.includes(svc.role(rid)?.companyId)) })),
      tags: Object.fromEntries(cids.map((c) => [c, svc.s.tags[c] || []])),
      perms, flags, personal: API.getPersonal(svc, user), listLimit: svc.listLimit(),
      templates: svc.s.templates.filter((t) => cids.includes(t.companyId)),
      now: svc.now(), version: svc.s.meta.version, dataCreatedAt: svc.s.meta.createdAt,
    };
  },

  // ------------------------------------------------------------ office
  listDocuments(svc, user, a) {
    const cids = svc.companyScope(user, a.companyId);
    const now = svc.now();
    const docs = svc.readable(user, cids).filter(svc.scopeFilter(user, a.scope || 'live', now)).filter(svc.folderFilter(a.folderId));
    return svc.limitRows(user, docs);
  },

  folderCounts(svc, user, a) {
    const cids = svc.companyScope(user, a.companyId);
    const now = svc.now();
    const readable = svc.readable(user, cids).filter((d) => !d.deleted);
    const scoped = readable.filter(svc.scopeFilter(user, a.scope || 'live', now));
    const office = readable.filter(svc.scopeFilter(user, 'office', now));
    const out = {};
    const walk = (list) => {
      for (const f of list) {
        const ff = svc.folderFilter(f.id);
        out[f.id] = { count: scoped.filter(ff).length, unread: office.filter(ff).filter((d) => !d.readBy.includes(user.id)).length };
        if (f.children) walk(f.children);
      }
    };
    walk(FOLDERS);
    return out;
  },

  getDocument(svc, user, a) {
    const doc = svc.doc(a.id);
    assertRead(svc.s, user, doc, svc.now());
    if (a.open) {
      const last = [...doc.events].reverse().find((e) => e.action === 'Odprt' && e.userId === user.id);
      const fresh = !last || toDate(svc.now()) - toDate(last.at) > 5 * 60000;
      if (fresh) svc.event(doc, 'Odprt', user);
      if (!doc.readBy.includes(user.id)) doc.readBy.push(user.id);
      svc.commit();
    }
    return svc.fullDoc(user, doc);
  },

  search(svc, user, a) {
    const cids = svc.companyScope(user, a.companyId);
    const helpers = { signatureState: (d) => svc.signatureState(d) };
    const docs = svc.readable(user, cids).filter((d) => !d.deleted && matchCriteria(d, a.criteria || {}, helpers));
    return svc.limitRows(user, docs);
  },

  // ------------------------------------------------------------ doc commands
  claim(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertRead(svc.s, user, doc, svc.now());
      requireOffice(svc, user, doc);
      if (doc.archived) throw new ValidationError('Dokument je v hrambi.');
      if (!['edit', 'initial', 'forward', 'reject', 'sign'].some((x) => can(svc.s, user, doc.companyId, doc.category, x))) {
        throw new AccessError('Vaša vloga ne more prevzeti tega dokumenta.');
      }
      if (doc.claimedBy === user.id) return;
      const at = svc.now();
      const prevHolders = doc.location.map((l) => l.holder);
      svc.moveTo(doc, [`user:${user.id}`], at);
      for (const h of prevHolders) if (!doc.access.some((x) => x.holder === h)) doc.access.push({ holder: h, grantedAt: at });
      doc.claimedBy = user.id;
      doc.claimedAt = at;
      svc.event(doc, 'Prevzet', user, { from: prevHolders.map((h) => holderShort(svc.s, h)).join(', ') });
    });
  },

  saveDocument(svc, user, a) {
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'edit', svc.now());
    if (doc.claimedBy !== user.id) throw new AccessError('Dokument najprej prevzemite (Prevzemi).');
    const tpl = svc.coverTemplate(doc.companyId, doc.category);
    const { changes, prev } = diffFields(doc, a.fields || {}, tpl);
    for (const k of ['subject', 'sender']) {
      if (a[k] != null && a[k] !== doc[k]) {
        prev[k] = doc[k];
        doc[k] = String(a[k]);
        changes.push(`${k === 'subject' ? 'Predmet' : 'Pošiljatelj'}: ${doc[k]}`);
      }
    }
    if (a.tables) {
      for (const t of coverTables(doc.category)) {
        if (!a.tables[t.key]) continue;
        const clean = a.tables[t.key].filter((r) => Object.values(r).some((v) => v !== '' && v != null));
        if (JSON.stringify(clean) !== JSON.stringify(doc.tables[t.key] || [])) {
          prev['table:' + t.key] = doc.tables[t.key];
          doc.tables[t.key] = clean;
          changes.push(`${t.caption}: ${clean.length} vrstic`);
        }
      }
    }
    if (!changes.length) return { ok: true, changed: false, doc: svc.fullDoc(user, doc) };
    svc.recompute(doc);
    doc.modifiedAt = svc.now();
    svc.event(doc, 'Sprememba na spremnem listu', user, { fields: changes.join('\n'), prev });
    svc.commit();
    return { ok: true, changed: true, doc: svc.fullDoc(user, doc) };
  },

  initial(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'initial', svc.now());
      requireOffice(svc, user, doc);
      const company = svc.company(doc.companyId);
      const at = svc.now();
      doc.signatures.push({ id: hexId(6), kind: 'approve', label: 'Potrdi', name: `${user.name}, ${company.name}`, at, demo: true });
      svc.event(doc, 'Parafiran (Potrdi)', user, { at });
      runRules(svc, user, doc, 'initial');
      doc.modifiedAt = at;
    });
  },

  sign(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'sign', svc.now());
      requireOffice(svc, user, doc);
      if (doc.direction !== 'out' || doc.dispatch?.state !== 'prep') throw new ValidationError('Podpisati je mogoče le izhodni dokument v pripravi.');
      const company = svc.company(doc.companyId);
      doc.signatures.push({ id: hexId(6), kind: 'signed', label: 'Podpisal(a)', name: `${user.name}, ${company.name}`, at: svc.now(), demo: true });
      svc.event(doc, 'Podpisan', user, { detail: 'Demo podpis – brez certifikata in kriptografske veljavnosti.' });
    });
  },

  forward(svc, user, a) {
    need(Array.isArray(a.targets) && a.targets.length, 'Izberite vsaj enega prejemnika.');
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'forward', svc.now());
      requireOffice(svc, user, doc);
      for (const t of a.targets) validateHolder(svc, t, doc.companyId);
      const at = svc.now();
      svc.moveTo(doc, a.targets, at);
      for (const h of a.targets) doc.notes.push({ holder: h, kind: 'blue', at });
      svc.event(doc, 'Posredovan', user, { from: user.name, toUsers: a.targets.map((h) => holderShort(svc.s, h)).join(', '), detail: a.note || undefined });
      if (a.notify) {
        svc.s.outbox.push({ at, kind: 'obvestilo', to: a.targets.map((h) => holderShort(svc.s, h)), subject: `Posredovan dokument: ${doc.subject}`, docIds: [doc.id], userId: user.id, demo: true });
      }
    });
  },

  reject(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'reject', svc.now());
      requireOffice(svc, user, doc);
      const at = svc.now();
      const mine = holdersOf(svc.s, user, doc.companyId, at);
      const sender = [...doc.events].reverse().find((e) => e.action === 'Posredovan' && e.userId && e.userId !== user.id);
      const previous = sender ? { holder: `user:${sender.userId}` }
        : [...doc.officeHistory].reverse().find((h) => !mine.has(h.holder));
      const prevStatus = doc.fields.status;
      if (doc.category === 'racun' || doc.fields.status != null) doc.fields.status = 'Zavrnjen';
      svc.event(doc, 'Zavrnjen', user, { fields: `Status: Zavrnjen${a.reason ? '\nRazlog: ' + a.reason : ''}`, prev: { status: prevStatus } });
      if (previous) {
        svc.moveTo(doc, [previous.holder], at);
        svc.event(doc, 'Posredovan', user, { from: user.name, toUsers: holderShort(svc.s, previous.holder) });
      }
    });
  },

  setExternalStatus(svc, user, a) {
    need(EXTERNAL_STATUSES.some((s) => s.code === a.code), 'Neveljaven zunanji status.');
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'edit', svc.now());
      requireOffice(svc, user, doc);
      if (doc.category !== 'racun' || doc.direction === 'out') throw new ValidationError('Zunanji status velja le za prejete račune.');
      if (doc.externalStatus === a.code) return;
      const prev = doc.externalStatus;
      doc.externalStatus = a.code;
      doc.modifiedAt = svc.now();
      svc.event(doc, 'Spremenjen zunanji status', user, { status: `${extStatusText(prev)} -> ${extStatusText(a.code)}` });
    });
  },

  classify(svc, user, a) {
    need(classificationLabel(a.code) !== a.code || !a.code, 'Neveljavna klasifikacija.');
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'classify', svc.now());
      const had = doc.classification;
      doc.classification = a.code || null;
      svc.event(doc, had ? 'Preklasificiran' : 'Klasificiran', user, { fields: `Klasifikacija: ${classificationLabel(a.code)}` });
    });
  },

  grantAccess(svc, user, a) {
    need(Array.isArray(a.holders) && a.holders.length, 'Izberite uporabnike ali vloge.');
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'grant', svc.now());
      const added = [];
      for (const h of a.holders) {
        validateHolder(svc, h, doc.companyId);
        if (!doc.access.some((x) => x.holder === h)) { doc.access.push({ holder: h, grantedAt: svc.now(), grantedBy: user.id }); added.push(h); }
      }
      if (added.length) svc.event(doc, 'Dodeljen dostop', user, { users: added.map((h) => holderShort(svc.s, h)).join(', ') });
    });
  },

  revokeAccess(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'grant', svc.now());
      if (doc.location.some((l) => l.holder === a.holder)) throw new ValidationError('Dokument je trenutno v pisarni tega imetnika.');
      doc.access = doc.access.filter((x) => x.holder !== a.holder);
      svc.event(doc, 'Dodeljen dostop', user, { users: `${holderShort(svc.s, a.holder)} (odvzet)` });
    });
  },

  addTag(svc, user, a) {
    need(a.tag && String(a.tag).trim(), 'Vnesite oznako.');
    const tag = String(a.tag).trim();
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'tag', svc.now());
      if (!doc.tags.includes(tag)) doc.tags.push(tag);
      const list = (svc.s.tags[doc.companyId] ||= []);
      if (!list.includes(tag)) list.push(tag);
    });
  },
  removeTag(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'tag', svc.now());
      doc.tags = a.tag ? doc.tags.filter((t) => t !== a.tag) : [];
    });
  },

  addNote(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertRead(svc.s, user, doc, svc.now());
      if (!doc.notes.some((n) => n.holder === `user:${user.id}` && n.kind === 'yellow')) doc.notes.push({ holder: `user:${user.id}`, kind: 'yellow', at: svc.now() });
    });
  },
  removeNote(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertRead(svc.s, user, doc, svc.now());
      const holders = holdersOf(svc.s, user, doc.companyId);
      const kind = a.kind === 'blue' ? 'blue' : 'yellow';
      doc.notes = doc.notes.filter((n) => !(n.kind === kind && holders.has(n.holder)));
    });
  },

  markRead(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertRead(svc.s, user, doc, svc.now());
      if (a.read === false) doc.readBy = doc.readBy.filter((x) => x !== user.id);
      else if (!doc.readBy.includes(user.id)) doc.readBy.push(user.id);
    });
  },

  archive(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'archive', svc.now());
      if (a.restore) {
        if (!doc.archived) return;
        doc.archived = false;
        svc.event(doc, 'Vzet iz hrambe', user);
        return;
      }
      if (doc.archived) return;
      const at = svc.now();
      doc.archived = true; doc.archivedAt = at; doc.archivedBy = user.id;
      if (!doc.retentionUntil) {
        const d = toDate(at); d.setFullYear(d.getFullYear() + 10);
        doc.retentionUntil = isoLocal(d, false);
      }
      svc.event(doc, 'Poslan v hrambo', user, { detail: `Rok hranjenja: ${fmtDatePadded(doc.retentionUntil)}` });
    });
  },

  deleteDocuments(svc, user, a) {
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'delete', svc.now());
      doc.deleted = true;
      svc.event(doc, 'Izbrisan', user);
    });
  },

  dispatchAction(svc, user, a) {
    const op = a.op;
    need(['toDispatch', 'issue', 'returnToPrep'].includes(op), 'Neznana akcija.');
    return forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'dispatch', svc.now());
      if (doc.direction !== 'out') throw new ValidationError('Akcija velja le za izhodne dokumente.');
      const st = doc.dispatch.state;
      const at = svc.now();
      if (op === 'toDispatch') {
        if (st !== 'prep') throw new ValidationError('Dokument ni v pripravi.');
        doc.dispatch = { state: 'queued', at };
        svc.event(doc, 'V odpremo', user);
      } else if (op === 'issue') {
        if (!['prep', 'queued'].includes(st)) throw new ValidationError('Dokument je že izdan.');
        doc.dispatch = { state: 'issued', at };
        svc.event(doc, 'Izdan', user, { detail: 'Prestavljen neposredno v izdano (brez pošiljanja).' });
      } else {
        if (st !== 'queued') throw new ValidationError('Dokument ni v odpremi.');
        doc.dispatch = { state: 'prep', at };
        svc.event(doc, 'Vrnjen v pripravo', user);
      }
    });
  },

  linkDocuments(svc, user, a) {
    const source = svc.doc(a.id);
    assertRead(svc.s, user, source, svc.now());
    need(Array.isArray(a.targetIds) && a.targetIds.length, 'Odložišče je prazno.');
    const kind = a.kind === 'embedded' ? 'embedded' : 'link';
    let n = 0;
    for (const tid of a.targetIds) {
      if (tid === source.id) continue;
      const t = svc.doc(tid);
      assertRead(svc.s, user, t, svc.now());
      if (t.companyId !== source.companyId) throw new ValidationError('Povezati je mogoče le dokumente istega podjetja.');
      if (!source.links.some((l) => l.docId === tid)) {
        source.links.push({ docId: tid, kind, at: svc.now(), userId: user.id });
        t.links.push({ docId: source.id, kind: kind === 'embedded' ? 'parent' : 'link', at: svc.now(), userId: user.id });
        svc.event(source, 'Povezan dokument', user, { detail: t.subject });
        svc.event(t, 'Povezan dokument', user, { detail: source.subject });
        n++;
      }
    }
    svc.commit();
    return { ok: true, linked: n };
  },

  unlinkDocument(svc, user, a) {
    const source = svc.doc(a.id);
    assertCan(svc.s, user, source, 'edit', svc.now());
    const t = svc.doc(a.targetId);
    source.links = source.links.filter((l) => l.docId !== a.targetId);
    if (t) t.links = t.links.filter((l) => l.docId !== source.id);
    svc.event(source, 'Izvzet iz zadeve', user, { detail: t?.subject });
    svc.commit();
    return { ok: true };
  },

  attachFile(svc, user, a) {
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'edit', svc.now());
    if (doc.claimedBy !== user.id) throw new AccessError('Dokument najprej prevzemite (Prevzemi).');
    const blob = takeUploadedBlob(svc, user, a.blobId, { type: 'doc', id: doc.id });
    pushVersion(svc, user, doc, `Pripeta datoteka ${blob.name}`);
    doc.attachments.push({ blobId: blob.id, name: blob.name, mime: blob.mime, at: svc.now(), userId: user.id });
    doc.modifiedAt = svc.now();
    svc.event(doc, 'Nova verzija', user, { detail: `Pripeta datoteka: ${blob.name}` });
    svc.commit();
    return svc.fullDoc(user, doc);
  },

  copyAttachment(svc, user, a) {
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'edit', svc.now());
    if (doc.claimedBy !== user.id) throw new AccessError('Dokument najprej prevzemite (Prevzemi).');
    const src = svc.doc(a.sourceDocId);
    assertRead(svc.s, user, src, svc.now());
    const pg = [...src.pages, ...src.attachments].find((p) => p.blobId === a.blobId);
    need(pg, 'Priponka ne obstaja.');
    const b = svc.store.readBlob(a.blobId);
    need(b, 'Datoteka ne obstaja.');
    const meta = svc.store.putBlob(b.bytes, { mime: b.meta.mime, name: b.meta.name, owner: { type: 'doc', id: doc.id } });
    pushVersion(svc, user, doc, `Prilepljena priponka ${meta.name}`);
    doc.attachments.push({ blobId: meta.id, name: meta.name, mime: meta.mime, at: svc.now(), userId: user.id });
    doc.modifiedAt = svc.now();
    svc.event(doc, 'Nova verzija', user, { detail: `Prilepljena priponka: ${meta.name}` });
    svc.commit();
    return svc.fullDoc(user, doc);
  },

  replacePages(svc, user, a) {
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'edit', svc.now());
    if (doc.claimedBy !== user.id) throw new AccessError('Dokument najprej prevzemite (Prevzemi).');
    need(Array.isArray(a.blobIds) && a.blobIds.length, 'Izberite datoteke.');
    pushVersion(svc, user, doc, 'Spreminjanje dokumenta');
    doc.pages = a.blobIds.map((bid, i) => {
      const b = takeUploadedBlob(svc, user, bid, { type: 'doc', id: doc.id });
      return { blobId: b.id, mime: b.mime, name: b.name, label: `Stran ${i + 1}` };
    });
    doc.modifiedAt = svc.now();
    svc.event(doc, 'Nova verzija', user, { detail: `Spreminjanje dokumenta: ${doc.pages.length} strani` });
    svc.commit();
    return svc.fullDoc(user, doc);
  },

  restoreVersion(svc, user, a) {
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'edit', svc.now());
    if (doc.claimedBy !== user.id) throw new AccessError('Dokument najprej prevzemite (Prevzemi).');
    const v = doc.versions.find((x) => x.n === a.n);
    need(v, 'Verzija ne obstaja.');
    pushVersion(svc, user, doc, `Pred obnovitvijo verzije ${v.n}`);
    doc.pages = structuredClone(v.snapshot.pages);
    doc.attachments = structuredClone(v.snapshot.attachments);
    doc.modifiedAt = svc.now();
    svc.event(doc, 'Nova verzija', user, { detail: `Obnovljena verzija ${v.n}` });
    svc.commit();
    return svc.fullDoc(user, doc);
  },

  recordOutput(svc, user, a) {
    need(['print', 'export'].includes(a.kind), 'Neznan izhod.');
    return forEachDoc(svc, user, a, (doc) => {
      assertRead(svc.s, user, doc, svc.now());
      svc.event(doc, a.kind === 'print' ? 'Natisnjen' : 'Izvožen', user, { detail: a.detail || undefined });
    });
  },

  sendMail(svc, user, a) {
    need(a.to && String(a.to).trim(), 'Vnesite prejemnika.');
    const list = ids(a);
    for (const id of list) assertRead(svc.s, user, svc.doc(id), svc.now());
    const res = adapters.email.send(svc, user, { to: a.to, subject: a.subject, body: a.body, docIds: list, kind: a.kind || 'email' });
    svc.commit();
    return res;
  },

  editCoverTemplate(svc, user, a) {
    need(a.companyId && a.category, 'Manjka podjetje ali tip.');
    svc.companyScope(user, a.companyId);
    if (!flag(svc.s, user, a.companyId, 'settings')) throw new AccessError('Urejanje predloge zahteva skrbniške pravice.');
    const valid = new Set(coverFields(a.category).map((f) => f.key));
    const clean = {};
    for (const [k, v] of Object.entries(a.overrides || {})) {
      if (!valid.has(k)) continue;
      clean[k] = { hidden: !!v.hidden, label: v.label ? String(v.label).slice(0, 80) : '' };
    }
    ((svc.s.coverOverrides ||= {})[a.companyId] ||= {})[a.category] = clean;
    svc.commit();
    return { ok: true, template: svc.coverTemplate(a.companyId, a.category) };
  },

  // ------------------------------------------------------------ integrations
  sendReceive(svc, user, a) {
    const cids = svc.companyScope(user, a.companyId);
    const res = adapters.exchange.sendReceive(svc, user, cids);
    svc.commit();
    return res;
  },
  pantheonTransfer(svc, user, a) {
    const res = { transferred: 0, skipped: [] };
    const out = forEachDoc(svc, user, a, (doc) => {
      assertCan(svc.s, user, doc, 'pantheon', svc.now());
      if (doc.category !== 'racun' || doc.direction === 'out') { res.skipped.push(doc.subject); return; }
      adapters.pantheon.transfer(svc, user, doc);
      res.transferred++;
    });
    return { ...out, ...res, message: `Pantheon 5.5 (demo adapter): ${res.transferred} dokumentov označenih kot prenesenih. Prave povezave z ERP ni.` };
  },
  pantheonLink(svc, user, a) {
    need(a.ref && String(a.ref).trim(), 'Vnesite številko dokumenta v Pantheonu.');
    const doc = svc.doc(a.id);
    assertCan(svc.s, user, doc, 'pantheon', svc.now());
    adapters.pantheon.link(svc, user, doc, String(a.ref).trim());
    svc.commit();
    return svc.fullDoc(user, doc);
  },
  pantheonSync(svc, user, a) {
    need(['partners', 'data'].includes(a.what), 'Neznana sinhronizacija.');
    svc.companyScope(user, a.companyId);
    const res = adapters.pantheon.sync(svc, user, a.what);
    svc.commit();
    return res;
  },

  // ------------------------------------------------------------ supervision
  supervision(svc, user, a) {
    const cids = svc.companyScope(user, a.companyId);
    const allowedCids = cids.filter((c) => flag(svc.s, user, c, 'supervise'));
    if (!allowedCids.length) throw new AccessError('Nimate pravice skrbništva.');
    let holderSet = null;
    if (a.roleId) {
      const role = svc.role(a.roleId);
      need(role && allowedCids.includes(role.companyId), 'Neveljavna vloga.');
      holderSet = new Set([`role:${role.id}`, ...svc.s.users.filter((u) => u.roleIds.includes(role.id)).map((u) => `user:${u.id}`)]);
    }
    const docs = svc.readable(user, allowedCids).filter((d) => !d.deleted && !d.archived && d.location.length);
    const located = [];
    for (const d of docs) for (const l of d.location) if (!holderSet || holderSet.has(l.holder)) located.push({ d, l });
    const counts = { in: 0, out: 0, internal: 0 };
    for (const { d } of located) counts[d.direction] = (counts[d.direction] || 0) + 1;
    const ff = a.folderId ? svc.folderFilter(a.folderId) : null;
    const rows = ff ? located.filter(({ d }) => ff(d)).map(({ d, l }) => svc.row(user, d, {
      holderName: holderShort(svc.s, l.holder), officeSince: l.since, rowKey: d.id + '|' + l.holder,
    })) : [];
    return {
      counts: { VHODNI: counts.in, IZHODNI: counts.out, INTERNI: counts.internal, total: counts.in + counts.out + counts.internal },
      rows,
      roles: svc.s.roles.filter((r) => allowedCids.includes(r.companyId)).map((r) => ({ id: r.id, name: r.name, path: r.path })),
    };
  },

  // ------------------------------------------------------------ directory
  searchPartners(svc, user, a) {
    const cid = a.companyId || svc.companyScope(user, 'all')[0];
    svc.companyScope(user, cid);
    const lc = (s) => String(s || '').toLocaleLowerCase('sl');
    const q = { name: lc(a.name), address: lc(a.address), taxNo: lc(a.taxNo), externalId: lc(a.externalId) };
    const all = svc.s.partners.filter((p) => p.companyId === cid && !p.oneTime &&
      (!q.name || lc(p.fullName).includes(q.name) || lc(p.shortName).includes(q.name)) &&
      (!q.address || lc(`${p.address} ${p.city} ${p.postal}`).includes(q.address)) &&
      (!q.taxNo || lc(p.taxNo).includes(q.taxNo) || lc(p.vatId).includes(q.taxNo)) &&
      (!q.externalId || lc(p.externalId).includes(q.externalId)))
      .sort((x, y) => y.shortName.localeCompare(x.shortName, 'sl'));
    const LIMIT = 255;
    const res = { rows: all.slice(0, LIMIT), total: all.length, shown: Math.min(LIMIT, all.length) };
    if (a.external) res.externalNotice = adapters.registry.search(svc, user, a).message;
    return res;
  },
  savePartner(svc, user, a) {
    const p = a.partner || {};
    need(p.shortName && String(p.shortName).trim(), 'Kratko ime podjetja je obvezno.');
    const cid = p.companyId;
    svc.companyScope(user, cid);
    if (!flag(svc.s, user, cid, 'directory')) throw new AccessError('Nimate pravice urejanja imenika.');
    const fields = ['fullName', 'shortName', 'representative', 'taxNo', 'regNo', 'email', 'web', 'ean', 'phone', 'fax', 'address',
      'city', 'postal', 'post', 'country', 'vatId', 'vatPayer', 'externalId', 'ebaId'];
    let target = p.id ? svc.s.partners.find((x) => x.id === p.id) : null;
    if (p.id && (!target || target.companyId !== cid)) throw new AccessError('Partner ne obstaja.');
    if (!target) { target = { id: hexId(8), companyId: cid, source: 'Lokalno', oneTime: !!a.oneTime, contacts: [] }; svc.s.partners.push(target); }
    for (const f of fields) if (f in p) target[f] = f === 'vatPayer' ? !!p[f] : String(p[f] ?? '').slice(0, 200);
    if (Array.isArray(p.contacts)) {
      target.contacts = p.contacts.filter((c) => c && (c.name || c.email || c.phone || c.desc))
        .map((c) => ({ name: String(c.name || ''), email: String(c.email || ''), phone: String(c.phone || ''), desc: String(c.desc || '') }));
    }
    svc.commit();
    return target;
  },
  deletePartner(svc, user, a) {
    const p = svc.s.partners.find((x) => x.id === a.id);
    need(p, 'Partner ne obstaja.');
    svc.companyScope(user, p.companyId);
    if (!flag(svc.s, user, p.companyId, 'directory')) throw new AccessError('Nimate pravice urejanja imenika.');
    svc.s.partners = svc.s.partners.filter((x) => x.id !== a.id);
    svc.commit();
    return { ok: true };
  },

  // ------------------------------------------------------------ personal settings
  getPersonal(svc, user) {
    return structuredClone(svc.s.personal[user.id] || defaultPersonal());
  },
  savePersonal(svc, user, a) {
    const cur = svc.s.personal[user.id] || defaultPersonal();
    const next = { ...cur };
    if (Array.isArray(a.substitutions)) {
      next.substitutions = a.substitutions.map((s) => {
        need(s.substituteUserId && svc.user(s.substituteUserId), 'Izberite nadomestnega uporabnika.');
        need(s.from && s.to && s.from <= s.to, 'Obdobje nadomeščanja ni veljavno.');
        if (s.companyId) svc.companyScope(user, s.companyId);
        return { id: s.id || hexId(6), companyId: s.companyId || '', substituteUserId: s.substituteUserId, from: s.from, to: s.to, notify: !!s.notify, desc: String(s.desc || '') };
      });
    }
    if (a.scanner) next.scanner = { ...cur.scanner, ...pick(a.scanner, Object.keys(defaultPersonal().scanner)) };
    if (a.other) next.other = { ...cur.other, ...pick(a.other, Object.keys(defaultPersonal().other)) };
    if (a.columns) next.columns = { ...cur.columns, ...a.columns };
    if (a.resetColumns) next.columns = {};
    if (a.view) next.view = { ...cur.view, ...pick(a.view, Object.keys(defaultPersonal().view)) };
    svc.s.personal[user.id] = next;
    svc.commit();
    return structuredClone(next);
  },
  importSettingsFile(svc, user, a) {
    let data = a.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { throw new ValidationError('Datoteka ni veljaven JSON.'); } }
    need(data && typeof data === 'object' && /^(eba-)?dms-demo-personal-settings$/.test(data.kind), `Datoteka ni nastavitvena datoteka ${BRAND.name} demo.`);
    return API.savePersonal(svc, user, { scanner: data.scanner, other: data.other, columns: data.columns, view: data.view });
  },

  // ------------------------------------------------------------ app settings
  getAppSettings(svc, user) {
    const st = svc.s.settings;
    return {
      canEdit: anyFlag(svc.s, user, 'settings'),
      connections: st.connections.map((c) => ({ ...c, password: c.password ? MASK : '', proxyPassword: c.proxyPassword ? MASK : '' })),
      system: { ...st.system, env: st.system.env.map((e) => ({ ...e, value: e.concealed ? MASK : e.value })) },
    };
  },
  saveAppSettings(svc, user, a) {
    if (!anyFlag(svc.s, user, 'settings')) throw new AccessError('Nastavitve lahko spreminja le skrbnik.');
    const st = svc.s.settings;
    if (Array.isArray(a.connections)) {
      st.connections = a.connections.map((c) => {
        const old = st.connections.find((x) => x.id === c.id) || {};
        const keepSecret = (v, prev) => (v === MASK ? prev || '' : String(v || ''));
        return {
          id: c.id || hexId(6), status: c.status === 'Onemogočena' ? 'Onemogočena' : 'Omogočena', name: String(c.name || 'Nova povezava'),
          type: ['PostgreSQL', 'SQLite', 'Microsoft SQL Server'].includes(c.type) ? c.type : 'PostgreSQL', testAgency: !!c.testAgency,
          createdAt: old.createdAt || svc.now(), auxiliary: !!c.auxiliary, dbName: String(c.dbName || ''), username: String(c.username || ''),
          password: keepSecret(c.password, old.password), server: String(c.server || ''), port: String(c.port || 'Privzeto'),
          file: String(c.file || ''), useProxy: !!c.useProxy, proxyName: String(c.proxyName || ''), proxyUrl: String(c.proxyUrl || ''),
          proxyPassword: keepSecret(c.proxyPassword, old.proxyPassword), mode: String(c.mode || 'Samodejno'),
          localScannerDb: String(c.localScannerDb || ''), extraVars: String(c.extraVars || ''), connectionId: String(c.connectionId || ''),
        };
      });
    }
    if (a.system) {
      const s = a.system;
      const oldEnv = st.system.env;
      st.system = {
        proxyMode: ['direct', 'system', 'manual'].includes(s.proxyMode) ? s.proxyMode : 'direct',
        proxy: String(s.proxy || ''), proxyPort: Number(s.proxyPort) || 0, proxyAuth: !!s.proxyAuth,
        env: (s.env || []).filter((e) => e.key).map((e) => {
          const prev = oldEnv.find((x) => x.key === e.key);
          return { key: String(e.key), concealed: !!e.concealed, value: e.value === MASK && prev ? prev.value : String(e.value ?? '') };
        }),
        language: 'Slovenščina', logFolder: String(s.logFolder || ''), logLevel: ['', 'Napake', 'Opozorila', 'Informacije', 'Razhroščevanje'].includes(s.logLevel) ? s.logLevel : '',
      };
    }
    svc.log(user, 'Nastavitve', 'save', 'ok', 'Nastavitve shranjene');
    svc.commit();
    return API.getAppSettings(svc, user);
  },
  testConnection(svc, user, a) {
    const c = a.connection || {};
    return adapters.database.test(svc, user, c);
  },
  databaseMaintenance(svc, user, a) {
    if (!anyFlag(svc.s, user, 'settings')) throw new AccessError('Vzdrževanje baze lahko izvaja le skrbnik.');
    const res = adapters.database.maintenance(svc, user, a.op);
    svc.commit();
    return res;
  },
  logFile(svc, user) {
    const lines = svc.s.integrationLog.slice(-300).map((l) => `${fmtStamp(l.at)}\t${l.adapter}\t${l.op}\t${l.outcome}\t${l.detail || ''}`);
    return { text: lines.join('\n') || '(dnevnik je prazen)' };
  },

  changePassword(svc, user, a) {
    need(checkPassword(String(a.old || ''), user.password), 'Staro geslo ni pravilno.');
    need(String(a.next || '').length >= 4, 'Novo geslo mora imeti vsaj 4 znake.');
    need(a.next === a.repeat, 'Gesli se ne ujemata.');
    user.password = hashPassword(String(a.next));
    svc.commit();
    return { ok: true };
  },
  verifyPassword(svc, user, a) {
    if (!checkPassword(String(a.password || ''), user.password)) throw new ValidationError('Geslo ni pravilno.');
    return { ok: true };
  },
  backup(svc, user) {
    if (!anyFlag(svc.s, user, 'admin')) throw new AccessError('Varnostno kopijo lahko naredi le upravnik.');
    const copy = structuredClone(svc.s);
    for (const u of copy.users) u.password = '(odstranjeno)';
    for (const c of copy.settings.connections) { c.password = c.password ? '(odstranjeno)' : ''; c.proxyPassword = c.proxyPassword ? '(odstranjeno)' : ''; }
    for (const e of copy.settings.system.env) if (e.concealed) e.value = '(odstranjeno)';
    svc.log(user, 'Varnostna kopija', 'export', 'ok', 'Lokalni izvoz stanja (brez datotek blob)');
    svc.commit();
    return { kind: 'eba-dms-demo-backup', createdAt: svc.now(), note: 'Lokalna demo kopija stanja; vsebine datotek niso vključene.', state: copy };
  },
};

// Scanner and intake API live in intake.js but share helpers.
export function validateHolder(svc, holder, companyId) {
  const [kind, id] = String(holder).split(':');
  if (kind === 'role') {
    const r = svc.role(id);
    if (!r || r.companyId !== companyId) throw new ValidationError('Neveljavna vloga.');
  } else if (kind === 'user') {
    const u = svc.user(id);
    if (!u || u.login === false || !u.roleIds.some((rid) => svc.role(rid)?.companyId === companyId)) throw new ValidationError('Uporabnik ni član podjetja.');
  } else throw new ValidationError('Neveljaven prejemnik.');
}

export function takeUploadedBlob(svc, user, blobId, owner) {
  const meta = svc.s.blobs[blobId];
  if (!meta || meta.owner?.type !== 'upload' || meta.owner.userId !== user.id) throw new AccessError('Datoteka ni na voljo.');
  meta.owner = owner;
  return meta;
}

export function defaultPersonal() {
  return {
    substitutions: [],
    scanner: {
      moveImported: false, moveFolder: `C:\\${BRAND.folder}\\imported`, renameImported: false, renamePattern: '#FILENAME#_imported(#DATE#).#SUFFIX#',
      importFolder: '', exportFolder: `C:\\${BRAND.folder}\\export`, noAutoSubject: false, noAutoDate: null, showClassification: false,
      noOcrDefault: false, errorsOnlyData: false, selectFirst: false,
    },
    other: { trayOnClose: null, notifyForward: null, notifyGrant: null, noPopup: null, keepScrollbar: false },
    columns: {},
    view: { iconSize: 'small', textMode: 'beside', toolbar: true, details: true },
  };
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) if (k in obj) o[k] = obj[k];
  return o;
}

// Used by intake to build extracted rows from a generated page.
export function extractFromPage(svc, blobId, category) {
  const text = svc.store.blobText(blobId);
  const meta = readDemoMetadata(text || '');
  const defs = EXTRACTION_FIELDS[category] || EXTRACTION_FIELDS.racun;
  if (!meta) return { extracted: [], values: {} };
  const extracted = [];
  for (const [key, label, type] of defs.main) {
    const v = meta.values?.[key];
    extracted.push({ key, label, type, value: v ?? null, region: meta.regions?.[key] ? { page: 0, ...meta.regions[key] } : null, pattern: '' });
  }
  return { extracted, values: meta.values || {}, meta };
}

export { renderInvoicePage, directionLabel };
