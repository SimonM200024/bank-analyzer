import { createHub } from "./hub.js";
import { createBank } from "./bank.js";
import {
  html,
  markup,
  tr,
  locale,
  languagePicker,
  setLanguage,
  DisplayValue,
} from "./i18n.js";
import { selectRecords, taskMatches, taskOpportunities } from "./records.js";
const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) =>
  new DisplayValue(
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  );
const icons = {
  home: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8",
  companies: "M4 21V5h10v16M14 11h6v10M7 9h4M7 13h4M7 17h4M2 21h20",
  contacts:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4",
  opportunities: "M4 5h4v14H4zM10 9h4v10h-4zM16 3h4v16h-4z",
  tasks: "M9 5h12M9 12h12M9 19h12M2 5l2 2 3-4M2 12l2 2 3-4M2 19l2 2 3-4",
  orders: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
  products: "m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4M12 11v10M7 5l10 4",
  purchases: "M3 3h2l3 13h10l3-9H6M9 21h.01M18 21h.01",
  invoices: "M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h5",
  bank: "M3 9 12 4l9 5M4 9h16M6 9v8M10 9v8M14 9v8M18 9v8M3 20h18M4 17h16",
  reports: "M3 3v18h18M7 15l4-5 4 2 6-7",
  modules: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  help: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  arrow: "M5 12h14M14 7l5 5-5 5",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  clock: "M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  logout: "M9 3H4v18h5M10 12h11m-5-5 5 5-5 5",
};
const icon = (n) =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="${icons[n] || icons.orders}" />
  </svg>`;
const initials = (n) =>
  String(n || "?")
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
const avatar = (name, round = false) =>
  html`<span class="avatar${round ? " round" : ""}"
    >${esc(initials(name))}</span
  >`;
const day = (v) => String(v || "").slice(0, 10),
  today = () => new Date().toISOString().slice(0, 10),
  future = (n) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fmtDate = (v) =>
  v
    ? new Date(day(v) + "T12:00:00Z").toLocaleDateString(locale(), {
        day: "numeric",
        month: "short",
      })
    : "—";
const dateLabel = (v) =>
  day(v) === today()
    ? "Today"
    : day(v) < today()
      ? `${fmtDate(v)} · overdue`
      : fmtDate(v);
const amount = (n) =>
  new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: state.data?.workspace.currency || "EUR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0) / 100);
const badge = (s) =>
  html`<span
    class="badge ${["Won", "Fulfilled", "Paid", "Received", "Completed", "Customer"].includes(s) ? "green" : ["Confirmed", "Ordered", "Qualified", "Proposal"].includes(s) ? "blue" : ["Overdue", "Low stock", "Partially received"].includes(s) ? "amber" : ["Cancelled", "Lost"].includes(s) ? "red" : ""}"
    >${esc(tr(s))}</span
  >`;
const state = {
  me: null,
  data: null,
  reports: null,
  config: null,
  wid: localStorage.getItem("aw-workspace"),
  route: "home",
  query: { q: "", status: "", owner: "" },
  board: false,
  report: "business",
  period: { from: today().slice(0, 7) + "-01", to: today() },
  keys: new Map(),
  menu: false,
};
const dialog = $("#dialog");
let toastTimer,
  formSubmit = null,
  importText = "",
  preview = null;
async function api(path, body, headers = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined
          ? headers
          : {
              "Content-Type": "application/json",
              "X-Workspace-Request": "1",
              ...headers,
            },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const e = new Error(data.error || "Request failed.");
      e.status = response.status;
      e.details = data.details;
      e.requestId = data.requestId;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error(
        "The request timed out. Retry safely; a repeated action will not create a duplicate.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const endpoint = (s) => `/api/w/${state.wid}/${s}`;
async function cmd(body) {
  const serialized = JSON.stringify(body),
    key = state.keys.get(serialized) || crypto.randomUUID();
  state.keys.set(serialized, key);
  const r = await api(endpoint("command"), body, { "Idempotency-Key": key });
  state.keys.delete(serialized);
  return r;
}
const canEdit = () => state.data?.workspace.role !== "viewer",
  isAdmin = () =>
    ["owner", "administrator"].includes(state.data?.workspace.role),
  has = (m) => state.data?.workspace.modules.includes(m);
function toast(message) {
  $("#toast").textContent = tr(message);
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function errorHTML(e) {
  return html`<div class="error">
    ${esc(tr(e.message))}${
      e.details
        ? html`<ul>
            ${e.details.map((r) => html`<li>Row ${r.row}: ${esc(tr(r.message))}</li>`).join("")}
          </ul>`
        : ""
    }${e.requestId ? html`<br /><small>Support reference: ${esc(e.requestId)}</small>` : ""}
  </div>`;
}
const companyName = (id) =>
  state.data.companies.find((c) => c.id === id)?.name || "—";
const productName = (id) =>
  state.data.products.find((p) => p.id === id)?.name || "—";
const ownerName = (id) =>
  state.data.members.find((m) => m.id === id)?.name || "—";
const orderTotal = (o) =>
  state.data.order_lines
    .filter((l) => l.order_id === o.id)
    .reduce((s, l) => s + l.quantity * l.price_cents, 0);
const purchaseTotal = (p) =>
  state.data.purchase_lines
    .filter((l) => l.purchase_id === p.id)
    .reduce((s, l) => s + l.quantity * l.cost_cents, 0);
const openButton = (resource, id, label, cls = "text-button") =>
  html`<button class="${cls}" data-open="${resource}" data-id="${esc(id)}">
    ${label}
  </button>`;
const newButton = (type, label) =>
  canEdit()
    ? html`<button class="primary" data-new="${type}">
        ${icon("plus")}${esc(tr(label))}
      </button>`
    : "";
const routeNames = {
  home: "Your day",
  companies: "Companies",
  contacts: "Contacts",
  opportunities: "Opportunities",
  tasks: "Tasks",
  orders: "Sales orders",
  products: "Inventory",
  purchases: "Purchasing",
  invoices: "Invoice records",
  bank: "Bank reconciliation",
  hub: "Hub modules",
  reports: "Dashboards",
  modules: "Your modules",
  settings: "Settings",
  help: "Help & pilot guide",
};
async function loadWorkspace() {
  state.data = await api(endpoint("snapshot"));
  state.reports = await api(
    endpoint("reports") + "?" + new URLSearchParams(state.period),
  );
}
async function refresh() {
  await loadWorkspace();
  render();
}
async function start() {
  state.config = await api("/api/config");
  const h = location.hash.slice(1);
  if (h.startsWith("verify=")) {
    try {
      await api("/api/auth/verify", { token: h.slice(7) });
      toast("Email verified.");
    } catch (e) {
      toast(e.message);
    }
    history.replaceState(null, "", "#home");
  }
  if (/^(invite|reset)=/.test(h))
    return authPage(h.startsWith("invite") ? "accept" : "reset");
  try {
    state.me = await api("/api/me");
  } catch (e) {
    if (e.status === 401) return authPage(h === "signup" ? "signup" : "login");
    throw e;
  }
  if (!state.me.workspaces.some((w) => w.id === state.wid))
    state.wid = state.me.workspaces[0]?.id;
  if (!state.wid) return authPage("workspace");
  localStorage.setItem("aw-workspace", state.wid);
  state.route = h.split("/")[0] === "hub" ? "hub" : routeNames[h] ? h : "home";
  state.query = defaultQuery(state.route);
  await loadWorkspace();
  render();
}
function authPage(mode = "login") {
  const config = {
    login: ["Welcome back.", "Sign in to your connected workspace.", "Sign in"],
    signup: [
      "A clearer day starts here.",
      "Create a workspace for your team. You can start with fictional sample records.",
      "Create workspace",
    ],
    recover: [
      "Reset your password.",
      "We’ll send a secure recovery link to your account email.",
      "Send recovery link",
    ],
    reset: [
      "Choose a new password.",
      "Your existing sessions will be signed out after the reset.",
      "Reset password",
    ],
    accept: [
      "Join your team.",
      "Use your existing account password, or choose a password if you are new.",
      "Accept invitation",
    ],
    workspace: [
      "Create a workspace.",
      "Keep a new company or a fictional sample separate.",
      "Create workspace",
    ],
  }[mode];
  $("#app").innerHTML = html`<main id="main" class="auth-page">
    ${languagePicker()}
    <aside class="auth-story">
      <a class="brand" href="/"
        ><img src="/favicon.svg" width="34" height="34" alt="" />adrial
        <strong>workspace</strong></a
      >
      <div>
        <div class="eyebrow">ROOM TO DO GOOD BUSINESS</div>
        <h1>Your customers.<br />Your operations.<br />One clear picture.</h1>
        <p>
          Keep the relationship, the order and the next step together. Built for
          teams who make things move.
        </p>
      </div>
      <small>CRM · Operations · Hub</small>
    </aside>
    <section class="auth-form">
      <div class="auth-box">
        <h1>${config[0]}</h1>
        <p>${config[1]}</p>
        <form id="auth-form" data-mode="${mode}">
          ${["signup", "accept"].includes(mode) ? field("name", "Your name", "text", "", { autocomplete: "name" }) : ""}
          ${["login", "signup", "recover"].includes(mode) ? field("email", "Work email", "email", "", { autocomplete: "email" }) : ""}
          ${["login", "signup", "reset", "accept"].includes(mode) ? field("password", mode === "login" ? "Password" : "Password · at least 12 characters", "password", "", { minlength: mode === "login" ? 1 : 12, maxlength: 128, autocomplete: mode === "login" ? "current-password" : "new-password" }) : ""}
          ${
            ["signup", "workspace"].includes(mode)
              ? html`${field("workspace_name", "Company / workspace name", "text", "", { maxlength: 100 })}
                  <div class="form-grid">
                    ${field("country", "Country code", "text", "SI", { maxlength: 2 })}${selectField(
                      "currency",
                      "Base currency",
                      [
                        ["EUR", "EUR · Euro"],
                        ["USD", "USD · US Dollar"],
                        ["GBP", "GBP · Pound"],
                      ],
                      "EUR",
                    )}
                  </div>
                  <label class="check"
                    ><input type="checkbox" name="sample" checked />Start with a
                    fictional sample workspace</label
                  >
                  <div class="notice">
                    Pilot preview. Use fictional data until privacy, support and
                    launch requirements are approved. One legal entity and one
                    currency per workspace.
                  </div>`
              : ""
          }
          <div class="form-error" role="alert"></div>
          <button class="primary" type="submit">${config[2]} →</button>
        </form>
        <div class="auth-links">
          ${mode === "login" ? html`New here? <a href="#signup">Create a workspace</a><br /><a href="#recover">Forgot your password?</a>` : mode === "signup" ? html`Already have an account? <a href="#login">Sign in</a>` : html`<a href="#login">Back to sign in</a>`}<br /><a
            href="/"
            >About Adrial Workspace ↗</a
          >
        </div>
      </div>
    </section>
  </main>`;
}
function field(name, label, type = "text", value = "", attrs = {}) {
  return html`<label
    >${esc(tr(label))}<input
      name="${name}"
      type="${type}"
      value="${esc(value)}"
      ${Object.entries(attrs)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(" ")}
      ${attrs.optional ? "" : "required"}
  /></label>`;
}
function selectField(name, label, items, value = "", optional = false) {
  return html`<label
    >${esc(tr(label))}<select name="${name}" ${optional ? "" : "required"}>
      ${optional ? markup('<option value="">None</option>') : markup('<option value="" disabled') + (!value ? " selected" : "") + ">" + tr("Select…") + "</option>"}${items.map(([v, l]) => html`<option value="${esc(v)}" ${v === value ? " selected" : ""}>${esc(["role", "currency", "stage"].includes(name) ? tr(l) : l)}</option>`).join("")}
    </select></label
  >`;
}
function textField(name, label, value = "") {
  return html`<label class="full"
    >${esc(tr(label))}<textarea name="${name}" maxlength="5000">
${esc(value)}</textarea>
  </label>`;
}
function nav(route, label, navIcon = route, count = "") {
  return html`<a
    class="nav-link ${state.route === route ? "active" : ""}"
    href="#${route}"
    >${icon(navIcon)}<span>${label}</span>${count !== "" ? html`<span class="count">${count}</span>` : ""}</a
  >`;
}
function render() {
  if (!state.data) return;
  const w = state.data.workspace,
    unavailable = {
      contacts: "crm",
      opportunities: "crm",
      orders: "operations",
      products: "operations",
      purchases: "operations",
      invoices: "operations",
      bank: "operations",
      hub: "hub",
      reports: "hub",
      modules: "hub",
    };
  if (unavailable[state.route] && !has(unavailable[state.route]))
    state.route = "home";
  const overdue = state.data.tasks.filter(
    (t) =>
      !t.completed_at &&
      t.owner_id === state.me.user.id &&
      day(t.due_date) < today(),
  ).length;
  const module =
    state.route === "home"
      ? "Workspace"
      : ["companies", "contacts", "opportunities"].includes(state.route)
        ? "CRM"
        : ["orders", "products", "purchases", "invoices", "bank"].includes(state.route)
          ? "Operations"
          : ["settings", "help"].includes(state.route)
            ? "Workspace"
            : "Hub";
  $("#app").innerHTML = html`<div
    class="shell ${state.menu ? "menu-open" : ""}"
  >
    <aside class="sidebar" aria-label="Workspace navigation">
      <a class="brand" href="#home"
        ><img src="/favicon.svg" width="29" height="29" alt="" /><span
          >adrial <strong>workspace</strong></span
        ></a
      >
      <div class="workspace-select">
        <label class="sr-label" aria-label="Switch workspace"
          ><select id="workspace-select" aria-label="Switch workspace">
            ${state.me.workspaces.map((x) => html`<option value="${x.id}" ${x.id === state.wid ? " selected" : ""}>${esc(x.name)}${x.sample ? " · Sample" : ""}</option>`).join("")}
          </select></label
        >
      </div>
      <div class="nav-group">
        ${nav("home", "Your day", "home")}${nav("tasks", "My tasks", "tasks", overdue || "")}
      </div>
      <div class="nav-group">
        <div class="nav-label">CUSTOMER RELATIONSHIPS</div>
        ${nav("companies", "Companies")}${has("crm") ? nav("contacts", "Contacts") + nav("opportunities", "Opportunities") : ""}
      </div>
      ${
        has("operations")
          ? html`<div class="nav-group">
              <div class="nav-label">OPERATIONS</div>
              ${nav("orders", "Sales orders")}${nav("products", "Inventory")}${nav("purchases", "Purchasing")}${nav("invoices", "Invoice records")}${nav("bank", "Bank reconciliation", "bank", bank.pending() || "")}
            </div>`
          : ""
      }${
        has("hub")
          ? html`<div class="nav-group">
              <div class="nav-label">COMPANY HUB</div>
              ${nav("hub", "Hub modules", "modules")}${nav("reports", "Business overview")}${nav("modules", "Your modules")}
            </div>`
          : ""
      }
      <div class="sidebar-bottom">
        <div>
          ${nav("help", "Help & getting started", "help")}${nav("settings", "Settings", "settings")}
        </div>
        <div class="profile">
          ${avatar(state.me.user.name, true)}
          <div>
            <strong>${esc(state.me.user.name)}</strong
            ><small>${esc(tr(w.role))}</small>
          </div>
          <button class="quiet" data-action="logout" aria-label="Sign out">
            ${icon("logout")}
          </button>
        </div>
      </div>
    </aside>
    <div class="workspace-main">
      <header class="topbar">
        <div class="crumb">
          <button
            class="quiet mobile-menu"
            data-action="menu"
            aria-label="Toggle navigation"
          >
            ${icon("menu")}</button
          ><span>${module}</span><span>/</span
          ><strong>${routeNames[state.route]}</strong>
        </div>
        <div class="topbar-right">
          ${languagePicker()}<button class="search-launch" data-action="search">
            ${icon("search")}<span>Search workspace</span
            ><kbd>Ctrl K</kbd></button
          ><span class="connection"
            ><span class="dot"></span> Saved to workspace</span
          >${avatar(state.me.user.name, true)}
        </div>
      </header>
      ${w.sample ? html`<div class="sample-banner"><span class="dot"></span> FICTIONAL SAMPLE WORKSPACE <span>·</span> Practice every step with sample records.</div>` : ""}
      <main id="main" class="content" tabindex="-1">${page()}</main>
    </div>
  </div>`;
  document.title = `${tr(routeNames[state.route])} · Adrial Workspace`;
}
function header(title, description, actions = "", eyebrow = "") {
  return html`<div class="page-head">
    <div>
      ${eyebrow ? html`<div class="eyebrow">${eyebrow}</div>` : ""}
      <h1>${esc(tr(title))}</h1>
      <p>${esc(tr(description))}</p>
    </div>
    ${actions ? html`<div class="actions">${actions}</div>` : ""}
  </div>`;
}
function page() {
  if (state.route === "home") return home();
  if (state.route === "hub") return hub.page();
  if (state.route === "bank") return bank.page();
  if (state.route === "reports") return reportsPage();
  if (state.route === "settings") return settings();
  if (state.route === "help") return help();
  if (state.route === "modules") return modules();
  return listPage(state.route);
}
function metricCards(keys) {
  return html`<div class="metric-grid">
    ${keys
      .filter((k) => state.reports.metrics[k])
      .map((k) => {
        const m = state.reports.metrics[k];
        return html`<button class="metric" data-metric="${k}">
          <span class="metric-label">${m.label}${icon("arrow")}</span
          ><strong>${m.kind === "money" ? amount(m.value) : m.value}</strong
          ><small
            >${m.period === "Selected period" ? `${fmtDate(m.from)} – ${fmtDate(m.to)}` : "As of today"}
            · View records</small
          >
        </button>`;
      })
      .join("")}
  </div>`;
}
function taskRows(tasks) {
  return tasks.length
    ? html`<div class="task-list">
        ${tasks
          .map(
            (t) =>
              html`<div class="task-item">
                ${canEdit() && !t.completed_at ? html`<button class="task-check" data-complete="${t.id}" aria-label="Complete ${esc(t.title)}"></button>` : icon(t.completed_at ? "check" : "clock")}
                <div class="task-copy">
                  ${openButton("tasks", t.id, esc(t.title), "")}<small
                    >${esc(companyName(t.company_id))} ·
                    ${esc(ownerName(t.owner_id))}</small
                  >
                </div>
                ${badge(t.completed_at ? "Completed" : day(t.due_date) < today() ? "Overdue" : dateLabel(t.due_date))}
              </div>`,
          )
          .join("")}
      </div>`
    : html`<div class="empty">
        <h3>You’re all caught up.</h3>
        <p>New follow-ups will appear here.</p>
      </div>`;
}
function home() {
  const tasks = state.data.tasks
    .filter((t) => !t.completed_at && t.owner_id === state.me.user.id)
    .sort((a, b) => day(a.due_date).localeCompare(day(b.due_date)))
    .slice(0, 5);
  const first = state.me.user.name.split(" ")[0],
    stages = state.data.workspace.stages.filter(
      (s) => !["Won", "Lost"].includes(s),
    );
  const counts = stages.map(
      (s) => state.data.opportunities.filter((o) => o.stage === s).length,
    ),
    max = Math.max(1, ...counts);
  return (
    header(
      tr("A good day to move things forward, {0}.", first),
      "Your priorities, your business, and the next step.",
      newButton("task", "New task"),
      new Date()
        .toLocaleDateString(locale(), {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase(),
    ) +
    (!state.data.companies.length && canEdit()
      ? html`<section class="onboarding">
          <h2>Make this workspace yours.</h2>
          <p class="muted">
            Start with a customer. Everything else connects from there.
          </p>
          <div class="steps">
            <button data-new="company">
              <span class="number">1</span>Add your first company</button
            >${has("crm") ? markup('<button data-action="import"><span class="number">2</span>Import companies & contacts</button>') : ""}${isAdmin() ? markup('<button data-new="invite"><span class="number">3</span>Invite a colleague</button>') : ""}
          </div>
        </section>`
      : "") +
    metricCards(["pipeline", "orders", "receivables", "overdue"]) +
    html`<div class="daily-grid">
        <section class="daily-left">
          <div class="section-head">
            <h2>Your next steps <small>(${tasks.length})</small></h2>
            <a href="#tasks">View all tasks →</a>
          </div>
          ${taskRows(tasks)}
          <div class="section-head"><h2>Keep work moving</h2></div>
          ${has("operations") ? attention("approvals", "orders", "orders", "Review draft orders", "Approve quantities and reserve available stock.") + attention("low", "products", "products", "Watch stock levels", "Available quantities and upcoming purchases.") : attention("overdue", "tasks", "tasks", "Review follow-ups", "Keep your next customer conversation on track.")}
        </section>
        <aside class="daily-right">
          ${
            has("crm")
              ? html`<div class="section-head">
                    <h2>Pipeline at a glance</h2>
                    <a href="#opportunities">Open pipeline →</a>
                  </div>
                  <div class="stage-chart">
                    ${stages
                      .map(
                        (s, i) =>
                          html`<div class="stage-row">
                            <span>${esc(tr(s))}</span
                            ><svg
                              viewBox="0 0 200 9"
                              width="100%"
                              height="9"
                              role="img"
                              aria-label="${esc(s)}: ${counts[i]} opportunities"
                            >
                              <rect
                                width="200"
                                height="9"
                                rx="2"
                                fill="#f0f3ef"
                              />
                              <rect
                                width="${(counts[i] / max) * 200}"
                                height="9"
                                rx="2"
                                fill="#2f6b5b"
                              /></svg
                            ><span class="stage-value">${counts[i]}</span>
                          </div>`,
                      )
                      .join("")}
                    <div class="chart-caption">
                      <span
                        ><span class="dot"></span> Open opportunities ·
                        today</span
                      ><span>${counts.reduce((a, b) => a + b, 0)} total</span>
                    </div>
                  </div>`
              : ""
          }
          <div class="section-head">
            <h2>From the workspace</h2>
            <a href="#settings">Activity →</a>
          </div>
          ${
            state.data.audit_events
              .slice(0, 4)
              .map(
                (e) =>
                  html`<div class="linked-row">
                    <div>
                      <strong>${esc(actionLabel(e.action))}</strong
                      ><small class="muted">
                        · ${esc(ownerName(e.actor_id))}</small
                      >
                    </div>
                    <small>${fmtDate(e.created_at)}</small>
                  </div>`,
              )
              .join("") ||
            markup(
              '<p class="subhead">Your team’s important changes will appear here.</p>',
            )
          }
        </aside>
      </div>
      <div class="shortcuts">
        <a class="shortcut" href="#companies"
          >${icon("companies")}Customer relationships<span>↗</span></a
        >${has("operations") ? html`<a class="shortcut" href="#orders">${icon("orders")}Orders & fulfillment<span>↗</span></a>` : ""}${has("hub") ? html`<a class="shortcut" href="#reports">${icon("reports")}Business dashboards<span>↗</span></a>` : ""}
      </div>`
  );
}
function attention(key, route, ic, title, subtitle) {
  const m = state.reports.metrics[key];
  if (!m) return "";
  return html`<button class="attention-item" data-metric="${key}">
    <span class="attention-icon">${icon(ic)}</span
    ><span
      ><strong>${title} ${m.value ? `· ${m.value}` : ""}</strong
      ><small>${subtitle}</small></span
    ><span class="arrow">→</span>
  </button>`;
}
function actionLabel(s) {
  return s
    .replaceAll(".", " · ")
    .replaceAll("_", " ")
    .replace(/^\w/, (x) => x.toUpperCase());
}
function filtered(resource) {
  return selectRecords(state.data, resource, state.query, today());
}
function taskFocus() {
  const scope = selectRecords(
    state.data,
    "tasks",
    { ...state.query, status: "" },
    today(),
  );
  return html`<div class="task-focus" aria-label="Task priorities">
    <div class="focus-options">
      ${["Open", "Overdue", "Today", "Upcoming", "Completed"].map((status) => html`<button data-task-status="${status}" aria-pressed="${state.query.status === status}">${status}<span>${scope.filter((t) => taskMatches(t, status, today())).length}</span></button>`).join("")}
    </div>
    <div class="focus-options">
      <button
        data-task-owner="mine"
        aria-pressed="${state.query.owner === state.me.user.id}"
      >
        Assigned to me</button
      ><button data-task-owner="all" aria-pressed="${!state.query.owner}">
        Everyone
      </button>
    </div>
    <small>Open tasks appear first, earliest due date first.</small>
  </div>`;
}
const listMeta = {
  companies: [
    "The shared relationships behind every conversation and order.",
    "company",
    "New company",
    ["Prospect", "Customer", "Supplier"],
  ],
  contacts: [
    "The people you do business with, connected to their companies.",
    "contact",
    "New contact",
    [],
  ],
  opportunities: [
    "Keep every sales conversation moving toward a clear next step.",
    "opportunity",
    "New opportunity",
    null,
  ],
  tasks: [
    "Follow-ups and shared work, with a clear owner and due date.",
    "task",
    "New task",
    ["Open", "Overdue", "Today", "Upcoming", "Completed"],
  ],
  orders: [
    "From a customer commitment to a fulfilled order.",
    "order",
    "New order",
    ["Quotation", "Draft", "Confirmed", "Fulfilled", "Cancelled"],
  ],
  products: [
    "One view of what is on hand, reserved and ready to sell.",
    "product",
    "New product",
    ["Low stock"],
  ],
  purchases: [
    "Plan replenishment and record each supplier delivery.",
    "purchase",
    "New purchase",
    ["Draft", "Ordered", "Partially received", "Received", "Cancelled"],
  ],
  invoices: [
    "Operational invoice records and recorded payments. Amounts exclude tax.",
    "",
    "",
    ["Open", "Overdue", "Paid"],
  ],
};
function listPage(resource) {
  const [desc, type, label, statuses] =
      listMeta[resource] || listMeta.companies,
    rows = filtered(resource),
    views = state.data.saved_views.filter((v) => v.resource === resource),
    owned = ["companies", "opportunities", "tasks"].includes(resource);
  return (
    header(
      routeNames[resource],
      desc,
      `${resource === "companies" && has("crm") && canEdit() ? markup('<button data-action="import">Import CSV</button>') : ""}${type && (resource !== "products" || isAdmin()) ? newButton(type, label) : ""}`,
    ) +
    html`<div class="toolbar">
        <input
          id="list-search"
          type="search"
          placeholder="Search ${routeNames[resource].toLowerCase()}…"
          aria-label="Search records"
          value="${esc(state.query.q)}"
        /><select id="status-filter" aria-label="Filter by status">
          <option value="">
            ${resource === "products" ? "All products" : "All statuses"}
          </option>
          ${(statuses || state.data.workspace.stages).map((s) => html`<option value="${esc(s)}" ${s === state.query.status ? " selected" : ""}>${tr(s)}</option>`).join("")}</select
        >${
          owned
            ? html`<select id="owner-filter" aria-label="Filter by owner">
                <option value="">All owners</option>
                ${state.data.members.map((m) => html`<option value="${m.id}" ${state.query.owner === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("")}
              </select>`
            : ""
        }${
          views.length
            ? html`<select id="saved-view" aria-label="Apply saved view">
                <option value="">Saved views</option>
                ${views.map((v) => html`<option value="${v.id}">${esc(v.name)}</option>`).join("")}
              </select>`
            : ""
        }<span class="spacer"></span
        >${resource === "opportunities" ? html`<div class="segmented" aria-label="View type"><button data-board="false" class="${!state.board ? "selected" : ""}">Table</button><button data-board="true" class="${state.board ? "selected" : ""}">Board</button></div>` : ""}${canEdit() ? markup('<button data-action="save-view">Save view</button>') : ""}<button
          data-action="clear-filters"
        >
          Clear filters</button
        ><button data-action="export">${icon("download")} Export</button>
      </div>
      <div id="list-results">${listResults(resource, rows)}</div>`
  );
}
function listResults(resource, rows) {
  return html`${resource === "tasks" ? taskFocus() : ""}${resource === "opportunities" && state.board ? board(rows) : table(resource, rows)}
    <div class="table-foot">
      <span
        >${rows.length}
        ${resource === "companies" ? "companies" : resource === "opportunities" ? "opportunities" : "records"}${state.query.q || state.query.status || state.query.owner ? " · filtered" : ""}</span
      ><span
        >${resource === "products" ? "Available = on hand − reserved" : resource === "invoices" ? "Invoice records · not statutory invoice issuance" : "Shared with your workspace"}</span
      >
    </div>`;
}
function table(resource, rows) {
  if (!rows.length)
    return html`<div class="empty">
      <h3>
        ${state.query.q || state.query.status || state.query.owner ? "No matching records." : "A clean start."}
      </h3>
      <p>
        ${state.query.q || state.query.status || state.query.owner ? "Try another search or clear the filters." : "Add your first record to start connecting your work."}
      </p>
    </div>`;
  const heads = {
    companies: ["Company", "Relationship", "Location", "Owner"],
    contacts: ["Contact", "Company", "Email", "Role"],
    opportunities: [
      "Opportunity",
      "Company",
      "Stage",
      "Value",
      "Owner",
      "Close date",
    ],
    tasks: ["Task", "Company", "Owner", "Due date", "Status"],
    orders: ["Order", "Customer", "Status", "Order value", "Due date"],
    products: [
      "Product",
      "SKU",
      "On hand",
      "Reserved",
      "Available",
      "Reorder at",
    ],
    purchases: [
      "Purchase order",
      "Supplier",
      "Status",
      "Order value",
      "Due date",
    ],
    invoices: [
      "Invoice record",
      "Customer",
      "Total",
      "Outstanding",
      "Due date",
      "Status",
    ],
    payments: ["Payment reference", "Amount", "Recorded", "Status"],
  }[resource] || ["Record", "Details"];
  return html`<div class="table-wrap">
    <table>
      <thead>
        <tr>
          ${heads.map((h) => html`<th scope="col">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => tableRow(resource, r)).join("")}
      </tbody>
    </table>
  </div>`;
}
function tableRow(resource, r) {
  const name = r.name || r.title || r.ref || r.reference || r.id;
  const link = openButton(
    resource,
    r.id,
    html`${["companies", "contacts", "products"].includes(resource) ? avatar(name) : ""}<span
        >${esc(name)}${resource === "products" ? html`<span class="sub">${esc(companyName(r.supplier_id))}</span>` : ""}</span
      >`,
    "record-link",
  );
  let cells;
  if (resource === "companies")
    cells = [
      link,
      `${r.customer ? badge("Customer") : !r.supplier ? badge("Prospect") : ""} ${r.supplier ? badge("Supplier") : ""}`,
      esc(r.location) || "—",
      esc(ownerName(r.owner_id)),
    ];
  else if (resource === "contacts")
    cells = [
      link,
      esc(companyName(r.company_id)),
      esc(r.email),
      esc(r.title) || "—",
    ];
  else if (resource === "opportunities")
    cells = [
      link,
      esc(companyName(r.company_id)),
      badge(r.stage),
      amount(r.value_cents),
      esc(ownerName(r.owner_id)),
      fmtDate(r.close_date),
    ];
  else if (resource === "tasks")
    cells = [
      html`<div class="row">
        ${canEdit() && !r.completed_at ? html`<button class="task-check" data-complete="${r.id}" aria-label="Complete ${esc(r.title)}"></button>` : ""}${link}
      </div>`,
      esc(companyName(r.company_id)),
      esc(ownerName(r.owner_id)),
      fmtDate(r.due_date),
      badge(
        r.completed_at
          ? "Completed"
          : day(r.due_date) < today()
            ? "Overdue"
            : "Open",
      ),
    ];
  else if (resource === "orders")
    cells = [
      link,
      esc(companyName(r.company_id)),
      badge(r.status),
      amount(orderTotal(r)),
      fmtDate(r.due_date),
    ];
  else if (resource === "products")
    cells = [
      link,
      esc(r.sku),
      r.stock,
      r.reserved,
      `${r.stock - r.reserved} ${r.stock - r.reserved <= r.reorder_point ? badge("Low stock") : ""}`,
      r.reorder_point,
    ];
  else if (resource === "purchases")
    cells = [
      link,
      esc(companyName(r.supplier_id)),
      badge(r.status),
      amount(purchaseTotal(r)),
      fmtDate(r.due_date),
    ];
  else if (resource === "invoices")
    cells = [
      link,
      esc(companyName(r.company_id)),
      amount(r.total_cents),
      amount(Number(r.total_cents) - Number(r.paid_cents)),
      fmtDate(r.due_date),
      badge(
        Number(r.paid_cents) === Number(r.total_cents)
          ? "Paid"
          : day(r.due_date) < today()
            ? "Overdue"
            : "Open",
      ),
    ];
  else if (resource === "payments")
    cells = [
      link,
      amount(r.amount_cents),
      fmtDate(r.created_at),
      badge(r.reversed_at ? "Reversed" : "Recorded"),
    ];
  else cells = [link, esc(r.reason || r.status || "")];
  return html`<tr>
    ${cells.map((c) => html`<td>${c}</td>`).join("")}
  </tr>`;
}
function board(rows) {
  return html`<div class="board">
    ${state.data.workspace.stages
      .map((s) => {
        const list = rows.filter((r) => r.stage === s);
        return html`<section class="board-column">
          <div class="board-head">
            ${esc(tr(s))} <small>${list.length}</small>
          </div>
          <div class="board-total">
            ${amount(list.reduce((n, r) => n + r.value_cents, 0))}
          </div>
          ${list
            .map((r) =>
              openButton(
                "opportunities",
                r.id,
                html`<small>${esc(companyName(r.company_id))}</small
                  ><strong>${esc(r.name)}</strong>
                  <div class="between">
                    <span>${amount(r.value_cents)}</span
                    >${avatar(ownerName(r.owner_id), true)}
                  </div>`,
                "deal-card",
              ),
            )
            .join("")}
        </section>`;
      })
      .join("")}
  </div>`;
}
function dashboardLabel(group) {
  if (group.from)
    return `${fmtDate(group.from)}${group.to !== group.from ? " – " + fmtDate(group.to) : ""}`;
  return group.literal ? group.label : tr(group.label);
}
function dashboardPanel(key) {
  const panel = state.reports.panels[key];
  const total = panel.groups.reduce((sum, group) => sum + group.value, 0);
  const max = Math.max(1, ...panel.groups.map((group) => group.value));
  const count = panel.groups.reduce((sum, group) => sum + group.ids.length, 0);
  const format = (value) =>
    panel.kind === "money"
      ? amount(value)
      : new Intl.NumberFormat(locale()).format(value);
  const trend = panel.period === "Selected period";
  return html`<section class="dashboard-panel">
    <div class="dashboard-panel-heading"><div><span class="eyebrow">${panel.period}</span><h3>${panel.title}</h3></div><strong>${esc(format(total))}</strong></div>
    <p class="dashboard-description">${panel.description}</p>
    ${
      count
        ? html`<div class="${trend ? "dashboard-trend" : "dashboard-bars"}">
      ${panel.groups
        .map((group, index) => {
          const label = dashboardLabel(group);
          const compact = new Intl.NumberFormat(locale(), {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(panel.kind === "money" ? group.value / 100 : group.value);
          const dateLabel = group.from
            ? new Date(group.from + "T00:00:00Z").toLocaleDateString(locale(), {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })
            : "";
          return html`<button class="dashboard-bar" data-panel="${key}" data-group="${index}" ${group.ids.length ? "" : "disabled"}
          title="${esc(label + ": " + format(group.value))}" aria-label="${esc(label + ": " + format(group.value) + ". " + tr("Records: {0}", group.ids.length))}">
          ${trend ? html`<span class="trend-value">${esc(compact)}</span><svg class="trend-track" viewBox="0 0 40 140" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="${140 - (group.value / max) * 140}" width="40" height="${(group.value / max) * 140}" rx="3" /></svg><span class="trend-date">${esc(dateLabel)}</span>` : html`<span class="bar-heading"><span>${esc(label)}<small>${esc(tr("Records: {0}", group.ids.length))}</small></span><strong>${esc(format(group.value))}</strong></span><svg class="bar-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${(group.value / max) * 100}" height="7" rx="1" /></svg>`}
        </button>`;
        })
        .join("")}
    </div>`
        : html`<div class="dashboard-empty">${icon("reports")}<strong>No records to display</strong><p>${trend ? "Try a different reporting period." : "This view will fill as your team adds records."}</p></div>`
    }
    <div class="dashboard-caption">${trend ? esc(`${fmtDate(state.reports.from)} – ${fmtDate(state.reports.to)}`) : "Today (UTC)"}<span>Click a bar to view records</span></div>
  </section>`;
}
function dashboardDetail(key, index) {
  const panel = state.reports.panels[key],
    group = panel?.groups[index];
  if (!group) return;
  const ids = new Set(group.ids);
  showDialog(
    panel.title,
    html`<div class="detail-title"><div><h2>${esc(dashboardLabel(group))}</h2><p>${panel.kind === "money" ? amount(group.value) : group.value} · ${esc(tr("Records: {0}", group.ids.length))}</p></div></div><div class="notice">${panel.description}</div><div class="detail-section">${table(
      panel.source,
      state.data[panel.source].filter((row) => ids.has(row.id)),
    )}</div>`,
    { wide: true },
  );
}
async function applyReportPeriod(period) {
  const reports = await api(
    endpoint("reports") + "?" + new URLSearchParams(period),
  );
  state.period = period;
  state.reports = reports;
  render();
}
function reportsPage() {
  const templates = state.reports.templates,
    t = templates[state.report];
  return (
    header(
      "A clearer view of your business.",
      "Five focused views, connected to the records your team works with.",
    ) +
    html`<div class="toolbar">
        <select id="report-template" aria-label="Dashboard template">
          ${Object.entries(templates)
            .map(
              ([k, t]) =>
                html`<option
                  value="${k}"
                  ${state.report === k ? " selected" : ""}
                >
                  ${t.name}
                </option>`,
            )
            .join("")}</select
        ><span class="spacer"></span
        ><label
          >From<input
            type="date"
            id="report-from"
            value="${state.period.from}" /></label
        ><label
          >To<input
            type="date"
            id="report-to"
            value="${state.period.to}" /></label
        ><button data-action="report-period">Apply period</button>
      </div>
      <div class="report-shortcuts" aria-label="Reporting period shortcuts">
        <span>Quick period:</span><button data-period="month">This month</button><button data-period="30">Last 30 days</button><button data-period="year">This year</button>
      </div>
      <nav class="dashboard-nav" aria-label="Dashboards">${Object.entries(
        templates,
      )
        .map(
          ([key, template]) =>
            html`<button data-report="${key}" aria-pressed="${key === state.report}">${template.name}</button>`,
        )
        .join("")}</nav>
      <div class="section-head">
        <h2>${t.name}</h2>
        <small>Source: workspace records</small>
      </div>
      <p class="report-notes">
        ${t.description} Click any metric to see its definition and the records
        behind it. Snapshot metrics always show today; flow metrics use the
        dates selected above.
      </p>
      ${metricCards(t.keys)}
      <div class="dashboard-grid">${t.panels
        .filter((key) => state.reports.panels[key])
        .map(dashboardPanel)
        .join("")}</div>
      <div class="section-head"><h2>How these numbers are calculated</h2></div>
      ${t.keys
        .filter((k) => state.reports.metrics[k])
        .map((k) => {
          const m = state.reports.metrics[k];
          return html`<details class="report-details">
            <summary>${m.label}</summary>
            <p>
              ${m.definition}<br />Period:
              ${m.period === "Selected period" ? state.period.from + " to " + state.period.to : "Today (UTC)"}.
              Source: ${m.source.replaceAll("_", " ")}.
            </p>
          </details>`;
        })
        .join("")}`
  );
}
function modules() {
  return (
    header(
      "One workspace. The modules you need.",
      "Your company’s enabled tools share the same accounts and business records.",
    ) +
    html`<div class="module-grid">
        ${[
          [
            "crm",
            "Customer relationships",
            "Customers, opportunities and the next conversation.",
            "opportunities",
          ],
          [
            "operations",
            "Operations",
            "Orders, stock, purchasing, invoice records and bank reconciliation.",
            "orders",
          ],
          [
            "hub",
            "Company Hub",
            "Daily priorities and business dashboards.",
            "reports",
          ],
        ]
          .filter(([m]) => has(m))
          .map(
            ([m, n, d, r]) =>
              html`<a class="module-card" href="#${r}"
                >${icon(r)}
                <h3>${n}</h3>
                <p>${d}</p>
                <br /><span class="text-button"
                  >Open ${m === "crm" ? "CRM" : n} →</span
                ></a
              >`,
          )
          .join("")}
      </div>
      ${isAdmin() ? markup('<p class="subhead">Manage enabled modules in <a class="text-button" href="#settings">workspace settings</a>.</p>') : ""}`
  );
}
function settings() {
  const w = state.data.workspace;
  return (
    header(
      "Workspace settings",
      "Keep your company, team and working preferences in one place.",
      isAdmin()
        ? markup(
            '<button data-new="invite" class="primary">Invite colleague</button>',
          )
        : "",
    ) +
    html`<div class="settings-grid">
        <div>
          <section class="settings-card">
            <h2>Company workspace</h2>
            <p>
              <strong>${esc(w.name)}</strong><br />Legal entity:
              ${esc(w.legal_name)}<br />Country: ${esc(w.country)} · Base
              currency: ${esc(w.currency)}<br />Enabled modules:
              ${w.modules.join(", ")}${w.sample ? markup("<br>Fictional sample workspace") : ""}
            </p>
            ${isAdmin() ? markup('<button data-new="settings">Edit workspace</button>') : ""}<button
              data-action="new-workspace"
            >
              Create another workspace
            </button>
          </section>
          <section class="settings-card">
            <h2>Your team</h2>
            ${state.data.members
              .map(
                (m) =>
                  html`<div class="member-row">
                    <div class="row">
                      ${avatar(m.name, true)}
                      <div>
                        <strong>${esc(m.name)}</strong><br /><small
                          >${esc(m.email)}</small
                        >
                      </div>
                    </div>
                    ${isAdmin() && m.active && m.role !== "owner" && m.id !== state.me.user.id && (w.role === "owner" || m.role !== "administrator") ? html`<button data-role="${m.id}">${esc(tr(m.role))} ↓</button>` : badge(m.active ? m.role : "Access revoked")}
                  </div>`,
              )
              .join("")}${
              state.data.invitations.length
                ? html`<h3 class="section-head">Pending invitations</h3>
                    ${state.data.invitations.map((i) => html`<p>${esc(i.email)} · ${i.role}<br /><small>Expires ${fmtDate(i.expires_at)}</small></p>`).join("")}`
                : ""
            }
          </section>
          ${
            has("crm")
              ? html`<section class="settings-card">
                  <h2>Opportunity stages</h2>
                  <p>${w.stages.map((s) => esc(tr(s))).join(" → ")}</p>
                  ${isAdmin() ? markup('<button data-new="stages">Configure stages</button>') : ""}
                </section>`
              : ""
          }
        </div>
        <div>
          <section class="settings-card">
            <h2>Pilot plan & billing</h2>
            <p>
              <strong>${esc(w.billing_status.replaceAll("_", " "))}</strong> ·
              ${state.data.members.filter((m) => m.active).length} of
              ${w.seat_limit} seats<br />Billing runs in test mode only. No
              money is charged by this application.
            </p>
            ${state.config.billingConfigured && isAdmin() ? markup('<button data-action="billing">Open test checkout</button>') : markup('<div class="notice">Test checkout is not configured. There is no active paid subscription.</div>')}
          </section>
          <section class="settings-card">
            <h2>Your data</h2>
            <p>
              Records are saved to the workspace database and shared across
              signed-in devices. Exports include only the modules you have
              enabled. Workspace export is a portable record snapshot; restoring
              the service requires the database backup procedure.
            </p>
            ${isAdmin() ? markup('<button data-action="backup">Download workspace export</button>') : ""}
          </section>
          <section class="settings-card">
            <h2>Account recovery & support</h2>
            <p>
              ${state.me.user.verified_at ? "Your email address is verified." : "Your email address has not been verified."}
            </p>
            ${state.config.mailConfigured && !state.me.user.verified_at ? markup('<button data-action="verify-email">Verify my email</button>') : ""}
            <p>
              ${state.config.mailConfigured ? "Recovery emails are configured." : "Email delivery is not configured. Password recovery must be enabled before a paid pilot."}
            </p>
            ${state.config.supportEmail ? html`<p><a href="mailto:${esc(state.config.supportEmail)}">${esc(state.config.supportEmail)}</a></p>` : markup("<p>Support contact is awaiting configuration. Contact your pilot administrator directly.</p>")}<a
              class="button"
              href="#help"
              >Open pilot guide</a
            >
          </section>
          <section class="settings-card">
            <h2>Saved views</h2>
            ${
              state.data.saved_views.length
                ? state.data.saved_views
                    .map(
                      (v) =>
                        html`<div class="member-row">
                          <span
                            >${esc(v.name)}<br /><small
                              >${esc(v.resource)}</small
                            ></span
                          >${canEdit() ? html`<button data-delete-view="${v.id}">Remove</button>` : ""}
                        </div>`,
                    )
                    .join("")
                : markup("<p>Save a filtered view from any record list.</p>")
            }
          </section>
        </div>
      </div>
      <section class="settings-card">
        <h2>Recent workspace activity</h2>
        <p>
          Important changes are recorded with an actor and time. Showing the
          latest 300 events.
        </p>
        ${state.data.audit_events
          .slice(0, 30)
          .map(
            (e) =>
              html`<div class="linked-row">
                <span
                  >${esc(actionLabel(e.action))} ·
                  ${esc(ownerName(e.actor_id))}</span
                ><small
                  >${new Date(e.created_at).toLocaleString(locale())}</small
                >
              </div>`,
          )
          .join("")}
      </section>`
  );
}
function help() {
  return (
    header(
      "A good place to get started.",
      "A short guide to a complete business workflow.",
    ) +
    html`<div class="help-content">
      <div class="notice">
        <strong>Pilot preview</strong><br />The connected records and stock
        calculations are real. Sample company data is fictional. Invoice records
        are operational tracking, and test billing does not charge money.
      </div>
      <h2>1. From a relationship to an order</h2>
      <ol>
        <li>
          Open Companies and import a CSV using
          <a class="text-button" href="/sample-import.csv" download
            >the sample template</a
          >. Review row errors before confirming the import.
        </li>
        <li>
          Create an opportunity, choose its company and schedule a follow-up.
        </li>
        <li>
          Open the opportunity and mark it won. Confirm the action to create one
          linked draft sales order.
        </li>
        <li>
          Review the draft, add product lines and a delivery date. An owner or
          administrator can confirm it and reserve stock.
        </li>
      </ol>
      <h2>2. Deliver and record payment</h2>
      <p>
        Fulfill a confirmed order once. Stock is deducted and an associated
        invoice record is created. Open the invoice record to record partial or
        full payment with a bank reference. This records a payment you have
        received; it does not transfer funds.
      </p>
      <h2>3. Replenish with a partial receipt</h2>
      <p>
        Open a low-stock product and prepare replenishment. Existing draft and
        outstanding purchases are counted. An administrator approves the
        purchase; your team records each receipt using its supplier delivery
        reference and actual whole-unit quantities.
      </p>
      <h2>4. Keep the day moving</h2>
      <p>
        Your day shows assigned tasks, late follow-ups and pending order
        approvals. Complete a task or act on an order, then return to the
        dashboard to see the change. Click a KPI to inspect its definition, time
        period and source records.
      </p>
      <h2>5. Reconcile your bank statement</h2>
      <p>
        Open Bank reconciliation and import a camt.053 XML or CSV statement
        from online banking. Incoming payments are matched to open invoice
        records by reference, amount and payer; outgoing payments are suggested
        as paid expenses with a category. Confirm a line, or confirm all
        suggestions at once. Statement lines stay in your browser; only the
        records you confirm are saved, and importing the same statement again
        never creates duplicates.
      </p>
      <h2>Cancellations and corrections</h2>
      <p>
        Edit a draft before approval. Cancelling a confirmed sales order
        releases reserved stock and requires a reason. Cancelling an outstanding
        purchase closes its remaining quantities; goods already received remain
        in stock. Fulfilled orders and receipts cannot be deleted or rewritten.
        An administrator can record a reasoned stock adjustment to correct a
        count, or reverse an incorrect payment while preserving its history.
        Returns, credit notes and invoice issuance stay in your accounting
        process.
      </p>
      <h2>Pilot onboarding checklist</h2>
      <ol>
        <li>
          Agree on launch country, legal entity, base currency and product
          units.
        </li>
        <li>
          Confirm privacy terms, retention, support ownership and accounting
          responsibilities.
        </li>
        <li>
          Configure recovery email and a support contact. Invite a colleague and
          test their role.
        </li>
        <li>
          Import a small reviewed sample. Reconcile opening stock and
          receivables.
        </li>
        <li>
          Complete all four journeys together and verify a backup restore.
        </li>
        <li>
          Use real customer data only after the administrator approves the pilot
          readiness gates.
        </li>
      </ol>
      <h2>Need a hand?</h2>
      <p>
        ${state.config.supportEmail ? html`Email <a class="text-button" href="mailto:${esc(state.config.supportEmail)}">${esc(state.config.supportEmail)}</a>.` : "Ask your pilot administrator. A support email has not been configured yet."}
        Include the support reference shown with an error; never share your
        password or an invitation link in a support report.
      </p>
    </div>`
  );
}
function showDialog(
  title,
  body,
  { wide = false, drawer = false, footer = "" } = {},
) {
  if (dialog.open) dialog.close();
  dialog.className = drawer ? "drawer" : wide ? "wide" : "";
  dialog.innerHTML = html`<div class="dialog-header">
      <h2 id="dialog-title">${esc(tr(title))}</h2>
      <button class="quiet" data-action="close" aria-label="Close dialog">
        ${icon("close")}
      </button>
    </div>
    <div class="dialog-body">${body}</div>
    ${footer ? html`<div class="dialog-footer">${footer}</div>` : ""}`;
  dialog.showModal();
}
function formDialog(
  title,
  body,
  onSubmit,
  { submit = "Save", wide = false } = {},
) {
  formSubmit = onSubmit;
  showDialog(
    title,
    html`<form id="record-form">
      ${body}
      <div class="form-error" role="alert"></div>
    </form>`,
    {
      wide,
      footer: html`<button data-action="close">Cancel</button
        ><button class="primary" form="record-form" type="submit">
          ${esc(tr(submit))}
        </button>`,
    },
  );
}
function detailPair(label, value) {
  return html`<div><small>${label}</small><strong>${value}</strong></div>`;
}
function linked(resource, rows, label) {
  return html`<section class="detail-section">
    <h3>${label} · ${rows.length}</h3>
    ${rows.length ? rows.map((r) => html`<div class="linked-row">${openButton(resource, r.id, esc(r.name || r.title || r.ref))}<span>${r.stage ? badge(r.stage) : r.status ? badge(r.status) : r.completed_at ? badge("Completed") : r.due_date ? fmtDate(r.due_date) : ""}</span></div>`).join("") : markup('<p class="subhead">Nothing here yet.</p>')}
  </section>`;
}
function detail(resource, recordId) {
  const r = state.data[resource]?.find((r) => r.id === recordId);
  if (!r) return toast("Record is no longer available. Reload the workspace.");
  const name = r.name || r.title || r.ref || r.reference || "Record",
    editType = {
      companies: "company",
      contacts: "contact",
      opportunities: "opportunity",
      tasks: "task",
      products: "product",
    }[resource];
  let content = html`<div class="detail-title">
      ${avatar(name)}
      <div>
        <h2>${esc(name)}</h2>
        <p>
          ${resource === "companies" ? esc(r.domain || r.location) : resource === "products" ? esc(r.sku) : esc(companyName(r.company_id || r.supplier_id))}
        </p>
      </div>
    </div>`,
    actions = "";
  if (
    canEdit() &&
    editType &&
    (resource !== "products" || isAdmin()) &&
    (resource !== "opportunities" || !["Won", "Lost"].includes(r.stage))
  )
    actions += html`<button data-edit="${editType}" data-id="${r.id}">
      Edit ${editType}
    </button>`;
  if (resource === "companies") {
    content += html`<div class="detail-grid">
      ${detailPair("Relationship", r.customer ? "Customer" : r.supplier ? "Supplier" : "Prospect")}${detailPair("Owner", esc(ownerName(r.owner_id)))}${detailPair("Location", esc(r.location) || "—")}${detailPair("Created", fmtDate(r.created_at))}
    </div>`;
    if (canEdit()) {
      actions += html`<button data-new="task" data-company="${r.id}">
        Schedule follow-up
      </button>`;
      if (has("operations")) {
        actions += html`<button data-new="order" data-company="${r.id}">
          New sales order
        </button>`;
        if (r.supplier)
          actions += html`<button data-new="purchase" data-company="${r.id}">
            New purchase order
          </button>`;
      }
    }
    if (canEdit() && has("crm"))
      actions += html`<button data-new="opportunity" data-company="${r.id}">
          New opportunity</button
        ><button data-new="contact" data-company="${r.id}">Add contact</button
        ><button data-new="note" data-company="${r.id}">Add note</button>`;
    content +=
      html`<div class="detail-actions">${actions}</div>` +
      linked(
        "contacts",
        state.data.contacts.filter((x) => x.company_id === r.id),
        "People",
      ) +
      linked(
        "opportunities",
        state.data.opportunities.filter((x) => x.company_id === r.id),
        "Opportunities",
      ) +
      linked(
        "tasks",
        state.data.tasks.filter((x) => x.company_id === r.id),
        "Follow-ups",
      ) +
      linked(
        "orders",
        state.data.orders.filter((x) => x.company_id === r.id),
        "Sales orders",
      ) +
      html`<section class="detail-section">
        <h3>Relationship notes</h3>
        ${
          state.data.notes
            .filter((n) => n.company_id === r.id)
            .map(
              (n) =>
                html`<div class="note">
                  ${esc(n.body)}<small
                    >${esc(ownerName(n.author_id))} ·
                    ${fmtDate(n.created_at)}</small
                  >
                </div>`,
            )
            .join("") ||
          markup(
            '<p class="subhead">Add context for your next conversation.</p>',
          )
        }
      </section>`;
  } else if (resource === "contacts") {
    content += html`<div class="detail-grid">
        ${detailPair("Company", openButton("companies", r.company_id, esc(companyName(r.company_id))))}${detailPair("Email", esc(r.email))}${detailPair("Role", esc(r.title) || "—")}
      </div>
      <div class="detail-actions">${actions}</div>`;
  } else if (resource === "opportunities") {
    content += html`<div class="detail-grid">
      ${detailPair("Company", openButton("companies", r.company_id, esc(companyName(r.company_id))))}${detailPair("Stage", badge(r.stage))}${detailPair("Value", amount(r.value_cents))}${detailPair("Owner", esc(ownerName(r.owner_id)))}${detailPair("Expected close", fmtDate(r.close_date))}
    </div>`;
    if (canEdit()) {
      actions += html`<button
        data-new="task"
        data-opportunity="${r.id}"
        data-company="${r.company_id}"
      >
        Schedule follow-up
      </button>`;
      if (!["Won", "Lost"].includes(r.stage))
        actions += html`<button
            class="primary"
            data-transition="win"
            data-id="${r.id}"
          >
            ${has("operations") ? "Mark won & create order" : "Mark won"}</button
          ><button data-transition="lose" data-id="${r.id}">Mark lost</button>`;
      if (
        r.stage === "Won" &&
        has("operations") &&
        !state.data.orders.some((o) => o.opportunity_id === r.id)
      )
        actions += html`<button
          class="primary"
          data-transition="create-linked-order"
          data-id="${r.id}"
        >
          Create linked draft order
        </button>`;
    }
    content +=
      html`<div class="detail-actions">${actions}</div>` +
      linked(
        "tasks",
        state.data.tasks.filter((t) => t.opportunity_id === r.id),
        "Follow-ups",
      ) +
      linked(
        "orders",
        state.data.orders.filter((o) => o.opportunity_id === r.id),
        "Linked sales order",
      );
  } else if (resource === "tasks") {
    content += html`<div class="detail-grid">
      ${detailPair("Assigned to", esc(ownerName(r.owner_id)))}${detailPair("Due date", fmtDate(r.due_date))}${detailPair("Company", r.company_id ? openButton("companies", r.company_id, esc(companyName(r.company_id))) : "—")}${detailPair("Status", badge(r.completed_at ? "Completed" : day(r.due_date) < today() ? "Overdue" : "Open"))}
    </div>`;
    if (canEdit() && !r.completed_at)
      actions += html`<button class="primary" data-complete="${r.id}">
        Complete task
      </button>`;
    content +=
      html`<div class="detail-actions">${actions}</div>` +
      linked(
        "opportunities",
        state.data.opportunities.filter((o) => o.id === r.opportunity_id),
        "Linked opportunity",
      );
  } else if (resource === "products") {
    content += html`<div class="detail-grid">
      ${detailPair("On hand", r.stock)}${detailPair("Reserved", r.reserved)}${detailPair("Available", r.stock - r.reserved)}${detailPair("Reorder point", r.reorder_point)}${detailPair("Unit price", amount(r.price_cents))}${detailPair("Standard cost", amount(r.cost_cents))}${detailPair("Supplier", openButton("companies", r.supplier_id, esc(companyName(r.supplier_id))))}
    </div>`;
    if (isAdmin())
      actions += html`<button data-adjust="${r.id}">Adjust stock</button>`;
    if (canEdit() && r.stock - r.reserved <= r.reorder_point)
      actions += html`<button class="primary" data-replenish="${r.id}">
        Prepare replenishment
      </button>`;
    content += html`<div class="detail-actions">${actions}</div>
      <section class="detail-section">
        <h3>Stock movements</h3>
        ${
          state.data.stock_movements
            .filter((m) => m.product_id === r.id)
            .sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
            )
            .map(
              (m) =>
                html`<div class="linked-row">
                  <span
                    >${esc(m.reason)}<br /><small
                      >${fmtDate(m.created_at)} ·
                      ${esc(ownerName(m.actor_id))}</small
                    ></span
                  ><strong>${m.quantity > 0 ? "+" : ""}${m.quantity}</strong>
                </div>`,
            )
            .join("") || markup('<p class="subhead">No movements yet.</p>')
        }
      </section>`;
  } else if (["orders", "purchases"].includes(resource)) {
    const purchase = resource === "purchases",
      ls = (
        purchase ? state.data.purchase_lines : state.data.order_lines
      ).filter((l) => (purchase ? l.purchase_id : l.order_id) === r.id);
    content += html`<div class="detail-grid">
      ${detailPair(purchase ? "Supplier" : "Customer", openButton("companies", r.supplier_id || r.company_id, esc(companyName(r.supplier_id || r.company_id))))}${detailPair("Status", badge(r.status))}${detailPair("Due date", fmtDate(r.due_date))}${detailPair("Total · excluding tax", amount(purchase ? purchaseTotal(r) : orderTotal(r)))}
    </div>`;
    if (canEdit()) {
      if (["Draft", "Quotation"].includes(r.status))
        actions += html`<button
          data-document="${purchase ? "purchase" : "order"}"
          data-id="${r.id}"
        >
          Edit draft lines
        </button>`;
      if (r.status === "Quotation")
        actions += html`<button
          class="primary"
          data-transition="order-Draft"
          data-id="${r.id}"
        >
          Accept quotation
        </button>`;
      if (r.status === "Draft" && isAdmin())
        actions += html`<button
          class="primary"
          data-transition="${purchase ? "purchase-Ordered" : "order-Confirmed"}"
          data-id="${r.id}"
        >
          ${purchase ? "Approve purchase" : "Confirm & reserve"}
        </button>`;
      if (r.status === "Confirmed")
        actions += html`<button
          class="primary"
          data-transition="order-Fulfilled"
          data-id="${r.id}"
        >
          Record fulfillment
        </button>`;
      if (purchase && ["Ordered", "Partially received"].includes(r.status))
        actions += html`<button class="primary" data-receive="${r.id}">
          Record receipt
        </button>`;
      if (
        !["Fulfilled", "Received", "Cancelled"].includes(r.status) &&
        (isAdmin() || ["Draft", "Quotation"].includes(r.status))
      )
        actions += html`<button
          class="danger"
          data-transition="${purchase ? "purchase" : "order"}-Cancelled"
          data-id="${r.id}"
        >
          Cancel ${purchase ? "purchase" : "order"}
        </button>`;
    }
    content += html`<div class="detail-actions">${actions}</div>
      <section class="detail-section">
        <h3>Product lines</h3>
        ${
          ls.length
            ? html`<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>${purchase ? "Received" : "Unit price"}</th>
                      <th>${purchase ? "Remaining" : "Line total"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ls
                      .map(
                        (l) =>
                          html`<tr>
                            <td>
                              ${openButton("products", l.product_id, esc(productName(l.product_id)))}
                            </td>
                            <td>${l.quantity}</td>
                            <td>
                              ${purchase ? l.received : amount(l.price_cents)}
                            </td>
                            <td>
                              ${purchase ? l.quantity - l.received : amount(l.quantity * l.price_cents)}
                            </td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : markup(
                '<div class="notice">Add product lines before confirming this order.</div>',
              )
        }
      </section>
      ${
        r.notes
          ? html`<section class="detail-section">
              <h3>Notes</h3>
              <p class="note">${esc(r.notes)}</p>
            </section>`
          : ""
      }`;
    if (purchase)
      content += html`<section class="detail-section">
        <h3>Receipts</h3>
        ${
          state.data.receipts
            .filter((x) => x.purchase_id === r.id)
            .map(
              (x) =>
                html`<div class="linked-row">
                  <span>${esc(x.delivery_ref)}</span
                  ><small>${fmtDate(x.created_at)}</small>
                </div>`,
            )
            .join("") || markup('<p class="subhead">No receipts recorded.</p>')
        }
      </section>`;
    else
      content +=
        linked(
          "invoices",
          state.data.invoices.filter((i) => i.order_id === r.id),
          "Invoice records",
        ) +
        linked(
          "opportunities",
          state.data.opportunities.filter((o) => o.id === r.opportunity_id),
          "Source opportunity",
        );
  } else if (resource === "invoices") {
    content += html`<div class="notice">
        Operational invoice record. This is not a legally issued tax invoice.
        Issue compliant invoices through your accounting system.
      </div>
      <br />
      <div class="detail-grid">
        ${detailPair("Total", amount(r.total_cents))}${detailPair("Recorded payments", amount(r.paid_cents))}${detailPair("Outstanding", amount(Number(r.total_cents) - Number(r.paid_cents)))}${detailPair("Due date", fmtDate(r.due_date))}
      </div>`;
    if (isAdmin() && Number(r.paid_cents) < Number(r.total_cents))
      actions += html`<button class="primary" data-payment="${r.id}">
        Record payment
      </button>`;
    content +=
      html`<div class="detail-actions">${actions}</div>` +
      linked(
        "orders",
        state.data.orders.filter((o) => o.id === r.order_id),
        "Source sales order",
      ) +
      html`<section class="detail-section">
        <h3>Payment history</h3>
        ${
          state.data.payments
            .filter((p) => p.invoice_id === r.id)
            .map(
              (p) =>
                html`<div class="linked-row">
                  <span
                    >${esc(p.reference)}<br /><small
                      >${fmtDate(p.created_at)} ·
                      ${p.reversed_at ? "Reversed" : "Recorded"}</small
                    ></span
                  ><span
                    >${amount(p.amount_cents)}
                    ${isAdmin() && !p.reversed_at ? html`<button class="text-button" data-reverse="${p.id}">Correct</button>` : ""}</span
                  >
                </div>`,
            )
            .join("") || markup('<p class="subhead">No payments recorded.</p>')
        }
      </section>`;
  } else if (resource === "payments") {
    const invoice = state.data.invoices.find((i) => i.id === r.invoice_id);
    content += html`<p>
        ${amount(r.amount_cents)} · ${r.reversed_at ? "Reversed" : "Recorded"}
      </p>
      <div class="detail-actions">
        ${invoice ? openButton("invoices", invoice.id, `Open ${esc(invoice.ref)}`) : ""}
      </div>`;
  }
  showDialog(
    resource === "invoices"
      ? "Invoice record"
      : resource === "companies"
        ? "Company relationship"
        : "Record details",
    content,
    { drawer: true },
  );
}
function metricDetail(key) {
  const m = state.reports.metrics[key];
  if (!m) return;
  showDialog(
    m.label,
    html`<div class="detail-title">
        <div>
          <h2>${m.kind === "money" ? amount(m.value) : m.value}</h2>
          <p>
            ${m.period === "Selected period" ? `${m.from} to ${m.to}` : "As of " + m.asOf + " (UTC)"}
          </p>
        </div>
      </div>
      <div class="notice">
        ${m.definition}<br /><strong>Source:</strong>
        ${esc(m.source.replaceAll("_", " "))}
      </div>
      <div class="detail-section">
        ${m.source === "approvals" ? m.rows.map((r) => html`<div class="linked-row">${openButton(r.resource, r.id, esc(r.ref))}${badge(r.status)}</div>`).join("") || markup('<p class="subhead">No pending approvals.</p>') : table(m.source, m.rows)}
      </div>`,
    { wide: true },
  );
}
function form(type, recordId = null, preset = {}) {
  const map = {
    company: "companies",
    contact: "contacts",
    opportunity: "opportunities",
    task: "tasks",
    product: "products",
  };
  const r = recordId
      ? state.data[map[type]].find((r) => r.id === recordId)
      : {},
    companies = state.data.companies.map((c) => [c.id, c.name]),
    owners = state.data.members
      .filter((m) => m.active)
      .map((m) => [m.id, m.name]);
  let body = "",
    title = recordId ? tr("Edit " + type) : tr("New " + type),
    submit = tr("Save " + type);
  if (["order", "purchase"].includes(type))
    return documentForm(type, recordId, preset);
  if (type === "company")
    body =
      field("name", "Company name", "text", r.name || "") +
      field("domain", "Website / domain", "text", r.domain || "", {
        optional: true,
      }) +
      field("location", "Location", "text", r.location || "", {
        optional: true,
      }) +
      selectField(
        "owner_id",
        "Relationship owner",
        owners,
        r.owner_id || state.me.user.id,
      ) +
      html`<label class="check"
          ><input
            name="customer"
            type="checkbox"
            ${r.customer ? " checked" : ""}
          />Customer</label
        ><label class="check"
          ><input
            name="supplier"
            type="checkbox"
            ${r.supplier ? " checked" : ""}
          />Supplier</label
        >`;
  if (type === "contact")
    body =
      field("name", "Full name", "text", r.name || "") +
      selectField(
        "company_id",
        "Company",
        companies,
        r.company_id || preset.company || "",
      ) +
      field("email", "Email", "email", r.email || "") +
      field("title", "Role / job title", "text", r.title || "", {
        optional: true,
      });
  if (type === "opportunity")
    body =
      field("name", "Opportunity name", "text", r.name || "") +
      selectField(
        "company_id",
        "Company",
        companies,
        r.company_id || preset.company || "",
      ) +
      field(
        "value",
        tr("Expected value ({0})", state.data.workspace.currency),
        "number",
        (r.value_cents || 0) / 100,
        { min: 0, step: ".01", max: 1000000 },
      ) +
      selectField(
        "stage",
        "Stage",
        state.data.workspace.stages
          .filter((s) => !["Won", "Lost"].includes(s))
          .map((s) => [s, s]),
        r.stage ||
          state.data.workspace.stages.find((s) => !["Won", "Lost"].includes(s)),
      ) +
      selectField("owner_id", "Owner", owners, r.owner_id || state.me.user.id) +
      field(
        "close_date",
        "Expected close",
        "date",
        day(r.close_date) || future(14),
      );
  if (type === "task")
    body =
      field("title", "Follow-up / task", "text", r.title || "") +
      field("due_date", "Due date", "date", day(r.due_date) || today()) +
      selectField(
        "owner_id",
        "Assigned to",
        owners,
        r.owner_id || state.me.user.id,
      ) +
      selectField(
        "company_id",
        "Company",
        companies,
        r.company_id || preset.company || "",
        true,
      ) +
      selectField(
        "opportunity_id",
        "Opportunity",
        taskOpportunities(
          state.data.opportunities,
          r.company_id || preset.company || "",
        ).map((o) => [o.id, `${o.name} · ${companyName(o.company_id)}`]),
        r.opportunity_id || preset.opportunity || "",
        true,
      );
  if (type === "product")
    body =
      field("name", "Product name", "text", r.name || "") +
      field("sku", "SKU", "text", r.sku || "") +
      selectField(
        "supplier_id",
        "Supplier",
        state.data.companies
          .filter((c) => c.supplier)
          .map((c) => [c.id, c.name]),
        r.supplier_id || "",
      ) +
      field("price", "Selling price", "number", (r.price_cents || 0) / 100, {
        min: 0,
        step: ".01",
        max: 100000,
      }) +
      field("cost", "Standard cost", "number", (r.cost_cents || 0) / 100, {
        min: 0,
        step: ".01",
        max: 100000,
      }) +
      field(
        "reorder_point",
        "Reorder at (whole units)",
        "number",
        r.reorder_point || 0,
        { min: 0, step: 1, max: 100000 },
      ) +
      markup(
        '<div class="notice full">New products start with zero stock. Record a receipt or a reasoned opening-stock adjustment to establish quantities.</div>',
      );
  if (type === "note") {
    body =
      selectField("company_id", "Company", companies, preset.company || "") +
      textField("body", "Relationship note");
    title = "Add a relationship note";
  }
  if (type === "invite") {
    title = "Invite a colleague";
    submit = "Create invitation";
    body =
      field("email", "Colleague’s email", "email") +
      selectField(
        "role",
        "Workspace role",
        [
          ["member", "Member · prepare & fulfill"],
          ["viewer", "Viewer · read & export"],
          ...(state.data.workspace.role === "owner"
            ? [["administrator", "Administrator · approve & configure"]]
            : []),
        ],
        "member",
      ) +
      markup(
        '<div class="notice full">The invitation is valid for 72 hours and bound to this email address. Share the generated link with your colleague using a trusted channel.</div>',
      );
  }
  if (type === "settings") {
    title = "Edit workspace";
    submit = "Save settings";
    const w = state.data.workspace;
    body =
      field("name", "Workspace name", "text", w.name) +
      field("legal_name", "Legal entity", "text", w.legal_name) +
      html`<div class="full stack">
          <strong>Enabled modules</strong
          >${["crm", "operations", "hub"].map((m) => html`<label class="check"><input type="checkbox" name="${m}" ${has(m) ? " checked" : ""} />${m === "crm" ? "CRM" : m === "operations" ? "Operations" : "Hub"}</label>`).join("")}
        </div>
        <div class="notice full">
          Disabling a module hides its navigation and blocks its operations.
          Existing records are retained.
        </div>`;
  }
  if (type === "stages") {
    title = "Configure opportunity stages";
    submit = "Save stages";
    body =
      textField(
        "stages",
        "One stage per line",
        state.data.workspace.stages.join("\n"),
      ) +
      markup(
        '<div class="notice full">Keep Won and Lost. Move existing opportunities before removing a stage.</div>',
      );
  }
  if (type === "view") {
    title = "Save current view";
    submit = "Save view";
    body =
      field("name", "View name") +
      html`<p class="notice full">
        Saves the current search, status and owner filters for
        ${routeNames[state.route].toLowerCase()}. Your views follow your account
        across devices.
      </p>`;
  }
  formDialog(
    title,
    html`<div class="form-grid">${body}</div>`,
    async (values) => {
      let payload = {
        type: type + ".save",
        ...values,
        ...(recordId ? { id: recordId } : {}),
      };
      if (type === "company") {
        payload.customer = values.customer === "on";
        payload.supplier = values.supplier === "on";
      }
      if (type === "opportunity") {
        payload.value_cents = Math.round(Number(values.value) * 100);
        delete payload.value;
      }
      if (type === "task") {
        payload.company_id ||= null;
        payload.opportunity_id ||= null;
      }
      if (type === "product") {
        payload.price_cents = Math.round(Number(values.price) * 100);
        payload.cost_cents = Math.round(Number(values.cost) * 100);
        payload.reorder_point = Number(values.reorder_point);
        delete payload.price;
        delete payload.cost;
      }
      if (type === "note") payload.type = "note.create";
      if (type === "settings")
        payload = {
          type: "workspace.settings",
          name: values.name,
          legal_name: values.legal_name,
          modules: ["crm", "operations", "hub"].filter(
            (m) => values[m] === "on",
          ),
        };
      if (type === "stages")
        payload = {
          type: "stages.save",
          stages: values.stages
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      if (type === "view")
        payload = {
          type: "view.save",
          name: values.name,
          resource: state.route,
          query: state.query,
        };
      if (type === "invite") {
        const result = await api(endpoint("invitations"), {
          email: values.email,
          role: values.role,
        });
        await refresh();
        showDialog(
          "Invitation ready",
          html`<p class="subhead">
              Share this link securely with ${esc(result.email)}. It expires in
              72 hours.
            </p>
            <p class="copy-link">${esc(result.url)}</p>
            <button class="primary" data-copy="${esc(result.url)}">
              Copy invitation link
            </button>`,
        );
        return;
      }
      const result = await cmd(payload);
      await refresh();
      dialog.close();
      toast(type === "view" ? "View saved." : "Saved to your workspace.");
      if (result.id && map[type]) detail(map[type], result.id);
      if (type === "settings") {
        state.me = await api("/api/me");
        render();
      }
    },
    { submit },
  );
  if (type === "task") $("#record-form").dataset.taskForm = "true";
}
function syncTaskCompany(changed) {
  const form = $("#record-form[data-task-form]");
  if (!form) return;
  const company = $("[name=company_id]", form),
    opportunity = $("[name=opportunity_id]", form);
  if (changed === "opportunity_id" && opportunity.value) {
    company.value =
      state.data.opportunities.find((o) => o.id === opportunity.value)
        ?.company_id || "";
  }
  const selected = opportunity.value;
  const choices = taskOpportunities(state.data.opportunities, company.value);
  opportunity.innerHTML = html`<option value="">None</option>
    ${choices.map((o) => html`<option value="${esc(o.id)}" ${o.id === selected ? " selected" : ""}>${esc(o.name)} · ${esc(companyName(o.company_id))}</option>`).join("")}`;
}
function documentForm(type, recordId, preset = {}) {
  const purchase = type === "purchase",
    r = recordId
      ? state.data[purchase ? "purchases" : "orders"].find(
          (r) => r.id === recordId,
        )
      : {},
    ls = recordId
      ? state.data[purchase ? "purchase_lines" : "order_lines"].filter(
          (l) => (purchase ? l.purchase_id : l.order_id) === recordId,
        )
      : [];
  const options = state.data.companies
    .filter((c) => !purchase || c.supplier)
    .map((c) => [c.id, c.name]);
  if (!state.data.products.length || !options.length) {
    showDialog(
      "Add the basics first",
      html`<div class="notice">
        ${purchase ? "Add a supplier company" : "Add a customer company"} and at
        least one product before preparing
        ${purchase ? "a purchase" : "an order"}. You can do this from Companies
        and Inventory.
      </div>`,
    );
    return;
  }
  const head = html`<div class="form-grid">
      ${
        recordId
          ? html`<div>
              <small>${purchase ? "Supplier" : "Customer"}</small>
              <p>${esc(companyName(r.supplier_id || r.company_id))}</p>
            </div>`
          : selectField(
              purchase ? "supplier_id" : "company_id",
              purchase ? "Supplier" : "Company",
              options,
              preset.company || options[0]?.[0],
            )
      }${field("due_date", purchase ? "Expected delivery" : "Delivery date", "date", day(r.due_date) || future(7))}${!purchase && !recordId ? markup('<label class="check full"><input type="checkbox" name="quotation">Start as a quotation</label>') : ""}${textField("notes", "Notes", r.notes || "")}
    </div>
    <section class="line-editor">
      <h3>Product lines</h3>
      <div id="document-lines"></div>
      <button type="button" data-action="add-line">+ Add product line</button>
      <p class="document-total" id="document-total"></p>
      <p class="subhead">
        Whole units · ${state.data.workspace.currency} · Prices exclude tax
      </p>
    </section>`;
  formDialog(
    recordId
      ? tr("Edit {0}", r.ref)
      : tr("New {0}", tr(purchase ? "purchase" : "sales order")),
    head,
    async (values, form) => {
      const lineValues = $$(".document-line", form).map((el) => ({
        product_id: $("select", el).value,
        quantity: Number($("[name=quantity]", el).value),
        [purchase ? "cost_cents" : "price_cents"]: Math.round(
          Number($("[name=unit_price]", el).value) * 100,
        ),
      }));
      const body = {
        type: type + (recordId ? ".edit" : ".create"),
        due_date: values.due_date,
        notes: values.notes,
        lines: lineValues,
      };
      if (recordId) body.id = recordId;
      else if (purchase) body.supplier_id = values.supplier_id;
      else {
        body.company_id = values.company_id;
        body.quotation = values.quotation === "on";
      }
      const result = await cmd(body);
      await refresh();
      dialog.close();
      detail(purchase ? "purchases" : "orders", result.id);
      toast("Draft saved.");
    },
    { submit: "Save draft", wide: true },
  );
  $("#record-form").dataset.documentType = type;
  $("#record-form").dataset.supplier =
    r.supplier_id || preset.company || options[0]?.[0] || "";
  if (ls.length) ls.forEach((l) => addLine(l));
  else addLine();
}
function addLine(line = {}) {
  const form = $("#record-form"),
    purchase = form.dataset.documentType === "purchase",
    supplier = $("[name=supplier_id]", form)?.value || form.dataset.supplier,
    products = state.data.products.filter(
      (p) => !purchase || p.supplier_id === supplier,
    ),
    p = products.find((p) => p.id === line.product_id) || products[0];
  const div = document.createElement("div");
  div.className = "document-line";
  div.innerHTML = html`${selectField(
    "product_id",
    "Product",
    products.map((p) => [p.id, `${p.name} · ${p.sku}`]),
    p?.id || "",
  )}${field("quantity", "Quantity", "number", line.quantity || 1, { min: 1, max: 100000, step: 1 })}${field("unit_price", purchase ? "Unit cost" : "Unit price", "number", Number(line.price_cents ?? line.cost_cents ?? (purchase ? p?.cost_cents : p?.price_cents) ?? 0) / 100, { min: 0, max: 100000, step: ".01" })}<button
      type="button"
      data-action="remove-line"
      aria-label="Remove product line"
    >
      ×
    </button>`;
  $("#document-lines").append(div);
  updateTotal();
}
function updateTotal() {
  const total = $$(".document-line", dialog).reduce(
    (s, r) =>
      s +
      Number($("[name=quantity]", r).value || 0) *
        Math.round(Number($("[name=unit_price]", r).value || 0) * 100),
    0,
  );
  if ($("#document-total"))
    $("#document-total").textContent = tr("Total {0}", amount(total));
}
function transition(action, recordId) {
  let payload,
    title,
    text,
    reason = false;
  if (action === "win") {
    payload = {
      type: "opportunity.close",
      id: recordId,
      stage: "Won",
      confirm: true,
    };
    title = "Win this opportunity?";
    text = has("operations")
      ? "The company becomes a customer. One linked draft sales order will be created for you to review and add product lines."
      : "The company becomes a customer. Enable Operations later to create a linked draft sales order.";
  } else if (action === "create-linked-order") {
    payload = { type: "opportunity.order", id: recordId, confirm: true };
    title = "Create a linked draft order?";
    text =
      "One draft sales order will use this opportunity’s existing company record. Review its products and prices before approval.";
  } else if (action === "lose") {
    payload = {
      type: "opportunity.close",
      id: recordId,
      stage: "Lost",
      confirm: true,
    };
    title = "Close this opportunity as lost?";
    text =
      "The opportunity will leave the open pipeline. Its relationship history and follow-ups remain available.";
  } else {
    const [type, status] = action.split("-");
    payload = {
      type: type + ".transition",
      id: recordId,
      status,
      confirm: true,
    };
    title = {
      Draft: "Accept this quotation?",
      Confirmed: "Confirm and reserve stock?",
      Fulfilled: "Record this order as fulfilled?",
      Ordered: "Approve this purchase?",
      Cancelled: "Cancel this document?",
    }[status];
    text = {
      Draft:
        "The quotation becomes a draft sales order. Review it before reserving stock.",
      Confirmed:
        "Available stock will be reserved for all product lines. Confirmation requires sufficient stock for every line.",
      Fulfilled:
        "On-hand stock will be deducted, reservations released, and one operational invoice record created. This cannot be undone by editing the order.",
      Ordered:
        "The purchase becomes approved and ready to receive. This does not send an order to the supplier.",
      Cancelled:
        type === "order"
          ? "Any reservations are released. Fulfilled orders cannot be cancelled."
          : "Outstanding quantities are closed. Goods already received remain in stock.",
    }[status];
    reason = status === "Cancelled";
  }
  formDialog(
    title,
    html`<p class="notice">${text}</p>
      ${reason ? html`<br />${textField("reason", "Reason for cancellation")}` : ""}`,
    async (values) => {
      const result = await cmd({ ...payload, ...values });
      await refresh();
      dialog.close();
      if (result.order_id) {
        history.replaceState(null, "", "#orders");
        navigate("orders");
        detail("orders", result.order_id);
      } else
        detail(
          action.startsWith("purchase")
            ? "purchases"
            : action.startsWith("order")
              ? "orders"
              : "opportunities",
          recordId,
        );
      toast("Change confirmed.");
    },
    { submit: "Confirm" },
  );
}
function receive(recordId) {
  const p = state.data.purchases.find((p) => p.id === recordId),
    ls = state.data.purchase_lines.filter(
      (l) => l.purchase_id === p.id && l.received < l.quantity,
    );
  formDialog(
    `Receive ${p.ref}`,
    html`<div class="notice">
        Record the quantities physically received. Use the supplier’s unique
        delivery reference to prevent duplicate receipts.
      </div>
      <br />${field("delivery_ref", "Supplier delivery reference")}
      <div>
        ${ls
          .map(
            (l) =>
              html`<div class="receipt-line">
                <div>
                  <strong>${esc(productName(l.product_id))}</strong
                  ><small
                    >${l.received} received · ${l.quantity - l.received}
                    remaining</small
                  >
                </div>
                ${field(l.product_id, "Receive now", "number", 0, { min: 0, max: l.quantity - l.received, step: 1 })}
              </div>`,
          )
          .join("")}
      </div>`,
    async (values) => {
      await cmd({
        type: "purchase.receive",
        id: p.id,
        confirm: true,
        delivery_ref: values.delivery_ref,
        lines: ls.map((l) => ({
          product_id: l.product_id,
          quantity: Number(values[l.product_id]),
        })),
      });
      await refresh();
      dialog.close();
      detail("purchases", p.id);
      toast("Receipt recorded. Stock and remaining quantities updated.");
    },
    { submit: "Confirm receipt" },
  );
}
function payment(recordId) {
  const inv = state.data.invoices.find((i) => i.id === recordId),
    open = Number(inv.total_cents) - Number(inv.paid_cents);
  formDialog(
    `Record payment · ${inv.ref}`,
    html`<div class="notice">
        Record a payment already received. This does not transfer money.
        Outstanding balance: <strong>${amount(open)}</strong>.
      </div>
      <br />
      <div class="form-grid">
        ${field("value", "Amount received", "number", open / 100, { min: 0.01, max: open / 100, step: ".01" })}${field("reference", "Bank / payment reference")}
      </div>`,
    async (values) => {
      await cmd({
        type: "invoice.payment",
        id: recordId,
        amount_cents: Math.round(Number(values.value) * 100),
        reference: values.reference,
        confirm: true,
      });
      await refresh();
      dialog.close();
      detail("invoices", recordId);
      toast("Payment recorded.");
    },
    { submit: "Confirm payment record" },
  );
}
function importDialog() {
  importText = "";
  preview = null;
  formDialog(
    "Import companies & contacts",
    html`<p class="notice">
        Import up to 1,000 rows. Companies match by name and contacts by email.
        Existing contacts are skipped; conflicting relationships are reported
        before any write.
      </p>
      <br />
      <p class="subhead">
        <a class="text-button" href="/sample-import.csv" download
          >Download CSV template ↓</a
        >
        · Required columns: company, contact, email
      </p>
      <label
        >Choose a CSV file<input
          type="file"
          id="csv-file"
          accept=".csv,text/csv"
      /></label>
      <div id="import-preview"></div>`,
    async () => {
      if (!preview || preview.errors.length)
        throw new Error(
          "Choose a file and correct all validation errors before importing.",
        );
      const result = await cmd({
        type: "import.commit",
        csv: importText,
        confirm: true,
      });
      await refresh();
      dialog.close();
      toast(
        `${result.created} contacts imported. ${result.skipped} existing contacts skipped.`,
      );
    },
    { submit: "Confirm import", wide: true },
  );
}
function searchDialog() {
  showDialog(
    "Search your workspace",
    html`<input
        id="global-search"
        type="search"
        placeholder="Company, opportunity, product or order…"
        aria-label="Search your workspace"
      />
      <div class="search-results" id="global-results"></div>`,
  );
  $("#global-search").focus();
}
function defaultQuery(route) {
  return {
    q: "",
    status: route === "tasks" ? "Open" : "",
    owner: route === "tasks" ? state.me.user.id : "",
  };
}
function navigate(route) {
  state.route = route;
  state.query = defaultQuery(route);
  state.menu = false;
  render();
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["record-form", "auth-form"].includes(form.id)) return;
  event.preventDefault();
  const submit =
    document.querySelector(`[form="${form.id}"]`) ||
    $("button[type=submit]", form);
  if (submit?.disabled) return;
  const error = $(".form-error", form);
  error.innerHTML = "";
  if (submit) submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  try {
    const values = Object.fromEntries(new FormData(form));
    if (form.id === "record-form") await formSubmit(values, form);
    else {
      const mode = form.dataset.mode,
        body = { ...values };
      if (body.sample) body.sample = true;
      if (["accept", "reset"].includes(mode))
        body.token = location.hash.split("=")[1];
      const result = await api(
        mode === "workspace" ? "/api/workspaces" : `/api/auth/${mode}`,
        body,
      );
      if (mode === "recover") {
        error.innerHTML = html`<div class="notice">
          ${esc(result.message)}
        </div>`;
        return;
      }
      if (mode === "reset") {
        location.hash = "login";
        state.me = null;
        authPage("login");
        toast("Password updated. Sign in with your new password.");
        return;
      }
      if (result.workspace_id) state.wid = result.workspace_id;
      location.hash = "home";
      await start();
      toast(mode === "login" ? "Welcome back." : "Your workspace is ready.");
    }
  } catch (e) {
    error.innerHTML = errorHTML(e);
    error.scrollIntoView({ block: "nearest" });
  } finally {
    if (submit) submit.disabled = false;
    form.removeAttribute("aria-busy");
  }
});
document.addEventListener("click", async (event) => {
  const el = event.target.closest("button,[data-report]");
  if (!el || el.disabled) return;
  try {
    if (el.dataset.taskStatus || el.dataset.taskOwner) {
      if (el.dataset.taskStatus) state.query.status = el.dataset.taskStatus;
      if (el.dataset.taskOwner)
        state.query.owner =
          el.dataset.taskOwner === "mine" ? state.me.user.id : "";
      render();
      return;
    }
    if (el.dataset.action === "clear-filters") {
      state.query = { q: "", status: "", owner: "" };
      render();
      return;
    }
    if (el.dataset.open) return detail(el.dataset.open, el.dataset.id);
    if (el.dataset.new)
      return form(el.dataset.new, null, {
        company: el.dataset.company,
        opportunity: el.dataset.opportunity,
      });
    if (el.dataset.edit) return form(el.dataset.edit, el.dataset.id);
    if (el.dataset.document)
      return documentForm(el.dataset.document, el.dataset.id);
    if (el.dataset.transition)
      return transition(el.dataset.transition, el.dataset.id);
    if (el.dataset.receive) return receive(el.dataset.receive);
    if (el.dataset.payment) return payment(el.dataset.payment);
    if (el.dataset.metric) return metricDetail(el.dataset.metric);
    if (el.dataset.panel)
      return dashboardDetail(el.dataset.panel, Number(el.dataset.group));
    if (el.dataset.period) {
      const now = new Date(),
        to = now.toISOString().slice(0, 10);
      const from =
        el.dataset.period === "month"
          ? to.slice(0, 7) + "-01"
          : el.dataset.period === "year"
            ? to.slice(0, 4) + "-01-01"
            : new Date(now.getTime() - 29 * 86400000)
                .toISOString()
                .slice(0, 10);
      await applyReportPeriod({ from, to });
      return;
    }
    if (el.dataset.report) {
      state.report = el.dataset.report;
      render();
      return;
    }
    if (el.dataset.board !== undefined) {
      state.board = el.dataset.board === "true";
      render();
      return;
    }
    if (el.dataset.complete) {
      el.disabled = true;
      await cmd({ type: "task.complete", id: el.dataset.complete });
      await refresh();
      if (dialog.open) dialog.close();
      toast("Task completed. Your overview is up to date.");
      return;
    }
    if (el.dataset.replenish) {
      el.disabled = true;
      const result = await cmd({
        type: "purchase.replenish",
        product_ids: [el.dataset.replenish],
      });
      await refresh();
      detail("purchases", result.purchases[0].id);
      toast("Replenishment draft prepared.");
      return;
    }
    if (el.dataset.adjust) {
      const recordId = el.dataset.adjust;
      return formDialog(
        "Adjust stock",
        html`<p class="notice">
            Use a signed whole-unit adjustment. Reserved quantities are
            protected. A reason is recorded in the movement history.
          </p>
          <br />
          <div class="form-grid">
            ${field("quantity", "Quantity adjustment", "number", 0, { min: -100000, max: 100000, step: 1 })}${field("reason", "Reason")}
          </div>`,
        async (v) => {
          await cmd({
            type: "stock.adjust",
            id: recordId,
            quantity: Number(v.quantity),
            reason: v.reason,
            confirm: true,
          });
          await refresh();
          detail("products", recordId);
          toast("Stock adjustment recorded.");
        },
        { submit: "Confirm adjustment" },
      );
    }
    if (el.dataset.reverse) {
      const paymentId = el.dataset.reverse;
      return formDialog(
        "Correct this payment?",
        html`<p class="notice">
            This reverses the recorded payment and restores the invoice’s
            outstanding balance. The original payment and reason are retained.
          </p>
          <br />${field("reason", "Correction reason")}`,
        async (v) => {
          const r = await cmd({
            type: "payment.reverse",
            id: paymentId,
            reason: v.reason,
            confirm: true,
          });
          await refresh();
          detail("invoices", r.id);
          toast("Payment reversed.");
        },
        { submit: "Confirm reversal" },
      );
    }
    if (el.dataset.role) {
      const userId = el.dataset.role,
        m = state.data.members.find((m) => m.id === userId);
      return formDialog(
        tr("Change access · {0}", m.name),
        selectField(
          "role",
          "Role",
          [
            ["member", "Member"],
            ["viewer", "Viewer"],
            ["revoked", "Revoke workspace access"],
            ...(state.data.workspace.role === "owner"
              ? [["administrator", "Administrator"]]
              : []),
          ],
          m.role,
        ),
        async (v) => {
          await cmd({
            type: "member.role",
            user_id: userId,
            role: v.role,
            confirm: true,
          });
          await refresh();
          dialog.close();
          toast("Access updated.");
        },
        { submit: "Confirm role change" },
      );
    }
    if (el.dataset.copy) {
      await navigator.clipboard.writeText(el.dataset.copy);
      toast("Invitation link copied.");
      return;
    }
    if (el.dataset.deleteView) {
      await cmd({ type: "view.delete", id: el.dataset.deleteView });
      await refresh();
      toast("Saved view removed.");
      return;
    }
    switch (el.dataset.action) {
      case "close":
        dialog.close();
        break;
      case "menu":
        state.menu = !state.menu;
        render();
        break;
      case "search":
        searchDialog();
        break;
      case "import":
        importDialog();
        break;
      case "save-view":
        form("view");
        break;
      case "export":
        location.href =
          endpoint("export") +
          "?" +
          new URLSearchParams({ resource: state.route, ...state.query });
        break;
      case "backup":
        location.href = endpoint("backup");
        break;
      case "new-workspace":
        authPage("workspace");
        break;
      case "logout":
        await api("/api/logout", {});
        state.me = null;
        state.data = null;
        location.hash = "login";
        authPage("login");
        break;
      case "add-line":
        addLine();
        break;
      case "remove-line":
        el.closest(".document-line").remove();
        updateTotal();
        break;
      case "billing": {
        el.disabled = true;
        const result = await api(endpoint("billing"), {});
        location.href = result.url;
        break;
      }
      case "verify-email":
        await api("/api/verify-email", {});
        toast("Verification email sent. Open its link within one hour.");
        break;
      case "report-period":
        await applyReportPeriod({
          from: $("#report-from").value,
          to: $("#report-to").value,
        });
        break;
      case "retry":
        await start();
        break;
    }
  } catch (e) {
    el.disabled = false;
    showDialog("Unable to complete this action", errorHTML(e), {
      footer: markup('<button data-action="close">Close</button>'),
    });
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "list-search") {
    state.query.q = el.value;
    $("#list-results").innerHTML = listResults(
      state.route,
      filtered(state.route),
    );
  }
  if (el.closest(".document-line")) updateTotal();
  if (el.id === "global-search") {
    const q = el.value.trim().toLowerCase();
    $("#global-results").innerHTML = q
      ? [
          "companies",
          "contacts",
          "opportunities",
          "orders",
          "products",
          "purchases",
          "invoices",
          "tasks",
        ]
          .flatMap((resource) =>
            state.data[resource]
              .filter((r) =>
                [
                  r.name,
                  r.title,
                  r.ref,
                  r.email,
                  r.sku,
                  companyName(r.company_id || r.supplier_id),
                ].some((v) =>
                  String(v || "")
                    .toLowerCase()
                    .includes(q),
                ),
              )
              .map((r) => ({ resource, r })),
          )
          .slice(0, 30)
          .map(({ resource, r }) =>
            openButton(
              resource,
              r.id,
              html`<span>${esc(r.name || r.title || r.ref)}</span
                ><small
                  >${routeNames[resource]}${r.company_id || r.supplier_id ? ` · ${esc(companyName(r.company_id || r.supplier_id))}` : ""}</small
                >`,
              "",
            ),
          )
          .join("") || markup('<div class="empty">No matching records.</div>')
      : "";
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.matches("[data-language]")) {
      const form = $("#auth-form");
      const fields = form
        ? [...form.elements]
            .filter((x) => x.name)
            .map((x) => ({ name: x.name, value: x.value, checked: x.checked }))
        : [];
      const mode = form?.dataset.mode;
      setLanguage(el.value);
      $(".skip").textContent = tr("Skip to content");
      if (state.data) render();
      else {
        authPage(mode || "login");
        for (const field of fields) {
          const input = $("#auth-form").elements.namedItem(field.name);
          if (input) {
            input.value = field.value;
            if (input.type === "checkbox") input.checked = field.checked;
          }
        }
      }
      return;
    }
    if (["company_id", "opportunity_id"].includes(el.name))
      syncTaskCompany(el.name);
    if (el.id === "workspace-select") {
      state.wid = el.value;
      localStorage.setItem("aw-workspace", state.wid);
      state.query = defaultQuery(state.route);
      await refresh();
    }
    if (["status-filter", "owner-filter"].includes(el.id)) {
      state.query[el.id === "status-filter" ? "status" : "owner"] = el.value;
      $("#list-results").innerHTML = listResults(
        state.route,
        filtered(state.route),
      );
    }
    if (el.id === "saved-view" && el.value) {
      state.query = {
        ...state.data.saved_views.find((v) => v.id === el.value).query,
      };
      render();
    }
    if (el.id === "report-template") {
      state.report = el.value;
      render();
    }
    if (el.name === "supplier_id" && $("#document-lines")) {
      $("#document-lines").innerHTML = "";
      addLine();
    }
    if (el.name === "product_id" && el.closest(".document-line")) {
      const p = state.data.products.find((p) => p.id === el.value),
        purchase = $("#record-form").dataset.documentType === "purchase";
      $("[name=unit_price]", el.closest(".document-line")).value =
        (purchase ? p.cost_cents : p.price_cents) / 100;
      updateTotal();
    }
    if (el.id === "csv-file") {
      preview = null;
      const file = el.files[0];
      if (!file) return;
      if (file.size > 1000000)
        throw new Error("Choose a CSV smaller than 1 MB.");
      $("#import-preview").innerHTML = markup(
        '<p class="subhead" aria-busy="true">Validating rows…</p>',
      );
      importText = await file.text();
      preview = await api(endpoint("import-preview"), { csv: importText });
      $("#import-preview").innerHTML = preview.errors.length
        ? html`<br />${errorHTML({ message: "Correct these rows and choose the file again.", details: preview.errors })}`
        : html`<br />
            <div class="notice">
              ${preview.records.length} valid rows. No changes have been made
              yet.
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${preview.records
                    .slice(0, 20)
                    .map(
                      (r) =>
                        html`<tr>
                          <td>${esc(r.company)}</td>
                          <td>${esc(r.contact)}</td>
                          <td>${esc(r.email)}</td>
                          <td>${r.action}</td>
                        </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            ${preview.records.length > 20 ? markup('<p class="subhead">Showing the first 20 rows. All valid rows will be imported.</p>') : ""}`;
    }
  } catch (e) {
    if ($("#import-preview")) $("#import-preview").innerHTML = errorHTML(e);
    else showDialog("Unable to update", errorHTML(e));
  }
});
window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1).split("/")[0];
  if (["login", "signup", "recover"].includes(route) && !state.me)
    return authPage(route);
  if (state.data && routeNames[route]) {
    if (dialog.open) dialog.close();
    navigate(route);
  }
});
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && state.data) {
    e.preventDefault();
    searchDialog();
  }
});
window.addEventListener("online", () => {
  if (state.data)
    refresh().catch(() => toast("Unable to reconnect. Refresh to retry."));
});
$(".skip").textContent = tr("Skip to content");
const hub = createHub({
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
});
const bank = createBank({
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
});
start().catch((e) => {
  $("#app").innerHTML = html`<main id="main" class="content">
    <h1>We couldn’t open your workspace.</h1>
    <br />${errorHTML(e)}<br /><button class="primary" data-action="retry">
      Try again
    </button>
  </main>`;
});
