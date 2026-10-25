import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'dsh-product-shell');
const read = path => readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const core = read(join(root,'src/motion-core.js')).replace(/^export /gm,'');
const hooks = read(join(root,'src/client-motion.js'));
const css = read(join(root,'src/motion.css'));
const block = `/* PRODUCT_MOTION:START */\n${core}\n${hooks}\nconst motionCss = ${JSON.stringify(css)};\n/* PRODUCT_MOTION:END */`;
const path = join(root,'lib/client.js'), before = readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const start = before.indexOf('/* PRODUCT_MOTION:START */'), end = before.indexOf('/* PRODUCT_MOTION:END */');
const after = start < 0 ? before.replace('/* I18N:START */',block+'\n/* I18N:START */') : before.slice(0,start)+block+before.slice(end+'/* PRODUCT_MOTION:END */'.length);
if (after === before && start < 0) throw new Error('Product client insertion marker not found');
if (process.argv.includes('--check')) { if (after !== before) throw new Error('Product motion sources need regeneration'); }
else writeFileSync(path,after,'utf8');
console.log('Product motion sources verified');
