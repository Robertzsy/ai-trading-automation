import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { assertObjectJsonSchema } from "@deepseek-ai/dsh-tools";
import { WORKFLOW_AGENT_SCHEMAS, registerAnalysisWorkflow } from "../../dsh-investment-tools/lib/analysis-workflow.js";
import { briefSchema, briefSources, resolveBriefReference, compileBrief, briefJson, briefWorkflowScripts } from "../../dsh-investment-tools/lib/research-briefs.js";
import { collectResearchPackets } from "../../dsh-investment-tools/lib/analysis-cache.js";

const symbol = "00700";
const packets = { [symbol]: { symbol, market:"hk", snapshot:{price:100}, history:{data:[{date:"2026-10-09",close:100}]},
  fundamentals:{provider:"official",warnings:["披露日期缺失"],records:[{period_type:"cumulative",period_start:"2026-01-01",period_end:"2026-06-30",disclosed_at:null,currency:"CNY",
    metrics:{cash_flow_per_share:{value:16.9,unit:"CNY/share",source_field:"PER_NETCASH_OPERATE"}}}]},
  news:{items:[{article_id:"N-1",title:"公开公告",summary:"原始节选",source_url:"https://example.com/notice",published_at:null,time_scope:"unknown",full_text_verified:false}]} } };
const ref = "F-hk-00700-fundamentals#/records/0/metrics/cash_flow_per_share/value";
const sources = briefSources(packets);
function brief(role="fundamentals_analyst") {
  return {symbol,role,summary:"现金流质量待核验",stance:"neutral",confidence:.5,
    arguments:[{inference:"每股指标不能等同现金总额",evidence_refs:[ref],counterargument:"缺少现金总额与披露日期",invalid_if:"核实总额后再判断"}],supplemental_evidence:[],risks:["缺少披露日期"],data_quality:"部分缺失"};
}

test("brief schema uses the real DSH schema validator", () => {
  assert.doesNotThrow(() => assertObjectJsonSchema(briefSchema(WORKFLOW_AGENT_SCHEMAS.baseResearch)));
});
test("resolved facts retain exact units, unknown dates and cumulative period metadata", () => {
  const fact=resolveBriefReference(ref,sources,symbol), claim=JSON.parse(fact.claim);
  assert.equal(claim.value,16.9);
  assert.equal(claim.context["/records/0/metrics/cash_flow_per_share"].unit,"CNY/share");
  assert.equal(claim.context["/records/0"].period_type,"cumulative");
  assert.equal(claim.context["/records/0"].disclosed_at,null);
  const news=resolveBriefReference("F-hk-00700-news#/items/0/summary",sources,symbol);
  assert.equal(JSON.parse(news.claim).context["/items/0"].published_at,null);
  assert.equal(JSON.parse(news.claim).context["/items/0"].full_text_verified,false);
});
test("invented paths, another stock and prototype lookups fail closed", () => {
  for (const invalid of [ref.replace("/value","/missing"),"F-hk-00700-snapshot#/constructor", "F-hk-00700-snapshot#price", "F-hk-00700-snapshot#/x~2"]) {
    assert.throws(()=>resolveBriefReference(invalid,sources,symbol));
  }
  assert.throws(()=>resolveBriefReference(ref,sources,"09988"),/wrong-stock/);
  assert.throws(()=>compileBrief(brief(),sources,"00700:technical_analyst"),/identity/);
});
test("all arguments and late dissent survive compilation and downstream serialization", () => {
  const raw=brief(); raw.arguments[0].counterargument="长反证".repeat(1700)+"最后的关键反证";
  const compiled=compileBrief(raw,sources,symbol+":"+raw.role);
  assert.match(compiled.summary,/最后的关键反证/);
  assert.match(compiled.summary,/核实总额后再判断/);
  const json=briefJson({analyses:[compiled,{...compiled,role:"news_analyst"}]});
  const result=JSON.parse(json);
  assert.equal(result.facts.length,1);
  assert.equal(result.data.analyses[1].evidence_ids[0],ref);
  assert.match(result.data.analyses[0].summary,/最后的关键反证/);
  assert.throws(()=>briefJson({analyses:[compiled,{...compiled,evidence:[{...compiled.evidence[0],claim:"different"}]}]}),/conflicting/);
  const forwarded=JSON.parse(briefJson({manager:{evidence_ids:[ref],verdict:"裁决"}},compiled.evidence));
  assert.equal(forwarded.facts[0].claim,compiled.evidence[0].claim);
  assert.throws(()=>briefJson({evidence_ids:["invented"]},compiled.evidence),/unbound/);
});
test("released collection avoids prior experimental calculations and model news fields", async () => {
  const ctx={web:{async search(){return {sources:[{url:"https://example.com/notice",model_summary:"未核验归纳"}]};}}};
  const client={async get(){return {price:1};}};
  const original=await collectResearchPackets(ctx,client,[symbol],"hk");
  assert.equal(original[symbol].calculations,undefined);
  assert.equal(original[symbol].news.items[0].summary,"");
  assert.equal(original[symbol].news.items[0].summary_kind,undefined);
  const experimental=await collectResearchPackets(ctx,client,[symbol],"hk",{researchRoles:true});
  assert.ok(experimental[symbol].calculations);
  assert.equal(experimental[symbol].news.items[0].summary_kind,"model_summary_unverified");
});

async function run(stage,args,response,swallowPipeline=false) {
  const calls=[];
  const result=await runInNewContext(`(async()=>{${briefWorkflowScripts(WORKFLOW_AGENT_SCHEMAS)[stage]}})()`,{
    args,phase(){},async parallel(tasks){return Promise.all(tasks.map(task=>task()));},
    async pipeline(items,task){const rows=[];for(const item of items){try{rows.push(await task(null,item));}catch(error){if(!swallowPipeline)throw error;rows.push(null);}}return rows;},
    async agent(prompt,options){calls.push({prompt,...options});return response(options,calls.length);},
  });
  return {result,calls};
}
test("generated scripts retain every role and round, collect raw briefs and pass full facts to debate", async () => {
  const roles=["technical_analyst","fundamentals_analyst","news_analyst","sentiment_analyst"];
  const base=await run("base_research",{symbols:[symbol],market:"hk",roles,role_instructions:Object.fromEntries(roles.map(role=>[role,role])),packets},options=>brief(options.label.split(":")[1]));
  assert.equal(base.calls.length,4); assert.equal(base.result.briefs.length,4);
  assert.equal(base.result.data[0].analyses[0].evidence[0].id,ref);
  assert.match(base.calls[0].prompt,/cash_flow_per_share/);
  const debate=await run("research_debate",{research:base.result.data,mandate:{},holdings:{},rounds:2},options=>({symbol,thesis:options.label,reason:options.label,evidence_ids:[ref]}));
  assert.equal(debate.calls.length,6);assert.equal(debate.result.data[0].sides.length,4);
  assert.equal(debate.result.briefs.length,6);assert.match(debate.calls[0].prompt,/CNY\/share/);
  assert.match(debate.calls[0].prompt,/缺少现金总额与披露日期/);
  const risk=await run("risk_review",{draft:{decisions:[]},portfolio:{},mandate:{},rounds:3},options=>({role:options.label,assessment:options.label,evidence_ids:[ref]}));
  assert.equal(risk.calls.length,10);assert.equal(risk.result.data.views.length,9);
  assert.equal(risk.result.briefs.length,10);
  for(const stage of ["portfolio_draft","final_decision"]){const result=await run(stage,{portfolio:{},mandate:{},recommendations:[],risk:{}},()=>({summary:"OK",decisions:[]}));assert.equal(result.calls.length,1);}
  await assert.rejects(()=>run("base_research",{symbols:[symbol],market:"hk",roles,role_instructions:{},packets},()=>null),/role failed/);
});
test("brief trial cannot silently combine other experiments",()=>{
  assert.throws(()=>registerAnalysisWorkflow({}, {}, ()=>{}, {researchBriefs:true,researchRoles:true}),/试验/);
});
test("binding errors remain diagnosable when the real SDK pipeline drops a failed stock",async()=>{
  const result=await run("base_research",{symbols:[symbol],market:"hk",roles:["fundamentals_analyst"],role_instructions:{},packets},()=>{
    const row=brief();row.arguments[0].evidence_refs=["F-hk-00700-news#/news/items/0/title"];return row;
  },true);
  assert.equal(result.result.data.length,0);
  assert.equal(result.result.briefs.length,1);
  assert.equal(result.result.errors.length,1);
  assert.match(result.result.errors[0].error,/missing or unsafe/);
});

test("real controller archives full arguments and refuses a missing archive or a different resume contract",async()=>{
  const previous=process.env.ATA_AUTONOMOUS_ROUND;process.env.ATA_AUTONOMOUS_ROUND="1";
  const archives={},checkpoints={},prompts=[];
  let failDebate=true, stageCalls=0, version=1;
  const client={
    async get(url){
      if(url==="/api/status")return {control:{}};
      if(url.startsWith("/api/portfolio/"))return {holdings:[],cash:100000};
      if(url==="/api/mandate")return {mandate:{version}};
      if(url==="/api/config")return {config:{}};
      if(url.startsWith("/api/analysis/runs?"))return {runs:[]};
      if(url.startsWith("/api/analysis/run?"))return {analysis:{status:"running"}};
      if(url.startsWith("/api/analysis/evidence?"))return {evidence:archives[new URL("http://local"+url).searchParams.get("stage")]};
      if(url.startsWith("/api/market/snapshot"))return packets[symbol].snapshot;
      if(url.startsWith("/api/market/history"))return packets[symbol].history;
      if(url.startsWith("/api/research/fundamentals"))return packets[symbol].fundamentals;
      throw new Error("unexpected GET "+url);
    },
    async post(url,body){
      if(url.endsWith("/start"))return {analysis:{status:"running",checkpoints:structuredClone(checkpoints)}};
      if(url.endsWith("/archive")){Object.assign(archives,structuredClone(body.stages));return {archive_dir:"mock/archive"};}
      if(url.endsWith("/checkpoint")){Object.assign(archives,structuredClone(body.archives));checkpoints[body.stage]=structuredClone(body);}
      if(body.event==="checkpoint")checkpoints[body.stage]=structuredClone(body);
      return {analysis:{status:"running",checkpoints:structuredClone(checkpoints)}};
    },
  };
  const ctx={on(){},get(name){if(name==="analysisMeter")return {begin(){},async flush(){return {};}};
    if(name==="web")return {async search(){return {sources:[]};}};},workflowEngine:{start(request){
      stageCalls++;const stage=request.meta.name;
      if(stage.includes("research-debate")&&failDebate)throw new Error("intentional debate interruption");
      return {id:stage,result:runInNewContext(`(async()=>{${request.script}})()`,{
        args:request.args,phase(){},async parallel(tasks){return Promise.all(tasks.map(task=>task()));},
        async pipeline(items,task){const rows=[];for(const item of items)rows.push(await task(null,item));return rows;},
        async agent(prompt,options){prompts.push(prompt);if(stage.endsWith("base-research")){
          const output=brief(options.label.split(":")[1]);output.arguments[0].counterargument="反证".repeat(2000)+"尾部风险";return output;
        }return {symbol,summary:"裁决",thesis:"论据",verdict:"裁决",role:options.label,assessment:"风险",evidence_ids:[ref],
          trader:{symbol,action:"HOLD",target_weight:0,confidence:.5,reason:"待核验",evidence_ids:[ref]},decisions:[{symbol,action:"HOLD",target_weight:0,confidence:.5,reason:"待核验",evidence_ids:[ref]}]};},
      }).then(value=>({stopReason:"completed",value,agentsStarted:4})),async dispose(){}};
    }}};
  const executors=new Map();
  const register=(_ctx,name,_desc,_schema,execute)=>executors.set(name,execute);
  const args={market:"hk",symbols:[symbol],submit:false,cycle_id:"brief-test"},exec={agent:{id:"parent",session:{events:[]}}};
  try{
    registerAnalysisWorkflow(ctx,client,register,{researchBriefs:true,sharedResearch:true,strictEvidence:false});
    await assert.rejects(()=>executors.get("investment_analysis_workflow")(args,exec),/intentional debate/);
    assert.equal(checkpoints.base_research.research_format,"research-brief-v1");
    assert.match(archives.base_research[0].analyses[0].summary,/尾部风险/);
    assert.equal(archives.research_briefs.stages.base_research.length,4);
    const saved=archives.research_briefs;delete archives.research_briefs;
    const before=stageCalls;
    registerAnalysisWorkflow(ctx,client,register,{researchBriefs:true,sharedResearch:true,strictEvidence:false});
    await assert.rejects(()=>executors.get("investment_analysis_workflow")(args,exec),/归档缺失/);
    assert.equal(stageCalls,before);
    archives.research_briefs=saved;version=2;
    registerAnalysisWorkflow(ctx,client,register,{researchBriefs:true,sharedResearch:true,strictEvidence:false});
    await assert.rejects(()=>executors.get("investment_analysis_workflow")(args,exec),/授权书已变化/);
    version=1;
    registerAnalysisWorkflow(ctx,client,register,{sharedResearch:true,strictEvidence:false});
    await assert.rejects(()=>executors.get("investment_analysis_workflow")(args,exec),/切换简洁论据契约/);
    registerAnalysisWorkflow(ctx,client,register,{researchBriefs:true,sharedResearch:true,strictEvidence:false});
    failDebate=false;
    await executors.get("investment_analysis_workflow")(args,exec);
    assert.equal(stageCalls,before+4);
    assert.match(prompts[4],/尾部风险/);
    assert.equal(Object.keys(archives.research_briefs.stages).length,5);
  }finally{if(previous===undefined)delete process.env.ATA_AUTONOMOUS_ROUND;else process.env.ATA_AUTONOMOUS_ROUND=previous;}
});
