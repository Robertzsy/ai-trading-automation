# Investment Auto 2.1.3 项目报告

> 报告对象：Investment Auto v2.1.3（GitHub: `Robertzsy/investment-auto`，分支 `dsch/2.0`，MIT 许可）
> 报告日期：2026-08（依据仓库内 README、CHANGELOG、架构文档、配置与源码整理）
> 定位：面向 A 股、港股、美股与场内 ETF 的投资研究与**模拟交易**（纸面交易）桌面应用，2.x 基于 DeepSeek Harness（DSH）AI 智能体底座深度改造。

---

## 目录

1. [项目概览](#1-项目概览)
2. [版本演进：从 1.x 到 2.1.3](#2-版本演进从-1x-到-213)
3. [总体架构：决策面与执行面分离](#3-总体架构决策面与执行面分离)
4. [应用层（app/）：DSH 深度定制与产品化外壳](#4-应用层appdsd-深度定制与产品化外壳)
5. [投资引擎（engine/）：不可绕过的执行边界](#5-投资引擎engine不可绕过的执行边界)
6. [固定多角色分析流程](#6-固定多角色分析流程)
7. [Windows 桌面壳与发行体系](#7-windows-桌面壳与发行体系)
8. [安全与可靠性设计](#8-安全与可靠性设计)
9. [测试与质量保障](#9-测试与质量保障)
10. [与同类项目的对比与差异化优势](#10-与同类项目的对比与差异化优势)
11. [局限与改进方向](#11-局限与改进方向)
12. [总结](#12-总结)

---

## 1. 项目概览

**Investment Auto** 是一款 Windows 桌面投资研究与模拟交易应用，覆盖 **A 股、港股、美股、场内 ETF** 四个市场。其核心形态是"一个会自主工作、能自我维护的投资智能体"：

- **对话式投资助手**：保留 DSH 原生会话、思考过程（thinking）、流式输出、工具调用、Skills、计划（plan）、目标（goal）与子代理能力；
- **固定多角色分析流程**：从基础研究、多空辩论到风险辩论与最终决策的完整委员会式流程，进度、检查点与证据数真实可见；
- **独立 Python 投资引擎**：行情、选股、组合优化、硬风控、纸面撮合、审计、调度全部由确定性代码执行，AI 无法绕过；
- **产品化桌面体验**：Dashboard、投资助手、分析流程、设置四个页面，单实例、托盘、开机自启、覆盖升级保留全部用户数据。

两个明确的产品边界：

1. **只做研究与模拟交易**：不连接任何真实券商，所有成交发生在本地纸面经纪（paper broker）；
2. **AI 决策 ≠ 直接执行**：一切交易决策必须经过"用户批准 → 决策指纹校验 → Python 硬风控 → 模拟撮合"的固定链路。

版本信息（v2.1.3，2026-08-24 发布）：

| 项目 | 内容 |
|---|---|
| 安装包 | `InvestmentAuto-Setup-x64.exe`（161,497,160 bytes，Windows 10/11 x64） |
| SHA-256 | `00522AA80EAEF39BB9B59F1B50B458A2177F909AD807914DDB34367A85B49560` |
| 内置运行时 | Python 3.x + Node.js 22 + .NET 8 桌面运行时 + WebView2 兜底安装程序 |
| 程序目录 | `%LocalAppData%\Programs\InvestmentAuto`（只读） |
| 用户数据 | `%LocalAppData%\InvestmentAuto`（账户、报告、配置、凭据、会话） |
| 技术栈 | Python（引擎）、Node.js/DSH（AI 应用层）、C#/.NET 8 WPF + WebView2（桌面壳）、Inno Setup（安装器） |
| 许可证 | MIT |

覆盖升级实测：2.1.3 升级前后 **76,167 个用户数据文件**缺失 0、变化 0、新增 0（见 `CHANGELOG.md` 2.1.3 节）。

---

## 2. 版本演进：从 1.x 到 2.1.3

项目历史分为两条线（`master` 保留 1.x 作历史回退，`dsch/2.0` 为当前 2.x）：

### 2.1 1.x 时代（0.4.0 → 0.9.1）：自研 Agent 架构的积累

1.x 是**完全自研**的投资自动化系统：自建 Agent/Manager 分层、Skill Runtime、桌面 Harness。主要里程碑：

| 版本 | 核心能力 |
|---|---|
| 0.5.0 | DSH 式分层架构：工具中介交互（原生 function calling 决策节点）、引用自动修复、摘要跨界 + 证据库、Checkpoint 可续工作单元、Ralph 式离线研究循环（规则回测/策略实验/自动修 Bug） |
| 0.5.1 | 下单 fail-safe：显式状态机 `running → research_completed → execution_pending → completed`，pending 冻结闸门无时效限制，输入指纹（现金/持仓/授权书/规则/风控）补全 |
| 0.6.0 | 管理 Agent 一键自建工具闭环（校验→写入→编译测试→注册→试调用，任一步失败全回滚） |
| 0.7.0 | Windows 桌面化：WPF + WebView2、单实例/托盘/自启、Inno Setup 安装器、动态回环端口 + 随机令牌、DPAPI 密钥存储、10 步首次向导、Job Object 无孤儿进程 |
| 0.8.0 | Agent Harness 桌面控制面：顶层 Manager 收敛为六个 Harness 级能力、持久会话、Skill Manifest/Workflow/完成契约/执行轨迹、Skill Scheduler |
| 0.9.0 | Failure-Aware Harness：证券身份契约（交易所+资产类型+供应商代码）、incident-repair 自动修复（目标测试+语义回放双通过才确认，否则自动回滚） |
| 0.9.1 | Supervised Repair Closure：安装版内置 repair_verifier、补丁 SHA256 单次精确替换、全新解释器回放验证、incident 修复审计 |

1.x 沉淀了本项目最重要的工程资产：**checkpoint 恢复、下单 fail-safe、证据库、引用校验、DPAPI、桌面发行管线**——这些在 2.x 中全部被继承或强化。

### 2.2 2.x 时代：DSH 底座重构与产品化

2.0 的关键决策：**放弃自研对话/Agent 框架，把 DSH 作为不可见的运行时底座**，1.x 的投资业务能力收敛为独立 Python 引擎，双方通过回环 HTTP 连接。

| 版本 | 核心变化 |
|---|---|
| 2.0.0 | 切换到 DSH 原生对话/工具/Skills/子代理/工作流；`engine/` 独立 Python 引擎；锁定 DSH rc.6 依赖树；自定义 investment / investment-web profile + investment agent preset；17 个 `investment_*` 桥工具；DPAPI 凭据 provider；首次向导；1.x 数据迁移（实测 15 项数据 + 4 密钥无损导入） |
| 2.1.0 | 产品化：重做 UI（Dashboard/投资助手/分析流程/设置），删除工作区/模式选择与底座品牌（`brand-dist.mjs`）；禁用 11 个 DSH 客户端行；`@investment-auto/dsh-product-shell` 接管 root 槽；引擎新增脱敏配置 API；完整多角色分析恢复（会话层固定工作流插件）；`runtime/analysis_runs/` 原子 checkpoint |
| 2.1.1 | 选股与分析拆分为两个明确入口；用户指定股票直接进入固定完整分析流程；异步轮次（`POST /api/analysis/rounds/start` 秒级启动 + 轮询）；初版交易幂等（`idempotency_key`）；修复 5 分钟 fetch-failed 根因（Node requestTimeout 掐断长连接导致一次请求启动 4 个轮次、4 笔重复成交） |
| 2.1.2 | 成交幂等以**账户文件为唯一事实**（执行回执在账户锁内原子替换写入 `portfolio.json`）；幂等键必填 + 归一化决策指纹内容绑定；`ready_for_execution` 状态机；用户指定标的贯通执行；cycle_id 基于平台请求身份；跨进程 cycle lease（O_EXCL）；内部 DSH home 会话隔离；headless 会话不再污染用户会话栏 |
| 2.1.3 | IA 全权限自维护（文件/PowerShell/搜索/后台任务/Ralph + `self-maintenance` Skill + 权威 `INVESTMENT_AUTO_ROOT`）；修复工作流 schema 兼容（属性级 required→对象根级数组）；失败轮次重试竞态（cycle lease 才可重开 failed）；Windows 原子写入（唯一临时文件 + 指数退避）；安装器排除 `app/dev-home` 开发数据 |

---

## 3. 总体架构：决策面与执行面分离

```
┌ Windows 桌面壳（windows/desktop，WPF + WebView2）────────────────────────┐
│ 单实例 / 托盘 / 开机自启 / Job Object 强杀无孤儿 / 动态回环端口 + 随机令牌  │
└──────────────┬───────────────────────────────┬─────────────────────────┘
               ▼ http://127.0.0.1:<web>        ▼ http://127.0.0.1:<api> + X-IA-Token
┌ DSH web（Node 22，profile: investment-web，DSH_HOME=用户数据目录）────────┐
│ 对话/会话/设置/Skills/plan/goal/jobs（DSH 原生）                          │
│ agent preset "investment"：投资 persona + 完整 DSH 编码/自维护工具        │
│ host 插件 investment-tools：16 个 investment_* 工具（引擎 HTTP 桥）         │
└──────────────┬──────────────────────────────────────────────────────────┘
               │ MCP 式工具调用 = HTTP + X-IA-Token（仅回环）
               ▼
┌ 投资引擎（Python，engine/）── 不可绕过的执行边界 ─────────────────────────┐
│ HTTP 命令 API：状态/行情/选股/组合/报告/宏观/授权书/凭据/向导              │
│ 命令总线 → InvestmentAgentService → 硬风控 build_orders → 纸面经纪        │
│ submit_decisions：DSH 决策的唯一执行入口（取价、重算仓位、撮合、审计）     │
│ 调度器（APScheduler，市场时段）：轮次触发 → DSH 桥（headless）            │
└──────────────────────────────────────────────────────────────────────────┘
```

架构的第一性原则是**两层语义分离**：

- **决策面（DSH 应用）**：通用 AI 助手 + 投资职责。负责理解用户意图、运行多角色研究流程、形成决策方案；
- **执行面（Python 引擎）**：行情、选股、组合、风控、纸面撮合、调度、报告。负责一切"事实"与"执行"。

两面之间只有两条通道，AI 永远绕不过引擎代码：

1. **对话方向**（用户 → 引擎）：`investment_*` 工具通过回环 HTTP 调用引擎 API（读：状态/行情/选股/组合/报告/宏观/授权书；写：策略/控制/选股/重置账户/提交决策）；
2. **自主方向**（调度 → AI 决策）：引擎调度器（APScheduler）在市场时段触发轮次，通过 DSH 桥 `DshBridgeRunner` 拉起 headless DSH 会话（同一套 investment 工具与固定流程，plan 模式关闭），会话完成任务后由引擎在 `submit_decisions` 内完成取价、授权书硬边界、硬风控与纸面撮合。

部署布局（数据与程序分离，1.x 即确立）：

```text
程序目录：%LocalAppData%\Programs\InvestmentAuto   （engine/、app/、python/、node/，只读）
用户数据：%LocalAppData%\InvestmentAuto             （= DSH_HOME = 引擎数据根）
  ├─ profiles/ .agent-presets/ skills/ sessions/ settings.yaml   （DSH 数据）
  ├─ runtime/  （账户、审计、报告、记忆、选股、优化、调度锁）
  ├─ config/   （config.yaml + 四市场规则）
  └─ secrets.enc （API Key，DPAPI 加密）
```

引擎启动时从程序目录向用户数据目录**播种** profiles/presets/skills/plugins（已存在不覆盖，用户自建条目保留）；安装版全程零 PowerShell。

---

## 4. 应用层（app/）：DSH 深度定制与产品化外壳

`app/` 不是独立应用，而是锁定 `@deepseek-ai/dsh@0.1.0-rc.6` 依赖树的 DSH 应用壳：通过自定义 profile / agent preset / 8 个 Skills / 5 个 cordis 插件，把通用 AI 底座改造成投资产品。npm 默认会把 `^0.1.0-rc.6` 解析成混装 rc.8，因此必须靠 lockfile 精确复刻依赖树；安装包随行打包 `node_modules/`。用户数据全部位于 `$DSH_HOME`（安装版 `%LocalAppData%\InvestmentAuto`，开发版 `app/dev-home`）。没有独立的 `app/src/` 前端目录——UI 源码全部内嵌在 `dsh-product-shell/lib/client.js`（约 1400 行）与 `dsh-investment-ui/lib/client.js` 中。

### 4.1 产品化思路：把"底座"藏起来

Investment Auto 对用户呈现的是**独立产品**而非 AI 底座：没有工作区选择、模式选择或 DeepSeek Harness 品牌，只有 Dashboard、投资助手、分析流程和设置。实现手段（依据 `docs/PRODUCT_SHELL.md`）：

- **组合层替换**：禁用 DSH 自带的 `ui-layout / ui-sidebar / ui-workspace / ui-settings-general / ui-agent-preset / ui-permission / ui-cordis / ui-model-selection / ui-workflow-run` 等 11 个客户端行；`@investment-auto/dsh-product-shell` 接管 `root` 槽，左侧产品导航 + 扁平会话列表（新建/切换/重命名/搜索/归档）+ 可收起投资上下文；
- **对话内核零改动**：外壳仅 `renderSlot("conversation", {})`，消息、思考过程、流式输出、工具链、会话状态全部由原 conversation 组件负责（10 个内核 bundle SHA-256 记录在案，rc.6 原样）；
- **品牌去除**：`app/scripts/brand-dist.mjs` 改写 dist 的 `<title>`、manifest、favicon（鱼形 logo → IA 标记）；`surfaceContext: false` 移除模型可见的 harness-source 提示段；
- **agent-presets 机制保留但不可选**：default 恒为 investment，新建会话自动挂载投资 preset。

### 4.2 投资 Agent Preset（`app/presets/investment/agent.cordis.yml`）

preset 定义了"投资助手"的完整人格与工具面（agent-plane 组合，基于 DSH 自带 `standard` preset 的完整编码面派生）：

- **投资 persona**：多市场投资助手定位；任何改变组合或下单的提议必须"先出计划、等用户批准"；明确声明"所有交易都是本地引擎在硬风控下执行的模拟交易，你永远无法绕过它们，也不得声称具有真实资金能力"；市场事实必须以投资工具为准，不得猜测；
- **自维护 persona**（同一文件）：IA 同时是 Investment Auto 自身的维护者——产品缺陷阻塞用户请求时，用原生文件系统、搜索与 PowerShell 工具检查真实日志与源码树，做最小一致修改，运行相关测试并重试原任务；权威应用根目录在 `INVESTMENT_AUTO_ROOT`（不得编辑 DSH_HOME 播种副本）；替换运行中的安装前必须先做可恢复备份；
- **固定路由规则**：选股与股票分析是两块；点名证券的分析**必须**走 `investment_analysis_workflow`，禁止窗口 AI 自行用行情/新闻工具重写多角色分析；简单查询（价格/持仓/单一指标）才可用普通工具直接回答；到达 `ready_for_execution` 后必须展示最终决策并等用户明确批准，提交时必须原样携带 `idempotency_key=cycle_id`，引擎按决策指纹校验、同一 key 至多成交一次；
- **工具行（平台条件计算）**：`tool-bash` 在 Windows 上 `disabled`、`tool-pwsh` 反之（能力开关按 `process.platform` 动态计算）；文件系统、搜索、jobs、Skills、goal、todo、ask_user；`plan-mode` 内嵌**投资导向计划提示词**（要求 decision-complete：目标/成功标准/依据/候选变更/风控检查/确认步骤；plan 模式禁止下单、改授权、重置账户）；压缩组（8192 字符阈值 + 结果裁剪器）；委派组（spawn/fork 两种子代理、workflow 引擎、Ralph `maxRounds:64`、codex/claude-code 子代理禁用）；web 搜索（`fetch:false`，60 秒超时）。

### 4.3 五个插件（含投资工具面全清单）

| 插件 | 职责与关键实现 |
|---|---|
| `dsh-investment-tools` | host 平面引擎桥：`ctx.tools.register` 注册 **16 个 `investment_*` 工具**——只读事实 11 个（`investment_status / portfolio / market_snapshot / market_history / security_search / screening / optimizer_latest / reports / report_latest / macro_latest / mandate`）+ 纸面边界写操作 5 个（`set_strategy / control`（pause/resume/kill/reset_kill 白名单校验）`/ run_screening / submit_decisions`（幂等键必填）`/ reset_account`）。`lib/engine-client.js` 用原生 fetch + AbortController 实现 `get/post/issue`（`/api/commands/issue` 带 `requested_by: "dsh-tools"` 审计字段）。刻意**不注册**旧 `investment_run_cycle`。render 契约：必须返回 content block `[{type:"text",text}]`（2.0 实测裸字符串会破坏工具结果消息结构），超 32000 字符截断 |
| `dsh-investment-workflow` | 固定多角色分析入口：注册 `investment_analysis_workflow` + `investment_analysis_status` 两个工具。核心实现 `analysis-workflow.js`：五阶段 `STAGES = [base_research, research_debate, portfolio_draft, risk_review, final_decision]`，用 DSH 原生 workflow 脚本（`pipeline/parallel/agent`）编排多角色；全部 schema 以共享常量冻结导出并在**插件组合期**用 `assertObjectJsonSchema()` 预校验（2.1.3 修复：属性级 required→对象根级数组）；每阶段 checkpoint 经 `/api/analysis/runs/update` 写回引擎，失败从已有检查点续跑；手动入口空 symbols 直接抛错、手动会话禁 submit；cycle_id 主源 = 会话 ID + 最新直接用户消息 ID（内容哈希只作引擎短 TTL 传输兜底，**从不用于 cycle id**）；研究成功率 < 0.8 即故障安全停止，未达标持仓强制 HOLD、非持仓剔除（丢弃模型偷塞的选股池标的） |
| `dsh-product-shell` | 产品 UI（详见 4.5）。node 半三件事：① 固定 Investment Auto 工作区（workspaceRegistry 幂等创建，产品无 workspace UI）；② host 代理 4 条路由 `/api/investment/summary|config|webhook|command`——**引擎 URL + 令牌只存在于 host 侧，绝不进浏览器 JS**；webhook 只回显 `configured` 布尔；③ 把 Node `server.requestTimeout` 置 0，消除"5 分钟 fetch failed 但后端还在跑"的重试风暴（2.1.1 事故根因） |
| `dsh-dpapi-credentials` | DPAPI 凭据 provider：实现 harness `credentials` 服务契约（`resolve/describe/set/unset` + `credentials/updated` 事件），所有密钥读写委托引擎回环 API（`/api/credentials/*`），经 DPAPI 加密存 `secrets.enc`，**绝不落 settings.yaml / .credentials.yaml / 进程环境**；引擎不可达时优雅降级不抛错。桌面经 `--patch` overlay 启用（DSH patch 不能改行 `name`，故用"禁用默认 credentials 行 + insert credentials-dpapi 行"的形式，2.0 安装版实测发现的坑） |
| `dsh-investment-ui` | 纯客户端插件：向 `tool.call.toolview` 槽注入键控卡片——`investment_status`（模式/策略/暂停/紧急停止 chip）、`investment_portfolio`（现金/持仓/成交）、`investment_mandate`（策略档/最低置信/单股上限/最大回撤），JSON 解析失败回退原文 |

> 口径说明：`app/README.md` 写"17 个工具"，实际桥插件注册 16 个，加上工作流插件的 2 个，模型可见 investment 工具面合计 18 个。

### 4.4 八个产品 Skills

| Skill | 用途与流程 |
|---|---|
| `security-analysis` | 点名证券的完整分析。`investment_security_search` 确认代码与市场归属（无法唯一确认则 ask_user_question）→ `investment_analysis_workflow(symbols_source="user", submit=false)` → 轮询 `investment_analysis_status` → 总结最终决策清单与故障安全处理。铁律：分析不产生交易、提交必须原样、同 cycle_id 只成交一次、failed 可同键从检查点续跑 |
| `stock-screening` | 全市场选股（周期块 1）。`investment_screening` 读缓存（需最新则 `investment_run_screening`）→ 理解排除口径（ST/退市/低价低流动性/过小市值）→ 个性化二次过滤 → 标准化候选列表，以 `symbols_source="screening"` 传入分析流程 |
| `complete-investment-cycle` | 完整投资周期（两块：选股→分析）。铁律：kill 激活不提交、不虚构行情、未授权不调用 submit |
| `market-overview` | 多/单市场概览。status → macro → screening → report → portfolio → snapshot 一页式输出，拿不到数据如实写"暂无数据" |
| `portfolio-review` | 组合健康检查。逐持仓 snapshot 算浮盈亏/回撤，按回撤/集中度/流动性/事件/纪律清单体检，区分"事实"与"建议" |
| `portfolio-optimization` | 组合优化（马科维茨/Black-Litterman/风险平价/压力测试）。optimizer 缓存 → 当前 vs 目标权重差异表 → 分批调整顺序（先减超配后补欠配）；执行仍需批准 + 幂等键 |
| `account-management` | 账户与系统管理。切策略档 / pause/resume/kill/reset_kill / 重置模拟账户；破坏性操作必须复述影响并等批准 |
| `self-maintenance` | 产品自维护。从真实日志与持久状态定位故障 → 修改 `INVESTMENT_AUTO_ROOT` 下权威源码 → 测试 → 验证/重播 → 失败回滚；边界：不把 DSH_HOME 播种副本当源码、不以"修复"绕过纸面限制/批准/幂等/硬风控 |

`app/scripts/check-skills.mjs` 校验 Skill 结构（frontmatter、kebab-case、正文长度）以及**每个 Skill 引用的 `investment_*` 工具都确实被桥插件注册**（通过 mock ctx 实际调用 `apply()` 收集工具名比对）。

### 4.5 产品 UI（`dsh-product-shell/lib/client.js`，约 1400 行）

- **左侧产品导航 rail**：Dashboard / 投资助手 / 分析流程 / 设置（品牌 mark "IA"，产品配色 深绿 `#10272b` + 高亮 `#49b9a5`）；
- **投资助手页**（默认页）：扁平会话列表（过滤归档与 `origin==="subagent"` 的内部会话，支持搜索/重命名/归档）+ `renderSlot("conversation", {})` 原样渲染 DSH 对话内核 + 可收起投资上下文列；MutationObserver 把残留的 DSH 空白页文案替换成投资语义；
- **Dashboard 页**：KPI 四卡（模拟账户/当前持仓/最近报告/组合风险）+ 四市场账户网格 + 运行动态（下一轮次/最近分析 Agent 进度/报告）+ 宏观日报摘要，数据经 `/api/investment/summary` 聚合（30 秒轮询）；
- **分析流程页**：把固定工作流的**真实遥测**可视化——六段链路（数据准备→标的研究→研究裁决→组合构建→风险裁决→决策执行）、cycle_id、当前阶段、Agent 进度、证据计数、流程验收 5 项检查、下一轮计划（不用对话历史冒充流程进度）；
- **设置页**：自建 settings 外壳，注入 5 个产品设置段——投资策略与风控（策略档/运行模式/自动投资总开关/硬边界只读展示）、自动轮次与调度（宏观日报时间、四市场盘中/收盘轮次）、市场与选股、通知（Webhook，DPAPI 存储不回显）、应用设置；同时复用 DSH 原 models 模型设置页。

### 4.6 脚本与开发工作流

| 脚本 | 作用 |
|---|---|
| `dev.ps1` | 开发启动器（`DSH_HOME=app/dev-home`、权限 `danger-full-access`、`INVESTMENT_AUTO_ROOT` 注入、npm install → 播种 → 启动 investment-web） |
| `seed.ps1` | 把 profiles/presets/skills/plugins 播种进 DSH_HOME（开发与安装版共用；已存在不覆盖，`-Force` 刷新） |
| `brand-dist.mjs` | 去 DSH 品牌：改写 dist 的 `<title>`、manifest、favicon（JS bundle 不动） |
| `check-plugins.mjs` | 插件结构校验 + profile patch 引用的 `@investment-auto/*` 必须真实存在 |
| `check-skills.mjs` | Skill 结构与引用工具一致性校验 |
| `smoke-web.mjs` | 无头 Chrome CDP 验收（零额外依赖）：无 DSH 品牌、四页导航、Dashboard/分析流程/设置渲染、会话搜索 wire 形状、零异常、无 404 |
| `verify-web-conversation.mjs` | wire 协议真实对话 E2E：`session.create` 返回 `agentPreset: investment`、prompt 后 `investment_status` 工具调用与中文回答 |
| `cleanup-internal-sessions.mjs` | 一次性迁移：把 pre-isolation 版本泄漏进用户会话栏的 headless 会话组移动到时间戳备份目录，绝不删除 |

---

## 5. 投资引擎（engine/）：不可绕过的执行边界

`engine/` 是自洽的 Python 执行面（`python -m engine.main serve|run|...`），用标准库 `ThreadingHTTPServer` 提供回环 API（无 Web 框架依赖），只绑定 `127.0.0.1:8790`（动态端口）。

### 5.1 HTTP 命令 API 与鉴权

鉴权：`IA_ACCESS_TOKEN` 环境变量（桌面壳每次启动生成随机值）设置后要求请求头 `X-IA-Token` 匹配；纯回环开发模式（无令牌）才免鉴权。请求体上限 1MB。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health`、`/api/status` | 服务版本 / 控制状态、授权书、各市场会话与最新报告 |
| GET | `/api/portfolio/<market>`、`/api/market/snapshot|history|search` | 账户与行情 |
| GET | `/api/screening/<market>`、`/api/optimizer/<market>`、`/api/macro/latest`、`/api/reports[/latest]`、`/api/mandate` | 选股 / 优化 / 宏观 / 报告 / 授权书 |
| GET | `/api/analysis/latest|runs|run|rounds/active` | 分析轮次查询 |
| POST | `/api/analysis/rounds/start` | **异步固定分析轮次**：强制 `submit=False`、拒绝空 symbols |
| POST | `/api/analysis/runs/{start,update,complete,fail}` | 检查点与终态 |
| POST | `/api/commands/issue` | 统一命令派发（命令总线，带 `requested_by` 审计） |
| POST | `/api/credentials/set|unset`、GET `/api/credentials/resolve` | DPAPI 凭据桥（供 DSH 凭据 provider） |
| GET | `/api/config` / POST `/api/config/update` | 脱敏配置读取 / 白名单原子更新 |
| GET/POST | `/setup`、`/api/setup/status|complete` | 内联 HTML 首次向导（初始化四市场账户各 50 万初始资金 + 可选导入旧数据） |

### 5.2 配置与密钥

- **`config.py`**：单例 `AppConfig`（YAML + `.env`）；LLM 密钥解析链"环境变量优先、DPAPI 回退"；
- **`config_api.py`**：产品设置页的**白名单原子配置更新**——精确点路径契约只允许改 `autonomous.operation_mode/enabled`、`schedule.*`、`markets.enable`、`screening.*`、`notify.*`；**`trading.mode` 及其前缀直接抛"禁止修改"**（`llm` 段由 DSH 设置面管理）；临时文件 + replace 原子写，reload 失败 `.rollback` 回滚；每个字段强校验器（枚举/布尔/整数/时间/市场列表/渠道）；
- **`secret_store.py`**：Windows DPAPI 密钥库——`CryptProtectData` 加密后 base64 存 `secrets.enc`（与当前 Windows 用户绑定，每用户安装是硬要求）；非 Windows 平台安全降级（读返回 None、写抛 NotImplementedError）；双重脱敏 `redact_mapping`（按 key 名掩码）+ `redact_text`（正则抓 `sk-`/标签形密钥）。

### 5.3 投资决策管线

- **命令总线（`command_bus.py` + `contracts.py`）**：`InvestmentCommand` 枚举（run_cycle/submit_decisions/pause/resume/kill/reset_kill/run_screening/run_optimizer/reflect/reset_paper_account……）+ 队列传输（inbox JSON → worker `.processing` rename 认领 → outbox/progress/activity 心跳）；硬超时 1800s/480s、空闲超时 300s；**原子写**用 `.{name}.{pid}.{tid}.{uuid}.tmp` 唯一临时名 + replace + 指数退避（规避 Windows 多写者共享固定 .tmp 的 WinError 5，2.1.3 修复）；
- **授权书（`mandate.py`）**：三档策略 conservative/neutral/aggressive，每档含总仓位/现金储备/单票上限/单笔上限/最低置信/换手上限/每日交易数/回撤削减等硬边界；**代码定义是权威**——文件只存用户选择与版本，读取后仍以 `STRATEGIES[profile]` 覆盖（防磁盘篡改）；`effective_configs` 把策略硬边界叠加到运行配置；
- **反思（`reflection.py`）**：轮次结果转可审计教训、**从不直接改策略**；候选策略变更标 `requires_evaluation`，延迟归因（T+1/T+5/T+20 方向性打分）只等后续行情出现后做，带"截断历史不得误判 T+1"守卫；只暴露已评估记录；
- **报告（`reporting.py`）**：中文 Markdown 报告（策略授权书、逐标的决策表、模拟执行结果、降级说明）。

### 5.4 交易与硬风控（引擎的"心脏"）

**唯一执行入口 `submit_decisions` 的执行顺序**：

1. `idempotency_key` 缺失直接抛错；
2. **决策指纹**：对归一化决策（symbol/action/target_weight/confidence 按 symbol 排序）做 sha256 前 32 位——无关注入顺序；
3. **幂等账本四态**：completed（同指纹重放、异指纹拒绝）/ rejected（终态拒绝重放）/ in_progress（600 秒内活认领拒绝并发，超时为陈旧认领仅同内容可收回）/ 无记录 → 写认领；
4. **确定性门（终态 rejected）**：非 paper 模式、决策非法、超 40 条上限；
5. **临时门（释放认领允许重试）**：kill_switch 激活；paused 只告警不阻断人工提交；
6. **运行绑定**：cycle_id 提交必须匹配 `ready_for_execution` 状态且**决策指纹完全一致**，一致后才把该轮已分析目标并入允许池；
7. **允许池** = 持仓 ∪ 最新选股 ∪ 配置默认标的，越界标的终态拒绝；
8. **引擎自取价**：绝不信任载荷价格；前置行情缺失 → 释放认领可重试；
9. **硬风控重算仓位 → 纸面撮合 → 审计/报告/通知/反思**（辅助记录失败不回滚成交）。

**硬风控 `risk.build_orders`**（把 AI 目标权重重算为受限订单）：

- 置信度门槛、`max_position_weight = min(single_stock_max_pct, max_position_pct)` 封顶；
- 组合级约束：单笔上限 / 换手上限 / 现金储备 / 总仓位（还受"组合容量 = 目标总仓位 − 当前持仓市值"约束）；
- **回撤熔断**：回撤 ≤ `max_drawdown` 时 circuit_breaker 强制全持仓清仓 SELL 并拒绝一切新 BUY；
- **保护性决策优先于 AI 决策**：硬止损 / 移动止损（高水位追踪）/ 两档止盈（takeProfit1Done/2Done 标志防重复）；
- 手数取整（港股每手不明确时保守取 100）、当日成交计数限 `max_daily_trades`。

**纸面经纪 `broker.execute_orders`**：

- 只允许 paper；持仓锁（线程锁 + 跨进程 `atomic_claim`）双重锁；
- **执行回执与成交在同一次原子替换中写入 `portfolio.json`**——`execution_receipts[key] = {idempotency_key, decision_fingerprint, fills, rejected, cash_after}`，这是耐久点：崩溃于"已成交、未写簿记"之间时，重试从账户内回执重放（`replayed: True`），**绝不再成交**；回执保留最近 200 条滚动淘汰；
- 撮合细节：滑点（BUY ×(1+s)/SELL ×(1−s)）、佣金 + 印花税（按 `stamp_tax_side`）、**T+1 可用卖出**（按 lot `acquired_date` 判断）、BUY 摊薄成本、高水位与净值快照（365 条）；
- 紧急停止（`control.py`）：`control.json` 存 paused/kill_switch；kill 激活时同时置 paused，且 kill 激活时拒绝恢复；损坏文件"安全暂停"。

### 5.5 分析轮次状态机与 checkpoint 恢复

两层职责分离：

- **`analysis_runs.py`（纯持久层）**：`start_or_resume` 幂等创建；事件 `stage_start/agent_start/agent_end/checkpoint/execution_ready` 累计 Agent 成功/失败数、证据数、阶段检查点；**`execution_ready` 事件在此计算决策指纹**（供后续提交校验"正是这批决策"）；状态机 `running → ready_for_execution → completed/failed`；全部原子写；
- **`analysis_rounds.py`（异步编排层）**：同一 cycle_id 至多一轮（终态重放 / failed 安全重试——先抢租约防原 owner 还在退出 / 孤儿从最后检查点续跑）；**跨进程租约** `runtime/analysis_runs/<cycle>.lease`（O_EXCL + 3600 秒 stale）保证两个引擎进程不能双跑同一轮；Web 轮次 `submit=False`；`recover_on_startup` 在 serve 进程 API 监听后扫描续跑被重启孤儿的 running 轮次。

### 5.6 选股引擎（`screening/engine.py`）

"硬筛选 + 多因子评分"两段：

- **宇宙发现**：MongoDB → JSON → 行情提供商三级缓存（带新鲜度），提供商失败回退 stale 数据并标注；
- **硬筛选**：代码归一化（去 sh/sz/bj/hk/us 前缀）、min_price/min_amount/min_market_cap/max_pe/max_pb/max_abs_change_pct、排除 ST/*ST/退市/WARRANT 等（美股不误判 ST，测试覆盖），每股拒绝原因进审计；
- **多因子评分**：momentum 0.28 / trend 0.22 / liquidity 0.20 / valuation 0.12 / volume 0.10 / low_volatility 0.08（权重可配置）；momentum 用 d5/d20、trend 用 MA5-60+MACD+RSI14、valuation 用 PE/PB 分段、liquidity 用成交额百分位，每票附中文 evidence；
- 输出 = 评分前 shortlist + 持仓并集（上限 max_universe_size），审计落 JSON + MongoDB；`latest_screening` 是允许池来源。

### 5.7 行情与数据层（四市场如何支持）

- **`data/fetcher.py`**：薄封装，subprocess 调 Node `scripts/stock-fetcher.js`；数据源：腾讯 `qt.gtimg.cn`（实时）+ `web.ifzq.gtimg.cn`（前复权 K 线）+ 新浪（实时/历史/搜索）+ Nasdaq screener / 新浪 Market_Center（全市场列表，支持分页与全量）；
- **市场规则由 `config/market/*.yaml` 承载**（见 5.9 表），`engine/market/` 空目录是刻意的——能力下沉到配置与 Node 适配器；
- **`data/research.py`**：可审计研究数据（Finnhub 美股新闻 + 基本面，TTL 缓存）；**非美市场显式留白**（返回"当前外部公司研究数据源只支持美股"），严禁 AI 编造。

### 5.8 组合 / 优化 / 回测

- **`portfolio/account.py`**：v2 多市场账户（`{version:2, multiMarket:true, accounts:{cn,hk,us,etf}, fxRates}`）；`normalize_portfolio` 在存储边界合并 schema 默认值；`reset_market` 先全量备份、用与经纪相同的跨进程锁；
- **`optimizer/`**：max_sharpe（采样 6000 + 种子池）、risk_parity、stress_test（VaR95/ES95/最大回撤/σ）、cost_adjusted 净夏普；Black-Litterman 以当前持仓为 prior；跑四套方案选 `net_sharpe` 最高者为推荐，原子写结果；US ticker 归一化特别处理（仅显式小写 us 前缀才剥离，避免误伤 USB/SHOP/HKD）；
- **`research/backtest.py`**：轻量动量规则回测（信号 T+1 成交、成本率），定位是"参数变更是否更优"的离线先验。

### 5.9 四市场规则与风控（`config/market/*.yaml` 实读）

| 维度 | A 股（cn） | 港股（hk） | 美股（us） | 场内 ETF |
|---|---|---|---|---|
| 结算 | T+1 | T+0 | T+0 | T+1 |
| 交易单位 | 100 股/手 | 每只股票不同（per_stock） | 1 股起 | 100 份/手 |
| 涨跌幅限制 | ±10% | 无 | 无（熔断 7/13/20%） | ±10% |
| 佣金 | 万 2.5 | 万 2.5 | 0 | 万 2.5 |
| 印花税 | 0.1%（卖出） | 0.1%（双边） | 无 | 无 |
| 滑点 | 0.10% | 0.15% | 0.10% | 0.08% |
| 单票上限 | 10% | 10% | 8% | 20% |
| 硬止损 | -7% | -10% | -10% | -10% |
| 移动止损 | -4% | -6% | -7% | -6% |
| 分批止盈 | +15%/卖 30%、+25%/卖 40% | +15%/40%、+25%/50% | +20%/40%、+35%/50% | 同 A 股 |
| 持仓数 | 6–12 | 5–10 | 5–10 | 3–8 |
| 目标仓位 | 75% | 70% | 70% | 80% |

这些规则是**确定性代码**的一部分：模拟撮合严格按各市场规则计算佣金、印花税、滑点、整手与 T+1/T+0。

### 5.10 调度 / 宏观 / 通知

- **`scheduler.py`（APScheduler）**：北京时映射各市场交易日（美股早盘时段用 `us_early_morning_days`）；`ProcessLease` 保证单调度器实例；按市场注册盘中/收盘 job + 每日宏观 + 启动 1 秒后 catch-up；每个 job 用 `atomic_claim` 防重复执行；收盘轮次先跑优化器注入 `optimizer_hint`；catch-up 回补错过的轮次（grace 480 分钟，`trade_on_catch_up:false` 不成交）；**可插拔 cycle runner**——未注册时返回 skipped 写说明性报告，不中断调度；
- **`macro.py`**：宏观日报——优先从外部 OpenClaw（本机/WSL 自动发现）同步，否则 Node 脚本生成（report_date 用前一天）；
- **`notifications.py`**：仅 Webhook 渠道，URL 来自环境变量或 DPAPI；2xx 才算 delivered；任何异常**绝不阻断已完成成交**。

### 5.11 DSH 桥接与进程治理

- **`dsh_bridge.py`**：`DshBridgeRunner` 是调度器注册的 cycle runner——spawn `node .../dsh/bin.js --profile investment <task>`，注入 `DSH_PERMISSION_MODE=danger-full-access`、`IA_AUTONOMOUS_ROUND=1`、`INVESTMENT_CYCLE_ID`、`INVESTMENT_ENGINE_URL`（从 API 端口派生，2.0 实测缺陷 2）、桌面模式追加 `--patch profiles/patches/dpapi-credentials.yml`；任务文本强制"必须调用一次 `investment_analysis_workflow(..., submit=true)`"，symbols 用严格 JSON 嵌入防模型手改；轮次结束**以引擎审计为唯一事实**回填决策与成交；
- **内部 DSH Home 隔离**：headless 用 `<main_home>/agent-home`，强制播种产品树 + 复制 settings storages 但**不复制** `workspace.json/session_projcache.json`（会话隔离点）——headless 会话不出现在用户会话栏；
- **`dsh_home.py`**：纯 Python 播种（安装版零 PowerShell），每次引擎启动 `force=True` 刷新产品树（产品更新触达旧安装），用户数据永不被覆盖；
- **`runtime_lock.py`**：`AtomicClaim`（O_EXCL + stale 回收）、`ProcessLease`（msvcrt.locking / flock 单进程锁）；
- **`subprocess_utils.py`**：`CREATE_NO_WINDOW` 防弹窗、三序解码（UTF-8→locale→GB18030）；
- **`migration.py`**：1.x→2.x 迁移——识别 `D:\investment-auto` 或 `INVESTMENT_AUTO_HOME`（兼容 1.x/2.0 两种布局）、只复制不删源、覆盖前备份、账户 `normalize_portfolio` 归一化、`.env` 密钥提取进 DPAPI 并从复制件移除明文与机器路径。

### 5.12 引擎测试覆盖

`tests/` 26 个文件 170 个测试函数：账户/配置/路径/DPAPI/迁移（含 1.x env 密钥迁移）；经纪风控（权重重算封顶、硬止损/止盈/熔断全清、T+1）；**幂等专项**（首成交写回执、同键同内容重放不重复、同键异内容拒绝、跨进程重启耐久、crash-between-fills-and-bookkeeping 从回执恢复、in-progress 活认领拒绝、pre-broker 失败释放认领）；分析状态机（checkpoint 续跑、failed 仅编排器可重开、execution_ready 指纹、孤儿续跑、启动恢复、Web 强制 analysis-only）；选股（排除 ST/流动性、美股不误判 ST、缓存降级）；优化（港股双边印花税、US ticker 归一化、锁防并行）；调度（US 早盘 misfire、星期编号、报告锁防重、runner 缺失 skipped）；DSH 桥 14 项（engine_url 派生、dpapi patch 条件、审计折叠、进程超时）；API 服务器鉴权/凭据 roundtrip；子进程编码。

---

## 6. 固定多角色分析流程

2.1 起用户入口明确分为两块（用户指定标的绝不混入选股池；持仓只作上下文）：

```text
选股请求
  → 市场硬筛选与多因子评分（investment_run_screening）
  → Agent 复筛
  → 标准化候选列表
  → 固定完整分析流程（symbols_source="screening"）

用户指定股票
  → 证券身份确认（investment_security_search）
  → 跳过选股
  → 固定完整分析流程（symbols_source="user"）
```

固定流程五阶段 + 提交链路：

```text
技术面 / 基本面 / 新闻 / 情绪研究（四类基础研究，每标的并行）
  → 多空辩论（bull/bear）→ 研究经理 → 逐标的交易员
  → 组合草案（portfolio_draft）
  → 激进 / 保守 / 中立风险辩论 → 风险经理
  → 最终组合决策（final_decision）
  → ready_for_execution（引擎计算决策指纹）
  → 用户批准 或 自主轮次授权（submit=true）
  → Python 硬风控（build_orders）
  → 模拟撮合（paper broker）、审计与报告
```

### 6.1 五阶段与角色

工作流插件把流程固化为五个阶段 `STAGES = [base_research, research_debate, portfolio_draft, risk_review, final_decision]`，用 DSH 原生 workflow 脚本（`pipeline/parallel/agent`）编排多角色子代理：

1. **base_research**：每标的并行四路研究——技术面 / 基本面 / 新闻 / 情绪（schema `baseResearch`）；
2. **research_debate**：多头 vs 空头辩论（可配置轮数，默认 1 轮）+ 研究经理裁决 + 逐标的交易员；
3. **portfolio_draft**：组合草案；
4. **risk_review**：激进 / 保守 / 中立三方风险辩论（默认 1 轮）+ 风险经理；
5. **final_decision**：最终组合经理 → 持久化最终决策 → 引擎计算决策指纹 → `ready_for_execution`。

### 6.2 质量与安全机制

- **schema 组合期预检**：全部 Agent schema 冻结为共享常量，在插件组合期用 DSH 公共 `assertObjectJsonSchema()` 校验（2.1.3 修复了属性级 required 的兼容问题）——避免昂贵分析轮次中途才失败；
- **阶段原子 checkpoint**：每阶段完成后原子写 `runtime/analysis_runs/`；崩溃/重启后同 cycle_id 续跑，跳过已完成阶段；failed 保留检查点允许安全重试；
- **证据质量门槛**：引用强制 + 最少引用数；基础研究成功率低于 `minimum_symbol_research_success_ratio`（默认 0.8）即故障安全停止；研究不完整的持仓被 normalizer **强制 HOLD**、非持仓剔除（模型偷塞的选股池标的被丢弃）；
- **cycle_id 身份**：主源 = 会话 ID + 最新直接用户消息 ID（同轮重试同键、新消息必换键）；headless 用引擎注入的 `INVESTMENT_CYCLE_ID`；内容哈希仅作引擎短 TTL 传输兜底，从不用于 cycle id；
- **手动/自主同构**：Web 会话与 headless 自主轮次执行同一套阶段脚本——手动为异步启动器（`POST /api/analysis/rounds/start` 秒级返回 + 轮询），headless 为同步执行器；手动会话强制 `submit=false`，仅自主轮次（调度器）可 `submit=true`。

### 6.3 流程的可配置面（`config/config.yaml` 实读）

- **角色开关**：13 个分析角色均可独立开关；
- **自主轮次限额**：`max_position_pct 32%`、`max_order_value_pct 38%`、`max_cycle_turnover_pct 35%`、`min_confidence 0.65`、`max_decisions 40`、`max_orders_per_cycle 10`、`max_universe_size 30`、4 个 agent workers、命令心跳 10 秒/空闲超时 300 秒/硬超时 1800 秒；
- **研究参数**：研究辩论/风险辩论轮数、最少 4 位基础分析师、研究数据 30 分钟 TTL、每角色记忆条目数、证据摘要上限 16000 字符、引用自动修复、检查点 90 分钟 stale 窗口；
- **DSH 桥**：`dsh_bridge.enabled` + `app_dir` + headless 单轮硬上限 1800 秒；
- **LLM**：快速/深度双模型（deepseek-v4-flash / deepseek-v4-pro），多供应商（DeepSeek、DeepInfra、GLM 等），`api_key_env` 引用环境变量。

---

## 7. Windows 桌面壳与发行体系

桌面形态是一套 **.NET 8 WPF + WebView2 的"薄壳"**（`windows/desktop/`，csproj：`net8.0-windows`、`WinExe`、WPF + WinForms 托盘、WebView2 1.0.2592.51、WMI 依赖 System.Management，self-contained win-x64 发布）：壳本身不含业务逻辑，只负责托管两个后台进程并暴露到窗口内：

- 投资引擎：`pythonw -s -m engine.main serve|run`
- DSH 产品壳（对话/决策平面）：`node <app>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile investment-web --port <port>`

### 7.1 窗口与回环端口 / 令牌机制

- 窗口 = `StatusBar`（六个实时状态格：投资引擎 / 对话服务 / 风控 / 模式 / 策略 / 轮次）+ 全屏 WebView2；
- **动态端口**：`TcpListener(IPAddress.Loopback, 0)` 让 OS 分配空闲回环端口；web 端口"就绪"不是靠轮询，而是**解析 DSH 进程 stdout**（正则 `dsh web:\s*https?://...`）后原子写 `web.ready.json`（先 `.tmp` 再 `File.Move`）；
- **随机令牌**：`IA_ACCESS_TOKEN` = base64url 编码的随机 GUID（可被环境变量覆盖），经 `WebResourceRequested` 过滤器**只注入引擎 loopback API 域**（`EngineUrl + "/*"`），DSH web 源与外部域一律不注入；
- **IPv4 归一化**：就绪解析把 `localhost` 归一化为 `127.0.0.1`——实测 WebView2 把 localhost 解析成 IPv6 `::1` 会让纯 IPv4 监听器卡在 SYN_SENT 永久挂起；
- **WebView2 三重防挂起**：显式 `browserExecutableFolder`（Locator 查 64/32 位注册表三视图 + 文件存在性校验）、孤儿浏览器进程清理（WMI 按命令行含 `InvestmentAuto` 匹配，单实例互斥量已持有故必然是孤儿）、45 秒双超时 + 启动异常落盘 `%TEMP%\ia-desktop-boot.log`。

### 7.2 进程生命周期

- **单实例**：命名 Mutex `InvestmentAuto.Desktop.Singleton` + 命名管道 `"show"` 信号，二次启动唤醒旧实例；
- **零孤儿进程**：P/Invoke 创建 Windows Job Object（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`），壳退出时 `TerminateJobObject` 一次性终结整棵 pythonw/node 进程树；Job 句柄幂等复用；
- **启动自愈**：`EnsureRunningAsync` 读就绪文件 + 健康检查（2 秒超时）→ 不健康则重拉 → 120×500ms 轮询就绪（60 秒超时）；托盘"启动服务"可幂等手工重启；
- **首启防风暴**：`setup.complete` 不存在时只起 `serve`（API + 首次向导），**绝不起 `run`**（向导完成前绝不启动自动投资）；向导完成后由 5 秒定时器检测才 `StartAgent()`，且每次启动只尝试一次（`_agentStartAttempted`），避免 pythonw 风暴；
- **托盘**：六项菜单（打开 / 启动服务 / 暂停投资 / 查看日志 / 开机自启勾选 / 退出）；关闭窗口三选一对话框（最小化到托盘 / 停止并退出 / 取消）；
- **开机自启**：HKCU Run 键（每用户免管理员），额外校验命令含 `InvestmentAuto.Desktop.exe` 以排除旧项目同名键值误判。

### 7.3 安装器（Inno Setup，`installer/InvestmentAuto.iss`）

- 每用户、免管理员、运行期免 PowerShell；`PrivilegesRequired=lowest`，安装到 `%LocalAppData%\Programs\InvestmentAuto`（路径锁死）；
- 组件：桌面壳 publish 产物 + 内置 Python（可迁移 CPython + 离线依赖）+ 内置 Node 22 + `engine/` + `app/`（**排除 `dev-home\*` 开发会话与凭据**）+ 配置/脚本 + WebView2 Evergreen bootstrapper（仅缺运行时触发）；
- **升级保留数据的机制是物理分离**：用户数据在 `{app}` 之外（`%LocalAppData%\InvestmentAuto`），覆盖安装只重写程序目录；`[InstallDelete]` 清理旧版误装的 `{app}\app\dev-home`；
- 卸载：交互式询问是否保留用户数据（默认保留）；静默卸载不弹窗、始终保留；
- 中英双语（`ChineseSimplified.isl` 官方翻译）。

### 7.4 发行流水线与门禁

fetch-runtime（python.org NuGet / Node 官方 zip / WebView2 bootstrapper）→ bundle-runtime（`PYTHONNOUSERSITE=1` + `python -s -m pip install --no-index` 离线装依赖；自包含门禁 = `pip check` + 关键模块 import 冒烟）→ build-desktop（`dotnet publish --self-contained true`）→ ISCC 打包 → **release-check.ps1 一键门禁**（C# 测试 + .venv pytest + Node 插件测试 + 技能/插件契约 + 捆绑运行时隔离下同套件 pytest + verify-upgrade 升级保数据 + 安装包 SHA-256；任一步失败退出码 1）。

`verify-upgrade.ps1`：快照数据目录逐文件 SHA-256 → 静默覆盖安装 → 再快照比对（missing=0 / changed=0；排除易变 WebView2 缓存），并交叉比对安装后的 dll 与当前 publish 产物哈希以捕获"过期安装包"。`release-manifest-check.ps1` 硬性断言 app 源排除 `dev-home\*`——两条防线防止开发凭据泄漏进安装包。

### 7.5 桌面测试

xUnit 20 项（全程序集串行）：单实例互斥（3）、进程管理器构造/Node 定位/端口/首启标志（5）、ready 文件解析与 localhost 归一化（5）、pythonw 定位优先级 `python/ > .venv > PATH`（4）、开机自启注册表往返与非破坏（3）。策略上不拉起真实 Python，用假可执行文件验证定位与构造；AutoStart 测试备份恢复真实 HKCU 值。

### 7.6 子代理指出的文档/脚本不一致（如实记录）

`fetch-runtime.ps1` 默认 Node v22.19.0 而 `build-windows-release.ps1` 引用 v20.18.1；`DESKTOP_PLAN/DESKTOP_USAGE` 写"C# 18 项"实为 20 项；`PickFreePort` 先释放再复用存在极小竞态；旧版 `InvestmentAutoLauncher.cs`（0.9.1 WinForms 启动器）与 `dist/` 下 4 个 1.x 便携 zip 为历史遗留。

---

## 8. 安全与可靠性设计

本项目最鲜明的工程特征是把"AI 不可靠"当作默认前提来设计。安全边界（README + `docs/ARCHITECTURE_2.0.md` 铁律）：

1. **只做纸面**：只有 `trading.mode=paper` 可执行，引擎代码拒绝其他模式；
2. **唯一执行入口**：`submit_decisions` 是 AI 决策的唯一执行入口——引擎自行取价（不信任载荷）、标的必须在允许池（持仓 ∪ 最新选股 ∪ 配置默认标的）、仓位由 `build_orders` 按授权书硬边界重算并封顶；
3. **紧急停止**：kill 激活时拒绝一切决策执行；暂停不阻断人工提交但记录告警；
4. **崩溃安全**：撮合在纸面经纪的持仓锁 + 原子写内完成；审计原子落盘；崩溃最多丢失一轮研究，不会重复成交（fail-safe 由幂等设计保证）；
5. **系统权限与交易权限分离**：桌面对话与自主 headless IA 固定使用 DSH `danger-full-access`（Shell/文件/搜索/后台任务/子代理/Ralph，可维护 `INVESTMENT_AUTO_ROOT` 下的权威源码），但**系统级权限放宽不改变交易业务边界**——纸面模式、用户批准、幂等回执、决策指纹与 Python 硬风控仍不可绕过；
6. **密钥安全**：API Key 与 Webhook 用 Windows DPAPI 加密存储（`secrets.enc` / DPAPI 凭据 provider），不写普通配置或日志，Webhook 地址永不回显；
7. **网络边界**：服务仅绑定 127.0.0.1 动态端口；引擎 API 要求每启动随机的 `X-IA-Token`。

成交幂等的三层防线（2.1.2 强化）：

- **幂等键必填**：`submit_decisions` 无 `idempotency_key` 直接拒绝；
- **决策指纹内容绑定**：认领时写入归一化决策指纹（市场 + 排序后的 symbol/action/weight/confidence），同键不同内容一律拒绝；
- **账户文件为唯一事实**：成交与执行回执在账户锁内同一次原子替换写入 `portfolio.json`（回执含指纹/成交/拒绝/时间戳，上限 200 条滚动淘汰）——崩溃于"已成交、未写簿记"之间时，重试从账户回执重放，**绝不再成交**；
- **四类 in_progress 处理**：格式/内容错误 → 终态 rejected 并重放；确定性硬风控拒绝 → 保存并重放；撮合前暂时性故障 → 释放认领允许重试；已进入撮合 → 绝不删除，凭回执恢复；
- **跨进程租约**：每 cycle 持 `runtime/analysis_runs/<id>.lease`（O_EXCL + stale），两个引擎进程不可能双跑同一轮次；serve 进程启动后扫描并续跑被重启孤儿的 running 轮次。

2.1.1 记录的一个真实事故最说明问题：长轮次期间 Node `requestTimeout`（默认 300s）掐断浏览器 HTTP 长连接，后端继续跑、窗口 AI 重复调用——实测**一次请求启动 4 个轮次、产生 4 笔重复成交**。修复后：轮次全部改为"秒级启动 + 轮询"异步形态，产品外壳把 web server `requestTimeout` 归零，且幂等键保证超时重试不可能重复启动流程或重复成交。这正是本项目"从真实故障中提炼不变量"的工程风格的缩影。

---

## 9. 测试与质量保障

2.1.3 回归基线：

| 测试层 | 数量 |
|---|---|
| Python（引擎：恢复、幂等、风控、配置、迁移、调度……） | 184 项 |
| Node 插件（tools / workflow / dpapi-credentials） | 22 项 |
| Windows 桌面（xUnit：单实例、ready 解析、进程管理、自启、聊天就绪） | 20 项 |
| Skills / 插件组合契约检查 | 通过 |
| 真实 Profile 组合验证 | 通过 |
| 覆盖升级数据校验 | 76,167 文件 0 缺失 0 变化 |
| 无头浏览器渲染断言（无 DSH 品牌、导航、Dashboard、设置页） | 通过（2.1.0 时 19 项，2.1.2 时 29 项） |
| wire 协议真实对话 E2E（session.create → preset=investment → investment_status 工具 → 中文回答） | 通过 |
| AAPL 完整分析恢复实测 | 同一 cycle id 复跑，依次完成 5 个 checkpoint 到达 `ready_for_execution` |

一键发行门禁：`powershell -ExecutionPolicy Bypass -File scripts\release-check.ps1`（C# 测试 + .venv/捆绑运行时 pytest + 升级保数据 + 安装包 SHA-256，任一失败退出码非 0）。

---

## 10. 与同类项目的对比与差异化优势

### 10.1 同类项目逐一对比

| 项目 | 定位 | 技术栈 | 市场/实盘 | 与 Investment Auto 的核心差异 |
|---|---|---|---|---|
| **AI Hedge Fund**（virattt） | LangGraph 编排的"AI 对冲基金团队"，传奇投资者角色对单股投票出信号 | Python + LangGraph，单一数据源 financialdatasets.ai | 美股为主；仅回测/模拟 | 单市场单数据源；无 A股/港股/ETF、无 Python 硬风控撮合、无 DPAPI/checkpoint/幂等、无桌面壳——是"信号 demo"，不是投研 + 模拟交易闭环 |
| **TradingAgents**（TauricResearch） | 多智能体金融交易框架，模拟"分析→辩论→决策"团队（学术论文开源） | LangGraph + FastAPI + React；AKShare + Yahoo | A股 + 美股；无实盘 | **流程最相似**（多空辩论→研究经理/交易员→三路风险辩论→风险经理→决策），但止步于信号与回测；无桌面壳、无 DPAPI、无 checkpoint 幂等、无独立硬风控撮合引擎、缺港股/ETF |
| **FinRobot**（AI4Finance） | AI 金融分析 Agent 平台/工具链生态 | Python 分层 Agent 架构 | 美股为主；偏研究教学 | 定位是"研究/教学工具集"，非端到端交易闭环；无固定投研流水线 + 撮合风控、无桌面应用 |
| **FinGPT**（AI4Finance） | 开源金融大模型（LoRA 微调、情感分析、指令数据） | 开源基座 + LoRA/RLHF | 模型/数据层，市场无关 | **层级不同**：FinGPT 是模型/数据底座，Investment Auto 是端到端应用；FinGPT 反而可作为其情绪分析组件，互补而非竞争 |
| **Qlib / RD-Agent**（微软） | AI 量化投资平台：数据、因子、模型、回测、组合全流程 + LLM 研究 Agent | Python 高性能数据层 + ML/DL 模型 | 框架层市场无关（示例多为 A股/美股）；研究回测平台 | Qlib 强在**因子挖掘与量化 Alpha 回测深度**（明显强于 IA），但无多空辩论决策流水线、无风控撮合、无桌面壳；两者互补 |
| **OpenBB** | 开源投资研究平台/终端，统一数据 API | Python Platform + Provider 模型 | 全球多市场（视供应商）；无实盘 | 通用数据研究工作台；不内置多 Agent 投研决策流程与模拟撮合风控；面向全球通用而非 A股/港股专注；无 Windows 工程化特性 |
| **AutoGen / LDB 金融用例** | 通用多智能体编排框架，金融只是示范场景 | 通用编排框架 | 多为研究 demo | 层级不同：AutoGen/LDB 是"通用框架"，需自行搭建全部金融逻辑；IA 是"领域完整应用"。也佐证底座差异——同类多用 LangGraph/AutoGen 自建，IA 复用 DSH |
| **国内平台**（同花顺问财、东方财富妙想、雪球、QMT/PTrade、掘金、BigQuant、聚宽） | 商业 AI 投顾 / 量化终端 / 社区 | 商业 SaaS | 多数对接真实券商实盘 | 商业闭源、重资讯投顾或量化策略实盘导流；IA 开源、离线、纸面模拟（不连券商）、以 LLM 多 Agent 投研决策为核心，定位与商业模式均不同 |
| **DeepSeek Harness（DSH，底座）** | DeepSeek 开源的 AI Agent 开发底座（"Everything is a Plugin"） | 插件化运行时：模型/工具/Agent Loop 可插拔 | 底座层 | DSH 是通用 Agent 底座，IA 是**基于 DSH 深度定制的垂直金融应用**——这是与同类项目最大的底座差异 |

### 10.2 汇总：Investment Auto 的差异化要点

1. **底座差异**：同类 LLM 项目普遍基于 LangGraph/AutoGen 自建编排；IA 复用 DSH 作为统一插件化 Agent 底座，天然获得调度、checkpoint 恢复、插件化扩展等现成工程能力；
2. **市场覆盖更全**：A股 + 港股 + 美股 + 场内 ETF 四市场统一行情与**确定性交易规则**（T+1/T+0、整手、涨跌停、印花税、佣金、滑点），同类多为单/双市场；
3. **流程完整且工程化**：多因子选股 + 四路研究 Agent + 多空辩论 + 研究经理/交易员 + 三路风险辩论 + 风控经理 + 最终决策——是 TradingAgents 流程的"工程落地强化版"；
4. **自带 Python 硬风控 + 纸面模拟撮合**：同类 LLM 项目多数止步于"给信号"，IA 有独立的确定性风控与撮合引擎（不连真实券商）；
5. **交易安全与一致性工程**：DPAPI 密钥存储、checkpoint 崩溃恢复、决策指纹 + 账户内回执幂等防重复成交——面向"可用桌面应用"的工程化能力，同类研究型项目基本缺失；
6. **客户端形态**：一键安装的 Windows 桌面应用（捆绑 Python/Node/.NET/WebView2），TradingAgents 是 Web 应用、其余多为库/CLI/SaaS；
7. **离线/本地可运行**：开源、离线、纸面模拟，隐私与合规门槛低；对比需券商实盘对接的商业平台，定位为"研究与模拟"而非"实盘执行"；
8. **与量化平台的互补**：Qlib 强在因子/ML 回测，IA 强在 LLM 投研决策与全流程闭环——主观多 Agent 投研 vs 量化因子 Alpha，两条路线互补；
9. **与 FinGPT/FinRobot 的层级差异**：模型/数据底座、研究工具集 vs 端到端应用，可组合而非竞争；
10. **与国内 AI 平台相比**：问财/东财/雪球闭源、重资讯投顾与实盘导流；IA 开源、可审计、离线模拟、流程透明；
11. **自维护能力**：IA 是"会修自己的应用"（`self-maintenance` Skill + DSH 原生编码工具 + 权威源码根），这在同类项目中几乎没有先例；
12. **版本/迁移工程**：1.x 用户数据无损迁移、覆盖升级 76,167 文件字节级校验、失败轮次同 cycle id 复跑实测——长期维护思维的体现。

### 10.3 参考来源

- AI Hedge Fund：https://github.com/virattt/ai-hedge-fund 、https://deepwiki.com/virattt/ai-hedge-fund/3-system-architecture
- TradingAgents：https://github.com/UMRFF/TradingAgents 、https://developer.aliyun.com/article/1733252
- FinRobot：https://github.com/AI4Finance-Foundation/FinRobot 、https://arxiv.org/abs/2405.14767
- FinGPT：https://github.com/AI4Finance-Foundation/FinGPT 、https://ar5iv.labs.arxiv.org/html/2306.06031v2
- Qlib / RD-Agent：https://github.com/microsoft/qlib 、https://arxiv.org/abs/2505.15155
- OpenBB：https://github.com/OpenBB-finance/OpenBB
- AutoGen 金融用例：https://github.com/liangdabiao/autogen-financial-analysis
- 同花顺问财 / 东方财富妙想 / QMT·PTrade / 掘金 / BigQuant / 聚宽：见调研子代理报告 URL 列表
- DeepSeek Harness：https://github.com/farhanic017/deepseek-harness 、https://github.com/Electricitysheep/dsh-handbook

> 说明：部分星标数（如 AI Hedge Fund "50k+"、OpenBB "60k+"）为第三方文章转述约数，精确值以 GitHub 实时数据为准。

---

## 11. 局限与改进方向

**产品边界（定位使然，非缺陷）**：

- 仅支持研究与模拟交易，不连接真实券商——"AI 建议不直接碰真钱"是其安全模型的一部分；
- 行情与研究数据来自公开第三方源（腾讯/新浪/Nasdaq screener/Finnhub），非美市场的外部公司研究数据显式留白（避免 AI 编造），数据覆盖率与稳定性取决于数据源；
- 仅 Windows 10/11 x64（捆绑运行时、DPAPI、WPF/WebView2 均面向 Windows）；
- 多角色流程的 LLM 成本与延迟：13 个角色 × 每标的，完整轮次为分钟级（headless 单轮硬上限 1800 秒），实时性不适用于高频场景。

**已知不一致/技术债（子代理深挖发现的真实记录）**：

- 发行脚本 Node 版本三处不一致（fetch-runtime 默认 v22.19.0 / build-windows-release 引用 v20.18.1 / 文档写 Node 20），便携 zip 链与安装器链布局不一致；
- 文档测试数滞后（DESKTOP_PLAN/DESKTOP_USAGE 写"C# 18 项"，实为 20 项）；
- `PickFreePort` 先释放再复用存在极小竞态；
- 旧版 `InvestmentAutoLauncher.cs`（0.9.1 WinForms 启动器）与 `dist/` 下 1.x 便携产物为历史遗留；
- DSH 底座锁定 rc.6（防 npm 混装 rc.8 的主动锁版），底座升级是显式流程、不追 rc。

**改进方向**：

- 量化深度：与 Qlib 类因子/ML 回测能力互补整合（当前回测仅轻量动量规则）；
- 更多数据源与数据冗余（当前主要依赖腾讯/新浪），研究数据覆盖非美市场；
- 移动端/跨平台（当前仅 Windows 桌面）；
- 交易成本模型细化（港股每手股数目前保守取整）；
- 长流程的 token 成本优化（证据摘要、缓存已起步）。

## 12. 总结

**Investment Auto 2.1.3 是什么**：一个以 DeepSeek Harness 为不可见底座的、面向 A股/港股/美股/场内 ETF 的投资研究与模拟交易 Windows 桌面产品。它把"通用 AI 助手"与"确定性投资引擎"焊接成一个完整闭环：

- **用户侧**：对话式投资助手（原生思考/流式/工具/Skills/子代理）+ Dashboard + 真实分析流程页 + 设置页，一键安装、覆盖升级不丢数据；
- **决策侧**：13 个角色的固定多阶段分析流程（四路研究 → 多空辩论 → 组合草案 → 三方风险辩论 → 最终决策），选股与股票分析两块路由；
- **执行侧**：AI 决策唯一入口 `submit_decisions` → 决策指纹校验 → Python 硬风控重算仓位 → 纸面经纪撮合 → 审计/报告/反思，全部确定性代码；
- **工程侧**：DPAPI 密钥、跨进程租约、原子 checkpoint、账户内执行回执幂等、内部会话隔离、崩溃恢复实测、自维护能力（IA 能修自己）。

**为什么值得关注**：同类 LLM 金融项目（AI Hedge Fund、TradingAgents 等）大多止步于"给信号/出回测"，Investment Auto 的差异化在于**把"AI 不可靠"当作默认前提**做了完整的工程闭环——AI 只能提出方案，成交必须经过不可绕过的确定性风控与幂等撮合；崩溃、超时、重复请求、重启孤儿都有明确的状态机与实测恢复路径。从 1.x 自研 Agent 架构到 2.x DSH 底座重构，项目积累了 0.4→2.1.3 十余个版本的真实故障教训（重复成交事故、WinError 5、GBK 编码、WebView2 挂起、IPv6 SYN_SENT 卡死……），并把每个教训沉淀为测试与不变量——这种"从真实故障中提炼工程纪律"的风格，使它在同类开源项目中具有独特的参考价值。
