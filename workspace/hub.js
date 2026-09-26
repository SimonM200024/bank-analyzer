import { html, tr, locale } from "./i18n.js";
import { hubModules, hubModule, hubSchemas, hubData } from "./hub-model.js";
export function createHub({
  state,
  esc,
  icon,
  amount,
  fmtDate,
  showDialog,
  formDialog,
  cmd,
  api,
  refresh,
  render,
  canEdit,
  toast,
  detail,
  errorHTML,
}) {
  let query = "",
    category = "",
    favoritesOnly = false,
    filters = {},
    lastModule = "",
    lastWorkspace = "",
    importText = "",
    importPreview = null;
  const current = () => location.hash.slice(1).split("/")[1] || "";
  const view = () =>
    ["0", "1", "2"].includes(location.hash.split("/")[2])
      ? location.hash.split("/")[2]
      : "0";
  const today = () => new Date().toISOString().slice(0, 10);
  const defaults = () => ({
    from: today().slice(0, 7) + "-01",
    to: today(),
    q: "",
    status: "",
    archived: false,
  });
  const key = () => `aw-hub-pins:${state.me.user.id}:${state.wid}`;
  const pins = () => {
    try {
      const a = JSON.parse(localStorage.getItem(key()) || "[]");
      return Array.isArray(a) ? a.filter((id) => hubModule(id)) : [];
    } catch {
      return [];
    }
  };
  const fmt = (value, kind = "text", system = false) =>
    value == null
      ? "—"
      : kind === "money"
        ? amount(value)
        : kind === "ratio"
          ? new Intl.NumberFormat(locale(), {
              maximumFractionDigits: 2,
            }).format(value) + "×"
          : kind === "count"
            ? new Intl.NumberFormat(locale(), {
                maximumFractionDigits: 1,
              }).format(value)
            : kind === "date"
              ? value
                ? fmtDate(value)
                : "—"
              : system
                ? tr(value)
                : String(value);
  const url = (id, v = 0) => `#hub/${id}/${v}`;
  const button = (label, action, extra = "") =>
    html`<button data-hub="${action}" ${extra}>${label}</button>`;
  function download(filename, rows) {
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((v) => {
              let s = String(v ?? "");
              if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
              return '"' + s.replaceAll('"', '""') + '"';
            })
            .join(","),
        )
        .join("\r\n");
    const href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function catalog() {
    const pinned = pins(),
      categories = [...new Set(hubModules.map((m) => m.category))];
    const all = hubModules.filter(
      (m) =>
        (!category || m.category === category) &&
        (!favoritesOnly || pinned.includes(m.id)) &&
        (!query ||
          [
            m.name,
            m.category,
            m.description,
            tr(m.name),
            tr(m.description),
          ].some((v) =>
            v.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )),
    );
    return html`<div class="page-head hub-page-head"><div><div class="eyebrow">COMPANY HUB</div><h1>Your business, connected.</h1><p>Practical modules for your sales, operations, finances and team.</p></div><a class="hub-overview-link" href="#reports">Business overview →</a></div>
      <div class="hub-catalog-summary"><div><strong>${hubModules.length}</strong><span>Business modules</span></div><div><strong>${hubModules.filter((m) => !m.entry).length}</strong><span>Connected to workspace records</span></div><div><strong>${hubModules.filter((m) => m.entry).length}</strong><span>With editable registers</span></div></div>
      <div class="toolbar hub-catalog-tools"><label class="hub-search-label"><span class="sr-label">Find a module</span><input type="search" id="hub-search" placeholder="Find a module…" value="${esc(query)}"></label><label><span class="sr-label">Department</span><select id="hub-category"><option value="">All departments</option>${categories.map((c) => html`<option value="${c}" ${category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label><button data-hub="pins" aria-pressed="${favoritesOnly}">Pinned modules</button><button data-hub="catalog-reset">Clear filters</button></div>
      <p class="report-notes">${esc(tr("Showing {0} modules", all.length))}</p><div class="hub-catalog-grid">${
        all
          .map((m) => {
            const ready =
              !m.requires || state.data.workspace.modules.includes(m.requires);
            const count = m.entry
              ? (state.data.hub_records || []).filter(
                  (r) => r.module === m.id && !r.archived,
                ).length
              : null;
            return html`<article class="hub-module-card"><div class="hub-card-top"><span class="hub-module-icon">${icon(m.source === "hub_records" ? "reports" : m.source)}</span><span class="eyebrow">${m.category}</span><button class="quiet hub-pin" data-hub="pin" data-id="${m.id}" aria-label="${esc(tr("Pin {0}", tr(m.name)))}" aria-pressed="${pinned.includes(m.id)}">${pinned.includes(m.id) ? "★" : "☆"}</button></div><h2><a href="${url(m.id)}">${m.name}</a></h2><p>${m.description}</p><div class="hub-card-footer"><span class="hub-source ${ready ? "" : "muted"}">${!ready ? "Module disabled" : m.entry ? "Workspace entries" : "Connected records"}</span><small>${m.entry ? esc(tr("Records: {0}", count)) : tr("3 focused views")}</small></div></article>`;
          })
          .join("") ||
        html`<div class="dashboard-empty"><strong>No modules match</strong><p>Clear your filters or try another search.</p></div>`
      }</div>`;
  }
  function recordTable(result, rows = result.rows) {
    if (!rows.length)
      return html`<div class="dashboard-empty"><strong>No records to display</strong><p>${result.module.entry ? "Add a record or import a CSV to get started." : "Try another filter or add records in the connected workspace."}</p></div>`;
    return html`<div class="table-wrap hub-record-table"><table><thead><tr>${result.columns.map((c) => html`<th>${c.label}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => html`<tr>${result.columns.map((c, i) => html`<td>${i === 0 ? html`<button class="text-button" data-hub="record" data-id="${esc(r.id)}">${esc(r.title)}</button>` : esc(fmt(r[c.key], c.kind, c.key === "status" || c.key === "priority" || (c.key === "group" && ["orders", "marketing"].includes(result.module.id))))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function chart(result) {
    const max = Math.max(1, ...result.groups.map((g) => Math.abs(g.value)));
    return html`<section class="dashboard-panel"><div class="dashboard-panel-heading"><h3>${view() === "1" ? result.module.views[1] : result.module.id === "scenario" ? "By scenario" : result.module.flow ? "By date" : "By status"}</h3><small>${result.valueLabel}</small></div><p class="dashboard-description">Click a bar to view records</p><div class="dashboard-bars">${result.groups.map((g, i) => html`<button class="dashboard-bar" data-hub="group" data-index="${i}" aria-label="${esc(g.label + ": " + fmt(g.value, result.valueKind))}"><span class="bar-heading"><span>${esc(result.module.flow && view() !== "1" ? fmtDate(g.label) : (view() === "1" && !["marketing", "orders"].includes(result.module.id)) || result.module.id === "scenario" ? g.label : tr(g.label))}<small>${esc(tr("Records: {0}", g.rows.length))}</small></span><strong>${esc(fmt(g.value, result.valueKind))}</strong></span><svg class="bar-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true"><rect class="${g.value < 0 ? "hub-negative" : ""}" x="0" y="0" width="${(Math.abs(g.value) / max) * 100}" height="7" rx="1" /></svg></button>`).join("") || html`<div class="dashboard-empty"><strong>No records to display</strong></div>`}</div></section>`;
  }
  function page() {
    if (lastWorkspace !== state.wid) {
      lastWorkspace = state.wid;
      lastModule = "";
      filters = defaults();
      query = "";
      category = "";
      favoritesOnly = false;
    }
    const id = current(),
      m = hubModule(id);
    if (!m) return catalog();
    if (lastModule !== id) {
      lastModule = id;
      filters = defaults();
    }
    const result = hubData(state.data, id, { ...filters, view: view() });
    const attention = result.rows.filter(
      (r) =>
        ["Low stock", "Overdue"].includes(r.status) ||
        (["Urgent", "High"].includes(r.priority) && r.status !== "Resolved") ||
        ([
          "orders",
          "purchasing",
          "service",
          "projects",
          "team",
          "subscriptions",
        ].includes(id) &&
          r.date &&
          r.date < today() &&
          !["Resolved", "Completed", "Cancelled"].includes(r.status)),
    );
    return html`<a class="hub-back" href="#hub">← All modules</a><div class="page-head hub-page-head"><div><div class="eyebrow">${m.category}</div><h1>${m.name}</h1><p>${m.description}</p></div><div class="actions">${m.entry && canEdit() ? button("Add record", "new") + button("Import CSV", "import") : ""}${button("Export CSV", "export")}${button("Refresh", "refresh")}</div></div>
      ${
        !result.available
          ? html`<div class="notice">${esc(tr("Enable {0} in Workspace settings to use this module.", tr(m.requires === "crm" ? "CRM" : "Operations")))} <a href="#settings">Settings →</a></div>`
          : html`
      <div class="hub-source-note">${icon("reports")}<span>${m.entry ? "Source: records entered or imported in this workspace." : "Source: connected workspace records."} ${result.note}</span></div>
      <nav class="dashboard-nav" aria-label="Module views">${m.views.map((label, i) => html`<a href="${url(id, i)}" class="${view() === String(i) ? "active" : ""}" ${view() === String(i) ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
      <form id="hub-filter-form" class="toolbar hub-filter-toolbar"><label><span class="sr-label">Search module records</span><input name="q" type="search" placeholder="Search module records…" value="${esc(filters.q)}"></label>${m.flow ? html`<label>From<input name="from" type="date" required value="${filters.from}"></label><label>To<input name="to" type="date" required value="${filters.to}"></label>` : ""}<label><span class="sr-label">Filter by status</span><select name="status"><option value="">All statuses</option>${result.statuses.map((s) => html`<option value="${esc(s)}" ${filters.status === s ? "selected" : ""}>${esc(tr(s))}</option>`).join("")}</select></label>${m.entry ? html`<label class="check"><input name="archived" type="checkbox" ${filters.archived ? "checked" : ""}>Archived records</label>` : ""}<button type="submit">Apply filters</button><button type="button" data-hub="reset">Reset filters</button></form>
      ${filters.archived ? html`<div class="notice">Archived records are shown. These totals are excluded from the active register.</div>` : ""}
      <div class="metric-grid hub-metrics">${result.metrics.map((k) => html`<div class="metric"><span class="metric-label">${k.label}</span><strong>${esc(fmt(k.value, k.kind))}</strong><small>${m.flow ? esc(`${fmtDate(filters.from)} – ${fmtDate(filters.to)}`) : "Current filtered records"}</small></div>`).join("")}</div>
      ${
        view() !== "2"
          ? html`<div class="dashboard-grid">${chart(result)}<section class="dashboard-panel"><div class="dashboard-panel-heading"><h3>${id === "scenario" ? "Planning notes" : "Needs attention"}</h3></div>${
              id === "scenario"
                ? html`<p class="dashboard-description">Change price, cost, discount and expected units to compare outcomes. Negative contribution is highlighted. These are calculations, not forecasts.</p>`
                : attention.length
                  ? html`<div class="hub-attention">${attention
                      .slice(0, 6)
                      .map(
                        (r) =>
                          html`<button data-hub="record" data-id="${esc(r.id)}"><span>${esc(r.title)}<small>${esc(r.group)}</small></span><strong>${esc(tr(r.status))}</strong></button>`,
                      )
                      .join(
                        "",
                      )}</div><p class="report-notes">${esc(tr("Records needing attention: {0}", attention.length))}</p>`
                  : html`<div class="dashboard-empty"><strong>No urgent items in this view</strong><p>Keep your records current to keep this overview useful.</p></div>`
            }</section></div>`
          : ""
      }
      <div class="section-head"><h2>Records</h2><small>${esc(tr("Records: {0}", result.rows.length))}</small></div>${recordTable(result)}
      ${m.entry ? html`<p class="report-notes">Saved changes update this module for everyone in your workspace. Archive records to remove them from active totals; restore them whenever needed.</p>` : ""}`
      }`;
  }
  function editor(id, recordId) {
    const schema = hubSchemas[id],
      record = state.data.hub_records.find(
        (r) => r.id === recordId && r.module === id,
      ),
      data = record?.data || {};
    const readonly = !canEdit();
    const body = html`<div class="form-grid">${schema.fields
      .map((f) => {
        const value =
          data[f.key] ??
          (f.type === "date"
            ? today()
            : ["money", "number"].includes(f.type)
              ? 0
              : "");
        let options = f.choices?.map((x) => [x, tr(x)]);
        if (f.type === "member")
          options = [
            ["", tr("Unassigned")],
            ...state.data.members
              .filter((p) => p.active || p.id === value)
              .map((p) => [p.id, p.name]),
          ];
        if (f.type === "company")
          options = [
            ["", "—"],
            ...state.data.companies.map((c) => [c.id, c.name]),
          ];
        return html`<label class="${f.type === "textarea" ? "full" : ""}">${f.label}${f.required ? " *" : ""}${options ? html`<select name="${f.key}" ${readonly ? "disabled" : ""}>${options.map(([v, l]) => html`<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : f.type === "textarea" ? html`<textarea name="${f.key}" maxlength="3000" ${readonly ? "readonly" : ""}>${esc(value)}</textarea>` : html`<input name="${f.key}" type="${f.type === "money" || f.type === "number" ? "number" : f.type}" value="${esc(f.type === "money" ? Number(value) / 100 : value)}" ${f.required ? "required" : ""} ${readonly ? "readonly" : ""} ${["money", "number"].includes(f.type) ? `min="0" max="${f.max ?? (f.type === "money" ? 100000000 : 10000000)}" step="${f.type === "money" ? "0.01" : "1"}"` : 'maxlength="200"'}>`}</label>`;
      })
      .join(
        "",
      )}</div><p class="report-notes">Amounts use your workspace currency.</p>${record && !readonly ? html`<button type="button" data-hub="archive" data-id="${record.id}">${record.archived ? "Restore record" : "Archive record"}</button>` : ""}`;
    if (readonly) {
      showDialog(schema.singular, body, { wide: true });
      return;
    }
    formDialog(
      recordId ? "Edit " + schema.singular : "New " + schema.singular,
      body,
      async (values) => {
        const input = {};
        for (const f of schema.fields)
          input[f.key] =
            f.type === "money"
              ? Math.round(Number(values[f.key]) * 100)
              : f.type === "number"
                ? Number(values[f.key])
                : values[f.key];
        await cmd({
          type: "hub.save",
          module: id,
          ...(record ? { id: record.id, revision: record.revision } : {}),
          data: input,
        });
        document.querySelector("#dialog").close();
        await refresh();
        toast("Hub record saved.");
      },
      { wide: true },
    );
  }
  function importDialog() {
    importText = "";
    importPreview = null;
    showDialog(
      "Import Hub records",
      html`<p>Download the template, fill its columns and choose your CSV. Money uses decimal units, with a dot and no currency symbol. Owner and company links can be added after import.</p><div class="actions">${button("Download CSV template", "template")}</div><label class="hub-file-label">CSV file<input type="file" id="hub-file" accept=".csv,text/csv"></label><label class="hub-file-label">Or paste CSV<textarea id="hub-csv-text" rows="5" maxlength="1000000" placeholder="Paste CSV with its header row…"></textarea></label><button data-hub="import-preview">Preview CSV</button><div id="hub-import-status" role="status"></div><button data-hub="import-commit" disabled>Import records</button>`,
      { wide: true },
    );
  }
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "hub-filter-form") return;
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.target));
    if (f.from && f.to && f.from > f.to) {
      showDialog(
        "Check reporting dates",
        html`<p>The start date must be before the end date.</p>`,
      );
      return;
    }
    filters = { ...filters, ...f, archived: f.archived === "on" };
    render();
  });
  document.addEventListener("input", (event) => {
    if (event.target.id !== "hub-search") return;
    query = event.target.value;
    const start = event.target.selectionStart;
    render();
    const input = document.querySelector("#hub-search");
    input?.focus();
    if (input && input.type !== "search") input.setSelectionRange(start, start);
  });
  async function previewCSV(text) {
    const status = document.querySelector("#hub-import-status"),
      commit = document.querySelector('[data-hub="import-commit"]');
    commit.disabled = true;
    importPreview = null;
    importText = text;
    try {
      const preview = await api(`/api/w/${state.wid}/hub-import-preview`, {
        module: current(),
        csv: text,
      });
      if (importText !== text || !status.isConnected) return;
      importPreview = preview;
      status.innerHTML = preview.errors.length
        ? html`<ul>${preview.errors
            .slice(0, 20)
            .map(
              (e) =>
                html`<li>${esc(tr("Row {0}", e.row))}: ${esc(tr(e.message))}</li>`,
            )
            .join("")}</ul>`
        : html`<div class="notice">${esc(tr("Ready to import {0} records.", preview.records.length))}</div>${preview.records
            .slice(0, 5)
            .map((r) => html`<p>${esc(r.name)}</p>`)
            .join("")}`;
      commit.disabled = preview.errors.length > 0 || !preview.records.length;
    } catch (e) {
      if (status.isConnected) status.innerHTML = errorHTML(e);
    }
  }
  document.addEventListener("input", (event) => {
    if (event.target.id !== "hub-csv-text") return;
    importText = "";
    importPreview = null;
    document.querySelector('[data-hub="import-commit"]').disabled = true;
    document.querySelector("#hub-import-status").textContent = "";
  });
  document.addEventListener("change", async (event) => {
    if (event.target.id === "hub-category") {
      category = event.target.value;
      render();
    }
    if (event.target.id !== "hub-file") return;
    importText = "";
    importPreview = null;
    document.querySelector('[data-hub="import-commit"]').disabled = true;
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1000000) {
      document.querySelector("#hub-import-status").textContent = tr(
        "CSV must be smaller than 1 MB.",
      );
      return;
    }
    const text = await file.text();
    document.querySelector("#hub-csv-text").value = text;
    await previewCSV(text);
  });
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-hub]");
    if (!el || el.disabled) return;
    const action = el.dataset.hub,
      id = current();
    try {
      if (action === "import-preview") {
        await previewCSV(document.querySelector("#hub-csv-text").value);
        return;
      }
      if (action === "pin") {
        const set = new Set(pins());
        set.has(el.dataset.id)
          ? set.delete(el.dataset.id)
          : set.add(el.dataset.id);
        localStorage.setItem(key(), JSON.stringify([...set]));
        render();
        return;
      }
      if (action === "pins") {
        favoritesOnly = !favoritesOnly;
        render();
        return;
      }
      if (action === "catalog-reset") {
        query = "";
        category = "";
        favoritesOnly = false;
        render();
        return;
      }
      if (action === "reset") {
        filters = defaults();
        render();
        return;
      }
      if (action === "refresh") {
        el.disabled = true;
        await refresh();
        return;
      }
      if (action === "new") {
        editor(id);
        return;
      }
      if (action === "record") {
        const m = hubModule(id);
        if (m.entry) editor(id, el.dataset.id);
        else detail(m.source, el.dataset.id);
        return;
      }
      const result = hubData(state.data, id, { ...filters, view: view() });
      if (action === "group") {
        const g = result.groups[Number(el.dataset.index)];
        if (g)
          showDialog(
            view() === "1" && !["marketing", "orders"].includes(id)
              ? g.label
              : tr(g.label),
            recordTable(result, g.rows),
            { wide: true },
          );
        return;
      }
      if (action === "archive") {
        const record = state.data.hub_records.find(
          (r) => r.id === el.dataset.id && r.module === id,
        );
        if (!record) return;
        el.disabled = true;
        await cmd({
          type: "hub.archive",
          module: id,
          id: record.id,
          revision: record.revision,
          archived: !record.archived,
        });
        document.querySelector("#dialog").close();
        await refresh();
        toast(
          record.archived ? "Hub record restored." : "Hub record archived.",
        );
        return;
      }
      if (action === "export") {
        download(`hub-${id}-${today()}.csv`, [
          result.columns.map((c) => tr(c.label)),
          ...result.rows.map((r) =>
            result.columns.map((c) =>
              c.kind === "money" ? (r[c.key] / 100).toFixed(2) : r[c.key],
            ),
          ),
        ]);
        return;
      }
      if (action === "import") {
        importDialog();
        return;
      }
      if (action === "template") {
        const fields = hubSchemas[id].fields.filter(
          (f) => !["member", "company"].includes(f.type),
        );
        download(`hub-${id}-template.csv`, [
          fields.map((f) => f.key),
          fields.map((f) =>
            f.type === "date"
              ? today()
              : f.type === "select"
                ? f.choices[0]
                : ["money", "number"].includes(f.type)
                  ? 0
                  : f.key === "name"
                    ? "Example record"
                    : f.required
                      ? "General"
                      : "",
          ),
        ]);
        return;
      }
      if (
        action === "import-commit" &&
        importPreview &&
        !importPreview.errors.length
      ) {
        el.disabled = true;
        const content = new TextEncoder().encode(
            `${state.me.user.id}:${id}:${importText}`,
          ),
          hash = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
          ]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        await api(
          `/api/w/${state.wid}/command`,
          { type: "hub.import", module: id, csv: importText },
          { "Idempotency-Key": "hub-import-" + hash },
        );
        document.querySelector("#dialog").close();
        await refresh();
        toast("Hub records imported.");
      }
    } catch (e) {
      el.disabled = false;
      showDialog("Unable to complete this action", errorHTML(e));
    }
  });
  return { page };
}
