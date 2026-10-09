# AGENTS.md — 本仓库的多智能体协作约定

> 本文件是这个仓库的**协作入口**：同一份本地工作目录（`D:\investment-auto`）当前由**两个 Agent 并行改动**——
> Codex CLI 与 DeepSeek Harness（DSH）桌面会话。任何一方开始工作前，请先读本文件；
> 需要对方配合时，请追加到文末「留言区」，不要直接覆盖对方的在途改动。

最后更新：2026-10（DSH 会话写入）

---

## 一、当前状态快照

| 项 | 值 |
|---|---|
| 分支 | `dsch/2.0`（当前 2.x 开发与发布线） |
| HEAD | `7b3b753 docs: visualize the worked example and prepare v2.1.5 release` |
| 远程 | `https://github.com/Robertzsy/ai-trading-automation.git`（仓库已从 `investment-auto` 改名，旧链接 301 跳转） |
| 本地目录 | `D:\investment-auto`（改名计划见 `docs/NAMING_UNIFICATION_PLAN.md`，**尚未执行**） |
| GitHub 默认分支 | 仍是 `master`（1.x 回退分支）→ **仓库主页显示的是旧 README**；处理见 `docs/GITHUB_HOMEPAGE_FIX.md` |
| 版本 | 2.1.5（已在 HEAD 提交） |

## 二、分工与写入范围（建议，避免互相覆盖）

| 路径范围 | 当前负责方 | 备注 |
|---|---|---|
| `app/plugins/**`、`app/presets/**`、`app/profiles/**`、`engine/**`、`tests/**` | **Codex** | 在途：token cache / research contract / research policy |
| `README.md`、`README_EN.md`、`docs/INVESTMENT_LOGIC*.md` | **DSH 会话** | 已按 GitHub 惯例重写；标题结构见第四节第 7 条 |
| `docs/NAMING_UNIFICATION_PLAN.md`、`docs/GITHUB_HOMEPAGE_FIX.md` | **DSH 会话** | 尚未提交（未跟踪） |
| `docs/TOKEN_*`、`docs/CACHE_*`、`tools/token-audit-all.py` | **Codex** | 在途 |
| `docs/ARCHITECTURE_2.0.md`、`docs/ENGINE_API.md`、`docs/PRODUCT_SHELL.md` 等既有架构文档 | 双方共享 | 改动前先在留言区登记 |

> 范围是**约定而非锁**。要动对方范围内的文件，请在文末留言区说明，或先在提交信息里写明原因。

## 三、红线规则（两边都必须遵守）

1. **禁止破坏性 git 操作**：不要执行 `git checkout -- .`、`git reset --hard`、`git clean -fd`——
   工作区经常同时存在两边的未提交改动，这类命令会造成不可恢复的丢失。
2. **提交前先同步**：`git fetch origin && git rebase origin/dsch/2.0`，再提交、再推送。两边都会提交，避免非快进冲突。
3. **暂不做标识改名**：`investment-auto` / `@investment-auto/*` / `INVESTMENT_AUTO_*` / `InvestmentAuto.Desktop` /
   `%LocalAppData%\InvestmentAuto` 等标识**一律不动**。命名统一按 `docs/NAMING_UNIFICATION_PLAN.md`
   作为 **2.2.0** 单独执行（含数据迁移），不要顺手改。
4. **版本号必须五处同步**：`pyproject.toml`、`engine/version.py`、`app/package.json`、
   `app/plugins/*/package.json`、`windows/desktop/InvestmentAuto.Desktop.csproj`、`installer/InvestmentAuto.iss`。
5. **路径可移植**：不要硬编码 `D:\investment-auto`（未来会改名）；用相对路径或 `INVESTMENT_AUTO_ROOT` 派生。
6. **不要提交用户数据与开发产物**：`runtime/`、`app/dev-home/`、`dist/`、`build/`、`release/`、`.venv/`。
7. **README 标题结构固定为**：H1 = 官方全称，副标题 = 另一语言全称（中英互为标题/副标题）。
   官方全称：中文「AI 驱动多市场投资研究与模拟交易自动化系统」；英文
   「AI-Driven Global Portfolio Optimization & Multi-Agent Trading Automation System」。
   品牌显示名（窗口/托盘/安装器）：`AI Trading Automation`；技术标识保持 `investment-auto`（见第 3 条）。
8. **不要动分支策略**：`master` 保留为 1.x 回退；不要删除或强推 `dsch/2.0`。

## 四、在途工作（截至本文件更新时间）

**Codex（未提交）**

```text
 M app/plugins/dsh-investment-tools/lib/analysis-workflow.js
 M app/plugins/dsh-investment-tools/lib/engine-client.js
 M app/plugins/dsh-investment-tools/lib/index.js
 M app/plugins/dsh-investment-tools/package.json
 M app/plugins/dsh-investment-workflow/lib/index.js
 M app/plugins/dsh-investment-workflow/test/workflow.test.mjs
 M app/presets/investment/agent.cordis.yml
 M app/profiles/investment/cordis.patch.yml
 M engine/analysis_runs.py
 M tests/test_analysis_runs.py
?? app/plugins/dsh-investment-tools/lib/analysis-cache.js
?? app/plugins/dsh-investment-tools/lib/research-contract.js
?? app/plugins/dsh-investment-tools/lib/research-policy.js
?? app/plugins/dsh-investment-workflow/test/{cache,contract,policy}.test.mjs
?? docs/CACHE_OPTIMIZATION_TRIAL_2026-10-09.zh.md
?? docs/TOKEN_BILLING_INCIDENT_2026-10-09.zh.md
?? docs/TOKEN_CACHE_IMPLEMENTATION.zh.md
?? docs/TOKEN_CACHE_MAIN_PLAN.zh.md
?? tools/token-audit-all.py
```

**DSH 会话（仅文档，未执行）**

- `docs/NAMING_UNIFICATION_PLAN.md`：命名统一（路线 B：全量改名到 `ai-trading-automation`）分阶段方案
- `docs/GITHUB_HOMEPAGE_FIX.md`：仓库主页显示旧 README 的根因与处理方案

## 五、待人工完成（Agent 不要代做）

1. 在 GitHub 网页把**默认分支切到 `dsch/2.0`**（Settings → General → Default branch）
2. 若要执行命名统一，需人工确认窗口期（建议 2.2.0），并安排一次**真机升级验证**（7.6 万文件比对）

---

## 留言区（双方在此追加，不要覆盖他人留言）

### 2026-10 · DSH 会话

已按上述分工完成 README 重写与投资逻辑文档；命名统一方案已就绪但**未执行**。
请 Codex 在动 `docs/`、`README*` 之前先在下方回复确认，避免两边同时改同一段落。

### 2026-10 · Codex

（待回复）

---

## English summary (for agents)

- This repository is edited concurrently by **Codex** and a **DeepSeek Harness (DSH)** desktop session,
  sharing the same working tree.
- Before working: read this file; after working: append to the message log instead of overwriting.
- **Never** run destructive git commands (`checkout -- .`, `reset --hard`, `clean -fd`): both sides keep
  uncommitted work here.
- **Rebase before committing**: `git fetch origin && git rebase origin/dsch/2.0`.
- **Do not rename identifiers yet** (`investment-auto`, `@investment-auto/*`, `INVESTMENT_AUTO_*`,
  `InvestmentAuto.Desktop`, `%LocalAppData%\InvestmentAuto`). Unification is scheduled for **2.2.0** per
  `docs/NAMING_UNIFICATION_PLAN.md`.
- Keep the version in sync across `pyproject.toml`, `engine/version.py`, `app/package.json`,
  `app/plugins/*/package.json`, `windows/desktop/InvestmentAuto.Desktop.csproj`, `installer/InvestmentAuto.iss`.
- Do not hardcode `D:\investment-auto`; derive paths from `INVESTMENT_AUTO_ROOT`.
- Never commit `runtime/`, `app/dev-home/`, `dist/`, `build/`, `release/`, `.venv/`.
- README header convention: H1 = official full name, subtitle = the full name in the other language.
  Brand display name: `AI Trading Automation`.
