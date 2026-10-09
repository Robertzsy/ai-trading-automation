import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import { createScope, scopeTarget } from "@deepseek-ai/dsh-scope";
import { ResearchGateway, installResearchPolicy, evidenceIndex } from "../../dsh-investment-tools/lib/research-policy.js";
import { WORKFLOW_AGENT_SCHEMAS } from "../../dsh-investment-tools/lib/analysis-workflow.js";

const gateway = options => new ResearchGateway({ cycleId: "cycle", market: "hk", symbols: ["00700", "09988"], mode: "enforce", ...options });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("four concurrent roles share one upstream read and get independent full values", async () => {
  const g = gateway(), pending = deferred(); let calls = 0;
  const reads = ["a", "b", "c", "d"].map(id => g.read("investment_market_history", { symbol: "00700" }, () => { calls++; return pending.promise; }, { child: g.child(id, "base_research", "00700:" + id) }));
  pending.resolve({ rows: [1, 2] });
  const results = await Promise.all(reads);
  assert.equal(calls, 1); assert.equal(g.stats.coalesced, 3);
  results[0].value.rows.push(3); assert.deepEqual(results[1].value.rows, [1, 2]);
  assert.equal(g.archive.length, 1); g.close();
});

test("keys distinguish stock, parameters, query and version, while normalizing defaults", async () => {
  const g = gateway(); let calls = 0;
  const load = () => ({ n: ++calls });
  await g.read("investment_market_history", { symbol: "00700" }, load);
  await g.read("investment_market_history", { lookback: 60, symbol: "00700" }, load);
  await g.read("investment_market_history", { lookback: 61, symbol: "00700" }, load);
  await g.read("investment_market_history", { symbol: "09988" }, load);
  await g.read("web_search", { query: "one", maxResults: 6 }, load);
  await g.read("web_search", { query: "one", maxResults: 8 }, load);
  assert.equal(calls, 5);
  const other = gateway({ cycleId: "next" }); await other.read("investment_market_history", { symbol: "00700" }, load);
  assert.equal(calls, 6); assert.notEqual(g.key("investment_mandate", {}), other.key("investment_mandate", {}));
  g.close(); other.close();
});

test("expiry fetches a new version without treating old facts as fresh", async () => {
  let time = 100, calls = 0; const g = gateway({ now: () => time });
  const first = await g.read("investment_market_snapshot", { symbol: "00700" }, () => ({ price: ++calls }));
  time += 60001;
  const next = await g.read("investment_market_snapshot", { symbol: "00700" }, () => ({ price: ++calls }));
  assert.equal(next.value.price, 2); assert.notEqual(first.entry.version, next.entry.version); assert.notEqual(first.entry.id, next.entry.id); g.close();
});

test("cancelling one waiter preserves the other; cancelling the last aborts upstream", async () => {
  const g = gateway(), pending = deferred(), a = new AbortController(), b = new AbortController(); let upstream;
  const load = signal => { upstream = signal; return pending.promise; };
  const first = g.read("investment_mandate", {}, load, { signal: a.signal });
  const second = g.read("investment_mandate", {}, load, { signal: b.signal });
  await Promise.resolve(); a.abort(new Error("first stopped"));
  await assert.rejects(first, /first stopped/); assert.equal(upstream.aborted, false);
  pending.resolve({ mandate: {} }); assert.deepEqual((await second).value, { mandate: {} });
  const c = new AbortController();
  const last = g.read("investment_market_snapshot", { symbol: "00700" }, signal => { upstream = signal; return new Promise(() => {}); }, { signal: c.signal });
  await Promise.resolve(); c.abort(new Error("last stopped")); await assert.rejects(last, /last stopped/);
  assert.equal(upstream.aborted, true); assert.equal(g.entries.size, 1); g.close();
});

test("round cancellation aborts every upstream and clears the memo", async () => {
  const controller = new AbortController(), g = gateway({ signal: controller.signal }); let upstream;
  const read = g.read("investment_mandate", {}, signal => {
    upstream = signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  await Promise.resolve(); controller.abort(new Error("round stopped"));
  await assert.rejects(read, /round stopped/); assert(upstream.aborted); assert.equal(g.entries.size, 0);
});

test("failed responses are not memoized and the same request has only one retry", async () => {
  const g = gateway(); let calls = 0;
  const load = () => { calls++; return { ok: false, error: "offline" }; };
  for (let n = 0; n < 2; n++) await assert.rejects(g.read("investment_mandate", {}, load), /offline/);
  await assert.rejects(g.read("investment_mandate", {}, load), /重试耗尽/);
  assert.equal(calls, 2); assert.equal(g.archive.length, 0); g.close();
});

test("only two supplemental reads, no later-stage facts, and no cross-stock reads", async () => {
  const g = gateway(), child = g.child("a", "base_research", "00700:news_analyst");
  await g.read("investment_market_snapshot", { symbol: "00700" }, () => ({ price: 1 }), { prefetch: true });
  await g.read("investment_market_snapshot", { symbol: "00700" }, () => assert.fail(), { child });
  for (const query of ["q1", "q2"]) await g.read("web_search", { query }, () => ({ sources: [] }), { child });
  await assert.rejects(g.read("web_search", { query: "q3" }, () => assert.fail(), { child }), /补充取证预算/);
  await assert.rejects(g.read("investment_market_snapshot", { symbol: "09988" }, () => assert.fail(), { child }), /其他股票/);
  await assert.rejects(g.read("investment_mandate", {}, () => assert.fail(), { child: g.child("r", "risk_review", "risk-manager") }), /上游证据/);
  g.close();
});

test("repeat attempts are bounded even when every read hits the memo", async () => {
  const g = gateway(), child = g.child("a", "base_research", "00700:technical_analyst");
  await g.read("investment_market_snapshot", { symbol: "00700" }, () => ({ price: 1 }), { prefetch: true });
  for (let n = 0; n < 6; n++) await g.read("investment_market_snapshot", { symbol: "00700" }, () => assert.fail(), { child });
  await assert.rejects(g.read("investment_market_snapshot", { symbol: "00700" }, () => assert.fail(), { child }), /调用次数/); g.close();
});

test("observe records budget violations without blocking; writes never enter the gateway", async () => {
  const g = gateway({ mode: "observe" }), child = g.child("r", "risk_review", "risk-manager");
  await g.read("investment_mandate", {}, () => ({ mandate: {} }), { child });
  assert(child.violations.length); assert.equal(g.stats.upstream, 1);
  for (const tool of ["structured_output", "investment_status", "investment_control", "investment_submit_decisions", "investment_analysis_workflow"]) {
    await assert.rejects(g.read(tool, {}, () => assert.fail()), /read-only/);
  }
  g.close();
});

test("market-wide facts keep a global identity when different stock roles share them", async () => {
  const g = gateway(); let reads = 0;
  const a = g.child("a", "base_research", "00700:news_analyst"), b = g.child("b", "base_research", "09988:news_analyst");
  const first = await g.read("investment_macro_latest", {}, () => ({ content: "macro", n: ++reads }), { child: a });
  const second = await g.read("investment_macro_latest", {}, () => assert.fail(), { child: b });
  assert.equal(first.entry.id, second.entry.id); assert.equal(evidenceIndex(g.archive)[0].symbol, null); assert.equal(reads, 1); g.close();
});

async function runtimeFixture() {
  const ctx = new Context(); ctx.provide("systemPrompt", { tools() {}, section() {} });
  await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
  let calls = 0;
  ctx.tools.register(defineTool({ name: "investment_market_snapshot", description: "quote", parameters: { symbol: { type: "string", required: true } },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, execute: async () => ({ price: ++calls }) }));
  ctx.tools.register(defineTool({ name: "maintenance_write", description: "write", parameters: {}, output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: () => ({}) }));
  const policy = installResearchPolicy(ctx, { schemas: WORKFLOW_AGENT_SCHEMAS }), g = gateway(), parent = { id: "parent" };
  const scope = policy.begin(parent, g, "base_research", ["00700:technical_analyst", "00700:news_analyst"], new AbortController().signal, 12);
  const create = (id, owner = parent) => {
    const agent = { id, session: { id, events: [], surface: { nodes: [] } } }; agent.ctx = createScope(ctx, agent).ctx;
    ctx.agents.enter(agent, owner); ctx.agents.announce(agent); return agent;
  };
  const execute = (agent, name = "investment_market_snapshot", args) => ctx.tools.execute({ callId: "call-" + Math.random(), agent, name, arguments: args ?? (name === "investment_market_snapshot" ? { symbol: "00700" } : {}), signal: new AbortController().signal });
  return { ctx, policy, g, scope, parent, create, execute, calls: () => calls, async dispose() { scope.close(); g.close(); await ctx.fiber.dispose(); } };
}

test("real DSH scope installs restrictions before first request and waits for trusted role binding", async () => {
  const f = await runtimeFixture();
  try {
    const child = f.create("child"), outsider = f.create("outsider", undefined);
    // undefined invokes the fixture default, so explicitly use an unrelated owner.
    const ordinary = f.create("ordinary", { id: "elsewhere" });
    assert.equal(f.ctx.tools.get("maintenance_write", child), undefined);
    assert(f.ctx.tools.get("maintenance_write", ordinary));
    const pending = f.ctx.waterfall(scopeTarget(child, child), "agent/pre-step", { agent: child, signal: new AbortController().signal, messages: [], turn: 1, step: 1 }, async () => ({ kind: "enter", messages: [] }));
    let entered = false; pending.then(() => { entered = true; }); await Promise.resolve(); assert.equal(entered, false);
    f.scope.bind(child.id, "00700:technical_analyst"); assert.equal((await pending).kind, "enter");
    assert.equal((await f.execute(child, "maintenance_write")).isError, true);
    assert.equal((await f.execute(ordinary, "maintenance_write")).isError, false);
    f.scope.bind(outsider.id, "00700:news_analyst");
  } finally { await f.dispose(); }
});

test("real DSH results retain full facts for each new reader; repeat projection resets after compaction", async () => {
  const f = await runtimeFixture();
  try {
    const a = f.create("a"), b = f.create("b"); f.scope.bind(a.id, "00700:technical_analyst"); f.scope.bind(b.id, "00700:news_analyst");
    const first = await f.execute(a); assert.equal(first.isError, false); assert.equal(first.value.price, 1);
    a.session.events.push({ seq: 1, type: "tool/result", result: first }); a.session.surface.nodes.push(1);
    const again = await f.execute(a), other = await f.execute(b);
    assert.equal(f.calls(), 1); assert.match(again.content[0].text, /本会话已收到/);
    assert.match(other.content[0].text, /price/); assert.match(other.content.at(-1).text, /证据登记/);
    a.session.surface.nodes = [];
    const replaced = await f.execute(a); assert.match(replaced.content[0].text, /price/);
    a.session.surface.nodes = [1];
    f.ctx.emit(scopeTarget(a, a), "agent/session-start", { agent: a, source: "compact" });
    const compacted = await f.execute(a); assert.match(compacted.content[0].text, /price/);
    assert.equal(evidenceIndex(f.g.archive)[0].symbol, "00700");
  } finally { await f.dispose(); }
});

test("a text-only stop gets one same-session steering message, then fails without a commit", async () => {
  const f = await runtimeFixture();
  try {
    const child = f.create("text"); f.scope.bind(child.id, "00700:technical_analyst");
    const steering = []; child.steer = message => steering.push(message);
    const stop = () => f.ctx.serial(scopeTarget(child, child), "agent/turn-stopping", { agent: child, turn: 1, signal: new AbortController().signal });
    await stop(); assert.equal(steering.length, 1); assert.equal(steering[0].source.kind, "plugin");
    await assert.rejects(stop(), /仍未提交/); assert.equal(steering.length, 1);
    f.g.children.get(child.id).structured_committed = true;
    await stop(); assert.equal(steering.length, 1);
  } finally { await f.dispose(); }
});

test("untrusted labels cannot release a research child", async () => {
  const f = await runtimeFixture();
  try {
    const child = f.create("c"); f.scope.bind(child.id, "09988:rogue");
    const result = await f.execute(child); assert.equal(result.isError, true); assert.match(result.error.message, /Unexpected workflow role/);
    assert.equal(f.calls(), 0);
  } finally { await f.dispose(); }
});

test("structured output gets one repair before commit and stays available after read budget exhaustion", async () => {
  const f = await runtimeFixture();
  try {
    const child = f.create("output"); f.scope.bind(child.id, "00700:technical_analyst");
    child.ctx.get("tools").register({ name: "structured_output", description: "commit", parameters: WORKFLOW_AGENT_SCHEMAS.baseResearch,
      output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: (_args, exec) => { exec.concludeTurn(); return { recorded: true }; } });
    const quote = await f.execute(child);
    const id = evidenceIndex(f.g.archive)[0].id;
    const valid = { symbol: "00700", role: "technical_analyst", summary: "gap", stance: "unknown", confidence: .1,
      evidence: [{ id, source: "investment_market_snapshot", title: "quote", claim: "price" }], risks: [], data_quality: "gap" };
    const invalid = structuredClone(valid); invalid.evidence[0].id += "-supp";
    const failed = await f.execute(child, "structured_output", invalid);
    assert.equal(failed.isError, true); assert.match(failed.error.message, /逐字/); assert.equal(failed.concludesTurn, undefined);
    const state = f.g.children.get(child.id); state.attempts = 6;
    assert.equal((await f.execute(child)).isError, true);
    const result = await f.execute(child, "structured_output", valid);
    assert.equal(result.isError, false); assert.equal(result.concludesTurn, true); assert.equal(quote.value.price, 1);
  } finally { await f.dispose(); }
});

test("malformed tool arguments get a concise JSON-format correction before any commit", async () => {
  const f = await runtimeFixture();
  try {
    const child = f.create("json"); f.scope.bind(child.id, "00700:technical_analyst");
    child.ctx.get("tools").register({ name: "structured_output", description: "commit", parameters: WORKFLOW_AGENT_SCHEMAS.baseResearch,
      output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: () => assert.fail("invalid output cannot commit") });
    const result = await f.execute(child, "structured_output", "{invalid}");
    assert.equal(result.isError, true); assert.match(result.error.message, /合法 JSON 对象/); assert.match(result.error.message, /顶层字段/);
    assert(result.error.message.length < 700); assert.equal(result.concludesTurn, undefined);
  } finally { await f.dispose(); }
});
