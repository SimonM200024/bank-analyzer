// Run: node --test workspace/dev/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseAmount,
  parseDate,
  readStatement,
  withIds,
  mergeLines,
  reconcile,
  summarize,
  paymentReference,
  expenseNote,
  guessCategory,
} from "../bank-model.js";
import { sampleData } from "./sample-data.mjs";

const csv = readFileSync(new URL("./sample-statement.csv", import.meta.url), "utf8");
const camt = readFileSync(new URL("./sample-statement-camt053.xml", import.meta.url), "utf8");

test("amounts in European and English notation", () => {
  assert.equal(parseAmount("1.250,00"), 125000);
  assert.equal(parseAmount("1,250.00"), 125000);
  assert.equal(parseAmount("-12,90"), -1290);
  assert.equal(parseAmount("(45.10)"), -4510);
  assert.equal(parseAmount("12,90 EUR"), 1290);
  assert.equal(parseAmount("1 234 567,8"), 123456780);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("dates", () => {
  assert.equal(parseDate("02.09.2026"), "2026-09-02");
  assert.equal(parseDate("2. 9. 2026"), "2026-09-02");
  assert.equal(parseDate("2026-09-02T10:00:00"), "2026-09-02");
  assert.equal(parseDate("20260902"), "2026-09-02");
  assert.equal(parseDate("31.02.2026"), null);
});

test("Slovenian CSV with preamble and split debit/credit columns", () => {
  const s = readStatement(csv, "izpisek.csv");
  assert.equal(s.format, "csv");
  assert.equal(s.delimiter, ";");
  assert.equal(s.headerRow, 1, "blank separator rows are dropped");
  assert.deepEqual(Object.keys(s.mapping).sort(), ["counterparty", "credit", "currency", "date", "debit", "description", "reference"].sort());
  assert.equal(s.lines.length, 9);
  assert.equal(s.errors.length, 1, "the zero-amount row is reported");
  assert.equal(s.lines[0].amount, 125000);
  assert.equal(s.lines[1].amount, -48050);
  assert.equal(s.lines[0].counterparty, "Willow Trading d.o.o.");
});

test("camt.053", () => {
  const s = readStatement(camt, "stmt.xml");
  assert.equal(s.format, "camt");
  assert.deepEqual(s.errors, []);
  assert.equal(s.lines.length, 3);
  assert.deepEqual(
    s.lines.map((l) => [l.date, l.amount, l.currency, l.counterparty, l.reference]),
    [
      ["2026-09-02", 125000, "EUR", "Willow Trading d.o.o.", "SI00 1001"],
      ["2026-09-05", -1290, "EUR", "NLB d.d.", ""],
      ["2026-09-12", -30000, "EUR", "Office Space Najemnine d.o.o.", ""],
    ],
  );
  assert.match(s.lines[2].description, /Najemnina september & obratovalni/);
});

test("stable ids make re-imports idempotent", () => {
  const a = withIds(readStatement(csv).lines);
  const b = withIds(readStatement(csv).lines);
  assert.deepEqual(a.map((l) => l.id), b.map((l) => l.id));
  assert.equal(new Set(a.map((l) => l.id)).size, a.length);
  const merged = mergeLines(a.slice(0, 4), b);
  assert.equal(merged.added, 5);
  assert.equal(merged.skipped, 4);
  assert.equal(merged.lines.length, 9);
});

test("reconciliation suggestions", () => {
  const data = sampleData();
  const lines = withIds(readStatement(csv).lines);
  const rows = reconcile(data, lines, {}, "2026-09-26");
  const by = (party, amount) => rows.find((r) => r.counterparty.startsWith(party) && r.amount === amount);

  const willow = by("Willow", 125000);
  assert.equal(willow.suggestion.kind, "payment");
  assert.equal(willow.suggestion.ref, "INV-1001");
  assert.equal(willow.suggestion.confidence, "High");

  const northwind = by("Northwind", 50000);
  assert.equal(northwind.suggestion.ref, "INV-1002", "number plus payer name");
  assert.equal(northwind.suggestion.amount, 50000);

  assert.equal(by("Unknown", 7500).status, "Unmatched");
  assert.equal(by("Stripe", 12000).status, "Other currency");

  assert.equal(by("NLB", -1290).suggestion.category, "Bank fees");
  assert.equal(by("FURS", -214000).suggestion.category, "Taxes & contributions");
  assert.equal(by("Petrol", -8640).suggestion.category, "Travel & fuel");
  assert.equal(by("Harbour", -48050).suggestion.category, "Suppliers");
  assert.equal(by("Google", -4600).suggestion.category, "Software & subscriptions");
});

test("planned expense is matched and posted links close lines", () => {
  const data = sampleData();
  const lines = withIds(readStatement(camt).lines);
  let rows = reconcile(data, lines);
  const rent = rows.find((r) => r.amount === -30000);
  assert.equal(rent.suggestion.kind, "planned");
  assert.equal(rent.suggestion.record.id, "h1");

  const willow = rows.find((r) => r.amount === 125000);
  data.payments.push({ id: "p1", invoice_id: "i1", amount_cents: 125000, reference: paymentReference(willow), created_at: "2026-09-26" });
  data.invoices[0].paid_cents = 125000;
  data.hub_records[0].data = { ...data.hub_records[0].data, status: "Paid", notes: expenseNote(rent) };
  rows = reconcile(data, lines);
  assert.equal(rows.find((r) => r.id === willow.id).status, "Reconciled");
  assert.equal(rows.find((r) => r.id === rent.id).status, "Reconciled");
  assert.equal(rows.find((r) => r.amount === -1290).status, "Suggested");

  data.payments[0].reversed_at = "2026-09-27";
  data.invoices[0].paid_cents = 0;
  rows = reconcile(data, lines);
  assert.equal(rows.find((r) => r.id === willow.id).status, "Suggested", "a reversal reopens the line");
});

test("partial payment leaves the rest open and ignored lines stay out", () => {
  const data = sampleData();
  const lines = withIds(readStatement(csv).lines);
  const northwind = reconcile(data, lines).find((r) => r.amount === 50000);
  data.payments.push({ id: "p2", invoice_id: "i2", amount_cents: 20000, reference: paymentReference(northwind) });
  data.invoices[1].paid_cents = 20000;
  const rows = reconcile(data, lines, { ignored: [lines.find((l) => l.amount === 7500).id] });
  const r = rows.find((x) => x.id === northwind.id);
  assert.equal(r.status, "Partly reconciled");
  assert.equal(r.open, 30000);
  assert.equal(r.suggestion.amount, 30000);
  assert.equal(rows.find((x) => x.amount === 7500).status, "Ignored");
  const sum = summarize(rows);
  assert.equal(sum.moneyIn, 125000 + 50000 + 7500);
  assert.equal(sum.moneyOut, -(48050 + 1290 + 8640 + 214000 + 4600));
  assert.equal(sum.months.length, 1);
});

test("learned categories win", () => {
  const line = { counterparty: "Petrol d.d.", description: "Gorivo" };
  assert.equal(guessCategory(line, { PETROLDD: "Vehicle costs" }), "Vehicle costs");
});

test("payment references stay short enough and carry the marker", () => {
  const ref = paymentReference({ id: "0123456789", date: "2026-09-02", reference: "x".repeat(200) });
  assert.ok(ref.length <= 100, ref.length);
  assert.match(ref, /#0123456789$/);
});
