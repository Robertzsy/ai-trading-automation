# Freqtrade 量化交易全流程：一根 K 线 → 一笔成交

考察对象：`freqtrade/freqtrade` **develop 分支**（2026-10-03 快照，发行版 2026.9）
这份文档讲什么：**它的量化逻辑怎么写、每一步由哪段代码执行、用什么公式、一笔交易从入场到出场如何逐帧推进**——全程真实代码 + 真实默认值 + 数值走查。
不包含：工程结构（持久化/RPC/插件/FreqAI 见 [实现原理报告](RESEARCH_FREQTRADE_IMPLEMENTATION.md)）、可行性评估。

---

## 0. 一句话说清它的量化架构

```text
你写一段 pandas 表达式          ← 量化逻辑（唯一由人决定的部分）
        ↓ 输出：4 个 0/1 列
框架按写死的规则把"1"变成订单     ← 确定性执行（仓位公式、出场优先级、订单类型）
        ↓
订单 → 成交 → Trade 落库         ← 状态真值
```

**框架不认识 RSI、不认识布林带、不认识任何因子。** 它只认识 DataFrame 里的四列：`enter_long` / `exit_long` / `enter_short` / `exit_short`。所谓"量化交易"，在代码层面就是：

1. **人**把量化思想写成 pandas 布尔表达式 → 写进那四列；
2. **框架**读"最新一根已收盘 K 线"的那一行，按一套固定公式决定买什么、买多少、什么时候卖。

下面把这两半拆开，逐段走。

---

## 1. 量化逻辑写在哪：一份真实策略的全貌

官方模板 `freqtrade/templates/sample_strategy.py` 就是标准答案。它的结构分三块：**参数表**、**指标**、**信号**。

### 1.1 参数表（类属性，全部可被 config 覆盖）

| 属性 | 模板取值 | 作用 |
|---|---|---|
| `timeframe` | `"5m"` | K 线周期——决定了整个系统的节拍 |
| `minimal_roi` | `{"0": 0.04, "30": 0.02, "60": 0.01}` | **时间衰减 ROI 表**：持仓 0 分钟要求 +4%，30 分钟后只要 +2%，60 分钟后只要 +1% |
| `stoploss` | `-0.10` | 硬止损 −10% |
| `trailing_stop` | `False` | 追踪止损开关 |
| `can_short` | `False` | 是否允许做空 |
| `startup_candle_count` | `200` | **指标预热需要的 K 线数**（决定每次要多拉多少历史数据） |
| `process_only_new_candles` | `True` | 同一根 K 线只算一次 |
| `use_exit_signal` / `exit_profit_only` / `ignore_roi_if_entry_signal` | `True` / `False` / `False` | 出场信号的三个开关 |
| `order_types` | `entry/exit = "limit"` | 下单方式 |
| `INTERFACE_VERSION` | `3` | 策略接口版本 |

### 1.2 信号：一段布尔表达式写进一列（**这是量化逻辑的本体**）

`sample_strategy.py:373-382` 原文：

```python
dataframe.loc[
    (
        # Signal: RSI crosses above 30
        (qtpylib.crossed_above(dataframe["rsi"], self.buy_rsi.value))
        & (dataframe["tema"] <= dataframe["bb_middleband"])  # Guard: tema below BB middle
        & (dataframe["tema"] > dataframe["tema"].shift(1))   # Guard: tema is raising
        & (dataframe["volume"] > 0)                          # Make sure Volume is not 0
    ),
    "enter_long",
] = 1
```

逐条拆开看，这就是一个完整的量化入场规则：

| 条件 | 类型 | 含义 |
|---|---|---|
| `crossed_above(rsi, 30)` | **主信号** | RSI 上穿 30（超卖反转） |
| `tema <= bb_middleband` | 守卫 | 价格仍在布林中轨下方——只做"低位反弹"，不追高 |
| `tema > tema.shift(1)` | 守卫 | TEMA 正在上行——确认拐头方向 |
| `volume > 0` | **数据质量守卫** | 排除僵尸 K 线（成交量为 0 的数据不可信） |

出场同理（`:404-413`）：RSI 上穿 70 且 TEMA 在布林中轨上方且正在下行 → `exit_long = 1`。

**要点**：

- 整个 DataFrame 一次性算出所有信号（向量化），**框架只取最后一行的值**；
- 守卫条件的写法是这套体系的精髓：主信号负责"触发"，守卫负责"过滤掉不该触发的场景"，最后一条 `volume > 0` 属于**数据卫生**；
- 条件里的阈值可以来自超参对象：`self.buy_rsi.value` 对应上面声明的 `buy_rsi = IntParameter(low=1, high=50, default=30, space="buy", optimize=True, load=True)`（`:96`）——**改一个数字就能被 hyperopt 搜索**。

### 1.3 指标

`populate_indicators()`（`:146`）负责往 DataFrame 里加列（`rsi`、`tema`、`bb_middleband`…）。它是**唯一被 `@abstractmethod` 标记的方法**——框架强制你实现它，其余都是可选钩子。

---

## 2. 全流程时序：从 K 线收盘到一笔成交

```text
┌─ 每根 K 线 ─────────────────────────────────────────────────────────┐
│ ① worker 睡到"下一根 K 线 + 1 秒"醒来                                │ worker.py:145-187
│ ② process() 按固定 16 步执行                                         │ freqtradebot.py:306-362
│    ②.1 reload_markets                                               │
│    ②.2 取持仓 + 刷白名单（并入持仓对）                                │
│    ②.3 dataprovider.refresh()  ← 唯一拉数据入口                      │
│    ②.4 strategy.analyze()      ← 算指标 + 出信号（可跳过，见 ②.4 注） │ interface.py:1265
│    ②.5 manage_open_orders()    ← 超时撤单/改价                       │
│    ②.6 exit_positions()        ← ★ 先处理平仓                        │
│    ②.7 调仓（可选）                                                  │
│    ②.8 enter_positions()       ← ★ 后处理开仓                        │
│ ③ 落库 Trade.commit() + 消息推送                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**顺序不是随意的**：先平仓释放资金与槽位 → 再调仓占用资金 → 最后用剩余额度开新仓。这条规则在回测侧同样成立（文档原话："Exits free their trade slot for a new trade with a different pair"）。

> **②.4 的跳过机制**：同一根 K 线重复进入时，`_analyze_ticker_internal()` 会命中 `__last_candle_seen_per_pair` 而去重（`interface.py:1218-1235`），并且**主动删掉信号列**（`remove_entry_exit_signals`）——否则会用上一轮残留的信号反复下单。

---

## 3. 环节一：数据 → 指标

| 步骤 | 实现 |
|---|---|
| 拉多少根 | `exchange.klines()` 取 `candle_limit + startup_candle_count` 根（`exchange.py:369-372, 2973`）——多拉的正是预热部分 |
| 拉什么 | 主 pairlist 全部标的 + 所有 `informative_pairs`（多周期辅助） |
| 合并辅助周期 | `advise_indicators()` 在 `populate_indicators()` **之前**把 informative 列 merge 进主表（`interface.py:1827-1834`） |
| 算指标 | `populate_indicators()` 每 pair 一次，**整段历史一次算完** |
| 缓存 | key = `(pair, timeframe, candle_type)`（`dataprovider.py:88-102`） |

产出 DataFrame 的列结构：

```text
date, open, high, low, close, volume          ← 原始行情
+ rsi, tema, bb_middleband, ...               ← 你算的指标
+ enter_long, exit_long, enter_short, exit_short, enter_tag, exit_tag   ← 信号（0/1）
```

**关键认知**：`startup_candle_count` 不是"建议值"，而是**正确性参数**——它决定指标预热是否充分。预热不足会导致实盘算出的指标值与回测里的不一致（这就是 `recursive-analysis` 要检测的东西）。

---

## 4. 环节二：信号 → 交易意图

### 4.1 取哪一行

`get_latest_candle()`（`interface.py:1276-1319`）：默认取 DataFrame **最后一行**，并做过期检查——若该 K 线已过期超过 `timeframe × 2 + 5 分钟`，返回 `(None, None)`，本轮不交易。

### 4.2 冲突消解（做多/做空/观望的唯一判定）

`get_entry_signal()`（`interface.py:1373-1390`）原文逻辑：

```python
enter_long  = latest.get(SignalType.ENTER_LONG, 0) == 1
exit_long   = latest.get(SignalType.EXIT_LONG, 0) == 1
enter_short = latest.get(SignalType.ENTER_SHORT, 0) == 1
exit_short  = latest.get(SignalType.EXIT_SHORT, 0) == 1

if enter_long == 1 and not any([exit_long, enter_short]):
    enter_signal = SignalDirection.LONG
    enter_tag = latest.get(SignalTagType.ENTER_TAG, None)
if (config["trading_mode"] != SPOT and can_short and enter_short == 1
        and not any([exit_short, enter_long])):
    enter_signal = SignalDirection.SHORT
```

三条硬规则：

1. **必须是 `== 1`**（不是真值判断）：`0.9` 不算信号，`True`/`1.0` 算；
2. **互斥**：`enter_long` 与 `exit_long`/`enter_short` 同时为 1 → 这一轮**观望**；
3. 做空需要 `trading_mode != spot` **且** `can_short = True`。

### 4.3 意图还要过三关（都在下单之前）

| 关卡 | 位置 | 说明 |
|---|---|---|
| 保护器锁 | `is_pair_locked()`（`freqtradebot.py:869-889`） | 若 `PairLocks` 有该 pair 的有效锁 → 直接放弃 |
| 深度检查（可选） | `_check_depth_of_market()`（`:893-905`） | 订单簿买卖盘比例不达标则放弃 |
| 策略否决 | `confirm_trade_entry()`（`:1113-1126`） | 返回 `False` 即不下单——最后一道人工逻辑闸门 |

---

## 5. 环节三：意图 → 仓位（公式 + 默认值）

### 5.1 用掉几个槽位

```python
# freqtradebot.py:410-416
get_free_open_trades() = max(0, config["max_open_trades"] - 已持仓数)
```

`max_open_trades` 是**必填配置**（schema 无默认值），`-1` 表示无限。

### 5.2 单笔下注额（三种分支，`wallets.py`）

```python
# ① 可用额度（wallets.py:336-345）
total_stake = (占用 + 可用余额) × tradable_balance_ratio      # 默认 0.99
available   = min(total_stake − 占用, 可用余额)

# ② 单笔下注（wallets.py:347-359, 385-406）
if stake_amount == "unlimited":
    stake = min((available + 占用) / max_open_trades, available)
else:
    stake = stake_amount                                     # 固定额

# ③ 尾仓补齐（wallets.py:369-375，默认关闭）
if amend_last_stake_amount:                                  # 默认 False
    if available > stake × last_stake_amount_min_ratio:       # 默认 0.5
        stake = min(stake, available)
    else:
        stake = 0                                            # 残额太小 → 不做这笔

# ④ 余额不足且未开补齐 → 抛异常；stake 为 0 → 静默放弃该标的
```

### 5.3 从"钱"到"数量"

```python
# freqtradebot.py:1090-1111
amount = (stake_amount / enter_limit_requested) × leverage
```

随后两道校验：

- **精度**：数量按交易所精度**向下取整**（`exchange.py:1519-1523`），取整后为 0 则放弃（`backtesting.py:1184-1186` 同理）；
- **限额**：最小下单额计算里叠加两层预留（`exchange.py:1160-1192`，默认 `amount_reserve_percent = 0.05`）：

```python
margin_reserve   = 1.0 + 0.05                                  # 默认预留 5%
stoploss_reserve = margin_reserve / (1 − |stoploss|)           # 再为止损留空间，上限 1.5
max_allowed      = min(交易所 max、可用额度)                    # 取严
```

---

## 6. 环节四：意图 → 订单

### 6.1 用什么价

| 配置 | 默认 | 含义 |
|---|---|---|
| `entry_pricing.price_side` | `"same"` | 买入取 **ask**、卖出取 **bid**（`same` = 顺着方向） |
| `entry_pricing.price_last_balance` | `0` | 在盘口价与最新成交价之间插值，`0` = 纯用盘口价 |
| `entry_pricing.use_order_book` | `False` | 开启后按订单簿档位取价（越界抛 `PricingError`） |

取价链：`exchange.get_rate(side="entry")`（`exchange.py:2304-2422`）→ 盘口价 / 订单簿档位 → TTL 缓存（`_entry_rate_cache`）。

### 6.2 用什么方式下单

- 订单类型来自策略的 `order_types["entry"]`（模板是 `limit`）；
- 限价单未成交会走超时逻辑：`unfilledtimeout`（`entry` 分钟数 + `unit` 默认 `minutes`）到点撤单（`freqtradebot.py:1769-1800`）；重新挂价走 `adjust_order_price` → `adjust_entry_price`；
- 若策略返回 `custom_entry_price()`，只**新开仓**时介入，之后夹进 K 线区间。

### 6.3 落库与初始止损

```python
# freqtradebot.py:1226-1227
stoploss = self.strategy.stoploss
trade.adjust_stop_loss(trade.open_rate, stoploss, initial=True)   # 多头：open_rate × (1 + stoploss)
```

Trade 记录写入 `open_rate / stake_amount / amount / 手续费字段 / precision / contract_size` 等执行元数据（`:1197-1236`），然后 `Trade.commit()`。

> **注意时序**：若开启 `stoploss_on_exchange`，交易所止损单**不在开仓函数里挂**，而是在**下一轮**的 `exit_positions()` → `handle_stoploss_on_exchange()`（`:1634-1688`）。所以刚开仓的瞬间，交易所侧可能还没有止损单。

---

## 7. 环节五：持仓期间，每一轮都在算的四件事

每根 K 线（以及同一根 K 线内的每次轮询）都会对每个持仓执行同一套判定：

```python
# interface.py:1419-1522 —— should_exit() 的组装顺序（写死的优先级）
current_profit = trade.calc_profit_ratio(current_rate)      # ← 注意：含手续费

stoplossflag = ft_stoploss_reached(...)                     # ① 止损/清算？
roi_reached  = min_roi_reached(trade, current_profit, ...)  # ② ROI？
exit_signal  = EXIT_SIGNAL | CUSTOM_EXIT | NONE             # ③ 出场信号？

# 返回有序列表：
# Exit-signal → Stoploss/Liquidation → ROI → Trailing stoploss
```

### 7.1 止损（三条路径，本地与交易所挂单互斥）

```python
# interface.py:1651-1653
if (sl_higher_long or sl_lower_short) and (not stoploss_on_exchange or dry_run):
    return ExitCheckTuple(exit_type=ExitType.STOP_LOSS)     # ← 开了交易所挂单就不本地判
```

追踪止损不是独立机制，而是**止损价的单向移动 + 一个标志位**（`trade_model.py:883-897`）：

```python
if allow_refresh or (higher_stop and not is_short) or (lower_stop and is_short):
    if not allow_refresh:
        self.is_stop_loss_trailing = True      # 只要移动过，就标记为追踪
    self.__set_stop_loss(...)
```

**多头只上移、空头只下移**；移动过之后命中同一条止损，会被记成 `TRAILING_STOP_LOSS` 而不是 `STOP_LOSS`。

止损价取整方向**保守优先**：多头 `ROUND_UP`、空头 `ROUND_DOWN`（`trade_model.py:864-869`）。

### 7.2 ROI（时间衰减表）

```python
# interface.py:1704-1732
roi_list = [x for x in self.minimal_roi if x <= trade_dur]   # 持仓分钟数
roi_entry = max(roi_list)                                     # 取"不超过持仓时长"的最大档
min_roi   = self.minimal_roi[roi_entry]
return current_profit > roi                                   # ← 严格大于
```

`custom_roi()` 只能**更紧**不能更松（取两者较小值，`:1713-1717`）。

### 7.3 出场信号 / custom_exit

按优先级：`exit_long == 1` 优先于 `custom_exit()`（`:1469-1502`）。若 `exit_profit_only = True`，则信号出场还要求 `current_profit > exit_profit_offset`（只在盈利时按信号出场）。

### 7.4 三层风控在旁边同时生效

| 层 | 机制 | 效果 |
|---|---|---|
| PairLock | protections 命中后写锁（`pair="*"` 即全局停手） | **只拦入场**，不平仓 |
| 回撤熔断 / 清算预警 | 期货路径，按"距强平还剩多少"排序告警（`freqtradebot.py:482-512`） | 告警，不自动平仓 |
| 交易所挂单止损 | `stoploss_on_exchange` | 即使机器人进程挂了，止损仍在交易所生效 |

---

## 8. 环节六：出场判定 → 执行

### 8.1 取"第一个命中的"，且同一根 K 线不重复

```python
# freqtradebot.py:1578-1595
for should_exit in exits:
    if should_exit.exit_flag:
        if trade.has_open_orders and self._exit_reason_cache.get(...):
            continue                      # 同一根 K 线、同一出场原因，只执行一次
        exited = self.execute_trade_exit(trade, exit_rate, should_exit, exit_tag=exit_tag1)
        if exited:
            return True
```

### 8.2 `execute_trade_exit()` 内部固定顺序（`:2250`）

```text
① 写资金费（期货）
② 定 order_type（止损类归 order_types["stoploss"]，EMERGENCY_EXIT 默认 market）
③ 仅限价单且未跳过 → custom_exit_price()
④ ★ 先撤掉交易所侧的止损单   ← 否则平仓后止损单会变成反向开仓
⑤ 算可出场量（现货不足时 98%~100% 之间回落并改写 amount，<98% 直接报错）
⑥ 非清仓、非部分平仓 → confirm_trade_exit()
⑦ 下单 → 落库 → 写 exit_reason → 写去重缓存
```

### 8.3 十二种退出原因（落库进 `Trade.exit_reason`）

```text
roi · stop_loss · stoploss_on_exchange · trailing_stop_loss · liquidation
exit_signal · force_exit · emergency_exit · custom_exit · partial_exit
sold_on_exchange · （空 = 未触发）
```

---

## 9. ★ 数值走查：一笔完整交易

### 9.0 设定

| 配置 | 取值 | 备注 |
|---|---|---|
| 交易对 / 周期 | BTC/USDT · 1h | — |
| `dry_run_wallet` | 1000 USDT | 源码默认 1000（`constants.py:85`） |
| `tradable_balance_ratio` | 0.99 | **默认值** |
| `stake_amount` | `"unlimited"` | 必填，无默认 |
| `max_open_trades` | 3 | 必填，无默认 |
| `amend_last_stake_amount` | 否 | 默认 `False` |
| `minimal_roi` | `{0: 0.10, 60: 0.05, 120: 0}` | 0 分钟要 +10%，60 分钟后要 +5%，120 分钟后保本即走 |
| `stoploss` | `-0.10` | — |
| `trailing_stop` / `trailing_stop_positive` / `trailing_stop_positive_offset` / `trailing_only_offset_is_reached` | 开 / 0.02 / 0.03 / 是 | 浮盈 ≥3% 后启用，回撤 2% 出 |
| `order_types` | entry=limit, exit=limit | — |
| `price_side` | `"same"` | 买用 ask |

### 9.1 开仓（T = 10:00:01）

| 帧 | 计算 | 依据 |
|---|---|---|
| ① 醒来 | worker 睡到"下一根 K 线 +1 秒" | `worker.py:168-177` |
| ② 信号 | 10:00 那根（09:00–10:00）收盘后算出 `enter_long = 1` | 策略表达式 |
| ③ 冲突检查 | `exit_long`、`enter_short` 均非 1 → 允许做多 | `interface.py:1373-1390` |
| ④ 额度 | `total_stake = (0 + 1000) × 0.99 = 990` | `wallets.py:314-334` |
| ⑤ 可用 | `available = min(990 − 0, 1000) = 990` | `wallets.py:336-345` |
| ⑥ 下注 | `stake = min((990 + 0) / 3, 990) = 330 USDT` | `wallets.py:347-359` |
| ⑦ 取价 | ask = 60,000 USDT | `entry_pricing.price_side = "same"` |
| ⑧ 数量 | `amount = 330 / 60,000 × 1 = 0.0055 BTC` | `freqtradebot.py:1090-1111` |
| ⑨ 精度取整 | 按交易所精度向下取整（BTC/USDT 常见 1e-5），示例仍为 `0.0055` | `exchange.py:1519-1523` |
| ⑩ 限额校验 | 名义额 330 USDT ≥ min_stake（且已含 5% 预留 + 止损预留） | `exchange.py:1160-1192` |
| ⑪ 下单 | limit @ 60,000；成交后 `open_rate = 60,000` | `exchange.create_order` |
| ⑫ 落库 | Trade：stake 330 / amount 0.0055 / open_rate 60000 / 手续费待回填 | `freqtradebot.py:1235-1236` |
| ⑬ 初始止损 | 本例杠杆 1：`60000 × (1 − \|−0.10\| / 1) = 54,000` | `trade_model.py:839-857` |
| ⑭ 交易所挂单 | 若开启 `stoploss_on_exchange` → **下一轮**挂出（限价用 `stoploss_on_exchange_limit_ratio = 0.99` → 54,000 × 0.99 ≈ 53,460） | `exchange.py:1626-1657` |

> **第 ⑬ 帧有个容易被忽略的细节**：止损比例在代码里是**除以杠杆**后再换算成价格的（`trade_model.py:854-857`）：
>
> ```python
> leverage = self.leverage or 1.0
> new_loss = current_price * (1 - abs(stoploss / leverage))    # 多头
> new_loss = current_price * (1 + abs(stoploss / leverage))    # 空头
> ```
>
> 也就是说 `stoploss = -0.10` 在**杠杆 1** 时对应"价格跌 10%"，在**杠杆 10** 时只对应"价格跌 1%"——因为 10 倍杠杆下 1% 的价格逆行就等于 10% 的保证金亏损。换算出的价格还要按精度取整，多头 `ROUND_UP`、空头 `ROUND_DOWN`。

### 9.2 路径 A：ROI 出场

先看**判定口径**——`calc_profit_ratio()` 算的是**含双边手续费的净收益率**。这一点在源码 docstring 里写得很直白：

```python
# trade_model.py:1208-1218
def calc_profit_ratio(self, rate, amount=None, open_rate=None) -> float:
    """
    Calculates the profit as ratio (including fee).
    """
```

```python
# trade_model.py:1096-1102 —— 多头平仓价值要先扣掉平仓费
def _calc_base_close(self, amount, rate, fee):
    close_value = amount * FtPrecise(rate)
    fees = close_value * FtPrecise(fee or 0.0)
    return close_value + fees if self.is_short else close_value - fees
```

设 taker 费率 0.1%：

| 时刻 | 价格 | 毛收益 | 净收益（含 0.1%×2） | 60 分钟档门槛 | 是否触发 |
|---|---|---|---|---|---|
| 11:00（持仓 60 分钟） | 63,000 | +5.00% | ≈ +4.80% | `> 0.05` | ✗（差一点） |
| 11:20 | 63,600 | +6.00% | ≈ +5.80% | `> 0.05` | ✓ |

触发后走 `should_exit()` 的有序列表：出场信号（无）→ 止损（未到）→ **ROI 命中** → 追踪（不适用）。执行链：

```text
撤交易所止损单 → confirm_trade_exit() → 下单 → exit_reason = "roi"
→ 费用结算（fee_close 回填）→ wallets.update()
```

**这里藏着两个容易踩的点**：

1. ROI 判定是**严格大于**（`current_profit > roi`），恰好等于不触发；
2. 比较的是**净收益**，所以毛利 +5% 在 0.1%×2 费率下并不够——**费率直接决定出场时点**。

### 9.3 路径 B：追踪止损

| 时刻 | 价格 | 触发条件 | 止损价变化 |
|---|---|---|---|
| 10:30 | 62,000 | 浮盈 +3.33% > `offset` 3% → **追踪启用** | 54,000 → `62000 × (1−0.02) = 60,760`，`is_stop_loss_trailing = True` |
| 11:30 | 66,000 | 继续上涨 | 60,760 → `66000 × 0.98 = 64,680`（只上移） |
| 12:10 | 回落到 64,680 | 命中止损 | 出场，`exit_reason = "trailing_stop_loss"` |

**关键竞争关系**：`minimal_roi` 最后一档是 `120: 0`，即**持仓超过 120 分钟后，只要净收益 > 0 就会 ROI 出场**。所以上例中若 12:00 时价格仍高于 60,000（净收益为正），ROI 会在追踪止损之前触发——**ROI 的优先级高于追踪止损**（这正是回测假设里那条"ROI applies before trailing-stop"的由来）。

### 9.4 路径 C：硬止损

- 价格跌到 54,000 → 本地判定命中（`stoploss_on_exchange=False` 时）→ `exit_reason = "stop_loss"`；
- 若开了交易所挂单且非 dry-run，**本地判定让位**，由交易所触发 → `exit_reason = "stoploss_on_exchange"`；
- **回测口径差异**：同一根 K 线内**止损先于 ROI** 判定（官方明文假设），所以回测里止损出场会明显多于实盘。

### 9.5 三条路径的竞争关系（同一笔持仓）

| 触发条件 | 价格/时长 | 出场原因 | 优先级 |
|---|---|---|---|
| 出场信号 `exit_long == 1` | 任意 | `exit_signal` | **最高**（假设在开盘触发） |
| 硬止损 | ≤ 54,000 | `stop_loss` | 次高 |
| ROI（60 分钟档） | 净收益 > 5% | `roi` | 中 |
| ROI（120 分钟档 = 0） | 持仓 >120 分钟且净收益 > 0 | `roi` | 中（**先于追踪**） |
| 追踪止损 | 自高点回撤 2%（浮盈曾 ≥3%） | `trailing_stop_loss` | 最低 |

---

## 10. 同一套逻辑在回测里怎么跑（差异对照）

回测**不是另一套实现**——`Trade` 与 `LocalTrade` 是同一套撮合/盈亏代码，只是回测关掉数据库（`backtesting.py:483-484`）。差异只在"价格与成交从哪来"：

| 维度 | 实盘/dry-run | 回测 |
|---|---|---|
| 信号时序 | 最新收盘 K 线的信号 | 信号列 **`shift(1)`**：t 行装 t−1 的信号，用 t 行开盘价成交（`backtesting.py:554-567`） |
| 成交判据 | 交易所撮合 | `low <= rate <= high` 即成交（`:787-789`） |
| 滑点 | 真实滑点 | **无滑点**，只有 fee |
| 止损与 ROI 竞争 | 按轮询到的价格先到先得 | **同一根 K 线内止损先于 ROI** |
| protections | 每轮都评估 | **只在平仓成交后**评估（`:852`） |
| 日内路径 | 真实 tick | 可用 `--timeframe-detail 5m` 近似 |
| dry-run 特殊 | 市价单**立即全额成交**（无部分成交、无延迟，滑点上限 5%） | — |

---

## 11. 速查：全部公式与关键默认值

### 11.1 公式

```text
可用额度   available = min((占用 + 可用余额) × tradable_balance_ratio − 占用, 可用余额)
单笔下注   stake     = min((available + 占用) / max_open_trades, available)      # unlimited
           stake     = stake_amount                                            # 固定额
数量       amount    = (stake / 成交价) × leverage
初始止损   多头 stop_loss = open_rate × (1 − |stoploss| / leverage)   → 取整 ROUND_UP
          空头 stop_loss = open_rate × (1 + |stoploss| / leverage)   → 取整 ROUND_DOWN
ROI 门槛   取 max{ k ∈ minimal_roi | k ≤ 持仓分钟数 } 对应的阈值，要求 净收益 > 阈值
追踪止损   浮盈 ≥ trailing_stop_positive_offset 后：多头 stop = 当前价 × (1 − trailing_stop_positive)
           且止损只允许朝有利方向移动
盈亏口径   calc_profit_ratio() 含双边手续费（docstring: "including fee"）
```

### 11.2 关键默认值（源码/官方 schema）

| 项 | 默认 | 来源 |
|---|---|---|
| `tradable_balance_ratio` | `0.99` | `config_schema.py` |
| `amend_last_stake_amount` | `False` | 同上 |
| `last_stake_amount_min_ratio` | `0.5` | 同上 |
| `amount_reserve_percent` | `0.05` | `constants.py:25` |
| `price_side` / `price_last_balance` | `"same"` / `0` | `config_schema.py` |
| `exit_timeout_count` / `unit` | `0` / `"minutes"` | 同上 |
| `dry_run_wallet` | `1000` | `constants.py:85` |
| `PROCESS_THROTTLE_SECS` | `5` 秒 | `constants.py:17` |
| `max_open_trades` / `stake_amount` | **必填，无默认** | schema 未给 default |

### 11.3 一句话回顾

**它的量化交易 = 你的 pandas 表达式决定"何时想买"，框架用一组写死的公式决定"买多少、何时必须卖"。** 唯一由人决定的量化部分是那四列信号；剩下的（仓位、优先级、取整方向、手续费口径、成交模拟）全部是确定性代码，也因此可以被回测、被 hyperopt 搜索、被 `lookahead-analysis` 反证。

> 全部行号对应 develop 分支 2026-10-03 快照；结论来自静态阅读源码，未运行 Freqtrade。数值走查中的价格/费率为示例值，用于说明计算口径。
