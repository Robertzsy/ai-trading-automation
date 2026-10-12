# Changelog

[简体中文](CHANGELOG.md) | [English](CHANGELOG_EN.md)

See the [README](README_EN.md) for installation and usage, and [GitHub Releases](https://github.com/Robertzsy/ai-trading-automation/releases) for published builds.

## 2.2.1 — Investment Research and Stability (2026-10-12)

- Added an Investment Research workspace for history, reports, progress and stage evidence, keeping all three one-click actions.
- Added local stock lookup by name, code and approximate name, with confirmation before adding a candidate.
- Fixed analysis stalls, repeated starts after failure and duplicate desktop service starts, reducing unintended calls.
- Preserve completed stages after interruption for manual resume; code repairs require a proposed plan and user confirmation.
- Restored complete shared material and active news investigation.
- Unified the application name as AI Trading Automation and improved data-source disclosures and upgrade compatibility.

See the [2.2.1 release notes](docs/RELEASE_NOTES_2.2.1.md) for installation and upgrades.

## 2.1.5 — Holdings and Stock History (2026-10-09)

- Select a holding to view its history, with date ranges, candlesticks, cost basis, volume and simulated fill dates.
- Show accounts and allocations by market and currency, with data sources and dates.
- Added charts and a workflow view to the README example.

## 2.1.4 — Interface and Analysis Improvements (2026-10-09)

- Unified the light interface, icons and type sizes for better readability.
- Made analysis actions, progress and reports easier to view, with a stop action.
- Improved the Dashboard holdings table and market brief.
- Fixed startup failures, stalled progress displays and incorrect status after stopping.

## 2.1.3 — Diagnostics and Reliability (2026-08-24)

- Added log diagnostics and application maintenance tools.
- Fixed analysis retry and Windows file-save issues.
- Improved installer and upgrade data protection.

## 2.1.2 — Paper Trading and Recovery Protection (2026-08-23)

- Strengthened duplicate-fill protection and analysis-result checks.
- Improved interrupted-run recovery and handling of user-specified stocks.
- Kept internal research tasks out of the user conversation list.

## 2.1.1 — Analysis Workflow Improvements (2026-08-22)

- Separated screening from analysis of user-specified stocks.
- Improved progress feedback for long analyses and reduced timeouts and duplicate starts.

## 2.1.0 — Standalone Desktop Interface (2026-08-22)

- Added the Dashboard, Investment Assistant, Analysis Workflow and Settings pages.
- Preserved streaming conversations, reasoning and tool displays while simplifying everyday navigation.
- Added model, strategy, market and autonomous-run settings.

## 2.0.0 — Desktop Application Rebuild (2026-08-22)

- Rebuilt conversations and multi-agent analysis with unified research and paper-trading workflows.
- Added a Windows installer, credential storage and legacy-data import.
- Added autonomous cycles and saved stage progress.

See the [historical changelog](https://github.com/Robertzsy/ai-trading-automation/blob/308f6c2/CHANGELOG.md) for earlier versions.
