// The DSH client loader has no bundler. Splice the maintainable chart source
// into its existing factory, like the icon and Markdown generators.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = join(root, 'lib/client.js');
const before = readFileSync(clientPath, 'utf8');
const newline = before.includes('\r\n') ? '\r\n' : '\n';
const start = '/* DASHBOARD:START */';
const end = '/* DASHBOARD:END */';
const css = readFileSync(join(root, 'src/dashboard.css'), 'utf8').replace(/\r\n/g, '\n');
const source = readFileSync(join(root, 'src/dashboard.js'), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const block = '\t\t' + start + '\n' + source.split('\n').map(line=>line?'\t\t'+line:'').join('\n') +
  '\n\t\tinjectSheet(CSS_ID + "/dashboard", ' + JSON.stringify(css) + ');\n\t\t' + end;
const from = before.indexOf('\t\t' + start);
const to = before.indexOf(end);
if (from < 0 || to < from) throw new Error('Dashboard markers missing');
const after = before.slice(0,from) + block.replace(/\n/g,newline) + before.slice(to + end.length);
if (process.argv.includes('--check')) {
  if (before !== after) {console.error('Dashboard is stale: run generate-dashboard.mjs'); process.exitCode = 1;}
  else console.log('Generated Dashboard is current');
} else {
  writeFileSync(clientPath,after,'utf8');
  console.log('Generated Dashboard');
}
