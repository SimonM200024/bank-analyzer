// Bank statement parsing and reconciliation. Pure functions: no DOM, no network.
// Amounts are integers in workspace minor units; money in is positive, money out negative.

const clean = (v) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
export const normalize = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// ---------- Values ----------

export function parseAmount(value) {
  let s = clean(value).replace(/[^\d,.\-+()−]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /[-−]$/.test(s);
  s = s.replace(/[()+\-−]/g, "");
  const comma = s.lastIndexOf(","),
    dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1)
    s =
      comma > dot
        ? s.replaceAll(".", "").replace(",", ".")
        : s.replaceAll(",", "");
  else if (comma > -1)
    s =
      s.length - comma - 1 === 3 && s.split(",").length > 2
        ? s.replaceAll(",", "")
        : s.replaceAll(",", ".");
  else if (dot > -1 && s.split(".").length > 2) s = s.replaceAll(".", "");
  if ((s.match(/\./g) || []).length > 1) return null;
  const n = Math.round(Number(s) * 100);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseDate(value) {
  const s = clean(value);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)))
    [, d, mo, y] = m;
  else if ((m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/)))
    [, d, mo, y] = m;
  else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [, y, mo, d] = m;
  else return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(iso + "T12:00:00Z");
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso
    ? null
    : iso;
}

// ---------- CSV ----------

export function parseCSV(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const firstLines = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const delimiter = [";", "\t", ",", "|"]
    .map((d) => ({
      d,
      n: firstLines.map((l) => splitLine(l, d).length),
    }))
    .map(({ d, n }) => ({
      d,
      score: n.length ? Math.min(...n.slice(-Math.max(1, n.length - 3))) : 0,
    }))
    .sort((a, b) => b.score - a.score)[0].d;
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && !field.trim()) {
      field = "";
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row.map(clean));
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row.map(clean));
  return { delimiter, rows };
}
function splitLine(line, d) {
  let n = [""],
    q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === d && !q) n.push("");
  }
  return n;
}

const headerHints = {
  date: [
    "datum knjizenja",
    "datum knjiženja",
    "booking date",
    "datum",
    "date",
    "datum valute",
    "value date",
    "transaction date",
    "posting date",
  ],
  amount: ["znesek", "amount", "iznos", "betrag", "value"],
  debit: ["breme", "v breme", "odliv", "debit", "paid out", "withdrawal", "out"],
  credit: ["dobro", "v dobro", "priliv", "credit", "paid in", "deposit", "in"],
  counterparty: [
    "naziv prejemnika/placnika",
    "prejemnik/plačnik",
    "prejemnik / placnik",
    "partner",
    "counterparty",
    "naziv",
    "payee",
    "beneficiary",
    "name",
    "prejemnik",
    "placnik",
    "plačnik",
  ],
  description: [
    "namen",
    "namen placila",
    "namen plačila",
    "opis",
    "description",
    "details",
    "purpose",
    "memo",
    "remittance",
    "narrative",
  ],
  reference: ["referenca", "sklic", "reference", "ref", "end to end", "e2e"],
  currency: ["valuta", "currency", "ccy"],
};
const fold = (s) =>
  clean(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function guessMapping(header) {
  const cols = header.map(fold),
    used = new Set(),
    mapping = {};
  for (const [key, hints] of Object.entries(headerHints)) {
    let best = -1,
      score = 0;
    cols.forEach((c, i) => {
      if (used.has(i)) return;
      hints.forEach((h, rank) => {
        const hh = fold(h);
        const s =
          c === hh
            ? 100 - rank
            : c.split(/[^a-z0-9]+/).includes(hh) || (hh.length > 4 && c.includes(hh))
              ? 50 - rank
              : 0;
        if (s > score) {
          score = s;
          best = i;
        }
      });
    });
    if (best > -1) {
      mapping[key] = best;
      used.add(best);
    }
  }
  if (mapping.debit !== undefined && mapping.credit === undefined)
    delete mapping.debit;
  if (mapping.credit !== undefined && mapping.debit === undefined)
    delete mapping.credit;
  if (mapping.amount !== undefined && mapping.debit !== undefined) {
    delete mapping.debit;
    delete mapping.credit;
  }
  return mapping;
}

export function findHeaderRow(rows) {
  let best = 0,
    score = -1;
  rows.slice(0, 25).forEach((r, i) => {
    const m = guessMapping(r);
    const s =
      (m.date !== undefined ? 2 : 0) +
      (m.amount !== undefined || m.debit !== undefined ? 2 : 0) +
      Object.keys(m).length;
    if (s > score) {
      score = s;
      best = i;
    }
  });
  return best;
}

export function applyMapping(rows, mapping, headerRow = 0) {
  const lines = [],
    errors = [];
  const at = (r, k) => (mapping[k] === undefined || mapping[k] === "" ? "" : r[Number(mapping[k])] ?? "");
  if (mapping.date === undefined || mapping.date === "")
    errors.push({ row: headerRow + 1, message: "Choose the date column." });
  if (
    (mapping.amount === undefined || mapping.amount === "") &&
    (mapping.debit === undefined || mapping.debit === "" || mapping.credit === undefined || mapping.credit === "")
  )
    errors.push({
      row: headerRow + 1,
      message: "Choose an amount column, or both money out and money in columns.",
    });
  if (errors.length) return { lines, errors };
  rows.slice(headerRow + 1).forEach((r, i) => {
    const rowNo = headerRow + i + 2;
    const date = parseDate(at(r, "date"));
    let amount;
    if (mapping.amount !== undefined && mapping.amount !== "")
      amount = parseAmount(at(r, "amount"));
    else {
      const out = parseAmount(at(r, "debit")),
        inn = parseAmount(at(r, "credit"));
      amount =
        out == null && inn == null
          ? null
          : (inn ? Math.abs(inn) : 0) - (out ? Math.abs(out) : 0);
    }
    if (!date && amount == null) return; // summary or blank row
    if (!date) return errors.push({ row: rowNo, message: "Date is not recognised." });
    if (amount == null || amount === 0)
      return errors.push({ row: rowNo, message: "Amount is missing or zero." });
    lines.push({
      date,
      amount,
      currency: clean(at(r, "currency")).toUpperCase().slice(0, 3),
      counterparty: clean(at(r, "counterparty")).slice(0, 140),
      description: clean(at(r, "description")).slice(0, 300),
      reference: clean(at(r, "reference")).slice(0, 60),
    });
  });
  return { lines, errors };
}

// ---------- ISO 20022 camt.053 / camt.052 ----------

const tag = (xml, path) => {
  let cur = xml;
  for (const name of path.split("/")) {
    const m = cur.match(
      new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`),
    );
    if (!m) return "";
    cur = m[1];
  }
  return cur;
};
const all = (xml, name) =>
  [
    ...xml.matchAll(
      new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"),
    ),
  ].map((m) => m[1]);
const xmlText = (s) =>
  clean(
    String(s)
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&"),
  );

export function parseCamt(text) {
  const lines = [],
    errors = [];
  all(text, "Ntry").forEach((e, i) => {
    const amt = e.match(/<(?:\w+:)?Amt\b([^>]*)>([^<]+)</);
    const credit = xmlText(tag(e, "CdtDbtInd")) === "CRDT";
    const date = parseDate(
      xmlText(tag(e, "BookgDt/Dt") || tag(e, "BookgDt/DtTm") || tag(e, "ValDt/Dt")),
    );
    const value = amt ? Math.round(Number(amt[2]) * 100) : NaN;
    if (!date || !Number.isFinite(value) || !value) {
      errors.push({ row: i + 1, message: "Statement entry could not be read." });
      return;
    }
    const tx = tag(e, "NtryDtls/TxDtls") || e;
    const party = credit
      ? xmlText(tag(tx, "RltdPties/Dbtr/Nm") || tag(tx, "RltdPties/Dbtr/Pty/Nm"))
      : xmlText(tag(tx, "RltdPties/Cdtr/Nm") || tag(tx, "RltdPties/Cdtr/Pty/Nm"));
    const ustrd = all(tx, "Ustrd").map(xmlText).join(" ");
    const ref =
      xmlText(tag(tx, "RmtInf/Strd/CdtrRefInf/Ref")) ||
      xmlText(tag(tx, "Refs/EndToEndId")).replace(/^NOTPROVIDED$/i, "") ||
      xmlText(tag(e, "AcctSvcrRef"));
    lines.push({
      date,
      amount: credit ? Math.abs(value) : -Math.abs(value),
      currency: (amt[1].match(/Ccy="([A-Z]{3})"/) || [])[1] || "",
      counterparty: party.slice(0, 140),
      description: (ustrd || xmlText(tag(e, "AddtlNtryInf"))).slice(0, 300),
      reference: ref.slice(0, 60),
    });
  });
  if (!lines.length && !errors.length)
    errors.push({ row: 1, message: "No statement entries were found in this file." });
  return { lines, errors };
}

// ---------- Entry point ----------

export function readStatement(text, filename = "") {
  const src = String(text || "");
  if (/<(?:\w+:)?BkToCstmrStmt|<(?:\w+:)?BkToCstmrAcctRpt|<(?:\w+:)?Ntry\b/.test(src))
    return { format: "camt", ...parseCamt(src) };
  if (/^\s*</.test(src))
    return {
      format: "unknown",
      lines: [],
      errors: [{ row: 1, message: "This XML file is not an ISO 20022 camt statement." }],
    };
  const { rows, delimiter } = parseCSV(src);
  if (!rows.length)
    return { format: "csv", lines: [], errors: [{ row: 1, message: "The file is empty." }] };
  const headerRow = findHeaderRow(rows),
    mapping = guessMapping(rows[headerRow]);
  return {
    format: "csv",
    delimiter,
    rows,
    headerRow,
    header: rows[headerRow],
    mapping,
    filename,
    ...applyMapping(rows, mapping, headerRow),
  };
}

// Stable identifiers let the same statement be imported twice without duplicates.
function hash(s) {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 10);
}
export function withIds(lines) {
  const seen = new Map();
  return lines.map((l) => {
    const base = [l.date, l.amount, normalize(l.counterparty), normalize(l.description), normalize(l.reference)].join("|");
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return { ...l, id: hash(base + "#" + n) };
  });
}
export function mergeLines(existing, incoming) {
  const ids = new Set(existing.map((l) => l.id));
  const added = incoming.filter((l) => !ids.has(l.id));
  return {
    lines: [...existing, ...added].sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    ),
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

// ---------- Categories ----------

const categoryRules = [
  ["Bank fees", /PROVIZIJ|NADOMESTIL|STROSKIVODENJA|BANKFEE|\bFEE|CHARGE|VODENJERACUNA/],
  ["Taxes & contributions", /FURS|DAVEK|DDV|PRISPEV|\bTAX|\bVAT|DOHODNIN|ZZZS|ZPIZ/],
  ["Payroll", /PLACA|PLACE|SALARY|PAYROLL|REGRES|WAGE/],
  ["Rent & facilities", /NAJEMNIN|RENT|LEASE|UPRAVNIK|OBRATOVALN/],
  ["Utilities", /ELEKTR|ENERGIJ|PLIN|VODOVOD|KOMUNAL|TELEKOM|A1SLOVEN|TELEMACH|T2|INTERNET|MOBIL/],
  ["Software & subscriptions", /GOOGLE|MICROSOFT|ADOBE|SLACK|ATLASSIAN|NOTION|DROPBOX|GITHUB|AWS|AMAZONWEB|ZOOM|OPENAI|ANTHROPIC|SUBSCRIPT|NAROCNIN/],
  ["Travel & fuel", /PETROL|OMV|MOL|SHELL|BENCIN|GORIV|FUEL|AIRLINE|HOTEL|BOOKING|RYANAIR|LUFTHANSA|DARS|VINJET|PARKIR|TAXI|UBER/],
  ["Insurance", /ZAVAROVAL|INSURANCE|TRIGLAV|GENERALI|SAVAPOKOJ|ALLIANZ/],
  ["Marketing", /FACEBK|FACEBOOK|META|GOOGLEADS|ADWORDS|LINKEDIN|OGLAS|MARKETING/],
  ["Supplies & materials", /MATERIAL|SUPPL|MERKUR|BAUHAUS|OBI|HOFER|LIDL|SPAR|MERCATOR|TUS|PISARN/],
];
export const expenseCategories = [
  ...categoryRules.map(([c]) => c),
  "Suppliers",
  "Other",
];
export function guessCategory(line, learned = {}, supplierNames = []) {
  const party = normalize(line.counterparty);
  if (party && learned[party]) return learned[party];
  if (supplierNames.some((n) => nameMatches(n, line))) return "Suppliers";
  const text = normalize(`${line.counterparty} ${line.description}`);
  for (const [category, re] of categoryRules) if (re.test(text)) return category;
  return "Other";
}

// ---------- Reconciliation ----------

const legal = new Set(["DOO", "DD", "SP", "DNO", "KD", "LTD", "GMBH", "INC", "LLC", "SRL", "SPA", "AG", "BV", "THE", "AND", "COMPANY", "CO"]);
function nameTokens(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b(D\.?\s?O\.?\s?O|D\.?\s?D|S\.?\s?P)\.?(?=\s|$)/g, " ")
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3 && !legal.has(t));
}
export function nameMatches(name, line) {
  const tokens = nameTokens(name);
  if (!tokens.length) return false;
  const words = new Set(nameTokens(`${line.counterparty} ${line.description}`));
  const hits = tokens.filter((t) => words.has(t)).length;
  return hits >= Math.min(2, tokens.length);
}

export const marker = (id) => `#${id}`;
const markerIn = (text) => {
  const m = String(text || "").match(/#([0-9a-f]{10})\b/);
  return m ? m[1] : null;
};
export function paymentReference(line) {
  const what = clean(line.reference || line.counterparty || line.description || "Bank transfer").slice(0, 60);
  return `Bank ${line.date} · ${what} · ${marker(line.id)}`;
}
export function expenseNote(line) {
  return [
    `Bank statement line ${marker(line.id)} · ${line.date}`,
    line.counterparty && `Counterparty: ${line.counterparty}`,
    line.description && `Details: ${line.description}`,
    line.reference && `Reference: ${line.reference}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);
}

// Links recorded in the workspace, keyed by statement line id.
export function postedLinks(data) {
  const links = new Map();
  const add = (id, link) => {
    if (!links.has(id)) links.set(id, []);
    links.get(id).push(link);
  };
  for (const p of data.payments || []) {
    const id = markerIn(p.reference);
    if (id && !p.reversed_at)
      add(id, { kind: "payment", id: p.id, invoice_id: p.invoice_id, amount: Number(p.amount_cents) });
  }
  for (const r of data.hub_records || []) {
    if (r.module !== "costs" || r.archived || r.data?.status !== "Paid") continue;
    const id = markerIn(r.data?.notes);
    if (id) add(id, {
        kind: "expense",
        id: r.id,
        category: r.data.category,
        amount: -Math.abs(Number(r.data.amount || 0)),
      });
  }
  return links;
}

export function reconcile(data, lines, local = {}, today = new Date().toISOString().slice(0, 10)) {
  const currency = data.workspace?.currency || "EUR";
  const ignored = new Set(local.ignored || []);
  const learned = local.learned || {};
  const links = postedLinks(data);
  const companies = new Map((data.companies || []).map((c) => [c.id, c]));
  const suppliers = (data.companies || []).filter((c) => c.supplier).map((c) => c.name);
  const open = (data.invoices || [])
    .map((i) => ({ ...i, balance: Number(i.total_cents) - Number(i.paid_cents) }))
    .filter((i) => i.balance > 0);
  const remaining = new Map(open.map((i) => [i.id, i.balance]));
  const planned = (data.hub_records || []).filter(
    (r) => r.module === "costs" && !r.archived && r.data?.status === "Planned",
  );
  const plannedUsed = new Set();

  const rows = lines.map((l) => {
    const posted = links.get(l.id) || [];
    const allocated = posted.reduce((n, p) => n + p.amount, 0);
    const open = l.amount - allocated;
    const foreign = l.currency && l.currency !== currency;
    return { ...l, posted, allocated, open, foreign, candidates: [], suggestion: null };
  });

  // Money in: score each open invoice, then assign greedily by confidence.
  const pairs = [];
  for (const r of rows) {
    if (r.amount <= 0 || r.open <= 0 || r.foreign || ignored.has(r.id)) continue;
    const text = normalize(`${r.reference} ${r.description} ${r.counterparty}`);
    for (const inv of open) {
      let score = 0;
      const reasons = [];
      const ref = normalize(inv.ref);
      if (ref.length >= 3 && text.includes(ref)) {
        score += 60;
        reasons.push("Invoice reference in payment details");
      } else {
        const digits = String(inv.ref || "").match(/\d{3,}/g) || [];
        if (digits.some((d) => new RegExp(`(^|\\D)${d}(\\D|$)`).test(`${r.reference} ${r.description}`))) {
          score += 35;
          reasons.push("Invoice number in payment details");
        }
      }
      if (r.open === inv.balance) {
        score += 30;
        reasons.push("Amount equals open balance");
      } else if (r.open === Number(inv.total_cents)) {
        score += 15;
        reasons.push("Amount equals invoice total");
      }
      const company = companies.get(inv.company_id);
      if (company && nameMatches(company.name, r)) {
        score += 25;
        reasons.push("Payer matches customer");
      }
      if (inv.due_date && String(inv.due_date).slice(0, 10) < r.date) score += 2;
      if (score >= 25) r.candidates.push({ invoice: inv, score, reasons });
      if (score >= 50) pairs.push({ r, inv, score, reasons });
    }
    r.candidates.sort((a, b) => b.score - a.score);
  }
  pairs.sort((a, b) => b.score - a.score || a.r.date.localeCompare(b.r.date));
  for (const { r, inv, score, reasons } of pairs) {
    if (r.suggestion) continue;
    const left = remaining.get(inv.id);
    if (!left) continue;
    const amount = Math.min(r.open, left);
    remaining.set(inv.id, left - amount);
    r.suggestion = {
      kind: "payment",
      invoice_id: inv.id,
      ref: inv.ref,
      company: companies.get(inv.company_id)?.name || "",
      amount,
      score,
      confidence: score >= 80 ? "High" : "Medium",
      reasons,
    };
  }

  // Money out: prefer a planned expense with the same amount, otherwise a new paid expense.
  for (const r of rows) {
    if (r.amount >= 0 || r.open >= 0 || r.foreign || ignored.has(r.id)) continue;
    const abs = -r.open;
    const match = planned
      .filter((p) => !plannedUsed.has(p.id) && Number(p.data.amount) === abs)
      .map((p) => {
        const near = Math.abs(Date.parse(p.data.date) - Date.parse(r.date)) <= 45 * 86400000;
        const named = nameMatches(p.data.name, r) || nameMatches(p.data.category, r);
        return { p, score: 40 + (near ? 20 : 0) + (named ? 30 : 0) };
      })
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score)[0];
    if (match) {
      plannedUsed.add(match.p.id);
      r.suggestion = {
        kind: "planned",
        record: match.p,
        name: match.p.data.name,
        category: match.p.data.category,
        amount: abs,
        confidence: match.score >= 80 ? "High" : "Medium",
        reasons: ["Planned expense with the same amount"],
      };
    } else
      r.suggestion = {
        kind: "expense",
        name: clean(r.counterparty || r.description || "Bank payment").slice(0, 120),
        category: guessCategory(r, learned, suppliers),
        amount: abs,
        confidence: learned[normalize(r.counterparty)] ? "High" : "Medium",
        reasons: [learned[normalize(r.counterparty)] ? "Category used before for this counterparty" : "Category suggested from payment details"],
      };
  }

  for (const r of rows) {
    r.status = ignored.has(r.id)
      ? "Ignored"
      : r.foreign
        ? "Other currency"
        : r.posted.length && Math.abs(r.open) < 1
          ? "Reconciled"
          : r.posted.length
            ? "Partly reconciled"
            : r.suggestion
              ? "Suggested"
              : "Unmatched";
  }
  return rows;
}

export function summarize(rows, filters = {}) {
  const inRange = rows.filter(
    (r) => (!filters.from || r.date >= filters.from) && (!filters.to || r.date <= filters.to),
  );
  const money = inRange.filter((r) => !r.foreign);
  const sum = (a) => a.reduce((n, r) => n + r.amount, 0);
  const moneyIn = sum(money.filter((r) => r.amount > 0)),
    moneyOut = sum(money.filter((r) => r.amount < 0));
  const active = money.filter((r) => r.status !== "Ignored");
  const done = active.filter((r) => r.status === "Reconciled").length;
  const months = new Map();
  for (const r of money) {
    const k = r.date.slice(0, 7);
    if (!months.has(k)) months.set(k, { month: k, in: 0, out: 0, rows: [] });
    const m = months.get(k);
    if (r.amount > 0) m.in += r.amount;
    else m.out += -r.amount;
    m.rows.push(r);
  }
  const categories = new Map();
  for (const r of money) {
    if (r.amount >= 0 || r.status === "Ignored") continue;
    const k =
      r.posted.find((p) => p.category)?.category ||
      r.suggestion?.category ||
      "Uncategorised";
    if (!categories.has(k)) categories.set(k, { label: k, value: 0, rows: [] });
    categories.get(k).value += -r.amount;
    categories.get(k).rows.push(r);
  }
  return {
    rows: inRange,
    moneyIn,
    moneyOut,
    net: moneyIn + moneyOut,
    toReconcile: inRange.filter((r) => !["Reconciled", "Ignored"].includes(r.status)).length,
    suggested: active.filter((r) => r.status === "Suggested").length,
    reconciledShare: active.length ? done / active.length : null,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    categories: [...categories.values()].sort((a, b) => b.value - a.value),
  };
}
