window.__ModuleLoader__.load({
	id: "@ai-trading-automation/dsh-product-shell",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
/* PRODUCT_MOTION:START */
// Embedded into the script-style client by generate-shell-motion.mjs.
// These helpers have no browser side effects, so progress and cancellation can
// also be checked without loading DSH or calling a model.
const RESEARCH_STAGE_KEYS = Object.freeze([
  'base_research', 'research_debate', 'portfolio_draft', 'risk_review', 'final_decision'
]);

function measuredStageFraction(row) {
  if (row?.status === 'completed') return 1;
  const total = Number(row?.agents_total || row?.progress_total);
  const completed = Number(row?.agents_total ? row.agents_done ?? 0 : row?.progress_done ?? 0);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(completed)) {
    return Math.min(1, Math.max(0, completed / total));
  }
  return row?.status === 'pending' || row?.status === 'idle' ? 0 : null;
}

function researchStageRows(run) {
  const stages = run?.stages ?? {};
  return [...(run?.symbols_source === "screening" || run?.stages?.screening ? ["screening"] : []), "data_preparation", ...RESEARCH_STAGE_KEYS].map(stage => {
    const saved = stages[stage];
    const row = saved && typeof saved === 'object' ? { ...saved, stage, recorded: true } : { stage, status: 'pending', recorded: false };
    const tasks = Object.values(run?.agents ?? {}).filter(task => task && task.stage === stage);
    if (row.status !== 'completed' && tasks.length) {
      // Saved counters include previous attempts; the role map contains
      // the current task for each role and is authoritative when present.
      row.agents_total = tasks.length;
      row.agents_done = tasks.filter(task => task.status === 'completed').length;
      row.agents_failed = tasks.filter(task => task.status === 'failed').length;
    }
    if (!row.recorded && run?.current_stage === stage) row.status = run.status === 'failed' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : 'running';
    return row;
  });
}

function createMotionController() {
  let revision = 0;
  let current = null;
  function cancel() {
    revision += 1;
    current?.cancel();
    current = null;
  }
  function play(element, frames, milliseconds, finished = () => {}) {
    let visible;
    if (current && element?.ownerDocument?.defaultView) {
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      visible = { opacity: style.opacity, transform: style.transform };
    }
    cancel();
    const token = revision;
    if (!element || !element.animate || milliseconds <= 0) {
      finished();
      return;
    }
    const keyframes = frames.map(frame => ({ ...frame }));
    if (visible) Object.assign(keyframes[0], visible);
    const animation = element.animate(keyframes, {
      duration: milliseconds, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'
    });
    current = animation;
    animation.finished.then(() => {
      if (revision !== token) return;
      current = null;
      finished();
      animation.cancel();
    }).catch(() => {});
  }
  return { play, cancel };
}

const ProductPageActivity = react.createContext(true);
const useProductPageActive = () => react.useContext(ProductPageActivity);
const productMotion = (() => {
  const listeners = new Set();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let preference = 'system', revision = 0;
  try { preference = localStorage.getItem('ata.ui.motion') || 'system'; } catch {}
  if (!['system','standard','off'].includes(preference)) preference = 'system';
  let snapshot;
  const update = () => {
    const reduced = preference === 'off' || Boolean(media?.matches);
    snapshot = Object.freeze({ preference, reduced, revision: ++revision });
    if (typeof document !== 'undefined' && document.body) document.body.dataset.ataMotion = reduced ? 'off' : 'standard';
    listeners.forEach(listener => listener());
  };
  update();
  media?.addEventListener('change', update);
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) {
      if (!['system','standard','off'].includes(value) || value === preference) return;
      preference = value;
      try { localStorage.setItem('ata.ui.motion', value); } catch {}
      update();
    }
  };
})();
const useProductMotion = () => react.useSyncExternalStore(productMotion.subscribe, productMotion.getSnapshot, productMotion.getSnapshot);

function useMotionPresence(open, distance = 6, axis = 'Y') {
  const ref = react.useRef(null);
  const controller = react.useRef(null);
  if (!controller.current) controller.current = createMotionController();
  const [present, setPresent] = react.useState(open);
  const motion = useProductMotion();
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.inert = !open;
    if (open) {
      element.hidden = false;
      setPresent(true);
      controller.current.play(element, [{ opacity: 0, transform: `translate${axis}(${distance}px)` }, { opacity: 1, transform: 'none' }], motion.reduced ? 0 : 200);
    } else if (present) {
      controller.current.play(element, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate${axis}(${distance / 2}px)` }], motion.reduced ? 0 : 140, () => { element.hidden = true; setPresent(false); });
    }
    return () => controller.current.cancel();
  }, [open, motion.revision]);
  return { ref, present, hidden: !open && !present };
}

function MotionPage({ active, page, children }) {
  const presence = useMotionPresence(active);
  return react.createElement(ProductPageActivity.Provider, { value: active },
    react.createElement('div', {
      ref: presence.ref, className: 'ia-shell-page', hidden: presence.hidden,
      'data-page': page, 'data-active': active, 'aria-hidden': !active,
      style: active ? undefined : { position: 'absolute', inset: 0, pointerEvents: 'none' }
    }, children));
}

function MotionPresence({ open, className, children }) {
  const presence = useMotionPresence(open, 12, 'X');
  return react.createElement('div', { ref: presence.ref, className, hidden: presence.hidden, 'aria-hidden': !open }, open || presence.present ? children : null);
}

function useAnimatedProductDialog(ref, open, onClose) {
  const active = useProductPageActive(), motion = useProductMotion();
  const close = react.useRef(onClose), opener = react.useRef(null), controller = react.useRef(null);
  close.current = onClose;
  if (!controller.current) controller.current = createMotionController();
  react.useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!active) {
      controller.current.cancel();
      if (dialog.open) dialog.close();
      if (open) close.current?.();
      return;
    }
    if (open) {
      if (!dialog.open) { opener.current = document.activeElement; dialog.showModal(); }
      dialog.dataset.closing = 'false';
      controller.current.play(dialog, [{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], motion.reduced ? 0 : 220);
    } else if (dialog.open) {
      dialog.dataset.closing = 'true';
      controller.current.play(dialog, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(12px)' }], motion.reduced ? 0 : 160, () => {
        dialog.close();
        if (opener.current?.isConnected && opener.current.getClientRects().length) opener.current.focus();
        else document.querySelector('.ia-navbtn[data-active=true]')?.focus();
      });
    }
    return () => controller.current.cancel();
  }, [open, active, motion.revision]);
  react.useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);
}

function ProductModal({ open, busy, onClose, label, children }) {
  const ref = react.useRef(null);
  useAnimatedProductDialog(ref, open, onClose);
  return react.createElement('dialog', {
    ref, className: 'ia-product-modal', 'aria-label': label,
    onCancel: event => { event.preventDefault(); if (!busy) onClose(); },
    onClick: event => { if (event.target === ref.current && !busy) onClose(); }
  }, react.createElement('div', { className: 'ia-product-modal-content' }, children));
}

function useNavigationIndicator(ref, page, locale) {
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const place = () => {
      const active = element.querySelector('[data-active=true]'), indicator = element.querySelector('.ia-nav-indicator');
      if (!active || !indicator) return;
      indicator.style.transform = `translateY(${active.offsetTop}px)`;
      indicator.style.height = `${active.offsetHeight}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page, locale]);
}

function useRightbarTransition(ref, fullscreen, open, visibilityKey) {
  const previous = react.useRef(null), controller = react.useRef(null), motion = useProductMotion();
  if (!controller.current) controller.current = createMotionController();
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.inert = !open;
    const rect = element.getBoundingClientRect(), old = previous.current;
    if (open && old?.open && old.fullscreen !== fullscreen && rect.width && rect.height && old.rect.width && old.rect.height) {
      controller.current.play(element, [
        { transformOrigin:'top left', transform:`translate(${old.rect.left-rect.left}px,${old.rect.top-rect.top}px) scale(${old.rect.width/rect.width},${old.rect.height/rect.height})` },
        { transformOrigin:'top left', transform:'none' }
      ], motion.reduced ? 0 : 240, () => window.dispatchEvent(new Event('resize')));
    }
    previous.current = { rect, fullscreen, open };
    return () => controller.current.cancel();
  }, [fullscreen, open, visibilityKey, motion.revision]);
}

function ContentTransition({ identity, children }) {
  const ref = react.useRef(null), motion = useProductMotion();
  react.useLayoutEffect(() => {
    if (motion.reduced || !ref.current?.animate) return;
    const animation = ref.current.animate([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'none'}], {duration:160,easing:'ease-out'});
    return () => animation.cancel();
  }, [identity, motion.revision]);
  return react.createElement('div', { ref, className:'ia-content-transition' }, children);
}

const motionCss = "/* Owned product polish. Shared variables also cover newly retained pages. */\n.ia-shell{--ia-fs-body:15px;--ia-fs-body-sm:14px;--ia-fs-caption:13px;--ia-fs-micro:12px;--ia-motion-page:200ms;--ia-motion-panel:240ms;--ia-ease-out:cubic-bezier(.22,1,.36,1)}\n.ia-body{position:relative;overflow:hidden;min-height:0;min-width:0}\n.ia-shell-page{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;height:100%;width:100%}\n.ia-shell-page[hidden],.ia-ctx-drawer[hidden]{display:none!important}\n.ia-shell-page[data-active=false]{pointer-events:none}\n.ia-rail-nav{position:relative;isolation:isolate}\n.ia-nav-indicator{position:absolute;inset:0 0 auto;z-index:0;pointer-events:none;border-radius:13px;background:linear-gradient(145deg,#3d65ec,#2b4dca);box-shadow:0 4px 14px #14398a22;transition:transform var(--ia-motion-page) var(--ia-ease-out),height var(--ia-motion-page) var(--ia-ease-out)}\n.ia-shell .ia-navbtn{z-index:1;transition:color 140ms,background 140ms,transform 120ms;min-height:62px;font-size:12px;letter-spacing:0}\n.ia-shell .ia-navbtn[data-active=true]{background:transparent;box-shadow:none;transform:none}\n.ia-shell .ia-navbtn[data-active=true] .ia-icon{filter:none}\n.ia-shell .ia-navbtn:active{transform:translateY(1px)}\n.ia-shell .ia-rail-brand{box-shadow:0 5px 16px #254acb38,inset 0 1px 0 #ffffff25}\n.ia-shell .ia-page-title{font-size:25px;line-height:1.3;letter-spacing:-.5px}\n.ia-shell .ia-page-sub,.ia-shell .ia-an-note,.ia-shell .ia-form-hint,.ia-shell .ia-form-label,.ia-shell .ia-assist-strip{font-size:13px;line-height:1.6}\n.ia-shell .ia-input,.ia-shell .ia-an-input,.ia-shell .ia-an-select{font-size:14px;min-height:39px;border-radius:10px;transition:border-color 140ms,box-shadow 140ms,background-color 140ms}\n.ia-shell .ia-btn,.ia-shell .ia-an-btn{font-size:14px;min-height:36px;border-radius:10px;transition:background-color 140ms,border-color 140ms,box-shadow 140ms,transform 110ms}\n.ia-shell .ia-btn:active:not(:disabled),.ia-shell .ia-an-btn:active:not(:disabled){transform:translateY(1px)}\n.ia-shell .ia-btn:disabled,.ia-shell .ia-an-btn:disabled{cursor:default;opacity:.55;box-shadow:none;transform:none}\n.ia-shell .ia-card,.ia-shell .ia-an-panel,.ia-shell .ia-db-panel,.ia-shell .ia-db-metric{border-radius:16px;box-shadow:0 2px 7px #1e3a5f05}\n.ia-shell .ia-form-row{gap:16px;min-width:0}\n.ia-shell .ia-form-row>div{min-width:0}\n.ia-shell .ia-form-row label{font-size:14px}\n.ia-shell .ia-settings-nav button{font-size:13px;line-height:1.5;overflow-wrap:anywhere}\n.ia-shell .ia-details{overflow:hidden;opacity:1;transition:width var(--ia-motion-panel) var(--ia-ease-out),opacity 160ms ease}\n.ia-shell .ia-details[aria-hidden=true]{opacity:0;pointer-events:none}\n.ia-shell .ia-details>div{min-width:340px}\n.ia-shell .ia-an-drawer{border:1px solid var(--ia-border-subtle);border-radius:18px 0 0 18px;box-shadow:-12px 0 40px #18355c1f;padding:24px;font-size:14px}\n.ia-an-drawer::backdrop,.ia-product-modal::backdrop{background:#0e183946;transition:opacity 160ms ease}\n.ia-an-drawer[data-closing=true]::backdrop,.ia-product-modal[data-closing=true]::backdrop{opacity:0}\n.ia-product-modal{width:min(460px,calc(100vw - 32px));padding:0;border:1px solid var(--ia-border-subtle);border-radius:16px;background:var(--ia-surface);color:var(--ia-text-1);box-shadow:0 16px 56px #18355c24}\n.ia-product-modal-content{padding:24px;display:flex;flex-direction:column;gap:16px}\n.ia-product-modal h3{margin:0;font-size:18px}\n.ia-product-modal .ia-modal-actions{display:flex;justify-content:flex-end;gap:10px}\n.ia-content-transition{min-width:0;min-height:0}\n.ia-notice{animation:ia-feedback-in 160ms ease-out;line-height:1.6}\n@keyframes ia-feedback-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}\n.ia-research-workspace{container-type:inline-size}\n.ia-research-stage-summary{margin:0;border:1px solid var(--ia-border-subtle);border-radius:16px;background:var(--ia-surface);padding:18px 20px}\n.ia-research-stage-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}\n.ia-research-stage-head h3{font-size:16px;margin:0}\n.ia-research-stage-head>span{font-size:13px;color:var(--ia-text-3);font-variant-numeric:tabular-nums}\n.ia-stage-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:18px}\n.ia-stage-card{box-sizing:border-box;min-width:0;min-height:82px;display:flex;align-items:center;gap:10px;padding:14px 12px;border-radius:12px;background:var(--ia-surface-2);transition:background-color 180ms ease}\n.ia-stage-card[data-status=completed]{background:color-mix(in srgb,var(--ia-ok) 7%,var(--ia-surface))}\n.ia-stage-card[data-status=running]{background:color-mix(in srgb,var(--ia-accent) 8%,var(--ia-surface))}\n.ia-stage-card[data-status=failed],.ia-stage-card[data-status=cancelled]{background:color-mix(in srgb,var(--ia-danger) 6%,var(--ia-surface))}\n.ia-stage-card-label{font-size:15px;font-weight:500;line-height:1.45;min-width:0;overflow-wrap:anywhere}\n.ia-stage-card .ia-an-ring{width:50px;height:50px;flex:0 0 50px}\n.ia-shell .ia-an-ring-mark{font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}\n.ia-an-ring-fill{transition:stroke-dashoffset 200ms ease,stroke 160ms ease}\n.ia-an-ring[data-indeterminate=true] .ia-an-ring-fill{opacity:0}\n.ia-shell .ia-an-stage-name{font-size:15px}\n.ia-shell .ia-an-stage-meta{font-size:13px;line-height:1.55}\n.ia-stage-total{display:flex;justify-content:space-between;gap:12px;color:var(--ia-text-3);font-size:13px;margin-bottom:10px;font-variant-numeric:tabular-nums}\n.ia-stage-total-track{height:5px;background:var(--ia-border-subtle);border-radius:99px;overflow:hidden}\n.ia-stage-total-fill{height:100%;background:var(--ia-accent);transform-origin:left center;transition:transform 200ms ease;border-radius:99px}\n.ia-shell .ia-db-price-line{animation-duration:400ms;animation-delay:0s}\n.ia-shell .ia-db-area{animation-duration:350ms;animation-delay:0s}\n.ia-shell .ia-db-main-chart text{font-size:12px}\n.ia-shell .ia-db-provenance,.ia-shell .ia-db-stock-date{font-size:12px}\n.ia-shell .ia-seg-thumb,.ia-shell .ia-tabs-ink{transition-duration:160ms}\n.ia-motion-save-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}\n.ia-loading-state{min-height:100px;display:flex;align-items:center;justify-content:center;color:var(--ia-text-3);font-size:14px}\n@container(max-width:820px){.ia-stage-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}\n@container(max-width:540px){.ia-stage-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-stage-card{padding:12px 10px}}\n@container(max-width:330px){.ia-stage-cards{grid-template-columns:1fr}}\n.ia-shell-page .ia-an-panel,.ia-shell-page .ia-db-panel,.ia-shell-page .ia-db-metric{animation:none}\nbody[data-ata-motion=off] *,body[data-ata-motion=off] *::before,body[data-ata-motion=off] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}\n@media(prefers-reduced-motion:reduce){.ia-shell *,.ia-shell *::before,.ia-shell *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n";
/* PRODUCT_MOTION:END */
/* I18N:START */
const PRODUCT_COPY = {"zh":{"ui.content.is.too.long.display.truncated":"\n\n（内容过长，已截断显示）","ui.mainland.china":"A股","ui.hong.kong":"港股","ui.united.states":"美股","ui.investment.overview":"投资概览","ui.simulated.accounts.paper.trading.public.third.party.market.data.for.research":"模拟账户 · 纸面交易 · 行情来自公开第三方接口，仅供研究","ui.engine.unavailable":"引擎暂不可达：","ui.system.and.risk.status":"系统与风控状态","ui.mode":"模式：","ui.strategy":"策略：","ui.emergency.stop":"紧急停止","ui.paused":"已暂停","ui.risk.controls.active":"风控正常","ui.investment.engine":"投资引擎：","ui.running":"运行中","ui.stopped":"未运行","ui.next.round":" 下一轮次","ui.account.assets":"账户资产","ui.market":"市场","ui.total.assets":"总资产","ui.cash":"现金","ui.holdings":"持仓","ui.trades":"成交数","ui.engine.data.unavailable":"引擎数据暂不可用","ui.recent.round.reports":"最近轮次报告","ui.no.round.reports.yet":"暂无轮次报告","ui.latest.macro.briefing":"最新宏观日报摘要","ui.1.month":"近1个月","ui.3.months":"近3个月","ui.1.year":"近1年","ui.unnamed.security":"未命名标的","ui.price.history.unavailable":"历史行情暂不可用","ui.invalid.price.history.response":"行情返回格式异常","ui.some.invalid.prices.were.skipped":"部分无效行情已跳过","ui.chart.unavailable":"走势暂不可用","ui.insufficient.history":"历史数据不足","ui.loading.chart":"正在加载走势…","ui.daily.prices.over.the.past.month":"近一个月日线走势","ui.at.least.two.trading.days.are.required":"历史数据不足，至少需要两个交易日","ui.current.cost":"当前成本 ","ui.volume":"成交量","ui.buy.sell":"买/卖","ui.b":"买","ui.s":"卖","ui.buy":"买入","ui.sell":"卖出","ui.shares.fill.price":" 股 · 成交价 ","ui.close":"收盘 ","ui.open":"开 ","ui.high":" · 高 ","ui.low":" · 低 ","ui.volume.2":"量 ","ui.daily.price.currency":"日线价格，单位","ui.view.trading.day":"查看交易日","ui.close.2":"，收盘","ui.unknown":"未知","ui.normal":"正常","ui.account.equity":"账户权益","ui.cash.latest.position.valuations":"现金 + 最近持仓估值","ui.unrealized.p.l":"持仓浮动盈亏","ui.calculated.from.recorded.account.prices":"按账户记录价格计算","ui.capital.utilization":"资金使用率","ui.cash.share":"现金占比 ","ui.waiting.for.account.data":"等待账户数据","ui.securities.held":"持有标的","ui.securities":" 只","ui.separate.simulated.account":" · 独立模拟账户","ui.reload":"重新加载","ui.portfolio.overview":"投资总览","ui.track.changes.across.your.portfolio.and.securities":"从组合到个股，看清每一次变化","ui.connecting.to.the.investment.engine":"正在连接投资引擎","ui.paper.trading.risk":"模拟交易 · 风控","ui.cash.2":"现金 ","ui.market.value":" · 市值 ","ui.next.round.2":"下一轮","ui.automatic":"自动运行","ui.manual":"手动运行","ui.view.market":"查看市场","ui.new.research":"＋ 新建研究","ui.my.holdings":"我的持仓","ui.securities.market.value":" 只 · 市值 ","ui.view":"查看","ui.price.chart":"的走势","ui.shares.cost":" 股 · 成本 ","ui.p.l":" · 盈亏 ","ui.loading.holdings":"正在读取持仓…","ui.no.holdings.yet":"暂无持仓","ui.account.data.unavailable":"账户数据暂不可用","ui.daily.prices.1.month.select.to.view.chart":"近1个月日线 · 点击切换右侧走势","ui.price.chart.2":"价格走势","ui.time.range":"时间范围","ui.chart.type":"图表类型","ui.line":"走势线","ui.candlestick":"K 线","ui.this.source.does.not.provide.complete.ohlc.data":"当前来源没有完整的开高低收数据","ui.cost.line":"成本线","ui.trade.dates":"买卖日期","ui.loading.price.history":"正在加载历史行情…","ui.not.enough.price.history.yet":"暂时没有足够的历史行情","ui.quantity.held":"持有数量","ui.shares":" 股","ui.current.position.cost":"当前持仓成本","ui.recorded.account.valuation":"账户记录估值","ui.source":"来源 ","ui.not.provided":"未提供","ui.last.trading.day":" · 最后交易日 ","ui.price.age":" · 行情距今 ","ui.days":" 天","ui.price.notes":" · 行情提示：","ui.a.fallback.price.source.was.used":"已使用备用行情来源","ui.adjustment.status.is.unconfirmed":"复权状态未经确认","ui.select.a.holding.on.the.left.to.view.its.chart":"选择左侧持仓查看走势","ui.select.a.holding.to.view.its.chart":"选中一只持仓即可查看走势","ui.round.timeline":"轮次时间线","ui.latest":"最近 ","ui.rounds":" 轮","ui.security.research":"股票研究","ui.no.previous.rounds":"暂无历史轮次","ui.portfolio.allocation":"组合分布","ui.this.market.including.cash":"本市场 · 含现金","ui.asset.allocation":"资产占比","ui.no.allocation.data.available":"暂无可展示的资产分布","ui.trade.history":"交易记录","ui.latest.5.simulated.fills":"近 5 笔 · 模拟成交","ui.shares.2":" 股 @ ","ui.no.simulated.trades.for.this.security":"该股票暂无模拟成交记录","ui.select.a.holding.to.view.its.trades":"选中持仓后查看成交记录","ui.operations.and.research":"运行与研究","ui.risk":"风控","ui.next.round.3":" 下一轮","ui.not.scheduled":"尚未安排","ui.latest.analysis":"最近分析 · ","ui.open.analysis.workflow.and.reports":"打开分析流程与报告","ui.market.briefing":"市场早报","ui.collected.at.08.00.each.trading.day.asia.shanghai":"每交易日 08:00 采集","ui.01.data.preparation":"01 · 数据准备","ui.market.status":"市场状态","ui.screen.candidates":"筛选候选","ui.holdings.mandate":"持仓 / 授权","ui.02.security.research":"02 · 标的研究","ui.technical.analysis":"技术分析","ui.fundamentals":"基本面","ui.news":"新闻","ui.sentiment":"情绪","ui.four.base.research.roles":"四类基础研究","ui.03.research.review":"03 · 研究裁决","ui.bull.researcher":"多方研究员","ui.bear.researcher":"空方研究员","ui.research.manager":"研究经理","ui.research.debate.and.security.review":"研究辩论与个股裁决","ui.04.portfolio.construction":"04 · 组合构建","ui.security.trader":"标的交易员","ui.portfolio.manager.draft":"组合经理草案","ui.portfolio.draft":"组合草案","ui.05.risk.review":"05 · 风险裁决","ui.aggressive.perspective":"激进视角","ui.conservative.perspective":"保守视角","ui.neutral.perspective":"中性视角","ui.risk.manager":"风险经理","ui.risk.debate":"风险辩论","ui.06.decisions.and.execution":"06 · 决策执行","ui.final.portfolio.decision":"最终组合决策","ui.hard.risk.checks":"硬风险检查","ui.paper.execution.report":"模拟执行 / 报告","ui.final.decision":"最终决策","ui.preparing.data":"准备数据","ui.restoring.checkpoints":"恢复检查点","ui.bull.bear.debate.and.research.review":"多空辩论与研究裁决","ui.risk.debate.and.review":"风险辩论与裁决","ui.hard.risk.controls.and.paper.execution":"硬风控与模拟执行","ui.awaiting.approval":"等待批准","ui.completed":"已完成","ui.failed":"失败","ui.stopped.2":"已停止","ui.not.run.yet":"尚未运行","ui.waiting":"等待中","ui.isolated.roles.and.per.security.research":"角色隔离与逐标的研究","ui.evidence.scope.and.citation.checks":"证据域与引用校验","ui.failure.handling.and.safe.hold":"失败降级与安全 HOLD","ui.stage.checkpoints.and.recovery":"阶段检查点与恢复","ui.investment.context":"投资上下文","ui.collapse.context":"收起上下文","ui.environment":"运行环境","ui.trading.mode":"交易模式","ui.paper.trading":"模拟交易","ui.strategy.2":"策略","ui.autonomous.operation":"自主运行","ui.enabled":"已开启","ui.manual.2":"手动","ui.risk.status":"风险状态","ui.analysis.workflow":"分析流程","ui.current":"当前：","ui.current.no.rounds.yet":"当前：尚无轮次","ui.research.agents":"多角色 Agent ","ui.evidence":"，证据 ","ui.items":" 条。","ui.live.stages.and.checkpoints.appear.when.a.manual.or.automatic.round.starts":"完整多角色研究会在手动触发或自动轮次后显示实时阶段与检查点。","ui.view.full.analysis.workflow":"查看完整分析流程","ui.recent.activity":"最近动态","ui.latest.report":"最近报告","ui.none.yet":"暂无","ui.disconnected":"未连接","ui.no.rounds.yet":"尚无轮次","ui.strategy.3":"策略 ","ui.risk.2":"风控 ","ui.current.round":"当前轮次 ","ui.evidence.2":"证据 ","ui.context":"上下文","ui.queued":"排队中","ui.not.started":"未开始","ui.s.2":" 秒","ui.min":" 分 ","ui.h":" 时 ","ui.min.2":" 分","ui.tasks":"子任务 ","ui.failed.2":" · 失败 ","ui.in.progress":"进行中","ui.estimated":"%（预计）","ui.stages.completed":" 阶段完成","ui.in.progress.2":" · 进行中","ui.search.security.name.or.ticker":"搜索股票名称或代码","ui.example.tencent.00700.apple":"例如：腾讯、00700、Apple","ui.matching.securities":"股票候选","ui.similar.name.please.verify":" · 近似名称，请核对","ui.searching.the.local.directory":"正在匹配本地目录…","ui.security.directory.unavailable":"股票目录不可用：","ui.no.local.matches.enter.an.exact.ticker.or.update.the.directory":"未找到本地候选，可输入准确代码或手动更新目录。","ui.select.a.match.to.add.it.similar.names.are.never.substituted.automatically":"点选候选加入清单；近似名称不会自动替换。","ui.local.directory":"本地 ","ui.securities.2":" 个标的","ui.limited.directory.coverage":" · 目录覆盖有限","ui.local.security.directory":"本地股票目录","ui.updating.directory":"目录更新中…","ui.update.directory.online":"更新目录（联网）","ui.stage.evidence":"阶段证据","ui.complete.saved.stage.materials.verify.unknown.dates.sources.and.valuation.bases.again":"已保存的完整阶段材料；未知日期、来源与估值口径请结合报告核对。","ui.select.stage":"选择阶段","ui.no.saved.stage.evidence.yet":"尚无已保存的阶段证据","ui.failed.to.read.evidence":"读取证据失败：","ui.loading.evidence":"正在读取证据…","ui.expand.original.materials":"展开原始材料","ui.round":"轮次 ","ui.failed.to.read.round":"读取轮次失败：","ui.warnings":"警告 ","ui.items.2":" 条：","ui.round.status":"轮次状态","ui.current.stage":"当前阶段","ui.tasks.complete.expected":"子任务 完成/预期","ui.evidence.count":"证据条数","ui.label":" · 标签 ","ui.securities.3":" · 标的 ","ui.items.3":" 个","ui.no.record.returned.by.the.engine":"：引擎尚未返回记录","ui.no.analysis.round.started":"尚未启动分析轮次","ui.historical.starts":"历史启动 ","ui.including.retries.current.progress.deduplicates.roles.original.timestamps.and.failure":" 次（含重试），当前进度按角色去重；原始轮次时间和失败记录保留。","ui.this.attempt":"本次 ","ui.loading.stages":"正在读取阶段…","ui.no.stage.records.saved.for.this.round":"该轮次尚未写入阶段记录","ui.round.report":"轮次报告：","ui.run.logs":"运行日志 · ","ui.entries":" 条","ui.showing.latest":"（显示最近 ","ui.entries.2":" 条）","ui.collapse.logs":"收起日志","ui.expand.logs":"展开日志","ui.no.logs.yet":"暂无日志","ui.export.failed":"导出失败：","ui.round.reports":"轮次报告","ui.rounds.2":" 个轮次","ui.filter.reports.by.market":"按市场筛选轮次报告","ui.all.markets":"全部市场","ui.refreshing":"刷新中…","ui.refresh":"刷新","ui.report.index.unavailable":"报告索引不可用：","ui.duration":" · 耗时 ","ui.evidence.3":" · 证据 ","ui.decisions":" · 决策 ","ui.loading.report.index":"正在读取报告索引…","ui.export.md":"导出 .md","ui.loading.report":"正在读取报告正文…","ui.failed.to.read.report":"读取报告失败：","ui.select.a.round.above.to.read.its.report":"选择上方轮次查看报告正文","ui.valid.tickers":"股票代码有效","ui.please.verify":"请核对：","ui.select.security.names.from.the.search.results":"；股票名称请从搜索候选选择","ui.recognized":"已识别 ","ui.no.securities.entered":"尚未填写标的","ui.maximum":"不超过 ","ui.limit.exceeded":" · 超出上限","ui.emergency.stop.is.off":"风控未紧急停止","ui.emergency.stop.is.active":"紧急停止已开启","ui.engine.is.paused.research.may.still.start":"引擎已暂停（分析仍可启动）","ui.no.round.running":"无运行中的轮次","ui.is.running":" 正在运行","ui.none":"无","ui.engine.reachable":"引擎可达","ui.connected.to.the.investment.engine":"已连接投资引擎","ui.unavailable":"不可达：","ui.submitting":"正在提交…","ui.verify.tickers.select.security.names.from.the.search.results":"请核对股票代码；名称请从搜索候选选择","ui.enter.a.security.list.first":"请先填写标的清单","ui.security.count.exceeds":"标的数量超过 ","ui.emergency.stop.is.active.analysis.cannot.start":"风控紧急停止已开启，禁止启动分析","ui.an.analysis.round.is.already.running":"已有分析轮次正在运行","ui.investment.engine.unavailable.analysis.cannot.start":"投资引擎不可达：无法启动分析","ui.round.resumed.from.checkpoints.with.the.same.cycle.id":"已从检查点恢复该轮次（沿用同一 cycle_id）。","ui.this.round.was.interrupted.select.retry.to.resume.explicitly":"该轮次已中断，请点击重试以明确续跑。","ui.this.round.is.still.leased.retry.was.deferred.try.again.later":"该轮次的租约仍被占用，重试已延后；稍后再试。","ui.this.cycle.id.already.exists.no.duplicate.round.was.started":"该 cycle_id 已存在，引擎未重复启动。","ui.analysis.started.fetching.live.progress":"分析轮次已启动，正在拉取实时进度。","ui.start.failed":"启动失败：","ui.screening.results.are.older.than":"选股结果已超过 ","ui.minutes.refreshed.screening.found.no.securities.enter.tickers.manually.or.try.later":" 分钟，重新选股未选出标的；请手动填写或稍后重试。","ui.automatic.screening.refresh.failed":"自动重新选股失败：","ui.another.quick.action.is.in.progress":"另一个一键操作正在进行…","ui.investment.engine.unavailable.action.cannot.run":"投资引擎不可达：无法执行","ui.screening.returned.no.selections.discovered":"选股完成但没有选出标的：发现 ","ui.securities.candidates":" 只、候选 ","ui.screening.complete.discovered":"选股完成：发现 ","ui.securities.candidates.2":" 只 · 候选 ","ui.securities.selected":" 只 · 选出 ","ui.securities.source":" 只（数据源 ","ui.the.security.list.is.populated":"）。已填入标的清单。","ui.screening.failed":"选股失败：","ui.verify.the.security.list.remove.invalid.names.and.stay.within.the.limit":"请先核对股票清单，不能包含无效名称或超过数量上限。","ui.workflow.not.started.screening.returned.no.selections.enter.securities.manually":"全流程未启动：选股没有产出标的，请先手动填写标的清单。","ui.workflow.start.failed":"全流程启动失败：","ui.user.stopped.the.analysis.round.from.the.product.interface":"用户在产品壳手动停止分析轮次","ui.stop.requested.for.round":"已请求停止轮次 ","ui.analysis.only.accounts.are.unaffected":"（仅影响分析，不影响账户）。","ui.stop.failed":"停止失败：","ui.the.latest.screening.is.older.than":"最近一次选股已超过 ","ui.minutes.screening.will.refresh.before.analysis.starts":" 分钟，开始分析前会自动重新选股。","ui.from.screening":"来自选股：","ui.candidates":" 个候选 · ","ui.within":"未超过 ","ui.minutes.reuse.directly":" 分钟，直接复用","ui.expired.screening.will.refresh.before.analysis.starts":"已过期，开始分析前会自动重新选股","ui.from.this.screening.candidates.are.in.the.list.below.ready.to.analyze":"来自本次选股：候选已填入下方清单，可直接分析。","ui.no.screening.results.yet.screen.securities.or.switch.to.manual.entry":"尚无选股结果，请点击一键筛选股票，或切回手动输入。","ui.manual.entry.separate.with.commas.spaces.or.newlines.duplicates.are.removed.maximum":"手动输入：逗号、空格或换行分隔，自动去重，上限 ","ui.securities.4":" 个。","ui.start.analysis":"开始分析","ui.not.started.2":"未启动","ui.run.screening.then.the.fixed.analysis.workflow.research.only.no.orders":"一键运行全流程：先选股，再对选出的标的跑固定分析流程（只分析，绝不下单）","ui.starting.workflow":"全流程启动中…","ui.run.full.workflow":"一键全流程","ui.scan.the.market.for.liquidity.and.factor.candidates.then.populate.the.security.list":"一键筛选股票：扫描全市场并按流动性与因子选出候选，结果填入标的清单","ui.screening.may.take.tens.of.seconds":"选股中…（数十秒）","ui.screen.securities":"一键筛选股票","ui.run.the.fixed.workflow.for.the.listed.securities.research.only.no.orders":"一键分析指定股票：对下方清单里的标的跑固定分析流程（只分析，绝不下单）","ui.submitting.2":"提交中…","ui.analyze.listed.securities":"一键分析指定股票","ui.round.label.a.za.z0.9.only":"轮次标签（仅 [A-Za-z0-9_.-]）","ui.security.source":"标的来源","ui.manual.entry":"手动输入","ui.from.screening.2":"来自选股","ui.security.list.comma.space.newline.separated.deduplicated":"标的清单（逗号 / 空格 / 换行分隔，去重）","ui.exceeds.maximum":"（超出上限 ","ui.securities.5":" 个）","ui.linked.goal.optional.goal.id.from.a.previous.round":"绑定目标（可选，取自历史轮次记录的目标 ID）","ui.no.linked.goal":"（不绑定目标）","ui.preflight":"预检 ","ui.ready":" 就绪","ui.checks.unmet":" 项未满足","ui.collapse":"收起","ui.expand":"展开","ui.stop.current.round.analysis.only.accounts.are.unaffected":"停止当前轮次（只影响分析，绝不影响账户）","ui.no.round.is.currently.running":"当前没有运行中的轮次","ui.stop":"停止","ui.retry.with.the.same.cycle.id.resume.from.saved.checkpoints":"沿用同一个 cycle_id 重试（引擎从检查点续跑）","ui.no.retryable.round.only.failed.stopped.or.unsubmitted.rounds.can.be.retried":"没有可重试的轮次：仅已失败 / 已停止的轮次或尚未提交成功的轮次可重试","ui.retry":"重试","ui.running.2":"进行中：","ui.poll.every":" · 轮询 ","ui.this.round.has.ended.polling.stopped":"轮次已进入终态，已停止轮询。","ui.no.round.is.currently.running.2":"当前没有运行中的轮次。","ui.research.and.execution":"研究与执行","ui.analysis.produces.research.and.trade.recommendations.execution.requires.separate.appr":"分析只生成研究报告和交易建议。交易执行仍需另行批准。","ui.investment.research":"投资研究","ui.security.research.progress.and.historical.reports":"股票研究、分析过程与历史报告","ui.investment.engine.unavailable":"投资引擎不可达","ui.no.research.rounds.yet":"尚无研究轮次","ui.research.actions":"研究操作","ui.stages":" 阶段","ui.evidence.items":" 条证据","ui.resume":"续跑","ui.research.produces.recommendations.execution.requires.separate.approval":"分析生成建议，交易需另行批准。","ui.research.history":"研究记录","ui.failed.to.read.history":"历史读取失败：","ui.loading.research.history":"正在读取研究记录…","ui.no.research.yet.select.new.research.to.begin":"还没有研究，点击新建研究开始","ui.research.workspace":"研究工作区","ui.awaiting.screening":"等待选股","ui.select.a.round.on.the.left.or.create.new.research":"选择左侧记录，或新建研究","ui.research.stopped":"研究已停止：","ui.saved":"。已保存 ","ui.stages.resume.manually.to.continue":" 个阶段；续跑需要手动操作。","ui.research.content":"研究内容","ui.research.report":"研究报告","ui.research.progress":"研究过程","ui.new.research.2":"新建研究","ui.close.3":"关闭","ui.strategy.changed.to":"策略已切换为 ","ui.applies.to.subsequent.rounds.immediately":"，立即作用于后续轮次。","ui.switch.failed":"切换失败：","ui.settings.saved.and.applied":"设置已保存并生效。","ui.save.failed":"保存失败：","ui.minimum.confidence":"最低置信度","ui.max.security.weight":"单股仓位上限 %","ui.max.total.exposure":"总仓位上限 %","ui.minimum.cash.reserve":"最低现金储备 %","ui.maximum.drawdown":"最大回撤 %","ui.max.daily.trades":"当日最大交易数","ui.strategy.and.risk.controls":"投资策略与风控","ui.strategy.profiles.set.prompt.objectives.and.hard.limits.for.weights.cash.drawdown.and":"策略档位同时决定提示词目标与硬风险边界（仓位/现金/回撤/换手），由引擎强制执行。","ui.strategy.profile":"策略档位","ui.conservative":"保守","ui.neutral":"中立","ui.aggressive":"激进","ui.operation.mode":"运行模式","ui.manual.run.only.when.triggered.automatic.run.according.to.the.schedule":"手动：仅当你触发时执行轮次；自动：按调度计划自动执行。","ui.automatic.2":"自动","ui.autonomous.investing.master.switch":"自动投资总开关","ui.when.disabled.the.engine.runs.no.automatic.rounds":"关闭后引擎不再执行任何自动轮次。","ui.enable":"启用","ui.disable":"停用","ui.current.hard.limits":"当前硬边界（","ui.schedule.saved":"调度设置已保存。","ui.automatic.rounds.and.scheduling":"自动轮次与调度","ui.intraday.and.closing.rounds.run.in.asia.shanghai.time.the.engine.applies.saved.schedu":"盘中与收盘轮次按北京时间触发；保存后由引擎调度器生效。","ui.market.briefing.time":"市场早报时间","ui.generate.a.briefing.each.trading.day.using.news.from.the.previous.trading.day":"每个交易日生成一次市场早报（内容为前一交易日的新闻）。","ui.intraday.rounds.hh.mm.comma.separated":" 盘中轮次（HH:MM 逗号分隔）","ui.closing.round":"收盘轮次：","ui.market.settings.saved":"市场设置已保存。","ui.markets.and.screening":"市场与选股","ui.enabled.markets.set.the.scheduling.and.screening.scope.screening.parameters.control.m":"启用市场决定调度与选股范围；选股参数控制全市场候选筛选。","ui.enabled.markets":"启用市场","ui.candidate.pool.size":"候选池大小","ui.maximum.securities.in.each.market.s.screening.pool":"每个市场选股池的标的数量上限。","ui.screening.refresh.interval.minutes":"选股刷新间隔（分钟）","ui.cache.lifetime.the.next.round.refreshes.expired.results":"缓存有效期，超期后下一轮次自动刷新。","ui.notification.settings.saved.webhook.address.encrypted.with.dpapi":"通知设置已保存（Webhook 地址经 DPAPI 加密存储）。","ui.notifications":"通知","ui.send.completed.round.reports.through.a.webhook":"轮次报告完成后通过 Webhook 推送。","ui.webhook.notifications":"Webhook 通知","ui.enabled.2":"已启用","ui.disabled":"未启用","ui.webhook.address":"Webhook 地址","ui.configured.existing.address.hidden.leave.blank.to.retain.it":"已配置（出于安全考虑不显示现有地址，留空保存则保持不变）","ui.must.start.with.https.encrypted.in.the.local.dpapi.store":"以 https:// 开头；地址加密保存在本机 DPAPI 库中。","ui.configured":"已配置","ui.save.notification.settings":"保存通知设置","ui.application.settings":"应用设置","ui.version.information":"版本信息","ui.product":"产品","ui.engine.version":"引擎版本","ui.paper.trading.paper":"纸面模拟（paper）","ui.safety.information":"安全说明","ui.this.product.supports.paper.trading.only.and.has.no.live.broker.connection.all.orders":"本产品仅支持模拟交易，不连接真实券商。所有订单经引擎硬风控与纸面撮合，AI 无法绕过。行情来自公开第三方接口，仅供研究与模拟。","ui.no.settings.available":"暂无设置项","ui.settings":"设置","ui.models.strategy.risk.autonomous.operation.and.desktop.configuration":"模型、策略、风险、自主运行与桌面应用配置","ui.secure.local.storage":"本机安全存储","ui.sessions":"会话","ui.new.session":"新会话","ui.create.session":"新建会话","ui.search.sessions":"搜索会话","ui.search.results":"搜索结果","ui.recent.sessions":"最近会话","ui.no.matching.sessions":"没有匹配的会话","ui.no.sessions.yet.create.one.above":"还没有会话，点击上方新建","ui.rename.session":"重命名会话","ui.rename":"重命名","ui.archive.this.session":"归档该会话？","ui.archive":"归档","ui.awaiting.your.question":"等待提问","ui.investment.session":"投资会话","ui.describe.what.you.want.to.build":"描述你想要构建的内容","ui.ask.an.investment.question.or.start.a.complete.analysis":"输入投资问题，或启动完整分析流程","ui.explore.the.unknown":"探索未至之境","ui.your.investment.research.assistant":"你的投资分析助手","ui.overview":"总览","ui.investment.assistant":"投资助手","ui.product.navigation":"产品导航","ui.command.failed":"命令失败","ui.save.failed.2":"保存失败","ui.session.not.found":"会话不存在","ui.investment.engine.2":"投资引擎","ui.mode.2":"模式","ui.time":"时间","ui.portfolio":"组合 ","ui.portfolio.2":"组合","ui.trades.2":"成交","ui.investment.mandate":"授权书","ui.min.confidence":"最低置信","ui.max.security.weight.2":"单股上限","ui.max.drawdown":"最大回撤","language.title":"界面语言","language.output":"研究输出语言","language.follow":"跟随界面（新轮次生效）","language.history":"历史内容与原始资料保留原文","language.saveFailed":"语言设置保存失败，请重试","punctuation.closeParen":"）","punctuation.openParen":"（","punctuation.comma":"、","punctuation.fullStop":"。","punctuation.colon":"：","ui.source.commit":"源码提交","ui.nav.assistant":"投资助手","ui.nav.research":"投资研究","ui.dialog.cancel":"取消","ui.dialog.save":"保存","ui.search.failed":"搜索失败：","motion.title":"动效","motion.system":"跟随系统","motion.standard":"标准","motion.off":"关闭","motion.hint":"页面和面板平滑切换；系统减少动态设置始终生效","motion.saveFailed":"动效设置保存失败，请重试","motion.stageTitle":"研究流程","motion.stageHint":"按实际完成任务显示阶段进度","motion.stage.base_research":"基础研究","motion.stage.research_debate":"研究辩论","motion.stage.portfolio_draft":"组合草案","motion.stage.risk_review":"风险复核","motion.stage.final_decision":"最终决策"},"en":{"ui.content.is.too.long.display.truncated":"\n\n(Content is too long; display truncated.)","ui.mainland.china":"Mainland China","ui.hong.kong":"Hong Kong","ui.united.states":"United States","ui.investment.overview":"Investment overview","ui.simulated.accounts.paper.trading.public.third.party.market.data.for.research":"Simulated accounts · Paper trading · Public third-party market data for research","ui.engine.unavailable":"Engine unavailable: ","ui.system.and.risk.status":"System and risk status","ui.mode":"Mode: ","ui.strategy":"Strategy: ","ui.emergency.stop":"Emergency stop","ui.paused":"Paused","ui.risk.controls.active":"Risk controls active","ui.investment.engine":"Investment engine: ","ui.running":"Running","ui.stopped":"Stopped","ui.next.round":" Next round","ui.account.assets":"Account assets","ui.market":"Market","ui.total.assets":"Total assets","ui.cash":"Cash","ui.holdings":"Holdings","ui.trades":"Trades","ui.engine.data.unavailable":"Engine data unavailable","ui.recent.round.reports":"Recent round reports","ui.no.round.reports.yet":"No round reports yet","ui.latest.macro.briefing":"Latest macro briefing","ui.1.month":"1 month","ui.3.months":"3 months","ui.1.year":"1 year","ui.unnamed.security":"Unnamed security","ui.price.history.unavailable":"Price history unavailable","ui.invalid.price.history.response":"Invalid price history response","ui.some.invalid.prices.were.skipped":"Some invalid prices were skipped","ui.chart.unavailable":"Chart unavailable","ui.insufficient.history":"Insufficient history","ui.loading.chart":"Loading chart…","ui.daily.prices.over.the.past.month":"Daily prices over the past month","ui.at.least.two.trading.days.are.required":"At least two trading days are required","ui.current.cost":"Current cost ","ui.volume":"Volume","ui.buy.sell":"Buy/Sell","ui.b":"B","ui.s":"S","ui.buy":"Buy","ui.sell":"Sell","ui.shares.fill.price":" shares · Fill price ","ui.close":"Close ","ui.open":"Open ","ui.high":" · High ","ui.low":" · Low ","ui.volume.2":"Volume ","ui.daily.price.currency":"Daily price, currency ","ui.view.trading.day":"View trading day ","ui.close.2":", close ","ui.unknown":"Unknown","ui.normal":"Normal","ui.account.equity":"Account equity","ui.cash.latest.position.valuations":"Cash + latest position valuations","ui.unrealized.p.l":"Unrealized P&L","ui.calculated.from.recorded.account.prices":"Calculated from recorded account prices","ui.capital.utilization":"Capital utilization","ui.cash.share":"Cash share ","ui.waiting.for.account.data":"Waiting for account data","ui.securities.held":"Securities held","ui.securities":" securities","ui.separate.simulated.account":" · Separate simulated account","ui.reload":"Reload","ui.portfolio.overview":"Portfolio overview","ui.track.changes.across.your.portfolio.and.securities":"Track changes across your portfolio and securities","ui.connecting.to.the.investment.engine":"Connecting to the investment engine","ui.paper.trading.risk":"Paper trading · Risk ","ui.cash.2":"Cash ","ui.market.value":" · Market value ","ui.next.round.2":"Next round","ui.automatic":"Automatic","ui.manual":"Manual","ui.view.market":"View market","ui.new.research":"＋ New research","ui.my.holdings":"My holdings","ui.securities.market.value":" securities · Market value ","ui.view":"View ","ui.price.chart":" price chart","ui.shares.cost":" shares · Cost ","ui.p.l":" · P&L ","ui.loading.holdings":"Loading holdings…","ui.no.holdings.yet":"No holdings yet","ui.account.data.unavailable":"Account data unavailable","ui.daily.prices.1.month.select.to.view.chart":"Daily prices, 1 month · Select to view chart","ui.price.chart.2":"Price chart","ui.time.range":"Time range","ui.chart.type":"Chart type","ui.line":"Line","ui.candlestick":"Candlestick","ui.this.source.does.not.provide.complete.ohlc.data":"This source does not provide complete OHLC data","ui.cost.line":"Cost line","ui.trade.dates":"Trade dates","ui.loading.price.history":"Loading price history…","ui.not.enough.price.history.yet":"Not enough price history yet","ui.quantity.held":"Quantity held","ui.shares":" shares","ui.current.position.cost":"Current position cost","ui.recorded.account.valuation":"Recorded account valuation","ui.source":"Source ","ui.not.provided":"Not provided","ui.last.trading.day":" · Last trading day ","ui.price.age":" · Price age ","ui.days":" days","ui.price.notes":" · Price notes: ","ui.a.fallback.price.source.was.used":"A fallback price source was used","ui.adjustment.status.is.unconfirmed":"Adjustment status is unconfirmed","ui.select.a.holding.on.the.left.to.view.its.chart":"Select a holding on the left to view its chart","ui.select.a.holding.to.view.its.chart":"Select a holding to view its chart","ui.round.timeline":"Round timeline","ui.latest":"Latest ","ui.rounds":" rounds","ui.security.research":"Security research","ui.no.previous.rounds":"No previous rounds","ui.portfolio.allocation":"Portfolio allocation","ui.this.market.including.cash":"This market · Including cash","ui.asset.allocation":"Asset allocation","ui.no.allocation.data.available":"No allocation data available","ui.trade.history":"Trade history","ui.latest.5.simulated.fills":"Latest 5 · Simulated fills","ui.shares.2":" shares @ ","ui.no.simulated.trades.for.this.security":"No simulated trades for this security","ui.select.a.holding.to.view.its.trades":"Select a holding to view its trades","ui.operations.and.research":"Operations and research","ui.risk":"Risk","ui.next.round.3":" Next round","ui.not.scheduled":"Not scheduled","ui.latest.analysis":"Latest analysis · ","ui.open.analysis.workflow.and.reports":"Open analysis workflow and reports","ui.market.briefing":"Market briefing","ui.collected.at.08.00.each.trading.day.asia.shanghai":"Collected at 08:00 each trading day (Asia/Shanghai)","ui.01.data.preparation":"01 · Data preparation","ui.market.status":"Market status","ui.screen.candidates":"Screen candidates","ui.holdings.mandate":"Holdings / mandate","ui.02.security.research":"02 · Security research","ui.technical.analysis":"Technical analysis","ui.fundamentals":"Fundamentals","ui.news":"News","ui.sentiment":"Sentiment","ui.four.base.research.roles":"Four base research roles","ui.03.research.review":"03 · Research review","ui.bull.researcher":"Bull researcher","ui.bear.researcher":"Bear researcher","ui.research.manager":"Research manager","ui.research.debate.and.security.review":"Research debate and security review","ui.04.portfolio.construction":"04 · Portfolio construction","ui.security.trader":"Security trader","ui.portfolio.manager.draft":"Portfolio manager draft","ui.portfolio.draft":"Portfolio draft","ui.05.risk.review":"05 · Risk review","ui.aggressive.perspective":"Aggressive perspective","ui.conservative.perspective":"Conservative perspective","ui.neutral.perspective":"Neutral perspective","ui.risk.manager":"Risk manager","ui.risk.debate":"Risk debate","ui.06.decisions.and.execution":"06 · Decisions and execution","ui.final.portfolio.decision":"Final portfolio decision","ui.hard.risk.checks":"Hard risk checks","ui.paper.execution.report":"Paper execution / report","ui.final.decision":"Final decision","ui.preparing.data":"Preparing data","ui.restoring.checkpoints":"Restoring checkpoints","ui.bull.bear.debate.and.research.review":"Bull/bear debate and research review","ui.risk.debate.and.review":"Risk debate and review","ui.hard.risk.controls.and.paper.execution":"Hard risk controls and paper execution","ui.awaiting.approval":"Awaiting approval","ui.completed":"Completed","ui.failed":"Failed","ui.stopped.2":"Stopped","ui.not.run.yet":"Not run yet","ui.waiting":"Waiting","ui.isolated.roles.and.per.security.research":"Isolated roles and per-security research","ui.evidence.scope.and.citation.checks":"Evidence scope and citation checks","ui.failure.handling.and.safe.hold":"Failure handling and safe HOLD","ui.stage.checkpoints.and.recovery":"Stage checkpoints and recovery","ui.investment.context":"Investment context","ui.collapse.context":"Collapse context","ui.environment":"Environment","ui.trading.mode":"Trading mode","ui.paper.trading":"Paper trading","ui.strategy.2":"Strategy","ui.autonomous.operation":"Autonomous operation","ui.enabled":"Enabled","ui.manual.2":"Manual","ui.risk.status":"Risk status","ui.analysis.workflow":"Analysis workflow","ui.current":"Current: ","ui.current.no.rounds.yet":"Current: no rounds yet","ui.research.agents":"Research agents ","ui.evidence":", evidence ","ui.items":" items.","ui.live.stages.and.checkpoints.appear.when.a.manual.or.automatic.round.starts":"Live stages and checkpoints appear when a manual or automatic round starts.","ui.view.full.analysis.workflow":"View full analysis workflow","ui.recent.activity":"Recent activity","ui.latest.report":"Latest report","ui.none.yet":"None yet","ui.disconnected":"Disconnected","ui.no.rounds.yet":"No rounds yet","ui.strategy.3":"Strategy ","ui.risk.2":"Risk ","ui.current.round":"Current round ","ui.evidence.2":"Evidence ","ui.context":"Context","ui.queued":"Queued","ui.not.started":"Not started","ui.s.2":" s","ui.min":" min ","ui.h":" h ","ui.min.2":" min","ui.tasks":"Tasks ","ui.failed.2":" · Failed ","ui.in.progress":"In progress","ui.estimated":"% (estimated)","ui.stages.completed":" stages completed","ui.in.progress.2":" · In progress","ui.search.security.name.or.ticker":"Search security name or ticker","ui.example.tencent.00700.apple":"Example: Tencent, 00700, Apple","ui.matching.securities":"Matching securities","ui.similar.name.please.verify":" · Similar name, please verify","ui.searching.the.local.directory":"Searching the local directory…","ui.security.directory.unavailable":"Security directory unavailable: ","ui.no.local.matches.enter.an.exact.ticker.or.update.the.directory":"No local matches. Enter an exact ticker or update the directory.","ui.select.a.match.to.add.it.similar.names.are.never.substituted.automatically":"Select a match to add it. Similar names are never substituted automatically.","ui.local.directory":"Local directory: ","ui.securities.2":" securities","ui.limited.directory.coverage":" · Limited directory coverage","ui.local.security.directory":"Local security directory","ui.updating.directory":"Updating directory…","ui.update.directory.online":"Update directory (online)","ui.stage.evidence":"Stage evidence","ui.complete.saved.stage.materials.verify.unknown.dates.sources.and.valuation.bases.again":"Complete saved stage materials. Verify unknown dates, sources and valuation bases against the report.","ui.select.stage":"Select stage","ui.no.saved.stage.evidence.yet":"No saved stage evidence yet","ui.failed.to.read.evidence":"Failed to read evidence: ","ui.loading.evidence":"Loading evidence…","ui.expand.original.materials":"Expand original materials","ui.round":"Round ","ui.failed.to.read.round":"Failed to read round: ","ui.warnings":"Warnings: ","ui.items.2":" items: ","ui.round.status":"Round status","ui.current.stage":"Current stage","ui.tasks.complete.expected":"Tasks complete / expected","ui.evidence.count":"Evidence count","ui.label":" · Label ","ui.securities.3":" · Securities ","ui.items.3":" items","ui.no.record.returned.by.the.engine":": no record returned by the engine","ui.no.analysis.round.started":"No analysis round started","ui.historical.starts":"Historical starts: ","ui.including.retries.current.progress.deduplicates.roles.original.timestamps.and.failure":" (including retries). Current progress deduplicates roles; original timestamps and failures are retained.","ui.this.attempt":"This attempt ","ui.loading.stages":"Loading stages…","ui.no.stage.records.saved.for.this.round":"No stage records saved for this round","ui.round.report":"Round report: ","ui.run.logs":"Run logs · ","ui.entries":" entries","ui.showing.latest":" (showing latest ","ui.entries.2":" entries)","ui.collapse.logs":"Collapse logs","ui.expand.logs":"Expand logs","ui.no.logs.yet":"No logs yet","ui.export.failed":"Export failed: ","ui.round.reports":"Round reports","ui.rounds.2":" rounds","ui.filter.reports.by.market":"Filter reports by market","ui.all.markets":"All markets","ui.refreshing":"Refreshing…","ui.refresh":"Refresh","ui.report.index.unavailable":"Report index unavailable: ","ui.duration":" · Duration ","ui.evidence.3":" · Evidence ","ui.decisions":" · Decisions ","ui.loading.report.index":"Loading report index…","ui.export.md":"Export .md","ui.loading.report":"Loading report…","ui.failed.to.read.report":"Failed to read report: ","ui.select.a.round.above.to.read.its.report":"Select a round above to read its report","ui.valid.tickers":"Valid tickers","ui.please.verify":"Please verify: ","ui.select.security.names.from.the.search.results":"; select security names from the search results","ui.recognized":"Recognized ","ui.no.securities.entered":"No securities entered","ui.maximum":"Maximum ","ui.limit.exceeded":" · Limit exceeded","ui.emergency.stop.is.off":"Emergency stop is off","ui.emergency.stop.is.active":"Emergency stop is active","ui.engine.is.paused.research.may.still.start":"Engine is paused (research may still start)","ui.no.round.running":"No round running","ui.is.running":" is running","ui.none":"None","ui.engine.reachable":"Engine reachable","ui.connected.to.the.investment.engine":"Connected to the investment engine","ui.unavailable":"Unavailable: ","ui.submitting":"Submitting…","ui.verify.tickers.select.security.names.from.the.search.results":"Verify tickers; select security names from the search results","ui.enter.a.security.list.first":"Enter a security list first","ui.security.count.exceeds":"Security count exceeds ","ui.emergency.stop.is.active.analysis.cannot.start":"Emergency stop is active; analysis cannot start","ui.an.analysis.round.is.already.running":"An analysis round is already running","ui.investment.engine.unavailable.analysis.cannot.start":"Investment engine unavailable: analysis cannot start","ui.round.resumed.from.checkpoints.with.the.same.cycle.id":"Round resumed from checkpoints with the same cycle_id.","ui.this.round.was.interrupted.select.retry.to.resume.explicitly":"This round was interrupted. Select Retry to resume explicitly.","ui.this.round.is.still.leased.retry.was.deferred.try.again.later":"This round is still leased. Retry was deferred; try again later.","ui.this.cycle.id.already.exists.no.duplicate.round.was.started":"This cycle_id already exists; no duplicate round was started.","ui.analysis.started.fetching.live.progress":"Analysis started. Fetching live progress.","ui.start.failed":"Start failed: ","ui.screening.results.are.older.than":"Screening results are older than ","ui.minutes.refreshed.screening.found.no.securities.enter.tickers.manually.or.try.later":" minutes; refreshed screening found no securities. Enter tickers manually or try later.","ui.automatic.screening.refresh.failed":"Automatic screening refresh failed: ","ui.another.quick.action.is.in.progress":"Another quick action is in progress…","ui.investment.engine.unavailable.action.cannot.run":"Investment engine unavailable: action cannot run","ui.screening.returned.no.selections.discovered":"Screening returned no selections. Discovered ","ui.securities.candidates":" securities, candidates ","ui.screening.complete.discovered":"Screening complete: discovered ","ui.securities.candidates.2":" securities · Candidates ","ui.securities.selected":" securities · Selected ","ui.securities.source":" securities (source ","ui.the.security.list.is.populated":"). The security list is populated.","ui.screening.failed":"Screening failed: ","ui.verify.the.security.list.remove.invalid.names.and.stay.within.the.limit":"Verify the security list: remove invalid names and stay within the limit.","ui.workflow.not.started.screening.returned.no.selections.enter.securities.manually":"Workflow not started: screening returned no selections. Enter securities manually.","ui.workflow.start.failed":"Workflow start failed: ","ui.user.stopped.the.analysis.round.from.the.product.interface":"User stopped the analysis round from the product interface","ui.stop.requested.for.round":"Stop requested for round ","ui.analysis.only.accounts.are.unaffected":" (analysis only; accounts are unaffected).","ui.stop.failed":"Stop failed: ","ui.the.latest.screening.is.older.than":"The latest screening is older than ","ui.minutes.screening.will.refresh.before.analysis.starts":" minutes. Screening will refresh before analysis starts.","ui.from.screening":"From screening: ","ui.candidates":" candidates · ","ui.within":"Within ","ui.minutes.reuse.directly":" minutes; reuse directly","ui.expired.screening.will.refresh.before.analysis.starts":"Expired; screening will refresh before analysis starts","ui.from.this.screening.candidates.are.in.the.list.below.ready.to.analyze":"From this screening: candidates are in the list below, ready to analyze.","ui.no.screening.results.yet.screen.securities.or.switch.to.manual.entry":"No screening results yet. Screen securities or switch to manual entry.","ui.manual.entry.separate.with.commas.spaces.or.newlines.duplicates.are.removed.maximum":"Manual entry: separate with commas, spaces or newlines. Duplicates are removed. Maximum ","ui.securities.4":" securities.","ui.start.analysis":"Start analysis","ui.not.started.2":"Not started","ui.run.screening.then.the.fixed.analysis.workflow.research.only.no.orders":"Run screening, then the fixed analysis workflow (research only; no orders)","ui.starting.workflow":"Starting workflow…","ui.run.full.workflow":"Run full workflow","ui.scan.the.market.for.liquidity.and.factor.candidates.then.populate.the.security.list":"Scan the market for liquidity and factor candidates, then populate the security list","ui.screening.may.take.tens.of.seconds":"Screening… (may take tens of seconds)","ui.screen.securities":"Screen securities","ui.run.the.fixed.workflow.for.the.listed.securities.research.only.no.orders":"Run the fixed workflow for the listed securities (research only; no orders)","ui.submitting.2":"Submitting…","ui.analyze.listed.securities":"Analyze listed securities","ui.round.label.a.za.z0.9.only":"Round label ([A-Za-z0-9_.-] only)","ui.security.source":"Security source","ui.manual.entry":"Manual entry","ui.from.screening.2":"From screening","ui.security.list.comma.space.newline.separated.deduplicated":"Security list (comma / space / newline separated; deduplicated)","ui.exceeds.maximum":" (exceeds maximum ","ui.securities.5":" securities)","ui.linked.goal.optional.goal.id.from.a.previous.round":"Linked goal (optional; goal ID from a previous round)","ui.no.linked.goal":"(No linked goal)","ui.preflight":"Preflight ","ui.ready":" ready","ui.checks.unmet":" checks unmet","ui.collapse":"Collapse","ui.expand":"Expand","ui.stop.current.round.analysis.only.accounts.are.unaffected":"Stop current round (analysis only; accounts are unaffected)","ui.no.round.is.currently.running":"No round is currently running","ui.stop":"Stop","ui.retry.with.the.same.cycle.id.resume.from.saved.checkpoints":"Retry with the same cycle_id (resume from saved checkpoints)","ui.no.retryable.round.only.failed.stopped.or.unsubmitted.rounds.can.be.retried":"No retryable round: only failed, stopped or unsubmitted rounds can be retried","ui.retry":"Retry","ui.running.2":"Running: ","ui.poll.every":" · Poll every ","ui.this.round.has.ended.polling.stopped":"This round has ended; polling stopped.","ui.no.round.is.currently.running.2":"No round is currently running.","ui.research.and.execution":"Research and execution","ui.analysis.produces.research.and.trade.recommendations.execution.requires.separate.appr":"Analysis produces research and trade recommendations. Execution requires separate approval.","ui.investment.research":"Investment research","ui.security.research.progress.and.historical.reports":"Security research, progress and historical reports","ui.investment.engine.unavailable":"Investment engine unavailable","ui.no.research.rounds.yet":"No research rounds yet","ui.research.actions":"Research actions","ui.stages":" stages","ui.evidence.items":" evidence items","ui.resume":"Resume","ui.research.produces.recommendations.execution.requires.separate.approval":"Research produces recommendations; execution requires separate approval.","ui.research.history":"Research history","ui.failed.to.read.history":"Failed to read history: ","ui.loading.research.history":"Loading research history…","ui.no.research.yet.select.new.research.to.begin":"No research yet. Select New research to begin.","ui.research.workspace":"Research workspace","ui.awaiting.screening":"Awaiting screening","ui.select.a.round.on.the.left.or.create.new.research":"Select a round on the left, or create new research","ui.research.stopped":"Research stopped: ","ui.saved":". Saved ","ui.stages.resume.manually.to.continue":" stages; resume manually to continue.","ui.research.content":"Research content","ui.research.report":"Research report","ui.research.progress":"Research progress","ui.new.research.2":"New research","ui.close.3":"Close","ui.strategy.changed.to":"Strategy changed to ","ui.applies.to.subsequent.rounds.immediately":"; applies to subsequent rounds immediately.","ui.switch.failed":"Switch failed: ","ui.settings.saved.and.applied":"Settings saved and applied.","ui.save.failed":"Save failed: ","ui.minimum.confidence":"Minimum confidence","ui.max.security.weight":"Max security weight %","ui.max.total.exposure":"Max total exposure %","ui.minimum.cash.reserve":"Minimum cash reserve %","ui.maximum.drawdown":"Maximum drawdown %","ui.max.daily.trades":"Max daily trades","ui.strategy.and.risk.controls":"Strategy and risk controls","ui.strategy.profiles.set.prompt.objectives.and.hard.limits.for.weights.cash.drawdown.and":"Strategy profiles set prompt objectives and hard limits for weights, cash, drawdown and turnover. The engine enforces them.","ui.strategy.profile":"Strategy profile","ui.conservative":"Conservative","ui.neutral":"Neutral","ui.aggressive":"Aggressive","ui.operation.mode":"Operation mode","ui.manual.run.only.when.triggered.automatic.run.according.to.the.schedule":"Manual: run only when triggered. Automatic: run according to the schedule.","ui.automatic.2":"Automatic","ui.autonomous.investing.master.switch":"Autonomous investing master switch","ui.when.disabled.the.engine.runs.no.automatic.rounds":"When disabled, the engine runs no automatic rounds.","ui.enable":"Enable","ui.disable":"Disable","ui.current.hard.limits":"Current hard limits (","ui.schedule.saved":"Schedule saved.","ui.automatic.rounds.and.scheduling":"Automatic rounds and scheduling","ui.intraday.and.closing.rounds.run.in.asia.shanghai.time.the.engine.applies.saved.schedu":"Intraday and closing rounds run in Asia/Shanghai time. The engine applies saved schedules.","ui.market.briefing.time":"Market briefing time","ui.generate.a.briefing.each.trading.day.using.news.from.the.previous.trading.day":"Generate a briefing each trading day using news from the previous trading day.","ui.intraday.rounds.hh.mm.comma.separated":" intraday rounds (HH:MM, comma separated)","ui.closing.round":"Closing round: ","ui.market.settings.saved":"Market settings saved.","ui.markets.and.screening":"Markets and screening","ui.enabled.markets.set.the.scheduling.and.screening.scope.screening.parameters.control.m":"Enabled markets set the scheduling and screening scope; screening parameters control market-wide selection.","ui.enabled.markets":"Enabled markets","ui.candidate.pool.size":"Candidate pool size","ui.maximum.securities.in.each.market.s.screening.pool":"Maximum securities in each market's screening pool.","ui.screening.refresh.interval.minutes":"Screening refresh interval (minutes)","ui.cache.lifetime.the.next.round.refreshes.expired.results":"Cache lifetime; the next round refreshes expired results.","ui.notification.settings.saved.webhook.address.encrypted.with.dpapi":"Notification settings saved (Webhook address encrypted with DPAPI).","ui.notifications":"Notifications","ui.send.completed.round.reports.through.a.webhook":"Send completed round reports through a Webhook.","ui.webhook.notifications":"Webhook notifications","ui.enabled.2":"Enabled","ui.disabled":"Disabled","ui.webhook.address":"Webhook address","ui.configured.existing.address.hidden.leave.blank.to.retain.it":"Configured (existing address hidden; leave blank to retain it)","ui.must.start.with.https.encrypted.in.the.local.dpapi.store":"Must start with https://. Encrypted in the local DPAPI store.","ui.configured":"Configured","ui.save.notification.settings":"Save notification settings","ui.application.settings":"Application settings","ui.version.information":"Version information","ui.product":"Product","ui.engine.version":"Engine version","ui.paper.trading.paper":"Paper trading (paper)","ui.safety.information":"Safety information","ui.this.product.supports.paper.trading.only.and.has.no.live.broker.connection.all.orders":"This product supports paper trading only and has no live broker connection. All orders pass engine-enforced risk checks and simulated matching. AI cannot bypass these checks. Public third-party prices are for research and simulation.","ui.no.settings.available":"No settings available","ui.settings":"Settings","ui.models.strategy.risk.autonomous.operation.and.desktop.configuration":"Models, strategy, risk, autonomous operation and desktop configuration","ui.secure.local.storage":"Secure local storage","ui.sessions":"Sessions","ui.new.session":"New session","ui.create.session":"Create session","ui.search.sessions":"Search sessions","ui.search.results":"Search results","ui.recent.sessions":"Recent sessions","ui.no.matching.sessions":"No matching sessions","ui.no.sessions.yet.create.one.above":"No sessions yet. Create one above.","ui.rename.session":"Rename session","ui.rename":"Rename","ui.archive.this.session":"Archive this session?","ui.archive":"Archive","ui.awaiting.your.question":"Awaiting your question","ui.investment.session":"Investment session","ui.describe.what.you.want.to.build":"Describe what you want to build","ui.ask.an.investment.question.or.start.a.complete.analysis":"Ask an investment question, or start a complete analysis","ui.explore.the.unknown":"Explore the unknown","ui.your.investment.research.assistant":"Your investment research assistant","ui.overview":"Overview","ui.investment.assistant":"Investment assistant","ui.product.navigation":"Product navigation","ui.command.failed":"Command failed","ui.save.failed.2":"Save failed","ui.session.not.found":"Session not found","ui.investment.engine.2":"Investment engine","ui.mode.2":"Mode","ui.time":"Time","ui.portfolio":"Portfolio ","ui.portfolio.2":"Portfolio","ui.trades.2":"Trades","ui.investment.mandate":"Investment mandate","ui.min.confidence":"Min confidence","ui.max.security.weight.2":"Max security weight","ui.max.drawdown":"Max drawdown","language.title":"Interface language","language.output":"Research output language","language.follow":"Follow interface (new rounds)","language.history":"Historical content and source materials remain in their original language","language.saveFailed":"Language preference could not be saved. Please retry.","punctuation.closeParen":")","punctuation.openParen":"(","punctuation.comma":", ","punctuation.fullStop":".","punctuation.colon":": ","ui.source.commit":"Source commit","ui.nav.assistant":"Assistant","ui.nav.research":"Research","ui.dialog.cancel":"Cancel","ui.dialog.save":"Save","ui.search.failed":"Search failed: ","motion.title":"Motion","motion.system":"Follow system","motion.standard":"Standard","motion.off":"Off","motion.hint":"Smooth page and panel transitions; system reduced-motion settings are always respected","motion.saveFailed":"Unable to save motion settings. Please try again.","motion.stageTitle":"Research pipeline","motion.stageHint":"Stage progress reflects recorded completed tasks","motion.stage.base_research":"Base research","motion.stage.research_debate":"Research debate","motion.stage.portfolio_draft":"Portfolio draft","motion.stage.risk_review":"Risk review","motion.stage.final_decision":"Final decision"}};
const COPY_NS = "dsh-product-shell";
let productLocale;
const tr = (key, params = {}) => {
  const value = productLocale ? productLocale.bind(COPY_NS)(key,params) : PRODUCT_COPY.zh[key];
  if (value === undefined) throw new Error('Missing product translation: '+key);
  return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (_,name)=>String(params[name]??'{'+name+'}'));
};
const localeTag = () => productLocale?.getSnapshot().active === 'en' ? 'en-US' : 'zh-CN';
const fallbackLocaleSnapshot = Object.freeze({active:'zh',revision:0});
function useProductLocale() {
  return react.useSyncExternalStore(listener=>productLocale?.subscribe(listener)??(()=>{}),()=>productLocale?.getSnapshot()??fallbackLocaleSnapshot);
}
function installProductLocale(ctx) {
  productLocale = ctx.locale;
  ctx.effect(()=>ctx.locale.register(COPY_NS,PRODUCT_COPY),'product bilingual dictionaries');
}
const strategyName = (mandate={}) => ({conservative:tr("ui.conservative"),neutral:tr("ui.neutral"),aggressive:tr("ui.aggressive")})[mandate.profile] ?? mandate.display_name ?? mandate.profile ?? "—";
const localized = Component => function Localized(props) { useProductLocale(); return react.createElement(Component,props); };
/* I18N:END */
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-store");
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");

		// ── styles ─────────────────────────────────────────────────────────
		const CSS_ID = "@ai-trading-automation/dsh-product-shell/style";

		/* ICONS:START — generated by scripts/generate-icons.mjs; do not edit by hand. */
		// Source: lucide-static@1.61.0 (14 of 1903 icons)
		const ICON_SVG = {
	"layoutDashboard": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
	"messageSquare": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>',
	"radar": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/></svg>',
	"workflow": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>',
	"settings": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
	"sparkles": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
	"play": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
	"square": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
	"refreshCw": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
	"download": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
	"chevronDown": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
	"checkCircle": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/></svg>',
	"alertTriangle": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
	"xCircle": '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
		};

		/** Render one icon as an inline <svg> that inherits currentColor and token sizes. */
		const icon = (name, size) => {
			const markup = ICON_SVG[name];
			if (!markup) return null;
			return react.createElement("span", {
				className: "ia-icon",
				"aria-hidden": "true",
				dangerouslySetInnerHTML: { __html: markup.replace('<svg ', `<svg width="${size ?? 18}" height="${size ?? 18}" `) },
			});
		};
		/* ICONS:END */
		/* MARKDOWN:START — generated by scripts/generate-markdown.mjs; do not edit by hand. */
		// Source: scripts/generate-markdown.mjs — pure React element output, no runtime
		// dependency beyond the react module the factory already requires. Re-run the
		// generator after editing that source.
		//
		// Reports arrive as Markdown (engine/analysis_reports.py renders them). This
		// turns that text into a React element tree: no HTML is ever parsed and
		// dangerouslySetInnerHTML is never used, so raw markup inside a report shows up
		// as literal text instead of executing. Malformed input cannot throw — the
		// worst case is that it degrades to text.
		let mdSeq = 0;
		const mdKey = (kind) => kind + "-" + (mdSeq += 1);
		const mdH = (type, props, ...children) => react.createElement(type, props, ...children);

		const MD_MAX_DEPTH = 6;
		const MD_MAX_CHARS = 500000;
		const mdTruncated = () => tr("ui.content.is.too.long.display.truncated");
		const MD_BREAK = /(?: {2,}|\\)$/;
		// "\u0060" is the backtick, spelled this way so this file stays free of the one
		// character that would terminate a template literal.
		const MD_ESCAPABLE = "\\\u0060*_{}[]()#+-.!~>|";
		const MD_FENCE = /^ {0,3}(\x60{3,}|~{3,})[ \t]*(.*)$/;
		const MD_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
		const MD_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
		const MD_QUOTE = /^ {0,3}>[ \t]?(.*)$/;
		const MD_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
		const MD_BLANK = /^\s*$/;
		const MD_ALIGN = /^:?-+:?$/;

		/** Split one table row into trimmed cells; leading/trailing pipes are optional. */
		const mdRow = (line) => {
		  let row = String(line).trim();
		  if (row.charAt(0) === "|") row = row.slice(1);
		  if (row.charAt(row.length - 1) === "|") row = row.slice(0, -1);
		  return row.split("|").map((cell) => cell.trim());
		};

		/** Alignment of a "|---|:--:|" separator row, or null when it is not one. */
		const mdAlignRow = (line) => {
		  const cells = mdRow(line);
		  if (cells.length === 0) return null;
		  const align = [];
		  for (const cell of cells) {
		    if (!MD_ALIGN.test(cell)) return null;
		    const left = cell.charAt(0) === ":";
		    const right = cell.charAt(cell.length - 1) === ":";
		    align.push(left && right ? "center" : right ? "right" : left ? "left" : "");
		  }
		  return align;
		};

		const mdCellStyle = (align) => (align ? { textAlign: align } : undefined);

		/**
		 * Only http:, https: and mailto: links are rendered as links. Browsers strip
		 * ASCII control characters (and spaces) inside a URL, so the payload is judged
		 * on its stripped form — "java\tscript:..." must not pass the check.
		 */
		const mdHref = (value) => {
		  const compact = String(value || "").trim().replace(/[\u0000-\u0020\u007f]+/g, "");
		  return /^(?:https?|mailto):/i.test(compact) ? compact : null;
		};

		/** Inline spans → React children. Single pass; recursion is depth-capped. */
		const mdInline = (text, depth) => {
		  const source = String(text ?? "");
		  const out = [];
		  if (!source) return out;
		  if (depth > MD_MAX_DEPTH) return [source];
		  let buffer = "";
		  let index = 0;
		  const flush = () => {
		    if (buffer) {
		      out.push(buffer);
		      buffer = "";
		    }
		  };
		  const take = (end, width, node) => {
		    flush();
		    out.push(node);
		    index = end + width;
		  };
		  while (index < source.length) {
		    const char = source.charAt(index);
		    if (char === "\\" && MD_ESCAPABLE.indexOf(source.charAt(index + 1)) !== -1) {
		      buffer += source.charAt(index + 1);
		      index += 2;
		      continue;
		    }
		    if (char === "\x60") {
		      const end = source.indexOf("\x60", index + 1);
		      if (end > index + 1) {
		        take(end, 1, mdH("code", { key: mdKey("code"), className: "ia-md-inline" }, source.slice(index + 1, end)));
		        continue;
		      }
		    }
		    if (char === "*" || char === "_") {
		      const double = source.charAt(index + 1) === char;
		      const marker = double ? char + char : char;
		      const from = index + marker.length;
		      const end = source.indexOf(marker, from);
		      // "_" inside a word ("snake_case") is not emphasis; "*" may be.
		      const wordBefore = char !== "_" || !/[0-9A-Za-z_]/.test(source.charAt(index - 1));
		      const wordAfter = char !== "_" || !/[0-9A-Za-z_]/.test(source.charAt(end - 1));
		      if (wordBefore && wordAfter && end > from) {
		        take(end, marker.length, mdH(double ? "strong" : "em", { key: mdKey(double ? "strong" : "em") }, ...mdInline(source.slice(from, end), depth + 1)));
		        continue;
		      }
		    }
		    if (char === "~" && source.charAt(index + 1) === "~") {
		      const end = source.indexOf("~~", index + 2);
		      if (end > index + 2) {
		        take(end, 2, mdH("del", { key: mdKey("del") }, ...mdInline(source.slice(index + 2, end), depth + 1)));
		        continue;
		      }
		    }
		    if (char === "[") {
		      const close = source.indexOf("]", index + 1);
		      if (close > index && source.charAt(close + 1) === "(") {
		        const paren = source.indexOf(")", close + 2);
		        const href = paren > close + 1 ? mdHref(source.slice(close + 2, paren)) : null;
		        if (href) {
		          take(paren, 1, mdH("a", { key: mdKey("a"), className: "ia-md-a", href, target: "_blank", rel: "noreferrer" }, ...mdInline(source.slice(index + 1, close), depth + 1)));
		          continue;
		        }
		      }
		      // Unsafe scheme or a relative URL: keep the markup exactly as written.
		      const width = close > index ? close + 1 - index : 1;
		      buffer += source.substr(index, width);
		      index += width;
		      continue;
		    }
		    buffer += char;
		    index += 1;
		  }
		  flush();
		  return out;
		};

		/** Lines of one paragraph/quote/list item: soft break → space, hard break → <br>. */
		const mdInlineLines = (lines) => {
		  const out = [];
		  let breakBefore = false;
		  for (let index = 0; index < lines.length; index += 1) {
		    const raw = lines[index];
		    const hard = MD_BREAK.test(raw);
		    if (index > 0) out.push(breakBefore ? mdH("br", { key: mdKey("br") }) : " ");
		    out.push(...mdInline(hard ? raw.replace(MD_BREAK, "") : raw, 0));
		    breakBefore = hard;
		  }
		  return out;
		};

		const mdList = (ordered, items, start) => {
		  const tag = ordered ? "ol" : "ul";
		  const props = { key: mdKey(tag), className: ordered ? "ia-md-ol" : "ia-md-ul" };
		  if (ordered && start > 1) props.start = start;
		  const children = [];
		  for (const entry of items) {
		    const kids = mdInlineLines([entry.text]);
		    if (entry.children.length > 0) {
		      const subOrdered = entry.children[0].ordered;
		      const subTag = subOrdered ? "ol" : "ul";
		      kids.push(
		        mdH(subTag, { key: mdKey(subTag), className: subOrdered ? "ia-md-ol" : "ia-md-ul" },
		          ...entry.children.map((child) => mdH("li", { key: mdKey("li") }, ...mdInlineLines([child.text])))),
		      );
		    }
		    children.push(mdH("li", { key: mdKey("li") }, ...kids));
		  }
		  return mdH(tag, props, ...children);
		};

		/** Block-level pass. "depth" caps blockquote recursion. */
		const mdBlocks = (lines, depth) => {
		  const nodes = [];
		  if (depth > MD_MAX_DEPTH) {
		    return [mdH("p", { key: mdKey("p"), className: "ia-md-p" }, ...mdInline(lines.join(" "), 0))];
		  }
		  let index = 0;
		  while (index < lines.length) {
		    const line = lines[index];
		    if (MD_BLANK.test(line)) {
		      index += 1;
		      continue;
		    }

		    const fence = MD_FENCE.exec(line);
		    if (fence) {
		      const marker = fence[1].charAt(0);
		      const info = fence[2].trim().split(/\s+/)[0] || "";
		      const body = [];
		      index += 1;
		      while (index < lines.length) {
		        const candidate = lines[index].trim();
		        if (candidate.length >= 3 && candidate === marker.repeat(candidate.length)) {
		          index += 1;
		          break;
		        }
		        body.push(lines[index]);
		        index += 1;
		      }
		      // An unterminated fence still renders the remainder as code: content is
		      // never silently dropped.
		      nodes.push(
		        mdH("pre", { key: mdKey("pre"), className: "ia-md-pre" },
		          mdH("code", { key: mdKey("code"), className: "ia-md-code", "data-lang": info || undefined }, body.join("\n"))),
		      );
		      continue;
		    }

		    const heading = MD_HEADING.exec(line);
		    if (heading) {
		      const level = heading[1].length;
		      nodes.push(mdH("h" + level, { key: mdKey("h" + level), className: "ia-md-h" + level }, ...mdInline(heading[2] || "", 0)));
		      index += 1;
		      continue;
		    }

		    if (MD_HR.test(line)) {
		      nodes.push(mdH("hr", { key: mdKey("hr"), className: "ia-md-hr" }));
		      index += 1;
		      continue;
		    }

		    const quote = MD_QUOTE.exec(line);
		    if (quote) {
		      const inner = [];
		      while (index < lines.length) {
		        const match = MD_QUOTE.exec(lines[index]);
		        if (!match) break;
		        inner.push(match[1]);
		        index += 1;
		      }
		      nodes.push(mdH("blockquote", { key: mdKey("blockquote"), className: "ia-md-quote" }, ...mdBlocks(inner, depth + 1)));
		      continue;
		    }

		    const align = index + 1 < lines.length ? mdAlignRow(lines[index + 1]) : null;
		    if (align !== null && line.indexOf("|") !== -1 && mdRow(line).length === align.length) {
		      const header = mdRow(line);
		      const rows = [];
		      index += 2;
		      // Body rows run to the first blank line or pipe-less line; a row that
		      // merely looks like a separator ("| - | - |") is data, not a delimiter.
		      while (index < lines.length && !MD_BLANK.test(lines[index]) && lines[index].indexOf("|") !== -1) {
		        rows.push(mdRow(lines[index]));
		        index += 1;
		      }
		      nodes.push(
		        mdH("table", { key: mdKey("table"), className: "ia-md-table" },
		          mdH("thead", { key: mdKey("thead") },
		            mdH("tr", { key: mdKey("tr") },
		              ...header.map((cell, column) => mdH("th", { key: mdKey("th"), style: mdCellStyle(align[column]) }, ...mdInline(cell, 0))))),
		          mdH("tbody", { key: mdKey("tbody") },
		            ...rows.map((row) => mdH("tr", { key: mdKey("tr") },
		              ...row.map((cell, column) => mdH("td", { key: mdKey("td"), style: mdCellStyle(align[column]) }, ...mdInline(cell, 0))))))),
		      );
		      continue;
		    }

		    const item = MD_ITEM.exec(line);
		    if (item) {
		      const indent = item[1].length;
		      const ordered = /\d/.test(item[2]);
		      const start = ordered ? parseInt(item[2], 10) : 0;
		      const items = [];
		      while (index < lines.length) {
		        const match = MD_ITEM.exec(lines[index]);
		        if (!match) break;
		        if (match[1].length >= indent + 2) {
		          // One nesting level is all the engine emits; deeper indents fold in.
		          if (items.length === 0) break;
		          items[items.length - 1].children.push({ ordered: /\d/.test(match[2]), text: match[4] });
		        } else {
		          if (/\d/.test(match[2]) !== ordered) break;
		          items.push({ text: match[4], children: [] });
		        }
		        index += 1;
		      }
		      nodes.push(mdList(ordered, items, start));
		      continue;
		    }

		    const paragraph = [];
		    while (index < lines.length) {
		      const current = lines[index];
		      if (MD_BLANK.test(current) || MD_FENCE.test(current) || MD_HEADING.test(current) || MD_HR.test(current) || MD_QUOTE.test(current)) break;
		      if (paragraph.length > 0 && MD_ITEM.test(current)) break;
		      if (index + 1 < lines.length && current.indexOf("|") !== -1) {
		        const next = mdAlignRow(lines[index + 1]);
		        if (next !== null && mdRow(current).length === next.length) break;
		      }
		      paragraph.push(current);
		      index += 1;
		    }
		    if (paragraph.length === 0) {
		      // Never stall: an unrecognised line is emitted as paragraph text.
		      paragraph.push(lines[index]);
		      index += 1;
		    }
		    nodes.push(mdH("p", { key: mdKey("p"), className: "ia-md-p" }, ...mdInlineLines(paragraph)));
		  }
		  return nodes;
		};

		/** Markdown text → a single <div class="ia-md"> element (or null when empty). */
		const renderMarkdown = (text) => {
		  try {
		    if (text === null || text === undefined) return null;
		    let source = typeof text === "string" ? text : String(text);
		    if (source.trim() === "") return null;
		    if (source.length > MD_MAX_CHARS) source = source.slice(0, MD_MAX_CHARS) + mdTruncated();
		    source = source.replace(/\r\n?/g, "\n");
		    return mdH("div", { className: "ia-md" }, ...mdBlocks(source.split("\n"), 0));
		  } catch (error) {
		    return mdH("div", { className: "ia-md" }, mdH("p", { className: "ia-md-p" }, String(text)));
		  }
		};
		/* MARKDOWN:END */
		const css = ".ia-shell{display:flex;flex-direction:column;height:100%;min-width:0;background:var(--dsw-alias-bg-base)}.ia-topbar{flex:none;display:flex;align-items:center;gap:4px;height:48px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}.ia-brand{display:flex;align-items:center;gap:8px;margin-right:16px;font-size:var(--ia-fs-body);font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}.ia-brandmark{width:22px;height:22px;border-radius:var(--ia-r-sm);background:linear-gradient(135deg,var(--ia-brandmark-from),var(--ia-brandmark-to));color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:var(--ia-fs-caption);font-weight:700;flex:none}.ia-nav{display:flex;align-items:center;gap:2px}.ia-navbtn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--ia-fs-body-sm);line-height:20px;padding:6px 12px;border-radius:var(--ia-r-btn);cursor:pointer}.ia-navbtn:hover{background:var(--ia-hover);color:var(--dsw-alias-label-primary)}.ia-navbtn[data-active=true]{background:var(--ia-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}.ia-body{flex:1;min-height:0;display:flex;position:relative}.ia-sidebar{flex:none;width:264px;display:flex;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));min-width:0}.ia-sidebar-scroll{flex:1;min-height:0;overflow-y:auto;padding:8px}.ia-newbtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);background:var(--ia-surface-chip);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-body-sm);line-height:20px;padding:8px;cursor:pointer;margin-bottom:8px}.ia-newbtn:hover{background:var(--ia-hover)}.ia-search{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-btn);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:6px 10px;margin-bottom:8px;outline:none}.ia-search:focus{border-color:var(--dsw-alias-brand-primary)}.ia-session{display:flex;align-items:center;gap:8px;border-radius:var(--ia-r-btn);padding:7px 8px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:var(--ia-fs-body-sm);line-height:20px;margin-bottom:2px;min-width:0}.ia-session:hover{background:var(--ia-hover);color:var(--dsw-alias-label-primary)}.ia-session[data-active=true]{background:var(--ia-hover-solid);color:var(--dsw-alias-label-primary);font-weight:500}.ia-session-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ia-session-actions{flex:none;display:none;gap:2px}.ia-session:hover .ia-session-actions{display:flex}.ia-session-actions button{border:none;background:transparent;color:var(--ia-label-3);font-size:var(--ia-fs-caption);line-height:16px;padding:2px 5px;border-radius:var(--ia-r-sm);cursor:pointer}.ia-session-actions button:hover{background:var(--ia-hover);color:var(--dsw-alias-label-primary)}.ia-empty{color:var(--ia-label-3);font-size:var(--ia-fs-caption);line-height:18px;padding:16px 8px;text-align:center}.ia-center{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}.ia-details{flex:none;width:340px;border-left:1px solid var(--dsw-alias-border-l2);overflow-y:auto;background:var(--dsw-alias-bg-base)}.ia-page{flex:1;min-width:0;overflow-y:auto;padding:16px 20px}.ia-page-title{font-size:var(--ia-fs-h3);font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 4px}.ia-page-sub{color:var(--ia-label-3);font-size:var(--ia-fs-body-sm);margin:0 0 16px}.ia-card{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface-chip);box-shadow:var(--ia-shadow-sm);padding:14px 16px;margin-bottom:12px}.ia-card h3{margin:0 0 8px;font-size:var(--ia-fs-body-sm);font-weight:600;color:var(--dsw-alias-label-primary)}.ia-kv{display:flex;justify-content:space-between;font-size:var(--ia-fs-body-sm);line-height:24px;color:var(--dsw-alias-label-secondary);border-bottom:1px dashed var(--dsw-alias-border-l2)}.ia-kv:last-child{border-bottom:none}.ia-kv b{color:var(--dsw-alias-label-primary);font-weight:600}.ia-chip{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-btn);padding:2px 8px;font-size:var(--ia-fs-caption);line-height:18px;color:var(--dsw-alias-label-secondary);margin-right:6px}.ia-chip[data-kind=ok]{border-color:var(--ia-ok);color:var(--ia-ok-text)}.ia-chip[data-kind=warn]{border-color:var(--ia-warn);color:var(--ia-warn-text)}.ia-chip[data-kind=danger]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.ia-settings{flex:1;min-width:0;display:flex;overflow:hidden}.ia-settings-nav{flex:none;width:200px;border-right:1px solid var(--dsw-alias-border-l1);padding:12px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.ia-settings-nav button{border:none;background:transparent;text-align:left;font:inherit;font-size:var(--ia-fs-body-sm);line-height:20px;color:var(--dsw-alias-label-secondary);padding:8px 12px;border-radius:var(--ia-r-btn);cursor:pointer}.ia-settings-nav button:hover{background:var(--ia-hover)}.ia-settings-nav button[data-active=true]{background:var(--ia-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}.ia-settings-content{flex:1;min-width:0;overflow-y:auto;padding:16px 20px}.ia-form-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-form-row:last-child{border-bottom:none}.ia-form-label{font-size:var(--ia-fs-body-sm);color:var(--dsw-alias-label-primary)}.ia-form-hint{font-size:var(--ia-fs-caption);color:var(--ia-label-3);margin-top:2px}.ia-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;border-radius:var(--ia-r-btn);padding:6px 10px;outline:none;min-width:180px}.ia-input:focus{border-color:var(--dsw-alias-brand-primary)}.ia-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-btn);background:var(--ia-surface-chip);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:6px 12px;cursor:pointer}.ia-btn:hover{background:var(--ia-hover)}.ia-btn[data-kind=primary]{background:var(--ia-accent);color:var(--ia-accent-fg);border-color:transparent}.ia-btn[data-kind=primary]:hover:not(:disabled){background:var(--ia-accent-hover)}.ia-btn:disabled{opacity:.45;cursor:default}.ia-notice{font-size:var(--ia-fs-caption);line-height:18px;padding:8px 10px;border-radius:var(--ia-r-btn);margin-top:10px}.ia-notice[data-kind=ok]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}.ia-notice[data-kind=err]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}.ia-table{width:100%;border-collapse:collapse;font-size:var(--ia-fs-caption);line-height:20px}.ia-table th{text-align:left;color:var(--ia-label-3);font-weight:500;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-table td{padding:4px 8px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-table tr:last-child td{border-bottom:none}";
		const productCss = [
			".ia-shell{display:grid;grid-template-columns:88px minmax(0,1fr);height:100%;min-width:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}",
			".ia-rail{min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:16px 9px 12px;border-right:1px solid rgba(255,255,255,.07);background:var(--ia-rail-bg);color:var(--ia-rail-text)}",
			".ia-rail-brand{width:42px;height:42px;margin:0 auto 16px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 60%,#1E3A8A 100%);color:#fff;font-size:var(--ia-fs-body-sm);font-weight:700;box-shadow:0 10px 22px -8px rgba(43,120,255,.9),inset 0 1px 0 rgba(255,255,255,.35)}",
			".ia-rail-nav{display:flex;flex-direction:column;gap:6px}.ia-rail-spacer{flex:1}",
			".ia-navbtn{position:relative;min-height:58px;border:0;background:transparent;color:#8E99AC;font:inherit;font-size:var(--ia-fs-caption);line-height:16px;letter-spacing:.3px;padding:8px 4px;border-radius:14px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;white-space:nowrap;transition:background .28s var(--ia-ease-out),color .28s var(--ia-ease-out),transform .28s var(--ia-ease-out),box-shadow .28s var(--ia-ease-out)}",
			".ia-navbtn>*{position:relative;z-index:1}",
			".ia-navbtn:hover{background:rgba(255,255,255,.06);color:#E7EDF8}.ia-navbtn:hover .ia-icon{color:#E7EDF8}",
			".ia-navbtn:active{transform:scale(.985)}",
			".ia-navbtn[data-active=true]{color:#fff;font-weight:600;transform:translateY(-1px);background:linear-gradient(160deg,#2563EB 0%,#1D4ED8 50%,#12275F 100%);box-shadow:0 1px 2px rgba(0,0,0,.35),0 2px 10px -3px rgba(40,110,255,.35),0 12px 28px -14px rgba(40,110,255,.45),inset 0 1px 0 rgba(255,255,255,.10)}",
			".ia-navbtn[data-active=true] .ia-icon{color:#fff;filter:drop-shadow(0 0 5px rgba(120,170,255,.55))}",

			/* ── assistant: status strip + context drawer (demo layout) ── */
			".ia-assist{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}",
			".ia-assist-strip{flex:none;display:flex;align-items:center;gap:14px;height:46px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--ia-label-2);font-size:12px;white-space:nowrap;overflow:hidden}",
			".ia-assist-item{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis}",
			".ia-assist-item b{font-weight:600;color:var(--dsw-alias-label-primary);max-width:190px;overflow:hidden;text-overflow:ellipsis}",
			".ia-assist-sep{width:1px;height:14px;flex:none;background:var(--dsw-alias-border-l2)}",
			".ia-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--ia-ok)}",
			".ia-dot[data-kind=warn]{background:var(--ia-warn)}.ia-dot[data-kind=danger]{background:var(--ia-danger)}",
			".ia-assist-ctx{margin-left:auto;flex:none;height:30px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-full);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;transition:background-color .2s ease,color .2s ease,border-color .2s ease}",
			".ia-assist-ctx:hover{background:var(--ia-hover)}",
			".ia-assist-ctx[aria-pressed=true]{border-color:transparent;background:var(--ia-grad-primary);color:#fff}",
			".ia-assist-body{display:flex;flex:1;min-height:0;position:relative}",
			".ia-ctx-drawer{position:absolute;top:10px;right:10px;bottom:10px;width:min(380px,calc(100% - 20px));z-index:20;display:flex;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:var(--ia-shadow-lg);overflow:hidden}",
			".ia-ctx-drawer .ia-context{width:100%;border-left:0;flex:1}",
			".ia-ctx-drawer .ia-context-row>span{white-space:nowrap}",
			/* ── settings: single column + right anchor rail (demo layout) ── */
			".ia-settings{flex-direction:row-reverse}",
			".ia-settings-nav{width:196px;border-right:0;border-left:1px solid var(--dsw-alias-border-l1);padding:18px 10px;gap:2px;align-self:flex-start;position:sticky;top:0;background:transparent}",
			".ia-settings-nav button{border:0;background:transparent;text-align:left;font:inherit;font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;color:var(--ia-label-3);border-left:2px solid transparent}",
			".ia-settings-nav button:hover{background:var(--ia-hover);color:var(--dsw-alias-label-primary)}",
			".ia-settings-nav button[data-active=true]{background:transparent;color:var(--ia-accent-text);font-weight:600;border-left-color:var(--ia-accent)}",
			".ia-settings-content{padding:20px 26px;display:flex;flex-direction:column;gap:18px}",
			".ia-set-section{padding:18px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface);box-shadow:var(--ia-shadow-xs);scroll-margin-top:16px}",
			".ia-set-title{margin:0 0 12px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ia-navicon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;line-height:0}",
			".ia-icon{display:inline-flex;align-items:center;justify-content:center;line-height:0;color:currentColor}",
			".ia-icon svg{display:block}",
			/* ── motion & interaction layer ─────────────────────────────── */
			"@keyframes ia-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
			"@keyframes ia-draw{to{stroke-dashoffset:0}}",
			".ia-an-panel,.ia-db-panel,.ia-db-metric,.ia-research-side>.ia-an-panel{animation:ia-enter .42s var(--ia-ease-out) backwards}",
			".ia-db-metrics>.ia-db-metric:nth-child(2){animation-delay:45ms}.ia-db-metrics>.ia-db-metric:nth-child(3){animation-delay:90ms}.ia-db-metrics>.ia-db-metric:nth-child(4){animation-delay:135ms}",
			"@media(hover:hover){.ia-an-panel,.ia-db-panel,.ia-db-metric,.ia-research-history{transition:transform .34s var(--ia-ease-out),box-shadow .34s var(--ia-ease-out),border-color .34s var(--ia-ease-out)}.ia-an-panel:hover,.ia-db-panel:hover,.ia-db-metric:hover{transform:translateY(-3px);box-shadow:var(--ia-shadow-md);border-color:color-mix(in srgb,var(--ia-accent) 22%,var(--dsw-alias-border-l1))}}",
			".ia-seg{position:relative}",
			".ia-seg-thumb{position:absolute;top:3px;bottom:3px;left:0;width:0;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(16,24,40,.20),0 1px 2px rgba(16,24,40,.12);pointer-events:none;z-index:0;transition:transform .34s var(--ia-ease-out),width .34s var(--ia-ease-out)}",
			".ia-seg>button{position:relative;z-index:1}",
			".ia-seg>button[aria-pressed=true],.ia-seg>button[data-active=true]{background:transparent!important;box-shadow:none!important}",
			".ia-tabs-ink{position:absolute;bottom:-1px;height:2px;border-radius:2px;background:var(--ia-accent);pointer-events:none;z-index:1;transition:transform .32s var(--ia-ease-out),width .32s var(--ia-ease-out)}",
			"@media(prefers-reduced-motion:reduce){.ia-an-panel,.ia-db-panel,.ia-db-metric,.ia-navbtn,.ia-seg-thumb,.ia-tabs-ink,.ia-an-progress-fill,.ia-an-ring-fill,.ia-an-ring::after{animation:none!important;transition:none!important}}",
			".ia-body{min-width:0;min-height:0;display:flex;position:relative;background:var(--dsw-alias-bg-base)}",
			".ia-sidebar{width:250px;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}",
			".ia-sidebar-head{height:68px;flex:none;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-sidebar-title{font-size:var(--ia-fs-body-sm);font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ia-iconbtn{width:32px;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);background:var(--ia-surface-chip);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--ia-fs-h3);line-height:28px;cursor:pointer;display:grid;place-items:center}",
			".ia-iconbtn:hover{border-color:var(--ia-rail-accent);color:var(--ia-rail-accent-ink);background:var(--ia-hover)}",
			".ia-sidebar-scroll{padding:11px}.ia-newbtn{display:none}.ia-search{height:34px;margin:0 0 12px;padding:7px 10px;border-radius:var(--ia-r-tab)}",
			".ia-session-group{padding:5px 7px;color:var(--ia-label-3);font-size:var(--ia-fs-micro);letter-spacing:.04em}",
			".ia-session{min-height:48px;align-items:flex-start;flex-direction:column;gap:2px;padding:8px 9px;margin-bottom:3px;border-radius:var(--ia-r-tab)}",
			".ia-session[data-active=true]{background:color-mix(in srgb,var(--ia-rail-accent) 13%,var(--ia-surface-chip));font-weight:500}",
			".ia-session-main{width:100%;display:flex;align-items:center;gap:6px;min-width:0}.ia-session-meta{font-size:var(--ia-fs-micro);color:var(--ia-label-3);font-weight:400}",
			".ia-center{background:var(--dsw-alias-bg-base)}.ia-center [data-composer-workspace],.ia-center [data-composer-mode],.ia-center [class*='_heroWorkspaceRow'],.ia-center [class*='_fishHitbox'],.ia-center [class*='_previewBadge']{display:none!important}.ia-details{width:300px}.ia-context{flex:none;width:278px;min-width:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));overflow-y:auto}",
			".ia-context-head{height:68px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-context-head strong{font-size:var(--ia-fs-body-sm);font-weight:600}.ia-context-section{padding:15px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-context-label{margin-bottom:10px;color:var(--ia-label-3);font-size:var(--ia-fs-micro);letter-spacing:.07em;text-transform:uppercase}",
			".ia-context-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:8px 0;font-size:var(--ia-fs-caption);line-height:17px;color:var(--dsw-alias-label-secondary)}",
			".ia-context-row b{color:var(--dsw-alias-label-primary);font-weight:500;text-align:right}.ia-context-note{font-size:var(--ia-fs-caption);line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".ia-context-link{width:100%;margin-top:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-btn);background:var(--ia-surface-chip);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:7px 10px;cursor:pointer}",
			".ia-context-link:hover{border-color:var(--ia-rail-accent);color:var(--ia-rail-accent-ink)}.ia-context-reopen{position:absolute;right:12px;top:12px;z-index:4}",
			".ia-page{padding:0;background:var(--dsw-alias-bg-base)}.ia-page-head{height:68px;padding:0 26px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-page-head-copy{min-width:0}.ia-page-title{font-size:var(--ia-fs-h3);font-weight:600;margin:0}.ia-page-sub{font-size:var(--ia-fs-caption);margin:4px 0 0}",
			".ia-page-status{display:inline-flex;align-items:center;gap:7px;color:var(--ia-label-3);font-size:var(--ia-fs-caption);white-space:nowrap}.ia-page-status-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}.ia-page-status[data-kind=error] .ia-page-status-dot{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}.ia-page-status[data-kind=warn] .ia-page-status-dot{background:var(--ia-warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--ia-warn) 12%,transparent)}",
			".ia-page-content{padding:22px 26px 28px;max-width:1500px;margin:0 auto}.ia-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:14px;align-items:stretch}",
			/* KPI card: a full grid cell has to compose across its whole width, or
			   the right half reads as dead space. Top accent, label, a large value,
			   then the detail pinned to the bottom edge with margin-top:auto so all
			   four cards line up regardless of which one has the longest text. */
			".ia-kpi{position:relative;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface-chip);padding:18px 20px 16px;box-shadow:var(--ia-shadow-sm);min-height:118px}.ia-kpi::before{content:'';position:absolute;inset:0 0 auto 0;height:3px;border-radius:var(--ia-r-card) var(--ia-r-card) 0 0;background:var(--ia-grad-primary)}.ia-kpi-label{font-size:var(--ia-fs-body-sm);font-weight:500;color:var(--ia-label-3)}.ia-kpi-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.ia-kpi-top .ia-kpi-value{margin-top:0}",
			".ia-kpi-value{margin-top:auto;font-size:var(--ia-fs-h1);line-height:1.05;font-weight:700;color:var(--dsw-alias-label-primary);letter-spacing:-.02em;font-family:var(--ia-font-num);font-variant-numeric:tabular-nums}.ia-kpi-foot{margin-top:auto;padding-top:10px;color:var(--ia-label-3);font-size:var(--ia-fs-body-sm);line-height:1.45}",
			".ia-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.7fr);gap:14px}.ia-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface-chip);box-shadow:var(--ia-shadow-sm);overflow:hidden}",
			".ia-panel-head{padding:15px 17px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.ia-panel-head h3{margin:0;font-size:var(--ia-fs-body-sm);font-weight:600}.ia-panel-head span{color:var(--ia-label-3);font-size:var(--ia-fs-micro)}",
			".ia-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border-top:1px solid var(--dsw-alias-border-l1)}",
			".ia-market{padding:15px 17px;background:var(--ia-surface-chip)}.ia-market-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;font-size:var(--ia-fs-caption)}",
			".ia-market-badge{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:25px;padding:0 7px;border-radius:var(--ia-r-btn);background:color-mix(in srgb,var(--ia-rail-accent) 13%,var(--ia-surface-chip));color:var(--ia-rail-accent-ink);font-size:var(--ia-fs-micro);font-weight:600}",
			".ia-market-value{font-size:var(--ia-fs-h3);font-weight:600}.ia-market-meta{display:flex;justify-content:space-between;gap:8px;margin-top:5px;color:var(--ia-label-3);font-size:var(--ia-fs-micro)}",
			".ia-agenda{padding:0 17px 10px}.ia-agenda-item{display:grid;grid-template-columns:29px minmax(0,1fr);gap:10px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}",
			".ia-agenda-icon{width:28px;height:28px;border-radius:var(--ia-r-btn);display:grid;place-items:center;background:color-mix(in srgb,var(--ia-rail-accent) 13%,var(--ia-surface-chip));color:var(--ia-rail-accent-ink);font-size:var(--ia-fs-body-sm)}",
			".ia-agenda-title{font-size:var(--ia-fs-caption);color:var(--dsw-alias-label-primary)}.ia-agenda-meta{margin-top:3px;font-size:var(--ia-fs-micro);line-height:16px;color:var(--ia-label-3)}",
			".ia-report-list{margin:0;padding:0;list-style:none}.ia-report-list li{padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:var(--ia-fs-caption);line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-all}",
			".ia-flow-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px}.ia-flow-map{padding:19px}.ia-flow-map-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px}",
			".ia-flow-map-title h3{margin:0;font-size:var(--ia-fs-body-sm);font-weight:600}.ia-flow-map-title p{margin:4px 0 0;color:var(--ia-label-3);font-size:var(--ia-fs-micro);line-height:16px}",
			".ia-flow-pill{display:inline-flex;padding:4px 8px;border-radius:var(--ia-r-full);background:color-mix(in srgb,var(--ia-rail-accent) 13%,var(--ia-surface-chip));color:var(--ia-rail-accent-ink);font-size:var(--ia-fs-micro);white-space:nowrap}",
			".ia-flow-band{display:grid;grid-template-columns:108px minmax(0,1fr);gap:12px;padding:11px 0;border-top:1px solid var(--dsw-alias-border-l2)}.ia-flow-label{padding-top:7px;color:var(--ia-label-3);font-size:var(--ia-fs-micro)}",
			".ia-flow-nodes{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.ia-flow-node{min-width:86px;padding:8px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-btn);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));font-size:var(--ia-fs-micro);text-align:center}",
			".ia-flow-node[data-kind=primary]{border-color:color-mix(in srgb,var(--ia-rail-accent) 55%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--ia-rail-accent) 11%,var(--ia-surface-chip));color:var(--ia-rail-accent-ink)}.ia-flow-node[data-kind=guard]{border-color:var(--ia-warn);color:var(--ia-warn-text)}",
			".ia-flow-arrow{color:var(--ia-label-3);font-size:var(--ia-fs-caption)}.ia-flow-side{display:flex;flex-direction:column;gap:14px}.ia-flow-side .ia-panel{padding:16px}.ia-flow-side h3{margin:0 0 12px;font-size:var(--ia-fs-body-sm);font-weight:600}",
			".ia-flow-warning{padding:11px 12px;border-radius:var(--ia-r-tab);background:color-mix(in srgb,var(--ia-warn) 11%,transparent);color:var(--dsw-alias-label-secondary);font-size:var(--ia-fs-micro);line-height:17px}",
			".ia-flow-check{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:var(--ia-fs-micro)}.ia-flow-check-num{width:19px;height:19px;display:grid;place-items:center;border-radius:var(--ia-r-sm);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));color:var(--ia-label-3);font-size:var(--ia-fs-micro)}.ia-flow-check-state{color:var(--ia-label-3)}",
			".ia-settings-page{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}.ia-settings-page .ia-settings{flex:1;min-height:0}.ia-settings{background:var(--dsw-alias-bg-base)}.ia-settings-nav{width:218px;padding:14px 10px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}.ia-settings-nav button{padding:9px 11px;border-radius:var(--ia-r-tab)}.ia-settings-content{padding:24px 28px;max-width:1100px}",
			".ia-card{border-radius:var(--ia-r-card)}.ia-form-row{padding:14px 0}.ia-context-chip{display:inline-flex;align-items:center;padding:3px 7px;border-radius:var(--ia-r-btn);background:color-mix(in srgb,var(--ia-rail-accent) 12%,var(--ia-surface-chip));color:var(--ia-rail-accent-ink);font-size:var(--ia-fs-micro)}",
			"@media(max-width:1180px){.ia-context{display:none}.ia-flow-grid{grid-template-columns:1fr}.ia-flow-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}",
			"@media(max-width:900px){.ia-shell{grid-template-columns:72px minmax(0,1fr)}.ia-sidebar{width:220px}.ia-navbtn{font-size:var(--ia-fs-micro)}.ia-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-dashboard-grid{grid-template-columns:1fr}.ia-page-content{padding:18px}.ia-page-head{padding:0 18px}}",
			// ── 分析中心 ──────────────────────────────────────────────────
			// 主题 token 已统一迁到 styles/tokens 那一层（见 tokenCss）：它是唯一
			// 定义 --ia-* 别名的位置。这里原来重复定义同一批别名，且 fallback 用
			// transparent —— 而 CSS 自定义属性是“先定义者胜”，它反而把 token 层
			// 的取值盖掉了，导致 --ia-surface 解析为透明。故删除，仅保留规则。
			".ia-notice[data-kind=warn]{color:var(--ia-warn-text);background:color-mix(in srgb,var(--ia-warn) 12%,transparent)}",
			// ── 分析中心：ia-an-* 组件 ──────────────────────────────────────
			// 外层严格按规格 360px + minmax(0,1fr)；中间列内部再切「流程 | 报告」，
			// 这样既保持规格里的两轨栅格，又得到三栏观感。
			".ia-an-grid{display:grid;grid-template-columns:360px minmax(0,1fr);gap:14px;align-items:start}",
			".ia-an-main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;align-items:start;min-width:0}",
			".ia-an-col{display:flex;flex-direction:column;gap:14px;min-width:0}",
			".ia-an-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface);padding:14px 16px;min-width:0}",
			".ia-an-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}",
			".ia-an-panel-head h3{margin:0;font-size:var(--ia-fs-body-sm);font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ia-an-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}",
			".ia-an-lab{font-size:var(--ia-fs-caption);color:var(--ia-label-3)}",
			".ia-an-input,.ia-an-select,.ia-an-area{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:7px 9px}",
			".ia-an-area{min-height:86px;resize:vertical;font-family:ui-monospace,Consolas,monospace}",
			".ia-an-input:focus,.ia-an-select:focus,.ia-an-area:focus{outline:none;border-color:var(--ia-brand)}",
			".ia-an-seg{display:flex;gap:4px;padding:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);background:var(--dsw-alias-bg-layer-1,transparent)}",
			".ia-an-seg button{flex:1;min-width:0;border:0;border-radius:var(--ia-r-btn);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:5px 6px;cursor:pointer}",
			".ia-an-seg button:hover{background:var(--ia-hover)}",
			".ia-an-seg button[data-active=true]{background:var(--ia-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}",
			".ia-an-note{font-size:var(--ia-fs-micro);line-height:16px;color:var(--ia-label-3)}",
			".ia-an-check{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;align-items:start;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:var(--ia-fs-caption);line-height:17px;color:var(--dsw-alias-label-secondary)}",
			".ia-an-check:first-child{border-top:none}",
			".ia-an-check-mark{font-size:var(--ia-fs-caption);line-height:17px;font-weight:700}",
			".ia-an-check[data-ok=true] .ia-an-check-mark{color:var(--ia-ok-text)}",
			".ia-an-check[data-ok=false] .ia-an-check-mark{color:var(--ia-warn-text)}",
			/* One-click entries: identical box, identical states. The primary action
			   (全流程) carries the gradient, the other two are outlined; all three
			   are the same size so the row reads as one control group. */
			".ia-an-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}",
			".ia-an-quickbtn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--ia-fs-body-sm);font-weight:600}",
			".ia-an-quickbtn:first-child{background:var(--ia-grad-primary);border-color:transparent;color:#fff}",
			".ia-an-quickbtn:first-child:hover:not(:disabled){filter:brightness(1.06)}",
			"@media(max-width:1180px){.ia-an-quick{grid-template-columns:1fr}}",
			/* Collapsed pre-flight: one line that always explains a disabled entry. */
			".ia-an-preflight{display:flex;align-items:center;gap:8px;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-btn);background:var(--ia-surface-chip);cursor:pointer;font:inherit;font-size:var(--ia-fs-body-sm);color:var(--dsw-alias-label-secondary);text-align:left}",
			".ia-an-preflight-mark{display:grid;place-items:center;width:18px;height:18px;border-radius:var(--ia-r-full);font-size:var(--ia-fs-caption);font-weight:700;flex:none}",
			".ia-an-preflight[data-ok=true] .ia-an-preflight-mark{background:color-mix(in srgb,var(--ia-ok) 18%,transparent);color:var(--ia-ok-text)}",
			".ia-an-preflight[data-ok=false] .ia-an-preflight-mark{background:color-mix(in srgb,var(--ia-warn) 20%,transparent);color:var(--ia-warn-text)}",
			".ia-an-preflight[data-ok=false]{border-color:color-mix(in srgb,var(--ia-warn) 45%,var(--dsw-alias-border-l2))}",
			".ia-an-preflight-caret{margin-left:auto;font-size:var(--ia-fs-caption);color:var(--ia-label-3)}",
			".ia-an-preflight-list{margin-top:2px;padding:2px 12px 6px}",
			".ia-an-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}",
			".ia-an-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);background:var(--ia-surface);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-caption);line-height:18px;padding:7px 8px;cursor:pointer}",
			".ia-an-btn:hover:not(:disabled){background:var(--ia-hover)}",
			".ia-an-btn:disabled{opacity:.45;cursor:not-allowed}",
			".ia-an-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-tab);overflow:hidden;margin-bottom:12px}",
			".ia-an-kpi{padding:10px 12px;background:var(--ia-surface);min-width:0}",
			".ia-an-kpi span{display:block;font-size:var(--ia-fs-micro);color:var(--ia-label-3)}",
			".ia-an-kpi b{display:block;margin-top:4px;font-size:var(--ia-fs-body);font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all}",
			".ia-an-stage{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:center;padding:16px 0;border-top:1px solid var(--dsw-alias-border-l2)}",
			".ia-an-stage:first-child{border-top:none}",
			".ia-an-stage-dot{width:36px;height:36px;border-radius:var(--ia-r-btn);display:grid;place-items:center;font-size:var(--ia-fs-caption);background:var(--ia-hover);color:var(--ia-label-3)}",
			".ia-an-stage[data-status=running] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-accent) 16%,transparent);color:var(--ia-accent-text)}",
			".ia-an-stage[data-status=completed] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-ok) 16%,transparent);color:var(--ia-ok-text)}",
			".ia-an-stage[data-status=failed] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-danger) 16%,transparent);color:var(--ia-danger-text)}",
			".ia-an-stage-name{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".ia-an-stage-meta{margin-top:3px;font-size:var(--ia-fs-micro);line-height:16px;color:var(--ia-label-3);word-break:break-all}",
			".ia-an-stage-time{font-size:var(--ia-fs-caption);color:var(--ia-label-3);text-align:right;white-space:nowrap}",
			".ia-an-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:9px;margin-top:12px}",
			".ia-an-agent{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--ia-r-tab);padding:9px 10px;background:var(--dsw-alias-bg-base);min-width:0}",
			".ia-an-agent[data-status=failed]{border-color:var(--ia-danger)}",
			".ia-an-agent[data-status=completed]{border-color:color-mix(in srgb,var(--ia-ok) 45%,var(--dsw-alias-border-l2))}",
			".ia-an-agent-head{display:flex;align-items:center;justify-content:space-between;gap:6px}",
			".ia-an-agent-label{font-size:var(--ia-fs-caption);font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all;min-width:0}",
			".ia-an-agent-meta{margin-top:5px;font-size:var(--ia-fs-micro);line-height:15px;color:var(--ia-label-3)}",
			".ia-an-agent-body{margin-top:5px;font-size:var(--ia-fs-micro);line-height:15px;color:var(--dsw-alias-label-secondary);max-height:64px;overflow:auto;white-space:pre-wrap;word-break:break-word}",
			".ia-an-agent[data-status=failed] .ia-an-agent-body{color:var(--ia-danger-text)}",
			".ia-an-log{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}",
			".ia-an-log-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--ia-fs-caption);color:var(--ia-label-3);min-width:0}",
			".ia-an-log-body{margin-top:8px;max-height:240px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:var(--ia-fs-micro);line-height:16px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}",
			".ia-an-report-list{margin:0;padding:0;list-style:none;max-height:280px;overflow-y:auto}",
			".ia-an-report-item{width:100%;text-align:left;border:1px solid transparent;border-radius:var(--ia-r-tab);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;padding:8px 9px;cursor:pointer;display:block}",
			".ia-an-report-item:hover{background:var(--ia-hover)}",
			".ia-an-report-item[data-active=true]{border-color:var(--ia-brand);background:var(--ia-hover-solid)}",
			".ia-an-report-title{font-size:var(--ia-fs-caption);color:var(--dsw-alias-label-primary);word-break:break-all}",
			".ia-an-report-meta{margin-top:3px;font-size:var(--ia-fs-micro);color:var(--ia-label-3)}",
			/* Now a scroller around rendered Markdown rather than a <pre> holding raw
			   source: keep the height cap and scrolling, drop the monospace/pre-wrap
			   typography (the .ia-md-* rules own the prose). */
			".ia-an-report-body{margin:10px 0 0;padding:11px;border-radius:var(--ia-r-tab);background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2);max-height:420px;overflow:auto}",
			/* ── progress: circular stage ring + round bar ─────────────────── */
			".ia-an-ring{position:relative;width:50px;height:50px;display:inline-grid;place-items:center;flex:none}",
			".ia-an-ring svg{display:block;transform:rotate(-90deg)}",
			".ia-an-ring-track{stroke:var(--ia-border-subtle)}",
			/* Only the dash offset and the stroke colour change, so a stage row never
			   reflows while its ring fills. */
			".ia-an-ring-fill{transition:stroke-dashoffset var(--ia-dur-slow) var(--ia-ease-out),stroke var(--ia-dur-fast) var(--ia-ease-out)}",
			".ia-an-ring-mark{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;font-weight:600;line-height:1;letter-spacing:-.02em;font-family:var(--ia-font-num);font-variant-numeric:tabular-nums;color:var(--ia-text-3)}",
			".ia-an-ring[data-kind=ok] .ia-an-ring-mark{color:var(--ia-ok-text)}",
			".ia-an-ring[data-kind=danger] .ia-an-ring-mark{color:var(--ia-danger-text)}",
			".ia-an-ring[data-kind=accent] .ia-an-ring-mark{color:var(--ia-accent-text)}",
			/* A running stage breathes; reduced-motion below freezes it and the ring
			   plus the textual status still carry the state. */
			"/* A running stage eases forward instead of spinning: the ring fill follows */",
			"/* an estimated elapsed fraction and transitions smoothly. */",
			".ia-an-ring[data-status=running] .ia-an-ring-fill{transition:stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)}",
			".ia-an-ring[data-status=running]::after{content:'';position:absolute;inset:-2px;border-radius:50%;border:2px solid color-mix(in srgb,var(--ia-accent) 30%,transparent);opacity:.3;animation:ia-ring-breathe 4.6s ease-in-out infinite;pointer-events:none}",
			"@keyframes ia-ring-breathe{0%,100%{opacity:.22;transform:scale(.97)}50%{opacity:.65;transform:scale(1.03)}}",
			".ia-an-progress{margin:8px 0 2px}",
			".ia-an-progress-track{height:6px;border-radius:var(--ia-r-full);background:var(--ia-border-subtle);overflow:hidden}",
			".ia-an-progress-fill{height:100%;border-radius:var(--ia-r-full);background:var(--ia-grad-primary);transform-origin:left center;transform:scaleX(0);transition:transform var(--ia-dur-slow) var(--ia-ease-out)}",
			".ia-an-progress[data-state=failed] .ia-an-progress-fill{background:var(--ia-danger)}",
			".ia-an-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:5px;font-size:var(--ia-fs-micro);line-height:15px;color:var(--ia-label-3)}",
			".ia-an-pulse{width:7px;height:7px;border-radius:var(--ia-r-full);background:var(--ia-accent);animation:ia-pulse var(--ia-dur-page) var(--ia-ease-in-out) infinite alternate}",
			"@keyframes ia-pulse{from{opacity:.35;transform:scale(.8)}to{opacity:1;transform:scale(1.15)}}",
			/* ── analysis board stays put ──────────────────────────────────── */
			/* The progress board is the thing a user watches for minutes, so it must
			   not scroll away while they read the stage list or the subagent list
			   below it. Sticking it inside the panel keeps it visible for the whole
			   panel, and the textual status stays in the KPIs above for anyone who
			   cannot see the ring. */
			".ia-an-board{position:sticky;top:0;z-index:var(--ia-z-sticky);background:var(--ia-surface);padding-bottom:6px}",
			".ia-research-toolbar,.ia-research-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px}.ia-research-heading h2{font-size:calc(var(--ia-fs-body) * 1.25);margin:0 0 6px}.ia-research-controls{display:flex;gap:8px;flex-wrap:wrap}",
			".ia-research-grid{display:grid;grid-template-columns:284px minmax(0,1fr);gap:18px;align-items:start}.ia-research-workspace{min-width:0}.ia-research-side{display:flex;flex-direction:column;gap:14px;position:sticky;top:12px}.ia-research-history{position:sticky;top:12px}.ia-research-rounds{max-height:65vh;overflow:auto}.ia-research-rounds .ia-an-report-item{margin:5px 0}",
			".ia-research-actions .ia-an-panel-head{margin-bottom:12px}.ia-research-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.ia-research-chips .ia-chip{margin-right:0;padding:3px 10px;border-radius:var(--ia-r-full);background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:var(--ia-fs-caption)}",
			".ia-research-action-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ia-research-action-btns .ia-an-btn{justify-content:center}",
			".ia-research-primary{grid-column:1/-1;background:var(--ia-grad-primary);border-color:transparent;color:#fff}.ia-research-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--ia-grad-primary)}",
			".ia-research-tabs{position:relative;display:flex;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:16px}.ia-research-tabs button[aria-selected=true]{background:transparent!important;border-color:transparent!important;color:var(--ia-accent-text);font-weight:600}",
			".ia-tabs>.ia-seg-thumb{top:auto;bottom:-1px;height:2px;border-radius:2px;background:var(--ia-accent);box-shadow:none}",
			".ia-research-page .ia-an-report-body{max-height:none;overflow:visible}.ia-research-page .ia-an-board{position:static}.ia-an-role-groups details{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}.ia-an-role-groups summary{cursor:pointer;font-size:var(--ia-fs-body-sm)}.ia-an-evidence-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--ia-fs-caption)}",
			".ia-an-drawer{box-sizing:border-box;width:min(590px,calc(100% - 32px));max-height:calc(100vh - 48px);margin:24px 24px 24px auto;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface);color:var(--dsw-alias-label-primary);box-shadow:var(--ia-shadow-lg);overflow:auto}.ia-an-drawer::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 25%,transparent)}.ia-an-drawer .ia-an-start{position:static}.ia-an-drawer h2{font-size:calc(var(--ia-fs-body) * 1.25);margin:0}",
			".ia-an-lookup{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}.ia-an-stock-option{display:flex;justify-content:space-between;gap:10px;text-align:left;width:100%;padding:9px;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--ia-surface);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--ia-fs-body-sm);cursor:pointer;flex-wrap:wrap}.ia-an-stock-option:hover,.ia-an-stock-option[aria-selected=true]{background:var(--ia-hover-solid)}.ia-an-catalog{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}",
			"@media(max-width:850px){.ia-research-grid{grid-template-columns:minmax(0,1fr)}.ia-research-history{position:static}.ia-research-rounds{max-height:220px}.ia-an-drawer{margin:16px auto}.ia-research-controls{width:100%}.ia-an-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}",
			/* The start panel carries the three entries; on a tall page it would
			   otherwise scroll off exactly when a long-running action makes the
			   user want to look at it again. */
			".ia-an-start{position:sticky;top:12px;align-self:start}",
			"@media(max-height:760px){.ia-an-start{position:static}}",
			/* ── dashboard: vertical market cards + holdings ─────────────────── */
			/* Four narrow columns instead of two wide ones. The wide cards spent
			   their whole right half on nothing while squeezing the numbers into a
			   small left-aligned cluster; a tall column gives each figure room and
			   lets value / P&L / cash stack where the eye expects them. */
			".ia-market-grid{grid-template-columns:repeat(4,minmax(0,1fr))}",
			"@media(max-width:1180px){.ia-market-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}",
			".ia-market{display:flex;flex-direction:column;gap:2px}",
			".ia-market-hold{font-size:var(--ia-fs-caption);color:var(--ia-label-3)}",
			/* The up/down colour follows the market's own convention, so it is set
			   here from data-kind rather than by reusing the global ok/danger
			   semantics (which mean healthy/unhealthy everywhere else). */
			".ia-market-pnl{display:flex;align-items:baseline;gap:8px;font-size:var(--ia-fs-body-sm);font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}",
			/* Trend colour, per market convention. `data-red-up=true` means "this
			   market quotes a RISE in red" (mainland China, Hong Kong); the US and
			   anything else uses green-up. Note the axes are independent: A-share
			   up renders red while its severity token would be "danger", which is
			   why this does not reuse ok/danger -- doing so made a loss and a gain
			   swap meanings depending on the market. */
			".ia-market-pnl[data-trend=up],.ia-trend[data-trend=up]{color:var(--ia-ok-text)}",
			".ia-market-pnl[data-trend=down],.ia-trend[data-trend=down]{color:var(--ia-danger-text)}",
			".ia-market-pnl[data-trend=flat],.ia-trend[data-trend=flat]{color:var(--ia-label-3)}",
			".ia-market-pnl[data-red-up=true][data-trend=up],.ia-trend[data-red-up=true][data-trend=up]{color:var(--ia-danger-text)}",
			".ia-market-pnl[data-red-up=true][data-trend=down],.ia-trend[data-red-up=true][data-trend=down]{color:var(--ia-ok-text)}",
			".ia-market-kv{display:flex;flex-direction:column;gap:3px;margin-top:10px;font-size:var(--ia-fs-body-sm);color:var(--ia-label-3)}",
			".ia-market-kv span{display:flex;justify-content:space-between;gap:6px}",
			".ia-market-kv b{font-weight:500;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
			".ia-holdings-table{margin-top:12px;font-size:var(--ia-fs-body-sm)}",
			/* The market name is a caption, not a leading header cell: as a <th> it
			   gave the header one cell more than the body and shifted every value
			   one column left of its heading. */
			".ia-holdings-caption{text-align:left;padding:0 8px 6px;font-size:var(--ia-fs-body-sm);font-weight:600;color:var(--ia-label-3)}",
			".ia-holdings-code{font-family:var(--ia-font-mono);font-size:var(--ia-fs-caption);color:var(--ia-label-3)}",
			".ia-holdings-name{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".ia-trend{font-variant-numeric:tabular-nums}",
			/* ── workflow board: per-band progress ───────────────────────────── */
			/* The band is the progress display now, so it gets a state colour, a
			   completion ratio and a bar. This is what replaced the wall of
			   per-agent cards: same information, read at a glance. */
			".ia-flow-band[data-status=completed] .ia-flow-label{color:var(--ia-ok-text)}",
			".ia-flow-band[data-status=running] .ia-flow-label{color:var(--ia-accent-text);font-weight:600}",
			".ia-flow-band[data-status=failed] .ia-flow-label{color:var(--ia-danger-text)}",
			".ia-flow-band[data-status=idle] .ia-flow-label{color:var(--ia-label-3)}",
			".ia-flow-band[data-status=running] .ia-flow-node{border-color:color-mix(in srgb,var(--ia-accent) 55%,var(--ia-border-subtle))}",
			".ia-flow-band[data-status=failed] .ia-flow-node{border-color:color-mix(in srgb,var(--ia-danger) 55%,var(--ia-border-subtle))}",
			/* Third column carries the per-band progress; the band reported only its
			   shape before, so the diagram could not show advancement. */
			".ia-flow-band{grid-template-columns:108px minmax(0,1fr) auto}",
			".ia-flow-progress{display:flex;align-items:center;gap:10px;flex:none;min-width:190px;padding-top:4px}",
			".ia-flow-progress-bar{flex:1;height:5px;border-radius:var(--ia-r-full);background:var(--ia-border-subtle);overflow:hidden}",
			".ia-flow-progress-bar i{display:block;height:100%;border-radius:var(--ia-r-full);background:var(--ia-grad-primary);transform-origin:left center;transform:scaleX(0);transition:transform var(--ia-dur-slow) var(--ia-ease-out)}",
			".ia-flow-progress[data-status=completed] .ia-flow-progress-bar i{background:var(--ia-ok)}",
			".ia-flow-progress[data-status=failed] .ia-flow-progress-bar i{background:var(--ia-danger)}",
			".ia-flow-progress-text{font-size:var(--ia-fs-micro);color:var(--ia-label-3);white-space:nowrap;font-variant-numeric:tabular-nums}",
			"@media(max-width:1180px){.ia-flow-progress{min-width:0;margin-left:0;margin-top:6px}}",
			/* ── 市场早报 ─────────────────────────────────────────────────────── */
			/* The macro report is GFM. Rendering it means the .ia-md-* rules apply,
			   so this only owns the scroll box and the heading weight. */
			".ia-news .ia-panel-head{margin-bottom:6px}",
			".ia-news .ia-panel-head span{font-size:var(--ia-fs-micro);color:var(--ia-label-3)}",
			".ia-news-body{max-height:420px;overflow-y:auto}",
			".ia-news-body .ia-md>*:first-child{margin-top:0}",
			"@media(max-width:1440px){.ia-an-main{grid-template-columns:minmax(0,1fr)}}",
			"@media(max-width:1180px){.ia-an-grid{grid-template-columns:1fr}}",
".ia-settings{display:flex;flex-direction:row-reverse;flex:1;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base)}",
			".ia-settings-nav{flex:none;width:196px;padding:18px 10px;gap:2px;align-self:flex-start;position:sticky;top:0;border:0;border-left:1px solid var(--dsw-alias-border-l1);background:transparent}",
			".ia-settings-nav button{border:0;border-left:2px solid transparent;background:transparent;text-align:left;font:inherit;font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;color:var(--ia-label-3);cursor:pointer}",
			".ia-settings-nav button:hover{background:var(--ia-hover);color:var(--dsw-alias-label-primary)}",
			".ia-settings-nav button[data-active=true]{background:transparent;color:var(--ia-accent-text);font-weight:600;border-left-color:var(--ia-accent)}",
			".ia-settings-content{flex:1;min-width:0;overflow-y:auto;padding:20px 26px;max-width:none;display:flex;flex-direction:column;gap:18px}",
			".ia-set-section{padding:18px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--ia-r-card);background:var(--ia-surface);box-shadow:var(--ia-shadow-xs);scroll-margin-top:16px}",
			".ia-ctx-drawer .ia-context-row>span{white-space:nowrap}",
		].join("");
		// ── design tokens ──────────────────────────────────────────────────
		//
		// Single source of truth for colour, type, radius, elevation, spacing,
		// motion and layering. Rules should reference these instead of literals.
		//
		// Layer 1 writes literal values and is the ONLY place a hex code belongs.
		// Layer 2 gives them meaning. Layer 3 keeps the existing `--ia-*` aliases
		// that current rules already consume, so this layer can be introduced
		// without touching a single existing declaration.
		//
		// AI Trading Automation is light-only by design (see ThemePresenter): there is
		// deliberately no dark override block, and `color-scheme` is pinned in JS.
		const tokenCss = `
:root{
  color-scheme:light;

  /* L1 · brand primitives */
  --ia-blue-400:#4C8DFF; --ia-blue-500:#2F7BFF; --ia-blue-600:#1B6EF3; --ia-blue-700:#1557C8;
  --ia-cyan-400:#3ED4DE; --ia-cyan-500:#22B8CF; --ia-cyan-600:#17B8C4;
  --ia-violet-500:#7C5CFF;
  --ia-ink-900:#0E1524; --ia-ink-700:#1E293B; --ia-ink-600:#495468; --ia-ink-500:#5A6578;
  --ia-ink-400:#5F6B7E; --ia-ink-300:#94A3B8; --ia-ink-200:#C7CEDA;
  --ia-paper-0:#FFFFFF; --ia-paper-50:#F6F7F9; --ia-paper-100:#F1F3F7;
  --ia-line-200:#E6E9EF; --ia-line-300:#D3D8E2;
  --ia-green-600:#0E9F6E; --ia-amber-600:#C2740A; --ia-red-600:#DC2626;

  /* L2 · surfaces */
  --ia-bg-base:var(--dsw-alias-bg-base,var(--ia-paper-50));
  --ia-surface:var(--dsw-alias-bg-layer-1,var(--ia-paper-0));
  --ia-surface-2:var(--dsw-alias-bg-layer-2,var(--ia-paper-100));
  /* DSH injects no bg-module-platform alias, so tinted chips used to mix
     against nothing and render transparent. Point them at a real surface. */
  --ia-surface-chip:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,var(--ia-paper-100)));
  --ia-surface-inverse:var(--ia-ink-900);

  /* L2 · text */
  --ia-text-1:var(--dsw-alias-label-primary,var(--ia-ink-900));
  --ia-text-2:var(--dsw-alias-label-secondary,var(--ia-ink-600));
  --ia-text-3:var(--ia-ink-400);

  /* L2 · borders */
  --ia-border-subtle:var(--dsw-alias-border-l1,var(--ia-line-200));
  --ia-border-strong:var(--dsw-alias-border-l2,var(--ia-line-300));

  /* L2 · accent + semantic. The *-text variants are the ones that must clear
     WCAG AA as small text; the base values stay available for fills, borders
     and icons, where a lighter tone is correct. */
  --ia-accent:var(--dsw-alias-brand-primary,var(--ia-blue-600));
  --ia-accent-hover:var(--ia-blue-700);
  --ia-accent-fg:#FFFFFF;
  --ia-accent-text:#1557C8;
  --ia-accent-cyan:var(--ia-cyan-600);
  --ia-accent-violet:var(--ia-violet-500);
  --ia-ok:var(--dsw-alias-state-success-primary,var(--ia-green-600));
  --ia-warn:var(--dsw-alias-state-warn-primary,var(--ia-amber-600));
  --ia-danger:var(--dsw-alias-state-error-primary,var(--ia-red-600));
  --ia-idle:var(--dsw-alias-state-idle-primary,var(--ia-ink-300));
  --ia-ok-text:#0B7A54;
  --ia-warn-text:#8A5205;
  --ia-danger-text:#B91C1C;

  /* L2 · data-visualisation order (fixed semantics: 4 = up, 5 = down) */
  --ia-viz-1:var(--ia-blue-600); --ia-viz-2:var(--ia-cyan-500); --ia-viz-3:var(--ia-violet-500);
  --ia-viz-4:var(--ia-green-600); --ia-viz-5:var(--ia-red-600); --ia-viz-6:var(--ia-ink-300);

  /* L2 · gradients. Both stops are deliberately dark: a white label has to clear
     WCAG AA (4.5:1) on EVERY stop, which caps relative luminance at ~0.18. Bright
     cyan tops out near 2.4:1 and is therefore unusable behind text. The gradient
     stays as the surface treatment; only its range is constrained. */
  --ia-grad-primary:linear-gradient(135deg,#1E5FD0 0%,#0E7C8A 100%);
  --ia-grad-accent:linear-gradient(135deg,#1B54C4 0%,#5B3FD0 100%);
  --ia-grad-stroke:linear-gradient(135deg,rgba(30,95,208,.55) 0%,rgba(14,124,138,.25) 100%);
  --ia-grad-surface:linear-gradient(180deg,rgba(255,255,255,.9) 0%,rgba(246,247,249,.6) 100%);

  /* L2 · typography. Nothing is downloaded: we use a face the machine already
     has, then fall back to the platform UI face. */
  --ia-font-sans:"HarmonyOS Sans SC","MiSans","OPPO Sans","Alibaba PuHuiTi 3.0","Source Han Sans SC","Noto Sans SC","Manrope","Plus Jakarta Sans","Inter","Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;
  --ia-font-num:"Manrope","Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",system-ui,sans-serif;
  --ia-font-mono:"Cascadia Mono","SF Mono",Consolas,"JetBrains Mono",ui-monospace,monospace;

  --ia-fs-display:48px; --ia-fs-h1:32px; --ia-fs-h2:24px; --ia-fs-h3:20px;
  --ia-fs-body:16px; --ia-fs-body-sm:14px; --ia-fs-label:14px;
  --ia-fs-caption:12px; --ia-fs-micro:12px; --ia-fs-mono:12.5px;
  --ia-lh-tight:1.25; --ia-lh-snug:1.4; --ia-lh-body:1.6;
  --ia-fw-regular:400; --ia-fw-medium:500; --ia-fw-semibold:600; --ia-fw-bold:700;

  /* L2 · radii — card radius dropped from 24 to 18 so cards and controls
     share one visual family; modals keep the larger step. */
  --ia-r-xs:8px; --ia-r-sm:10px; --ia-r-btn:14px; --ia-r-tab:16px;
  --ia-r-chart:22px; --ia-r-card:18px; --ia-r-modal:24px; --ia-r-full:999px;

  /* L2 · elevation (multi-layer, low alpha) */
  --ia-shadow-xs:0 1px 2px rgba(16,24,40,.04);
  --ia-shadow-sm:0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04);
  --ia-shadow-md:0 4px 12px rgba(16,24,40,.08),0 2px 4px rgba(16,24,40,.04);
  --ia-shadow-lg:0 12px 32px rgba(16,24,40,.12),0 4px 8px rgba(16,24,40,.05);
  --ia-glow-accent:0 6px 20px rgba(27,110,243,.28);

  /* L2 · elevation levels. Components reference a LEVEL, never a raw shadow, so
     "how far off the page is this" stays one decision instead of eleven. */
  --ia-elev-rail:var(--ia-shadow-lg);
  --ia-elev-panel:var(--ia-shadow-sm);
  --ia-elev-item:var(--ia-shadow-xs);
  --ia-elev-item-hover:var(--ia-shadow-sm);
  /* Selected items read as pressed-in, not raised: a stronger outer shadow would
     stack cards on the page and look like cheap paper cut-outs. */
  --ia-elev-item-active:inset 0 1px 2px rgba(16,24,40,.05);
  --ia-elev-raised:var(--ia-shadow-md);

  /* L2 · edge lighting. One highlight and one shade serve both modes: on the
     dark rail the white hairline reads as a lit top edge, on light surfaces the
     dark one reads as a soft seam. That is why the rail needs no dark variant. */
  --ia-edge-hi:rgba(255,255,255,.09);
  --ia-edge-lo:rgba(16,24,40,.05);
  --ia-rail-sheen:linear-gradient(180deg,rgba(255,255,255,.055) 0%,rgba(255,255,255,0) 44%);
  --ia-rail-vignette:linear-gradient(90deg,rgba(0,0,0,.16) 0%,rgba(0,0,0,0) 64%);
  --ia-lift:translateY(-1px);
  --ia-lift-press:translateY(0) scale(.995);

  /* L2 · spacing — 8pt grid */
  --ia-sp-1:4px; --ia-sp-2:8px; --ia-sp-3:12px; --ia-sp-4:16px; --ia-sp-5:20px;
  --ia-sp-6:24px; --ia-sp-8:32px; --ia-sp-10:40px; --ia-sp-12:48px;

  /* L2 · motion */
  --ia-dur-instant:120ms; --ia-dur-fast:160ms; --ia-dur-base:200ms;
  --ia-dur-page:280ms; --ia-dur-slow:400ms; --ia-dur-flow:560ms;
  --ia-ease-out:cubic-bezier(.22,1,.36,1);
  --ia-ease-in-out:cubic-bezier(.65,0,.35,1);
  --ia-ease-spring:cubic-bezier(.34,1.56,.64,1);
  --ia-ease-out-expo:cubic-bezier(.16,1,.3,1);

  /* L2 · layering */
  --ia-z-base:1; --ia-z-dropdown:100; --ia-z-sticky:200; --ia-z-overlay:300; --ia-z-toast:400;

  /* L3 · compatibility aliases consumed by existing rules. Several point at DSH
     tokens this runtime does not actually inject, so every one carries a
     concrete fallback — an unresolved var() renders the surface transparent. */
  --ia-label-3:var(--ia-text-3);
  --ia-hover:color-mix(in srgb,var(--ia-accent) 8%,transparent);
  --ia-hover-solid:color-mix(in srgb,var(--ia-accent) 14%,transparent);
  --ia-brand:var(--ia-accent);

  /* Supply the two aliases DSH declares but never injects. Without them its own
     components (settings intro copy, several DSH cards) fall back to the
     UA default grey, which both looks unrelated to this palette and fails AA.
     These are additions, not overrides — nothing regresses by defining them. */
  --dsw-alias-label-tertiary:var(--ia-text-3);
  --dsw-alias-bg-module-platform:var(--ia-surface);

  /* L2 · brand mark */
  --ia-brandmark-from:var(--ia-blue-500);
  --ia-brandmark-to:#4CC2FF;

  /* L2 · left rail. It is intentionally a dark band next to the light content
     area, so it needs its own ink/surface set rather than the global one.
     P1 re-points these at the blue brand ramp; keeping them as tokens now means
     that retheme is a token edit, not a rule rewrite. */
  --ia-rail-bg:#0F172A;
  --ia-rail-text:#B6C0D2;
  --ia-rail-text-dim:#9AA6BD;
  --ia-rail-active-text:#FFFFFF;

  /* L2 · brand accent. Was a teal ramp; the design target is the blue ramp, so
     P1 only has to repoint these two tokens. */
  --ia-rail-accent:#49b9a5;
  --ia-rail-accent-ink:#0F6B5C;
}
.ia-shell{font-family:var(--ia-font-sans)}
.ia-shell .ia-num,.ia-an-kv b,.ia-kpi-value,.ia-table td,.ia-market-value{
  font-family:var(--ia-font-num);font-variant-numeric:tabular-nums;
}

/* Interaction elevation. Buttons and list items opt in with ONE class instead of
   each restating its own shadow, hover, active, focus and disabled rules --
   eleven components previously had eleven different answers (most had none),
   which is how a surface ends up looking assembled from parts.
   Every state is defined here exactly once, so a new control cannot silently
   ship without a focus ring. Depth is deliberately small: 1px of travel and one
   shadow step. */
.ia-elev{box-shadow:var(--ia-elev-item);
  transition:box-shadow var(--ia-dur-fast) var(--ia-ease-out),transform var(--ia-dur-instant) var(--ia-ease-out),background-color var(--ia-dur-fast) var(--ia-ease-out)}
.ia-elev:hover:not(:disabled):not([aria-disabled=true]){box-shadow:var(--ia-elev-item-hover);transform:var(--ia-lift)}
.ia-elev:active:not(:disabled):not([aria-disabled=true]){box-shadow:var(--ia-elev-item-active);transform:var(--ia-lift-press)}
/* Keyboard users get the same affordance as mouse users; :focus-visible keeps it
   off plain clicks. */
.ia-elev:focus-visible{outline:2px solid var(--ia-accent);outline-offset:2px}
.ia-elev:disabled,.ia-elev[aria-disabled=true]{box-shadow:none;transform:none;opacity:.45;cursor:not-allowed}
/* Level modifiers. Only the depth changes; the state machine above is shared. */
.ia-elev-sm{box-shadow:var(--ia-elev-item)}
.ia-elev-md{box-shadow:var(--ia-elev-panel)}
.ia-elev-lg{box-shadow:var(--ia-elev-raised)}
.ia-elev-lg:hover:not(:disabled):not([aria-disabled=true]){box-shadow:var(--ia-glow-accent)}
/* Inside the 88px rail a travelling row reads as jitter, and the rail already
   separates itself from the page, so its items keep the shadow without travel. */
.ia-elev-static:hover:not(:disabled){transform:none}

/* The left rail is a dark band beside a light surface, so it is built from a
   stack rather than one background: base colour, a lit top edge, a capped sheen,
   an inner right-hand shade for depth and an outer drop to separate it from the
   content. Each layer is a token so the whole thing retints in one place. */
.ia-rail{
  background-color:var(--ia-rail-bg);
  background-image:var(--ia-rail-sheen),var(--ia-rail-vignette);
  box-shadow:var(--ia-elev-rail),inset 0 1px 0 var(--ia-edge-hi),inset -1px 0 0 var(--ia-edge-lo);
}
.ia-sidebar{
  background-image:linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 38%);
  box-shadow:inset -1px 0 0 var(--ia-edge-lo);
}

/* Per-component tuning ONLY. The five interaction states live in .ia-elev
   above, applied on the element itself, so nothing is restated here. The rail's
   items are styled in productCss: an active item is a gradient card with a soft
   blue outer shadow — no inset edge line, matching the approved design. */
.ia-sidebar .ia-session[data-active=true]{box-shadow:inset 0 1px 2px var(--ia-edge-lo)}

/* DSH's own conversation controls (the composer's add button, the workspace
   selector) are styled by its bundle, not ours, so they cannot carry .ia-elev.
   Give them the same affordance from here, scoped to .ia-center so the rest of
   DSH's UI is untouched. */
.ia-center button[class*="_add"],.ia-center button[class*="_workspace"]{
  box-shadow:var(--ia-elev-item);
  transition:box-shadow var(--ia-dur-fast) var(--ia-ease-out),transform var(--ia-dur-instant) var(--ia-ease-out)}
.ia-center button[class*="_add"]:hover,.ia-center button[class*="_workspace"]:hover{
  box-shadow:var(--ia-elev-item-hover);transform:var(--ia-lift)}
.ia-center button[class*="_add"]:focus-visible,.ia-center button[class*="_workspace"]:focus-visible{
  outline:2px solid var(--ia-accent);outline-offset:2px}
.ia-an-seg button{box-shadow:none}

/* ── Markdown report body (generated by scripts/generate-markdown.mjs) ───────
   The renderer emits ia-md-* classes only, and every value below resolves
   through the L1/L2 token sheet above, so a retheme never touches this block. */
.ia-md{font-size:var(--ia-fs-body-sm);line-height:var(--ia-lh-body);color:var(--ia-text-2);word-break:break-word}
.ia-md>*:first-child{margin-top:0}
.ia-md>*:last-child{margin-bottom:0}
.ia-md-h1,.ia-md-h2,.ia-md-h3,.ia-md-h4,.ia-md-h5,.ia-md-h6{
  margin:var(--ia-sp-4) 0 var(--ia-sp-2);color:var(--ia-text-1);
  font-weight:var(--ia-fw-semibold);line-height:var(--ia-lh-tight)}
/* The panel around the body already shows the report title, so an in-body h1
   acts as a section marker: it steps down one size to keep the hierarchy. */
.ia-md-h1{font-size:var(--ia-fs-h2)}
.ia-md-h2{font-size:var(--ia-fs-h3)}
.ia-md-h3{font-size:var(--ia-fs-body)}
.ia-md-h4,.ia-md-h5,.ia-md-h6{font-size:var(--ia-fs-body-sm)}
.ia-md-p{margin:0 0 var(--ia-sp-2)}
.ia-md-a{color:var(--ia-accent-text);text-decoration:none}
.ia-md-a:hover{text-decoration:underline}
.ia-md-inline,.ia-md-code{font-family:var(--ia-font-mono);font-size:var(--ia-fs-mono)}
.ia-md-inline{padding:1px var(--ia-sp-1);border-radius:var(--ia-r-xs);background:var(--ia-surface-2);color:var(--ia-text-1)}
/* Log tails are long and unwrapped: the block scrolls sideways on its own, so a
   single line can never stretch the panel it sits in. */
.ia-md-pre{
  margin:0 0 var(--ia-sp-3);padding:var(--ia-sp-2) var(--ia-sp-3);max-width:100%;
  border:1px solid var(--ia-border-subtle);border-radius:var(--ia-r-tab);
  background:var(--ia-surface-2);overflow-x:auto}
.ia-md-code{display:block;white-space:pre;color:var(--ia-text-1)}
.ia-md-quote{
  margin:0 0 var(--ia-sp-3);padding:var(--ia-sp-1) 0 var(--ia-sp-1) var(--ia-sp-3);
  border-left:3px solid var(--ia-accent);color:var(--ia-text-2)}
.ia-md-ul,.ia-md-ol{margin:0 0 var(--ia-sp-2);padding-left:var(--ia-sp-5)}
.ia-md-ul{list-style:disc}
.ia-md-ol{list-style:decimal}
.ia-md-ul li,.ia-md-ol li{margin:var(--ia-sp-1) 0}
.ia-md-ul .ia-md-ul,.ia-md-ul .ia-md-ol,.ia-md-ol .ia-md-ul,.ia-md-ol .ia-md-ol{margin-bottom:0}
.ia-md-table{
  width:100%;margin:0 0 var(--ia-sp-3);border-collapse:collapse;
  font-size:var(--ia-fs-caption);font-variant-numeric:tabular-nums}
.ia-md-table th,.ia-md-table td{
  padding:var(--ia-sp-1) var(--ia-sp-2);border:1px solid var(--ia-border-subtle);
  text-align:left;vertical-align:top}
.ia-md-table th{background:var(--ia-surface-chip);color:var(--ia-text-1);font-weight:var(--ia-fw-medium)}
.ia-md-table td{color:var(--ia-text-2)}
.ia-md-hr{margin:var(--ia-sp-4) 0;border:0;border-top:1px solid var(--ia-border-subtle)}
.ia-md del{color:var(--ia-text-3)}

/* Readers who ask for less motion get a static-but-complete interface: every
   status stays legible through colour, icon and text rather than movement. */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important;
  }
}`;

		// Two independent sheets, each guarded by its own presence check so a
		// re-mount never stacks duplicate <style> nodes. The main sheet keeps the
		// original `data-plugin` value verbatim — that attribute is a published
		// contract even though nothing in-tree consumes it.
		const injectSheet = (plugin, text) => {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin=" + JSON.stringify(plugin) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = plugin;
			tag.textContent = text;
			document.head.appendChild(tag);
		};
		injectSheet(CSS_ID, css + productCss);
		injectSheet(CSS_ID + "/tokens", tokenCss);
		injectSheet(CSS_ID + "/motion", motionCss);

		// ── helpers ────────────────────────────────────────────────────────
		const jsonFetch = async (url, options = {}) => {
			const response = await fetch(url, {
				headers: { "Content-Type": "application/json" },
				...options,
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
			return payload;
		};
		const fmtMoney = (value) => {
			const number = Number(value);
			if (!Number.isFinite(number)) return "-";
			return number.toLocaleString(localeTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
		};
		/* Sliding thumb for segmented controls. The container owns one absolutely
		   positioned .ia-seg-thumb; the active button defines its offset and width,
		   so switching animates instead of jumping (iOS-style segmented control). */
		function useSegThumb(ref, deps) {
			react.useEffect(() => {
				const el = ref && ref.current;
				if (!el) return;
				const activeSelector = '[aria-pressed="true"],[data-active="true"],[aria-selected="true"]';
				const place = () => {
					const thumb = el.querySelector(":scope > .ia-seg-thumb");
					if (!thumb) return;
					const active = el.querySelector(activeSelector);
					if (!active) { thumb.style.width = "0px"; return; }
					thumb.style.transform = "translateX(" + active.offsetLeft + "px)";
					thumb.style.width = active.offsetWidth + "px";
				};
				place();
				const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
				if (observer) observer.observe(el);
				window.addEventListener("resize", place);
				return () => {
					if (observer) observer.disconnect();
					window.removeEventListener("resize", place);
				};
			}, deps || []);
		}
		const marketName = { get cn(){return tr("ui.mainland.china");}, get hk(){return tr("ui.hong.kong");}, get us(){return tr("ui.united.states");}, etf: "ETF" };

		// ── Dashboard ─────────────────────────────────────────────────────
		function Dashboard() {
			const [summary, setSummary] = react.useState(null);
			const [error, setError] = react.useState("");
			react.useEffect(() => {
				let cancelled = false;
				const load = async () => {
					try {
						const payload = await jsonFetch("/api/investment/summary");
						if (!cancelled) setSummary(payload);
					} catch (err) {
						if (!cancelled) setError(String(err?.message ?? err));
					}
				};
				load();
				const timer = setInterval(load, 30000);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, []);

			const status = summary?.status ?? {};
			const portfolios = summary?.portfolios ?? {};
			const reports = Array.isArray(summary?.reports?.reports) ? summary.reports.reports : [];
			const macro = typeof summary?.macro?.content === "string" ? summary.macro.content : "";
			const control = status.control ?? {};
			const mandate = status.mandate ?? {};
			const markets = status.markets ?? {};
			const killed = Boolean(control.kill_switch);
			const paused = Boolean(control.paused);
			const accountRows = ["cn", "hk", "us", "etf"].map((market) => {
				const account = portfolios[market];
				if (!account || account.error) return null;
				const holdings = Array.isArray(account.holdings) ? account.holdings : [];
				const trades = Array.isArray(account.tradeHistory) ? account.tradeHistory : [];
				return { market, cash: account.cash, holdings: holdings.length, trades: trades.length, totalCapital: account.totalCapital };
			}).filter(Boolean);

			return react_jsx_runtime.jsxs("div", {
				className: "ia-page",
				children: [
					react_jsx_runtime.jsx("h1", { className: "ia-page-title", children: tr("ui.investment.overview") }),
					react_jsx_runtime.jsx("p", { className: "ia-page-sub", children: tr("ui.simulated.accounts.paper.trading.public.third.party.market.data.for.research") }),
					error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: tr("ui.engine.unavailable") + error }) : null,
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.system.and.risk.status") }),
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: tr("ui.mode") + (status.operation_mode ?? "-") }),
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: tr("ui.strategy") + (strategyName(mandate)) }),
									killed ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "danger", children: tr("ui.emergency.stop") }) : paused ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "warn", children: tr("ui.paused") }) : react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "ok", children: tr("ui.risk.controls.active") }),
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: tr("ui.investment.engine") + (status.investment_worker_alive ? tr("ui.running") : tr("ui.stopped")) })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { marginTop: 10 },
								children: Object.entries(markets).map(([market, info]) => react_jsx_runtime.jsx("div", {
									key: market,
									className: "ia-kv",
									children: [react_jsx_runtime.jsx("span", { children: marketName[market] + tr("ui.next.round") }), react_jsx_runtime.jsx("b", { children: String(info?.next_cycle ?? "-").replace("T", " ").slice(0, 16) })]
								}))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.account.assets") }),
							react_jsx_runtime.jsxs("table", {
								className: "ia-table",
								children: [
									react_jsx_runtime.jsxs("thead", { children: [react_jsx_runtime.jsxs("tr", { children: [react_jsx_runtime.jsx("th", { children: tr("ui.market") }), react_jsx_runtime.jsx("th", { children: tr("ui.total.assets") }), react_jsx_runtime.jsx("th", { children: tr("ui.cash") }), react_jsx_runtime.jsx("th", { children: tr("ui.holdings") }), react_jsx_runtime.jsx("th", { children: tr("ui.trades") })] })] }),
									react_jsx_runtime.jsx("tbody", {
										children: accountRows.length > 0 ? accountRows.map((row) => react_jsx_runtime.jsxs("tr", {
											key: row.market,
											children: [react_jsx_runtime.jsx("td", { children: marketName[row.market] }), react_jsx_runtime.jsx("td", { children: fmtMoney(row.totalCapital) }), react_jsx_runtime.jsx("td", { children: fmtMoney(row.cash) }), react_jsx_runtime.jsx("td", { children: row.holdings }), react_jsx_runtime.jsx("td", { children: row.trades })]
										})) : react_jsx_runtime.jsx("tr", { children: react_jsx_runtime.jsx("td", { colSpan: 5, children: tr("ui.engine.data.unavailable") }) })
									})
								]
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.recent.round.reports") }),
							reports.length > 0 ? react_jsx_runtime.jsx("ul", {
								style: { margin: 0, paddingLeft: 18 },
								children: reports.slice(0, 8).map((report) => react_jsx_runtime.jsx("li", { key: report.file, children: report.file }))
							}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: tr("ui.no.round.reports.yet") })
						]
					}),
					macro ? react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.latest.macro.briefing") }),
							react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }, children: macro.slice(0, 3000) })
						]
					}) : null
				]
			});
		}

		function useInvestmentSummary(intervalMs = 30000) {
            const active=useProductPageActive();
			const [state, setState] = react.useState({ data: null, error: "", loading: true });
			react.useEffect(() => {
                if(!active)return;
                let cancelled = false;
                const controller=new AbortController();
                const load = async () => {
                    try {
                        const data = await jsonFetch("/api/investment/summary",{signal:controller.signal});
						if (!cancelled) setState({ data, error: "", loading: false });
					} catch (error) {
						if (!cancelled && error?.name!=="AbortError") setState(previous=>({...previous,error:String(error?.message??error),loading:false}));
					}
				};
				load();
				const timer = setInterval(load, intervalMs);
				return () => {
					cancelled = true;
                    clearInterval(timer);
                    controller.abort();
                };
            }, [intervalMs,active]);
			return state;
		}

		function PageHeader({ title, subtitle, status, statusKind = "ok" }) {
			return react_jsx_runtime.jsxs("div", {
				className: "ia-page-head",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-page-head-copy",
						children: [
							react_jsx_runtime.jsx("h1", { className: "ia-page-title", children: title }),
							react_jsx_runtime.jsx("p", { className: "ia-page-sub", children: subtitle })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-page-status",
						"data-kind": statusKind,
						children: [
							react_jsx_runtime.jsx("span", { className: "ia-page-status-dot" }),
							react_jsx_runtime.jsx("span", { children: status })
						]
					})
				]
			});
		}

		/* DASHBOARD:START */
		// Generated into lib/client.js. Only React and the product shell's helpers are
		// used at runtime; no CDN, chart framework or additional shipped dependency.
		const dbH = (...args) => react.createElement(...args);
		const dbMarkets = ['cn', 'hk', 'us', 'etf'];
		const dbCurrencies = {cn:'¥', hk:'HK$', us:'US$', etf:'¥'};
		const dbPeriods = {month:1, quarter:3, year:12};
		const dbPeriodNames = {get month(){return tr("ui.1.month");}, get quarter(){return tr("ui.3.months");}, get year(){return tr("ui.1.year");}};
		const dbNumber = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
		const dbMoney = (value, currency='', digits=2) => dbNumber(value) === null ? '—' : currency + Number(value).toLocaleString(localeTag(),{minimumFractionDigits:digits,maximumFractionDigits:digits});
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
		    return {...item, code:dbCode(market,item.code), name:String(item.name || item.code || tr("ui.unnamed.security")), shares, cost, price,
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
		  if(payload?.error || payload?.ok===false) throw new Error(String(payload.error || tr("ui.price.history.unavailable")));
		  if(!payload || !Array.isArray(payload.data)) throw new Error(tr("ui.invalid.price.history.response"));
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
		  if(invalid) warnings.push(tr("ui.some.invalid.prices.were.skipped"));
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
		  if(bars.length<2) return dbH('div',{className:'ia-db-spark-empty',ref},history?.error?tr("ui.chart.unavailable"):history?.data?tr("ui.insufficient.history"):tr("ui.loading.chart"));
		  const lo=Math.min(...bars.map(row=>row.close)),hi=Math.max(...bars.map(row=>row.close));
		  const x=index=>3+index/(bars.length-1)*Math.max(0,width-6),y=value=>34-(value-lo)/(hi-lo || 1)*28;
		  return dbH('div',{ref,className:'ia-db-spark'},width>0?dbH('svg',{viewBox:'0 0 '+width+' 38',role:'img','aria-label':name+tr("ui.daily.prices.over.the.past.month")},
		    dbH('path',{d:dbPath(bars,x,y),fill:'none',stroke:'var(--ia-viz-1)',strokeWidth:1.7})):null);
		}

		function DashboardPriceChart({history,holding,market,period,type,options,trades}) {
		  const [ref,width]=useDashboardWidth();
		  const bars=react.useMemo(()=>dbWindow(history.bars,period),[history,period]);
		  const [cursor,setCursor]=react.useState(null),[pinned,setPinned]=react.useState(false);
		  react.useEffect(()=>{setCursor(null);setPinned(false);},[history,period]);
		  if(bars.length<2) return dbH('div',{ref,className:'ia-db-chart-empty'},tr("ui.at.least.two.trading.days.are.required"));
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
		      dbH('path',{key:'line',d:path,className:'ia-db-price-line',pathLength:1,fill:'none',strokeWidth:2.2,strokeLinejoin:'round'}));
		  }
		  if(options.ma) {
		    const start=ma.findIndex(row=>row.ma!==null);
		    if(start>=0) svg.push(dbH('path',{key:'ma',d:dbPath(ma.slice(start),i=>x(start+i),y,'ma'),className:'ia-db-ma',fill:'none',strokeWidth:1.5}),
		      dbH('text',{key:'ma-label',x:left+3,y:top+14},'MA20'));
		  }
		  if(options.cost && holding.cost>0) svg.push(dbH('line',{key:'cost',x1:left,x2:right,y1:y(holding.cost),y2:y(holding.cost),className:'ia-db-cost',strokeDasharray:'4 4'}),
		    dbH('text',{key:'cost-label',x:right-2,y:Math.max(top+14,y(holding.cost)-6),textAnchor:'end'},tr("ui.current.cost")+dbMoney(holding.cost)));
		  if(options.volume) {
		    const max=Math.max(...bars.map(row=>row.volume ?? 0)),bw=Math.max(1,(right-left)/bars.length*.6);
		    bars.forEach((row,i)=>{if(row.volume!==null) svg.push(dbH('rect',{key:'v'+i,x:x(i)-bw/2,y:height-32-(max?row.volume/max*26:0),width:bw,height:max?row.volume/max*26:0,className:'ia-db-volume'}));});
		    svg.push(dbH('text',{key:'vunit',x:4,y:height-42},tr("ui.volume")));
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
		      const label=actions.length>1?tr("ui.buy.sell"):actions[0]==='BUY'?tr("ui.b"):tr("ui.s");
		      svg.push(dbH('g',{key:'trade'+i,className:'ia-db-trade-mark'},
		        dbH('title',null,fills.map(fill=>(fill.action==='BUY'?tr("ui.buy"):tr("ui.sell"))+' '+dbMoney(fill.shares,'',0)+tr("ui.shares.fill.price")+dbMoney(fill.price,dbCurrencies[market])+' · '+fill.date).join('\n')),
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
		    dbH('div',{className:'ia-db-readout'},dbH('span',null,current.date),dbH('b',null,tr("ui.close")+dbMoney(current.close,dbCurrencies[market])),
		      current.open!==null?dbH('span',null,tr("ui.open")+dbMoney(current.open)+tr("ui.high")+dbMoney(current.high)+tr("ui.low")+dbMoney(current.low)):null,
		      current.volume!==null?dbH('span',null,tr("ui.volume.2")+dbMoney(current.volume,'',0)):null),
		    width>0?dbH('svg',{className:'ia-db-main-chart',viewBox:'0 0 '+width+' '+height,style:{height},role:'img',
		      'aria-label':holding.name+' '+dbPeriodNames[period]+tr("ui.daily.price.currency")+dbCurrencies[market],onPointerMove:move,
		      onPointerLeave:()=>{if(!pinned)setCursor(null);},onClick:event=>{move(event);setPinned(true);}},svg):null,
		    dbH('label',{className:'ia-db-date-slider'},dbH('span',null,tr("ui.view.trading.day")),dbH('input',{type:'range',min:0,max:bars.length-1,value:index,
		      get 'aria-label'(){return tr("ui.view.trading.day");},'aria-valuetext':current.date+tr("ui.close.2")+dbMoney(current.close,dbCurrencies[market]),
		      onChange:event=>{setCursor(Number(event.target.value));setPinned(true);}})));
		}

		function ProductDashboard({onOpenAnalysis}={}) {
		  const summaryState=useInvestmentSummary(10000),summary=summaryState.data ?? {},status=summary.status ?? {};
		  const [market,setMarket]=react.useState('cn'),[selection,setSelection]=react.useState({}),[period,setPeriod]=react.useState('quarter'),[type,setType]=react.useState('line');
		  const [options,setOptions]=react.useState({cost:true,volume:true,trades:true,ma:false});
		  // Sliding segmented controls: the thumb lives in the container and follows the
		  // active button, so switching market / period / chart type animates instead of
		  // flashing a new page.
		  const marketRef=react.useRef(null),periodRef=react.useRef(null),typeRef=react.useRef(null);
		  useSegThumb(marketRef,[market]);
		  useSegThumb(periodRef,[period]);
		  useSegThumb(typeRef,[type]);
		  const account=dbAccount(summary.portfolios?.[market],market),holdings=account?.holdings ?? [];
		  const holding=holdings.find(item=>item.code===selection[market]) ?? holdings[0] ?? null;
		  const histories=useDashboardHistories(market,holdings.map(item=>item.code),holding?.code);
		  const selected=holding?histories.items[holding.code]:null,history=selected?.data;
		  const bars=history?dbWindow(history.bars,period):[];
		  const trades=holding?dbTrades(account.trades,market,holding.code):[];
		  const currency=dbCurrencies[market],engineError=summaryState.error || status.error || '';
		  const riskLabel=engineError?tr("ui.unknown"):status.control?.kill_switch?tr("ui.emergency.stop"):status.control?.paused?tr("ui.paused"):tr("ui.normal");
		  const reports=Array.isArray(summary.reports?.reports)?summary.reports.reports:[];
		  const choose=code=>setSelection(previous=>({...previous,[market]:code}));
		  const current=history?.bars.at(-1),rangeChange=bars.length>1?(bars.at(-1).close/bars[0].close-1)*100:null;
		  const age=current?Math.floor((Date.now()-Date.parse(current.date+'T00:00:00Z'))/86400000):0;
		  const canCandle=bars.length>1 && bars.every(row=>row.open!==null),canVolume=bars.some(row=>row.volume!==null);
		  const canCost=holding?.cost>0;
		  const metrics=[
		    [tr("ui.account.equity"),dbMoney(account?.equity,currency,0),tr("ui.cash.latest.position.valuations")],
		    [tr("ui.unrealized.p.l"),account?.pnl===null || !account?'—':(account.pnl>0?'+':'')+dbMoney(account.pnl,currency,0),tr("ui.calculated.from.recorded.account.prices")],
		    [tr("ui.capital.utilization"),account?.equity>0 && account.value!==null?(account.value/account.equity*100).toFixed(1)+'%':'—',account?.cash!==null && account?.equity>0?tr("ui.cash.share")+(account.cash/account.equity*100).toFixed(1)+'%':tr("ui.waiting.for.account.data")],
		    [tr("ui.securities.held"),account?holdings.length+tr("ui.securities"):'—',marketName[market]+tr("ui.separate.simulated.account")]
		  ];
		  const panelHead=(title,detail)=>dbH('div',{className:'ia-db-panel-head'},dbH('h3',null,title),dbH('span',null,detail));
		  const errorState=(message,retry)=>dbH('div',{className:'ia-db-chart-empty',role:'status'},icon('alertTriangle',22),dbH('p',null,message),retry?dbH('button',{type:'button',className:'ia-btn ia-elev',onClick:retry},tr("ui.reload")):null);
		  const allocation=account?.equity>0 && account.value!==null && account.cash>=0 ? [...holdings.map((item,i)=>({name:item.name,code:item.code,value:item.value,opacity:.45+.15*(i%4)})),{get name(){return tr("ui.cash");},value:account.cash,opacity:1}] : [];
		  const colors=item=>item.code?'var(--ia-viz-1)':'var(--ia-border-strong)';
		  const nextCycle = status.markets?.[market]?.next_cycle;
		  const equityText = account?.equity > 0 ? dbMoney(account.equity, currency, 0) : '—';
		  const pnlText = account?.pnl === null || account?.pnl === undefined ? '—' : (account.pnl > 0 ? '+' : '') + dbMoney(account.pnl, currency, 0);
		  const pnlRate = account?.equity > 0 && Number.isFinite(account.pnl) ? (account.pnl / (account.equity - account.pnl)) * 100 : null;
		  const usageText = account?.equity > 0 && account.value !== null ? ((account.value / account.equity) * 100).toFixed(1) + '%' : '—';
		  const runs = Array.isArray(summary.analysisRuns) ? summary.analysisRuns : [];
		  const metricChip = (label, value, detail) => dbH('div', { className: 'ia-db-band-stat', key: label },
		    dbH('span', { className: 'ia-db-band-label' }, label),
		    dbH('b', { className: 'ia-num' }, value),
		    detail ? dbH('span', { className: 'ia-db-band-detail' }, detail) : null);
		  return dbH('div',{className:'ia-page ia-db-page','data-red-up':market!=='us'},
		    dbH(PageHeader,{get title(){return tr("ui.portfolio.overview");},get subtitle(){return tr("ui.track.changes.across.your.portfolio.and.securities");},status:summaryState.loading?tr("ui.connecting.to.the.investment.engine"):tr("ui.paper.trading.risk")+riskLabel,statusKind:engineError?'error':status.control?.kill_switch || status.control?.paused?'warn':'ok'}),
		    dbH('div',{className:'ia-page-content'},
		      engineError?dbH('div',{className:'ia-notice','data-kind':'err',role:'alert'},tr("ui.engine.unavailable")+engineError):null,
		      dbH('section',{className:'ia-db-band'},
		        dbH('div',{className:'ia-db-band-main'},
		          dbH('span',{className:'ia-db-band-label'},tr("ui.account.equity")),
		          dbH('div',{className:'ia-db-band-equity ia-num'},equityText),
		          dbH('div',{className:'ia-db-band-sub'},tr("ui.cash.2")+dbMoney(account?.cash,currency,0)+tr("ui.market.value")+dbMoney(account?.value,currency,0))),
		        dbH('div',{className:'ia-db-band-stats'},
		          metricChip(tr("ui.unrealized.p.l"),pnlText,pnlRate===null?null:(pnlRate>0?'+':'')+pnlRate.toFixed(2)+'%'),
		          metricChip(tr("ui.capital.utilization"),usageText,account?.cash!==null && account?.equity>0?tr("ui.cash.share")+(account.cash/account.equity*100).toFixed(1)+'%':tr("ui.waiting.for.account.data")),
		          metricChip(tr("ui.securities.held"),account?holdings.length+tr("ui.securities"):'—',marketName[market]+tr("ui.separate.simulated.account")),
		          metricChip(tr("ui.next.round.2"),nextCycle?String(nextCycle).replace('T',' ').slice(5,16):'—',status.operation_mode==='automatic'?tr("ui.automatic"):tr("ui.manual"))),
		        dbH('div',{className:'ia-db-band-actions'},
		          dbH('div',{ref:marketRef,className:'ia-db-market-picker ia-seg',get 'aria-label'(){return tr("ui.view.market");}},dbH('span',{className:'ia-seg-thumb','aria-hidden':'true'}),dbMarkets.map(key=>dbH('button',{key,type:'button','aria-pressed':market===key,onClick:()=>setMarket(key)},marketName[key]))),
		          onOpenAnalysis?dbH('button',{type:'button',className:'ia-btn ia-elev ia-elev-lg ia-db-primary',onClick:onOpenAnalysis},tr("ui.new.research")):null)),
		      dbH('div',{className:'ia-db-workbench'},
		        dbH('section',{className:'ia-db-panel ia-db-watch'},panelHead(tr("ui.my.holdings"),account?holdings.length+tr("ui.securities.market.value")+dbMoney(account.value,currency,0):''),
		          holdings.length?dbH('div',{className:'ia-db-stock-list'},holdings.map(item=>{
		            const stockHistory=histories.items[item.code],rows=stockHistory?.data?.bars ?? [],latest=rows.at(-1),previous=rows.at(-2);
		            const change=previous?(latest.close/previous.close-1)*100:null;
		            return dbH('button',{type:'button',className:'ia-db-stock',key:item.code,'aria-pressed':holding?.code===item.code,'aria-label':tr("ui.view")+item.name+tr("ui.price.chart"),onClick:()=>choose(item.code)},
		              dbH('div',{className:'ia-db-stock-row'},dbH('b',null,item.name),dbH('span',{className:'ia-num'},dbMoney(latest?.close ?? item.price))),
		              dbH('div',{className:'ia-db-stock-row'},dbH('span',{className:'ia-db-muted'},item.code),dbH('span',{className:'ia-trend','data-red-up':market!=='us','data-trend':dbTrend(change)},dbSigned(change))),
		              dbH(DashboardSparkline,{history:stockHistory,name:item.name}),
		              dbH('span',{className:'ia-db-stock-meta ia-num'},dbMoney(item.shares,'',0)+tr("ui.shares.cost")+dbMoney(item.cost,currency)+tr("ui.p.l")+((item.pnl>0?'+':'')+dbMoney(item.pnl,currency))));
		          })):dbH('div',{className:'ia-empty'},summaryState.loading?tr("ui.loading.holdings"):account?tr("ui.no.holdings.yet"):tr("ui.account.data.unavailable")),
		          holdings.length?dbH('div',{className:'ia-db-watch-foot'},tr("ui.daily.prices.1.month.select.to.view.chart")):null),
		        dbH('section',{className:'ia-db-panel ia-db-focus'},holding?dbH(react.Fragment,null,
		          dbH('div',{className:'ia-db-focus-head'},
		            dbH('div',{'aria-live':'polite'},dbH('h2',null,tr("ui.price.chart.2")),
		              dbH('div',{className:'ia-db-muted'},holding.name+' · '+holding.code+' · '+dbPeriodNames[period])),
		            dbH('div',{className:'ia-db-quote'},
		              holdings.length>1?dbH('div',{className:'ia-db-chart-chips'},holdings.map(item=>dbH('button',{key:item.code,type:'button','aria-pressed':holding.code===item.code,onClick:()=>choose(item.code)},item.code))):null,
		              dbH('strong',null,dbMoney(current?.close,currency)),
		              dbH('span',{className:'ia-trend','data-red-up':market!=='us','data-trend':dbTrend(rangeChange)},dbSigned(rangeChange)))),
		          dbH('div',{className:'ia-db-toolbar'},
		            dbH('div',{ref:periodRef,className:'ia-db-choices ia-seg',get 'aria-label'(){return tr("ui.time.range");}},dbH('span',{className:'ia-seg-thumb','aria-hidden':'true'}),Object.entries(dbPeriodNames).map(([key,label])=>dbH('button',{key,type:'button','aria-pressed':period===key,onClick:()=>setPeriod(key)},label))),
		            dbH('div',{ref:typeRef,className:'ia-db-choices ia-seg',get 'aria-label'(){return tr("ui.chart.type");}},dbH('span',{className:'ia-seg-thumb','aria-hidden':'true'}),[['line',tr("ui.line")],['candle',tr("ui.candlestick")]].map(([key,label])=>dbH('button',{key,type:'button','aria-pressed':(canCandle?type:'line')===key,disabled:key==='candle'&&!canCandle,title:key==='candle'&&!canCandle?tr("ui.this.source.does.not.provide.complete.ohlc.data"):undefined,onClick:()=>setType(key)},label))),
		            dbH('div',{className:'ia-db-options'},[['cost',tr("ui.cost.line"),canCost],['volume',tr("ui.volume"),canVolume],['trades',tr("ui.trade.dates"),!!trades.length],['ma','MA20',!!history && history.bars.length>=20]].map(([key,label,enabled])=>dbH('label',{key},dbH('input',{type:'checkbox',checked:options[key],disabled:!enabled,onChange:event=>setOptions(previous=>({...previous,[key]:event.target.checked}))}),label)))),
		          selected?.error?errorState(selected.error,()=>histories.retry(holding.code)):!history?dbH('div',{className:'ia-db-chart-empty','aria-busy':true,role:'status'},dbH('div',{className:'ia-db-skeleton'}),tr("ui.loading.price.history")):history.bars.length<2?errorState(tr("ui.not.enough.price.history.yet"),()=>histories.retry(holding.code)):
		            dbH(DashboardPriceChart,{key:market+':'+holding.code,history,holding,market,period,type,options:{...options,volume:options.volume&&canVolume,cost:options.cost&&canCost},trades}),
		          dbH('div',{className:'ia-db-position'},[[tr("ui.quantity.held"),dbMoney(holding.shares,'',0)+tr("ui.shares")],[tr("ui.current.position.cost"),dbMoney(holding.cost,currency)],[tr("ui.recorded.account.valuation"),dbMoney(holding.price,currency)],[tr("ui.unrealized.p.l"),(holding.pnl>0?'+':'')+dbMoney(holding.pnl,currency)]].map(([label,value])=>dbH('div',{key:label},dbH('span',{className:'ia-db-muted'},label),dbH('strong',null,value)))),
		          history?dbH('div',{className:'ia-db-provenance'},dbH('span',null,tr("ui.source")+(history.source || tr("ui.not.provided"))+tr("ui.last.trading.day")+(current?.date || '—')),age>7?dbH('span',{className:'ia-db-data-warning'},tr("ui.price.age")+age+tr("ui.days")):null,
		            history.degraded || history.adjusted!==true || history.warnings.length?dbH('span',{className:'ia-db-data-warning',role:'status'},tr("ui.price.notes")+(history.warnings.join('；') || (history.degraded?tr("ui.a.fallback.price.source.was.used"):tr("ui.adjustment.status.is.unconfirmed")))):null):null):dbH(react.Fragment,null,dbH('div',{className:'ia-db-focus-head'},dbH('div',null,dbH('h2',null,tr("ui.price.chart.2")),dbH('div',{className:'ia-db-muted'},account?tr("ui.select.a.holding.on.the.left.to.view.its.chart"):tr("ui.waiting.for.account.data")))),dbH('div',{className:'ia-db-chart-empty','data-kind':'empty',role:'status'},dbH('p',null,account?tr("ui.select.a.holding.to.view.its.chart"):tr("ui.account.data.unavailable")))))),
		      dbH('div',{className:'ia-db-secondary'},
		        dbH('section',{className:'ia-db-panel'},panelHead(tr("ui.round.timeline"),tr("ui.latest")+(runs.length?Math.min(runs.length,5):0)+tr("ui.rounds")),
		          runs.length?dbH('ul',{className:'ia-db-timeline'},runs.slice(0,5).map((run,index)=>dbH('li',{key:String(run.cycle_id ?? run.id ?? index),'data-current':index===0},
		            dbH('b',{className:'ia-num'},String(run.started_at ?? run.created_at ?? '').replace('T',' ').slice(5,16)),
		            dbH('span',{className:'ia-db-timeline-copy'},(marketName[run.market] ?? run.market ?? '-')+' · '+(run.label || tr("ui.security.research"))),
		            dbH('span',{className:'ia-chip','data-kind':analysisStatusKind(run.status)},analysisStatusLabel(run.status))))):dbH('div',{className:'ia-empty'},tr("ui.no.previous.rounds"))),
		        dbH('section',{className:'ia-db-panel'},panelHead(tr("ui.portfolio.allocation"),tr("ui.this.market.including.cash")),allocation.length?dbH(react.Fragment,null,
		          dbH('div',{className:'ia-db-allocation',role:'img','aria-label':marketName[market]+tr("ui.asset.allocation")},allocation.map(item=>dbH('span',{key:item.code || 'cash',style:{flex:item.value,background:colors(item),opacity:item.opacity},title:item.name+' '+(item.value/account.equity*100).toFixed(1)+'%'}))),
		          dbH('div',{className:'ia-db-allocation-list'},allocation.map(item=>dbH(item.code?'button':'div',{key:item.code || 'cash',className:'ia-db-allocation-item',...(item.code?{type:'button',onClick:()=>choose(item.code),'aria-label':tr("ui.view")+item.name+tr("ui.price.chart")}:{})},
		            dbH('i',{style:{background:colors(item),opacity:item.opacity},'aria-hidden':true}),dbH('span',null,item.name),dbH('span',{className:'ia-db-muted'},(item.value/account.equity*100).toFixed(1)+'%'))))):dbH('div',{className:'ia-empty'},tr("ui.no.allocation.data.available"))),
		        dbH('section',{className:'ia-db-panel'},panelHead(tr("ui.trade.history"),tr("ui.latest.5.simulated.fills")),trades.length?dbH('div',{className:'ia-db-ledger'},trades.slice(-5).reverse().map((trade,i)=>dbH('div',{className:'ia-db-trade',key:trade.id || trade.date+':'+i},
		          dbH('span',{className:'ia-db-trade-label','data-side':trade.action==='BUY'?'buy':'sell'},trade.action==='BUY'?tr("ui.buy"):tr("ui.sell")),
		          dbH('div',{className:'ia-db-trade-copy'},dbH('b',null,holding.name),dbH('span',{className:'ia-db-muted'},trade.date.replace('T',' ').slice(5,16)+' · '+dbMoney(trade.shares,'',0)+tr("ui.shares.2")+dbMoney(trade.price,currency))),
		          dbH('span',{className:'ia-db-muted ia-num'},dbMoney(trade.shares*trade.price,currency))))):dbH('div',{className:'ia-empty'},holding?tr("ui.no.simulated.trades.for.this.security"):tr("ui.select.a.holding.to.view.its.trades")))),
		      dbH('section',{className:'ia-db-panel ia-db-activity'},panelHead(tr("ui.operations.and.research"),status.operation_mode==='automatic'?tr("ui.automatic"):tr("ui.manual")),
		        dbH('div',{className:'ia-db-activity-grid'},dbH('div',null,dbH('b',null,tr("ui.risk")+riskLabel),dbH('p',{className:'ia-db-muted'},tr("ui.strategy")+(strategyName(status.mandate)))),
		          dbH('div',null,dbH('b',null,marketName[market]+tr("ui.next.round.3")),dbH('p',{className:'ia-db-muted'},String(nextCycle ?? tr("ui.not.scheduled")).replace('T',' ').slice(0,16))),
		          dbH('div',null,dbH('b',null,tr("ui.recent.round.reports")),reports.length?dbH('ul',null,reports.slice(0,3).map(report=>dbH('li',{key:report.file},report.file))):dbH('p',{className:'ia-db-muted'},tr("ui.no.round.reports.yet")))),
		        summary.analysis?dbH('p',{className:'ia-db-muted'},tr("ui.latest.analysis")+(marketName[summary.analysis.market] ?? summary.analysis.market)+' · '+analysisStageLabel(summary.analysis.current_stage)+' · Agent '+analysisTaskCounts(summary.analysis).completed+'/'+Math.max(Number(summary.analysis.expected_agents ?? 0),analysisTaskCounts(summary.analysis).total)):null,
		        onOpenAnalysis?dbH('button',{type:'button',className:'ia-btn ia-elev',onClick:onOpenAnalysis},tr("ui.open.analysis.workflow.and.reports")):null),
		      typeof summary.macro?.content==='string' && summary.macro.content?dbH('section',{className:'ia-card ia-news',style:{marginTop:14}},panelHead(tr("ui.market.briefing"),tr("ui.collected.at.08.00.each.trading.day.asia.shanghai")),dbH('div',{className:'ia-news-body'},renderMarkdown(summary.macro.content))):null));

		}
		injectSheet(CSS_ID + "/dashboard", "﻿/* Holdings and price chart share the existing product's colour/type tokens. */\n.ia-db-page{color:var(--ia-text-1)}\n.ia-db-page button,.ia-db-page input{font:inherit}\n.ia-db-page button{cursor:pointer}\n.ia-db-page button:disabled{cursor:default;opacity:.5}\n.ia-db-page button:focus-visible,.ia-db-page input:focus-visible{outline:2px solid var(--ia-accent);outline-offset:3px}\n.ia-db-muted{color:var(--ia-text-3);font-size:var(--ia-fs-caption);line-height:1.55}\n.ia-db-market-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}\n.ia-db-market-picker,.ia-db-choices{display:flex;gap:4px;flex-wrap:wrap}.ia-db-choices{background:#EDF1F7;padding:3px;border-radius:12px}\n.ia-db-market-picker{background:#EDF1F7;padding:4px;border-radius:14px}\n.ia-db-market-picker button,.ia-db-choices button{border:0;background:transparent;color:var(--ia-text-3);border-radius:10px;padding:8px 18px;font-size:var(--ia-fs-body-sm);white-space:nowrap}\n.ia-db-market-picker button[aria-pressed=true]{background:var(--ia-surface);color:var(--ia-accent-text);box-shadow:var(--ia-shadow-xs)}\n.ia-db-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}\n.ia-db-metric,.ia-db-panel{background:var(--ia-surface);border:1px solid var(--ia-border-subtle);border-radius:var(--ia-r-card);min-width:0;box-shadow:var(--ia-shadow-sm)}\n.ia-db-metric{padding:18px 20px}\n.ia-db-metric-value{font-size:clamp(20px,2.2vw,30px);font-weight:650;line-height:1.25;letter-spacing:-.03em;font-family:var(--ia-font-num);font-variant-numeric:tabular-nums;margin:10px 0 7px;overflow-wrap:anywhere}\n.ia-db-panel{padding:20px}\n.ia-db-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}\n.ia-db-panel-head h3{margin:0;font-size:var(--ia-fs-body);font-weight:600}\n.ia-db-panel-head>span{color:var(--ia-text-3);font-size:var(--ia-fs-caption)}\n.ia-db-workbench{display:grid;grid-template-columns:330px minmax(0,1fr);gap:16px;align-items:stretch}.ia-db-workbench>.ia-db-panel{min-height:0}.ia-db-watch{display:flex;flex-direction:column}\n.ia-db-stock-list{display:flex;flex-direction:column;gap:8px}\n.ia-db-stock{width:100%;text-align:left;background:transparent;color:var(--ia-text-1);border:1px solid transparent;border-radius:16px;padding:13px 12px;transition:background-color var(--ia-dur-fast)}\n.ia-db-stock:hover{background:var(--ia-surface-2)}\n.ia-db-stock[aria-pressed=true]{background:color-mix(in srgb,var(--ia-viz-1) 8%,var(--ia-surface));border-color:var(--ia-viz-1)}\n.ia-db-stock-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:3px}\n.ia-db-stock-row b{font-size:var(--ia-fs-body-sm);font-weight:500;min-width:0;overflow-wrap:anywhere}\n.ia-db-stock-row .ia-num{flex:none;font-variant-numeric:tabular-nums;font-size:var(--ia-fs-body-sm)}\n.ia-db-stock-row .ia-trend{font-size:var(--ia-fs-caption)}\n.ia-db-spark,.ia-db-spark-empty{height:38px;margin:9px 0 5px;width:100%}\n.ia-db-spark svg{display:block;width:100%;height:38px}\n.ia-db-spark-empty{display:flex;align-items:center;color:var(--ia-text-3);font-size:var(--ia-fs-caption)}\n.ia-db-stock-date{font-size:11px;color:var(--ia-text-3);display:block}\n.ia-db-watch-foot{margin-top:16px;font-size:var(--ia-fs-caption);color:var(--ia-text-3)}\n.ia-db-focus-head{display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:16px}\n.ia-db-focus-head h2{font-size:var(--ia-fs-h3);font-weight:600;margin:0 0 4px;overflow-wrap:anywhere}\n.ia-db-quote{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none}\n.ia-db-quote strong{font-size:clamp(22px,2.4vw,32px);font-family:var(--ia-font-num);font-variant-numeric:tabular-nums;line-height:1.3}\n.ia-db-quote .ia-trend{font-size:var(--ia-fs-caption)}\n.ia-db-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--ia-border-subtle)}\n.ia-db-choices button{padding:6px 10px;font-size:var(--ia-fs-caption)}\n.ia-db-choices button[aria-pressed=true]{background:var(--ia-surface-2);color:var(--ia-accent-text)}\n.ia-db-chart{min-width:0}\n.ia-db-readout{min-height:52px;padding:12px 0 8px;display:flex;align-items:baseline;gap:5px 10px;flex-wrap:wrap;font-size:var(--ia-fs-caption);color:var(--ia-text-3);font-variant-numeric:tabular-nums}\n.ia-db-readout b{font-weight:500;color:var(--ia-text-2)}\n.ia-db-main-chart{display:block;width:100%;touch-action:pan-y}\n.ia-db-main-chart text{fill:var(--ia-text-3);font-family:var(--ia-font-num);font-size:11px}\n.ia-db-grid{stroke:var(--ia-border-subtle);stroke-width:1}\n.ia-db-area{fill:var(--ia-viz-1);opacity:.07}\n.ia-db-price-line{stroke:var(--ia-viz-1)}\n.ia-db-ma{stroke:var(--ia-viz-2)}\n.ia-db-cost{stroke:var(--ia-viz-3);stroke-width:1.2}\n.ia-db-volume{fill:var(--ia-viz-1);opacity:.22}\n.ia-db-guide{stroke:var(--ia-text-3);stroke-width:1;stroke-dasharray:3 4;pointer-events:none}\n.ia-db-trade-mark circle{fill:var(--ia-surface);stroke:var(--ia-viz-1);stroke-width:2}\n.ia-db-date-slider{display:flex;align-items:center;gap:12px;margin:3px 0 10px;font-size:var(--ia-fs-caption);color:var(--ia-text-3)}\n.ia-db-date-slider>span{white-space:nowrap}\n.ia-db-date-slider input{width:100%;min-width:0;accent-color:var(--ia-viz-1)}\n.ia-db-options{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap;font-size:var(--ia-fs-caption);color:var(--ia-text-2);margin:12px 0}\n.ia-db-options label{display:flex;gap:5px;align-items:center;cursor:pointer}\n.ia-db-options input{accent-color:var(--ia-viz-1)}\n.ia-db-provenance{display:flex;flex-direction:column;gap:4px;color:var(--ia-text-3);font-size:11px;line-height:1.6;overflow-wrap:anywhere}\n.ia-db-data-warning{color:var(--ia-warn-text)}\n.ia-db-position{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--ia-border-subtle)}\n.ia-db-position strong{display:block;margin-top:5px;font-size:var(--ia-fs-body-sm);font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}\n.ia-db-position-date{margin-top:12px;font-size:11px}\n.ia-db-chart-empty{min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;color:var(--ia-text-3);font-size:var(--ia-fs-body-sm);padding:20px;overflow-wrap:anywhere}\n.ia-db-chart-empty p{margin:0;max-width:100%}\n.ia-db-skeleton{height:160px;width:100%;border-radius:12px;background:linear-gradient(180deg,var(--ia-surface-2),var(--ia-surface))}\n.ia-db-secondary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.18fr);gap:16px;margin-top:16px}\n.ia-db-allocation{display:flex;gap:3px;height:18px;border-radius:6px;overflow:hidden;margin:22px 0 18px}\n.ia-db-allocation span{min-width:0}\n.ia-db-allocation-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}\n.ia-db-allocation-item{display:flex;align-items:center;gap:8px;padding:0;text-align:left;font-size:var(--ia-fs-caption);color:var(--ia-text-1);background:none;border:0;min-width:0}\n.ia-db-allocation-item i{width:8px;height:8px;border-radius:2px;flex:none}\n.ia-db-allocation-item>span:first-of-type{min-width:0;overflow-wrap:anywhere}\n.ia-db-allocation-item>span:last-child{margin-left:auto;flex:none;font-variant-numeric:tabular-nums}\n.ia-db-trade{display:flex;align-items:start;gap:10px;padding:13px 0;border-bottom:1px solid var(--ia-border-subtle)}\n.ia-db-trade:last-of-type{border:0}\n.ia-db-trade-label{display:grid;place-items:center;width:30px;height:30px;flex:none;background:var(--ia-surface-2);color:var(--ia-accent-text);border-radius:10px;font-size:var(--ia-fs-caption)}\n.ia-db-trade-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px;overflow-wrap:anywhere}\n.ia-db-trade-copy b{font-size:var(--ia-fs-body-sm);font-weight:500}\n.ia-db-trade>.ia-db-muted{white-space:nowrap}\n.ia-db-trade-note{margin-top:10px;font-size:11px}\n.ia-db-activity{margin-top:16px}\n.ia-db-activity-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}\n.ia-db-activity-grid b{font-weight:500;font-size:var(--ia-fs-body-sm)}\n.ia-db-activity-grid p{margin:6px 0 0}\n.ia-db-activity-grid ul{margin:6px 0 0;padding-left:18px;color:var(--ia-text-3);font-size:var(--ia-fs-caption);overflow-wrap:anywhere}\n@media(max-width:1100px){.ia-db-workbench{grid-template-columns:215px minmax(0,1fr)}.ia-db-position{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-db-panel{padding:18px}.ia-db-metric{padding:16px}}\n@media(max-width:860px){.ia-db-workbench{grid-template-columns:1fr}.ia-db-stock-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.ia-db-watch-foot{display:none}.ia-db-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-db-secondary{grid-template-columns:1fr}.ia-db-activity-grid{grid-template-columns:1fr 1fr}}\n@media(max-width:500px){.ia-db-panel{padding:14px}.ia-db-stock-row{flex-wrap:wrap}.ia-db-stock{padding:10px}.ia-db-focus-head{flex-wrap:wrap}.ia-db-focus-head h2{font-size:20px}.ia-db-quote strong{font-size:24px}.ia-db-market-picker{width:100%;justify-content:space-between}.ia-db-market-picker button{padding:8px 12px}.ia-db-metric{padding:14px 12px}.ia-db-activity-grid{grid-template-columns:1fr}.ia-db-readout{min-height:66px}.ia-db-allocation-list{gap:10px}.ia-db-panel-head{flex-wrap:wrap}.ia-db-trade{flex-wrap:wrap}}\n@media(max-width:600px){.ia-db-page .ia-page-head{height:auto;min-height:100px;padding:16px;display:block}.ia-db-page .ia-page-title{white-space:nowrap}.ia-db-page .ia-page-status{margin-top:10px;justify-content:flex-start}.ia-db-page .ia-page-content{padding:14px 10px}.ia-db-allocation-list{grid-template-columns:1fr}}\n@media(max-width:420px){.ia-db-metrics,.ia-db-stock-list{grid-template-columns:1fr}.ia-db-quote{align-items:flex-start}.ia-db-position{gap:12px 8px}}\n@media(pointer:coarse){.ia-db-market-picker button,.ia-db-choices button,.ia-db-options label,.ia-db-allocation-item{min-height:44px}.ia-db-date-slider input{min-height:44px}}\n/* Sliding segmented control + chart draw-in. The thumb is rendered by the\n   component; these rules only position it and neutralise the old \"active\n   button paints itself\" styling that would hide the thumb. */\n.ia-db-market-picker,.ia-db-choices{position:relative}\n.ia-db-market-picker>.ia-seg-thumb{top:4px;bottom:4px;border-radius:10px}\n.ia-db-choices>.ia-seg-thumb{top:3px;bottom:3px;border-radius:9px}\n.ia-db-market-picker>button,.ia-db-choices>button{position:relative;z-index:1}\n.ia-db-market-picker>button[aria-pressed=true],.ia-db-choices>button[aria-pressed=true]{background:transparent!important;box-shadow:none!important;color:var(--ia-accent-text)}\n.ia-db-price-line{stroke-dasharray:1;stroke-dashoffset:1;animation:ia-db-draw 1.1s cubic-bezier(.4,0,.2,1) .12s forwards}\n.ia-db-area{animation:ia-db-area-in .9s ease .2s backwards}\n@keyframes ia-db-draw{to{stroke-dashoffset:0}}\n@keyframes ia-db-area-in{from{opacity:0}to{opacity:1}}\n@media(prefers-reduced-motion:reduce){.ia-db-price-line,.ia-db-area{animation:none!important;stroke-dasharray:none;stroke-dashoffset:0}}\n\n/* ── status band: equity + stats + market switch (demo layout) ─────────── */\n.ia-db-band{display:grid;grid-template-columns:minmax(228px,auto) minmax(0,1fr) auto;gap:26px;align-items:center;padding:18px 22px;border:1px solid var(--ia-border-subtle);border-radius:var(--ia-r-card);background:var(--ia-surface);box-shadow:var(--ia-shadow-sm);margin-bottom:16px}\n.ia-db-band-main{min-width:0}\n.ia-db-band-label{display:block;font-size:12px;line-height:18px;color:var(--ia-text-3)}\n.ia-db-band-equity{font-size:30px;font-weight:650;line-height:1.25;letter-spacing:-.02em;margin-top:2px}\n.ia-db-band-sub{margin-top:4px;font-size:12px;line-height:18px;color:var(--ia-text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ia-db-band-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));min-width:0}\n.ia-db-band-stat{padding:2px 20px;border-left:1px solid var(--ia-border-subtle);min-width:0}\n.ia-db-band-stat:first-child{border-left:0;padding-left:0}\n.ia-db-band-stat b{display:block;margin:3px 0 2px;font-size:18px;font-weight:600;line-height:1.35;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ia-db-band-detail{display:block;font-size:11px;line-height:16px;color:var(--ia-text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ia-db-band-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}\n.ia-db-primary{white-space:nowrap}\n@media(max-width:1280px){.ia-db-band{grid-template-columns:minmax(200px,auto) minmax(0,1fr);gap:18px}.ia-db-band-actions{grid-column:1 / -1;justify-content:flex-start}}\n@media(max-width:860px){.ia-db-band{grid-template-columns:1fr;gap:14px}.ia-db-band-stats{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:14px}.ia-db-band-stat{padding:0}.ia-db-band-stat:nth-child(odd){border-left:0}}\n\n/* ── holdings meta · chart code chips · round timeline ────────────────── */\n.ia-db-stock-meta{display:block;margin-top:2px;font-size:11px;line-height:16px;color:var(--ia-text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ia-db-chart-chips{display:flex;gap:5px;margin-right:12px}\n.ia-db-chart-chips button{border:1px solid var(--ia-border-subtle);background:var(--ia-surface);color:var(--ia-text-3);border-radius:var(--ia-r-full);padding:3px 10px;font-size:12px;line-height:18px}\n.ia-db-chart-chips button[aria-pressed=true]{background:color-mix(in srgb,var(--ia-viz-1) 10%,var(--ia-surface));border-color:color-mix(in srgb,var(--ia-viz-1) 45%,var(--ia-border-subtle));color:var(--ia-accent-text);font-weight:600}\n.ia-db-timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}\n.ia-db-timeline li{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 8px;border-top:1px solid var(--ia-border-subtle);font-size:var(--ia-fs-caption)}\n.ia-db-timeline li:first-child{border-top:0}\n.ia-db-timeline li[data-current=true]{background:color-mix(in srgb,var(--ia-viz-1) 7%,var(--ia-surface));border-radius:10px}\n.ia-db-timeline .ia-num{color:var(--ia-text-3);font-size:12px;font-variant-numeric:tabular-nums}\n.ia-db-timeline-copy{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ia-db-trade-label[data-side=buy]{background:color-mix(in srgb,var(--ia-viz-1) 12%,var(--ia-surface));color:var(--ia-accent-text)}\n.ia-db-trade-label[data-side=sell]{background:color-mix(in srgb,var(--ia-ok) 14%,var(--ia-surface));color:var(--ia-ok-text)}\n");
		/* DASHBOARD:END */

		// The workflow board. Each band carries the engine stages it covers, so the
		// diagram reports real progress instead of only the shape of the pipeline.
		// The phase string is the engine's own `agent.phase` value, which is why
		// 02/03 share one engine stage but remain two bands: they are two distinct
		// phases inside it. `preparing` is the only band with no engine stage.
		const workflowBands = [
			[tr("ui.01.data.preparation"), [[tr("ui.market.status"), "primary"], [tr("ui.screen.candidates")], [tr("ui.holdings.mandate")]], [], "preparing"],
			[tr("ui.02.security.research"), [[tr("ui.technical.analysis")], [tr("ui.fundamentals")], [tr("ui.news")], [tr("ui.sentiment")]], ["base_research"], tr("ui.four.base.research.roles")],
			[tr("ui.03.research.review"), [[tr("ui.bull.researcher")], [tr("ui.bear.researcher")], [tr("ui.research.manager"), "primary"]], ["research_debate"], tr("ui.research.debate.and.security.review")],
			[tr("ui.04.portfolio.construction"), [[tr("ui.security.trader")], [tr("ui.portfolio.manager.draft"), "primary"]], ["portfolio_draft"], tr("ui.portfolio.draft")],
			[tr("ui.05.risk.review"), [[tr("ui.aggressive.perspective")], [tr("ui.conservative.perspective")], [tr("ui.neutral.perspective")], [tr("ui.risk.manager"), "primary"]], ["risk_review"], tr("ui.risk.debate")],
			[tr("ui.06.decisions.and.execution"), [[tr("ui.final.portfolio.decision"), "primary"], [tr("ui.hard.risk.checks"), "guard"], [tr("ui.paper.execution.report")]], ["final_decision"], tr("ui.final.decision")]
		];

		/**
		 * Progress for one workflow band, read from the round's own records.
		 * Agents carry `phase` (band-level name) and `stage` (engine key), so the
		 * mapping comes from the data rather than from guessing at display names.
		 * The stage timeline is authoritative for the band state even before any
		 * agent reports, which is what lets the diagram light up as a round
		 * advances instead of waiting on individual roles.
		 */
		function bandProgress(analysis, stages, phase) {
			const agentMap = analysis?.agents && typeof analysis.agents === "object" ? analysis.agents : {};
			const rows = Object.values(agentMap).filter((agent) => {
				const agentStage = String(agent?.stage ?? "");
				const agentPhase = String(agent?.phase ?? "");
				return (stages.length > 0 && stages.includes(agentStage)) || (phase && agentPhase === phase);
			});
			const statusOf = (value) => String(value ?? "");
			const done = rows.filter((agent) => statusOf(agent?.status) === "completed").length;
			const running = rows.filter((agent) => statusOf(agent?.status) === "running").length;
			const failed = rows.filter((agent) => statusOf(agent?.status) === "failed").length;
			const stageStates = stages.map((key) => statusOf(analysis?.stages?.[key]?.status));
			let status = "idle";
			if (stageStates.includes("running") || running > 0) status = "running";
			else if (stageStates.includes("failed")) status = "failed";
			else if (rows.length > 0 && failed > 0 && done + failed >= rows.length) status = "failed";
			else if (stageStates.some((value) => value === "completed")) status = "completed";
			else if (rows.length > 0 && done === rows.length) status = "completed";
			// Band 01 has no engine stage: it is "in progress" while the round is
			// booting and "done" once the first real stage reports.
			else if (phase === "preparing" && statusOf(analysis?.status) === "running") status = "running";
			const elapsed = stages.reduce((total, key) => total + Number(analysis?.stages?.[key]?.duration_ms ?? 0), 0);
			return { total: rows.length, done, running, failed, status, elapsed };
		}
		const analysisStageNames = {
			get preparing(){return tr("ui.preparing.data");},
			get resuming(){return tr("ui.restoring.checkpoints");},
			get base_research(){return tr("ui.four.base.research.roles");},
			get research_debate(){return tr("ui.bull.bear.debate.and.research.review");},
			get portfolio_draft(){return tr("ui.portfolio.draft");},
			get risk_review(){return tr("ui.risk.debate.and.review");},
			get final_decision(){return tr("ui.final.portfolio.decision");},
			get execution(){return tr("ui.hard.risk.controls.and.paper.execution");},
			get ready_for_execution(){return tr("ui.awaiting.approval");},
			get completed(){return tr("ui.completed");},
			get failed(){return tr("ui.failed");},
			get cancelled(){return tr("ui.stopped.2");}
		};
		function analysisStageLabel(stage) {
            if (stage === "screening") return localeTag() === "en-US" ? "Stock screening" : "筛选股票";
            if (stage === "data_preparation") return localeTag() === "en-US" ? "Shared evidence" : "资料准备";
			return analysisStageNames[stage] ?? (stage || tr("ui.not.run.yet"));
		}
		function checkpointState(analysis, stages) {
			if (!analysis) return tr("ui.stopped");
			// Gate on the engine's own stage/cp keys. This used to be called with
			// ["execution"], which the engine never emits -- its stages are
			// base_research / research_debate / portfolio_draft / risk_review /
			// final_decision -- so that row reported "等待中" forever, even on a
			// completed round. Read both maps: `checkpoints` carries per-stage
			// checkpoints and `stages` carries the timeline.
			const marks = [analysis?.checkpoints ?? {}, analysis?.stages ?? {}];
			for (const stage of stages) {
				const done = marks.some((map) => String(map?.[stage]?.status ?? "") === "completed");
				if (done) return tr("ui.completed");
			}
			const running = marks.some((map) => String(map?.[analysis?.current_stage]?.status ?? "") === "running");
			if (stages.includes(analysis?.current_stage) && (running || analysis?.status === "running")) return tr("ui.running");
			return tr("ui.waiting");
		}

		// The five 流程验收 rows, mapped onto the stages the engine actually writes.
		// Kept as data so the keys cannot silently drift out of the engine again.
		const workflowCheckKeys = [
			[tr("ui.isolated.roles.and.per.security.research"), ["base_research"]],
			[tr("ui.evidence.scope.and.citation.checks"), ["base_research"]],
			[tr("ui.failure.handling.and.safe.hold"), ["final_decision"]],
			[tr("ui.stage.checkpoints.and.recovery"), []],
			[tr("ui.hard.risk.controls.and.paper.execution"), ["final_decision"]]
		];

		/** A round with a terminal success must not report every check as pending. */
		function workflowChecksSane(rows, analysis) {
			const status = String(analysis?.status ?? "");
			if (status !== "completed" && status !== "ready_for_execution") return true;
			return rows.some(([, detail]) => detail !== tr("ui.waiting") && detail !== tr("ui.stopped"));
		}

		function AssistantContext({ onClose, onOpenWorkflow }) {
			const summaryState = useInvestmentSummary(5000);
			const status = summaryState.data?.status ?? {};
			const engineError = summaryState.error || status.error || "";
			const mandate = status.mandate ?? {};
			const control = status.control ?? {};
			const reports = Array.isArray(summaryState.data?.reports?.reports) ? summaryState.data.reports.reports : [];
			const nextRun = Object.entries(status.markets ?? {}).map(([market, value]) => [market, value?.next_cycle]).filter((entry) => entry[1]).sort((a, b) => String(a[1]).localeCompare(String(b[1])))[0];
			const analysis = summaryState.data?.analysis ?? null;
			return react_jsx_runtime.jsxs("aside", {
				className: "ia-context",
				children: [
					react_jsx_runtime.jsxs("div", { className: "ia-context-head", children: [react_jsx_runtime.jsx("strong", { children: tr("ui.investment.context") }), react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-static ia-elev-sm ia-iconbtn", type: "button", title: tr("ui.collapse.context"), onClick: onClose, children: "›" })] }),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: tr("ui.environment") }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.trading.mode") }), react_jsx_runtime.jsx("b", { children: tr("ui.paper.trading") })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.strategy.2") }), react_jsx_runtime.jsx("b", { children: strategyName(mandate) })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.autonomous.operation") }), react_jsx_runtime.jsx("b", { children: engineError ? tr("ui.unknown") : status.operation_mode === "automatic" ? tr("ui.enabled") : tr("ui.manual.2") })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.risk.status") }), react_jsx_runtime.jsx("b", { children: engineError ? tr("ui.unknown") : control.kill_switch ? tr("ui.emergency.stop") : control.paused ? tr("ui.paused") : tr("ui.normal") })] })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: tr("ui.analysis.workflow") }),
							react_jsx_runtime.jsx("span", { className: "ia-context-chip", children: analysis ? tr("ui.current") + analysisStageLabel(analysis.current_stage) : tr("ui.current.no.rounds.yet") }),
							react_jsx_runtime.jsx("p", { className: "ia-context-note", children: analysis ? tr("ui.research.agents") + analysisTaskCounts(analysis).completed + "/" + Math.max(Number(analysis.expected_agents ?? 0), analysisTaskCounts(analysis).total) + tr("ui.evidence") + (analysis.evidence_count ?? 0) + tr("ui.items") : tr("ui.live.stages.and.checkpoints.appear.when.a.manual.or.automatic.round.starts") }),
							react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-context-link", type: "button", onClick: onOpenWorkflow, children: tr("ui.view.full.analysis.workflow") })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: tr("ui.recent.activity") }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.next.round.2") }), react_jsx_runtime.jsx("b", { children: nextRun ? marketName[nextRun[0]] + " · " + String(nextRun[1]).replace("T", " ").slice(0, 16) : "-" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: tr("ui.latest.report") }), react_jsx_runtime.jsx("b", { children: reports[0]?.file ?? tr("ui.none.yet") })] })
						]
					})
				]
			});
		}

		// ── assistant status strip (demo layout): trading mode / strategy / risk /
		// current round / evidence count, with the context panel behind a button. ──
		function AssistantStatusStrip({ contextOpen, onToggleContext }) {
			const summaryState = useInvestmentSummary(5000);
			const summary = summaryState.data ?? {};
			const status = summary.status ?? {};
			const control = status.control ?? {};
			const mandate = status.mandate ?? {};
			const analysis = summary.analysis ?? null;
			const engineError = summaryState.error || status.error || "";
			const market = engineError ? tr("ui.disconnected") : tr("ui.paper.trading");
			const risk = engineError ? tr("ui.unknown") : control.kill_switch ? tr("ui.emergency.stop") : control.paused ? tr("ui.paused") : tr("ui.normal");
			const riskKind = engineError || control.kill_switch ? "danger" : control.paused ? "warn" : "ok";
			const round = analysis ? analysisStatusLabel(analysis.status) : tr("ui.no.rounds.yet");
			const evidence = analysis?.evidence_count ?? 0;
			return react_jsx_runtime.jsxs("div", {
				className: "ia-assist-strip",
				children: [
					react_jsx_runtime.jsxs("span", { className: "ia-assist-item", children: [react_jsx_runtime.jsx("i", { className: "ia-dot", "data-kind": engineError ? "danger" : "ok" }), market] }),
					react_jsx_runtime.jsx("span", { className: "ia-assist-sep" }),
					react_jsx_runtime.jsxs("span", { className: "ia-assist-item", children: [tr("ui.strategy.3"), react_jsx_runtime.jsx("b", { children: strategyName(mandate) })] }),
					react_jsx_runtime.jsx("span", { className: "ia-assist-sep" }),
					react_jsx_runtime.jsxs("span", { className: "ia-assist-item", children: [react_jsx_runtime.jsx("i", { className: "ia-dot", "data-kind": riskKind }), tr("ui.risk.2"), react_jsx_runtime.jsx("b", { children: risk })] }),
					react_jsx_runtime.jsx("span", { className: "ia-assist-sep" }),
					react_jsx_runtime.jsxs("span", { className: "ia-assist-item", children: [tr("ui.current.round"), react_jsx_runtime.jsx("b", { children: round })] }),
					react_jsx_runtime.jsx("span", { className: "ia-assist-sep" }),
					react_jsx_runtime.jsxs("span", { className: "ia-assist-item", children: [tr("ui.evidence.2"), react_jsx_runtime.jsx("b", { children: String(evidence) })] }),
					react_jsx_runtime.jsx("button", {
						type: "button",
						className: "ia-assist-ctx",
						"aria-pressed": contextOpen,
						onClick: onToggleContext,
						children: tr("ui.context")
					})
				]
			});
		}

		// ── analysis centre: manual start · live pipeline · round reports ───
		//
		// Consumes ONLY the product-shell proxy contract
		// (/api/investment/analysis?action=…, /api/investment/reports?action=…),
		// so the browser never sees the engine loopback URL or its access token.
		// Nothing below is a hard-coded workflow diagram: the stage timeline, the
		// sub-task cards, the logs and the report rows are all rendered straight
		// out of the engine payload (analysis record v2 {stages, agents, logs} +
		// reports index).  A v1 record simply carries fewer fields.
		const analysisMarkets = () => [["cn", tr("ui.mainland.china")], ["hk", tr("ui.hong.kong")], ["us", tr("ui.united.states")], ["etf", "ETF"]];
		const MAX_ANALYSIS_SYMBOLS = 8;
		// A screening result older than this is re-run before a new analysis round.
		const SCREENING_TTL_MINUTES = 30;
		const ANALYSIS_PENDING_KEY = "ia.analysis.pending";
		const ANALYSIS_POLL_RUNNING_MS = 2000;
		const ANALYSIS_POLL_IDLE_MS = 8000;
		// Display metadata only: canonical stage order + the contract's stage
		// labels.  Statuses, durations and counts always come from the API.
		const analysisStageOrder = ["preparing", "resuming", "screening", "data_preparation", "base_research", "research_debate", "portfolio_draft", "risk_review", "final_decision", "execution", "ready_for_execution"];
		const analysisTerminalStatuses = ["completed", "failed", "cancelled"];
		const analysisStatusNames = {
			get queued(){return tr("ui.queued");},
			get pending(){return tr("ui.not.started");},
			get idle(){return tr("ui.not.started");},
			get running(){return tr("ui.running");},
			get ready_for_execution(){return tr("ui.awaiting.approval");},
			get completed(){return tr("ui.completed");},
			get failed(){return tr("ui.failed");},
			get cancelled(){return tr("ui.stopped.2");}
		};
		function analysisStatusLabel(status) {
			const key = String(status ?? "");
			return analysisStatusNames[key] ?? (key || tr("ui.not.started"));
		}
		function analysisStatusKind(status) {
			const key = String(status ?? "");
			// A round that finished and is waiting for approval is a success state,
			// not a warning: keep the chip and the page header in the same colour.
			if (key === "completed" || key === "ready_for_execution") return "ok";
			if (key === "failed" || key === "cancelled") return "danger";
			return "warn";
		}
		function isAnalysisTerminal(status) {
			return analysisTerminalStatuses.includes(String(status ?? ""));
		}
		function parseAnalysisSymbols(text) {
			const values = [];
			for (const chunk of String(text ?? "").split(/[\s,;，；、]+/)) {
				const symbol = chunk.trim();
				if (symbol && !values.includes(symbol)) values.push(symbol);
			}
			return values;
		}
		function newAnalysisCycleId(market, label) {
			// crypto.randomUUID() needs a secure context (127.0.0.1 counts as
			// one); keep a dependency-free fallback for anything else.
			let suffix = "";
			try {
				if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
			} catch (error) {
				suffix = "";
			}
			if (!suffix) suffix = Math.random().toString(16).slice(2, 10);
			const safeLabel = String(label ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) || "manual";
			return new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + market + "-" + safeLabel + "-" + suffix;
		}
		function normalizeAnalysisSymbols(text, market) {
			const symbols = [], invalid = [];
			for (const value of parseAnalysisSymbols(text)) {
				const explicitMarket = value.match(/^(HK|SH|SZ|BJ)(?=\d)|\.(HK|SH|SZ|BJ|US)$/i);
				const tag = (explicitMarket?.[1] || explicitMarket?.[2] || "").toUpperCase();
				if (tag && (tag === "HK" ? market !== "hk" : tag === "US" ? market !== "us" : !["cn", "etf"].includes(market))) { invalid.push(value); continue; }
				let code = value.normalize("NFKC").toUpperCase().replace(/^(HK|SH|SZ|BJ)(?=\d)/, "").replace(/\.(HK|SH|SZ|BJ|US)$/, "");
				if (market === "hk" && /^\d{1,5}$/.test(code)) code = code.padStart(5, "0");
				else if (["cn", "etf"].includes(market) && /^\d{1,6}$/.test(code)) code = code.padStart(6, "0");
				else if (!(market === "us" && /^[A-Z][A-Z0-9.-]{0,15}$/.test(code))) { invalid.push(value); continue; }
				if (!symbols.includes(code)) symbols.push(code);
			}
			return { symbols, invalid };
		}
		function readPendingAnalysis() {
			try {
				if (typeof sessionStorage === "undefined") return null;
				const raw = sessionStorage.getItem(ANALYSIS_PENDING_KEY);
				if (!raw) return null;
				const value = JSON.parse(raw);
				return value && typeof value === "object" && value.cycle_id ? value : null;
			} catch (error) {
				return null;
			}
		}
		function writePendingAnalysis(value) {
			try {
				if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ANALYSIS_PENDING_KEY, JSON.stringify(value));
			} catch (error) {
				// storage disabled: the in-memory snapshot still drives this tab
			}
			return value;
		}
		function formatDuration(ms) {
			const value = Number(ms);
			if (!Number.isFinite(value) || value <= 0) return "-";
			const seconds = Math.round(value / 1000);
			if (seconds < 60) return seconds + tr("ui.s.2");
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes + tr("ui.min") + String(seconds % 60).padStart(2, "0") + tr("ui.s.2");
			return Math.floor(minutes / 60) + tr("ui.h") + String(minutes % 60).padStart(2, "0") + tr("ui.min.2");
		}
		function formatClock(value) {
			return value ? String(value).replace("T", " ").slice(0, 19) : "-";
		}
		function formatBytes(value) {
			const size = Number(value);
			if (!Number.isFinite(size) || size <= 0) return "-";
			if (size < 1024) return size + " B";
			if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
			return (size / (1024 * 1024)).toFixed(1) + " MB";
		}
		function analysisTaskCounts(run) {
			const tasks = Object.values(run?.agents ?? {}).filter(value => value && typeof value === "object");
			return tasks.length ? { total: tasks.length, completed: tasks.filter(task => task.status === "completed").length, failed: tasks.filter(task => task.status === "failed").length }
				: { total: Number(run?.started_agents ?? 0), completed: Number(run?.completed_agents ?? 0), failed: Number(run?.failed_agents ?? 0) };
		}
		function stageMetaText(row) {
			// Only the fields the record actually carries are shown: a v1 record,
			// or a terminal marker row (completed/failed/cancelled), simply has
			// fewer parts instead of a fabricated "0/0".
			const parts = [analysisStatusLabel(row.status)];
			const total = Number(row.agents_total ?? 0);
			const done = Number(row.agents_done ?? 0);
			const failed = Number(row.agents_failed ?? 0);
			if (total > 0 || done > 0 || failed > 0) parts.push(tr("ui.tasks") + done + "/" + total + (failed > 0 ? tr("ui.failed.2") + failed : ""));
			if (typeof row.result_digest === "string" && row.result_digest.trim()) parts.push(row.result_digest.trim().slice(0, 140));
			return parts.join(" · ");
		}

        function stageFraction(row) { return measuredStageFraction(row); }
        function StageDot({ status, fraction, stage }) {
            const size=50, stroke=3.5, radius=(size-stroke)/2, circumference=2*Math.PI*radius;
            const kind=String(status??''), known=fraction!==null&&fraction!==undefined&&Number.isFinite(Number(fraction));
            const value=kind==='completed'?1:known?Math.max(0,Math.min(1,Number(fraction))):0;
            const stateKind=kind==='completed'?'ok':['failed','cancelled'].includes(kind)?'danger':kind==='running'?'accent':'idle';
            const color=stateKind==='ok'?'var(--ia-ok)':stateKind==='danger'?'var(--ia-danger)':stateKind==='accent'?'var(--ia-accent)':'var(--ia-idle)';
            const label=analysisStatusLabel(kind||'idle'), percent=Math.round(value*100);
            const mark=known||kind==='completed'?percent+'%':kind==='pending'||!kind?'0%':'—';
            return react.createElement('span',{
                className:'ia-an-ring','data-kind':stateKind,'data-status':kind,'data-indeterminate':!known&&kind!=='completed',
                role:'progressbar','aria-label':(stage?analysisStageLabel(stage)+' · ':'')+label,
                'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':known||kind==='completed'?percent:undefined,
                'aria-valuetext':known||kind==='completed'?percent+'%':label
            },react.createElement('svg',{width:size,height:size,viewBox:`0 0 ${size} ${size}`,'aria-hidden':true},
                react.createElement('circle',{className:'ia-an-ring-track',cx:size/2,cy:size/2,r:radius,fill:'none',strokeWidth:stroke}),
                react.createElement('circle',{className:'ia-an-ring-fill',cx:size/2,cy:size/2,r:radius,fill:'none',strokeWidth:stroke,stroke:color,strokeDasharray:String(circumference),strokeDashoffset:String(circumference*(1-value)),strokeLinecap:'round'})),
                react.createElement('span',{className:'ia-an-ring-mark','aria-hidden':true},mark));
        }
        function ResearchStageCards({run}) {
            const h=react.createElement, rows=researchStageRows(run);
            const completed=rows.filter(row=>row.status==='completed').length;
            const progress=rows.reduce((sum,row)=>sum+(stageFraction(row)??0),0)/rows.length;
            const percent=Math.round(progress*100);
            return h('section',{className:'ia-research-stage-summary','aria-label':tr('motion.stageTitle')},
                h('div',{className:'ia-research-stage-head'},h('h3',null,tr('motion.stageTitle')),h('span',null,completed+' / '+rows.length)),
                h('div',{className:'ia-stage-cards'},...rows.map(row=>h('div',{key:row.stage,className:'ia-stage-card','data-status':row.status},
                    h(StageDot,{status:row.status,fraction:stageFraction(row),stage:row.stage}),h('span',{className:'ia-stage-card-label'},['screening','data_preparation'].includes(row.stage)?analysisStageLabel(row.stage):tr('motion.stage.'+row.stage))))),
                h('div',{className:'ia-stage-total'},h('span',null,run&&!rows.some(row=>row.recorded)?tr('ui.no.stage.records.saved.for.this.round'):tr('motion.stageHint')),h('span',null,percent+'%')),
                h('div',{className:'ia-stage-total-track',role:'progressbar','aria-label':tr('motion.stageTitle'),'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':percent},h('div',{className:'ia-stage-total-fill',style:{transform:`scaleX(${progress})`}})));
        }

		function RoundProgress({ stages }) {
			// Round-level progress: completed stages over total stages, plus a
			// running pulse. Text-only status ("3/5 完成") stays in the header so a
			// reader who cannot see the bar still gets the number.
			const rows = Array.isArray(stages) ? stages : [];
			if (rows.length === 0) return null;
			const done = rows.filter((row) => String(row?.status ?? "") === "completed").length;
			const failed = rows.filter((row) => String(row?.status ?? "") === "failed").length;
			const running = rows.some((row) => String(row?.status ?? "") === "running");
			const value = rows.reduce((sum, row) => sum + (stageFraction(row) ?? 0), 0) / rows.length;
			const label = done + "/" + rows.length + tr("ui.stages.completed") + (failed > 0 ? tr("ui.failed.2") + failed : "") + (running ? tr("ui.in.progress.2") : "");
			return react_jsx_runtime.jsxs("div", {
				className: "ia-an-progress",
				"data-state": failed > 0 ? "failed" : running ? "running" : done === rows.length ? "completed" : "idle",
				children: [
					react_jsx_runtime.jsx("div", { className: "ia-an-progress-track", children: react_jsx_runtime.jsx("div", { className: "ia-an-progress-fill", style: { transform: "scaleX(" + value + ")" } }) }),
					react_jsx_runtime.jsxs("div", { className: "ia-an-progress-meta", children: [
						react_jsx_runtime.jsx("span", { children: label }),
						running ? react_jsx_runtime.jsx("span", { className: "ia-an-pulse", "aria-hidden": "true" }) : react_jsx_runtime.jsx("span", { children: Math.round(value * 100) + "%" })
					]})
				]
			});
		}

		function durationOf(row) {
			// analysis record -> duration_ms; report index rows only carry
			// started_at/finished_at, so derive the span instead of inventing one.
			if (row && Number.isFinite(Number(row.duration_ms))) return formatDuration(row.duration_ms);
			const start = Date.parse(String(row?.started_at ?? ""));
			const end = Date.parse(String(row?.finished_at ?? ""));
			if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return formatDuration(end - start);
			return "-";
		}
		async function fetchAnalysisRun(cycleId,signal) {
			if (!cycleId) return null;
			try {
				const payload = await jsonFetch("/api/investment/analysis?action=run&cycle_id=" + encodeURIComponent(cycleId),{signal});
				return payload?.analysis ?? null;
			} catch (error) {
				// 404 = the engine has not written the record yet (round spinning up).
				if (String(error?.message ?? error).includes("404")) return null;
				throw error;
			}
		}


        function useAnalysisRun(cycleId) {
            const active=useProductPageActive(),activeRef=react.useRef(active);activeRef.current=active;
            const [state,setState]=react.useState({data:null,error:'',loading:false});
            const cycleRef=react.useRef(cycleId),previousCycle=react.useRef(cycleId),requestRef=react.useRef(null);
            const status=String(state.data?.status??'');
            const intervalMs=isAnalysisTerminal(status)?0:status==='running'?ANALYSIS_POLL_RUNNING_MS:ANALYSIS_POLL_IDLE_MS;
            const load=react.useCallback(async()=>{
                const target=cycleRef.current;
                if(!target||!activeRef.current||document.hidden)return;
                if(requestRef.current?.target===target)return;
                requestRef.current?.controller.abort();
                const request={target,controller:new AbortController()};requestRef.current=request;
                try {
                    const record=await fetchAnalysisRun(target,request.controller.signal);
                    if(requestRef.current===request&&cycleRef.current===target&&activeRef.current)setState({data:record,error:'',loading:false});
                } catch(error) {
                    if(error?.name!=='AbortError'&&requestRef.current===request&&activeRef.current)setState(previous=>({...previous,error:String(error?.message??error),loading:false}));
                } finally {if(requestRef.current===request)requestRef.current=null;}
            },[]);
            react.useEffect(()=>{
                cycleRef.current=cycleId;
                if(previousCycle.current!==cycleId){previousCycle.current=cycleId;setState({data:null,error:'',loading:Boolean(cycleId)});}
                if(!active||!cycleId)return;
                load();
                const timer=intervalMs>0?setInterval(load,intervalMs):null;
                return()=>{if(timer)clearInterval(timer);requestRef.current?.controller.abort();requestRef.current=null;};
            },[cycleId,intervalMs,load,active]);
            react.useEffect(()=>{
                const onVisibility=()=>{if(!document.hidden)load();};
                document.addEventListener('visibilitychange',onVisibility);
                return()=>document.removeEventListener('visibilitychange',onVisibility);
            },[load]);
            return {...state,reload:load};
        }


        function useActiveRounds(intervalMs) {
            const active=useProductPageActive(),activeRef=react.useRef(active);activeRef.current=active;
            const requestRef=react.useRef(null),[state,setState]=react.useState({rounds:[],error:''});
            const load=react.useCallback(async()=>{
                if(!activeRef.current||document.hidden||requestRef.current)return;
                const controller=new AbortController();requestRef.current=controller;
                try {const payload=await jsonFetch('/api/investment/analysis?action=active',{signal:controller.signal});if(requestRef.current===controller&&activeRef.current)setState({rounds:Array.isArray(payload?.rounds)?payload.rounds:[],error:''});}
                catch(error){if(error?.name!=='AbortError'&&requestRef.current===controller&&activeRef.current)setState(previous=>({...previous,error:String(error?.message??error)}));}
                finally{if(requestRef.current===controller)requestRef.current=null;}
            },[]);
            react.useEffect(()=>{
                if(!active)return;
                load();const timer=setInterval(load,Math.max(ANALYSIS_POLL_RUNNING_MS,Number(intervalMs)||ANALYSIS_POLL_IDLE_MS));
                return()=>{clearInterval(timer);requestRef.current?.abort();requestRef.current=null;};
            },[load,intervalMs,active]);
            return {...state,reload:load};
        }

		function StockLookup({ market, onSelect }) {
			const h = react.createElement;
			const [query, setQuery] = react.useState("");
			const [composing, setComposing] = react.useState(false);
			const [active, setActive] = react.useState(-1);
			const [refreshing, setRefreshing] = react.useState(false);
			const [revision, setRevision] = react.useState(0);
			const [state, setState] = react.useState({ key: "", results: [], catalog: null, loading: false, error: "" });
			const key = market + "|" + query.trim();
			const results = state.key === key ? state.results : [];
			react.useEffect(() => {
				let cancelled = false;
				setActive(-1);
				if (composing) return undefined;
				const timer = setTimeout(async () => {
					setState(previous => ({ ...previous, key, results: [], loading: true, error: "" }));
					try {
						const payload = await jsonFetch("/api/investment/analysis?action=securities&market=" + encodeURIComponent(market) + "&q=" + encodeURIComponent(query.trim()));
						if (!cancelled) setState({ key, results: payload.results ?? [], catalog: payload.catalog, loading: false, error: "" });
					} catch (error) {
						if (!cancelled) setState({ key, results: [], catalog: null, loading: false, error: String(error?.message ?? error) });
					}
				}, query.trim() ? 180 : 0);
				return () => { cancelled = true; clearTimeout(timer); };
			}, [market, query, composing, revision]);
			const choose = row => { onSelect(row); setQuery(""); setActive(-1); };
			const refresh = async () => {
				if (refreshing) return;
				setRefreshing(true);
				try {
					await jsonFetch("/api/investment/analysis?action=refresh-securities", { method: "POST", body: JSON.stringify({ market }) });
					setRevision(value => value + 1);
				} catch (error) { setState(previous => ({ ...previous, error: String(error?.message ?? error) })); }
				finally { setRefreshing(false); }
			};
			return h("div", { className: "ia-an-lookup" },
				h("label", { className: "ia-an-lab", htmlFor: "ia-stock-query" }, tr("ui.search.security.name.or.ticker")),
				h("input", { id: "ia-stock-query", className: "ia-an-input", value: query, maxLength: 80, autoComplete: "off", role: "combobox", "aria-autocomplete": "list", "aria-controls": "ia-stock-options", "aria-expanded": results.length > 0, "aria-activedescendant": active >= 0 && active < results.length ? "ia-stock-option-" + active : undefined,
					placeholder: tr("ui.example.tencent.00700.apple"), onChange: event => setQuery(event.target.value), onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false),
					onKeyDown: event => { if (composing || event.nativeEvent?.isComposing) return; if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActive(value => (value + 1) % results.length); } else if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActive(value => (value <= 0 ? results.length : value) - 1); } else if (event.key === "Enter" && active >= 0 && results[active]) { event.preventDefault(); choose(results[active]); } else if (event.key === "Escape") { setQuery(""); setActive(-1); } } }),
				h("div", { id: "ia-stock-options", role: "listbox", "aria-label": tr("ui.matching.securities") }, ...results.map((row, i) => h("button", { id: "ia-stock-option-" + i, key: row.market + row.symbol, type: "button", role: "option", "aria-selected": i === active, className: "ia-an-stock-option", onClick: () => choose(row) }, h("span", null, row.name || row.symbol), h("span", { className: "ia-an-note" }, row.symbol + " · " + (marketName[row.market] ?? row.market) + (row.match === "similar" ? tr("ui.similar.name.please.verify") : ""))))),
				h("div", { className: "ia-an-note", "aria-live": "polite" }, state.loading ? tr("ui.searching.the.local.directory") : state.error ? tr("ui.security.directory.unavailable") + state.error : query.trim() && !results.length && state.key === key ? tr("ui.no.local.matches.enter.an.exact.ticker.or.update.the.directory") : tr("ui.select.a.match.to.add.it.similar.names.are.never.substituted.automatically")),
				h("div", { className: "ia-an-catalog" }, h("span", { className: "ia-an-note" }, state.catalog ? tr("ui.local.directory") + state.catalog.count + tr("ui.securities.2") + (state.catalog.scope !== "full-market" ? tr("ui.limited.directory.coverage") : "") + (state.catalog.generated_at ? " · " + formatClock(state.catalog.generated_at) : "") : tr("ui.local.security.directory")), h("button", { className: "ia-an-btn", type: "button", disabled: refreshing, onClick: refresh }, refreshing ? tr("ui.updating.directory") : tr("ui.update.directory.online"))));
		}

		function AnalysisEvidencePanel({ cycleId, run }) {
			const h = react.createElement;
			const completed = Object.keys(run?.checkpoints ?? {}).filter(stage => ["base_research", "research_debate", "portfolio_draft", "risk_review", "final_decision"].includes(stage));
			const [stage, setStage] = react.useState(completed[0] ?? "base_research");
			const data = useAsync(() => cycleId && completed.includes(stage) ? jsonFetch("/api/investment/analysis?action=evidence&cycle_id=" + encodeURIComponent(cycleId) + "&stage=" + encodeURIComponent(stage)) : Promise.resolve(null), [cycleId, stage, completed.join(",")]);
			return h("section", { className: "ia-an-panel" }, h("h3", null, tr("ui.stage.evidence")),
				h("div", { className: "ia-an-note" }, tr("ui.complete.saved.stage.materials.verify.unknown.dates.sources.and.valuation.bases.again")),
				completed.length ? h("label", { className: "ia-an-field" }, tr("ui.select.stage"), h("select", { className: "ia-an-select", value: stage, onChange: event => setStage(event.target.value) }, ...completed.map(value => h("option", { key: value, value }, analysisStageLabel(value))))) : h("div", { className: "ia-empty" }, tr("ui.no.saved.stage.evidence.yet")),
				data.error ? h("div", { className: "ia-notice", "data-kind": "err" }, tr("ui.failed.to.read.evidence") + data.error) : null,
				data.loading ? h("div", { className: "ia-empty" }, tr("ui.loading.evidence")) : data.data?.evidence ? h("details", null, h("summary", null, tr("ui.expand.original.materials")), h("pre", { className: "ia-an-evidence-text" }, JSON.stringify(data.data.evidence, null, 2))) : null);
		}

		function ScreeningResult({ run }) {
            const h = react.createElement;
            const audit = run?.screening?.audit ?? run?.screening ?? run?.checkpoints?.screening?.result;
            if (!Array.isArray(audit?.candidates)) return null;
            const en = localeTag() === "en-US";
            const labels = en ? ["Rank", "Security", "Quant", "Daily", "Final", "Change", "Research"] : ["排名", "标的", "量化分", "日报影响", "综合分", "排名变化", "进入研究"];
            return h("details", {className:"ia-an-panel"},
              h("summary",null,en ? "Screening results" : "选股结果"),
              h("p",{className:"ia-an-note"}, (en ? "Daily brief: " : "日报：") + (audit.daily?.date ?? (en ? "unavailable" : "暂无")) + " · " + audit.prefetched_count + (en ? " evaluated · " : "只评估 · ") + (audit.research_symbols?.length ?? 0) + (en ? " for research" : "只进入研究")),
              h("div",{style:{overflowX:"auto"}},h("table",{className:"ia-table",style:{width:"100%"}},
                h("thead",null,h("tr",null,...labels.map(label=>h("th",{key:label},label)))),
                h("tbody",null,...audit.candidates.map(row=>h("tr",{key:row.symbol,title:(row.daily_events ?? []).map(event=>event.summary).join("\n")},
                  ...[row.rank, (row.name || row.symbol) + (row.name ? " · " + row.symbol : ""), row.quant_score, (row.daily_adjustment > 0 ? "+" : "") + row.daily_adjustment, row.selection_score, row.rank_change > 0 ? "↑" + row.rank_change : row.rank_change < 0 ? "↓" + -row.rank_change : "—", row.research_selected ? (en ? "Selected" : "已入选") : "—"].map((value,i)=>h("td",{key:i},value))))))));
        }

        function AnalysisPipelineView({ run, loading, error, cycleId }) {
			const [logsOpen, setLogsOpen] = react.useState(false);
			const stages = run && run.stages && typeof run.stages === "object" ? run.stages : {};
			const stateMarkers = ["ready_for_execution", "completed", "failed", "cancelled"];
			const stageRows = researchStageRows(run).concat(Object.keys(stages).filter(stage => !stateMarkers.includes(stage) && !["screening","data_preparation",...RESEARCH_STAGE_KEYS].includes(stage)).map(stage => Object.assign({ stage }, stages[stage] ?? {})));
			stageRows.sort((a, b) => {
				const left = analysisStageOrder.indexOf(a.stage);
				const right = analysisStageOrder.indexOf(b.stage);
				return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
			});
			const currentStage = String(run?.current_stage ?? "");
			if (currentStage && !stateMarkers.includes(currentStage) && !stageRows.some((row) => row.stage === currentStage)) {
				// v1 records (and the instant right after start) may not carry a
				// stages entry yet: show the run's own status for that stage.
				stageRows.push({ stage: currentStage, status: run?.status ?? "" });
			}
			const agents = run && run.agents && typeof run.agents === "object" ? Object.values(run.agents).filter((value) => value && typeof value === "object") : [];
			const progress = analysisTaskCounts(run);
			for (const row of stageRows) {
				const tasks = agents.filter(task => task.stage === row.stage);
				if (!tasks.length) continue;
				const retried = Number(row.agents_total ?? 0) > tasks.length;
				row.agents_total = tasks.length;
				row.agents_done = tasks.filter(task => task.status === "completed").length;
				row.agents_failed = tasks.filter(task => task.status === "failed").length;
				// Preserve engine history; show the latest attempt separately from
				// its previous timeout and the time awaiting manual continuation.
				if (retried && tasks.every(task => task.status !== "running")) {
					const starts = tasks.map(task => Date.parse(task.started_at));
					const ends = tasks.map(task => Date.parse(task.finished_at));
					if ([...starts, ...ends].every(Number.isFinite)) {
						row.duration_ms = Math.max(0, Math.max(...ends) - Math.min(...starts));
						row.latest_attempt = true;
					}
				}
			}
			agents.sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0) || String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
			const logs = Array.isArray(run?.logs) ? run.logs.filter((entry) => entry && typeof entry === "object") : [];
			const visibleLogs = logs.slice(-200);
			const warnings = Array.isArray(run?.warnings) ? run.warnings : [];
			const reportMeta = run && run.report_meta && typeof run.report_meta === "object" ? run.report_meta : null;
			return react_jsx_runtime.jsxs("section", {
				className: "ia-an-panel",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-panel-head",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.analysis.workflow") }),
							react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": analysisStatusKind(run?.status), children: run ? tr("ui.round") + analysisStatusLabel(run.status) : tr("ui.no.rounds.yet") })
						]
					}),
					react_jsx_runtime.jsx(ScreeningResult, {run}),
					/* Everything above the stage list is the board: it sticks so the
					   ring and the round bar stay visible while the stage and subagent
					   lists scroll underneath. */
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-board",
						children: [
							error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: tr("ui.failed.to.read.round") + error }) : null,
							warnings.length > 0 ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "warn", children: tr("ui.warnings") + warnings.length + tr("ui.items.2") + warnings.slice(0, 3).map((item) => String(item)).join("；") }) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-kpis",
								children: [
									react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: tr("ui.round.status") }), react_jsx_runtime.jsx("b", { children: run ? analysisStatusLabel(run.status) : "-" })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: tr("ui.current.stage") }), react_jsx_runtime.jsx("b", { children: run ? analysisStageLabel(run.current_stage) : "-" })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: tr("ui.tasks.complete.expected") }), react_jsx_runtime.jsx("b", { children: progress.completed + "/" + Math.max(Number(run?.expected_agents ?? 0), progress.total) + (progress.failed ? tr("ui.failed.2") + progress.failed : "") })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: tr("ui.evidence.count") }), react_jsx_runtime.jsx("b", { children: run?.evidence_count ?? 0 })] })
								]
							}),
							react_jsx_runtime.jsx("div", {
								className: "ia-an-note",
								children: run ? tr("ui.round") + String(run.cycle_id ?? cycleId ?? "-") + " · " + (marketName[run.market] ?? run.market ?? "-") + tr("ui.label") + String(run.label ?? "-") + tr("ui.securities.3") + (Array.isArray(run.symbols) ? run.symbols.length : 0) + tr("ui.items.3") : (cycleId ? tr("ui.round") + cycleId + tr("ui.no.record.returned.by.the.engine") : tr("ui.no.analysis.round.started"))
							}),
							react_jsx_runtime.jsx(RoundProgress, { stages: stageRows.filter(row => ["screening","data_preparation",...RESEARCH_STAGE_KEYS].includes(row.stage)) })
							, run && Number(run.started_agents ?? 0) > progress.total ? react_jsx_runtime.jsx("div", { className: "ia-an-note", children: tr("ui.historical.starts") + run.started_agents + tr("ui.including.retries.current.progress.deduplicates.roles.original.timestamps.and.failure") }) : null
						]
					}),
					stageRows.length > 0 ? react_jsx_runtime.jsx("div", { children: stageRows.map((row) => react_jsx_runtime.jsxs("div", {
						className: "ia-an-stage",
						"data-status": String(row.status ?? ""),
						children: [
							react_jsx_runtime.jsx(StageDot, { status: row.status, fraction: stageFraction(row), startedAt: row.started_at ?? run?.started_at, stage: row.stage }),
							react_jsx_runtime.jsxs("div", { children: [
								react_jsx_runtime.jsx("div", { className: "ia-an-stage-name", children: analysisStageLabel(row.stage) }),
								react_jsx_runtime.jsx("div", {
									className: "ia-an-stage-meta",
									children: stageMetaText(row)
								})
							]}),
							react_jsx_runtime.jsx("div", { className: "ia-an-stage-time", children: (row.latest_attempt ? tr("ui.this.attempt") : "") + durationOf(row) })
						]
					}, row.stage)) }) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: loading ? tr("ui.loading.stages") : cycleId ? tr("ui.no.stage.records.saved.for.this.round") : tr("ui.no.analysis.round.started") }),
										reportMeta?.round_report ? react_jsx_runtime.jsx("div", { className: "ia-an-note", style: { marginTop: 10 }, children: tr("ui.round.report") + String(reportMeta.round_report).split(/[\\/]/).pop() + tr("punctuation.openParen") + formatBytes(reportMeta.bytes) + " · " + formatClock(reportMeta.generated_at) + tr("punctuation.closeParen") }) : null,
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-log",
						children: [
							react_jsx_runtime.jsxs("div", { className: "ia-an-log-head", children: [
								react_jsx_runtime.jsx("span", { children: tr("ui.run.logs") + logs.length + tr("ui.entries") + (logs.length > visibleLogs.length ? tr("ui.showing.latest") + visibleLogs.length + tr("ui.entries.2") : "") }),
								react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", onClick: () => setLogsOpen((open) => !open), children: logsOpen ? tr("ui.collapse.logs") : tr("ui.expand.logs") })
							]}),
							logsOpen ? react_jsx_runtime.jsx("div", {
								className: "ia-an-log-body",
								children: visibleLogs.length > 0 ? visibleLogs.map((entry) => "[" + formatClock(entry.at) + "] " + String(entry.level ?? "info").toUpperCase() + (entry.stage ? " " + analysisStageLabel(entry.stage) : "") + (entry.agent ? " " + String(entry.agent) : "") + " — " + String(entry.message ?? "")).join("\n") : tr("ui.no.logs.yet")
							}) : null
						]
					})
				]
			});
		}

		function AnalysisReportPanel({ refreshToken, highlightCycleId, embedded = false }) {
			const index = useAsync(() => embedded ? Promise.resolve({ reports: [] }) : jsonFetch("/api/investment/reports?action=index&limit=50"), [embedded]);
			const [marketFilter, setMarketFilter] = react.useState("");
			const [storedSelected, setSelected] = react.useState("");
			const selected = embedded ? String(highlightCycleId ?? "") : storedSelected;
			const [contentState, setContent] = react.useState({ loading: false, error: "", data: null, cycleId: "" });
			const content = contentState.cycleId === selected ? contentState : { loading: Boolean(selected), error: "", data: null };
			const [exportError, setExportError] = react.useState("");
			const rows = Array.isArray(index.data?.reports) ? index.data.reports : [];
			const visibleRows = marketFilter ? rows.filter((row) => String(row?.market ?? "") === marketFilter) : rows;
			const reloadIndex = index.reload;
			react.useEffect(() => {
				if (refreshToken > 0) reloadIndex();
			}, [refreshToken, reloadIndex]);
			react.useEffect(() => {
				if (selected) return;
				const match = rows.find((row) => highlightCycleId && String(row?.cycle_id ?? "") === highlightCycleId);
				if (match) setSelected(String(match.cycle_id));
			}, [rows, selected, highlightCycleId]);
			react.useEffect(() => {
				if (!selected) return undefined;
				let cancelled = false;
				setExportError("");
				setContent({ loading: true, error: "", data: null, cycleId: selected });
				jsonFetch("/api/investment/reports?action=content&cycle_id=" + encodeURIComponent(selected))
					.then((payload) => {
						if (!cancelled) setContent({ loading: false, error: "", data: payload, cycleId: selected });
					})
					.catch((error) => {
						if (!cancelled) setContent({ loading: false, error: String(error?.message ?? error), data: null, cycleId: selected });
					});
				return () => {
					cancelled = true;
				};
			}, [selected, refreshToken]);
			const handleSelect = (cycleId) => {
				setExportError("");
				setSelected(cycleId);
			};
			const handleExport = () => {
				const payload = content.data;
				if (!payload?.content) return;
				const name = String(payload.file ?? (selected + ".md"));
				try {
					const blob = new Blob([String(payload.content)], { type: "text/markdown;charset=utf-8" });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement("a");
					anchor.href = url;
					anchor.download = name.endsWith(".md") ? name : name + ".md";
					document.body.appendChild(anchor);
					anchor.click();
					document.body.removeChild(anchor);
					setTimeout(() => URL.revokeObjectURL(url), 4000);
					setExportError("");
				} catch (error) {
					setExportError(tr("ui.export.failed") + String(error?.message ?? error));
				}
			};
			return react_jsx_runtime.jsxs("section", {
				className: "ia-an-panel",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-panel-head",
						children: [
							react_jsx_runtime.jsxs("div", { children: [
								react_jsx_runtime.jsx("h3", { children: tr("ui.round.reports") }),
								!embedded ? react_jsx_runtime.jsx("div", { className: "ia-an-note", children: rows.length + tr("ui.rounds.2") }) : null
							]}),
							!embedded ? react_jsx_runtime.jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
								react_jsx_runtime.jsxs("select", {
									className: "ia-an-select",
									style: { width: "auto" },
									value: marketFilter,
									"aria-label": tr("ui.filter.reports.by.market"),
									onChange: (event) => setMarketFilter(event.target.value),
									children: [
										react_jsx_runtime.jsx("option", { value: "", children: tr("ui.all.markets") }, "all"),
										...analysisMarkets().map(([id, name]) => react_jsx_runtime.jsx("option", { value: id, children: name }, id))
									]
								}),
								react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", onClick: () => reloadIndex(), children: index.loading ? tr("ui.refreshing") : tr("ui.refresh") })
							]}) : null
						]
					}),
					index.error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: tr("ui.report.index.unavailable") + index.error }) : null,
					!embedded ? visibleRows.length > 0 ? react_jsx_runtime.jsx("ul", {
						className: "ia-an-report-list",
						children: visibleRows.map((row, position) => react_jsx_runtime.jsx("li", {
							children: react_jsx_runtime.jsxs("button", {
								className: "ia-an-report-item",
								type: "button",
								"data-active": String(row?.cycle_id ?? "") === selected,
								onClick: () => handleSelect(String(row?.cycle_id ?? "")),
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-an-report-title", children: formatClock(row?.started_at ?? row?.finished_at) + " · " + (marketName[row?.market] ?? row?.market ?? "-") + " · " + String(row?.label ?? "-") }),
									react_jsx_runtime.jsx("div", { className: "ia-an-report-meta", children: analysisStatusLabel(row?.status) + tr("ui.duration") + durationOf(row) + tr("ui.evidence.3") + (row?.evidence_count ?? 0) + tr("ui.decisions") + (row?.decisions_count ?? 0) + (row?.report_bytes ? " · " + formatBytes(row.report_bytes) : "") })
								]
							})
						}, String(row?.cycle_id ?? "") + ":" + position))
					}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: index.loading ? tr("ui.loading.report.index") : tr("ui.no.round.reports.yet") }) : null,
					selected ? react_jsx_runtime.jsxs("div", { children: [
						react_jsx_runtime.jsxs("div", { className: "ia-an-log-head", style: { marginTop: 10 }, children: [
							react_jsx_runtime.jsx("span", { children: content.data?.file ? String(content.data.file) : selected }),
							react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", disabled: !content.data?.content, onClick: handleExport, children: tr("ui.export.md") })
						]}),
						exportError ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: exportError }) : null,
						content.loading ? react_jsx_runtime.jsx("div", { className: "ia-empty", children: tr("ui.loading.report") }) : null,
						content.error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: tr("ui.failed.to.read.report") + content.error }) : null,
						content.data?.content ? react_jsx_runtime.jsx("div", { className: "ia-an-report-body", children: renderMarkdown(String(content.data.content)) }) : null
					]}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: tr("ui.select.a.round.above.to.read.its.report") })
				]
			});
		}

		function AnalysisCenter() {
			const h = react.createElement;
			const summaryState = useInvestmentSummary(ANALYSIS_POLL_IDLE_MS);
			const summary = summaryState.data ?? {};
			const engineStatus = summary.status ?? {};
			const control = engineStatus.control ?? {};
			const engineError = summaryState.error || engineStatus.error || "";
			const summaryRuns = Array.isArray(summary.analysisRuns) ? summary.analysisRuns : [];
			const summaryAnalysis = summary.analysis && typeof summary.analysis === "object" ? summary.analysis : null;

			const initialRef = react.useRef(null);
			if (initialRef.current === null) initialRef.current = readPendingAnalysis();
			const initial = initialRef.current;
			const [pending, setPending] = react.useState(initial);
			const [market, setMarket] = react.useState(initial?.market ?? "cn");
			const [label, setLabel] = react.useState(initial?.label ?? "manual");
			const [source, setSource] = react.useState(initial?.symbols_source === "screening" ? "screening" : "user");
			const [symbolsText, setSymbolsText] = react.useState(Array.isArray(initial?.symbols) ? initial.symbols.join(",") : "");
			const [goalId, setGoalId] = react.useState("");
			const [submitting, setSubmitting] = react.useState(false);
			// Which one-click entry is in flight. Screening loads the whole market
			// universe and takes tens of seconds, so the button has to say so.
			const [quickBusy, setQuickBusy] = react.useState("");
			// Pre-flight starts collapsed and auto-expands whenever a precondition is
			// unmet, so a disabled entry always explains itself without five green
			// rows occupying the panel the rest of the time.
			const [preflightOpen, setPreflightOpen] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const [refreshToken, setRefreshToken] = react.useState(0);
			const [selectedCycleId, setSelectedCycleId] = react.useState("");
			const [drawerOpen, setDrawerOpen] = react.useState(false);
			const [screeningCache, setScreeningCache] = react.useState(null);
			const drawerRef = react.useRef(null);

            useAnimatedProductDialog(drawerRef,drawerOpen,()=>setDrawerOpen(false));

			const screeningAgeMinutes = (row) => {
				const started = Date.parse(String(row?.generated_at ?? row?.audited_at ?? ""));
				return Number.isFinite(started) ? (Date.now() - started) / 60000 : Infinity;
			};
			react.useEffect(() => {
				if (!drawerOpen) return undefined;
				let cancelled = false;
				jsonFetch("/api/investment/analysis?action=screening&market=" + encodeURIComponent(market))
					.then((payload) => { if (!cancelled) setScreeningCache(payload?.screening ?? null); })
					.catch(() => { if (!cancelled) setScreeningCache(null); });
				return () => { cancelled = true; };
			}, [drawerOpen, market, refreshToken]);
			const [tab, setTab] = react.useState("process");
			const history = useAsync(() => jsonFetch("/api/investment/analysis?action=runs&limit=50"), []);
			const reloadHistory = history.reload;
			react.useEffect(() => { if (refreshToken) reloadHistory(); }, [refreshToken, reloadHistory]);

			const watchCycleId = selectedCycleId || String(pending?.cycle_id ?? "") || String(summaryAnalysis?.cycle_id ?? "");
			const runState = useAnalysisRun(watchCycleId);
			const run = runState.data && (!watchCycleId || String(runState.data.cycle_id) === watchCycleId)
				? runState.data
				: summaryAnalysis && (!watchCycleId || String(summaryAnalysis.cycle_id) === watchCycleId)
					? summaryAnalysis
					: null;
			const runningFromSummary = summaryRuns.find((row) => String(row?.status ?? "") === "running") ?? (String(summaryAnalysis?.status ?? "") === "running" ? summaryAnalysis : null);
			const activeState = useActiveRounds(run?.status === "running" || runningFromSummary ? ANALYSIS_POLL_RUNNING_MS : ANALYSIS_POLL_IDLE_MS);
			// Avoid duplicate starts in this market; other markets may keep running.
			const runningRound = [...activeState.rounds, ...summaryRuns, run].find(row => row?.status === "running" && row?.market === market) ?? null;
			const hasRunningRound = Boolean(runningRound);

			const normalizedSymbols = normalizeAnalysisSymbols(symbolsText, market);
			const symbols = normalizedSymbols.symbols;
			const invalidSymbols = normalizedSymbols.invalid;
			const symbolCount = symbols.length;
			const symbolOverflow = symbolCount > MAX_ANALYSIS_SYMBOLS;
			const killSwitch = control.kill_switch === true;
			const engineReachable = !engineError;
			const screenerRun = screeningCache && Array.isArray(screeningCache.selected_symbols) && screeningCache.selected_symbols.length > 0
				? { cycle_id: String(screeningCache.generated_at ?? "-"), symbols: screeningCache.selected_symbols.map(String), age_minutes: screeningAgeMinutes(screeningCache), generated_at: screeningCache.generated_at }
				: null;
			const screeningFresh = Boolean(screenerRun && screenerRun.age_minutes <= Number(screeningCache?.refresh_minutes ?? SCREENING_TTL_MINUTES));
			const goalOptions = [];
			for (const row of [run, ...summaryRuns]) {
				const value = String(row?.goal_id ?? "");
				if (value && !goalOptions.includes(value)) goalOptions.push(value);
			}

			// The five start-button preconditions, in the same order as the spec.
			const checks = [
				{ key: "symbols", ok: symbolCount > 0 && invalidSymbols.length === 0, label: tr("ui.valid.tickers"), detail: invalidSymbols.length ? tr("ui.please.verify") + invalidSymbols.join(tr("punctuation.comma")) + tr("ui.select.security.names.from.the.search.results") : symbolCount > 0 ? tr("ui.recognized") + symbolCount + tr("ui.securities.2") : tr("ui.no.securities.entered") },
				{ key: "limit", ok: !symbolOverflow, label: tr("ui.maximum") + MAX_ANALYSIS_SYMBOLS + tr("ui.items.3"), detail: symbolCount + " / " + MAX_ANALYSIS_SYMBOLS + (symbolOverflow ? tr("ui.limit.exceeded") : "") },
				{ key: "kill_switch", ok: !killSwitch, label: tr("ui.emergency.stop.is.off"), detail: killSwitch ? tr("ui.emergency.stop.is.active") : control.paused ? tr("ui.engine.is.paused.research.may.still.start") : tr("ui.normal") },
				{ key: "running", ok: !hasRunningRound, label: tr("ui.no.round.running"), detail: hasRunningRound ? tr("ui.round") + String(runningRound?.cycle_id ?? "-") + tr("ui.is.running") : tr("ui.none") },
				{ key: "engine", ok: engineReachable, label: tr("ui.engine.reachable"), detail: engineReachable ? tr("ui.connected.to.the.investment.engine") : tr("ui.unavailable") + engineError }
			];
			// The collapsed pre-flight line needs both a count and a way to expand.
			const checksFailed = checks.filter((check) => !check.ok).length;
			const canStart = !submitting && !quickBusy && symbolCount > 0 && !symbolOverflow && !invalidSymbols.length && !killSwitch && !hasRunningRound && engineReachable;
			const blockReason = submitting
				? tr("ui.submitting")
				: invalidSymbols.length ? tr("ui.verify.tickers.select.security.names.from.the.search.results")
				: symbolCount === 0
					? tr("ui.enter.a.security.list.first")
					: symbolOverflow
						? tr("ui.security.count.exceeds") + MAX_ANALYSIS_SYMBOLS + tr("ui.items.3")
						: killSwitch
							? tr("ui.emergency.stop.is.active.analysis.cannot.start")
							: hasRunningRound
								? tr("ui.an.analysis.round.is.already.running")
								: !engineReachable
									? tr("ui.investment.engine.unavailable.analysis.cannot.start")
									: "";
			const canStop = !submitting && String(run?.status ?? "") === "running" && Boolean(run?.cycle_id);
			const retryCycleId = String(pending?.cycle_id ?? "") || String(run?.cycle_id ?? "");
			// 重试 targets a round the user already started: either a stored
			// pending snapshot (a start that never reached the engine) or a round
			// the engine parked in failed. Finished or cancelled rounds are
			// not retryable; a fresh analysis needs a new cycle_id.
			const retryStatus = String(run?.status ?? "");
			const canRetry = !submitting && !hasRunningRound && Boolean(retryCycleId) && (retryStatus === "failed" || (Boolean(pending) && !["completed", "ready_for_execution", "cancelled"].includes(retryStatus)));

			const refreshAll = () => {
				runState.reload();
				activeState.reload();
				setRefreshToken((value) => value + 1);
			};
			react.useEffect(() => {
				setTab(["completed", "ready_for_execution"].includes(run?.status) ? "report" : "process");
			}, [watchCycleId, run?.status]);
			const historyRows = [...new Map([...(history.data?.runs ?? []), ...summaryRuns, run].filter(row => row?.cycle_id).map(row => [row.cycle_id, row])).values()].sort((a, b) => String(b.started_at ?? "").localeCompare(String(a.started_at ?? "")));
			const selectRound = cycleId => { setSelectedCycleId(cycleId); setPending(writePendingAnalysis(null)); setNotice(null); };
			const addStock = row => { if (row.market !== market) return; setSymbolsText(previous => { const parsed = normalizeAnalysisSymbols(previous, market); return [...new Set([...parsed.symbols, ...parsed.invalid, row.symbol])].join(", "); }); setSource("user"); };

			const submitStart = async (options) => {
				setSubmitting(true);
				setNotice(null);
				const body = {
					cycle_id: options.cycleId,
					market: options.market,
					symbols: options.symbols,
					symbols_source: options.symbolsSource,
					label: options.label,
					retry: options.retry === true
				};
				if (options.goalId) body.goal_id = options.goalId;
				try {
					const result = await jsonFetch("/api/investment/analysis?action=start", {
						method: "POST",
						body: JSON.stringify(body)
					});
					setPending(writePendingAnalysis({
						cycle_id: options.cycleId,
						market: options.market,
						label: options.label,
						symbols: options.symbols,
						symbols_source: options.symbolsSource,
						goal_id: options.goalId || undefined,
						requested_at: new Date().toISOString()
					}));
					setSelectedCycleId(options.cycleId);
					setDrawerOpen(false);
					setNotice({
						kind: result?.started === false ? "warn" : "ok",
						text: result?.resumed
							? tr("ui.round.resumed.from.checkpoints.with.the.same.cycle.id")
							: result?.started === false
								? (result?.retry_required ? tr("ui.this.round.was.interrupted.select.retry.to.resume.explicitly") : result?.retry_deferred ? tr("ui.this.round.is.still.leased.retry.was.deferred.try.again.later") : tr("ui.this.cycle.id.already.exists.no.duplicate.round.was.started"))
								: tr("ui.analysis.started.fetching.live.progress")
					});
				} catch (error) {
					setNotice({ kind: "err", text: tr("ui.start.failed") + String(error?.message ?? error) });
				} finally {
					setSubmitting(false);
					refreshAll();
				}
			};

			const handleStart = async () => {
                if (!canStart) return;
                await submitStart({cycleId:newAnalysisCycleId(market,label),market,label:label || "manual",
                  symbols:source === "screening" ? [] : symbols,symbolsSource:source,goalId});
            };
			// ── one-click entries ──────────────────────────────────────────────
			// ② Screen. The engine's screening endpoint returns a dashboard preview
			// whose selected list is `selected_symbols` (there is no `candidates`
			// key); filling the box from it is what makes ② useful on its own, and
			// it is also the input ① consumes.
			const canQuick = !submitting && !quickBusy && !killSwitch && !hasRunningRound && engineReachable;
			const quickBlockReason = submitting || quickBusy
				? tr("ui.another.quick.action.is.in.progress")
				: killSwitch
					? tr("ui.emergency.stop.is.active.analysis.cannot.start")
					: hasRunningRound
						? tr("ui.an.analysis.round.is.already.running")
						: !engineReachable
							? tr("ui.investment.engine.unavailable.action.cannot.run")
							: "";

			const handleScreen = async () => {
				if (!canQuick) return;
				setQuickBusy("screen");
				setNotice(null);
				try {
					const result = await jsonFetch("/api/investment/analysis?action=screen&market=" + encodeURIComponent(market), { method: "GET" });
					const preview = result?.screening ?? {};
					const picked = Array.isArray(preview.selected_symbols) ? preview.selected_symbols.map(String) : [];
					const audit = preview.audit && typeof preview.audit === "object" ? preview.audit : {};
					if (picked.length === 0) {
						setNotice({
							kind: "warn",
							text: tr("ui.screening.returned.no.selections.discovered") + String(audit.discovered_count ?? "-") + tr("ui.securities.candidates") + String(audit.candidate_count ?? "-") + tr("ui.securities") + (audit.discovery_error ? " · " + String(audit.discovery_error).slice(0, 160) : "")
						});
					} else {
						setSymbolsText(picked.join(","));
						setSource("screening");
						setNotice({
							kind: "ok",
							text: tr("ui.screening.complete.discovered") + String(audit.discovered_count ?? "-") + tr("ui.securities.candidates.2") + String(audit.candidate_count ?? "-") + tr("ui.securities.selected") + picked.length + tr("ui.securities.source") + String(audit.source ?? "-") + tr("ui.the.security.list.is.populated")
						});
					}
				} catch (error) {
					setNotice({ kind: "err", text: tr("ui.screening.failed") + String(error?.message ?? error) });
				} finally {
					setQuickBusy("");
					refreshAll();
				}
			};

			// ① Whole pipeline: screen, then run the round on the screened names.
			// The engine enforces submit=false on every web-launched round, so
			// "whole pipeline" still means research only -- it never trades.
			const handleFullPipeline = async () => {
				if (!canQuick) return;
				if (invalidSymbols.length || symbolOverflow) { setNotice({ kind: "err", text: tr("ui.verify.the.security.list.remove.invalid.names.and.stay.within.the.limit") }); return; }
				setQuickBusy("full");
				setNotice(null);
				try {
					const picked = source === "screening" ? [] : symbols;
					await submitStart({
						cycleId: newAnalysisCycleId(market, label),
						market,
						label: label || "manual",
						symbols: picked,
						symbolsSource: picked.length ? "user" : "screening",
						goalId
					});
				} catch (error) {
					setNotice({ kind: "err", text: tr("ui.workflow.start.failed") + String(error?.message ?? error) });
				} finally {
					setQuickBusy("");
				}
			};
			const handleRetry = () => {
				if (!canRetry) return;
				const snapshot = pending ?? (run ? { cycle_id: run.cycle_id, market: run.market, label: run.label, symbols: run.symbols, symbols_source: run.symbols_source, goal_id: run.goal_id } : null);
				if (!snapshot?.cycle_id) return;
				const snapshotSymbols = Array.isArray(snapshot.symbols) && snapshot.symbols.length > 0 ? snapshot.symbols : symbols;
				submitStart({
					cycleId: String(snapshot.cycle_id),
					market: String(snapshot.market ?? market) || market,
					label: String(snapshot.label ?? label) || "manual",
					symbols: snapshotSymbols,
					symbolsSource: String(snapshot.symbols_source ?? source) || "user",
					goalId: String(snapshot.goal_id ?? goalId ?? ""),
					retry: true
				});
			};
			const handleStop = async () => {
				const cycleId = String(run?.cycle_id ?? pending?.cycle_id ?? "");
				if (!cycleId) return;
				setSubmitting(true);
				setNotice(null);
				try {
					await jsonFetch("/api/investment/analysis?action=stop", {
						method: "POST",
						body: JSON.stringify({ cycle_id: cycleId, reason: tr("ui.user.stopped.the.analysis.round.from.the.product.interface") })
					});
					setNotice({ kind: "ok", text: tr("ui.stop.requested.for.round") + cycleId + tr("ui.analysis.only.accounts.are.unaffected") });
				} catch (error) {
					setNotice({ kind: "err", text: tr("ui.stop.failed") + String(error?.message ?? error) });
				} finally {
					setSubmitting(false);
					refreshAll();
				}
			};
			const handleLabel = (value) => setLabel(String(value ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40));
			const handleSource = (next) => {
				setSource(next);
				if (next === "screening" && screenerRun) {
					setSymbolsText((screenerRun.symbols ?? []).join(","));
					setNotice(screeningFresh ? null : { kind: "warn", text: tr("ui.the.latest.screening.is.older.than") + SCREENING_TTL_MINUTES + tr("ui.minutes.screening.will.refresh.before.analysis.starts") });
				}
			};
			const sourceNote = source === "screening"
				? screenerRun
					? tr("ui.from.screening") + String(screenerRun.generated_at ?? "-").replace("T", " ").slice(0, 16) + " · " + (screenerRun.symbols?.length ?? 0) + tr("ui.candidates") + (screeningFresh ? tr("ui.within") + SCREENING_TTL_MINUTES + tr("ui.minutes.reuse.directly") : tr("ui.expired.screening.will.refresh.before.analysis.starts")) + tr("punctuation.fullStop")
					: symbolCount ? tr("ui.from.this.screening.candidates.are.in.the.list.below.ready.to.analyze") : tr("ui.no.screening.results.yet.screen.securities.or.switch.to.manual.entry")
				: tr("ui.manual.entry.separate.with.commas.spaces.or.newlines.duplicates.are.removed.maximum") + MAX_ANALYSIS_SYMBOLS + tr("ui.securities.4");

			const renderStartPanel = () => react_jsx_runtime.jsxs("div", {
				className: "ia-an-col ia-an-start",
				children: [
					react_jsx_runtime.jsxs("section", {
						className: "ia-an-panel",
						children: [
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-panel-head",
								children: [
									react_jsx_runtime.jsx("h3", { children: tr("ui.start.analysis") }),
									run ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": analysisStatusKind(run.status), children: analysisStatusLabel(run.status) }) : react_jsx_runtime.jsx("span", { className: "ia-chip", children: tr("ui.not.started.2") })
								]
							}),
							/* The three entries sit at the TOP of the panel and are the only
							   primary actions. ② and ③ run the SAME fixed workflow as ① --
							   analysis_rounds.py documents the tool as a thin launcher and
							   one implementation serves web, scheduler and DSH rounds -- so
							   they differ only in where the symbol list comes from, and ①
							   collapses to "screen, then start" rather than a second path.
							   The old standalone 开始分析 button is gone: it called exactly
							   handleStart, the same handler as ③. */
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-quick",
								children: [
									react_jsx_runtime.jsx("button", {
										id: "ia-an-quick-full",
										className: "ia-elev ia-elev-lg ia-an-btn ia-an-quickbtn",
										type: "button",
										disabled: !canQuick,
										title: canQuick ? tr("ui.run.screening.then.the.fixed.analysis.workflow.research.only.no.orders") : quickBlockReason,
										onClick: handleFullPipeline,
										children: quickBusy === "full" ? tr("ui.starting.workflow") : tr("ui.run.full.workflow")
									}),
									react_jsx_runtime.jsx("button", {
										id: "ia-an-quick-screen",
										className: "ia-elev ia-elev-md ia-an-btn ia-an-quickbtn",
										type: "button",
										disabled: !canQuick,
										title: canQuick ? tr("ui.scan.the.market.for.liquidity.and.factor.candidates.then.populate.the.security.list") : quickBlockReason,
										onClick: handleScreen,
										children: quickBusy === "screen" ? tr("ui.screening.may.take.tens.of.seconds") : tr("ui.screen.securities")
									}),
									react_jsx_runtime.jsx("button", {
										id: "ia-an-quick-typed",
										className: "ia-elev ia-elev-md ia-an-btn ia-an-quickbtn",
										type: "button",
										disabled: !canStart,
										title: canStart ? tr("ui.run.the.fixed.workflow.for.the.listed.securities.research.only.no.orders") : blockReason,
										onClick: handleStart,
										children: submitting ? tr("ui.submitting.2") : tr("ui.analyze.listed.securities")
									})
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-market", children: tr("ui.market") }),
									react_jsx_runtime.jsx("select", {
										id: "ia-an-market",
										className: "ia-an-select",
										value: market,
										onChange: (event) => { setMarket(event.target.value); setSymbolsText(""); setSource("user"); },
										children: analysisMarkets().map(([id, name]) => react_jsx_runtime.jsx("option", { value: id, children: name }, id))
									})
								]
							}),
							react_jsx_runtime.jsx(StockLookup, { market, onSelect: addStock }),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-label", children: tr("ui.round.label.a.za.z0.9.only") }),
									react_jsx_runtime.jsx("input", { id: "ia-an-label", className: "ia-an-input", value: label, spellCheck: false, placeholder: "manual", onChange: (event) => handleLabel(event.target.value) })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-an-lab", children: tr("ui.security.source") }),
									react_jsx_runtime.jsxs("div", {
										className: "ia-an-seg",
										children: [
											react_jsx_runtime.jsx("button", { type: "button", "data-active": source === "user", onClick: () => handleSource("user"), children: tr("ui.manual.entry") }),
											react_jsx_runtime.jsx("button", { type: "button", "data-active": source === "screening", onClick: () => handleSource("screening"), children: tr("ui.from.screening.2") })
										]
									}),
									react_jsx_runtime.jsx("div", { className: "ia-an-note", children: sourceNote })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-symbols", children: tr("ui.security.list.comma.space.newline.separated.deduplicated") }),
									react_jsx_runtime.jsx("textarea", { id: "ia-an-symbols", className: "ia-an-area", value: symbolsText, spellCheck: false, placeholder: "600519, 000858", onChange: (event) => { setSymbolsText(event.target.value); setSource("user"); } }),
									react_jsx_runtime.jsx("div", { className: "ia-an-note", children: tr("ui.recognized") + symbolCount + tr("ui.securities.2") + (symbolOverflow ? tr("ui.exceeds.maximum") + MAX_ANALYSIS_SYMBOLS + tr("ui.securities.5") : "") })
								]
							}),
							goalOptions.length > 0 ? react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-goal", children: tr("ui.linked.goal.optional.goal.id.from.a.previous.round") }),
									react_jsx_runtime.jsxs("select", {
										id: "ia-an-goal",
										className: "ia-an-select",
										value: goalId,
										onChange: (event) => setGoalId(event.target.value),
										children: [
											react_jsx_runtime.jsx("option", { value: "", children: tr("ui.no.linked.goal") }, "none"),
											...goalOptions.map((value) => react_jsx_runtime.jsx("option", { value: value, children: value }, value))
										]
									})
								]
							}) : null,
							// Pre-flight collapsed to one line. Five green rows were noise, while a
							// greyed-out button with no explanation is worse -- so the summary is
							// always visible and expands by itself when something is unmet.
							react_jsx_runtime.jsxs("button", {
								id: "ia-an-preflight",
								className: "ia-an-preflight",
								type: "button",
								"data-ok": checksFailed === 0,
								"aria-expanded": preflightOpen || checksFailed > 0,
								onClick: () => setPreflightOpen((open) => !open),
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-an-preflight-mark", children: checksFailed === 0 ? "✓" : "!" }),
									react_jsx_runtime.jsx("span", { children: checksFailed === 0
										? tr("ui.preflight") + checks.length + "/" + checks.length + tr("ui.ready")
										: tr("ui.preflight") + checksFailed + tr("ui.checks.unmet") }),
									react_jsx_runtime.jsx("span", { className: "ia-an-preflight-caret", children: (preflightOpen || checksFailed > 0) ? tr("ui.collapse") : tr("ui.expand") })
								]
							}),
							preflightOpen || checksFailed > 0 ? react_jsx_runtime.jsx("div", {
								className: "ia-an-preflight-list",
								children: checks.map((check) => react_jsx_runtime.jsxs("div", {
									className: "ia-an-check",
									"data-ok": check.ok,
									children: [
										react_jsx_runtime.jsx("span", { className: "ia-an-check-mark", children: check.ok ? "✓" : "!" }),
										react_jsx_runtime.jsxs("span", { children: [react_jsx_runtime.jsx("b", { children: check.label }), " · " + check.detail] })
									]
								}, check.key))
							}) : null,
							notice ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": notice.kind, children: notice.text }) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-actions",
								children: [
									react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", disabled: !canStop, title: canStop ? tr("ui.stop.current.round.analysis.only.accounts.are.unaffected") : tr("ui.no.round.is.currently.running"), onClick: handleStop, children: tr("ui.stop") }),
									react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", disabled: !canRetry, title: canRetry ? tr("ui.retry.with.the.same.cycle.id.resume.from.saved.checkpoints") : tr("ui.no.retryable.round.only.failed.stopped.or.unsubmitted.rounds.can.be.retried"), onClick: handleRetry, children: tr("ui.retry") }),
									react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-an-btn", type: "button", onClick: refreshAll, children: tr("ui.refresh") })
								]
							}),
							react_jsx_runtime.jsx("div", { className: "ia-an-note", style: { marginTop: 8 }, children: hasRunningRound ? tr("ui.running.2") + String(runningRound?.cycle_id ?? "-") + tr("ui.poll.every") + (run?.status === "running" ? "2" : "8") + tr("ui.s.2") : isAnalysisTerminal(run?.status) ? tr("ui.this.round.has.ended.polling.stopped") : tr("ui.no.round.is.currently.running.2") })
						]
					}),
					react_jsx_runtime.jsxs("section", {
						className: "ia-an-panel",
						children: [
									react_jsx_runtime.jsx("h3", { style: { margin: "0 0 8px", fontSize: 13 }, children: tr("ui.research.and.execution") }),
										react_jsx_runtime.jsx("div", { className: "ia-an-note", children: tr("ui.analysis.produces.research.and.trade.recommendations.execution.requires.separate.appr") })
						]
					})
				]
			});

			const tabsRef = react.useRef(null);
			useSegThumb(tabsRef, [tab, watchCycleId]);
			const stageEntryList = run ? researchStageRows(run).map(row => [row.stage, row]) : [];
			const stageDoneCount = stageEntryList.filter(([, value]) => String(value.status ?? "") === "completed").length;
			const evidenceCount = Number(run?.evidence_count ?? 0);
			const runChipKind = engineError || run?.status === "failed" ? "danger" : run ? (["completed", "ready_for_execution"].includes(run.status) ? "ok" : "warn") : "";

			return h("div", { className: "ia-page ia-research-page" },
				h(PageHeader, { title: tr("ui.investment.research"), subtitle: tr("ui.security.research.progress.and.historical.reports"), status: engineError ? tr("ui.investment.engine.unavailable") : run ? analysisStatusLabel(run.status) : tr("ui.no.research.rounds.yet"), statusKind: engineError || run?.status === "failed" ? "error" : ["completed", "ready_for_execution"].includes(run?.status) ? "ok" : "warn" }),
				h("div", { className: "ia-page-content" },
					engineError ? h("div", { className: "ia-notice", "data-kind": "err" }, tr("ui.engine.unavailable") + engineError) : null,
					h("div", { className: "ia-research-grid" },
						h("aside", { className: "ia-research-side" },
							h("section", { className: "ia-an-panel ia-research-actions" },
								h("div", { className: "ia-an-panel-head" }, h("h3", null, tr("ui.research.actions"))),
								h("div", { className: "ia-research-chips" },
									h("span", { className: "ia-chip", "data-kind": runChipKind }, run ? analysisStatusLabel(run.status) : tr("ui.no.rounds.yet")),
									run ? h("span", { className: "ia-chip" }, stageDoneCount + "/" + stageEntryList.length + tr("ui.stages")) : null,
									run ? h("span", { className: "ia-chip" }, evidenceCount + tr("ui.evidence.items")) : null),
								h("div", { className: "ia-research-action-btns" },
									h("button", { type: "button", className: "ia-an-btn ia-elev ia-elev-lg ia-research-primary", onClick: () => { if (!symbolsText && run?.market) setMarket(run.market); setDrawerOpen(true); } }, tr("ui.new.research")),
									h("button", { className: "ia-an-btn", type: "button", disabled: !canStop, onClick: handleStop }, tr("ui.stop")),
									h("button", { className: "ia-an-btn", type: "button", disabled: !canRetry, onClick: handleRetry }, tr("ui.resume"))),
								h("div", { className: "ia-an-note", style: { marginTop: 10 } }, tr("ui.research.produces.recommendations.execution.requires.separate.approval"))),
							h("section", { className: "ia-an-panel ia-research-history" }, h("div", { className: "ia-an-panel-head" }, h("h3", null, tr("ui.research.history")), h("button", { className: "ia-an-btn", type: "button", onClick: refreshAll }, tr("ui.refresh"))),
								history.error ? h("div", { className: "ia-notice", "data-kind": "err" }, tr("ui.failed.to.read.history") + history.error) : null,
								h("div", { className: "ia-research-rounds" }, ...historyRows.map(row => h("button", { key: row.cycle_id, className: "ia-an-report-item", "data-active": row.cycle_id === watchCycleId, "aria-pressed": row.cycle_id === watchCycleId, type: "button", onClick: () => selectRound(row.cycle_id) }, h("div", { className: "ia-an-report-title" }, (marketName[row.market] ?? row.market) + " · " + (row.label || tr("ui.security.research"))), h("div", { className: "ia-an-report-meta" }, formatClock(row.started_at)), h("div", { className: "ia-an-report-meta" }, analysisStatusLabel(row.status) + " · " + (row.symbols?.length ?? 0) + tr("ui.securities.2"))))),
								!historyRows.length ? h("div", { className: "ia-empty" }, history.loading ? tr("ui.loading.research.history") : tr("ui.no.research.yet.select.new.research.to.begin")) : null)),
						h("main", { className: "ia-research-workspace" },
							h("div", { className: "ia-research-heading" }, h("div", null, h("h2", null, run ? (marketName[run.market] ?? run.market) + " · " + (run.label || tr("ui.security.research")) : tr("ui.research.workspace")), h("div", { className: "ia-an-note" }, run ? (run.symbols ?? []).join(" · ") || tr("ui.awaiting.screening") : tr("ui.select.a.round.on.the.left.or.create.new.research")))),
							h(ResearchStageCards,{run}),
							run?.error ? h("div", { className: "ia-notice", "data-kind": "err" }, tr("ui.research.stopped") + run.error + tr("ui.saved") + Object.keys(run.checkpoints ?? {}).length + tr("ui.stages.resume.manually.to.continue")) : null,
							notice ? h("div", { className: "ia-notice", "data-kind": notice.kind, "aria-live": "polite" }, notice.text) : null,
							h("div", { ref: tabsRef, className: "ia-research-tabs ia-seg ia-tabs", role: "tablist", "aria-label": tr("ui.research.content") },
								h("span", { className: "ia-seg-thumb", "aria-hidden": "true" }),
								...[["report", tr("ui.research.report")], ["process", tr("ui.research.progress")], ["evidence", tr("ui.stage.evidence")]].map(([value, name]) => h("button", { id: "ia-research-tab-" + value, className: "ia-an-btn ia-research-tab", type: "button", role: "tab", "aria-selected": tab === value, "aria-controls": "ia-research-content", onClick: () => setTab(value), key: value }, name))),
							h(ContentTransition, { identity: tab+":"+watchCycleId },h("div", { id: "ia-research-content", role: "tabpanel", "aria-labelledby": "ia-research-tab-" + tab },
								tab === "report" ? h(AnalysisReportPanel, { embedded: true, refreshToken, highlightCycleId: watchCycleId }) : tab === "evidence" ? h(AnalysisEvidencePanel, { key: watchCycleId, cycleId: watchCycleId, run }) : h(AnalysisPipelineView, { run, loading: runState.loading, error: runState.error, cycleId: watchCycleId })))))),
				h("dialog", { ref: drawerRef, className: "ia-an-drawer", "aria-label": tr("ui.new.research.2"), onCancel: event => { event.preventDefault(); setDrawerOpen(false); } }, h("div", { className: "ia-an-panel-head" }, h("h2", null, tr("ui.new.research.2")), h("button", { className: "ia-an-btn", type: "button", onClick: () => setDrawerOpen(false) }, tr("ui.close.3"))), renderStartPanel()));
		}

		// ── settings sections ─────────────────────────────────────────────

        function useAsync(load,deps) {
            const [state,setState]=react.useState({loading:false,data:null,error:''});
            const sequence=react.useRef(0),action=react.useCallback(load,deps??[]);
            const reload=react.useCallback(async()=>{
                const request=++sequence.current;
                setState(previous=>({...previous,loading:true,error:''}));
                try {const data=await action();if(request===sequence.current)setState({loading:false,data,error:''});}
                catch(error){if(request===sequence.current)setState(previous=>({...previous,loading:false,error:String(error?.message??error)}));}
            },[action]);
            react.useEffect(()=>{setState({loading:true,data:null,error:''});reload();return()=>{sequence.current++;};},[reload]);
            return {...state,reload};
        }

		function SectionFrame({ title, subtitle, children, notice }) {
			return react_jsx_runtime.jsxs("div", {
				children: [
					react_jsx_runtime.jsx("h1", { className: "ia-page-title", children: title }),
					react_jsx_runtime.jsx("p", { className: "ia-page-sub", children: subtitle }),
					notice ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": notice.kind ?? "ok", children: notice.text }) : null,
					children
				]
			});
		}

		function StrategySection(props) {
			const { fetchConfig, fetchStatus, saveConfig, runCommand } = props;
			const data = useAsync(() => Promise.all([fetchConfig(), fetchStatus()]).then(([cfg, status]) => ({ config: cfg?.config ?? {}, mandate: status?.mandate ?? {} })), []);
			const autonomous = data.data?.config?.autonomous ?? {};
			const mandate = data.data?.mandate ?? {};
			const [saving, setSaving] = react.useState(false);
			const [notice, setNotice] = react.useState(null);

			const selectProfile = async (profile) => {
				setSaving(true);
				setNotice(null);
				try {
					await runCommand("set_strategy", { profile });
					setNotice({ text: tr("ui.strategy.changed.to") + profile + tr("ui.applies.to.subsequent.rounds.immediately"), kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: tr("ui.switch.failed") + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const updateConfig = async (changes) => {
				setSaving(true);
				setNotice(null);
				try {
					await saveConfig(changes);
					setNotice({ text: tr("ui.settings.saved.and.applied"), kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: tr("ui.save.failed") + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const current = mandate?.profile ?? "neutral";
			const limits = [
				["min_confidence", tr("ui.minimum.confidence")], ["max_position_pct", tr("ui.max.security.weight")], ["max_total_position_pct", tr("ui.max.total.exposure")], ["min_cash_reserve_pct", tr("ui.minimum.cash.reserve")], ["max_drawdown_pct", tr("ui.maximum.drawdown")], ["max_daily_trades", tr("ui.max.daily.trades")]
			];

			return react_jsx_runtime.jsxs(SectionFrame, {
				title: tr("ui.strategy.and.risk.controls"),
				subtitle: tr("ui.strategy.profiles.set.prompt.objectives.and.hard.limits.for.weights.cash.drawdown.and"),
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.strategy.profile") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.current") + (strategyName({...mandate,profile:current})) })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["conservative", tr("ui.conservative")], ["neutral", tr("ui.neutral")], ["aggressive", tr("ui.aggressive")]].map(([profile, label]) => react_jsx_runtime.jsx("button", {
									key: profile,
									className: "ia-elev ia-elev-md ia-btn",
									"data-kind": current === profile ? "primary" : undefined,
									disabled: saving,
									onClick: () => selectProfile(profile),
									children: label
								}, profile))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.operation.mode") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.manual.run.only.when.triggered.automatic.run.according.to.the.schedule") })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["manual", tr("ui.manual.2")], ["automatic", tr("ui.automatic.2")]].map(([mode, label]) => react_jsx_runtime.jsx("button", {
									key: mode,
									className: "ia-elev ia-elev-md ia-btn",
									"data-kind": String(autonomous.operation_mode ?? "manual") === mode ? "primary" : undefined,
									disabled: saving,
									onClick: () => updateConfig({ "autonomous.operation_mode": mode }),
									children: label
								}, mode))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.autonomous.investing.master.switch") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.when.disabled.the.engine.runs.no.automatic.rounds") })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [[true, tr("ui.enable")], [false, tr("ui.disable")]].map(([value, label]) => react_jsx_runtime.jsx("button", {
									key: String(value),
									className: "ia-elev ia-elev-md ia-btn",
									"data-kind": Boolean(autonomous.enabled) === value ? "primary" : undefined,
									disabled: saving,
									onClick: () => updateConfig({ "autonomous.enabled": value }),
									children: label
								}, String(value)))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.current.hard.limits") + (mandate.profile ?? "-") + tr("punctuation.closeParen") }),
							react_jsx_runtime.jsxs("div", {
								children: limits.map(([key, label]) => react_jsx_runtime.jsx("div", { key: key, className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: label }), react_jsx_runtime.jsx("b", { children: mandate?.[key] ?? "-" })] }))
							})
						]
					})
				]
			});
		}

		function ScheduleSection(props) {
			const { fetchConfig, saveConfig } = props;
			const data = useAsync(() => fetchConfig(), []);
			const schedule = data.data?.config?.schedule ?? {};
			const [saving, setSaving] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const save = async (changes) => {
				setSaving(true);
				setNotice(null);
				try {
					await saveConfig(changes);
					setNotice({ text: tr("ui.schedule.saved"), kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: tr("ui.save.failed") + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const roundTimes = ["cn", "hk", "us", "etf"].map((market) => ({
				market,
				value: (schedule.intraday_rounds?.[market] ?? []).join(", "),
				close: schedule.close_rounds?.[market] ?? ""
			}));
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: tr("ui.automatic.rounds.and.scheduling"),
				subtitle: tr("ui.intraday.and.closing.rounds.run.in.asia.shanghai.time.the.engine.applies.saved.schedu"),
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.market.briefing.time") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.generate.a.briefing.each.trading.day.using.news.from.the.previous.trading.day") })]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								defaultValue: schedule.macro_daily_time ?? "08:00",
								onBlur: (event) => { if (event.target.value) save({ "schedule.macro_daily_time": event.target.value }); }
							})
						]
					}),
					...roundTimes.map((row) => react_jsx_runtime.jsxs("div", {
						key: row.market,
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: marketName[row.market] + tr("ui.intraday.rounds.hh.mm.comma.separated") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.closing.round") + (row.close || "-") })]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								defaultValue: row.value,
								onBlur: (event) => {
									const parsed = event.target.value.split(",").map((item) => item.trim()).filter(Boolean);
									save({ ["schedule.intraday_rounds." + row.market]: parsed });
								}
							})
						]
					}))
				]
			});
		}

		function MarketsSection(props) {
			const { fetchConfig, saveConfig } = props;
			const data = useAsync(() => fetchConfig(), []);
			const markets = data.data?.config?.markets ?? {};
			const screening = data.data?.config?.screening ?? {};
			const [saving, setSaving] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const save = async (changes) => {
				setSaving(true);
				setNotice(null);
				try {
					await saveConfig(changes);
					setNotice({ text: tr("ui.market.settings.saved"), kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: tr("ui.save.failed") + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const enabled = Array.isArray(markets.enable) ? markets.enable : [];
			const toggleMarket = (market) => {
				const next = enabled.includes(market) ? enabled.filter((item) => item !== market) : [...enabled, market];
				save({ "markets.enable": next });
			};
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: tr("ui.markets.and.screening"),
				subtitle: tr("ui.enabled.markets.set.the.scheduling.and.screening.scope.screening.parameters.control.m"),
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.enabled.markets") }),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["cn", tr("ui.mainland.china")], ["hk", tr("ui.hong.kong")], ["us", tr("ui.united.states")], ["etf", "ETF"]].map(([market, label]) => react_jsx_runtime.jsx("button", {
									key: market,
									className: "ia-elev ia-elev-md ia-btn",
									"data-kind": enabled.includes(market) ? "primary" : undefined,
									disabled: saving,
									onClick: () => toggleMarket(market),
									children: label
								}, market))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.candidate.pool.size") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.maximum.securities.in.each.market.s.screening.pool") })]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								type: "number",
								defaultValue: screening.shortlist_size ?? 20,
								onBlur: (event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) save({ "screening.shortlist_size": value }); }
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.screening.refresh.interval.minutes") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.cache.lifetime.the.next.round.refreshes.expired.results") })]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								type: "number",
								defaultValue: screening.refresh_minutes ?? 30,
								onBlur: (event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 5) save({ "screening.refresh_minutes": value }); }
							})
						]
					})
				]
			});
		}

		function NotifySection(props) {
			const { fetchConfig, saveConfig, fetchWebhook, saveWebhook } = props;
			const data = useAsync(() => Promise.all([fetchConfig(), fetchWebhook()]).then(([cfg, webhook]) => ({ config: cfg?.config ?? {}, webhookConfigured: Boolean(webhook?.configured) })), []);
			const notify = data.data?.config?.notify ?? {};
			const [saving, setSaving] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const [webhook, setWebhook] = react.useState("");
			const save = async () => {
				setSaving(true);
				setNotice(null);
				try {
					await saveConfig({ "notify.channels": ["webhook"] });
					await saveWebhook(webhook);
					setNotice({ text: tr("ui.notification.settings.saved.webhook.address.encrypted.with.dpapi"), kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: tr("ui.save.failed") + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: tr("ui.notifications"),
				subtitle: tr("ui.send.completed.round.reports.through.a.webhook"),
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.webhook.notifications") }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: tr("ui.current") + (notify.enabled ? tr("ui.enabled.2") : tr("ui.disabled")) })]
							}),
							react_jsx_runtime.jsx("button", {
								className: "ia-elev ia-elev-md ia-btn",
								"data-kind": notify.enabled ? "primary" : undefined,
								disabled: saving,
								onClick: () => saveConfig({ "notify.enabled": !notify.enabled, "notify.channels": ["webhook"] }).then(() => data.reload()),
								children: notify.enabled ? tr("ui.disable") : tr("ui.enable")
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-form-label", children: tr("ui.webhook.address") }),
									react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: data.data?.webhookConfigured ? tr("ui.configured.existing.address.hidden.leave.blank.to.retain.it") : tr("ui.must.start.with.https.encrypted.in.the.local.dpapi.store") })
								]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								value: webhook,
								placeholder: data.data?.webhookConfigured ? tr("ui.configured") : "https://example.com/hook",
								onChange: (event) => setWebhook(event.target.value)
							})
						]
					}),
					react_jsx_runtime.jsx("div", { style: { marginTop: 12 }, children: react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-md ia-btn", "data-kind": "primary", disabled: saving, onClick: save, children: tr("ui.save.notification.settings") }) })
				]
			});
		}

        function LanguageSection({setLanguage, saveConfig, fetchConfig}) {
            const current = useProductLocale();
            const motion=useProductMotion();
            const [savingMotion,setSavingMotion]=react.useState(false);
            const data = useAsync(fetchConfig, []);
            react.useEffect(()=>{if(data.data)productMotion.set(data.data.config?.ui?.motion??"system");},[data.data]);
            const [error,setError] = react.useState("");
            const output = data.data?.config?.research?.output_language ?? "follow-ui";
            return react.createElement(SectionFrame,{title:tr("language.title"),subtitle:tr("language.history")},
                react.createElement("div",{className:"ia-form-row"},
                    react.createElement("label",{htmlFor:"ia-language"},tr("language.title")),
                    react.createElement("select",{id:"ia-language",className:"ia-input",value:current.active,onChange:async event=>{try{setError("");await setLanguage(event.target.value);}catch{setError(tr("language.saveFailed"));}}},
                        react.createElement("option",{value:"zh"},"简体中文"),react.createElement("option",{value:"en"},"English"))),
                react.createElement("div",{className:"ia-form-row"},
                    react.createElement("label",{htmlFor:"ia-output-language"},tr("language.output")),
                    react.createElement("select",{id:"ia-output-language",className:"ia-input",value:output,onChange:async event=>{try{setError("");await saveConfig({"research.output_language":event.target.value});data.reload();}catch{setError(tr("language.saveFailed"));}}},
                        react.createElement("option",{value:"follow-ui"},tr("language.follow")),react.createElement("option",{value:"zh"},"简体中文"),react.createElement("option",{value:"en"},"English"))),
                react.createElement("div",{className:"ia-form-row"},
                    react.createElement("div",null,react.createElement("label",{htmlFor:"ia-motion"},tr("motion.title")),react.createElement("div",{className:"ia-form-hint"},tr("motion.hint"))),
                    react.createElement("select",{id:"ia-motion",className:"ia-input",value:motion.preference,disabled:savingMotion,onChange:async event=>{const value=event.target.value;setSavingMotion(true);try{setError("");await saveConfig({"ui.motion":value});productMotion.set(value);}catch{setError(tr("motion.saveFailed"));}finally{setSavingMotion(false);}}},
                        ...[["system","motion.system"],["standard","motion.standard"],["off","motion.off"]].map(([value,key])=>react.createElement("option",{key:value,value},tr(key))))),
                error?react.createElement("p",{role:"alert"},error):null);
        }

		function AboutSection(props) {
			const { engineInfo } = props;
			const info = useAsync(() => engineInfo(), []);
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: tr("ui.application.settings"),
				subtitle: "AI Trading Automation",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.version.information") }),
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: tr("ui.product") }), react_jsx_runtime.jsx("b", { children: "AI Trading Automation" })] }),
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: tr("ui.engine.version") }), react_jsx_runtime.jsx("b", { children: info.data?.version ?? "-" })] }),
                                    react_jsx_runtime.jsx("div", {className:"ia-kv",children:[react_jsx_runtime.jsx("span",{children:"DSH"}),react_jsx_runtime.jsx("b",{children:info.data?.dsh??"-"})]}),
                                    react_jsx_runtime.jsx("div", {className:"ia-kv",children:[react_jsx_runtime.jsx("span",{children:tr("ui.source.commit")}),react_jsx_runtime.jsx("b",{children:info.data?.sourceCommit?.slice(0,12)??"-"})]}),
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: tr("ui.trading.mode") }), react_jsx_runtime.jsx("b", { children: tr("ui.paper.trading.paper") })] })
								]
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: tr("ui.safety.information") }),
							react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)" }, children: tr("ui.this.product.supports.paper.trading.only.and.has.no.live.broker.connection.all.orders") })
						]
					})
				]
			});
		}

		// ── settings surface ──────────────────────────────────────────────
		function SettingsSurface(props) {
			const { sectionsSource, renderSlot } = props;
			const rows = react.useSyncExternalStore(sectionsSource.subscribe, sectionsSource.getSnapshot, sectionsSource.getSnapshot);
			const [activeId, setActiveId] = react.useState(undefined);
			const active = rows.find((row) => row.id === activeId)?.id ?? rows[0]?.id;
			const jump = (row) => {
				setActiveId(row.id);
				const el = document.getElementById("ia-set-" + row.id);
				if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
			};
			return react_jsx_runtime.jsxs("div", {
				className: "ia-settings",
				children: [
					react_jsx_runtime.jsxs("nav", {
						className: "ia-settings-nav",
						children: rows.map((row) => react_jsx_runtime.jsx("button", {
							key: row.id,
							type: "button",
							"data-active": row.id === active,
							onClick: () => jump(row),
							children: row.label
						}, row.id))
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-settings-content",
						children: rows.length ? rows.map((row) => react_jsx_runtime.jsxs("section", {
							key: row.id,
							id: "ia-set-" + row.id,
							className: "ia-set-section",
							children: renderSlot("settings.section", { close: () => {} }, { only: row.id })
						}, row.id)) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: tr("ui.no.settings.available") })
					})
				]
			});
		}

		function SettingsPage(props) {
			return react_jsx_runtime.jsxs("div", {
				className: "ia-settings-page",
				children: [
					react_jsx_runtime.jsx(PageHeader, {
						title: tr("ui.settings"),
						subtitle: tr("ui.models.strategy.risk.autonomous.operation.and.desktop.configuration"),
						status: tr("ui.secure.local.storage")
					}),
					react_jsx_runtime.jsx(SettingsSurface, { ...props })
				]
			});
		}

		// ── sidebar ───────────────────────────────────────────────────────
		function ProductSidebar(props) {
            useProductLocale();
			const { useSessions, useWorkspaces, startSession, open, renameSession, archiveSession, searchSessions } = props;
			const list = useSessions((state) => state);
			const workspace = useWorkspaces((state) => state);
			const [query, setQuery] = react.useState("");
			const [results, setResults] = react.useState(null);
			const [searchError, setSearchError] = react.useState("");
			const [sessionDialog, setSessionDialog] = react.useState(null);
            const lastDialog=react.useRef(null);
            if(sessionDialog)lastDialog.current=sessionDialog;
            const dialogRecord=sessionDialog??lastDialog.current;
			const [sessionName, setSessionName] = react.useState("");
			const [dialogBusy, setDialogBusy] = react.useState(false);
			const [dialogError, setDialogError] = react.useState("");
			const openSessionDialog = (kind, id, title) => { setSessionName(title); setDialogError(""); setSessionDialog({kind,id}); };
			const submitSessionDialog = async () => {
				if (!sessionDialog || dialogBusy || (sessionDialog.kind === "rename" && !sessionName.trim())) return;
				setDialogBusy(true); setDialogError("");
				try {
					if (sessionDialog.kind === "rename") await renameSession(sessionDialog.id,sessionName.trim());
					else await archiveSession(sessionDialog.id);
					setSessionDialog(null);
				} catch (error) { setDialogError(String(error?.message ?? error)); }
				finally { setDialogBusy(false); }
			};
			const current = Object.values(list?.byId ?? {}).find(record => (record.retainedBy?.mainView ?? 0) > 0)?.id;
			// Session bar shows only user-facing sessions: archived ones are
			// hidden even when the store still lists them, and internal
			// background sessions (role subagents, origin="subagent") never
			// surface. Headless top sessions live in their own internal DSH
			// home and never appear here.
			const archived = new Set(workspace?.archivedSessionIds ?? []);
			const byId = list?.byId ?? {};
			const visible = (id) => !archived.has(id) && byId[id]?.origin !== "subagent";
			const ids = (Array.isArray(list?.ids) ? list.ids : []).filter(visible);

			react.useEffect(() => {
				if (query.trim() === "") {
					setResults(null);
					setSearchError("");
					return;
				}
				let cancelled = false;
				const searchController = new AbortController();
				const timer = setTimeout(async () => {
					try {
						const found = await searchSessions(query, searchController.signal);
						if (!cancelled) { setResults(found); setSearchError(""); }
					} catch (error) {
						if (!cancelled) { setResults([]); setSearchError(tr("ui.search.failed") + String(error?.message ?? error)); }
					}
				}, 250);
				return () => {
					cancelled = true;
					searchController.abort();
					clearTimeout(timer);
				};
			}, [query]);

			const visibleIds = (results !== null ? results : ids).filter(visible);
			const titleOf = (id) => {
				const record = byId[id];
				if (!record) return tr("ui.sessions");
				if (record.blank) return tr("ui.new.session");
				return record.title || record.displayTitle || tr("ui.sessions");
			};

			return react_jsx_runtime.jsxs("div", {
				className: "ia-sidebar",
				children: [
					react.createElement(ProductModal,{
                        open:Boolean(sessionDialog),busy:dialogBusy,onClose:()=>setSessionDialog(null),
                        label:tr(dialogRecord?.kind==='rename'?'ui.rename.session':'ui.archive.this.session')
                    },
                        react.createElement('h3',null,tr(dialogRecord?.kind==='rename'?'ui.rename.session':'ui.archive.this.session')),
                        dialogRecord?.kind==='rename'?react.createElement('input',{className:'ia-input',autoFocus:true,'aria-label':tr('ui.rename.session'),value:sessionName,onChange:event=>setSessionName(event.target.value)}):null,
                        dialogError?react.createElement('p',{role:'alert'},dialogError):null,
                        react.createElement('div',{className:'ia-modal-actions'},
                            react.createElement('button',{className:'ia-btn',disabled:dialogBusy,onClick:()=>setSessionDialog(null)},tr('ui.dialog.cancel')),
                            react.createElement('button',{className:'ia-btn','data-kind':'primary',disabled:dialogBusy||(dialogRecord?.kind==='rename'&&!sessionName.trim()),onClick:submitSessionDialog},tr(dialogRecord?.kind==='rename'?'ui.dialog.save':'ui.archive')))),
					react_jsx_runtime.jsxs("div", {
						className: "ia-sidebar-head",
						children: [
							react_jsx_runtime.jsx("span", { className: "ia-sidebar-title", children: tr("ui.sessions") }),
							react_jsx_runtime.jsx("button", { className: "ia-elev ia-elev-static ia-elev-sm ia-iconbtn", type: "button", title: tr("ui.create.session"), onClick: () => startSession(), children: "+" })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-sidebar-scroll",
						children: [
							react_jsx_runtime.jsx("input", {
								className: "ia-search",
								placeholder: tr("ui.search.sessions"),
								value: query,
								onChange: (event) => setQuery(event.target.value)
							}),
							react_jsx_runtime.jsx("div", { className: "ia-session-group", children: query.trim() ? tr("ui.search.results") : tr("ui.recent.sessions") }),
							searchError ? react_jsx_runtime.jsx("div", {role:"alert",className:"ia-empty",children:searchError}) : visibleIds.length === 0 ? react_jsx_runtime.jsx("div", { className: "ia-empty", children: query.trim() ? tr("ui.no.matching.sessions") : tr("ui.no.sessions.yet.create.one.above") }) : visibleIds.map((id) => react_jsx_runtime.jsxs("div", {
								key: id,
								className: "ia-elev ia-elev-static ia-elev-sm ia-session",
								"data-active": id === current,
								onClick: () => open(id),
								children: [
									react_jsx_runtime.jsxs("div", {
										className: "ia-session-main",
										children: [
											react_jsx_runtime.jsx("span", { className: "ia-session-title", children: titleOf(id) }),
											react_jsx_runtime.jsxs("span", {
												className: "ia-session-actions",
												style: {display:id === current ? "flex" : undefined},
												children: [
													react_jsx_runtime.jsx("button", {
														onClick: (event) => {
															event.stopPropagation();
															openSessionDialog("rename",id,titleOf(id));
														},
														children: tr("ui.rename")
													}),
													react_jsx_runtime.jsx("button", {
														onClick: (event) => {
															event.stopPropagation();
															openSessionDialog("archive",id,titleOf(id));
														},
														children: tr("ui.archive")
													})
												]
											})
										]
									}),
									react_jsx_runtime.jsx("span", { className: "ia-session-meta", children: byId[id]?.blank ? tr("ui.awaiting.your.question") : tr("ui.investment.session") })
								]
							}))
						]
					})
				]
			});
		}

		// ── shell frame ───────────────────────────────────────────────────


        function ShellFrame(props) {
            const locale=useProductLocale(),motion=useProductMotion();
            const {useStore,actions,renderSlot}=props,state=useStore(value=>value)??{};
            const page=state?.page??'assistant',activePage=['dashboard','analyze','settings'].includes(page)?page:'assistant';
            const visited=react.useRef(new Set([activePage]));visited.current.add(activePage);
            const detailsOpen=state?.detailsOpen===true,contextOpen=state?.contextOpen===true;
            const navRef=react.useRef(null),rightRef=react.useRef(null),nativeEntry=react.useRef('conversation');
            if(page==='assistant')nativeEntry.current='conversation';else if(page.startsWith('native:'))nativeEntry.current=page.slice(7);
            const [viewportWidth,setViewportWidth]=react.useState(window.innerWidth);
            react.useEffect(()=>{const resize=()=>setViewportWidth(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
            react.useEffect(()=>props.syncPanel(page),[page,props.syncPanel]);
            useNavigationIndicator(navRef,activePage,locale.active);
            useRightbarTransition(rightRef,Boolean(state?.rightbarFullscreen),detailsOpen,activePage);
            const navigation=[['dashboard','layoutDashboard',tr('ui.overview')],['assistant','messageSquare',tr('ui.nav.assistant')],['analyze','radar',tr('ui.nav.research')],['settings','settings',tr('ui.settings')]];
            const content=id=>{
                if(id==='dashboard')return react.createElement(ProductDashboard,{onOpenAnalysis:()=>actions.setPage('analyze')});
                if(id==='analyze')return react.createElement(AnalysisCenter,{});
                if(id==='settings')return react.createElement(SettingsPage,props);
                return react.createElement('div',{className:'ia-assist'},
                    react.createElement(AssistantStatusStrip,{contextOpen,onToggleContext:()=>actions.setContextOpen(!contextOpen)}),
                    react.createElement('div',{className:'ia-assist-body'},
                        renderSlot('sidebar',{collapsed:false,width:250}),
                        react.createElement('div',{className:'ia-center'},renderSlot('main',{},{entryKey:nativeEntry.current})),
                        react.createElement('div',{ref:rightRef,className:'ia-details','aria-hidden':!detailsOpen,
                            onTransitionEnd:event=>{if(event.target===rightRef.current&&event.propertyName==='width')window.dispatchEvent(new Event('resize'));},
                            style:state.rightbarFullscreen?{position:'fixed',inset:0,width:'100vw',height:'100vh',zIndex:1000}:{position:'relative',width:detailsOpen?340:0,border:detailsOpen?undefined:'none'}},
                            renderSlot('rightbar',{width:state.rightbarFullscreen?viewportWidth:340,viewportWidth,canShow:true})),
                        react.createElement(MotionPresence,{open:!detailsOpen&&contextOpen,className:'ia-ctx-drawer'},react.createElement(AssistantContext,{onClose:()=>actions.setContextOpen(false),onOpenWorkflow:()=>actions.setPage('analyze')}))));
            };
            return react.createElement('div',{className:'ia-shell','data-motion':motion.reduced?'off':'standard'},
                react.createElement('div',{className:'ia-rail'},
                    react.createElement('div',{className:'ia-rail-brand',title:'AI Trading Automation'},'IA'),
                    react.createElement('nav',{ref:navRef,className:'ia-rail-nav','aria-label':tr('ui.product.navigation')},
                        react.createElement('span',{className:'ia-nav-indicator','aria-hidden':true}),
                        ...navigation.map(([id,key,label])=>react.createElement('button',{key:id,className:'ia-elev ia-elev-static ia-elev-sm ia-navbtn',type:'button','data-active':activePage===id,'data-page':id,'aria-current':activePage===id?'page':undefined,title:label,onClick:()=>actions.setPage(id)},
                            react.createElement('span',{className:'ia-navicon','aria-hidden':true},icon(key,18)),react.createElement('span',{style:{whiteSpace:'normal',maxWidth:'100%',lineHeight:'16px',overflowWrap:'anywhere'}},label)))),
                    react.createElement('div',{className:'ia-rail-spacer'})),
                react.createElement('div',{className:'ia-body'},...Array.from(visited.current).map(id=>react.createElement(MotionPage,{key:id,page:id,active:activePage===id},content(id)))),
                renderSlot('shell.overlay',{}));
        }


		// ── theme presenter ────────────────────────────────────────────────
		//
		// AI Trading Automation ships a LIGHT-ONLY surface. This is a deliberate
		// product trade-off, not an oversight: a single palette means every
		// component is verified once instead of twice, which matters far more
		// for a one-person maintenance budget than offering a dark mode.
		//
		// The lock is applied to the THEME PREFERENCE (`setTheme("light")`), not
		// to the token values. That distinction is essential: `snapshot.tokens`
		// arrives already resolved for the active scheme, so picking light values
		// here would leave every DSH-owned surface (conversation kernel, model
		// settings) rendering dark next to our light shell.
		const LIGHT_ONLY = "light";

		// Aliases DSH ships a value for but never exposes through the theme
		// snapshot. They are written as inline body properties, at the same
		// priority as the composer's own tokens, because a `:root` declaration
		// loses to every inline custom property. DSH's stock value for
		// `label-tertiary` is #81858c, which fails AA on white at the 12-14px
		// sizes DSH uses it for (settings intro copy, card footnotes), so it is
		// re-pointed at our tertiary ink. Additive only: nothing that resolved
		// before resolves differently other than this contrast fix.
		const COMPAT_TOKENS = {
			"--dsw-alias-label-tertiary": "--ia-text-3",
			"--dsw-alias-bg-module-platform": "--ia-surface",
		};

		var ThemePresenter = class {
			appliedTokens = [];
			themeColorMeta;
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			apply(snapshot) {
				// `colorScheme` is pinned rather than read so a transient dark
				// resolution can never reach the DOM (not even for one frame).
				document.documentElement.style.colorScheme = LIGHT_ONLY;
				const body = document.body;
				body.removeAttribute("data-ds-dark-theme");
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				// Re-point the compatibility aliases after the composer's tokens so
				// they win, and read them from the resolved :root values.
				for (const [alias, source] of Object.entries(COMPAT_TOKENS)) {
					const resolved = getComputedStyle(document.documentElement).getPropertyValue(source).trim();
					if (!resolved) continue;
					body.style.setProperty(alias, resolved);
					this.appliedTokens.push(alias);
				}
				this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				const body = document.body;
				body.removeAttribute("data-ds-dark-theme");
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};

		// ── plugin apply ──────────────────────────────────────────────────
		const name = "@ai-trading-automation/dsh-product-shell";
		const inject = ["slots", "sessions", "workspaces", "locale", "theme", "configForms"];

		function apply(ctx) {
            installProductLocale(ctx);
			let shellActions = null;
			let panelSnapshot = Object.freeze({ activePanelId: null });
			const panelListeners = new Set();
			let navigation = new AbortController();
			const panelInfo = { getSnapshot: () => panelSnapshot, subscribe: listener => { panelListeners.add(listener); return () => panelListeners.delete(listener); } };
			const publishPanel = id => {
				if (panelSnapshot.activePanelId === id) return;
				panelSnapshot = Object.freeze({ activePanelId: id });
				for (const listener of panelListeners) listener();
			};
			const syncPanel = page => publishPanel(page === "assistant" ? null : page.startsWith("native:") ? page.slice(7) : page);
			ctx.effect(() => ctx.slots.provideRoot({ hooks: { panelInfo } }), "product panel selection");
			const layoutService = {
				panelInfo,
				selectPanel: id => {
					if (id !== null && !ctx.slots.entries("main").some(entry => entry.options.key === id)) return false;
					navigation.abort(); navigation = new AbortController();
					publishPanel(id);
					shellActions?.setPage(id === null ? "assistant" : id === "settings" ? "settings" : "native:" + id);
					return true;
				},
				beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal; },
				openRightbar: (_track, fullscreen) => shellActions?.setDetailsOpen(true, fullscreen),
				closeRightbar: () => shellActions?.setDetailsOpen(false),
				openDetails: () => { shellActions?.setDetailsOpen(true); },
				closeDetails: () => { shellActions?.setDetailsOpen(false); },
				toggleSidebar: () => {}
			};
			ctx.effect(() => {
				const dispose = ctx.reflect.provide("layout", layoutService);
				return () => { navigation.abort(); dispose(); panelListeners.clear(); };
			}, "product layout service");

			// Pin the theme preference to light BEFORE the presenter reads it, so
			// every surface (ours and DSH's) resolves light from the first frame.
			// Wrapped because a locked-down or future theme service must not be
			// able to prevent the shell itself from mounting.
			const pinLightTheme = () => {
				try {
					if (ctx.theme.getTheme().preference !== LIGHT_ONLY) ctx.theme.setTheme(LIGHT_ONLY);
				} catch (error) {
					ctx.logger?.warn?.("ia-shell: could not pin theme to light: %s", String(error?.message ?? error));
				}
			};
			pinLightTheme();

			ctx.effect(() => {
				const presenter = new ThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
					// The preference lives in the user-settings document, so it can be
					// reset externally (or back to `system`, which a dark OS resolves to
					// dark). Re-assert rather than trusting the first write.
					if (snapshot.preference !== LIGHT_ONLY) pinLightTheme();
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "ia-shell: theme presenter");

			// Belt-and-braces lock. `theme/change` only fires for preference
			// changes; anything that writes the OS-level signal another way (an
			// extension, a host reset, a resolved `system` flip) would otherwise
			// re-darken the surface with no event for us to catch. Watching the
			// observed attribute is deliberately cheap and needs no React scope —
			// root-scoped components cannot reach a session-scoped theme store.
			ctx.effect(() => {
				if (typeof MutationObserver !== "function") return;
				const observer = new MutationObserver(() => {
					if (document.documentElement.style.colorScheme !== LIGHT_ONLY) {
						document.documentElement.style.colorScheme = LIGHT_ONLY;
					}
					if (document.body.hasAttribute("data-ds-dark-theme")) {
						document.body.removeAttribute("data-ds-dark-theme");
					}
				});
				observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
				observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
				return () => observer.disconnect();
			}, "ia-shell: light-only lock");

			let rowsCache = null;
			let rowsKey = "";
			const sectionSource = {
				getSnapshot: () => {
					const version = ctx.slots.getVersion("settings.section");
					const revision = ctx.locale.getSnapshot().revision;
					const key = version + ":" + revision;
					if (rowsCache === null || rowsKey !== key) {
						rowsKey = key;
						rowsCache = ctx.slots.entries("settings.section").map((entry) => ({
							id: entry.options.id ?? "",
							order: entry.options.order ?? 0,
							label: (typeof entry.options.label === "function" ? entry.options.label() : ctx.locale.resolveText(entry.options.label)) ?? ""
						})).sort((a, b) => a.order - b.order);
					}
					return rowsCache;
				},
				subscribe: (listener) => {
					const offSlots = ctx.slots.subscribe("settings.section", listener);
					const offLocale = ctx.locale.subscribe(listener);
					return () => {
						offSlots();
						offLocale();
					};
				}
			};

			const fetchConfig = async () => {
				const response = await fetch("/api/investment/config");
				const payload = await response.json();
				if (!response.ok) throw new Error(payload?.error ?? "HTTP " + response.status);
				return payload;
			};
            ctx.effect(()=>{let active=true;fetchConfig().then(value=>{if(active)productMotion.set(value?.config?.ui?.motion??"system");}).catch(()=>{});return()=>{active=false;};},"product motion preference");
			const fetchStatus = async () => {
				const payload = await jsonFetch("/api/investment/summary");
				return payload?.status ?? {};
			};
			const saveConfig = async (changes) => {
				const response = await fetch("/api/investment/config", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ changes })
				});
				const payload = await response.json();
				if (!response.ok) throw new Error(payload?.error ?? "HTTP " + response.status);
				return payload;
			};
			const runCommand = async (command, payload) => {
				const response = await fetch("/api/investment/command", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ command, payload })
				});
				const result = await response.json();
				if (!response.ok) throw new Error(result?.error ?? "HTTP " + response.status);
				if (result?.ok === false) throw new Error(result?.error ?? tr("ui.command.failed"));
				return result;
			};
			const fetchWebhook = async () => {
				const response = await fetch("/api/investment/webhook");
				const payload = await response.json();
				if (!response.ok) throw new Error(payload?.error ?? "HTTP " + response.status);
				return payload;
			};
			const saveWebhook = async (value) => {
				const response = await fetch("/api/investment/webhook", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ value })
				});
				if (!response.ok) throw new Error(tr("ui.save.failed.2"));
				return response.json();
			};
			const engineInfo = async () => {
				const payload = await jsonFetch("/api/investment/summary");
				return { version: payload?.health?.version, dsh:payload?.runtime?.dsh, sourceCommit:payload?.runtime?.sourceCommit };
			};

			ctx.effect(() => ctx.slots.register({
				name: "root",
				children: {
					"sidebar": { kind: "single", scope: "root" },
					"main": { kind: "keyed", scope: "root" },
					"rightbar": { kind: "single", scope: "root" },
					"shell.bottom": { kind: "single", scope: "root" },
					"shell.leading": { kind: "single", scope: "root" },
					"details": { kind: "single", scope: "session" },
					"shell.overlay": { kind: "list", scope: "root" },
					"settings.section": { kind: "list", scope: "root" },
					"settings.onboarding": { kind: "list", scope: "root" }
				},
				store: _deepseek_ai_dsh_client_runtime_client.defineStore({
					init: () => ({
						page: "assistant",
						detailsOpen: false,
						rightbarFullscreen: false,
						contextOpen: false
					}),
					actions: {
						setPage: (draft, page) => {
							draft.page = page;
						},
						setDetailsOpen: (draft, open, fullscreen = false) => {
							draft.detailsOpen = open;
							draft.rightbarFullscreen = open && fullscreen;
						},
						setContextOpen: (draft, open) => {
							draft.contextOpen = open;
						}
					}
				}),
				inject: (actions) => {
					shellActions = actions;
					return {
						syncPanel,
						sectionsSource: sectionSource,
						fetchConfig,
						fetchStatus,
						saveConfig,
						runCommand,
						fetchWebhook,
						saveWebhook,
						engineInfo
					};
				}
			}, ShellFrame), "ia-shell: root frame");

			ctx.slots.inject("sidebar", () => ctx.slots.register({
				name: "sidebar",
				inject: () => ({
					hooks: { workspaces: ctx.workspaces.list },
					startSession: () => ctx.get("uiWorkspace").startSession(undefined),
					open: (sessionId) => ctx.get("uiWorkspace").openSession(sessionId),
					searchSessions: async (query, signal) => {
						const result = await ctx.sessions.search(query, signal);
						if (!result.ok) throw new Error(result.error.message);
						// Wire shape: { items: [{ sessionId, snippet }], hasMore }
						const value = result.value;
						if (Array.isArray(value?.items)) return value.items.map((item) => item.sessionId);
						if (Array.isArray(value)) return value;
						if (Array.isArray(value?.ids)) return value.ids;
						return [];
					},
					renameSession: async (sessionId, title) => {
						const result = await ctx.sessions.using(sessionId, {source:"workspaceOperation"}, reference => reference.binding.session.rename(title));
						if (!result.ok) throw new Error(result.error.message);
					},
					archiveSession: async (sessionId) => {
						await ctx.get("uiWorkspace").archiveSession(sessionId);
					}
				})
			}, ProductSidebar), "ia-shell: product sidebar");

			ctx.effect(() => {
                let last;
                const sync = () => {
                    const active = ctx.locale.getSnapshot().active;
                    if (active !== last && ["zh","en"].includes(active)) {
                        last = active;
                        saveConfig({"ui.language":active}).catch(error=>ctx.logger.warn("locale mirror: %s",String(error?.message??error)));
                    }
                };
                sync(); return ctx.locale.subscribe(sync);
            }, "resolved research locale mirror");
            const setLanguage = async id => {
                // Confirm persistence before presenting the preference as saved.
                if (!await ctx.configForms.get("locale").set("preference",id)) throw new Error("Locale persistence rejected");
                ctx.locale.setLocale(id);
                await saveConfig({"ui.language":id});
            };
            const section = (id, order, label, Component) => {
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id,
					order,
					label: () => tr(label),
					inject: () => ({
						fetchConfig,
						fetchStatus,
						saveConfig,
						runCommand,
						fetchWebhook,
						saveWebhook,
						engineInfo, setLanguage
					})
				}, localized(Component)), "ia-shell: settings section " + id);
			};
			section("language", 5, "language.title", LanguageSection);
			section("strategy", 20, "ui.strategy.and.risk.controls", StrategySection);
			section("schedule", 30, "ui.automatic.rounds.and.scheduling", ScheduleSection);
			section("markets", 40, "ui.markets.and.screening", MarketsSection);
			section("notify", 50, "ui.notifications", NotifySection);
			section("about", 60, "ui.application.settings", AboutSection);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
