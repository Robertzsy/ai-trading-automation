window.__ModuleLoader__.load({
	id: "@investment-auto/dsh-product-shell",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");

		// ── styles ─────────────────────────────────────────────────────────
		const CSS_ID = "@investment-auto/dsh-product-shell/style";
		const css = ".ia-shell{display:flex;flex-direction:column;height:100%;min-width:0;background:var(--dsw-alias-bg-base)}.ia-topbar{flex:none;display:flex;align-items:center;gap:4px;height:48px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}.ia-brand{display:flex;align-items:center;gap:8px;margin-right:16px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}.ia-brandmark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#2f6fed,#4cc2ff);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}.ia-nav{display:flex;align-items:center;gap:2px}.ia-navbtn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;padding:6px 12px;border-radius:8px;cursor:pointer}.ia-navbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ia-navbtn[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}.ia-body{flex:1;min-height:0;display:flex;position:relative}.ia-sidebar{flex:none;width:264px;display:flex;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));min-width:0}.ia-sidebar-scroll{flex:1;min-height:0;overflow-y:auto;padding:8px}.ia-newbtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:8px;cursor:pointer;margin-bottom:8px}.ia-newbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}.ia-search{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:6px 10px;margin-bottom:8px;outline:none}.ia-search:focus{border-color:var(--dsw-alias-brand-primary)}.ia-session{display:flex;align-items:center;gap:8px;border-radius:8px;padding:7px 8px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin-bottom:2px;min-width:0}.ia-session:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ia-session[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:500}.ia-session-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ia-session-actions{flex:none;display:none;gap:2px}.ia-session:hover .ia-session-actions{display:flex}.ia-session-actions button{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;padding:2px 5px;border-radius:5px;cursor:pointer}.ia-session-actions button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ia-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:16px 8px;text-align:center}.ia-center{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}.ia-details{flex:none;width:340px;border-left:1px solid var(--dsw-alias-border-l2);overflow-y:auto;background:var(--dsw-alias-bg-base)}.ia-page{flex:1;min-width:0;overflow-y:auto;padding:16px 20px}.ia-page-title{font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 4px}.ia-page-sub{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0 0 16px}.ia-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-module-platform);padding:14px 16px;margin-bottom:12px}.ia-card h3{margin:0 0 8px;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}.ia-kv{display:flex;justify-content:space-between;font-size:13px;line-height:24px;color:var(--dsw-alias-label-secondary);border-bottom:1px dashed var(--dsw-alias-border-l2)}.ia-kv:last-child{border-bottom:none}.ia-kv b{color:var(--dsw-alias-label-primary);font-weight:600}.ia-chip{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:2px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-right:6px}.ia-chip[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.ia-chip[data-kind=warn]{border-color:var(--ia-warn);color:var(--ia-warn)}.ia-chip[data-kind=danger]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.ia-settings{flex:1;min-width:0;display:flex;overflow:hidden}.ia-settings-nav{flex:none;width:200px;border-right:1px solid var(--dsw-alias-border-l1);padding:12px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.ia-settings-nav button{border:none;background:transparent;text-align:left;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);padding:8px 12px;border-radius:8px;cursor:pointer}.ia-settings-nav button:hover{background:var(--dsw-alias-interactive-bg-hover)}.ia-settings-nav button[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}.ia-settings-content{flex:1;min-width:0;overflow-y:auto;padding:16px 20px}.ia-form-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-form-row:last-child{border-bottom:none}.ia-form-label{font-size:13px;color:var(--dsw-alias-label-primary)}.ia-form-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:2px}.ia-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;border-radius:8px;padding:6px 10px;outline:none;min-width:180px}.ia-input:focus{border-color:var(--dsw-alias-brand-primary)}.ia-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:6px 12px;cursor:pointer}.ia-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.ia-btn[data-kind=primary]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}.ia-btn[data-kind=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.ia-btn:disabled{opacity:.45;cursor:default}.ia-notice{font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;margin-top:10px}.ia-notice[data-kind=ok]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}.ia-notice[data-kind=err]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}.ia-table{width:100%;border-collapse:collapse;font-size:12px;line-height:20px}.ia-table th{text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-table td{padding:4px 8px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l2)}.ia-table tr:last-child td{border-bottom:none}";
		const productCss = [
			".ia-shell{display:grid;grid-template-columns:88px minmax(0,1fr);height:100%;min-width:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}",
			".ia-rail{min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:16px 9px 12px;border-right:1px solid rgba(255,255,255,.07);background:#10272b;color:#dce9e9}",
			".ia-rail-brand{width:42px;height:42px;margin:0 auto 16px;display:grid;place-items:center;border-radius:12px;background:#49b9a5;color:#0b2a27;font-size:13px;font-weight:700;box-shadow:0 7px 22px rgba(73,185,165,.25)}",
			".ia-rail-nav{display:flex;flex-direction:column;gap:5px}.ia-rail-spacer{flex:1}",
			".ia-navbtn{min-height:58px;border:0;background:transparent;color:#9fb2b5;font:inherit;font-size:11px;line-height:16px;padding:7px 3px;border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;white-space:nowrap}",
			".ia-navbtn:hover{background:rgba(255,255,255,.07);color:#fff}.ia-navbtn[data-active=true]{background:rgba(73,185,165,.15);color:#70d6c4;font-weight:500}",
			".ia-navicon{font-family:'Segoe UI Symbol','Microsoft YaHei',sans-serif;font-size:19px;line-height:20px;font-weight:400}",
			".ia-body{min-width:0;min-height:0;display:flex;position:relative;background:var(--dsw-alias-bg-base)}",
			".ia-sidebar{width:250px;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}",
			".ia-sidebar-head{height:68px;flex:none;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-sidebar-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ia-iconbtn{width:32px;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font:inherit;font-size:18px;line-height:28px;cursor:pointer;display:grid;place-items:center}",
			".ia-iconbtn:hover{border-color:#49b9a5;color:#238f7c;background:var(--dsw-alias-interactive-bg-hover)}",
			".ia-sidebar-scroll{padding:11px}.ia-newbtn{display:none}.ia-search{height:34px;margin:0 0 12px;padding:7px 10px;border-radius:9px}",
			".ia-session-group{padding:5px 7px;color:var(--dsw-alias-label-tertiary);font-size:10px;letter-spacing:.04em}",
			".ia-session{min-height:48px;align-items:flex-start;flex-direction:column;gap:2px;padding:8px 9px;margin-bottom:3px;border-radius:9px}",
			".ia-session[data-active=true]{background:color-mix(in srgb,#49b9a5 13%,var(--dsw-alias-bg-module-platform));font-weight:500}",
			".ia-session-main{width:100%;display:flex;align-items:center;gap:6px;min-width:0}.ia-session-meta{font-size:10px;color:var(--dsw-alias-label-tertiary);font-weight:400}",
			".ia-center{background:var(--dsw-alias-bg-base)}.ia-center [aria-label='选择工作区'],.ia-center [aria-label^='访问模式'],.ia-center [class*='_heroWorkspaceRow'],.ia-center [class*='_fishHitbox'],.ia-center [class*='_previewBadge']{display:none!important}.ia-details{width:300px}.ia-context{flex:none;width:278px;min-width:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));overflow-y:auto}",
			".ia-context-head{height:68px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-context-head strong{font-size:13px;font-weight:600}.ia-context-section{padding:15px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-context-label{margin-bottom:10px;color:var(--dsw-alias-label-tertiary);font-size:10px;letter-spacing:.07em;text-transform:uppercase}",
			".ia-context-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:8px 0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}",
			".ia-context-row b{color:var(--dsw-alias-label-primary);font-weight:500;text-align:right}.ia-context-note{font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".ia-context-link{width:100%;margin-top:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:18px;padding:7px 10px;cursor:pointer}",
			".ia-context-link:hover{border-color:#49b9a5;color:#238f7c}.ia-context-reopen{position:absolute;right:12px;top:12px;z-index:4}",
			".ia-page{padding:0;background:var(--dsw-alias-bg-base)}.ia-page-head{height:68px;padding:0 26px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".ia-page-head-copy{min-width:0}.ia-page-title{font-size:18px;font-weight:600;margin:0}.ia-page-sub{font-size:11px;margin:4px 0 0}",
			".ia-page-status{display:inline-flex;align-items:center;gap:7px;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}.ia-page-status-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}.ia-page-status[data-kind=error] .ia-page-status-dot{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}.ia-page-status[data-kind=warn] .ia-page-status-dot{background:var(--ia-warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--ia-warn) 12%,transparent)}",
			".ia-page-content{padding:22px 26px 28px;max-width:1500px;margin:0 auto}.ia-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:14px}",
			".ia-kpi{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-module-platform);padding:16px 17px}.ia-kpi-label{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".ia-kpi-value{margin-top:8px;font-size:22px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary);letter-spacing:-.02em}.ia-kpi-foot{margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}",
			".ia-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.7fr);gap:14px}.ia-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-module-platform);overflow:hidden}",
			".ia-panel-head{padding:15px 17px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.ia-panel-head h3{margin:0;font-size:13px;font-weight:600}.ia-panel-head span{color:var(--dsw-alias-label-tertiary);font-size:10px}",
			".ia-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border-top:1px solid var(--dsw-alias-border-l1)}",
			".ia-market{padding:15px 17px;background:var(--dsw-alias-bg-module-platform)}.ia-market-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;font-size:12px}",
			".ia-market-badge{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:25px;padding:0 7px;border-radius:8px;background:color-mix(in srgb,#49b9a5 13%,var(--dsw-alias-bg-module-platform));color:#238f7c;font-size:10px;font-weight:600}",
			".ia-market-value{font-size:17px;font-weight:600}.ia-market-meta{display:flex;justify-content:space-between;gap:8px;margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:10px}",
			".ia-agenda{padding:0 17px 10px}.ia-agenda-item{display:grid;grid-template-columns:29px minmax(0,1fr);gap:10px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}",
			".ia-agenda-icon{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,#49b9a5 13%,var(--dsw-alias-bg-module-platform));color:#238f7c;font-size:13px}",
			".ia-agenda-title{font-size:11px;color:var(--dsw-alias-label-primary)}.ia-agenda-meta{margin-top:3px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
			".ia-report-list{margin:0;padding:0;list-style:none}.ia-report-list li{padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-all}",
			".ia-flow-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px}.ia-flow-map{padding:19px}.ia-flow-map-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px}",
			".ia-flow-map-title h3{margin:0;font-size:14px;font-weight:600}.ia-flow-map-title p{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}",
			".ia-flow-pill{display:inline-flex;padding:4px 8px;border-radius:99px;background:color-mix(in srgb,#49b9a5 13%,var(--dsw-alias-bg-module-platform));color:#238f7c;font-size:10px;white-space:nowrap}",
			".ia-flow-band{display:grid;grid-template-columns:108px minmax(0,1fr);gap:12px;padding:11px 0;border-top:1px solid var(--dsw-alias-border-l2)}.ia-flow-label{padding-top:7px;color:var(--dsw-alias-label-tertiary);font-size:10px}",
			".ia-flow-nodes{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.ia-flow-node{min-width:86px;padding:8px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));font-size:10px;text-align:center}",
			".ia-flow-node[data-kind=primary]{border-color:color-mix(in srgb,#49b9a5 55%,var(--dsw-alias-border-l2));background:color-mix(in srgb,#49b9a5 11%,var(--dsw-alias-bg-module-platform));color:#238f7c}.ia-flow-node[data-kind=guard]{border-color:var(--ia-warn);color:var(--ia-warn)}",
			".ia-flow-arrow{color:var(--dsw-alias-label-tertiary);font-size:12px}.ia-flow-side{display:flex;flex-direction:column;gap:14px}.ia-flow-side .ia-panel{padding:16px}.ia-flow-side h3{margin:0 0 12px;font-size:13px;font-weight:600}",
			".ia-flow-warning{padding:11px 12px;border-radius:9px;background:color-mix(in srgb,var(--ia-warn) 11%,transparent);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:17px}",
			".ia-flow-check{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:10px}.ia-flow-check-num{width:19px;height:19px;display:grid;place-items:center;border-radius:6px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-tertiary);font-size:9px}.ia-flow-check-state{color:var(--dsw-alias-label-tertiary)}",
			".ia-settings-page{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}.ia-settings-page .ia-settings{flex:1;min-height:0}.ia-settings{background:var(--dsw-alias-bg-base)}.ia-settings-nav{width:218px;padding:14px 10px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}.ia-settings-nav button{padding:9px 11px;border-radius:9px}.ia-settings-content{padding:24px 28px;max-width:1100px}",
			".ia-card{border-radius:11px}.ia-form-row{padding:14px 0}.ia-context-chip{display:inline-flex;align-items:center;padding:3px 7px;border-radius:7px;background:color-mix(in srgb,#49b9a5 12%,var(--dsw-alias-bg-module-platform));color:#238f7c;font-size:10px}",
			"@media(max-width:1180px){.ia-context{display:none}.ia-flow-grid{grid-template-columns:1fr}.ia-flow-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}",
			"@media(max-width:900px){.ia-shell{grid-template-columns:72px minmax(0,1fr)}.ia-sidebar{width:220px}.ia-navbtn{font-size:10px}.ia-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-dashboard-grid{grid-template-columns:1fr}.ia-page-content{padding:18px}.ia-page-head{padding:0 18px}}",
			// ── 分析中心：主题兼容层 ───────────────────────────────────────
			// 运行版只注入 14 个 token（docs/UPGRADE_PLAN_ANALYSIS_CENTER.md §4.2.4）：
			// --dsw-alias-bg-module-platform / --dsw-alias-label-tertiary /
			// --dsw-alias-interactive-bg-hover(-solid) / --dsw-alias-button-primary-fill(-hover)
			// 都不在目录中，所以这里统一定义带 fallback 的 --ia-* 别名。
			// 分析中心的新组件一律只用 --ia-*，不直接引用目录外的 token。
			".ia-shell{--ia-surface:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,transparent));--ia-label-3:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,inherit));--ia-hover:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent));--ia-hover-solid:var(--dsw-alias-interactive-bg-hover-solid,var(--ia-hover));--ia-warn:var(--dsw-alias-state-warn-primary,#d97706);--ia-danger:var(--dsw-alias-state-error-primary,#ef4444);--ia-ok:var(--dsw-alias-state-success-primary,#22c55e);--ia-idle:var(--dsw-alias-state-idle-primary,var(--dsw-alias-border-l2,#94a3b8));--ia-brand:var(--dsw-alias-brand-primary,#2f6fed)}",
			".ia-notice[data-kind=warn]{color:var(--ia-warn);background:color-mix(in srgb,var(--ia-warn) 12%,transparent)}",
			// ── 分析中心：ia-an-* 组件 ──────────────────────────────────────
			// 外层严格按规格 360px + minmax(0,1fr)；中间列内部再切「流程 | 报告」，
			// 这样既保持规格里的两轨栅格，又得到三栏观感。
			".ia-an-grid{display:grid;grid-template-columns:360px minmax(0,1fr);gap:14px;align-items:start}",
			".ia-an-main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;align-items:start;min-width:0}",
			".ia-an-col{display:flex;flex-direction:column;gap:14px;min-width:0}",
			".ia-an-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--ia-surface);padding:14px 16px;min-width:0}",
			".ia-an-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}",
			".ia-an-panel-head h3{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ia-an-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}",
			".ia-an-lab{font-size:11px;color:var(--ia-label-3)}",
			".ia-an-input,.ia-an-select,.ia-an-area{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:7px 9px}",
			".ia-an-area{min-height:86px;resize:vertical;font-family:ui-monospace,Consolas,monospace}",
			".ia-an-input:focus,.ia-an-select:focus,.ia-an-area:focus{outline:none;border-color:var(--ia-brand)}",
			".ia-an-seg{display:flex;gap:4px;padding:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1,transparent)}",
			".ia-an-seg button{flex:1;min-width:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:18px;padding:5px 6px;cursor:pointer}",
			".ia-an-seg button:hover{background:var(--ia-hover)}",
			".ia-an-seg button[data-active=true]{background:var(--ia-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600}",
			".ia-an-note{font-size:10px;line-height:16px;color:var(--ia-label-3)}",
			".ia-an-check{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;align-items:start;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}",
			".ia-an-check:first-child{border-top:none}",
			".ia-an-check-mark{font-size:11px;line-height:17px;font-weight:700}",
			".ia-an-check[data-ok=true] .ia-an-check-mark{color:var(--ia-ok)}",
			".ia-an-check[data-ok=false] .ia-an-check-mark{color:var(--ia-warn)}",
			".ia-an-primary{width:100%;border:0;border-radius:10px;background:var(--ia-brand);color:#fff;font:inherit;font-size:13px;font-weight:600;line-height:20px;padding:10px;cursor:pointer}",
			".ia-an-primary:hover:not(:disabled){filter:brightness(1.08)}",
			".ia-an-primary:disabled{opacity:.5;cursor:not-allowed}",
			".ia-an-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}",
			".ia-an-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--ia-surface);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:18px;padding:7px 8px;cursor:pointer}",
			".ia-an-btn:hover:not(:disabled){background:var(--ia-hover)}",
			".ia-an-btn:disabled{opacity:.45;cursor:not-allowed}",
			".ia-an-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;margin-bottom:12px}",
			".ia-an-kpi{padding:10px 12px;background:var(--ia-surface);min-width:0}",
			".ia-an-kpi span{display:block;font-size:10px;color:var(--ia-label-3)}",
			".ia-an-kpi b{display:block;margin-top:4px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all}",
			".ia-an-stage{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l2)}",
			".ia-an-stage:first-child{border-top:none}",
			".ia-an-stage-dot{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;font-size:11px;background:var(--ia-hover);color:var(--ia-label-3)}",
			".ia-an-stage[data-status=running] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-brand) 16%,transparent);color:var(--ia-brand)}",
			".ia-an-stage[data-status=completed] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-ok) 16%,transparent);color:var(--ia-ok)}",
			".ia-an-stage[data-status=failed] .ia-an-stage-dot{background:color-mix(in srgb,var(--ia-danger) 16%,transparent);color:var(--ia-danger)}",
			".ia-an-stage-name{font-size:12px;color:var(--dsw-alias-label-primary)}",
			".ia-an-stage-meta{margin-top:3px;font-size:10px;line-height:15px;color:var(--ia-label-3);word-break:break-all}",
			".ia-an-stage-time{font-size:11px;color:var(--ia-label-3);text-align:right;white-space:nowrap}",
			".ia-an-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:9px;margin-top:12px}",
			".ia-an-agent{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:9px 10px;background:var(--dsw-alias-bg-base);min-width:0}",
			".ia-an-agent[data-status=failed]{border-color:var(--ia-danger)}",
			".ia-an-agent[data-status=completed]{border-color:color-mix(in srgb,var(--ia-ok) 45%,var(--dsw-alias-border-l2))}",
			".ia-an-agent-head{display:flex;align-items:center;justify-content:space-between;gap:6px}",
			".ia-an-agent-label{font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all;min-width:0}",
			".ia-an-agent-meta{margin-top:5px;font-size:10px;line-height:15px;color:var(--ia-label-3)}",
			".ia-an-agent-body{margin-top:5px;font-size:10px;line-height:15px;color:var(--dsw-alias-label-secondary);max-height:64px;overflow:auto;white-space:pre-wrap;word-break:break-word}",
			".ia-an-agent[data-status=failed] .ia-an-agent-body{color:var(--ia-danger)}",
			".ia-an-log{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}",
			".ia-an-log-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--ia-label-3);min-width:0}",
			".ia-an-log-body{margin-top:8px;max-height:240px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}",
			".ia-an-report-list{margin:0;padding:0;list-style:none;max-height:280px;overflow-y:auto}",
			".ia-an-report-item{width:100%;text-align:left;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;padding:8px 9px;cursor:pointer;display:block}",
			".ia-an-report-item:hover{background:var(--ia-hover)}",
			".ia-an-report-item[data-active=true]{border-color:var(--ia-brand);background:var(--ia-hover-solid)}",
			".ia-an-report-title{font-size:11px;color:var(--dsw-alias-label-primary);word-break:break-all}",
			".ia-an-report-meta{margin-top:3px;font-size:10px;color:var(--ia-label-3)}",
			".ia-an-report-body{margin:10px 0 0;padding:11px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2);max-height:420px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}",
			"@media(max-width:1440px){.ia-an-main{grid-template-columns:minmax(0,1fr)}}",
			"@media(max-width:1180px){.ia-an-grid{grid-template-columns:1fr}}"
		].join("");
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin=" + JSON.stringify(CSS_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = CSS_ID;
			tag.textContent = css + productCss;
			document.head.appendChild(tag);
		}

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
			return number.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
		};
		const marketName = { cn: "A股", hk: "港股", us: "美股", etf: "ETF" };

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
					react_jsx_runtime.jsx("h1", { className: "ia-page-title", children: "投资概览" }),
					react_jsx_runtime.jsx("p", { className: "ia-page-sub", children: "模拟账户 · 纸面交易 · 行情来自公开第三方接口，仅供研究" }),
					error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "引擎暂不可达：" + error }) : null,
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "系统与风控状态" }),
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: "模式：" + (status.operation_mode ?? "-") }),
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: "策略：" + (mandate.display_name ?? mandate.profile ?? "-") }),
									killed ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "danger", children: "紧急停止" }) : paused ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "warn", children: "已暂停" }) : react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": "ok", children: "风控正常" }),
									react_jsx_runtime.jsx("span", { className: "ia-chip", children: "投资引擎：" + (status.investment_worker_alive ? "运行中" : "未运行") })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { marginTop: 10 },
								children: Object.entries(markets).map(([market, info]) => react_jsx_runtime.jsx("div", {
									key: market,
									className: "ia-kv",
									children: [react_jsx_runtime.jsx("span", { children: marketName[market] + " 下一轮次" }), react_jsx_runtime.jsx("b", { children: String(info?.next_cycle ?? "-").replace("T", " ").slice(0, 16) })]
								}))
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "账户资产" }),
							react_jsx_runtime.jsxs("table", {
								className: "ia-table",
								children: [
									react_jsx_runtime.jsxs("thead", { children: [react_jsx_runtime.jsxs("tr", { children: [react_jsx_runtime.jsx("th", { children: "市场" }), react_jsx_runtime.jsx("th", { children: "总资产" }), react_jsx_runtime.jsx("th", { children: "现金" }), react_jsx_runtime.jsx("th", { children: "持仓" }), react_jsx_runtime.jsx("th", { children: "成交数" })] })] }),
									react_jsx_runtime.jsx("tbody", {
										children: accountRows.length > 0 ? accountRows.map((row) => react_jsx_runtime.jsxs("tr", {
											key: row.market,
											children: [react_jsx_runtime.jsx("td", { children: marketName[row.market] }), react_jsx_runtime.jsx("td", { children: fmtMoney(row.totalCapital) }), react_jsx_runtime.jsx("td", { children: fmtMoney(row.cash) }), react_jsx_runtime.jsx("td", { children: row.holdings }), react_jsx_runtime.jsx("td", { children: row.trades })]
										})) : react_jsx_runtime.jsx("tr", { children: react_jsx_runtime.jsx("td", { colSpan: 5, children: "引擎数据暂不可用" }) })
									})
								]
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "最近轮次报告" }),
							reports.length > 0 ? react_jsx_runtime.jsx("ul", {
								style: { margin: 0, paddingLeft: 18 },
								children: reports.slice(0, 8).map((report) => react_jsx_runtime.jsx("li", { key: report.file, children: report.file }))
							}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: "暂无轮次报告" })
						]
					}),
					macro ? react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "最新宏观日报摘要" }),
							react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }, children: macro.slice(0, 3000) })
						]
					}) : null
				]
			});
		}

		function useInvestmentSummary(intervalMs = 30000) {
			const [state, setState] = react.useState({ data: null, error: "", loading: true });
			react.useEffect(() => {
				let cancelled = false;
				const load = async () => {
					try {
						const data = await jsonFetch("/api/investment/summary");
						if (!cancelled) setState({ data, error: "", loading: false });
					} catch (error) {
						if (!cancelled) setState({ data: null, error: String(error?.message ?? error), loading: false });
					}
				};
				load();
				const timer = setInterval(load, intervalMs);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [intervalMs]);
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

		function ProductDashboard() {
			const summaryState = useInvestmentSummary(10000);
			const summary = summaryState.data ?? {};
			const status = summary.status ?? {};
			const engineError = summaryState.error || status.error || "";
			const portfolios = summary.portfolios ?? {};
			const reports = Array.isArray(summary?.reports?.reports) ? summary.reports.reports : [];
			const macro = typeof summary?.macro?.content === "string" ? summary.macro.content : "";
			const control = status.control ?? {};
			const mandate = status.mandate ?? {};
			const marketRows = ["cn", "hk", "us", "etf"].map((market) => {
				const account = portfolios[market];
				if (!account || account.error) return null;
				const holdings = Array.isArray(account.holdings) ? account.holdings : [];
				const trades = Array.isArray(account.tradeHistory) ? account.tradeHistory : [];
				return {
					market,
					totalCapital: account.totalCapital,
					cash: account.cash,
					holdings: holdings.length,
					trades: trades.length
				};
			}).filter(Boolean);
			const holdingsCount = marketRows.reduce((total, row) => total + row.holdings, 0);
			const tradesCount = marketRows.reduce((total, row) => total + row.trades, 0);
			const riskLabel = engineError ? "未知" : control.kill_switch ? "紧急停止" : control.paused ? "已暂停" : "正常";
			const riskKind = engineError ? "warn" : control.kill_switch ? "danger" : control.paused ? "warn" : "ok";
			const currency = { cn: "¥", hk: "HK$", us: "US$", etf: "¥" };
			const nextRuns = Object.entries(status.markets ?? {}).slice(0, 4);
			const analysis = summary.analysis ?? null;

			return react_jsx_runtime.jsxs("div", {
				className: "ia-page",
				children: [
					react_jsx_runtime.jsx(PageHeader, {
						title: "投资总览",
						subtitle: "账户、组合、风险与自主运行状态",
						status: summaryState.loading ? "正在连接投资引擎" : engineError ? "投资引擎不可用" : "模拟交易 · 系统正常",
						statusKind: engineError ? "error" : summaryState.loading ? "warn" : "ok"
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-page-content",
						children: [
							engineError ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "引擎暂不可达：" + engineError }) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-kpi-grid",
								children: [
									react_jsx_runtime.jsxs("div", { className: "ia-kpi", children: [react_jsx_runtime.jsx("div", { className: "ia-kpi-label", children: "模拟账户" }), react_jsx_runtime.jsx("div", { className: "ia-kpi-value", children: marketRows.length || "-" }), react_jsx_runtime.jsx("div", { className: "ia-kpi-foot", children: "A 股 / 港股 / 美股 / ETF" })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-kpi", children: [react_jsx_runtime.jsx("div", { className: "ia-kpi-label", children: "当前持仓" }), react_jsx_runtime.jsx("div", { className: "ia-kpi-value", children: holdingsCount }), react_jsx_runtime.jsx("div", { className: "ia-kpi-foot", children: "累计成交 " + tradesCount + " 笔" })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-kpi", children: [react_jsx_runtime.jsx("div", { className: "ia-kpi-label", children: "最近报告" }), react_jsx_runtime.jsx("div", { className: "ia-kpi-value", children: reports.length }), react_jsx_runtime.jsx("div", { className: "ia-kpi-foot", children: "展示最近 12 个轮次" })] }),
									react_jsx_runtime.jsxs("div", { className: "ia-kpi", children: [react_jsx_runtime.jsx("div", { className: "ia-kpi-label", children: "组合风险" }), react_jsx_runtime.jsx("div", { className: "ia-kpi-value", children: riskLabel }), react_jsx_runtime.jsxs("div", { className: "ia-kpi-foot", children: ["策略：", mandate.display_name ?? mandate.profile ?? "-"] })] })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-dashboard-grid",
								children: [
									react_jsx_runtime.jsxs("section", {
										className: "ia-panel",
										children: [
											react_jsx_runtime.jsxs("div", { className: "ia-panel-head", children: [react_jsx_runtime.jsx("h3", { children: "四市场账户" }), react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": riskKind, children: "风控" + riskLabel })] }),
											react_jsx_runtime.jsx("div", {
												className: "ia-market-grid",
												children: marketRows.length > 0 ? marketRows.map((row) => react_jsx_runtime.jsxs("div", {
													className: "ia-market",
													key: row.market,
													children: [
														react_jsx_runtime.jsxs("div", { className: "ia-market-head", children: [react_jsx_runtime.jsx("span", { className: "ia-market-badge", children: marketName[row.market] }), react_jsx_runtime.jsx("span", { className: "ia-context-chip", children: row.holdings + " 个持仓" })] }),
														react_jsx_runtime.jsx("div", { className: "ia-market-value", children: currency[row.market] + " " + fmtMoney(row.totalCapital) }),
														react_jsx_runtime.jsxs("div", { className: "ia-market-meta", children: [react_jsx_runtime.jsx("span", { children: "现金 " + fmtMoney(row.cash) }), react_jsx_runtime.jsx("span", { children: row.trades + " 笔成交" })] })
													]
												}, row.market)) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: "账户数据暂不可用" })
											})
										]
									}),
									react_jsx_runtime.jsxs("section", {
										className: "ia-panel",
										children: [
											react_jsx_runtime.jsxs("div", { className: "ia-panel-head", children: [react_jsx_runtime.jsx("h3", { children: "运行动态" }), react_jsx_runtime.jsx("span", { children: status.operation_mode === "automatic" ? "自动运行" : "手动运行" })] }),
											react_jsx_runtime.jsx("div", {
												className: "ia-agenda",
												children: [
													...nextRuns.map(([market, info]) => react_jsx_runtime.jsxs("div", {
														className: "ia-agenda-item",
														key: market,
														children: [
															react_jsx_runtime.jsx("div", { className: "ia-agenda-icon", children: "◷" }),
															react_jsx_runtime.jsxs("div", { children: [react_jsx_runtime.jsx("div", { className: "ia-agenda-title", children: marketName[market] + " 下一轮" }), react_jsx_runtime.jsx("div", { className: "ia-agenda-meta", children: String(info?.next_cycle ?? "尚未安排").replace("T", " ").slice(0, 16) })] })
															]
														}, market)),
														analysis ? react_jsx_runtime.jsxs("div", {
															className: "ia-agenda-item",
															children: [
																react_jsx_runtime.jsx("div", { className: "ia-agenda-icon", children: analysis.status === "running" ? "↻" : "✓" }),
																react_jsx_runtime.jsxs("div", { children: [react_jsx_runtime.jsx("div", { className: "ia-agenda-title", children: "最近分析 · " + (marketName[analysis.market] ?? analysis.market) }), react_jsx_runtime.jsx("div", { className: "ia-agenda-meta", children: analysisStageLabel(analysis.current_stage) + " · Agent " + (analysis.completed_agents ?? 0) + "/" + (analysis.expected_agents ?? 0) })] })
															]
														}) : null,
														react_jsx_runtime.jsxs("div", {
														className: "ia-agenda-item",
														children: [
															react_jsx_runtime.jsx("div", { className: "ia-agenda-icon", children: "▤" }),
															react_jsx_runtime.jsxs("div", { children: [react_jsx_runtime.jsx("div", { className: "ia-agenda-title", children: "最近轮次报告" }), reports.length > 0 ? react_jsx_runtime.jsx("ul", { className: "ia-report-list", children: reports.slice(0, 3).map((report) => react_jsx_runtime.jsx("li", { children: report.file, key: report.file })) }) : react_jsx_runtime.jsx("div", { className: "ia-agenda-meta", children: "暂无轮次报告" })] })
														]
													})
												]
											})
										]
									})
								]
							}),
							macro ? react_jsx_runtime.jsxs("section", {
								className: "ia-card",
								style: { marginTop: 14 },
								children: [
									react_jsx_runtime.jsx("h3", { children: "最新宏观日报摘要" }),
									react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 11, lineHeight: "19px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto" }, children: macro.slice(0, 2200) })
								]
							}) : null
						]
					})
				]
			});
		}

		const workflowBands = [
			["01 · 数据准备", [["市场状态", "primary"], ["筛选候选"], ["持仓 / 授权"]]],
			["02 · 标的研究", [["技术分析"], ["基本面"], ["新闻"], ["情绪"]]],
			["03 · 研究裁决", [["多方研究员"], ["空方研究员"], ["研究经理", "primary"]]],
			["04 · 组合构建", [["标的交易员"], ["组合经理草案", "primary"]]],
			["05 · 风险裁决", [["激进视角"], ["保守视角"], ["中性视角"], ["风险经理", "primary"]]],
			["06 · 决策执行", [["最终组合决策", "primary"], ["硬风险检查", "guard"], ["模拟执行 / 报告"]]]
		];
		const analysisStageNames = {
			preparing: "准备数据",
			resuming: "恢复检查点",
			base_research: "四类基础研究",
			research_debate: "多空辩论与研究裁决",
			portfolio_draft: "组合草案",
			risk_review: "风险辩论与裁决",
			final_decision: "最终组合决策",
			execution: "硬风控与模拟执行",
			ready_for_execution: "等待批准",
			completed: "已完成",
			failed: "失败",
			cancelled: "已停止"
		};
		function analysisStageLabel(stage) {
			return analysisStageNames[stage] ?? (stage || "尚未运行");
		}
		function checkpointState(analysis, stages) {
			if (!analysis) return "未运行";
			if (stages.some((stage) => analysis?.checkpoints?.[stage]?.status === "completed")) return "已完成";
			if (stages.includes(analysis.current_stage) && analysis.status === "running") return "运行中";
			return "等待中";
		}

		function WorkflowPage() {
			const summaryState = useInvestmentSummary(5000);
			const status = summaryState.data?.status ?? {};
			const engineError = summaryState.error || status.error || "";
			const reports = Array.isArray(summaryState.data?.reports?.reports) ? summaryState.data.reports.reports : [];
			const control = status.control ?? {};
			const nextRuns = Object.entries(status.markets ?? {}).slice(0, 4);
			const analysis = summaryState.data?.analysis ?? null;
			const currentStage = analysisStageLabel(analysis?.current_stage);
			const workflowStatus = !analysis ? "尚无分析轮次" : analysis.status === "running" ? "运行中 · " + currentStage : analysis.status === "completed" ? "最近轮次已完成" : "最近轮次失败";
			const workflowKind = !analysis ? "warn" : analysis.status === "completed" ? "ok" : analysis.status === "failed" ? "error" : "warn";
			const checks = [
				["角色隔离与逐标的研究", checkpointState(analysis, ["base_research"])],
				["证据域与引用校验", (analysis?.evidence_count ?? 0) > 0 ? "已记录 " + analysis.evidence_count + " 条" : checkpointState(analysis, ["base_research"])],
				["失败降级与安全 HOLD", checkpointState(analysis, ["final_decision"])],
				["阶段检查点与恢复", analysis && Object.keys(analysis.checkpoints ?? {}).length > 0 ? Object.keys(analysis.checkpoints).length + " 个检查点" : "未运行"],
				["硬风控与模拟执行", checkpointState(analysis, ["execution"])]
			];
			return react_jsx_runtime.jsxs("div", {
				className: "ia-page",
				children: [
					react_jsx_runtime.jsx(PageHeader, {
						title: "分析流程",
						subtitle: "完整投资分析链路、运行状态与恢复边界",
						status: workflowStatus,
						statusKind: workflowKind
					}),
					react_jsx_runtime.jsx("div", {
						className: "ia-page-content",
						children: react_jsx_runtime.jsxs("div", {
							className: "ia-flow-grid",
							children: [
								react_jsx_runtime.jsxs("section", {
									className: "ia-panel ia-flow-map",
									children: [
										react_jsx_runtime.jsxs("div", {
											className: "ia-flow-map-title",
											children: [
												react_jsx_runtime.jsxs("div", { children: [react_jsx_runtime.jsx("h3", { children: "目标完整分析链路" }), react_jsx_runtime.jsx("p", { children: "逐标的隔离研究，组合层统一决策，最终仍由 Python 引擎执行硬风险约束。" })] }),
												react_jsx_runtime.jsx("span", { className: "ia-flow-pill", children: "原生多角色 · 阶段可恢复" })
											]
										}),
										...workflowBands.map(([label, nodes]) => react_jsx_runtime.jsxs("div", {
											className: "ia-flow-band",
											key: label,
											children: [
												react_jsx_runtime.jsx("div", { className: "ia-flow-label", children: label }),
												react_jsx_runtime.jsx("div", {
													className: "ia-flow-nodes",
													children: nodes.flatMap(([node, kind], index) => [
														react_jsx_runtime.jsx("span", { className: "ia-flow-node", "data-kind": kind, children: node }, node),
														index < nodes.length - 1 ? react_jsx_runtime.jsx("span", { className: "ia-flow-arrow", children: "→" }, node + "-arrow") : null
													])
												})
											]
										}, label))
									]
								}),
								react_jsx_runtime.jsxs("aside", {
									className: "ia-flow-side",
									children: [
										react_jsx_runtime.jsxs("section", {
											className: "ia-panel",
											children: [
											react_jsx_runtime.jsx("h3", { children: "当前分析状态" }),
											analysis?.error ? react_jsx_runtime.jsx("div", { className: "ia-flow-warning", children: "失败：" + analysis.error }) : null,
											react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "分析轮次" }), react_jsx_runtime.jsx("b", { children: analysis?.cycle_id ?? "尚无记录" })] }),
											react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "当前阶段" }), react_jsx_runtime.jsx("b", { children: currentStage })] }),
											react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "Agent 进度" }), react_jsx_runtime.jsx("b", { children: (analysis?.completed_agents ?? 0) + "/" + (analysis?.expected_agents ?? 0) + (analysis?.failed_agents ? " · 失败 " + analysis.failed_agents : "") })] }),
											react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "证据记录" }), react_jsx_runtime.jsx("b", { children: analysis?.evidence_count ?? 0 })] }),
											react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "运行模式" }), react_jsx_runtime.jsx("b", { children: status.operation_mode === "automatic" ? "自动" : status.operation_mode === "manual" ? "手动" : "-" })] }),
												react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "投资引擎" }), react_jsx_runtime.jsx("b", { children: engineError ? "不可用" : status.investment_worker_alive ? "运行中" : "未运行" })] }),
												react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "硬风险边界" }), react_jsx_runtime.jsx("b", { children: engineError ? "未知" : control.kill_switch ? "紧急停止" : control.paused ? "已暂停" : "正常" })] }),
												react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "最近报告" }), react_jsx_runtime.jsx("b", { children: reports.length })] })
											]
										}),
										react_jsx_runtime.jsxs("section", {
											className: "ia-panel",
											children: [
											react_jsx_runtime.jsx("h3", { children: "流程验收" }),
											...checks.map(([label, state], index) => react_jsx_runtime.jsxs("div", {
													className: "ia-flow-check",
													key: label,
													children: [react_jsx_runtime.jsx("span", { className: "ia-flow-check-num", children: String(index + 1).padStart(2, "0") }), react_jsx_runtime.jsx("span", { children: label }), react_jsx_runtime.jsx("span", { className: "ia-flow-check-state", children: state })]
												}, label))
											]
										}),
										react_jsx_runtime.jsxs("section", {
											className: "ia-panel",
											children: [
												react_jsx_runtime.jsx("h3", { children: "下一轮计划" }),
												nextRuns.length > 0 ? nextRuns.map(([market, info]) => react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: marketName[market] }), react_jsx_runtime.jsx("b", { children: String(info?.next_cycle ?? "-").replace("T", " ").slice(0, 16) })] }, market)) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: "尚未安排自动轮次" })
											]
										})
									]
								})
							]
						})
					})
				]
			});
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
					react_jsx_runtime.jsxs("div", { className: "ia-context-head", children: [react_jsx_runtime.jsx("strong", { children: "投资上下文" }), react_jsx_runtime.jsx("button", { className: "ia-iconbtn", type: "button", title: "收起上下文", onClick: onClose, children: "›" })] }),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: "运行环境" }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "交易模式" }), react_jsx_runtime.jsx("b", { children: "模拟交易" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "策略" }), react_jsx_runtime.jsx("b", { children: mandate.display_name ?? mandate.profile ?? "-" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "自主运行" }), react_jsx_runtime.jsx("b", { children: engineError ? "未知" : status.operation_mode === "automatic" ? "已开启" : "手动" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "风险状态" }), react_jsx_runtime.jsx("b", { children: engineError ? "未知" : control.kill_switch ? "紧急停止" : control.paused ? "已暂停" : "正常" })] })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: "分析流程" }),
							react_jsx_runtime.jsx("span", { className: "ia-context-chip", children: analysis ? "当前：" + analysisStageLabel(analysis.current_stage) : "当前：尚无轮次" }),
							react_jsx_runtime.jsx("p", { className: "ia-context-note", children: analysis ? "多角色 Agent " + (analysis.completed_agents ?? 0) + "/" + (analysis.expected_agents ?? 0) + "，证据 " + (analysis.evidence_count ?? 0) + " 条。" : "完整多角色研究会在手动触发或自动轮次后显示实时阶段与检查点。" }),
							react_jsx_runtime.jsx("button", { className: "ia-context-link", type: "button", onClick: onOpenWorkflow, children: "查看完整分析流程" })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-context-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-context-label", children: "最近动态" }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "下一轮" }), react_jsx_runtime.jsx("b", { children: nextRun ? marketName[nextRun[0]] + " · " + String(nextRun[1]).replace("T", " ").slice(0, 16) : "-" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-context-row", children: [react_jsx_runtime.jsx("span", { children: "最近报告" }), react_jsx_runtime.jsx("b", { children: reports[0]?.file ?? "暂无" })] })
						]
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
		const ANALYSIS_MARKETS = [["cn", "A股"], ["hk", "港股"], ["us", "美股"], ["etf", "ETF"]];
		const MAX_ANALYSIS_SYMBOLS = 40;
		const ANALYSIS_PENDING_KEY = "ia.analysis.pending";
		const ANALYSIS_POLL_RUNNING_MS = 2000;
		const ANALYSIS_POLL_IDLE_MS = 8000;
		// Display metadata only: canonical stage order + the contract's stage
		// labels.  Statuses, durations and counts always come from the API.
		const analysisStageOrder = ["preparing", "resuming", "base_research", "research_debate", "portfolio_draft", "risk_review", "final_decision", "execution", "ready_for_execution"];
		const analysisTerminalStatuses = ["completed", "failed", "cancelled"];
		const analysisStatusNames = {
			queued: "排队中",
			running: "运行中",
			ready_for_execution: "等待批准",
			completed: "已完成",
			failed: "失败",
			cancelled: "已停止"
		};
		function analysisStatusLabel(status) {
			const key = String(status ?? "");
			return analysisStatusNames[key] ?? (key || "未开始");
		}
		function analysisStatusKind(status) {
			const key = String(status ?? "");
			if (key === "completed") return "ok";
			if (key === "failed") return "danger";
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
			if (seconds < 60) return seconds + " 秒";
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes + " 分 " + String(seconds % 60).padStart(2, "0") + " 秒";
			return Math.floor(minutes / 60) + " 时 " + String(minutes % 60).padStart(2, "0") + " 分";
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
		function stageMetaText(row) {
			// Only the fields the record actually carries are shown: a v1 record,
			// or a terminal marker row (completed/failed/cancelled), simply has
			// fewer parts instead of a fabricated "0/0".
			const parts = [analysisStatusLabel(row.status)];
			const total = Number(row.agents_total ?? 0);
			const done = Number(row.agents_done ?? 0);
			const failed = Number(row.agents_failed ?? 0);
			if (total > 0 || done > 0 || failed > 0) parts.push("子任务 " + done + "/" + total + (failed > 0 ? " · 失败 " + failed : ""));
			if (row.result_digest) parts.push(JSON.stringify(row.result_digest).slice(0, 140));
			return parts.join(" · ");
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
		async function fetchAnalysisRun(cycleId) {
			if (!cycleId) return null;
			try {
				const payload = await jsonFetch("/api/investment/analysis?action=run&cycle_id=" + encodeURIComponent(cycleId));
				return payload?.analysis ?? null;
			} catch (error) {
				// 404 = the engine has not written the record yet (round spinning up).
				if (String(error?.message ?? error).includes("404")) return null;
				throw error;
			}
		}

		function useAnalysisRun(cycleId) {
			const [state, setState] = react.useState({ data: null, error: "", loading: false });
			const cycleRef = react.useRef(cycleId);
			const previousCycle = react.useRef(cycleId);
			const status = String(state.data?.status ?? "");
			// 2s while a round runs, 8s otherwise, and no timer at all once the
			// round reached a terminal state.
			const intervalMs = isAnalysisTerminal(status) ? 0 : status === "running" ? ANALYSIS_POLL_RUNNING_MS : ANALYSIS_POLL_IDLE_MS;
			const load = react.useCallback(async () => {
				const target = cycleRef.current;
				if (!target) return;
				// document.hidden pauses the loop; the next tick after the tab
				// becomes visible again performs the refresh.
				if (typeof document !== "undefined" && document.hidden) return;
				try {
					const record = await fetchAnalysisRun(target);
					if (cycleRef.current === target) setState({ data: record, error: "", loading: false });
				} catch (error) {
					if (cycleRef.current === target) setState((previous) => ({ ...previous, error: String(error?.message ?? error), loading: false }));
				}
			}, []);
			react.useEffect(() => {
				cycleRef.current = cycleId;
				if (previousCycle.current !== cycleId) {
					previousCycle.current = cycleId;
					setState({ data: null, error: "", loading: Boolean(cycleId) });
				}
				if (!cycleId || intervalMs <= 0) return undefined;
				load();
				const timer = setInterval(load, intervalMs);
				return () => clearInterval(timer);
			}, [cycleId, intervalMs, load]);
			react.useEffect(() => {
				if (typeof document === "undefined") return undefined;
				const onVisibility = () => {
					if (!document.hidden) load();
				};
				document.addEventListener("visibilitychange", onVisibility);
				return () => document.removeEventListener("visibilitychange", onVisibility);
			}, [load]);
			return { ...state, reload: load };
		}

		function useActiveRounds(intervalMs) {
			const [state, setState] = react.useState({ rounds: [], error: "" });
			const load = react.useCallback(async () => {
				if (typeof document !== "undefined" && document.hidden) return;
				try {
					const payload = await jsonFetch("/api/investment/analysis?action=active");
					setState({ rounds: Array.isArray(payload?.rounds) ? payload.rounds : [], error: "" });
				} catch (error) {
					setState((previous) => ({ rounds: previous.rounds, error: String(error?.message ?? error) }));
				}
			}, []);
			react.useEffect(() => {
				load();
				const timer = setInterval(load, Math.max(ANALYSIS_POLL_RUNNING_MS, Number(intervalMs) || ANALYSIS_POLL_IDLE_MS));
				return () => clearInterval(timer);
			}, [load, intervalMs]);
			return { ...state, reload: load };
		}

		function AnalysisPipelineView({ run, loading, error, cycleId }) {
			const [logsOpen, setLogsOpen] = react.useState(false);
			const stages = run && run.stages && typeof run.stages === "object" ? run.stages : {};
			const stageRows = Object.keys(stages).map((stage) => Object.assign({ stage }, stages[stage] ?? {}));
			stageRows.sort((a, b) => {
				const left = analysisStageOrder.indexOf(a.stage);
				const right = analysisStageOrder.indexOf(b.stage);
				return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
			});
			const currentStage = String(run?.current_stage ?? "");
			if (currentStage && !stageRows.some((row) => row.stage === currentStage)) {
				// v1 records (and the instant right after start) may not carry a
				// stages entry yet: show the run's own status for that stage.
				stageRows.push({ stage: currentStage, status: run?.status ?? "" });
			}
			const agents = run && run.agents && typeof run.agents === "object" ? Object.values(run.agents).filter((value) => value && typeof value === "object") : [];
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
							react_jsx_runtime.jsx("h3", { children: "分析流程" }),
							react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": analysisStatusKind(run?.status), children: run ? "轮次 " + analysisStatusLabel(run.status) : "尚无轮次" })
						]
					}),
					error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "读取轮次失败：" + error }) : null,
					run?.error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "轮次失败：" + String(run.error) }) : null,
					warnings.length > 0 ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "warn", children: "警告 " + warnings.length + " 条：" + warnings.slice(0, 3).map((item) => String(item)).join("；") }) : null,
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-kpis",
						children: [
							react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: "轮次状态" }), react_jsx_runtime.jsx("b", { children: run ? analysisStatusLabel(run.status) : "-" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: "当前阶段" }), react_jsx_runtime.jsx("b", { children: run ? analysisStageLabel(run.current_stage) : "-" })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: "子任务 完成/预期" }), react_jsx_runtime.jsx("b", { children: (run?.completed_agents ?? 0) + "/" + (run?.expected_agents ?? 0) + (run?.failed_agents ? " · 失败 " + run.failed_agents : "") })] }),
							react_jsx_runtime.jsxs("div", { className: "ia-an-kpi", children: [react_jsx_runtime.jsx("span", { children: "证据条数" }), react_jsx_runtime.jsx("b", { children: run?.evidence_count ?? 0 })] })
						]
					}),
					react_jsx_runtime.jsx("div", {
						className: "ia-an-note",
						children: run ? "轮次 " + String(run.cycle_id ?? cycleId ?? "-") + " · " + (marketName[run.market] ?? run.market ?? "-") + " · 标签 " + String(run.label ?? "-") + " · 标的 " + (Array.isArray(run.symbols) ? run.symbols.length : 0) + " 个" : (cycleId ? "轮次 " + cycleId + "：引擎尚未返回记录" : "尚未启动分析轮次")
					}),
					stageRows.length > 0 ? react_jsx_runtime.jsx("div", { children: stageRows.map((row) => react_jsx_runtime.jsxs("div", {
						className: "ia-an-stage",
						"data-status": String(row.status ?? ""),
						children: [
							react_jsx_runtime.jsx("span", { className: "ia-an-stage-dot", children: row.status === "completed" ? "✓" : row.status === "running" ? "↻" : row.status === "failed" ? "×" : "·" }),
							react_jsx_runtime.jsxs("div", { children: [
								react_jsx_runtime.jsx("div", { className: "ia-an-stage-name", children: analysisStageLabel(row.stage) }),
								react_jsx_runtime.jsx("div", {
									className: "ia-an-stage-meta",
									children: stageMetaText(row)
								})
							]}),
							react_jsx_runtime.jsx("div", { className: "ia-an-stage-time", children: durationOf(row) })
						]
					}, row.stage)) }) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: loading ? "正在读取阶段…" : cycleId ? "该轮次尚未写入阶段记录" : "尚未启动分析轮次" }),
					agents.length > 0 ? react_jsx_runtime.jsx("div", {
						className: "ia-an-agents",
						children: agents.map((agent) => react_jsx_runtime.jsxs("div", {
							className: "ia-an-agent",
							"data-status": String(agent.status ?? ""),
							children: [
								react_jsx_runtime.jsxs("div", { className: "ia-an-agent-head", children: [
									react_jsx_runtime.jsx("span", { className: "ia-an-agent-label", children: String(agent.label ?? "-") }),
									react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": analysisStatusKind(agent.status), children: analysisStatusLabel(agent.status) })
								]}),
								react_jsx_runtime.jsx("div", { className: "ia-an-agent-meta", children: (agent.phase ? String(agent.phase) + " · " : "") + analysisStageLabel(agent.stage) + " · " + durationOf(agent) }),
								agent.error ? react_jsx_runtime.jsx("div", { className: "ia-an-agent-body", children: String(agent.error) }) : agent.summary ? react_jsx_runtime.jsx("div", { className: "ia-an-agent-body", children: String(agent.summary) }) : null
							]
						}, String(agent.stage ?? "") + ":" + String(agent.label ?? "") + ":" + String(agent.seq ?? "")))
					}) : null,
					reportMeta?.round_report ? react_jsx_runtime.jsx("div", { className: "ia-an-note", style: { marginTop: 10 }, children: "轮次报告：" + String(reportMeta.round_report).split(/[\\/]/).pop() + "（" + formatBytes(reportMeta.bytes) + " · " + formatClock(reportMeta.generated_at) + "）" }) : null,
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-log",
						children: [
							react_jsx_runtime.jsxs("div", { className: "ia-an-log-head", children: [
								react_jsx_runtime.jsx("span", { children: "运行日志 · " + logs.length + " 条" + (logs.length > visibleLogs.length ? "（显示最近 " + visibleLogs.length + " 条）" : "") }),
								react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", onClick: () => setLogsOpen((open) => !open), children: logsOpen ? "收起日志" : "展开日志" })
							]}),
							logsOpen ? react_jsx_runtime.jsx("div", {
								className: "ia-an-log-body",
								children: visibleLogs.length > 0 ? visibleLogs.map((entry) => "[" + formatClock(entry.at) + "] " + String(entry.level ?? "info").toUpperCase() + (entry.stage ? " " + analysisStageLabel(entry.stage) : "") + (entry.agent ? " " + String(entry.agent) : "") + " — " + String(entry.message ?? "")).join("\n") : "暂无日志"
							}) : null
						]
					})
				]
			});
		}

		function AnalysisReportPanel({ refreshToken, highlightCycleId }) {
			const index = useAsync(() => jsonFetch("/api/investment/reports?action=index&limit=50"), []);
			const [marketFilter, setMarketFilter] = react.useState("");
			const [selected, setSelected] = react.useState("");
			const [content, setContent] = react.useState({ loading: false, error: "", data: null });
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
				setContent({ loading: true, error: "", data: null });
				jsonFetch("/api/investment/reports?action=content&cycle_id=" + encodeURIComponent(selected))
					.then((payload) => {
						if (!cancelled) setContent({ loading: false, error: "", data: payload });
					})
					.catch((error) => {
						if (!cancelled) setContent({ loading: false, error: String(error?.message ?? error), data: null });
					});
				return () => {
					cancelled = true;
				};
			}, [selected]);
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
					setExportError("导出失败：" + String(error?.message ?? error));
				}
			};
			return react_jsx_runtime.jsxs("section", {
				className: "ia-an-panel",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-an-panel-head",
						children: [
							react_jsx_runtime.jsxs("div", { children: [
								react_jsx_runtime.jsx("h3", { children: "轮次报告" }),
								react_jsx_runtime.jsx("div", { className: "ia-an-note", children: rows.length + " 个轮次 · 来自 reports?action=index" })
							]}),
							react_jsx_runtime.jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
								react_jsx_runtime.jsxs("select", {
									className: "ia-an-select",
									style: { width: "auto" },
									value: marketFilter,
									"aria-label": "按市场筛选轮次报告",
									onChange: (event) => setMarketFilter(event.target.value),
									children: [
										react_jsx_runtime.jsx("option", { value: "", children: "全部市场" }, "all"),
										...ANALYSIS_MARKETS.map(([id, name]) => react_jsx_runtime.jsx("option", { value: id, children: name }, id))
									]
								}),
								react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", onClick: () => reloadIndex(), children: index.loading ? "刷新中…" : "刷新" })
							]})
						]
					}),
					index.error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "报告索引不可用：" + index.error }) : null,
					visibleRows.length > 0 ? react_jsx_runtime.jsx("ul", {
						className: "ia-an-report-list",
						children: visibleRows.map((row, position) => react_jsx_runtime.jsx("li", {
							children: react_jsx_runtime.jsxs("button", {
								className: "ia-an-report-item",
								type: "button",
								"data-active": String(row?.cycle_id ?? "") === selected,
								onClick: () => handleSelect(String(row?.cycle_id ?? "")),
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-an-report-title", children: formatClock(row?.started_at ?? row?.finished_at) + " · " + (marketName[row?.market] ?? row?.market ?? "-") + " · " + String(row?.label ?? "-") }),
									react_jsx_runtime.jsx("div", { className: "ia-an-report-meta", children: analysisStatusLabel(row?.status) + " · 耗时 " + durationOf(row) + " · 证据 " + (row?.evidence_count ?? 0) + " · 决策 " + (row?.decisions_count ?? 0) + (row?.report_bytes ? " · " + formatBytes(row.report_bytes) : "") })
								]
							})
						}, String(row?.cycle_id ?? "") + ":" + position))
					}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: index.loading ? "正在读取报告索引…" : "暂无轮次报告" }),
					selected ? react_jsx_runtime.jsxs("div", { children: [
						react_jsx_runtime.jsxs("div", { className: "ia-an-log-head", style: { marginTop: 10 }, children: [
							react_jsx_runtime.jsx("span", { children: content.data?.file ? String(content.data.file) : selected }),
							react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", disabled: !content.data?.content, onClick: handleExport, children: "导出 .md" })
						]}),
						exportError ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: exportError }) : null,
						content.loading ? react_jsx_runtime.jsx("div", { className: "ia-empty", children: "正在读取报告正文…" }) : null,
						content.error ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "读取报告失败：" + content.error }) : null,
						content.data?.content ? react_jsx_runtime.jsx("pre", { className: "ia-an-report-body", children: String(content.data.content) }) : null
					]}) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: "选择上方轮次查看报告正文" })
				]
			});
		}

		function AnalysisCenter() {
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
			const [notice, setNotice] = react.useState(null);
			const [refreshToken, setRefreshToken] = react.useState(0);

			const watchCycleId = String(pending?.cycle_id ?? "") || String(summaryAnalysis?.cycle_id ?? "");
			const runState = useAnalysisRun(watchCycleId);
			const run = runState.data && (!watchCycleId || String(runState.data.cycle_id) === watchCycleId)
				? runState.data
				: summaryAnalysis && (!watchCycleId || String(summaryAnalysis.cycle_id) === watchCycleId)
					? summaryAnalysis
					: null;
			const runningFromSummary = summaryRuns.find((row) => String(row?.status ?? "") === "running") ?? (String(summaryAnalysis?.status ?? "") === "running" ? summaryAnalysis : null);
			const activeState = useActiveRounds(run?.status === "running" || runningFromSummary ? ANALYSIS_POLL_RUNNING_MS : ANALYSIS_POLL_IDLE_MS);
			// ⑤ disable condition: no running round anywhere the shell can see.
			const runningRound = activeState.rounds.find((row) => String(row?.status ?? "") === "running") ?? runningFromSummary ?? (String(run?.status ?? "") === "running" ? run : null);
			const hasRunningRound = Boolean(runningRound);

			const symbols = parseAnalysisSymbols(symbolsText);
			const symbolCount = symbols.length;
			const symbolOverflow = symbolCount > MAX_ANALYSIS_SYMBOLS;
			const killSwitch = control.kill_switch === true;
			const engineReachable = !engineError;
			const screenerRun = [run, ...summaryRuns].find((row) => row && Array.isArray(row.symbols) && row.symbols.length > 0 && String(row.symbols_source ?? "").toLowerCase() === "screening") ?? null;
			const goalOptions = [];
			for (const row of [run, ...summaryRuns]) {
				const value = String(row?.goal_id ?? "");
				if (value && !goalOptions.includes(value)) goalOptions.push(value);
			}

			// The five start-button preconditions, in the same order as the spec.
			const checks = [
				{ key: "symbols", ok: symbolCount > 0, label: "标的清单非空", detail: symbolCount > 0 ? "已识别 " + symbolCount + " 个标的" : "尚未填写标的" },
				{ key: "limit", ok: !symbolOverflow, label: "不超过 " + MAX_ANALYSIS_SYMBOLS + " 个", detail: symbolCount + " / " + MAX_ANALYSIS_SYMBOLS + (symbolOverflow ? " · 超出上限" : "") },
				{ key: "kill_switch", ok: !killSwitch, label: "风控未紧急停止", detail: killSwitch ? "紧急停止已开启" : control.paused ? "引擎已暂停（分析仍可启动）" : "正常" },
				{ key: "running", ok: !hasRunningRound, label: "无运行中的轮次", detail: hasRunningRound ? "轮次 " + String(runningRound?.cycle_id ?? "-") + " 正在运行" : "无" },
				{ key: "engine", ok: engineReachable, label: "引擎可达", detail: engineReachable ? "已连接投资引擎" : "不可达：" + engineError }
			];
			const canStart = !submitting && symbolCount > 0 && !symbolOverflow && !killSwitch && !hasRunningRound && engineReachable;
			const blockReason = submitting
				? "正在提交…"
				: symbolCount === 0
					? "请先填写标的清单"
					: symbolOverflow
						? "标的数量超过 " + MAX_ANALYSIS_SYMBOLS + " 个"
						: killSwitch
							? "风控紧急停止已开启，禁止启动分析"
							: hasRunningRound
								? "已有分析轮次正在运行"
								: !engineReachable
									? "投资引擎不可达：无法启动分析"
									: "";
			const canStop = !submitting && String(run?.status ?? "") === "running" && Boolean(run?.cycle_id);
			const retryCycleId = String(pending?.cycle_id ?? "") || String(run?.cycle_id ?? "");
			// 重试 targets a round the user already started: either a stored
			// pending snapshot (a start that never reached the engine) or a round
			// the engine parked in failed/cancelled. A completed round is not
			// retryable — the engine would only replay it as a duplicate.
			const retryStatus = String(run?.status ?? "");
			const canRetry = !submitting && !hasRunningRound && Boolean(retryCycleId) && (Boolean(pending) || retryStatus === "failed" || retryStatus === "cancelled");

			const refreshAll = () => {
				runState.reload();
				activeState.reload();
				setRefreshToken((value) => value + 1);
			};

			const submitStart = async (options) => {
				setSubmitting(true);
				setNotice(null);
				const body = {
					cycle_id: options.cycleId,
					market: options.market,
					symbols: options.symbols,
					symbols_source: options.symbolsSource,
					label: options.label
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
					setNotice({
						kind: result?.started === false ? "warn" : "ok",
						text: result?.resumed
							? "已从检查点恢复该轮次（沿用同一 cycle_id）。"
							: result?.started === false
								? (result?.retry_deferred ? "该轮次的租约仍被占用，重试已延后；稍后再试。" : "该 cycle_id 已存在，引擎未重复启动。")
								: "分析轮次已启动，正在拉取实时进度。"
					});
				} catch (error) {
					setNotice({ kind: "err", text: "启动失败：" + String(error?.message ?? error) });
				} finally {
					setSubmitting(false);
					refreshAll();
				}
			};

			const handleStart = () => {
				if (!canStart) return;
				// A new click always mints a new cycle_id; the retry action below
				// deliberately reuses the stored one.
				submitStart({ cycleId: newAnalysisCycleId(market, label), market, label: label || "manual", symbols, symbolsSource: source, goalId });
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
					goalId: String(snapshot.goal_id ?? goalId ?? "")
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
						body: JSON.stringify({ cycle_id: cycleId, reason: "用户在产品壳手动停止分析轮次" })
					});
					setNotice({ kind: "ok", text: "已请求停止轮次 " + cycleId + "（仅影响分析，不影响账户）。" });
				} catch (error) {
					setNotice({ kind: "err", text: "停止失败：" + String(error?.message ?? error) });
				} finally {
					setSubmitting(false);
					refreshAll();
				}
			};
			const handleLabel = (value) => setLabel(String(value ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40));
			const handleSource = (next) => {
				setSource(next);
				if (next === "screening" && screenerRun) setSymbolsText((screenerRun.symbols ?? []).join(","));
			};
			const sourceNote = source === "screening"
				? screenerRun
					? "来自选股：沿用最近一次选股轮次 " + String(screenerRun.cycle_id ?? "-") + " 的 " + (screenerRun.symbols?.length ?? 0) + " 个候选。"
					: "来自选股：产品壳代理未暴露选股接口，也没有 symbols_source=screening 的历史轮次；请在引擎侧先运行选股，或切回手动输入。"
				: "手动输入：逗号、空格或换行分隔，自动去重，上限 " + MAX_ANALYSIS_SYMBOLS + " 个。";

			const renderStartPanel = () => react_jsx_runtime.jsxs("div", {
				className: "ia-an-col",
				children: [
					react_jsx_runtime.jsxs("section", {
						className: "ia-an-panel",
						children: [
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-panel-head",
								children: [
									react_jsx_runtime.jsx("h3", { children: "开始分析" }),
									run ? react_jsx_runtime.jsx("span", { className: "ia-chip", "data-kind": analysisStatusKind(run.status), children: analysisStatusLabel(run.status) }) : react_jsx_runtime.jsx("span", { className: "ia-chip", children: "未启动" })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-market", children: "市场" }),
									react_jsx_runtime.jsx("select", {
										id: "ia-an-market",
										className: "ia-an-select",
										value: market,
										onChange: (event) => setMarket(event.target.value),
										children: ANALYSIS_MARKETS.map(([id, name]) => react_jsx_runtime.jsx("option", { value: id, children: name }, id))
									})
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-label", children: "轮次标签（仅 [A-Za-z0-9_.-]）" }),
									react_jsx_runtime.jsx("input", { id: "ia-an-label", className: "ia-an-input", value: label, spellCheck: false, placeholder: "manual", onChange: (event) => handleLabel(event.target.value) })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-an-lab", children: "标的来源" }),
									react_jsx_runtime.jsxs("div", {
										className: "ia-an-seg",
										children: [
											react_jsx_runtime.jsx("button", { type: "button", "data-active": source === "user", onClick: () => handleSource("user"), children: "手动输入" }),
											react_jsx_runtime.jsx("button", { type: "button", "data-active": source === "screening", onClick: () => handleSource("screening"), children: "来自选股" })
										]
									}),
									react_jsx_runtime.jsx("div", { className: "ia-an-note", children: sourceNote })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-symbols", children: "标的清单（逗号 / 空格 / 换行分隔，去重）" }),
									react_jsx_runtime.jsx("textarea", { id: "ia-an-symbols", className: "ia-an-area", value: symbolsText, spellCheck: false, placeholder: "600519, 000858", onChange: (event) => setSymbolsText(event.target.value) }),
									react_jsx_runtime.jsx("div", { className: "ia-an-note", children: "已识别 " + symbolCount + " 个标的" + (symbolOverflow ? "（超出上限 " + MAX_ANALYSIS_SYMBOLS + " 个）" : "") })
								]
							}),
							goalOptions.length > 0 ? react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("label", { className: "ia-an-lab", htmlFor: "ia-an-goal", children: "绑定目标（可选，取自历史轮次记录的目标 ID）" }),
									react_jsx_runtime.jsxs("select", {
										id: "ia-an-goal",
										className: "ia-an-select",
										value: goalId,
										onChange: (event) => setGoalId(event.target.value),
										children: [
											react_jsx_runtime.jsx("option", { value: "", children: "（不绑定目标）" }, "none"),
											...goalOptions.map((value) => react_jsx_runtime.jsx("option", { value: value, children: value }, value))
										]
									})
								]
							}) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "ia-an-lab", children: "预检清单" }),
									...checks.map((check) => react_jsx_runtime.jsxs("div", {
										className: "ia-an-check",
										"data-ok": check.ok,
										children: [
											react_jsx_runtime.jsx("span", { className: "ia-an-check-mark", children: check.ok ? "✓" : "!" }),
											react_jsx_runtime.jsxs("span", { children: [react_jsx_runtime.jsx("b", { children: check.label }), " · " + check.detail] })
										]
									}, check.key))
								]
							}),
							react_jsx_runtime.jsx("button", {
								id: "ia-an-start",
								className: "ia-an-primary",
								type: "button",
								disabled: !canStart,
								title: canStart ? "开始一个分析轮次（只分析，不下单）" : blockReason,
								onClick: handleStart,
								children: submitting ? "提交中…" : "开始分析"
							}),
							notice ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": notice.kind, children: notice.text }) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-actions",
								children: [
									react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", disabled: !canStop, title: canStop ? "停止当前轮次（只影响分析，绝不影响账户）" : "当前没有运行中的轮次", onClick: handleStop, children: "停止" }),
									react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", disabled: !canRetry, title: canRetry ? "沿用同一个 cycle_id 重试（引擎从检查点续跑）" : "没有可重试的轮次：仅已失败 / 已停止的轮次或尚未提交成功的轮次可重试", onClick: handleRetry, children: "重试" }),
									react_jsx_runtime.jsx("button", { className: "ia-an-btn", type: "button", onClick: refreshAll, children: "刷新" })
								]
							}),
							react_jsx_runtime.jsx("div", { className: "ia-an-note", style: { marginTop: 8 }, children: hasRunningRound ? "进行中：" + String(runningRound?.cycle_id ?? "-") + " · 轮询 " + (run?.status === "running" ? "2" : "8") + " 秒" : isAnalysisTerminal(run?.status) ? "轮次已进入终态，已停止轮询。" : "当前没有运行中的轮次。" })
						]
					}),
					react_jsx_runtime.jsxs("section", {
						className: "ia-an-panel",
						children: [
							react_jsx_runtime.jsx("h3", { style: { margin: "0 0 8px", fontSize: 13 }, children: "契约提示" }),
							react_jsx_runtime.jsx("div", { className: "ia-an-note", children: "分析轮次只做研究：引擎强制 submit=false，不会下任何单。需要执行时在引擎侧用同一 cycle_id 显式批准，由引擎校验决策指纹。" }),
							react_jsx_runtime.jsx("div", { className: "ia-an-note", style: { marginTop: 6 }, children: "所有请求都走产品壳代理（/api/investment/analysis、/api/investment/reports），浏览器侧看不到引擎地址与 token。" })
						]
					})
				]
			});

			return react_jsx_runtime.jsxs("div", {
				className: "ia-page",
				children: [
					react_jsx_runtime.jsx(PageHeader, {
						title: "分析中心",
						subtitle: "手动开始分析 · 实时阶段与子任务 · 每轮报告",
						status: engineError ? "投资引擎不可达" : run ? analysisStageLabel(run.current_stage) + " · " + analysisStatusLabel(run.status) : "尚未启动分析轮次",
						statusKind: engineError || run?.status === "failed" ? "error" : run?.status === "completed" ? "ok" : run?.status === "running" ? "warn" : "warn"
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-page-content",
						children: [
							engineError ? react_jsx_runtime.jsx("div", { className: "ia-notice", "data-kind": "err", children: "引擎暂不可达：" + engineError }) : null,
							react_jsx_runtime.jsxs("div", {
								className: "ia-an-grid",
								children: [
									renderStartPanel(),
									react_jsx_runtime.jsxs("div", {
										className: "ia-an-main",
										children: [
											react_jsx_runtime.jsx(AnalysisPipelineView, { run, loading: runState.loading, error: runState.error, cycleId: watchCycleId }),
											react_jsx_runtime.jsx(AnalysisReportPanel, { refreshToken, highlightCycleId: String(run?.cycle_id ?? "") })
										]
									})
								]
							})
						]
					})
				]
			});
		}

		// ── settings sections ─────────────────────────────────────────────
		function useAsync(load, deps) {
			const [state, setState] = react.useState({ loading: false, data: null, error: "" });
			const action = react.useCallback(load, deps ?? []);
			const reload = react.useCallback(async () => {
				setState((previous) => ({ ...previous, loading: true, error: "" }));
				try {
					const data = await action();
					setState({ loading: false, data, error: "" });
				} catch (error) {
					setState({ loading: false, data: null, error: String(error?.message ?? error) });
				}
			}, [action]);
			react.useEffect(() => {
				reload();
			}, [reload]);
			return { ...state, reload };
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
					setNotice({ text: "策略已切换为 " + profile + "，立即作用于后续轮次。", kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: "切换失败：" + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const updateConfig = async (changes) => {
				setSaving(true);
				setNotice(null);
				try {
					await saveConfig(changes);
					setNotice({ text: "设置已保存并生效。", kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: "保存失败：" + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			const current = mandate?.profile ?? "neutral";
			const limits = [
				["min_confidence", "最低置信度"], ["max_position_pct", "单股仓位上限 %"], ["max_total_position_pct", "总仓位上限 %"], ["min_cash_reserve_pct", "最低现金储备 %"], ["max_drawdown_pct", "最大回撤 %"], ["max_daily_trades", "当日最大交易数"]
			];

			return react_jsx_runtime.jsxs(SectionFrame, {
				title: "投资策略与风控",
				subtitle: "策略档位同时决定提示词目标与硬风险边界（仓位/现金/回撤/换手），由引擎强制执行。",
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "策略档位" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "当前：" + (mandate.display_name ?? current) })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["conservative", "保守"], ["neutral", "中立"], ["aggressive", "激进"]].map(([profile, label]) => react_jsx_runtime.jsx("button", {
									key: profile,
									className: "ia-btn",
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
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "运行模式" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "手动：仅当你触发时执行轮次；自动：按调度计划自动执行。" })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["manual", "手动"], ["automatic", "自动"]].map(([mode, label]) => react_jsx_runtime.jsx("button", {
									key: mode,
									className: "ia-btn",
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
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "自动投资总开关" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "关闭后引擎不再执行任何自动轮次。" })]
							}),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [[true, "启用"], [false, "停用"]].map(([value, label]) => react_jsx_runtime.jsx("button", {
									key: String(value),
									className: "ia-btn",
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
							react_jsx_runtime.jsx("h3", { children: "当前硬边界（" + (mandate.profile ?? "-") + "）" }),
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
					setNotice({ text: "调度设置已保存。", kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: "保存失败：" + String(error?.message ?? error), kind: "err" });
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
				title: "自动轮次与调度",
				subtitle: "盘中与收盘轮次按北京时间触发；保存后由引擎调度器生效。",
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "宏观日报时间" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "每天生成一次宏观市场日报。" })]
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
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: marketName[row.market] + " 盘中轮次（HH:MM 逗号分隔）" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "收盘轮次：" + (row.close || "-") })]
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
					setNotice({ text: "市场设置已保存。", kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: "保存失败：" + String(error?.message ?? error), kind: "err" });
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
				title: "市场与选股",
				subtitle: "启用市场决定调度与选股范围；选股参数控制全市场候选筛选。",
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "启用市场" }),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", gap: 8 },
								children: [["cn", "A股"], ["hk", "港股"], ["us", "美股"], ["etf", "ETF"]].map(([market, label]) => react_jsx_runtime.jsx("button", {
									key: market,
									className: "ia-btn",
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
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "候选池大小" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "每个市场选股池的标的数量上限。" })]
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
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "选股刷新间隔（分钟）" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "缓存有效期，超期后下一轮次自动刷新。" })]
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
					setNotice({ text: "通知设置已保存（Webhook 地址经 DPAPI 加密存储）。", kind: "ok" });
					data.reload();
				} catch (error) {
					setNotice({ text: "保存失败：" + String(error?.message ?? error), kind: "err" });
				} finally {
					setSaving(false);
				}
			};
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: "通知",
				subtitle: "轮次报告完成后通过 Webhook 推送。",
				notice,
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "Webhook 通知" }), react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: "当前：" + (notify.enabled ? "已启用" : "未启用") })]
							}),
							react_jsx_runtime.jsx("button", {
								className: "ia-btn",
								"data-kind": notify.enabled ? "primary" : undefined,
								disabled: saving,
								onClick: () => saveConfig({ "notify.enabled": !notify.enabled, "notify.channels": ["webhook"] }).then(() => data.reload()),
								children: notify.enabled ? "停用" : "启用"
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-form-row",
						children: [
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-form-label", children: "Webhook 地址" }),
									react_jsx_runtime.jsx("div", { className: "ia-form-hint", children: data.data?.webhookConfigured ? "已配置（出于安全考虑不显示现有地址，留空保存则保持不变）" : "以 https:// 开头；地址加密保存在本机 DPAPI 库中。" })
								]
							}),
							react_jsx_runtime.jsx("input", {
								className: "ia-input",
								value: webhook,
								placeholder: data.data?.webhookConfigured ? "已配置" : "https://example.com/hook",
								onChange: (event) => setWebhook(event.target.value)
							})
						]
					}),
					react_jsx_runtime.jsx("div", { style: { marginTop: 12 }, children: react_jsx_runtime.jsx("button", { className: "ia-btn", "data-kind": "primary", disabled: saving, onClick: save, children: "保存通知设置" }) })
				]
			});
		}

		function AboutSection(props) {
			const { engineInfo } = props;
			const info = useAsync(() => engineInfo(), []);
			return react_jsx_runtime.jsxs(SectionFrame, {
				title: "应用设置",
				subtitle: "Investment Auto 2.1",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "版本信息" }),
							react_jsx_runtime.jsxs("div", {
								children: [
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: "产品" }), react_jsx_runtime.jsx("b", { children: "Investment Auto" })] }),
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: "引擎版本" }), react_jsx_runtime.jsx("b", { children: info.data?.version ?? "-" })] }),
									react_jsx_runtime.jsx("div", { className: "ia-kv", children: [react_jsx_runtime.jsx("span", { children: "交易模式" }), react_jsx_runtime.jsx("b", { children: "纸面模拟（paper）" })] })
								]
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-card",
						children: [
							react_jsx_runtime.jsx("h3", { children: "安全说明" }),
							react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)" }, children: "本产品仅支持模拟交易，不连接真实券商。所有订单经引擎硬风控与纸面撮合，AI 无法绕过。行情来自公开第三方接口，仅供研究与模拟。" })
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
			return react_jsx_runtime.jsxs("div", {
				className: "ia-settings",
				children: [
					react_jsx_runtime.jsxs("nav", {
						className: "ia-settings-nav",
						children: rows.map((row) => react_jsx_runtime.jsx("button", {
							key: row.id,
							type: "button",
							"data-active": row.id === active,
							onClick: () => setActiveId(row.id),
							children: row.label
						}, row.id))
					}),
					react_jsx_runtime.jsx("div", {
						className: "ia-settings-content",
						children: active !== undefined ? renderSlot("settings.section", { close: () => {} }, { only: active }) : react_jsx_runtime.jsx("div", { className: "ia-empty", children: "暂无设置项" })
					})
				]
			});
		}

		function SettingsPage(props) {
			return react_jsx_runtime.jsxs("div", {
				className: "ia-settings-page",
				children: [
					react_jsx_runtime.jsx(PageHeader, {
						title: "设置",
						subtitle: "模型、策略、风险、自主运行与桌面应用配置",
						status: "本机安全存储"
					}),
					react_jsx_runtime.jsx(SettingsSurface, { ...props })
				]
			});
		}

		// ── sidebar ───────────────────────────────────────────────────────
		function ProductSidebar(props) {
			const { useSessions, startSession, open, renameSession, archiveSession, searchSessions } = props;
			const list = useSessions((state) => state);
			const [query, setQuery] = react.useState("");
			const [results, setResults] = react.useState(null);
			const current = list?.current;
			// Session bar shows only user-facing sessions: archived ones are
			// hidden even when the store still lists them, and internal
			// background sessions (role subagents, origin="subagent") never
			// surface. Headless top sessions live in their own internal DSH
			// home and never appear here.
			const archived = new Set(Array.isArray(list?.archivedSessionIds) ? list.archivedSessionIds : []);
			const byId = list?.byId ?? {};
			const visible = (id) => !archived.has(id) && byId[id]?.origin !== "subagent";
			const ids = (Array.isArray(list?.ids) ? list.ids : []).filter(visible);

			react.useEffect(() => {
				if (query.trim() === "") {
					setResults(null);
					return;
				}
				let cancelled = false;
				const timer = setTimeout(async () => {
					try {
						const found = await searchSessions(query);
						if (!cancelled) setResults(found);
					} catch {
						if (!cancelled) setResults([]);
					}
				}, 250);
				return () => {
					cancelled = true;
					clearTimeout(timer);
				};
			}, [query]);

			const visibleIds = (results !== null ? results : ids).filter(visible);
			const titleOf = (id) => {
				const record = byId[id];
				if (!record) return "会话";
				if (record.blank) return "新会话";
				return record.title || "会话";
			};

			return react_jsx_runtime.jsxs("div", {
				className: "ia-sidebar",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "ia-sidebar-head",
						children: [
							react_jsx_runtime.jsx("span", { className: "ia-sidebar-title", children: "会话" }),
							react_jsx_runtime.jsx("button", { className: "ia-iconbtn", type: "button", title: "新建会话", onClick: () => startSession(), children: "+" })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-sidebar-scroll",
						children: [
							react_jsx_runtime.jsx("input", {
								className: "ia-search",
								placeholder: "搜索会话",
								value: query,
								onChange: (event) => setQuery(event.target.value)
							}),
							react_jsx_runtime.jsx("div", { className: "ia-session-group", children: query.trim() ? "搜索结果" : "最近会话" }),
							visibleIds.length === 0 ? react_jsx_runtime.jsx("div", { className: "ia-empty", children: query.trim() ? "没有匹配的会话" : "还没有会话，点击上方新建" }) : visibleIds.map((id) => react_jsx_runtime.jsxs("div", {
								key: id,
								className: "ia-session",
								"data-active": id === current,
								onClick: () => open(id),
								children: [
									react_jsx_runtime.jsxs("div", {
										className: "ia-session-main",
										children: [
											react_jsx_runtime.jsx("span", { className: "ia-session-title", children: titleOf(id) }),
											react_jsx_runtime.jsxs("span", {
												className: "ia-session-actions",
												children: [
													react_jsx_runtime.jsx("button", {
														onClick: (event) => {
															event.stopPropagation();
															const next = window.prompt("重命名会话", titleOf(id));
															if (next !== null && next.trim() !== "") renameSession(id, next.trim());
														},
														children: "重命名"
													}),
													react_jsx_runtime.jsx("button", {
														onClick: (event) => {
															event.stopPropagation();
															if (window.confirm("归档该会话？")) archiveSession(id);
														},
														children: "归档"
													})
												]
											})
										]
									}),
									react_jsx_runtime.jsx("span", { className: "ia-session-meta", children: byId[id]?.blank ? "等待提问" : "投资会话" })
								]
							}))
						]
					})
				]
			});
		}

		// ── shell frame ───────────────────────────────────────────────────
		function ConversationSurfacePresenter() {
			react.useEffect(() => {
				const update = () => {
					for (const input of document.querySelectorAll(".ia-center textarea")) {
						if (input.placeholder === "描述你想要构建的内容") {
							input.placeholder = "输入投资问题，或启动完整分析流程";
						}
					}
					for (const title of document.querySelectorAll(".ia-center [class*='_headlineText']")) {
						if (title.textContent === "探索未至之境") {
							title.textContent = "你的投资分析助手";
						}
					}
				};
				update();
				const observer = new MutationObserver(update);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["placeholder"]
				});
				return () => observer.disconnect();
			}, []);
			return null;
		}

		function ShellFrame(props) {
			const { useStore, actions, renderSlot } = props;
			const state = useStore((value) => value);
			const page = state?.page ?? "assistant";
			const detailsOpen = state?.detailsOpen === true;
			const contextOpen = state?.contextOpen !== false;
			const navigation = [
				["dashboard", "▦", "Dashboard"],
				["assistant", "◎", "投资助手"],
				["analyze", "◈", "分析中心"],
				["workflow", "⌁", "分析流程"],
				["settings", "⚙", "设置"]
			];

			return react_jsx_runtime.jsxs("div", {
				className: "ia-shell",
				children: [
					react_jsx_runtime.jsx(ConversationSurfacePresenter, {}),
					react_jsx_runtime.jsxs("div", {
						className: "ia-rail",
						children: [
							react_jsx_runtime.jsx("div", { className: "ia-rail-brand", title: "Investment Auto", children: "IA" }),
							react_jsx_runtime.jsx("nav", {
								className: "ia-rail-nav",
								"aria-label": "产品导航",
								children: navigation.map(([id, icon, label]) => react_jsx_runtime.jsxs("button", {
									key: id,
									className: "ia-navbtn",
									type: "button",
									"data-active": page === id,
									title: label,
									onClick: () => actions.setPage(id),
									children: [
										react_jsx_runtime.jsx("span", { className: "ia-navicon", "aria-hidden": "true", children: icon }),
										react_jsx_runtime.jsx("span", { children: label })
									]
								}, id))
							}),
							react_jsx_runtime.jsx("div", { className: "ia-rail-spacer" })
						]
					}),
					react_jsx_runtime.jsx("div", {
						className: "ia-body",
						children: page === "dashboard" ? react_jsx_runtime.jsx(ProductDashboard, {}) : page === "analyze" ? react_jsx_runtime.jsx(AnalysisCenter, {}) : page === "workflow" ? react_jsx_runtime.jsx(WorkflowPage, {}) : page === "settings" ? react_jsx_runtime.jsx(SettingsPage, { ...props }) : react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
							children: [
								renderSlot("sidebar", { collapsed: false, width: 250 }),
								react_jsx_runtime.jsx("div", { className: "ia-center", children: renderSlot("conversation", {}) }),
								detailsOpen ? react_jsx_runtime.jsx("div", { className: "ia-details", children: renderSlot("details", {}) }) : contextOpen ? react_jsx_runtime.jsx(AssistantContext, {
									onClose: () => actions.setContextOpen(false),
									onOpenWorkflow: () => actions.setPage("workflow")
								}) : react_jsx_runtime.jsx("button", {
									className: "ia-iconbtn ia-context-reopen",
									type: "button",
									title: "展开投资上下文",
									onClick: () => actions.setContextOpen(true),
									children: "‹"
								})
							]
						})
					}),
					renderSlot("shell.overlay", {})
				]
			});
		}

		// ── theme presenter (taken over from ui-layout, which this shell replaces) ──
		var ThemePresenter = class {
			appliedTokens = [];
			themeColorMeta;
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				const body = document.body;
				if (scheme === "dark") body.setAttribute("data-ds-dark-theme", "");
				else body.removeAttribute("data-ds-dark-theme");
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.push(name);
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
		const name = "@investment-auto/dsh-product-shell";
		const inject = ["slots", "sessions", "workspaces", "locale", "theme"];

		function apply(ctx) {
			let shellActions = null;
			const layoutService = {
				openDetails: () => { shellActions?.setDetailsOpen(true); },
				closeDetails: () => { shellActions?.setDetailsOpen(false); },
				toggleSidebar: () => {}
			};
			ctx.reflect.provide("layout", layoutService);

			ctx.effect(() => {
				const presenter = new ThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "ia-shell: theme presenter");

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
							label: _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel(entry.options.label) ?? ""
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
				if (result?.ok === false) throw new Error(result?.error ?? "命令失败");
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
				if (!response.ok) throw new Error("保存失败");
				return response.json();
			};
			const engineInfo = async () => {
				const payload = await jsonFetch("/api/investment/summary");
				return { version: payload?.status?.version };
			};

			ctx.effect(() => ctx.slots.register({
				name: "root",
				children: {
					"sidebar": { kind: "single", scope: "root" },
					"conversation": { kind: "single", scope: "session-maybe" },
					"details": { kind: "single", scope: "session" },
					"shell.overlay": { kind: "list", scope: "root" },
					"settings.section": { kind: "list", scope: "root" },
					"settings.onboarding": { kind: "list", scope: "root" }
				},
				store: () => _deepseek_ai_dsh_client_runtime_client.defineStore({
					init: () => ({
						page: "assistant",
						detailsOpen: false,
						contextOpen: true
					}),
					actions: {
						setPage: (draft, page) => {
							draft.page = page;
						},
						setDetailsOpen: (draft, open) => {
							draft.detailsOpen = open;
						},
						setContextOpen: (draft, open) => {
							draft.contextOpen = open;
						}
					}
				}),
				inject: (actions) => {
					shellActions = actions;
					return {
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
					startSession: () => ctx.workspaces.startSession(undefined),
					open: (sessionId) => ctx.sessions.open(sessionId),
					searchSessions: async (query) => {
						const result = await ctx.sessions.search(query);
						if (!result.ok) throw new Error(result.error.message);
						// Wire shape: { items: [{ sessionId, snippet }], hasMore }
						const value = result.value;
						if (Array.isArray(value?.items)) return value.items.map((item) => item.sessionId);
						if (Array.isArray(value)) return value;
						if (Array.isArray(value?.ids)) return value.ids;
						return [];
					},
					renameSession: async (sessionId, title) => {
						const session = ctx.sessions.binding(sessionId)?.session;
						if (session === undefined) throw new Error("会话不存在");
						const result = await session.rename(title);
						if (!result.ok) throw new Error(result.error.message);
					},
					archiveSession: async (sessionId) => {
						await ctx.workspaces.archiveSession(sessionId);
					}
				})
			}, ProductSidebar), "ia-shell: product sidebar");

			const section = (id, order, label, Component) => {
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id,
					order,
					label: () => label,
					inject: () => ({
						fetchConfig,
						fetchStatus,
						saveConfig,
						runCommand,
						fetchWebhook,
						saveWebhook,
						engineInfo
					})
				}, Component), "ia-shell: settings section " + id);
			};
			section("strategy", 20, "投资策略与风控", StrategySection);
			section("schedule", 30, "自动轮次与调度", ScheduleSection);
			section("markets", 40, "市场与选股", MarketsSection);
			section("notify", 50, "通知", NotifySection);
			section("about", 60, "应用设置", AboutSection);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
