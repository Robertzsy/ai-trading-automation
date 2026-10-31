# Changelog

[简体中文](CHANGELOG.md) | [English](CHANGELOG_EN.md)

See the [README](README_EN.md) for installation and usage, and [GitHub Releases](https://github.com/Robertzsy/ai-trading-automation/releases) for published builds.

## 2.4.0 — Bilingual support, multi-factor and event-driven screening and research workflow improvements (unreleased)

Cumulative changes through October 31, 2026. See the [2.4.0 release notes](docs/RELEASE_NOTES_2.4.0_EN.md) for full rules and compatibility details. Local desktop patches have been applied; a published installer containing every latest patch is not yet available.

### Multi-factor and event-driven screening and daily-event rules

- Each market's research round follows: **market candidates + daily company events → common user filters → at most 60 lightweight evaluations → top 20 candidates → 4–8 securities for full research**. Market discovery, the local catalogue, available Miaoxiang supplementation and daily recall are deduplicated and filtered together.
- **Reserve at least 50 quantitative slots and at most 10 daily supplemental slots**. Merge duplicate securities and fill unused daily slots quantitatively. Use fewer when qualifying candidates are insufficient. The daily limit of 10 is supplemental; quantitative candidates can also receive daily adjustments.
- **Holdings are portfolio context and do not automatically expand full research. Direct selection supports 1–8 securities and skips screening.** Neither the candidate pool nor the entire top 20 enters full research.
- **Base quantitative score = 55% potential + 45% composite factor score**, covering momentum, relative strength, trend, price/volume behavior, liquidity, valuation and volatility. Apply a total daily adjustment capped at **±15 points** to form the top 20.
- The strategy penalizes candidates whose maximum positive correlation ρ with selected securities exceeds 0.75: `8 × max(0, ρ − 0.75) / 0.25`, using up to 60 daily bars and at least 30 common return observations. Same-industry penalties are 6 points per selected security and primary-event overlap penalties are 4, jointly capped at 12. Apply the **larger penalty, not the sum**, of industry/events and correlation.
- Select 4 first, then add securities 5–8 only within 10 research-priority points of the fourth, up to 8. Do not pad a list with fewer than 4 valid candidates.
- Daily interpretation identifies companies, event types, direction and original evidence. Revenue growth, falling profits, losses and regulatory events can change research priority. **Personal wealth losses are not directly treated as company negatives, repeated events count once, and ETF short names are not mistaken for companies.**
- **Interpret and cache the same briefing content once per rule version, shared across four markets**. Reprocess changed content or rules and recalculate freshness on read. If the model is unavailable, continue quantitative screening without turning unconfirmed keyword sentiment into operating-event adjustments.

### Simplified Chinese / English

- Added interface and research-output language preferences across Overview, Assistant, Investment research, Settings, charts, tool cards, desktop and first-run setup.
- New research rounds freeze output language and prompt-template version. Resume preserves them; prose plans are cached by language/template. Historical content and original sources retain their language.
- Added English report, macro-briefing, notification and feedback templates and bilingual HOLD classification. Zero-weight BUY recommendations display as WATCH.

### DSH

- Pinned `@deepseek-ai/dsh@0.2.1-rc.3` (upstream prerelease), adapting declarative presets, configuration forms, PTC workflows and frontend slots.
- Added credential records, CAS revisions and current change events, preserving DPAPI encryption and removing the old application credential cache after updates/revocation.
- Separated shipped composition from user overrides. Read-only historical sessions retain source bytes; writes publish a successor generation.
- Fixed relative CONFIG_PATH resolution under the selected data root and stop startup on configuration migration failure. Installation and user-data directory compatibility is retained.
- Restored local full-text search, rename, archive and cancellation for legacy sessions. Known legacy templates are backed up during migration, and background research inherits research overrides and declared local plugins.

### Progress and interface motion

- Added screening and data preparation to progress: automatic screening displays 7 steps and direct selection 6, both continuing through the five full-research stages.
- Research cards place progress rings beside labels with slightly larger text. Percentages use actual task counts, not elapsed-time estimates.
- Added page, navigation, tab, detail, drawer and dialog transitions; preserve drafts and state across page changes and pause hidden-page polling.
- Added System, Standard and Off motion settings while respecting reduced-motion preferences. Improved startup, save, refresh, empty and failure feedback.

### Automatic analysis, settings and usage control

- Fixed possible scheduled catch-up after disabling automatic analysis. Scheduler, background launch and execution entries read current settings; mode changes do not re-enable automatic analysis or execution.
- Background processes refresh settings, and schedule changes affect future jobs. Research and daily briefings are scheduled separately. Automatic execution and catch-up trading preferences are checked again before paper-trade submission.
- Preserve checkpoints for manual resume after interruption. Cancellation and emergency stop terminate the owned research process tree, reducing continued background usage.
- Full research is limited to 8 securities per round, with 4 concurrent roles and remaining work queued, fixing DSH errors at the 8-active-child limit.
- Fixed partial overrides losing shared-material, deduplication and lightweight-result defaults. Reduced duplicate context and removed fixed large search/evidence-count requirements from prompts.

### Startup, market data and upgrade fixes

- Preserve DSH's full authenticated URL to fix desktop startup timeouts after service readiness. Validate heartbeat process identity so stale workers do not block quick restarts.
- Lock API/scheduler product-file synchronization across processes and skip unchanged files, fixing concurrent directory replacement and file-lock errors.
- Fixed US exchange routing and share-class symbols such as `BRK.B` for history retrieval. Missing quotes or indicators are explicitly recorded in screening results.
- In-place upgrades replace old application dependencies while preserving user data, with stronger artifact, checksum and upgrade-target verification.
- The strategy passed 46 relevant regressions and matched the frozen prototype in all 96 historical windows. Installed-code checks covered live daily interpretation and four-market cache sharing. The latest screening patch has not rerun full five-stage paid research; these checks do not establish investment returns.
- Program upgrades still require in-place installation and restart. Interface language can change in the app, and new rounds use the new research-output language.

## 2.3.0 — Screening relevance, actionable research and lower analysis cost (2026-10-23)

- Added relative strength, volume breakout, acceleration and risk-adjusted momentum factors, growth candidates, and a potential/quality blended ranking.
- Reports now include a decision summary, data-scope notes and historical decision references; evidence, sources and gaps are preserved more completely.
- Added expected-return/downside assessment, conditional WATCH and cash-deployment rules; execution remains subject to the mandate, confidence threshold and hard risk controls.
- Shared material, plan cache and query cache reduce duplicate retrieval; internal comparisons show 29% fewer requests and 28% lower cost at the same price basis.
- Dashboard refresh: equity status band, holdings detail, chart switching and round timeline.
- Fixed search-tool output validation, archive consistency after forced deployment, and screening prefetch/cache issues.

## 2.2.1 — Investment Research and Stability (2026-10-12)

- Added an Investment Research workspace for history, reports, progress and stage evidence, keeping all three one-click actions.
- Added local stock lookup by name, code and approximate name, with confirmation before adding a candidate.
- Fixed startup timeouts, analysis stalls, repeated starts after failure and duplicate desktop service starts, reducing unintended calls.
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
