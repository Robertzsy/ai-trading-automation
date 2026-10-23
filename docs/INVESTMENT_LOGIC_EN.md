# AI-Driven Global Portfolio Optimization & Multi-Agent Trading Automation System — Quantitative and AI Investment Logic

[Back to README](../README_EN.md) · [简体中文](INVESTMENT_LOGIC.md)

AI Trading Automation connects multi-factor screening, quantitative portfolio optimization, multi-agent research, and paper execution. This document describes their methods, inputs, outputs, and boundaries. See the [research data contract](RESEARCH_DATA_PIPELINE.md) for data availability and source conventions.

**Quantitative methods identify what to research and compare allocations. AI evaluates investment theses and counterevidence. Risk controls determine whether a proposed paper trade may execute.**

## 1. From Data to Decisions

| Component | Main inputs | Method and output |
|---|---|---|
| Quantitative screening | Market discovery, quotes, historical indicators | Hard filters and multi-factor scores produce candidates and screening reasons |
| AI stock research | Candidates or user-specified symbols, quotes, financials, news, sentiment, holdings | Four research tracks, bull-bear debate, and research adjudication produce per-stock proposals |
| AI portfolio research | Stock proposals, account, strategy mandate | Portfolio drafting, risk debate, and final adjudication produce actions and target weights |
| Risk controls and paper execution | Decisions, current account, engine-fetched quotes, effective constraints | Generates eligible orders, simulates fills or rejections, and saves receipts |
| Quantitative allocation reference | Historical prices, current holdings, costs, configuration | Independently compares portfolio schemes for the assistant to retrieve and interpret |

Screening scores, AI judgments, optimizer weights, and final paper orders are distinct recorded results. User-specified stocks can enter research directly. Optimizer results are retrieved through a separate tool; the fixed research workflow does not automatically adopt their recommended weights.

## 2. Quantitative Screening: Narrowing the Research Universe

### 2.1 Filtering and Preselection

The native market-discovery path normalizes security symbols and applies configured name exclusions, minimum price, turnover, market cap, PE/PB caps, and daily-move limits. ST/delisting name matches and exclusions for certain security types depend on market configuration. The audit records rejection counts by reason.

Eligible candidates receive a low-cost preliminary ranking. Detailed snapshots and multi-factor scores are then calculated for a limited subset. Configuration bounds the final shortlist, while existing holdings also enter the research universe. Configured fixed pools and user-specified stocks follow different entry paths and should not be treated as having passed every market-discovery filter.

When sources or factors are unavailable, the result records fallback status, sources, and errors. Missing factor scores are not presented as valid rankings.

### 2.2 Multi-Factor Weighted Scoring

Each factor maps to a 0–100 score. Default weights are:

| Factor | Default weight | Current calculation |
|---|---:|---|
| Momentum | 25% | Average of linearly mapped and clamped 5-day and 20-day price changes |
| Relative strength | 20% | 20-day return deviation from the current candidate sample median |
| Trend | 12% | Price relative to MA20/MA60, MA5/10/20 alignment, MACD histogram, and RSI14 range |
| Volume breakout | 12% | Joint mapping of 5-day return and volume ratio, rather than volume alone |
| Acceleration | 8% | Difference between 5-day and 20-day momentum |
| Risk-adjusted momentum | 8% | 20-day return divided by recent volatility, then mapped |
| Liquidity | 7% | Turnover percentile relative to the current preselected candidate sample |
| Valuation | 4% | Piecewise scores from absolute current PE/PB bands |
| Low volatility | 4% | Inverse mapping of recent return volatility, clamped to the valid score range |

The composite normalizes configured weights:

```text
Composite score = Σ(factor score × configured weight) / Σ(configured weight)
```

Factors are combined with normalized configured weights. The score is used only for candidate ranking; it is not an expected return or probability of a price increase. A potential score and a quality score are further blended 55% / 45% for the final candidate ranking.

The valuation factor uses absolute PE/PB bands; it does not calculate a stock's historical valuation percentile or apply industry neutralization. Weights are configured rules, not learned parameters. A score of 77 does not mean a 77% probability of a price increase. Scores can be recalculated from the same data, configuration, and implementation; changing live data or fallback inputs can change the result.

Implementation: [screening engine](../engine/screening/engine.py).

## 3. Portfolio Optimization: Comparing Allocation and Risk

The optimizer aligns common historical trading dates, estimates return means and covariance, and compares schemes using current holdings and trading costs:

| Method | Current implementation | Purpose |
|---|---|---|
| Mean–variance | Samples candidate weights and compares historically estimated Sharpe ratios | Compares return and volatility tradeoffs |
| Black–Litterman | Blends equilibrium returns derived from covariance and prior weights with historical-mean views, then searches weights | Compares allocations after incorporating the prior |
| Risk parity | Iteratively adjusts weights toward equal asset risk contributions | Examines risk concentration |
| Cost adjustment | Estimates turnover, commission, taxes, and slippage between current and target weights before comparing schemes | Examines how rebalancing costs affect allocation choices |

Outputs include risky-asset weights, whole-account weights with CASH, historical return and volatility estimates, Sharpe ratios, rebalancing costs, and sample-based VaR95, average tail loss, maximum drawdown, and worst daily/weekly/monthly performance. Risky-sleeve weights and whole-account weights are distinguished, with cash allocation retained.

Close-of-day scheduling runs the optimizer and saves its results. The investment assistant can retrieve the latest output for comparison and interpretation. These are allocation references; actual rebalancing still requires decision submission and risk checks.

The current Black–Litterman views use historical mean returns and configured confidence, without model-generated return forecasts. Search and iteration are numerical approximations. Historical metrics and cost estimates are not future returns or a substitute for a complete strategy backtest.

Implementation: [optimization algorithms](../engine/optimizer/engine.py) · [data alignment and scheme comparison](../engine/optimizer/runner.py).

## 4. AI Research: Explaining Signals and Testing the Thesis

After candidates enter research, AI examines technical, fundamental, news, and sentiment evidence to assess the investment thesis behind each signal. Specialized roles and debates retain competing views.

| Stage | Roles and responsibilities | Output |
|---|---|---|
| Base research | Technical, fundamental, news, and sentiment research for each symbol | Views, evidence, risks, and data-quality notes |
| Research debate and stock proposals | Bull and bear arguments, research-manager adjudication, and per-stock trader proposals | BUY / SELL / HOLD, target weights, confidence, and reasons |
| Portfolio draft | Portfolio construction manager combines stock proposals with account constraints | Portfolio-level draft decisions |
| Risk debate | Aggressive, conservative, and neutral risk perspectives, followed by risk-manager adjudication | Risk assessments and revised decisions |
| Final decision | Portfolio manager combines research and risk conclusions | Final decision list and risk notes |

The number of role executions varies with symbol count and debate rounds. With the default single research-debate and risk-debate rounds, four stocks expand into 38 role tasks.

- **Traceable inputs**: shared research packets retain sources, dates, units, and gaps for quotes, financials, and news. Some derived metrics are calculated programmatically when inputs have comparable accounting bases.
- **Structured outputs**: roles exchange views, reasoning, risks, and evidence references through structured results. Stage outputs and original materials are archived separately.
- **Limits for incomplete research**: base research must meet configured completeness and citation thresholds. Failed holdings are forced to HOLD, failed new candidates are excluded, and an insufficient overall success ratio stops the round.
- **Counterarguments retained**: bull-bear and risk debates expose disagreements, with successive research, risk, and portfolio adjudication.

For example, a stock with strong momentum and volume scores still needs review: do financial results or events support the signal, is there counterevidence, and do valuation or entry conditions undermine it? AI then proposes action or HOLD. This illustrates the collaboration; it is not a recorded run or performance result.

Citations and schema checks improve traceability but do not automatically establish that sources or reasoning are correct. AI confidence expresses belief in a particular judgment: high confidence in HOLD does not imply a bullish outlook, and confidence cannot be substituted for a quantitative factor score.

Implementation: [multi-stage workflow](../app/plugins/dsh-investment-tools/lib/analysis-workflow.js) · [research data contract](RESEARCH_DATA_PIPELINE.md).

## 5. Risk Controls and Paper Execution

Final decisions contain an action, target weight, confidence, reason, and evidence references. At execution, the Python engine independently checks the account, quotes, and effective constraints.

- **Position and funding limits**: target weights are capped by both market and strategy per-stock limits. Order value, total exposure, cash reserve, turnover, and order-count limits further constrain tradable size.
- **Protective decisions take priority**: execution checks generate configured hard stops, trailing stops, and partial take-profit exits. A maximum-drawdown breach blocks new purchases and generates liquidation decisions.
- **Symbol and price validation**: decisions must use the allowed symbol pool. The engine obtains reference prices rather than executing AI-supplied prices directly.
- **Market-configured paper fills**: lot size, sellable quantity, T+1/T+0, price limits, commission, taxes, and slippage are checked or applied. Protective sales may also be blocked by trading rules, so a trigger does not guarantee immediate liquidation.
- **Reviewable receipts**: fills, rejection reasons, and account-embedded idempotency receipts are saved to prevent duplicate fills on retries.

Conservative, neutral, and aggressive mandates define different risk budgets. Effective parameters depend on the selected strategy, market configuration, and compatibility behavior; consult the current mandate and configuration. There is no single confidence threshold that applies to every market and strategy.

Manual research normally stops pending approval. When autonomous paper scheduling is enabled, it can submit paper decisions under the existing authorization and checks. Every path uses paper accounts.

Implementation: [strategy mandate](../engine/investment/mandate.py) · [risk controls](../engine/trading/risk.py) · [paper broker](../engine/trading/broker.py).

## 6. Interpreting Capabilities and Validation

Implemented capabilities include rule-based screening, quantitative allocation comparisons, multi-agent evidence research, and paper-execution records. These support reviewing why a candidate was selected, why action or HOLD was proposed, and why risk controls restricted an order. They do not establish investment performance.

The repository also contains a lightweight momentum-rule backtest with return, drawdown, Sharpe, and cost metrics. It uses simplified price and cost assumptions, does not replay the complete multi-agent decision process, and does not reproduce all paper-broker rules.

Evaluating the full strategy still requires defined sample periods, point-in-time data, benchmarks, out-of-sample intervals, costs, and execution assumptions. Candidate scores, historical optimizer metrics, individual research cases, and passing software tests cannot replace that validation.

> This project supports investment research and paper trading only. It does not connect to a live broker and does not constitute investment advice.
