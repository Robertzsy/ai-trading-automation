# 2026 主流量化 / AI 量化项目调研

- 采集日期：**2026-10-05**（星标、最近提交时间为当日 GitHub API 实测）
- 口径：`★` = GitHub `stargazers_count` 实测值；`push` = `pushed_at`（最近一次提交，仅标注已实测项，`—` 表示本次未逐一实测）
- 判定停滞的经验线：`push` 距今超过 6 个月视为停滞/需自行评估
- 数据来源：GitHub REST API（search + repos）+ 中英文公开报道（文末列出）
- 免责：本文是生态调研，不是投资建议；**星标 ≠ 质量 ≠ 可实盘**
- 姊妹文档：[RESEARCH_QUANT_EXEMPLARS.md](RESEARCH_QUANT_EXEMPLARS.md)（值得学习的优秀项目：按"可偷的设计"排序）

---

## 0. 一句话结论

2026 年的量化生态已分成**四层**，热度重心明显在往上两层迁移：

| 层 | 代表 | 现状 |
|---|---|---|
| ① 工程底座（撮合/回测/数据） | vnpy、nautilus_trader、ccxt、akshare | 成熟稳定，格局固化，拼延迟与品种覆盖 |
| ② ML 量化（因子/模型/RL） | Qlib、RD-Agent、FinRL、AlphaGPT | 从"人工挖因子"转向"LLM/进化算法自动挖因子" |
| ③ LLM Agent 量化（投研/决策） | TradingAgents、ai-hedge-fund、Vibe-Trading、AI-Trader | **绝对热点**：TradingAgents 已 10.9 万星，衍生出中/美/加密/多市场一整个家族 |
| ④ Agent Harness + Skills + MCP（分发层） | OpenClaw（39.1 万星）、Claude Code、DeepSeek Harness | **2026 最大范式变化**：量化能力被拆成 `SKILL.md` + MCP 工具在网上流通 |

一句话：**"多智能体辩论投研 + 确定性硬风控" 已成事实标准架构；谁掌握 Skills/MCP 分发层，谁掌握入口。**

---

## 1. ① 工程底座：传统量化框架

| 项目 | ★ | 语言 | 定位 | push（实测） |
|---|---:|---|---|---|
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | 55,033 | Python | 加密交易机器人 | 2026-10-05 |
| [vnpy/vnpy](https://github.com/vnpy/vnpy) | 45,695 | Python | 国内最主流量化平台框架（MIT，issue 仅 6） | 2026-10-05 |
| [ccxt/ccxt](https://github.com/ccxt/ccxt) | 44,255 | Python/TS | 100+ 交易所统一 API | 2026-10-03 |
| [nautechsystems/nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | 29,632 | Rust | 生产级事件驱动引擎（LGPL-3.0） | 2026-10-05 |
| [mementum/backtrader](https://github.com/mementum/backtrader) | 23,392 | Python | 经典回测库 | **2024-08-20（上游事实停更）** |
| [QuantConnect/Lean](https://github.com/QuantConnect/Lean) | 21,861 | C# | 机构级回测/实盘引擎 | 2026-10-03 |
| [hummingbot/hummingbot](https://github.com/hummingbot/hummingbot) | 20,307 | Python | 加密做市/高频机器人 | 2026-09-28 |
| [bbfamily/abu](https://github.com/bbfamily/abu) | 18,845 | Python | 阿布量化系统（中文教学向） | 2026-01-24 |
| [UFund-Me/Qbot](https://github.com/UFund-Me/Qbot) | 18,569 | Python | 本地部署 AI 量化机器人 | — |
| [yutiansut/QUANTAXIS](https://github.com/yutiansut/QUANTAXIS) | 11,255 | Python | 全流程量化框架（MIT） | 2026-09-18 |
| [StockSharp/StockSharp](https://github.com/StockSharp/StockSharp) | 10,832 | C# | 俄系交易机器人平台 | — |
| [polakowo/vectorbt](https://github.com/polakowo/vectorbt) | 9,276 | Python | 向量化回测/参数扫描 | 2026-09-26 |
| [kernc/backtesting.py](https://github.com/kernc/backtesting.py) | 9,014 | Python | 轻量回测（上手最快） | 2026-08-05 |
| [jesse-ai/jesse](https://github.com/jesse-ai/jesse) | 8,612 | Python | 加密策略框架 | 2026-10-01 |
| [ricequant/rqalpha](https://github.com/ricequant/rqalpha) | 6,809 | Python | 米筐开源回测框架 | 2026-09-28 |
| [Drakkar-Software/OctoBot](https://github.com/Drakkar-Software/OctoBot) | 6,679 | Python | 加密机器人（AI/网格/DCA） | 2026-10-01 |
| [wondertrader/wondertrader](https://github.com/wondertrader/wondertrader) | 6,379 | C++ | 国产一站式框架（期货 CTA） | 2026-09-01 |
| [Superalgos/Superalgos](https://github.com/Superalgos/Superalgos) | 5,677 | JS | 可视化加密交易 | 2026-10-04 |
| [nkaz001/hftbacktest](https://github.com/nkaz001/hftbacktest) | 4,852 | Rust | 高频/做市回测（含排队与延迟，L2/L3 tick） | 2025-12-23 |
| [fasiondog/hikyuu](https://github.com/fasiondog/hikyuu) | 3,548 | C++ | 高性能量化框架（Apache-2.0） | 2026-10-05 |
| [pst-group/pysystemtrade](https://github.com/pst-group/pysystemtrade) | 3,538 | Python | Rob Carver 系统化交易（GPL-3.0） | 2026-09-30 |

> `backtrader` 替换方案：社区 fork [cloudQuant/backtrader](https://github.com/cloudQuant/backtrader)（★192）自称比上游快 45%+；或直接迁 vectorbt / nautilus_trader。

**选型速记**

- A 股/期货**实盘接口** → vnpy / wondertrader / hikyuu
- **低延迟生产引擎** → nautilus_trader / hftbacktest
- **快速研究验证** → vectorbt / backtesting.py
- **加密** → ccxt + freqtrade / hummingbot / jesse

---

## 2. ② AI 量化：模型与因子自动化

| 项目 | ★ | 定位 | push（实测） | 关键点 |
|---|---:|---|---|---|
| [microsoft/qlib](https://github.com/microsoft/qlib) | 49,142 | AI 量化研究平台（MIT） | 2026-09-22 | 监督学习 / 市场动力学 / RL 三范式；与 RD-Agent 打通做研发自动化 |
| [ranaroussi/yfinance](https://github.com/ranaroussi/yfinance) | 25,427 | 行情数据下载 | — | 原型够用，生产需谨慎（无限流/SLA） |
| [akfamily/akshare](https://github.com/akfamily/akshare) | 22,825 | 中文金融数据接口库（MIT，issue 0） | 2026-09-30 | A 股研究事实标准数据源之一 |
| [AI4Finance-Foundation/FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | 21,351 | 金融大模型开源线 | 2026-09-23 | 金融语料微调模型 |
| [stefan-jansen/machine-learning-for-trading](https://github.com/stefan-jansen/machine-learning-for-trading) | 21,221 | ML4T 第三版代码 | 2026-10-04 | 从取数到实盘的全流程教材 |
| [AI4Finance-Foundation/FinRL](https://github.com/AI4Finance-Foundation/FinRL) | 16,555 | 金融强化学习（MIT，issue 307） | 2026-09-29 | 学界 RL 交易基准 |
| [waditu/tushare](https://github.com/waditu/tushare) | 15,443 | 中文数据接口 | — | 老牌，部分接口已商业化 |
| [microsoft/RD-Agent](https://github.com/microsoft/RD-Agent) | 14,841 | **自动化研发 Agent**（MIT） | 2026-10-02 | LLM 自动提假设→写代码→回测→迭代；Qlib 官方搭档 |
| [AI4Finance-Foundation/FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | 8,140 | 金融 AI Agent 平台 | 2026-09-28 | 学术色彩浓，擅长自动研报 |
| [ranaroussi/quantstats](https://github.com/ranaroussi/quantstats) | 7,678 | 组合绩效分析 | 2026-09-28 | 回测报告标配 |
| [PyPortfolio/PyPortfolioOpt](https://github.com/PyPortfolio/PyPortfolioOpt) | 6,073 | 组合优化 | 2026-07-08 | 有效前沿 / BL / HRP |
| [hudson-and-thames/mlfinlab](https://github.com/hudson-and-thames/mlfinlab) | 4,935 | 金融 ML 工具（López de Prado 系） | **2023-10-02（开源版已停更，转商业产品）** | Purged CV / 元标注思路仍值得学，代码建议自实现或找替代 |
| [imbue-bit/AlphaGPT](https://github.com/imbue-bit/AlphaGPT) | 3,164 | 深度强化学习**自动因子工厂**（中文） | — | 2026 年增长最快的国产因子自动化项目 |
| [TradeMaster-NTU/TradeMaster](https://github.com/TradeMaster-NTU/TradeMaster) | 3,087 | RL 量化平台（NTU） | 2025-06-04 | 学术向，更新放缓 |
| [akfamily/akquant](https://github.com/akfamily/akquant) | 2,391 | Rust 内核量化研究/交易框架 | — | akshare 团队出品 |
| [QuantaAlpha/QuantaAlpha](https://github.com/QuantaAlpha/QuantaAlpha) | 1,581 | LLM + 进化算法因子发现 | — | "alpha 工厂" |
| [eliasswu/AlphaPurify](https://github.com/eliasswu/AlphaPurify) | 586 | Polars 因子清洗/回测 | — | 极快，工程实用 |
| [Miasyster/QuantGPT](https://github.com/Miasyster/QuantGPT) | 479 | Agent 驱动 A 股因子工厂 | — | 假设→回测→打分→提交 WorldQuant BRAIN |

**趋势**：因子发现的"作者"正在从人变成 Agent。Qlib + RD-Agent 是工业界参考实现；AlphaGPT / QuantaAlpha / QuantGPT / [Alphasift](https://github.com/ZhuLinsen/alphasift) 等 2026 新项目都在做同一件事——**用 LLM/进化算法闭环生成并验证因子**。

---

## 3. ③ LLM Agent 量化：2026 的主战场

### 3.1 头部梯队（按星标）

| 项目 | ★ | 市场 | 定位 | push（实测） |
|---|---:|---|---|---|
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | **109,793** | 美股 | 多智能体辩论投研（LangGraph）：分析师团队 → 多空辩论 → 交易员 → 风控 → 组合经理 | —（[论文 arXiv 2412.20138](https://arxiv.org/abs/2412.20138)） |
| [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | 65,899 | A/港/美 | LLM 每日分析 + 决策看板 + 多通道推送，GitHub Actions 零成本定时 | 2026-10-05（2026-01-10 创建） |
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 63,858 | 美股 | "AI 对冲基金团队"：巴菲特/芒格/木头姐等角色提案 → PM 决策 | — |
| [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 34,702 | 全市场 | 港大 HKUDS 个人交易 Agent 工作台，内建 Skills + MCP + swarm 预设（MIT） | 2026-10-04 |
| [Fincept-Corporation/FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal) | 32,196 | 全球 | C++/Qt6 开源金融终端，内建数十个 AI Agent，支持多家券商 | 2026-10-01 |
| [hsliuping/TradingAgents-CN](https://github.com/hsliuping/TradingAgents-CN) | 32,149 | A 股 | TradingAgents 中文化：Tushare/AkShare + 中文报告 + A 股监管语境 | — |
| [virattt/dexter](https://github.com/virattt/dexter) | 27,642 | 美股 | "金融版 Claude Code"：单 Agent 自主深度研究 | 2026-09-24 |
| [HKUDS/AI-Trader](https://github.com/HKUDS/AI-Trader) | 22,650 | 多资产 | Agent 原生交易平台：任意 Agent（OpenClaw/nanobot/Claude Code…）用 `SKILL.md` 注册后实盘 + 跟单 | 2026-06 |
| [NoFxAiOS/nofx](https://github.com/NoFxAiOS/nofx) | 12,997 | 多市场 | 自托管 LLM 交易终端：模型决策 + **Go 运行时强制硬风控**，9 家交易所 | 2026-10 |
| [ValueCell-ai/valuecell](https://github.com/ValueCell-ai/valuecell) | 11,019 | 加密/美股 | 社区多 Agent 金融工作台（Binance/OKX/Hyperliquid）+ 桌面端 | 2026-03（节奏放缓） |
| [TraderAlice/OpenAlice](https://github.com/TraderAlice/OpenAlice) | 7,208 | 全资产 | "一个人的华尔街"：研究→入场→持有→退出，**Trading-as-Git 审批流** | 2026-10 |
| [The-Swarm-Corporation/AutoHedge](https://github.com/The-Swarm-Corporation/AutoHedge) | 6,236 | 加密/美股 | Swarms 框架做自主对冲基金 | — |
| [Lumiwealth/lumibot](https://github.com/Lumiwealth/lumibot) | 2,104 | 美股/期权 | AI Agent 团队 + 12 家券商 + 真回测 | 2026-10 |
| [ginlix-ai/LangAlpha](https://github.com/ginlix-ai/LangAlpha) | 1,802 | 美股 | LangGraph 多 Agent 投研工作台（学习友好） | — |
| [TauricResearch/Trading-R1](https://github.com/TauricResearch/Trading-R1) | 500 | 美股 | TradingAgents 团队的 R1 终端 | 2025-09-15，**终端未发布** |

### 3.2 中国市场（A 股/港股）

| 项目 | ★ | 定位 |
|---|---:|---|
| [shy3130/tick-stock-panel](https://github.com/shy3130/tick-stock-panel) | 5,567 | 自托管 A 股「选股 + 监控 + 回测」量化工作台，LLM 定制策略与复盘 |
| [simonlin1212/TradingAgents-astock](https://github.com/simonlin1212/TradingAgents-astock) | 3,617 | A 股多 Agent 投研（龙虎榜/游资/解禁），7 位分析师辩论 |
| [TNT-Likely/PanWatch](https://github.com/TNT-Likely/PanWatch) | 1,988 | 盯盘侠：A/港/美 AI 盯盘监控 + 持仓分析 + PWA |
| [qusong0627/QuantMind](https://github.com/qusong0627/QuantMind) | 1,703 | "量化大脑"开源版：深度集成 Qlib + RD-Agent 因子演化 |
| [jundizhou/easy-stock](https://github.com/jundizhou/easy-stock) | 1,266 | A 股行情分析 / AI 投研 / 盘后复盘桌面工作台 |
| [finvfamily/finshare](https://github.com/finvfamily/finshare) | 928 | 金融数据获取工具库（国产数据源聚合） |
| [KylinMountain/TradingAgents-AShare](https://github.com/KylinMountain/TradingAgents-AShare) | 851 | 15 Agent A 股投研，支持 OpenClaw / Claude Code 集成 | 
| [YoungCan-Wang/WyckoffTradingAgent](https://github.com/YoungCan-Wang/WyckoffTradingAgent) | 733 | 威科夫量价分析 Agent（A/港/美），CLI + Web + MCP |
| [tickflow-org/tickflow](https://github.com/tickflow-org/tickflow) | 606 | A 股/美/港专业行情 API + Python SDK |
| [electkismet/eltdx](https://github.com/electkismet/eltdx) | 554 | 通达信行情协议 Rust 库 + MCP，快照/分时/逐笔 |
| [ZhuLinsen/alphasift](https://github.com/ZhuLinsen/alphasift) | 368 | AI 原生全市场选股引擎（LLM 排序 + 风险打分） |
| [HKUSTDial/DeepEar](https://github.com/HKUSTDial/DeepEar) | 286 | 顺风耳：多模态新闻 + 价格信号追踪（港科大） | 

> 本节项目多为 2026 年新建（`created:>2026-01-01`），星标增长快但**缺少长期验证**，选型时按"早期项目"对待。

### 3.3 学术基准与评测（做严肃验证必看）

| 项目 | ★ | 说明 | push |
|---|---:|---|---|
| [HKUSTDial/DeepFund](https://github.com/HKUSTDial/DeepFund) | 299 | NeurIPS'25 多 Agent 基金投资基准 + 排行榜（[论文](https://arxiv.org/abs/2505.11065)） | 2026-03 |
| [ulab-uiuc/live-trade-bench](https://github.com/ulab-uiuc/live-trade-bench) | 168 | **实盘**评测（非回测）交易 Agent | 2026-02 |
| [Open-Finance-Lab/AgenticTrading](https://github.com/Open-Finance-Lab/AgenticTrading) | — | 学术框架 + 数据集 | — |
| [LuckyOne7777/LLM-Trading-Lab](https://github.com/LuckyOne7777/LLM-Trading-Lab) | — | ChatGPT 管理真实小盘组合 6 个月的**前瞻性审计**（含 40 页评估报告），难得不吹牛的实证 | — |

> 看严肃结论时，优先读 DeepFund / live-trade-bench / LLM-Trading-Lab 的评测方法，而不是看项目的收益截图。

---

## 4. ④ 2026 最大变量：Agent Harness + Skills + MCP

这是本次调研**最重要的发现**，也是与本项目（AiTradingAutomation 基于 DSH）最相关的一层。

### 4.1 OpenClaw（"龙虾"）现象

| 项目 | ★ | 说明 | push |
|---|---:|---|---|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | **391,330** | 跨平台自主 Agent Harness，"The lobster way 🦞"（中文圈称"龙虾"） | 2026-10 |
| [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) | 52,954 | OpenClaw Skills 合集：**5,400+ skills** 分类整理 | 2026-10 |
| [HKUDS/nanobot](https://github.com/HKUDS/nanobot) | 48,787 | 超轻量自托管个人 Agent 框架 | 2026-10 |
| [zhayujie/CowAgent](https://github.com/zhayujie/CowAgent) | 47,229 | 开源个人 AI 助理 / Agent Harness | 2026-10 |

**现实检验（很重要）**：[中国证券报 2026-03-20 实测报道](https://finance.cnr.cn/cjtt/yw/20260320/t20260320_527557241.shtml)（[新浪转载](https://finance.sina.com.cn/roll/2026-03-20/doc-inhrqptc8223341.shtml)）指出用"龙虾"类 Agent 选股的明确缺陷：

- **数据不准**：Skill 从公开渠道取到的行情/财务指标与真实数据存在较大偏差；
- **工程不稳**：云端版本（Kimi Claw / Art Claw / JVS Claw）安装专业 Skill 失败或报 `IM runtime dispatch timed out after 300000ms`；
- **成本高**：全市场筛选消耗大量 token；
- **权限风险**：Agent 需要整机 Full Disk Access，ClawHub 类技能市场存在供应链与泄露风险；
- **责任真空**：AI 从工具变成执行者后，传统"谁下单谁负责"的问责逻辑失效。

多位私募受访者表示**暂不接入**，只在选股筛选、回测等有限环节试用（[证券时报 2026-03-19](https://stcn.com/article/detail/3685006.html)）。

**结论**：Agent Harness 是**分发层红利**，不是**alpha 来源**。它降低"让模型用上工具"的门槛，不降低"数据正确 + 风控硬约束 + 避免过拟合"的门槛。

### 4.2 量化能力正在被 Skill 化

| 生态 | ★ | 规模与性质 | push |
|---|---:|---|---|
| [quantskills/quantskills](https://github.com/quantskills/quantskills) | 2,384 | PandaAI 发起的量化 Skill/Agent 目录：**214 个资产、10 大类**，快照 2026-10-04 | 2026-10 |
| [himself65/finance-skills](https://github.com/himself65/finance-skills) | 3,372 | 多资产金融分析 Skill 包 | 2026-10 |
| [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) | 2,945 | 美股投资 Skill 包（分析/宽度/regime/期权/Alpaca 组合） | 2026-10 |
| [LLMQuant/awesome-trading-agents](https://github.com/LLMQuant/awesome-trading-agents) | 874 | Agents · MCP · Skills 三层索引（LLMQuant 社区） | — |
| [okx/agent-skills](https://github.com/okx/agent-skills) | 184 | 交易所官方 Skill（让 LLM Agent 直接交易/查仓） | 2026-09 |
| [the-beating-light-of-the-nail/awesome-dsh-plugin-stock](https://github.com/the-beating-light-of-the-nail/awesome-dsh-plugin-stock) | 13 | **DSH 股票/量化插件垂直清单：24 个已核验插件**（含 2 个可触达真实账户的） | 2026-08 |

**QuantSkills 目录里最值得抄的是"验证类" Skill**（第 07 类，12 项）：前视/数据泄漏检测、幸存者偏差审计、Purged K-Fold + Embargo + CPCV、PBO/DSR 过拟合评估、IC 衰减与半衰期、预测校准审计、回测假设九维审计。这类**自我证伪工具**恰是绝大多数 LLM 炒股项目的空白。

只做研究、不碰订单的设计也成了社区共识——DSH 清单里 24 个金融插件中只有 2 个触达真实账户，其余明确标注 read-only。

### 4.3 MCP：数据与交易接口的新标准

| 类型 | 代表 |
|---|---|
| 官方一手 | [alpacahq/alpaca-mcp-server](https://github.com/alpacahq/alpaca-mcp-server)、[krakenfx/kraken-cli](https://github.com/krakenfx/kraken-cli)（内嵌 50 个 SKILL.md）、[okx/agent-trade-kit](https://github.com/okx/agent-trade-kit)、[Polymarket/agent-skills](https://github.com/Polymarket/agent-skills)、[QuantConnect/mcp-server](https://github.com/QuantConnect/mcp-server) |
| 零售券商 | [ariadng/metatrader-mcp-server](https://github.com/ariadng/metatrader-mcp-server)（MT5，★818）、[rcontesti/IB_MCP](https://github.com/rcontesti/IB_MCP)（IBKR） |
| 数据 | [LLMQuant/data-mcp](https://github.com/LLMQuant/data-mcp)（5 万条 wiki + 1.2k 论文 + 美股 OHLCV + 宏观 + 13F）、[stefanoamorelli/sec-edgar-mcp](https://github.com/stefanoamorelli/sec-edgar-mcp)、[guangxiangdebizi/FinanceMCP](https://github.com/guangxiangdebizi/FinanceMCP)（Tushare/Binance）、[aahl/mcp-aktools](https://github.com/aahl/mcp-aktools)（AKShare） |
| 索引 | [BlockRunAI/awesome-finance-mcp](https://github.com/BlockRunAI/awesome-finance-mcp) |

**收敛趋势**：数据接入 = MCP；能力分发 = Skills；实盘接口 = Alpaca / IBKR / Hyperliquid / 各交易所官方 MCP。多 Agent 编排 = LangGraph 领先、CrewAI 紧随。

---

## 5. 平台与数据层（A 股落地必看）

### 5.1 实盘通道

| 工具 | 定位 | 2026 门槛（券商顾问口径，**务必自行核实**） |
|---|---|---|
| **miniQMT** | 轻量可编程，Python 直连 | 近 20 交易日日均资产 10 万；6 个月交易经验；风险测评 C3+ |
| **PTrade** | 券商托管策略（基础散户版） | 同上 10 万日均 |
| **QMT 完整版** | 专业终端 | 普遍 30–50 万起；高频极速柜台 200 万+ |
| **第三方平台** | 同花顺 / 文华 / 开拓者 | 视券商与品种 |

> 来源：[叩富网券商顾问文章 2026-05-22](https://licai.jiantou8.com/user/guide_view_3380733.html)，属**营销口径**，各券商差异大。

### 5.2 在线平台与数据源

- **在线量化平台**：聚宽 JoinQuant、米筐 RiceQuant（开源 rqalpha）、掘金量化、BigQuant、优矿
- **期货/衍生品**：天勤 TqSdk、vnpy 生态、WonderTrader
- **开源数据源**：[akshare](https://github.com/akfamily/akshare) ★22,825、[tushare](https://github.com/waditu/tushare) ★15,443、[yfinance](https://github.com/ranaroussi/yfinance) ★25,427、[finshare](https://github.com/finvfamily/finshare) ★928、[eltdx](https://github.com/electkismet/eltdx) ★554（通达信协议 + MCP）
- **数据基础设施**：[man-group/ArcticDB](https://github.com/man-group/ArcticDB) ★2,530、[quantstats](https://github.com/ranaroussi/quantstats) ★7,678、[alphalens](https://github.com/quantopian/alphalens) ★4,461

### 5.3 必读索引（awesome 列表）

| 列表 | ★ | 适合 | push |
|---|---:|---|---|
| [wilsonfreitas/awesome-quant](https://github.com/wilsonfreitas/awesome-quant) | 29,960 | 经典量化库总目录 | 2026-10 |
| [paperswithbacktest/awesome-systematic-trading](https://github.com/paperswithbacktest/awesome-systematic-trading) | 14,546 | 系统化交易（策略/书/教程） | 2026-09 |
| [georgezouq/awesome-ai-in-finance](https://github.com/georgezouq/awesome-ai-in-finance) | 6,639 | AI/深度学习 + 金融 | 2026-09 |
| [thuquant/awesome-quant](https://github.com/thuquant/awesome-quant) | 5,663 | 中文 Quant 资源索引 | 2026-09 |
| [wangzhe3224/awesome-systematic-trading](https://github.com/wangzhe3224/awesome-systematic-trading) | 5,234 | 系统化交易（英文社区版） | 2026-10 |
| [LLMQuant/quant-wiki](https://github.com/LLMQuant/quant-wiki) | 4,275 | 量化知识开源与汉化 | 2026-04 |
| [Barca0412/Introduction-to-Quantitative-Finance](https://github.com/Barca0412/Introduction-to-Quantitative-Finance) | 1,792 | 多因子框架开源教程（中文，含 LLM/Agent 论文收录） | — |

---

## 6. 怎么选：按角色的推荐组合

| 角色 | 推荐组合 |
|---|---|
| **A 股散户（研究为主）** | akshare/tushare + vectorbt（研究）+ tick-stock-panel 或 TradingAgents-CN（投研）+ miniQMT（若实盘） |
| **美股/全球（研究 + 小实盘）** | OpenBB（数据）+ TradingAgents 或 ai-hedge-fund（投研）+ Alpaca MCP（执行）+ QuantSkills 验证类 Skill |
| **加密** | ccxt + freqtrade/jesse（策略）+ nofx / Hyper-Alpha-Arena（LLM 决策）+ 硬风控层 |
| **因子研究（严肃）** | Qlib + RD-Agent（因子演化）+ AlphaPurify（清洗/回测）+ 自实现 Purged CV / PBO |
| **学术/评测** | DeepFund + live-trade-bench + LLM-Trading-Lab 的方法论 |
| **想做 Agent 产品** | 选一个 Harness（OpenClaw / DSH / Claude Code）+ 能力做成 Skills + 数据/交易走 MCP |

### 反模式（踩坑清单）

1. ❌ 多个交易 Agent 同控一个账户 → 信号冲突、重复下单（必须有 cycle id / 决策指纹 / 幂等）
2. ❌ 把免费数据源（yfinance/网页抓取）当生产唯一数据源 → 限流、错数、无 SLA
3. ❌ 让 LLM 直接算数（估值、DCF、指标）→ 幻觉不可接受，数值必须走确定性代码
4. ❌ 只有回测没有验证 → 需 PIT/前视检查、Purged K-Fold、PBO/DSR、Walk-forward，并与 paper trading 并行
5. ❌ 把"研究框架"直接上实盘 → TradingAgents 等定位是研究，缺风控与异常处理
6. ❌ 用 Agent 收益截图当证据 → 看 DeepFund / live-trade-bench 的评测方法

---

## 7. 与本项目（AiTradingAutomation 2.1.3）的对照

本项目已是"TradingAgents 式多角色 + 确定性硬风控 + 纸面撮合"的组合，方向与 2026 主流一致。差异点：

| 维度 | 本项目现状 | 生态对标 | 可借鉴 |
|---|---|---|---|
| 多角色投研 | 13 角色五阶段委员会 | TradingAgents（7+ 角色）/ AI-Trader / Vibe-Trading | 角色数与阶段划分已属第一梯队；可用 TradingAgents 的**多空 + 风控辩论**输出结构做对照测试 |
| 风控 | Python 授权书 + 硬风控 + 纸面撮合 | nofx（Go 运行时强制硬风控）、OpenAlice（Trading-as-Git 审批） | 与 nofx/OpenAlice 的"模型决策 / 运行时强制"分层理念一致；可借鉴其**审批留痕**表达 |
| 数据 | 自建行情抓取 | akshare/tushare/finshare/eltdx、FinanceMCP、data-mcp | 可把数据层**同时暴露为 MCP**，让外部 Agent 复用 |
| 能力分发 | DSH Skills + 固定工作流 | OpenClaw 5,400+ skills、QuantSkills 214 资产、awesome-dsh-plugin-stock 24 个 DSH 金融插件 | 本项目可发布自有 Skill 包，进入 DSH 插件生态获取用户 |
| 因子与验证 | 六因子加权评分 | Qlib/RD-Agent、AlphaGPT、QuantSkills 第 07 类验证 Skill | **最大空白**：缺前视/PIT、Purged CV、PBO/DSR、IC 衰减等自我证伪工具 |
| 回测 | 以模拟撮合为主 | vectorbt / nautilus_trader / rqalpha | 可接入 vectorbt 做快速策略验证，避免"只有模拟盘" |
| 市场覆盖 | A/港/美/ETF 四市场 | 多数开源项目只覆盖单一市场 | 四市场统一是差异化优势 |

**三条最值得做的**：

1. **补验证层**（对标 QuantSkills 第 07 类）：把前视检查、Purged K-Fold、DSR/PBO、IC 衰减做成项目内 Skill，让每次分析产出可被证伪的证据。
2. **把引擎能力 MCP/Skill 化**：数据、选股、风控校验以 MCP 工具 + Skill 形式对外，既服务自身对话，也能进入 DSH/OpenClaw 生态。
3. **对标评测**：用 DeepFund / live-trade-bench 的评测思路，对"13 角色委员会"与传统六因子基线做**同数据同预算**对照实验，而不是只展示单次分析结论。

---

## 8. 数据来源与口径说明

**GitHub API 实测（2026-10-05）**：`★` 与 `push` 均来自 `api.github.com`。注意：

- 部分仓库已改名，API 返回规范名，例：`OpenBB-finance/OpenBB` → `openbq-org/OpenBB` ★73,851；`robcarver17/pysystemtrade` → `pst-group/pysystemtrade`；`QUANTAXIS/QUANTAXIS` → `yutiansut/QUANTAXIS`
- 星标会被营销、教程、"fork 即部署"放大。典型：`daily_stock_analysis` ★65,899 / **fork 54,970**——其用法是 fork 到自己的仓库后用 GitHub Actions 定时跑，**fork 数不代表代码质量，更不代表收益**
- 星标高 ≠ 可实盘。本清单中定位为"研究/学习/教学"的项目占大多数
- 表内 `—` 表示本次未实测该项目最近提交时间，不代表项目停滞；`push` 超过 6 个月的建议自行复核

**公开报道与文档**（外部内容，仅作数据引用）：

- [央广网/中国证券报：亲测"龙虾"选股，以为能"躺赢" 现实却并不容易（2026-03-20）](https://finance.cnr.cn/cjtt/yw/20260320/t20260320_527557241.shtml)
- [证券时报：从"被动响应"到"自主执行"，OpenClaw 对私募圈的改造正在发生（2026-03-19）](https://stcn.com/article/detail/3685006.html)
- [金融 AI 生态全景 · 全局对比矩阵（2026-05-09）](https://morsewayne.github.io/programming_journey/docs/ai/fin-ai-ecosystem/06-comparison.html)
- [叩富网：2026 年 QMT/PTrade 开通条件全解（2026-05-22，券商营销口径）](https://licai.jiantou8.com/user/guide_view_3380733.html)
- [QuantSkills 目录（214 资产，快照 2026-10-04）](https://github.com/quantskills/quantskills)
- [Awesome DSH Stock & Finance Plugins（24 个已核验 DSH 金融插件）](https://github.com/the-beating-light-of-the-nail/awesome-dsh-plugin-stock)
- [Awesome Trading Agents（Agents/MCP/Skills 三层索引）](https://github.com/LLMQuant/awesome-trading-agents)

**复核建议**：星标与维护状态持续变化，建议每季度用 GitHub API 重新采集；任何要引入的项目，先看其最近 3 个月提交、issue 响应与 license。

---

*文档性质：生态调研，随外部项目变化而失效，不构成投资建议。*
