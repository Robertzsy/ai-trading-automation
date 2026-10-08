# Freqtrade 实现原理报告（源码级）

考察对象：`freqtrade/freqtrade` **develop 分支**，抓取时间 2026-10-03（当前发行版 PyPI `freqtrade` **2026.9**，REST API `API_VERSION = 2.50`）
方法：直接读源码，全部结论附 `文件:行号`；文档只用于交叉印证
范围：**它是怎么实现的**——运行模型、主循环、策略接口、开平仓链路、回测/超参/偏差分析内核、数据与插件体系。不含可行性评估与选型建议。

---

## 0. 总览：一个"重工程"的 Python 单体

先看代码体量，这决定了它的实现风格——**几乎每个关键环节都自己写了一遍，不依赖框架代劳**：

| 文件 | 体积 | 职责 |
|---|---|---|
| `freqtrade/exchange/exchange.py` | 185 KB | 交易所适配层（ccxt 包装、精度、限额、下单、行情） |
| `freqtrade/freqtradebot.py` | 122 KB | 机器人本体：主循环 + 开平仓执行 |
| `freqtrade/rpc/telegram.py` | 95 KB | Telegram 控制通道 |
| `freqtrade/persistence/trade_model.py` | 87 KB | `Trade`/`Order` 领域模型（含盈亏、止损、到期计算） |
| `freqtrade/optimize/backtesting.py` | 82 KB | 回测引擎 |
| `freqtrade/strategy/interface.py` | 81 KB | 策略接口与信号判定 |
| `freqtrade/rpc/rpc.py` | 75 KB | 四个控制通道共享的业务实现 |
| `freqtrade/freqai/freqai_interface.py` | 47 KB | ML 管线 |
| `freqtrade/optimize/hyperopt_optimizer.py` | ~50 KB | optuna 集成 |

**顶层模块地图**（`freqtrade/` 下 22 个包）：

```text
main.py / __main__.py      CLI 入口 → commands/ 子命令分发
worker.py                  ★ 主循环与节流（状态机）
freqtradebot.py            ★ 机器人本体（process() 一轮干哪些事）
wallets.py                 钱包与仓位计算
strategy/                  ★ interface.py 策略接口、parameters.py 超参对象、
                             informative_decorator.py、hyper.py、strategy_wrapper.py
data/                      dataprovider.py（策略取数门面）、history/（本地数据）、metrics.py、btanalysis/
exchange/                  ★ exchange.py + 每交易所子类（binance/okx/bybit/hyperliquid…）
persistence/               ★ trade_model.py、models.py、pairlock.py、custom_data.py
optimize/                  ★ backtesting.py、hyperopt*、hyperopt_loss/、analysis/（两个偏差分析）
plugins/                   pairlistmanager.py + pairlist/*、protectionmanager.py + protections/*
rpc/                       rpc.py（业务）+ api_server/（FastAPI）、telegram.py、webhook.py、discord.py
freqai/                    ML 管线（prediction_models/、RL/、torch/、tensorboard/）
configuration/             配置加载与校验、timerange.py、environment_vars.py
enums/ constants.py        ★ 全局枚举与常量（信号列名、退出原因等）
commands/                  CLI 子命令实现（trade / backtesting / hyperopt / download-data …）
leverage/ plot/ templates/ resolvers/ util/ mixins/ vendor/ system/ loggers/
```

> 读法建议：**先读 `worker.py`（40 行理解它怎么"跑"），再读 `freqtradebot.process()`（120 行理解它每轮"干什么"），然后顺着 `interface.py` 与 `trade_model.py` 往下钻。** 其余模块都是这三条主干的插件。

### 0.2 一页速览：它到底怎么把"量化"跑起来的

把全链路压成一条数据流，量化逻辑其实只发生在中间一格：

```text
交易所 (ccxt)
   │  dataprovider.refresh()            ← 每轮一次；K 线级去重
   ▼
DataFrame（date/open/high/low/close/volume）
   │  populate_indicators()              ← 指标（用户写，pandas/TA-Lib）
   │  populate_entry_trend/exit_trend()  ← 信号列：enter_long/exit_long/... 只允许 0/1
   ▼
"最新一根已收盘 K 线" 的四个布尔列 + tag
   │  get_entry_signal()                 ← enter_long==1 且 exit_long/enter_short 不为 1
   │  should_exit()                      ← 有序判定：信号 → 止损 → ROI → 追踪止损
   ▼
意图：开 / 平 / 不动
   │  wallets.get_trade_stake_amount()   ← 仓位公式
   │  exchange.create_order()            ← 价、量、精度、限额
   ▼
Order（ccxt 状态驱动）→ Trade（从订单重算）
   │  Trade.commit()                     ← SQLAlchemy 落库，状态真值在此
   ▼
RPC：Telegram / REST API / WebUI / Webhook
```

**四个"量化"事实**：

1. **框架不含任何因子**。指标与阈值 100% 由策略文件提供，框架只保证"信号 → 订单"这段是确定性的。
2. **信号是列，不是函数返回值**。策略把整段历史算成 DataFrame，框架只读**最新一根已收盘 K 线**的那一行。
3. **出场优先级是写死的**：`should_exit()` 返回**有序列表**（信号 → 止损/清算 → ROI → 追踪止损），执行方取第一个命中的（`interface.py:1504-1520`）。
4. **状态真值在数据库**，不在内存：每轮重查 `Trade.get_open_trades()`，订单事实驱动一切重算。

---

## 1. 运行模型：从命令行到心跳循环

### 1.1 入口只有一条路

`freqtrade/main.py:31-52`：解析参数 → 取 `args["func"]` → 直接调用。**所有子命令（trade / backtesting / hyperopt / download-data …）都是这个模式**，没有插件式注册：

```python
arguments = Arguments(sysargv)
args = arguments.get_parsed_arg()
...
elif "func" in args:
    return_code = args["func"](args)          # 子命令分发
```

`freqtrade/main.py:12-13` 还在导入任何业务代码**之前**卡 Python 版本（`< 3.11` 直接 `sys.exit`），这是很省事的兼容性防线。

### 1.2 主循环在 `Worker`，不在机器人里

`trade` 子命令最终构造 `Worker`，循环体只有 5 行（`freqtrade/worker.py:76-81`）：

```python
def run(self) -> None:
    state = None
    while True:
        state = self._worker(old_state=state)
        if state == State.RELOAD_CONFIG:
            self._reconfigure()
```

`_worker()`（`worker.py:83-143`）做三件事：**状态迁移处理 → 按状态分派 → 心跳日志**。

- 状态变化时打印迁移日志并通知 RPC；从非 RUNNING/PAUSED 进入 RUNNING/PAUSED 时调 `freqtrade.startup()`（只在第一次或重启后做初始化）；进入 STOPPED 时调 `check_for_open_trades()` 警告用户还有持仓（`worker.py:92-110`）。
- 分派：`STOPPED` → `_process_stopped()` → `freqtrade.process_stopped()`（可选撤单）；`RUNNING|PAUSED` → `_process_running()` → `freqtrade.process()`（`worker.py:112-129,194-199`）。

### 1.3 节流：它为什么总在"新 K 线刚出来"时醒来

这是整个系统里最容易被忽略、但决定行为正确性的一段（`worker.py:145-187`）。签名 `_throttle(func, throttle_secs, timeframe=None, timeframe_offset=1.0)`，逻辑是：

```python
result = func(*args, **kwargs)                      # 1) 先干活
time_passed = time.time() - last_throttle_start_time
sleep_duration = throttle_secs - time_passed        # 2) 至少睡到 throttle 周期
if timeframe:
    next_tft = next_tf.timestamp() - time.time()    # 3) 距下一根 K 线还有多久
    next_tf_with_offset = next_tft + timeframe_offset
    if next_tft < sleep_duration < next_tf_with_offset:
        sleep_duration = next_tf_with_offset        #    别卡在"K 线刚出但还没落定"的 1 秒窗口里
    sleep_duration = min(sleep_duration, next_tf_with_offset)   # 4) 绝不超过下一根 K 线 +1s
self._sleep(max(sleep_duration, 0.0))
```

三个设计意图：

1. **执行时间算进节流**：`sleep = throttle_secs - 本轮耗时`，所以"每 N 秒一轮"是**周期**而不是"每轮之后再睡 N 秒"，不会随负载漂移。
2. **对齐 K 线边界**：`min(sleep, next_tf+1s)` 保证绝不错过下一根 K 线的开盘；RUNNING 分支显式传 `timeframe=config["timeframe"], timeframe_offset=1`（`worker.py:123-129`），注释写明"用 1 秒偏移确保新 K 线已经发出"。
3. **避开 1 秒危险窗**：如果算出来的睡眠恰好落在"新 K 线时刻 ~ +1 秒"之间，就干脆睡到 +1 秒，避免在一个"K 线可能还没生成"的瞬间醒来。

### 1.4 异常隔离：主循环不会因为一次失败而死

`_process_running()`（`worker.py:197-205`）只捕两类异常：

```python
try:
    self.freqtrade.process()
except TemporaryError as error:
    logger.warning(f"Error: {error}, retrying in {RETRY_TIMEOUT} seconds...")
    time.sleep(RETRY_TIMEOUT)
except OperationalException:
    ...提示用户 "/start" 后重启...
```

区分"临时错误（网络/交易所抖动）→ 原地重试"和"操作错误（配置/策略问题）→ 停止并提示人工介入"，是长跑机器人的基本素养。

---

## 2. 一轮 `process()` 到底干了什么

`freqtradebot.process()`（`freqtradebot.py:306-362`）是全文最值得逐行读的 56 行。**实测顺序**（附行号；下表刻意拆得比常见资料更细，等价于把 10 个逻辑步骤展开成 16 行）：

| # | 步骤 | 代码 | 设计意图 |
|---|---|---|---|
| 1 | 重载交易所市场元数据 | `:314` `exchange.reload_markets()` | 交易对/精度/限额可能变化 |
| 2 | 回填缺失手续费 | `:316` `update_trades_without_assigned_fees()` | 见 §4.8（手续费是异步拿到的） |
| 3 | 从数据库取持仓 | `:319` `Trade.get_open_trades()` | **状态真值在持久化层，不在内存** |
| 4 | 刷新白名单并**并入持仓对** | `:321` `_refresh_active_whitelist(trades)` | `:399-402`：保证持仓标的的 K 线也被拉取——否则无法判断平仓 |
| 5 | 拉取/刷新 K 线 | `:324-327` `dataprovider.refresh(pairlist, informative_pairs)` | 一次拉主 pairlist + 所有 informative pairs |
| 6 | 调 `bot_loop_start()` | `:329-331` | 用户回调，`supress_error=True` —— **用户代码出错不能拖垮机器人** |
| 7 | **全量策略分析** | `:334` `strategy.analyze(active_pair_whitelist)` | 指标 → 入场 → 出场，每个 pair 一次（内部有缓存，见 §3.3） |
| 8 | 处理未成交订单 | `:336-338` `manage_open_orders()` | 超时撤单、交易所侧取消、用户请求改价（**在 `_exit_lock` 内**） |
| 9 | **先处理平仓** | `:343-347` `exit_positions(trades)` + `Trade.commit()` | 与 Telegram 线程的 `force_exit` 互斥（`:340-342` 注释说明为何必须加锁） |
| 10 | 爆仓预警 | `:349` `check_liquidation_warnings()` | 期货专用：按"距强平还剩多少"排序，穿透阈值告警，且**恢复后要退出预警区 1.2 倍才会重新告警**（`:494`），避免阈值附近来回刷屏 |
| 11 | 仓位调整（DCA） | `:352-354` `process_open_trade_positions()` | 仅在 `position_adjustment_enable` 时；**必须排在开仓之前** |
| 12 | **再找入场机会** | `:357-358` `enter_positions(free_trade_slots)` | 仅在 `state == RUNNING` 且有剩余槽位；**开仓永远在平仓与调仓之后** |
| 13 | 跑一次 APScheduler | `:359` `_schedule.run_pending()` | 让内部定时任务（如数据清理）有机会执行 |
| 14 | 提交事务 | `:360` `Trade.commit()` | 一轮一个事务边界 |
| 15 | 发消息 | `:361` `rpc.process_msg_queue(...)` | 消息队列解耦，避免下单路径被网络阻塞 |
| 16 | 记录时间戳 | `:362` `self.last_process = now` | 供 `/status` 与健康检查使用 |

### 两条值得记住的规则

**① 平仓 → 调仓 → 开仓。** 顺序不是随意的：平仓释放资金与槽位（`get_free_open_trades()` `:410-416` 直接算 `max_open_trades - 已持仓数`），调仓可能占用资金，开仓最后用剩余额度。回测文档里"Exits free their trade slot for a new trade with a different pair"说的就是这条规则在回测侧的对应实现。

**② 状态真值在数据库，不在内存。** 每轮开头重新 `Trade.get_open_trades()`，第 9 步之前**又查一次**（`:344`）——因为前面几步可能改过状态。所有对外部世界的操作（下单、改单）都在 `_exit_lock` 保护下，防止 RPC 线程插进来造成重复下单或"平仓过程中重建交易所止损单"（`:340-342` 的原话）。

---

## 3. 策略接口与数据流：量化逻辑的挂载点

### 3.1 接口设计：只有一个抽象方法

`IStrategy` 里唯一被 `@abstractmethod` 标记的是 **`populate_indicators`**（`strategy/interface.py:236-243`）；`populate_entry_trend`（`:254`）、`populate_exit_trend`（`:273`）以及其余几十个回调**全部是带默认实现的钩子**。

这是它多年不破坏兼容的根因：**扩展点是"可以覆盖的钩子"，不是"必须实现的接口"**。策略作者只写一个方法就能跑起来，其余按需覆盖。

### 3.2 信号契约，以及两层新老兼容

契约本体（`enums/signaltype.py`）：`enter_long` / `exit_long` / `enter_short` / `exit_short` + 标签列 `enter_tag` / `exit_tag`。判定在 `interface.py:1373-1376`——**必须 `== 1`**（不是真值判断）：

```python
enter_long = latest.get(SignalType.ENTER_LONG, 0) == 1
exit_long  = latest.get(SignalType.EXIT_LONG, 0) == 1
```

兼容层一（默认转发，`interface.py:254-261`）：新版方法默认调用旧版方法。

```python
def populate_entry_trend(self, dataframe, metadata):
    return self.populate_buy_trend(dataframe, metadata)
```

兼容层二（缺列改名，`interface.py:1852-1858`）：先写一个空 `enter_tag`（注释标明是 Pandas #56503 workaround），如果输出里没有 `enter_long` 列，就把旧的 `buy` / `buy_tag` 改名过来。

### 3.3 "每根 K 线只算一次"的三层叠加

这是一次计算被省掉三次的地方，三层机制彼此独立：

| 层 | 机制 | 位置 |
|---|---|---|
| worker | 睡眠对齐到"下一根 K 线 + 1 秒" | `worker.py:168-177` |
| exchange | `_now_is_time_to_refresh()` 比较上次刷新时间 + interval | `exchange.py:3108-3125` |
| **strategy** | `__last_candle_seen_per_pair` 记录已分析的最后一根 | `interface.py:1218-1228` |

第三层里有一行**极容易踩坑、但处理得很漂亮的代码**（`interface.py:1234-1235`）：

```python
logger.debug("Skipping TA Analysis for already analyzed candle")
dataframe = remove_entry_exit_signals(dataframe)      # ← 关键
```

跳过重算时**不是简单 return，而是把入场/出场信号列删掉**。原因：这一轮仍会向下游提供这份 DataFrame，而下游要检查"最新一根 K 线有没有信号"——如果不删，就会拿**上一轮**残留的信号列反复触发下单。一行代码解决一个真金白银的 bug。

### 3.4 分析流程（四层下钻）

```text
analyze(pairs)                    interface.py:1265      # 每轮入口，先 expire informative 缓存
└── analyze_pair(pair)            interface.py:1241      # 捕 StrategyError，只跳过该 pair (:1255-1259)
    └── _analyze_ticker_internal  interface.py:1206
        ├── 新 K 线判定            :1218-1235
        ├── StrategyResultValidator ：校验列/类型（可 warn_only）
        ├── advise_indicators → advise_entry → advise_exit   :1827 / 1852 / 1866
        ├── assert_df
        ├── dp._set_cached_df()    # 写缓存
        └── dp._emit_df()          # 广播（producer/consumer 模式）
```

对外公开的 `analyze_ticker()` 自己写着 "Should only be used in live"（`:1190-1204`）——回测走另一条路径。

### 3.5 缓存与 informative pairs

| 机制 | 实现 |
|---|---|
| 主缓存 | key = `(pair, timeframe, candle_type)`，值 = `(df, 缓存时间)`（`dataprovider.py:88-102`） |
| 回测切片 | 按 `__slice_index` 最多回看 1000 根（`MAX_DATAFRAME_CANDLES`），且只到"当前时刻"（`:416-421`） |
| `clear_cache()` | **故意不清回测缓存**（`:448-456`）——否则 hyperopt 的 `analyze_per_epoch` 会反复重载 |
| informative 收集 | `__init__` 期扫描类属性（`interface.py:160-179`），并**强制 informative 周期 ≥ 策略周期** |
| informative 合并时机 | `advise_indicators` 在 `populate_indicators` **之前**逐个 merge 进主表（`:1827-1834`） |
| informative 缓存 | 仅 dry/live 且 `cache=True` 时创建独立 TLRU，`maxsize=500`（`:181-184`）；**TTL = 2 根有效 informative K 线**（`informative_decorator.py:34-57`）；每轮 `analyze()` 开头统一 `expire()`（`:1270-1271`） |
| `startup_candle_count` | 类属性默认 0（`:128`）→ 回测取所有策略的最大值写进 config（`backtesting.py:227-231`）→ `historic_ohlcv` 据此把加载区间**往前扩**（`dataprovider.py:319-321`）；开 FreqAI 还要加训练天数（`:338-353`） |

### 3.6 DataProvider：用代码而不是文档来防前视

这是我认为整套代码里最值得抄的一处——**它把"回测不许看未来"做成了类型/分支级别的不可能，而不是写在文档里的注意事项**：

```python
def ohlcv(...):                                    # dataprovider.py:495-520
    if self.runmode in (RunMode.DRY_RUN, RunMode.LIVE):
        return self._exchange.klines(...)
    else:
        return DataFrame()                         # 回测里给空表，而不是静默返回全量历史
```

四条具体拦截：

1. **`get_pair_dataframe()` 双模式分流**（`:386-397`）：live 走 `ohlcv()`；回测走 `historic_ohlcv()` 后按 `__slice_date` **切掉 `date >= 当前 K 线` 的数据**，注释原文：*"to prevent lookahead bias in callbacks through informative pairs"*。
2. **`trades()`** 的 docstring 直接写 *"This is not meant to be used in callbacks because of lookahead bias"*，且非 live 模式抛异常（`:522-543`）。
3. **`send_msg()`** 非 dry/live 静默 return，且同一条消息默认**每根 K 线只发一次**（`:614-629`）——防止回测里刷屏。
4. **切片开关是私有的**：`_set_dataframe_max_index` / `_set_dataframe_max_date`（`:72-86`），注释均写 *"Only relevant in backtesting"*，由回测引擎注入，策略侧改不到。

### 3.7 回调总表（何时被调用）

| 时机 | 回调 |
|---|---|
| 启动期 | `bot_start`、`informative_pairs`（`interface.py:224`、`:1081`） |
| 每轮开头 | `bot_loop_start`（`freqtradebot.py:329`，`supress_error=True`） |
| 分析阶段 | `populate_indicators` / `populate_entry_trend` / `populate_exit_trend`（经 `advise_*`） |
| 下单前 | `confirm_trade_entry`（`:1114`）、`custom_entry_price` / `custom_stake_amount` / `leverage`（`:1311-1312 / 1364 / 1332`） |
| 持仓管理 | `adjust_trade_position`（`:928, 955`）、`check_entry_timeout` / `check_exit_timeout`（`:1794`）、`adjust_order_price` → `adjust_entry_price` / `adjust_exit_price`（`:1889`） |
| 平仓判定 | `custom_exit`（`interface.py:1473`）、`custom_stoploss`（`:1567`）、`custom_roi`（`:1690`） |
| 平仓执行 | `custom_exit_price` / `confirm_trade_exit`（`:2298-2299 / 2320`） |
| 成交回填 | `order_filled`（`:2563`） |

### 3.8 两道防线

**① `strategy_safe_wrapper`**（`strategy/strategy_wrapper.py`，全文 62 行，我逐行读过）：

```python
if not (getattr(f, "__qualname__", "")).startswith("IStrategy.") and "trade" in kwargs:
    kwargs["trade"] = deepcopy(kwargs["trade"])     # 只对用户实现的方法深拷贝，防策略就地改账本
```

- **只对"用户实现的方法"深拷贝 `trade`**：框架自带方法不拷，省性能；用户方法拷，防止策略代码顺手把账本对象改坏。
- `ValueError` 与其他异常分级日志；默认 `default_retval=None` 且未 `supress_error` 时**抛 `StrategyError`**，强迫上层显式处理而不是静默吞掉。
- `__format_traceback`（`:16-28`）会**逐帧跳过本文件**，只输出用户代码的 `qualname:lineno`——日志里不喷框架栈。

**② 配置校验**：`validate_config_consistency()`（`configuration/config_validation.py:73-99`）串联 14 个校验器，最后过 JSON Schema。抽查三条：`max_open_trades` 与 `stake_amount` **不能同时** unlimited（`:102-110`）；市价单强制价格侧匹配方向（entry 要求 `ask/other`，exit 要求 `bid/other`，`:113-125`）；`stoploss == 0.0` 直接拒绝（`:128-132`）。

---

## 4. 执行层：一次开仓/平仓到底做了什么

### 4.1 开仓链路

```text
enter_positions(:794)            # 按空闲槽位遍历白名单；全局 pairlock 直接返回
└── create_trade(:852)
    ├── get_analyzed_dataframe → strategy.get_entry_signal(:869-889)   # 取信号
    ├── is_pair_locked 检查                                            # 保护器可能锁了这对
    ├── wallets.get_trade_stake_amount(pair, max_open_trades)(:891)    # 算钱
    └── execute_entry(:1063)
        ├── get_valid_enter_price_and_stake(:1286)  # 价 · 量 · 杠杆
        │   ├── exchange.get_rate(side="entry")     # bid/ask 或订单簿档位
        │   ├── custom_entry_price(:1309-1322)      # 仅在非 replace 模式介入
        │   └── custom_stake_amount(:1363-1375) + wallets.validate_stake_amount(:1377-1383)
        ├── confirm_trade_entry(:1113-1126)         # 可否决
        ├── exchange.create_order(:1131)
        └── Order.parse_from_ccxt_object + Trade(...) + trade.adjust_stop_loss(initial=True)(:1197-1236)
```

三个容易误解的点：

- **数量公式**：`amount = (stake_amount / enter_limit_requested) * leverage`（`:1090-1111`）。
- **`custom_entry_price` 只在新开仓时介入**；挂单挂久了想改价走的是另一条路（`replace_order` → `adjust_order_price` → `adjust_entry_price`，`:1889`）。
- **交易所止损单不是在开仓函数里挂的**：开仓成功后，挂止损发生在**下一轮**的 `exit_positions` → `handle_stoploss_on_exchange`（`:1634-1688`）。这是"一轮只做一件事"的必然结果，也解释了为什么刚开仓的瞬间在交易所侧可能还没有止损单。

价格侧的取价逻辑在 `exchange.py:2304-2422`：`entry_pricing` / `exit_pricing` 配置决定用 bid/ask/last，`_get_price_side` 把抽象的 `same/other` 映射成具体方向；`price_last_balance` 在盘口价与最新成交价之间插值；开了 `use_order_book` 则按档位取价（越界抛 `PricingError`）。取价结果有 TTL 缓存（`_entry_rate_cache`）。

### 4.2 平仓链路，以及"同一根 K 线不重复平"

```python
# freqtradebot.py:1578-1595 —— should_exit 返回的是有序列表，取第一个命中的
for should_exit in exits:
    if should_exit.exit_flag:
        exit_tag1 = exit_tag if should_exit.exit_type == ExitType.EXIT_SIGNAL else None
        if trade.has_open_orders and (prev_eval := self._exit_reason_cache.get(...)):
            continue                    # ← 同一根 K 线内、同一出场原因，只执行一次
        exited = self.execute_trade_exit(trade, exit_rate, should_exit, exit_tag=exit_tag1)
        if exited:
            return True
```

`execute_trade_exit`（`:2250`）内部顺序是固定的，值得记住：

1. 写资金费（期货）；
2. 确定 `order_type`（STOP_LOSS / TRAILING / LIQUIDATION 归入 `order_types["stoploss"]`；EMERGENCY_EXIT 默认 market，`:2277-2290`）；
3. 仅限价单且未跳过时调 `custom_exit_price`（`:2296-2309`）；
4. **先撤掉交易所侧的止损单**（`:2312`，`cancel_stoploss_on_exchange(allow_nonblocking=True)`）——否则平仓后止损单还在，会变成反向开仓；
5. 算可出场量（`:2213-2248`：现货取 free+used，若不足则在 98%~100% 之间回落并改写 `trade.amount`，低于 98% 直接抛 `DependencyException`）；
6. 非清仓、非部分平仓时才调 `confirm_trade_exit`（`:2317-2333`）；**部分平仓会跳过这个回调**；
7. 下单 → 落库 → 写 `exit_reason` → 写 `_exit_reason_cache`（`:2359`）。

市价单若返回 closed/expired，会立刻 `update_trade_state` 收口（`:2370-2371`），不等下一轮。

### 4.3 止损的三条路径，以及它们的互斥关系

| 路径 | 实现 | 什么时候生效 |
|---|---|---|
| **本地判定** | `IStrategy.ft_stoploss_reached()`（`interface.py:1605-1673`），用当前价与 K 线 low/high 比较 `trade.stop_loss` | `not stoploss_on_exchange or dry_run`（`:1651-1653`）——**开了交易所止损且非 dry-run 时，本地判定主动让位** |
| **交易所挂单** | `exchange.create_stoploss()`（`exchange.py:1626-1657`）→ 每轮 `handle_stoploss_on_exchange` 检查是否触发 | `stoploss_on_exchange` 开启时 |
| **追踪** | **不是独立机制**，而是 `Trade.adjust_stop_loss()` 的单向移动 + `is_stop_loss_trailing` 标志 | 配了 `trailing_stop` 相关参数时 |

追踪的实现只有 6 行，但方向约束写得非常明确（`persistence/trade_model.py:883-897`）：

```python
higher_stop = stop_loss_norm > self.stop_loss
lower_stop  = stop_loss_norm < self.stop_loss
if allow_refresh or (higher_stop and not self.is_short) or (lower_stop and self.is_short):
    if not allow_refresh:
        self.is_stop_loss_trailing = True      # ← 只要移动过，就标记为追踪
    self.__set_stop_loss(stop_loss_norm, stoploss)
```

**多头只允许上移、空头只允许下移**；一旦移动过，同一个止损被命中时就会记成 `TRAILING_STOP_LOSS` 而不是 `STOP_LOSS`（`interface.py:1656-1665`）——这就是回测统计表里两种止损分开计数的原因。

止损价的取整方向是**保守优先**：多头 `ROUND_UP`、空头 `ROUND_DOWN`（`trade_model.py:864-869`），保证取整后的止损不会比设定值更宽松。交易所挂单失败还有降级链：资金不足 → `handle_insufficient_funds`；订单非法 → `emergency_exit` 市价强平（`freqtradebot.py:1620-1631`）。

### 4.4 仓位公式（完整分支）

```python
# wallets.py:347-359 / 369-375
possible_stake = (available_amount + val_tied_up) / max_open_trades
stake = min(possible_stake, available_amount)          # "unlimited" 分支
...
if amend_last_stake_amount:
    if available_amount > stake_amount * last_stake_amount_min_ratio:
        stake_amount = min(stake_amount, available_amount)   # 尾仓补齐
    else:
        stake_amount = 0                                     # 残额太小，干脆不做
```

- `available_capital` 存在时，起始资金 = 起始资金 + 已实现利润；否则 =（占用 + 可用）× `tradable_balance_ratio`（`wallets.py:299-334`）。
- 可用额度 = `min(total_stake − tied_up, free)`（`:336-345`）。
- `max_open_trades` 出现在两处：**空闲槽位判定**（`freqtradebot.py:410-416`）与 **unlimited 均分**。
- 最终还要过一遍上下限：`max_allowed = min(交易所 max, 可用额度)`，加仓时再减去已有持仓金额（`wallets.py:408-457`）。
- stake 为 0 时 `create_trade` **直接 return False 静默放弃该标的**（`freqtradebot.py:1094-1095`），不抛错、不中断整轮。

### 4.5 dry-run 不是模拟器，而是一个开关 —— 结论必须打折

这点很重要，直接影响对任何 dry-run/回测结果的解读：**dry-run 不是另一个交易所对象**，而是同一个 `Exchange` 实例里对 `config["dry_run"]` 的分支（`exchange.py:262` 只打一行日志）。钱包同理按 dry-run 分派到 `_update_dry()`（从数据库的起始资金 + 已实现利润 + 持仓重算）或 `_update_live()`（读交易所余额，`wallets.py:107-199`）。

成交模拟的真相（`exchange.py:1259-1276`）：

```python
if dry_order["type"] == "market" and not dry_order.get("ft_order_type"):
    slippage = 0.05
    worst_rate = rate * ((1 + slippage) if side == "buy" else (1 - slippage))
    average = self.get_dry_market_fill_price(pair, side, amount, rate, worst_rate, orderbook)
    dry_order.update({"average": average, "filled": _amount, "remaining": 0.0,
                      "status": "closed", "cost": (_amount * average)})   # ← 立即全额成交
```

- 市价单：按 L2 订单簿**逐档吃单**估算成交均价（滑点上限 5%），然后**立即全额成交**；
- 限价单：只有价格穿越对手价才成交（`_dry_is_price_crossed`，`:1351-1377`）；
- **没有部分成交、没有时间延迟、没有排队**。

所以：**任何建立在 dry-run 或回测上的结论都被系统性高估**，官方文档反复强调"dry-run 不能替代实盘"在代码层面就是这个原因。

### 4.6 精度与限额：不满足就静默跳过

- 精度来自 ccxt market 的 `precision` + `precisionMode`；下单量先转合约数、取整、再转回（`exchange.py:1519-1523`）；是否需要传价格由 `_order_needs_price()` 判定（`:1491-1496`）。
- 最小/最大下单额计算里有两层预留（`exchange.py:1160-1192`）：

```python
margin_reserve   = 1.0 + config.get("amount_reserve_percent", DEFAULT_AMOUNT_RESERVE_PERCENT)  # 默认 5%
stoploss_reserve = margin_reserve / (1 - abs(stoploss)) if abs(stoploss) != 1 else 1.5
stoploss_reserve = max(min(stoploss_reserve, 1.5), 1)
```

即：**最小下单量会被抬高 5%，还要再为止损留出空间**。交易所 cost 限额与 amount 限额×价格取严，最后按杠杆折算。
- 不满足限额时**不抛错**，而是 stake 归零被静默跳过（`freqtradebot.py:844-845`、`:1094-1095`）——这是"一个标的不可交易不能拖垮整轮"的设计。

### 4.7 订单状态机与恢复通道

`Order.ft_is_open`（`trade_model.py:94`）是"是否还挂着"的唯一布尔索引列，与 ccxt 的 `status` 并列存储；状态流转全部由 ccxt 返回的 order dict 驱动，`parse_from_ccxt_object` / `update_from_ccxt_object` 同步写入 `status/filled/remaining/average` 并更新 `ft_is_open`（`:341-362, 323-338`）。

每轮的超时处理链（`freqtradebot.py:1769-1827`）：`update_trade_state` → 仍 open → `ft_check_timed_out` → `handle_cancel_order`（或尝试 `replace_order`）。**出场单连续超时**达到 `unfilledtimeout.exit_timeout_count` 会走 `emergency_exit` 市价强平。

两处细节值得记：

- **入场撤单会拒绝"留下残仓"**：若已部分成交且剩余 stake 小于最小下单额，则**拒绝撤单**（`:2044-2133`），避免留下一个无法出场的碎仓。
- **`handle_onexchange_order()`（`:684-793`）是恢复通道**：拉交易所订单历史，把数据库里缺失的订单补回来——典型场景是"钱包余额对不上导致无法平仓"。

### 4.8 手续费：用"三态哨兵"区分"还没查"和"查到是 0"

`Trade` 上有六个字段（`fee_open/fee_open_cost/fee_open_currency` + close 三件套）。关键设计是**用 `currency is None` 表示"该侧费率尚未查到"**（`trade_model.py:993-999`）：

```python
if self.entry_side == side and self.fee_open_currency is None:
    self.fee_open_cost = fee_cost
    self.fee_open_currency = fee_currency
    if fee_rate is not None:
        self.fee_open = fee_rate
        self.fee_close = fee_rate      # 先验假设：平仓费率与开仓相同
```

- 每侧**只写一次**；开仓费率顺便当作平仓费率的初值。
- 真正写库发生在 `update_trade_state` → `handle_order_fee` → `get_real_amount`：只对已成交订单执行，优先信 ccxt 的 `order["fee"]`（**费率 > 2% 视为解析错误直接拒收**，`:2716-2720`），否则回退到订单的 trades 明细重新聚合。
- 若手续费以 base 币收取，则从持仓数量里直接扣掉，并记到 `Order.ft_fee_base`（`apply_fee_conditional`，`:2647-2680`）。
- `update_trades_without_assigned_fees()` 是**可重放的补录器**，`dry_run` 直接 return（`:622-624`），用于交易所延迟回报或重启后补费——没有它，重启一次成本就丢一块。

---

## 5. 回测引擎的实现

> 目录结构提示：新版已重构，`optimize/hyperopt/` 与 `optimize/optimize_reports/` 是**包**，两个偏差分析命令在 `optimize/analysis/lookahead.py` 与 `recursive.py`（不是 `*_analysis.py`）。

### 5.1 主结构与一个关键事实：回测与实盘共用同一套 Trade

```text
backtest_one_strategy()
├── advise_all_indicators()                     # 全 pair 先算完指标（一次性）
├── 定 timerange
└── backtest()
    ├── _get_ohlcv_as_lists()                   # 转 list-of-tuples —— 性能优化
    ├── time_pair_generator()                   # 逐主 K 线 ×（可选）逐 detail K 线 × 逐 pair
    │   └── backtest_loop()                     # 核心循环
    └── handle_left_open()                      # 收尾：结算未平仓
```

**关键事实**：`Trade` 的定义是 `class Trade(ModelBase, LocalTrade)`（`persistence/trade_model.py:1713`）——**回测用的就是同一套领域模型**，只是回测里使用 `LocalTrade`（`:385`，类级 `bt_trades` / `bt_trades_open` / `bt_trades_open_pp`，`:393-396`）并**关掉数据库**（`backtesting.py:483-484`）。

这意味着：撮合、盈亏、止损、仓位这些逻辑**没有第二份实现**。回测与实盘的差异只来自"钱和订单从哪来"，不来自"怎么算"。这是它能保持回测/实盘一致性的结构性原因。

### 5.2 信号 `shift(1)`：整个回测正确性的地基

这是全文最精妙的一处（`backtesting.py:554-567`）：

```python
# To avoid using data from future, we use entry/exit signals shifted
# from the previous candle
for col in HEADERS[5:]:
    ...
    df_analyzed[col] = (df_analyzed.loc[:, col].replace([nan], [0 if not tag_col else None]).shift(1))
df_analyzed = df_analyzed.drop(df_analyzed.head(1).index)
```

**信号列被整体下移一根**，于是"第 t 行"里装的是 **t−1 根收盘时算出的信号**，而成交用**第 t 根的开盘价**。这就把"信号在收盘产生、下一根开盘成交"这条语义**编码进了数据结构本身**——不是靠调用顺序、不是靠文档约定，而是**数据里根本不存在未来信息**。

这条设计直接决定了后面 §7 的 lookahead 检测为什么有效：因为框架自己就把信号移位了，任何"看起来有偏"的策略一定是在**指标层**偷看了未来（而不是信号层）。

### 5.3 每根 K 线内的固定五步

`backtest_loop()`（`:1537-1575`）：

| 序 | 动作 |
|---|---|
| ① | 管理挂单（超时 / 重挂） |
| ② | 入场 `_enter_trade()`（需 `can_enter`、该 pair 无持仓、未被 `PairLocks` 锁、有空位） |
| ③ | 处理入场单成交 `_try_close_open_order()` |
| ④ | 生成出场单 `_check_trade_exit()` |
| ⑤ | 处理出场单 `_process_exit_order()` |

出场复用**策略自己的** `should_exit()` 有序列表取首个命中（`:992-1004`）——与实盘同一份代码。成交价按出场类型分流（`:574-595`）：止损/强平 → `_get_close_rate_for_stoploss()`（`:597-649`），ROI → `_get_close_rate_for_roi()`（`:651-716`），其余 → 该行开盘价。

### 5.4 撮合：判据只有一条，且**没有滑点**

```python
# backtesting.py:787-789
def _get_order_filled(self, rate: float, row: tuple) -> bool:
    """Rate is within candle, therefore filled"""
    return row[LOW_IDX] <= rate <= row[HIGH_IDX]
```

- **入场基准价** = `row[OPEN_IDX]`（`:1152`）；限价单先过 `custom_entry_price()`，再被夹进 K 线区间（多头 `min(rate, HIGH)`、空头 `max(rate, LOW)`，`:1054-1057`）。
- 下单后**立即**尝试成交（`:1273`），判据就是上面那一行。
- **引擎里没有滑点**：成本只有 `self.fee`（`--fee` 或交易所最差档，`:268-281`），写在订单 cost 与 `fee_open/fee_close`（`:973, 1268, 1223-1224`），实际扣减在盈亏计算（`trade_model.py:1118`）。
  > 容易误传的一点：**0.0005 的滑点只存在于 `SharpeDaily` loss 函数内部**（`hyperopt_loss_sharpe_daily.py:38`），那是目标函数自己的假设，**不是撮合行为**。
- 交易限额：`get_min/max_pair_stake_amount()`（`:1086-1094, 723-724`）+ `wallets.validate_stake_amount()`（`:1112-1118`）+ 数量精度截断（`:1181-1188`，截断为 0 直接放弃）。
- `--eps` 仍在但已改名：它是 `position_stacking` 的别名（`cli_options.py:181-190`），控制"同 pair 多仓"与反向开仓（`backtesting.py:242, 1533-1535, 1552`）。

### 5.5 `--timeframe-detail` 的实现

- 启动校验：detail 周期必须**小于**主周期（`init_backtest_detail`，`:288-301`）；
- 加载 detail OHLCV（`_load_bt_data_detail`，`:399-415`）；
- 主循环内用 `_time_generator_det` 按 detail 步长展开（`:1614-1628`）：`idx == 0` 是主 K 线（入场判定在此，`check_for_trade_entry` `:1698`），后续细节行**复用缓存的 `trade_dir`**（`:1709`）并过 `ignore_expired_candle` 过滤延迟入场（`:1711-1718`）；
- detail 数据按主 K 线**惰性展开 + 缓存**（`:1733-1747`）。

### 5.6 Protections 在回测里的差异（容易搞错）

`--enable-protections`（`cli_options.py:198-205`）→ `Backtesting.__init__:243` → `reset_backtest()` 里 `_load_protections()`（`:506-507`）→ `ProtectionManager(config, strategy.protections)`（`:353-355`）。

**差异在评估时点**：回测中 protections **只在出场成交后**评估（`_process_exit_order` → `:852`），产出的 `PairLocks` 在入场时用 `PairLocks.is_pair_locked` 拦截（`:1553`）；而实盘每轮循环都会评估。另外 hyperopt 只要选中 `protection` 空间就会自动打开 protections（`hyperopt_optimizer.py:233-237`）。

---

## 6. 超参优化的实现

### 6.1 骨架：optuna + joblib，最小化目标

类名是 `HyperOptimizer`（不是 `HyperoptOptimizer`）。启动链路（`optimize/hyperopt/hyperopt.py:216`）：

```python
def start(self):
    ...
    self._set_random_state()          # :141-142 未指定则 random.randint(1, 2**16-1)，并打印出来供复现
    optimizer = self.get_optimizer(random_state)
```

`get_optimizer()`（`hyperopt_optimizer.py:406-438`）的要点：

- 采样器取策略 `generate_estimator()` 的返回值或配置，**`seed=random_state`** 注入；
- `Tpe/GP/CmaEs` 用 `n_startup_trials=INITIAL_POINTS`，`NSGA` 用 `population_size=INITIAL_POINTS`，而 `INITIAL_POINTS = 30`（`:51`）——这就是文档里"先跑 30 个随机组合"的来源；
- 最后 `optuna.create_study(sampler=sampler, direction="minimize")`（`:438`）。

多进程用 joblib：`Parallel(n_jobs=hyperopt_jobs)`（`hyperopt.py:229`），worker 侧 `@delayed @wrap_non_picklable_objects`（`:260-264`），**每个 epoch 都重新从 pickle 载入数据**（`:315-316`）——这是多进程模型下的必要代价。

### 6.2 一个 epoch 具体做什么

`generate_optimizer()`（`:266-334`）：

```text
写入选定参数
  → 应用 roi / stoploss / trailing / trades 空间
  → 载入指标数据（--analyze-per-epoch 时改为重算）
  → backtesting.backtest()
  → _get_results_dict → generate_strategy_stats
  → 算 loss
```

**一个防退化的闸门**：交易数小于 `hyperopt_min_trades` 时**直接返回 `MAX_LOSS = 100000`**（`:369-370`，常量在 `:53`）——防止优化器发现"不交易就不会亏"这个平凡最优解。这条闸门是自研超参搜索最容易漏掉的地方。

### 6.3 参数空间是怎么从策略里"长出来"的

```text
策略类里的 IntParameter / DecimalParameter / CategoricalParameter / BooleanParameter
  └── BaseParameter.get_space()            strategy/parameters.py:110,203,257,310,370
      └── Dimension
          └── convert_dimensions_to_optuna_space()    :391-399
              └── ft_IntDistribution / ft_FloatDistribution / ft_CategoricalDistribution
```

- `init_spaces()`（`hyperopt_optimizer.py:222-258`）枚举 `buy / sell / protection / roi / stoploss / trailing / trades` + 自定义空间；
- 内置空间由 `HyperOptAuto` 提供：`get_indicator_space()` / `roi_space()` / `stoploss_space()` / `trailing_space()` / `max_open_trades_space()`；
- 空间归一化后交给 optuna，**参数名到 optuna 分布对象的映射集中在 `optunaspaces.py`**。

### 6.4 Loss 函数：符号约定与四个实例

符号约定写在接口 docstring 里：*"returns smaller number for better results"*（`hyperopt_loss/hyperopt_loss_interface.py:38`），与 `direction="minimize"` 配套。

**① SharpeDaily**（`hyperopt_loss_sharpe_daily.py:37-46, 58-66`）——注意滑点在这里：

```python
resample_freq = "1D"
slippage_per_trade_ratio = 0.0005
days_in_year = 365
results.loc[:, "profit_ratio_after_slippage"] = results["profit_ratio"] - slippage_per_trade_ratio
sum_daily = (results.resample(resample_freq, on="close_date")
             .agg({"profit_ratio_after_slippage": "sum"}).reindex(t_index).fillna(0))
...
sharp_ratio = expected_returns_mean / up_stdev * math.sqrt(days_in_year)
return -sharp_ratio          # up_stdev == 0 时取 -20.0
```

**② MaxDrawDown**（`hyperopt_loss_max_drawdown.py:39-44`）：

```python
total_profit = results["profit_abs"].sum()
try:
    max_drawdown = calculate_max_drawdown(results, value_col="profit_abs")
except ValueError:            # 无亏损交易
    return -total_profit
return -total_profit / max_drawdown.drawdown_abs
```

**③ MultiMetric**（`hyperopt_loss_multi_metric.py:65-104`）——把多个指标取对数后**相乘**，再对交易数罚分：

```python
profit_factor    = winning_profit / (abs(losing_profit) + 1e-6)
log_profit_factor = np.log(profit_factor + PF_CONST)                     # PF_CONST = 1.0
_, expectancy_ratio = calculate_expectancy(results)
log_expectancy_ratio = np.log(min(10, expectancy_ratio) + EXPECTANCY_CONST)  # 2.0
winrate = len(winning_trades) / len(results)
log_winrate_coef = np.log(WINRATE_CONST + winrate)                        # 1.2
if trade_count < TARGET_TRADE_AMOUNT:                                     # 50
    trade_count_penalty = max(1 - abs(trade_count - 50) / 50, 0.1)
profit_draw_function = total_profit - (relative_account_drawdown * total_profit) * (1 - DRAWDOWN_MULT)  # 0.055
return -1 * (profit_draw_function * log_profit_factor * log_expectancy_ratio * log_winrate_coef * trade_count_penalty)
```

**④ ShortTradeDur**（默认 loss，`hyperopt_loss_short_trade_dur.py:45-52`）——三项目标相加：

```python
trade_loss    = 1 - 0.25 * exp(-((trade_count - TARGET_TRADES) ** 2) / 10**5.8)   # TARGET_TRADES = 600
profit_loss   = max(0, 1 - total_profit / EXPECTED_MAX_PROFIT)                    # = 3.0
duration_loss = 0.4 * min(trade_duration / MAX_ACCEPTED_TRADE_DURATION, 1)        # = 300
return trade_loss + profit_loss + duration_loss
```

> 读这四个 loss 的共同感受：**它们都把"你想要的"翻译成一个标量**，且都显式处理了退化情形（无亏损、无交易、方差为 0）。这正是自研评估体系最容易偷懒的地方。

### 6.5 结果回写：写 `json`，不改 `.py`

`HyperoptTools.try_export_params()`（`hyperopt/hyperopt_tools.py:101-108`）在 `FTHYPT_FILEVERSION >= 2` 且未设 `disableparamexport` 时调用 `export_params()`（`:64-84`），生成结构：

```json
{ "strategy_name": "...", "params": { "...优化与未优化的参数..." }, "ft_stratparam_v": ..., "export_time": ... }
```

并 dump 到**策略文件旁边的同名 `.json`**（`fn.with_suffix(".json")`）。`--disable-param-export`（`cli_options.py:256`）关掉的就是这一步。

**这个设计值得注意**：优化结果与策略源码解耦——策略文件保持可读的类定义，最优参数作为**数据文件**被加载；同一份策略可以挂多组参数（对应多份 json），回测报告里也会带参数文件副本。

---

## 7. 两个偏差分析命令的实现

这两个命令的价值在于：**它们不读策略代码，只靠"截断数据重跑 + 逐值对比"来反证**。方法论可移植，实现细节则与市场结构强相关。

### 7.1 `lookahead-analysis`

**基线**：`fill_full_varholder()` 用完整 timerange、完整 pair 列表跑一次真回测，拿到真实成交列表（`analysis/base_analysis.py:46-62`、`analysis/lookahead.py:44-51`）。

**切片重跑**：对基线的**每一笔成交**做两次（`lookahead.py:139-160`）：

| 切片 | 截断点 | pairlist |
|---|---|---|
| 入场切片 | `to_dt = open_date + 1 根 K 线` | **只含该 pair**（实现是把 `pair_whitelist` 覆盖成 `[result_row["pair"]]`，`:115`） |
| 出场切片 | `to_dt = close_date + 1 根 K 线` | 同上 |

**两条独立判定通道**：

1. `report_signal()`（`:53-63, 178-189`）：切片回测里**是否还存在同一时间戳的成交**（`open_date` / `close_date` 精确相等）——不存在就计入 `false_entry_signals` / `false_exit_signals`；
2. `analyze_indicators()`（`:66-95`）：用 `pandas.compare` 比较全量与切片的**指标列**，任一列有差异即记入 `false_indicators`（注意只比较 `compare_df.iloc[0]` 这一行）。

**判定**：`has_bias = True` 的条件是**三个计数器任一 > 0**（`:277-284`）——没有数值阈值。唯一会置 `failed_bias_check` 的情况是"总信号数 < `--minimum-trade-amount`"（`:268-276`）。

**为压制假阳性做的处理**：跳过 `force_exit` 产生的成交（`:241-252`）与最后一根的强制平仓（`:165-166`）；强制覆盖参数在 `lookahead_helpers.py:149-212`：关 protections、强制市价单、`max_open_trades=-1`、钱包 ≥ 1e9、`stake_amount=10000`、`backtest_cache='none'`。

> **代码证实了文档里的那句 caveat**：它的核心假设是"单 pair 切片等价于全名单回测"（`:139-160`）。**任何依赖横截面排序的策略（比如按波动率排名选币）都会被判为有偏**，这是实现方式的固有局限，不是 bug。

### 7.2 `recursive-analysis`

**预热档位序列**：默认 `[199, 399, 499, 999, 1999]`（`analysis/recursive.py:31-33`），并把策略自身的 `startup_candle_count` 追加进去后排序（`:167-169`）；CLI 参数是 `--startup-candle`。

**每个档位构造一个 partial**（`:176-188`）：

```text
from_dt = 结束时间 − 1 根 K 线
并把 startup_candle_count = N 注入配置
```

于是每个 partial 只保留"**1 根待评估 K 线 + N 根预热**"——这正是实盘能拿到的数据形状。

**对比**：只比最后一行的指标值（`:52-85`）：

```python
base_last_row = self.full_varHolder.indicators[pair_to_check].iloc[-1]
part_last_row = part.indicators[pair_to_check].iloc[-1]
compare_df = base_last_row.compare(part_last_row)
...
if (values_diff_self and values_diff_other and is_number(values_diff_self) and is_number(values_diff_other)):
    diff = round((values_diff_other - values_diff_self) / values_diff_self, 12)
else:
    diff = "nan"                      # → 表格里的 nan%
self.dict_recursive[indicator][part.startup_candle] = float(diff)
```

- **`nan%` 的来源**就是上面那个 `else` 分支（值为 0 或非数值，无法算相对差）；
- 表格里的 `-` 表示"该 startup 档位没有记录"（`recursive_helpers.py:34-37`）；
- `:87-89` 还有一个细节：某个 partial 完全没有差异时会 `break`，**停止后续更大档位的检查**（因为再大也不会变）；
- cache 强制 `none`（`recursive_helpers.py:56-65`）。

**附带的指标级 lookahead 检查**（`:93-123`）：取"全起点 + 10 根"的 partial，按同一 `date` 行与基线对比。

### 7.3 指标口径（`optimize_reports/` + `data/metrics.py`）

| 指标 | 公式 | 位置 |
|---|---|---|
| total profit | `results["profit_abs"].sum()`；相对值再 `/ start_balance` | `optimize_reports.py:672-675` |
| max drawdown | 累计曲线 `cumsum()` → `high = cummax` → `drawdown = cum − high`；绝对值取 `drawdown` 最小值，相对值 `(max_balance − cum_balance)/max_balance` | `metrics.py:130-162, 207-270` |
| sharpe | `mean = (Σ profit_abs/start)/days`，`std = np.std(profit_abs/start)`（ddof=0），`mean/std*√365`；std 为 0 或 nan → **−100** | `metrics.py:455-475, 341-358` |
| sortino | 同 sharpe，但分母换成 `down_stdev = std(仅亏损交易)` | `metrics.py:421-428` |
| calmar | `expected = (Σ profit_abs/start)/days*100`，分母 `relative_account_drawdown`，再 `*√365` | `metrics.py:552-568` |
| winrate | `len(profit_abs > 0) / len(results)` | `optimize_reports.py:217, 498` |
| profit factor | `Σ盈利 / \|Σ亏损\|`（无亏损记 0.0） | `optimize_reports.py:648-650` |
| expectancy | `winrate*avg_win − loserate*avg_loss`；`expectancy_ratio = (1+risk_reward)*winrate − 1` | `metrics.py:320-338` |

另有一族 `*_from_balance` 指标：基于钱包快照按日 `pct_change` 计算（`metrics.py:361-379, 478-498`），用于有 wallet capture 的场景（`optimize_reports.py:67-71`）。

---

## 8. 持久化 / RPC / 插件体系 / FreqAI

### 8.1 数据模型：六张表

SQLAlchemy 2.x `DeclarativeBase` + `scoped_session`，默认后端 SQLite（生产 `tradesv3.sqlite`、dry-run `tradesv3.dryrun.sqlite`，见 `constants.py:22-23`），任何 SQLAlchemy URL 均可。

| 表 | 关键字段 | 作用 |
|---|---|---|
| `trades` | `is_open`、`fee_open/fee_open_cost/fee_open_currency` + close 三件套、`open_rate/close_rate`、`realized_profit`、`stake_amount/amount`、`stop_loss/initial_stop_loss/is_stop_loss_trailing`、`max_rate/min_rate`、`exit_reason`、`leverage/is_short/liquidation_price`、`record_version` | 持仓与盈亏真值 |
| `orders` | `ft_trade_id`(FK)、`ft_order_side`、`ft_is_open`、`order_id`、`status`、`filled/remaining/cost`、`stop_price`、`ft_fee_base`、`ft_order_tag` | **镜像 ccxt 订单结构**，1 Trade → N Order |
| `pairlocks` | `pair`、`side`、`reason`、`lock_time`、`lock_end_time`、`active` | protections 的唯一落库产物 |
| `trade_custom_data` | `ft_trade_id`(FK)、`cd_key`、`cd_type`、`cd_value` | 策略可写的 trade 级 KV |
| `KeyValueStore` / `wallet_history` | — | 全局 KV、钱包历史快照（`*_from_balance` 指标的来源） |

三个设计要点：

- **`is_open` 单字段驱动"是否持仓"**；止损语义由 `stop_loss` + `initial_stop_loss` + `is_stop_loss_trailing` 三件套决定（对应 §4.3 的追踪止损实现）。
- **订单表镜像 ccxt**：订单事实来自交易所，本地表只是投影，唯一约束 `(ft_pair, order_id)`（`trade_model.py:65-88`）。
- 超长的 `enter_tag` / `exit_reason` 由 `@validates` 自动截断（`trade_model.py:1817-1822`）。

**迁移不是 Alembic**（`persistence/migrations.py`）：`create_all()` 之后跑一次"**列存在性检测 + 备份表重建**"式手写迁移（`:412,436,453` 的判据就是 `has_column(cols_trades,"record_version")` 这类检查），配合 `set_sqlite_to_wal`（`:351`）与数据修补（`:358,393`）。另有换库迁移 `db_migration.py:18-57`：逐表 `make_transient()` 后 `add()`，再 `set_sequence_ids()` 修主键序列。

> 这一条**不建议照抄**：这种"列存在性 + 重建"的方式每改一次表就要手写一段重建逻辑，不可扩展。自研系统用 Alembic 或显式 schema 版本号更划算。

### 8.2 提交时机与崩溃恢复：靠对账，不靠日志回放

`Trade.commit()` 就是 `Trade.session.commit()`（全局 scoped session，`trade_model.py:1833-1839`）。调用点严格贴在"**状态发生不可重建变化**"之后：

| 时机 | 位置 |
|---|---|
| 开仓落库 | `freqtradebot.py:1235-1236` |
| 成交回写 | `:2555` |
| 交易所止损单平仓 | `:1509` |
| 平仓 | `:2372` |
| 补记订单 / 撤单 / 改单 | `:721`、`:2008`、`:2036` |
| 精度回填 | `:568` |
| **每轮兜底** | `:347`（平仓后）、`:360`（开仓后） |

崩溃恢复**不是 WAL 回放**，而是启动后的三类对账任务：

1. `startup_update_open_orders()`（`:570-600`）：取本地仍 open 的订单逐个向交易所核对并 `update_trade_state`；**dry-run 直接跳过**；超过 5 天未确认的订单视为已取消（`:604-612`）。
2. `update_trades_without_assigned_fees()`（`:617-637`）：补齐平仓侧手续费（见 §4.8）。
3. `handle_onexchange_order()`（`:684`）：处理"交易所有单、本地无 trade"的孤儿单。

> 这套设计的精髓：**本地状态永远可以通过"问交易所 + 重算"重建**。所以崩溃后不需要精确重放，只需要对账。这也是 §4 里"订单事实驱动、`recalc_trade_from_orders()` 重算"的必然推论。

### 8.3 RPC 与 REST API：一个 RPC + 四个 Handler

四个通道（Telegram / Discord / Webhook / REST API）**共享同一个 `RPC` 实例**：业务逻辑全部集中在 `RPC` 的 `_rpc_*` 方法上（共 36 个），通道只是 `RPCHandler` 子类（`rpc/rpc.py:87-89`、`rpc_manager.py:20-60`）。

- **慢通道必须走队列**：`RPCManager._register` 为 `_use_queue=True` 的模块各起一个 worker 线程 + 队列（`rpc_manager.py:62-76`），`_dispatch` 在队列积压 100 条时告警（`:100-111`）——这样外网 IO 不会拖慢主循环。
- **freqUI 不是独立通道**：它就是 ApiServer 挂的静态 UI 路由 + `/message/ws` WebSocket（`webserver.py:281,283`）。

**REST 路由按职责分模块**：

| 模块 | 职责 |
|---|---|
| `api_v1.py` | 信息类：`ping`（公开）/`version`/`show_config`/`logs`/`markets`/`strategy`/`sysinfo`/`health`；`API_VERSION = 2.50` |
| `api_trading.py` | **交易控制**：balance/count/profit/status/trades/`forceenter`/`forceexit`/blacklist/whitelist/locks/start\|stop\|pause/reload_config/pair_candles |
| `api_backtest.py` | **回测**：POST/GET/DELETE `/backtest`、abort、`/backtest/history*`、market_change |
| `api_analysis.py` | lookahead / recursive 两个独立 router（后台任务） |
| `api_pairlists.py` / `api_pair_history.py` / `api_download_data.py` | pairlist 评估、历史 K 线、数据下载 |
| `api_webserver.py` | webserver 模式专用：strategies / exchanges / hyperoptloss / freqaimodels |
| `api_background_tasks.py` | `/background*` 任务查询与删除 |
| `api_ws.py` / `web_ui.py` | `/message/ws`；UI 静态兜底（含目录穿越防护，`web_ui.py:33,48`） |

**鉴权**：统一 `http_basic_or_jwt_token`（Basic 或 JWT 二选一，`api_auth.py:108-121`），`verify_auth` 用 `secrets.compare_digest` 防时序攻击（`:22-26`）；JWT 为 HS256，**access 15 分钟 / refresh 30 天**（`:89-105`）；WebSocket 用 `ws_token` 或 JWT，失败直接 `close(1008)`（`:56-86`）。启动时对三类风险告警：**非 loopback 监听、空密码、使用默认 `jwt_secret_key`**（`webserver.py:295-345`）。

**webserver 模式 vs trade 模式**（一个常被混淆的点）：
- webserver 模式**没有 RPC handler**，`get_rpc()` 直接抛 `RPCException("Bot is not in the correct state")`（`deps.py:17-36`）；
- 路由里用 `if not rpc or config["runmode"] == RunMode.WEBSERVER:` 分支**临时加载**策略/交易所（`api_v1.py:143-149,167-192`）；
- 因此 webserver 模式可以并发跑回测/超参/分析（走 `ApiBG` 后台任务），trade 模式不行；
- 模式门禁用依赖实现：`is_trading_mode` / `is_webserver_mode`，不符合直接返回 503（`deps.py:68-75`）。

### 8.4 pairlist 插件：把"能否回测"写成类型

契约是 `IPairList` 的三件套（`pairlist/IPairList.py:279-329`）：`gen_pairlist()`（**只有链头实现**）、`filter_pairlist()`（默认逐对调 `_validate_pair()`）、`needstickers`；外加两个声明式类属性 `is_pairlist_generator`、`supports_backtesting`。

`PairListManager` 按配置里 `pairlists` 的顺序加载插件，**第一个必须是生成器**，其后依次过滤，最后统一过黑名单（`pairlistmanager.py:137-175`）。

**最值得抄的一处**是 `SupportsBacktesting` 四态（`IPairList.py:60-68`）在回测启动时的处理（`pairlistmanager.py:65-96`）：

| 取值 | 回测行为 |
|---|---|
| `YES` | 正常使用 |
| `NO` | **启动即抛 `OperationalException`**（"do not support backtesting"） |
| `NO_ACTION` | 警告"回测里不会像 dry/live 那样行为" |
| `BIASED` | 警告"will introduce a lookahead bias ... 'winner bias'" |

这就是文档里"动态 pairlist 让回测不可复现"的**代码实现**——不是写在文档里的注意事项，而是插件必须声明的类型属性，运行时自动检查。另外回测还硬性拒绝含 `VolumePairList` 的配置，以及"多策略 + `PrecisionFilter`"的组合（`backtesting.py:248-256`）。

**内置 20 个实现**，按角色分：

| 角色 | 实现 |
|---|---|
| 生成器（7） | `StaticPairList`（唯一 `YES`）、`VolumePairList`、`MarketCapPairList`、`PercentChangePairList`、`CrossMarketPairList`、`RemotePairList`、`ProducerPairList` |
| 过滤器（13） | `AgeFilter`、`DelistFilter`、`PriceFilter`、`SpreadFilter`、`PrecisionFilter`、`RangeStabilityFilter`、`VolatilityFilter`、`PerformanceFilter`、`OffsetFilter`、`FullTradesFilter`、`ShuffleFilter`、`PairInformationFilter` |

仅 `StaticPairList`、`OffsetFilter`、`ShuffleFilter` 声明为可回测；`PriceFilter` / `PrecisionFilter` / `MarketCapPairList` 等标 `BIASED`（因为用的是"当前"价格/市值）。

### 8.5 protection 插件：只负责"写锁"，不负责"解锁"

`IProtection` 只有两个决策入口（`protections/iprotection.py:97-122`）：

- `global_stop()` → 全局停手（返回 `ProtectionReturn(lock, until, reason, lock_side)`）
- `stop_per_pair()` → 锁单个交易对

`ProtectionManager` 只对**声明了** `has_global_stop` / `has_local_stop` 的插件分别调用，命中后**唯一动作是写一条 `PairLock`**（`pair="*"` 即全局，`protectionmanager.py:50-94`）。

**解锁不靠定时任务，靠查询期过滤**（`pairlock.py:54-58`）：`active=True 且 lock_end_time > now`。`until` 由 `calculate_lock_end()` 算（`iprotection.py:124-143`）：窗口内**最后一笔平仓时间 + `stop_duration`**，或 `unlock_at` 指定时刻（已过则顺延次日），再按 timeframe **向上取整**。

| 内置 protection | 判定条件 | 动作 |
|---|---|---|
| `StoplossGuard` | lookback 窗口内 `exit_reason ∈ {stop_loss, trailing_stop_loss, stoploss_on_exchange, liquidation}` 且 `close_profit < required_profit` 的交易数 ≥ `trade_limit`（默认 10）；可选 `only_per_side` | 锁 `*` 或按方向锁 |
| `MaxDrawdown` | 窗口内已平仓数 ≥ `trade_limit`（默认 1），回撤超 `max_allowed_drawdown`；`calculation_mode="equity"` 用钱包基准算 `relative_account_drawdown`，否则用旧的 `close_profit` 口径 | **全局停手** |
| `LowProfitPairs` | 窗口内该 pair 交易数 ≥ `trade_limit` 且累计利润 < `required_profit` | 锁该 pair |
| `CooldownPeriod` | 窗口内该 pair 有已平仓交易即成立；`global_stop()` 明确返回 `None` | 锁该 pair |

配置校验会拒绝互斥项：`stop_duration` 与 `stop_duration_candles`、`lookback_period` 与 `lookback_period_candles`、`unlock_at` 与 stop_duration（`protectionmanager.py:96-131`）。

> 这个分工（**插件只产出"锁"，过期交给查询过滤**）比"插件自己管定时器"简单得多，也更不容易出错。

### 8.6 FreqAI 管线

入口 `IFreqaiModel.start()`（`freqai/freqai_interface.py:130-172`）按 runmode 分两条路：live/dry 走 `start_live()`（必要时重训），回测走 `start_backtesting()`（按 `train_period_days` **滑窗**，逐窗训练 → 预测 → 拼接）。

数据准备全在 `FreqaiDataKitchen`，调用顺序固定：

```text
use_strategy_to_populate_indicators()              data_kitchen.py:777-865
├── populate_features()                            :716-775
│   ├── feature_engineering_expand_all(df, t, metadata)    # 按 include_timeframes 展开
│   ├── feature_engineering_expand_basic()                 # 按 indicator_periods_candles 展开
│   └── include_shifted_candles → 生成 _shift-N 特征
├── feature_engineering_standard(df, metadata)
└── set_freqai_targets()                           # 仅 live 分支直接调；回测在 :342-354 分段调
    ↓
find_features / find_labels                        # 按 "%" 前缀=特征、"&" 前缀=标签 识别
    ↓
make_train_test_datasets()                         # train_test_split，缺省 shuffle=False
    ↓
normalize_data() → 模型 train()/fit() → predict() → append_predictions() → 回到策略 DataFrame
```

两个细节：`data_kitchen.py:806-819` 会**拒绝旧的 `populate_any_indicators()`**（对应文档里 2023.3 的移除）；特征/标签靠**列名前缀**（`%` / `&`）识别，而不是靠注册表。

**内置模型**：

| 类别 | 模型 |
|---|---|
| 回归（5） | `LightGBMRegressor`、`XGBoostRegressor`、`XGBoostRFRegressor`、`PyTorchMLPRegressor`、`PyTorchTransformerRegressor` |
| 分类（5） | `LightGBMClassifier`、`XGBoostClassifier`、`XGBoostRFClassifier`、`SKLearnRandomForestClassifier`、`PyTorchMLPClassifier` |
| 多目标（3） | `LightGBMRegressorMultiTarget`、`LightGBMClassifierMultiTarget`、`XGBoostRegressorMultiTarget` |
| 强化学习（2 + 环境基类） | `ReinforcementLearner`、`ReinforcementLearner_multiproc`；环境基类 `BaseEnvironment` + `Base3ActionRLEnv` / `Base4ActionRLEnv` / `Base5ActionRLEnv` |

### 8.7 并发与会话：`LocalTrade` 与 `Trade` 的分工

- **会话是 `scoped_session`**，作用域函数取"FastAPI 请求 ID 或线程 ID"（`persistence/models.py:33-42,86-95`），同一请求/线程内共享一个 session。
- SQLite 特殊处理：`check_same_thread=False`；内存库用 `StaticPool`（`:62-74`）。
- **Web 层显式防跨请求脏读**：依赖里请求开始 `Trade.rollback()`，`finally` 里 `Trade.session.remove()`（`api_server/deps.py:23-36`）；`CustomData` 用**独立** session（`autoflush=True`）并在 RPC 包装器前后各 rollback（`models.py:102-118`）。
- **`LocalTrade` 是纯 Python 容器**：`use_db = False`，类级 `bt_trades` / `bt_trades_open` / `bt_trades_open_pp`（`trade_model.py:385-397`）；`Trade(ModelBase, LocalTrade)` 继承并叠加 DB 映射。
- 两者的切换靠 `Trade.use_db` 开关与 `FtNoDBContext`（`usedb_context.py:6-35`，同时关掉 `Trade`/`PairLocks`/`CustomData` 的落库）。**回测用前者的唯一目的是避免逐 K 线写库。**

---

## 9. 数据层：怎么把行情变成"可复现的本地资产"

这一层决定了回测能不能复现，值得单独看。核心设计是**"磁盘就是数据库"**：没有任何中央索引，文件命名即索引，靠正则扫描目录发现数据。

### 9.1 插件式 handler 与文件命名

继承链极短，格式差异被压到最小：

```text
IDataHandler (ABC, idatahandler.py:38)
└── ArrowDataHandler (arrowdatahandler.py:21)      # pyarrow 列式，通用逻辑都在这里
    ├── FeatherDataHandler   (17 行)
    └── ParquetDataHandler
JsonDataHandler / JsonGzDataHandler（旧格式，保留读取）
```

`featherdatahandler.py` 全文只有 17 行——**真正的实现只有两个方法**：

```python
def _store_dataframe(self, data, filename):
    data.to_feather(filename, compression_level=9, compression="lz4")
def _load_dataframe(self, filename):
    return read_feather(filename)
```

- **文件名约定**：`{pair}-{timeframe}{candle_type}.{ext}`（`idatahandler.py:354-370`），如 `BTC_USDT-5m.feather`；trades 数据为 `{pair}-trades.{ext}`（`:374-380`）。pair 里的 `/` 被替换掉，所以文件名天然合法。
- **发现机制**：`ohlcv_get_available_data()` 直接 `datadir.glob("*.feather")` 再跑 `_OHLCV_REGEX` 解析文件名（`idatahandler.py:53-65`）。没有 manifest、没有索引表——**加一个文件就等于多一份数据**。
- 格式工厂在文件底部按名字分发（`idatahandler.py:594-614`），`convert-data` 子命令就是"用 A handler 读、用 B handler 写"。

### 9.2 读取路径：谓词下推 + 列归一 + 容错

读一个 pair 的完整流程（`ArrowDataHandler._ohlcv_load`，`arrowdatahandler.py:65-103`）：

1. **算文件名**，不存在则尝试"未做 timeframe 改写"的回退文件名（兼容早期 1M 数据，`:81-87`）；
2. **构造 Arrow 谓词过滤器**并下推到文件读取（`_build_arrow_ohlcv_filter`，`:105`）—— 在 `date` 列上过滤，**上下界各放宽一根 K 线**，好处是上层裁剪后还能判断"边界外是否还有数据"，从而给出准确的数据不足告警；
3. **列归一化**：`_normalize_columns` 把旧版本写下的列布局映射到当前 schema（`idatahandler.py:136-200`）——这是它能读几年前下载的数据的原因；
4. 按 candle type 定型：`astype(get_candle_dtypes(candle_type))`，`date` 统一成毫秒（`arrowdatahandler.py:93-95`）；
5. **单文件损坏不拖垮整体**：读失败记 exception 日志并返回空 DataFrame（`:97-103`）。

> 列集合由 candle type 决定（`get_candle_columns`）：现货是标准 OHLCV；期货会多出 `mark`、`funding_rate`，其中 funding_rate **只有 `date` 与 `funding_rate` 两列**（不再是伪装成 K 线的写法）。

### 9.3 增量下载：只补缺口，且拒绝静默错位

`_load_cached_data_for_updating()`（`history_utils.py:180-232`）是"增量下载"的全部秘密，50 行里有三个判断：

```python
data = data_handler.ohlcv_load(pair, timeframe=timeframe, timerange=None, ...)   # ① 故意全量加载
if not data.empty:
    if prepend:
        end = data.iloc[0]["date"]          # ② 向前扩展：从现有数据的"第一根"往前下
    else:
        if start and start < data.iloc[0]["date"]:
            logger.info("...Use `--prepend` ..., or `--erase` to redownload all data.")
        start = data.iloc[-1]["date"]        # ③ 向后续传：从现有数据的"最后一根"往后下
```

- **`timerange=None` 是有意为之**：注释写明"故意不传 timerange，因为需要完整数据集"——只有看到首尾两根，才能算出真实缺口。
- **向后永远从最后一根续**，所以不可能在中间留空洞（这也是文档说"增量下载不需要传 `--days/--timerange`"的实现依据）。
- **向前扩展要人显式确认**：请求的起点早于本地第一根时，它只打印提示、要求你用 `--prepend`，**绝不擅自覆盖**——避免"以为补了历史、其实没补"。

### 9.4 缺口校验与补洞

| 机制 | 实现 |
|---|---|
| 缺口体检 | `validate_backtest_data()`（`:676-702`）按 timeframe 期望根数 vs 实际根数比对，打印 `has missing frames: expected X, got Y, that's N missing values` |
| 补洞 | `load_pair_history(fill_up_missing=True)`（`:45-80`）用"No action"蜡烛填缺口（OHLC=前收盘、volume 空） |
| 期货附加数据 | `refresh_backtest_ohlcv_data()` 自动为期货补 `mark` 与 `funding_rate`（`:415-419`） |
| 批量并行 | `_download_all_pairs_history_parallel()`（`:488-521`）：起点足够新时用一次 `refresh_latest_ohlcv` 批量拿多个 pair |
| tick 数据 | `_download_trades_history()`（`:524-604`）：`since` 会回退到"最后一笔成交 −5 秒"，避免边界丢数据 |

---

## 10. 值得注意的工程手法

以下都是读代码时"看到会记一笔"的做法，与市场无关，属于通用工程经验。

| # | 手法 | 位置 | 一句话 |
|---|---|---|---|
| 1 | **状态真值放持久化层，每轮重查** | `freqtradebot.py:319,344` | 内存里不维护"当前持仓"权威副本；一轮里查两次是因为中间步骤会改状态 |
| 2 | **节流对齐 K 线边界** | `worker.py:145-187` | 执行耗时算进周期（周期不漂移）+ `min(sleep, 下一根K线+1s)` + 专门避开"刚出 K 线的 1 秒窗口" |
| 3 | **顺序即风控** | `freqtradebot.py:343-358` | 平仓 → 调仓 → 开仓；资金与槽位先释放再占用 |
| 4 | **锁只保护会改外部状态的段** | `freqtradebot.py:336,343,353` | 分析阶段不加锁；只有下单/改单/平仓进 `_exit_lock`，注释说明是为防 RPC 线程重入 |
| 5 | **用户代码全量安全包装** | `freqtradebot.py:329` | `strategy_safe_wrapper(..., supress_error=True)`：策略里的 bug 只影响它自己那一步 |
| 6 | **磁盘即数据库，文件名即索引** | `idatahandler.py:53-65` | 正则扫描目录发现数据，无 manifest、无索引表；加文件即加数据 |
| 7 | **读取谓词下推 + 边界各放宽一根** | `arrowdatahandler.py:105-110` | 过滤在 Arrow 层做；放宽一根是为了还能判断"边界外有没有数据" |
| 8 | **兼容逻辑集中且显式化** | `idatahandler.py:136-200`、`candle_columns.py:36` | 旧列布局映射只写在一处（`_normalize_columns`）；funding rate 的旧写法只有一个别名 `{"open": "funding_rate"}` |
| 9 | **单一权威声明** | `candle_columns.py:8` | 该文件自称"which columns does this candle type have"的唯一权威——避免 schema 散落 |
| 10 | **异常分级处理** | `worker.py:197-205`、`arrowdatahandler.py:97-103` | 临时错误原地重试、操作错误停机提示人工、单文件损坏返回空 df 而不中断全局 |
| 11 | **枚举字符串化以服务导出** | `exittype.py:23-25` | `__str__` 返回 `value`，注释写明"便于导出数据"——退出原因直接进统计表 |
| 12 | **常量集中且可覆盖** | `constants.py:17,19` | `PROCESS_THROTTLE_SECS=5`、`RETRY_TIMEOUT=30`，均可在配置里覆盖 |

---

## 11. 速查表

### 11.1 信号列契约（`strategy/signaltype.py`）

策略对"市场状态"的唯一输出方式，就是往 DataFrame 里写这几列：

| 列名 | 含义 |
|---|---|
| `enter_long` / `enter_short` | 值 `1` 表示入场信号 |
| `exit_long` / `exit_short` | 值 `1` 表示出场信号 |
| `enter_tag` / `exit_tag` | 字符串标签，仅用于事后归因统计（`/entries`、`/exits`、`/mix_tags`），不参与判定 |

`SignalDirection = {LONG, SHORT}`。

### 11.2 十二种退出原因（`enums/exittype.py`）

统计表里的"退出原因"就是这份枚举，全部落库进 `Trade.exit_reason`：

```text
roi · stop_loss · stoploss_on_exchange · trailing_stop_loss · liquidation
exit_signal · force_exit · emergency_exit · custom_exit · partial_exit
sold_on_exchange · （空 = NONE，表示未触发）
```

配套的 `ExitCheckTuple`（`enums/exitchecktuple.py`）只有两个字段 `exit_type` + `exit_reason`，`exit_reason` 缺省取 `exit_type.value`；`exit_flag` 定义为 `exit_type != NONE` —— **`should_exit()` 返回的列表就是按"谁先命中"排好序的 `ExitCheckTuple`**。

### 11.3 K 线类型（`enums/candletype.py`）

`spot · futures · mark · index · premiumIndex · funding_rate · open_interest`（`borrow_rate` 注释里标注未实现）。

### 11.4 数据文件名约定

| 数据 | 文件名 | 说明 |
|---|---|---|
| K 线 | `{PAIR}-{timeframe}{candle_suffix}.{ext}` | 如 `BTC_USDT-5m.feather`；pair 中的 `/` 被替换 |
| Tick | `{PAIR}-trades.{ext}` | 列固定为 `timestamp,id,type,side,price,amount,cost`（`constants.py:90`，注释警告**不要改顺序**） |

### 11.5 关键常量（`constants.py`）

| 常量 | 值 | 用途 |
|---|---|---|
| `PROCESS_THROTTLE_SECS` | 5 | 主循环默认节流周期（秒） |
| `RETRY_TIMEOUT` | 30 | 临时错误后的重试等待（秒） |
| `UNLIMITED_STAKE_AMOUNT` | `"unlimited"` | `stake_amount` 的特殊取值，触发按槽位均分 |
| `CUSTOM_TAG_MAX_LENGTH` | 255 | `custom_exit` 返回的自定义退出原因会被截断到此长度 |

---


## 12. 附：CLI 能力地图

子命令与实现的对应关系（`commands/__init__.py` 的导入清单）：

| 组 | 子命令 |
|---|---|
| 交易 | `trade`（`start_trading`）、`webserver` |
| 数据 | `download-data`、`list-data`、`list-trades`、`convert-data`、`convert-trade-data`、`trades-to-ohlcv` |
| 研究 | `backtesting`、`backtesting-show`、`backtesting-analysis`、`hyperopt`、`hyperopt-list`、`hyperopt-show`、`lookahead-analysis`、`recursive-analysis`、`plot-dataframe`、`plot-profit` |
| 策略开发 | `new-strategy`、`strategy-updater`、`test-pairlist`、`list-strategies`、`list-timeframes`、`list-markets`、`list-exchanges`、`list-hyperoptloss`、`list-freqaimodels` |
| 配置 | `new-config`、`show-config` |
| 运维 | `create-userdir`、`install-ui`、`convert-db`、`show-trades` |
| 已移除但保留桩 | `edge` |

**`edge` 是个好例子**（`commands/optimize_commands.py:126-136`）：Edge 模块 2023.9 弃用、2025.6 移除，但子命令**没有删掉**，而是保留成一个抛 `ConfigurationError` 的桩：

```python
def start_edge(args):
    raise ConfigurationError(
        "The Edge module has been deprecated in 2023.9 and removed in 2025.6. "
        "All functionalities of edge have been removed."
    )
```

老脚本执行 `freqtrade edge` 会得到一句明确的迁移说明，而不是 `unknown command`——**删功能时给用户一条明路**，这个做法值得学。

---

## 13. 结语：它的量化实现可以浓缩成三句话

1. **框架只做"确定性执行"**：指标与阈值交给策略文件（`populate_indicators` 是唯一的抽象方法），框架负责把"最新一根已收盘 K 线的四个布尔列"变成订单，中间夹着写死优先级的出场判定与一套仓位公式。
2. **一切正确性都建立在时序纪律上**：回测用 `shift(1)` 把信号移出未来、DataProvider 用私有切片在回测里造出"信息边界"、`startup_candle_count` 保证指标预热一致——**这三件事任何一件破了，回测结论就作废**。
3. **把"结论可能是假的"做成可执行检查**：`lookahead-analysis`（截断重跑 + 逐值对比）与 `recursive-analysis`（不同预热长度比最后一行）不读策略代码，靠反证给结论；pairlist 的 `BIASED` 声明则把"回测不可复现"从注释升级成运行时报错/告警。

> 本文所有行号对应 **develop 分支 2026-10-03 快照**；`stable` 分支可能有偏移。全文结论来自静态阅读源码，未运行任何 Freqtrade 代码。

