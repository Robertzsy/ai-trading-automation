import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {apply} from '../lib/index.js';

test('stock names require candidate confirmation, and codes keep their selected market',()=>{
  const client=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
  const code=client.slice(client.indexOf('function parseAnalysisSymbols('),client.indexOf('function readPendingAnalysis('));
  const context=vm.createContext({Date,Math,crypto:{randomUUID:()=> 'test-id'}});
  vm.runInContext(code+'this.parse=normalizeAnalysisSymbols;',context);
  assert.equal(JSON.stringify(context.parse('700, HK00700, 00700.HK','hk')),JSON.stringify({symbols:['00700'],invalid:[]}));
  assert.equal(JSON.stringify(context.parse('腾讯, 09988','hk')),JSON.stringify({symbols:['09988'],invalid:['腾讯']}));
  assert.equal(JSON.stringify(context.parse('HK00700, AAPL','us')),JSON.stringify({symbols:['AAPL'],invalid:['HK00700']}));
  assert.equal(JSON.stringify(context.parse('aapl AAPL brk.b','us')),JSON.stringify({symbols:['AAPL','BRK.B'],invalid:[]}));
});

test('stock lookup proxy stays read only; refresh is a separate explicit POST',async()=>{
  const oldHome=process.env.DSH_HOME,oldEngine=process.env.INVESTMENT_ENGINE_URL;
  const home=mkdtempSync(join(tmpdir(),'ata-stock-search-')),routes=new Map(),effects=[],received=[];
  const upstream=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({method:req.method,url:req.url,body});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,local_only:req.method==='GET',results:[{symbol:'00700',name:'腾讯控股',market:'hk'}]}));});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  process.env.DSH_HOME=home;process.env.INVESTMENT_ENGINE_URL='http://127.0.0.1:'+upstream.address().port;
  try{
    apply({effect(fn){effects.push(fn());},workspaceRegistry:{async create(){}},logger:{warn(){},info(){}},webServer:{requestTimeout:0,headersTimeout:0,keepAliveTimeout:0,register(route){routes.set(route.path,route.handler);return ()=>{};}}});
    const web=createServer((req,res)=>routes.get('/api/investment/analysis')(req,res));
    await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
    try{
      const base='http://127.0.0.1:'+web.address().port;
      const result=await (await fetch(base+'/api/investment/analysis?action=securities&market=hk&q='+encodeURIComponent('腾讯 & name'))).json();
      assert.equal(result.local_only,true);assert.equal(result.results[0].symbol,'00700');
      const query=new URL(received[0].url,'http://localhost');
      assert.equal(query.pathname,'/api/securities/search');assert.equal(query.searchParams.get('q'),'腾讯 & name');assert.equal(query.searchParams.get('market'),'hk');
      assert.equal(received.length,1);assert.equal(received[0].method,'GET');
      await fetch(base+'/api/investment/analysis?action=refresh-securities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:'hk'})});
      assert.equal(received[1].method,'POST');assert.equal(received[1].url,'/api/securities/refresh');assert.deepEqual(JSON.parse(received[1].body),{market:'hk'});
    }finally{await new Promise(resolve=>web.close(resolve));}
  }finally{
    effects.reverse().forEach(dispose=>dispose?.());await new Promise(resolve=>upstream.close(resolve));
    if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;
    if(oldEngine===undefined)delete process.env.INVESTMENT_ENGINE_URL;else process.env.INVESTMENT_ENGINE_URL=oldEngine;
    rmSync(home,{recursive:true,force:true});
  }
});
