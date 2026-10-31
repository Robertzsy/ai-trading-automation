# AI-Driven Global Portfolio Optimization & Multi-Agent Trading Automation System

**AI 驱动多市场投资研究与模拟交易自动化系统**

[简体中文](README.md) | [English](README_EN.md)

[![Release](https://img.shields.io/badge/release-v2.3.0-brightgreen)](https://github.com/Robertzsy/ai-trading-automation/releases/tag/v2.3.0)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-lightgrey)]()

AI Trading Automation combines **multi-factor quantitative screening, portfolio optimization, and multi-agent AI research** in a desktop application for investment research and **paper trading** across China A-shares, Hong Kong stocks, U.S. equities, and exchange-traded funds. The quantitative engine calculates metrics and constraints; AI evaluates technical, financial, news, and sentiment evidence; Python risk controls and the paper broker check and execute decisions.

**Quantitative methods identify what to research and compare allocations. AI evaluates investment theses and counterevidence. Risk controls determine whether a proposed paper trade may execute.**

Version 2.x is built on DeepSeek Harness (DSH) and provides four workspaces: Overview, Investment Assistant, Investment Research, and Settings.

The latest version, **2.3.0**, improves screening relevance and research actionability while reducing repeated research work. It adds conditional watch, cash-deployment rules and a dashboard refresh.

> This project supports research and paper trading only. It does not connect to a live broker and should not be used directly with real capital.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Run from Source](#run-from-source)
- [Core Investment Logic](#core-investment-logic)
- [Multi-factor and event-driven screening](#multi-factor-and-event-driven-screening)
- [Architecture](#architecture)
- [Version History](#version-history)
- [Safety Boundaries](#safety-boundaries)
- [Tests and Release Gate](#tests-and-release-gate)
- [Documentation](#documentation)
- [Branches and Compatibility](#branches-and-compatibility)
- [License](#license)

The current source is preparing **2.4.0**: multi-factor and event-driven screening, company events from daily briefings, bilingual interface/research output and pinned DSH **0.2.1-rc.3**. Published download links above continue to point to the available 2.3.0 release. See the [complete screening rules below](#multi-factor-and-event-driven-screening), [2.4.0 release notes](docs/RELEASE_NOTES_2.4.0_EN.md), [language support](docs/LANGUAGE_SUPPORT.md), [desktop usage](docs/DESKTOP_USAGE_EN.md) and the [English API overview](docs/ENGINE_API_EN.md).

## Features

- **Four markets in one app**: unified market data, screening, analysis, and paper accounts for A-shares, Hong Kong stocks, U.S. equities, and ETFs; T+1/T+0, lot sizes, price limits, commission, stamp tax, and slippage rules are built in per market.
- **Multi-factor and event-driven screening**: combine factor scores with daily company events, reducing overlap by industry, event and price correlation. Evaluate at most 60 securities lightly, rank the top 20 and select 4–8 for full research, retaining scores and original evidence.
- **Quantitative portfolio optimization**: compares mean–variance, Black–Litterman, risk-parity, and cost-adjusted allocations, with target weights, cash allocation, historical risk metrics, and rebalancing cost estimates.
- **Multi-agent AI research**: four base-research tracks → bull-bear debate → research adjudication and per-stock proposals → portfolio draft → three-way risk debate → final decision; views, disagreements, evidence, and checkpoints are stored as structured records.
- **Risk controls the AI cannot bypass**: three-tier strategy mandate, position capping, drawdown circuit breaker, and built-in stop-loss/take-profit; every AI decision must pass the deterministic Python risk layer and paper broker.
- **Productized desktop app**: Overview, Investment Assistant, Investment Research, and Settings; one-click install, single instance, tray icon, autostart, and in-place upgrades that preserve data.
- **Holdings-linked Dashboard**: account metrics and allocations remain in each market's native currency; select a holding to inspect its daily history, line/candlestick views, time ranges, cost basis, volume, MA20 and fill dates, with source and data dates shown.
- **Conversational AI assistant**: retains DSH-native reasoning, streaming, tools, Skills, plans, and subagents; supports log diagnostics and code repairs with a proposed plan and user confirmation.

## Installation

- Download `AiTradingAutomation-Setup-x64.exe` from the [v2.3.0 release](https://github.com/Robertzsy/ai-trading-automation/releases/tag/v2.3.0)
- Windows 10/11 x64. The installer bundles Python, Node.js, the .NET desktop runtime, and a WebView2 fallback installer.

Download the [SHA-256 file](https://github.com/Robertzsy/ai-trading-automation/releases/download/v2.3.0/AiTradingAutomation-Setup-x64.exe.sha256) alongside the installer. Compute the installer checksum in PowerShell and compare it with that file:

```powershell
Get-FileHash .\AiTradingAutomation-Setup-x64.exe -Algorithm SHA256
```

The program is installed under `%LocalAppData%\Programs\InvestmentAuto`, while user data lives under `%LocalAppData%\InvestmentAuto`. In-place upgrades preserve accounts, holdings, reports, configuration, credentials and sessions.

## Run from Source

Python 3.10+, Node.js 22+, and the .NET 8 SDK are required; .NET is needed only when building the desktop shell.

```powershell
# Install Python dependencies
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .

# Terminal 1: start the investment engine
.\.venv\Scripts\python.exe -m engine.main serve

# Terminal 2: start the AI Trading Automation web product shell
.\app\scripts\dev.ps1 -Port 4567
```

Open `http://127.0.0.1:4567`, then configure the model and API key in Settings.

## Core Investment Logic

Quantitative methods identify candidates. AI tests investment theses. Allocation rules shape portfolio proposals. Code-based risk checks constrain final paper execution.

![Workflow from quantitative screening and AI research through cash allocation, risk checks and paper execution](docs/assets/quant-ai-workflow.en.png)

*The diagram summarizes the 2.3.0 workflow. Candidate and research counts for 2.4.0 follow the rules below.*

### Multi-factor and event-driven screening

#### From candidates to the research list

**Market candidates + daily company events → deduplication and common user filters → at most 60 lightweight evaluations → top 20 candidates → 4–8 securities for full research.** These limits apply to a single research round in each market.

- Market discovery and the local securities catalogue form the candidate base, with existing Miaoxiang supplementation where available. Daily events can also recall specific companies from the local catalogue outside the market discovery list. Every source must pass the user's screening conditions.
- Within the 60 lightweight evaluation slots, **at least 50 slots are reserved for quantitative candidates and at most 10 for daily-event additions**. Unused or overlapping daily slots are filled from the quantitative list; each security occupies one slot. Fewer qualifying candidates or insufficient market data result in fewer evaluations.
- The daily limit of 10 applies to supplemental slots. Securities already admitted quantitatively can still receive a daily-event adjustment.
- The candidate pool, top 20 and full research list are stored separately. Neither all 60 lightweight evaluations nor the entire top 20 enters full multi-agent research.
- **Holdings provide portfolio and risk context without automatically expanding the research list. Direct selection supports 1–8 securities and skips automatic screening**, without adding another batch of candidates.

#### Scores and final list size

The existing quantitative score is retained, with a daily adjustment to research priority:

```text
Base quantitative score Q = 55% × potential score + 45% × composite factor score
Combined score S = Q + daily adjustment D, with total D capped between −15 and +15
```

Factors cover momentum, relative strength, trend, price/volume breakout, acceleration, risk-adjusted momentum, liquidity, valuation and low volatility. Existing custom factor weights remain effective. The top 20 are ranked by S, then admitted one at a time:

1. Each selected security in the same industry adds a 6-point penalty. Each selected security sharing the candidate's primary event adds 4 points. The combined industry/event penalty is capped at 12.
2. The strategy uses a high-correlation penalty using up to the latest 60 daily bars. Daily returns must cover matching trading intervals, with at least 30 common return observations. If ρ is the maximum positive correlation with already selected securities, the penalty is `8 × max(0, ρ − 0.75) / 0.25`. Correlation at or below 0.75 is not penalized; correlation of 1 incurs 8 points. Negative correlation is not penalized, and insufficient samples remain unknown.
3. The applied penalty is the **larger of the industry/event penalty and the correlation penalty, not their sum**. Research priority equals S minus that penalty. There is no mandatory one-security-per-industry restriction.
4. Select the first 4, then admit securities 5–8 only while their research priority is within 10 points of the fourth security. **The maximum is 8.** Fewer than 4 valid candidates are not padded with extra names.

The strategy preserves the existing quantitative preferences and daily-event rules, adding a soft penalty only for highly similar price behavior. Screening scores allocate research effort; the selected securities still pass through base research, debate, portfolio drafting, risk review and final decision.

#### How daily briefings affect selection

- Interpret each briefing at the company level, identifying the company, event type, direction and original paragraph evidence, then mapping to known securities. Revenue/profit growth, declining revenue, a move into losses and regulatory events can change research priority.
- **A founder's personal wealth loss is no longer treated directly as negative company news, and price movements alone are not operating events.** Product announcements and commentary without confirmed operating implications are neutral. One article may have different implications for different companies.
- **Repeated coverage of the same event for the same company counts once**; conflicting directions become neutral. Evidence is retrieved by paragraph ID, and ETF short names are not mistaken for company names.
- Events are weighted by importance and freshness, with the total adjustment still capped at ±15. Freshness currently approximates business days: weight 1 on the event day and next business day, 0.65 on the second, 0.35 on the third, and background only thereafter. Future-dated events are not used early.
- **The same briefing content is interpreted once per rule version and cached across all four markets**. Changed content or rules triggers new interpretation. Concurrent requests share a process lock, preventing repeated interpretation for each security. Freshness decay is recalculated when cached results are read.
- Interpretation uses an official DeepSeek model with public news and securities names/codes, excluding accounts, holdings and private research. Quantitative screening remains available if the model is unavailable; unconfirmed keyword sentiment does not create an operating-event adjustment. Failed requests have a short retry cooldown.
- The semantic mapping currently focuses on individual companies, without complete industry or ETF constituent coverage. Business-day freshness does not yet use exchange holiday calendars.

#### Quantitative factors and research parameters

![Nine base-factor weights and the 55% potential / 45% base-score blend](docs/assets/quant-ai-factors.en.png)

| Screening and research parameter | Defaults and rules |
|---|---:|
| Market-discovery count parameter / snapshot prefetch cap | 500 / 60 symbols |
| Reserved quantitative slots / daily supplemental cap | At least 50 / at most 10 securities |
| Candidate shortlist / automatic full research per round | At most 20 / 4–8 securities |
| Directly specified securities | 1–8, skipping automatic screening |
| Screening refresh interval | 30 minutes |
| Base-research perspectives / symbol success-ratio gate | 4 / 80% |
| Research debate / risk debate | 1 round each |

Scores use configurable rules; they are not price-increase probabilities. The portfolio optimizer independently provides mean–variance, Black–Litterman, risk-parity and cost-adjusted references, with a default 120-day lookback parameter, a 3,000-sample search parameter and at most 12 symbols. The fixed research workflow does not automatically adopt its recommended weights.

### Recorded cases

![Recorded HOLD, Quectel WATCH and Mindray cash-rule-adjusted BUY proposals](docs/assets/quant-ai-cases.en.png)

- **Completed Hong Kong research (2026-10-05)**: 38 role tasks, 185 evidence items and 0 failures. All four stocks remained HOLD; recorded stages totaled 401 seconds, excluding startup and other overhead.
- **603236 Quectel (2026-10-23, development validation)**: WATCH, CNY 76.11 trigger, 10-day validity, target weight 0%, and 20-day/60-day scenario returns of −2.60%/−1.40%.
- **300760 Mindray (2026-10-23, development validation)**: trader WATCH 0% → risk-manager BUY 5% → archived BUY 12% after cash rules, with final confidence 0.60 and a rule-adjustment flag.

All three rounds reached `ready_for_execution` with `submit=false`; no order was submitted. Prices, returns and weights are historical research outputs. A BUY proposal is not a filled position, and WATCH currently does not trigger orders automatically. These historical and development cases are not a same-version return comparison.

See [Investment Logic](docs/INVESTMENT_LOGIC_EN.md) for cycles, case fields, strategy parameters and execution boundaries, and the [minimal case summary](docs/assets/quant-ai-cases.json) for numeric values.

### An internal sample of calls and estimated cost

![Two-symbol internal development sample: requests, search requests, estimated cost and evidence items](docs/assets/quant-ai-efficiency.en.png)

In the 00700/01810 sample, requests fell from 231 to 131. Recalculated on one historical price basis, estimated cost changed from CNY 7.358 to CNY 4.434, while base-research evidence items changed from 174 to 166. Dates, prompts and cache states differ; costs are not reconciled bills and evidence counts do not establish equivalent quality. The comparison scope and raw-token aggregates are documented in [Investment Logic](docs/INVESTMENT_LOGIC_EN.md#internal-efficiency-sample-ledger-counts-and-cost-estimates) and the case summary.

The Python execution layer independently checks mandates, positions, cash, turnover, confidence and market settings. Model opinions and cash rules can change research proposals; final fills remain subject to execution checks.

## Architecture

```text
Windows WPF + WebView2
          │
AI Trading Automation product shell
          │
DSH conversation / tools / Skills / subagents / workflows
          │  token-protected loopback HTTP API
Python investment engine
          │
market data, screening, portfolio, risk, paper broker, audit, scheduler
```

- `app/`: DSH profiles, preset, Skills, investment tools bridge, fixed workflow, and product UI.
- `engine/`: investment facts, configuration, cycle state, hard risk controls, paper broker, and scheduler.
- `windows/desktop/`: WPF/WebView2 shell and process lifecycle.
- `installer/`: self-contained Windows installer.
- `tests/`: engine, recovery, idempotency, configuration, and desktop regressions.

## Version History

| Version | Highlights |
|---|---|
| 2.3.0 | Screening relevance, research actionability, lower analysis cost and dashboard refresh. |
| 2.2.1 | Investment Research workspace, local stock suggestions, failure recovery and repair confirmation. |
| 2.1.5 | Holdings-linked stock history and visual examples. |
| 2.1.4 | Clearer interface, analysis progress and reports. |
| 2.1.3 | Log diagnostics and reliability improvements. |
| 2.1.2 | Stronger paper-trading and interrupted-run protection. |
| 2.1.1 | Separate screening and specified-stock analysis actions. |
| 2.1.0 | Standalone desktop interface and product settings. |
| 2.0.0 | Rebuilt desktop application and multi-agent workflow. |

See the [changelog](CHANGELOG_EN.md) and [v2.3.0 release notes](docs/RELEASE_NOTES_2.3.0.md).

## Safety Boundaries

IA runs with the DSH `danger-full-access` preset. Within the current Windows user's authority, it can inspect logs, modify project source, run PowerShell, execute tests and builds. System permissions and trading authority remain separate:

- Paper accounts and the paper broker are mandatory.
- Manual submissions still require user approval.
- Every decision must pass the Python mandate and deterministic risk checks.
- Cycle IDs, decision fingerprints, and account-embedded execution receipts prevent duplicate fills.
- API keys and webhooks are stored through Windows DPAPI and never written to ordinary configuration or logs.
- Headless and role subagent sessions live in an isolated internal DSH Home and do not enter the user session list.

## Tests and Release Gate

Release checks cover Python, plugin and desktop tests, generated files, version consistency, bundled runtimes and user-data preservation during upgrades. Developers can run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\release-check.ps1
```

## Documentation

- [Investment Logic (EN)](docs/INVESTMENT_LOGIC_EN.md) · [投资逻辑详解](docs/INVESTMENT_LOGIC.md)
- [2.0 architecture](docs/ARCHITECTURE_2.0.md) · [Engine API](docs/ENGINE_API.md) · [Product shell](docs/PRODUCT_SHELL.md) · [App runtime guide](app/README.md)

## Branches and Compatibility

- `dsch/2.0`: current 2.x development and release branch, and the repository default.
- `legacy-1x` (tag): the final state of 1.x, kept as history and fallback. 2.0 was a
  complete rebuild, so the 1.x code is archive only and no longer maintained — it
  does not need a branch of its own.
- 1.x user data can be migrated to 2.x; migration and in-place upgrades never delete the source data.

## License

[MIT License](LICENSE)
