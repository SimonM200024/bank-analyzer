// Access control. Every query and command in the service goes through these
// checks; hidden/disabled buttons in the UI are only a convenience.
//
// Model (replica assumption, documented in README):
//  - A user belongs to roles; each role belongs to one company.
//  - A role carries a permission matrix: category -> allowed actions, plus
//    flags (supervise, admin, settings, scan, directory).
//  - A user can read a document when (a) the document's company is one of the
//    user's companies, (b) one of the user's roles in that company may "read"
//    the category, and (c) the document sits in / was granted to one of the
//    user's holders (user:<id>, role:<id>, or holders the user substitutes for),
//    or the role may supervise, or is an administrator.

export class AccessError extends Error {
  constructor(msg, code = 403) { super(msg); this.code = code; }
}

export function userCompanies(state, user) {
  const ids = new Set(user.roleIds.map((rid) => state.roles.find((r) => r.id === rid)?.companyId).filter(Boolean));
  return state.companies.filter((c) => ids.has(c.id));
}

export function rolesIn(state, user, companyId) {
  return user.roleIds.map((rid) => state.roles.find((r) => r.id === rid)).filter((r) => r && r.companyId === companyId);
}

// Substitutions active "now" where this user replaces another user.
export function activeSubstitutions(state, user, now) {
  const out = [];
  for (const [uid, p] of Object.entries(state.personal || {})) {
    for (const s of p.substitutions || []) {
      if (s.substituteUserId !== user.id) continue;
      if (s.from && now < s.from) continue;
      if (s.to && now > s.to + 'T23:59:59') continue;
      out.push({ ...s, ownerUserId: uid });
    }
  }
  return out;
}

// Holder ids this user acts for in a company.
export function holdersOf(state, user, companyId, now) {
  const set = new Set([`user:${user.id}`]);
  for (const r of rolesIn(state, user, companyId)) set.add(`role:${r.id}`);
  if (now) {
    for (const s of activeSubstitutions(state, user, now)) {
      if (s.companyId && s.companyId !== companyId) continue;
      const owner = state.users.find((u) => u.id === s.ownerUserId);
      if (!owner) continue;
      set.add(`user:${owner.id}`);
      for (const r of rolesIn(state, owner, companyId)) set.add(`role:${r.id}`);
    }
  }
  return set;
}

export function can(state, user, companyId, category, action) {
  return rolesIn(state, user, companyId).some((r) => r.admin || (r.perms?.[category] || []).includes(action));
}
export function flag(state, user, companyId, name) {
  return rolesIn(state, user, companyId).some((r) => r.admin || r[name]);
}
export function anyFlag(state, user, name) {
  return userCompanies(state, user).some((c) => flag(state, user, c.id, name));
}

export function canRead(state, user, doc, now) {
  if (!doc || doc.deleted) return false;
  if (!userCompanies(state, user).some((c) => c.id === doc.companyId)) return false;
  if (!can(state, user, doc.companyId, doc.category, 'read')) return false;
  if (flag(state, user, doc.companyId, 'admin') || flag(state, user, doc.companyId, 'supervise')) return true;
  const holders = holdersOf(state, user, doc.companyId, now);
  return doc.location.some((l) => holders.has(l.holder)) || doc.access.some((a) => holders.has(a.holder));
}

export function inOffice(state, user, doc, now) {
  const holders = holdersOf(state, user, doc.companyId, now);
  return doc.location.some((l) => holders.has(l.holder));
}

export function assertRead(state, user, doc, now) {
  if (!doc || doc.deleted) throw new AccessError('Dokument ne obstaja.', 404);
  if (!canRead(state, user, doc, now)) throw new AccessError('Nimate dostopa do tega dokumenta.');
}

export function assertCan(state, user, doc, action, now) {
  assertRead(state, user, doc, now);
  if (!can(state, user, doc.companyId, doc.category, action)) {
    throw new AccessError(`Vaša vloga nima pravice "${ACTION_LABELS[action] || action}" za ta tip dokumenta.`);
  }
}

export const ACTION_LABELS = {
  read: 'branje', edit: 'urejanje', initial: 'parafiranje', sign: 'podpisovanje', forward: 'posredovanje',
  reject: 'zavračanje', dispatch: 'odprema', archive: 'hramba', delete: 'brisanje', classify: 'klasifikacija',
  grant: 'dodeljevanje dostopa', tag: 'oznake', pantheon: 'prenos v Pantheon',
};

export function holderLabel(state, holder) {
  const [kind, id] = String(holder).split(':');
  if (kind === 'user') return state.users.find((u) => u.id === id)?.name || holder;
  if (kind === 'role') return state.roles.find((r) => r.id === id)?.path || holder;
  return holder;
}
export function holderShort(state, holder) {
  const [kind, id] = String(holder).split(':');
  if (kind === 'user') return state.users.find((u) => u.id === id)?.name || holder;
  if (kind === 'role') return state.roles.find((r) => r.id === id)?.name || holder;
  return holder;
}
