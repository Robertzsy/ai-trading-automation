/** Product usage telemetry. Never persists prompts, credentials or account data. */
import { randomUUID, createHash } from "node:crypto";

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function normalizeUsage(value, format = "sdk") {
  if (!value) return null;
  const input = count(format === "sdk" ? value.inputTokens : value.input_tokens);
  const output = count(format === "sdk" ? value.outputTokens : value.output_tokens);
  if (input === null || output === null) return null;
  const read = count(format === "sdk" ? value.cacheReadTokens : value.cache_read_input_tokens);
  const write = count(format === "sdk" ? value.cacheWriteTokens : value.cache_creation_input_tokens);
  return { input_tokens: input + (read ?? 0) + (write ?? 0), output_tokens: output,
    cache_read_tokens: read, cache_write_tokens: write, uncached_input_tokens: read === null ? null : input + (write ?? 0),
    reasoning_tokens: count(format === "sdk" ? value.reasoningTokens : value.reasoning_tokens),
    native_searches: count(value.server_tool_use?.web_search_requests) };
}

export function installAnalysisMeter(ctx, client) {
  if (typeof ctx.on !== "function") return { begin() {}, bind() {}, async flush() { return { pending_usage_events: 0 }; } };
  const agents = () => ctx.get?.("agents"), cycles = new Map(), identities = new WeakMap(), sessions = new Map(), pending = new WeakMap();
  let unattributed = 0;
  let queue = Promise.resolve();
  const unsent = new Map();
  const send = (cycleId, request) => {
    const payload = { cycle_id: cycleId, event: "model_usage", request };
    unsent.set(request.request_id, payload);
    queue = queue.then(async () => { await client.post("/api/analysis/runs/events", payload, { timeoutMs: 10000 }); unsent.delete(request.request_id); }).catch(() => {});
  };
  const locate = (agent, sessionId) => identities.get(agent) ?? sessions.get(String(sessionId ?? ""));
  const record = (agent, row, sessionId) => {
    let identity = agent ? locate(agent, sessionId) : sessions.get(String(sessionId ?? ""));
    if (!identity && !agent && cycles.size === 1) identity = { cycleId: cycles.keys().next().value, stage: "auxiliary", label: "auxiliary", attribution: "single_cycle_inference" };
    if (identity) send(identity.cycleId, { ...row, ...identity, agent_id: agent ? String(agent.id) : null });
    else if (agent) { const rows = pending.get(agent) ?? []; rows.push(row); if (rows.length > 100) unattributed++; pending.set(agent, rows.slice(-100)); }
    else if (cycles.size) unattributed++;
  };
  ctx.on("llm/stream", (options, next) => {
    const agent = agents()?.currentInitiator?.();
    const row = { request_id: randomUUID(), channel: "chat", provider: options.provider, model: options.model,
      purpose: options.purpose ?? "analysis", reasoning_effort: options.reasoningEffort ?? null, max_tokens: options.maxTokens ?? null,
      tool_count: options.tools?.length ?? 0, tool_schema_version: createHash("sha256").update(JSON.stringify(options.tools ?? [])).digest("hex").slice(0, 20),
      system_chars: options.system?.length ?? 0, started_at: new Date().toISOString() };
    return (async function* () {
      let usage = null, finish = "unknown", error = null;
      try { for await (const chunk of next()) { if (chunk.type === "usage") usage = normalizeUsage(chunk.usage); if (chunk.type === "finish") finish = chunk.reason?.kind ?? chunk.finish?.kind ?? "unknown"; yield chunk; } }
      catch (failure) { error = String(failure.code ?? "transport_error"); throw failure; }
      finally { record(agent, { ...row, finished_at: new Date().toISOString(), finish_reason: finish, error, usage, metered: usage !== null }, options.sessionId); }
    })();
  });
  ctx.on("research/model-usage", (agent, row) => record(agent, row));
  return {
    begin(cycleId, parent) {
      cycles.set(cycleId, true);
      if (cycles.size > 8) cycles.delete(cycles.keys().next().value);
      if (!parent) return;
      const identity = { cycleId, stage: "orchestration", label: "parent", attribution: "agent" };
      identities.set(parent, identity); if (parent.session?.id) sessions.set(String(parent.session.id), identity);
      for (const row of pending.get(parent) ?? []) record(parent, row); pending.delete(parent);
    },
    bind(cycleId, stage, childId, label) {
      const agent = agents()?.get?.(childId);
      const identity = { cycleId, stage, label, attribution: "agent" };
      if (agent) { identities.set(agent, identity); if (agent.session?.id) sessions.set(String(agent.session.id), identity); }
      while (sessions.size > 256) sessions.delete(sessions.keys().next().value);
    },
    async flush(cycleId) {
      await queue;
      for (const [id, payload] of unsent) { try { await client.post("/api/analysis/runs/events", payload, { timeoutMs: 10000 }); unsent.delete(id); } catch { /* kept pending; the stage records telemetry gaps below */ } }
      const status = { pending_usage_events: [...unsent.values()].filter(row => !cycleId || row.cycle_id === cycleId).length,
        unattributed_requests: unattributed, attribution_scope: "process", request_coverage: "observed_requests" };
      if (cycleId) try { await client.post("/api/analysis/runs/events", { cycle_id: cycleId, event: "model_usage_status", telemetry: status }); } catch { status.status_delivery_failed = true; }
      return status;
    },
  };
}
