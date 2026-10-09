// Native SVG figures for the public README example. All values come from the
// recorded HK round already documented in README.md and README_EN.md.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const data = JSON.parse(readFileSync(new URL('../docs/assets/hk-case-study.json', import.meta.url), 'utf8'));
const total = data.stages.reduce((sum, stage) => sum + stage.seconds, 0);
const max = Math.max(...data.stages.map(stage => stage.seconds));
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
if (data.submit !== false || data.stocks.some(stock => stock.action !== 'HOLD')) {
  throw new Error('This figure represents the documented no-submission, all-HOLD case.');
}

function figure(lang) {
  const zh = lang === 'zh';
  const copy = zh ? {
    title: '一次真实港股分析，看清每一步',
    label: '投资研究 · 已记录轮次',
    metrics: ['分析标的', '子代理', '引用证据', '失败任务'],
    stages: '五阶段分析耗时',
    sum: '阶段合计 ' + total + ' 秒',
    note: '耗时为各阶段记录之和，不含启动等额外开销。',
    outcome: '最终结论',
    result: '4 / 4 标的维持 HOLD',
    trade: '未开新仓 · 未产生交易',
    pending: '等待用户批准',
    evidence: '每个结论都有具体依据',
    footer: '2026-10-05 的历史案例 · 模拟交易 · 非收益展示',
  } : {
    title: 'Inside a real Hong Kong research round',
    label: 'INVESTMENT RESEARCH · RECORDED CASE',
    metrics: ['Stocks analysed', 'Subagents', 'Cited evidence', 'Failed tasks'],
    stages: 'Time spent in five analysis stages',
    sum: 'Stage sum: ' + total + ' s',
    note: 'Sum of recorded stage times; startup and other overhead are excluded.',
    outcome: 'Final decision',
    result: '4 / 4 stocks remain HOLD',
    trade: 'No new positions · No trades',
    pending: 'Awaiting user approval',
    evidence: 'A specific reason for every decision',
    footer: 'Historical case: 2026-10-05 · Paper trading · Not a return chart',
  };
  const text = (x, y, value, size = 20, color = '#536580', weight = 400, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${xml(value)}</text>`;
  const rect = (x, y, w, h, fill = '#ffffff', radius = 16, stroke = '#dde5f0') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1080" viewBox="0 0 960 1080" role="img" aria-labelledby="title description">`,
    `<title id="title">${xml(copy.title)}</title>`,
    `<desc id="description">${xml(data.date + ': 4 stocks, 38 subagents, 185 evidence items, 0 failures. Stage times: 118, 190, 16, 52 and 25 seconds. All HOLD; submit=false; no trades.')}</desc>`,
    `<g font-family="Segoe UI, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif">`,
    rect(0.5, 0.5, 959, 1079, '#f4f7fc', 24, '#dde5f0'),
    rect(24, 24, 912, 1032, '#ffffff', 20),
    rect(48, 49, 5, 52, '#2563eb', 2, '#2563eb'),
    text(68, 59, copy.label, 15, '#2563eb', 600),
    text(68, 98, copy.title, zh ? 32 : 30, '#16253c', 700),
    text(48, 137, data.date + ' · ' + data.cycle, 18),
  ];
  [data.stocks.length, data.subagents, data.evidence, data.failures].forEach((value, index) => {
    const x = 48 + index * 220;
    parts.push(rect(x, 163, 204, 98, index === 3 ? '#f1faf7' : '#f5f8fe', 12, 'none'));
    parts.push(text(x + 18, 194, copy.metrics[index], 18));
    parts.push(text(x + 18, 239, value, 36, index === 3 ? '#146c51' : '#16253c', 700));
  });
  parts.push(rect(48, 285, 864, 367));
  parts.push(text(72, 324, copy.stages, 25, '#16253c', 700));
  parts.push(text(888, 324, copy.sum, 18, '#2563eb', 600, 'text-anchor="end"'));
  data.stages.forEach((stage, index) => {
    const y = 372 + index * 51;
    parts.push(`<circle cx="85" cy="${y - 6}" r="13" fill="#edf3ff"/>`);
    parts.push(text(85, y, index + 1, 17, '#2563eb', 600, 'text-anchor="middle"'));
    parts.push(text(109, y, stage[lang], 20, '#263a56', 500));
    parts.push(rect(297, y - 21, 478, 22, '#eef3fb', 7, 'none'));
    parts.push(rect(297, y - 21, +(478 * stage.seconds / max).toFixed(2), 22, index === 1 ? '#2563eb' : '#7a9eed', 7, 'none'));
    parts.push(text(886, y, stage.seconds + ' s', 22, '#263a56', 600, 'text-anchor="end"'));
  });
  parts.push(text(72, 631, copy.note, 17));
  parts.push(rect(48, 672, 864, 132, '#edf3ff', 16, '#d9e5ff'));
  parts.push(text(72, 706, copy.outcome, 18, '#3c5682', 600));
  parts.push(text(72, 762, 'HOLD', 43, '#1d4ed8', 700));
  parts.push(text(261, 718, copy.result, 24, '#16253c', 700));
  parts.push(text(261, 751, copy.trade, 20, '#3c5682'));
  parts.push(text(261, 782, 'submit=false', 17, '#3c5682'));
  parts.push(text(888, 751, copy.pending, 17, '#3c5682', 500, 'text-anchor="end"'));
  parts.push(text(48, 850, copy.evidence, 25, '#16253c', 700));
  data.stocks.forEach((stock, index) => {
    const x = 48 + index % 2 * 440, y = 870 + Math.floor(index / 2) * 80;
    parts.push(rect(x, y, 424, 72, '#f7f9fd', 10, 'none'));
    parts.push(text(x + 15, y + 29, stock.code, 22, '#16253c', 700));
    parts.push(text(x + 15, y + 57, stock.action, 14, '#2563eb', 600));
    stock[lang].forEach((line, lineIndex) => parts.push(text(x + 112, y + 26 + lineIndex * 30, line, zh ? 18 : 15)));
  });
  parts.push(text(48, 1043, copy.footer, 16));
  parts.push('</g></svg>\n');
  return parts.join('\n');
}

let failed = false;
for (const lang of ['zh', 'en']) {
  const path = fileURLToPath(new URL('../docs/assets/hk-case-study.' + lang + '.svg', import.meta.url));
  const svg = figure(lang);
  if (process.argv.includes('--check')) {
    if (!existsSync(path) || readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== svg) {
      console.error('Case-study visual is stale: ' + path);
      failed = true;
    }
  } else writeFileSync(path, svg);
}
if (failed) process.exitCode = 1;
else console.log(process.argv.includes('--check') ? 'Case-study visuals are current (zh/en)' : 'Generated case-study visuals (zh/en)');
