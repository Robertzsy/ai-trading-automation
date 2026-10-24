# Investment skills

[简体中文](#简体中文) · [English](#english)

## English

These eight shipped skills use the registered `investment_*` tools. The complete workflow has a single entry, `investment_analysis_workflow`; skills do not reconstruct the multi-role workflow themselves.

| Skill | Purpose |
|---|---|
| account-management | Inspect and manage simulated accounts |
| complete-investment-cycle | Launch and monitor the fixed research workflow |
| market-overview | Market and macro context |
| portfolio-optimization | Quantitative portfolio suggestions |
| portfolio-review | Holdings and mandate review |
| security-analysis | Evidence-based security research |
| self-maintenance | Diagnose product errors and propose an approved repair |
| stock-screening | Screen candidates before research |

Research children inherit the round's frozen output language. Original sources and machine fields are preserved. Trading and repairs remain subject to their existing approval and engine-enforced boundaries.

## 简体中文

以上八项为随产品发布的技能，使用已注册的 `investment_*` 工具。完整研究只有 `investment_analysis_workflow` 一个入口，技能不自行重建多角色流程。研究子角色沿用轮次语言快照，原始来源和机器字段保持不变；交易与修复继续遵守既有批准流程和引擎边界。

运行 `node app/scripts/check-skills.mjs` 校验技能与工具引用。发布清单由 `app/product-manifest.json` 明确指定，工作区中的其他试验目录不自动加入产品。
