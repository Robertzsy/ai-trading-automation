import { test } from "node:test";
import assert from "node:assert/strict";
import { singleRoundAttempt, installCoordinatorGuard, saveCheckpoint } from "../../dsh-investment-tools/lib/round-recovery.js";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import { createScope } from "@deepseek-ai/dsh-scope";

test("real SDK enforces coordinator guard without restricting child research", async () => {
  const previous = process.env.ATA_AUTONOMOUS_ROUND;
  process.env.ATA_AUTONOMOUS_ROUND = "1";
  const ctx = new Context(); ctx.provide("systemPrompt", { tools() {}, section() {} });
  try {
    await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
    let writes = 0;
    ctx.tools.register(defineTool({ name: "edit", description: "write", parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: () => [] }, execute() { writes++; return {}; } }));
    installCoordinatorGuard(ctx);
    const create = (id, owner) => {
      const agent = { id, session: { id, events: [], surface: { nodes: [] } } };
      agent.ctx = createScope(ctx, agent).ctx; ctx.agents.enter(agent, owner); ctx.agents.announce(agent); return agent;
    };
    const parent = create("coordinator"), child = create("analyst", parent);
    const execute = agent => ctx.tools.execute({ callId: agent.id, agent, name: "edit", arguments: {}, signal: new AbortController().signal });
    assert.equal((await execute(parent)).isError, true); assert.equal(writes, 0);
    assert.equal((await execute(child)).isError, false); assert.equal(writes, 1);
  } finally { await ctx.fiber.dispose(); if (previous === undefined) delete process.env.ATA_AUTONOMOUS_ROUND; else process.env.ATA_AUTONOMOUS_ROUND = previous; }
});

test("headless coordinator cannot repair code but child research tools still work", () => {
  const previous = process.env.ATA_AUTONOMOUS_ROUND;
  process.env.ATA_AUTONOMOUS_ROUND = "1";
  try {
    let created, guard;
    installCoordinatorGuard({ on(name, callback) { assert.equal(name, "agent/created"); created = callback; } });
    created({ agent: { id: "parent", ctx: { get() { return { guard(callback) { guard = callback; } }; } } } });
    assert.match(guard({ name: "pwsh", agent: { id: "parent" } }), /停止/);
    assert.match(guard({ name: "edit", agent: { id: "parent" } }), /后台研究/);
    assert.equal(guard({ name: "investment_analysis_workflow", agent: { id: "parent" } }), undefined);
    assert.equal(guard({ name: "pwsh", agent: { id: "child" } }), undefined);
    assert.equal(guard({ name: "web_search", agent: { id: "child" } }), undefined);
  } finally { if (previous === undefined) delete process.env.ATA_AUTONOMOUS_ROUND; else process.env.ATA_AUTONOMOUS_ROUND = previous; }
});

test("checkpoint validation failure is not retried", async () => {
  let calls = 0;
  await assert.rejects(saveCheckpoint({ async post() { calls++; throw new Error("HTTP 400: invalid evidence"); } }, {}), /400/);
  assert.equal(calls, 1);
});

test("failed checkpoint writes are bounded and never redo model work", async () => {
  let calls = 0;
  await assert.rejects(saveCheckpoint({ async post() { calls++; throw new Error("fetch failed"); } }, {}), /fetch failed/);
  assert.equal(calls, 3);
});
