/** Opt-in effort routing. Uses trusted workflow labels, never prompt text. */
export const THINKING_POLICY = "fast-news-technical-v1";
const FAST_ROLES = new Set(["technical_analyst", "news_analyst"]);

function waitBinding(binding, signal, timeoutMs) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason ?? new Error("Research effort scope cancelled"));
    const timer = setTimeout(() => finish(new Error("Research effort label binding timed out")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    binding.then(() => finish());
  });
}

/** Gate the first request until the worker publishes its child identity. SDK
 * agent/request is a documented waterfall returning the complete call config.
 * Preserve provider, model, token cap, tools, and all other generation options. */
export function installResearchThinking(ctx, { bindingTimeoutMs = 10000 } = {}) {
  const agents = ctx.get("agents"), scopes = new Set();
  if (!agents?.isOwnedBy || typeof ctx.on !== "function") throw new Error("Selective thinking requires the DSH agent registry");
  ctx.on("agent/created", ({ agent }) => {
    const scope = [...scopes].find(candidate => agents.isOwnedBy(agent.id, candidate.parent));
    if (!scope) return;
    let resolve;
    const binding = new Promise(done => { resolve = done; });
    const row = { resolve, label: null, error: null };
    scope.children.set(String(agent.id), row);
    scope.disposers.push(agent.ctx.on("agent/request", async (payload, next) => {
      const signals = [scope.signal, payload.signal].filter(Boolean);
      await waitBinding(binding, signals.length ? AbortSignal.any(signals) : new AbortController().signal, bindingTimeoutMs);
      if (row.error) throw row.error;
      if (scope.closed) throw new Error("Research effort scope closed");
      const resolved = await next();
      const role = row.label.slice(row.label.lastIndexOf(":") + 1);
      return scope.stage === "base_research" && FAST_ROLES.has(role) ? { ...resolved, reasoningEffort: "off" } : resolved;
    }));
  });
  return {
    begin(parent, stage, labels, signal) {
      const scope = { parent, stage, signal, labels: new Set(labels), children: new Map(), disposers: [], closed: false,
        bind(childId, label) {
          const row = scope.children.get(String(childId));
          if (!row) throw new Error("Research effort child was not admitted");
          if (!scope.labels.has(label) || row.label !== null) row.error = new Error("Research effort workflow label mismatch");
          row.label = String(label ?? ""); row.resolve();
        },
        close() {
          scope.closed = true; scopes.delete(scope);
          for (const row of scope.children.values()) row.resolve();
          for (const dispose of scope.disposers) dispose();
          scope.children.clear();
        },
      };
      scopes.add(scope); return scope;
    },
  };
}
