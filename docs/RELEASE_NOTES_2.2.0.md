# AI Trading Automation v2.2.0

[中文](#中文) | [English](#english)

## 中文

本版本包含两批独立改动：**共享研究数据与更精简的模型输入**，以及**命名统一**。两者分两笔提交，便于分别回退与归因。

### ① 共享研究数据与更精简的模型输入

- 基本面与新闻研究数据在窗口会话与自主轮次之间共享，同一份资料不再重复抓取、重复投喂模型。
- 新增研究数据契约与策略层：来源切换、单位与日期规范、配置开关、使用限制集中定义。
- 证据以检查点落盘，下游角色只接收压缩摘要，减少重复的模型输入。
- 依赖新增 AKShare、BaoStock；发行打包脚本增加两者的导入检查。

### ② 命名统一（内部标识与显示名）

- 技术标识统一到 `ai-trading-automation`：Python 包与命令、npm 作用域（5 个插件）、C# 程序集与命名空间、安装器脚本与产物名、图标与单实例标识。
- 环境变量统一到 `AI_TRADING_AUTOMATION_*` / `ATA_ACCESS_TOKEN` / `X-ATA-Token`；引擎与桌面壳**仍接受旧名**，桌面壳对子进程同时写入新旧两套变量 —— 已有快捷方式与自建脚本不受影响。
- 品牌显示名统一为 `AI Trading Automation`；官方全称（中/英）作为文档标题，技术标识作为副标题。
- **刻意不改**：本地开发目录、安装目录与数据目录（用户数据零迁移）、DSH profile/preset 名、领域集成变量、`investment_*` 工具名与 MongoDB 库名（数据标识）。
- 17 处版本声明统一提升到 2.2.0。

### 验证

- Python 398 项通过、6 项在线测试跳过（与 2.1.5 基线一致，无回归）；
- 插件测试 76 项通过；技能检查 8 个 Skill / 19 个工具注册一致；
- 5 个插件按新作用域通过组合检查；两个 profile 组合验证通过（旧作用域引用 0 处）；
- Windows 桌面程序集按新名构建通过，20 项桌面测试通过；
- 版本一致性检查通过（17/17）。

### 下载

安装包将在发行门禁（含真机覆盖升级验证）通过后生成，届时在此补充分发文件名与 SHA-256。

> 本项目只支持研究与模拟交易，不连接真实券商，不构成投资建议。

## English

This release bundles two independent changes: **shared research data with leaner model input**, and **naming unification**. They ship as two separate commits so either can be reverted and attributed on its own.

### ① Shared research data and leaner model input

- Fundamental and news research data is shared between window sessions and autonomous cycles, so the same material is no longer fetched and fed to the model repeatedly.
- Added a research-data contract and policy layer covering source switching, unit and date conventions, configuration switches and usage limits.
- Evidence is persisted as checkpoints; downstream roles receive only a compressed summary.
- Added the AKShare and BaoStock dependencies, with import checks in the release bundling script.

### ② Naming unification (internal identifiers and display name)

- Technical identifiers unified on `ai-trading-automation`: the Python package and CLI, the npm scope (five plugins), the C# assembly and namespaces, installer script and artefact names, icon and single-instance identifiers.
- Environment variables unified on `AI_TRADING_AUTOMATION_*` / `ATA_ACCESS_TOKEN` / `X-ATA-Token`. The engine and shell **still accept the pre-rename names**, and the shell exports both sets to child processes, so existing shortcuts and scripts keep working.
- Brand display name unified as `AI Trading Automation`; the official full names serve as document titles with the technical identifier as subtitle.
- **Deliberately unchanged**: the local checkout folder, the install and data directories (zero data migration), the DSH profile/preset names, domain integration variables, the `investment_*` tool names and the MongoDB database name (a data identifier).
- All 17 version declarations moved to 2.2.0.

### Validation

- 398 Python tests passed with six online checks skipped (identical to the 2.1.5 baseline);
- 76 plugin tests passed; the skill check confirmed eight Skills against 19 registered tools;
- five plugins composed under the new scope; both profiles composed with zero old-scope references;
- the Windows desktop assembly built under its new name and all 20 desktop tests passed;
- the version gate passed (17/17).

### Download

The installer will be produced once the release gate (including a real-machine upgrade check) passes; the asset name and SHA-256 will be added here.

> Research and paper trading only. No live broker connection; nothing here is investment advice.
