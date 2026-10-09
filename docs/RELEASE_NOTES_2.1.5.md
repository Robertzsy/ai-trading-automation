# Investment Auto v2.1.5

[中文](#中文) | [English](#english)

## 中文

Dashboard 现在可以从组合直接查看单只持仓的历史变化，Windows 安装包与源码同步为 2.1.5。项目首页的真实港股用例也增加了图形展示。

### 持仓与个股联动

- 按 A 股、港股、美股、ETF 切换账户，各币种独立展示权益、盈亏、资金使用率与组合分布。
- 点击持仓或组合分布，查看所选股票的历史日线；支持近 1 月、近 3 月、近 1 年，以及走势线和 K 线。
- 可切换成本线、成交量、MA20 与模拟成交日期，并使用鼠标、触摸或键盘查看交易日。
- 显示行情来源、复权状态、最后交易日与备用来源提示；账户估值时间与历史收盘价分别标注。
- 缺失价格不补造估值，行情失败或不足时可重试。运行状态、轮次报告与市场早报保留。

### 首页用例与版本修复

- 中英文 README 增加真实轮次概览、五阶段耗时与四只股票结论图；流程、原始记录与判断依据可展开查看。
- 图中使用原案例的 4 只股票、38 个子代理、185 条证据和 0 个失败；全部 HOLD，本轮未提交交易。
- 17 处版本声明统一为 2.1.5；npm 锁文件的两处根版本纳入校验，第三方依赖版本保持不变。
- 浏览器验收适配新版 Dashboard，并修复临时 Chrome profile 不生效的问题。

### 验证与下载

- Python 381 项、Node 插件 38 项、Windows 桌面 20 项通过；6 项在线行情测试跳过。
- 已安装产品的真实持仓日线、四市场切换、持仓联动、设置及分析中心验收通过；1280px / 360px 布局已验证。
- 此前包含新版 Dashboard 的本机覆盖升级保留全部 78,691 个用户数据文件；本次安装包重新构建为 2.1.5。
- Windows 10/11 x64：`InvestmentAuto-Setup-x64.exe`；使用同目录的 `.sha256` 文件核对校验值。

已知的生产依赖告警和便携 ZIP 缺少应用目录的问题仍记录在 [仓库检查报告](https://github.com/Robertzsy/ai-trading-automation/blob/dsch/2.0/docs/REPOSITORY_AUDIT_2026-10-09.md)；本次同步的是正式安装器。

## English

The Dashboard now links portfolio holdings to each stock's history. The Windows installer and source both use version 2.1.5. The real Hong Kong case on the project homepage also gains visual summaries.

### Linked holdings and stock history

- Switch between A-shares, Hong Kong, U.S. equities and ETFs, with account metrics and allocation in each market's native currency.
- Select a holding or allocation item to inspect daily history, one-month / three-month / one-year ranges, and line or candlestick views.
- Toggle cost basis, volume, MA20 and simulated fill dates; inspect trading dates with pointer, touch or keyboard controls.
- Disclose source, price adjustment, final trading date and fallback use. Account valuation time remains separate from historical closes.
- Missing prices do not produce invented valuations. Failed or insufficient history can be retried. Runtime status, reports and market news remain available.

### README visuals and version fixes

- Bilingual figures show the real round's metrics, stage timings and stock decisions; readers can expand the workflow, original record and detailed evidence.
- The recorded case uses 4 stocks, 38 subagents, 185 evidence items and 0 failures. All stocks HOLD; no trades were submitted.
- All 17 version declarations agree on 2.1.5, including both lockfile root fields, without changing third-party dependency versions.
- Browser acceptance covers the new Dashboard and uses an isolated temporary Chrome profile.

### Validation and downloads

- 381 Python, 38 plugin and 20 desktop tests passed; six online market-data checks skipped.
- Installed-product acceptance covered real holding history, market and holding selection, settings, the Analysis Centre and 1280px / 360px layouts.
- The preceding local Dashboard upgrade preserved all 78,691 user-data files. This installer is rebuilt with version 2.1.5.
- Windows 10/11 x64: `InvestmentAuto-Setup-x64.exe`; compare its checksum with the accompanying `.sha256` file.

Existing production-dependency alerts and the incomplete portable ZIP remain documented in the [repository audit](https://github.com/Robertzsy/ai-trading-automation/blob/dsch/2.0/docs/REPOSITORY_AUDIT_2026-10-09.md). This release distributes the full installer.
