# -*- coding: utf-8 -*-
"""Markdown -> Word (.docx) converter tailored for docs/PROJECT_REPORT.md.

Output goes to the user's Desktop. Features:
  - Heading 1-4 mapped to Word heading styles (TOC-visible)
  - Real Word TOC field (auto-updates on open via w:updateFields)
  - Markdown tables -> bordered Word tables with shaded header row
  - Fenced code blocks -> shaded monospace paragraphs
  - Blockquotes -> indented gray paragraphs
  - Inline **bold**, `code`, [link](url)
  - Bullet / numbered lists kept with original numbering
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = Path(r"D:\investment-auto\docs\PROJECT_REPORT.md")
DST = Path(r"C:\Users\zheng siyuan\Desktop\Investment Auto 2.1.3 项目报告.docx")

ACCENT = RGBColor(0x10, 0x27, 0x2B)   # title: product dark teal
HEAD = RGBColor(0x1F, 0x38, 0x64)     # headings: dark blue
GRAY = RGBColor(0x59, 0x59, 0x59)     # blockquote text
CODE_COLOR = RGBColor(0xC7, 0x25, 0x4E)
LINK_COLOR = RGBColor(0x05, 0x63, 0xC1)
BODY_EA = "微软雅黑"
CODE_FONT = "Consolas"

INLINE = re.compile(r"(`[^`]+`|\*\*.+?\*\*|\[[^\]]+\]\([^)]*\))")

def set_ea(run, ea=BODY_EA):
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:eastAsia"), ea)

def shade_run(run, fill):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), fill)
    run._element.get_or_add_rPr().append(shd)

def shade_paragraph(par, fill):
    pPr = par._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), fill)
    pPr.append(shd)

def shade_cell(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)

def add_runs(par, text, size=None, base_color=None, base_bold=False):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            r = par.add_run(part[1:-1])
            r.font.name = CODE_FONT
            r._element.rPr.rFonts.set(qn("w:hAnsi"), CODE_FONT)
            set_ea(r, BODY_EA)
            r.font.color.rgb = CODE_COLOR
            shade_run(r, "F2F2F2")
            if size: r.font.size = Pt(size)
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            r = par.add_run(part[2:-2])
            r.bold = True
            if base_color: r.font.color.rgb = base_color
            if size: r.font.size = Pt(size)
        elif part.startswith("["):
            m = re.match(r"\[([^\]]+)\]\(([^)]*)\)", part)
            if m:
                r = par.add_run(m.group(1))
                r.font.color.rgb = LINK_COLOR
                r.underline = True
                if size: r.font.size = Pt(size)
            else:
                par.add_run(part)
        else:
            r = par.add_run(part)
            if base_color: r.font.color.rgb = base_color
            if base_bold: r.bold = True
            if size: r.font.size = Pt(size)

def add_toc(doc):
    par = doc.add_paragraph()
    run = par.add_run()
    fld_begin = OxmlElement("w:fldChar"); fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve")
    instr.text = r'TOC \o "1-3" \h \z \u'
    fld_sep = OxmlElement("w:fldChar"); fld_sep.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "目录（打开文档时自动更新；如未生成请 Ctrl+A 后按 F9）"
    fld_end = OxmlElement("w:fldChar"); fld_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_begin, instr, fld_sep, placeholder, fld_end])
    # ask Word to update fields when the document is opened
    settings = doc.settings.element
    uf = OxmlElement("w:updateFields"); uf.set(qn("w:val"), "true")
    settings.append(uf)

def main():
    lines = SRC.read_text(encoding="utf-8").splitlines()

    doc = Document()

    # page setup
    sec = doc.sections[0]
    sec.top_margin = Inches(0.9); sec.bottom_margin = Inches(0.9)
    sec.left_margin = Inches(0.95); sec.right_margin = Inches(0.95)

    # base styles
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_EA)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.15

    for lvl, size in [(1, 17), (2, 14.5), (3, 12.5), (4, 11.5)]:
        st = doc.styles[f"Heading {lvl}"]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = HEAD
        st._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_EA)
        st.paragraph_format.space_before = Pt(12 if lvl == 1 else 10)
        st.paragraph_format.space_after = Pt(6)

    # title
    title = doc.add_paragraph()
    tr = title.add_run("Investment Auto 2.1.3 项目报告")
    tr.bold = True
    tr.font.size = Pt(24)
    tr.font.color.rgb = ACCENT
    set_ea(tr)
    subtitle = doc.add_paragraph()
    sr = subtitle.add_run("面向 A 股 / 港股 / 美股 / 场内 ETF 的投资研究与模拟交易桌面应用 · 深度分析报告")
    sr.font.size = Pt(11)
    sr.font.color.rgb = GRAY
    set_ea(sr)
    add_toc(doc)
    doc.add_paragraph()

    i = 0
    n = len(lines)
    skip_toc = False
    in_fence = False
    fence_buf = []

    def flush_fence():
        nonlocal fence_buf
        for code_line in fence_buf:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.left_indent = Inches(0.15)
            shade_paragraph(p, "F4F4F4")
            r = p.add_run(code_line if code_line else " ")
            r.font.name = CODE_FONT
            r._element.rPr.rFonts.set(qn("w:hAnsi"), CODE_FONT)
            set_ea(r, BODY_EA)
            r.font.size = Pt(9)
        fence_buf = []

    def is_table_row(ln):
        return ln.strip().startswith("|") and ln.strip().endswith("|")

    def is_sep_row(ln):
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        return all(re.fullmatch(r":?-{2,}:?", c) for c in cells)

    def add_table(rows):
        header = [c.strip() for c in rows[0].strip().strip("|").split("|")]
        body = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows[2:]]
        t = doc.add_table(rows=1 + len(body), cols=len(header))
        t.style = doc.styles["Table Grid"]
        t.autofit = True
        for j, txt in enumerate(header):
            cell = t.rows[0].cells[j]
            shade_cell(cell, "D9E2F3")
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            add_runs(p, txt, size=9, base_bold=True)
            for r in p.runs: r.bold = True
        for ri, row in enumerate(body, start=1):
            for j in range(len(header)):
                cell = t.rows[ri].cells[j]
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(1)
                add_runs(p, row[j] if j < len(row) else "", size=9)
        doc.add_paragraph().paragraph_format.space_after = Pt(2)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if in_fence:
            if stripped.startswith("```"):
                in_fence = False
                flush_fence()
                i += 1
                continue
            fence_buf.append(line)
            i += 1
            continue

        if stripped.startswith("```"):
            in_fence = True
            fence_buf = []
            i += 1
            continue

        if re.fullmatch(r"-{3,}\s*", stripped):
            i += 1
            continue

        if not stripped:
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 2 and text.startswith("目录"):
                skip_toc = True
                i += 1
                continue
            if skip_toc and level <= 2:
                skip_toc = False
            h = doc.add_heading(level=level)
            h.paragraph_format.keep_with_next = True
            add_runs(h, text, size=None)
            i += 1
            continue

        if is_table_row(stripped) and not is_sep_row(stripped):
            rows = []
            while i < n and is_table_row(lines[i].strip()):
                rows.append(lines[i])
                i += 1
            add_table(rows)
            continue

        if stripped.startswith(">"):
            while i < n and lines[i].strip().startswith(">"):
                q = lines[i].strip()
                q = re.sub(r"^>\s?", "", q)
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.28)
                p.paragraph_format.space_after = Pt(2)
                add_runs(p, q, size=9.5, base_color=GRAY)
                for r in p.runs:
                    if r.font.color.rgb in (None,):
                        r.font.color.rgb = GRAY
                    if r.font.size is None:
                        r.font.size = Pt(9.5)
                i += 1
            continue

        m = re.match(r"^-\s+(.*)$", stripped)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.first_line_indent = Inches(-0.15)
            p.paragraph_format.space_after = Pt(2)
            p.add_run("• ").bold = True
            add_runs(p, m.group(1))
            i += 1
            continue

        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.first_line_indent = Inches(-0.18)
            p.paragraph_format.space_after = Pt(2)
            p.add_run(f"{m.group(1)}. ")
            add_runs(p, m.group(2))
            i += 1
            continue

        p = doc.add_paragraph()
        add_runs(p, stripped)
        i += 1

    doc.save(DST)
    print("saved:", DST)

if __name__ == "__main__":
    main()
