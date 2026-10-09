import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHistoryHandler,historySymbol} from '../lib/market-history.js';

function dashboard(fetcher=async()=>({ok:true,data:[]})) {
  const client=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
  const code=client.split('/* DASHBOARD:START */')[1].split('/* DASHBOARD:END */')[0];
  const context=vm.createContext({react:{createElement:()=>{}},jsonFetch:fetcher,injectSheet:()=>{},CSS_ID:'test',AbortSignal,Date});
  vm.runInContext(code+'\nthis.db={dbHistory,dbAccount,dbWindow,dbTrades,dbCode,dbLoadHistory};',context);
  return context.db;
}
const bar=(date,close=10)=>({date,close,open:close-.2,high:close+.5,low:close-.5,volume:1000});

test('history sorts, deduplicates and rejects invalid prices and dates',()=>{
  const data=dashboard().dbHistory({data:[bar('2026-10-09'),bar('2026-10-08',9),bar('2026-10-09',11),bar('2026-02-30'),bar('2026-10-07',null),bar('2026-10-06',Infinity)]});
  assert.equal(data.bars.length,2);
  assert.equal(data.bars[0].date,'2026-10-08');
  assert.equal(data.bars[1].close,11);
  assert.ok(data.warnings.includes('部分无效行情已跳过'));
  assert.throws(()=>dashboard().dbHistory({ok:true,error:'上游不可用',data:[]}),/上游不可用/);
});

test('close-only history does not invent candle or volume values',()=>{
  const result=dashboard().dbHistory({data:[{date:'2026-10-09',close:'12'}]});
  assert.equal(result.bars[0].open,null);
  assert.equal(result.bars[0].volume,null);
  assert.equal(result.bars[0].close,12);
});

test('month window clamps month-end and anchors to last trading day',()=>{
  const db=dashboard();
  const rows=[bar('2026-02-27'),bar('2026-02-28'),bar('2026-03-03'),bar('2026-03-31')];
  const window=db.dbWindow(rows,'month');
  assert.equal(window[0].date,'2026-02-28');
  assert.equal(window.length,3);
});

test('portfolio totals use one account and never substitute cost for missing price',()=>{
  const db=dashboard();
  const cn=db.dbAccount({cash:200,holdings:[{code:'sh600519',shares:10,costPrice:8,lastPrice:10}]},'cn');
  assert.equal(cn.equity,300);
  assert.equal(cn.pnl,20);
  assert.equal(cn.holdings[0].code,'600519');
  const missing=db.dbAccount({cash:200,holdings:[{code:'600519',shares:10,costPrice:8}]},'cn');
  assert.equal(missing.equity,null);
  assert.equal(missing.pnl,null);
  assert.equal(missing.holdings[0].price,null);
  assert.equal(db.dbAccount({error:'引擎不可用'},'us'),null);
});

test('only executed stock trades become chart markers',()=>{
  const db=dashboard(),fill={code:'600519',action:'BUY',status:'filled',price:12,shares:100,date:'2026-10-09T10:00:00+08:00'};
  const rows=db.dbTrades([fill,{...fill,status:'rejected'},{...fill,action:'HOLD'},{...fill,code:'300750'},{...fill,shares:0}], 'cn','600519');
  assert.equal(rows.length,1);
  assert.equal(rows[0].action,'BUY');
  assert.equal(db.dbCode('us','USB'),'USB');
});

test('client shares concurrent loads and preserves source warnings',async()=>{
  let count=0;
  const db=dashboard(async()=>{count++;await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,data:[bar('2026-10-09')],source:'node:sina',adjusted:false,degraded:true,warnings:['不复权']};});
  const [a,b]=await Promise.all([db.dbLoadHistory('us','USB'),db.dbLoadHistory('us','USB')]);
  assert.equal(count,1);
  assert.equal(a,b);
  assert.equal(a.source,'node:sina');
  assert.equal(a.adjusted,false);
  assert.equal(a.warnings[0],'不复权');
  await db.dbLoadHistory('us','USB');
  assert.equal(count,1);
});

test('failed client history is retriable rather than cached as an empty chart',async()=>{
  let count=0;
  const db=dashboard(async()=>++count===1?{ok:true,error:'行情失败',data:[]}:{ok:true,data:[bar('2026-10-09')]});
  await assert.rejects(db.dbLoadHistory('cn','600519'),/行情失败/);
  assert.equal((await db.dbLoadHistory('cn','600519')).bars.length,1);
  assert.equal(count,2);
});

test('proxy forces symbol market and rejects injection or unknown markets',()=>{
  assert.equal(historySymbol('us','USB'),'usUSB');
  assert.equal(historySymbol('hk','700'),'hk00700');
  assert.equal(historySymbol('etf','510300'),'510300');
  assert.equal(historySymbol('cn','SH600519'),'sh600519');
  assert.throws(()=>historySymbol('cn','600519&lookback=999999'),/代码无效/);
  assert.throws(()=>historySymbol('invalid','600519'),/market 必须/);
});

test('proxy coalesces requests, expires its cache and uses a bounded daily window',async()=>{
  let calls=0,now=0,path;
  const handler=createHistoryHandler(async(value,options)=>{calls++;path=value;assert.ok(options.signal instanceof AbortSignal);await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,data:[bar('2026-10-09')],adjusted:true,source:'akshare:em'};},(res,status,data)=>Object.assign(res,{status,data}),()=>now);
  const req={method:'GET',url:'/api/investment/history?market=us&symbol=USB&lookback=99999'},a={},b={};
  await Promise.all([handler(req,a),handler(req,b)]);
  assert.equal(calls,1);
  assert.equal(path,'/api/market/history?symbol=usUSB&lookback=280');
  assert.equal(a.data.symbol,'usUSB');
  assert.equal(a.data,b.data);
  await handler(req,{});
  assert.equal(calls,1);
  now=300001;
  await handler(req,{});
  assert.equal(calls,2);
  await handler({...req,url:req.url+'&refresh=1'},{});
  assert.equal(calls,3);
});

test('proxy rejects mutations and reports upstream failures without engine credentials',async()=>{
  let calls=0;
  const handler=createHistoryHandler(async()=>{calls++;throw new Error('secret-host-token');},(res,status,data)=>Object.assign(res,{status,data}));
  const mutation={};await handler({method:'POST',url:'/'},mutation);
  assert.equal(mutation.status,405);
  assert.equal(calls,0);
  const invalid={};await handler({method:'GET',url:'/?market=cn&symbol=oops'},invalid);
  assert.equal(invalid.status,400);
  assert.equal(calls,0);
  const failed={};await handler({method:'GET',url:'/?market=cn&symbol=600519'},failed);
  assert.equal(failed.status,502);
  assert.ok(!JSON.stringify(failed).includes('secret-host-token'));
  await handler({method:'GET',url:'/?market=cn&symbol=600519'},{});
  assert.equal(calls,2);
});
