# -*- coding: utf-8 -*-
"""Generate 'Business Value x Code Value' report for Investment Auto 2.1.3."""
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.enum.text import WD_ALIGN_PARAGRAPH

DST = r"C:\Users\zheng siyuan\Desktop\Investment Auto 2.1.3 商业价值与代码价值报告.docx"

TEAL = "10272B"
NAVY = "1F3864"
GREEN = "0E7C66"
TEAL_RGB = RGBColor(0x10, 0x27, 0x2B)
NAVY_RGB = RGBColor(0x1F, 0x38, 0x64)
GREEN_RGB = RGBColor(0x0E, 0x7C, 0x66)
ACCENT = RGBColor(0x49, 0xB9, 0xA5)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x59, 0x59, 0x59)
FILL_LIGHT = "EFF6F4"
FILL_CARD = "F5F7FA"
FILL_BLUE = "EDF1F8"
BODY_EA = "微软雅黑"


def set_ea(run, ea=BODY_EA):
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:eastAsia"), ea)


def shade_par(par, fill):
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


def part_bar(doc, part, text, fill, color):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    shade_par(p, fill)
    r = p.add_run(f"  {part}   {text}")
    r.bold = True
    r.font.size = Pt(14)
    r.font.color.rgb = WHITE
    set_ea(r)
    r2 = p.add_run(" " * 2 + part_note(part))
    r2.font.size = Pt(9.5)
    r2.font.color.rgb = color
    set_ea(r2)
    return p


def part_note(part):
    notes = {
        "PART 1": "能创造什么样的价值",
        "PART 2": "代码的核心特异点",
        "PART 3": "价值如何被代码兑现",
    }
    return "· " + notes.get(part, "")


def subhead(doc, text, color=TEAL_RGB):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(11.5)
    r.font.color.rgb = color
    set_ea(r)
    return p


def card(doc, title, desc, fill=FILL_CARD, lead_color=TEAL_RGB):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.left_indent = Inches(0.06)
    shade_par(p, fill)
    r1 = p.add_run("▍" + title + "  ")
    r1.bold = True
    r1.font.size = Pt(10.5)
    r1.font.color.rgb = lead_color
    set_ea(r1)
    r2 = p.add_run(desc)
    r2.font.size = Pt(10)
    set_ea(r2)
    return p


def bullet(doc, lead, text, color=GREEN_RGB):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.22)
    p.paragraph_format.first_line_indent = Inches(-0.14)
    p.paragraph_format.space_after = Pt(3)
    p.add_run("● ").font.color.rgb = ACCENT
    r1 = p.add_run(lead)
    r1.bold = True
    r1.font.color.rgb = color
    set_ea(r1)
    r2 = p.add_run(text)
    r2.font.size = Pt(9.5)
    set_ea(r2)
    return p


def body(doc, text, size=10, color=None, bold=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.bold = bold
    if color:
        r.font.color.rgb = color
    set_ea(r)
    return p


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(0.7)
    sec.bottom_margin = Inches(0.7)
    sec.left_margin = Inches(0.85)
    sec.right_margin = Inches(0.85)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_EA)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.12

    # ── title ──────────────────────────────────────────────────────────────
    tp = doc.add_paragraph()
    tp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tp.paragraph_format.space_after = Pt(0)
    shade_par(tp, TEAL)
    r = tp.add_run("\nInvestment Auto 2.1.3")
    r.bold = True
    r.font.size = Pt(21)
    r.font.color.rgb = WHITE
    set_ea(r)
    tp2 = doc.add_paragraph()
    tp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tp2.paragraph_format.space_after = Pt(8)
    shade_par(tp2, TEAL)
    r = tp2.add_run("商业价值 × 代码价值\n")
    r.bold = True
    r.font.size = Pt(14)
    r.font.color.rgb = ACCENT
    set_ea(r)

    intro = doc.add_paragraph()
    intro.paragraph_format.space_after = Pt(8)
    shade_par(intro, FILL_LIGHT)
    r = intro.add_run("导读：")
    r.bold = True
    r.font.color.rgb = TEAL_RGB
    set_ea(r)
    r = intro.add_run("本报告回答三个问题——① 这个项目能创造什么价值（商业价值）；② 它的代码有什么核心特异点（代码价值）；③ 商业价值是如何通过代码一步步兑现的（PART 3 对照表）。")
    r.font.size = Pt(10)
    set_ea(r)

    # ══════════════ PART 1 ══════════════════════════════════════════════════
    part_bar(doc, "PART 1", "商业价值：能创造什么样的价值", TEAL, ACCENT)

    subhead(doc, "1.1  对个人投资者：把「机构级投研 + 风控纪律」装进个人电脑", TEAL_RGB)
    bullet(doc, "零成本试错：", "模拟盘按真实规则撮合（佣金 / 印花税 / 滑点 / T+1），不用真钱就能完整练手，避免真金白银交学费。")
    bullet(doc, "系统化方法论：", "13 角色委员会式流程示范「四路研究 → 多空辩论 → 风险辩论 → 决策」的标准投研动作，用一次就学会一套流程。")
    bullet(doc, "随时在线的投研助手：", "对话式行情查询、多因子选股、组合检查、组合优化、宏观日报；快速/深度双模型兼顾成本与质量。")
    bullet(doc, "风控纪律被强制执行：", "硬止损、移动止损、分批止盈、回撤熔断由代码内置执行——在模拟盘里先养成纪律，再谈实战。")

    subhead(doc, "1.2  对开发者与团队：一个可复用的「AI × 金融」工程样板", TEAL_RGB)
    bullet(doc, "开源可审计：", "MIT 许可、全本地离线，数据不出本机；与黑盒荐股产品形成信任差异。")
    bullet(doc, "真实故障的沉淀：", "十余个版本把「重复成交、Windows 锁、编码、WebView2 挂起」等真实事故固化为测试与不变量，是稀缺的工程教材。")
    bullet(doc, "底座产品化示范：", "完整演示了如何把通用 Agent 框架（DeepSeek Harness）改造成一个独立品牌产品，方法论可直接迁移。")

    subhead(doc, "1.3  潜在商业化路径（当前为开源免费项目，以下为可能性分析）", TEAL_RGB)
    bullet(doc, "增值服务：", "企业级行情源、更多市场与数据、券商模拟/实盘通道对接、机构定制投研流。")
    bullet(doc, "SaaS / 多端：", "云化调度与团队共享组合、移动端跟随、Web 版订阅。")
    bullet(doc, "内容与教育：", "投研流程课程、AI 智能体教学案例、量化入门工具。")

    subhead(doc, "1.4  成本与信任优势", TEAL_RGB)
    bullet(doc, "成本极低：", "软件免费，唯一开销是自备 LLM API Key；无需服务器，个人电脑即可运行。")
    bullet(doc, "流程透明：", "每一笔决策都有证据、审计与报告可回溯——「AI 为什么这么决定」看得见，这是它区别于黑盒产品的核心信任资产。")

    # ══════════════ PART 2 ══════════════════════════════════════════════════
    part_bar(doc, "PART 2", "代码价值：核心特异点", NAVY, RGBColor(0x9F, 0xB6, 0xDD))

    card(doc, "① 决策面与执行面硬分离",
         "AI（DSH 决策面）只能「提案」，所有成交必经唯一入口 submit_decisions，由独立 Python 引擎自行取价、校验允许池、按硬边界重算仓位后再撮合——AI 结构性绕不过风控代码。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "② 三层幂等：绝不重复成交",
         "幂等键必填 → 归一化决策指纹（同键不同内容直接拒绝）→ 成交与执行回执在账户锁内同一次原子写入。崩溃在「已成交、未记账」之间时，重试从回执重放，绝不二次成交。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "③ 崩溃可恢复的分析状态机",
         "五阶段各自原子 checkpoint；running → ready_for_execution → completed/failed 显式状态机；跨进程租约（O_EXCL）防止双进程双跑；启动时扫描并续跑被重启打断的轮次（已实测）。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "④ 多 Agent 流水线的工程化约束",
         "13 个角色的输出 schema 在组合期预校验（失败提前暴露而非烧钱中途爆）；证据引用强制 + 成功率 < 0.8 故障停止；未达标持仓强制 HOLD——把「模型不靠谱」当作默认前提来设计。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "⑤ 底座产品化：对话内核零改动",
         "禁用 11 个 DSH 自带 UI 行、接管 root 槽、只 renderSlot(\"conversation\")，思考/流式/工具链组件原样保留（内核 bundle SHA-256 在案）——既拿到成熟对话内核，又做出独立品牌产品。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "⑥ Windows 桌面工程细节",
         "DPAPI 加密密钥（不落明文）、随机回环端口 + 令牌只注入引擎域、Job Object 保证零孤儿进程、唯一临时名原子写规避 WinError 5、UTF-8→GB18030 三序解码——每个细节都是真实缺陷的修复。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)
    card(doc, "⑦ 自维护闭环：AI 能修自己",
         "self-maintenance Skill 驱动「读日志 → 改权威源码 → 跑测试 → 失败回滚」；系统级完全权限与交易业务权限分离，修复能力永远不能削弱纸面边界、批准、幂等与硬风控。",
         fill=FILL_BLUE, lead_color=NAVY_RGB)

    # ══════════════ PART 3 ══════════════════════════════════════════════════
    part_bar(doc, "PART 3", "商业价值如何通过代码实现", GREEN, RGBColor(0x8F, 0xD9, 0xC8))

    body(doc, "每一项用户可感知的价值，背后都有一段确定性代码在兑现：", size=10, color=GREEN_RGB, bold=True)

    headers = ["商业价值", "关键代码实现", "兑现效果"]
    rows = [
        ("低门槛：双击即用", "Inno Setup 捆绑 Python/Node/.NET/WebView2 + 首次向导 + 覆盖升级只动程序目录", "零配置安装；76,167 个用户文件升级实测零丢失"),
        ("可信：模拟成交不造假", "幂等账本 + 决策指纹 + 账户内执行回执 + 跨进程租约", "崩溃、超时、重复点击都不会重复成交"),
        ("专业：机构级投研流程", "13 角色 5 阶段固定工作流 + 阶段 checkpoint + 证据引用门槛", "完整委员会式分析；中断后同 ID 续跑，进度真实可见"),
        ("安全：密钥与数据隐私", "DPAPI 加密 + 仅回环随机端口 + 令牌最小注入", "密钥不落明文；外部进程无法访问引擎"),
        ("体验：独立产品而非框架界面", "product-shell 接管 root 槽 + 去品牌 + 内核零改动", "Dashboard/分析流程/设置四页产品形态，思考与流式体验原样保留"),
        ("纪律：风控不被 AI 绕过", "唯一执行入口 + 引擎自取价 + build_orders 硬风控重算 + 保护性止损止盈", "仓位封顶、回撤熔断、止损止盈永远优先于 AI 建议"),
        ("持续：产品能自我进化", "self-maintenance Skill + 226 项自动化测试门禁 + 1.x→2.x 无损迁移", "AI 可诊断修复自身；每次发布有全量回归兜底"),
    ]
    t = doc.add_table(rows=1 + len(rows), cols=3)
    for j, h in enumerate(headers):
        cell = t.rows[0].cells[j]
        shade_cell(cell, "D9E2F3")
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(h)
        r.bold = True
        r.font.size = Pt(9.5)
        set_ea(r)
    for ri, (a, b, c) in enumerate(rows, start=1):
        cells = t.rows[ri].cells
        for j, txt in enumerate((a, b, c)):
            p = cells[j].paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(txt)
            r.font.size = Pt(9)
            if j == 0:
                r.bold = True
                r.font.color.rgb = GREEN_RGB
            set_ea(r)
        shade_cell(cells[0], FILL_LIGHT)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

    subhead(doc, "3.1  一条完整价值链的逐段兑现（以「分析中芯国际」为例）", GREEN_RGB)
    steps = [
        ("体验价值", "product-shell 秒级启动异步轮次、requestTimeout 归零——页面不再 5 分钟假死。"),
        ("准确性价值", "证券身份确认 + symbols 严格 JSON 编码——代码不靠模型自纠。"),
        ("流程价值", "五阶段 13 角色分析，每阶段原子 checkpoint——崩溃后从断点继续，不重头再来。"),
        ("一致性价值", "ready_for_execution 由引擎计算决策指纹——提交内容与已批准决策必须逐字节一致。"),
        ("安全价值", "硬风控重算仓位 + 纸面撮合写入账户内回执——即使此刻断电，也不会重复成交。"),
        ("可解释价值", "审计 / 报告 / 反思回填——「为什么买、买了多少、结果如何」全部可回溯。"),
    ]
    for i, (tag, txt) in enumerate(steps, start=1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(f"{i}. ")
        r.bold = True
        r.font.color.rgb = ACCENT
        set_ea(r)
        r = p.add_run(tag + "｜")
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = GREEN_RGB
        set_ea(r)
        r = p.add_run(txt)
        r.font.size = Pt(9.5)
        set_ea(r)

    # conclusion
    cp = doc.add_paragraph()
    cp.paragraph_format.space_before = Pt(12)
    shade_par(cp, FILL_LIGHT)
    r = cp.add_run("结论：")
    r.bold = True
    r.font.color.rgb = TEAL_RGB
    set_ea(r)
    r = cp.add_run("Investment Auto 的商业价值，本质上来自一个工程判断——「把不可靠的 AI 装进可靠的确定性边界里」。投资者得到机构级流程、风控纪律与可信模拟盘；开发者得到一套经过真实故障锤炼的开源工程样板；而这两者，都由同一段可审计的代码在兑现。")
    r.font.size = Pt(10)
    set_ea(r)

    fp = doc.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.paragraph_format.space_before = Pt(8)
    r = fp.add_run("— 完 · 配套阅读：《Investment Auto 2.1.3 核心亮点简报.docx》 —")
    r.font.size = Pt(8.5)
    r.font.color.rgb = GRAY
    set_ea(r)

    doc.save(DST)
    print("saved:", DST)


if __name__ == "__main__":
    main()
