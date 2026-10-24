# AI Trading Automation 产品外壳改造设计（DSH 内核嵌入）

[English](PRODUCT_SHELL_EN.md) · [语言规则](LANGUAGE_SUPPORT.md)

## 2.4.0 当前接口

DSH 精确锁定为 `0.2.1-rc.3`。产品外壳提供 root scope 的 keyed `main`（对话 key 为 `conversation`），以及 single `sidebar`、`rightbar`、`shell.bottom`、`shell.leading` 和 list `shell.overlay`。`layout` 服务提供共享 `panelInfo`、导航取消及侧栏显示/全屏控制；右侧栏收到宽度、视口和可用状态。会话创建/归档使用 `uiWorkspace`，打开/搜索/改名沿用 session 服务。

Profile 的 `product/cordis.patch.yml` 保存发布定义，根 `cordis.patch.yml` 留给 Settings 写入用户设置。语言以活动 profile 的 locale 为准，通过原生桥同步桌面。打包使用 `prepare-release-source.ps1` 导出指定提交；安装器及便携构建检查源码回执和产品白名单，便携包包含完整 app 与语言资源。详细当前接口见英文对应文档。

以下保留此前版本的实现记录；其中 rc.6 槽名称与旧服务调用已由上述接口替代。


## 目标

投资研究页采用左侧研究记录、右侧所选轮次工作区。新建研究打开侧边表单，保留“一键全流程”“一键筛选股票”“一键分析指定股票”；运行时默认研究过程，完成后默认研究报告，阶段角色分组折叠，报告正文沿页面滚动。失败轮次明确显示停止原因与已保存检查点，续跑必须由用户操作；代码修复继续使用先展示方案再确认的协议。

股票输入支持本地名称、别名、标准代码及近似名称候选。用户点选后才加入清单；名称不会被自动猜成代码。市场切换清空输入清单，清单中的无效名称阻止启动。名称目录优先使用 `runtime/security-catalog/<market>.json`，没有独立目录时读取现有选股 JSON 副本，再使用已配置的 MongoDB `securities` 目录。查询不调用模型、不自动刷新行情；当前缓存可能只覆盖部分标的，界面显示覆盖数量与更新时间。“更新目录（联网）”为用户显式操作，使用已有行情源获取名称并原子保存，保留原财务/选股数据及用户配置。

把 investment-web 从「DSH 默认外壳 + 投资 preset」改造成独立投资产品：
无可见 DSH 品牌、无 Workspace、无模式/preset 选择、产品级主导航
（Dashboard / 投资助手 / 投资研究 / 设置），对话思考体验零改动。

## 关键勘察结论（rc.6 实测）

1. **对话内核可无损嵌入**：`ui-layout` 注册 `root` 槽并声明子槽
   `sidebar / conversation / details / shell.overlay`；`ui-conversation`
   把对话注册为 `conversation` 槽，**所有者只需 `renderSlot("conversation",
   {})`**，无需任何业务 props（会话上下文由槽机制的 scope 提供）。→
   新外壳接管 `root`，原样渲染 conversation 槽即可，思考/流式/工具链
   组件零改动。
2. **设置面板是槽体系**：settings-general 注册 `sidebar.settings` 并声明
   `settings.trigger/header/action/close/section/onboarding`；各设置页
   （models 等）注册进 `settings.section`（list 槽，key=id，带 label/order）。
   → 新外壳可自建 settings 外壳（同名子槽声明），复用现有 models 页并
   追加投资设置页。
3. **会话服务 API 足够**：`ctx.sessions`（open/search/binding().rename/
   fork）+ `ctx.workspaces`（startSession/archiveSession）；主机侧无默认
   workspace（实测空目录下 workspace.list 为空）→ 产品外壳的 node 半在
   启动时创建固定 AI Trading Automation 工作区（path=DSH_HOME）。
4. **品牌分布**：JS bundle 中无用户可见 "DeepSeek/Harness" 字符串（仅
   module id 与 CSS token 名）；可见品牌 = `<title>`、manifest
   name/short_name、favicon（鱼形 logo）、ui-sidebar 的 BrandWordmark
   （该行随外壳替换消失）。→ 品牌去除 = 组合层替换 + dist 三处 patch。

## 架构

```
product shell（新客户端插件 @ai-trading-automation/dsh-product-shell）
├─ root 槽（替代 ui-layout）：左侧产品导航 [Dashboard|投资助手|分析流程|设置]
│   ├─ 投资助手页：会话二级栏（新建/扁平会话/搜索/归档）
│   │              + renderSlot("conversation", {}) + 可收起投资上下文列
│   ├─ Dashboard 页：数据来自 host 代理 /api/investment/summary
│   ├─ 分析流程页：展示真实轮次、Agent/证据计数、阶段检查点与完整多角色链路
│   └─ 设置页：自建 settings 外壳（渲染 settings.section 各页）
├─ node 半：启动时创建固定工作区；注册 /api/investment/* 代理
│            （引擎 URL+令牌仅存在于 host，不进浏览器 JS）
└─ 设置页插件：策略与风控 / 轮次与调度 / 市场与选股 / 通知 / 应用设置
```

产品外壳只在展示层隐藏对话组件残留的 Workspace/访问模式选择器，并把空白页标题和
输入框提示改成投资语义；消息、思考过程、流式输出、工具链和会话状态仍由原
conversation 组件完整负责。

引擎侧新增（不绕过 DPAPI）：`GET /api/config`（脱敏全量）+
`POST /api/config/update`（产品设置精确字段、类型与范围校验 + 原子写 + reload）；
另有 `/api/analysis/*` 保存和查询多角色工作流的真实阶段与检查点。

## 组合层移除（investment-web profile patch）

disable：`ui-layout`、`ui-sidebar`、`ui-workspace`、`ui-settings-general`、
`ui-settings-plugin-inventory`、`ui-agent-preset`、`ui-permission`、
`ui-cordis`、`ui-model-selection`。
保留：`ui-conversation`、`ui-tool`、`ui-skill`、`ui-subagent`、`ui-jobs`、
`ui-goal`、`ui-plan`、`ui-user-questions`、`ui-trajectory`、
`ui-message-feedback`、`ui-commands`、`ui-input-trigger`、`ui-attachment`、
`ui-theme`、`ui-locale`、`ui-settings`（服务）、`ui-settings-models`、
`ui-deliverables`、`client-hmr`、`investment-ui`（工具卡片）。
新增：`@ai-trading-automation/dsh-product-shell`（root/sidebar/settings 外壳 +
host 代理 + 设置页 + Dashboard）。

agent-presets 行保留（机制），default 恒为 investment；preset 选择 UI 已
随 ui-agent-preset 移除，新建会话自动 investment（已实测）。

## 品牌

`app/scripts/brand-dist.mjs`：dev（npm ci 后）与发行前执行，改写
dist/index.html（title）、manifest.webmanifest（name/short_name）、
favicon.svg（AI Trading Automation 标记）。web-runtime 行改 `surfaceContext:
false`（同时移除模型可见的 harness-source 提示段）。

## 验收

状态：全部完成（2026-08-22）。

1. ✅ boot 表不含 ui-layout/ui-sidebar/ui-workspace/ui-agent-preset 等条目（9+2
   行禁用，`--dump-config` 逐行确认 `disabled: true`；product-shell 挂载）；
2. ✅ 页面 title/favicon/manifest 为 AI Trading Automation（`app/scripts/brand-dist.mjs`，
   无头浏览器断言无 DeepSeek/Harness 可见文本；模型页仅出现模型供应商名 DeepSeek）；
3. ✅ wire 协议驱动：session.create → preset=investment；prompt → investment_status
   工具调用与中文回答正常（`app/scripts/verify-web-conversation.mjs`）；对话内核 =
   未改动的 conversation 组件（10 个内核 bundle SHA-256 记录于 CHANGELOG/本文件，
   外壳仅 renderSlot("conversation", {})）；
4. ✅ Dashboard/设置页数据与引擎一致；策略切换/调度配置经 `/api/investment/*` 代理
   写回引擎（host 持有引擎 URL+令牌，浏览器不可见）；Webhook DPAPI 存储不回显；
5. ✅ 无头浏览器验收（`app/scripts/smoke-web.mjs`，Chrome CDP）：左侧产品
   导航、扁平会话列表、投资上下文、Dashboard、分析流程、五个设置页 + 模型页渲染、
   页面零异常、client bundle 无 404；桌面壳与安装器全链路回归（release-check）。

## 实现备注（坑）

- profile patch 不能改行 `name`（name 不匹配静默跳过）——旧行一律 `disabled: true`
  + `insert` 新行。
- `root` 是 single 槽：必须禁用 ui-layout，否则后注册者「遮蔽」而不是并列。
- ui-layout 退役后 theme 投影（body token/dark 属性/theme-color meta）由其负责——
  产品外壳接管（ThemePresenter 复制实现）。
- 槽注册 `store:` 收工厂函数；`inject(actions)` 收到的是烘焙 actions（draft 参数
  已剥离），defineStore 动作签名是 `(draft, ...args) => ...`。
- `ctx.slots.inject(key, fn)` 是「等声明再注册」：声明方与注册方顺序无关，但
  `settings.section` 等槽必须由外壳（root 的子槽）声明，禁用 settings-general 后
  该声明随之消失。
- settings 页组件直接以 `<SettingsSurface {...props}/>` 渲染时拿不到槽注入的
  sectionsSource——改为 root 注册的 inject 返回 settings API，经 ShellFrame props
  透传；settings.section/onboarding 声明挂在 root 下。
- 测试全局态：config_api 测试夹具曾污染全局 `cfg` 单例（`_data`/`_path` 不还原），
  导致后续 scheduler/decision 测试读到临时配置——夹具改为完整还原。

## 界面改版（2.2.1，2026-10）

本轮把评审通过的「轻量专业金融工具」方案落到 product-shell 源码，范围限定在
`app/plugins/dsh-product-shell`（`lib/client.js` 与 `src/dashboard.*` 生成源）。
未改动 DSH 内核组件、未改动引擎接口。

- **设计令牌**：卡片圆角 24 → 18px，弹层 28 → 24px；左侧导航改为深 slate
  `#0F172A`，导航文字提亮到 `#9AA6BD`（对比度 ≥ 6.6:1）。
- **左侧导航**：去掉旧版「青色左竖线」，选中项 = 蓝色渐变圆角卡 + 分层外发光 +
  图标辉光；中文文案统一为「总览 / 投资助手 / 投资研究 / 设置」。
- **动效层**（`prefers-reduced-motion` 全部关闭）：
  - 分段控件滑块：`.ia-seg` + `.ia-seg-thumb`，跟随选中按钮做 `translateX` 过渡，
    覆盖总览的市场/周期/图表类型；首次渲染直接定位，不做入场滑动；
  - 研究标签页滑动下划线；
  - 卡片入场（淡入 + 上移 8px，KPI 45ms 级联）与悬浮抬升；
  - 走势图价格线 `pathLength=1` 描边绘制、面积淡入；
  - 侧栏、按钮、行悬浮统一 0.22–0.38s 缓动。
- **投资研究**：标题栏操作区下移到左栏「研究操作」卡（状态 chip + 新建/停止/续跑 +
  说明），研究记录卡紧随其下；右侧只留标题、标的与标签页。空态、错误提示、抽屉
  （新建研究）行为不变。
- **阶段进度**：`StageDot` 由 24px 对勾升级为 50px 圆环，环内显示百分比
  （失败/停止显示 ×），行高与阶段名同步加大；`ready_for_execution` 统一按成功色。
- 顺带修复：阶段副标题把 `result_digest` 对象序列化成 JSON 的泄漏；概览
  「子任务 完成/预期」在 `expected_agents` 缺失时显示 38/0 的问题。

尚未迁移到源码：设置页、投资助手页的「提案布局 B」版式（涉及 DSH 设置面与对话
内核布局，需要单独评估）。

### 按 Demo 对齐（同日第二轮）

在首轮改版基础上，把四个页面的版式整体对齐到此前定稿的 Demo：

- **总览**：独立 KPI 行改为「状态带」卡片——左账户权益大数字 + 现金/市值，中间四组
  统计（浮动盈亏/资金使用率/持有标的/下一轮）用竖分隔线，右侧市场分段 + 「＋新建研究」；
  下方「我的持仓（330px）+ 价格走势」同屏，持仓行补充「股数 · 成本 · 盈亏」；
  再下面三栏：轮次时间线（读 `analysisRuns`）、组合分布、交易记录。空持仓时走势卡
  保留标题与中性空态。
- **投资助手**：新增顶部状态条（模拟交易/策略/风控/当前轮次/证据 + 上下文按钮）；
  右侧上下文栏改为按需抽屉（默认收起），对话区恢复完整宽度。
- **设置**：改为「左内容 + 右锚点」单列布局，所有分组一次性渲染为卡片，锚点滚动定位；
  去掉旧的侧边栏填充色。
- **投资研究**：沿用上一轮左栏操作卡 + 记录列表；阶段圆环 50px、环内百分比，
  行高与字号同步加大。
- 同步把 `smoke-web.mjs` 的断言更新到新结构（状态带统计、三栏、上下文抽屉、设置分节），
  并把 Mock 仪表盘的空态图标改为中性占位。

### 阶段进度的表现修正

- **不再转圈**：移除 `ia-ring-spin` 无限旋转；运行中的阶段圆环改为按「预计耗时」缓出
  （asymptotic，最多到 94%），每秒更新一次，`stroke-dashoffset` 1.1s 过渡；外圈增加
  4.6s 的呼吸光晕（reduced-motion 下关闭）。
- **删除旧进度**：研究过程页底部的 `.ia-an-role-groups`（按阶段折叠的角色卡片，
  「四类基础研究 · 16/16 角色完成」）整块删除，避免和阶段行重复。
- 阶段圆环仍保留 50px + 环内百分比；有真实子任务计数时优先用真实值。
