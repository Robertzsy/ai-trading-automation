# AI Trading Automation v2.3.0

## 中文

本次更新聚焦于提升选股针对性、提高研究结论的可执行性，并显著降低分析成本。

### 主要更新

- **提升选股针对性**：在动量、趋势、流动性、估值、量能、低波动的基础上，新增相对强度、放量突破、加速度与风险调整动量因子；补充成长型候选，并按“潜力分 55% + 质量分 45%”合成候选排序，减少结果过度偏向低估值、低波动的防御型标的。
- **提高研究结论的可执行性**：新增预期收益与下行评估、条件观察（WATCH，含触发价与有效期）及现金部署规则。现金比例偏高时，研究建议会更积极地给出配置方案；执行仍受策略授权书、置信度与硬风控约束。分析报告同步增加决策摘要、数据口径说明与历史决策参考，证据、来源、缺失项与反证保留更完整。
- **显著降低分析成本**：通过共享研究资料、计划缓存与查询缓存，减少重复检索和重复上下文。内部对照中，单轮请求数下降 29%，同价格口径成本下降 28%；2 只标的对照成本下降 40%，证据覆盖保持 95% 以上。
- **投资总览界面更新**：新增账户权益状态带、持仓明细、走势图切换与轮次时间线，市场、周期、图表类型切换更顺畅。
- **稳定性改进**：修复搜索工具输出校验异常、强制部署后报告归档不一致、筛选预取与缓存相关问题。

> 以上成本与证据数据来自内部对照测试，不是平台账单核销；研究结论仅用于模拟交易参考，不构成投资建议。

### 升级说明

- 支持 Windows 10/11 x64。
- 下载 `AiTradingAutomation-Setup-x64.exe`，覆盖安装即可升级，账户、持仓、配置与历史记录保留。
- 校验文件为同名 `.sha256` 文件。

## English

This release focuses on improving screening relevance, making research conclusions more actionable, and significantly reducing analysis cost.

### Highlights

- **Improved screening relevance**: added relative strength, volume breakout, acceleration and risk-adjusted momentum to the existing momentum, trend, liquidity, valuation, volume and low-volatility factors. Growth candidates are supplemented and candidate ranking is refined with a 55% potential / 45% quality blend, reducing the previous bias toward defensive, low-valuation names.
- **More actionable research**: added expected-return and downside assessment, conditional watch (WATCH with trigger price and expiry) and cash-deployment rules. When cash is high, research suggestions lean toward deploying capital; execution remains subject to the mandate, confidence threshold and hard risk controls. Reports now include a decision summary, data-scope notes and historical decision references, with evidence, sources, gaps and counterarguments preserved more completely.
- **Significantly lower analysis cost**: shared research material, plan cache and query cache reduce duplicate retrieval and repeated context. In internal comparisons, requests per round fell by 29% and cost fell by 28% at the same price basis; a two-symbol comparison reduced cost by 40% while maintaining evidence coverage above 95%.
- **Dashboard refresh**: added an account equity status band, holdings detail, chart switching and a round timeline; market, period and chart-type switching is smoother.
- **Reliability fixes**: search-tool output validation, archive consistency after forced deployment, and screening prefetch/cache issues.

> Cost and evidence figures come from internal comparisons, not provider billing reconciliation. Research output is for simulation only and is not investment advice.

### Upgrade

- Windows 10/11 x64.
- Run `AiTradingAutomation-Setup-x64.exe` to install or upgrade in place. Accounts, positions, settings and history are preserved.
- The matching `.sha256` file provides the checksum.
