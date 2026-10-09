import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createServer } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import * as workflowPlugin from "../lib/index.js";
import { contextJson, collectResearchPackets, cacheWorkflowScripts } from "../../dsh-investment-tools/lib/analysis-cache.js";
import { WORKFLOW_AGENT_SCHEMAS } from "../../dsh-investment-tools/lib/analysis-workflow.js";

async function runScript(stage, args, response) {
  const calls = [];
  const result = await runInNewContext(`(async () => { ${cacheWorkflowScripts(WORKFLOW_AGENT_SCHEMAS)[stage]} })()`, {
    args, phase() {},
    async parallel(tasks) { return Promise.all(tasks.map(task => task())); },
    async pipeline(items, task) { const result = []; for (const item of items) result.push(await task(null, item)); return result; },
    async agent(prompt, options) { calls.push({ prompt, ...options }); return response(options, calls.length); },
  });
  return { calls, result };
}

test("shared collection fetches each source once and discloses partial failures", async () => {
  const urls = [], queries = [];
  const client = { async get(url) { urls.push(url); if (url.includes('history')) throw new Error('offline'); return { price: 1 }; } };
  const ctx = { web: { async search(request) { queries.push(request.query); return { sources: [{ url: 'https://example.com/notice', publishedAt: '2026-10-09' }] }; } } };
  const packet = await collectResearchPackets(ctx, client, ['00700'], 'hk', { mandate: { max_position_pct: .1 } });
  assert.equal(urls.length, 3);
  assert.equal(queries.length, 1);
  assert.equal(packet['00700'].snapshot.price, 1);
  assert.equal(packet['00700'].history.unavailable, true);
  assert.match(packet['00700'].history.error, /offline/);
  assert.equal(packet['00700'].news.items[0].published_at, '2026-10-09');
  assert.match(queries[0], /政策、资金及市场情绪/);
});

test("cancelled collection does not swallow the cancellation as a data gap", async () => {
  const controller = new AbortController(); controller.abort(new Error('stopped'));
  await assert.rejects(() => collectResearchPackets({}, {}, ['00700'], 'hk', { signal: controller.signal }), /stopped/);
});

test("real Cordis-loaded workflow collects shared news through the optional service", async () => {
  const previous = process.env.ATA_AUTONOMOUS_ROUND;
  process.env.ATA_AUTONOMOUS_ROUND = "1";
  const root = new Context(), tools = [], searches = [];
  let stageArgs;
  root.provide("tools", { register(tool) { tools.push(tool); } });
  root.provide("workflowEngine", { start(request) { stageArgs = request.args; throw new Error("stop after collection"); } });
  root.provide("web", { async search({ query }) { searches.push(query); return { sources: [{ url: "https://example.com/notice" }] }; } });
  const server = createServer((req, res) => {
    req.resume(); req.on("end", () => {
      const body = req.url === "/api/mandate" ? { mandate: {} }
        : req.url === "/api/config" ? { config: {} }
        : req.url.startsWith("/api/analysis/runs?") ? { runs: [] }
        : req.url.startsWith("/api/analysis/") ? { analysis: { status: "running", checkpoints: {} } }
        : { control: {}, holdings: [] };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, ...body }));
    });
  });
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    await root.plugin(workflowPlugin, { engineUrl: `http://127.0.0.1:${server.address().port}`, sharedResearch: true });
    const tool = tools.find(tool => tool.name === "investment_analysis_workflow");
    assert(tool, "the actual plugin must finish loading");
    await assert.rejects(() => tool.execute({ market: "hk", symbols: ["00700"], submit: false }, { agent: { id: "test", session: { events: [] } } }), /stop after collection/);
    assert.equal(searches.length, 1);
    assert.equal(stageArgs.packets["00700"].news.status, "ok");
    assert.equal(stageArgs.packets["00700"].news.items[0].source_url, "https://example.com/notice");
  } finally {
    await root.fiber.dispose();
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.ATA_AUTONOMOUS_ROUND; else process.env.ATA_AUTONOMOUS_ROUND = previous;
  }
});

test("bounded text remains valid JSON and preserves all evidence identities and opinions", () => {
  const evidence = Array.from({ length: 60 }, (_, id) => ({ id: 'E' + id, source: 'https://example.com/' + id, claim: '事实'.repeat(2500) }));
  const views = Array.from({ length: 9 }, (_, role) => ({ role, assessment: '意见'.repeat(2500), evidence_ids: ['E59'] }));
  const citation = 'https://example.com/news?source=' + 'a'.repeat(2000);
  const parsed = JSON.parse(contextJson({ evidence, views, news: { source_url: citation, canonical_url: citation } }));
  assert.equal(parsed.evidence.length, 60);
  assert.equal(parsed.views.length, 9);
  assert.equal(parsed.evidence[59].id, 'E59');
  assert.equal(parsed.evidence[59].source, 'https://example.com/59');
  assert.deepEqual(parsed.views[8].evidence_ids, ['E59']);
  assert.equal(parsed.news.source_url, citation);
  assert.equal(parsed.news.canonical_url, citation);
  assert.match(parsed.views[8].assessment, /文本节选/);
});

test("four base roles receive the identical evidence prefix and original schema", async () => {
  const { calls } = await runScript('base_research', { symbols: ['00700'], market: 'hk', roles: ['a','b','c','d'], role_instructions: { a:'技术',b:'基本面',c:'新闻',d:'情绪' }, packets: { '00700': { symbol: '00700', history: { rows: [1,2,3] } } } }, () => ({ summary:'ok' }));
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(call => call.prompt.split('<role_instruction>')[0])).size, 1);
  assert(calls.every(call => call.schema.required.includes('data_quality')));
});

test("research manager retains every debate round and shares exactly the same base material", async () => {
  const { calls } = await runScript('research_debate', { research: [{ symbol:'00700', analyses:[{ evidence:[{id:'E1'}] }] }], rounds:3, mandate:{}, holdings:{} }, options => options.label.includes('manager') ? { verdict:'HOLD' } : { side:options.label, thesis:'理由'.repeat(2500), evidence_ids:['E1'] });
  assert.equal(calls.length, 8);
  const manager = calls.find(call => call.label.endsWith('research-manager'));
  assert.equal(manager.prompt.split('</shared_evidence>')[0], calls[0].prompt.split('</shared_evidence>')[0]);
  assert.match(manager.prompt, /bear-r3/);
  assert.match(manager.prompt, /bull-r3/);
  assert(manager.schema.required.includes('verdict'));
});

test("risk manager receives all nine opinions without double-encoding the material", async () => {
  const { calls } = await runScript('risk_review', { draft:{ summary:'保留现金' }, portfolio:{}, mandate:{}, rounds:3 }, options => ({ role:options.label, assessment:'意见'.repeat(2500), evidence_ids:['E1'] }));
  assert.equal(calls.length, 10);
  const manager = calls.at(-1);
  assert.equal(manager.prompt.split('</shared_evidence>')[0], calls[0].prompt.split('</shared_evidence>')[0]);
  for (const role of ['aggressive','conservative','neutral']) assert.match(manager.prompt, new RegExp('risk-' + role + '-r3'));
  const material = manager.prompt.split('<shared_evidence>\n')[1].split('\n</shared_evidence>')[0];
  assert.equal(JSON.parse(material).draft.summary, '保留现金');
});

test("a failed debate child prevents downstream manager and trader calls", async () => {
  let calls = 0;
  await assert.rejects(runScript("research_debate", { research: [{ symbol: "00700", analyses: [] }], rounds: 1, mandate: {}, holdings: {} }, () => (++calls === 1 ? null : { side: "bear" })), /停止后续经理/);
  assert.equal(calls, 2);
});

test("a failed risk child prevents the risk manager from running", async () => {
  let calls = 0;
  await assert.rejects(runScript("risk_review", { draft: {}, portfolio: {}, mandate: {}, rounds: 1 }, () => (++calls === 1 ? null : { role: "neutral" })), /停止后续经理/);
  assert.equal(calls, 3);
});
