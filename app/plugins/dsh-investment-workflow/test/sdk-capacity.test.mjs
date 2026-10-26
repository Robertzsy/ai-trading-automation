import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { DEFAULT_SCHEMA, Type, load } from "js-yaml";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { createScope } from "@deepseek-ai/dsh-scope";
import PtcWorkflowEngine from "@deepseek-ai/dsh-workflow-ptc";
import NodePtcRuntime from "@deepseek-ai/dsh-ptc-runtime-node";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import LocalFileSystem from "@deepseek-ai/dsh-fs-local";

// Real PTC processes and IPC, with deterministic child lifetimes instead of
// models. Reservations include materialization and remain held until disposal.
const HARD_CHILD_CAP = 8;
const symbols = Array.from({ length: 20 }, (_, index) => "FIXTURE" + index);
const roles = ["technical", "fundamentals", "news", "sentiment"];
const script = `
return await pipeline(args.symbols, async (_previous, symbol) => {
  const analyses = await parallel(args.roles.map(role => () => agent(
    symbol + ":" + role, { label: symbol + ":" + role, phase: "base_research" }
  )));
  return { symbol, analyses };
});`;

const yamlSchema = DEFAULT_SCHEMA.extend([
  // Preserve expressions as data. Config discovery must never execute !!js.
  new Type("tag:yaml.org,2002:js", { kind: "scalar", construct: value => value }),
]);

function allRows(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...Object.values(node).flatMap(allRows)];
}

async function publishedConcurrency() {
  const entries = [
    ["research host", "../../../profiles/investment/product/cordis.patch.yml", true],
    ["web host", "../../../profiles/investment-web/product/cordis.patch.yml", true],
    ["investment preset", "../../../presets/investment/agent.cordis.yml", false],
  ];
  const limits = [];
  for (const [label, relative, host] of entries) {
    const document = load(await readFile(new URL(relative, import.meta.url), "utf8"), { schema: yamlSchema });
    assert.ok(Array.isArray(document), label + " must be a patch sequence");
    const candidates = (host ? document : allRows(document)).filter(row => row?.id === "workflow-ptc");
    assert.equal(candidates.length, 1, label + " must explicitly configure its workflow engine");
    const limit = candidates[0].config?.maxConcurrentAgents;
    assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= HARD_CHILD_CAP,
      label + " must bound workflow concurrency within the subagent capacity");
    limits.push(limit);
    // The generated web profile also embeds the preset; catch a stale copy.
    if (label === "web host") {
      const embedded = allRows(document).filter(row => row?.id === "workflow-ptc");
      assert.ok(embedded.length > 1, "web profile must contain its embedded investment preset");
      for (const row of embedded) assert.equal(row.config?.maxConcurrentAgents, limit);
    }
  }
  assert.equal(new Set(limits).size, 1, "host and preset concurrency must agree");
  return limits[0];
}

async function harness(maxConcurrentAgents) {
  const ctx = new Context();
  const state = {
    active: 0, pending: 0, peak: 0, admitted: 0, materialized: 0,
    disposed: 0, rejected: 0, resultDelayMs: 8, waiters: [],
  };
  const notify = () => {
    for (const waiter of state.waiters.splice(0)) {
      if (state.materialized >= waiter.count) waiter.resolve();
      else state.waiters.push(waiter);
    }
  };
  ctx.provide("systemPrompt", { tools() {}, section() {} });
  ctx.provide("subagents", {
    getProvider() { return { capabilities: { outputSchema: true } }; },
    async startActivation({ request, signal }) {
      if (state.active >= HARD_CHILD_CAP) {
        state.rejected++;
        throw new Error("subagent limit reached (active child limit: 8)");
      }
      state.active++;
      state.pending++;
      state.admitted++;
      state.peak = Math.max(state.peak, state.active);
      try {
        await sleep(4, undefined, { signal });
        signal?.throwIfAborted();
      } catch (error) {
        state.active--;
        throw error;
      } finally {
        state.pending--;
      }
      const id = "synthetic-capacity-child-" + (++state.materialized);
      let resolveResult, resultTimer, disposed;
      const result = new Promise(resolve => { resolveResult = resolve; });
      const finishCancelled = () => resolveResult({ stopReason: "cancelled", output: [] });
      resultTimer = setTimeout(() => resolveResult({
        stopReason: "completed", output: [{ type: "text", text: request.prompt[0].text }],
      }), state.resultDelayMs);
      signal?.addEventListener("abort", finishCancelled, { once: true });
      const run = {
        childId: id, result,
        dispose() {
          return disposed ??= (async () => {
            clearTimeout(resultTimer);
            signal?.removeEventListener("abort", finishCancelled);
            finishCancelled();
            // Model completion alone must not free the provider reservation.
            await sleep(5);
            state.active--;
            state.disposed++;
          })();
        },
      };
      notify();
      return run;
    },
  });
  try {
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(AgentRegistry);
    ctx.provide("sandbox", {});
    ctx.provide("sandboxPolicy", { defaultMode: "danger-full-access", resolve: () => ({ mode: "danger-full-access", workspaceRoot: process.cwd() }) });
    ctx.provide("workingDirectory", { ensure: async () => process.cwd() });
    await ctx.plugin(LocalFileSystem, { cwd: process.cwd() });
    await ctx.plugin(LocalSubprocessRuntime);
    await ctx.plugin(NodePtcRuntime);
    await ctx.plugin(PtcWorkflowEngine, { provider: "synthetic", maxConcurrentAgents, maxTotalAgents: 100, maxItemsPerCall: 4096, syncTimeoutMs: 5000 });
    const parent = { id: "capacity-parent", session: { id: "capacity-parent", events: [], surface: { nodes: [] } } };
    parent.ctx = createScope(ctx, parent).ctx;
    ctx.agents.enter(parent);
    ctx.agents.announce(parent);
    return {
      state,
      start(signal) {
        return ctx.workflowEngine.start({
          script, args: { symbols, roles }, parent, maxTotalAgents: 100,
          meta: { name: "offline-capacity", description: "Synthetic child-capacity regression" },
          ...(signal ? { signal } : {}),
        });
      },
      waitForChildren(count) {
        if (state.materialized >= count) return Promise.resolve();
        return new Promise(resolve => state.waiters.push({ count, resolve }));
      },
      async dispose() { await ctx.fiber.dispose(); },
    };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

function assertReleased(state) {
  assert.equal(state.active, 0, "all provider reservations must be released");
  assert.equal(state.pending, 0, "all in-flight materializations must settle");
  assert.equal(state.disposed, state.materialized, "every published child must be disposed exactly once");
}

async function complete(run) {
  const result = await run.result;
  await run.dispose();
  assert.equal(result.stopReason, "completed", result.error);
  assert.equal(result.agentsStarted, symbols.length * roles.length);
  assert.equal(result.value.length, symbols.length);
  for (let index = 0; index < symbols.length; index++) {
    assert.equal(result.value[index].symbol, symbols[index]);
    assert.deepEqual(result.value[index].analyses, roles.map(role => symbols[index] + ":" + role));
  }
}

test("real PTC reproduces an oversized workflow pool hitting the child cap", { timeout: 30000 }, async () => {
  const runtime = await harness(16);
  try {
    const run = runtime.start();
    const result = await run.result;
    await run.dispose();
    assert.equal(result.stopReason, "error");
    assert.match(result.error, /subagent limit reached \(active child limit: 8\)/);
    assert.ok(runtime.state.rejected > 0);
    assertReleased(runtime.state);
  } finally { await runtime.dispose(); }
});

test("published host and preset settings queue 20 x 4 children and release capacity for the next run", { timeout: 30000 }, async () => {
  const limit = await publishedConcurrency();
  const runtime = await harness(limit);
  try {
    await complete(runtime.start());
    assertReleased(runtime.state);
    assert.equal(runtime.state.materialized, symbols.length * roles.length);
    await complete(runtime.start());
    assertReleased(runtime.state);
    assert.equal(runtime.state.materialized, 2 * symbols.length * roles.length);
    assert.equal(runtime.state.rejected, 0);
    assert.ok(runtime.state.peak <= limit);
  } finally { await runtime.dispose(); }
});

test("real PTC cancellation clears running and queued children before another run", { timeout: 30000 }, async () => {
  const limit = await publishedConcurrency();
  const runtime = await harness(limit);
  const controller = new AbortController();
  runtime.state.resultDelayMs = 1000;
  try {
    const run = runtime.start(controller.signal);
    let startTimer;
    try {
      await Promise.race([
        runtime.waitForChildren(limit),
        new Promise((_resolve, reject) => { startTimer = setTimeout(() => reject(new Error("No synthetic children reached the running state")), 10000); }),
      ]);
    } finally { clearTimeout(startTimer); }
    controller.abort("offline cancellation check");
    const result = await run.result;
    await run.dispose();
    assert.equal(result.stopReason, "cancelled");
    assertReleased(runtime.state);
    const cancelledCount = runtime.state.materialized;
    assert.ok(cancelledCount < symbols.length * roles.length, "queued tasks must not keep starting after cancellation");
    runtime.state.resultDelayMs = 8;
    await complete(runtime.start());
    assertReleased(runtime.state);
    assert.equal(runtime.state.materialized, cancelledCount + symbols.length * roles.length);
    assert.equal(runtime.state.rejected, 0);
    assert.ok(runtime.state.peak <= limit);
  } finally { controller.abort(); await runtime.dispose(); }
});
