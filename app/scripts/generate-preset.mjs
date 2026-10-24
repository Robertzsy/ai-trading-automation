/** Embed the maintained investment composition as a DSH declarative preset. */
import { readFileSync, writeFileSync } from 'node:fs';
const app = new URL('../', import.meta.url);
const source = readFileSync(new URL('presets/investment/agent.cordis.yml', app), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const path = new URL('profiles/investment-web/product/cordis.patch.yml', app);
const before = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const marker = '# INVESTMENT_PRESET:START';
const base = before.split(marker)[0].trimEnd();
const generated = `${base}\n\n${marker}\n- insert:\n    - id: preset-investment\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: investment\n        name: Investment Assistant\n        description: Multi-market investment research and paper trading\n        plugins:\n${source.split('\n').map(line => line ? '          ' + line : '').join('\n')}\n# INVESTMENT_PRESET:END\n`;
if (process.argv.includes('--check')) {
  if (before !== generated) { console.error('Investment preset is stale'); process.exitCode = 1; }
} else writeFileSync(path, generated, 'utf8');
