import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import SystemPrompt, { renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import { createScope, scopeTarget } from "@deepseek-ai/dsh-scope";
import { rolePolicy, projectResearchPacket } from "../../dsh-investment-tools/lib/research-roles.js";
import { researchCalculations } from "../../dsh-investment-tools/lib/research-calculations.js";
import { mapSearchResponse, ResearchSearchProvider } from "../../dsh-investment-tools/lib/research-search.js";
import { normalizeNews } from "../../dsh-investment-tools/lib/research-news.js";
import { normalizeUsage, installAnalysisMeter } from "../../dsh-investment-tools/lib/analysis-meter.js";
import { ResearchGateway, installResearchPolicy } from "../../dsh-investment-tools/lib/research-policy.js";
import { analysisSummary } from "../../dsh-investment-tools/lib/research-contract.js";

test("native usage is disjoint: cache writes are input and reasoning is not counted twice", () => {
  assert.deepEqual(normalizeUsage({ input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 5, output_tokens: 20 }, "anthropic"),
    { input_tokens: 95, output_tokens: 20, cache_read_tokens: 80, cache_write_tokens: 5, uncached_input_tokens: 15, reasoning_tokens: null, native_searches: null });
  assert.equal(normalizeUsage({ inputTokens: 1 }), null);
  assert.equal(normalizeUsage({ inputTokens: 10, outputTokens: 20 }).cache_read_tokens, null);
});

test("usage summaries remain valid tool output before the final telemetry status arrives", async () => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, persona: "root" }); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
  const usage = { schema_version: 1, request_coverage: "observed_requests", totals: { requests: 1, input_tokens: 10 }, billing: { status: "not_reconciled" } };
  ctx.tools.register(defineTool({ name: "summary_fixture", description: "summary fixture", parameters: {},
    output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: () => analysisSummary({ cycle_id: "summary", status: "ready_for_execution", model_usage: usage }) }));
  try {
    const result = await ctx.tools.execute({ callId: "summary", agent: { id: "summary-reader" }, name: "summary_fixture", arguments: {}, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.equal(result.value.model_usage.totals.requests, 1);
  } finally { await ctx.fiber.dispose(); }
});

test("native search retains usage, citation excerpts and only enriches real returned URLs", async () => {
  const response = { usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 20 }, stop_reason: "end_turn", content: [
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.com/a", title: "业绩" }] },
    { type: "text", text: JSON.stringify({ articles: [{ url: "https://example.com/a", published_at: "2026-10-08", summary: "模型摘要" },
      { url: "https://invented.example/b", summary: "不得引入" }] }) },
  ] };
  const rows = [], provider = new ResearchSearchProvider(() => ({ baseURL: "https://api.deepseek.com/anthropic/v1", apiKey: "test-only", model: "test", maxTokens: 4096, maxUses: 5, apiVersion: "2023-06-01", enrichNews: true }),
    { fetchImpl: async () => ({ ok: true, json: async () => response }), onUsage: row => rows.push(row) });
  const result = await provider.search({ query: "test" });
  assert.equal(result.sources.length, 1); assert.equal(result.usage.input_tokens, 15); assert.equal(rows.length, 1);
  assert.equal(rows[0].usage.output_tokens, 20); assert(!JSON.stringify(rows).includes("test-only"));
  const news = normalizeNews([{ query: "test", ...result }], { symbol: "00700", market: "hk", now: Date.parse("2026-10-09") });
  assert.equal(news.items[0].summary_kind, "model_summary_unverified"); assert.equal(news.items[0].published_at, null);
  assert.equal(news.items[0].model_published_at, "2026-10-08"); assert.equal(news.items[0].full_text_verified, false);
  assert.equal(news.usage.available, true); assert.equal(news.coverage.confirmed_absence, false);
  const sdkProjected = { sources: result.sources.map(({ url, title, snippet }) => ({ url, title, snippet })), content: result.content };
  const projectedNews = normalizeNews([sdkProjected], { symbol: "00700", market: "hk" });
  assert.equal(projectedNews.items[0].summary, "模型摘要"); assert.equal(projectedNews.items[0].published_at, null);
  assert.equal(projectedNews.items[0].summary_kind, "model_summary_unverified");
  assert.throws(() => mapSearchResponse({ content: [] }), /no result blocks/);
});

test("search meters consumed usage even when malformed search output cannot be mapped", async () => {
  const rows = [], provider = new ResearchSearchProvider(() => ({ baseURL: "https://example.com", apiKey: "test", model: "test" }),
    { fetchImpl: async () => ({ ok: true, json: async () => ({ usage: { input_tokens: 2, output_tokens: 3 }, content: [] }) }), onUsage: row => rows.push(row) });
  await assert.rejects(provider.search({ query: "test" }), /no result blocks/);
  assert.equal(rows[0].usage.output_tokens, 3); assert.equal(rows[0].error, "WEB_PROVIDER_ERROR");
});

test("default native metering leaves the SDK search request and generation budget unchanged", async () => {
  let body;
  const provider = new ResearchSearchProvider(() => ({ baseURL: "https://example.com", apiKey: "test", model: "same-model", maxTokens: 4096, maxUses: 5, enrichNews: false }),
    { fetchImpl: async (_url, request) => { body = JSON.parse(request.body); return { ok: true, json: async () => ({ content: [
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.com/a", title: "source" }] },
      { type: "text", text: '{"articles":[{"url":"https://example.com/a","summary":"unverified","published_at":"2026-10-09"}]}' },
    ] }) }; } });
  const result = await provider.search({ query: "unchanged query" });
  assert.equal(body.messages[0].content[0].text, "Perform a web search for the query: unchanged query");
  assert.equal(body.max_tokens, 4096); assert.equal(body.tools[0].max_uses, 5);
  assert.equal(result.content, undefined); assert.equal(result.sources[0].model_summary, null);
  assert.equal(result.sources[0].model_published_at, null);
});

test("deduplication alone does not implicitly narrow the release tool scope", async () => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, persona: "root" }); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
  ctx.tools.register(defineTool({ name: "maintenance_read", description: "existing release tool", parameters: {},
    output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: () => ({ ok: true }) }));
  const parent = { id: "dedup-parent" }, g = new ResearchGateway({ cycleId: "d", market: "hk", symbols: ["00700"], mode: "off" });
  const policy = installResearchPolicy(ctx, { researchRoles: false, strictEvidence: false });
  const scope = policy.begin(parent, g, "base_research", ["00700:technical_analyst"], new AbortController().signal, 12);
  const child = { id: "dedup-child", session: { id: "dedup-child", events: [], surface: { nodes: [] } } };
  child.ctx = createScope(ctx, child).ctx; ctx.agents.enter(child, parent); ctx.agents.announce(child); scope.bind(child.id, "00700:technical_analyst");
  try {
    assert((await ctx.systemPrompt.assemble({ scope: child })).tools.some(tool => tool.name === "maintenance_read"));
    const result = await ctx.tools.execute({ callId: "ordinary", agent: child, name: "maintenance_read", arguments: {}, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.equal(result.value.ok, true);
  } finally { scope.close(); g.close(); await ctx.fiber.dispose(); }
});

test("a token-truncated native answer retains complete articles without pretending the batch was complete", () => {
  const result = mapSearchResponse({ stop_reason: "max_tokens", content: [
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.com/a", title: "业绩" }] },
    { type: "text", text: '{"articles":[{"url":"https://example.com/a","summary":"a \\"quoted\\" fact"},{"url":"https://incomplete.example/' },
  ] });
  assert.equal(result.sources[0].model_summary, 'a "quoted" fact');
  assert.equal(result.enrichment_status, "partial_model_reported"); assert.equal(result.truncated, true);
});

test("volume ratios have explicit, distinct MA5 and MA20 denominators", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ date: "2026-10-" + String(i + 1).padStart(2, "0"), volume: i < 15 ? 200 : 100 }));
  const result = researchCalculations({ data: bars }, {}).technical;
  assert.equal(result.volume_ratio_ma5.value, 1); assert.equal(result.volume_ratio_ma20.value, 100 / 175);
  assert.equal(result.volume_ratio_ma20.window, 20);
  assert.deepEqual(researchCalculations({ data: [{ date: "2026-10-01", volume: null }] }, {}).technical, {});
});

test("single quarters require declared fiscal starts and same-currency inputs", () => {
  const row = (end, value, currency = "CNY") => ({ period_start: "2026-01-01", period_end: end, period_type: "ytd", currency,
    metrics: { net_income_parent: { value, unit: currency } }, source_url: "https://example.com/" + end });
  const records = [row("2026-06-30", 60), row("2026-03-31", 35)];
  const financial = researchCalculations({}, { records }).financial;
  assert.equal(financial.find(item => item.kind === "single_quarter").value, 25);
  assert.equal(financial[0].period_start, "2026-04-01");
  assert.equal(researchCalculations({}, { records: [records[0], row("2026-03-31", 35, "HKD")] }).financial.length, 0);
  assert.equal(researchCalculations({}, { records: records.map(item => ({ ...item, period_start: null })) }).financial.length, 0);
  assert.equal(researchCalculations({}, { records: records.map(item => ({ ...item, currency: null })) }).financial.length, 0);
  assert.equal(researchCalculations({}, { records: [records[0], { ...records[1], metrics: { net_income_parent: { value: 35, unit: "CNY", period_type: "ttm" } } }] }).financial.length, 0);
});

test("role projections preserve relevant full facts and give a full-evidence retrieval path", () => {
  const packet = { symbol: "00700", history: { data: [1, 2] }, fundamentals: { records: [1] }, news: { items: [2] } };
  assert.equal(projectResearchPacket(packet, "news_analyst").history, undefined);
  assert.deepEqual(projectResearchPacket(packet, "technical_analyst").history, packet.history);
  assert.deepEqual(rolePolicy("risk_review", "risk-manager").tools, ["investment_research_evidence", "structured_output"]);
});

test("real scoped role prompts and tools isolate maintenance while shared evidence remains readable", async () => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, persona: "MAINTENANCE_ROOT" });
  await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
  const tool = name => defineTool({ name, description: name, parameters: {}, output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute: () => ({}) });
  for (const name of ["investment_market_snapshot", "investment_fundamentals", "maintenance_write"]) ctx.tools.register(tool(name));
  const parent = { id: "parent" }, g = new ResearchGateway({ cycleId: "x", market: "hk", symbols: ["00700"], mode: "off" });
  g.packets = { "00700": { history: { data: [{ price: 1 }] } } };
  const policy = installResearchPolicy(ctx, { researchRoles: true, strictEvidence: false });
  const scope = policy.begin(parent, g, "base_research", ["00700:technical_analyst"], new AbortController().signal, 12);
  const child = { id: "child", session: { id: "child", events: [], surface: { nodes: [] } } }; child.ctx = createScope(ctx, child).ctx;
  ctx.agents.enter(child, parent); ctx.agents.announce(child);
  const firstAssembly = ctx.systemPrompt.assemble({ scope: child });
  await Promise.resolve(); scope.bind(child.id, "00700:technical_analyst");
  try {
    const assembly = await firstAssembly;
    assert(!renderPrompt(assembly).includes("MAINTENANCE_ROOT")); assert(!assembly.tools.some(item => item.name === "maintenance_write"));
    assert(!assembly.tools.some(item => item.name === "investment_fundamentals"));
    const result = await ctx.tools.execute({ callId: "read", agent: child, name: "investment_research_evidence", arguments: { kind: "history" }, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.equal(result.value.value.data[0].price, 1);
    const foreign = await ctx.tools.execute({ callId: "foreign", agent: child, name: "investment_research_evidence", arguments: { symbol: "09988", kind: "history" }, signal: new AbortController().signal });
    assert.equal(foreign.isError, true);
  } finally { scope.close(); g.close(); await ctx.fiber.dispose(); }
});

test("negative read suppression expires so a temporary upstream failure can recover", async () => {
  let now = 100, calls = 0; const g = new ResearchGateway({ cycleId: "x", market: "hk", symbols: ["00700"], now: () => now });
  const load = () => { calls++; if (calls <= 2) throw new Error("offline"); return { price: 1 }; };
  for (let i = 0; i < 2; i++) await assert.rejects(g.read("investment_market_snapshot", { symbol: "00700" }, load), /offline/);
  await assert.rejects(g.read("investment_market_snapshot", { symbol: "00700" }, load), /失败两次/);
  now += 30001; assert.equal((await g.read("investment_market_snapshot", { symbol: "00700" }, load)).value.price, 1); g.close();
});

test("billing and retrieval timestamps do not change identical evidence IDs", async () => {
  const read = async (cycleId, usage, fetched_at) => {
    const g = new ResearchGateway({ cycleId, market: "hk", symbols: ["00700"] });
    try { return (await g.read("web_search", { query: "same" }, () => ({ sources: [{ url: "https://example.com/a", title: "same fact" }], usage, fetched_at }), { stock: "00700" })).entry.id; }
    finally { g.close(); }
  };
  assert.equal(await read("a", { input_tokens: 10 }, "2026-10-10T01:00:00Z"), await read("b", { input_tokens: 20 }, "2026-10-10T01:10:00Z"));
});

test("a manager can supplement shared news, reuse the query and retain complete upstream reports", async () => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, persona: "root" }); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
  let upstream = 0;
  ctx.tools.register(defineTool({ name: "web_search", description: "search", parameters: {},
    output: { schema: { type: "object", additionalProperties: true }, render: () => [] },
    execute: () => { upstream++; return { sources: [{ url: "https://example.com/earnings", title: "业绩", snippet: "source fact" }] }; } }));
  const parent = { id: "manager-parent" }, g = new ResearchGateway({ cycleId: "m", market: "hk", symbols: ["00700"], mode: "off" });
  g.packets = { "00700": { news: normalizeNews([], { symbol: "00700", market: "hk" }) } };
  const fullText = "反方论据".repeat(1000);
  g.stageResults = { base_research: [{ symbol: "00700", analyses: [{ assessment: fullText }] }] };
  const policy = installResearchPolicy(ctx, { researchRoles: true, strictEvidence: false });
  const scope = policy.begin(parent, g, "research_debate", ["00700:research-manager"], new AbortController().signal, 12);
  const child = { id: "manager-child", session: { id: "manager-child", events: [], surface: { nodes: [] } } };
  child.ctx = createScope(ctx, child).ctx; ctx.agents.enter(child, parent); ctx.agents.announce(child); scope.bind(child.id, "00700:research-manager");
  const read = args => ctx.tools.execute({ callId: "r", agent: child, name: "investment_research_evidence", arguments: args, signal: new AbortController().signal });
  try {
    assert(!(await ctx.systemPrompt.assemble({ scope: child })).tools.some(tool => tool.name === "web_search"));
    assert.equal((await read({ kind: "analyses" })).value.value.base_research[0].analyses[0].assessment, fullText);
    const bad = await read({ kind: "news", query: "query" }); assert.equal(bad.isError, true);
    const first = await read({ kind: "news", query: "query", reason: "缺少业绩报道" }); assert.equal(first.isError, false);
    const second = await read({ kind: "news", query: "query", reason: "核对已有证据" });
    assert.equal(upstream, 1); assert.equal(second.value.revision, first.value.revision);
    assert.equal(second.value.value.items[0].summary_kind, "source_excerpt");
    assert(second.value.evidence_registry.some(row => row.source === "https://example.com/earnings"));
    child.session.events.push({ seq: 1, type: "tool/result", result: second }); child.session.surface.nodes = [1];
    const repeated = await read({ kind: "news" }); assert(!JSON.stringify(repeated.content).includes("source fact"));
    assert(JSON.stringify(repeated.content).includes("已收到此版本"));
    child.session.surface.nodes = [];
    const restored = await read({ kind: "news" }); assert(JSON.stringify(restored.content).includes("source fact"));
  } finally { scope.close(); g.close(); await ctx.fiber.dispose(); }
});

test("a real source excerpt replaces an unverified duplicate summary without changing its provenance", () => {
  const news = normalizeNews([{ sources: [{ url: "https://example.com/a", model_summary: "long model summary", title: "业绩" }] },
    { sources: [{ url: "https://example.com/a", snippet: "fact" }] }], { symbol: "00700", market: "hk" });
  assert.equal(news.items[0].summary, "fact"); assert.equal(news.items[0].summary_kind, "source_excerpt");
  assert.equal(news.items[0].evidence_kind, "search_excerpt");
});

test("meter captures billed partial streams, titles and retries without persisting prompt text", async () => {
  const callbacks = new Map(), posted = [], parent = { id: "p", session: { id: "s" } };
  const ctx = { get: () => ({ currentInitiator: () => parent }), on: (name, fn) => callbacks.set(name, fn) };
  const meter = installAnalysisMeter(ctx, { post: async (_url, payload) => { posted.push(payload); } }); meter.begin("cycle", parent);
  const consume = async stream => { for await (const _chunk of stream) {} };
  await consume(callbacks.get("llm/stream")({ model: "test", provider: "test", purpose: "session-title", system: "secret-prompt", tools: [] }, async function* () { yield { type: "usage", usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 5 } }; yield { type: "finish", reason: { kind: "stop" } }; }));
  await assert.rejects(consume(callbacks.get("llm/stream")({ model: "test", provider: "test" }, async function* () { yield { type: "usage", usage: { inputTokens: 4, outputTokens: 6 } }; throw new Error("failed"); })), /failed/);
  await meter.flush(); assert.equal(posted.length, 2); assert.equal(posted[0].request.purpose, "session-title");
  assert.equal(posted[1].request.usage.output_tokens, 6); assert(!JSON.stringify(posted).includes("secret-prompt"));
});
