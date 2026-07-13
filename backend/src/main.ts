import "@backend/lib/load-env";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "path";
import { onError } from "@backend/lib/http";
import { auth } from "@backend/routes/auth";
import { orders } from "@backend/routes/orders";
import { dashboard } from "@backend/routes/dashboard";
import { clients } from "@backend/routes/clients";
import { accounts } from "@backend/routes/accounts";
import { drivers } from "@backend/routes/drivers";
import { vehicles } from "@backend/routes/vehicles";
import { jobs } from "@backend/routes/jobs";
import { trips } from "@backend/routes/trips";
import { dispatch } from "@backend/routes/dispatch";
import { reports } from "@backend/routes/reports";
import { ledger } from "@backend/routes/ledger";
import { payables } from "@backend/routes/payables";
import { receivables } from "@backend/routes/receivables";
import { vendors } from "@backend/routes/vendors";
import { customers } from "@backend/routes/customers";
import { collections } from "@backend/routes/collections";
import { bank } from "@backend/routes/bank";
import { budgets } from "@backend/routes/budgets";
import { fx } from "@backend/routes/fx";
import { consolidation } from "@backend/routes/consolidation";
import { tax } from "@backend/routes/tax";
import { payments } from "@backend/routes/payments";
import { compliance, fuel } from "@backend/routes/compliance";
import { tracking, waypoints } from "@backend/routes/tracking";
import { activity } from "@backend/routes/activity";
import { notifications } from "@backend/routes/notifications";
import { users } from "@backend/routes/users";
import { exports } from "@backend/routes/exports";
import { uploads, uploadDir } from "@backend/routes/uploads";
import { lookups } from "@backend/routes/lookups";
import { driver } from "@backend/routes/driver";
import { inventory } from "@backend/routes/inventory";
import { procurement } from "@backend/routes/procurement";
import { payroll } from "@backend/routes/payroll";
import { warehouses } from "@backend/routes/warehouses";
import { expenses } from "@backend/routes/expenses";
import { assets } from "@backend/routes/assets";
import { serviceOrders } from "@backend/routes/service-orders";
import { hr } from "@backend/routes/hr";
import { attendance } from "@backend/routes/attendance";
import { companies } from "@backend/routes/companies";
import { operationalKpi } from "@backend/routes/operational-kpi";
import { sales } from "@backend/routes/sales";
import { projects } from "@backend/routes/projects";
import { planning } from "@backend/routes/planning";
import { pos } from "@backend/routes/pos";

/**
 * FleetERP standalone API (Hono). Deploys independently from the web app and
 * owns all DB access; the frontend calls it over HTTP with a JWT bearer token.
 *
 * All routes are mounted under /api to mirror the original monolith paths, so
 * the frontend's API client only needs a base-URL change (NEXT_PUBLIC_API_URL).
 */
const app = new Hono();

app.use(
  "*",
  cors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim()),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Data-Area"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

// Proof-of-delivery images written by the uploads route are served statically.
app.use(
  "/uploads/*",
  serveStatic({
    root: path.relative(process.cwd(), uploadDir()) || ".",
    rewriteRequestPath: (p) => p.replace(/^\/uploads/, ""),
  }),
);

// ---- Feature routes ----
app.route("/api/auth", auth);
app.route("/api/dashboard", dashboard);
app.route("/api/orders", orders);
app.route("/api/trips", trips);
app.route("/api/dispatch", dispatch);
app.route("/api/jobs", jobs);
app.route("/api/clients", clients);
app.route("/api/drivers", drivers);
app.route("/api/vehicles", vehicles);
app.route("/api/reports", reports);
app.route("/api/accounts", accounts);
app.route("/api/ledger", ledger);
app.route("/api/vendors", vendors);
app.route("/api/payables", payables);
app.route("/api/customers", customers);
app.route("/api/receivables", receivables);
app.route("/api/collections", collections);
app.route("/api/bank", bank);
app.route("/api/budgets", budgets);
app.route("/api/fx", fx);
app.route("/api/consolidation", consolidation);
app.route("/api/tax", tax);
app.route("/api/payments", payments);
app.route("/api/compliance", compliance);
app.route("/api/fuel", fuel);
app.route("/api/tracking", tracking);
app.route("/api/waypoints", waypoints);
app.route("/api/activity", activity);
app.route("/api/notifications", notifications);
app.route("/api/users", users);
app.route("/api/exports", exports);
app.route("/api/uploads", uploads);
app.route("/api/lookups", lookups);
app.route("/api/driver", driver);
app.route("/api/inventory", inventory);
app.route("/api/procurement", procurement);
app.route("/api/payroll", payroll);
app.route("/api/warehouses", warehouses);
app.route("/api/expenses", expenses);
app.route("/api/assets", assets);
app.route("/api/service-orders", serviceOrders);
app.route("/api/hr", hr);
app.route("/api/attendance", attendance);
app.route("/api/companies", companies);
app.route("/api/operational-kpi", operationalKpi);
app.route("/api/sales", sales);
app.route("/api/projects", projects);
app.route("/api/planning", planning);
app.route("/api/pos", pos);

app.onError(onError);
app.notFound((c) => c.json({ error: "Not found" }, 404));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`FleetERP API listening on http://localhost:${port}/api`);

export { app };
