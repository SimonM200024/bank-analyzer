// Shared, company-neutral Hub definitions. Money is stored in workspace minor units.
const f = (key, label, type = "text", options = {}) => ({
  key,
  label,
  type,
  ...options,
});
const name = f("name", "Name", "text", { required: true });
const date = f("date", "Record date", "date", { required: true });
const owner = f("owner_id", "Owner", "member");
const notes = f("notes", "Notes", "textarea");
const money = (key, label) => f(key, label, "money", { required: true });
const select = (key, label, choices) =>
  f(key, label, "select", { choices, required: true });
export const hubSchemas = {
  costs: {
    singular: "Expense",
    fields: [
      name,
      date,
      f("category", "Category", "text", { required: true }),
      money("amount", "Amount"),
      select("status", "Status", ["Planned", "Paid"]),
      notes,
    ],
  },
  marketing: {
    singular: "Campaign result",
    fields: [
      name,
      date,
      select("channel", "Channel", [
        "Search",
        "Social",
        "Email",
        "Events",
        "Other",
      ]),
      money("spend", "Spend"),
      money("revenue", "Attributed sales"),
      f("leads", "Leads", "number", { required: true }),
      f("conversions", "Conversions", "number", { required: true }),
      notes,
    ],
  },
  service: {
    singular: "Service request",
    fields: [
      name,
      date,
      owner,
      f("company_id", "Company", "company"),
      select("priority", "Priority", ["Low", "Normal", "High", "Urgent"]),
      select("status", "Status", ["Open", "In progress", "Resolved"]),
      f("due", "Due date", "date", { required: true }),
      notes,
    ],
  },
  projects: {
    singular: "Project",
    fields: [
      name,
      date,
      owner,
      select("status", "Status", [
        "Planned",
        "In progress",
        "On hold",
        "Completed",
      ]),
      f("due", "Due date", "date", { required: true }),
      f("progress", "Progress (%)", "number", { max: 100, required: true }),
      money("budget", "Budget"),
      money("spent", "Spent"),
      notes,
    ],
  },
  subscriptions: {
    singular: "Subscription",
    fields: [
      name,
      date,
      f("vendor", "Vendor", "text", { required: true }),
      money("amount", "Recurring cost"),
      select("cycle", "Billing cycle", ["Monthly", "Annual"]),
      select("status", "Status", ["Active", "Cancelled"]),
      f("due", "Renewal date", "date", { required: true }),
      owner,
      notes,
    ],
  },
  scenario: {
    singular: "Pricing scenario",
    fields: [
      name,
      date,
      money("price", "Unit price"),
      money("cost", "Unit cost"),
      f("units", "Expected units", "number", { required: true }),
      f("discount", "Discount (%)", "number", { max: 100, required: true }),
      notes,
    ],
  },
};
const module = (id, name, category, description, source, view, extra = {}) => ({
  id,
  name,
  category,
  description,
  source,
  views: ["Overview", view, "Records"],
  ...extra,
});
export const hubModules = [
  module(
    "commercial",
    "Business performance",
    "Finance",
    "Fulfilled sales, order size and your customer mix.",
    "orders",
    "By company",
    { flow: true, requires: "operations" },
  ),
  module(
    "sales",
    "Sales pipeline",
    "Sales",
    "Open opportunities, stage mix and ownership.",
    "opportunities",
    "By owner",
    { requires: "crm" },
  ),
  module(
    "customers",
    "Customers",
    "Sales",
    "Account relationships, open deals and outstanding balances.",
    "companies",
    "By location",
  ),
  module(
    "orders",
    "Orders & fulfillment",
    "Operations",
    "Draft approvals, confirmed orders and delivery priorities.",
    "orders",
    "By status",
    { requires: "operations" },
  ),
  module(
    "inventory",
    "Inventory health",
    "Operations",
    "Available stock, reservations and replenishment risks.",
    "products",
    "By supplier",
    { requires: "operations" },
  ),
  module(
    "purchasing",
    "Purchasing",
    "Purchasing",
    "Open purchase orders, expected deliveries and remaining value.",
    "purchases",
    "By supplier",
    { requires: "operations" },
  ),
  module(
    "suppliers",
    "Supplier management",
    "Purchasing",
    "Supplier relationships, assortment and open purchasing commitments.",
    "companies",
    "By location",
    { requires: "operations" },
  ),
  module(
    "payments",
    "Cash & receivables",
    "Finance",
    "Outstanding balances, overdue invoices and collection priorities.",
    "invoices",
    "By company",
    { requires: "operations" },
  ),
  module(
    "costs",
    "Costs & expenses",
    "Finance",
    "Record planned and paid expenses and see where money goes.",
    "hub_records",
    "By category",
    { flow: true, entry: true },
  ),
  module(
    "marketing",
    "Marketing performance",
    "Marketing",
    "Track campaign spend, leads and attributed sales.",
    "hub_records",
    "By channel",
    { flow: true, entry: true },
  ),
  module(
    "service",
    "Customer service",
    "Operations",
    "Track service requests, priorities, owners and due dates.",
    "hub_records",
    "By owner",
    { entry: true },
  ),
  module(
    "projects",
    "Projects",
    "Team",
    "Monitor delivery dates, progress and project budgets.",
    "hub_records",
    "By owner",
    { entry: true },
  ),
  module(
    "team",
    "Team workload",
    "Team",
    "See open and overdue tasks across your workspace members.",
    "tasks",
    "By owner",
  ),
  module(
    "subscriptions",
    "Subscriptions",
    "Finance",
    "Track recurring costs, vendors and upcoming renewals.",
    "hub_records",
    "By vendor",
    { entry: true },
  ),
  module(
    "scenario",
    "Scenario planner",
    "Planning",
    "Compare prices, costs and discounts before committing.",
    "hub_records",
    "By scenario",
    { entry: true },
  ),
];
export const hubModule = (id) => hubModules.find((m) => m.id === id);
export const hubDay = (value) =>
  String(value instanceof Date ? value.toISOString() : value || "").slice(
    0,
    10,
  );
const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
const metric = (label, value, kind = "count") => ({ label, value, kind });
const col = (key, label, kind = "text") => ({ key, label, kind });
export function hubData(
  data,
  id,
  filters = {},
  today = new Date().toISOString().slice(0, 10),
) {
  const m = hubModule(id);
  if (!m) throw new Error("Unknown Hub module.");
  const available = !m.requires || data.workspace.modules.includes(m.requires);
  const co = new Map(data.companies.map((c) => [c.id, c]));
  const people = new Map(data.members.map((p) => [p.id, p.name]));
  const company = (id) => co.get(id)?.name || "—";
  const person = (id) => people.get(id) || "Unassigned";
  const orderValue = (id) =>
    data.order_lines
      .filter((l) => l.order_id === id)
      .reduce((n, l) => n + l.quantity * l.price_cents, 0);
  const purchaseValue = (id) =>
    data.purchase_lines
      .filter((l) => l.purchase_id === id)
      .reduce((n, l) => n + (l.quantity - l.received) * l.cost_cents, 0);
  const balance = (i) => Number(i.total_cents) - Number(i.paid_cents);
  let rows = [],
    metrics = [],
    valueLabel = "Value",
    valueKind = "money",
    note =
      "Current workspace records. Date filters do not apply to this snapshot.",
    columns = [];
  const row = (r, title, group, status, value, when, extra = {}) => ({
    id: r.id,
    title,
    group,
    status,
    value,
    date: hubDay(when),
    resource: m.source,
    ...extra,
  });
  if (available)
    switch (id) {
      case "commercial":
        rows = data.orders
          .filter((o) => o.status === "Fulfilled")
          .map((o) =>
            row(
              o,
              o.ref,
              company(o.company_id),
              o.status,
              orderValue(o.id),
              o.fulfilled_at,
            ),
          );
        break;
      case "sales":
        rows = data.opportunities.map((o) =>
          row(
            o,
            o.name,
            person(o.owner_id),
            o.stage,
            Number(o.value_cents),
            o.close_date,
            { company: company(o.company_id) },
          ),
        );
        break;
      case "customers":
        rows = data.companies
          .filter((c) => c.customer)
          .map((c) =>
            row(
              c,
              c.name,
              c.location || "Unspecified",
              "Customer",
              data.invoices
                .filter((i) => i.company_id === c.id)
                .reduce((n, i) => n + balance(i), 0),
              c.created_at,
              {
                count: data.opportunities.filter(
                  (o) =>
                    o.company_id === c.id && !["Won", "Lost"].includes(o.stage),
                ).length,
              },
            ),
          );
        valueLabel = "Open receivables";
        break;
      case "orders":
        rows = data.orders
          .filter((o) => !["Fulfilled", "Cancelled"].includes(o.status))
          .map((o) =>
            row(o, o.ref, o.status, o.status, orderValue(o.id), o.due_date, {
              company: company(o.company_id),
            }),
          );
        break;
      case "inventory":
        rows = data.products.map((p) =>
          row(
            p,
            p.name,
            company(p.supplier_id),
            p.stock - p.reserved <= p.reorder_point ? "Low stock" : "Available",
            p.stock - p.reserved,
            null,
            {
              stock: Number(p.stock),
              reserved: Number(p.reserved),
              reorder: Number(p.reorder_point),
              cost: p.stock * p.cost_cents,
            },
          ),
        );
        valueLabel = "Available units";
        valueKind = "count";
        break;
      case "purchasing":
        rows = data.purchases
          .filter((p) =>
            ["Draft", "Ordered", "Partially received"].includes(p.status),
          )
          .map((p) =>
            row(
              p,
              p.ref,
              company(p.supplier_id),
              p.status,
              purchaseValue(p.id),
              p.due_date,
            ),
          );
        valueLabel = "Remaining value";
        break;
      case "suppliers":
        rows = data.companies
          .filter((c) => c.supplier)
          .map((c) =>
            row(
              c,
              c.name,
              c.location || "Unspecified",
              "Supplier",
              data.purchases
                .filter(
                  (p) =>
                    p.supplier_id === c.id &&
                    ["Ordered", "Partially received"].includes(p.status),
                )
                .reduce((n, p) => n + purchaseValue(p.id), 0),
              c.created_at,
              {
                count: data.products.filter((p) => p.supplier_id === c.id)
                  .length,
              },
            ),
          );
        valueLabel = "Outstanding purchases";
        break;
      case "payments":
        rows = data.invoices
          .filter((i) => balance(i) > 0)
          .map((i) =>
            row(
              i,
              i.ref,
              company(i.company_id),
              hubDay(i.due_date) < today ? "Overdue" : "Not overdue",
              balance(i),
              i.due_date,
            ),
          );
        valueLabel = "Open balance";
        break;
      case "team":
        rows = data.tasks
          .filter((t) => !t.completed_at)
          .map((t) =>
            row(
              t,
              t.title,
              person(t.owner_id),
              hubDay(t.due_date) < today
                ? "Overdue"
                : hubDay(t.due_date) === today
                  ? "Today"
                  : "Upcoming",
              1,
              t.due_date,
            ),
          );
        valueKind = "count";
        valueLabel = "Open tasks";
        break;
      default:
        rows = (data.hub_records || [])
          .filter(
            (r) =>
              r.module === id &&
              Boolean(r.archived) === Boolean(filters.archived),
          )
          .map((r) => {
            const d = r.data;
            let group = d.category || d.channel || person(d.owner_id),
              value = d.amount || 0;
            if (id === "marketing") value = d.spend;
            if (id === "service") value = 1;
            if (id === "projects") value = d.budget;
            if (id === "subscriptions") {
              group = d.vendor;
              value =
                d.status === "Active"
                  ? d.cycle === "Annual"
                    ? d.amount / 12
                    : d.amount
                  : 0;
            }
            if (id === "scenario") {
              group = d.name;
              value = Math.round(
                (d.price * (1 - d.discount / 100) - d.cost) * d.units,
              );
            }
            return row(
              r,
              d.name,
              group,
              d.status || "Recorded",
              value,
              d.due || d.date,
              {
                ...d,
                recordDate: d.date,
                revision: r.revision,
                archived: r.archived,
                value,
                group,
                title: d.name,
                date: d.due || d.date,
              },
            );
          });
    }
  if (m.flow) {
    rows = rows.filter(
      (r) =>
        (!filters.from || (r.recordDate || r.date) >= filters.from) &&
        (!filters.to || (r.recordDate || r.date) <= filters.to),
    );
    note =
      id === "commercial"
        ? "Fulfilled order values exclude tax. This is operational sales reporting, not an accounting ledger."
        : "Manually recorded results in the selected period. These figures are not automatically synchronized with external services.";
  }
  if (filters.q) {
    const q = filters.q.toLocaleLowerCase();
    rows = rows.filter((r) =>
      [r.title, r.group, r.status, r.company, r.priority].some((v) =>
        String(v || "")
          .toLocaleLowerCase()
          .includes(q),
      ),
    );
  }
  const statuses = [
    ...new Set([
      ...rows.map((r) => r.status),
      ...(filters.status ? [filters.status] : []),
    ]),
  ].sort();
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  rows.sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.title.localeCompare(b.title),
  );
  const n = rows.length,
    total = sum(rows, "value");
  switch (id) {
    case "commercial":
      metrics = [
        metric("Fulfilled order value", total, "money"),
        metric("Fulfilled orders", n),
        metric("Average order value", n ? total / n : 0, "money"),
        metric("Buying companies", new Set(rows.map((r) => r.group)).size),
      ];
      break;
    case "sales": {
      const open = rows.filter((r) => !["Won", "Lost"].includes(r.status));
      metrics = [
        metric("Open pipeline", sum(open, "value"), "money"),
        metric("Open opportunities", open.length),
        metric(
          "Won opportunities",
          rows.filter((r) => r.status === "Won").length,
        ),
        metric(
          "Lost opportunities",
          rows.filter((r) => r.status === "Lost").length,
        ),
      ];
      break;
    }
    case "customers":
      metrics = [
        metric("Customers", n),
        metric("Open receivables", total, "money"),
        metric("Open opportunities", sum(rows, "count")),
      ];
      break;
    case "orders":
      metrics = [
        metric("Open orders", n),
        metric(
          "Orders to fulfill",
          rows.filter((r) => r.status === "Confirmed").length,
        ),
        metric("Open order value", total, "money"),
        metric("Past delivery date", rows.filter((r) => r.date < today).length),
      ];
      break;
    case "inventory":
      metrics = [
        metric("Products", n),
        metric("Available units", total),
        metric(
          "Products to replenish",
          rows.filter((r) => r.status === "Low stock").length,
        ),
        metric("Stock at standard cost", sum(rows, "cost"), "money"),
      ];
      break;
    case "purchasing":
      metrics = [
        metric("Open purchase orders", n),
        metric(
          "Outstanding purchases",
          sum(
            rows.filter((r) => r.status !== "Draft"),
            "value",
          ),
          "money",
        ),
        metric(
          "Draft value",
          sum(
            rows.filter((r) => r.status === "Draft"),
            "value",
          ),
          "money",
        ),
        metric(
          "Past expected date",
          rows.filter((r) => r.status !== "Draft" && r.date < today).length,
        ),
      ];
      break;
    case "suppliers":
      metrics = [
        metric("Suppliers", n),
        metric("Products", sum(rows, "count")),
        metric("Outstanding purchases", total, "money"),
      ];
      break;
    case "payments":
      metrics = [
        metric("Open receivables", total, "money"),
        metric(
          "Overdue receivables",
          sum(
            rows.filter((r) => r.status === "Overdue"),
            "value",
          ),
          "money",
        ),
        metric("Unpaid invoices", n),
      ];
      break;
    case "costs":
      valueLabel = "Amount";
      metrics = [
        metric("Recorded expenses", total, "money"),
        metric(
          "Paid expenses",
          sum(
            rows.filter((r) => r.status === "Paid"),
            "value",
          ),
          "money",
        ),
        metric(
          "Planned expenses",
          sum(
            rows.filter((r) => r.status === "Planned"),
            "value",
          ),
          "money",
        ),
      ];
      break;
    case "marketing":
      valueLabel = "Spend";
      metrics = [
        metric("Spend", sum(rows, "spend"), "money"),
        metric("Attributed sales", sum(rows, "revenue"), "money"),
        metric("Leads", sum(rows, "leads")),
        metric(
          "ROAS",
          sum(rows, "spend") ? sum(rows, "revenue") / sum(rows, "spend") : null,
          "ratio",
        ),
      ];
      break;
    case "service":
      valueLabel = "Requests";
      valueKind = "count";
      metrics = [
        metric(
          "Open requests",
          rows.filter((r) => r.status !== "Resolved").length,
        ),
        metric(
          "Overdue requests",
          rows.filter((r) => r.status !== "Resolved" && r.date < today).length,
        ),
        metric(
          "Resolved requests",
          rows.filter((r) => r.status === "Resolved").length,
        ),
        metric(
          "Urgent requests",
          rows.filter((r) => r.status !== "Resolved" && r.priority === "Urgent")
            .length,
        ),
      ];
      break;
    case "projects":
      valueLabel = "Budget";
      metrics = [
        metric(
          "Active projects",
          rows.filter((r) => !["Completed", "On hold"].includes(r.status))
            .length,
        ),
        metric("Budget", sum(rows, "budget"), "money"),
        metric("Spent", sum(rows, "spent"), "money"),
        metric(
          "Overdue projects",
          rows.filter((r) => r.status !== "Completed" && r.date < today).length,
        ),
      ];
      break;
    case "team":
      metrics = [
        metric("Open tasks", n),
        metric(
          "Overdue follow-ups",
          rows.filter((r) => r.status === "Overdue").length,
        ),
        metric("Assigned owners", new Set(rows.map((r) => r.group)).size),
      ];
      break;
    case "subscriptions":
      valueLabel = "Monthly equivalent";
      metrics = [
        metric(
          "Active subscriptions",
          rows.filter((r) => r.status === "Active").length,
        ),
        metric("Monthly equivalent", total, "money"),
        metric("Annual equivalent", total * 12, "money"),
        metric(
          "Renewals within 30 days",
          rows.filter(
            (r) =>
              r.status === "Active" &&
              r.date >= today &&
              r.date <=
                new Date(Date.parse(today) + 30 * 86400000)
                  .toISOString()
                  .slice(0, 10),
          ).length,
        ),
      ];
      note =
        "Monthly and annual equivalents use active subscriptions. Annual costs are divided by 12; these are estimates, not payments.";
      break;
    case "scenario":
      valueLabel = "Expected contribution";
      metrics = [
        metric("Saved scenarios", n),
        metric(
          "Highest contribution",
          n ? Math.max(...rows.map((r) => r.value)) : null,
          "money",
        ),
        metric(
          "Lowest contribution",
          n ? Math.min(...rows.map((r) => r.value)) : null,
          "money",
        ),
      ];
      note =
        "Independent scenarios: (unit price × (1 − discount / 100) − unit cost) × expected units. Estimates exclude tax and overhead. Scenarios are alternatives and their contributions are not added together.";
      break;
  }
  const buckets = new Map();
  for (const r of rows) {
    let key =
      filters.view === "1"
        ? r.group
        : m.flow
          ? r.recordDate || r.date
          : r.status;
    if (id === "scenario") key = r.id;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const groups = [...buckets]
    .map(([label, records]) => ({
      label: id === "scenario" ? records[0].title : label,
      rows: records,
      value: sum(records, "value"),
    }))
    .sort((a, b) => b.value - a.value);
  columns = [
    col("title", "Name"),
    col(
      "group",
      m.views[1].replace("By ", "").replace(/^./, (x) => x.toUpperCase()),
    ),
    col("status", "Status"),
    col("date", m.flow ? "Record date" : "Date", "date"),
    col("value", valueLabel, valueKind),
  ];
  if (id === "inventory")
    columns = [
      col("title", "Product"),
      col("group", "Supplier"),
      col("status", "Status"),
      col("stock", "On hand", "count"),
      col("reserved", "Reserved", "count"),
      col("value", "Available units", "count"),
      col("reorder", "Reorder point", "count"),
    ];
  if (id === "marketing")
    columns = [
      col("title", "Campaign"),
      col("date", "Record date", "date"),
      col("group", "Channel"),
      col("spend", "Spend", "money"),
      col("revenue", "Attributed sales", "money"),
      col("leads", "Leads", "count"),
      col("conversions", "Conversions", "count"),
    ];
  if (id === "projects")
    columns = [
      col("title", "Project"),
      col("group", "Owner"),
      col("status", "Status"),
      col("date", "Due date", "date"),
      col("progress", "Progress (%)", "count"),
      col("budget", "Budget", "money"),
      col("spent", "Spent", "money"),
    ];
  if (id === "scenario")
    columns = [
      col("title", "Pricing scenario"),
      col("price", "Unit price", "money"),
      col("cost", "Unit cost", "money"),
      col("discount", "Discount (%)", "count"),
      col("units", "Expected units", "count"),
      col("value", "Expected contribution", "money"),
    ];
  if (id === "service")
    columns = [
      col("title", "Service request"),
      col("group", "Owner"),
      col("priority", "Priority"),
      col("status", "Status"),
      col("date", "Due date", "date"),
    ];
  return {
    module: m,
    available,
    rows,
    metrics,
    groups,
    statuses,
    columns,
    note,
    valueKind,
    valueLabel,
  };
}
