import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAnalysisWorkflow } from "../../dsh-investment-tools/lib/analysis-workflow.js";

// Exercise the real executor without model calls, keeping both the raw archive
// and compact checkpoint payloads visible at the engine boundary.
function pipeline({ failAt, initialStatus = "running", onStart, cancelAfterCheckpoint } = {}) {
  const tools = new Map(), archives = {}, calls = [], started = [], disposed = [];
  const state = { cycle_id: "execution-test", status: initialStatus, checkpoints: {} };
  const longText = "研究证据".repeat(1000);
  const values = {
    base_research: [{ symbol: "AAPL", analyses: Array.from({ length: 4 }, () => ({ summary: longText, evidence: [{ id: "e1", claim: longText }] })) }],
    research_debate: [{ trader: { symbol: "AAPL", action: "HOLD" } }],
    portfolio_draft: { summary: "draft" },
    risk_review: { summary: "risk" },
    final_decision: { summary: "final", decisions: [] },
  };
  const ctx = {
    on() {},
    workflowEngine: {
      start(options) {
        const stage = options.meta.name.replace("investment-", "").replaceAll("-", "_");
        started.push({ stage, signal: options.signal });
        const result = onStart?.(stage, options.signal, state) ?? Promise.resolve(
          stage === failAt ? { stopReason: "error", error: "synthetic stage failure" } : { stopReason: "completed", value: values[stage], agentsStarted: 1 },
        );
        return { id: stage, result, async dispose() { disposed.push(stage); } };
      },
    },
  };
  const client = {
    async get(path) {
      if (path === "/api/config") return { config: {} };
      if (path === "/api/mandate") return { mandate: {} };
      if (path.startsWith("/api/analysis/run?")) return { ok: true, analysis: structuredClone(state) };
      return {};
    },
    async post(path, body) {
      calls.push({ path, body: structuredClone(body) });
      if (path.endsWith("/archive")) Object.assign(archives, structuredClone(body.stages));
      if (path.endsWith("/update") && state.status !== "cancelled") {
        if (body.event === "checkpoint") {
          state.checkpoints[body.stage] = { result: body.result };
          if (body.stage === cancelAfterCheckpoint) state.status = "cancelled";
        }
        if (body.event === "execution_ready") state.status = "ready_for_execution";
      }
      if (path.endsWith("/fail") && state.status !== "cancelled") state.status = "failed";
      return { ok: true, analysis: structuredClone(state) };
    },
  };
  registerAnalysisWorkflow(ctx, client, (_ctx, name, _description, _schema, execute) => tools.set(name, execute));
  return {
    archives, calls, started, disposed, state, longText,
    execute: (exec = { agent: {} }) => tools.get("investment_analysis_workflow")({ market: "us", symbols: ["AAPL"], cycle_id: state.cycle_id, submit: false }, exec),
    status: () => tools.get("investment_analysis_status")({ cycle_id: state.cycle_id }),
  };
}

async function headless(body) {
  const previous = process.env.ATA_AUTONOMOUS_ROUND;
  process.env.ATA_AUTONOMOUS_ROUND = "1";
  try { return await body(); }
  finally {
    if (previous === undefined) delete process.env.ATA_AUTONOMOUS_ROUND;
    else process.env.ATA_AUTONOMOUS_ROUND = previous;
  }
}

test("executor archives raw stage evidence while checkpointing compact values", () => headless(async () => {
  const run = pipeline();
  const result = await run.execute();
  assert.equal(result.status, "ready_for_execution");
  assert.equal(run.archives.base_research[0].analyses[0].summary, run.longText);
  assert.equal(run.archives.base_research[0].analyses[0].evidence[0].claim, run.longText);
  assert.equal(run.state.checkpoints.base_research.result[0].analyses[0].summary.length, 1601);
  assert.equal(Object.keys(run.archives).length, 5);
}));

test("completed research remains archived when a later stage fails", () => headless(async () => {
  const run = pipeline({ failAt: "risk_review" });
  await assert.rejects(run.execute(), /synthetic stage failure/);
  assert.equal(run.state.status, "failed");
  assert.equal(run.archives.base_research[0].analyses[0].summary, run.longText);
  assert.deepEqual(Object.keys(run.archives), ["base_research", "research_debate", "portfolio_draft"]);
}));

test("stopping an active stage aborts its children and admits no later stages", { timeout: 5000 }, () => headless(async () => {
  const run = pipeline({ onStart(_stage, signal, state) {
    state.status = "cancelled";
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ stopReason: "error", error: "cancellation was not delivered" }), 3000);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve({ stopReason: "cancelled" }); }, { once: true });
    });
  } });
  const result = await run.execute();
  assert.equal(result.status, "cancelled");
  assert.equal(result.done, true);
  assert.equal(run.started.length, 1);
  assert.equal(run.started[0].signal.aborted, true);
  assert.deepEqual(run.disposed, ["base_research"]);
  assert.equal(run.calls.some(({ path }) => path.endsWith("/fail")), false);
}));

test("cancellation between stages prevents the next stage from starting", () => headless(async () => {
  const run = pipeline({ cancelAfterCheckpoint: "base_research" });
  const result = await run.execute();
  assert.equal(result.status, "cancelled");
  assert.equal(run.started.length, 1);
  assert.equal(run.archives.base_research[0].analyses[0].summary, run.longText);
}));

test("a cancelled run is replayed without starting research and its poller is done", () => headless(async () => {
  const run = pipeline({ initialStatus: "cancelled" });
  assert.equal((await run.execute()).status, "cancelled");
  assert.equal(run.started.length, 0);
  assert.equal((await run.status()).done, true);
}));

test("the caller abort signal still reaches the workflow stage", () => headless(async () => {
  const controller = new AbortController();
  const run = pipeline({ onStart(_stage, signal) {
    return new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ stopReason: "cancelled" }), { once: true });
      controller.abort(new Error("caller stopped"));
    });
  } });
  await assert.rejects(run.execute({ agent: {}, signal: controller.signal }), /caller stopped/);
  assert.equal(run.started.length, 1);
  assert.deepEqual(run.disposed, ["base_research"]);
}));
