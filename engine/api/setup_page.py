"""Owned bilingual first-run page. Language changes preserve the import form."""
import json
from pathlib import Path
from engine.localization import ui_language
from engine.version import __version__

_TEMPLATE = r'''<!doctype html>
<html lang="__LANG__"><head><meta charset="utf-8"><title>AI Trading Automation</title>
<style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; background: #0f1420; color: #e8ecf4;
         display: flex; justify-content: center; padding: 40px 16px; margin: 0; }
  .card { width: 640px; max-width: 100%; background: #171d2b; border: 1px solid #2a3350;
          border-radius: 14px; padding: 32px; box-shadow: 0 8px 40px rgba(0,0,0,.45); }
  h1 { margin: 0 0 6px; font-size: 24px; }
  h1 .v2 { color: #4cc2ff; }
  p.sub { color: #9aa7c7; margin: 0 0 24px; font-size: 14px; }
  label { display: block; font-size: 13px; color: #b8c3e0; margin: 16px 0 6px; }
  input[type=text] { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
         border: 1px solid #2a3350; background: #0f1420; color: #e8ecf4; font-size: 14px; }
  .hint { color: #6f7d9f; font-size: 12px; margin-top: 6px; }
  button { margin-top: 24px; width: 100%; padding: 12px; border: 0; border-radius: 8px;
         background: #2f6fed; color: #fff; font-size: 15px; cursor: pointer; }
  button:disabled { background: #33405c; cursor: wait; }
  .status { margin-top: 16px; font-size: 13px; min-height: 20px; }
  .status.ok { color: #4cd98a; }
  .status.err { color: #ff7b7b; }
  ul { color: #9aa7c7; font-size: 13px; padding-left: 18px; line-height: 1.8; }
  code { background: #0d1220; padding: 2px 6px; border-radius: 4px; color: #7fd4ff; }
</style></head><body><div class="card">
<h1>AI Trading Automation <span class="v2">__VERSION__</span></h1>
<label for="setup-language">简体中文 / English</label>
<select id="setup-language"><option value="zh">简体中文</option><option value="en">English</option></select>
<p class="sub" data-i18n="subtitle"></p>
<ul><li data-i18n="accounts"></li><li data-i18n="import"></li><li data-i18n="models"></li><li data-i18n="boundary"></li></ul>
<label for="importFrom" data-i18n="directory"></label>
<input type="text" id="importFrom" placeholder="C:\path\to\legacy-data">
<div class="hint" data-i18n="hint"></div>
<button id="finish" data-i18n="finish"></button><div class="status" id="status" role="status"></div>
</div><script>
const copy=__COPY__, suggested=__SUGGESTED__;
let language=__INITIAL__;
const headers={"Content-Type":"application/json"};
const token=new URLSearchParams(location.search).get("token");if(token)headers["X-ATA-Token"]=token;
const t=key=>copy[key][language];
const select=document.getElementById('setup-language');
const status=(text,ok)=>{const el=document.getElementById('status');el.textContent=text;el.className='status '+(ok?'ok':'err');};
function render(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title='AI Trading Automation — '+t('title');select.value=language;
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
 window.__DSH_LOCALE__?.onChange(language);
}
select.addEventListener('change',async()=>{
 const previous=language;language=select.value;
 try{const response=await fetch('/api/locale',{method:'POST',headers,body:JSON.stringify({language})});if(!response.ok)throw Error();render();status('',true);}
 catch{language=previous;render();status(t('languageFailed'),false);}
});
document.getElementById('importFrom').value=suggested;
document.getElementById('finish').addEventListener('click',async()=>{
 const button=document.getElementById('finish');button.disabled=true;status(t('starting'),true);
 try{
  const response=await fetch('/api/setup/complete',{method:'POST',headers,body:JSON.stringify({import_from:document.getElementById('importFrom').value.trim()})});
  const payload=await response.json();if(!response.ok)throw Error(payload.error||'HTTP '+response.status);
  status(t('complete'),true);setTimeout(()=>location.reload(),3000);
 }catch(error){status(t('failed')+error.message,false);button.disabled=false;}
});
render();
</script></body></html>'''


def render_setup_page(*, suggested: str = "", language: str | None = None) -> str:
    language = language or ui_language()
    if language not in {"zh", "en"}:
        raise ValueError("unsupported language")
    copy = (Path(__file__).parents[1] / "locales/setup.json").read_text(encoding="utf-8")
    # Escape '<' before embedding data in a script; a path is never HTML.
    return (_TEMPLATE.replace("__COPY__",copy.replace("<", "\\u003c"))
            .replace("__SUGGESTED__",json.dumps(suggested).replace("<", "\\u003c"))
            .replace("__INITIAL__",json.dumps(language)).replace("__LANG__",language)
            .replace("__VERSION__",__version__))


# Retain the old import for consumers; the HTTP route uses the live renderer.
SETUP_PAGE_HTML = render_setup_page(language="zh")
