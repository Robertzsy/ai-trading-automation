import {message,setInvocationLanguage} from "./copy.js";
/** Fixed, DSH-native multi-role investment analysis workflow. */

import { assertObjectJsonSchema } from "@deepseek-ai/dsh-tools";
import { collectResearchPackets, cacheWorkflowScripts } from "./analysis-cache.js";
import { installAnalysisMeter } from "./analysis-meter.js";
import { ResearchGateway, installResearchPolicy, evidenceIndex } from "./research-policy.js";
import { analysisSummary, uniformScript, validateStage } from "./research-contract.js";
import { BRIEF_FORMAT, briefWorkflowScripts, briefSchema, briefContext } from "./research-briefs.js";
import { THINKING_POLICY, installResearchThinking } from "./research-thinking.js";
import { singleRoundAttempt, installCoordinatorGuard, saveCheckpoint, saveRunState } from "./round-recovery.js";

const MARKETS = new Set(["cn", "hk", "us", "etf"]);
const STAGES = ["base_research", "research_debate", "portfolio_draft", "risk_review", "final_decision"];

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    source: { type: "string" },
    claim: { type: "string" },
  },
  required: ["id", "title", "source", "claim"],
};

const decisionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    symbol: { type: "string" },
    action: { type: "string", enum: ["BUY", "SELL", "HOLD", "WATCH"] },
    target_weight: { type: "number" },
    confidence: { type: "number" },
    expected_return_20d: { type: "number" },
    expected_return_60d: { type: "number" },
    downside_20d: { type: "number" },
    upside_target: { type: "number" },
    downside_stop: { type: "number" },
    probability_up_20d: { type: "number" },
    probability_up_60d: { type: "number" },
    watch_trigger: { type: "number" },
    watch_expiry_days: { type: "number" },
    forced_deployment: { type: "boolean" },
    advisory_only: { type: "boolean" },
    reason: { type: "string" },
    evidence_ids: { type: "array", items: { type: "string" } },
  },
  required: ["symbol", "action", "target_weight", "confidence", "reason", "evidence_ids"],
};

/** Every raw JSON Schema passed to workflow agent(). Keeping the schemas as
 * ordinary exported values lets startup/release checks run DSH's public
 * assertObjectJsonSchema() validator before a costly analysis round starts. */
export const WORKFLOW_AGENT_SCHEMAS = Object.freeze({
  baseResearch: {
    type: "object",
    additionalProperties: false,
    properties: {
      symbol: { type: "string" },
      role: { type: "string" },
      summary: { type: "string" },
      stance: { type: "string", enum: ["bullish", "bearish", "neutral", "unknown"] },
      confidence: { type: "number" },
      evidence: { type: "array", items: evidenceSchema },
      risks: { type: "array", items: { type: "string" } },
      data_quality: { type: "string" },
    },
    required: ["symbol", "role", "summary", "stance", "confidence", "evidence", "risks", "data_quality"],
  },
  debate: {
    type: "object",
    additionalProperties: false,
    properties: {
      symbol: { type: "string" },
      side: { type: "string" },
      thesis: { type: "string" },
      confidence: { type: "number" },
      evidence_ids: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["symbol", "side", "thesis", "confidence", "evidence_ids", "risks"],
  },
  researchManager: {
    type: "object",
    additionalProperties: false,
    properties: {
      symbol: { type: "string" },
      verdict: { type: "string" },
      confidence: { type: "number" },
      evidence_ids: { type: "array", items: { type: "string" } },
      open_risks: { type: "array", items: { type: "string" } },
    },
    required: ["symbol", "verdict", "confidence", "evidence_ids", "open_risks"],
  },
  trader: decisionSchema,
  portfolio: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      cash_reserve_rationale: { type: "string" },
      decisions: { type: "array", items: decisionSchema },
    },
    required: ["summary", "cash_reserve_rationale", "decisions"],
  },
  riskView: {
    type: "object",
    additionalProperties: false,
    properties: {
      role: { type: "string" },
      assessment: { type: "string" },
      approved: { type: "boolean" },
      adjustments: { type: "array", items: { type: "string" } },
      evidence_ids: { type: "array", items: { type: "string" } },
    },
    required: ["role", "assessment", "approved", "adjustments", "evidence_ids"],
  },
  riskManager: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      decisions: { type: "array", items: decisionSchema },
    },
    required: ["summary", "decisions"],
  },
  finalDecision: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      decisions: { type: "array", items: decisionSchema },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "decisions", "risks"],
  },
});

// Fail during plugin composition, before an analysis run or any model call,
// using the exact public validator consumed by the workflow worker.
for (const schema of Object.values(WORKFLOW_AGENT_SCHEMAS)) {
  assertObjectJsonSchema(schema);
}

const BASE_RESEARCH_SCRIPT = `
const schema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.baseResearch)};
phase("基础研究");
const rows = await pipeline(args.symbols, async (_previous, symbol) => {
  const analyses = await parallel(args.roles.map((role) => async () => {
    const prompt = "你是" + args.role_instructions[role] + "。只研究 " + symbol + "（" + args.market.toUpperCase() + "）。必须先调用 investment_market_snapshot 和 investment_market_history；新闻/情绪角色必须先调用 investment_web_search（参数含 query/symbol/market，优先使用 research_plan 的 canonical queries）；只有该工具报错时才允许调用 web_search 回退，禁止直接调用 web_search。提交前必须按 coverage_checklist 自查财报日期、交付/出货、卖方评级三类各至少 2 条证据，合计至少 16 条；不足就补 canonical query。不得猜测数据。输出证据时每条给出稳定 id、标题、来源 URL 或投资工具名称、以及该证据支持的事实。结合授权书与以下有限历史记忆，但当前数据优先："
      + "输出要求（必须遵守）：先用 3–5 句给出结论，正文总长不超过 1200 个汉字（硬性预算，超预算视为不合格提交）；证据条目最多 12 条，每条一句话；只保留关键事实、反证、失效条件和数据缺口，不重复背景、不复述材料，不得为凑长度展开。"
      + "检索分三段，总次数不超过 20 次。第一段（最多 5 次，每类合并中英文关键词只查一次）：①业绩/公告：最近财报日期、下一次业绩日期、指引变化；②重大事件：近三个月回购/配售/监管/诉讼/召回/管理层变动；③经营数据：出货/交付/订单/产能/价格及行业同比；④卖方预期：至少两家机构的评级/目标价变动及日期；⑤资金与交易：南向净买卖、沽空比率、成交/量比异常。第二段（最多 10 次）：只针对第一段未确认的日期、数字或主源逐项定向补查，每次查询前先写明要补的缺口，优先港交所/公司公告/官方数据，同一事实最多两个来源。第三段（最多 5 次）：剩余不确定或反证自由检索；仍缺失的内容在 data_quality 明确写“未核实”。停止条件：五类问题各有至少一条可溯源证据，或达到 20 次；禁止为同一事实重复搜索。检索到 15 次时必须先评估缺口并停止扩展；达到 20 次必须立即停止检索并提交结构化结果，继续检索视为违反检索预算。"
      + JSON.stringify(args.memory).slice(0,3000);
    const options = {label:symbol + ":" + role,phase:"基础研究",schema};
    // One transient subagent failure (e.g. a brief credential/network error)
    // must not discard a whole symbol: retry the role once before giving up.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await agent(prompt, options);
      if (result) return result;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }));
  return {symbol, analyses};
});
return rows.filter(Boolean);
`;

const RESEARCH_DEBATE_SCRIPT = `
const debateSchema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.debate)};
const managerSchema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.researchManager)};
const traderSchema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.trader)};
phase("研究辩论与个股决策");
const rows = await pipeline(args.research, async (_previous, item) => {
  const source = JSON.stringify(item).slice(0,18000);
  const sides = [];
  for (let round = 1; round <= args.rounds; round += 1) {
    const prior = JSON.stringify(sides).slice(0,8000);
    const pair = await parallel([
      () => agent("你是多头研究员。第 " + round + " 轮针对 " + item.symbol + " 提出最强多头论证并回应既有观点；只能引用已有 evidence id。基础材料：" + source + " 既有辩论：" + prior,{label:item.symbol+":bull-r"+round,phase:"研究辩论与个股决策",schema:debateSchema}),
      () => agent("你是空头研究员。第 " + round + " 轮针对 " + item.symbol + " 提出最强空头论证并回应既有观点；只能引用已有 evidence id，指出数据缺口。基础材料：" + source + " 既有辩论：" + prior,{label:item.symbol+":bear-r"+round,phase:"研究辩论与个股决策",schema:debateSchema})
    ]);
    if (pair.length !== 2 || pair.some(row => !row)) throw new Error("多空意见不完整：" + item.symbol);
    sides.push(...pair);
  }
  const manager = await agent("你是研究经理。裁决 " + item.symbol + " 的多空辩论，检查证据是否真的支持结论，不得新增事实。基础研究与辩论：" + JSON.stringify({item,sides}).slice(0,22000),{label:item.symbol+":research-manager",phase:"研究辩论与个股决策",schema:managerSchema});
  if (!manager) return null;
  const trader = await agent("你是个股交易员。根据研究经理裁决和当前授权书给出 BUY/SELL/HOLD 建议。target_weight 是组合目标权重 0-1；证据不足必须 HOLD。材料：" + JSON.stringify({manager,mandate:args.mandate,holding:args.holdings[item.symbol]||null}).slice(0,16000),{label:item.symbol+":trader",phase:"研究辩论与个股决策",schema:traderSchema});
  return trader ? {symbol:item.symbol,sides,manager,trader} : null;
});
return rows.filter(Boolean);
`;

const PORTFOLIO_SCRIPT = `
const schema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.portfolio)};
phase("组合草案");
const draft = await agent("你是组合构建经理。把逐只交易建议合并为相互一致的组合草案，遵守授权书的仓位、现金和换手边界；不能引用材料中不存在的 evidence id。现有账户、授权书、建议：" + JSON.stringify({portfolio:args.portfolio,mandate:args.mandate,recommendations:args.recommendations}).slice(0,30000),{label:"portfolio-draft",phase:"组合草案",schema});
return draft;
`;

const RISK_SCRIPT = `
const viewSchema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.riskView)};
const managerSchema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.riskManager)};
phase("风险辩论");
const material = JSON.stringify({draft:args.draft,portfolio:args.portfolio,mandate:args.mandate}).slice(0,30000);
const views = [];
for (let round = 1; round <= args.rounds; round += 1) {
  const prior = JSON.stringify(views).slice(0,8000);
  const trio = await parallel([
    () => agent("你是激进风险分析师。第 "+round+" 轮在不突破硬边界的前提下评估机会成本与仓位不足风险，并回应既有观点。材料："+material+" 既有观点："+prior,{label:"risk-aggressive-r"+round,phase:"风险辩论",schema:viewSchema}),
    () => agent("你是保守风险分析师。第 "+round+" 轮重点检查回撤、集中度、流动性、现金储备、数据缺口和极端情景，并回应既有观点。材料："+material+" 既有观点："+prior,{label:"risk-conservative-r"+round,phase:"风险辩论",schema:viewSchema}),
    () => agent("你是中立风险分析师。第 "+round+" 轮平衡收益风险，检查一致性和换手成本，并回应既有观点。材料："+material+" 既有观点："+prior,{label:"risk-neutral-r"+round,phase:"风险辩论",schema:viewSchema})
  ]);
  if (trio.length !== 3 || trio.some(row => !row)) throw new Error("风险三方意见不完整");
  views.push(...trio);
}
const manager = await agent("你是风险经理。裁决三方风险意见并给出修订后的决策清单；引擎稍后仍会独立执行不可绕过的硬风控。不得新增事实或证据。材料：" + JSON.stringify({material,views}).slice(0,32000),{label:"risk-manager",phase:"风险辩论",schema:managerSchema});
return {views,manager};
`;

const FINAL_SCRIPT = `
const schema = ${JSON.stringify(WORKFLOW_AGENT_SCHEMAS.finalDecision)};
phase("最终决策");
const result = await agent("你是最终投资组合经理。根据研究链路、组合草案和风险经理裁决给出最终清单。不得越过授权书，不得新增事实或 evidence id；不确定就 HOLD。材料：" + JSON.stringify({risk:args.risk,recommendations:args.recommendations,mandate:args.mandate}).slice(0,34000),{label:"portfolio-manager",phase:"最终决策",schema});
return result;
`;

const ROLE_INSTRUCTIONS = {
  technical_analyst: "技术分析师，负责价格趋势、动量、波动率、成交与关键价位",
  fundamentals_analyst: "基本面分析师，负责估值、财务质量、业务驱动与可验证的基本面事实",
  news_analyst: "新闻分析师，负责近期公司/行业/政策事件及时间敏感性",
  sentiment_analyst: "市场情绪分析师，负责资金、交易拥挤度、舆情与预期差",
};

function compact(value, depth = 0) {
  if (typeof value === "string") return value.length > 1600 ? value.slice(0, 1600) + "…" : value;
  if (value === null || typeof value !== "object") return value;
  if (depth > 7) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 160).map((item) => compact(item, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [key, compact(item, depth + 1)]));
}

function uniqueSymbols(items) {
  const result = [];
  for (const item of items) {
    const symbol = String(item ?? "").trim();
    if (symbol && !result.includes(symbol)) result.push(symbol);
  }
  return result;
}

/** Stable idempotency id for one logical user request (same content -> same id). */
function stableCycleId(market, label, symbols) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  let hash = 5381;
  for (const char of `${market}:${[...symbols].sort().join(",")}`) {
    hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0;
  }
  return `${day}-${market}-${label}-${hash.toString(36).padStart(7, "0")}`.slice(0, 120);
}

/** Content fingerprint for the engine's short-TTL retry fallback only. */
function contentFingerprint(market, label, symbols) {
  let hash = 5381;
  for (const char of `${market}:${label}:${[...symbols].sort().join(",")}`) {
    hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0;
  }
  return hash.toString(36).padStart(8, "0");
}

/**
 * Stable request identity from the DSH platform: the session id plus the
 * newest direct user message id. Retries inside the same user turn produce
 * the same identity; a NEW user message always produces a new one — even
 * when the content is identical. This is the primary cycle-id source; the
 * content hash is never used for it.
 */
function requestIdentity(exec) {
  const agent = exec?.agent;
  if (!agent || typeof agent !== "object") return null;
  const sessionId = String(agent.id ?? "").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 48);
  if (!sessionId) return null;
  const events = Array.isArray(agent.session?.events) ? agent.session.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event?.type === "user/message" &&
      event?.message?.source?.kind === "user" &&
      typeof event.message.id === "string" &&
      event.message.id
    ) {
      const messageId = String(event.message.id).replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 40);
      if (messageId) return `${sessionId}-${messageId}`.slice(0, 120);
      break;
    }
  }
  return sessionId;
}

/** Normalize the symbols provenance: explicit targets are user-specified
 * unless the caller says they came from a screening pass. */
function resolveSymbolsSource(requested, symbols, autonomous) {
  const source = String(requested ?? "").trim().toLowerCase();
  if (source === "user" || source === "screening" || source === "autonomous") return source;
  if (symbols.length > 0) return "user";
  return autonomous ? "autonomous" : "screening";
}

function holdingMap(portfolio) {
  const result = {};
  for (const holding of Array.isArray(portfolio?.holdings) ? portfolio.holdings : []) {
    const symbol = String(holding?.code ?? holding?.symbol ?? "").trim();
    if (symbol) result[symbol] = holding;
  }
  return result;
}

function evidenceCount(value) {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((total, item) => total + evidenceCount(item), 0);
  return (Array.isArray(value.evidence) ? value.evidence.length : 0) +
    Object.entries(value).filter(([key]) => key !== "evidence").reduce((total, [, item]) => total + evidenceCount(item), 0);
}

function validBaseResearch(rows, minimumAnalysts, minimumCitations, requireCitations, expectedSymbols = []) {
  const good = [];
  const failed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const analyses = (Array.isArray(row?.analyses) ? row.analyses : []).filter((item) => {
      if (!item || typeof item.summary !== "string") return false;
      return !requireCitations || (Array.isArray(item.evidence) && item.evidence.length >= minimumCitations);
    });
    if (analyses.length >= minimumAnalysts) good.push({ symbol: String(row.symbol), analyses });
    else failed.push(String(row?.symbol ?? ""));
  }
  for (const symbol of expectedSymbols) if (!good.some(row => row.symbol === symbol)) failed.push(symbol);
  return { good, failed: uniqueSymbols(failed) };
}

function pctValue(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number > 1 ? number / 100 : number;
}

/** Cash-deployment guard: high cash + positive-EV candidates must not end in 0% invested. */
function enforceCashDeployment(decisions, recommendations, portfolio, mandate) {
  const minCash = pctValue(mandate?.min_cash_reserve_pct, 0.25);
  const maxPosition = pctValue(mandate?.max_position_pct, 0.12);
  const minConfidence = pctValue(mandate?.min_confidence, 0.60);
  const cash = Number(portfolio?.cash ?? portfolio?.cash_balance ?? 0);
  const total = Number(portfolio?.totalCapital ?? portfolio?.total_capital ?? portfolio?.total_assets ?? portfolio?.equity ?? portfolio?.total_value ?? 0);
  const cashPct = total > 0 ? cash / total : 1;
  if (cashPct <= minCash + 0.05) return decisions;
  const positive = (Array.isArray(recommendations) ? recommendations : []).filter(item => (
    Number(item?.expected_return_20d) > 0 || Number(item?.expected_return_60d) > 0
  ));
  if (!positive.length) return decisions;
  const targetInvested = Math.max(0, 1 - minCash);
  const perName = Math.min(maxPosition, targetInvested / positive.length);
  const bySymbol = new Map(decisions.map(item => [item.symbol, item]));
  const ranked = [...positive].sort((a, b) => Math.max(Number(b.expected_return_20d)||0, Number(b.expected_return_60d)||0) - Math.max(Number(a.expected_return_20d)||0, Number(a.expected_return_60d)||0));
  const desired = Math.min(targetInvested, positive.length * perName);
  let invested = decisions.reduce((sum, item) => sum + (item.action === "BUY" ? Number(item.target_weight) || 0 : 0), 0);
  let changed = false;
  for (const recommendation of ranked) {
    if (invested >= desired - 0.005) break;
    const symbol = String(recommendation?.symbol ?? "").toUpperCase();
    const decision = bySymbol.get(symbol);
    if (!decision) continue;
    const remaining = Math.max(0, desired - invested);
    const weight = Math.min(perName, remaining);
    if (weight <= 0) break;
    if (decision.action !== "BUY" || Number(decision.target_weight) < weight) {
      const before = decision.action === "BUY" ? Number(decision.target_weight) || 0 : 0;
      decision.action = "BUY";
      decision.target_weight = Math.max(before, weight);
      decision.forced_deployment = true;
      if (Number(decision.confidence) < minConfidence) decision.advisory_only = true;
      decision.reason = message("workflow.cash.deployment.rule.cash") + (cashPct * 100).toFixed(1) + message("workflow.exceeds.target.ceiling") + ((1 - targetInvested) * 100).toFixed(1) + message("workflow.and.this.security.has.positive.ev.allocate.the.mandate.s.standard.position.this.") + String(decision.reason || "");
      invested += Math.max(0, decision.target_weight - before);
      changed = true;
    }
  }
  // Hard deployment floor: when cash is high, the book may not stay all-cash just
  // because every candidate is in WATCH/HOLD. Promote the highest-confidence
  // candidates until at least 25% is deployed (still bounded by max_position).
  const floor = Math.min(0.25, targetInvested);
  if (invested < floor - 0.005) {
    const fallback = decisions
      .filter(item => item.action !== "SELL")
      .sort((a, b) => (Number(b.confidence)||0) - (Number(a.confidence)||0));
    for (const decision of fallback) {
      if (invested >= floor - 0.005) break;
      const weight = Math.min(maxPosition, floor - invested);
      if (weight <= 0) break;
      if (decision.action !== "BUY" || Number(decision.target_weight) < weight) {
        const before = decision.action === "BUY" ? Number(decision.target_weight) || 0 : 0;
        decision.action = "BUY";
        decision.target_weight = Math.max(before, weight);
        decision.forced_deployment = true;
        if (Number(decision.confidence) < minConfidence) decision.advisory_only = true;
        decision.reason = message("workflow.cash.deployment.rule.cash") + (cashPct * 100).toFixed(1) + message("workflow.exceeds.the.target.ceiling.the.portfolio.should.not.remain.entirely.in.cash.appl") + String(decision.reason || "");
        invested += Math.max(0, decision.target_weight - before);
        changed = true;
      }
    }
  }
  return changed ? decisions.map(item => ({...item, target_weight: Math.max(0, Math.min(1, Number(item.target_weight)||0))})) : decisions;
}

function normalizedDecisions(raw, allowedSymbols, forcedHolds) {
  const allowed = new Set(allowedSymbols);
  const forced = new Set(forcedHolds);
  const bySymbol = new Map();
  for (const item of Array.isArray(raw) ? raw : []) {
    const symbol = String(item?.symbol ?? "").trim();
    if (!allowed.has(symbol)) continue;
    let action = String(item?.action ?? "HOLD").toUpperCase();
    if (!["BUY", "SELL", "HOLD", "WATCH"].includes(action) || forced.has(symbol)) action = "HOLD";
    const watch = action === "WATCH";
    const weight = Number(item?.target_weight);
    const confidence = Number(item?.confidence);
    bySymbol.set(symbol, {
      symbol,
      action,
      target_weight: watch ? 0 : (Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      ...(Number.isFinite(Number(item?.expected_return_20d)) ? { expected_return_20d: Number(item.expected_return_20d) } : {}),
      ...(Number.isFinite(Number(item?.expected_return_60d)) ? { expected_return_60d: Number(item.expected_return_60d) } : {}),
      ...(Number.isFinite(Number(item?.downside_20d)) ? { downside_20d: Number(item.downside_20d) } : {}),
      ...(Number.isFinite(Number(item?.upside_target)) ? { upside_target: Number(item.upside_target) } : {}),
      ...(Number.isFinite(Number(item?.downside_stop)) ? { downside_stop: Number(item.downside_stop) } : {}),
      ...(Number.isFinite(Number(item?.probability_up_20d)) ? { probability_up_20d: Number(item.probability_up_20d) } : {}),
      ...(Number.isFinite(Number(item?.probability_up_60d)) ? { probability_up_60d: Number(item.probability_up_60d) } : {}),
      ...(Number.isFinite(Number(item?.watch_trigger)) ? { watch_trigger: Number(item.watch_trigger) } : {}),
      ...(Number.isFinite(Number(item?.watch_expiry_days)) ? { watch_expiry_days: Number(item.watch_expiry_days) } : {}),
      ...(item?.forced_deployment === true ? { forced_deployment: true } : {}),
      ...(item?.advisory_only === true ? { advisory_only: true } : {}),
      reason: forced.has(symbol) ? message("research.incomplete") : String(item?.reason ?? "") .slice(0, 1000),
      evidence_ids: uniqueSymbols(Array.isArray(item?.evidence_ids) ? item.evidence_ids : []).slice(0, 30),
    });
  }
  for (const symbol of forced) {
    if (allowed.has(symbol) && !bySymbol.has(symbol)) bySymbol.set(symbol, {symbol,action:"HOLD",target_weight:0,confidence:0,reason:message("research.incomplete"),evidence_ids:[]});
  }
  return [...bySymbol.values()];
}

class AnalysisCancelled extends Error {
  constructor(analysis) {
    super(message("workflow.analysis.stopped"));
    this.analysis = analysis;
  }
}

function checkCancellation(payload) {
  if (payload?.analysis?.status === "cancelled") throw new AnalysisCancelled(payload.analysis);
}

async function submitReadyRun(client, run, label, note) {
  const cycleId = run.cycle_id;
  const decisions = run.decisions ?? [];
  const execution = await client.issue("submit_decisions", {market:run.market,decisions,label,note,idempotency_key:cycleId}, {requestedBy:"dsh-analysis-workflow",timeoutMs:300000});
  const complete = await saveRunState(client, "/api/analysis/runs/complete", {cycle_id:cycleId,decisions,execution:compact(execution),report:execution?.report??null,audit_file:execution?.audit_file??null,warnings:run.warnings??[]});
  return {run:complete.analysis ?? run, execution:compact(execution)};
}

function stageLabels(stage, args) {
  if (stage === "base_research") return args.symbols.flatMap(symbol => args.roles.map(role => symbol + ":" + role));
  if (stage === "research_debate") return args.research.flatMap(item => [
    ...Array.from({ length: args.rounds }, (_, index) => [item.symbol + ":bull-r" + (index + 1), item.symbol + ":bear-r" + (index + 1)]).flat(),
    item.symbol + ":research-manager", item.symbol + ":trader",
  ]);
  if (stage === "portfolio_draft") return ["portfolio-draft"];
  if (stage === "risk_review") return [...Array.from({ length: args.rounds }, (_, index) => ["aggressive", "conservative", "neutral"].map(role => "risk-" + role + "-r" + (index + 1))).flat(), "risk-manager"];
  return ["portfolio-manager"];
}

function requireCompleteStage(stage, value, args) {
  let complete = true;
  if (stage === "research_debate") {
    const symbols = new Set((args.research ?? []).map(row => row.symbol));
    complete = Array.isArray(value) && value.length === symbols.size && value.every(row =>
      symbols.delete(row?.symbol) && row.manager && row.trader && Array.isArray(row.sides) &&
      row.sides.length === 2 * args.rounds && row.sides.every(Boolean));
  } else if (stage === "portfolio_draft" || stage === "final_decision") {
    complete = value && Array.isArray(value.decisions);
  } else if (stage === "risk_review") {
    complete = Array.isArray(value?.views) && value.views.length === 3 * args.rounds &&
      value.views.every(Boolean) && value.manager && Array.isArray(value.manager.decisions);
  }
  if (!complete) throw new Error(message("workflow.required.stage.roles.returned.incomplete.results") + stage);
}

async function executeStage(ctx, client, exec, activeRuns, cycleId, stage, script, args, maxAgents, policyRun, briefRun, thinking) {
  checkCancellation(await saveRunState(client, "/api/analysis/runs/update", {cycle_id:cycleId,stage,event:"stage_start"}));
  // The SDK returns null for refusal, truncation or missing structured output.
  // Only base research has an explicit partial-success policy. Required debate
  // and manager roles must stop their stage instead of silently filtering null.
  if (stage !== "base_research") script = `
const requiredAgent = async (prompt, options) => {
  const result = await agent(prompt, options);
  if (result == null) throw new Error((args.output_language === "en" ? "Required role did not return complete structured output: " : "必要角色未返回完整结构化结果：") + options.label);
  return result;
};
` + script.replace(/\bagent\(/g, "requiredAgent(");
  // Every child gets the same frozen language after its role instructions.
  // Codes, numbers, evidence IDs and original quotations remain source facts.
  // Phase identities are stable machine codes; translated display names belong
  // to the product UI. Historical Chinese phases remain readable by the engine.
  const phaseCodes = {"基础研究":"base_research","研究辩论与个股决策":"research_debate","组合草案":"portfolio_draft","风险辩论":"risk_review","最终决策":"final_decision"};
  for (const [title, code] of Object.entries(phaseCodes)) script = script.replaceAll(JSON.stringify(title), JSON.stringify(code));
  script = script.replace(/\bagent\(/g, "languageAgent(");
  script = `
const languageAgent = (prompt, options) => agent(prompt + "\\n\\nOUTPUT LANGUAGE CONTRACT: " + (args.output_language === "en" ? "Write all generated prose fields (summary, claim, thesis, rebuttal, rationale, assessment, reason, risks, data_quality and explanations) in English. Use the same research, evidence and risk constraints. English prose budget: at most 700 words per base role (other role budgets remain unchanged)." : "使用简体中文填写所有新生成的自然语言字段。") + " Preserve JSON keys, tickers, actions, currencies, numerical values, evidence IDs, tool names and verbatim source quotes exactly. Never translate source titles or fabricate company names. This output-language rule takes precedence over prose-language examples in the role instructions.", options);
` + script;
  const controller = new AbortController();
  const signal = exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal;
  const scope = policyRun?.policy.begin(exec.agent, policyRun.gateway, stage, stageLabels(stage, args), signal,
    stage === "base_research" ? 12 : Math.min(32, 10 + Math.ceil(policyRun.symbols.length / 4)), policyRun.registry);
  const thinkingScope = thinking?.begin(exec.agent, stage, stageLabels(stage, args), signal);
  let run;
  try {
    run = ctx.workflowEngine.start({
      script,
      meta:{name:"investment-" + stage.replaceAll("_", "-"),description:"AI Trading Automation fixed " + stage + " stage",phases:[{title:stage}]},
      // Optional fields may be undefined in internal JS objects. The PTC
      // process channel admits JSON only; omit those fields before crossing it.
      args: JSON.parse(JSON.stringify(args)),
      parent:exec.agent,
      signal,
      maxTotalAgents:Math.max(1, maxAgents),
    });
  } catch (error) { scope?.close(); thinkingScope?.close(); throw error; }
  activeRuns.set(String(run.id), {cycleId,stage,scope,thinkingScope});
  // Stop both pending and running child agents through DSH's abort fanout.
  let polling = false;
  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const payload = await client.get("/api/analysis/run?cycle_id="+encodeURIComponent(cycleId), {timeoutMs:3000});
      if (payload?.analysis?.status === "cancelled") controller.abort(new AnalysisCancelled(payload.analysis));
    } catch { /* transient API failures do not cancel healthy research */ }
    finally { polling = false; }
  }, 1000);
  try {
    const settled = await run.result;
    signal.throwIfAborted();
    if (settled.stopReason !== "completed") throw new Error(settled.error ?? ("workflow stage " + stage + " " + settled.stopReason));
    let value = settled.value;
    if (briefRun) {
      if (value?.format !== BRIEF_FORMAT || value.stage !== stage || !Array.isArray(value.briefs)) throw new Error(message("workflow.brief.stage.contract.mismatch"));
      briefRun.bundle.stages[stage] = value.briefs;
      briefRun.bundle.errors ??= {};
      briefRun.bundle.errors[stage] = value.errors ?? [];
      value = value.data;
      if (stage === "base_research") {
        const facts = new Map();
        for (const row of value ?? []) for (const analysis of row.analyses ?? []) for (const fact of analysis.evidence ?? []) {
          const previous = facts.get(fact.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(fact)) throw new Error(message("workflow.conflicting.evidence.id.in.briefs") + fact.id);
          facts.set(fact.id, fact);
        }
        briefRun.bundle.facts = [...facts.values()];
      }
      // The report/resume depends on these full arguments. Unlike auxiliary
      // archives, a missing brief archive must stop this experimental path.
      if (briefRun.bundle.errors[stage].length) throw new Error(message("workflow.brief.binding.failed") + briefRun.bundle.errors[stage].map(row => row.label + " " + row.error).join("；"));
    }
    // Archive the raw value immediately. Later stages and durable checkpoints
    // retain the compact form, but failure/resume cannot discard this evidence.
    requireCompleteStage(stage, value, args);
    policyRun?.validate(stage, value, args);
    if (policyRun) policyRun.gateway.stageResults[stage] = structuredClone(value);
    const result = compact(value);
    checkCancellation(await saveCheckpoint(client, {cycle_id:cycleId,stage,result,archives:{[stage]:value,...(briefRun ? {research_briefs:briefRun.bundle} : {})},agents_started:settled.agentsStarted,evidence_count:evidenceCount(result),
      ...(briefRun ? { research_format: BRIEF_FORMAT } : {}),
      ...(thinking ? { research_thinking: THINKING_POLICY } : {}),
      ...(policyRun ? { evidence_registry: policyRun.registry(), tool_policy: policyRun.gateway.summary() } : {})}));
    return briefRun ? value : result;
  } finally {
    clearInterval(timer);
    activeRuns.delete(String(run.id));
    scope?.close();
    thinkingScope?.close();
    controller.abort();
    try { await run.dispose(); }
    catch (error) { console.warn("Workflow cleanup failed:", String(error?.message ?? error)); }
  }
}

/** Register the deterministic multi-stage analysis tool. */
export function registerAnalysisWorkflow(ctx, client, registerTool, { cacheOptimization = false, sharedResearch = false, researchPolicy = "off", lightweightResults = false, uniformOutput = false, strictEvidence = true, researchRoles = false, deduplicateResearch = false, researchBriefs = false, selectiveFastThinking = false, singleConversationBaseResearch = false } = {}) {
  if (!["off", "observe", "enforce"].includes(researchPolicy)) throw new Error("researchPolicy must be off, observe or enforce");
  if (researchBriefs && (researchRoles || deduplicateResearch || uniformOutput || researchPolicy !== "off")) throw new Error(message("workflow.the.researchbriefs.experiment.requires.other.role.deduplication.output.and.tool."));
  if (researchBriefs) assertObjectJsonSchema(briefSchema(WORKFLOW_AGENT_SCHEMAS.baseResearch));
  if (selectiveFastThinking && (researchBriefs || researchRoles || deduplicateResearch || uniformOutput || researchPolicy !== "off")) throw new Error(message("workflow.the.selectivefastthinking.experiment.requires.other.role.deduplication.output.an"));
  const thinking = selectiveFastThinking ? installResearchThinking(ctx) : null;
  const policy = researchPolicy !== "off" || researchRoles || deduplicateResearch ? installResearchPolicy(ctx, { schemas: WORKFLOW_AGENT_SCHEMAS, strictEvidence, uniformOutput, researchRoles }) : null;
  const collectShared = sharedResearch || cacheOptimization || Boolean(policy) || researchBriefs;
  const cachedScripts = researchBriefs ? briefWorkflowScripts(WORKFLOW_AGENT_SCHEMAS) : collectShared ? cacheWorkflowScripts(WORKFLOW_AGENT_SCHEMAS, { researchRoles, singleBase: singleConversationBaseResearch }) : null;
  const summarize = lightweightResults ? analysisSummary : value => value;
  const activeRuns = new Map();
  installCoordinatorGuard(ctx);
  const meter = ctx.get?.("analysisMeter") ?? installAnalysisMeter(ctx, client);
  if (typeof ctx.on === "function") {
    // The DSH workflow engine publishes BOTH arguments:
    //   workflow/agent-start (info, agent)   info={id,meta}  agent={seq,label,phase?,childId}
    //   workflow/agent-end   (info, agent)   agent gains outcome: completed|failed|cancelled
    // Historically only `info.id` was used, so the engine could count subagents
    // but never say WHICH one ran, in which phase, for how long, or why it
    // failed. Forwarding the published identity is what makes the analysis
    // timeline real. These events go to /runs/events (timeline semantics), not
    // /runs/update (checkpoint semantics).
    ctx.on("workflow/agent-start", (info, agent) => {
      const active = activeRuns.get(String(info.id));
      if (!active) return;
      active.scope?.bind(agent?.childId, agent?.label);
      active.thinkingScope?.bind(agent?.childId, agent?.label);
      meter.bind(active.cycleId, active.stage, agent?.childId, agent?.label);
      void client.post("/api/analysis/runs/events", {
        cycle_id:active.cycleId,
        stage:active.stage,
        event:"agent_start",
        seq:agent?.seq,
        label:agent?.label,
        phase:agent?.phase,
        child_id:agent?.childId,
      }).catch(() => {});
    });
    ctx.on("workflow/agent-end", (info, agent) => {
      const active = activeRuns.get(String(info.id));
      if (!active) return;
      void client.post("/api/analysis/runs/events", {
        cycle_id:active.cycleId,
        stage:active.stage,
        event:"agent_end",
        seq:agent?.seq,
        label:agent?.label,
        phase:agent?.phase,
        child_id:agent?.childId,
        outcome:agent?.outcome,
      }).catch(() => {});
    });
    // Phase boundaries and workflow logs enrich the timeline without needing
    // any engine schema change.
    ctx.on("workflow/phase", (info, title) => {
      const active = activeRuns.get(String(info.id));
      if (!active || !title) return;
      void client.post("/api/analysis/runs/events", {
        cycle_id:active.cycleId, stage:active.stage, event:"log",
        level:"info", message:message("workflow.stage.advanced") + String(title).slice(0,200),
      }).catch(() => {});
    });
  }

  registerTool(
    ctx,
    "investment_analysis_workflow",
    "AI Trading Automation 固定的多角色投资分析流程入口，是唯一可信的完整/深度分析实现。用户点名证券时把 symbols 传入（symbols_source=user），只分析这些标的、绝不混入选股池；用户要求先选股时，先用选股工具得到标准化列表，再把结果以 symbols_source=screening 传入。手动对话中本工具是启动器：返回 cycle_id 后立即用 investment_analysis_status 轮询进度，不要重复调用本工具，也不要自己用行情/新闻工具重写分析。流程固定为：四类基础研究→多空辩论→研究经理→个股交易员→组合草案→三方风险辩论→风险经理→最终组合经理，各阶段持久化并可续跑；分析只生成方案，成交必须等用户批准后用 investment_submit_decisions（带同一 idempotency_key）提交。",
    {
      market:{type:"string",required:true,description:"市场代码：cn、hk、us 或 etf",default:"cn"},
      symbols:{type:"array",description:"目标证券代码列表；用户点名或选股结果。留空则只允许在自主调度轮次中由流程内部选股",items:{type:"string"}},
      symbols_source:{type:"string",description:"symbols 的来源：user（用户指定）或 screening（选股结果）；留空自动推断"},
      submit:{type:"boolean",description:"是否提交最终决策；手动会话必须为 false",default:false},
      label:{type:"string",description:"轮次标签"},
      cycle_id:{type:"string",description:"可选稳定幂等键；同一键只启动一个轮次，超时重试不会重复启动"},
      retry:{type:"boolean",description:"用户明确要求恢复失败轮次时才设为 true；普通启动、轮询或自动修复不得开启",default:false},
    },
    singleRoundAttempt(async ({market,symbols:requestedSymbols,symbols_source:requestedSource,submit=false,label="analysis",cycle_id:requestedCycleId,retry=false}, exec) => {
      const normalizedMarket = String(market ?? "").trim().toLowerCase();
      if (!MARKETS.has(normalizedMarket)) throw new Error(message("workflow.market.must.be.cn.hk.us.or.etf"));
      const autonomous = process.env.ATA_AUTONOMOUS_ROUND === "1";
      if (submit && !autonomous) throw new Error(message("workflow.a.manual.conversation.cannot.submit.directly.present.the.plan.and.obtain.user.ap"));
      const symbols = uniqueSymbols(Array.isArray(requestedSymbols) ? requestedSymbols : []);
      const symbolsSource = resolveSymbolsSource(requestedSource, symbols, autonomous);
      const safeLabel = String(label || "analysis").replace(/[^A-Za-z0-9_.-]+/g,"-").slice(0,40) || "analysis";

      // ── two-block boundary, enforced in code: the MANUAL entry requires an
      // explicit standardized symbol list (user-named or screening-derived).
      // Only autonomous scheduling may fall back to internal screening. ──
      if (!autonomous && symbols.length === 0) {
        throw new Error(message("workflow.manual.analysis.requires.explicit.securities.screen.first.with.investment.run.sc"));
      }

      // ── cycle id: platform request identity is the PRIMARY source; the
      // engine-injected id covers headless rounds; a random id covers the
      // rare executor without session context. ──
      const identity = requestIdentity(exec);
      const cycleId = String(
        requestedCycleId ||
        process.env.INVESTMENT_CYCLE_ID ||
        (identity ? "req-" + identity : "auto-" + String(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()).replace(/[^A-Za-z0-9_.-]+/g, "-"))
      ).replace(/[^A-Za-z0-9_.-]+/g,"-").slice(0,120);

      if (!autonomous) {
        // Web/manual session: launch the durable engine round and return
        // immediately. The heavy pipeline runs in the engine's headless
        // worker — the SAME fixed workflow implementation the scheduler
        // uses — so no browser or tool HTTP request has to stay open for
        // the analysis duration, and a retry with the same cycle_id never
        // starts a second round.
        const started = await client.post("/api/analysis/rounds/start", {
          cycle_id: cycleId,
          market: normalizedMarket,
          symbols,
          symbols_source: symbolsSource,
          label: safeLabel,
          retry: Boolean(retry),
          // Only used by the engine's short-TTL retry fallback when the
          // launcher lacked session context (identity-less ids).
          dedupe_fingerprint: identity ? undefined : contentFingerprint(normalizedMarket, safeLabel, symbols),
        }, { timeoutMs: 60000 });
        const run = started?.analysis ?? {};
        return {
          mode: "async",
          cycle_id: cycleId,
          started: Boolean(started?.started),
          duplicate: Boolean(started?.duplicate),
          status: run.status ?? "running",
          current_stage: run.current_stage ?? "preparing",
          symbols: run.symbols ?? symbols,
          symbols_source: run.symbols_source ?? symbolsSource,
          hint: run?.status === "failed" ? message("workflow.this.round.failed.and.was.not.restarted.report.the.original.error.resume.with.th") : run?.status === "cancelled" ? message("workflow.this.round.was.stopped.its.original.cycle.id.will.not.restart") : message("workflow.check.progress.with.investment.analysis.status.cycle.id") + cycleId + message("workflow.do.not.restart.or.reimplement.the.analysis"),
        };
      }

      if (!exec?.agent) throw new Error(message("workflow.a.valid.dsh.session.is.required.for.the.full.analysis.workflow"));
      const deadline = Number(process.env.ATA_ROUND_DEADLINE_MS);
      if (Number.isFinite(deadline) && deadline > 0) {
        if (deadline <= Date.now()) throw new Error(message("workflow.the.background.round.timed.out.checkpoints.are.retained.restarting.research.is.p"));
        const remaining = Math.max(1, deadline - Date.now());
        exec = {...exec, signal: exec.signal ? AbortSignal.any([exec.signal, AbortSignal.timeout(remaining)]) : AbortSignal.timeout(remaining)};
        exec.signal.throwIfAborted();
      }
      let started = false;
      let gateway;
      try {
        const [status, portfolio, mandatePayload, configPayload, previousPayload] = await Promise.all([
          client.get("/api/status"),
          client.get("/api/portfolio/"+normalizedMarket),
          client.get("/api/mandate"),
          client.get("/api/config"),
          client.get("/api/analysis/runs?market="+normalizedMarket+"&limit=3").catch(() => ({runs:[]})),
        ]);
        if (status?.control?.kill_switch || status?.control?.kill_switch_active || status?.control?.paused) throw new Error(message("workflow.the.engine.is.paused.or.emergency.stopped.no.analysis.round.was.started"));
        const holdings = holdingMap(portfolio);
        const holdingSymbols = Object.keys(holdings);
        const config = configPayload?.config ?? {};
        const workflowConfig = config?.autonomous?.agent_workflow ?? {};
        const maxUniverse = Math.max(1, Number(config?.autonomous?.max_universe_size ?? 30));

        // ── target universe: explicit symbols win; screening is the fallback ──
        let targets = uniqueSymbols(symbols);
        let screeningNote = null;
        if (targets.length === 0) {
          // Reuse the cached screening only while it is fresh (30 minutes);
          // otherwise re-screen so an autonomous round never runs on a stale pool.
          const SCREENING_TTL_MS = 30 * 60 * 1000;
          let screeningPayload = await client.get("/api/screening/"+normalizedMarket);
          const cachedScreening = screeningPayload?.screening;
          const cachedAt = Date.parse(String(cachedScreening?.generated_at ?? cachedScreening?.audited_at ?? ""));
          const screeningFresh = Boolean(screeningPayload?.cached && cachedScreening && Number.isFinite(cachedAt) && (Date.now() - cachedAt) <= SCREENING_TTL_MS);
          if (!screeningFresh) {
            screeningPayload = await client.issue("run_screening", {market:normalizedMarket}, {requestedBy:"dsh-analysis-workflow",timeoutMs:300000});
          }
          const screening = screeningPayload?.screening ?? screeningPayload;
          const selected = uniqueSymbols(screening?.selected_symbols ?? screening?.allowed_symbols ?? []);
          screeningNote = message("workflow.targets.came.from.screening.and.holdings.screened.within.the.automatic.round");
          targets = uniqueSymbols([...holdingSymbols,...selected]).slice(0,maxUniverse);
        } else {
          screeningNote = message("workflow.targets.were.explicitly.selected.by.the.caller") + symbolsSource + message("workflow.screening.pool.securities.were.not.added");
        }
        if (targets.length === 0) throw new Error(message("workflow.screening.and.holdings.are.empty.analysis.cannot.start"));
        if (targets.length > maxUniverse) targets = targets.slice(0, maxUniverse);

        const researchRounds = Math.max(1,Math.min(3,Number(workflowConfig.research_debate_rounds ?? 1)));
        const riskRounds = Math.max(1,Math.min(3,Number(workflowConfig.risk_debate_rounds ?? 1)));
        const expectedAgents = targets.length * (6 + 2 * researchRounds) + 3 * riskRounds + 3;
        const startPayload = await saveRunState(client, "/api/analysis/runs/start", {cycle_id:cycleId,market:normalizedMarket, ...(["zh","en"].includes(process.env.ATA_OUTPUT_LANGUAGE) ? {output_language:process.env.ATA_OUTPUT_LANGUAGE} : {}),label:safeLabel,symbols:targets,symbols_source:symbolsSource,submit:Boolean(submit),holding_symbols:holdingSymbols,expected_agents:expectedAgents});
        started = true;
        meter.begin(cycleId, exec.agent);
        const runState = startPayload.analysis ?? {};
        setInvocationLanguage(runState.output_language ?? "zh");
        if (["completed", "cancelled", "failed"].includes(runState.status)) return {...summarize(runState),resumed:true,done:true};
        if (runState.status === "ready_for_execution") {
          if (!submit || !runState.submit) return {...summarize(runState),resumed:true,done:true};
          const saved = await submitReadyRun(client, runState, safeLabel, message("workflow.submit.the.saved.final.decisions.for.this.paper.round"));
          return {...summarize(saved.run),execution:saved.execution,resumed:true,done:true};
        }
        const checkpoints = runState.checkpoints ?? {};
        const mandate = mandatePayload?.mandate ?? {};
        const memory = (previousPayload?.runs ?? []).filter((row) => row.cycle_id !== cycleId).slice(0, Number(workflowConfig.memory_entries_per_role ?? 6)).map((row) => ({decisions:row.decisions??[],warnings:row.warnings??[],completed_at:row.completed_at}));
        const minimumAnalysts = Math.max(4, Number(workflowConfig.minimum_base_analysts ?? 4));
        const minimumCitations = Math.max(1, Number(workflowConfig.minimum_citations ?? 1));
        const requireCitations = workflowConfig.require_citations !== false;

        const savedStages = STAGES.filter(stage => checkpoints[stage]?.result !== undefined);
        for (const stage of savedStages) {
          const previousBrief = checkpoints[stage].research_format === BRIEF_FORMAT;
          if (previousBrief !== researchBriefs) throw new Error(message("workflow.the.brief.contract.cannot.change.within.a.round.use.a.new.cycle.id"));
          const previousThinking = checkpoints[stage].research_thinking === THINKING_POLICY;
          if (previousThinking !== selectiveFastThinking) throw new Error(message("workflow.the.research.thinking.policy.cannot.change.within.a.round.use.a.new.cycle.id"));
        }
        const context = researchBriefs ? briefContext({ portfolio, mandate, targets, researchRounds, riskRounds }) : null;
        const restoredBriefs = researchBriefs && savedStages.length ? (await client.get("/api/analysis/evidence?cycle_id=" + encodeURIComponent(cycleId) + "&stage=research_briefs"))?.evidence : null;
        if (researchBriefs && savedStages.length && (restoredBriefs?.format !== BRIEF_FORMAT || restoredBriefs.context !== context)) throw new Error(message("workflow.brief.archive.is.missing.or.account.mandate.changed.use.a.new.cycle.id"));
        if (researchBriefs && savedStages.some(stage => !Array.isArray(restoredBriefs?.stages?.[stage]) || restoredBriefs.errors?.[stage]?.length)) throw new Error(message("workflow.completed.stage.brief.archives.are.incomplete.use.a.new.cycle.id"));
        const briefRun = researchBriefs ? { bundle: restoredBriefs ?? {format:BRIEF_FORMAT,context,stages:{},facts:[]} } : null;

        const inheritedRegistry = Object.values(checkpoints).flatMap(row => row?.evidence_registry ?? []);
        if (policy) {
          gateway = new ResearchGateway({ cycleId, market: normalizedMarket, symbols: targets, signal: exec.signal, mode: researchPolicy });
          gateway.portfolio = portfolio; gateway.mandate = mandatePayload;
          gateway.stageResults = {};
          // These reads already happened at admission. The same response shapes
          // seed the gateway; a child does not start a second independent client.
          await gateway.read("investment_portfolio", { market: normalizedMarket }, () => portfolio, { prefetch: true });
          await gateway.read("investment_mandate", {}, () => mandatePayload, { prefetch: true });
          for (const current of evidenceIndex(gateway.archive)) {
            const previous = inheritedRegistry.filter(row => row.source === current.source && !row.symbol);
            if (previous.some(row => row.data_version !== current.data_version)) throw new Error(message("workflow.account.or.mandate.changed.the.old.verdict.cannot.be.reused.analyze.again.with.a"));
          }
        }
        const registry = () => [...new Map([...inheritedRegistry, ...evidenceIndex(gateway?.archive ?? [])].map(row => [row.id, row])).values()];
        const policyRun = policy ? { policy, gateway, symbols: targets, registry,
          validate: (stage, value, task) => { if (strictEvidence) validateStage(stage, value, WORKFLOW_AGENT_SCHEMAS, targets, registry(), task); } } : null;
        const runStage = async (stage, script, args, maxAgents) => {
          args.output_language = runState?.output_language ?? "zh";
          if (policy) args.evidence_registry = registry();
          if (briefRun) args.brief_facts = briefRun.bundle.facts;
          const saved = checkpoints[stage]?.result;
          if (saved !== undefined) {
            const restored = (await client.get("/api/analysis/evidence?cycle_id=" + encodeURIComponent(cycleId) + "&stage=" + stage).catch(() => null))?.evidence ?? ((researchRoles || researchBriefs) ? null : saved);
            if (restored == null) throw new Error(message("workflow.full.research.archives.are.missing.lossless.resume.is.unavailable.resolve.this.i"));
            const value = researchBriefs ? restored : compact(restored);
            requireCompleteStage(stage, value, args);
            policyRun?.validate(stage, value, args);
            if (gateway) gateway.stageResults[stage] = value;
            return value;
          }
          return executeStage(ctx, client, exec, activeRuns, cycleId, stage,
            uniformOutput ? uniformScript(script, WORKFLOW_AGENT_SCHEMAS) : script, args, maxAgents, policyRun, briefRun, thinking);
        };
        const packets = collectShared && checkpoints.base_research?.result && (researchRoles || researchBriefs)
          ? (await client.get("/api/analysis/evidence?cycle_id=" + encodeURIComponent(cycleId) + "&stage=shared_research").catch(() => null))?.evidence
          : collectShared && !checkpoints.base_research?.result
          ? await collectResearchPackets(ctx, client, targets, normalizedMarket, { memory, mandate, holdings, researchRoles, outputLanguage:runState.output_language ?? "zh", signal: exec.signal,
            ...(policy ? { read: (tool, args, symbol) => policy.prefetch(gateway, tool, args, exec.signal, symbol, exec.agent) } : {}) })
          : undefined;
        if (gateway) gateway.packets = packets;
        if ((researchRoles || researchBriefs) && checkpoints.base_research?.result && !packets) throw new Error(message("workflow.shared.original.research.material.is.missing.lossless.resume.is.unavailable.use."));
        const collectionWarnings = [];
        if (packets) {
          // Preserve the full normalized inputs before model prompts shorten
          // verbose text. Provider choice, source dates and gaps remain auditable.
          try {
            const archive = await client.post("/api/analysis/runs/archive", { cycle_id: cycleId, stages: { shared_research: packets } }, { timeoutMs: 120000 });
            if (archive.archive_dir === null) collectionWarnings.push(message("workflow.shared.evidence.archive.was.not.written.traceability.is.incomplete"));
          } catch { collectionWarnings.push(message("workflow.shared.evidence.archive.request.failed.traceability.is.incomplete")); }
        }
        if (collectShared) checkCancellation(await client.get("/api/analysis/run?cycle_id=" + encodeURIComponent(cycleId)));
        const base = await runStage("base_research",(singleConversationBaseResearch ? cachedScripts?.base_research_single : null) ?? cachedScripts?.base_research ?? BASE_RESEARCH_SCRIPT,{symbols:targets,market:normalizedMarket,roles:Object.keys(ROLE_INSTRUCTIONS),role_instructions:ROLE_INSTRUCTIONS,memory,packets,research_roles:researchRoles},targets.length*4);
        const validation = validBaseResearch(base,minimumAnalysts,minimumCitations,requireCitations,targets);
        const successRatio = validation.good.length / targets.length;
        const requiredRatio = Math.max(0,Math.min(1,Number(workflowConfig.minimum_symbol_research_success_ratio ?? 0.8)));
        if (successRatio < requiredRatio) throw new Error(message("workflow.base.research.success.ratio") + successRatio.toFixed(2) + message("workflow.is.below.threshold") + requiredRatio.toFixed(2) + message("workflow.fail.safe.rules.block.submission.for.this.round"));
        const failedHoldings = validation.failed.filter((symbol) => holdingSymbols.includes(symbol));
        const debate = await runStage("research_debate",cachedScripts?.research_debate ?? RESEARCH_DEBATE_SCRIPT,{research:validation.good,mandate,holdings,rounds:researchRounds},Math.max(1,validation.good.length*(2*researchRounds+2)));
        const recommendations = (Array.isArray(debate) ? debate : []).map((row) => row?.trader).filter(Boolean);
        const draft = await runStage("portfolio_draft",cachedScripts?.portfolio_draft ?? PORTFOLIO_SCRIPT,{portfolio,mandate,recommendations},1);
        const risk = await runStage("risk_review",cachedScripts?.risk_review ?? RISK_SCRIPT,{draft,portfolio,mandate,recommendations,research:validation.good,rounds:riskRounds},3*riskRounds+1);
        const finalResult = await runStage("final_decision",cachedScripts?.final_decision ?? FINAL_SCRIPT,{risk,recommendations,mandate},1);
        const decisionSymbols = uniqueSymbols([...validation.good.map(row => row.symbol), ...failedHoldings]);
        const decisions = enforceCashDeployment(normalizedDecisions(finalResult?.decisions,decisionSymbols,failedHoldings),recommendations,portfolio,mandate);
        if (finalResult && typeof finalResult === "object") finalResult.decisions = decisions;
        try {
          await client.post("/api/analysis/runs/archive", { cycle_id: cycleId, stages: { final_decision: { ...(finalResult || {}), decisions } } }, { timeoutMs: 120000 });
        } catch { /* the report will still use the canonical run decisions */ }
        const warnings = [...collectionWarnings, ...validation.failed.map((symbol) => holdingSymbols.includes(symbol) ? symbol+message("workflow.base.research.incomplete.forced.hold") : symbol+message("workflow.base.research.incomplete.excluded.from.candidate.decisions"))];
        // Persist the final decisions FIRST and enter ready_for_execution:
        // the engine canonicalizes the decisions, computes the decision
        // fingerprint and stores both. A later submission bound to this
        // cycle_id must carry exactly this content.
        const readyPayload = await saveRunState(client, "/api/analysis/runs/update",{cycle_id:cycleId,stage:"final_decision",event:"execution_ready",decisions,warnings,result:compact(finalResult),...(researchBriefs ? {research_format:BRIEF_FORMAT} : {}),...(thinking ? {research_thinking:THINKING_POLICY} : {})});
        checkCancellation(readyPayload);
        const readyRun = readyPayload?.analysis ?? {};
        let execution = {status:"not_submitted",reason_code:"RESEARCH_NOT_SUBMITTED",reason:message("research.notSubmitted")};
        if (submit) {
          // Autonomous scheduling: ready_for_execution + submit=true is the
          // one path that may execute. The engine verifies the fingerprint
          // against the ready record, applies hard risk controls and the
          // paper broker, and its execution receipt (same atomic write as
          // the account mutation) guarantees exactly-once fills; the bound
          // run is finalized by the engine.
          const submitted = await submitReadyRun(client, readyRun, safeLabel, String(finalResult?.summary ?? message("workflow.full.multi.role.analysis.completed")).slice(0,1800));
          return {...summarize(submitted.run),decisions,warnings,execution:submitted.execution,base_research_success_ratio:successRatio,screening_note:screeningNote,symbols_source:symbolsSource,resumed:Object.keys(checkpoints).length>0};
        }
        // Manual rounds END at ready_for_execution: analysis is done, trading
        // waits for the user's explicit approval on a later submission call.
        return {...summarize(readyRun),decisions,warnings,execution,base_research_success_ratio:successRatio,screening_note:screeningNote,symbols_source:symbolsSource,resumed:Object.keys(checkpoints).length>0};
      } catch (error) {
        if (error instanceof AnalysisCancelled) return {...summarize(error.analysis),done:true};
        if (started) {
          const persisted = (await client.get("/api/analysis/run?cycle_id=" + encodeURIComponent(cycleId)).catch(() => null))?.analysis;
          if (["ready_for_execution", "completed", "cancelled"].includes(persisted?.status)) return {...summarize(persisted),done:true,resumed:true,warning:String(error?.message??error)};
          await saveRunState(client, "/api/analysis/runs/fail",{cycle_id:cycleId,error:String(error?.message??error)}).catch(() => {});
        }
        throw error;
      } finally {
        try {
          const telemetry = await meter.flush(started ? cycleId : undefined);
          if (telemetry.pending_usage_events || telemetry.unattributed_requests || telemetry.status_delivery_failed) console.warn("Analysis usage telemetry incomplete:", JSON.stringify(telemetry));
        } catch (error) { console.warn("Auxiliary delivery failed:", String(error?.message ?? error)); }
        if (gateway) {
          try { gateway.close(); } catch (error) { console.warn("Research cleanup failed:", String(error?.message ?? error)); }
          await client.post("/api/analysis/runs/archive", { cycle_id: cycleId, stages: { ...(gateway.packets ? { shared_research: gateway.packets } : {}), tool_policy: { ...gateway.summary(), evidence: gateway.archive } } }).catch(() => {});
        }
      }
    }),
    {timeoutMs:1800000},
  );

  registerTool(
    ctx,
    "investment_analysis_status",
    "查询固定分析流程轮次（investment_analysis_workflow 启动）的实时状态：阶段、检查点、Agent 进度与最终决策/成交。轮询直到分析完成、失败或停止，再向用户总结。",
    {
      cycle_id:{type:"string",description:"轮次幂等键；留空返回最近一次轮次"},
      market:{type:"string",description:"可选：只查某市场最近的轮次（cn/hk/us/etf）"},
      detail:{type:"boolean",description:"显式读取完整检查点与研究明细，默认仅返回必要进度和最终决策",default:false},
    },
    async ({cycle_id, market, detail = false}) => {
      let payload;
      if (cycle_id) {
        payload = await client.get("/api/analysis/run?cycle_id="+encodeURIComponent(cycle_id));
        if (!payload?.ok && payload?.analysis === undefined) throw new Error(payload?.error ?? message("workflow.round.not.found"));
      } else {
        payload = await client.get("/api/analysis/latest"+(market ? "?market="+encodeURIComponent(String(market).toLowerCase()) : ""));
      }
      const run = payload?.analysis ?? null;
      if (!run) return {status:"none",hint:message("workflow.no.analysis.rounds.yet.start.the.fixed.workflow.with.investment.analysis.workflo")};
      const compactRun = detail ? run : lightweightResults ? analysisSummary(run) : compact(run);
      const terminal = run.status === "completed" || run.status === "failed" || run.status === "ready_for_execution" || run.status === "cancelled";
      let hint;
      if (run.status === "ready_for_execution") {
        hint = message("workflow.analysis.completed.ready.for.execution.present.the.exact.final.decisions.and.wai") + String(run.cycle_id ?? "") + "）。";
      } else if (run.status === "running") {
        hint = message("workflow.round.is.still.running") + String(run.current_stage ?? "preparing") + message("workflow.check.again.later.with.this.tool.do.not.start.a.duplicate.round");
      } else if (run.status === "failed") {
        hint = message("workflow.round.failed") + String(run.error ?? message("workflow.unknown.error")) + message("workflow.saved.checkpoints.are.retained.report.the.error.first.resume.with.the.same.cycle");
      } else if (run.status === "cancelled") {
        hint = message("workflow.round.stopped.start.a.new.round.if.a.new.analysis.is.needed");
      } else {
        hint = message("workflow.round.ended") + run.status + message("workflow.summarize.decisions.fills.rejections.and.risks.do.not.submit.trades.without.user");
      }
      return {
        ...compactRun,
        done: terminal,
        hint,
      };
    },
    {timeoutMs: 30000},
  );
}

export { STAGES, validBaseResearch, normalizedDecisions, stableCycleId, resolveSymbolsSource, requestIdentity, contentFingerprint };
