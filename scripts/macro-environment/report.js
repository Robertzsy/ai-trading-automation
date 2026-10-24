#!/usr/bin/env node
/**
 * 宏观环境报告生成脚本
 * 用法: node report.js <daily|weekly|monthly|yearly> [--date YYYY-MM-DD]
 *
 * 读取采集的 JSON 数据，生成 Markdown 报告，输出到 stdout 和存档文件。
 */

const fs = require('fs');
const path = require('path');

// ========================= 配置 =========================

const REPORTS_DIR = process.env.MACRO_DATA_DIR
  ? path.resolve(process.env.MACRO_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'runtime', 'macro');
const NEWS_DIR = path.join(REPORTS_DIR, 'news');

const macroLanguage = (process.env.MACRO_OUTPUT_LANGUAGE === 'en' || process.argv.includes('--english')) ? 'en' : 'zh';
const macroCopy = require('./locales.json');
const mtr=(key,params={})=>macroCopy[key][macroLanguage].replace(/\{(p[0-9]+)\}/g,(_,name)=>String(params[name]));
const categoryNames={'货币政策':'Monetary policy','财政政策':'Fiscal policy','产业政策':'Industrial policy','监管动态':'Regulation','宏观数据':'Macro data','国际财经':'International finance','大宗商品':'Commodities','地缘政治':'Geopolitics','行业动态':'Industry','科技前沿':'Technology','其他':'Other'};
const categoryName=cat=>macroLanguage==='en'?(categoryNames[cat]??cat):cat;

const MARKS_FILE = path.join(REPORTS_DIR, 'marks.json');

const PERIOD_DIRS = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
};

// 周几中文
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ========================= 渲染辅助 =========================

function formatTime(ts) {
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

function importanceEmoji(level) {
  return level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '⚪';
}

function categoryEmoji(cat) {
  const map = {
    '货币政策': '🏦',
    '财政政策': '💰',
    '产业政策': '🏭',
    '监管动态': '⚖️',
    '宏观数据': '📊',
    '国际财经': '🌍',
    '大宗商品': '🛢️',
    '地缘政治': '⚔️',
    '行业动态': '📈',
    '科技前沿': '🤖',
  };
  return map[cat] || '📌';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ========================= 日报 =========================

function generateDaily(data) {
  // 日报面向"昨天"，所以 endDate 就是昨天
  const date = data.window.endDate;
  const d = new Date(date);
  const weekday = macroLanguage==='en'?['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]:WEEKDAYS[d.getDay()];
  const news = data.news || [];
  const market = data.market_data || {};

  const high = news.filter(n => n.importance === 'high');
  const medium = news.filter(n => n.importance === 'medium');
  const low = news.filter(n => n.importance === 'low');

  let report = '';

  // Header - 显示为"昨日"
  report += mtr("macro.daily.macro.briefing.previous.day.p0.p1",{p0:(date),p1:(weekday)});

  // 今日概览
  report += mtr("macro.collected.p0.articles.high.p1.medium.p2.low.p3",{p0:(data.stats.total),p1:(data.stats.high),p2:(data.stats.medium),p3:(data.stats.low)});

  // Highlight
  if (high.length > 0) {
    report += mtr("macro.highlights",{});
    for (const n of high.slice(0, 8)) {
      const cats = n.categories.map(c => `${categoryEmoji(c)}${categoryName(c)}`).join(' ');
      report += `**${importanceEmoji(n.importance)} ${n.title}**\n`;
      report += `> ${cats} | ${n.source} | ${formatTime(n.time)}\n`;
      if (n.intro) report += `> ${n.intro.slice(0, 120)}\n`;
      report += mtr("macro.original.source.p0",{p0:(n.url)});
    }
    report += `\n`;
  }

  // 分类展示（中重要度+）
  const groupedByCategory = {};
  for (const n of [...high, ...medium]) {
    const cat = n.categories[0] || '其他';
    if (!groupedByCategory[cat]) groupedByCategory[cat] = [];
    if (groupedByCategory[cat].length < 5) groupedByCategory[cat].push(n);
  }

  const categoryOrder = ['货币政策', '财政政策', '产业政策', '监管动态', '宏观数据', '行业动态', '科技前沿', '大宗商品', '国际财经', '地缘政治', '其他'];

  for (const cat of categoryOrder) {
    const items = groupedByCategory[cat];
    if (!items || items.length === 0) continue;
    report += `### ${categoryEmoji(cat)} ${categoryName(cat)}\n\n`;
    for (const n of items) {
      report += `- ${importanceEmoji(n.importance)} **[${n.title}](${n.url})** — ${n.source}\n`;
    }
    report += `\n`;
  }

  // 行情数据
  const indices = market.indices || [];
  if (market._isWeekend) {
    report += mtr("macro.market.data",{});
    report += mtr("macro.the.previous.day.was.a.weekend.mainland.markets.were.closed.these.are.the.latest",{});
  } else if (indices.length > 0) {
    report += mtr("macro.market.data",{});
    report += mtr("macro.index.close.change",{});
    report += `|------|------|--------|\n`;
    for (const idx of indices) {
      const sign = idx.change_pct >= 0 ? '+' : '';
      report += `| ${idx.name} | ${idx.price} | ${sign}${idx.change_pct}% |\n`;
    }
    report += `\n`;
  }

  const topSectors = market.topSectors || [];
  const bottomSectors = market.bottomSectors || [];
  if (topSectors.length > 0) {
    report += mtr("macro.top.5.sector.moves",{});
    report += mtr("macro.gainers.p0",{p0:(topSectors.slice(0, 5).map(s => `${s.name}(+${s.change_pct}%)`).join(' | '))});
    report += mtr("macro.decliners.p0",{p0:(bottomSectors.slice(0, 5).map(s => `${s.name}(${s.change_pct}%)`).join(' | '))});
    report += `\n`;
  }

  // 今日关键词
  const allTags = {};
  for (const n of news) {
    for (const t of n.tags || []) {
      allTags[t] = (allTags[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(allTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => `#${t}`);

  if (topTags.length > 0) {
    report += `💡 ${topTags.join(' ')}\n\n`;
  }

  report += mtr("macro.generated.at.p0",{p0:(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))});

  return report;
}

// ========================= 周报 =========================

function generateWeekly(data) {
  const endDate = data.window.endDate;
  const startDate = data.window.startDate;
  const wn = getWeekNumber(new Date(endDate));
  const news = data.news || [];
  const high = news.filter(n => n.importance === 'high');
  const medium = news.filter(n => n.importance === 'medium');

  let report = '';

  report += mtr("macro.weekly.macro.briefing.p0.p1.p2",{p0:(startDate),p1:(endDate),p2:(wn)});
  report += mtr("macro.this.week.p0.articles.high.p1.medium.p2",{p0:(data.stats.total),p1:(data.stats.high),p2:(data.stats.medium)});

  // 本周主线
  if (high.length > 0) {
    report += mtr("macro.main.themes.this.week",{});
    for (const n of high.slice(0, 15)) {
      report += `- ${importanceEmoji(n.importance)} **[${n.title}](${n.url})** — ${n.source} ${formatTime(n.time)}\n`;
    }
    report += `\n`;
  }

  // 分类汇总
  report += mtr("macro.category.summary",{});
  const cats = Object.entries(data.stats.categories || {}).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of cats) {
    const bar = '█'.repeat(Math.min(count, 20));
    report += mtr("macro.p0.p1.p2.articles.p3",{p0:(categoryEmoji(cat)),p1:(categoryName(cat)),p2:(count),p3:(bar)});
  }
  report += `\n`;

  // 行业热度
  report += mtr("macro.industry.attention",{});
  const sectors = Object.entries(data.stats.sectors || {}).sort((a, b) => b[1] - a[1]);
  for (const [sector, count] of sectors.slice(0, 10)) {
    report += mtr("macro.p0.p1.related.articles",{p0:(sector),p1:(count)});
  }
  report += `\n`;

  // 本周重要数据
  report += mtr("macro.key.data.releases.this.week",{});
  const dataNews = news.filter(n => n.categories.includes('宏观数据'));
  if (dataNews.length > 0) {
    for (const n of dataNews) {
      report += `- [${n.title}](${n.url})\n`;
    }
  } else {
    report += mtr("macro.no.major.macroeconomic.releases.this.week",{});
  }
  report += `\n`;

  // 下周关注
  report += mtr("macro.next.week",{});
  report += mtr("macro.monitor.developments.in.the.middle.east.and.us.iran.relations",{});
  report += mtr("macro.data.monitor.monthly.releases.including.pmi",{});
  report += mtr("macro.policy.monitor.central.bank.open.market.operations",{});

  report += mtr("macro.generated.at.p0",{p0:(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))});

  return report;
}

// ========================= 月报 =========================

function generateMonthly(data) {
  const endDate = data.window.endDate;
  const startDate = data.window.startDate;
  const news = data.news || [];
  const high = news.filter(n => n.importance === 'high');

  let report = '';

  report += mtr("macro.monthly.macro.briefing.p0.p1",{p0:(startDate),p1:(endDate)});
  report += mtr("macro.this.month.p0.articles.high.p1",{p0:(data.stats.total),p1:(data.stats.high)});

  // 宏观全景
  report += mtr("macro.macro.overview",{});
  const macroNews = news.filter(n => n.categories.some(c => ['货币政策', '财政政策', '宏观数据', '国际财经'].includes(c)));
  for (const n of high.slice(0, 20)) {
    report += `- ${importanceEmoji(n.importance)} [${n.title}](${n.url}) — ${n.source}\n`;
  }
  report += `\n`;

  // 政策路线图
  report += mtr("macro.policy.roadmap",{});
  const policyNews = news.filter(n => n.categories.some(c => ['货币政策', '财政政策', '产业政策', '监管动态'].includes(c)));
  for (const n of policyNews.filter(n => n.importance === 'high').slice(0, 10)) {
    report += `- [${n.title}](${n.url})\n`;
  }
  report += `\n`;

  // 行业景气度
  report += mtr("macro.industry.rotation",{});
  const sectors = Object.entries(data.stats.sectors || {}).sort((a, b) => b[1] - a[1]);
  report += mtr("macro.industry.news.mentions.attention",{});
  report += `|------|----------|--------|\n`;
  for (const [sector, count] of sectors.slice(0, 10)) {
    const level = count > 15 ? mtr("macro.very.high") : count > 10 ? mtr("macro.high") : count > 5 ? mtr("macro.watch") : mtr("macro.normal");
    report += `| ${sector} | ${count} | ${level} |\n`;
  }
  report += `\n`;

  report += mtr("macro.generated.at.p0",{p0:(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))});

  return report;
}

// ========================= 年报 =========================

function generateYearly(data) {
  const endDate = data.window.endDate;
  const startDate = data.window.startDate;
  const news = data.news || [];
  const high = news.filter(n => n.importance === 'high');

  let report = '';

  report += mtr("macro.annual.macro.briefing.p0.p1",{p0:(startDate),p1:(endDate)});
  report += mtr("macro.p0.major.articles.collected.this.year",{p0:(data.stats.total)});

  // 年度回顾
  report += mtr("macro.annual.review",{});
  report += mtr("macro.main.macro.themes.based.on.p0.articles.collected.during.the.year",{p0:(data.stats.total)});

  // 重大事件时间线
  report += mtr("macro.major.events.timeline",{});
  // 按月分组
  const byMonth = {};
  for (const n of high) {
    const month = n.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    if (byMonth[month].length < 5) byMonth[month].push(n);
  }

  const months = Object.keys(byMonth).sort();
  for (const month of months) {
    report += `**${month}**\n\n`;
    for (const n of byMonth[month]) {
      report += `- ${importanceEmoji(n.importance)} [${n.title}](${n.url})\n`;
    }
    report += `\n`;
  }

  // 行业年度轮动
  report += mtr("macro.annual.industry.overview",{});
  const sectors = Object.entries(data.stats.sectors || {}).sort((a, b) => b[1] - a[1]);
  report += mtr("macro.industry.annual.attention",{});
  report += `|------|------------|\n`;
  for (const [sector, count] of sectors.slice(0, 15)) {
    report += `| ${sector} | ${'█'.repeat(Math.max(1, Math.ceil(count / 5)))} ${count} |\n`;
  }
  report += `\n`;

  // 来年展望
  report += mtr("macro.outlook.for.next.year",{});
  report += mtr("macro.directions.and.risks.to.monitor.based.on.annual.trends",{});
  report += mtr("macro.policy.continuity.monitor.key.industry.policies.and.adjustments",{});
  report += mtr("macro.international.environment.geopolitical.risks.remain.a.key.variable",{});
  report += mtr("macro.technology.ai.and.other.emerging.technologies.are.reshaping.industries",{});

  report += mtr("macro.generated.at.p0",{p0:(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))});

  return report;
}

// ========================= 主流程 =========================

function loadNewsData(period, refDate) {
  // 周报/月报/年报：从日报 JSON 文件聚合
  // 新浪 Feed API 只保留最近 ~3 天数据，无法回溯历史
  if (period !== 'daily') {
    return aggregateDailyData(period, refDate);
  }

  // 日报：读取单日 JSON
  const yesterday = new Date(refDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileKey = yesterday.toISOString().slice(0, 10);
  const file = path.join(NEWS_DIR, `${fileKey}.json`);
  if (!fs.existsSync(file)) {
    console.error(`新闻数据文件不存在: ${file}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function aggregateDailyData(period, refDate) {
  // 从 news/ 目录中读取所有日报 JSON，按时间窗口筛选
  if (!fs.existsSync(NEWS_DIR)) {
    console.error('news 目录不存在');
    process.exit(1);
  }

  const files = fs.readdirSync(NEWS_DIR)
    .filter(f => f.endsWith('.json') && f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
    .sort();

  if (files.length === 0) {
    console.error('没有日报数据文件');
    process.exit(1);
  }

  // 确定时间窗口
  let startDate, endDate, startTs, endTs;
  if (period === 'weekly') {
    const today = new Date(refDate);
    const dayOfWeek = today.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysSinceMonday);
    thisMonday.setHours(0, 0, 0, 0);
    endDate = thisMonday.toISOString().slice(0, 10); // 本周一（即上周末+1天标记）
    startDate = new Date(thisMonday.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    startTs = Math.floor(new Date(startDate).getTime() / 1000);
    endTs = Math.floor((thisMonday.getTime() - 1000) / 1000);
  } else if (period === 'monthly') {
    const now = new Date(refDate);
    const thisMonth1st = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = thisMonth1st.toISOString().slice(0, 10);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    startDate = lastMonth.toISOString().slice(0, 10);
    startTs = Math.floor(lastMonth.getTime() / 1000);
    endTs = Math.floor((thisMonth1st.getTime() - 1000) / 1000);
  } else { // yearly
    const lastYear = new Date(refDate).getFullYear() - 1;
    startDate = `${lastYear}-01-01`;
    endDate = `${lastYear}-12-31`;
    startTs = Math.floor(new Date(startDate).getTime() / 1000);
    endTs = Math.floor(new Date(`${lastYear}-12-31T23:59:59`).getTime() / 1000);
  }

  // 读取窗口内的日报文件
  const windowFiles = files.filter(f => {
    const name = f.replace('.json', '');
    return name >= startDate.slice(0, 10) && name < endDate;
  });

  console.error(`📂 聚合 ${windowFiles.length} 份日报: ${startDate} ~ ${endDate}`);

  // 合并所有日报的新闻
  const allNews = [];
  const seen = new Set();
  for (const f of windowFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(NEWS_DIR, f), 'utf-8'));
      for (const n of data.news || []) {
        const key = n.id || `${n.title}|${n.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          allNews.push(n);
        }
      }
    } catch (e) {
      console.error(`  读取 ${f} 失败: ${e.message}`);
    }
  }

  console.error(`📥 聚合 ${allNews.length} 条（去重后）`);

  // 统计
  const stats = {
    total: allNews.length,
    high: allNews.filter(n => n.importance === 'high').length,
    medium: allNews.filter(n => n.importance === 'medium').length,
    low: allNews.filter(n => n.importance === 'low').length,
    categories: {},
    sectors: {},
  };
  for (const n of allNews) {
    for (const c of n.categories || []) {
      stats.categories[c] = (stats.categories[c] || 0) + 1;
    }
    for (const s of n.sectors || []) {
      stats.sectors[s] = (stats.sectors[s] || 0) + 1;
    }
  }

  return {
    period,
    window: { start: startTs, end: endTs, startDate, endDate },
    collected_at: new Date().toISOString(),
    stats,
    news: allNews,
    market_data: null,
  };
}

function saveReport(period, refDate, content) {
  const dir = path.join(REPORTS_DIR, PERIOD_DIRS[period]);
  let filename;

  if (period === 'daily') {
    // 日报：用昨天日期命名
    const yesterday = new Date(refDate);
    yesterday.setDate(yesterday.getDate() - 1);
    filename = yesterday.toISOString().slice(0, 10) + '.md';
  } else if (period === 'weekly') {
    // 周报：用上周的周号命名
    const thisMonday = new Date(refDate);
    const dayOfWeek = refDate.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    thisMonday.setDate(refDate.getDate() - daysSinceMonday);
    const lastSunday = new Date(thisMonday.getTime() - 86400000);
    filename = getWeekNumber(lastSunday) + '.md';
  } else if (period === 'monthly') {
    // 月报：用上月月份命名
    const d = new Date(refDate);
    const lastMonth = new Date(d.getFullYear(), d.getMonth(), 0);
    filename = lastMonth.toISOString().slice(0, 7) + '.md';
  } else {
    // 年报：用去年年份命名
    filename = (refDate.getFullYear() - 1) + '.md';
  }

  const filepath = path.join(dir, filename);
  fs.mkdirSync(path.dirname(filepath), {recursive:true});
  fs.writeFileSync(filepath, content);
  console.error(`💾 报告已保存: ${filepath}`);
  return filepath;
}

function updateMarks(period, refDate) {
  let marks = {};
  if (fs.existsSync(MARKS_FILE)) {
    marks = JSON.parse(fs.readFileSync(MARKS_FILE, 'utf-8'));
  }

  // 标记记录的是"已完成报告覆盖的最新日期/周/月/年"
  if (period === 'daily') {
    // 记录"昨天"的日期，表示昨天日报已生成
    const yesterday = new Date(refDate);
    yesterday.setDate(yesterday.getDate() - 1);
    marks.daily = yesterday.toISOString().slice(0, 10);
  } else if (period === 'weekly') {
    // 记录上周的周号
    const thisMonday = new Date(refDate);
    const dow = refDate.getDay();
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    thisMonday.setDate(refDate.getDate() - daysSinceMonday);
    const lastSunday = new Date(thisMonday.getTime() - 86400000);
    marks.weekly = getWeekNumber(lastSunday);
  } else if (period === 'monthly') {
    // 记录上月月份
    const lastMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
    marks.monthly = lastMonth.toISOString().slice(0, 7);
  } else if (period === 'yearly') {
    // 记录去年
    marks.yearly = String(refDate.getFullYear() - 1);
  }

  fs.writeFileSync(MARKS_FILE, JSON.stringify(marks, null, 2));
  console.error(`📌 标记已更新: ${period}`);
}

async function main() {
  const args = process.argv.slice(2);
  const period = args[0] || 'daily';
  const dateIdx = args.indexOf('--date');
  const refDate = dateIdx !== -1 ? new Date(args[dateIdx + 1]) : new Date();

  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
    console.error('用法: node report.js <daily|weekly|monthly|yearly> [--date YYYY-MM-DD]');
    process.exit(1);
  }

  console.error(`📝 生成 ${period} 报告: ${refDate.toISOString().slice(0, 10)}`);

  const data = loadNewsData(period, refDate);

  let report;
  switch (period) {
    case 'daily':   report = generateDaily(data);   break;
    case 'weekly':  report = generateWeekly(data);  break;
    case 'monthly': report = generateMonthly(data); break;
    case 'yearly':  report = generateYearly(data);  break;
  }

  if (macroLanguage === "en") report = "<!-- output_language: en -->\n> Source titles, quotations, company/industry names and news summaries remain in their original language.\n\n" + report;
  // 输出到 stdout
  console.log(report);

  // 存档
  saveReport(period, refDate, report);

  // 更新标记
  updateMarks(period, refDate);
}

main().catch(err => {
  console.error('报告生成失败:', err);
  process.exit(1);
});
