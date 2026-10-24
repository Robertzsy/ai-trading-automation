import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import { createScope } from "@deepseek-ai/dsh-scope";
import * as investmentTools from "../lib/index.js";

async function fixture(body, {decision="确认此方案", custom, exitCode=0, duringReview, language="zh"}={}) {
  const root=mkdtempSync(join(tmpdir(),"ata-repair-")), env=process.env.AI_TRADING_AUTOMATION_ROOT;
  process.env.AI_TRADING_AUTOMATION_ROOT=root;
  writeFileSync(join(root,"app.js"),"original");
  const ctx=new Context();ctx.provide("systemPrompt",{tools(){},section(){}});
  ctx.provide("settings", {describe:()=>[{ns:"locale",value:{preference:language}}]});
  let reviews=0, writes=0, n=0;
  try {
    await ctx.plugin(ToolRuntime);await ctx.plugin(AgentRegistry);
    ctx.provide("userQuestions",{async ask(request){reviews++;assert.match(request.questions[0].detail,language==="en"?/Cause and evidence/:/原因与依据/);duringReview?.(root);return {answers:[{id:request.questions[0].id,selected:[decision],...(custom!==undefined?{custom}:{})}]};}});
    const register=(ctx,name,description,parameters,execute,options={})=>ctx.tools.register(defineTool({name,description,parameters,timeoutMs:options.timeoutMs,execute,output:{schema:{type:"object",additionalProperties:true},render:()=>[]}}));
    register(ctx,"write","write",{file_path:{type:"string",required:true},content:{type:"string",required:true}},args=>{writes++;writeFileSync(args.file_path,args.content);return {};});
    register(ctx,"pwsh","shell",{command:{type:"string",required:true}},()=>({exitCode,timedOut:false,aborted:false}));
    register(ctx,"subagent","delegate",{},()=>{throw new Error("must not delegate");});
    // Mount the real plugin scope: direct installation on the root Context
    // bypasses Cordis dependency checks and hid the desktop's missing inject.
    await ctx.plugin(investmentTools);
    const create=id=>{const agent={id,session:{id,events:[],surface:{nodes:[]}}};agent.ctx=createScope(ctx,agent).ctx;ctx.agents.enter(agent);ctx.agents.announce(agent);return agent;};
    const agent=create("owner"), other=create("other");
    const call=(name,args={},owner=agent)=>ctx.tools.execute({callId:String(++n),name,arguments:name==="pwsh"?{workdir:root,...args}:args,agent:owner,signal:new AbortController().signal});
    const plan={title:"修复读取错误",problem:"测试错误",cause:"已读取源码确认字段错误",changes:"修正 app.js 中字段",files:["app.js"],commands:["test-command"],validation_commands:["test-command"],rollback:"恢复自动备份，保留原分析检查点"};
    await body({root,call,plan,other,get reviews(){return reviews;},get writes(){return writes;}});
  } finally {await ctx.fiber.dispose();if(env===undefined)delete process.env.AI_TRADING_AUTOMATION_ROOT;else process.env.AI_TRADING_AUTOMATION_ROOT=env;rmSync(root,{recursive:true,force:true});}
}

test("real SDK blocks source writes before a reviewed plan",()=>fixture(async f=>{
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"})).isError,true);
  assert.equal(f.writes,0);assert.equal(f.reviews,0);
}));
test("English approval grants only the reviewed repair scope",()=>fixture(async f=>{
  assert.equal((await f.call("investment_repair_plan",f.plan)).value.approved,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"other.js"),content:"changed"})).isError,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"})).isError,false);
},{language:"en",decision:"Approve this plan"}));
test("decline and custom answer grant no repair permission",async()=>{
  for(const options of [{decision:"修改方案"},{custom:"确认此方案"}])await fixture(async f=>{
    assert.equal((await f.call("investment_repair_plan",f.plan)).value.approved,false);
    assert.equal((await f.call("pwsh",{command:"test-command"})).isError,true);
  },options);
});
test("approval is scoped to listed files, exact commands and this session",()=>fixture(async f=>{
  const reviewed=await f.call("investment_repair_plan",f.plan);assert.equal(reviewed.value.approved,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"},f.other)).isError,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"other.js"),content:"changed"})).isError,true);
  assert.equal((await f.call("pwsh",{command:"test-command; extra"})).isError,true);
  assert.equal((await f.call("pwsh",{command:"test-command",workdir:"."})).isError,true);
  assert.equal((await f.call("write",{file_path:"app.js",content:"changed"})).isError,true);
  assert.equal((await f.call("subagent")).isError,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"})).isError,false);
  assert.equal(readFileSync(join(reviewed.value.backup_dir,"0.before"),"utf8"),"original");
}));
test("repair success needs actual passing checks after the last edit; finish revokes grant",()=>fixture(async f=>{
  const id=(await f.call("investment_repair_plan",f.plan)).value.repair_id;
  const finish=()=>f.call("investment_repair_finish",{repair_id:id,success:true,summary:"验证通过"});
  assert.equal((await finish()).isError,true);
  await f.call("pwsh",{command:"test-command"});
  await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"});
  assert.equal((await finish()).isError,true);
  await f.call("pwsh",{command:"test-command"});
  assert.equal((await finish()).value.status,"verified");
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"again"})).isError,true);
}));
test("failed verification stops further edits and cannot be reported successful",()=>fixture(async f=>{
  const id=(await f.call("investment_repair_plan",f.plan)).value.repair_id;
  await f.call("pwsh",{command:"test-command"});
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"})).isError,true);
  assert.equal((await f.call("investment_repair_finish",{repair_id:id,success:true,summary:"claimed success"})).isError,true);
  assert.equal((await f.call("investment_repair_finish",{repair_id:id,success:false,summary:"验证失败，已停止"})).value.status,"failed");
},{exitCode:1}));
test("source changing during review invalidates the plan",()=>fixture(async f=>{
  assert.equal((await f.call("investment_repair_plan",f.plan)).isError,true);
  assert.equal((await f.call("write",{file_path:join(f.root,"app.js"),content:"changed"})).isError,true);
},{duringReview:root=>writeFileSync(join(root,"app.js"),"concurrent change")}));
test("external edits after passing checks prevent a false success claim",()=>fixture(async f=>{
  const id=(await f.call("investment_repair_plan",f.plan)).value.repair_id;
  await f.call("pwsh",{command:"test-command"});
  writeFileSync(join(f.root,"app.js"),"external change");
  assert.equal((await f.call("investment_repair_finish",{repair_id:id,success:true,summary:"success"})).isError,true);
}));
