/** Locale context is per invocation, so concurrent chats never share a language. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
const locale = new AsyncLocalStorage();
const copy = JSON.parse(readFileSync(new URL('./messages.json',import.meta.url),'utf8'));
export const languageForContext = ctx => {
  const configured = process.env.ATA_OUTPUT_LANGUAGE ?? ctx.get?.('settings')?.describe({redactSecrets:true}).find(row=>row.ns==='locale')?.value?.preference;
  return configured === 'en' ? 'en' : 'zh';
};
export const withLanguage = (language, action) => locale.run({language:language === 'en' ? 'en' : 'zh'},action);
export const currentLanguage = () => locale.getStore()?.language ?? (process.env.ATA_OUTPUT_LANGUAGE === 'en' ? 'en' : 'zh');
export const message = (key, params={}) => {
  if(!copy[key])throw new Error('Missing product copy: '+key);
  return copy[key][currentLanguage()].replace(/\{([A-Za-z0-9_]+)\}/g,(_,name)=>String(params[name]??'{'+name+'}'));
};

export const setInvocationLanguage = language => { const state=locale.getStore(); if(state)state.language=language==='en'?'en':'zh'; };
