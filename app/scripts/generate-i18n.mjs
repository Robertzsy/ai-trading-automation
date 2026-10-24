// Embed owned dictionaries in script-style clients; no browser fetch is needed.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const app=join(dirname(fileURLToPath(import.meta.url)),'..');
const copy=JSON.parse(readFileSync(join(app,'locales/product.json'),'utf8'));
for(const [key,row]of Object.entries(copy)){
 if(typeof row.zh!=='string'||typeof row.en!=='string'||!row.en.trim())throw Error('Missing translation: '+key);
 const slots=s=>[...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m=>m[1]).sort().join(',');
 if(slots(row.zh)!==slots(row.en))throw Error('Interpolation mismatch: '+key);
}
const dicts=Object.fromEntries(['zh','en'].map(locale=>[locale,Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,v[locale]]))]));
for(const plugin of ['dsh-product-shell','dsh-investment-ui']){
 const path=join(app,'plugins',plugin,'lib/client.js');
 const before=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
 const start='/* I18N:START */',end='/* I18N:END */';
 const block=`${start}
const PRODUCT_COPY = ${JSON.stringify(dicts)};
const COPY_NS = ${JSON.stringify(plugin)};
let productLocale;
const tr = (key, params = {}) => {
  const value = productLocale ? productLocale.bind(COPY_NS)(key,params) : PRODUCT_COPY.zh[key];
  if (value === undefined) throw new Error('Missing product translation: '+key);
  return String(value).replace(/\\{([A-Za-z0-9_]+)\\}/g, (_,name)=>String(params[name]??'{'+name+'}'));
};
const localeTag = () => productLocale?.getSnapshot().active === 'en' ? 'en-US' : 'zh-CN';
const fallbackLocaleSnapshot = Object.freeze({active:'zh',revision:0});
function useProductLocale() {
  return react.useSyncExternalStore(listener=>productLocale?.subscribe(listener)??(()=>{}),()=>productLocale?.getSnapshot()??fallbackLocaleSnapshot);
}
function installProductLocale(ctx) {
  productLocale = ctx.locale;
  ctx.effect(()=>ctx.locale.register(COPY_NS,PRODUCT_COPY),'product bilingual dictionaries');
}
const strategyName = (mandate={}) => ({conservative:tr("ui.conservative"),neutral:tr("ui.neutral"),aggressive:tr("ui.aggressive")})[mandate.profile] ?? mandate.display_name ?? mandate.profile ?? "—";
const localized = Component => function Localized(props) { useProductLocale(); return react.createElement(Component,props); };
${end}`;
 const from=before.indexOf(start),to=before.indexOf(end);
 const after=from<0?before.replace(/(let react = require\("react"\);)/,'$1\n'+block):before.slice(0,from)+block+before.slice(to+end.length);
 if(process.argv.includes('--check')){if(after!==before)throw Error(plugin+': stale translations');}else writeFileSync(path,after,'utf8');
}
console.log('Bilingual resources verified: '+Object.keys(copy).length+' keys');
