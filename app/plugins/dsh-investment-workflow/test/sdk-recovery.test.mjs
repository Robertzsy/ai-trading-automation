import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { createScope } from "@deepseek-ai/dsh-scope";
import PtcWorkflowEngine from "@deepseek-ai/dsh-workflow-ptc";
import NodePtcRuntime from "@deepseek-ai/dsh-ptc-runtime-node";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import LocalFileSystem from "@deepseek-ai/dsh-fs-local";
import { registerAnalysisWorkflow } from "../../dsh-investment-tools/lib/analysis-workflow.js";

const targets=Array.from({length:20},(_,i)=>"TEST"+i);
function output(schema, key="", symbol="TEST0") {
  if(schema.enum)return schema.enum.includes("HOLD")?"HOLD":schema.enum[0];
  if(schema.const!==undefined)return schema.const;
  if(schema.type==="object")return Object.fromEntries(Object.entries(schema.properties??{}).map(([name,value])=>[name,output(value,name,symbol)]));
  if(schema.type==="array")return key==="decisions"?targets.map(symbol=>output(schema.items,"",symbol)):key==="evidence"?[output(schema.items,"",symbol)]:[];
  if(schema.type==="number"||schema.type==="integer")return key==="confidence"?.8:0;
  if(schema.type==="boolean")return true;
  if(schema.type==="string")return key==="symbol"?symbol:["claim","summary"].includes(key)?"合成软件故障测试".repeat(2500):"fixture";
  return null;
}

const softFailures = ["research_debate", "portfolio_draft", "risk_review", "final_decision"].flatMap(stage => ["max-tokens", "refusal", "missing-structured"].map(reason => stage + "/" + reason));
for(const failure of [null,"base_research","research_debate","portfolio_draft","risk_review","final_decision",...softFailures,"partial-base"])test("real PTC process chain / child failure: "+(failure??"none"),{timeout:60000},async()=>{
  const previous=process.env.ATA_AUTONOMOUS_ROUND;process.env.ATA_AUTONOMOUS_ROUND="1";
  const ctx=new Context(),tools=new Map(),archives={},state={cycle_id:"sdk-20",status:"running",checkpoints:{}},stageStarts=[];
  let currentStage,inject=Boolean(failure),providerCalls=0,ids=0;
  const providerLabels=[];
  ctx.provide("systemPrompt",{tools(){},section(){}});
  ctx.provide("analysisMeter",{begin(){},bind(){},async flush(){return {};}});
  ctx.provide("subagents",{getProvider(){return {capabilities:{outputSchema:true}};},async startActivation({request}){
    providerCalls++;
    const [softStage, softReason] = String(failure).split("/");
    if(inject && (currentStage===failure || (softReason && currentStage===softStage) || (failure==="partial-base" && currentStage==="base_research"))){
      inject=false;
      if(softReason || failure==="partial-base")return {childId:"bad-child",result:Promise.resolve({stopReason:softReason==="missing-structured"?"completed":softReason??"max-tokens",output:[]}),async dispose(){}};
      throw new Error("injected child infrastructure failure");
    }
    return {childId:"synthetic-child-"+(++ids),result:Promise.resolve({stopReason:"completed",output:[],structured:output(request.outputSchema)}),async dispose(){}};
  }});
  const client={async get(path){
    if(path==="/api/config")return {config:{autonomous:{max_universe_size:20}}};
    if(path.startsWith("/api/analysis/run?"))return {analysis:structuredClone(state)};
    if(path.startsWith("/api/analysis/evidence?"))return {evidence:archives[new URLSearchParams(path.split("?")[1]).get("stage")]};
    return {};
  },async post(path,body){
    if(body.event==="agent_start")providerLabels.push(body.label);
    if(body.event==="stage_start"){currentStage=body.stage;stageStarts.push(currentStage);}
    if(path.endsWith("/checkpoint")){Object.assign(archives,body.archives);state.checkpoints[body.stage]={result:body.result};}
    if(body.event==="execution_ready"){state.status="ready_for_execution";state.decisions=body.decisions;}
    if(path.endsWith("/fail"))state.status="failed";
    return {analysis:structuredClone(state)};
  }};
  try {
    await ctx.plugin(ToolRuntime);await ctx.plugin(AgentRegistry);
    // Real managed Node processes, synthetic research outputs, no provider calls.
    ctx.provide("sandbox", {});
    ctx.provide("sandboxPolicy", {defaultMode:"danger-full-access",resolve:()=>({mode:"danger-full-access",workspaceRoot:process.cwd()})});
    ctx.provide("workingDirectory", {ensure:async()=>process.cwd()});
    await ctx.plugin(LocalFileSystem, {cwd:process.cwd()});
    await ctx.plugin(LocalSubprocessRuntime);
    await ctx.plugin(NodePtcRuntime);
    await ctx.plugin(PtcWorkflowEngine,{provider:"synthetic",maxConcurrentAgents:4,maxTotalAgents:500,maxItemsPerCall:4096,syncTimeoutMs:5000});
    const parent={id:"parent",session:{id:"parent",events:[],surface:{nodes:[]}}};parent.ctx=createScope(ctx,parent).ctx;ctx.agents.enter(parent);ctx.agents.announce(parent);
    const session=()=>{registerAnalysisWorkflow(ctx,client,(_ctx,name,_description,_schema,execute)=>tools.set(name,execute));return ()=>tools.get("investment_analysis_workflow")({market:"us",symbols:targets,cycle_id:state.cycle_id,submit:false},{agent:parent});};
    const first=session();
    if(failure==="partial-base"){
      const result=await first();assert.equal(result.status,"ready_for_execution");
      assert.match(result.warnings.join(" "),/TEST0.*基础研究不完整/);
      assert.equal(state.decisions.some(row=>row.symbol==="TEST0"),false);
    }else if(failure){
      await assert.rejects(first());assert.equal(state.status,"failed");
      if(String(failure).startsWith("research_debate/")){
        assert.equal(providerLabels.includes("TEST0:bull-r1"),true);
        assert.equal(providerLabels.includes("TEST0:research-manager"),false);
      }
      if(String(failure).startsWith("risk_review/")){
        assert.equal(providerLabels.includes("risk-aggressive-r1"),true);
        assert.equal(providerLabels.includes("risk-manager"),false);
      }
      const paidSoFar=providerCalls;await assert.rejects(first());assert.equal(providerCalls,paidSoFar);
      const savedStages=stageStarts.slice(0,-1);
      state.status="running";
      assert.equal((await session()()).status,"ready_for_execution");
      for(const stage of savedStages)assert.equal(stageStarts.filter(value=>value===stage).length,1);
    }else{
      assert.equal((await first()).status,"ready_for_execution");assert.equal(providerCalls,166);
    }
    assert.equal(Object.keys(state.checkpoints).length,5);assert.equal(state.decisions.length,failure==="partial-base"?19:20);
    assert.equal(archives.base_research[1].analyses[0].summary.length,"合成软件故障测试".length*2500);
  }finally{await ctx.fiber.dispose();if(previous===undefined)delete process.env.ATA_AUTONOMOUS_ROUND;else process.env.ATA_AUTONOMOUS_ROUND=previous;}
});
