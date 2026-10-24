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
- [Architecture](#architecture)
- [Version History](#version-history)
- [Safety Boundaries](#safety-boundaries)
- [Tests and Release Gate](#tests-and-release-gate)
- [Documentation](#documentation)
- [Branches and Compatibility](#branches-and-compatibility)
- [License](#license)

The current source is preparing **2.4.0**: bilingual interface/research output and pinned DSH **0.2.1-rc.3**. Published download links above continue to point to the available 2.3.0 release. See [language support](docs/LANGUAGE_SUPPORT.md), [desktop usage](docs/DESKTOP_USAGE_EN.md) and the [English API overview](docs/ENGINE_API_EN.md).

## Features

- **Four markets in one app**: unified market data, screening, analysis, and paper accounts for A-shares, Hong Kong stocks, U.S. equities, and ETFs; T+1/T+0, lot sizes, price limits, commission, stamp tax, and slippage rules are built in per market.
- **Multi-factor quantitative screening**: hard filters plus momentum / relative strength / trend / volume breakout / acceleration / risk-adjusted momentum / liquidity / valuation / low-volatility scores; outputs include rankings, factor scores, and screening reasons, with configurable weights and thresholds.
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

### Nine-factor quantitative ranking

The base score includes momentum, relative strength, trend, volume breakout, acceleration, risk-adjusted momentum, liquidity, valuation and low volatility. The potential score emphasizes trend opportunities and price/volume changes; together they set research priority.

![Nine base-factor weights and the 55% potential / 45% base-score blend](docs/assets/quant-ai-factors.en.png)

```text
Final ranking score = 55% × potential score + 45% × base score
```

| Screening and research parameter | Current default configuration |
|---|---:|
| Market-discovery count parameter / snapshot prefetch cap | 500 / 60 symbols |
| Shortlist / configured autonomous universe cap | 8 / 30 symbols |
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
