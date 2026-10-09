/** Round-local evidence gateway. Never used for account writes or controls. */
import { createHash } from "node:crypto";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { roleContract, validateRoleOutput } from "./research-contract.js";

export const RESEARCH_TOOLS = Object.freeze([
  "investment_market_snapshot", "investment_market_history", "investment_fundamentals", "investment_security_search",
  "investment_portfolio", "investment_mandate", "investment_macro_latest",
  "investment_report_latest", "investment_reports", "web_search", "web_fetch",
]);
const READS = new Set(RESEARCH_TOOLS);
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 20);
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function readArgs(tool, input = {}) {
  const args = { ...input };
  if (typeof args.market === "string") args.market = args.market.toLowerCase();
  if (tool === "investment_market_history") args.lookback = Math.trunc(args.lookback ?? 60);
  if (tool === "investment_reports") args.limit = Math.trunc(args.limit ?? 10);
  return canonical(args);
}
export function evidenceIndex(records) {
  return records.flatMap(record => {
    const symbol = record.symbol ?? record.args.symbol ?? null;
    const rows = [{ id: record.id, symbol, source: record.tool === "web_fetch" ? record.args.url : record.tool, data_version: record.data_version, collected_at: record.collected_at }];
    const sources = [...(record.value?.sources ?? [])];
    if (record.tool === "investment_fundamentals") {
      for (const item of record.value?.records ?? []) if (item.source_url && !sources.some(source => source.url === item.source_url)) {
        sources.push({ url: item.source_url, title: "公司财报：" + item.period_end, publishedAt: item.disclosed_at });
      }
    }
    for (const source of sources) rows.push({ id: record.id + "-" + hash(source.url), symbol, source: source.url, title: source.title ?? "", published_at: source.publishedAt ?? null, data_version: record.data_version });
    return rows;
  });
}
function waitFor(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? new Error("aborted")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
function loadRead(definition, args, exec, sharedSignal) {
  const signal = AbortSignal.any([sharedSignal, AbortSignal.timeout(definition.timeoutMs ?? 60000)]);
  return waitFor(Promise.resolve().then(() => definition.execute(args, { ...exec, signal })), signal);
}

export class ResearchGateway {
  constructor({ cycleId, market, symbols, signal, mode = "observe", supplementalReads = 2, maxReadAttempts = 6, now = Date.now }) {
    this.cycleId = cycleId; this.market = market; this.symbols = new Set(symbols);
    this.version = new Date(now()).toISOString(); this.now = now; this.mode = mode;
    this.supplementalReads = supplementalReads; this.maxReadAttempts = maxReadAttempts;
    this.entries = new Map(); this.failures = new Map(); this.prefetched = new Set(); this.children = new Map();
    this.stats = { attempts: 0, upstream: 0, coalesced: 0, reused: 0, projected: 0, failures: 0, denied: 0, would_block: 0, returned_chars: 0 };
    this.archive = []; this.closed = false;
    this.controller = new AbortController();
    this.abort = () => this.close(signal?.reason);
    signal?.addEventListener("abort", this.abort, { once: true }); this.signal = signal;
    if (signal?.aborted) this.close(signal.reason);
  }
  key(tool, args, stock = "") {
    if (!READS.has(tool)) throw new Error("Research gateway accepts approved read-only tools only: " + tool);
    return JSON.stringify([this.cycleId, this.market, args.symbol ?? stock, tool, readArgs(tool, args), this.version]);
  }
  child(id, stage, label) {
    if (!this.children.has(id)) this.children.set(id, { id, stage, label, attempts: 0, supplemental: new Set(), requests: 0, violations: [], epoch: 0, delivered: new Set() });
    return this.children.get(id);
  }
  violation(child, reason) {
    this.stats.would_block++;
    if (this.mode === "enforce") this.stats.denied++;
    child?.violations.push(reason);
    if (this.mode === "enforce") throw new Error(reason + "；请报告资料缺口并提交 structured_output，不要换词反复重试。");
  }
  async read(tool, args, loader, { signal, child, prefetch = false, stock = "" } = {}) {
    this.controller.signal.throwIfAborted(); signal?.throwIfAborted();
    const normalized = readArgs(tool, args);
    const labelSymbol = child?.label.split(":")[0];
    const scopedSymbol = stock || (this.symbols.has(labelSymbol) ? labelSymbol : "");
    const key = this.key(tool, normalized, ["web_search", "web_fetch", "investment_security_search"].includes(tool) ? scopedSymbol : "");
    this.stats.attempts++;
    if (child) {
      child.attempts++;
      if (normalized.symbol && !this.symbols.has(normalized.symbol)) this.violation(child, "不能读取本轮之外的股票 " + normalized.symbol);
      if (normalized.market && normalized.market !== this.market) this.violation(child, "不能读取本轮之外的市场");
      // Individual stock roles cannot silently use another target's facts.
      const expected = child.label.split(":")[0];
      if (normalized.symbol && this.symbols.has(expected) && normalized.symbol !== expected) this.violation(child, "不能读取其他股票的证据");
      if (child.stage !== "base_research") this.violation(child, "该阶段只使用上游证据，不新增外部事实");
      if (child.attempts > this.maxReadAttempts) this.violation(child, "只读取证调用次数已达到上限 " + this.maxReadAttempts);
      if (!this.prefetched.has(key)) child.supplemental.add(key);
      if (child.supplemental.size > this.supplementalReads) this.violation(child, "补充取证预算已达到上限 " + this.supplementalReads);
    }
    if (prefetch) this.prefetched.add(key);
    let entry = this.entries.get(key);
    if (entry?.value !== undefined && entry.expires <= this.now()) { this.entries.delete(key); entry = undefined; }
    if (!entry) {
      if ((this.failures.get(key) ?? 0) >= 2) throw new Error("相同取证请求已失败两次，受控重试耗尽");
      const controller = new AbortController();
      const id = "E-" + hash(key);
      const stockScoped = ["investment_market_snapshot", "investment_market_history", "investment_fundamentals", "investment_security_search", "web_search", "web_fetch"].includes(tool);
      entry = { id, key, tool, args: normalized, symbol: stockScoped ? scopedSymbol || normalized.symbol || null : null, waiters: 0, controller, value: undefined };
      this.entries.set(key, entry); this.stats.upstream++;
      const current = entry;
      current.promise = Promise.resolve().then(() => loader(AbortSignal.any([controller.signal, this.controller.signal]))).then(value => {
        if (!value || typeof value !== "object" || value.ok === false || value.unavailable === true || value.statusCode >= 400) throw new Error(value?.error ?? "取证接口未返回有效资料");
        this.controller.signal.throwIfAborted(); controller.signal.throwIfAborted();
        current.value = structuredClone(value);
        current.expires = this.now() + (tool.startsWith("investment_market_") ? 60000 : 600000);
        current.version = hash(JSON.stringify(canonical(value)));
        // Identity follows facts, not a random round/time nonce. The request
        // memo remains round-local; changed data always gets a different ID.
        current.id = "E-" + hash(JSON.stringify([this.market, current.symbol, tool, normalized, current.version]));
        this.archive.push({ id: current.id, tool, args: normalized, symbol: current.symbol, data_version: current.version, collected_at: new Date(this.now()).toISOString(), value: structuredClone(value) });
        return current;
      }).catch(error => {
        if (this.entries.get(key) === current) this.entries.delete(key);
        if (!controller.signal.aborted && !this.controller.signal.aborted) {
          this.failures.set(key, (this.failures.get(key) ?? 0) + 1); this.stats.failures++;
        }
        throw error;
      });
      // A cancelled last waiter may leave a provider that ignores cancellation.
      current.promise.catch(() => {});
    } else if (entry.value !== undefined) this.stats.reused++;
    else this.stats.coalesced++;
    entry.waiters++;
    try {
      const ready = await waitFor(entry.promise, signal);
      return { entry: ready, value: structuredClone(ready.value) };
    } finally {
      entry.waiters--;
      if (!entry.waiters && entry.value === undefined) {
        entry.controller.abort(new Error("No evidence readers remain"));
        if (this.entries.get(key) === entry) this.entries.delete(key);
      }
    }
  }
  summary() {
    return { cycle_id: this.cycleId, mode: this.mode, data_version: this.version, ...this.stats,
      limits: { supplemental_reads: this.supplementalReads, read_attempts: this.maxReadAttempts },
      children: [...this.children.values()].map(({ supplemental, delivered, ...row }) => ({ ...row, supplemental_reads: supplemental.size })) };
  }
  close(reason = new Error("Research round closed")) {
    if (this.closed) return;
    this.closed = true; this.signal?.removeEventListener("abort", this.abort);
    this.controller.abort(reason); this.entries.clear(); this.failures.clear(); this.prefetched.clear();
  }
}

/** The pre-step gate binds a child to the worker's trusted label BEFORE its
 * first request. agent/created alone has no role label; prompt text is not
 * treated as authority. Ordinary agents never enter this ownership map. */
export function installResearchPolicy(ctx, { schemas, strictEvidence = true, uniformOutput = false } = {}) {
  const owners = new WeakMap(), attached = new Map();
  const agents = ctx.get("agents"), tools = ctx.get("tools");
  if (!agents?.isOwnedBy || !tools?.get) throw new Error("Research policy requires the public DSH agent registry and tool runtime");
  ctx.on("agent/created", ({ agent }) => {
    let scope;
    for (const candidate of attached.values()) if (agents.isOwnedBy(agent.id, candidate.parent)) { scope = candidate; break; }
    if (!scope) return;
    let resolveBinding;
    const binding = new Promise(resolve => { resolveBinding = resolve; });
    const row = { agent, scope, binding, resolveBinding, child: null, error: null };
    scope.children.set(String(agent.id), row);
    const definitions = RESEARCH_TOOLS.map(name => tools.get(name, agent)).filter(Boolean);
    const scopedTools = agent.ctx.get("tools");
    scopedTools.restrict({ allow: definitions.map(tool => tool.name) });
    scopedTools.guard(exec => {
      if (exec.name === "structured_output" || exec.name === "run_code" || READS.has(exec.name)) return;
      scope.gateway.stats.denied++;
      return "研究子代理仅有只读取证和结构化提交能力，维护与交易操作由外层流程处理";
    });
    agent.ctx.on("tools/pre-execute", async (exec, next) => {
      if (exec.name !== "structured_output" || !schemas || !strictEvidence) return next();
      await waitFor(binding, AbortSignal.any([exec.signal, scope.signal]));
      if (row.error) throw row.error;
      try {
        if (uniformOutput && exec.arguments?.kind === undefined) throw new Error("统一提交必须含 kind 和 result");
        validateRoleOutput(scope.stage, row.child.label, exec.arguments, schemas, [...scope.gateway.symbols], scope.registry());
      } catch (error) {
        row.child.output_validation_errors = (row.child.output_validation_errors ?? 0) + 1;
        // Deny before DSH commits/concludes the child, so one bounded repair
        // can correct a typo without repeating the entire research round.
        const symbol = row.child.label.split(":")[0];
        const registry = scope.registry().filter(record => !scope.gateway.symbols.has(symbol) || !record.symbol || record.symbol === symbol);
        const { kind } = roleContract(scope.stage, row.child.label);
        const format = uniformOutput ? "顶层只含 kind 和 result，kind=" + kind + "；result 的 schema：" : "直接提交对象，顶层字段：";
        const schemaHint = uniformOutput ? schemas[kind] : Object.keys(schemas[kind].properties);
        const shapeError = !exec.arguments || typeof exec.arguments !== "object" || Object.hasOwn(exec.arguments, "arguments");
        return { kind: "deny", reason: String(error.message) + "。仅允许一次修正。参数必须是合法 JSON 对象，不得包装 arguments，不得发送 JSON 字符串；长文本用中文引号，正确转义双引号和换行。" + format + JSON.stringify(schemaHint)
          + (shapeError ? "。请保留既有内容并修正 JSON 结构。" : "。只能逐字使用登记的 id 与 source，不得加后缀或自造来源：" + JSON.stringify(registry.map(({ id, source }) => ({ id, source })))) };
      }
      return next();
    });
    for (const definition of definitions) {
      const records = new WeakMap();
      scopedTools.register({ ...definition,
        async execute(args, exec) {
          await waitFor(binding, AbortSignal.any([exec.signal, scope.signal]));
          if (row.error) throw row.error;
          const result = await scope.gateway.read(definition.name, args,
            sharedSignal => loadRead(definition, args, exec, sharedSignal),
            { signal: exec.signal, child: row.child });
          // A reference is safe only after the full result entered this very
          // session. Concurrent calls in the same batch still get full facts.
          const marker = "[research-evidence:" + result.entry.id + ":" + result.entry.version + "]";
          const retained = new Set(agent.session?.surface?.nodes ?? []);
          const duplicate = row.child.delivered.has(marker) && (agent.session?.events ?? []).some(event => event.type === "tool/result" && retained.has(event.seq) && JSON.stringify(event).includes(marker));
          records.set(exec, { ...result, marker, duplicate });
          return result.value;
        },
        finalizeContent(exec, result) {
          if (result.isError) return definition.finalizeContent?.(exec, result);
          const record = records.get(exec);
          if (!record) return definition.finalizeContent?.(exec, result);
          if (record.duplicate) {
            scope.gateway.stats.projected++;
            return [{ type: "text", text: record.marker + "\n本会话已收到相同版本的完整取证结果；请引用先前事实。" }];
          }
          const content = definition.finalizeContent?.(exec, result) ?? result.content;
          const index = evidenceIndex([{ id: record.entry.id, tool: record.entry.tool, args: record.entry.args, symbol: record.entry.symbol, data_version: record.entry.version, value: record.value }]);
          return [...content, { type: "text", text: record.marker + "\n可引用的证据登记：" + JSON.stringify(index) }];
        },
      });
      agent.ctx.on("tools/result", (exec, result) => {
        const record = records.get(exec);
        if (record && !result.isError) {
          row.child.delivered.add(record.marker);
          const chars = JSON.stringify(result.content).length;
          scope.gateway.stats.returned_chars += chars;
          row.child.returned_chars = (row.child.returned_chars ?? 0) + chars;
        }
      });
    }
    agent.ctx.on("agent/session-start", ({ source }) => {
      if ((source === "compact" || source === "clear" || source === "resume") && row.child) { row.child.epoch++; row.child.delivered.clear(); }
    });
    agent.ctx.on("agent/pre-step", async (payload, next) => {
      await waitFor(binding, AbortSignal.any([payload.signal, scope.signal, AbortSignal.timeout(10000)]));
      if (row.error) throw row.error;
      if (row.child.output_validation_errors >= 2) throw new Error("结构化结果连续两次未通过证据或角色校验，停止本阶段");
      return next();
    });
    agent.ctx.on("agent/request", async (_payload, next) => {
      row.child.requests++;
      if (row.child.requests > scope.maxSteps) scope.gateway.violation(row.child, "角色模型请求已达到上限 " + scope.maxSteps);
      return next();
    });
    agent.ctx.on("tools/result", (exec, result) => {
      if (!result.isError && result.concludesTurn && (exec.name === "run_code" || (exec.name === "structured_output" && !exec.parent))) row.child.structured_committed = true;
    });
    agent.ctx.on("agent/turn-stopping", ({ signal }) => {
      signal.throwIfAborted();
      if (row.child?.structured_committed) return;
      if (row.child.empty_output_repairs) throw new Error("角色仍未提交 structured_output，不能标记为完成");
      row.child.empty_output_repairs = 1;
      agent.steer(createUserMessage({ source: { kind: "plugin", plugin: "@investment-auto/research-policy" },
        content: [{ type: "text", text: "尚未提交结构化结果。必须现在调用 structured_output，不能只回复文字。保持本角色的 schema、证据 id 和 source 完整；资料不足也应在结果中报告缺口。这是唯一一次补交机会。" }] }));
    });
  });
  return {
    begin(parent, gateway, stage, labels, signal, maxSteps, registry = () => evidenceIndex(gateway.archive)) {
      if (owners.has(parent)) throw new Error("同一父代理不能并行启动多个受约束阶段");
      const scope = { parent, gateway, stage, labels: new Set(labels), signal, maxSteps, registry, children: new Map() };
      owners.set(parent, scope); attached.set(scope, scope);
      return {
        bind(childId, label) {
          const row = scope.children.get(String(childId));
          if (!row) throw new Error("Workflow child was not admitted by the research policy");
          if (!scope.labels.has(label)) row.error = new Error("Unexpected workflow role label: " + label);
          else row.child = gateway.child(String(childId), stage, label);
          row.resolveBinding();
        },
        close() {
          owners.delete(parent); attached.delete(scope);
          for (const row of scope.children.values()) if (!row.child) { row.error = new Error("Workflow stage ended before role binding"); row.resolveBinding(); }
        },
      };
    },
    async prefetch(gateway, tool, args, signal, stock, parent) {
      const definition = tools.get(tool, parent);
      if (!definition) throw new Error("取证工具不可用：" + tool);
      return (await gateway.read(tool, args, sharedSignal => loadRead(definition, args, {}, sharedSignal), { signal, prefetch: true, stock })).value;
    },
  };
}
