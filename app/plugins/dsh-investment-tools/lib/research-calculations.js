/** Pure calculations from delivered records. No currency or period guessing. */
export function researchCalculations(history, fundamentals) {
  const bars = [...(history?.data ?? history?.bars ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = bars.at(-1), volume = latest?.volume;
  const technical = {};
  for (const window of [5, 20]) {
    const rows = bars.slice(-window);
    if (rows.length !== window || !rows.every(row => Number.isFinite(row.volume) && row.volume >= 0) || !Number.isFinite(volume)) continue;
    const average = rows.reduce((sum, row) => sum + row.volume, 0) / window;
    if (average > 0) technical["volume_ratio_ma" + window] = { value: volume / average, unit: "ratio", date: latest.date,
      formula: "latest_volume / mean(last " + window + " session volumes, including latest)", latest_volume: volume, average_volume: average, window };
  }
  const records = fundamentals?.records ?? [], financial = [];
  for (const record of records) for (const [name, metric] of Object.entries(record.metrics ?? {})) {
    if (!Number.isFinite(metric.value) || !metric.unit) continue;
    const previous = records.find(row => row.period_end === String(Number(record.period_end?.slice(0, 4)) - 1) + record.period_end?.slice(4)
      && row.period_type === record.period_type && row.currency === record.currency && row.metrics?.[name]?.unit === metric.unit);
    const before = previous?.metrics?.[name];
    if (["revenue", "net_income", "net_income_parent", "cash_flow_operating", "eps_basic"].includes(name)
      && before && Number.isFinite(before.value) && before.value > 0 && record.currency && ["annual", "ytd", "quarter"].includes(record.period_type)
      && metric.period_type !== "ttm" && before.period_type !== "ttm") {
      financial.push({ metric: name, kind: "year_on_year", period_end: record.period_end, value: (metric.value / before.value - 1) * 100,
        unit: "percent", formula: "(current / previous_year_same_period - 1) * 100", inputs: [metric.value, before.value],
        source_url: record.source_url, previous_source_url: previous.source_url, period_type: record.period_type });
    }
    if (!["revenue", "net_income", "net_income_parent", "cash_flow_operating"].includes(name) || record.period_type !== "ytd") continue;
    if (!record.period_start || !record.currency || metric.period_type === "ttm" || !/^\d{4}-\d{2}-\d{2}$/.test(record.period_end)) continue;
    const end = new Date(record.period_end + "T00:00:00Z");
    const priorEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 0)).toISOString().slice(0, 10);
    const prior = records.find(row => row.period_end === priorEnd && row.period_start === record.period_start && row.period_type === "ytd"
      && row.currency === record.currency && row.metrics?.[name]?.unit === metric.unit);
    if (!prior || prior.metrics[name].period_type === "ttm" || !Number.isFinite(prior.metrics[name].value)) continue;
    financial.push({ metric: name, kind: "single_quarter", period_start: new Date(Date.parse(priorEnd) + 86400000).toISOString().slice(0, 10),
      period_end: record.period_end, value: metric.value - prior.metrics[name].value, unit: metric.unit,
      formula: "current_ytd - previous_quarter_ytd", inputs: [metric.value, prior.metrics[name].value],
      source_url: record.source_url, previous_source_url: prior.source_url });
  }
  return { technical, financial, gaps: ["跨币种估值仅在有可核验汇率及日期时计算；本计算器不假设汇率", "未声明累计期间起点的报告不推导单季"] };
}
