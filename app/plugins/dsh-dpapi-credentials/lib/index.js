/**
 * DPAPI-backed credential provider for AI Trading Automation 2.0 desktop.
 *
 * Implements the harness `credentials` service (resolve/describe/set/unset +
 * the `credentials/updated` event) by delegating to the engine loopback API,
 * which stores secrets DPAPI-encrypted in the user data root (secrets.enc).
 * No secret ever lands in settings.yaml, .credentials.yaml or process env.
 *
 * The desktop shell applies this provider through a `--patch` overlay
 * (app/profiles/patches/dpapi-credentials.yml), so development keeps the
 * default `.credentials.yaml` provider while the installed product uses
 * DPAPI. Requires the engine process to be running (desktop lifecycle
 * guarantees it; resolution failures surface as missing credentials).
 *
 * Transient engine failures must not be reported as "no API key": a busy
 * engine briefly refusing a connection used to turn one subagent into a
 * MISSING_CREDENTIAL failure. Resolution therefore retries a few times and
 * caches a successful value for a minute.
 */

export const name = "@ai-trading-automation/dsh-dpapi-credentials";
export const inject = [];

const RESOLVE_ATTEMPTS = 3;
const RESOLVE_RETRY_DELAY_MS = 120;
const CACHE_TTL_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeClient(baseUrl, token) {
  const url = String(baseUrl || "http://127.0.0.1:8790").replace(/\/+$/, "");
  const headers = token ? { "X-ATA-Token": token } : {};
  const get = async (path) => {
    const response = await fetch(url + path, { headers });
    if (!response.ok) throw new Error(`engine ${path} -> HTTP ${response.status}`);
    return response.json();
  };
  const post = async (path, payload) => {
    const response = await fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload ?? {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`engine ${path} -> HTTP ${response.status}: ${body?.error ?? ""}`);
    return body;
  };
  return { get, post };
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config) {
  const engineUrl = process.env.INVESTMENT_ENGINE_URL ?? (typeof config?.engineUrl === "string" ? config.engineUrl : "http://127.0.0.1:8790");
  const token = process.env.ATA_ACCESS_TOKEN ?? (typeof config?.token === "string" ? config.token : "");
  const client = makeClient(engineUrl, token);
  const cache = new Map();

  const remember = (key, value) => {
    if (typeof value === "string" && value.length > 0) {
      cache.set(key, { value, until: Date.now() + CACHE_TTL_MS });
    } else {
      cache.delete(key);
    }
  };

  async function resolveOnce(key) {
    const payload = await client.get(`/api/credentials/resolve?ref=${encodeURIComponent(key)}`);
    if (!payload?.configured || typeof payload.value !== "string" || payload.value.length === 0) {
      cache.delete(key);
      return undefined;
    }
    remember(key, payload.value);
    return { value: payload.value, source: "dpapi" };
  }

  const service = {
    async resolve(ref) {
      const key = String(ref);
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return { value: cached.value, source: "dpapi" };
      for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt += 1) {
        try {
          return await resolveOnce(key);
        } catch {
          if (attempt + 1 < RESOLVE_ATTEMPTS) await sleep(RESOLVE_RETRY_DELAY_MS * (attempt + 1));
        }
      }
      return undefined;
    },
    async describe(ref) {
      const key = String(ref);
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return { configured: true, source: "dpapi", writable: true };
      for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt += 1) {
        try {
          const payload = await client.get(`/api/credentials/resolve?ref=${encodeURIComponent(key)}`);
          if (payload?.configured && typeof payload.value === "string" && payload.value.length > 0) {
            remember(key, payload.value);
            return { configured: true, source: "dpapi", writable: true };
          }
          cache.delete(key);
          return { configured: false, writable: true };
        } catch {
          if (attempt + 1 < RESOLVE_ATTEMPTS) await sleep(RESOLVE_RETRY_DELAY_MS * (attempt + 1));
        }
      }
      return { configured: false, writable: true };
    },
    async set(ref, value) {
      const key = String(ref);
      await client.post("/api/credentials/set", { ref: key, value: String(value ?? "") });
      remember(key, String(value ?? ""));
      ctx.emit("credentials/updated", ref);
    },
    async unset(ref) {
      const key = String(ref);
      await client.post("/api/credentials/unset", { ref: key });
      cache.delete(key);
      ctx.emit("credentials/updated", ref);
    },
  };

  ctx.provide("credentials", service);
}
