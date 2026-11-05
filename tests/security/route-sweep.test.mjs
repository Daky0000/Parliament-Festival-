// Every protected API route must deny anonymous callers (401) and callers
// without the right permission (403/404). The route list is discovered from
// the filesystem, so new routes are covered automatically.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const ROOT = path.resolve("src/app/api");
const PUBLIC = [/^v1\/public\//, /^v1\/webhooks\//, /^health$/, /^auth\/(login|logout|activate|mfa\/)/];
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

function routeFiles(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...routeFiles(path.join(dir, entry.name), rel));
    else if (entry.name === "route.ts") out.push(prefix);
  }
  return out;
}

const routes = routeFiles(ROOT).filter((r) => !PUBLIC.some((re) => re.test(r)));

async function load(route) {
  return import(pathToFileURL(path.join(ROOT, route, "route.ts")).href);
}

test("route discovery found the protected API surface", () => {
  assert.ok(routes.length >= 18, `expected many protected routes, found ${routes.length}`);
});

test("anonymous requests get 401 on every protected route and method", async () => {
  for (const route of routes) {
    const mod = await load(route);
    for (const m of METHODS) {
      if (typeof mod[m] !== "function") continue;
      const r = await call(mod[m], request(`/api/${route}`, { method: m, body: m === "GET" ? undefined : {} }), {
        eventId: "x", campaignId: "x", providerKey: "openai", userId: "x",
      });
      assert.strictEqual(r.status, 401, `${m} /api/${route} returned ${r.status} without a session`);
    }
  }
});

test("a forged session cookie is rejected", async () => {
  const mod = await load("v1/events");
  const r = await call(mod.GET, request("/api/v1/events", { cookie: "pf_session=forged-token-value-that-is-long-enough" }));
  assert.strictEqual(r.status, 401);
});

test("a session still waiting for MFA cannot use the API", async () => {
  const cookie = await cookieFor("admin@parliament.gh", { mfaPending: true });
  const mod = await load("v1/events");
  const r = await call(mod.GET, request("/api/v1/events", { cookie }));
  assert.strictEqual(r.status, 401);
});

test("an usher is denied everything except check-in and event reads", async () => {
  const cookie = await cookieFor("usher@parliament.gh");
  const f = await seededFixtures();
  const eid = f.event.id;
  const cases = [
    ["v1/guests", "GET", `?eventId=${eid}`],
    ["v1/guests", "POST", "", { eventId: eid, fullName: "X" }],
    ["v1/guests", "PATCH", "", { eventGuestId: f.guest.id }],
    ["v1/imports", "POST", "", { eventId: eid, rows: [] }],
    ["v1/protocol", "GET", `?eventId=${eid}`],
    ["v1/protocol", "POST", "", { eventId: eid, name: "X" }],
    ["v1/protocol", "PATCH", "", { categoryId: f.category.id, name: "X" }],
    ["v1/campaigns", "GET", `?eventId=${eid}`],
    ["v1/campaigns", "POST", "", { eventId: eid }],
    ["v1/seating", "GET", `?eventId=${eid}`],
    ["v1/seating", "POST", "", { action: "approve_plan", seatingPlanId: f.plan.id }],
    ["v1/ai", "GET"],
    ["v1/ai", "POST", "", { toolName: "search_guests", args: { eventId: eid } }],
    ["v1/super-admin/overview", "GET"],
    ["v1/super-admin/integrations/test", "POST", "", { providerKey: "openai" }],
    ["v1/super-admin/email/test-send", "POST", "", { recipientEmail: "a@b.c" }],
    ["v1/super-admin/sms/test-send", "POST", "", { phone: "0240000000", message: "x", eventId: eid }],
    ["v1/super-admin/integrations/[providerKey]", "PATCH", "", { isEnabled: false }, { providerKey: "openai" }],
    ["v1/admin/users", "GET"],
    ["v1/admin/users", "POST", "", { email: "x@y.z", fullName: "X Y", roleKey: "usher" }],
    ["v1/admin/users/[userId]", "POST", "", { action: "suspend" }, { userId: f.usher.id }],
  ];
  if (f.campaign) {
    cases.push(["v1/campaigns/[campaignId]", "GET", "", undefined, { campaignId: f.campaign.id }]);
    cases.push(["v1/campaigns/[campaignId]", "PATCH", "", { action: "approve" }, { campaignId: f.campaign.id }]);
  }
  for (const [route, method, qs = "", body, params = {}] of cases) {
    const mod = await load(route);
    const r = await call(mod[method], request(`/api/${route}${qs}`, { method, cookie, body }), params);
    assert.ok([403, 404].includes(r.status), `usher ${method} /api/${route} returned ${r.status}`);
  }

  // Allowed for ushers
  const events = await load("v1/events");
  assert.strictEqual((await call(events.GET, request("/api/v1/events", { cookie }))).status, 200);
  const one = await load("v1/events/[eventId]");
  assert.strictEqual((await call(one.GET, request(`/api/v1/events/${eid}`, { cookie }), { eventId: eid })).status, 200);
});

test("state-changing requests from another origin are rejected (CSRF)", async () => {
  const cookie = await cookieFor("admin@parliament.gh");
  const f = await seededFixtures();
  const mod = await load("v1/protocol");
  for (const origin of ["https://evil.example", null]) {
    const r = await call(
      mod.POST,
      request("/api/v1/protocol", { method: "POST", cookie, origin, body: { eventId: f.event.id, name: "CSRF" } })
    );
    assert.strictEqual(r.status, 403, `origin ${origin} gave ${r.status}`);
  }
  const login = await import(pathToFileURL(path.join(ROOT, "auth/login/route.ts")).href);
  const r = await call(login.POST, request("/api/auth/login", { method: "POST", origin: "https://evil.example", body: { email: "a@b.cd", password: "x" } }));
  assert.strictEqual(r.status, 403);
});
