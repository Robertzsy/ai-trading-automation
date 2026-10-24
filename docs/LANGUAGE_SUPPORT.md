# Language support / 语言支持

[Desktop usage (English)](DESKTOP_USAGE_EN.md) · [桌面使用说明](DESKTOP_USAGE.md)

## English

One installation provides Simplified Chinese and English. Use Settings → Interface language. Language preferences persist in the active DSH profile and are shared with the desktop through DSH's native locale bridge. The engine stores a resolved mirror for early startup and background output. Changing language does not start research, submit orders or change strategy and risk limits.

Research output is a separate preference: `follow-ui`, `zh` or `en`. Each new durable round records `output_language` and `prompt_template_version`. Resuming the same `cycle_id` keeps those values. Records without a language field are historical Chinese records. Shared factual snapshots remain reusable; prose research plans are partitioned by language and template version. Search queries keep the source language appropriate to their market.

Generated explanations, report headings, fixed tables, notifications and feedback use the selected output language. Tickers, BUY/SELL/HOLD/WATCH codes, evidence IDs, numerical values, currencies, market identifiers and API keys remain unchanged. Source titles, quotations, user text and company names are original data. Historical artifacts are not silently translated or rewritten.

The product UI owns its dictionaries, including charts and tool cards. Build generators verify language keys and interpolation parameters. Native DSH conversation copy is adapted by `brand-dist.mjs` using exact semantic dictionary keys after installation; its match-count checks fail if the supported upstream layout changes.

## 简体中文

同一安装包提供简体中文和 English，在“设置 → 界面语言”切换。DSH 活动 profile 的语言偏好为权威来源，通过原生桥同步桌面；引擎保存启动和后台输出所用的已解析镜像。语言切换不启动研究、不提交订单、不改变策略或风控。

研究输出可设为跟随界面、中文或英文。新轮次记录 `output_language` 和 `prompt_template_version`；同一 `cycle_id` 续跑沿用原值。无语言字段的历史记录按中文处理。事实快照可复用；自然语言研究计划按语言和模板版本分区，检索关键词保留对应市场的来源语言。

生成解释、报告标题、固定表格、通知和反馈采用输出语言。证券代码、动作代码、证据编号、数值、币种、市场标识和 API 键不变。原文标题、引用、用户输入和公司名称属于原始数据，历史材料不静默翻译或改写。
