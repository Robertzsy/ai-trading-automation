# Investment Auto v2.1.4

[中文](#中文) | [English](#english)

## 中文

Investment Auto 2.1.4 是一次聚焦**界面体验**与**分析链路可靠性**的更新。界面按设计令牌重新构建，分析中心与 Dashboard 重做，并修复了若干影响日常使用的问题。持仓与历史报告完整保留。

### 界面焕新

- **更清晰的层级**：卡片、浮层、弹窗分四级，主次一目了然。
- **更大的字号**：原先最小的正文偏小，本次整体放大；关键数字单独加强。
- **无障碍达标**：所有文字对比度达到 WCAG AA 标准，渐变背景上的文字逐色标校验。
- **统一图标**：内置 14 个图标，替换原先的字符占位符。
- **固定浅色主题**：这是有意为之的选择——固定后配色与对比度更可控，不会因系统主题切换而出现难以阅读的配色。

### 分析中心：按钮在前，进度可见

- **三个一键入口移到最上方**，尺寸与样式统一：「一键全流程」为主操作，另两个为次要操作。
- **去掉重复按钮**：原先「开始分析」与「一键分析指定股票」其实是同一个动作，现在只保留一个。
- **预检收拢为一行**：平时显示「预检 5/5 就绪」，一旦有未满足的条件会自动展开说明原因。
- **进度可视化**：以进度环与进度条呈现，每个阶段的完成情况与耗时都看得见。
- **报告正式排版**：轮次报告按标题、列表、引用、表格呈现，不再是原始文本。
- **可以停止分析**：停止会真正中断正在运行的任务。

### Dashboard：一眼看清四个市场

- **改为竖长条卡片**：四个市场并排、每张卡纵向排列，信息更紧凑。
- **新增持仓明细表**：代码、名称、持仓、成本、现价、市值、盈亏、幅度一表呈现。
- **涨跌颜色符合各市场习惯**：A 股与港股为**红涨绿跌**，美股为**绿涨红跌**。
- **「宏观日报」更名为「市场早报」**：副标题标注「每交易日 08:00 采集」，内容按正式排版呈现。

### 导航更简洁

「分析流程」不再单独占一个页签，其内容（完整流程图、各阶段进度、流程验收）已并入「分析中心」。左侧导航由 5 项精简为 **4 项**。

### 稳定性修复

- **修复分析轮次启动即失败**：此前界面会显示「子任务 0/0、证据 0」，看起来像数据丢失，实际是轮次在任何子任务启动前就中断了。
- **修复工作流状态一直显示「等待中」**，即使轮次已完成。
- **修复持仓明细表列与数据不对应**。
- **修复停止分析后仍显示「运行中」**。
- **修复偶发的数据写入失败**，提升 Windows 上的写入稳定性。
- **提升启动速度**：未配置可选数据库时不再拖慢启动，并明确提示而非静默等待。

### 从 2.1.3 到 2.1.4

- `2.1.3`：完成 IA 全权限自维护、schema 兼容、重试竞态、Windows 原子写入与安装器修复。
- `2.1.4`：完成界面设计令牌化与视觉重做、分析中心与 Dashboard 重构、分析流程页签合并，并修复轮次启动失败、持仓列错位、状态不更新等问题。

### 验证

- Python 376 项、Node 插件 28 项测试通过。
- 浏览器冒烟门禁全通过：约 490 个文本元素对比度零违规，导航项、入口尺寸、预检摘要、持仓表列对齐均纳入门禁。
- 插件组合校验通过，图标与 Markdown 生成器均为最新。

### 下载与校验

- Windows 10/11 x64：`InvestmentAuto-Setup-x64.exe`
- 大小：183,429,298 bytes
- SHA-256：`9E447B2219926EEC07EE7D99CE2E9B13BACB9FF6D36C05503265E468A5D199B9`

> Investment Auto 只支持模拟交易，不连接真实券商。IA 的系统级完整权限不会绕过用户批准、成交幂等、模拟交易边界和 Python 硬风控。

## English

Investment Auto 2.1.4 focuses on the **interface experience** and the **reliability of the analysis pipeline**. The UI was rebuilt on a design-token layer, the Analysis Centre and Dashboard were redone, and several day-to-day problems were fixed. Holdings and historical reports are preserved.

### A redesigned interface

- **Clearer hierarchy:** cards, overlays and dialogs now sit on four distinct levels.
- **Larger type:** the smallest body text was too small and is now larger throughout, with key figures emphasised separately.
- **Accessible contrast:** every text colour meets WCAG AA, including text over gradients, checked stop by stop.
- **Consistent icons:** 14 built-in icons replace the previous character placeholders.
- **Light theme only:** a deliberate choice — pinning the theme keeps colour and contrast predictable.

### Analysis Centre: actions first, progress visible

- **The three one-click entries moved to the top** and share one size and style: Run Full Pipeline is primary, the other two secondary.
- **The duplicate button is gone.** "Start analysis" and "Analyse these symbols" were the same action rendered twice.
- **Pre-flight is a single line**, reading "Pre-flight 5/5 ready" at rest and expanding by itself when a condition is unmet.
- **Progress is visual:** rings and bars show each stage's completion and elapsed time.
- **Reports are typeset** as headings, lists, quotes and tables instead of raw text.
- **A round can be stopped**, and stopping actually interrupts the running work.

### Dashboard: all four markets at a glance

- **Taller, narrower cards:** four markets side by side, each stacked vertically.
- **New holdings table:** code, name, quantity, cost, last price, market value, P&L and percentage.
- **Trend colours follow each market's own convention:** red-for-up in mainland China and Hong Kong, green-for-up in the US.
- **Macro Daily is now Market Brief**, subtitled "collected 08:00 each trading day" and typeset properly.

### Simpler navigation

Analysis Workflow no longer occupies its own tab; its content now lives inside the Analysis Centre. The left navigation went from five entries to **four**.

### Reliability fixes

- **Fixed analysis rounds failing at startup:** the UI used to show "0/0 agents, 0 evidence", which looked like data loss but was a round dying before any subagent started.
- **Fixed workflow status stuck on "pending"** even after a round had finished.
- **Fixed the holdings table columns not matching the data.**
- **Fixed a stopped round still showing as "running".**
- **Fixed occasional write failures**, improving stability on Windows.
- **Faster startup** when the optional database is not configured.

### From 2.1.3 to 2.1.4

- `2.1.3`: IA self-maintenance, workflow schema compatibility, retry races, Windows atomic writes, installer fixes.
- `2.1.4`: design-tokenised UI and visual rebuild, Analysis Centre and Dashboard rework, workflow tab merged, plus fixes for round startup failure, holdings column offsets and stale status.

### Validation

- 376 Python tests and 28 Node plugin tests passed.
- The browser smoke gate passes: around 490 text elements with zero contrast violations, with nav entry count, entry sizing, pre-flight summary and holdings column alignment all gated.
- Plugin composition validates; the icon and Markdown generators are current.

### Download and checksum

- Windows 10/11 x64: `InvestmentAuto-Setup-x64.exe`
- Size: 183,429,298 bytes
- SHA-256: `9E447B2219926EEC07EE7D99CE2E9B13BACB9FF6D36C05503265E468A5D199B9`

> Investment Auto is paper-trading only and does not connect to a live broker. Full IA system authority does not bypass user approval, execution idempotency, the paper-only boundary, or deterministic Python risk controls.
