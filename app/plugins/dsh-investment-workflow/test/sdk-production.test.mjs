import { workflowOptions } from "../lib/index.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { DEFAULT_SCHEMA, Type, load } from "js-yaml";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import { createScope, scopeTarget } from "@deepseek-ai/dsh-scope";
import PtcWorkflowEngine from "@deepseek-ai/dsh-workflow-ptc";
import NodePtcRuntime from "@deepseek-ai/dsh-ptc-runtime-node";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import LocalFileSystem from "@deepseek-ai/dsh-fs-local";
import { registerAnalysisWorkflow } from "../../dsh-investment-tools/lib/analysis-workflow.js";

// Exercise the released shared-evidence scripts and the migrated production
// dedup override through real managed PTC processes, IPC, scope and tool hooks.
// All provider answers and research sources are local deterministic fixtures.
const targets = Array.from({ length: 8 }, (_, i) => "OFFLINE" + String(i).padStart(2, "0"));
const stages = ["base_research", "research_debate", "portfolio_draft", "risk_review", "final_decision"];
const yamlSchema = DEFAULT_SCHEMA.extend([
  new Type("tag:yaml.org,2002:js", { kind: "scalar", construct: value => value }),
]);
const allRows = node => !node || typeof node !== "object" ? [] : [node, ...Object.values(node).flatMap(allRows)];

async function productionConfig() {
  const patch = load(await readFile(new URL("../../../profiles/investment/product/cordis.patch.yml", import.meta.url), "utf8"), { schema: yamlSchema });
  const workflow = allRows(patch).filter(row => row?.id === "investment-analysis-workflow");
  assert.equal(workflow.length, 1);
  const ptc = patch.filter(row => row?.id === "workflow-ptc");
  assert.equal(ptc.length, 1, "the shipped headless host must set its PTC pool explicitly");
  const maxConcurrentAgents = ptc[0].config?.maxConcurrentAgents;
  assert.ok(Number.isSafeInteger(maxConcurrentAgents) && maxConcurrentAgents > 0 && maxConcurrentAgents <= 8);
  // The migrated root patch contains this single approved workflow override.
  // Keep it explicit without making the test depend on a user's home or keys.
  const rootOverride = { id: "investment-analysis-workflow", config: { deduplicateResearch: true } };
  const options = workflowOptions(rootOverride.config);
  assert.equal(options.sharedResearch, true);
  assert.equal(options.deduplicateResearch, true);
  assert.equal(options.strictEvidence, false);
  assert.equal(options.lightweightResults, true);
  assert.equal(options.researchRoles, false);
  assert.equal(options.researchPolicy, "off");
  assert.equal(options.singleConversationBaseResearch, false);
  return { options, maxConcurrentAgents };
}

function output(schema, key = "", symbol = targets[0]) {
  if (schema.enum) return schema.enum.includes("HOLD") ? "HOLD" : schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, value]) => [name, output(value, name, symbol)]));
  if (schema.type === "array") return key === "decisions" ? targets.map(code => output(schema.items, "", code)) : key === "evidence" ? [output(schema.items, "", symbol)] : [];
  if (schema.type === "number" || schema.type === "integer") return key === "confidence" ? 0.8 : 0;
  if (schema.type === "boolean") return true;
  if (schema.type === "string") return key === "symbol" ? symbol : "Synthetic offline fixture";
  return null;
}

function durableRun() {
  const state = { cycle_id: "production-8", market: "us", status: "running", checkpoints: {}, output_language: "en", submit: false };
  const archives = {}, stageStarts = [], providerCalls = Object.fromEntries(stages.map(stage => [stage, 0]));
  const allowedPosts = new Set(["/api/research/plan", ...["start", "update", "archive", "checkpoint", "fail", "events"].map(action => "/api/analysis/runs/" + action)]);
  let currentStage;
  const client = {
    async get(path) {
      if (path === "/api/status") return { control: {} };
      if (path.startsWith("/api/portfolio/")) return { cash: 0, total_equity: 10000, holdings: [] };
      if (path === "/api/mandate") return { mandate: {} };
      if (path === "/api/config") return { config: { autonomous: { max_universe_size: targets.length } } };
      if (path.startsWith("/api/analysis/runs?")) return { runs: [] };
      if (path.startsWith("/api/analysis/run?")) return { analysis: structuredClone(state) };
      if (path.startsWith("/api/analysis/evidence?")) return { evidence: structuredClone(archives[new URLSearchParams(path.split("?")[1]).get("stage")]) };
      if (path.startsWith("/api/research/plan?")) return { found: false };
      assert.fail("Unexpected offline engine GET: " + path);
    },
    async post(path, body) {
      assert.ok(allowedPosts.has(path), "Unexpected offline engine POST: " + path);
      if (body.event === "stage_start") { currentStage = body.stage; stageStarts.push(currentStage); }
      if (path.endsWith("/archive")) Object.assign(archives, structuredClone(body.stages));
      if (path.endsWith("/checkpoint")) {
        Object.assign(archives, structuredClone(body.archives));
        state.checkpoints[body.stage] = structuredClone(body);
      }
      if (body.event === "execution_ready") { state.status = "ready_for_execution"; state.decisions = structuredClone(body.decisions); }
      if (path.endsWith("/fail") && state.status !== "cancelled") { state.status = "failed"; state.error = body.error; }
      return { analysis: structuredClone(state) };
    },
    async issue() { assert.fail("Offline analysis must never submit orders or start screening"); },
  };
  return { state, archives, stageStarts, providerCalls, client, get currentStage() { return currentStage; } };
}

async function harness(durable, { failStage, holdResults = false } = {}) {
  const { options, maxConcurrentAgents } = await productionConfig();
  const ctx = new Context(), entrypoints = new Map();
  const stats = { active: 0, peak: 0, materialized: 0, disposed: 0, gated: 0, childReads: 0, upstream: {}, prompts: [], waiters: [] };
  let inject = Boolean(failStage);
  const notify = () => {
    for (const waiter of stats.waiters.splice(0)) {
      if (stats.materialized >= waiter.count) waiter.resolve();
      else stats.waiters.push(waiter);
    }
  };
  ctx.provide("systemPrompt", { tools() {}, section() {} });
  ctx.provide("analysisMeter", { begin() {}, bind() {}, async flush() { return {}; } });
  ctx.provide("web", { async search() { assert.fail("Production dedup must collect search through the registered read tool"); } });
  ctx.provide("subagents", {
    getProvider() { return { capabilities: { outputSchema: true } }; },
    async startActivation({ request, signal }) {
      const stage = durable.currentStage;
      durable.providerCalls[stage]++;
      if (inject && stage === failStage) { inject = false; throw new Error("injected offline child infrastructure failure"); }
      assert.ok(stats.active < 8, "the SDK's shared hard child cap must not be exceeded");
      stats.active++; stats.peak = Math.max(stats.peak, stats.active);
      const id = "production-child-" + (++stats.materialized);
      const child = { id, session: { id, events: [], surface: { nodes: [] } } };
      child.ctx = createScope(ctx, child).ctx;
      ctx.agents.enter(child, request.parent);
      ctx.agents.announce(child);
      const prompt = request.prompt.map(block => block.text ?? "").join(" ");
      stats.prompts.push({ stage, prompt });
      assert.match(prompt, /<shared_evidence>/, "the released cached script must actually run");
      assert.match(prompt, /OUTPUT LANGUAGE CONTRACT: Write all generated prose fields/);
      const symbol = prompt.match(/OFFLINE\d{2}/)?.[0] ?? targets[0];
      const controller = new AbortController();
      const childSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const result = (async () => {
        try {
          // Real registry admission and the policy's trusted worker-label gate
          // run before this synthetic model is permitted to return an answer.
          await ctx.waterfall(scopeTarget(child, child), "agent/pre-step", { agent: child, signal: childSignal, turn: 1, step: 1, messages: [] }, async () => ({ kind: "enter", messages: [] }));
          stats.gated++;
          if (stage === "base_research") {
            const read = await ctx.tools.execute({ callId: "snapshot-" + id, agent: child, name: "investment_market_snapshot", arguments: { symbol }, signal: childSignal });
            assert.equal(read.isError, false, JSON.stringify(read));
            assert.equal(read.value.symbol, symbol);
            stats.childReads++;
          }
          await sleep(holdResults ? 30000 : 2, undefined, { signal: childSignal });
          return { stopReason: "completed", output: [], structured: output(request.outputSchema, "", symbol) };
        } catch (error) {
          if (childSignal.aborted) return { stopReason: "cancelled", output: [] };
          throw error;
        }
      })();
      let disposed;
      const run = { childId: id, result, dispose() { return disposed ??= (async () => { controller.abort(); await result.catch(() => {}); await child.ctx.fiber.dispose(); stats.active--; stats.disposed++; })(); } };
      notify();
      return run;
    },
  });
  try {
    await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
    for (const name of ["investment_market_snapshot", "investment_market_history", "investment_fundamentals", "web_search"]) {
      ctx.tools.register(defineTool({ name, description: "Synthetic offline " + name, parameters: {
        symbol: { type: "string" }, market: { type: "string" }, lookback: { type: "number" }, query: { type: "string" },
      }, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      execute(args) {
        stats.upstream[name] = (stats.upstream[name] ?? 0) + 1;
        if (name === "investment_market_snapshot") return { ok: true, symbol: args.symbol, price: 100, name: "Fixture " + args.symbol, industry: "testing" };
        if (name === "investment_market_history") return { ok: true, symbol: args.symbol, data: [{ date: "2026-01-01", close: 100, volume: 100 }] };
        if (name === "investment_fundamentals") return { ok: true, symbol: args.symbol, records: [], warnings: [] };
        return { sources: [{ url: "https://fixtures.invalid/" + encodeURIComponent(args.query), title: "Synthetic source", snippet: "A synthetic offline fact." }] };
      } }));
    }
    ctx.provide("sandbox", {});
    ctx.provide("sandboxPolicy", { defaultMode: "danger-full-access", resolve: () => ({ mode: "danger-full-access", workspaceRoot: process.cwd() }) });
    ctx.provide("workingDirectory", { ensure: async () => process.cwd() });
    await ctx.plugin(LocalFileSystem, { cwd: process.cwd() });
    await ctx.plugin(LocalSubprocessRuntime); await ctx.plugin(NodePtcRuntime);
    await ctx.plugin(PtcWorkflowEngine, { provider: "synthetic", maxConcurrentAgents, maxTotalAgents: 500, maxItemsPerCall: 4096, syncTimeoutMs: 5000 });
    registerAnalysisWorkflow(ctx, durable.client, (_ctx, name, _description, _schema, execute) => entrypoints.set(name, execute), options);
    // Register the coordinator first, as the actual headless lifecycle does.
    const parent = { id: "production-parent", session: { id: "production-parent", events: [], surface: { nodes: [] } } };
    parent.ctx = createScope(ctx, parent).ctx; ctx.agents.enter(parent); ctx.agents.announce(parent);
    return {
      stats, maxConcurrentAgents,
      run() { return entrypoints.get("investment_analysis_workflow")({ market: "us", symbols: targets, cycle_id: durable.state.cycle_id, submit: false }, { agent: parent }); },
      async waitForChildren(count) {
        let timeout;
        try {
          await Promise.race([stats.materialized >= count ? Promise.resolve() : new Promise(resolve => stats.waiters.push({ count, resolve })), new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Synthetic children did not start")), 10000); })]);
        } finally { clearTimeout(timeout); }
      },
      async dispose() { await ctx.fiber.dispose(); },
    };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

function assertReleased(runtime) {
  assert.equal(runtime.stats.active, 0, "all child reservations must be released");
  assert.equal(runtime.stats.disposed, runtime.stats.materialized, "each admitted child must be disposed exactly once");
  assert.ok(runtime.stats.peak <= runtime.maxConcurrentAgents, "runtime concurrency must follow the actual shipped host setting");
}

async function autonomous(task) {
  const keys = ["ATA_AUTONOMOUS_ROUND", "INVESTMENT_CYCLE_ID", "ATA_ROUND_DEADLINE_MS"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.ATA_AUTONOMOUS_ROUND = "1";
  delete process.env.INVESTMENT_CYCLE_ID; delete process.env.ATA_ROUND_DEADLINE_MS;
  try { await task(); }
  finally { for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
}

test("sparse production config + dedup: 8 targets complete preparation and five real PTC stages", { timeout: 60000 }, () => autonomous(async () => {
  const durable = durableRun(), runtime = await harness(durable);
  try {
    const result = await runtime.run();
    assert.equal(result.status, "ready_for_execution");
    assert.equal(result.execution.status, "not_submitted");
    assert.equal(result.decisions.length, targets.length);
    assert.deepEqual(durable.stageStarts, ["data_preparation", ...stages]);
    assert.deepEqual(Object.keys(durable.state.checkpoints), stages);
    assert.equal(runtime.stats.materialized, 70);
    assert.equal(runtime.stats.gated, 70);
    assert.equal(runtime.stats.childReads, targets.length * 4);
    assert.equal(Object.keys(durable.archives.shared_research).length, targets.length);
    for (const tool of ["investment_market_snapshot", "investment_market_history", "investment_fundamentals", "web_search"]) assert.equal(runtime.stats.upstream[tool], targets.length, tool + " must reuse the prefetched evidence");
    assert.ok(durable.state.checkpoints.base_research.evidence_registry.length >= 32);
    assertReleased(runtime);
  } finally { await runtime.dispose(); }
}));

test("production durable retry restores completed roles without repeating their synthetic model calls", { timeout: 60000 }, () => autonomous(async () => {
  const durable = durableRun(), first = await harness(durable, { failStage: "portfolio_draft" });
  try {
    await assert.rejects(first.run(), /injected offline child infrastructure failure/);
    assert.equal(durable.state.status, "failed");
    assert.deepEqual(Object.keys(durable.state.checkpoints), stages.slice(0, 2));
    assertReleased(first);
  } finally { await first.dispose(); }
  const completedCalls = { base_research: durable.providerCalls.base_research, research_debate: durable.providerCalls.research_debate };
  durable.state.status = "running"; // The engine's explicit manual-resume admission.
  const resumed = await harness(durable);
  try {
    const result = await resumed.run();
    assert.equal(result.status, "ready_for_execution");
    assert.equal(result.resumed, true);
    assert.equal(result.decisions.length, targets.length);
    for (const stage of stages.slice(0, 2)) {
      assert.equal(durable.providerCalls[stage], completedCalls[stage]);
      assert.equal(durable.stageStarts.filter(value => value === stage).length, 1);
    }
    assert.equal(resumed.stats.materialized, 6, "only portfolio, risk and final managers must run after recovery");
    assert.deepEqual(Object.keys(durable.state.checkpoints), stages);
    assertReleased(resumed);
  } finally { await resumed.dispose(); }
}));

test("production cancellation stops queued roles, cleans children and preserves cancelled admission", { timeout: 30000 }, () => autonomous(async () => {
  const durable = durableRun(), runtime = await harness(durable, { holdResults: true });
  try {
    const pending = runtime.run();
    await runtime.waitForChildren(runtime.maxConcurrentAgents);
    durable.state.status = "cancelled"; // Same durable status observed by the workflow's polling loop.
    const result = await pending;
    assert.equal(result.status, "cancelled");
    assert.deepEqual(durable.stageStarts, ["data_preparation", "base_research"]);
    assert.equal(Object.keys(durable.state.checkpoints).length, 0);
    assert.ok(runtime.stats.materialized < targets.length * 4, "queued roles must not materialize after cancellation");
    assertReleased(runtime);
  } finally { await runtime.dispose(); }
  const retry = await harness(durable);
  try {
    assert.equal((await retry.run()).status, "cancelled");
    assert.equal(retry.stats.materialized, 0);
    assertReleased(retry);
  } finally { await retry.dispose(); }
}));
