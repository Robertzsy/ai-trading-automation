// Generated into lib/client.js. Only React and the product shell's helpers are
// used at runtime; no CDN, chart framework or additional shipped dependency.
const dbH = (...args) => react.createElement(...args);
const dbMarkets = ['cn', 'hk', 'us', 'etf'];
const dbCurrencies = {cn:'¥', hk:'HK$', us:'US$', etf:'¥'};
const dbPeriods = {month:1, quarter:3, year:12};
const dbPeriodNames = {month:'近1个月', quarter:'近3个月', year:'近1年'};
const dbNumber = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const dbMoney = (value, currency='', digits=2) => dbNumber(value) === null ? '—' : currency + Number(value).toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const dbSigned = value => dbNumber(value) === null ? '—' : (value>0?'+':'') + Number(value).toFixed(2) + '%';
const dbTrend = value => value>0?'up':value<0?'down':'flat';
const dbCode = (market, value) => {
  const code=String(value ?? '').trim();
  if(market==='hk') return code.replace(/^hk/i,'').padStart(5,'0');
  if(market==='us') return code.replace(/^us(?=[A-Z])/,'').toUpperCase();
  return code.replace(/^(sh|sz|bj)/i,'');
};

function dbAccount(account, market) {
  if(!account || account.error || account.ok===false) return null;
  const holdings=(Array.isArray(account.holdings)?account.holdings:[]).filter(item=>item && typeof item==='object').map(item=>{
    const shares=dbNumber(item.shares ?? item.quantity);
    const cost=dbNumber(item.costPrice ?? item.cost);
    const price=dbNumber(item.lastPrice);
    return {...item, code:dbCode(market,item.code), name:String(item.name || item.code || '未命名标的'), shares, cost, price,
      value:shares!==null && price!==null && price>0 ? shares*price : null,
      pnl:shares!==null && cost!==null && price!==null && price>0 ? shares*(price-cost) : null};
  }).filter(item=>item.code && item.shares>0);
  const cash=dbNumber(account.cash);
  const value=holdings.every(item=>item.value!==null)?holdings.reduce((sum,item)=>sum+item.value,0):null;
  const pnl=holdings.every(item=>item.pnl!==null)?holdings.reduce((sum,item)=>sum+item.pnl,0):null;
  return {holdings,cash,value,pnl,equity:cash!==null && value!==null ? cash+value : null,
    trades:Array.isArray(account.tradeHistory)?account.tradeHistory:[]};
}

function dbHistory(payload) {
  if(payload?.error || payload?.ok===false) throw new Error(String(payload.error || '历史行情暂不可用'));
  if(!payload || !Array.isArray(payload.data)) throw new Error('行情返回格式异常');
  const dates=new Map();
  let invalid=0;
  for(const item of payload.data) {
    const date=String(item?.date ?? '').slice(0,10),close=dbNumber(item?.close);
    const time=Date.parse(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || !(close>0)) {invalid++;continue;}
    const open=dbNumber(item.open),high=dbNumber(item.high),low=dbNumber(item.low),volume=dbNumber(item.volume);
    const candle=open>0 && low>0 && high>=Math.max(open,close) && low<=Math.min(open,close);
    dates.set(date,{date,close,open:candle?open:null,high:candle?high:null,low:candle?low:null,volume:volume>=0?volume:null});
  }
  const warnings=(Array.isArray(payload.warnings)?payload.warnings:[]).filter(Boolean).map(String);
  if(invalid) warnings.push('部分无效行情已跳过');
  return {...payload,bars:[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)),warnings};
}

function dbWindow(bars, period) {
  if(!bars.length) return [];
  const end=new Date(bars.at(-1).date+'T00:00:00Z');
  const day=end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth()-(dbPeriods[period] ?? 3));
  const lastDay=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
  end.setUTCDate(Math.min(day,lastDay));
  const start=end.toISOString().slice(0,10);
  return bars.filter(bar=>bar.date>=start);
}

function dbTrades(trades, market, code) {
  return trades.filter(item=>dbCode(market,item.code ?? item.symbol)===code &&
    (!item.status || item.status==='filled') && ['BUY','SELL'].includes(String(item.action ?? item.side).toUpperCase()) &&
    dbNumber(item.price)>0 && dbNumber(item.shares ?? item.quantity)>0 && /^\d{4}-\d{2}-\d{2}/.test(String(item.date ?? '')))
    .map(item=>({...item,action:String(item.action ?? item.side).toUpperCase(),date:String(item.date),shares:dbNumber(item.shares ?? item.quantity),price:dbNumber(item.price)}))
    .sort((a,b)=>a.date.localeCompare(b.date));
}

const dbHistoryCache=new Map();
const dbHistoryRefresh=new Set();
function dbLoadHistory(market,code) {
  const key=market+':'+code,previous=dbHistoryCache.get(key);
  const refresh=dbHistoryRefresh.delete(key);
  if(previous?.pending) return previous.pending;
  if(!refresh && previous?.data && Date.now()-previous.time<300000) return Promise.resolve(previous.data);
  const entry={time:0,data:null,pending:null};
  entry.pending=jsonFetch('/api/investment/history?market='+encodeURIComponent(market)+'&symbol='+encodeURIComponent(code)+(refresh?'&refresh=1':''),{signal:AbortSignal.timeout(90000)})
    .then(dbHistory).then(data=>{entry.data=data;entry.time=Date.now();return data;})
    .catch(error=>{dbHistoryCache.delete(key);throw error;}).finally(()=>{entry.pending=null;});
  if(dbHistoryCache.size>=128) {
    const oldest=[...dbHistoryCache.entries()].find(([,item])=>!item.pending);
    if(oldest) dbHistoryCache.delete(oldest[0]);
  }
  dbHistoryCache.set(key,entry);
  return entry.pending;
}

function useDashboardHistories(market,codes,selected) {
  const [state,setState]=react.useState({market:'',items:{}});
  const [retry,setRetry]=react.useState(0);
  const signature=codes.join(',');
  react.useEffect(()=>{
    let cancelled=false;
    const queue=[selected,...codes.filter(code=>code!==selected)].filter(Boolean);
    setState(previous=>({market,items:previous.market===market?previous.items:{}}));
    const worker=async()=>{
      while(queue.length && !cancelled) {
        const code=queue.shift();
        try {
          const data=await dbLoadHistory(market,code);
          if(!cancelled) setState(previous=>({market,items:{...(previous.market===market?previous.items:{}),[code]:{data,error:''}}}));
        } catch(error) {
          if(!cancelled) setState(previous=>({market,items:{...(previous.market===market?previous.items:{}),[code]:{data:null,error:String(error?.message ?? error)}}}));
        }
      }
    };
    worker();worker();
    return ()=>{cancelled=true;};
  },[market,signature,selected,retry]);
  return {items:state.market===market?state.items:{},retry:code=>{
    dbHistoryCache.delete(market+':'+code);
    dbHistoryRefresh.add(market+':'+code);
    setState(previous=>({market,items:{...(previous.market===market?previous.items:{}),[code]:null}}));
    setRetry(value=>value+1);
  }};
}

function useDashboardWidth() {
  const ref=react.useRef(null),[width,setWidth]=react.useState(0);
  react.useLayoutEffect(()=>{
    const element=ref.current;
    if(!element) return;
    const measure=()=>setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  return [ref,width];
}
const dbPath=(bars,x,y,key='close')=>bars.map((row,index)=>(index?'L':'M')+x(index).toFixed(2)+','+y(row[key]).toFixed(2)).join(' ');

function DashboardSparkline({history,name}) {
  const [ref,width]=useDashboardWidth();
  const bars=history?.data ? dbWindow(history.data.bars,'month') : [];
  if(bars.length<2) return dbH('div',{className:'ia-db-spark-empty',ref},history?.error?'走势暂不可用':history?.data?'历史数据不足':'正在加载走势…');
  const lo=Math.min(...bars.map(row=>row.close)),hi=Math.max(...bars.map(row=>row.close));
  const x=index=>3+index/(bars.length-1)*Math.max(0,width-6),y=value=>34-(value-lo)/(hi-lo || 1)*28;
  return dbH('div',{ref,className:'ia-db-spark'},width>0?dbH('svg',{viewBox:'0 0 '+width+' 38',role:'img','aria-label':name+'近一个月日线走势'},
    dbH('path',{d:dbPath(bars,x,y),fill:'none',stroke:'var(--ia-viz-1)',strokeWidth:1.7})):null);
}

function DashboardPriceChart({history,holding,market,period,type,options,trades}) {
  const [ref,width]=useDashboardWidth();
  const bars=react.useMemo(()=>dbWindow(history.bars,period),[history,period]);
  const [cursor,setCursor]=react.useState(null),[pinned,setPinned]=react.useState(false);
  react.useEffect(()=>{setCursor(null);setPinned(false);},[history,period]);
  if(bars.length<2) return dbH('div',{ref,className:'ia-db-chart-empty'},'历史数据不足，至少需要两个交易日');
  const index=Math.min(cursor ?? bars.length-1,bars.length-1),current=bars[index];
  const candle=type==='candle' && bars.every(row=>row.open!==null);
  const height=width<400?260:310,left=64,right=Math.max(left+1,width-16),top=22,bottom=height-(options.volume?82:38);
  const offset=history.bars.length-bars.length;
  const ma=bars.map((row,i)=>{
    const start=offset+i-19;
    return {...row,ma:start>=0 ? history.bars.slice(start,offset+i+1).reduce((sum,item)=>sum+item.close,0)/20 : null};
  });
  const values=bars.flatMap(row=>candle?[row.low,row.high]:[row.close]);
  if(options.cost && holding.cost>0) values.push(holding.cost);
  if(options.ma) values.push(...ma.filter(row=>row.ma!==null).map(row=>row.ma));
  const minimum=Math.min(...values),maximum=Math.max(...values),pad=(maximum-minimum)*.12 || maximum*.03;
  const lo=minimum-pad,hi=maximum+pad;
  const x=i=>left+i/(bars.length-1)*(right-left),y=value=>bottom-(value-lo)/(hi-lo)*(bottom-top);
  const svg=[];
  for(let tick=0;tick<4;tick++) {
    const value=lo+(hi-lo)*tick/3,yy=y(value);
    svg.push(dbH('line',{key:'g'+tick,x1:left,x2:right,y1:yy,y2:yy,className:'ia-db-grid'}),dbH('text',{key:'y'+tick,x:left-8,y:yy+4,textAnchor:'end'},dbMoney(value,'',maximum>=100?0:2)));
  }
  svg.push(dbH('text',{key:'unit',x:4,y:12},dbCurrencies[market]));
  const ticks=width<400?3:4;
  for(let tick=0;tick<ticks;tick++) {
    const i=Math.round(tick/(ticks-1)*(bars.length-1));
    svg.push(dbH('text',{key:'x'+tick,x:x(i),y:height-10,textAnchor:tick===0?'start':tick===ticks-1?'end':'middle'},bars[i].date.slice(period==='year'?2:5).replaceAll('-','/')));
  }
  if(candle) {
    const bodyWidth=Math.max(1,Math.min(9,(right-left)/bars.length*.64));
    bars.forEach((row,i)=>{
      const up=row.close>=row.open,color=(market==='us')===up?'var(--ia-ok-text)':'var(--ia-danger-text)';
      svg.push(dbH('g',{key:'c'+i},dbH('line',{x1:x(i),x2:x(i),y1:y(row.high),y2:y(row.low),stroke:color}),
        dbH('rect',{x:x(i)-bodyWidth/2,y:Math.min(y(row.open),y(row.close)),width:bodyWidth,height:Math.max(1,Math.abs(y(row.close)-y(row.open))),fill:color})));
    });
  } else {
    const path=dbPath(bars,x,y);
    svg.push(dbH('path',{key:'area',d:path+' L'+right+','+bottom+' L'+left+','+bottom+' Z',className:'ia-db-area'}),
      dbH('path',{key:'line',d:path,className:'ia-db-price-line',fill:'none',strokeWidth:2.2,strokeLinejoin:'round'}));
  }
  if(options.ma) {
    const start=ma.findIndex(row=>row.ma!==null);
    if(start>=0) svg.push(dbH('path',{key:'ma',d:dbPath(ma.slice(start),i=>x(start+i),y,'ma'),className:'ia-db-ma',fill:'none',strokeWidth:1.5}),
      dbH('text',{key:'ma-label',x:left+3,y:top+14},'MA20'));
  }
  if(options.cost && holding.cost>0) svg.push(dbH('line',{key:'cost',x1:left,x2:right,y1:y(holding.cost),y2:y(holding.cost),className:'ia-db-cost',strokeDasharray:'4 4'}),
    dbH('text',{key:'cost-label',x:right-2,y:Math.max(top+14,y(holding.cost)-6),textAnchor:'end'},'当前成本 '+dbMoney(holding.cost)));
  if(options.volume) {
    const max=Math.max(...bars.map(row=>row.volume ?? 0)),bw=Math.max(1,(right-left)/bars.length*.6);
    bars.forEach((row,i)=>{if(row.volume!==null) svg.push(dbH('rect',{key:'v'+i,x:x(i)-bw/2,y:height-32-(max?row.volume/max*26:0),width:bw,height:max?row.volume/max*26:0,className:'ia-db-volume'}));});
    svg.push(dbH('text',{key:'vunit',x:4,y:height-42},'成交量'));
  }
  if(options.trades) {
    const grouped=new Map();
    for(const trade of trades) {
      const date=trade.date.slice(0,10);
      if(!grouped.has(date)) grouped.set(date,[]);
      grouped.get(date).push(trade);
    }
    bars.forEach((bar,i)=>{
      const fills=grouped.get(bar.date);if(!fills) return;
      const actions=[...new Set(fills.map(fill=>fill.action))];
      const label=actions.length>1?'买/卖':actions[0]==='BUY'?'买':'卖';
      svg.push(dbH('g',{key:'trade'+i,className:'ia-db-trade-mark'},
        dbH('title',null,fills.map(fill=>(fill.action==='BUY'?'买入':'卖出')+' '+dbMoney(fill.shares,'',0)+' 股 · 成交价 '+dbMoney(fill.price,dbCurrencies[market])+' · '+fill.date).join('\n')),
        dbH('circle',{cx:x(i),cy:y(bar.close),r:5}),dbH('text',{x:x(i),y:Math.min(bottom-4,y(bar.close)+19),textAnchor:'middle'},label)));
    });
  }
  if(cursor!==null) svg.push(dbH('line',{key:'guide',x1:x(index),x2:x(index),y1:top,y2:bottom,className:'ia-db-guide'}),dbH('circle',{key:'dot',cx:x(index),cy:y(current.close),r:4,fill:'var(--ia-viz-1)'}));
  const move=event=>{
    const box=event.currentTarget.getBoundingClientRect(),local=(event.clientX-box.left)*width/box.width;
    if(local<left || local>right) return;
    setCursor(Math.max(0,Math.min(bars.length-1,Math.round((local-left)/(right-left)*(bars.length-1)))));
  };
  return dbH('div',{ref,className:'ia-db-chart'},
    dbH('div',{className:'ia-db-readout'},dbH('span',null,current.date),dbH('b',null,'收盘 '+dbMoney(current.close,dbCurrencies[market])),
      current.open!==null?dbH('span',null,'开 '+dbMoney(current.open)+' · 高 '+dbMoney(current.high)+' · 低 '+dbMoney(current.low)):null,
      current.volume!==null?dbH('span',null,'量 '+dbMoney(current.volume,'',0)):null),
    width>0?dbH('svg',{className:'ia-db-main-chart',viewBox:'0 0 '+width+' '+height,style:{height},role:'img',
      'aria-label':holding.name+' '+dbPeriodNames[period]+'日线价格，单位'+dbCurrencies[market],onPointerMove:move,
      onPointerLeave:()=>{if(!pinned)setCursor(null);},onClick:event=>{move(event);setPinned(true);}},svg):null,
    dbH('label',{className:'ia-db-date-slider'},dbH('span',null,'查看交易日'),dbH('input',{type:'range',min:0,max:bars.length-1,value:index,
      'aria-label':'查看交易日','aria-valuetext':current.date+'，收盘'+dbMoney(current.close,dbCurrencies[market]),
      onChange:event=>{setCursor(Number(event.target.value));setPinned(true);}})));
}

function ProductDashboard({onOpenAnalysis}={}) {
  const summaryState=useInvestmentSummary(10000),summary=summaryState.data ?? {},status=summary.status ?? {};
  const [market,setMarket]=react.useState('cn'),[selection,setSelection]=react.useState({}),[period,setPeriod]=react.useState('quarter'),[type,setType]=react.useState('line');
  const [options,setOptions]=react.useState({cost:true,volume:true,trades:true,ma:false});
  const account=dbAccount(summary.portfolios?.[market],market),holdings=account?.holdings ?? [];
  const holding=holdings.find(item=>item.code===selection[market]) ?? holdings[0] ?? null;
  const histories=useDashboardHistories(market,holdings.map(item=>item.code),holding?.code);
  const selected=holding?histories.items[holding.code]:null,history=selected?.data;
  const bars=history?dbWindow(history.bars,period):[];
  const trades=holding?dbTrades(account.trades,market,holding.code):[];
  const currency=dbCurrencies[market],engineError=summaryState.error || status.error || '';
  const riskLabel=engineError?'未知':status.control?.kill_switch?'紧急停止':status.control?.paused?'已暂停':'正常';
  const reports=Array.isArray(summary.reports?.reports)?summary.reports.reports:[];
  const choose=code=>setSelection(previous=>({...previous,[market]:code}));
  const current=history?.bars.at(-1),rangeChange=bars.length>1?(bars.at(-1).close/bars[0].close-1)*100:null;
  const age=current?Math.floor((Date.now()-Date.parse(current.date+'T00:00:00Z'))/86400000):0;
  const canCandle=bars.length>1 && bars.every(row=>row.open!==null),canVolume=bars.some(row=>row.volume!==null);
  const canCost=holding?.cost>0;
  const metrics=[
    ['账户权益',dbMoney(account?.equity,currency,0),'现金 + 最近持仓估值'],
    ['持仓浮动盈亏',account?.pnl===null || !account?'—':(account.pnl>0?'+':'')+dbMoney(account.pnl,currency,0),'按账户记录价格计算'],
    ['资金使用率',account?.equity>0 && account.value!==null?(account.value/account.equity*100).toFixed(1)+'%':'—',account?.cash!==null && account?.equity>0?'现金占比 '+(account.cash/account.equity*100).toFixed(1)+'%':'等待账户数据'],
    ['持有标的',account?holdings.length+' 只':'—',marketName[market]+' · 独立模拟账户']
  ];
  const panelHead=(title,detail)=>dbH('div',{className:'ia-db-panel-head'},dbH('h3',null,title),dbH('span',null,detail));
  const errorState=(message,retry)=>dbH('div',{className:'ia-db-chart-empty',role:'status'},icon('alertTriangle',22),dbH('p',null,message),retry?dbH('button',{type:'button',className:'ia-btn ia-elev',onClick:retry},'重新加载'):null);
  const allocation=account?.equity>0 && account.value!==null && account.cash>=0 ? [...holdings.map((item,i)=>({name:item.name,code:item.code,value:item.value,opacity:.45+.15*(i%4)})),{name:'现金',value:account.cash,opacity:1}] : [];
  const colors=item=>item.code?'var(--ia-viz-1)':'var(--ia-border-strong)';
  return dbH('div',{className:'ia-page ia-db-page','data-red-up':market!=='us'},
    dbH(PageHeader,{title:'投资总览',subtitle:'从组合到个股，看清每一次变化',status:summaryState.loading?'正在连接投资引擎':'模拟交易 · 风控'+riskLabel,statusKind:engineError?'error':status.control?.kill_switch || status.control?.paused?'warn':'ok'}),
    dbH('div',{className:'ia-page-content'},
      engineError?dbH('div',{className:'ia-notice','data-kind':'err',role:'alert'},'引擎暂不可达：'+engineError):null,
      dbH('div',{className:'ia-db-market-row'},dbH('div',{className:'ia-db-market-picker','aria-label':'查看市场'},dbMarkets.map(key=>dbH('button',{key,type:'button','aria-pressed':market===key,onClick:()=>setMarket(key)},marketName[key]))),
        dbH('span',{className:'ia-db-muted'},'各市场按币种独立展示')),
      dbH('div',{className:'ia-db-metrics'},metrics.map(([label,value,detail])=>dbH('div',{className:'ia-db-metric',key:label},dbH('div',{className:'ia-db-muted'},label),dbH('div',{className:'ia-db-metric-value'},value),dbH('div',{className:'ia-db-muted'},detail)))),
      dbH('div',{className:'ia-db-workbench'},
        dbH('section',{className:'ia-db-panel ia-db-watch'},panelHead('我的持仓',account?holdings.length+' 只':''),
          holdings.length?dbH('div',{className:'ia-db-stock-list'},holdings.map(item=>{
            const stockHistory=histories.items[item.code],rows=stockHistory?.data?.bars ?? [],latest=rows.at(-1),previous=rows.at(-2);
            const change=previous?(latest.close/previous.close-1)*100:null;
            return dbH('button',{type:'button',className:'ia-db-stock',key:item.code,'aria-pressed':holding?.code===item.code,'aria-label':'查看'+item.name+'的走势',onClick:()=>choose(item.code)},
              dbH('div',{className:'ia-db-stock-row'},dbH('b',null,item.name),dbH('span',{className:'ia-num'},dbMoney(latest?.close ?? item.price))),
              dbH('div',{className:'ia-db-stock-row'},dbH('span',{className:'ia-db-muted'},item.code),dbH('span',{className:'ia-trend','data-red-up':market!=='us','data-trend':dbTrend(change)},dbSigned(change))),
              dbH(DashboardSparkline,{history:stockHistory,name:item.name}),dbH('span',{className:'ia-db-stock-date'},latest?latest.date+' 收盘':'账户记录价 · 更新时间未知'));
          })):dbH('div',{className:'ia-empty'},summaryState.loading?'正在读取持仓…':account?'暂无持仓':'账户数据暂不可用'),
          holdings.length?dbH('div',{className:'ia-db-watch-foot'},'近1个月日线 · 点击查看详情'):null),
        dbH('section',{className:'ia-db-panel ia-db-focus'},holding?dbH(react.Fragment,null,
          dbH('div',{className:'ia-db-focus-head'},dbH('div',{'aria-live':'polite'},dbH('h2',null,holding.name),dbH('div',{className:'ia-db-muted'},holding.code+' · '+marketName[market]+' · 日线历史')),
            dbH('div',{className:'ia-db-quote'},dbH('span',{className:'ia-db-muted'},'最近收盘'),dbH('strong',null,dbMoney(current?.close,currency)),
              dbH('span',{className:'ia-trend','data-red-up':market!=='us','data-trend':dbTrend(rangeChange)},dbPeriodNames[period]+' '+dbSigned(rangeChange)))),
          dbH('div',{className:'ia-db-toolbar'},dbH('div',{className:'ia-db-choices','aria-label':'时间范围'},Object.entries(dbPeriodNames).map(([key,label])=>dbH('button',{key,type:'button','aria-pressed':period===key,onClick:()=>setPeriod(key)},label))),
            dbH('div',{className:'ia-db-choices','aria-label':'图表类型'},[['line','走势线'],['candle','K 线']].map(([key,label])=>dbH('button',{key,type:'button','aria-pressed':(canCandle?type:'line')===key,disabled:key==='candle'&&!canCandle,title:key==='candle'&&!canCandle?'当前来源没有完整的开高低收数据':undefined,onClick:()=>setType(key)},label)))),
          selected?.error?errorState(selected.error,()=>histories.retry(holding.code)):!history?dbH('div',{className:'ia-db-chart-empty','aria-busy':true,role:'status'},dbH('div',{className:'ia-db-skeleton'}),'正在加载历史行情…'):history.bars.length<2?errorState('暂时没有足够的历史行情',()=>histories.retry(holding.code)):
            dbH(DashboardPriceChart,{key:market+':'+holding.code,history,holding,market,period,type,options:{...options,volume:options.volume&&canVolume,cost:options.cost&&canCost},trades}),
          dbH('div',{className:'ia-db-options'},[['cost','成本线',canCost],['volume','成交量',canVolume],['trades','买卖日期',!!trades.length],['ma','MA20',!!history && history.bars.length>=20]].map(([key,label,enabled])=>dbH('label',{key},dbH('input',{type:'checkbox',checked:options[key],disabled:!enabled,onChange:event=>setOptions(previous=>({...previous,[key]:event.target.checked}))}),label))),
          history?dbH('div',{className:'ia-db-provenance'},dbH('span',null,'来源 '+(history.source || '未提供')+' · '+(history.adjusted===true?'前复权':history.adjusted===false?'不复权':'复权状态未知')+' · 最后交易日 '+(current?.date || '—')),
            age>7?dbH('span',{className:'ia-db-data-warning'},'历史行情距今 '+age+' 天，请留意数据日期'):null,
            history.degraded || history.adjusted!==true || history.warnings.length?dbH('span',{className:'ia-db-data-warning',role:'status'},'行情提示：'+(history.warnings.join('；') || (history.degraded?'已使用备用行情来源':'复权状态未经确认'))):null):null,
          dbH('div',{className:'ia-db-position'},[['持有数量',dbMoney(holding.shares,'',0)+' 股'],['当前持仓成本',dbMoney(holding.cost,currency)],['账户记录估值',dbMoney(holding.price,currency)],['持仓浮动盈亏',(holding.pnl>0?'+':'')+dbMoney(holding.pnl,currency)]].map(([label,value])=>dbH('div',{key:label},dbH('span',{className:'ia-db-muted'},label),dbH('strong',null,value)))),
          dbH('div',{className:'ia-db-muted ia-db-position-date'},'账户估值时间：'+(holding.lastPriceAt?String(holding.lastPriceAt).replace('T',' '):'未记录')+' · 图表显示历史收盘价')):errorState(account?'选中一只持仓即可查看走势':'等待账户数据'))),
      dbH('div',{className:'ia-db-secondary'},
        dbH('section',{className:'ia-db-panel'},panelHead('组合分布','本市场 · 含现金'),allocation.length?dbH(react.Fragment,null,
          dbH('div',{className:'ia-db-allocation',role:'img','aria-label':marketName[market]+'资产占比'},allocation.map(item=>dbH('span',{key:item.code || 'cash',style:{flex:item.value,background:colors(item),opacity:item.opacity},title:item.name+' '+(item.value/account.equity*100).toFixed(1)+'%'}))),
          dbH('div',{className:'ia-db-allocation-list'},allocation.map(item=>dbH(item.code?'button':'div',{key:item.code || 'cash',className:'ia-db-allocation-item',...(item.code?{type:'button',onClick:()=>choose(item.code),'aria-label':'查看'+item.name+'的走势'}:{})},
            dbH('i',{style:{background:colors(item),opacity:item.opacity},'aria-hidden':true}),dbH('span',null,item.name),dbH('span',{className:'ia-db-muted'},(item.value/account.equity*100).toFixed(1)+'%'))))):dbH('div',{className:'ia-empty'},'暂无可展示的资产分布')),
        dbH('section',{className:'ia-db-panel'},panelHead('所选股票的交易记录','模拟成交'),trades.length?dbH('div',{className:'ia-db-ledger'},trades.slice(-5).reverse().map((trade,i)=>dbH('div',{className:'ia-db-trade',key:trade.id || trade.date+':'+i},
          dbH('span',{className:'ia-db-trade-label'},trade.action==='BUY'?'买':'卖'),dbH('div',{className:'ia-db-trade-copy'},dbH('b',null,holding.name+' · '+(trade.action==='BUY'?'买入':'卖出')),dbH('span',{className:'ia-db-muted'},trade.date.replace('T',' ').slice(0,16)+' · 成交价 '+dbMoney(trade.price,currency))),dbH('span',{className:'ia-db-muted'},dbMoney(trade.shares,'',0)+' 股'))),
          dbH('div',{className:'ia-db-muted ia-db-trade-note'},'图表标记对应成交日期，成交价以记录为准')):dbH('div',{className:'ia-empty'},holding?'该股票暂无模拟成交记录':'选中持仓后查看成交记录'))),
      dbH('section',{className:'ia-db-panel ia-db-activity'},panelHead('运行与研究',status.operation_mode==='automatic'?'自动运行':'手动运行'),
        dbH('div',{className:'ia-db-activity-grid'},dbH('div',null,dbH('b',null,'风控'+riskLabel),dbH('p',{className:'ia-db-muted'},'策略：'+(status.mandate?.display_name ?? status.mandate?.profile ?? '—'))),
          dbH('div',null,dbH('b',null,marketName[market]+' 下一轮'),dbH('p',{className:'ia-db-muted'},String(status.markets?.[market]?.next_cycle ?? '尚未安排').replace('T',' ').slice(0,16))),
          dbH('div',null,dbH('b',null,'最近轮次报告'),reports.length?dbH('ul',null,reports.slice(0,3).map(report=>dbH('li',{key:report.file},report.file))):dbH('p',{className:'ia-db-muted'},'暂无轮次报告'))),
        summary.analysis?dbH('p',{className:'ia-db-muted'},'最近分析 · '+(marketName[summary.analysis.market] ?? summary.analysis.market)+' · '+analysisStageLabel(summary.analysis.current_stage)+' · Agent '+(summary.analysis.completed_agents ?? 0)+'/'+(summary.analysis.expected_agents ?? 0)):null,
        onOpenAnalysis?dbH('button',{type:'button',className:'ia-btn ia-elev',onClick:onOpenAnalysis},'打开分析流程与报告'):null),
      typeof summary.macro?.content==='string' && summary.macro.content?dbH('section',{className:'ia-card ia-news',style:{marginTop:14}},panelHead('市场早报','每交易日 08:00 采集'),dbH('div',{className:'ia-news-body'},renderMarkdown(summary.macro.content))):null));
}
