import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
import { analysisSummary, uniformSchema, uniformScript, validateStage } from "../../dsh-investment-tools/lib/research-contract.js";
import { WORKFLOW_AGENT_SCHEMAS as schemas } from "../../dsh-investment-tools/lib/analysis-workflow.js";
import { cacheWorkflowScripts } from "../../dsh-investment-tools/lib/analysis-cache.js";

const registry = [{ id: "quote-a", symbol: "AAPL", source: "investment_market_snapshot" }, { id: "quote-b", symbol: "MSFT", source: "investment_market_snapshot" }, { id: "mandate", symbol: null, source: "investment_mandate" }];
const decisions = [{ symbol: "AAPL", action: "HOLD", target_weight: 0, confidence: .5, reason: "缺口", evidence_ids: ["quote-a", "mandate"] }];

test("uniform output accepts all role schemas and rejects malformed envelopes", () => {
  const schema = uniformSchema(schemas);
  assert.deepEqual(validateJsonSchemaValue(schema, { kind: "trader", result: decisions[0] }), []);
  assert(validateJsonSchemaValue(schema, { kind: "rogue", result: decisions[0] }).length);
  assert(validateJsonSchemaValue(schema, { kind: "trader", result: {} }).length);
});

test("role wrapper presents identical wire schema and unwraps the exact requested kind", async () => {
  const calls = [];
  const script = `const a = await agent("a", {schema:${JSON.stringify(schemas.trader)}}); const b = await agent("b", {schema:${JSON.stringify(schemas.finalDecision)}}); return [a,b];`;
  const result = await runInNewContext(`(async () => {${uniformScript(script, schemas)}})()`, { async agent(prompt, options) {
    calls.push(options.schema);
    return prompt.includes('kind:"trader"') ? { kind: "trader", result: decisions[0] } : { kind: "finalDecision", result: { summary: "done", decisions, risks: [] } };
  } });
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(calls[1])); assert.equal(result[0].symbol, "AAPL");
  await assert.rejects(runInNewContext(`(async () => {${uniformScript(script, schemas)}})()`, { agent: async () => ({ kind: "baseResearch", result: {} }) }), /Invalid role result kind/);
});

test("strict stage validation rejects dangling and cross-stock references", () => {
  const result = { summary: "done", decisions, risks: [] };
  assert.doesNotThrow(() => validateStage("final_decision", result, schemas, ["AAPL"], registry));
  const dangling = structuredClone(result); dangling.decisions[0].evidence_ids = ["invented"];
  assert.throws(() => validateStage("final_decision", dangling, schemas, ["AAPL"], registry), /未登记/);
  const crossed = structuredClone(result); crossed.decisions[0].evidence_ids = ["quote-b"];
  assert.throws(() => validateStage("final_decision", crossed, schemas, ["AAPL"], registry), /跨股票/);
  assert.throws(() => validateStage("final_decision", { ...result, decisions: [decisions[0], decisions[0]] }, schemas, ["AAPL"], registry), /重复/);
});

test("a valid but wrong-role object fails exact stage schema validation", () => {
  assert.throws(() => validateStage("risk_review", { views: [], manager: { summary: "x", decisions } }, schemas, ["AAPL"], registry), /三方意见/);
  assert.throws(() => validateStage("final_decision", { symbol: "AAPL", role: "news_analyst", evidence: [] }, schemas, ["AAPL"], registry), /不完整/);
});

test("every base role must be unique and cite a registered actual source", () => {
  const roles = ["technical_analyst", "fundamentals_analyst", "news_analyst", "sentiment_analyst"];
  const value = [{ symbol: "AAPL", analyses: roles.map(role => ({ symbol: "AAPL", role, summary: "gap", stance: "unknown", confidence: .1,
    evidence: [{ id: "quote-a", title: "quote", source: "investment_market_snapshot", claim: "price" }], risks: [], data_quality: "gap" })) }];
  assert.doesNotThrow(() => validateStage("base_research", value, schemas, ["AAPL"], registry));
  const wrong = structuredClone(value); wrong[0].analyses[0].evidence[0].source = "https://invented.invalid";
  assert.throws(() => validateStage("base_research", wrong, schemas, ["AAPL"], registry), /无法追溯/);
  value[0].analyses[0].role = "news_analyst";
  assert.throws(() => validateStage("base_research", value, schemas, ["AAPL"], registry), /角色身份/);
});

test("summary drops checkpoint payloads and preserves exact decision bytes and execution receipts", () => {
  const run = { cycle_id: "c", status: "ready_for_execution", completed_agents: 14, decisions, execution: { fills: [1] },
    checkpoints: { base_research: "long".repeat(30000) }, agents: { a: {} }, stages: {} };
  const result = analysisSummary(run);
  assert.equal(result.checkpoints, undefined); assert.equal(result.agents, undefined);
  assert.equal(JSON.stringify(result.decisions), JSON.stringify(decisions)); assert.equal(result.completed_agents, 14);
  assert.deepEqual(result.details, { tool: "investment_analysis_status", cycle_id: "c", detail: true });
});

test("registered IDs reach every role prompt without removing debate or risk opinions", () => {
  for (const script of Object.values(cacheWorkflowScripts(schemas))) assert.match(script, /args.evidence_registry/);
});
