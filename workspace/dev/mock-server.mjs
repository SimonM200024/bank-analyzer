// Local stand-in for the Cloud Run API so the front end can be run and tested offline.
// It implements only the endpoints and commands the pages use, against in-memory sample data.
// Usage: node dev/mock-server.mjs [port]   then open http://localhost:8787/app#bank
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { hubSchemas } from "../hub-model.js";
import { sampleData } from "./sample-data.mjs";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.argv[2] || process.env.PORT || 8787);
let data = sampleData();
const me = {
  user: { id: "u1", name: "Simon Example", email: "owner@example.test" },
  workspaces: [{ id: "w1", name: data.workspace.name, role: "owner", sample: true }],
};
const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html", ".csv": "text/csv", ".xml": "application/xml" };
const now = () => new Date().toISOString();
const fail = (status, error) => Object.assign(new Error(error), { status });

function reports(from, to) {
  const open = data.invoices.reduce((n, i) => n + i.total_cents - i.paid_cents, 0);
  const overdue = data.invoices.filter((i) => i.paid_cents < i.total_cents && i.due_date < now().slice(0, 10));
  const m = (label, value, kind, source, definition) => ({ label, value, kind, source, definition, period: "Today", from, to });
  return {
    from,
    to,
    metrics: {
      pipeline: m("Open pipeline", 0, "money", "opportunities", "Open opportunity value."),
      orders: m("Open orders", data.orders.filter((o) => o.status !== "Fulfilled").length, "count", "orders", "Orders not yet fulfilled."),
      receivables: m("Open receivables", open, "money", "invoices", "Invoice totals less recorded payments."),
      overdue: m("Overdue receivables", overdue.reduce((n, i) => n + i.total_cents - i.paid_cents, 0), "money", "invoices", "Open balances past their due date."),
      approvals: m("Draft orders", 0, "count", "orders", "Draft orders."),
      low: m("Low stock", 0, "count", "products", "Products at or below reorder point."),
    },
    panels: {},
    templates: { business: { name: "Business overview", description: "Mock data.", keys: ["receivables", "overdue"], panels: [] } },
  };
}

function command(body) {
  const role = data.workspace.role;
  const audit = (action) => data.audit_events.unshift({ id: randomUUID(), action, actor_id: me.user.id, created_at: now() });
  switch (body.type) {
    case "invoice.payment": {
      if (!["owner", "administrator"].includes(role)) throw fail(403, "Only an owner or administrator can record payments.");
      const inv = data.invoices.find((i) => i.id === body.id);
      if (!inv) throw fail(404, "Invoice record not found.");
      const open = inv.total_cents - inv.paid_cents;
      if (!Number.isInteger(body.amount_cents) || body.amount_cents <= 0 || body.amount_cents > open) throw fail(400, "Payment must be between 0.01 and the outstanding balance.");
      if (!String(body.reference || "").trim() || body.reference.length > 200) throw fail(400, "Enter a bank or payment reference.");
      const p = { id: randomUUID(), invoice_id: inv.id, amount_cents: body.amount_cents, reference: body.reference, created_at: now() };
      data.payments.push(p);
      inv.paid_cents += body.amount_cents;
      audit("invoice.payment");
      return { id: inv.id, payment_id: p.id };
    }
    case "payment.reverse": {
      const p = data.payments.find((x) => x.id === body.id && !x.reversed_at);
      if (!p) throw fail(404, "Payment not found.");
      p.reversed_at = now();
      p.reversal_reason = body.reason;
      data.invoices.find((i) => i.id === p.invoice_id).paid_cents -= p.amount_cents;
      audit("payment.reverse");
      return { id: p.invoice_id };
    }
    case "hub.save": {
      if (role === "viewer") throw fail(403, "Viewers cannot change records.");
      const schema = hubSchemas[body.module];
      if (!schema) throw fail(400, "Unknown Hub module.");
      const clean = {};
      for (const f of schema.fields) {
        const v = body.data?.[f.key];
        if (f.required && (v === undefined || v === "")) throw fail(400, `${f.label} is required.`);
        if (f.type === "select" && !f.choices.includes(v)) throw fail(400, `${f.label} is not valid.`);
        if (["money", "number"].includes(f.type) && (!Number.isFinite(v) || v < 0)) throw fail(400, `${f.label} must be a positive number.`);
        if (f.type === "textarea" && String(v || "").length > 3000) throw fail(400, `${f.label} is too long.`);
        clean[f.key] = v ?? "";
      }
      if (body.id) {
        const r = data.hub_records.find((x) => x.id === body.id && x.module === body.module);
        if (!r) throw fail(404, "Hub record not found.");
        if (r.revision !== body.revision) throw fail(409, "This record changed. Reload and try again.");
        r.data = clean;
        r.revision++;
        audit("hub.save");
        return { id: r.id };
      }
      const r = { id: randomUUID(), module: body.module, revision: 1, archived: false, data: clean };
      data.hub_records.push(r);
      audit("hub.save");
      return { id: r.id };
    }
    case "hub.archive": {
      const r = data.hub_records.find((x) => x.id === body.id);
      if (!r) throw fail(404, "Hub record not found.");
      r.archived = !!body.archived;
      r.revision++;
      return { id: r.id };
    }
    default:
      throw fail(400, `The mock server does not implement ${body.type}.`);
  }
}

const seen = new Map();
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (url.pathname.startsWith("/api/")) {
      let body;
      if (req.method === "POST") {
        let raw = "";
        for await (const c of req) raw += c;
        body = raw ? JSON.parse(raw) : {};
      }
      const p = url.pathname;
      if (p === "/api/config") return send(200, { environment: "local-mock", mailConfigured: false, billingConfigured: false, supportEmail: null, productionReady: false });
      if (p === "/api/me") return send(200, me);
      if (p === "/api/logout") return send(200, {});
      if (p === "/api/dev/reset") {
        data = sampleData();
        return send(200, { ok: true });
      }
      if (p === "/api/dev/role") {
        data.workspace.role = body.role;
        return send(200, { ok: true });
      }
      if (p === "/api/w/w1/snapshot") return send(200, data);
      if (p === "/api/w/w1/reports") return send(200, reports(url.searchParams.get("from"), url.searchParams.get("to")));
      if (p === "/api/w/w1/command") {
        const key = req.headers["idempotency-key"];
        if (key && seen.has(key)) return send(200, seen.get(key));
        const result = command(body);
        if (key) seen.set(key, result);
        return send(200, result);
      }
      return send(404, { error: "Not found." });
    }
    let file = url.pathname === "/" ? "/index.html" : url.pathname === "/app" ? "/app.html" : url.pathname;
    file = normalize(join(root, file));
    if (!file.startsWith(root)) throw fail(404, "Not found.");
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": (types[extname(file)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
    res.end(content);
  } catch (e) {
    send(e.status || (e.code === "ENOENT" ? 404 : 500), { error: e.code === "ENOENT" ? "Not found." : e.message });
  }
}).listen(port, () => console.log(`Mock Adrial Workspace on http://localhost:${port}/app#home`));
