# 共享研究数据与新闻接口

固定投资工作流先按股票采集行情快照、历史、基本面和新闻，再把同一份材料交给技术、基本面、新闻及情绪四类角色。公司财务数字优先由数据接口提供；新闻使用宿主配置的原生联网搜索服务。正常工作流无需用户另行提供金融数据 API Key。

## 首选与备用

每个请求依序执行，首个可用来源整包返回，不跨来源拼接，也不为补齐可选指标调用备用源。

| 市场 | 首选 | 备用顺序 |
| --- | --- | --- |
| A 股 `cn` | AKShare 东方财富财务指标 | AKShare 新浪财务摘要 → BaoStock 盈利能力 |
| 港股 `hk` | AKShare 东方财富财务指标 | 当前没有独立备用；失败时明确返回缺口 |
| 美股 `us` | SEC Company Facts | AKShare 东方财富财务指标 |
| ETF `etf` | 公司基本面不适用 | 不调用公司财报接口 |

首选超时、网络错误、返回空数据、没有有效报告期、报告过期或缺少币种/营收/利润，才启动下一来源。最新报告必须包含营收以及净利润或归母净利润；负利润有效。年报报告期距今超过 550 天、其他报告超过 300 天视为过期。未来报告期和未来披露日期不进入资料包。ROE、负债率、经营现金流、EPS 或披露日期缺失仅列入 `gaps`，不触发补充采集。

每次取数总预算默认 45 秒，按剩余来源分配时间。AKShare/BaoStock 在独立进程中调用，超时终止进程后才进入备用。成功结果缓存 6 小时，失败结果仅缓存 30 秒，按市场和股票隔离；同一进程内并发读取同一股票只执行一次取数。缓存位于数据目录下的 `runtime/data/fundamentals-v1/`。

AKShare 的接口与字段说明见[官方股票数据文档](https://akshare.akfamily.xyz/data/stock/stock.html)，BaoStock 盈利能力字段见[官方文档](https://www.baostock.com/mainContent?file=seasonProfit.md)。SEC Company Facts 提供公开 XBRL JSON，无需认证或 API Key；网络拒绝访问时仍按上述顺序降级。[SEC API 说明](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

## 基本面格式

引擎接口：`GET /api/research/fundamentals?market=cn&symbol=600519`。DSH 工具：`investment_fundamentals`，参数为 `market`、`symbol`。引擎接口沿用本地 API 的访问控制。

| 层级 | 字段及含义 |
| --- | --- |
| 资料包 | `schema_version`、`policy`、`market`、`symbol`、`primary_provider`、实际 `provider`、`status`、`degraded`、`fetched_at`、`cached`、`data_version`、`attempts`、`gaps`、`records` |
| 报告 | `period_start`、`period_end`、`period_type`、`disclosed_at`、`currency`、`source_url`、`metrics` |
| 指标 | `value`、`unit`、`source_field`；TTM 指标另带 `period_type: "ttm"` |

最多提供 12 条报告记录，报告期由新到旧排序；BaoStock 备用只读取最新已发布报告。基本面资料以财务指标为主，不代表完整三张财务报表。`status` 为 `ok`、`unavailable` 或 ETF 的 `not_applicable`；所有来源失败时 `unavailable: true`，不得以零值替代缺失。

日期统一为 `YYYY-MM-DD`，采集时间为带时区的 ISO 时间。报告类型区分 `annual`、`quarter`、`ytd`、`unknown`，缺失起始日或披露日期保留 `null`。A 股中期指标保持累计口径；港股未明确的报告类型保持未知；SEC 不混合不同申报编号、币种或起止期间。

金额使用来源报告币种的基本货币单位，例如 `CNY`、`USD`；每股指标为 `CNY/share` 等；百分比使用 `percent`，例如 `7.46` 表示 `7.46%`，倍数使用 `ratio`。不根据上市市场猜测财报币种。归母利润与总净利润、每股经营现金流与总经营现金流使用不同指标名；原字段始终保留，分析时仍须核对 ROE 等指标的具体计算口径。

`attempts` 记录已实际调用的来源、选择或失败状态、耗时及失败原因；`degraded` 标记是否使用了备用。`data_version` 根据事实内容生成，采集时间变化不会单独改变版本。HTTP 200 表示接口完成处理，调用者必须同时检查资料包的 `status`，不能把所有来源失败视为取得有效财报。

## 新闻规范

每只股票发起一次共享检索任务，覆盖近 14 天的公司公告、公司及行业新闻、政策、资金和情绪风险，并优先原始报道或公司/交易所公告。A 股、港股和 ETF 使用上海日期，美股使用纽约日期。一次检索任务可能包含宿主联网 provider 内部的多次模型或搜索调用，不等同于一次计费请求；它继续使用已有 DeepSeek 联网配置。

新闻资料包包含 `schema_version`、`market`、`symbol`、`provider`、`collected_at`、`requested_window`、`status`、`queries`、`items`、`errors`、`warnings`、`usage`。每条新闻统一为：

| 字段 | 含义 |
| --- | --- |
| `article_id` | 市场、股票及规范 URL 生成的稳定新闻条目标识；不是工具证据登记 ID |
| `title`、`summary`、`summary_kind` | 标题与摘要；区分 `source_excerpt`（来源节选）、`model_summary_unverified`（联网模型归纳）和 `missing` |
| `source_url`、`canonical_url`、`source_host` | 原始引用、用于去重的 URL、来源域名；仅去掉跟踪参数和片段，不改写原始引用 |
| `published_at`、`publication_date_raw`、`date_quality` | 标准日期、原始日期、日期质量；相对日期或无法确认的日期保持未知 |
| `collected_at`、`time_scope` | 采集时间；区分 `recent`、`background`、`unknown` |
| `model_published_at` | 联网模型报告的日期线索，不自动成为已确认发布日期 |
| `evidence_kind`、`full_text_verified`、`relevance_verified` | 区分搜索节选和模型归纳；全文、相关性没有验证时保持 false |
| `event_types`、`related_article_ids` | 根据观察到的标题与摘要分类，关联同标题、同日期报道；保留原引用，不证明事件已覆盖完整 |

相同规范 URL 去重，重复项可补充更完整节选、缺失标题或日期。未来日期和非法链接被排除；窗口之外的报道只作为背景。模型仍负责核验来源、日期和标的相关性，不得把未知日期当近期事实，也不得把搜索节选称作已读全文。

各角色复用共享材料。只有关键资料缺失、过期或存在明确矛盾时，才按具体原因定向补查；可选财务指标缺失仅披露缺口。这个流程规范没有额外启用强制查询次数预算，补查仍使用既有工具能力。

产品配置通过原生 DeepSeek 联网 provider 保留真实响应 usage。设置 `IA_ENRICH_RESEARCH_NEWS=1` 可试验真实搜索链接对应的摘要与日期线索，默认不改原检索提示词。模型新增的链接不进入资料包；摘要不是原文核验，模型日期不自动升级为确证。`coverage.confirmed_absence` 保持 false，未检出某类新闻不能写成已确认无事件。其他 provider 缺少 usage 时仍明确记录未知。

## 专用角色、计算与补证

`researchRoles` 将工作流子角色设为研究专用。技术角色读取行情与历史，基本面角色读取财务，新闻与情绪角色读取联网资料；经理默认消费上游报告。子角色首个请求起使用固定系统指令与相应工具范围。主助手仍保留维护工具，模型和输出上限不因此改变。

`investment_research_evidence` 在研究子角色内部提供完整共享资料，`kind` 支持 `snapshot`、`history`、`fundamentals`、`news`、`calculations`、`analyses`、`portfolio`、`mandate`。股票角色限定本股票，组合角色可读取本轮目标。`analyses` 返回未节选的上游报告。必要新闻补证指定 `kind=news`、`symbol`、`query`、具体 `reason`；服务共享同一请求并更新资料 `revision` 和登记证据，后续读取取得当前版本。直接新闻检索也进入共享包。

`deduplicateResearch` 独立启用本轮只读请求复用与并发合并，不自动启用强制次数预算。参数、证券、市场、版本和窗口不同不能误复用；相同请求连续失败两次后仅短时抑制 30 秒。单个读者取消不会取消其他读者仍需的请求。数据层复用统计与供应商模型缓存命中率分别计量。

额外的登记证据强制校验独立配置为 `strictEvidence` / `IA_VERIFY_RESEARCH_EVIDENCE`，默认关闭，保持 2.2.0 在 policy=off 时的实际行为。角色自身的结构化输出 schema、基础研究完整性检查和引擎交易硬风控仍生效；开启额外校验时，登记 ID、证券归属和引用来源必须匹配，修正次数有界。开启专用角色不能同时暗中开启这一实验门禁。

程序计算 MA5、MA20 成交量比，明确窗口包含当日，以及分母、日期、单位和公式。财务同比要求可比较的报告类型、币种、指标单位；累计转单季要求声明累计起点和相同口径的上一季度。TTM 与报告期数字不混用，输入不足不生成派生值，跨币种估值不假定汇率。原始记录始终可读取。

## 简洁论据试验

`researchBriefs` / `IA_RESEARCH_BRIEFS=1` 是独立的输出契约试验，默认关闭。使用时保持 `researchPolicy=off`，并关闭 `researchRoles`、`deduplicateResearch`、`uniformOutput`；不同时修改模型、思考档位、角色数或输出上限。

基础角色提交结论、推导、反证、失效条件和事实引用；共享事实引用为 `F-市场-证券-文档#/相对字段路径`，文档限 `snapshot`、`history`、`fundamentals`、`news`。路径相对于对应文档内部，新闻例为 `#/items/0/title`，不是 `#/news/items/0/title`；新闻条目的 `article_id` 不是此契约来源 ID。程序仅展开实际存在且归属本股票的原始值与日期、单位、币种、报告期等元数据；路径错误或未知引用停止阶段，不猜测修复事实。补查事实单独保存，不自动声称已核验。

后续角色收到所引用事实的一份完整副本，并保留自身论证与风险意见；不截断反证或失效条件。人可读报告由程序展开 `research_briefs` 归档，包含共享事实及各角色原始结果，无需额外模型成文。归档失败必须停止此试验，避免续跑或报告丢失论据。检查点记录契约版本；同一轮次不能切换契约，账户/授权书变化或完整阶段归档缺失时须开启新轮次。

该开关不承诺降低推理 token、费用或提高供应商缓存命中率，须比较完整轮次的实际用量与分析质量后再决定是否启用。默认研究提示与资料表示保持已发布的简洁版本；详细新闻 provenance 和预投递程序计算仅在专用角色试验中提供，原始资料与完整计量仍可追溯。

## 模型调用计量

轮次的 `model_usage` 包含常规 Chat、原生联网、标题等辅助调用的实际 usage。按通道、模型、阶段和角色汇总；重试及取消后的已消耗 usage 仍计入，幂等请求 ID 防止上报重试重复累计。推理 token 包含在输出内，不再次相加。缺失 usage 或缓存字段保持未知，不能按零计费。

`request_coverage=observed_requests` 表示已观察请求的统计范围，不等于供应商账单核销。输入命中率为命中输入 / 全部输入；缓存数据不完整时不给出完整命中率。`telemetry` 显式记录待上报数和进程级归属缺口。费用状态为 `not_reconciled`，应按实际调用时模型及峰谷价格另行核对。接口与账本不保存模型提示词、凭据或账户载荷。

## 配置、归档与发行

桌面及 headless 默认保持 `sharedResearch: true`，新增角色、去重和摘要生成作为独立试验开关，默认关闭：分别设置 `IA_RESEARCH_ROLES=1`、`IA_DEDUPLICATE_RESEARCH=1`、`IA_ENRICH_RESEARCH_NEWS=1` 试验；设为 0 回退。`researchPolicy` 仍为 off，未强制启用次数预算。完整回到旧采集路径还需 `IA_SHARED_RESEARCH=0`、`IA_CACHE_OPTIMIZATION=0`、`IA_RESEARCH_TOOL_POLICY=off`。联网 provider 与调用计量默认保留，记录实际 usage 不额外发起模型请求，不改变审批边界。开关扩大前须比较实际未命中量、费用与质量，工具减少或请求去重本身不证明已降本。

基础研究启动前，完整资料通过 `/api/analysis/runs/archive` 保存到轮次归档的 `shared_research` 阶段，便于追溯来源选择、日期和缺口。归档失败会进入轮次警告。模型提示词只限制冗长文本，保持合法完整 JSON；新闻引用 URL、证据 ID 和意见条目保留，完整输入仍在归档中。

`GET /api/analysis/evidence?cycle_id=...&stage=shared_research` 沿用本地 API 访问控制，仅接受命名的研究阶段。续跑恢复完整共享包与阶段归档，不重新采集后混入旧裁决；必要完整归档缺失时要求新轮次。逐请求 usage 账本位于 `runtime/analysis_runs/usage/`，不作为单独分析轮次展示。

发行依赖固定为 AKShare `1.19.1`、BaoStock `0.9.4`，打包脚本检查二者能从捆绑 Python 独立导入。新增源文件和依赖声明需要随发行包一起更新；源码修改不会自动替换用户已安装的桌面端。

SEC 可选 `IA_SEC_USER_AGENT` 仅用于声明应用身份，不是 API Key。默认使用项目名称及项目 URL；部署方可按 SEC 的访问说明提供自己的应用联系信息。港股当前缺少独立备用源，上游不可用时需要明确披露资料不足。

AKShare 使用 MIT 代码许可，BaoStock 发布元数据标注 BSD；库的代码许可与上游数据的使用、展示及再分发条件需要分别遵守。[AKShare 项目](https://github.com/akfamily/akshare)、[BaoStock 发布信息](https://pypi.org/project/baostock/)
