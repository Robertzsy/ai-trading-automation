import { assertObjectJsonSchema, validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";

export function uniformSchema(schemas) {
  const schema = { type: "object", additionalProperties: false,
    properties: { kind: { type: "string", enum: Object.keys(schemas) }, result: { oneOf: Object.values(schemas) } }, required: ["kind", "result"] };
  assertObjectJsonSchema(schema);
  return schema;
}

/** Keep one wire schema, then unwrap and validate the EXACT role schema in
 * the deterministic worker. A manager cannot submit a valid analyst result. */
export function uniformScript(script, schemas) {
  const shared = uniformSchema(schemas);
  const helper = `
const roleSchemas = ${JSON.stringify(schemas)};
const commonSchema = ${JSON.stringify(shared)};
const matches = (schema, value) => {
  if (schema.type === "object") return value && typeof value === "object" && !Array.isArray(value) && schema.required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => Object.hasOwn(schema.properties,key) && matches(schema.properties[key],value[key]));
  if (schema.type === "array") return Array.isArray(value) && value.every(item => matches(schema.items,item));
  if (typeof value !== schema.type || (schema.type === "number" && !Number.isFinite(value))) return false;
  return !schema.enum || schema.enum.includes(value);
};
const roleAgent = async (prompt, options) => {
  const kind = Object.keys(roleSchemas).find(key => JSON.stringify(roleSchemas[key]) === JSON.stringify(options.schema));
  if (!kind) throw new Error("Unknown investment role schema");
  const envelope = await agent(prompt + "\\n结构化提交使用统一外壳：{kind:" + JSON.stringify(kind) + ",result:该角色原始结果}。本角色 result 必须符合：" + JSON.stringify(options.schema), {...options, schema:commonSchema});
  if (!envelope || envelope.kind !== kind) throw new Error("Invalid role result kind: " + kind);
  if (!matches(options.schema, envelope.result)) throw new Error("Invalid exact role result schema: " + kind);
  return envelope.result;
};
`;
  return helper + script.replace(/\bagent\(/g, "roleAgent(");
}

function validate(schema, value, label) {
  const errors = validateJsonSchemaValue(schema, value, label);
  if (errors.length) throw new Error("角色结果不完整：" + errors.slice(0, 8).join("；"));
}
export function roleContract(stage, label) {
  if (stage === "base_research") return { kind: "baseResearch", symbol: label.split(":")[0], role: label.split(":")[1] };
  if (stage === "research_debate") {
    const [symbol, role] = label.split(":");
    return { symbol, kind: role.startsWith("bull-") || role.startsWith("bear-") ? "debate" : role === "trader" ? "trader" : "researchManager",
      ...(role.startsWith("bull-") ? { side: "bull" } : role.startsWith("bear-") ? { side: "bear" } : {}) };
  }
  if (stage === "portfolio_draft") return { kind: "portfolio" };
  if (stage === "risk_review") return label === "risk-manager" ? { kind: "riskManager" } : { kind: "riskView", role: label.match(/^risk-(aggressive|conservative|neutral)-r/)[1] };
  return { kind: "finalDecision" };
}
export function validateRoleOutput(stage, label, candidate, schemas, symbols, registry) {
  const contract = roleContract(stage, label);
  const row = candidate?.kind !== undefined ? candidate.result : candidate;
  if (candidate?.kind !== undefined && candidate.kind !== contract.kind) throw new Error("提交 kind 必须为 " + contract.kind);
  validate(schemas[contract.kind], row, contract.kind);
  for (const key of ["symbol", "role", "side"]) if (contract[key] && row[key] !== contract[key]) throw new Error(key + " 必须为 " + contract[key]);
  const known = new Map(registry.map(record => [record.id, record]));
  const references = (value, symbol = contract.symbol) => {
    for (const id of value.evidence_ids ?? []) {
      const record = known.get(id);
      if (!record || (symbol && record.symbol && symbol !== record.symbol)) throw new Error("引用无法追溯到本股票：" + id);
    }
    for (const evidence of value.evidence ?? []) {
      const record = known.get(evidence.id);
      if (!record || (symbol && record.symbol && symbol !== record.symbol) || evidence.source !== record.source) throw new Error("证据 id/source 必须与登记完全一致：" + evidence.id);
    }
    const decisions = value.decisions ?? [];
    if (new Set(decisions.map(item => item.symbol)).size !== decisions.length) throw new Error("不能重复提交同一股票决策");
    for (const decision of decisions) {
      if (!symbols.includes(decision.symbol)) throw new Error("不能提交本轮之外的股票");
      references(decision, decision.symbol);
    }
  };
  references(row);
}
export function validateStage(stage, value, schemas, symbols, registry, task = {}) {
  const known = new Map(registry.map(record => [record.id, record]));
  const seen = new Set();
  const refs = (row, symbol) => {
    for (const id of row.evidence_ids ?? []) {
      const record = known.get(id);
      if (!record) throw new Error("未登记证据引用：" + id);
      if (symbol && record.symbol && symbol !== record.symbol) throw new Error("跨股票证据引用：" + id);
    }
    if (Array.isArray(row.decisions)) {
      if (new Set(row.decisions.map(item => item.symbol)).size !== row.decisions.length) throw new Error("重复股票决策");
      for (const decision of row.decisions) {
        if (!symbols.includes(decision.symbol)) throw new Error("决策包含本轮之外的股票");
        refs(decision, decision.symbol);
      }
    }
  };
  const check = (kind, row, symbol) => { validate(schemas[kind], row, kind); refs(row, symbol); };
  if (stage === "base_research") {
    if (!Array.isArray(value)) throw new Error("基础研究必须是数组");
    for (const item of value) {
      if (!symbols.includes(item.symbol) || seen.has(item.symbol)) throw new Error("基础研究股票身份不匹配");
      seen.add(item.symbol);
      if (!Array.isArray(item.analyses) || item.analyses.length !== 4) throw new Error("四类基础研究不完整");
      const roles = new Set(["technical_analyst", "fundamentals_analyst", "news_analyst", "sentiment_analyst"]);
      for (const row of item.analyses) {
        check("baseResearch", row, item.symbol);
        if (row.symbol !== item.symbol || !roles.delete(row.role)) throw new Error("基础研究角色身份不匹配");
        for (const evidence of row.evidence) {
          const source = known.get(evidence.id);
          if (!source || (source.symbol && source.symbol !== item.symbol) || source.source !== evidence.source) throw new Error("基础证据无法追溯：" + evidence.id);
        }
      }
    }
    if (seen.size !== symbols.length) throw new Error("基础研究缺少目标股票");
  } else if (stage === "research_debate") {
    if (!Array.isArray(value)) throw new Error("研究辩论必须是数组");
    for (const item of value) {
      if (!symbols.includes(item.symbol) || seen.has(item.symbol)) throw new Error("研究辩论股票身份不匹配");
      seen.add(item.symbol);
      if (!Array.isArray(item.sides) || item.sides.length !== 2 * (task.rounds ?? 1)) throw new Error("多空意见不完整");
      if (item.sides.filter(row => row.side === "bull").length !== (task.rounds ?? 1) || item.sides.filter(row => row.side === "bear").length !== (task.rounds ?? 1)) throw new Error("多空角色身份不匹配");
      for (const side of item.sides) { check("debate", side, item.symbol); if (side.symbol !== item.symbol) throw new Error("辩论股票身份不匹配"); }
      check("researchManager", item.manager, item.symbol); check("trader", item.trader, item.symbol);
      if (item.manager.symbol !== item.symbol || item.trader.symbol !== item.symbol) throw new Error("个股裁决身份不匹配");
    }
    if (seen.size !== symbols.length) throw new Error("研究裁决缺少目标股票");
  } else if (stage === "portfolio_draft") check("portfolio", value);
  else if (stage === "risk_review") {
    if (!Array.isArray(value?.views) || value.views.length !== 3 * (task.rounds ?? 1)) throw new Error("风险三方意见不完整");
    if (["aggressive", "conservative", "neutral"].some(role => value.views.filter(row => row.role === role).length !== (task.rounds ?? 1))) throw new Error("风险角色身份不匹配");
    for (const row of value.views) check("riskView", row);
    check("riskManager", value.manager);
  } else if (stage === "final_decision") check("finalDecision", value);
}

/** Decision bytes are preserved for the engine fingerprint. No checkpoint
 * payloads are sent back through the parent's model context. */
export function analysisSummary(run) {
  if (!run) return null;
  const result = {};
  for (const key of ["cycle_id", "market", "status", "current_stage", "symbols", "symbols_source", "expected_agents", "started_agents", "completed_agents", "failed_agents", "evidence_count", "error", "warnings", "decisions", "execution", "report", "audit_file", "started_at", "completed_at"]) {
    if (run[key] !== undefined) result[key] = run[key];
  }
  result.details = { tool: "investment_analysis_status", cycle_id: run.cycle_id, detail: true };
  return result;
}
