import { test } from "node:test";
import assert from "node:assert/strict";
import { newsQuery, normalizeNews } from "../../dsh-investment-tools/lib/research-news.js";
import { collectResearchPackets } from "../../dsh-investment-tools/lib/analysis-cache.js";

const now = Date.parse("2026-10-09T08:00:00Z");

test("news query declares the window, company identity and event topics for all roles", () => {
  const query = newsQuery("00700", "hk", { now, companyName: "腾讯控股" });
  assert.match(query, /2026-09-25 至 2026-10-09/);
  assert.match(query, /腾讯控股/);
  assert.match(query, /公司和行业新闻、政策、资金及市场情绪/);
});

test("China's morning search uses the local date, not yesterday in UTC", () => {
  const query = newsQuery("600519", "cn", { now: Date.parse("2026-10-08T21:00:00Z") });
  assert.match(query, /至 2026-10-09/);
});

test("news deduplicates tracking links and distinguishes recent, background and unknown dates", () => {
  const result = normalizeNews([{ query: "one", sources: [
    { url: "https://example.com/news?utm_source=one", title: "公告", publishedAt: "2026-10-08", snippet: "原文节选" },
    { url: "https://example.com/news?utm_source=two", publishedAt: "2026-10-08", snippet: "更完整的原文节选" },
    { url: "https://example.com/old", publishedAt: "2020-01-01" },
    { url: "https://example.com/unknown", publishedAt: "2 days ago" },
    { url: "https://example.com/future", publishedAt: "2027-01-01" },
    { url: "javascript:alert(1)" },
  ] }], { symbol: "00700", market: "hk", now });
  assert.equal(result.items.length, 3);
  const latest = result.items.find(item => item.title === "公告");
  assert.equal(latest.source_url, "https://example.com/news?utm_source=one");
  assert.equal(latest.summary, "更完整的原文节选");
  assert.equal(latest.full_text_verified, false);
  assert.equal(result.items.find(item => item.time_scope === "unknown").published_at, null);
  assert.equal(result.items.find(item => item.time_scope === "background").published_at, "2020-01-01");
  assert.equal(result.usage.available, false);
});

test("different stocks have different article identities and invalid dates are never invented", () => {
  const input = [{ sources: [{ url: "https://example.com/news", publishedAt: "2026-02-30" }] }];
  const a = normalizeNews(input, { symbol: "00700", market: "hk", now });
  const b = normalizeNews(input, { symbol: "09988", market: "hk", now });
  assert.notEqual(a.items[0].article_id, b.items[0].article_id);
  assert.equal(a.items[0].date_quality, "invalid");
});

test("collector uses fundamentals API and one shared news search per stock", async () => {
  const calls = [], queries = [];
  const packets = await collectResearchPackets({ web: { async search({ query }) { queries.push(query); return { sources: [] }; } } },
    { async get(url) { calls.push(url); return url.includes("fundamentals") ? { status: "ok", provider: "akshare:em", records: [] } : { name: "公司" }; } },
    ["00700", "09988"], "hk", { now: () => now });
  assert.equal(queries.length, 2);
  assert.equal(calls.filter(url => url.includes("fundamentals")).length, 2);
  assert(queries.every(query => !query.includes("财报")));
  assert.equal(packets["00700"].fundamentals.provider, "akshare:em");
  assert.equal(packets["09988"].news.status, "unavailable");
});
