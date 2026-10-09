# AI Trading Automation 2.1.3 更新说明

[中文](#中文) | [English](#english)

## 中文

本次更新聚焦**界面体验**与**分析流程的稳定性**：界面重新设计，分析中心与
Dashboard 重构，并修复了若干影响日常使用的问题。持仓与历史报告完整保留。

### 界面焕新

- **更清晰的层级**：卡片、浮层、弹窗分四级，主次一目了然。
- **更大的字号**：原先最小的正文偏小，本次整体放大；关键数字单独加强。
- **无障碍达标**：所有文字对比度均达到 WCAG AA 标准，渐变背景上的文字也逐色标校验。
- **统一图标**：内置 14 个图标，替换原先的字符占位符。
- **固定浅色主题**：这是有意为之的选择——固定后配色与对比度更可控，
  不会再因系统主题切换而出现难以阅读的配色。

### 分析中心：按钮在前，进度可见

- **三个一键入口移到最上方**，尺寸与样式统一：「一键全流程」为主操作，
  另两个为次要操作，一眼看出该点哪个。
- **去掉重复按钮**：原先「开始分析」与「一键分析指定股票」其实是同一个动作，
  现在只保留一个。
- **预检收拢为一行**：平时显示「预检 5/5 就绪」；一旦有未满足的条件会自动展开
  说明原因，不会出现"按钮灰着却不知道为什么"。
- **进度可视化**：以进度环与进度条呈现，每个阶段的完成情况与耗时都看得见。
- **报告正式排版**：轮次报告按标题、列表、引用、表格呈现，不再是原始文本。
- **可以停止分析**：停止会真正中断正在运行的任务，而不是只改变显示状态。

### Dashboard：一眼看清四个市场

- **改为竖长条卡片**：四个市场并排、每张卡纵向排列，信息更紧凑，不再有大片空白。
- **新增持仓明细表**：代码、名称、持仓、成本、现价、市值、盈亏、幅度一表呈现。
- **涨跌颜色符合各市场习惯**：A 股与港股为**红涨绿跌**，美股为**绿涨红跌**。
- **「宏观日报」更名为「市场早报」**：副标题标注「每交易日 08:00 采集」，
  内容按正式排版呈现，不再显示 Markdown 符号。

### 导航更简洁

「分析流程」不再单独占一个页签，其内容（完整流程图、各阶段进度、流程验收）
已并入「分析中心」——启动分析的按钮本来就在那里。左侧导航由 5 项精简为 **4 项**。

### 稳定性修复

- **修复分析轮次启动即失败**。此前发起分析后界面会显示「子任务 0/0、证据 0」，
  看起来像数据丢失，实际是轮次在任何子任务启动前就中断了。
- **修复工作流状态一直显示「等待中」**，即使轮次已经完成。
- **修复持仓明细表列与数据不对应**（表头与数据行存在一列错位）。
- **修复停止分析后仍显示「运行中」**。
- **修复偶发的数据写入失败**，提升在 Windows 上的写入稳定性。
- **提升启动速度**：未配置可选数据库时不再拖慢启动，并明确提示而非静默等待。

### 升级提示

- 本次以更新包方式发布，**安装程序将在下一版提供**。
- **持仓与历史报告完整保留**，本次更新不涉及数据格式变更。
- 若发现「模型选择」与设置页不一致，请在设置页重新选择并保存一次。
- 若你更换过 API Key，建议在设置页重新保存，以确保所有分析路径都使用最新密钥。

---

## English

This update focuses on the **interface experience** and the **reliability of the
analysis pipeline**: the UI has been redesigned, the Analysis Centre and
Dashboard rebuilt, and several day-to-day problems fixed. Holdings and historical
reports are preserved.

### A redesigned interface

- **Clearer hierarchy:** cards, overlays, and dialogs now sit on four distinct
  levels, so what matters reads first.
- **Larger type:** the smallest body text was too small and is now larger
  throughout, with key figures emphasised separately.
- **Accessible contrast:** every text colour meets WCAG AA, including text over
  gradients, which is checked stop by stop.
- **Consistent icons:** 14 built-in icons replace the previous character
  placeholders.
- **Light theme only:** a deliberate choice — pinning the theme keeps colour and
  contrast predictable instead of becoming unreadable when the system theme flips.

### Analysis Centre: actions first, progress visible

- **The three one-click entries moved to the top** and share one size and style:
  Run Full Pipeline is the primary action, the other two are secondary, so which
  one to press is obvious.
- **The duplicate button is gone.** "Start analysis" and "Analyse these symbols"
  were the same action rendered twice; only one remains.
- **Pre-flight is a single line.** It reads "Pre-flight 5/5 ready" at rest and
  expands on its own when a condition is unmet, so a disabled button always
  explains itself.
- **Progress is visual:** rings and bars show each stage's completion and elapsed
  time.
- **Reports are typeset:** round reports render as headings, lists, quotes and
  tables instead of raw text.
- **A round can be stopped**, and stopping actually interrupts the running work
  rather than only changing its displayed state.

### Dashboard: all four markets at a glance

- **Taller, narrower cards:** four markets side by side, each stacked vertically,
  so the information is dense instead of leaving half of every card empty.
- **New holdings table:** code, name, quantity, cost, last price, market value,
  P&L and percentage in one table.
- **Trend colours follow each market's own convention:** red-for-up in mainland
  China and Hong Kong, green-for-up in the US.
- **Macro Daily is now Market Brief**, subtitled "collected 08:00 each trading
  day" and typeset properly instead of showing Markdown symbols.

### Simpler navigation

Analysis Workflow no longer occupies its own tab. Its content — the full pipeline
diagram, per-stage progress, and the acceptance checklist — now lives inside the
Analysis Centre, where the button that starts a round already was. The left
navigation went from five entries to **four**.

### Reliability fixes

- **Fixed analysis rounds failing at startup.** Starting a round used to show
  "0/0 agents, 0 evidence", which looked like data loss but was a round dying
  before any subagent started.
- **Fixed workflow status stuck on "pending"** even after a round had finished.
- **Fixed the holdings table columns not matching the data** (a one-column offset
  between header and body).
- **Fixed a stopped round still showing as "running".**
- **Fixed occasional write failures**, improving stability on Windows.
- **Faster startup** when the optional database is not configured: it now fails
  fast and says so instead of waiting silently.

### Upgrade notes

- Shipped as an update package; **the installer will follow in the next release.**
- **Holdings and historical reports are preserved**; this update changes no data
  formats.
- If the selected model disagrees with the Settings page, re-select and save it
  once.
- If you have changed your API key, save it again in Settings so every analysis
  path uses the current key.
