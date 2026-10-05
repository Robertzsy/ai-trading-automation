"""Tests for the build-time Markdown renderer in the product shell.

The renderer is not a Python module. ``scripts/generate-markdown.mjs`` splices a
pure-React Markdown renderer into ``app/plugins/dsh-product-shell/lib/client.js``
between the MARKDOWN markers, because the client half of the shell is a
pre-compiled ``window.__ModuleLoader__.load(...)`` bundle with no bundler and no
runtime dependency beyond ``react``.

These tests therefore validate the **generated artifact**, not a source file:
they extract the marked region, wrap it in a stub that provides
``react`` / ``react/jsx-runtime`` shims which build a JSON tree instead of real
React elements, run it with ``node``, and assert on the JSON. That has three
useful consequences beyond the behaviour checks themselves:

* the block must be syntactically valid and self-contained — the shims are the
  only modules in scope, so an undeclared dependency fails the run;
* the assertions observe exactly what React would be handed, so "raw HTML is
  literal text" is checked structurally (no ``script`` element exists) rather
  than by string matching;
* no JS test runner is needed, which is why it can live in the Python suite.

Every test is hermetic: the driver is written under ``tmp_path`` and nothing
touches the repo's ``runtime/`` directory.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Iterator

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
CLIENT = REPO_ROOT / "app" / "plugins" / "dsh-product-shell" / "lib" / "client.js"
GENERATOR = REPO_ROOT / "app" / "plugins" / "dsh-product-shell" / "scripts" / "generate-markdown.mjs"
ICON_GENERATOR = REPO_ROOT / "app" / "plugins" / "dsh-product-shell" / "scripts" / "generate-icons.mjs"
MARKDOWN_START = "/* MARKDOWN:START"
MARKDOWN_END = "/* MARKDOWN:END */"
ICONS_END = "/* ICONS:END */"

# Classes the renderer emits; each one must be styled in the token layer.
MD_CLASSES = (
    "ia-md",
    "ia-md-h1", "ia-md-h2", "ia-md-h3", "ia-md-h4", "ia-md-h5", "ia-md-h6",
    "ia-md-p", "ia-md-a", "ia-md-inline", "ia-md-pre", "ia-md-code",
    "ia-md-quote", "ia-md-ul", "ia-md-ol", "ia-md-table", "ia-md-hr",
)

# react + react/jsx-runtime shims: build a JSON tree instead of real elements.
HARNESS = '''
"use strict";
const fs = require("fs");
const flatten = (children) => {
  const out = [];
  for (const child of children) {
    if (Array.isArray(child)) { out.push(...flatten(child)); continue; }
    if (child === null || child === undefined || typeof child === "boolean") continue;
    out.push(child);
  }
  return out;
};
const make = (type, props, ...children) => ({ type, props: props ?? {}, children: flatten(children) });
const react = { createElement: make };
const react_jsx_runtime = {
  Fragment: "Fragment",
  jsx: (type, props) => {
    const { children, ...rest } = props ?? {};
    return make(type, rest, ...(children === undefined ? [] : [children]));
  },
  jsxs: (type, props) => {
    const { children, ...rest } = props ?? {};
    return make(type, rest, ...(children === undefined ? [] : [children]));
  },
};
'''

CALLER = '''
const inputs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const output = inputs.map((input) => {
  let value = null;
  let error = null;
  try {
    value = renderMarkdown(input);
  } catch (caught) {
    error = String((caught && caught.message) || caught);
  }
  return { error: error, value: value };
});
fs.writeFileSync(process.argv[3], JSON.stringify(output), "utf8");
'''


# ---------------------------------------------------------------------------
# fixture: run the generated block with node
# ---------------------------------------------------------------------------


def _node() -> str:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is required to execute the generated Markdown renderer")
    return node


def _client_source() -> str:
    # newline="" keeps the file's real line endings: the repo runs with
    # core.autocrlf=true, so client.js is CRLF on Windows and LF elsewhere, and
    # the generator's output must match whichever one it finds.
    with CLIENT.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def markdown_block() -> str:
    """The generated region, marker comment included."""
    source = _client_source()
    start = source.index(MARKDOWN_START)
    end = source.index(MARKDOWN_END, start) + len(MARKDOWN_END)
    return source[start:end]


@pytest.fixture
def render(tmp_path: Path) -> Callable[[str], dict[str, Any]]:
    """Render Markdown through the generated block; returns ``{error, value}``.

    One node process per distinct input, cached for the test that asked for it.
    """
    node = _node()
    driver = tmp_path / "markdown-driver.cjs"
    driver.write_text(HARNESS + "\n" + markdown_block() + "\n" + CALLER, encoding="utf-8", newline="\n")
    payload = tmp_path / "markdown-input.json"
    output = tmp_path / "markdown-output.json"
    cache: dict[str, dict[str, Any]] = {}

    def run(source: str) -> dict[str, Any]:
        if source not in cache:
            payload.write_text(json.dumps([source]), encoding="utf-8", newline="")
            completed = subprocess.run(
                [node, str(driver), str(payload), str(output)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
            )
            assert completed.returncode == 0, f"renderer harness failed: {completed.stdout}\n{completed.stderr}"
            cache[source] = json.loads(output.read_text(encoding="utf-8"))[0]
        return cache[source]

    return run


# ---------------------------------------------------------------------------
# tree helpers
# ---------------------------------------------------------------------------


def _elements(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, dict) and "type" in node:
        yield node
        for child in node.get("children") or []:
            yield from _elements(child)


def _types(node: Any) -> list[str]:
    return [element["type"] for element in _elements(node)]


def _text(node: Any) -> str:
    return "".join(
        child
        for element in _elements(node)
        for child in (element.get("children") or [])
        if isinstance(child, str)
    )


def _first(node: Any, kind: str) -> dict[str, Any] | None:
    return next((element for element in _elements(node) if element["type"] == kind), None)


def _rendered(run: Callable[[str], dict[str, Any]], source: str) -> dict[str, Any]:
    """Render and assert the document wrapper contract."""
    result = run(source)
    assert result["error"] is None, f"renderMarkdown threw: {result['error']}"
    tree = result["value"]
    assert tree is not None, "expected an element tree"
    assert tree["type"] == "div"
    assert tree["props"].get("className") == "ia-md"
    return tree


# ---------------------------------------------------------------------------
# headings
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("level", [1, 2, 3, 4, 5, 6])
def test_atx_heading_levels(render, level):
    tree = _rendered(render, f"{'#' * level} 第 {level} 级标题")
    heading = _first(tree, f"h{level}")
    assert heading is not None, f"h{level} missing from {_types(tree)}"
    assert heading["props"]["className"] == f"ia-md-h{level}"
    assert _text(heading) == f"第 {level} 级标题"
    # Exactly one heading, at the requested level.
    assert [kind for kind in _types(tree) if re.fullmatch(r"h[1-6]", kind)] == [f"h{level}"]


def test_heading_requires_a_space_after_the_hashes(render):
    tree = _rendered(render, "#hashtag")
    assert not [kind for kind in _types(tree) if re.fullmatch(r"h[1-6]", kind)]
    assert _text(tree) == "#hashtag"


# ---------------------------------------------------------------------------
# paragraphs and breaks
# ---------------------------------------------------------------------------


def test_paragraphs_split_on_a_blank_line(render):
    tree = _rendered(render, "第一段\n\n第二段")
    paragraphs = [element for element in _elements(tree) if element["type"] == "p"]
    assert [_text(paragraph) for paragraph in paragraphs] == ["第一段", "第二段"]
    assert all(paragraph["props"]["className"] == "ia-md-p" for paragraph in paragraphs)


def test_soft_break_joins_with_a_space(render):
    tree = _rendered(render, "第一行\n第二行")
    assert _types(tree).count("br") == 0
    assert _text(tree) == "第一行 第二行"


def test_hard_break_becomes_br(render):
    tree = _rendered(render, "第一行  \n第二行")
    breaks = [element for element in _elements(tree) if element["type"] == "br"]
    assert len(breaks) == 1
    assert breaks[0]["children"] == []
    assert _text(tree) == "第一行第二行"


# ---------------------------------------------------------------------------
# tables
# ---------------------------------------------------------------------------


def test_table_header_body_and_alignment(render):
    tree = _rendered(
        render,
        "| 名称 | 数值 | 方向 |\n|:---|---:|:---:|\n| 沪深300 | 3,845 | 上行 |",
    )
    table = _first(tree, "table")
    assert table is not None
    assert table["props"]["className"] == "ia-md-table"
    thead, tbody = _first(table, "thead"), _first(table, "tbody")
    assert thead is not None and tbody is not None

    headers = [element for element in _elements(thead) if element["type"] == "th"]
    assert [_text(header) for header in headers] == ["名称", "数值", "方向"]
    assert [header["props"].get("style") for header in headers] == [
        {"textAlign": "left"},
        {"textAlign": "right"},
        {"textAlign": "center"},
    ]

    cells = [element for element in _elements(tbody) if element["type"] == "td"]
    assert [_text(cell) for cell in cells] == ["沪深300", "3,845", "上行"]
    assert [cell["props"].get("style") for cell in cells] == [
        {"textAlign": "left"},
        {"textAlign": "right"},
        {"textAlign": "center"},
    ]


def test_table_without_leading_or_trailing_pipes(render):
    tree = _rendered(render, "a | b\n--- | ---\n1 | 2")
    table = _first(tree, "table")
    assert table is not None
    assert [
        _text(element) for element in _elements(_first(table, "thead")) if element["type"] == "th"
    ] == ["a", "b"]
    assert [
        _text(element) for element in _elements(_first(table, "tbody")) if element["type"] == "td"
    ] == ["1", "2"]


@pytest.mark.parametrize("source", ["| 名称 |\n|---|\n| 沪深300 |", "名称|\n---|\n沪深300|"])
def test_single_column_table_separator(render, source):
    tree = _rendered(render, source)
    table = _first(tree, "table")
    assert table is not None, f"{source!r} did not produce a table"
    assert [
        _text(element) for element in _elements(_first(table, "thead")) if element["type"] == "th"
    ] == ["名称"]
    assert [
        _text(element) for element in _elements(_first(table, "tbody")) if element["type"] == "td"
    ] == ["沪深300"]


def test_table_row_that_looks_like_a_separator_is_still_a_row(render):
    """The engine emits `| - | - |` as an empty-data row, not as a delimiter."""
    tree = _rendered(
        render,
        "| 子目标 | 是否达成 |\n|---|---|\n| - | - |\n| 控制回撤 | 是 |",
    )
    tbody = _first(_first(tree, "table"), "tbody")
    rows = [element for element in _elements(tbody) if element["type"] == "tr"]
    assert len(rows) == 2
    assert [_text(cell) for cell in _elements(rows[0]) if cell["type"] == "td"] == ["-", "-"]


def test_separator_with_mismatched_column_count_is_not_a_table(render):
    tree = _rendered(render, "a | b\n|---|\n1 | 2")
    assert _first(tree, "table") is None


def test_table_cells_parse_inline_markup(render):
    tree = _rendered(render, "| 项 | 说明 |\n|---|---|\n| **净** | `code` |")
    assert _text(_first(tree, "strong")) == "净"
    code = _first(tree, "code")
    assert code["props"]["className"] == "ia-md-inline"


# ---------------------------------------------------------------------------
# code
# ---------------------------------------------------------------------------


def test_fenced_code_block_records_language_and_stays_literal(render):
    tree = _rendered(render, "```text\n09:30 INFO [preparing] **不解析** <b>x</b>\n```")
    pre = _first(tree, "pre")
    assert pre is not None
    assert pre["props"]["className"] == "ia-md-pre"
    code = _first(pre, "code")
    assert code["props"]["className"] == "ia-md-code"
    assert code["props"]["data-lang"] == "text"
    assert code["children"] == ["09:30 INFO [preparing] **不解析** <b>x</b>"]
    # Nothing inside a fence is parsed as markup.
    assert _types(pre) == ["pre", "code"]


def test_fenced_code_block_without_language(render):
    tree = _rendered(render, "```\nplain <b>text</b>\n```")
    code = _first(tree, "code")
    assert code is not None
    assert "data-lang" not in code["props"]
    assert code["children"] == ["plain <b>text</b>"]


def test_unterminated_fence_still_renders_the_remainder(render):
    tree = _rendered(render, "```\n未闭合的代码块\n第二行")
    code = _first(tree, "code")
    assert code is not None
    assert code["children"] == ["未闭合的代码块\n第二行"]


# ---------------------------------------------------------------------------
# blockquotes
# ---------------------------------------------------------------------------


def test_blockquote_with_hard_breaks(render):
    tree = _rendered(render, "> 轮次状态：分析完成  \n> 阶段：5/5 完成  \n> 耗时：2 分 3 秒")
    quote = _first(tree, "blockquote")
    assert quote is not None
    assert quote["props"]["className"] == "ia-md-quote"
    assert _types(quote).count("br") == 2
    assert _text(quote) == "轮次状态：分析完成阶段：5/5 完成耗时：2 分 3 秒"


def test_nested_blockquote(render):
    tree = _rendered(render, "> 外层\n>\n> > 内层")
    outer = _first(tree, "blockquote")
    inner = [element for element in _elements(outer) if element["type"] == "blockquote" and element is not outer]
    assert len(inner) == 1
    assert _text(inner[0]) == "内层"
    assert _text(outer).startswith("外层")


def test_blockquote_parses_nested_blocks(render):
    tree = _rendered(render, "> ## 引用里的标题\n>\n> - 一\n> - 二")
    quote = _first(tree, "blockquote")
    heading = _first(quote, "h2")
    assert heading is not None and heading["props"]["className"] == "ia-md-h2"
    assert [_text(item) for item in _elements(quote) if item["type"] == "li"] == ["一", "二"]


# ---------------------------------------------------------------------------
# lists
# ---------------------------------------------------------------------------


def test_unordered_list(render):
    tree = _rendered(render, "- 苹果\n- 香蕉\n* 橙子\n+ 西瓜")
    unordered = _first(tree, "ul")
    assert unordered is not None
    assert unordered["props"]["className"] == "ia-md-ul"
    assert [_text(item) for item in _elements(unordered) if item["type"] == "li"] == [
        "苹果", "香蕉", "橙子", "西瓜",
    ]
    assert _first(tree, "ol") is None


def test_ordered_list(render):
    tree = _rendered(render, "1. 准备\n2. 执行\n3. 复盘")
    ordered = _first(tree, "ol")
    assert ordered is not None
    assert ordered["props"]["className"] == "ia-md-ol"
    assert [_text(item) for item in _elements(ordered) if item["type"] == "li"] == ["准备", "执行", "复盘"]
    assert "start" not in ordered["props"]


def test_ordered_list_keeps_a_non_default_start(render):
    tree = _rendered(render, "3. 第三项\n4. 第四项")
    ordered = _first(tree, "ol")
    assert ordered["props"]["start"] == 3


def test_list_items_parse_inline_markup(render):
    tree = _rendered(render, "- **总目标**：稳健增值")
    assert _text(_first(tree, "strong")) == "总目标"


def test_one_level_of_nesting(render):
    tree = _rendered(
        render,
        "- **失败子任务 2 个**：\n  - 宏观研究员（base_research）：超时\n  - 风控（risk_review）：解析失败",
    )
    outer = _first(tree, "ul")
    items = [child for child in outer["children"] if isinstance(child, dict) and child["type"] == "li"]
    assert len(items) == 1
    nested = [element for element in _elements(items[0]) if element["type"] == "ul"]
    assert len(nested) == 1
    assert [_text(item) for item in nested[0]["children"] if isinstance(item, dict)] == [
        "宏观研究员（base_research）：超时",
        "风控（risk_review）：解析失败",
    ]
    assert _first(items[0], "strong") is not None


def test_indented_marker_without_a_parent_is_not_a_nested_list(render):
    tree = _rendered(render, "  - 缩进的第一项")
    assert _first(tree, "ul") is not None


# ---------------------------------------------------------------------------
# inline spans
# ---------------------------------------------------------------------------


def test_inline_bold_italic_code_link_and_strike(render):
    tree = _rendered(
        render,
        "**粗体** *斜体* _强调_ `code` [链接](https://example.com/a?b=1) ~~删除~~",
    )
    assert _text(_first(tree, "strong")) == "粗体"
    emphasis = [element for element in _elements(tree) if element["type"] == "em"]
    assert [_text(element) for element in emphasis] == ["斜体", "强调"]

    inline = _first(tree, "code")
    assert inline["props"]["className"] == "ia-md-inline"
    assert inline["children"] == ["code"]

    link = _first(tree, "a")
    assert link["props"]["className"] == "ia-md-a"
    assert link["props"]["href"] == "https://example.com/a?b=1"
    assert link["props"]["target"] == "_blank"
    assert link["props"]["rel"] == "noreferrer"
    assert _text(link) == "链接"

    assert _text(_first(tree, "del")) == "删除"


def test_underscore_inside_a_word_is_not_emphasis(render):
    tree = _rendered(render, "snake_case_name")
    assert _first(tree, "em") is None
    assert _text(tree) == "snake_case_name"


def test_backslash_escapes_markup(render):
    tree = _rendered(render, r"\*not italic\* and \`not code\`")
    assert _first(tree, "em") is None
    assert _first(tree, "code") is None
    assert _text(tree) == "*not italic* and `not code`"


@pytest.mark.parametrize("url", ["https://example.com", "http://example.com/x", "mailto:ops@example.com"])
def test_allowed_link_schemes_render_as_links(render, url):
    tree = _rendered(render, f"[文档]({url})")
    link = _first(tree, "a")
    assert link is not None
    assert link["props"]["href"] == url


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "java\tscript:alert(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "vbscript:msgbox(1)",
        "./relative.md",
        "../up.md",
        "/absolute/path.md",
        "//evil.example.com",
        "#anchor",
        "ftp://example.com/f",
    ],
)
def test_unsafe_or_relative_links_stay_plain_text(render, url):
    source = f"[点我]({url})"
    tree = _rendered(render, source)
    assert _first(tree, "a") is None, f"{url!r} must not become a link"
    assert "a" not in _types(tree)
    assert _text(tree) == source


# ---------------------------------------------------------------------------
# raw HTML stays literal text
# ---------------------------------------------------------------------------


def test_raw_html_renders_as_literal_text(render):
    source = "<script>alert(1)</script> <img src=x onerror=alert(1)>"
    tree = _rendered(render, source)
    assert "script" not in _types(tree)
    assert "img" not in _types(tree)
    assert _text(tree) == source


def test_html_inside_paragraph_text_is_not_an_element(render):
    tree = _rendered(render, "普通段落 <div class=\"x\">内容</div> 结尾")
    assert _types(tree) == ["div", "p"]
    assert _text(tree) == '普通段落 <div class="x">内容</div> 结尾'


# ---------------------------------------------------------------------------
# horizontal rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("marker", ["---", "***", "___", "- - -", "* * *"])
def test_horizontal_rule(render, marker):
    tree = _rendered(render, f"上文\n\n{marker}\n\n下文")
    rule = _first(tree, "hr")
    assert rule is not None, f"{marker!r} did not produce an hr"
    assert rule["props"]["className"] == "ia-md-hr"
    assert rule["children"] == []
    assert _text(tree) == "上文下文"


# ---------------------------------------------------------------------------
# robustness
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("source", ["", "   ", "\n\n\t ", "\r\n", "\u3000"])
def test_empty_or_whitespace_input_renders_nothing(render, source):
    result = render(source)
    assert result["error"] is None
    assert result["value"] is None


@pytest.mark.parametrize(
    "source",
    [
        "```\n未闭合的代码块",
        "| a | b |\n|---|",
        "[链接](",
        "[链接](javascript:alert(1)",
        "[链接]",
        "#",
        "####### 七级",
        ">",
        "***",
        "- ",
        "1. ",
        "|",
        "|||",
        "> > > > > > > > 深层引用",
        "- a\n  1. b\n     - c",
        "*" * 200,
        "_" * 200,
        "[" * 200 + "]" * 200,
        "(" * 200,
        "`" * 201,
        "<" * 200,
        "~~" * 200,
        "| a | b |\n|---|---|\n" + "| 1 | 2 |\n" * 50,
    ],
)
def test_malformed_input_degrades_without_raising(render, source):
    result = render(source)
    assert result["error"] is None, f"renderMarkdown threw on {source!r}: {result['error']}"
    tree = result["value"]
    assert tree is None or tree["type"] == "div"


def test_pathological_input_is_bounded(render):
    source = ("*未闭合 " * 2000) + ("[链接" * 2000) + ("| a | b |\n|---|---|\n" * 500)
    started = time.monotonic()
    result = render(source)
    elapsed = time.monotonic() - started
    assert result["error"] is None
    assert result["value"] is not None
    assert elapsed < 15, f"rendering {len(source)} chars took {elapsed:.1f}s"


def test_oversized_input_is_truncated_rather_than_dropped(render):
    result = render("字" * 600_000)
    assert result["error"] is None
    tree = result["value"]
    assert tree is not None and tree["type"] == "div"
    assert "内容过长" in _text(tree)
    assert len(_text(tree)) < 600_000


def test_non_string_input_does_not_raise(render):
    # The engine always passes a string, but the renderer must not throw on a
    # caller that passes something else.
    result = render(None)
    assert result["error"] is None
    assert result["value"] is None


# ---------------------------------------------------------------------------
# the real engine report shape
# ---------------------------------------------------------------------------


def test_real_engine_report_renders(render):
    """End-to-end: what engine/analysis_reports.py actually emits must render."""
    from engine.analysis_reports import render_round_report

    run = {
        "cycle_id": "20260812-cn-manual-abc123",
        "market": "cn",
        "label": "manual",
        "status": "ready_for_execution",
        "symbols": ["600519", "510300"],
        "symbols_source": "manual",
        "started_at": "2026-08-12T01:30:00+00:00",
        "updated_at": "2026-08-12T01:32:03+00:00",
        "evidence_count": 3,
        "stages": {
            "preparing": {
                "status": "completed", "started_at": "2026-08-12T01:30:00+00:00",
                "finished_at": "2026-08-12T01:30:12+00:00", "duration_ms": 12000,
                "agents_total": 1, "agents_done": 1, "agents_failed": 0,
            },
            "base_research": {
                "status": "completed", "started_at": "2026-08-12T01:30:12+00:00",
                "finished_at": "2026-08-12T01:31:40+00:00", "duration_ms": 88000,
                "agents_total": 4, "agents_done": 3, "agents_failed": 1,
            },
        },
        "agents": {
            "preparing:数据准备": {
                "label": "数据准备", "phase": "preparing", "status": "completed",
                "started_at": "2026-08-12T01:30:00+00:00", "duration_ms": 12000, "summary": "ok",
            },
            "base_research:宏观研究员": {
                "label": "宏观研究员", "phase": "base_research", "status": "failed",
                "started_at": "2026-08-12T01:30:12+00:00", "duration_ms": 88000, "error": "超时",
            },
        },
        "decisions": [
            {
                "symbol": "600519", "action": "BUY", "target_weight": 0.2,
                "confidence": 0.7, "reason": "估值与现金流匹配", "evidence_ids": ["e1", "e2"],
            }
        ],
        "warnings": ["降级说明：行情源回退到缓存数据"],
        "logs": [
            {"at": "2026-08-12T01:30:01+00:00", "level": "info", "stage": "preparing", "message": "开始准备数据"},
            {"at": "2026-08-12T01:30:12+00:00", "level": "warn", "stage": "base_research", "message": "降级"},
        ],
    }
    goal = {
        "title": "稳健增值",
        "status": "active",
        "horizon": {"until": "2026-12-31"},
        "sub_goals": [
            {"id": "g1", "title": "控制回撤", "priority": "高", "metric": {"name": "max_drawdown", "op": "<=", "target": 0.1}},
        ],
    }
    goal_history = {
        "weighted_score": 0.62,
        "per_sub_goal": {"g1": {"met": True, "actual": 0.08}},
        "deviation": ["仓位略高"],
        "next_focus": ["降低换手"],
    }

    body = render_round_report(run, goal=goal, goal_history=goal_history, archive_dir="analysis_runs/archive/x")
    assert body.startswith("# ")
    tree = _rendered(render, body)
    kinds = _types(tree)

    for kind in ("h1", "h2", "blockquote", "table", "thead", "tbody", "pre", "code", "strong", "ul", "li", "p"):
        assert kind in kinds, f"{kind} missing from the rendered report"

    # The header block is a run of `> ...  ` lines: one quote with hard breaks.
    quote = _first(tree, "blockquote")
    assert _types(quote).count("br") >= 4
    # Tables carry the bulk of a real report; rows must all be present.
    assert sum(1 for element in _elements(tree) if element["type"] == "td") >= 10
    assert sum(1 for element in _elements(tree) if element["type"] == "th") >= 6
    # The log tail is a fenced code block: it must not be parsed as markup.
    assert "```" not in _text(tree)
    # Every table cell is aligned by inline style (engine tables are pipe-only).
    assert all(
        element["props"].get("style") in (None, {"textAlign": "left"}, {"textAlign": "right"}, {"textAlign": "center"})
        for element in _elements(tree)
        if element["type"] in {"th", "td"}
    )


# ---------------------------------------------------------------------------
# generated artifact invariants
# ---------------------------------------------------------------------------


def _strip_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", source)


def test_markdown_markers_follow_the_icon_block():
    source = _client_source()
    icons_end = source.index(ICONS_END)
    start = source.index(MARKDOWN_START)
    end = source.index(MARKDOWN_END, start)
    assert start > icons_end, "MARKDOWN markers must come after the icon block"
    assert source[icons_end + len(ICONS_END):start].strip() == "", "markers must sit immediately below /* ICONS:END */"
    assert end > start
    start_marker_line = source[start:source.index("\n", start)]
    assert "do not edit by hand" in start_marker_line
    assert start_marker_line.rstrip().endswith("*/")


def test_generated_block_declares_render_markdown_for_the_factory_scope():
    block = markdown_block()
    assert "const renderMarkdown = (text) =>" in block
    assert "const mdBlocks = (lines, depth) =>" in block


def test_generated_block_is_self_contained_and_never_injects_html():
    block = markdown_block()
    code = _strip_comments(block)
    assert "dangerouslySetInnerHTML" not in code
    assert "require(" not in code
    assert not re.search(r"(?m)^\s*import\b", code)
    # No template-literal characters in a region that other templates embed.
    assert "`" not in block
    assert "${" not in block


def test_generated_block_is_small_enough_to_review():
    lines = markdown_block().splitlines()
    assert len(lines) < 600, f"generated block grew to {len(lines)} lines"


def _markdown_css() -> str:
    """The `.ia-md-*` rule block inside the token layer."""
    source = _client_source()
    start = source.index("Markdown report body (generated by scripts/generate-markdown.mjs)")
    start = source.rindex("/*", 0, start)
    end = source.index("/* Readers who ask for less motion", start)
    return source[start:end]


def test_token_layer_styles_every_markdown_class():
    css = _markdown_css()
    missing = [name for name in MD_CLASSES if not re.search(r"\." + re.escape(name) + r"(?=[,{>\s:])", css)]
    assert missing == [], f"unstyled Markdown classes: {missing}"
    assert "font-variant-numeric:tabular-nums" in css
    assert "overflow-x:auto" in css
    assert "border-left" in css


def test_markdown_css_uses_existing_tokens_only():
    """No hardcoded colours or font sizes: the token sheet is the only source."""
    css = _markdown_css()
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css), "hex colour in the Markdown rules"
    assert "rgb(" not in css and "rgba(" not in css
    sizes = re.findall(r"font-size:\s*([^;}]+)", css)
    assert sizes
    for value in sizes:
        assert value.strip().startswith("var(--ia-"), f"literal font size {value!r}"


def test_client_bundle_has_no_replacement_characters():
    """PowerShell-written files silently corrupt Chinese literals to U+FFFD."""
    assert "\ufffd" not in _client_source()


@pytest.mark.parametrize("generator", [ICON_GENERATOR, GENERATOR], ids=["icons", "markdown"])
def test_generated_artifacts_are_current(generator):
    node = _node()
    completed = subprocess.run(
        [node, str(generator), "--check"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def _icon_generator_ids() -> list[str]:
    """Lucide ids the icon generator asks for, read from its own ICONS map."""
    text = ICON_GENERATOR.read_text(encoding="utf-8")
    start = text.index("const ICONS = {")
    end = text.index("};", start)
    return re.findall(r'"([a-z0-9-]+)"', text[start:end])


def _run_node(node: str, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [node, *arguments],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )


@pytest.mark.parametrize("eol", ["\n", "\r\n"])
def test_icon_generator_keeps_the_region_line_ending(tmp_path, eol):
    """Regression: the icon block must come out in the file's own line ending.

    With core.autocrlf=true a checked-out client.js is CRLF on Windows; while the
    generator joined its block with LF, `--check` reported STALE on every such
    checkout without a single icon having changed, and re-running the generator
    churned 14 lines. This drives the generator against a stub lucide-static (the
    real one is a 51 MB devDependency) and asserts the round trip is byte-stable.
    """
    node = _node()
    icon_ids = _icon_generator_ids()
    assert icon_ids, "could not read the icon list out of generate-icons.mjs"

    app = tmp_path / "app"
    plugin = app / "plugins" / "dsh-product-shell"
    (plugin / "scripts").mkdir(parents=True)
    (plugin / "lib").mkdir(parents=True)
    shutil.copyfile(ICON_GENERATOR, plugin / "scripts" / "generate-icons.mjs")

    lucide = app / "node_modules" / "lucide-static"
    lucide.mkdir(parents=True)
    (lucide / "package.json").write_text(
        json.dumps({"name": "lucide-static", "version": "0.0.0-test"}), encoding="utf-8"
    )
    # Minimal stand-in for icon-nodes.json: each requested id only has to resolve
    # to a node array of the shape the generator renders.
    (lucide / "icon-nodes.json").write_text(
        json.dumps({icon: [["path", {"d": "M0 0h1"}]] for icon in icon_ids}), encoding="utf-8"
    )

    source = _client_source().replace("\r\n", "\n")
    if eol == "\r\n":
        source = source.replace("\n", "\r\n")
    client = plugin / "lib" / "client.js"
    with client.open("w", encoding="utf-8", newline="") as handle:
        handle.write(source)

    script = plugin / "scripts" / "generate-icons.mjs"
    first = _run_node(node, str(script))
    assert first.returncode == 0, first.stderr or first.stdout

    with client.open("r", encoding="utf-8", newline="") as handle:
        regenerated = handle.read()
    assert "\ufffd" not in regenerated
    if eol == "\r\n":
        assert re.search(r"(?<!\r)\n", regenerated) is None, "icon block came out in the wrong line ending"
    else:
        assert "\r" not in regenerated, "icon block came out in the wrong line ending"

    # The gate is clean now, because a re-run cannot change a single byte.
    second = _run_node(node, str(script), "--check")
    assert second.returncode == 0, second.stderr or second.stdout
    third = _run_node(node, str(script))
    assert third.returncode == 0, third.stderr or third.stdout
    assert "no change" in third.stdout
    with client.open("r", encoding="utf-8", newline="") as handle:
        assert handle.read() == regenerated


@pytest.mark.parametrize("eol", ["\n", "\r\n"])
def test_generator_bootstraps_the_markers_when_they_are_missing(tmp_path, eol):
    """The generator inserts the marker pair itself, below /* ICONS:END */.

    Parametrised over the line ending because the repo runs with
    core.autocrlf=true: the checked-out file is CRLF on Windows and LF in CI, and
    the generated region must match whichever one it is spliced into.
    """
    node = _node()
    plugin = tmp_path / "app" / "plugins" / "dsh-product-shell"
    (plugin / "scripts").mkdir(parents=True)
    (plugin / "lib").mkdir(parents=True)
    shutil.copyfile(GENERATOR, plugin / "scripts" / "generate-markdown.mjs")

    source = _client_source()
    start = source.index(MARKDOWN_START)
    end = source.index(MARKDOWN_END) + len(MARKDOWN_END)
    line_start = source.rindex("\n", 0, start) + 1
    stripped = (source[:line_start] + source[end:]).replace("\r\n", "\n")
    if eol == "\r\n":
        stripped = stripped.replace("\n", "\r\n")
    with (plugin / "lib" / "client.js").open("w", encoding="utf-8", newline="") as handle:
        handle.write(stripped)

    script = plugin / "scripts" / "generate-markdown.mjs"
    completed = subprocess.run(
        [node, str(script)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout

    with (plugin / "lib" / "client.js").open("r", encoding="utf-8", newline="") as handle:
        regenerated = handle.read()
    assert "\ufffd" not in regenerated
    assert regenerated.index("/* ICONS:END */") < regenerated.index(MARKDOWN_START) < regenerated.index(MARKDOWN_END)
    # Same line ending as the file it was spliced into, with nothing lost.
    if eol == "\r\n":
        assert re.search(r"(?<!\r)\n", regenerated) is None, "mixed line endings after splicing"
    else:
        assert "\r" not in regenerated, "mixed line endings after splicing"

    fresh = subprocess.run(
        [node, str(script), "--check"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert fresh.returncode == 0, fresh.stderr or fresh.stdout
