# freqtrade-mcp 调研报告

调研日期：2026-10-03 · 调研范围：Freqtrade 生态中所有以 "freqtrade-mcp" 命名的 MCP 服务器、父项目 Freqtrade 本体、以及可对标的产品形态
调研方式：一手仓库元数据（GitHub API）、一手源码（`__main__.py`、`ft_rest_client.py`）、官方文档、本机 DSH 运行时实机核查

---

## 0. 结论摘要

1. **"freqtrade-mcp" 不是官方项目，也不是一个项目**：GitHub 上同名实现至少 4 个，定位分成两类——**交易遥控器**（给 LLM 下单/启停机器人的权限）与**只读内省**（让 LLM 读懂 Freqtrade 源码以写策略）。两者风险等级差一个数量级。
2. **最出名的那个（kukapay，146★）恰恰是最不该用的**：单文件（10.6 KB）、无测试无 CI、最后提交 2025-12-06（停滞约 10 个月），且其下单工具在当前 Freqtrade 上大概率直接报错（见 §3 代码级核查）。
3. **真正有长期价值的是父项目 Freqtrade 本体**（55.0k★，2026-10-03 仍在提交）：它把"数据下载 → 回测 → 超参优化 → 前视偏差分析"的量化研究闭环做成了工业级工具，这部分能力与 MCP 无关，也**拿不到**（MCP 只转发 REST API，回测/hyperopt 走 CLI）。
4. **对本项目（ai-trading-automation）的结论：不建议引入任何交易遥控器型 MCP**。本项目只有纸面撮合、唯一执行入口是带幂等键与决策指纹的 `POST /api/commands/issue`；外挂一个能 `forceenter/stop/start` 的 MCP 等于在硬风控之外开一扇门。市场也不匹配（本项目 cn/hk/us/etf，Freqtrade 只做加密）。
5. **可安全借鉴的是三件事**：Freqtrade 的研究闭环设计、[QuantDesk](https://github.com/0xbet-ai/QuantDesk) 的产品立场（AI 只做研究与验证，paper 是终点、实盘是明确 non-goal）、以及 dasein108 那种"agent 自己跑回测/超参"的闭环思路。
6. **底座能力已就绪**：本机 DSH 内置 `@deepseek-ai/dsh-mcp-client`（实机核查，见 §6），真要接 MCP 服务器，是 profile 配置一行的事，不需要改引擎。但本仓库当前 MCP 配置为零。

---

## 1. 生态全景（实测数据，2026-10-03）

| 项目 | 语言/许可 | ★ / fork | 最后提交 | 定位 | 工具数 | 采用度 |
|---|---|---|---|---|---|---|
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade)（父项目） | Python / **GPL-3.0** | 54,993 / 11,382 | 2026-10-03（活跃） | 加密交易机器人本体 | — | 行业事实标准 |
| [kukapay/freqtrade-mcp](https://github.com/kukapay/freqtrade-mcp) | Python / MIT | 146 / 40 | 2025-12-06（**停滞 10 个月**） | 交易遥控器（REST 转发） | 17 | 同名项目里最高，但无发布包，只能 git clone |
| [furkankoykiran/freqtrade-mcp](https://github.com/furkankoykiran/freqtrade-mcp) | TypeScript / MIT | 2 / 1 | 2026-04-04（当天即止） | 交易遥控器（REST 转发） | 15 | npm 月下载 **66**（2026-09-02~10-01） |
| [yalcin/freqtrade-mcp](https://github.com/yalcin/freqtrade-mcp) = PyPI `freqtrade-mcp-server` | Python / **GPL-3.0** | 17 / 2 | 2026-08-08 | **只读**代码库内省（帮 LLM 写策略） | 13 | 0.2.0 于 2026-08-08 发布 |
| [dasein108/freqtrade_dev_mcp](https://github.com/dasein108/freqtrade_dev_mcp) | Python / MIT | 9 / 4 | 2026-09-22（活跃） | 研发闭环：数据/回测/超参 + LangGraph 自迭代 agent | 12 | alpha；接口可能变 |
| [0xbet-ai/QuantDesk](https://github.com/0xbet-ai/QuantDesk)（产品参照） | TypeScript / **AGPL-3.0** | 22 / 2 | 2026-04-14 | AI-agent 量化研究工作台（paper 为终点） | — | 把 Freqtrade 当可插拔引擎 |

> 注：GitHub `search/repositories?q=freqtrade+mcp` 共 16 个命中，其余多为 0★ 的一次性仓库或营销型聚合仓库，不具参考价值。

---

## 2. Freqtrade 本体：它到底强在哪

- **能力面**：pandas 策略 → `download-data` → `backtest` → `hyperopt`（买/卖/ROI/止损/追踪止损参数搜索）→ FreqAI（ML / 强化学习）→ dry-run 或实盘；Telegram / FreqUI / REST API / WebSocket / Webhook 四条控制通道。
- **交易所**：官方支持 12 家现货（Binance、Bybit、Bybit EU、OKX、MyOKX、Kraken、Gate、Gate EU、HTX、Bitget、BingX、Hyperliquid DEX）+ 7 家期货（Binance、Bitget、Bybit、Gate、Hyperliquid、Kraken、OKX），底层 ccxt，其余交易所"不保证可用"。
- **工程质量**：JOSS 论文、CI + codecov、多版本兼容策略、明确的 deprecated 时间表（例如 edge 模块 2023.9 弃用、2025.6 移除）。
- **硬边界**：
  - **只有加密货币**，没有 A 股/港股/美股/ETF；
  - **GPL-3.0**：分发衍生作品必须整体 GPL；
  - REST API 默认仅监听 `127.0.0.1:8080`、**明文 HTTP 无 TLS**、Basic Auth / JWT；官方明确警告"不要暴露到公网"；
  - 官方免责声明写明"仅供教育用途，先用 dry-run"，并强调使用者需具备 Python 与阅读源码的能力。

---

## 2.5 量化逻辑拆解（源码级，2026-10-03 核对 develop 分支）

> 结论先行：**MCP 那一层没有量化逻辑**——它既不算指标、也不定仓位、也不判出场，只是把 Freqtrade REST API 的十几个端点包装成工具。真正的量化逻辑全部在 Freqtrade 内部，可拆成"信号 → 仓位 → 风控出场 → 优化"四层。

### 2.5.1 每根 K 线一次的决策链

```
交易所 OHLCV (ccxt)
   │
   ▼  populate_indicators()          ← 指标全靠策略作者写（pandas / TA-Lib / numpy）
   ▼  populate_entry_trend()          ← 写成 0/1 列：enter_long / enter_short + enter_tag
   ▼  populate_exit_trend()           ← 写成 0/1 列：exit_long / exit_short + exit_tag
   ▼  取「最新一根已收盘 K 线」并消解冲突
   ▼  confirm_trade_entry()           ← 策略可否决（返回 False 即不下单）
   ▼  算 stake（见 2.5.3）
   ▼  下单 → 此后每根 K 线跑出场优先级表（见 2.5.4）
```

信号判定的确切规则（`interface.py:1373-1390`）：`enter_long == 1` **且** `exit_long / enter_short` 都不为 1，才算做多入场；做空同理且要求 `trading_mode != spot` 且 `can_short`。`ignore_expired_candle` 处理"K 线已过期才轮到分析"的情况。

**关键点：Freqtrade 不提供任何因子库。** 指标、阈值、组合条件全部由策略文件承担；框架只保证"信号 → 订单"这段是确定性的。`enter_tag` / `exit_tag` 也不是逻辑，只是标签，用于事后按标签做绩效归因（`/entries`、`/exits`、`/mix_tags`）。

### 2.5.2 出场优先级表（整套框架最硬的一条规则）

代码里写死的顺序（`interface.py:1504-1520` 的 `# Sequence:` 注释，与 `backtesting.md:581-585` 一致）：

| 顺序 | 触发条件 | 实现位置 |
|---|---|---|
| 1 | **Exit-signal / custom_exit**（可被 `exit_profit_only` + `exit_profit_offset` 限制为"仅在盈利时按信号出场"） | `interface.py:1469-1502` |
| 2 | **Stoploss / Liquidation** | `ft_stoploss_reached()` `interface.py:1605-1673` |
| 3 | **ROI**（`minimal_roi` 时间衰减表；`ignore_roi_if_entry_signal` 可跳过） | `min_roi_reached()` `interface.py:1719-1732` |
| 4 | **Trailing stoploss** | `ft_stoploss_adjust()` `interface.py:1524` |

`should_exit()` 返回一个**有序列表**，`_check_and_execute_exit()` 取第一个 `exit_flag` 为真的执行（`freqtradebot.py:1578-1595`）——所以"谁先发生"完全由这张表决定。

两个容易踩的细节：

- **ROI 是时间衰减表**：取"键 ≤ 持仓分钟数"中最大的那个键对应的阈值，`current_profit > roi` 即触发（`interface.py:1705-1732`）。`custom_roi` 只能**更紧**不能更松——代码取两者的较小值（`interface.py:1713-1717`）。
- **追踪止损靠一个标志位区分**：`trade.is_stop_loss_trailing` 为真时，同一个 stoploss 命中会被记为 `TRAILING_STOP_LOSS` 而不是 `STOP_LOSS`（`interface.py:1656-1665`）。

另有一层与出场正交的**保护器**（`docs/includes/protections.md`）：`StoplossGuard`（窗口内止损次数超限则停手）、`MaxDrawdown`、`LowProfitPairs`、`CooldownPeriod`。它们的作用是"**暂停开新仓**"，不平仓。

### 2.5.3 仓位公式（`wallets.py`）

```python
# available：可动用的总额度
available = (free + tied_up) * tradable_balance_ratio - tied_up        # wallets.py:314-345

# stake：单笔下注
if stake_amount == "unlimited":
    stake = min((available + tied_up) / max_open_trades, available)    # wallets.py:347-359
else:
    stake = stake_amount                                              # 固定金额

# 尾仓补齐：剩余额度不足 stake * last_stake_amount_min_ratio 时直接放弃
if amend_last_stake_amount and available > stake * last_stake_amount_min_ratio:
    stake = min(stake, available)                                     # wallets.py:361-383
```

即：**单笔风险 = min(固定额或均分额, 可用额度)**，`max_open_trades` 通过"均分"参与风险预算；`available_capital` 可把起始资金钉死（回测复现用）。策略还可以用 `custom_stake_amount()` 回调覆盖，并用 `adjust_trade_position()` 做加仓/减仓（DCA），但每次调整都受 `validate_stake_amount()` 的上下限约束（`wallets.py:408-429`）。

### 2.5.4 优化层：把策略参数当超参搜

- **hyperopt**：optuna + `NSGAIIISampler`，`--spaces buy sell roi stoploss trailing protection` 圈定搜索空间，固定随机种子可复现（`hyperopt.md:73-90、503-555、754`）。
- **目标函数是 loss，共 12 个内置**：`ShortTradeDur`（默认）、`OnlyProfit`、`Sharpe`、`SharpeDaily`、`Sortino`、`SortinoDaily`、`MaxDrawDown`、`MaxDrawDownRelative`、`MaxDrawDownPerPair`、`Calmar`、`ProfitDrawDown`、`MultiMetric`（同时权衡收益、回撤、盈亏比、期望、胜率并对低交易数罚分）（`hyperopt.md:471-493`）。
- **FreqAI**：可换 ML/RL 路线（LightGBM / XGBoost / PyTorch，含强化学习），把"因子 → 信号"整段交给模型。

### 2.5.5 回测的量化假设（决定这些数字有多可信）

官方在 `backtesting.md:556-589` 明文列出 K 线内路径不可知时的替代假设，其中对量化结论影响最大的四条：

1. **同一根 K 线内 Stoploss 先于 ROI 判定** —— 所以回测里 `stoploss` 出场比例会明显高于 dry-run/实盘（原文直言这一点）。
2. **低点先于高点**（"protecting capital first"）、**Exit-signal 优先于 Stoploss**（假设信号在 K 线开盘触发）。
3. **无滑点**，只要价格在 K 线高低区间内就按请求价全额成交；ROI 出场以 high 比较但按 ROI 值成交，且"永不低于 K 线"。
4. 官方兜底句：**"backtesting will never replace running a strategy in dry-run mode."**

配套的自证工具：`lookahead-analysis`（查前视偏差）、`recursive-analysis`（查指标递归/预热期偏差）——这两个子命令的存在本身就说明"回测漂亮 ≠ 策略有效"。

### 2.5.6 那么 MCP 层到底贡献了多少量化逻辑？—— 负贡献

- kukapay 的 17 个工具里，量化相关只有 `fetch_market_data` / `fetch_performance` / `fetch_profit` 三个，且全部是**原始数据转发**。
- **最要命的一处**：`fetch_market_data` 调 `client.pair_candles(pair, timeframe)`，**不传 `limit`、不传 `columns`**。而 Freqtrade 的 `/pair_candles` 支持 POST + `columns` 参数，可以返回**策略已分析过的 DataFrame（含全部指标列）**。也就是说：这个 MCP 主动把模型能看到的量化信息降级成了"裸 OHLCV"——模型必须自己重算指标，而它算出来的指标与机器人实际决策所用的指标**不保证一致**。模型和机器人跑的是两套逻辑，这比 `forcesell` 那个崩溃 bug 严重得多。
- 它自带的两个 prompt（`analyze_trade` / `trading_strategy`）也只是"把 OHLCV 塞给模型让它自由发挥"，没有任何因子、阈值、统计检验或样本外验证。
- 对照另外两个：yalcin 的只读 server **零量化逻辑**（它是签名/文档检索）；dasein108 的 dev MCP **有**量化逻辑，但逻辑在 Freqtrade 侧（回测/hyperopt），MCP 只是把 CLI 包了一层——这也解释了为什么它比"遥控器"型更有价值。

### 2.5.7 与本项目的对照

| 维度 | Freqtrade + MCP | ai-trading-automation |
|---|---|---|
| 因子/指标算在哪 | 策略文件里（开发者自写） | 引擎内确定性计算（六因子加权评分等） |
| AI 的角色 | 可拿到裸 K 线 + 强制下单权 | 只做解释与取舍，结论必须引用证据 |
| 出场判定 | 固定优先级表（信号→止损→ROI→追踪） | 止损止盈优先于 AI 建议 + 回撤熔断强制清仓 |
| AI 能否绕过风控 | **能**（`forceenter` 绕过策略信号） | 不能（授权书 + Python 硬风控 + 幂等键） |
| 优化方法 | hyperopt（optuna + loss） | 参数可配置，未见自动超参搜索 |

两者其实在解同一个问题——**"别让 LLM 直接算数、直接下单"**——只是切分点不同：Freqtrade 把不确定性关进策略文件，ai-trading-automation 把不确定性关进因子引擎与风控层。

---

## 3. 交易遥控器型 MCP 解构（以 kukapay 为例）

### 3.1 架构

```
LLM 客户端 (Claude Desktop / Cursor / Cline / DSH)
   │  MCP stdio (JSON-RPC)
   ▼
freqtrade-mcp  (FastMCP，单文件 __main__.py)
   │  freqtrade-client (官方轻量 REST 客户端)
   ▼
Freqtrade bot  /api/v1  (127.0.0.1:8080, Basic Auth)
```

没有任何中间层：模型 → 工具 → 机器人 REST。没有审批、没有幂等、没有风控、没有只读/写入分组。

### 3.2 工具面（17 个）

- **只读 10 个**：`fetch_market_data` / `fetch_bot_status` / `fetch_profit` / `fetch_balance` / `fetch_performance` / `fetch_whitelist` / `fetch_blacklist` / `fetch_trades` / `fetch_config` / `fetch_locks`
- **写入 7 个**：`place_trade` / `start_bot` / `stop_bot` / `reload_config` / `add_blacklist` / `delete_blacklist` / `delete_lock`

### 3.3 代码级核查（我读了 `__main__.py` 与官方 `ft_rest_client.py`）

| 核查项 | 结果 |
|---|---|
| 项目形态 | 单文件 10,594 字节，无测试、无 CI、无发布包；`requires-python = ">=3.13"` |
| 环境变量默认值 | `FREQTRADE_PASSWORD` 默认硬编码为官方样例口令 `SuperSecret1!` |
| `place_trade(side="sell")` | 调用 `client.forcesell(...)` —— **当前 freqtrade-client 已无 `forcesell` 方法**（源码中只有 `forcebuy` L341、`forceenter` L351、`forceexit` L395）→ 必然 `AttributeError` |
| `place_trade(side="buy")` | 调用 `client.forcebuy(...)`；而官方 REST API 端点表当前只列 `/forceenter` 与 `/forceexit`，`forcebuy/forcesell` 属 API 1.11 时代命名（当前 `API_VERSION = 2.50`）→ 买入路径能否成功需实机验证，**不能假定可用** |
| 返回值 | 全部 `str(dict)`，无结构化输出、无 schema，模型侧解析成本高 |
| 维护状况 | 7 个 open issue 里 4 个是第三方徽章/营销 PR（最早 2025-07 挂到现在无人处理），仓库实质处于无人维护状态 |

**结论**：这个"最流行"的实现，是一份 2025 年初写的一次性胶水代码，在 2026 年的 Freqtrade 上属于**未经验证、部分必然损坏**的状态。它的价值只剩"示范了 MCP→REST 的 30 行写法"。

---

## 4. 只读内省型（yalcin / PyPI `freqtrade-mcp-server` 0.2.0）

- **做什么**：把**已安装的 Freqtrade 代码库**作为只读知识源暴露给 LLM——可覆写方法签名、类 MRO/属性、枚举值、回调详情、config schema、DataFrame 列、文档检索与版本信息，共 13 个工具。
- **安全姿态（作者自述 + 设计）**：不交易、不连交易所、不碰资金；只用 `inspect`/`ast`（无 `eval/exec`）；搜索走静态解析而非 import；输入白名单 + 长度限制；命名空间限制在 `freqtrade.*`；stdio 本地传输。
- **代价**：Python ≥3.13、freqtrade ≥2026.2、**GPL-3.0**；必须与目标 Freqtrade 装在同一个环境里（否则内省到的是另一份副本）。
- **适用性判断**：它是"给写 Freqtrade 策略的人用的文档加速器"。对**不写 Freqtrade 策略**的项目（比如本项目）价值接近于零；对本项目真正有借鉴意义的是它的**安全设计范式**——只读、白名单、静态解析、无副作用。

---

## 5. 研发闭环型（dasein108/freqtrade_dev_mcp）与产品参照（QuantDesk）

**freqtrade_dev_mcp**（MIT，2026-09-22 更新）值得单独看，因为它把 AI 放在了**正确的位置**：

- 12 个工具全部围绕研发：`create_config` / `create_strategy` / `download_candles`（支持"最近 3 个月"这类自然语言区间）/ `backtest_strategy` / `hyperopt_strategy` / `extract_backtest_data` / `extract_hyperopt_data` / `search_results`（SQLite 索引）/ `list_results` …
- 附带一个 LangGraph agent 跑完整闭环：`生成想法 → 写策略 → 下载数据 → hyperopt → 回测 → 分析 → 不达标就重写`，可配 `MAX_ITERATIONS`、`MIN_PROFIT_THRESHOLD`。
- 文档里主动写了防过拟合要求："用 hyperopt 没见过的时段做 walk-forward 验证"。
- 状态是 **alpha**，接口会变；文件写入工具被限制在 `FREQTRADE_MCP_PATH` 之内。

**QuantDesk**（AGPL-3.0）是最贴近本项目形态的产品参照，其产品立场值得抄：

- 卖点是"**把 AI 放在研究与验证环节**"，而不是让 AI 直接交易；README 明确写 "does **not** focus on AI agents executing trades autonomously… cost-inefficient and unrealistic at scale"。
- 四级流水线：描述策略 → 回测迭代 → 独立 Risk Manager 查过拟合/前视偏差/幸存者偏差 → **paper trading 是终点**，实盘需要交易所私钥，"a different trust model and an explicit non-goal"。
- 工程上：所有脚本跑在隔离 Docker 容器里、per-desk git 版本化、每次 run 绑定 commit hash 保证可复现、引擎可插拔（Freqtrade=经典 TA，Nautilus=事件驱动 tick 级，Generic=让 agent 自己写脚本）。
- 技术栈：Express + PostgreSQL(embedded) + React 19 + Claude/Codex CLI 子进程。

> 对本项目的映射：QuantDesk 的"Analyst → Risk Manager → Paper"与 ai-trading-automation 的"13 角色委员会 → 硬风控 → 纸面撮合"是同一个产品哲学；差别是它把容器隔离和版本可复现做成了默认。

---

## 6. 若要接入 MCP：本机 DSH 的确切接入面（实机核查）

**事实核查结论：能力已内置，配置为零。**

- DSH 发行包内含 MCP 客户端插件 `@deepseek-ai/dsh-mcp-client`（含 `lib/index.js` 35 KB、`README.zh.md` 17 KB、`package.json`，捆绑版本 `0.2.0-rc.2`；本机安装树 `D:\DeepSeek\dsh\profiles\node_modules\@deepseek-ai\` 下也有 `dsh-mcp-client` / `dsh-mcp-resources` 链接）。
- 本仓库 `app/`、`config/`、`engine/` 内 **MCP 相关命中为零**（仅有 package-lock 的传递依赖与 `engine/api/__init__.py` 里 "MCP bridge (P1)" 的规划注释）。当前的"AI 调工具"实际是回环 HTTP + `X-ATA-Token` 的 MCP **式**桥，不是真 MCP。

**接入写法**（profile patch 的一行 `insert`，与 [`app/profiles/investment/cordis.patch.yml`](../app/profiles/investment/cordis.patch.yml) 同构）：

```yaml
- insert:
    - id: mcp-freqtrade-readonly
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: freqtrade
        transport: stdio
        command: uv
        args: ['--directory', 'D:/path/to/freqtrade-mcp', 'run', '__main__.py']
        env:
          FREQTRADE_API_URL: http://127.0.0.1:8080
          FREQTRADE_USERNAME: Freqtrade
          FREQTRADE_PASSWORD: !!js process.env.FREQTRADE_PASSWORD
        toolCallTimeoutMs: 60000
        failOnStartupError: false
```

关键细节（来自插件自带文档）：

| 细节 | 说明 |
|---|---|
| 工具命名 | 统一暴露为 `mcp__<serverName>__<tool>`，例如 `mcp__freqtrade__fetch_profit`，与 Claude Code/Codex 命名形态一致，会话历史与权限规则在重启后仍有效 |
| 传输 | `stdio`（本地进程）或 `streamable-http`（远端）；stdio 会先起一个探测进程再起正式进程 |
| **环境清洗** | 子进程环境基座会**删除所有匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的变量以及全部 `DSH_*`**，再合并 `env` → 依赖继承环境传密码会失效，必须显式写进 `env` |
| 权限 | 桌面壳固定 `danger-full-access`、审批关闭（`app/presets/investment/agent.cordis.yml`），所以 **MCP 工具一旦接入即对模型直接可用**，安全必须在 server 侧做（只读白名单） |
| 失败行为 | 未设 `failOnStartupError` 时连接失败只是该服务器工具不出现，不阻止 harness 启动 |
| 门禁 | profile patch 引用的插件必须存在，需过 `app/scripts/check-plugins.mjs`；配置行经 `app/scripts/seed.ps1` 播种到 `$DSH_HOME` |

**风险提示**：把 `place_trade/start_bot/stop_bot` 这类工具与 `investment_*` 工具摆在同一个工具面上，模型极容易混淆两套账本；且这些工具会绕过 `engine/trading/decision_execution.py` 的幂等键、决策指纹与 `mode=paper` 强制。**如果一定要接，只接只读工具。**

---

## 7. 三条接入路径的取舍（针对本项目）

| 路径 | 做法 | 改动面 | 风险 | 建议 |
|---|---|---|---|---|
| **A. 不接入** | 继续自研研究闭环，设计上参考 Freqtrade 的 hyperopt/前视偏差分析 | 0 | 无 | ✅ **推荐** |
| **B. 只读 MCP** | 自写 10 个只读工具（或直接用 yalcin 的内省 server），走 profile patch 接入 | 仅 `app/` | 低（需防工具面混淆） | ⭕ 有加密行情需求再做 |
| **C. 引擎内适配器** | 在 `engine/data` 加密行情 provider，成交仍走纸面 broker | `engine/`（需先扩 market 枚举） | 中 | ⭕ 只有决定扩展加密市场时 |
| **D. 直连下单 MCP** | 官方 freqtrade-mcp 全线接入 | 仅 `app/` | **高**：绕过硬风控与幂等 | ❌ 不建议 |

许可证提醒：Freqtrade 与 yalcin 的 server 是 **GPL-3.0**，QuantDesk 是 **AGPL-3.0**（含网络服务条款），而本项目是 MIT。**跨进程调用是常见缓解手段，但整段拷代码进产品会造成许可冲突**（本条为工程判断，非法律意见）。

---

## 8. 建议的最小验证实验（若要继续）

1. **验证 API 漂移**：起一个 Freqtrade（Docker + dry-run），`curl -u user:pass http://127.0.0.1:8080/api/v1/show_config`，再实测 `POST /forcebuy` 与 `POST /forceenter` 的返回，确认 kukapay 的实现到底哪几个工具还活着。
2. **验证 MCP 桥**：用 `npx @modelcontextprotocol/inspector` 连 kukapay 的 server，确认 17 个工具的 schema 与调用成功率（不要连真实资金账户，用 dry-run）。
3. **验证 DSH 接入**：在 dev profile 里加一行只读 MCP（如 `server-filesystem`），确认工具以 `mcp__<name>__<tool>` 出现、权限与超时行为符合预期，再决定是否接交易类。
4. **验证研究闭环价值**：直接 `pip install freqtrade`（或 Docker），在**本项目自己的数据**上跑一次 `download-data → backtest → hyperopt`，评估把这套流程移植到 cn/hk/us/etf 的工作量。

---

## 9. 未验证 / 存疑项（不要当成结论）

- `/forcebuy` 端点是否仍在当前版本可用：官方端点表未列，本次未做全量源码核对，**需实机 curl 验证**。
- 各 MCP server 与当前 MCP 协议版本（2026-07-28 / 2.0.0 SDK）的兼容性：**未实测**。
- dasein108 与 QuantDesk 的代码质量：**仅读 README 与元数据，未做代码审计**。
- DSH MCP 插件在本机 0.1.6-alpha 运行时上的实际加载行为：本机安装树中的 junction 指向的 pnpm 目录已失效（dangling），**需在启用时实测**。

---

## 10. 附：官网 / 官方阵地核查（2026-10-03）

### 10.1 结论：`freqtrade-mcp` 这个名字下**不存在官网**

核查方式与证据：

| 核查项 | 结果 |
|---|---|
| 7 个候选域名 DNS 解析（`freqtrade-mcp.com/.io/.dev/.org/.net/.ai`、`freqtrademcp.com`） | **全部 NXDOMAIN**（域名未注册） |
| GitHub Pages（`kukapay.github.io/freqtrade-mcp`、`yalcin.github.io/freqtrade-mcp`） | 均 HTTP 404（两个仓库的 `has_pages` 也都是 `false`） |
| Vercel / Netlify 同名站点 | 404 |
| GitHub 全站 `freqtrade+mcp` 共 16 个仓库 | 只有 3 个填了 homepage：`yalcin` 填的是自己的 GitHub 地址、`furkankoykiran` 填的是 **https://freqtrade.io**、另外两个是第三方公司站（coraxcolab.com、entryriskscore.com） |
| 三个主要仓库的 `homepage` 字段 | kukapay 为空；furkankoykiran 指向 freqtrade.io；yalcin 指向自己的仓库 |

### 10.2 你看到的"官网"最可能是这两类

1. **父项目 Freqtrade 的官网**：https://www.freqtrade.io —— kukapay 的 README 通篇链接它，furkankoykiran 更是直接把 `homepage` 填成它。所以"顺着仓库点进去看到一个正经官网"是必然的，但那是 **Freqtrade 本体的站点，不是 MCP 包装层的**。
   - 注意：`freqtrade.io`（不带 www）实测 404，根路径 `/` 也 404，真正的入口是 **https://www.freqtrade.io/en/stable/**。
2. **第三方 MCP 目录站**（自动抓取 GitHub README 生成的"产品页"，带图标/收藏/分享，很像官网）：
   [mcpmarket.cn（中文）](https://mcpmarket.cn/server/67e5dd8548048b1e353cd2c7)、[glama.ai](https://glama.ai/mcp/servers/kukapay/freqtrade-mcp)、[mcp.aibase.com](https://mcp.aibase.com/server/1916341274132848641)、[ubos.tech](https://ubos.tech/mcp/freqtrade-mcp/)、[trackmcp.com](https://trackmcp.com/tool/kukapay--freqtrade-mcp)、[skillsindex.dev](https://skillsindex.dev/tools/kukapayfreqtrade-mcp/)。
   这些站点还会发 **"安全评分 100/100"、"Glama A-Tier"** 之类徽章——正好对应 kukapay 仓库里那 4 个从 2025 年挂到现在、无人处理的营销 PR。**"官网感"是目录站提供的，不是项目自带的。**

### 10.3 Freqtrade 的官方阵地（唯一真正的"官网"）

| 阵地 | 地址 | 备注 |
|---|---|---|
| 官网 / 文档 | https://www.freqtrade.io | mkdocs 站点；版本入口 `/en/stable/`、`/en/develop/` |
| 主仓库 | https://github.com/freqtrade/freqtrade | 54,993★，GPL-3.0 |
| 官方 UI | https://github.com/freqtrade/frequi | 1,086★，FreqUI 前端 |
| 官方策略库 | https://github.com/freqtrade/freqtrade-strategies | 5,520★ |
| 指标库 | https://github.com/freqtrade/technical | 1,033★ |
| 终端 UI | https://github.com/freqtrade/ftui | 248★ |
| 社区 | Discord（文档首页给出的邀请链接 `discord.gg/p7nuUNVfP7`） | — |
| 发行包 | PyPI `freqtrade` **2026.9**、`freqtrade-client` **2026.9** | 官网未列 Docker Hub 之外的托管服务 |
| 学术引用 | JOSS 论文 DOI `10.21105/joss.04864` | 文档首页徽章 |

### 10.4 官方**没有** MCP 支持

- 抓取的 17 份官方文档（strategy/backtest/hyperopt/plugins/rest-api/freqai/…）+ 5 个核心源码文件（`interface.py`、`freqtradebot.py`、`wallets.py`、`backtesting.py`、`exchange.py`）中，`MCP` / `modelcontextprotocol` **零命中**。
- 官方文档站的导航目录里也没有任何 MCP 章节。
- 这解释了为什么"freqtrade-mcp"必然没有官网：**它是社区三方包装层，官方从未认领。**

---

### 10.5 官网视角：Freqtrade 官方站点到底讲了什么

既然确认了"工具 = Freqtrade 本体"，这里按官网自身的内容组织补一份速览。

**官方自我定位**（[首页](https://www.freqtrade.io/en/stable/)原文）：

> "Freqtrade is a free and open source crypto trading bot written in Python. It is designed to support all major exchanges and be controlled via Telegram or webUI. It contains backtesting, plotting and money management tools as well as strategy optimization by machine learning."

**官网列出的能力**：用 Python/pandas 写策略 · 下载历史行情 · 回测 · 用 ML 做超参优化（买/卖/ROI/止损/追踪止损）· 静态或按成交量/价格自动选币 + 黑名单 · **dry-run 模拟**或实盘 · Telegram/FreqUI 控制 · 回测或交易历史（SQL）的进一步分析（Jupyter）。

**官网上没有的东西（这才是关键）**：

- **没有任何收益承诺**，首页只有一句免责声明："This software is for educational purposes only. Do not risk money which you are afraid to lose."
- **不卖策略、不卖信号、不提供托管**。官网的"Community showcase"里列的策略库、统计站、pairlist 生成器全部标注"not maintained by the freqtrade team"。
- 首页明确要求："Always start by running a trading bot in Dry-run"，并建议使用者具备 Python 能力、亲自读源码。
- 唯一的第三方背书是 JOSS 学术论文（DOI `10.21105/joss.04864`）——评审的是软件工程质量，不是策略收益。

> 一句话：**官网卖的是"执行框架 + 研究方法"，alpha 得自己写。** 55k star 衡量的是工程活跃度，不是策略有效性。

**官方推荐的上手路径**（[Docker Quickstart](https://www.freqtrade.io/en/stable/docker_quickstart/)，约 6 条命令）：

```bash
mkdir ft_userdata && cd ft_userdata
curl https://raw.githubusercontent.com/freqtrade/freqtrade/stable/docker-compose.yml -o docker-compose.yml
docker compose pull
docker compose run --rm freqtrade create-userdir --userdir user_data
docker compose run --rm freqtrade new-config --config user_data/config.json   # 交互式问答
docker compose up -d                                                          # 起 dry-run
# 回测：docker compose run --rm freqtrade backtesting --strategy SampleStrategy --timerange 20190801-20191001 -i 5m
```

官方在这页里插了一句警告，值得原样引用：**"Please always backtest your strategy and use dry-run for some time before risking real money!"**

**官方文档地图**（按"值不值钱"标注）：

| 分组 | 页面 | 评价 |
|---|---|---|
| 研究闭环 | Data Downloading · Backtesting · Hyperopt · **Lookahead analysis** · **Recursive analysis** | ★★★ 最值钱，前视/递归偏差自检是很多自研系统缺的 |
| 策略编写 | Strategy 101 / Customization / Callbacks / Stoploss / Plugins（pairlist + protections） | ★★★ 接口设计文档，可直接抄设计 |
| 执行与控制 | Bot Basics · Start the bot · Telegram · freqUI · REST API · Web Hook | ★★ 工程完备 |
| 机器学习 | FreqAI（配置/特征工程/参数表/RL/开发者）共 8 页 | ★★ 门槛高，需自备特征 |
| 运维与其他 | Installation · Utils · Plotting · Producer/Consumer · SQL Cheatsheet · FAQ · Migration · Deprecated | ★ |

**官方自己写明的硬边界**（容易忽略，但影响可行性判断）：

- **一个交易对同时只能有一个持仓**（FAQ），想加仓得用 `adjust_trade_position()`；
- **不支持 sandbox 账户**，官方理由是 sandbox 订单簿与流动性失真，请用 dry-run（FAQ）；
- **所有盈亏计算都含手续费**（backtesting/dry-run 用交易所最低档费率）；
- **Windows 上的 Docker 官方不推荐用于生产**，只建议做实验、下数据、回测——原文："we do not recommend the usage of docker on windows for production setups, but only for experimentation, datadownload and backtesting."（对 Windows 用户直接相关）；
- 硬件建议 2 vCPU / 2GB RAM / 1GB 磁盘；软件要求 Python 3.11+ 或 Docker；
- 当前发行版本：PyPI `freqtrade` **2026.9**（开发主线 `develop` 的 REST API 版本号 `API_VERSION = 2.50`）。

---

## 11. 主要来源

- [freqtrade/freqtrade（GitHub 仓库元数据，2026-10-03 抓取）](https://github.com/freqtrade/freqtrade)
- [Freqtrade 官方文档首页（能力与交易所支持）](https://www.freqtrade.io/en/stable/)
- [Freqtrade REST API 文档（端点表、安全警告、API v2.50）](https://www.freqtrade.io/en/stable/rest-api/)
- [Freqtrade 弃用特性时间表](https://www.freqtrade.io/en/stable/deprecated/)
- [kukapay/freqtrade-mcp（README + `__main__.py` + `pyproject.toml`）](https://github.com/kukapay/freqtrade-mcp)
- [furkankoykiran/freqtrade-mcp（TypeScript 版，15 工具）](https://github.com/furkankoykiran/freqtrade-mcp)
- [yalcin/freqtrade-mcp（只读内省）](https://github.com/yalcin/freqtrade-mcp) · [PyPI freqtrade-mcp-server 0.2.0](https://pypi.org/project/freqtrade-mcp-server/)
- [dasein108/freqtrade_dev_mcp（研发闭环 + LangGraph agent）](https://github.com/dasein108/freqtrade_dev_mcp)
- [0xbet-ai/QuantDesk（产品参照）](https://github.com/0xbet-ai/QuantDesk)
- [freqtrade-client `ft_rest_client.py`（方法清单核查）](https://raw.githubusercontent.com/freqtrade/freqtrade/develop/ft_client/freqtrade_client/ft_rest_client.py)
- 本机 DSH 运行时：`@deepseek-ai/dsh-mcp-client` 包内 `README.zh.md` / `package.json`（自 `app.asar` 提取）
