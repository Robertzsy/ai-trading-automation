# 引擎 API 与 DSH 桥契约（AI Trading Automation 2.0）

引擎（`engine/`）是 2.0 的执行面：行情、选股、组合优化、硬风控、纸面经纪、
账户、调度、报告与通知。决策面是 DSH 应用（`app/`）。两面通过两条通道连接：

1. **HTTP 命令 API**（`engine.api.server`，默认 `127.0.0.1:8790`）：
   DSH 侧 MCP 桥（P1）与桌面壳调用。
2. **周期执行器（cycle runner）**（P3）：引擎调度器在轮次时刻调用 DSH
   桥注册的执行器，由后者拉起 `investment`（headless）profile 完成一轮
   AI 决策，结果交回引擎写报告、反思、通知；硬风控与纸面撮合始终在引擎内。

## HTTP 命令 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务与版本信息 |
| GET | `/api/status` | `runtime_status()`：控制状态、授权书、各市场会话与最新报告 |
| GET | `/api/analysis/latest` | 最近分析轮次、阶段、Agent/证据计数与检查点 |
| GET | `/api/analysis/runs` | 分析轮次列表（支持 `market` / `limit`） |
| GET | `/api/analysis/run` | 按 `cycle_id` 读取一轮完整状态 |
| POST | `/api/analysis/runs/start` | 创建或恢复同一 cycle id 的工作流 |
| POST | `/api/analysis/runs/update` | 更新阶段、Agent 事件或原子检查点 |
| POST | `/api/analysis/runs/checkpoint` | 原子保存完整阶段证据和检查点；重复保存同内容幂等，上限 32MB |
| POST | `/api/analysis/runs/complete` | 保存最终决策与引擎执行真值 |
| POST | `/api/analysis/runs/fail` | 保存失败原因，保留已有检查点供续跑 |
| POST | `/api/analysis/rounds/start` | **Web 启动固定分析轮次（异步、幂等）**：`{cycle_id, market, symbols?, symbols_source?, label, retry?}`；同一 cycle_id 最多一个活跃轮次；failed 仅在明确传 `retry=true` 时从检查点续跑；引擎强制 `submit=false`（分析只生成方案，成交必须等用户随后批准的 `submit_decisions`） |
| GET | `/api/analysis/rounds/active` | 当前活跃的异步轮次列表 |
| POST | `/api/commands/issue` | 派发投资命令（见 `engine/investment/contracts.py`） |

请求体：`{"command": "<InvestmentCommand>", "payload": {...}, "requested_by": "..."}`

鉴权：仅绑定回环；设置 `ATA_ACCESS_TOKEN` 后要求请求头 `X-ATA-Token` 匹配。

## 周期执行器契约（`engine.scheduler.set_cycle_runner`）

```python
runner(market: str, cycle_type: str, context: dict) -> dict
# cycle_type: "intraday" | "close"
# context: {
#   label, time_str, scheduled_at(datetime), catch_up(bool), now(datetime),
#   macro_excerpt(str), optimizer_hint(dict|None, close 轮次), account(dict),
#   progress_callback(callable|None),
# }
# 返回（引擎消费的键）：
# {
#   status: "generated" | "skipped" | "error",
#   reason/error: str,                       # skipped/error 时
#   report_text: str|None,                   # AI 摘要（可选）
#   decisions: [ {symbol, action, confidence, reason}, ... ],
#   execution: {fills: [...], rejected: [...]},
#   screening: {...}, mandate: {...}, audit_file: str|None,
#   warnings: [...], degraded_mode: bool|None, control: {...}|None,
# }
```

未注册执行器时轮次返回 `status: "skipped"`，并写入说明性报告，不中断调度。
fail-safe 语义不变：订单只有在引擎的硬风控 + 纸面经纪路径中才会被撮合；
执行器返回的 `execution` 只是对引擎执行结果的回显。

自主轮次为 DSH 原生固定工作流：四类基础分析 → 多空辩论/研究经理/个股交易员 →
组合草案 → 三方风险辩论/风险经理 → 最终组合经理 → 引擎硬风控与纸面撮合。
每个阶段完成后才写检查点；Python 调度器和 API 不直接调用 LLM，也不生成投资决策。

### 分析流程的两块路由（2.1）

- **选股**：独立块，由 `investment_screening` / `investment_run_screening`
  输出标准化候选列表；用户点名证券时完全跳过。
- **股票分析**：唯一入口 `investment_analysis_workflow`。手动会话中是异步
  启动器（`POST /api/analysis/rounds/start`，立即返回 cycle_id，用
  `investment_analysis_status` 轮询）；headless 自主轮次（引擎 worker 与
  调度器，`ATA_AUTONOMOUS_ROUND=1`）中同步执行同一套阶段脚本并把检查点
  写回引擎。`symbols` + `symbols_source`（user/screening）决定目标范围，
  用户指定的标的绝不混入选股池；持仓只作为上下文。**手动入口（工具与端点
  双重）拒绝空 symbols**，自主轮次才允许内部选股。
- **cycle_id 身份**：`会话ID + 最新直接用户消息ID` 派生（重试复用、新请求
  新 ID）；headless 用引擎注入的 `INVESTMENT_CYCLE_ID`；无会话上下文时用
  随机 ID + 短 TTL 内容指纹兜底（仅传输故障重试）。
- **轮次状态机**：`running → ready_for_execution → completed`；研究失败或停止
  分别由 running 进入 failed 或 cancelled。
  `execution_ready` 事件持久化最终决策与引擎计算的决策指纹；自主轮次在
  `ready_for_execution + submit=true` 时提交，手动轮次等待用户批准后以
  `investment_submit_decisions`（同 cycle_id）提交；执行结束后引擎把绑定
  轮次置为 completed。failed 仅在用户明确要求并传 `retry=true` 时同键续跑；
  普通重复启动返回 `retry_required=true`。serve 重启时保留孤立轮次的检查点并
  标记中断，不自动启动付费研究。后台协调代理只执行固定流程，失败时停止，
  不执行代码修复或替代工作流；桌面对话仍可进行产品维护。
- **阶段保存**：`POST /api/analysis/runs/checkpoint` 接收 `cycle_id`、`stage`、
  紧凑 `result`、完整 `archives`（含该阶段）及原有检查点元数据，上限 32MB。
  引擎先原子保存完整阶段提交文件，再更新进度；断连只重试保存，同内容幂等，
  不同结果禁止覆盖。恢复时修复进度投影并复用已完成阶段。旧原始归档没有
  完成标记，不自动推断为完成。运行超时保留检查点并明确失败，不跨启动循环重跑。
- **完成边界**：`ready_for_execution` 的决策及分析阶段被冻结；同内容确认重放，
  不同决策拒绝覆盖。晚到的失败或清理错误不能把分析完成状态改成 failed。
  状态保存失败只有限重试写入；后台配置同步失败在启动模型前停止。
  研究辩论与经理阶段缺少必要角色结果时停止，不能把拒答、截断或空结果当作
  完整研究。基础研究仍按配置的部分成功阈值处理；失败候选不能进入买卖
  清单，失败持仓强制 HOLD。旧检查点恢复同样核对必要结果的完整性。
  轮次结束后，未收到完成结果的子任务显示为已停止，不继续显示运行中，也不
  推断为成功或模型失败；旧失败记录的读取兼容处理不改写历史文件。
  子角色只返回当前角色结果，不能重新调用整轮流程或提交决策；执行守卫与
  轮次拥有者检查共同阻断子角色等待父流程造成的递归死锁。界面预建轮次后，
  工作流可一次性登记预期角色总数，重复启动不修改已登记总数或已完成进度。
  桌面进度按角色当前状态去重，历史启动次数另行显示；恢复阶段显示本次
  子任务耗时，原始轮次时间保留。等待交易批准不计为新的研究阶段。
- **产品修复确认**：桌面对话先只读诊断，通过 `investment_repair_plan` 展示
  错误、原因依据、修改、文件、精确命令、验证命令与回退步骤，经用户在现有
  方案确认界面批准后执行。授权限于当前会话、列明文件和命令，执行前保存
  文件备份。验证失败停止；验证成功必须具有修改后实际成功的退出码，源码
  在确认/验证期间变化会使确认或验证失效。`investment_repair_finish` 关闭
  授权并报告结果；修复不自动续跑分析。后台不请求无人能答的确认，也不修代码。
  投资工具插件需声明 `tools`、`agents`、`userQuestions` 服务依赖；没有可用的
  人工确认通道时保持停止，不能退回对话文字批准或自动修复。
- **提交幂等（账户文件为唯一事实）**：`submit_decisions` 强制
  `idempotency_key`（分析轮次用其 cycle_id）。引擎先对归一化决策计算
  内容指纹并在认领中记录（同键不同内容一律拒绝）；`execute_orders` 把
  成交与**执行回执**在账户锁内同一次原子替换写入 `portfolio.json`——
  崩溃于「已成交、未写簿记」之间时，重试从账户回执重放，绝不再成交。
  审计文件仅为外部记录。四类失败处理：参数/内容错误→终态 rejected 并
  重放；确定性硬风控拒绝→保存并重放；进入撮合前的暂时性故障→释放认领；
  已进入撮合→绝不删除，凭回执恢复。
- **运行隔离**：headless 轮次使用独立内部 DSH home（`<home>/agent-home`，
  引擎同步播种 profiles/presets/skills/plugins + settings storages +
  开发模式凭据镜像），其会话不会出现在用户会话栏。
- 旧 `investment_run_cycle` 工具已从模型可见面移除（引擎内部命令保留给
  调度器使用），不再与新流程竞争。
