# -*- coding: utf-8 -*-
"""Generate 'Core Investment Logic x Business Value' deep-dive report.

Focus: screening logic, 13-role analysis pipeline, decision & risk control.
Explicitly excluded: reliability/ops content (checkpoint, DPAPI, release gates...).
"""
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.enum.text import WD_ALIGN_PARAGRAPH

DST = r"C:\Users\zheng siyuan\Desktop\AI Trading Automation 2.1.3 核心投资逻辑与商业价值.docx"

TEAL = "10272B"
NAVY = "1F3864"
GREEN = "0E7C66"
PLUM = "5B2C6F"
TEAL_RGB = RGBColor(0x10, 0x27, 0x2B)
NAVY_RGB = RGBColor(0x1F, 0x38, 0x64)
GREEN_RGB = RGBColor(0x0E, 0x7C, 0x66)
PLUM_RGB = RGBColor(0x5B, 0x2C, 0x6F)
ACCENT = RGBColor(0x49, 0xB9, 0xA5)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x59, 0x59, 0x59)
FILL_LIGHT = "EFF6F4"
FILL_CARD = "F5F7FA"
FILL_BLUE = "EDF1F8"
HDR_FILL = "D9E2F3"
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


def part_bar(doc, part, text, fill):
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
    return p


def subhead(doc, text, color=TEAL_RGB):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(9)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(11.5)
    r.font.color.rgb = color
    set_ea(r)
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


def table(doc, headers, rows, lead_col=0, lead_color=TEAL_RGB, widths=None, lead_fill=FILL_LIGHT):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = doc.styles["Table Grid"]
    for j, h in enumerate(headers):
        cell = t.rows[0].cells[j]
        shade_cell(cell, HDR_FILL)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(h)
        r.bold = True
        r.font.size = Pt(9.5)
        set_ea(r)
        if widths:
            cell.width = widths[j]
    for ri, row in enumerate(rows, start=1):
        for j, txt in enumerate(row):
            cell = t.rows[ri].cells[j]
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(txt)
            r.font.size = Pt(9)
            if j == lead_col:
                r.bold = True
                r.font.color.rgb = lead_color
                shade_cell(cell, lead_fill)
            set_ea(r)
            if widths:
                cell.width = widths[j]
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return t


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
    r = tp.add_run("\nAI Trading Automation 2.1.3")
    r.bold = True
    r.font.size = Pt(21)
    r.font.color.rgb = WHITE
    set_ea(r)
    tp2 = doc.add_paragraph()
    tp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tp2.paragraph_format.space_after = Pt(8)
    shade_par(tp2, TEAL)
    r = tp2.add_run("核心投资逻辑深度解读：代码如何实现 · 商业上如何评估\n")
    r.bold = True
    r.font.size = Pt(13.5)
    r.font.color.rgb = ACCENT
    set_ea(r)

    intro = doc.add_paragraph()
    intro.paragraph_format.space_after = Pt(8)
    shade_par(intro, FILL_LIGHT)
    r = intro.add_run("导读：")
    r.bold = True
    r.font.color.rgb = TEAL_RGB
    set_ea(r)
    r = intro.add_run("本文只讲「投资智能」本身——选股凭什么认定一只股票比另一只更值得买、多角色分析如何得出一个可解释的结论、决策如何被风控纪律约束。每个部分都从「代码怎么实现」和「商业上如何评估」两个角度展开。")
    r.font.size = Pt(10)
    set_ea(r)

    # stats strip
    stats = doc.add_table(rows=1, cols=4)
    data = [
        ("4 大市场", "A股 · 港股 · 美股 · ETF"),
        ("6 因子 · 13 角色", "确定性选股 + 委员会式分析"),
        ("3 档策略硬边界", "仓位/止损/回撤纪律内置"),
        ("全流程可解释", "每笔决策带证据与理由"),
    ]
    for j, (big, small) in enumerate(data):
        cell = stats.rows[0].cells[j]
        shade_cell(cell, FILL_CARD)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(big)
        r.bold = True
        r.font.size = Pt(12)
        r.font.color.rgb = TEAL_RGB
        set_ea(r)
        p2 = cell.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.paragraph_format.space_after = Pt(2)
        r = p2.add_run(small)
        r.font.size = Pt(8.5)
        r.font.color.rgb = GRAY
        set_ea(r)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

    # ══════════ PART 1 选股逻辑 ════════════════════════════════════════════
    part_bar(doc, "PART 1", "选股逻辑：凭什么认定一只股票比另一只更值得买", NAVY)

    body(doc, "设计原则只有九个字：先排除、再打分、后解释。选股不是 LLM 拍脑袋，而是确定性代码的两段式流水线——硬筛选先砍掉「不能买」的，多因子评分再给剩下的「排序」，每只入选股票都附上中文理由。", size=10)

    subhead(doc, "1.1  代码实现第一步：硬筛选（先排除，再比较）", NAVY_RGB)
    bullet(doc, "代码归一化：", "剥离 sh/sz/bj/hk/us 等前缀统一标的身份，杜绝同一只股票因代码写法不同被重复计算或漏掉。")
    bullet(doc, "五类硬指标过滤：", "最低价、最低成交额、最低市值、PE 上限、PB 上限、单日涨跌幅上限——不符合的一律剔除。")
    bullet(doc, "名单排除：", "按名称模式排除 ST/*ST、退市、权证（WARRANT/RIGHT/UNIT/PREFERRED）等；ETF 市场额外排除货币基金、短融、债券类品种。")
    bullet(doc, "拒绝可审计：", "每只被剔除的股票都记录「因哪条规则被拒」，选股结果不是黑箱。")
    body(doc, "投资含义：这一层先挡掉流动性陷阱、退市风险、极端行情与壳炒作——「不买错」优先于「买得好」。", size=9.5, color=GRAY)

    subhead(doc, "1.2  代码实现第二步：六因子加权评分（凭什么 A 比 B 分高）", NAVY_RGB)
    table(doc,
          ["因子（权重）", "代码怎么算", "它回答的投资问题"],
          [
              ("动量 momentum（0.28）", "近 5 日 / 20 日涨跌幅，经 clamp 映射为 0–1 分", "这只股票现在是否正在走强"),
              ("趋势 trend（0.22）", "MA5/10/20/60 均线排列 + MACD 柱 + RSI14 综合打分", "中期趋势方向与健康度"),
              ("流动性 liquidity（0.20）", "成交额在全部样本中的百分位", "买得进、卖得出吗"),
              ("估值 valuation（0.12）", "PE/PB 所处历史区间分段打分", "当前价格贵不贵（辅助项，不主导）"),
              ("量能 volume（0.10）", "成交量相对变化", "资金是否在关注"),
              ("低波动 low_volatility（0.08）", "近期波动率水平", "拿得住吗"),
          ],
          lead_col=0, lead_color=NAVY_RGB, lead_fill=FILL_BLUE)
    body(doc, "综合得分 = Σ(因子分 × 权重)，按得分排序取前 N 只（候选池上限默认 30）；随后交给 AI 做一轮「复筛」，用自然语言补充定性判断，输出标准化候选列表。权重与阈值全部可配置——想换风格，改配置即可。", size=10)

    subhead(doc, "1.3  一个完整例子：为什么 A 比 B 更适合买（示意数据）", NAVY_RGB)
    table(doc,
          ["因子（权重）", "股票 A", "股票 B", "差异解读"],
          [
              ("动量（0.28）", "近20日 +8.3%，得分 0.90", "近20日 -3.2%，得分 0.30", "A 正在走强，B 仍在阴跌"),
              ("趋势（0.22）", "MA5>MA10>MA20>MA60 多头排列，RSI 62，得分 0.85", "均线纠缠，RSI 44，得分 0.40", "A 趋势健康，B 方向不明"),
              ("流动性（0.20）", "成交额处样本 92 分位，得分 0.92", "41 分位，得分 0.41", "A 进出无碍，B 有流动性折价"),
              ("估值（0.12）", "PE 处近三年 45 分位，得分 0.60", "85 分位，得分 0.30", "A 估值中性，B 偏贵"),
              ("量能（0.10）", "温和放量，得分 0.70", "持续缩量，得分 0.40", "A 有资金流入迹象"),
              ("低波动（0.08）", "波动率较低，得分 0.60", "高波动，得分 0.35", "A 持仓体验更稳"),
              ("加权总分", "≈ 0.81", "≈ 0.36", "A 以明显优势入选"),
          ],
          lead_col=0, lead_color=NAVY_RGB, lead_fill=FILL_BLUE)
    body(doc, "入选后附带的证据（evidence）形如：「近20日上涨8.3%、处于全样本第92分位；均线多头排列；成交额分位92%，流动性充足；PE 处于近三年45分位，估值中性。」——这就是「凭什么买它」的书面答案。", size=9.5)

    subhead(doc, "1.4  商业上如何评估这套选股逻辑", NAVY_RGB)
    bullet(doc, "可解释 → 可信赖：", "每只入选股都带中文理由，用户可以复盘「为什么是它」；黑盒荐股做不到这一点。")
    bullet(doc, "纪律 → 防踩雷：", "排除规则把 ST、流动性陷阱、退市风险挡在门外——风控前置到选股环节。")
    bullet(doc, "零成本 → 边际优势：", "硬筛选与因子打分是确定性代码，不消耗任何 token；LLM 只用于复筛与深度分析，好钢用在刀刃上。")
    bullet(doc, "可复现 → 可审计：", "同一份行情数据永远得出同一张候选名单，结果可验证、可追责，这是金融场景的信任基础。")
    bullet(doc, "可配置 → 可商业化：", "因子权重、阈值、排除口径均可配置，天然支持「保守/激进」等不同风格的产品化封装。")

    # ══════════ PART 2 多角色分析 ══════════════════════════════════════════
    part_bar(doc, "PART 2", "多角色分析：一个「该不该买」的结论是怎么产生的", TEAL)

    body(doc, "为什么是 13 个角色而不是一个模型？因为单一模型「看什么都想买」——它需要被质疑。这套流程把机构投研委员会搬进代码：先分头研究，再正反辩论，最后层层裁决，每个结论都必须挂证据。", size=10)

    subhead(doc, "2.1  五阶段与 13 角色分工", TEAL_RGB)
    table(doc,
          ["阶段", "角色", "职责", "输出"],
          [
              ("① 基础研究", "技术面研究员", "计算均线、动量、量价形态", "技术面立场 + 证据引用"),
              ("（每标的并行）", "基本面研究员", "分析财务与估值数据", "基本面立场 + 证据引用"),
              ("", "新闻研究员", "检索新闻、公告、事件", "事件面立场 + 证据引用"),
              ("", "情绪研究员", "分析市场情绪指标", "情绪面立场 + 证据引用"),
              ("② 研究辩论", "多头研究员", "尽全力论证买入理由", "多方论点 + 证据"),
              ("", "空头研究员", "尽全力论证卖出与风险", "空方论点 + 证据"),
              ("", "研究经理", "裁决分歧、判定证据充分性", "研究结论 + 引用完整性裁决"),
              ("", "交易员（逐标的）", "把研究结论转成具体动作", "BUY/SELL/HOLD + 目标权重 + 置信度"),
              ("③ 组合草案", "—", "汇总各标的形成组合草案", "组合草案"),
              ("④ 风险辩论", "激进分析师", "从进攻视角评估机会成本", "风险论点"),
              ("", "保守分析师", "从防御视角评估下行风险", "风险论点"),
              ("", "中立分析师", "平衡评估", "风险论点"),
              ("", "风险经理", "裁决风险、给出约束", "风险结论"),
              ("⑤ 最终决策", "组合经理", "汇总各方形成最终决策", "最终 BUY/SELL/HOLD + 权重 + 置信度清单"),
          ],
          lead_col=1, lead_color=TEAL_RGB)

    subhead(doc, "2.2  代码上如何实现", TEAL_RGB)
    bullet(doc, "原生工作流编排：", "整条流水线是 DeepSeek Harness 原生 workflow 脚本（pipeline / parallel / agent）——基础研究四路对每只标的并行展开，辩论与裁决按阶段串行推进。")
    bullet(doc, "schema 冻结 + 组合期预校验：", "13 个角色的输出结构（字段、必填项）冻结为共享常量，插件装载时就做 JSON Schema 校验——结构错误在启动前暴露，而不是烧掉一整轮 token 后才失败。")
    bullet(doc, "证据引用强制：", "每条结论必须引用证据（强制开启，最少 1 条）；引用不足的角色输出按失败处理，失败候选被剔除。这直接掐断「一本正经地胡说」。")
    bullet(doc, "质量底线：", "基础研究成功率低于 80% 时整轮故障安全停止；研究不完整的持仓被强制 HOLD、非持仓直接排除——宁可不买，不买看不懂的。")
    bullet(doc, "角色记忆：", "每个角色保留结构化记忆（默认 6 条/角色），跨轮次积累对个股的认知，不是每次从零开始。")
    bullet(doc, "成本控制：", "下游角色只接收压缩后的证据摘要（默认上限 16000 字符），完整证据落库可回溯，兼顾质量与 token 成本。")

    subhead(doc, "2.3  商业上如何评估这套多角色流程", TEAL_RGB)
    bullet(doc, "对抗偏见：", "强制空头进场辩论，对冲单一模型的买入冲动——这是流程价值，不是模型能力。")
    bullet(doc, "防幻觉：", "「结论必须挂证据」让凭空捏造无路可走；用户看到的每个判断都可溯源。")
    bullet(doc, "该克制时克制：", "置信度低于 0.65 不行动、研究不足强制 HOLD——把「拿不准就不动手」从口号变成代码。")
    bullet(doc, "全程透明：", "分析流程页展示真实阶段、Agent 进度与证据数量，用户看得见「结论是怎么一步步形成的」。")
    bullet(doc, "方法论外溢：", "用户每一次使用都在观摩一套机构级投研流程——产品同时是一本会示范的教科书。")

    # ══════════ PART 3 决策与风控 ══════════════════════════════════════════
    part_bar(doc, "PART 3", "决策与风控：分析完了，凭什么只能这么买", PLUM)

    subhead(doc, "3.1  三档策略授权书：先定边界，再谈收益", PLUM_RGB)
    body(doc, "系统内置保守 / 中性 / 激进三档策略，每档都是一组不可突破的硬边界：组合总仓位、现金储备、单票上限、单笔上限、最低置信度、单轮换手上限、每日交易次数、回撤削减与最大回撤。当前默认配置：单票 32%、单笔 38%、单轮换手 35%、置信度 0.65、单轮最多 40 条决策 / 10 笔订单。边界值永远取代码定义（磁盘只存用户的选择与版本），改文件也改不掉边界。", size=10)

    subhead(doc, "3.2  代码如何执行「凭什么这么买」", PLUM_RGB)
    bullet(doc, "仓位封顶：", "目标仓位 = min(市场规则单票上限, 策略单票上限)——例如 A 股市场规则单票 10%，即使策略允许 32% 也按 10% 执行。")
    bullet(doc, "组合级约束：", "单笔金额、单轮换手、现金储备、目标总仓位四道闸一起把关；可用资金还受「目标总仓位 − 当前持仓市值」约束，永不满仓裸奔。")
    bullet(doc, "回撤熔断：", "回撤触及最大回撤线（A 股 -18%）时强制清仓全部持仓并拒绝一切买入——保住本金优先于一切。")
    bullet(doc, "保护性决策优先于 AI：", "硬止损（A股 -7%）、移动止损（自高点回撤 -4%）、两档分批止盈（+15% 卖 30%、+25% 卖 40%）由代码自动执行，永远排在 AI 建议之前。")
    bullet(doc, "标的与价格双校验：", "只允许交易「持仓 ∪ 最新选股 ∪ 配置默认标的」允许池内的标的；成交价由引擎按实时行情自行抓取，不采用 AI 报价。")
    body(doc, "四市场规则内建：A 股 T+1/100 股整手/印花税、港股每手股数、美股熔断、ETF 免印花税……模拟撮合按真实成本计算，练习的手感和真实市场一致。", size=9.5, color=GRAY)

    subhead(doc, "3.3  商业价值：把纪律装进代码", PLUM_RGB)
    bullet(doc, "纪律内置：", "个人投资者最大的敌人是情绪——这里止损止盈是代码不是决心，回撤熔断不商量。")
    bullet(doc, "偏好适配：", "三档策略对应不同风险偏好，且边界不可被 AI 或用户随手突破——产品承诺「不越界」而不是「请自律」。")
    bullet(doc, "真实成本感：", "佣金、印花税、滑点、T+1 全部计入模拟成交，训练出的策略天然考虑摩擦成本。")

    # ══════════ PART 4 商业价值总览 ════════════════════════════════════════
    part_bar(doc, "PART 4", "商业价值总览：这套投资智能能创造什么", NAVY)
    bullet(doc, "对个人投资者：", "零成本模拟训练（不拿真钱交学费）· 一套机构级投研方法论 · 强制执行的纪律 · 双模型（快速/深度）兼顾成本与质量。", NAVY_RGB)
    bullet(doc, "对开发者与团队：", "开源（MIT）、本地、可审计的「AI × 金融」工程样板；十余个版本真实故障的沉淀；通用 Agent 底座产品化的完整示范。", NAVY_RGB)
    bullet(doc, "潜在商业化路径：", "企业级行情源与机构定制投研流 · SaaS/多端订阅 · 投研教育内容（当前为开源免费项目，属可能性分析）。", NAVY_RGB)
    bullet(doc, "成本与信任：", "软件免费，唯一开销是自备 LLM API Key；数据不出本机；每一笔决策都有证据与审计可回溯——透明本身就是护城河。", NAVY_RGB)

    cp = doc.add_paragraph()
    cp.paragraph_format.space_before = Pt(12)
    shade_par(cp, FILL_LIGHT)
    r = cp.add_run("结论：")
    r.bold = True
    r.font.color.rgb = TEAL_RGB
    set_ea(r)
    r = cp.add_run("这个产品的商业价值，不是「AI 帮你赚更多」，而是「把一套可解释、有纪律、可审计的投资决策流程变成人人都能运行的软件」——选股有理由，结论有证据，交易有边界。")
    r.font.size = Pt(10)
    set_ea(r)

    bp = doc.add_paragraph()
    bp.paragraph_format.space_before = Pt(4)
    r = bp.add_run("边界声明：本项目仅支持研究与模拟交易，不连接真实券商，不构成投资建议。")
    r.font.size = Pt(9)
    r.font.color.rgb = GRAY
    set_ea(r)

    doc.save(DST)
    print("saved:", DST)


if __name__ == "__main__":
    main()
