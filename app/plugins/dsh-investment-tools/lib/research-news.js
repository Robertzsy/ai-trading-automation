/** Normalize native web-search excerpts; a search excerpt is not a full article. */
import { createHash } from "node:crypto";

function newsWindow(market, now, lookbackDays) {
  const timeZone = market === "us" ? "America/New_York" : "Asia/Shanghai";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const until = `${parts.year}-${parts.month}-${parts.day}`;
  const since = new Date(Date.parse(until + "T00:00:00Z") - lookbackDays * 86400000).toISOString().slice(0, 10);
  return { since, until, time_zone: timeZone };
}

export function newsQuery(symbol, market, { now = Date.now(), lookbackDays = 14, companyName = "" } = {}) {
  const { since, until } = newsWindow(market, now, lookbackDays);
  return `${symbol} ${companyName} ${market.toUpperCase()}：检索 ${since} 至 ${until} 的公司公告、公司和行业新闻、政策、资金及市场情绪风险。优先公司/交易所公告和原始报道，给出原始链接、发布日期、关键事实；找不到近期来源请明确说明，不要把旧报道当新事件。`;
}

export function canonicalNewsUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|spm$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch { return null; }
}

function publicationDate(value) {
  // Relative dates/page age and ambiguous locale dates are not publication
  // timestamps. Preserve the raw string and report the uncertainty explicitly.
  const raw = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|T|\s|$)/.exec(raw);
  if (!match) return { published_at: null, publication_date_raw: raw || null, date_quality: "unknown" };
  const day = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(day);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return { published_at: null, publication_date_raw: raw, date_quality: "invalid" };
  return { published_at: day, publication_date_raw: raw, date_quality: "reported" };
}

export function normalizeNews(results, { symbol, market, now = Date.now(), lookbackDays = 14 } = {}) {
  const collectedAt = new Date(now).toISOString();
  const window = newsWindow(market, now, lookbackDays);
  const { since, until } = window;
  const items = new Map(), errors = [], warnings = [];
  let invalidSources = 0;
  for (const result of results) {
    if (result.unavailable || result.error) errors.push({ query: result.query, error: String(result.error ?? "search unavailable") });
    if (result.truncated) warnings.push("search provider truncated returned sources");
    for (const source of result.sources ?? []) {
      const canonical = canonicalNewsUrl(source.url);
      if (!canonical) { invalidSources++; continue; }
      const published = publicationDate(source.publishedAt ?? source.published_at);
      if (published.published_at && published.published_at > until) { invalidSources++; continue; }
      const item = {
        article_id: "N-" + createHash("sha256").update(`${market}:${symbol}:${canonical}`).digest("hex").slice(0, 16),
        symbol, market, title: String(source.title ?? ""), summary: String(source.snippet ?? source.summary ?? ""),
        source_url: source.url, canonical_url: canonical, source_host: new URL(canonical).hostname,
        ...published, collected_at: collectedAt,
        time_scope: !published.published_at ? "unknown" : published.published_at < since ? "background" : "recent",
        evidence_kind: "search_excerpt", full_text_verified: false, relevance_verified: false,
      };
      const previous = items.get(canonical);
      if (!previous) items.set(canonical, item);
      else {
        // Retain the original citation URL while enriching duplicate snippets.
        if (item.summary.length > previous.summary.length) previous.summary = item.summary;
        if (!previous.title) previous.title = item.title;
        if (!previous.published_at && item.published_at) Object.assign(previous, published, { time_scope: item.time_scope });
      }
    }
  }
  const articles = [...items.values()].sort((a, b) => a.canonical_url.localeCompare(b.canonical_url));
  if (invalidSources) warnings.push(`${invalidSources} invalid URLs or future-dated sources omitted`);
  if (articles.some(item => !item.published_at)) warnings.push("some search sources lack a confirmed publication date");
  if (!articles.some(item => item.time_scope === "recent")) warnings.push("no dated source confirmed within the requested news window");
  return {
    schema_version: 1, symbol, market, provider: "host-native-web-search", collected_at: collectedAt,
    requested_window: window, status: articles.length ? "ok" : "unavailable",
    items: articles, queries: results.map(result => result.query), errors, warnings,
    // Compatible with the evidence registry; original URLs are never rewritten.
    sources: articles.map(item => ({ url: item.source_url, title: item.title, snippet: item.summary, publishedAt: item.published_at })),
    usage: { available: false, reason: "host web-search service does not expose native model response usage" },
  };
}
