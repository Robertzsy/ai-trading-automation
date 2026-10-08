# 值得学习的优秀项目：按"可偷的设计"排序

- 姊妹文档：[RESEARCH_QUANT_PROJECTS_2026.md](RESEARCH_QUANT_PROJECTS_2026.md)（生态全景与星标实测）
- 采集日期：2026-10-05，结论来自直接阅读各项目 README / 官方文档，非二手简介
- 本文只回答一个问题：**抛开类别和星标，哪些项目的设计值得我们抄，抄什么，别抄什么**

---

## 0. 我凭什么说它"优秀"

不是星标高，也不是功能多。四条硬标准：

1. **解决了别人假装不存在的难题**——时点正确性、验证泄漏、审批留痕、责任归属；
2. **有可复用的接口契约**——schema / digest / fail-closed，而不是"调用方自己小心"；
3. **诚实**——把失败结果、已知限制、风险写在 README 里，而不是只放收益曲线；
4. **工程纪律**——幂等、可恢复、可审计、安全姿态（尤其是本地服务）。

按这四条筛下来，**S 级只有 5 个**，其中对本项目价值最高的是第 2 个。

---

## S 级 ①：TradingAgents —— "时点正确性"的工程范式

[TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) ★109.8k ｜ 读 [README](https://github.com/TauricResearch/TradingAgents) 的 *Fundamentals as filed*、*Persistence and Recovery*、*Evaluating decisions over time*、*Reproducibility* 四节

多智能体辩论只是它的表层。真正值钱的是它把**"回测里绝不能看到未来"**这件抽象原则，落成了可执行的机制：

| 机制 | 具体做法 | 为什么值得抄 |
|---|---|---|
| **As-filed 财务数据** | 美国公司财报走 SEC EDGAR，**按申报日**而非报告期取数：苹果 2008 年总资产当时申报为 **$39.6B**，2010 年被重述为 $36.2B，所以一个定在两者之间的运行读到的是 **$39.6B** | 这是"时点正确性（PIT）"最直观的教科书案例。绝大多数项目直接用最新财报跑历史回测，等于偷看未来 |
| **数据"扣留"语义** | 拿不到时点证据的数据源（Yahoo 财报、内部人交易）在历史运行中显式标记为 **withheld**，而不是照常返回或用近似值 | 把"不知道"表达成一种状态，而不是默默降级 |
| **决策记忆 + 结算闭环** | 每次决策写入 memory log；后续运行在分析师工作期间**结算**已过持有期的旧决策，取真实收益与**对区域基准的超额**，生成一段反思，供组合经理读取 | 让系统对自己的历史判断负责，是"agent 会学习"唯一不玄学的实现方式 |
| **一次跑一格的可恢复评测** | `run_backtest` 在 ticker × date 网格上跑同一流水线，按评级分组统计真实 alpha；`run_id` 相同则跳过已跑格子，中断可续 | 评测要被当成**可恢复的批处理**，不是一次性脚本 |
| **确定性身份解析 + 价格锚定** | 分析对象由 ticker 在任何 agent 运行前确定性解析；技术分析对价格/指标的断言必须锚定到已验证快照 | 直接修掉了"两次运行分析成不同公司""编造价格"这两类经典故障 |
| **诚实的可复现性章节** | 明确区分"不会变的"（身份解析、数据快照）与"一定会变的"（模型采样、实时新闻/社交流），并说明推理模型基本忽略 temperature | 敢在 README 里承认不可复现，是成熟度信号 |
| **组合上下文的三态** | `positions: []`（空仓）≠ 不传（不知道持仓）；不传时绝不会被当作空仓 | 这种"缺失值语义"的严谨度，值得全项目对齐 |

**不要抄的**：把它的回测数字当策略业绩——它自己写明"回测结果不保证匹配任何已公布数字，请当研究脚手架"；它没有真正的撮合与硬风控，风控环节是"讨论出来"的，最终只是送到模拟交易所。

---

## S 级 ②：skill-ml-purged-cv —— "自我证伪"范式（**对本项目价值最高**）

[quantskills/skill-ml-purged-cv](https://github.com/quantskills/skill-ml-purged-cv) ｜ MIT ｜ v0.9.0

这是本次调研里**唯一一个把"如何证明自己不成立"做成了产品**的项目。它反复强调一句话：

> 它解决的核心问题不是"替用户找到一个赚钱模型"，而是回答：**当前模型分数是否因为未来信息、标签区间重叠、全局预处理或错误的验证切分而虚高。**

直接可搬的九个设计：

1. **Information Interval（信息区间）**：每条样本显式表示为 `[最早使用信息时间, 确定标签所需最后时间]`，Purge 按**真实区间重叠**删除训练样本，而不是"前后固定删 5 行"。
2. **三种隔离不混用**：Purge（区间重叠）、Embargo（测试块之后的额外隔离）、Walk-Forward 的 Pre-Test Gap（测试块**之前**）严格区分建模，不互相顶替。
3. **Panel Session Group**：同一交易日的所有资产样本**整体**进训练侧或测试侧，禁止按行号切分——这是 A 股/多标的场景最常见的隐形泄漏。
4. **Fold-Local 强制重拟合**：标准化、PCA、特征筛选、目标编码、超参搜索都必须在每折训练侧重做；接口要求传**工厂函数**，复用已 fit 的对象直接中止评估。
5. **PIT 与血缘 fail-closed**：每个特征必须声明来源、版本、digest、转换参数、lookback、**实际可用时间**、是否依赖目标；缺声明就拒绝运行，而不是猜列名含义。
6. **五种互补证据，各自声明"不能证明什么"**：Purged K-Fold（模型比较）/ CPCV（多路径分布与排名稳定性）/ Causal Walk-Forward（因果顺序）/ Governed Holdout（冻结后只开一次）/ Temporal Forward Evidence（**预测先登记、标签后结算**）。
7. **三态验收门，绝不互相替代**：`validation_tool_status`（链路是否形成证据，PASS ≠ 赚钱）→ `research_gate_status`（预注册门槛：PBO ≤ 0.20、DSR ≥ 0.95、CPCV 尾部与 Walk-Forward Sharpe 不为负）→ `production_gate_status`（是否有一次性未触碰 Holdout）。
8. **门槛运行前冻结**：README 明写"不得在看到结果后调低门槛或扩展候选集合，再把同一段历史称为确认样本"——并把 `acceptance` 结论连同 `reason_codes` 一起输出。
9. **把 FAIL 写进证据**：它的 PandaData 五年验收（88,417 条观测 / 81 个资产 / 1,174 个 Session，三通道区间重叠为 0，最终 252 Session Holdout 只跑一次）作为结构证据通过；而 TSMOM 策略选择 benchmark 的结论是 **PBO 0.0714 通过、DSR 0.7553 未达 0.95 → 策略验收 FAIL，验证工具 PASS**。

第 9 条最难得：**一个项目公开自己基准测试的失败结论，这比任何收益截图都有说服力。**

**不要抄的**：别把它的 `leakage_control_status=PASS` 当成"模型有效"；它自己也说"不验证外部数据供应商时间戳声明的真实性""不执行上传代码""不含真实滑点与容量"。

---

## S 级 ③：nofx —— "模型提议，运行时否决"范式

[NoFxAiOS/nofx](https://github.com/NoFxAiOS/nofx) ★13.0k ｜ AGPL-3.0 ｜ 读 README 的 *The model proposes. The runtime disposes.*

一句话设计哲学，却是本项目最该对齐的一条：**把不可协商的约束放在模型够不到的地方（Go 运行时），而不是写在提示词里。**

它的硬约束清单可以直接当风控 checklist 用：

| 约束 | 说明 |
|---|---|
| 仓位限制 | 最大并发持仓数、名义金额按权益比例封顶、**每个标的一个仓位** |
| 杠杆钳制 | 在**订单定量阶段**强制上限，与模型请求无关 |
| 交易所侧保护 | 每次开仓后**立即**在交易所挂止损/止盈，不依赖模型后续动作 |
| 回撤自动平仓 | 盈利仓位从峰值回吐过多即平 |
| 交易节流 | 最短持有时间、同标的再入冷却、每轮/每小时开仓次数上限 |
| Safe mode | 模型连续失败则**阻止新开仓**，直到模型恢复 |
| 启动前检查 | 模型可用性、钱包余额、策略、交易所余额全部通过才允许启动 |

另外两个细节：每条决策都保存**模型完整推理**（"没有持仓是没有书面记录的"）；多个模型并排跑公开排行榜，**按真实收益**排名并按模型归属。

**不要抄的**：加密永续/高杠杆的默认参数与"autopilot"默认开启的产品取向；AGPL-3.0 对商业闭源不友好。

---

## S 级 ④：RD-Agent + Qlib —— "研究闭环自动化 + 数据层"范式

[microsoft/RD-Agent](https://github.com/microsoft/RD-Agent) ★14.8k（MIT）· [microsoft/qlib](https://github.com/microsoft/qlib) ★49.1k（MIT）

**RD-Agent 值得学的是闭环的抽象**：把研发拆成 `R`（提出假设/想法）与 `D`（实现并执行），再从真实执行反馈中进化——不是"让 LLM 写个策略"，而是"假设 → 代码 → 执行 → 指标反馈 → 下一轮"。它的量化场景做的是**因子与模型联合优化**，并以成本为约束做对比（项目自报：成本 < $10，ARR 约为基准因子库 2 倍、因子数减少 70% 以上——**自报数据，需自行复现**）。

**Qlib 值得学的是数据层工程**（这是它比"又一个回测框架"值钱的地方）：

- **Point-in-Time 数据库**（2022-03 就发布了），从根上解决"用最新数据回测历史"；
- **两级缓存**：表达式缓存 + 数据集缓存，同一取数任务 **7.4s**，对比 HDF5 184.4s / MySQL 365.3s / InfluxDB 368.2s——把"研究慢"当成一等工程问题；
- **数据健康检查脚本**（`check_data_health.py`：缺失数、价格/成交量异常跳变阈值）；
- **配置驱动工作流**（`qrun workflow.yaml` 一把梭：建数据集→训练→回测→评估），且同时提供"用代码自定义流程"的等价路径；
- **明确的 break-change 与数据免责**（官方数据集曾因数据安全策略临时下线，README 直接说明并给社区替代源）。

**额外必读：RD-Agent 的 Web UI 安全清单**——这一节对任何自研本地服务（包括本项目引擎 HTTP API）都是现成模板：

- 服务**默认只绑 127.0.0.1**，但仍强制要求 `UI_SERVER_AUTH_TOKEN`，**localhost 也不例外**（理由：恶意网页可以请求浏览器本地服务）；
- token 通过一次跳转写入 HTTP-only、same-site cookie，API 客户端用 `Authorization: Bearer`；**拒绝在未设置 token 时启动**；
- 任务会生成并执行代码 → 明确要求 worker 跑在**最小权限、受限出网、不挂 host 凭据/Docker socket** 的环境里；
- 上传文件名后缀黑名单 `.py/.pyc/.pyo/.pkl/.pickle/.dill`，**拒绝 URL 与服务器路径文本输入**（去掉"任意拉取"入口）；
- 历史 trace 的 pickle 反序列化**默认关闭**（`UI_LOAD_LEGACY_PICKLE_TRACES=false`），需要显式开启并配套信任假设；
- CORS 精确白名单（禁通配符），Cookie 认证的 POST 必须有同源或白名单内 `Origin`/`Referer`，**缺失来源直接拒绝**；上传目录与 trace 目录分离，避免被当作持久化 trace 反序列化。

---

## S 级 ⑤：OpenClaw / DSH / Claude Code 的 "SKILL.md 即接口" —— 分发层范式

[openclaw/openclaw](https://github.com/openclaw/openclaw) ★391k · [HKUDS/AI-Trader](https://github.com/HKUDS/AI-Trader) ★22.7k · [QuantSkills](https://github.com/quantskills/quantskills) ★2.4k · [awesome-dsh-plugin-stock](https://github.com/the-beating-light-of-the-nail/awesome-dsh-plugin-stock)

AI-Trader 的接入方式是今年最优雅的分发设计，全文只有一个动作：

```
Read https://ai4trade.ai/SKILL.md and register.
```

**任何** Agent（OpenClaw / nanobot / Claude Code / Codex / Cursor）读一个 SKILL.md 就完成注册、拿能力、接数据。配套工程细节同样值得抄：skill 定义与 OpenAPI 规格分仓（`skills/` + `docs/api/openapi.yaml`）；**用户面服务与后台 worker 分离**（价格、结算、情报任务跑在带外，页面与健康检查保持响应）；数据源**降级链**（Alpha Vantage 缺失/限流/无数据时自动回退 yfinance）。

QuantSkills 则示范了**目录治理**：214 个资产、10 大类、每个资产必须声明数据、假设、参数、限制与风险边界，并明确"目录快照不代表质量背书、收益承诺或生产可用性保证"。

**不要抄的**：全盘权限（OpenClaw 类 Agent 需要整机 Full Disk Access，[中国证券报实测](https://finance.cnr.cn/cjtt/yw/20260320/t20260320_527557241.shtml)已暴露数据与供应链风险）。能力可以外放，**权限不能**。

---

## A 级：值得挑着抄的六个

| 项目 | 抄什么 | 具体机制 |
|---|---|---|
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) ★63.9k | **纸面账本 + 审批展示** | 每个 fund 的每次 session 追加进**哈希链账本**（`~/.hedge-fund/paper/<name>/`），NAV 是连续业绩而不是每次重置；执行前弹出审批，**展示即将执行的确切决策**；内置 kill switch（暂停/恢复）；`mandates/` 只放策略与节奏**不含标的**，标的每次回测再选；API key 首次使用时才索取 |
| [TraderAlice/OpenAlice](https://github.com/TraderAlice/OpenAlice) ★7.2k | **研究即仓库 + 审批即 Git** | Workspace 就是目录 + Git 仓库（可检视/编辑/备份）；研究产出可转成带排期的 **Issue**（晨扫、周度宏观、论点复核）；Inbox 里每条报告都能**回到产出它的那次 Session**；交易走 **Trading as Git**：Agent 起草操作 → 人审批后提交执行；凭据静态加密；README 顶部 CAUTION 明确 beta 与实盘风险 |
| [QLib 数据层](https://github.com/microsoft/qlib) | PIT + 缓存 + 数据体检 | 见 S 级 ④ |
| [nautilus_trader](https://github.com/nautechsystems/nautilus_trader) ★29.6k | 生产级引擎的确定性事件驱动分层 | Rust 内核 + Python 接口，消息总线/Actor 模型，回测与实盘同一套代码路径 |
| [OpenBB](https://github.com/openbq-org/OpenBB) ★73.9k | 数据平台抽象 | 把上百个数据源统一成同一套 provider 接口与标准化模型，是"数据层不写死在业务里"的成熟样板 |
| [HKUSTDial/DeepFund](https://github.com/HKUSTDial/DeepFund) · [ulab-uiuc/live-trade-bench](https://github.com/ulab-uiuc/live-trade-bench) · [LLM-Trading-Lab](https://github.com/LuckyOne7777/LLM-Trading-Lab) | 评测方法论 | 多 Agent 基金投资的统一竞技场 + 排行榜；**实盘**（非回测）评测；ChatGPT 管真实小盘组合 6 个月的前瞻审计 + 40 页评估报告 |

---

## 情报源（长期订阅，而非"学代码"）

[wilsonfreitas/awesome-quant](https://github.com/wilsonfreitas/awesome-quant) ★30.0k · [LLMQuant/awesome-trading-agents](https://github.com/LLMQuant/awesome-trading-agents) ★874（Agents/MCP/Skills 三分法） · [LLMQuant/quant-wiki](https://github.com/LLMQuant/quant-wiki) ★4.3k · [QuantSkills](https://github.com/quantskills/quantskills)（214 资产目录，按 10 类索引） · [awesome-dsh-plugin-stock](https://github.com/the-beating-light-of-the-nail/awesome-dsh-plugin-stock)（24 个已核验 DSH 金融插件）

---

## 反面特征：看到这些就该警惕

1. 只有收益曲线，没有**样本外/成本/PIT**说明；
2. 让 LLM 直接算估值、DCF、指标数值；
3. 提示词里写"不要超过 X% 仓位"，而没有代码层强制；
4. 无审批、无 kill switch、无幂等（多个 Agent 同控一账户会重复下单）；
5. README 没有限制声明与风险免责；
6. 数据源单一且免费（限流、错数、无 SLA）；
7. 评测只有"一次运行的一个结论"，没有网格、没有基线对比、没有失败样本。

---

## 给本项目的落地清单（照抄即可，含验收标准）

| # | 动作 | 抄自 | 验收标准 |
|---|---|---|---|
| 1 | 给每条决策记录加**结算闭环**：持有期到点后拉真实收益 + 对基准超额，生成反思并进入下一轮上下文 | TradingAgents memory log | 同一标的第 N+1 次分析能引用第 N 次的实际结果与教训 |
| 2 | 把六因子评分纳入**信息区间 + Purged K-Fold + Embargo** 验证，隔离 A 股 T+1 与同日多标的泄漏 | skill-ml-purged-cv | 输出 `information_interval_overlap = 0`；报告里同时给出 unsafe 与 safe 通道的分数差 |
| 3 | 预注册研究门槛并**冻结**：PBO、DSR、CPCV 尾部、Walk-forward regret | skill-ml-purged-cv | 门槛写在运行前；给出 `research_gate_status` 与 `reason_codes`，**允许并公布 FAIL** |
| 4 | 把风控从提示词迁到**引擎侧不可绕过层**，补齐 nofx 清单里缺的项：同标的再入冷却、每轮开仓次数上限、连续失败 safe mode、启动前 preflight | nofx | 构造一次"模型请求超限杠杆/超限仓位"的测试，断言被引擎拒绝并留痕 |
| 5 | 纸面账户改为**哈希链账本**，执行前展示确切决策供审批，补 kill switch | ai-hedge-fund | 篡改任一历史 session 可被检测；NAV 可连续追溯而非重置 |
| 6 | 引擎 HTTP API 套用 RD-Agent 安全姿态：**本地也强制 token**、拒绝路径/URL 输入、上传扩展名黑名单、CORS 精确白名单、上传目录与数据目录分离 | RD-Agent Web UI | 无 token 启动即失败；伪造 Origin 的 POST 被拒 |
| 7 | 把数据/选股/风控校验做成 **Skill + MCP**，并提供"一句话注册"入口 | AI-Trader / DSH 插件生态 | 外部 Agent 读一个 SKILL.md 即可调用，无需改本仓库代码 |

> 优先级建议：**2、3 先做**（成本最低、直接提升结论可信度），**4、5 次之**（安全与可审计），**7 最后**（分发的前提是能力已经被验证过）。

---

*文档性质：设计与工程范式调研，不构成投资建议；所引项目自报数据（如 RD-Agent 的收益/成本对比）均需自行复现。*
