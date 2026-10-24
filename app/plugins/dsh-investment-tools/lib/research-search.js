/** Native DeepSeek search with lossless usage and explicit model-derived metadata. */
import { randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { attributionHeaders } from "@deepseek-ai/dsh-llm";
import { WebError } from "@deepseek-ai/dsh-web";
import { Config, WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE } from "@deepseek-ai/dsh-web-search-deepseek";
import { canonicalNewsUrl } from "./research-news.js";
import { normalizeUsage } from "./analysis-meter.js";

export { Config };
export const name = "@ai-trading-automation/research-search";
export const inject = ["web"];

function searchArticles(blocks) {
  const texts = blocks.filter(block => block.type === "text").map(block => block.text ?? "").reverse();
  for (const text of texts) {
    try { const value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); if (Array.isArray(value.articles)) return { articles: value.articles, partial: false }; } catch { /* recover complete objects below */ }
    const start = /"articles"\s*:\s*\[/.exec(text);
    if (!start) continue;
    const articles = []; let quoted = false, escaped = false, depth = 0, begin = -1;
    for (let i = start.index + start[0].length; i < text.length; i++) {
      const char = text[i];
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === "{") { if (depth++ === 0) begin = i; }
      else if (char === "}" && depth > 0 && --depth === 0) { try { articles.push(JSON.parse(text.slice(begin, i + 1))); } catch { /* invalid fragments are not evidence */ } }
      else if (char === "]" && depth === 0) break;
    }
    if (articles.length) return { articles, partial: true };
  }
  return { articles: [], partial: false };
}

export function mapSearchResponse(response, { enrich = true } = {}) {
  const blocks = response.content ?? [];
  const hits = blocks.filter(block => block.type === "web_search_tool_result").flatMap(block => Array.isArray(block.content) ? block.content : []).filter(item => item.type === "web_search_result");
  if (!blocks.some(block => block.type === "web_search_tool_result")) throw new WebError("Native search returned no result blocks", "WEB_PROVIDER_ERROR");
  const excerpts = new Map();
  for (const block of blocks) for (const citation of block.citations ?? []) if (citation.url && citation.cited_text) excerpts.set(canonicalNewsUrl(citation.url), citation.cited_text);
  const { articles, partial } = enrich ? searchArticles(blocks) : { articles: [], partial: false };
  const sources = new Map();
  for (const hit of hits) {
    const url = canonicalNewsUrl(hit.url); if (!url) continue;
    const article = articles.find(item => canonicalNewsUrl(item.url) === url);
    const source = { url: hit.url, title: hit.title ?? "", snippet: excerpts.get(url) ?? hit.snippet ?? "",
      publishedAt: hit.page_age ?? hit.published_at, model_summary: typeof article?.summary === "string" ? article.summary : null,
      model_published_at: typeof article?.published_at === "string" ? article.published_at : null };
    const before = sources.get(url);
    if (!before || source.snippet.length > before.snippet.length) sources.set(url, source);
  }
  const order = new Map(articles.map((item, index) => [canonicalNewsUrl(item.url), index]));
  const ordered = [...sources.values()].sort((a, b) => (order.get(canonicalNewsUrl(a.url)) ?? Infinity) - (order.get(canonicalNewsUrl(b.url)) ?? Infinity));
  // The SDK web tool projects sources to its public four-field contract. Carry
  // unverified model metadata through the supported content field, without
  // mislabelling it as a snippet or a confirmed publication timestamp.
  const content = JSON.stringify({ kind: "research_news_enrichment", schema_version: 1,
    warning: "模型归纳和模型日期均未核验，不是已读取的原文", sources: ordered.filter(item => item.model_summary || item.model_published_at)
      .map(({ url, model_summary, model_published_at }) => ({ url, model_summary, model_published_at })) });
  return { sources: ordered, ...(enrich ? { content } : {}), truncated: response.stop_reason === "max_tokens", usage: normalizeUsage(response.usage, "anthropic"),
    enrichment_status: articles.length ? partial ? "partial_model_reported" : "model_reported" : "unavailable", provider: "deepseek-official" };
}

export class ResearchSearchProvider {
  id = "deepseek-official";
  constructor(resolveOptions, { fetchImpl = fetch, onUsage = () => {} } = {}) { this.options = resolveOptions; this.fetch = fetchImpl; this.onUsage = onUsage; }
  available() { const options = this.options(); return URL.canParse(options.baseURL) && Boolean(options.apiKey || options.resolveApiKey)
    && Number.isInteger(options.maxTokens) && options.maxTokens > 0 && Number.isInteger(options.maxUses) && options.maxUses > 0; }
  async search(request, signal) {
    const options = this.options();
    const key = options.apiKey || await options.resolveApiKey?.();
    signal?.throwIfAborted();
    if (!key) throw new WebError("DeepSeek search credential unavailable", "WEB_PROVIDER_CREDENTIAL_MISSING");
    const row = { request_id: randomUUID(), channel: "native_search", provider: this.id, model: options.model,
      purpose: "news_collection", started_at: new Date().toISOString(), max_tokens: options.maxTokens };
    let usage = null, finish = "unknown", error = null;
    try {
      const response = await this.fetch(options.baseURL.replace(/\/$/, "") + "/messages", {
        method: "POST", redirect: "error", signal,
        headers: { ...attributionHeaders(), "x-api-key": key, authorization: "Bearer " + key, "anthropic-version": options.apiVersion, "content-type": "application/json" },
        body: JSON.stringify({ model: options.model, max_tokens: options.maxTokens,
          messages: [{ role: "user", content: [{ type: "text", text: "Perform a web search for the query: " + request.query + (options.enrichNews ?
            '\n搜索后只返回有效 JSON：{"articles":[{"url":"...","title":"...","published_at":null,"summary":"..."}]}。最多 8 条，每条摘要不超过 100 字，摘要中的引号用中文引号。优先不同事件类型及重要反向事件，避免被重复回购报道占满。只使用搜索工具实际返回的链接；摘要归纳事实，日期无法确认则为 null，不猜测日期，不加解释或 Markdown。' : "") }] }],
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: options.maxUses }] }),
      });
      if (!response.ok) throw new WebError("DeepSeek search HTTP " + response.status, "WEB_PROVIDER_ERROR");
      const body = await response.json(); usage = normalizeUsage(body.usage, "anthropic"); finish = body.stop_reason ?? "unknown";
      return mapSearchResponse(body, { enrich: options.enrichNews === true });
    } catch (failure) { error = signal?.aborted ? "WEB_ABORTED" : "WEB_PROVIDER_ERROR"; throw failure; }
    finally { this.onUsage({ ...row, usage, metered: usage !== null, finish_reason: finish, error, finished_at: new Date().toISOString() }); }
  }
}

export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new ResearchSearchProvider(() => {
    // DSH volatile fields are live references; Settings owns persistence.
    const value = Object.fromEntries(Object.entries(config).map(([key, entry]) => [key, typeof entry?.get === "function" ? entry.get() : entry]));
    const ref = credentialRef(value.apiKeyEnv ?? "DEEPSEEK_API_KEY");
    return { ...value, resolveApiKey: async () => (await ctx.get("credentials")?.resolve(ref))?.value ?? launchEnvironmentOf(ctx).get(ref)?.value,
      baseURL: value.baseURL ?? launchEnvironmentOf(ctx).get("DEEPSEEK_SEARCH_BASE_URL")?.value ?? "https://api.deepseek.com/anthropic/v1",
      model: value.model ?? "deepseek-v4-flash", apiVersion: value.apiVersion ?? "2023-06-01", maxTokens: value.maxTokens ?? 4096, maxUses: value.maxUses ?? 5,
      enrichNews: process.env.IA_ENRICH_RESEARCH_NEWS === "1" };
  }, { onUsage: row => ctx.emit("research/model-usage", ctx.get("agents")?.currentInitiator?.(), row) }));
}
