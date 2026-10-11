import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { apply } from "../lib/index.js";

test("retry button, browser POST and engine proxy preserve explicit retry and original cycle",async()=>{
  const client=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
  const submitCode=client.slice(client.indexOf('const submitStart = async (options) => {'),client.indexOf('const handleStart = () => {'));
  const retryCode=client.slice(client.indexOf('const handleRetry = () => {'),client.indexOf('const handleStop = async () => {'));
  const home=mkdtempSync(join(tmpdir(),'ata-retry-')),oldHome=process.env.DSH_HOME,oldEngine=process.env.INVESTMENT_ENGINE_URL;
  const routes=new Map(),received=[],effects=[];
  const engine=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;received.push(JSON.parse(text));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({started:true,resumed:true,analysis:{status:'running'}}));});
  await new Promise(resolve=>engine.listen(0,'127.0.0.1',resolve));
  process.env.DSH_HOME=home;process.env.INVESTMENT_ENGINE_URL='http://127.0.0.1:'+engine.address().port;
  try{
    apply({effect(fn){effects.push(fn());},workspaceRegistry:{async create(){}},logger:{warn(){}},webServer:{requestTimeout:0,headersTimeout:0,keepAliveTimeout:0,register(route){routes.set(route.path,route.handler);return ()=>{};}}});
    const web=createServer((req,res)=>routes.get('/api/investment/analysis')(req,res));
    await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
    try{
      const api='http://127.0.0.1:'+web.address().port;
      let requested;
      const context=vm.createContext({setSubmitting(){},setNotice(){},setPending(){},writePendingAnalysis:row=>row,refreshAll(){},canRetry:true,pending:null,run:{cycle_id:'failed-original',market:'hk',symbols:['00700'],label:'original',symbols_source:'user'},symbols:['09988'],market:'cn',label:'new-label',source:'screening',goalId:'',jsonFetch:async(path,options)=>{requested=options.body;return (await fetch(api+path,options)).json();}});
      vm.runInContext(submitCode+retryCode+'this.retry=handleRetry; this.start=submitStart;',context);
      context.retry();
      for(let i=0;i<50&&!received.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
      assert.equal(JSON.parse(requested).retry,true);assert.equal(received[0].retry,true);
      assert.equal(received[0].cycle_id,'failed-original');assert.deepEqual(received[0].symbols,['00700']);
      await context.start({cycleId:'new',market:'hk',label:'new',symbols:['00700'],symbolsSource:'user'});
      assert.equal(received[1].retry,false);
    }finally{await new Promise(resolve=>web.close(resolve));}
  }finally{
    for(const dispose of effects.reverse())dispose?.();await new Promise(resolve=>engine.close(resolve));
    if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;
    if(oldEngine===undefined)delete process.env.INVESTMENT_ENGINE_URL;else process.env.INVESTMENT_ENGINE_URL=oldEngine;
    rmSync(home,{recursive:true,force:true});
  }
});
