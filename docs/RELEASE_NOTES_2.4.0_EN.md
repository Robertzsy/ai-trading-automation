# AI Trading Automation 2.4.0 — Bilingual support, multi-factor and event-driven screening and research workflow improvements

[简体中文](RELEASE_NOTES_2.4.0.md)

This update combines Chinese and English support, a DSH runtime upgrade, multi-factor and event-driven screening, company events from daily briefings, visible research progress, interface transitions, and fixes to startup, scheduling and research workload limits.

**Release status: unreleased.** Updated through October 31, 2026, these notes cover the cumulative 2.4.0 changes, including subsequent patches applied to the local desktop installation. The published GitHub release remains 2.3.0. Earlier 2.4.0 candidate installers do not contain every latest patch; the release must be rebuilt from the final source. The product version is `2.4.0`, with embedded DSH pinned to `0.2.1-rc.3`.

## Multi-factor and event-driven screening: complete rules

### From candidates to the research list

**Market candidates + daily company events → deduplication and common user filters → at most 60 lightweight evaluations → top 20 candidates → 4–8 securities for full research.** These limits apply to a single research round in each market.

- Market discovery and the local securities catalogue form the candidate base, with existing Miaoxiang supplementation where available. Daily events can also recall specific companies from the local catalogue outside the market discovery list. Every source must pass the user's screening conditions.
- Within the 60 lightweight evaluation slots, **at least 50 slots are reserved for quantitative candidates and at most 10 for daily-event additions**. Unused or overlapping daily slots are filled from the quantitative list; each security occupies one slot. Fewer qualifying candidates or insufficient market data result in fewer evaluations.
- The daily limit of 10 applies to supplemental slots. Securities already admitted quantitatively can still receive a daily-event adjustment.
- The candidate pool, top 20 and full research list are stored separately. Neither all 60 lightweight evaluations nor the entire top 20 enters full multi-agent research.
- **Holdings provide portfolio and risk context without automatically expanding the research list. Direct selection supports 1–8 securities and skips automatic screening**, without adding another batch of candidates.

### Scores and final list size

The existing quantitative score is retained, with a daily adjustment to research priority:

```text
Base quantitative score Q = 55% × potential score + 45% × composite factor score
Combined score S = Q + daily adjustment D, with total D capped between −15 and +15
```

Factors cover momentum, relative strength, trend, price/volume breakout, acceleration, risk-adjusted momentum, liquidity, valuation and low volatility. Existing custom factor weights remain effective. The top 20 are ranked by S, then admitted one at a time:

1. Each selected security in the same industry adds a 6-point penalty. Each selected security sharing the candidate's primary event adds 4 points. The combined industry/event penalty is capped at 12.
2. The strategy adds a high-correlation penalty using up to the latest 60 daily bars. Daily returns must cover matching trading intervals, with at least 30 common return observations. If ρ is the maximum positive correlation with already selected securities, the penalty is `8 × max(0, ρ − 0.75) / 0.25`. Correlation at or below 0.75 is not penalized; correlation of 1 incurs 8 points. Negative correlation is not penalized, and insufficient samples remain unknown.
3. The applied penalty is the **larger of the industry/event penalty and the correlation penalty, not their sum**. Research priority equals S minus that penalty. There is no mandatory one-security-per-industry restriction.
4. Select the first 4, then admit securities 5–8 only while their research priority is within 10 points of the fourth security. **The maximum is 8.** Fewer than 4 valid candidates are not padded with extra names.

The strategy preserves the existing quantitative preferences and daily-event rules, adding a soft penalty only for highly similar price behavior. Screening scores allocate research effort; the selected securities still pass through base research, debate, portfolio drafting, risk review and final decision.

### How daily briefings affect selection

- Interpret each briefing at the company level, identifying the company, event type, direction and original paragraph evidence, then mapping to known securities. Revenue/profit growth, declining revenue, a move into losses and regulatory events can change research priority.
- **A founder's personal wealth loss is no longer treated directly as negative company news, and price movements alone are not operating events.** Product announcements and commentary without confirmed operating implications are neutral. One article may have different implications for different companies.
- **Repeated coverage of the same event for the same company counts once**; conflicting directions become neutral. Evidence is retrieved by paragraph ID, and ETF short names are not mistaken for company names.
- Events are weighted by importance and freshness, with the total adjustment still capped at ±15. Freshness currently approximates business days: weight 1 on the event day and next business day, 0.65 on the second, 0.35 on the third, and background only thereafter. Future-dated events are not used early.
- **The same briefing content is interpreted once per rule version and cached across all four markets**. Changed content or rules triggers new interpretation. Concurrent requests share a process lock, preventing repeated interpretation for each security. Freshness decay is recalculated when cached results are read.
- Interpretation uses an official DeepSeek model with public news and securities names/codes, excluding accounts, holdings and private research. Quantitative screening remains available if the model is unavailable; unconfirmed keyword sentiment does not create an operating-event adjustment. Failed requests have a short retry cooldown.
- The new semantic mapping currently focuses on individual companies, without complete industry or ETF constituent coverage. Business-day freshness does not yet use exchange holiday calendars.

## Chinese and English support

- One installation switches between Simplified Chinese and English across the four product pages, model settings, tool cards, setup, desktop status, tray and installer.
- Research output follows the interface or uses a fixed language. New rounds record language and prompt template version; resumed rounds retain them. Historical content keeps its original language.
- Reports, macro briefings, notifications, feedback and HOLD reason classification support English. Symbols, action codes, currencies, numbers and evidence IDs stay unchanged. Source titles, quotations, company names and user input are not automatically translated.
- Factual material remains shared; prose research plans are cached by output language and prompt-template version. Zero-weight BUY recommendations display as WATCH.
- Repair approval retains reviewed scope, exact file/command permissions, verification and grant revocation. Changing language starts no research or orders.

## Research progress, interface and motion

- Automatic screening displays 7 steps: **screening → data preparation → base research → research debate → portfolio draft → risk review → final decision**. Direct selection displays 6 steps, omitting screening.
- One-click screening is part of round progress, with candidate and actual research lists visible. Starting the same market again shows its existing round status, reducing duplicate launches.
- Product text, forms and status messages are easier to read. Research stages pair progress rings with labels; percentages use recorded task completion and remain indeterminate when counts are unavailable.
- Pages, navigation, tabs, details, drawers and dialogs use consistent transitions. Switching pages retains forms and workspace state; hidden product pages pause their polling.
- Motion preferences support System, Standard and Off, while always respecting system reduced-motion settings. Stop, cancellation and submission actions are handled immediately.
- Desktop startup shows preparation state and shares the web interface's visual treatment. Save, error, empty and refresh feedback is consistent.

## Automatic analysis, settings and research usage

- Fixed scheduled rounds or startup catch-up occurring after automatic analysis was disabled. Both the scheduler and background launch entry check the main automatic-analysis switch. Changing operation mode preserves the existing analysis and execution choices.
- Saved settings propagate to independent background processes. Schedule changes affect future jobs without triggering catch-up on refresh. Automatic research and daily briefings are scheduled separately.
- Automatic execution, operation mode and catch-up trading preferences are checked again before submitting paper trades. Turning execution off preserves research results without proceeding to automatic submission.
- Restart preserves interrupted rounds and completed stages for manual resume. Cancellation or emergency stop terminates that round's background research process tree, preventing continued work after the interface reports a stop.
- Full research admission is capped at 8 securities per round. Holdings and candidate lists no longer combine into dozens of full-research targets. Multiple markets retain their own rounds.
- Fixed partial overrides losing shared-research, deduplication and lightweight-result defaults. Reuse collected material and remove fixed large search/evidence-count requirements from prompts, supplementing actual evidence gaps instead.

## DSH upgrade, startup and data compatibility

- On a quick desktop restart, scheduler readiness checks both the heartbeat and process lifetime so a recently exited worker cannot prevent startup.
- Multi-symbol research explicitly runs up to 4 roles concurrently and queues the rest, fixing errors from exceeding DSH's limit of 8 active child agents without raising that upstream limit.
- Background research migrates additional known legacy templates with backups, inherits headless overrides and their declared local plugins, and continues to protect unrecognized legacy customizations.
- Desktop startup preserves DSH's authenticated launch URL for readiness checks and WebView2 navigation, fixing a 60-second timeout even after the service has started.
- API and scheduler product-file synchronization share a process lock and skip unchanged files, fixing concurrent plugin-directory replacement and file-lock errors during startup.
- Embedded DSH moves from `0.1.0-rc.6` to exactly `0.2.1-rc.3`, an upstream prerelease.
- The workflow adapts to PTC execution and the new preset registry, Settings, Credentials and UI services.
- Shipped definitions and user overrides are separate. Known legacy configurations are backed up before conversion; custom legacy overrides are never silently replaced. DPAPI-encrypted credential records use revision checks to prevent stale concurrent refreshes.
- Reading legacy sessions preserves source files; the first write publishes an upstream successor generation. Old software may not read newly created sessions or events. Keep both generations and all new business records when planning rollback.
- Restored local full-text search for legacy sessions and adapted session rename, archive and cancellation actions to the new runtime.
- Installation paths, data paths and existing business identifiers retain their compatibility rules. Clean-source packaging validates the product allowlist, and the portable package includes the complete DSH application.
- Upgrade replaces the old application-owned DSH dependency tree before copying the new one. The user-data root is outside this cleanup. Verification requires a matching installer checksum, a nonempty existing data snapshot and the expected DLL; a read-only inspection mode is available.
- Fixed insufficient US price history caused by applying a Nasdaq suffix to every ticker. Exchange-route fallback and share-class codes such as `BRK.B` are supported, and data for a different security is rejected. Missing quotes or indicators are recorded in screening results so the actual scored count is visible.

## Validation and upgrade notes

- The screening implementation matches the frozen prototype's research lists in all 96 historical windows, with 46 relevant regression checks passing. Installed-code checks covered US history, live daily interpretation, one shared model request across four concurrent markets, and subsequent cache reuse.
- These results validate screening rules and the data pipeline, not investment returns. The latest screening patch has not rerun the full five-stage paid research workflow. Earlier bilingual, desktop and workflow checks are recorded separately from this screening validation, rather than presented as one complete end-to-end acceptance run.
- Program updates still require an in-place installation and restart; there is no in-app program hot update. Interface language can change in the app, while a new research-output language applies to new rounds.
- Published installers and checksums are the attachments on the corresponding GitHub Release. This unreleased document does not mean those attachments have been updated.

See [Desktop usage](DESKTOP_USAGE_EN.md), [language rules](LANGUAGE_SUPPORT.md) and [product shell](PRODUCT_SHELL_EN.md).
