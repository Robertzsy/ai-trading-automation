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
| `title`、`summary` | 搜索返回的标题和节选，不另行生成事实摘要 |
| `source_url`、`canonical_url`、`source_host` | 原始引用、用于去重的 URL、来源域名；仅去掉跟踪参数和片段，不改写原始引用 |
| `published_at`、`publication_date_raw`、`date_quality` | 标准日期、原始日期、日期质量；相对日期或无法确认的日期保持未知 |
| `collected_at`、`time_scope` | 采集时间；区分 `recent`、`background`、`unknown` |
| `evidence_kind`、`full_text_verified`、`relevance_verified` | 固定为搜索节选、全文未核验、标的相关性待核验 |

相同规范 URL 去重，重复项可补充更完整节选、缺失标题或日期。未来日期和非法链接被排除；窗口之外的报道只作为背景。模型仍负责核验来源、日期和标的相关性，不得把未知日期当近期事实，也不得把搜索节选称作已读全文。

各角色复用共享材料。只有关键资料缺失、过期或存在明确矛盾时，才按具体原因定向补查；可选财务指标缺失仅披露缺口。这个流程规范没有额外启用强制查询次数预算，补查仍使用既有工具能力。

宿主原生联网服务目前不提供响应 usage，新闻包明确记录 `usage.available: false`。共享检索可减少重复取证，但不能据此推算联网总费用或宣称已达到模型缓存命中率目标。

## 配置、归档与发行

桌面及 headless 源码配置均启用 `sharedResearch: true`。可用 `IA_SHARED_RESEARCH=0` 关闭这一开关；完整回到旧采集路径还需要 `IA_CACHE_OPTIMIZATION=0`、`IA_RESEARCH_TOOL_POLICY=off`。取证强制预算与统一模型输出保持独立开关，不能将格式统一等同于启用这些试验。

基础研究启动前，完整资料通过 `/api/analysis/runs/archive` 保存到轮次归档的 `shared_research` 阶段，便于追溯来源选择、日期和缺口。归档失败会进入轮次警告。模型提示词只限制冗长文本，保持合法完整 JSON；新闻引用 URL、证据 ID 和意见条目保留，完整输入仍在归档中。

发行依赖固定为 AKShare `1.19.1`、BaoStock `0.9.4`，打包脚本检查二者能从捆绑 Python 独立导入。新增源文件和依赖声明需要随发行包一起更新；源码修改不会自动替换用户已安装的桌面端。

SEC 可选 `IA_SEC_USER_AGENT` 仅用于声明应用身份，不是 API Key。默认使用项目名称及项目 URL；部署方可按 SEC 的访问说明提供自己的应用联系信息。港股当前缺少独立备用源，上游不可用时需要明确披露资料不足。

AKShare 使用 MIT 代码许可，BaoStock 发布元数据标注 BSD；库的代码许可与上游数据的使用、展示及再分发条件需要分别遵守。[AKShare 项目](https://github.com/akfamily/akshare)、[BaoStock 发布信息](https://pypi.org/project/baostock/)
