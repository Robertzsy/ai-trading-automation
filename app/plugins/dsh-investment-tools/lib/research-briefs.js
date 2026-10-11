/** Opt-in concise reasoning. Facts are resolved by code, never rewritten by a model. */
import { cacheWorkflowScripts } from "./analysis-cache.js";
import { createHash } from "node:crypto";

export const BRIEF_FORMAT = "research-brief-v1";
const text = { type: "string" };
export function briefSchema(base) {
  const { evidence, ...properties } = base.properties;
  return {
    ...base,
    properties: {
      ...properties,
      arguments: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { inference: text, evidence_refs: { type: "array", items: text }, counterargument: text, invalid_if: text },
        required: ["inference", "evidence_refs", "counterargument", "invalid_if"],
      } },
      supplemental_evidence: evidence,
    },
    required: [...base.required.filter(key => key !== "evidence"), "arguments", "supplemental_evidence"],
  };
}

export function briefSources(packets) {
  const sources = {};
  for (const packet of Object.values(packets ?? {})) {
    const prefix = `F-${packet.market}-${packet.symbol}`;
    for (const [key, tool] of [["snapshot", "investment_market_snapshot"], ["history", "investment_market_history"], ["fundamentals", "investment_fundamentals"], ["news", "web_search"]]) {
      if (packet[key] && !packet[key].unavailable && !packet[key].error) {
        const id = `${prefix}-${key}`;
        sources[id] = { id, symbol: packet.symbol, title: key, source: tool, data: packet[key] };
      }
    }
  }
  return sources;
}

/** RFC 6901 reference: source-id#/records/0/metrics/revenue. Keep exact value + ancestor metadata. */
export function resolveBriefReference(ref, sources, symbol) {
  if (typeof ref !== "string" || !ref.includes("#")) throw new Error("invalid brief evidence reference");
  const split = ref.indexOf("#"), id = ref.slice(0, split), path = ref.slice(split + 1);
  const document = sources[id];
  if (!document || document.symbol !== symbol) throw new Error("unknown or wrong-stock brief evidence reference: " + ref);
  if (path !== "" && !path.startsWith("/")) throw new Error("invalid JSON pointer: " + ref);
  const metadata = {};
  const collect = (value, location) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const fields = Object.fromEntries(Object.entries(value).filter(([key, entry]) =>
      /date|time|period|currency|unit|source|provider|quality|status|report|disclos|publish|verified|evidence_kind/.test(key)
      && (entry === null || typeof entry !== "object" || ["units", "date_quality", "source_metadata"].includes(key))
      || key === "warnings"));
    if (Object.keys(fields).length) metadata[location || "/"] = fields;
  };
  let value = document.data, location = "";
  collect(value, location);
  for (const encoded of path === "" ? [] : path.slice(1).split("/")) {
    if (/~(?![01])/.test(encoded)) throw new Error("invalid JSON pointer escape: " + ref);
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (["__proto__", "prototype", "constructor"].includes(key) || value == null || typeof value !== "object" || !Object.hasOwn(value, key)) {
      throw new Error("missing or unsafe brief evidence path: " + ref);
    }
    value = value[key]; location += "/" + encoded; collect(value, location);
  }
  return { id: ref, title: document.title + (path || "（整包）"), source: document.source,
    claim: JSON.stringify({ path, value, context: metadata }) };
}

export function compileBrief(brief, sources, label) {
  if (!brief || `${brief.symbol}:${brief.role}` !== label || !Array.isArray(brief.arguments) || !Array.isArray(brief.supplemental_evidence)) {
    throw new Error("brief identity or reasoning structure does not match role: " + label);
  }
  const evidence = new Map(), paragraphs = [brief.summary];
  for (const argument of brief.arguments) {
    if (!argument.inference?.trim() || !Array.isArray(argument.evidence_refs) || typeof argument.counterargument !== "string" || typeof argument.invalid_if !== "string") {
      throw new Error("incomplete brief argument: " + label);
    }
    for (const ref of argument.evidence_refs) evidence.set(ref, resolveBriefReference(ref, sources, brief.symbol));
    paragraphs.push(argument.inference);
    if (argument.counterargument) paragraphs.push("反证/异议：" + argument.counterargument);
    if (argument.invalid_if) paragraphs.push("失效条件：" + argument.invalid_if);
  }
  for (const item of brief.supplemental_evidence) {
    if (!item.id || !item.source || !item.claim || evidence.has(item.id) || item.id.startsWith("F-")) throw new Error("invalid supplemental brief evidence");
    evidence.set(item.id, item);
  }
  const { arguments: _arguments, supplemental_evidence: _supplemental, ...compatible } = brief;
  return { ...compatible, summary: paragraphs.filter(Boolean).join("\n"), evidence: [...evidence.values()] };
}

/** Each input includes the complete evidence table once, plus references per analyst. No text truncation. */
export function briefJson(value, availableFacts) {
  const facts = new Map();
  const registered = new Map((availableFacts ?? []).map(row => [row.id, row]));
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== "object") return item;
    const result = {};
    for (const key of Object.keys(item).sort()) {
      if (key === "evidence" && Array.isArray(item[key])) {
        result.evidence_ids = item[key].map(row => {
          const previous = facts.get(row.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error("conflicting evidence identity: " + row.id);
          facts.set(row.id, row); return row.id;
        });
      } else {
        result[key] = visit(item[key]);
        if (key === "evidence_ids" && Array.isArray(item[key])) for (const id of item[key]) {
          const fact = registered.get(id);
          if (fact) facts.set(id, fact);
          else if (availableFacts !== undefined) throw new Error("unbound brief evidence identity: " + id);
        }
      }
    }
    return result;
  };
  const data = visit(value);
  return JSON.stringify(facts.size ? { data, facts: [...facts.values()] } : data);
}

export function briefContext(value) {
  return createHash("sha256").update(briefJson(value)).digest("hex");
}

export function briefWorkflowScripts(schemas) {
  const scripts = cacheWorkflowScripts(schemas);
  const brief = briefSchema(schemas.baseResearch);
  const directives = "只提交本角色的判断和论据，不写完整报告，不复述上游叙述、通用免责声明或整份行情。相同事实用证据编号引用。summary/结论通常一两句，论据只保留决策相关的推理；不能为了简短删掉反证、数据缺口、触发条件或风险争议。最终可读报告由程序组装。";
  const baseDirective = "基础研究用 arguments 列出独立论据；每项保留 inference、counterargument 和 invalid_if。引用共享事实时 evidence_refs 使用下面来源 id 加 # 和相对于该文档根的 JSON Pointer：snapshot 从 snapshot 内部起（例 #/realtime/price），fundamentals 从 fundamentals 内部起（例 #/records/0/metrics/revenue/value），history 例 #/indicators/mas/ma20，news 例 #/items/0/title 或 #/items/0；不得再写 /snapshot、/news 等外层包名。news 条目自己的 article_id 不是本契约来源 id。路径必须实际存在，不改写单位、报告期或日期。supplemental_evidence 仅存共享资料没有且工具实际补查到的事实，不重复摘录共享资料。若资料不足明确记录缺口。不要用整包引用掩盖缺少具体论据。";
  return Object.fromEntries(Object.entries(scripts).map(([stage, script]) => {
    const transformed = script.replace(/const json = [\s\S]*?;\nconst common =/, `const serializeBrief = ${briefJson.toString()};\nconst json = value => serializeBrief(value, args.brief_facts);\nconst common =`)
      .replace(/\bagent\(/g, "briefAgent(");
    return [stage, `
const briefSources = ${briefSources.toString()};
const resolveBriefReference = ${resolveBriefReference.toString()};
const compileBrief = ${compileBrief.toString()};
const validateBriefReferences = ${briefJson.toString()};
const sources = briefSources(args.packets);
const briefs = [];
const errors = [];
const briefAgent = async (prompt, options) => {
  const isBase = ${JSON.stringify(stage)} === "base_research";
  const sourceMap = Object.values(sources).filter(row => row.symbol === options.label.split(":")[0]).map(({data, ...row}) => row);
  const extra = ${JSON.stringify(directives)} + (isBase ? "\\n" + ${JSON.stringify(baseDirective)} + "\\n来源索引：" + JSON.stringify(sourceMap) : "");
  const result = await agent(prompt + "\\n" + extra, { ...options, ...(isBase ? {schema:${JSON.stringify(brief)}} : {}) });
  if (!result) throw new Error("brief role failed: " + options.label);
  briefs.push({label: options.label, value: result});
  try {
    if (!isBase) validateBriefReferences(result, args.brief_facts);
    return isBase ? compileBrief(result, sources, options.label) : result;
  }
  catch (error) { errors.push({label:options.label,error:String(error.message??error)}); throw error; }
};
const data = await (async () => { ${transformed} })();
return {format:${JSON.stringify(BRIEF_FORMAT)}, stage:${JSON.stringify(stage)}, data, briefs, errors};
`];
  }));
}
