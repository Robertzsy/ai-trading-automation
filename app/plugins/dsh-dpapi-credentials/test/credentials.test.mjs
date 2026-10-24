/**
 * Unit tests for the DPAPI credentials provider (node:test, mock engine).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { apply } from "../lib/index.js";

function startMockEngine() {
  const store = new Map();
  const records = new Map(), revisions = new Map();
  const server = createServer((req, res) => {
    const send = (payload, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.method === "GET" && req.url.startsWith("/api/credentials/records")) {
      const key = new URL(req.url, "http://x").searchParams.get("key");
      return send(key ? { record: records.get(key), revision: String(revisions.get(key) ?? 0) } :
        { records: [...records].map(([key, record]) => ({ key, kind: record.kind })) });
    }
    if (req.method === "POST" && req.url === "/api/credentials/records") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        const { key, record, revision } = JSON.parse(body);
        if (revision !== String(revisions.get(key) ?? 0)) return send({ ok: false }, 409);
        revisions.set(key, Number(revision) + 1);
        if (record == null) records.delete(key); else records.set(key, record);
        send({ ok: true });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/api/credentials/resolve")) {
      const ref = new URL(req.url, "http://x").searchParams.get("ref");
      const value = store.get(ref);
      return send({ ok: true, ref, configured: value !== undefined, value: value ?? "" });
    }
    if (req.method === "POST" && req.url === "/api/credentials/set") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        if (parsed.value) store.set(parsed.ref, parsed.value);
        else store.delete(parsed.ref);
        return send({ ok: true, ref: parsed.ref, configured: !!parsed.value });
      });
      return;
    }
    if (req.method === "POST" && req.url === "/api/credentials/unset") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        store.delete(parsed.ref);
        return send({ ok: true, ref: parsed.ref, configured: false });
      });
      return;
    }
    send({ ok: false, error: "not found" }, 404);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function fakeCtx() {
  const events = [];
  let provided;
  return {
    events,
    get service() {
      return provided;
    },
    provide(key, service) {
      assert.equal(key, "credentials");
      provided = service;
    },
    emit(name, ...args) {
      events.push([name, ...args]);
    },
  };
}

test("resolve/describe/set/unset roundtrip through the engine", async () => {
  const { server, url } = await startMockEngine();
  const ctx = fakeCtx();
  try {
    apply(ctx, { engineUrl: url });
    const service = ctx.service;

    assert.equal(await service.resolve("DEEPSEEK_API_KEY"), undefined);
    const described = await service.describe("DEEPSEEK_API_KEY");
    assert.deepEqual(described, { configured: false, writable: true });

    await service.set("DEEPSEEK_API_KEY", "sk-test");
    assert.deepEqual(await service.resolve("DEEPSEEK_API_KEY"), { value: "sk-test", source: "dpapi" });
    assert.equal((await service.describe("DEEPSEEK_API_KEY")).configured, true);

    await service.unset("DEEPSEEK_API_KEY");
    assert.equal(await service.resolve("DEEPSEEK_API_KEY"), undefined);

    assert.deepEqual(ctx.events.map((event) => event[0]), ["credentials/reference-updated", "credentials/reference-updated"]);
  } finally {
    server.close();
  }
});

test("engine down degrades to unconfigured without throwing", async () => {
  const ctx = fakeCtx();
  apply(ctx, { engineUrl: "http://127.0.0.1:1" });
  const service = ctx.service;

  assert.equal(await service.resolve("DEEPSEEK_API_KEY"), undefined);
  assert.deepEqual(await service.describe("DEEPSEEK_API_KEY"), { configured: false, writable: true });
});

test("environment variables override configured engine URL and token", async () => {
  const { server, url } = await startMockEngine();
  const previousUrl = process.env.INVESTMENT_ENGINE_URL;
  process.env.INVESTMENT_ENGINE_URL = url;
  const ctx = fakeCtx();
  try {
    apply(ctx, { engineUrl: "http://127.0.0.1:1234" });
    const service = ctx.service;
    await service.set("KIMI_API_KEY", "sk-kimi");
    assert.deepEqual(await service.resolve("KIMI_API_KEY"), { value: "sk-kimi", source: "dpapi" });
  } finally {
    if (previousUrl === undefined) delete process.env.INVESTMENT_ENGINE_URL;
    else process.env.INVESTMENT_ENGINE_URL = previousUrl;
    server.close();
  }
});

test("transient engine failure is retried instead of reported as a missing key", async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls += 1;
    if (calls === 1) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "busy" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ref: "DEEPSEEK_API_KEY", configured: true, value: "sk-live" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const ctx = fakeCtx();
  try {
    apply(ctx, { engineUrl: `http://127.0.0.1:${server.address().port}` });
    const result = await ctx.service.resolve("DEEPSEEK_API_KEY");
    assert.deepEqual(result, { value: "sk-live", source: "dpapi" });
    assert.equal(calls, 2);
    // Each operation re-resolves: another process may have revoked the key.
    assert.deepEqual(await ctx.service.resolve("DEEPSEEK_API_KEY"), { value: "sk-live", source: "dpapi" });
    assert.equal(calls, 3);
  } finally {
    server.close();
  }
});

test("record updates retry a stale revision without losing a concurrent refresh", async () => {
  const { server, url } = await startMockEngine();
  const a = fakeCtx(), b = fakeCtx();
  apply(a, { engineUrl: url }); apply(b, { engineUrl: url });
  try {
    const key = "deepseek-account/session";
    await a.service.modifyRecord(key, () => ({ kind: "grant", payload: { count: 0 } }));
    const increment = async record => {
      await new Promise(resolve => setImmediate(resolve));
      return { kind: "grant", payload: { count: record.payload.count + 1 } };
    };
    await Promise.all([a.service.modifyRecord(key, increment), b.service.modifyRecord(key, increment)]);
    assert.equal((await a.service.readRecord(key)).payload.count, 2);
    assert.deepEqual(await a.service.listRecords(), [{ key, kind: "grant" }]);
    assert.deepEqual(await a.service.describeRecord(key), { configured: true, kind: "grant", writable: true });
    await a.service.modifyRecord(key, () => undefined);
    assert.equal((await a.service.readRecord(key)).payload.count, 2);
    await b.service.deleteRecord(key);
    assert.equal(await a.service.readRecord(key), undefined);
    assert.ok(a.events.some(([event]) => event === "credentials/record-updated"));
    await a.service.set("DEEPSEEK_API_KEY", "old");
    assert.equal((await a.service.resolve("DEEPSEEK_API_KEY")).value, "old");
    await b.service.unset("DEEPSEEK_API_KEY");
    assert.equal(await a.service.resolve("DEEPSEEK_API_KEY"), undefined);
  } finally { server.close(); }
});
