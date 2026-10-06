// Search criteria evaluation. Semantics are replica choices (the original
// backend was not inspected) and are documented in README:
//  - rows for the same criterion are OR-ed (green "+" adds an alternative),
//    different criteria are AND-ed;
//  - a row with an empty value is ignored unless its operator is
//    "je prazen" / "ni prazen";
//  - text comparisons are case-insensitive; "ni enak" also matches empty values;
//  - dates compare by calendar day; amounts compare numerically (2 decimals);
//  - "Da"/"Ne" checkboxes: exactly one ticked filters, both or none ignore.

import { criterionByKey } from '../core/schema.js';
import { parseAmount, parseDate, dayKey, fmtDate, fmtAmount, norm } from '../core/format.js';

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

function asText(v, type) {
  if (v == null) return '';
  if (type === 'date') return fmtDate(v);
  if (type === 'amount') return fmtAmount(v);
  return String(v);
}

function cmpRaw(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function compare(op, docVal, critVal, type) {
  if (op === 'empty') return isEmpty(docVal);
  if (op === 'notEmpty') return !isEmpty(docVal);
  if (type === 'date') {
    const d = dayKey(docVal), c = dayKey(parseDate(critVal));
    if (c == null) return true; // unparsable criterion is ignored (validated in UI)
    if (op === 'ne') return d == null || d !== c;
    if (d == null) return false;
    return { eq: d === c, lt: d < c, le: d <= c, gt: d > c, ge: d >= c, starts: String(d).startsWith(String(c)), contains: d === c }[op] ?? false;
  }
  if (type === 'amount') {
    const c = parseAmount(critVal);
    if (c == null) return true;
    const d = docVal == null || docVal === '' ? null : Math.round(Number(docVal) * 100);
    const cc = Math.round(c * 100);
    if (op === 'ne') return d == null || d !== cc;
    if (d == null) return false;
    if (op === 'starts' || op === 'contains') return norm(asText(docVal, 'amount')).includes(norm(critVal));
    return { eq: d === cc, lt: d < cc, le: d <= cc, gt: d > cc, ge: d >= cc }[op] ?? false;
  }
  // text
  const d = norm(asText(docVal, typeof docVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(docVal) ? 'date' : 'text'));
  const c = norm(critVal);
  if (op === 'ne') return d !== c;
  if (!d) return false;
  const bothNum = /^-?\d+(\.\d+)?$/.test(d) && /^-?\d+(\.\d+)?$/.test(c);
  const ord = bothNum ? cmpRaw(Number(d), Number(c)) : d.localeCompare(c, 'sl');
  return {
    starts: d.startsWith(c), contains: d.includes(c), eq: d === c,
    lt: ord < 0, le: ord <= 0, gt: ord > 0, ge: ord >= 0,
  }[op] ?? false;
}

// helpers: { docProp(doc, prop) -> value }
function evalRow(doc, row, crit, helpers, allRows) {
  const op = row.op;
  const val = row.value;
  if (crit.group === 'content') {
    const v = doc.fields?.[crit.key];
    if (crit.type === 'enum') {
      const want = Array.isArray(val) ? val : [val];
      const hit = want.includes(v);
      return op === 'notIn' ? !hit : hit;
    }
    return compare(op, v, val, crit.type);
  }
  // general criteria
  switch (crit.prop) {
    case 'personalData':
    case 'archival': {
      const v = !!doc[crit.prop];
      return val === 'da' ? v : val === 'ne' ? !v : true;
    }
    case 'signatureState':
    case 'classification':
    case 'tags': {
      const want = Array.isArray(val) ? val : [val];
      const have = crit.prop === 'tags' ? doc.tags : crit.prop === 'classification' ? [doc.classification] : [helpers.signatureState(doc)];
      const hit = want.some((w) => have.includes(w));
      return op === 'notIn' ? !hit : hit;
    }
    case 'location':
      return doc.location.some((l) => l.holder === val);
    case 'access':
      return doc.access.some((a) => a.holder === val) || doc.location.some((l) => l.holder === val);
    case 'classNode':
      return compare(op, doc.classification || '', val, 'text');
    case 'actions': {
      const want = Array.isArray(val) ? val : [val];
      const dateRow = allRows.find((r) => r.key === 'g_datum_akcije' && !isEmpty(r.value));
      const holderRow = allRows.find((r) => r.key === 'g_nosilec_akcije' && !isEmpty(r.value));
      const hit = doc.events.some((e) => {
        if (!want.some((w) => e.action === w || e.action.startsWith(w + ' '))) return false;
        if (dateRow && !compare(dateRow.op, e.at, dateRow.value, 'date')) return false;
        if (holderRow && e.userId !== holderRow.value) return false;
        return true;
      });
      return op === 'notIn' ? !hit : hit;
    }
    case 'actionDate':
    case 'actionHolder':
      return true; // evaluated together with "Akcija na dokumentu"
    case 'sender':
    case 'recipient':
      if (row.partnerId) return doc[crit.prop + 'PartnerId'] === row.partnerId || norm(doc[crit.prop]) === norm(val);
      return compare(op || 'contains', doc[crit.prop], val, 'text');
    default:
      return compare(op, doc[crit.prop], val, crit.type);
  }
}

export function rowActive(row) {
  if (!row) return false;
  if (row.op === 'empty' || row.op === 'notEmpty') return true;
  return !isEmpty(row.value);
}

export function matchCriteria(doc, criteria, helpers) {
  if (criteria.types && criteria.types.ids?.length) {
    const hit = criteria.types.ids.includes(doc.category);
    if (['out', 'exclude'].includes(criteria.types.mode) ? hit : !hit) return false;
  }
  if (criteria.direction && doc.direction !== criteria.direction) return false;
  const wantActive = criteria.active !== false, wantArchived = !!criteria.archived;
  if (doc.archived ? !wantArchived : !wantActive) return false;

  const groups = new Map();
  for (const row of criteria.rows || []) {
    if (!rowActive(row)) continue;
    const crit = criterionByKey[row.key];
    if (!crit) continue;
    if (crit.dependsOn) continue;
    if (!groups.has(row.key)) groups.set(row.key, []);
    groups.get(row.key).push(row);
  }
  for (const [key, rows] of groups) {
    const crit = criterionByKey[key];
    if (!rows.some((r) => evalRow(doc, r, crit, helpers, criteria.rows))) return false;
  }
  return true;
}
