#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""命名统一（路线 B）批量替换工具 —— 先报告，后应用。

用途：把仓库内的旧标识机械替换为新标识，供人工复核后执行。
默认只做 **报告**（不修改任何文件）；加 --apply 才真正写入。

设计约束（对应 docs/NAMING_UNIFICATION_PLAN.md）：
  * 只改**文件内容**，不改文件名/目录名（文件重命名是单独步骤）；
  * 安装目录与数据目录的路径字符串**受保护**，不会被通用规则误改
    （那属于 P4 迁移范围，需要单独的迁移逻辑）；
  * 历史文档（CHANGELOG、旧版 RELEASE_NOTES）**不改**——它们记录的是旧名下的事实；
  * 排除 runtime/ dist/ build/ release/ .venv/ node_modules/ .git/ app/dev-home/。

用法：
    python tools/rename_identifiers.py              # 只报告
    python tools/rename_identifiers.py --apply      # 实际替换
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── 替换规则（顺序敏感：长而具体的在前，避免被通用规则先吃掉）─────────────
MAPPINGS: list[tuple[str, str, str]] = [
    ("@ai-trading-automation/", "@ai-trading-automation/", "npm scope"),
    ("AiTradingAutomation.Desktop", "AiTradingAutomation.Desktop", "C# 程序集/命名空间"),
    ("AiTradingAutomation-Setup-x64", "AiTradingAutomation-Setup-x64", "安装包名"),
    ("AiTradingAutomation-Windows-v", "AiTradingAutomation-Windows-v", "便携包名"),
    ("AiTradingAutomation.iss", "AiTradingAutomation.iss", "安装器脚本名"),
    ("AI_TRADING_AUTOMATION_", "AI_TRADING_AUTOMATION_", "环境变量"),
    ("ATA_ACCESS_TOKEN", "ATA_ACCESS_TOKEN", "令牌变量"),
    ("ATA_AUTONOMOUS_ROUND", "ATA_AUTONOMOUS_ROUND", "自主轮次变量"),
    ("X-ATA-Token", "X-ATA-Token", "令牌请求头"),
    ("ai-trading-automation", "ai-trading-automation", "Python 包名 / slug / 链接"),
    ("AiTradingAutomation", "AiTradingAutomation", "其余驼峰标识（目录名、Run 键、程序集残留）"),
    ("AI Trading Automation", "AI Trading Automation", "品牌显示名"),
]

# ── 受保护字符串：先替换成哨兵，通用规则跑完再还原（P4 迁移范围）─────────
PROTECTED = [
    r"Programs\InvestmentAuto",
    r"{localappdata}\InvestmentAuto",
    r"%LocalAppData%\InvestmentAuto",
    r"$LocalAppData\InvestmentAuto",
    r"localappdata}\InvestmentAuto",
]

INCLUDE_EXT = {
    ".py", ".cs", ".csproj", ".xaml", ".iss", ".yml", ".yaml", ".json",
    ".ps1", ".mjs", ".js", ".toml", ".txt", ".cmd", ".md",
}
EXCLUDE_PARTS = {
    ".git", "runtime", "dist", "build", "release", "node_modules",
    ".venv", "__pycache__", "dev-home", "bin", "obj", ".pytest_cache",
    "notes",          # 内部记录：保留旧名事实，不参与机械替换
}
# 这些文件描述"旧名 → 新名"的映射或协作约定，替换会把文档本身写坏
SKIP_FILES = {
    "CHANGELOG.md", "CHANGELOG_EN.md",
    "AGENTS.md",                        # 本地协作约定（含映射规则与红线）
    "docs/NAMING_UNIFICATION_PLAN.md",  # 命名方案（含映射表）
    "docs/PROJECT_REPORT.md",           # 已决定撤到 notes/，不再维护
}


def iter_files() -> list[Path]:
    out: list[Path] = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in INCLUDE_EXT:
            continue
        if any(part in EXCLUDE_PARTS for part in p.parts):
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel in SKIP_FILES or re.match(r"docs/RELEASE_NOTES_2\.[01]\.\d.*\.md$", rel):
            continue
        if p.name == "package-lock.json":       # 由 npm install 重新生成，不做文本替换
            continue
        out.append(p)
    return sorted(out)


def transform(text: str, apply_paths: bool = False) -> tuple[str, dict[str, int]]:
    stats: dict[str, int] = {}
    for i, lit in enumerate(PROTECTED):
        sentinel = f"\x00KEEP{i}\x00"
        n = text.count(lit)
        if n:
            text = text.replace(lit, sentinel)
    for old, new, label in MAPPINGS:
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            stats[label] = stats.get(label, 0) + n
    for i, lit in enumerate(PROTECTED):
        text = text.replace(f"\x00KEEP{i}\x00", lit)
    return text, stats


def main() -> int:
    ap = argparse.ArgumentParser(description="命名统一批量替换（默认只报告）")
    ap.add_argument("--apply", action="store_true", help="实际写入文件（默认只报告）")
    ap.add_argument("--report", default="runtime/naming-rename-report.md", help="报告输出路径")
    args = ap.parse_args()

    files = iter_files()
    changed: list[tuple[str, int, dict[str, int]]] = []
    totals: dict[str, int] = {}

    for p in files:
        try:
            with p.open("r", encoding="utf-8", newline="") as fh:
                text = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        new_text, stats = transform(text)
        if not stats or new_text == text:
            continue
        rel = p.relative_to(ROOT).as_posix()
        changed.append((rel, sum(stats.values()), stats))
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + v
        if args.apply:
            with p.open("w", encoding="utf-8", newline="") as fh:
                fh.write(new_text)

    lines = [
        "# 命名统一替换报告",
        "",
        f"模式：{'**已写入**' if args.apply else '**仅报告（未改动文件）**'}",
        f"扫描文件：{len(files)}；命中文件：{len(changed)}；命中总数：{sum(totals.values())}",
        "",
        "## 按规则汇总",
        "",
        "| 规则 | 命中数 |",
        "|---|---|",
    ]
    for k, v in sorted(totals.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {k} | {v} |")
    lines += ["", "## 命中文件明细", "", "| 文件 | 命中数 | 规则 |", "|---|---|---|"]
    for rel, n, stats in changed:
        detail = "、".join(f"{k}×{v}" for k, v in sorted(stats.items(), key=lambda kv: -kv[1]))
        lines.append(f"| `{rel}` | {n} | {detail} |")

    report = ROOT / args.report
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"扫描 {len(files)} 个文件，命中 {len(changed)} 个，共 {sum(totals.values())} 处")
    for k, v in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")
    print(f"报告已写入 {report.relative_to(ROOT)}")
    if not args.apply:
        print("（未修改任何文件；确认无误后加 --apply 执行）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
