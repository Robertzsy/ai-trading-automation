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
    let enrichment = [];
    try { const data = JSON.parse(result.content ?? ""); if (data.kind === "research_news_enrichment" && Array.isArray(data.sources)) enrichment = data.sources; } catch { /* other providers may return ordinary text */ }
    for (const original of result.sources ?? []) {
      const extra = enrichment.find(item => canonicalNewsUrl(item.url) === canonicalNewsUrl(original.url));
      const source = extra ? { ...original, model_summary: extra.model_summary, model_published_at: extra.model_published_at } : original;
      const canonical = canonicalNewsUrl(source.url);
      if (!canonical) { invalidSources++; continue; }
      const published = publicationDate(source.publishedAt ?? source.published_at);
      if (published.published_at && published.published_at > until) { invalidSources++; continue; }
      const item = {
        article_id: "N-" + createHash("sha256").update(`${market}:${symbol}:${canonical}`).digest("hex").slice(0, 16),
        symbol, market, title: String(source.title ?? ""), summary: String(source.snippet || source.summary || source.model_summary || ""),
        summary_kind: source.snippet || source.summary ? "source_excerpt" : source.model_summary ? "model_summary_unverified" : "missing",
        model_published_at: source.model_published_at ?? null,
        source_url: source.url, canonical_url: canonical, source_host: new URL(canonical).hostname,
        ...published, collected_at: collectedAt,
        time_scope: !published.published_at ? "unknown" : published.published_at < since ? "background" : "recent",
        evidence_kind: source.model_summary && !source.snippet && !source.summary ? "model_summary" : "search_excerpt", full_text_verified: false, relevance_verified: false,
      };
      const previous = items.get(canonical);
      if (!previous) items.set(canonical, item);
      else {
        // Retain the original citation URL while enriching duplicate snippets.
        const rank = kind => ({ missing: 0, model_summary_unverified: 1, source_excerpt: 2 }[kind]);
        if (rank(item.summary_kind) > rank(previous.summary_kind) ||
          (item.summary_kind === previous.summary_kind && item.summary.length > previous.summary.length)) {
          previous.summary = item.summary; previous.summary_kind = item.summary_kind; previous.evidence_kind = item.evidence_kind;
        }
        if (!previous.title) previous.title = item.title;
        if (!previous.published_at && item.published_at) Object.assign(previous, published, { time_scope: item.time_scope });
      }
    }
  }
  const articles = [...items.values()].sort((a, b) => a.canonical_url.localeCompare(b.canonical_url));
  const topics = { financial: /财报|业绩|营收|利润|earnings|revenue|profit/i, capital: /融资|回购|增持|减持|buyback|repurchase|offering/i,
    regulatory: /监管|诉讼|处罚|调查|lawsuit|regulat|investigation/i, operating: /产品|订单|业务|经营|product|contract|business/i,
    industry: /行业|政策|板块|竞争|industry|policy|sector|competition/i };
  const groups = new Map();
  for (const item of articles) {
    item.event_types = Object.keys(topics).filter(topic => topics[topic].test(item.title + " " + item.summary));
    const titleKey = item.title.replace(/[\s\p{P}]/gu, "").toLowerCase();
    const key = titleKey ? titleKey + ":" + (item.published_at ?? "unknown") : item.canonical_url;
    const group = groups.get(key) ?? [];
    group.push(item.article_id); groups.set(key, group);
  }
  for (const item of articles) item.related_article_ids = [...groups.values()].find(group => group.includes(item.article_id));
  if (invalidSources) warnings.push(`${invalidSources} invalid URLs or future-dated sources omitted`);
  if (articles.some(item => !item.published_at)) warnings.push("some search sources lack a confirmed publication date");
  if (!articles.some(item => item.time_scope === "recent")) warnings.push("no dated source confirmed within the requested news window");
  return {
    schema_version: 1, symbol, market, provider: "host-native-web-search", collected_at: collectedAt,
    requested_window: window, status: articles.length ? "ok" : "unavailable",
    items: articles, queries: results.map(result => result.query), errors, warnings,
    // Compatible with the evidence registry; original URLs are never rewritten.
    sources: articles.map(item => ({ url: item.source_url, title: item.title, snippet: item.summary_kind === "source_excerpt" ? item.summary : "",
      model_summary: item.summary_kind === "model_summary_unverified" ? item.summary : null, publishedAt: item.published_at, model_published_at: item.model_published_at })),
    coverage: { basis: "observed_titles_and_summaries", confirmed_absence: false,
      event_types: Object.fromEntries(Object.keys(topics).map(topic => [topic, articles.filter(item => item.event_types.includes(topic)).length])),
      dated_recent: articles.filter(item => item.time_scope === "recent").length,
      missing_summaries: articles.filter(item => !item.summary).length, unique_story_groups: groups.size },
    usage: results.every(result => result.usage) ? { available: true, requests: results.map(result => result.usage) }
      : { available: false, reason: "one or more search responses did not expose model usage" },
  };
}

// Released model-facing representation; detailed provenance remains opt-in.
function compressExcerpt(value, max = 320) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw || raw.length <= max) return { text: raw, compressed: false };
  const sentences = raw.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  const weighted = sentence => /\d|同比|环比|亿|万|%|percent|revenue|profit|margin|deliver|shipment/i.test(sentence);
  const kept = [];
  let used = 0;
  for (const sentence of sentences) {
    if (kept.length && !weighted(sentence)) continue;
    if (used + sentence.length > max - 1 && kept.length) break;
    const room = max - 1 - used;
    kept.push(sentence.slice(0, Math.max(0, room)));
    used += Math.min(sentence.length, room);
  }
  const joined = kept.join(" ").trim();
  const text = (joined || raw.slice(0, max - 1)).slice(0, max - 1) + "…";
  return { text, compressed: true };
}

export function normalizeReleasedNews(results, { symbol, market, now = Date.now(), lookbackDays = 14 } = {}) {
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
        symbol, market, title: String(source.title ?? ""), summary: compressExcerpt(source.snippet ?? source.summary ?? "").text,
        summary_compressed: compressExcerpt(source.snippet ?? source.summary ?? "").compressed,
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
