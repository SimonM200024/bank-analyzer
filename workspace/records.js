const timestamp = (value) =>
  value instanceof Date ? value.toISOString() : String(value || "");
const day = (value) => timestamp(value).slice(0, 10);

export function taskMatches(task, status, today) {
  if (!status) return true;
  if (status === "Completed") return !!task.completed_at;
  if (task.completed_at) return false;
  const due = day(task.due_date);
  if (status === "Overdue") return !!due && due < today;
  if (status === "Today") return due === today;
  if (status === "Upcoming") return due > today;
  return true;
}

export function taskOpportunities(opportunities, companyId) {
  return opportunities.filter((o) => !companyId || o.company_id === companyId);
}

export function selectRecords(
  data,
  resource,
  params = {},
  today = new Date().toISOString().slice(0, 10),
) {
  const q = String(params.q || "")
    .trim()
    .toLowerCase();
  const status = String(params.status || ""),
    owner = String(params.owner || "");
  const companies = new Map(data.companies.map((c) => [c.id, c.name]));
  const rows = (data[resource] || []).filter((r) => {
    if (
      q &&
      ![
        r.name,
        r.ref,
        r.title,
        r.email,
        r.sku,
        r.body,
        r.action,
        companies.get(r.company_id || r.supplier_id),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(q),
      )
    )
      return false;
    if (owner && r.owner_id !== owner) return false;
    if (!status) return true;
    if (resource === "tasks") return taskMatches(r, status, today);
    if (resource === "products" && status === "Low stock")
      return r.stock - r.reserved <= r.reorder_point;
    if (resource === "companies")
      return status === "Customer"
        ? r.customer
        : status === "Supplier"
          ? r.supplier
          : !r.customer && !r.supplier;
    if (resource === "invoices")
      return status === "Paid"
        ? Number(r.total_cents) === Number(r.paid_cents)
        : Number(r.paid_cents) < Number(r.total_cents) &&
            (status !== "Overdue" || day(r.due_date) < today);
    return (r.stage || r.status) === status;
  });
  return rows.sort((a, b) => {
    if (resource === "tasks") {
      const priority =
        Number(!!a.completed_at) - Number(!!b.completed_at) ||
        (day(a.due_date) || "9999").localeCompare(day(b.due_date) || "9999");
      if (priority) return priority;
    }
    return (
      timestamp(b.created_at).localeCompare(timestamp(a.created_at)) ||
      String(a.name || a.title || "").localeCompare(
        String(b.name || b.title || ""),
      )
    );
  });
}
