import {test} from "node:test";
import assert from "node:assert/strict";
import {installResearchThinking} from "../../dsh-investment-tools/lib/research-thinking.js";
import {registerAnalysisWorkflow} from "../../dsh-investment-tools/lib/analysis-workflow.js";

function harness() {
  let created;
  const children = new Map();
  const ctx = {on(event, listener){assert.equal(event,"agent/created");created=listener;},
    get(name){assert.equal(name,"agents");return {isOwnedBy(id,parent){return children.get(id)?.parent===parent;}};}};
  const router = installResearchThinking(ctx,{bindingTimeoutMs:50});
  const make = (id,parent) => {
    let handler, disposed=false;
    const agent={id,ctx:{on(event,listener){assert.equal(event,"agent/request");handler=listener;return ()=>{disposed=true;};}}};
    children.set(id,{parent});created({agent});
    return {request:next=>handler?.({signal:new AbortController().signal},next)??next(),disposed:()=>disposed};
  };
  return {router,make};
}

test("first request waits for trusted identity; only news and technical disable thinking",async()=>{
  const {router,make}=harness(),parent={},signal=new AbortController().signal;
  const roles=["technical_analyst","news_analyst","fundamentals_analyst","sentiment_analyst"];
  const scope=router.begin(parent,"base_research",roles.map(role=>"00700:"+role),signal);
  const config={provider:"deepseek",model:"pinned-model",reasoningEffort:"high",maxTokens:256000,temperature:.2,extra:{kept:true}};
  for(const [i,role] of roles.entries()){
    const child=make(String(i),parent);let nextCalls=0;
    const pending=child.request(async()=>{nextCalls++;return config;});
    await Promise.resolve();assert.equal(nextCalls,0);
    scope.bind(String(i),"00700:"+role);
    const resolved=await pending;
    assert.deepEqual(resolved,role==="technical_analyst"||role==="news_analyst"?{...config,reasoningEffort:"off"}:config);
    assert.deepEqual(await child.request(async()=>config),resolved);
  }
  scope.close();
});

test("other workflows, parents, risk and managers retain the same config object",async()=>{
  const {router,make}=harness(),parent={},config={reasoningEffort:"high"};
  const scope=router.begin(parent,"risk_review",["risk-manager"],new AbortController().signal);
  const child=make("risk",parent);scope.bind("risk","risk-manager");
  assert.equal(await child.request(async()=>config),config);
  const unrelated=make("other",{});assert.equal(await unrelated.request(async()=>config),config);
  scope.close();assert.equal(child.disposed(),true);
});

test("unknown identity, timeout, cancellation and close never send a model request",async()=>{
  for(const scenario of ["wrong","timeout","abort","close"]){
    const {router,make}=harness(),parent={},controller=new AbortController();
    const scope=router.begin(parent,"base_research",["00700:news_analyst"],controller.signal);
    const child=make("child",parent);let calls=0;
    const pending=child.request(async()=>{calls++;return {};});
    if(scenario==="wrong")scope.bind("child","00700:fundamentals_analyst");
    if(scenario==="abort")controller.abort(new Error("cancelled"));
    if(scenario==="close")scope.close();
    await assert.rejects(pending);assert.equal(calls,0);scope.close();
  }
});

test("thinking trial rejects combining other experiments before registration",()=>{
  for(const options of [{researchBriefs:true},{researchRoles:true},{uniformOutput:true},{deduplicateResearch:true},{researchPolicy:"observe"}]){
    assert.throws(()=>registerAnalysisWorkflow({}, {}, ()=>{}, {selectiveFastThinking:true,...options}),/试验/);
  }
});

test("resume rejects changing the thinking policy in either direction before any child starts",async()=>{
  const prior=process.env.ATA_AUTONOMOUS_ROUND;process.env.ATA_AUTONOMOUS_ROUND="1";
  try {
    for(const selectiveFastThinking of [false,true]){
      const checkpoint={result:[],...(selectiveFastThinking?{}:{research_thinking:"fast-news-technical-v1"})};
      let starts=0;const executors=new Map();
      const client={async get(url){
        if(url==="/api/status")return {control:{}};
        if(url.startsWith("/api/portfolio/"))return {holdings:[],cash:100000};
        if(url==="/api/mandate")return {mandate:{}};
        if(url==="/api/config")return {config:{}};
        return {runs:[]};
      },async post(){return {analysis:{status:"running",checkpoints:{base_research:checkpoint}}};}};
      const ctx={on(){return ()=>{};},get(name){
        if(name==="agents")return {isOwnedBy(){return false;}};
        if(name==="analysisMeter")return {begin(){},async flush(){return {};}};
      },workflowEngine:{start(){starts++;throw new Error("must not start");}}};
      registerAnalysisWorkflow(ctx,client,(_ctx,name,_desc,_schema,execute)=>executors.set(name,execute),{selectiveFastThinking});
      await assert.rejects(()=>executors.get("investment_analysis_workflow")({market:"hk",symbols:["00700"],cycle_id:"resume-thinking"},{agent:{id:"parent"}}),/切换研究思考档位策略/);
      assert.equal(starts,0);
    }
  } finally {if(prior===undefined)delete process.env.ATA_AUTONOMOUS_ROUND;else process.env.ATA_AUTONOMOUS_ROUND=prior;}
});
