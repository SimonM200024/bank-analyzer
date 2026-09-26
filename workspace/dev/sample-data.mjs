// Fictional workspace snapshot used by the local mock API and the tests.
export function sampleData() {
  const members = [
    { id: "u1", name: "Simon Example", email: "owner@example.test", role: "owner", active: true },
    { id: "u2", name: "Ana Example", email: "ana@example.test", role: "member", active: true },
  ];
  const companies = [
    { id: "c1", name: "Willow Trading d.o.o.", customer: true, supplier: false, location: "Ljubljana", owner_id: "u1", created_at: "2026-05-02" },
    { id: "c2", name: "Northwind Foods", customer: true, supplier: false, location: "Maribor", owner_id: "u2", created_at: "2026-06-11" },
    { id: "c3", name: "Harbour Supply d.o.o.", customer: false, supplier: true, location: "Koper", owner_id: "u1", created_at: "2026-04-20" },
    { id: "c4", name: "Alpine Studio", customer: true, supplier: false, location: "Kranj", owner_id: "u2", created_at: "2026-07-01" },
  ];
  const invoices = [
    { id: "i1", ref: "INV-1001", company_id: "c1", order_id: "o1", total_cents: 125000, paid_cents: 0, due_date: "2026-09-10", created_at: "2026-08-27" },
    { id: "i2", ref: "INV-1002", company_id: "c2", order_id: "o2", total_cents: 90000, paid_cents: 0, due_date: "2026-09-05", created_at: "2026-08-20" },
    { id: "i3", ref: "INV-1003", company_id: "c4", order_id: "o3", total_cents: 42000, paid_cents: 0, due_date: "2026-10-15", created_at: "2026-09-15" },
  ];
  const orders = invoices.map((i) => ({
    id: i.order_id,
    ref: "SO-" + i.ref.slice(4),
    company_id: i.company_id,
    status: "Fulfilled",
    due_date: i.due_date,
    fulfilled_at: i.created_at,
  }));
  return {
    workspace: {
      id: "w1",
      name: "Example d.o.o.",
      currency: "EUR",
      country: "SI",
      role: "owner",
      sample: true,
      modules: ["crm", "operations", "hub"],
      stages: ["Lead", "Qualified", "Proposal", "Won", "Lost"],
    },
    members,
    companies,
    contacts: [],
    opportunities: [],
    tasks: [],
    notes: [],
    orders,
    order_lines: [],
    products: [],
    purchases: [],
    purchase_lines: [],
    receipts: [],
    stock_movements: [],
    invoices,
    payments: [],
    hub_records: [
      {
        id: "h1",
        module: "costs",
        revision: 1,
        archived: false,
        data: { name: "Office rent September", date: "2026-09-10", category: "Rent & facilities", amount: 30000, status: "Planned", notes: "" },
      },
    ],
    saved_views: [],
    audit_events: [],
    invitations: [],
  };
}
