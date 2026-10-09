# 仓库检查记录（2026-10-09）

## GitHub 与本地比较

- 仓库：`Robertzsy/ai-trading-automation`，公开，默认分支 `dsch/2.0`，未归档。
- 开始检查时，本地 HEAD 与远端均为 `68fdbec`；本次 Dashboard 改动尚未提交。
- 功能更新已提交并推送为 `1c22ffd`；对应 [GitHub CI](https://github.com/Robertzsy/ai-trading-automation/actions/runs/37891126144) 成功，包含 Linux 和 Windows 测试。
- 检查时 GitHub 开放 Issues / PR 数量为 0；这只是仓库登记状态，不代表没有代码或依赖问题。
- 已发布 `v2.1.4` 指向 `7398f50`，不含随后三个 CI / 文档修复或这次 Dashboard 更新。该历史标签和发行资产未覆盖。

## 版本与验收修复

- 原 `app/package.json` 为 2.1.4，而 `app/package-lock.json` 顶层与 `packages[""]` 仍为 2.1.3；旧版本门禁遗漏了这两个字段。
- 版本 writer / gate 现仅替换对应字段的版本值，17 处声明统一为 2.1.5。回归测试在独立临时副本中验证漂移可被检测，并证明全部第三方依赖条目保持一致。
- 新版本是源码更新；GitHub 最新正式安装包仍为 v2.1.4。README 中明确区分两者，现有下载链接、文件大小与 SHA-256 均与 GitHub v2.1.4 资产一致。
- 浏览器验收已改为检查四市场选择、账户指标、持仓 / 个股图表 / 分布 / 成交记录与交互，移除旧文案断言。
- 修复 Chrome profile 空字符串使临时 profile 不生效的问题；浏览器验收使用隔离目录。

## 已完成的验证

- Python：381 passed，6 skipped（在线行情）；Node 插件：38 passed；Windows 桌面：20 passed。
- 安装版真实浏览器验收通过：产品导航、Dashboard、分析中心、模型与设置、会话搜索、页面异常及对比度检查。
- 安装版真实持仓日线、持仓和市场切换，以及 1280px / 360px 布局验证通过。
- Skills、插件组合、图标 / Markdown / Dashboard 生成器，以及版本声明门禁通过。
- 此前本机 Dashboard 覆盖安装前后，78,691 个用户数据文件丢失 0、修改 0、新增 0；该次本地桌面构建使用 2.1.4 版本号，包含新版 Dashboard，并非 GitHub 旧发行包。

## 仍需处理：生产依赖告警

对锁定依赖运行 `npm audit --omit=dev --json`，结果为 40 个受影响包条目：
1 critical、4 high、3 moderate、32 low。这不是 40 条独立 CVE，部分条目由传递依赖传播。

| 包 | npm 报告等级 | 公告 / 修复要求 |
|---|---|---|
| proxy-addr | Critical | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)；修复版本 2.0.8，触发依赖不正确的 IPv4-mapped IPv6 代理信任子网配置 |
| @modelcontextprotocol/sdk | High | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h)；修复版本 1.31.0，需检查外部 MCP OAuth 授权服务器及凭据发送链路 |
| fast-uri | High | 多条 URI 规范化 / SSRF 公告；当前扫描要求至少 3.1.8 |
| js-yaml | High | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)；修复版本 4.3.2 |
| sharp | High | libheif / librsvg 依赖公告；需升级并验证对应平台的原生二进制 |
| hono / ip-address / qs | Moderate | 请求解析、地址边界、资源消耗等公告；需依据锁文件中的具体调用链验证 |
| KaTeX 与其上层 DSH UI 包 | Low | 原型污染条件下的 trust 限制绕过，导致多个 UI 包被列为受影响 |

这些是依赖扫描结果，尚未证明产品的具体调用路径可以被利用。桌面 Web 服务仅绑定回环，
不等于每条漏洞都不可达。后续应优先修复 Critical / High 条目，并验证 DSH profile、
插件组合、MCP 与原生图片依赖的兼容性。本次版本同步没有更新这些第三方依赖。

## 仍需处理：便携 ZIP 不完整

`scripts/build-windows-release.ps1` 的 stage 只复制桌面发布目录、Python、Node、
`config`、`scripts` 和 `engine`，未复制 `app`；脚本仅发出 warning，仍然生成 ZIP。
桌面启动要求 `app/node_modules/@deepseek-ai/dsh/lib/bin.js`，因此该 ZIP 不能独立启动完整产品。

正式 Inno Setup 安装器包含 `app`，本次已验证的本机安装不受这项缺陷影响。
修复 ZIP 时需纳入 profiles、presets、skills、plugins 及运行时 node_modules，明确排除
`app/dev-home` 等开发数据，再在干净目录验证无外部依赖启动；应将目录缺失设为硬失败。

## 检查范围

本次覆盖本地 / GitHub 提交差异、CI、发行标签与资产元数据、版本声明、回归测试、
安装版浏览器和 npm 生产依赖。未进行完整渗透测试、所有外部模型 / MCP 集成测试或干净 Windows VM 验收。
