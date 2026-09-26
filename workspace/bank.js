import { html, tr, locale } from "./i18n.js";
import {
  readStatement,
  applyMapping,
  withIds,
  mergeLines,
  reconcile,
  summarize,
  paymentReference,
  expenseNote,
  expenseCategories,
  normalize,
} from "./bank-model.js";

// Bank reconciliation: statement lines stay in this browser; only confirmed
// payments (invoice.payment) and expenses (hub.save · costs) are written to the workspace.
export function createBank({
  state,
  esc,
  icon,
  amount,
  fmtDate,
  header,
  showDialog,
  formDialog,
  cmd,
  refresh,
  render,
  canEdit,
  isAdmin,
  has,
  toast,
  errorHTML,
}) {
  const views = ["To reconcile", "Reconciled", "Ignored", "All lines"];
  let view = "To reconcile",
    filters = {},
    lastWorkspace = "",
    importState = null,
    working = false;
  const today = () => new Date().toISOString().slice(0, 10);
  const defaults = () => ({ q: "", from: "", to: "", direction: "" });
  const storageKey = () => `aw-bank:${state.me.user.id}:${state.wid}`;
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      return {
        lines: Array.isArray(v.lines) ? v.lines : [],
        ignored: Array.isArray(v.ignored) ? v.ignored : [],
        learned: v.learned && typeof v.learned === "object" ? v.learned : {},
        imports: Array.isArray(v.imports) ? v.imports : [],
      };
    } catch {
      return { lines: [], ignored: [], learned: {}, imports: [] };
    }
  }
  function save(store) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(store));
      return true;
    } catch {
      toast("This browser could not keep the statement. Free some storage and import again.");
      return false;
    }
  }
  const canPay = () => isAdmin() && has("operations");
  const canExpense = () => canEdit() && has("hub");
  const money = (cents, currency) =>
    currency && currency !== state.data.workspace.currency
      ? new Intl.NumberFormat(locale(), { style: "currency", currency }).format(cents / 100)
      : amount(cents);
  const signed = (r) =>
    html`<span class="bank-amount ${r.amount > 0 ? "in" : "out"}">${r.amount > 0 ? "+" : "−"}${esc(money(Math.abs(r.amount), r.currency))}</span>`;
  const statusBadge = (s) =>
    html`<span class="badge ${s === "Reconciled" ? "green" : s === "Suggested" ? "blue" : ["Partly reconciled", "Other currency"].includes(s) ? "amber" : ""}">${esc(tr(s))}</span>`;
  const invoice = (id) => state.data.invoices.find((i) => i.id === id);
  const companyName = (id) => state.data.companies.find((c) => c.id === id)?.name || "—";
  const rowsNow = (store = load()) => reconcile(state.data, store.lines, store, today());
  const matchesView = (r, v = view) =>
    v === "All lines" ||
    (v === "Reconciled" && r.status === "Reconciled") ||
    (v === "Ignored" && r.status === "Ignored") ||
    (v === "To reconcile" && !["Reconciled", "Ignored"].includes(r.status));
  function filtered(rows) {
    const q = normalize(filters.q);
    return rows.filter(
      (r) =>
        (!filters.from || r.date >= filters.from) &&
        (!filters.to || r.date <= filters.to) &&
        (!filters.direction || (filters.direction === "in" ? r.amount > 0 : r.amount < 0)) &&
        (!q ||
          normalize(`${r.counterparty} ${r.description} ${r.reference} ${r.suggestion?.ref || ""} ${r.suggestion?.category || ""}`).includes(q)),
    );
  }
  // Suggestions confirmed in bulk: confident invoice matches, planned expenses and categorised expenses.
  function bulkCandidates(rows) {
    return rows.filter(
      (r) =>
        ["Suggested", "Partly reconciled"].includes(r.status) &&
        r.suggestion &&
        ((r.suggestion.kind === "payment" && canPay()) ||
          (r.suggestion.kind !== "payment" && canExpense())),
    );
  }
  const preselected = (r) =>
    r.suggestion.kind === "payment"
      ? r.suggestion.confidence === "High"
      : r.suggestion.kind === "planned" || r.suggestion.category !== "Other";

  function matchCell(r) {
    const posted = r.posted
      .map((p) =>
        p.kind === "payment"
          ? html`<button class="text-button" data-open="invoices" data-id="${esc(p.invoice_id)}">${esc(invoice(p.invoice_id)?.ref || tr("Invoice record"))}</button>`
          : html`<a class="text-button" href="#hub/costs/2">${esc(p.category || tr("Expense"))}</a>`,
      )
      .join(", ");
    const s = r.suggestion;
    const next = !s || r.status === "Ignored"
      ? ""
      : s.kind === "payment"
        ? html`<span class="bank-suggestion">${esc(s.ref)} · ${esc(s.company)}<small>${esc(tr(s.confidence + " confidence"))} · ${esc(money(s.amount))}</small></span>`
        : s.kind === "planned"
          ? html`<span class="bank-suggestion">${esc(tr("Planned expense"))}: ${esc(s.name)}<small>${esc(s.category)}</small></span>`
          : html`<span class="bank-suggestion">${esc(tr("New expense"))} · ${esc(tr(s.category))}<small>${esc(tr(s.confidence + " confidence"))}</small></span>`;
    return posted && next ? `${posted}<br>${next}` : posted || next || html`<span class="muted">—</span>`;
  }
  function table(rows) {
    if (!rows.length)
      return html`<div class="empty"><h3>${view === "To reconcile" ? "Nothing left to reconcile." : "No matching lines."}</h3><p>${view === "To reconcile" ? "Every imported line is matched, recorded or ignored." : "Try another view or clear the filters."}</p></div>`;
    return html`<div class="table-wrap bank-table"><table><thead><tr><th scope="col">Date</th><th scope="col">Counterparty & details</th><th scope="col" class="numeric">Amount</th><th scope="col">Match</th><th scope="col">Status</th><th scope="col"><span class="sr-label">Actions</span></th></tr></thead><tbody>${rows
      .map(
        (r) =>
          html`<tr><td class="nowrap">${esc(fmtDate(r.date))}</td><td><button class="record-link bank-line" data-bank="line" data-id="${r.id}"><span>${esc(r.counterparty || r.description || tr("Bank transaction"))}<span class="sub">${esc([r.description !== r.counterparty ? r.description : "", r.reference].filter(Boolean).join(" · ") || "—")}</span></span></button></td><td class="numeric nowrap">${signed(r)}${r.open && r.posted.length ? html`<small class="bank-open">${esc(tr("Open: {0}", money(Math.abs(r.open))))}</small>` : ""}</td><td>${matchCell(r)}</td><td>${statusBadge(r.status)}</td><td class="nowrap">${
            r.suggestion && ["Suggested", "Partly reconciled"].includes(r.status) &&
            ((r.suggestion.kind === "payment" && canPay()) || (r.suggestion.kind !== "payment" && canExpense()))
              ? html`<button class="primary bank-confirm" data-bank="confirm" data-id="${r.id}">${icon("check")}Confirm</button>`
              : ""
          }<button data-bank="line" data-id="${r.id}">${r.status === "Reconciled" || r.status === "Ignored" ? "Details" : "Review"}</button></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  }
  function cashflow(sum) {
    const max = Math.max(1, ...sum.months.flatMap((m) => [m.in, m.out]));
    return html`<section class="dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Imported statement</span><h3>Cash flow by month</h3></div><strong>${esc(money(sum.net))}</strong></div><p class="dashboard-description">Money in and out for each month in the selected range. Lines in another currency are excluded.</p>${
      sum.months.length
        ? html`<div class="bank-months">${sum.months
            .slice(-12)
            .map(
              (m) =>
                html`<div class="bank-month"><div class="bank-month-head"><strong>${esc(new Date(m.month + "-01T12:00:00Z").toLocaleDateString(locale(), { month: "long", year: "numeric" }))}</strong><small>${esc(tr("Net {0}", money(m.in - m.out)))}</small></div><div class="bank-flow"><span>In</span><svg class="bar-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${(m.in / max) * 100}" height="7" rx="1" /></svg><strong>${esc(money(m.in))}</strong></div><div class="bank-flow out"><span>Out</span><svg class="bar-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true"><rect class="hub-negative" x="0" y="0" width="${(m.out / max) * 100}" height="7" rx="1" /></svg><strong>${esc(money(m.out))}</strong></div></div>`,
            )
            .join("")}</div>`
        : html`<div class="dashboard-empty"><strong>No lines in this range</strong></div>`
    }</section>`;
  }
  function categories(sum) {
    const max = Math.max(1, ...sum.categories.map((c) => c.value));
    return html`<section class="dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Imported statement</span><h3>Money out by category</h3></div><strong>${esc(money(-sum.moneyOut))}</strong></div><p class="dashboard-description">Recorded categories, or the suggested category for lines not yet recorded. Click a bar to see its lines.</p>${
      sum.categories.length
        ? html`<div class="dashboard-bars">${sum.categories
            .slice(0, 8)
            .map(
              (c, i) =>
                html`<button class="dashboard-bar" data-bank="category" data-index="${i}"><span class="bar-heading"><span>${esc(tr(c.label))}<small>${esc(tr("Records: {0}", c.rows.length))}</small></span><strong>${esc(money(c.value))}</strong></span><svg class="bar-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${(c.value / max) * 100}" height="7" rx="1" /></svg></button>`,
            )
            .join("")}</div>`
        : html`<div class="dashboard-empty"><strong>No money out in this range</strong></div>`
    }</section>`;
  }
  function onboarding() {
    return html`<section class="bank-start"><div class="bank-start-icon">${icon("bank")}</div><h2>Bring in your bank statement.</h2><p>Export a statement from online banking and import it here. Incoming payments are matched to open invoice records; outgoing payments become categorised expenses. You confirm every record before it is saved.</p><div class="actions"><button class="primary" data-bank="import">${icon("upload")}Import statement</button></div><ul class="bank-formats"><li><strong>ISO 20022 camt.053 / camt.052</strong> · XML statements from Slovenian and other SEPA banks</li><li><strong>CSV</strong> · Any bank export with a date and an amount, or money out and money in columns. You can adjust the columns before importing.</li></ul></section>`;
  }
  function page() {
    if (lastWorkspace !== state.wid) {
      lastWorkspace = state.wid;
      filters = defaults();
      view = "To reconcile";
    }
    const store = load(),
      all = rowsNow(store),
      inRange = filtered(all),
      sum = summarize(inRange),
      rows = inRange.filter((r) => matchesView(r)),
      bulk = bulkCandidates(all);
    const counts = Object.fromEntries(views.map((v) => [v, inRange.filter((r) => matchesView(r, v)).length]));
    const last = store.imports[store.imports.length - 1];
    return (
      header(
        "Bank reconciliation",
        "Match bank statement lines to invoice records and expenses, then record them in one step.",
        html`${canEdit() ? html`<button class="primary" data-bank="import">${icon("upload")}Import statement</button>` : ""}${bulk.length ? html`<button data-bank="bulk">${icon("check")}${esc(tr("Confirm suggestions ({0})", bulk.length))}</button>` : ""}${store.lines.length ? html`<button data-bank="export">Export CSV</button><button data-bank="clear">Clear statement</button>` : ""}`,
        "OPERATIONS",
      ) +
      html`<div class="hub-source-note">${icon("reports")}<span>Statement lines stay in this browser and are never sent to the workspace. Only the payments and expenses you confirm are saved, each with a reference to its statement line, so importing the same statement again never creates duplicates.</span></div>` +
      (!store.lines.length
        ? onboarding()
        : html`<form id="bank-filter-form" class="toolbar hub-filter-toolbar"><label><span class="sr-label">Search statement lines</span><input name="q" type="search" placeholder="Search counterparty, details or reference…" value="${esc(filters.q)}"></label><label>From<input name="from" type="date" value="${esc(filters.from)}"></label><label>To<input name="to" type="date" value="${esc(filters.to)}"></label><label><span class="sr-label">Direction</span><select name="direction"><option value="">Money in and out</option><option value="in" ${filters.direction === "in" ? "selected" : ""}>Money in</option><option value="out" ${filters.direction === "out" ? "selected" : ""}>Money out</option></select></label><button type="submit">Apply filters</button><button type="button" data-bank="reset">Reset filters</button></form>
      <div class="metric-grid hub-metrics bank-metrics"><div class="metric"><span class="metric-label">Money in</span><strong class="bank-amount in">${esc(money(sum.moneyIn))}</strong><small>${esc(tr("Lines: {0}", sum.rows.filter((r) => r.amount > 0).length))}</small></div><div class="metric"><span class="metric-label">Money out</span><strong>${esc(money(-sum.moneyOut))}</strong><small>${esc(tr("Lines: {0}", sum.rows.filter((r) => r.amount < 0).length))}</small></div><div class="metric"><span class="metric-label">Net cash flow</span><strong>${esc(money(sum.net))}</strong><small>${esc(sum.rows.length ? `${fmtDate(sum.rows[sum.rows.length - 1].date)} – ${fmtDate(sum.rows[0].date)}` : "—")}</small></div><div class="metric"><span class="metric-label">To reconcile</span><strong>${sum.toReconcile}</strong><small>${esc(tr("With a suggestion: {0}", sum.suggested))}</small></div><div class="metric"><span class="metric-label">Reconciled</span><strong>${sum.reconciledShare == null ? "—" : esc(new Intl.NumberFormat(locale(), { style: "percent" }).format(sum.reconciledShare))}</strong><small>Of lines not ignored</small></div></div>
      <div class="dashboard-grid">${cashflow(sum)}${categories(sum)}</div>
      <div class="section-head"><h2>Statement lines</h2><small>${esc(last ? tr("Last import: {0} · {1}", last.name, fmtDate(last.date)) : "")}</small></div>
      <nav class="dashboard-nav" aria-label="Statement views">${views.map((v) => html`<button data-bank="view" data-view="${v}" aria-pressed="${v === view}">${esc(tr(v))} <span class="count">${counts[v]}</span></button>`).join("")}</nav>
      ${table(rows)}
      <div class="table-foot"><span>${esc(tr("Lines: {0}", rows.length))}${filters.q || filters.from || filters.to || filters.direction ? esc(tr(" · filtered")) : ""}</span><span>${canPay() ? "Payments are recorded against invoice records; they do not move money." : "Only an owner or administrator can record invoice payments."}</span></div>`)
    );
  }

  // ---------- Recording ----------

  function remember(r, category) {
    const party = normalize(r.counterparty);
    if (!party || !category) return;
    const store = load();
    store.learned[party] = category;
    save(store);
  }
  async function post(r, s = r.suggestion) {
    if (s.kind === "payment") {
      await cmd({
        type: "invoice.payment",
        id: s.invoice_id,
        amount_cents: s.amount,
        reference: paymentReference(r),
        confirm: true,
      });
    } else if (s.kind === "planned") {
      const rec = state.data.hub_records.find((x) => x.id === s.record.id);
      await cmd({
        type: "hub.save",
        module: "costs",
        id: rec.id,
        revision: rec.revision,
        data: {
          ...rec.data,
          date: r.date,
          status: "Paid",
          notes: [rec.data.notes, expenseNote(r)].filter(Boolean).join("\n\n").slice(0, 3000),
        },
      });
    } else {
      await cmd({
        type: "hub.save",
        module: "costs",
        data: {
          name: String(s.name || "Bank payment").slice(0, 200),
          date: r.date,
          category: tr(String(s.category || "Other")).slice(0, 200),
          amount: s.amount,
          status: "Paid",
          notes: expenseNote(r),
        },
      });
      remember(r, tr(s.category));
    }
  }
  function lineDialog(id) {
    const store = load(),
      r = rowsNow(store).find((x) => x.id === id);
    if (!r) return toast("This statement line is no longer available.");
    const details = html`<div class="detail-grid bank-detail"><div><small>Date</small><strong>${esc(fmtDate(r.date))}</strong></div><div><small>Amount</small><strong>${signed(r)}</strong></div><div><small>Counterparty</small><strong>${esc(r.counterparty || "—")}</strong></div><div><small>Reference</small><strong>${esc(r.reference || "—")}</strong></div><div class="full"><small>Details</small><strong>${esc(r.description || "—")}</strong></div></div>${
      r.posted.length
        ? html`<section class="detail-section"><h3>${esc(tr("Recorded in the workspace · {0}", r.posted.length))}</h3>${r.posted
            .map((p) =>
              p.kind === "payment"
                ? html`<div class="linked-row"><button class="text-button" data-open="invoices" data-id="${esc(p.invoice_id)}">${esc(tr("Payment · {0}", invoice(p.invoice_id)?.ref || ""))}</button><span>${esc(money(p.amount))}</span></div>`
                : html`<div class="linked-row"><a class="text-button" href="#hub/costs/2">${esc(tr("Expense · {0}", p.category || ""))}</a><span>${esc(money(-p.amount))}</span></div>`,
            )
            .join("")}<p class="report-notes">To undo a payment, open its invoice record and correct the payment. To undo an expense, archive it in Costs & expenses.</p></section>`
        : ""
    }`;
    const ignoreButton = canEdit() && !r.posted.length
      ? html`<button type="button" data-bank="ignore" data-id="${r.id}">${r.status === "Ignored" ? "Restore line" : "Ignore line"}</button>`
      : "";
    if (r.status === "Other currency")
      return showDialog("Statement line", details + html`<div class="notice">This line is in ${esc(r.currency)}, not the workspace currency (${esc(state.data.workspace.currency)}). Record it manually after conversion.</div><div class="detail-actions">${ignoreButton}</div>`, { wide: true });
    if (r.status === "Ignored" || Math.abs(r.open) < 1)
      return showDialog("Statement line", details + html`<div class="detail-actions">${ignoreButton}</div>`, { wide: true });

    if (r.amount > 0) {
      if (!canPay())
        return showDialog("Statement line", details + html`<div class="notice">${has("operations") ? "Only an owner or administrator can record invoice payments." : "Enable Operations in workspace settings to match payments to invoice records."}</div><div class="detail-actions">${ignoreButton}</div>`, { wide: true });
      const open = state.data.invoices
        .map((i) => ({ ...i, balance: Number(i.total_cents) - Number(i.paid_cents) }))
        .filter((i) => i.balance > 0);
      const score = new Map(r.candidates.map((c) => [c.invoice.id, c.score]));
      open.sort((a, b) => (score.get(b.id) || 0) - (score.get(a.id) || 0) || String(a.due_date).localeCompare(String(b.due_date)));
      const chosen = r.suggestion?.invoice_id || open[0]?.id || "";
      const first = open.find((i) => i.id === chosen);
      if (!open.length)
        return showDialog("Statement line", details + html`<div class="notice">There are no open invoice records to match. Ignore this line if it is not a customer payment.</div><div class="detail-actions">${ignoreButton}</div>`, { wide: true });
      return formDialog(
        "Match to an invoice record",
        details +
          html`${r.suggestion ? html`<div class="notice bank-note"><strong>${esc(tr("Suggested: {0}", r.suggestion.ref))}</strong> · ${esc(r.suggestion.reasons.map((x) => tr(x)).join(" · "))}</div>` : ""}<div class="form-grid"><label class="full">Invoice record<select name="invoice" id="bank-invoice" data-line-open="${r.open}" required>${open
            .map((i) => html`<option value="${esc(i.id)}" data-balance="${i.balance}" ${i.id === chosen ? "selected" : ""}>${esc(`${i.ref} · ${companyName(i.company_id)} · ${tr("open")} ${money(i.balance)} · ${tr("due")} ${fmtDate(i.due_date)}${score.get(i.id) >= 50 ? " ★" : ""}`)}</option>`)
            .join("")}</select></label><label>Amount received<input name="value" id="bank-pay-amount" type="number" min="0.01" step=".01" required value="${(Math.min(r.open, first?.balance || r.open) / 100).toFixed(2)}" max="${(Math.min(r.open, first?.balance || r.open) / 100).toFixed(2)}"></label><label>Payment reference<input value="${esc(paymentReference(r))}" readonly></label></div><p class="report-notes">This records a payment already received on the invoice record. It does not move money. The reference links the payment to this statement line.</p><div class="detail-actions">${ignoreButton}</div>`,
        async (values) => {
          const inv = invoice(values.invoice);
          await post(r, {
            kind: "payment",
            invoice_id: values.invoice,
            ref: inv?.ref,
            amount: Math.round(Number(values.value) * 100),
          });
          await refresh();
          document.querySelector("#dialog").close();
          toast("Payment recorded and statement line reconciled.");
        },
        { submit: "Record payment", wide: true },
      );
    }
    if (!canExpense())
      return showDialog("Statement line", details + html`<div class="notice">${has("hub") ? "Viewers cannot record expenses." : "Enable Company Hub in workspace settings to record expenses from your statement."}</div><div class="detail-actions">${ignoreButton}</div>`, { wide: true });
    const planned = state.data.hub_records.filter(
      (x) => x.module === "costs" && !x.archived && x.data?.status === "Planned",
    );
    const s = r.suggestion || {};
    const cats = [...new Set([...expenseCategories, ...Object.values(store.learned), ...state.data.hub_records.filter((x) => x.module === "costs").map((x) => x.data?.category).filter(Boolean)])];
    return formDialog(
      "Record as expense",
      details +
        html`<div class="form-grid"><label class="full">Record as<select name="mode" id="bank-expense-mode"><option value="new" ${s.kind !== "planned" ? "selected" : ""}>New paid expense</option>${planned.length ? html`<option value="planned" ${s.kind === "planned" ? "selected" : ""}>Mark a planned expense as paid</option>` : ""}</select></label>
        <label class="full bank-planned" ${s.kind === "planned" ? "" : "hidden"}>Planned expense<select name="planned">${planned.map((p) => html`<option value="${esc(p.id)}" ${s.record?.id === p.id ? "selected" : ""}>${esc(`${p.data.name} · ${p.data.category} · ${money(Number(p.data.amount))} · ${fmtDate(p.data.date)}`)}</option>`).join("")}</select></label>
        <label class="bank-new" ${s.kind === "planned" ? "hidden" : ""}>Name<input name="name" maxlength="200" value="${esc(s.kind === "expense" ? s.name : r.counterparty || r.description)}"></label><label class="bank-new" ${s.kind === "planned" ? "hidden" : ""}>Category<input name="category" maxlength="200" list="bank-categories" value="${esc(s.kind === "expense" ? tr(s.category) : "Other")}"><datalist id="bank-categories">${cats.map((c) => html`<option value="${esc(tr(c))}"></option>`).join("")}</datalist></label><label class="bank-new" ${s.kind === "planned" ? "hidden" : ""}>Amount<input name="value" type="number" min="0.01" step=".01" value="${(-r.open / 100).toFixed(2)}" max="${(-r.open / 100).toFixed(2)}"></label></div><p class="report-notes">Saved in Costs & expenses as a paid expense on ${esc(fmtDate(r.date))}. The category is remembered for this counterparty.</p><div class="detail-actions">${ignoreButton}</div>`,
      async (values) => {
        if (values.mode === "planned") {
          const rec = planned.find((p) => p.id === values.planned);
          if (!rec) throw new Error("Choose a planned expense.");
          await post(r, { kind: "planned", record: rec });
        } else {
          if (!String(values.name || "").trim() || !String(values.category || "").trim())
            throw new Error("Enter a name and a category.");
          const cents = Math.round(Number(values.value) * 100);
          if (!(cents > 0) || cents > -r.open) throw new Error("Amount must be between 0.01 and the open line amount.");
          await post(r, { kind: "expense", name: values.name.trim(), category: values.category.trim(), amount: cents });
        }
        await refresh();
        document.querySelector("#dialog").close();
        toast("Expense recorded and statement line reconciled.");
      },
      { submit: "Record expense", wide: true },
    );
  }
  function bulkDialog() {
    const rows = bulkCandidates(rowsNow());
    if (!rows.length) return toast("There are no suggestions to confirm.");
    formDialog(
      "Confirm suggestions",
      html`<p class="notice">Review the suggested records. Confident matches are selected; untick anything you want to review on its own. Each selected line is saved as an invoice payment or a paid expense.</p><div class="bank-bulk">${rows
        .map(
          (r) =>
            html`<label class="bank-bulk-row"><input type="checkbox" name="${r.id}" ${preselected(r) ? "checked" : ""}><span class="bank-bulk-date">${esc(fmtDate(r.date))}</span><span class="bank-bulk-what">${esc(r.counterparty || r.description)}<small>${
              r.suggestion.kind === "payment"
                ? esc(tr("Payment to {0} · {1} confidence", r.suggestion.ref, tr(r.suggestion.confidence)))
                : r.suggestion.kind === "planned"
                  ? esc(tr("Planned expense: {0}", r.suggestion.name))
                  : esc(tr("Expense · {0}", tr(r.suggestion.category)))
            }</small></span>${signed({ ...r, amount: Math.sign(r.amount) * r.suggestion.amount })}</label>`,
        )
        .join("")}</div><div id="bank-bulk-status" role="status"></div>`,
      async (values) => {
        const chosen = rows.filter((r) => values[r.id] === "on");
        if (!chosen.length) throw new Error("Select at least one line.");
        const status = document.querySelector("#bank-bulk-status");
        const failed = [];
        let done = 0;
        for (const r of chosen) {
          if (status) status.textContent = tr("Saving {0} of {1}…", done + failed.length + 1, chosen.length);
          try {
            await post(r);
            done++;
          } catch (e) {
            failed.push({ r, e });
          }
        }
        await refresh();
        if (failed.length) {
          showDialog(
            "Some lines were not saved",
            html`<p>${esc(tr("Saved: {0}. Not saved: {1}.", done, failed.length))}</p><ul>${failed.map(({ r, e }) => html`<li>${esc(fmtDate(r.date))} · ${esc(r.counterparty || r.description)}: ${esc(tr(e.message))}</li>`).join("")}</ul>`,
          );
        } else {
          document.querySelector("#dialog").close();
          toast(tr("Records saved: {0}.", done));
        }
      },
      { submit: "Save selected", wide: true },
    );
  }

  // ---------- Import ----------

  const mappingFields = [
    ["date", "Date"],
    ["amount", "Amount (signed)"],
    ["debit", "Money out"],
    ["credit", "Money in"],
    ["counterparty", "Counterparty"],
    ["description", "Details"],
    ["reference", "Reference"],
    ["currency", "Currency"],
  ];
  function importDialog() {
    importState = null;
    formDialog(
      "Import bank statement",
      html`<p class="notice">Choose an ISO 20022 camt.053 or camt.052 XML file, or a CSV export from online banking. The file is read in this browser; nothing is uploaded until you confirm records.</p><br /><label class="hub-file-label">Statement file<input type="file" id="bank-file" accept=".xml,.csv,.txt,text/csv,application/xml,text/xml"></label><label class="hub-file-label">Or paste CSV<textarea id="bank-text" rows="4" maxlength="5000000" placeholder="Paste the statement with its header row…"></textarea></label><button type="button" data-bank="preview">Preview</button><div id="bank-preview" role="status"></div>`,
      async () => {
        if (!importState || !importState.lines.length)
          throw new Error("Choose a statement and check the preview before importing.");
        const store = load();
        const incoming = withIds(importState.lines);
        const merged = mergeLines(store.lines, incoming);
        store.lines = merged.lines;
        store.imports = [...store.imports, { name: importState.name || tr("Pasted statement"), date: today(), count: merged.added }].slice(-20);
        if (!save(store)) return;
        document.querySelector("#dialog").close();
        view = "To reconcile";
        filters = defaults();
        render();
        toast(tr("Lines added: {0}. Already imported: {1}.", merged.added, merged.skipped));
      },
      { submit: "Import lines", wide: true },
    );
  }
  function previewHTML() {
    const s = importState;
    if (!s) return "";
    const mapping =
      s.format === "csv"
        ? html`<div class="bank-mapping"><strong>Columns</strong><p class="report-notes">We recognised these columns. Adjust them if a field is wrong.</p><div class="form-grid">${mappingFields
            .map(
              ([k, label]) =>
                html`<label>${label}<select data-bank-map="${k}"><option value="">—</option>${s.header
                  .map((h, i) => html`<option value="${i}" ${String(s.mapping[k]) === String(i) ? "selected" : ""}>${esc(h || tr("Column {0}", i + 1))}</option>`)
                  .join("")}</select></label>`,
            )
            .join("")}</div></div>`
        : "";
    const cur = state.data.workspace.currency;
    const other = s.lines.filter((l) => l.currency && l.currency !== cur).length;
    return html`${mapping}<div class="${s.lines.length ? "notice" : "error"}">${esc(
      s.lines.length
        ? tr("Ready to import {0} lines ({1}).", s.lines.length, s.format === "camt" ? "ISO 20022 camt" : "CSV")
        : tr("No statement lines were recognised."),
    )}${other ? html`<br />${esc(tr("Lines in another currency than {0}: {1}. They are imported but not matched.", cur, other))}` : ""}</div>${
      s.errors.length
        ? html`<ul class="bank-errors">${s.errors
            .slice(0, 8)
            .map((e) => html`<li>${esc(tr("Row {0}", e.row))}: ${esc(tr(e.message))}</li>`)
            .join("")}${s.errors.length > 8 ? html`<li>${esc(tr("And {0} more rows.", s.errors.length - 8))}</li>` : ""}</ul>`
        : ""
    }${
      s.lines.length
        ? html`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Counterparty & details</th><th class="numeric">Amount</th></tr></thead><tbody>${s.lines
            .slice(0, 6)
            .map((l) => html`<tr><td class="nowrap">${esc(fmtDate(l.date))}</td><td>${esc(l.counterparty || "—")}<span class="sub bank-sub">${esc(l.description)}</span></td><td class="numeric nowrap">${signed(l)}</td></tr>`)
            .join("")}</tbody></table></div>${s.lines.length > 6 ? html`<p class="report-notes">${esc(tr("Showing the first 6 of {0} lines.", s.lines.length))}</p>` : ""}`
        : ""
    }`;
  }
  function showPreview() {
    const el = document.querySelector("#bank-preview");
    if (el) el.innerHTML = previewHTML();
  }
  function preview(text, name = "") {
    if (!String(text || "").trim()) {
      importState = null;
      const el = document.querySelector("#bank-preview");
      if (el) el.innerHTML = html`<div class="error">Choose a file or paste a statement first.</div>`;
      return;
    }
    importState = { ...readStatement(text, name), name };
    showPreview();
  }

  // ---------- Events ----------

  document.addEventListener("submit", (event) => {
    if (event.target.id !== "bank-filter-form") return;
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.target));
    if (f.from && f.to && f.from > f.to)
      return showDialog("Check the dates", html`<p>The start date must be before the end date.</p>`);
    filters = { ...defaults(), ...f };
    render();
  });
  document.addEventListener("change", async (event) => {
    const t = event.target;
    if (t.id === "bank-file") {
      const file = t.files[0];
      if (!file) return;
      if (file.size > 5000000) {
        document.querySelector("#bank-preview").innerHTML = html`<div class="error">Statement files must be smaller than 5 MB.</div>`;
        return;
      }
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buffer);
      // Many bank CSV exports are Windows-1250 encoded.
      if (text.includes("�")) text = new TextDecoder("windows-1250").decode(buffer);
      document.querySelector("#bank-text").value = "";
      preview(text, file.name);
    } else if (t.dataset.bankMap && importState?.format === "csv") {
      importState.mapping = { ...importState.mapping, [t.dataset.bankMap]: t.value === "" ? undefined : Number(t.value) };
      Object.assign(importState, applyMapping(importState.rows, importState.mapping, importState.headerRow));
      showPreview();
    } else if (t.id === "bank-invoice") {
      const balance = Number(t.selectedOptions[0]?.dataset.balance || 0);
      const input = document.querySelector("#bank-pay-amount");
      const max = Math.min(balance, Number(t.dataset.lineOpen));
      input.max = (max / 100).toFixed(2);
      input.value = (max / 100).toFixed(2);
    } else if (t.id === "bank-expense-mode") {
      const planned = t.value === "planned";
      document.querySelectorAll(".bank-planned").forEach((el) => (el.hidden = !planned));
      document.querySelectorAll(".bank-new").forEach((el) => (el.hidden = planned));
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "bank-text") importState = null;
  });
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-bank]");
    if (!el || el.disabled) return;
    const action = el.dataset.bank;
    try {
      if (action === "import") return importDialog();
      if (action === "preview") {
        const text = document.querySelector("#bank-text").value;
        if (text.trim()) return preview(text, "");
        if (importState) return showPreview();
        return preview("");
      }
      if (action === "view") {
        view = el.dataset.view;
        return render();
      }
      if (action === "reset") {
        filters = defaults();
        return render();
      }
      if (action === "line") return lineDialog(el.dataset.id);
      if (action === "bulk") return bulkDialog();
      if (action === "category") {
        const sum = summarize(filtered(rowsNow()));
        const c = sum.categories[Number(el.dataset.index)];
        if (c) showDialog(tr(c.label), table(c.rows), { wide: true });
        return;
      }
      if (action === "ignore") {
        const store = load(),
          set = new Set(store.ignored);
        set.has(el.dataset.id) ? set.delete(el.dataset.id) : set.add(el.dataset.id);
        store.ignored = [...set];
        save(store);
        document.querySelector("#dialog").close();
        render();
        return toast(set.has(el.dataset.id) ? "Line ignored. It no longer counts as open." : "Line restored.");
      }
      if (action === "confirm") {
        if (working) return;
        const r = rowsNow().find((x) => x.id === el.dataset.id);
        if (!r?.suggestion) return;
        working = el.disabled = true;
        try {
          await post(r);
        } finally {
          working = false;
        }
        await refresh();
        return toast(r.suggestion.kind === "payment" ? "Payment recorded and statement line reconciled." : "Expense recorded and statement line reconciled.");
      }
      if (action === "export") {
        const rows = filtered(rowsNow());
        const csv =
          "﻿" +
          [
            ["Date", "Counterparty", "Details", "Reference", "Amount", "Currency", "Status", "Match"].map((h) => tr(h)),
            ...rows.map((r) => [
              r.date,
              r.counterparty,
              r.description,
              r.reference,
              (r.amount / 100).toFixed(2),
              r.currency || state.data.workspace.currency,
              tr(r.status),
              r.posted.length
                ? r.posted.map((p) => (p.kind === "payment" ? invoice(p.invoice_id)?.ref : p.category)).join("; ")
                : r.suggestion?.ref || r.suggestion?.category || "",
            ]),
          ]
            .map((row) =>
              row
                .map((v) => {
                  let s = String(v ?? "");
                  if (/^[\s]*[=+@]/.test(s) || /^[\s]*-(?!\d)/.test(s)) s = "'" + s;
                  return '"' + s.replaceAll('"', '""') + '"';
                })
                .join(","),
            )
            .join("\r\n");
        const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
          a = document.createElement("a");
        a.href = href;
        a.download = `bank-reconciliation-${today()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
        return;
      }
      if (action === "clear") {
        return formDialog(
          "Clear the imported statement?",
          html`<p class="notice">This removes the statement lines from this browser. Payments and expenses already recorded in the workspace stay unchanged, and importing the statement again will recognise them.</p>`,
          async () => {
            const store = load();
            save({ ...store, lines: [], ignored: [], imports: [] });
            document.querySelector("#dialog").close();
            render();
            toast("Statement cleared from this browser.");
          },
          { submit: "Clear statement" },
        );
      }
    } catch (e) {
      el.disabled = false;
      showDialog("Unable to complete this action", errorHTML(e));
    }
  });
  function pending() {
    try {
      return rowsNow().filter((r) => matchesView(r, "To reconcile")).length;
    } catch {
      return 0;
    }
  }
  return { page, pending };
}
