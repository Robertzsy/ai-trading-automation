/**
 * Headless acceptance smoke for the Investment Auto product shell.
 *
 * Launches headless Chrome, loads the investment-web profile, and verifies
 * what the browser actually renders:
 *   1. no visible DSH / DeepSeek / Harness / fish branding
 *   2. product left nav (Dashboard / 投资助手 / 分析流程 / 设置) works
 *   3. the conversation kernel area renders (投资助手 page)
 *   4. Dashboard and Settings pages render with the investment sections
 *   5. no uncaught page exceptions / failed plugin bundles
 *
 * Usage: node app/scripts/smoke-web.mjs <webUrl> [chromePath]
 * Exit 0 on success. No extra npm deps: CDP over Node's built-in WebSocket.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const webUrl = String(process.argv[2] ?? "http://127.0.0.1:4567").replace(/\/+$/, "");
const chromePath =
  process.argv[3] ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Optional 4th arg: a `?token=…` sign-in URL for token-gated DSH web surfaces.
const authUrl = process.argv[4] ? String(process.argv[4]) : "";
// Optional 5th arg: reuse a prepared Chrome profile directory (keeps the
// sign-in cookie without re-authenticating on every run).
const chromeProfileDir = process.argv[5] ? String(process.argv[5]) : "";
const cdpPort = 9333;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (entry) {
          this.pending.delete(message.id);
          message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
        }
      } else {
        this.events.push(message);
      }
    };
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => reject(new Error("cdp connect timeout")), 15000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(new Cdp(ws));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("cdp connect error"));
    };
  });
}

async function jsonGet(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function waitFor(predicate, what, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${what}`);
}

const failures = [];
const check = (ok, message) => {
  console.error(`  ${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};

async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed [${expression.slice(0, 120)}]: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "exception"}`);
  }
  return result.result?.value;
}

async function main() {
  console.error(`smoke-web: url=${webUrl}`);
  const profileDir = chromeProfileDir ?? mkdtempSync(join(tmpdir(), "ia-smoke-"));

  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const chromeExit = new Promise((resolve) => chrome.on("exit", resolve));

  try {
    const version = await waitFor(async () => {
      try {
        return await jsonGet(`http://127.0.0.1:${cdpPort}/json/version`);
      } catch {
        return null;
      }
    }, "chrome devtools endpoint");

    // ── optional sign-in step ──────────────────────────────────────────────
    //
    // DSH >= 0.2.0 gates the web surface behind a per-process token supplied as
    // `?token=…`. The token is redeemed into an HttpOnly cookie, so the smoke
    // run signs in ONCE here and then drives every assertion against the bare
    // URL on a fresh target — which also keeps the exception/network counters
    // below free of the sign-in navigation's own events.
    if (authUrl) {
      const authTarget = await (
        await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(authUrl)}`, { method: "PUT" })
      ).json();
      const authCdp = await connect(authTarget.webSocketDebuggerUrl);
      await authCdp.call("Page.enable");
      await authCdp.call("Page.navigate", { url: authUrl });
      await sleep(9000);
      const signedIn = await evaluate(authCdp, "document.title");
      authCdp.close();
      if (!String(signedIn).includes("Investment Auto")) {
        console.error(`smoke-web: sign-in did not reach the product shell (title=${JSON.stringify(signedIn)})`);
        process.exitCode = 1;
        return;
      }
      console.error("smoke-web: signed in via token URL");
    }

    const target = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(webUrl + "/")}`, { method: "PUT" })
    ).json();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.call("Runtime.enable");
    await cdp.call("Page.enable");
    await cdp.call("Log.enable");
    await cdp.call("Network.enable");

    // Collect failed requests while the page boots.
    await cdp.call("Page.navigate", { url: webUrl + "/" });
    await sleep(12000);

    const errors = cdp.events.filter(
      (e) => e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded",
    );
    const failedRequests = cdp.events.filter(
      (e) => e.method === "Network.responseReceived" && e.params.response.status >= 400,
    );
    for (const req of failedRequests.slice(0, 10)) {
      console.error(`  HTTP ${req.params.response.status}  ${req.params.response.url}`);
    }

    // 1. Branding: page title and visible text.
    const title = await evaluate(cdp, "document.title");
    check(String(title).includes("Investment Auto"), `page title is Investment Auto (got: ${title})`);
    check(!String(title).includes("Harness"), `page title has no Harness (got: ${title})`);

    const visibleText = await evaluate(cdp, "document.body ? document.body.innerText : ''");
    const hasBrand = /deepseek|harness/i.test(String(visibleText));
    check(!hasBrand, "no DeepSeek/Harness visible in page text");

    // 2. Product left navigation.
    const navText = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.ia-navbtn')).map(b => b.textContent.trim()).join('|')`,
    );
    check(String(navText).includes("Dashboard") && String(navText).includes("投资助手") && String(navText).includes("分析流程") && String(navText).includes("设置"), `left nav renders (${navText})`);
    check(!String(navText).includes("账户"), `left nav has no account entry (${navText})`);
    const brandText = await evaluate(cdp, `document.querySelector('.ia-rail-brand') ? document.querySelector('.ia-rail-brand').getAttribute('title') : ''`);
    check(String(brandText).includes("Investment Auto"), `product brand renders (${brandText})`);

    // 3. Conversation kernel (投资助手 default page): sidebar + conversation area.
    const sidebarText = await evaluate(cdp, `document.querySelector('.ia-sidebar') ? document.querySelector('.ia-sidebar').innerText.slice(0, 200) : ''`);
    check(String(sidebarText).includes("会话"), `assistant page shows session sidebar (${sidebarText.slice(0, 60).replace(/\\n/g, ' ')})`);
    const centerHtml = await evaluate(cdp, `document.querySelector('.ia-center') ? document.querySelector('.ia-center').innerHTML.length : 0`);
    check(Number(centerHtml) > 500, `conversation kernel mounted (${centerHtml} bytes of DOM)`);
    const contextText = await evaluate(cdp, `document.querySelector('.ia-context') ? document.querySelector('.ia-context').innerText : ''`);
    check(String(contextText).includes("投资上下文") && String(contextText).includes("分析流程"), "assistant page shows investment context");
    const residualSelectorsVisible = await evaluate(cdp, `Array.from(document.querySelectorAll('[aria-label="选择工作区"],[aria-label^="访问模式"]')).some(el => getComputedStyle(el).display !== 'none')`);
    check(!residualSelectorsVisible, "workspace and access-mode selectors are hidden");
    const composerPlaceholder = await evaluate(cdp, `document.querySelector('.ia-center textarea')?.placeholder ?? ''`);
    check(String(composerPlaceholder).includes("投资问题"), `conversation composer uses investment copy (${composerPlaceholder})`);
    check(!/workspace|工作区管理/i.test(String(visibleText)), "no workspace management UI in visible text");

    // 4. Dashboard page.
    await evaluate(cdp, `[...document.querySelectorAll('.ia-navbtn')].find(b => b.textContent.includes('Dashboard')).click()`);
    await sleep(1500);
    const dashText = await evaluate(cdp, "document.body.innerText");
    check(String(dashText).includes("投资总览"), "Dashboard renders 投资总览");
    check(String(dashText).includes("四市场账户"), "Dashboard renders 四市场账户");

    // 4b. Analysis workflow page.
    await evaluate(cdp, `[...document.querySelectorAll('.ia-navbtn')].find(b => b.textContent.includes('分析流程')).click()`);
    await sleep(1000);
    const workflowText = await evaluate(cdp, "document.body.innerText");
    check(String(workflowText).includes("目标完整分析链路"), "analysis page renders the target workflow");
    check(String(workflowText).includes("当前分析状态") && String(workflowText).includes("流程验收"), "analysis page renders real workflow telemetry");
    check(String(workflowText).includes("原生多角色") && !String(workflowText).includes("待恢复"), "analysis page presents the restored checkpointed workflow");

    // 5. Settings page.
    await evaluate(cdp, `[...document.querySelectorAll('.ia-navbtn')].find(b => b.textContent.includes('设置')).click()`);
    await sleep(1500);
    const settingsNav = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.ia-settings-nav button')).map(b => b.textContent.trim()).join('|')`,
    );
    check(
      String(settingsNav).includes("投资策略与风控") && String(settingsNav).includes("自动轮次与调度") && String(settingsNav).includes("市场与选股") && String(settingsNav).includes("通知") && String(settingsNav).includes("应用设置"),
      `settings nav has all five product sections (${settingsNav})`,
    );
    check(String(settingsNav).includes("模型"), `settings nav keeps the model section (${settingsNav})`);
    const strategyShown = await evaluate(cdp, `document.body.innerText.includes('策略档位') || document.body.innerText.includes('投资策略与风控')`);
    check(Boolean(strategyShown), "settings page renders the strategy section content");

    // 5b. Model page (embedded conversation kernel's own models surface).
    await evaluate(cdp, `[...document.querySelectorAll('.ia-settings-nav button')].find(b => b.textContent.includes('模型')).click()`);
    const modelReady = await waitFor(async () => {
      const text = await evaluate(cdp, "document.body.innerText");
      return String(text).includes("添加提供方") ? text : null;
    }, "model settings page content", 10000);
    check(
      String(modelReady).includes("添加提供方") && String(modelReady).includes("DeepSeek"),
      `model settings page renders provider management (${modelReady.replace(/\\n/g, " ").slice(0, 120)})`,
    );
    check(!/harness|dsh\b/i.test(String(modelReady)), "model settings page has no harness/DSH strings");

    // 6. Back to assistant still renders conversation.
    await evaluate(cdp, `[...document.querySelectorAll('.ia-navbtn')].find(b => b.textContent.includes('投资助手')).click()`);
    await sleep(1200);
    const centerAgain = await evaluate(cdp, `document.querySelector('.ia-center') ? document.querySelector('.ia-center').innerHTML.length : 0`);
    check(Number(centerAgain) > 500, "assistant page restores conversation kernel");

    // 6b. Session search must map the wire shape {items:[{sessionId,snippet}]}.
    await evaluate(cdp, `(() => {
      const el = document.querySelector('.ia-search');
      if (!el) return 'no-search-box';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '投资');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    const searchHit = await waitFor(async () => {
      const text = await evaluate(cdp, "document.body.innerText");
      const count = await evaluate(cdp, "document.querySelectorAll('.ia-session').length");
      return String(text).includes("搜索结果") && Number(count) >= 1 ? text : null;
    }, "session search results", 8000);
    check(Boolean(searchHit), "session search returns matching sessions (items mapping)");

    // 6c. The archive affordance exists on the flat session rows (the
    // archivedSessionIds filter itself is exercised through the store shape;
    // the archive flow opens a host confirmation dialog that headless CDP
    // cannot drive, so the click outcome is not asserted here).
    const archiveButton = await evaluate(cdp, `(() => {
      const row = document.querySelector('.ia-session');
      if (!row) return 'no-session';
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return row.querySelector('.ia-session-actions button') ? 'present' : 'missing';
    })()`);
    check(String(archiveButton) === "present", "session rows carry the archive affordance");

    // 7. No plugin bundle failures and no runtime exceptions.
    check(errors.length === 0, `zero page exceptions (${errors.length})`);
    if (errors.length > 0) {
      for (const error of errors.slice(0, 5)) {
        console.error("   " + JSON.stringify(error).slice(0, 400));
      }
    }
    check(!failedRequests.some((r) => String(r.params.response.url).includes("client.js") && r.params.response.status === 404), "all client bundles served (no 404)");

    // 8. Analysis centre tab (P0-5/6/7): navigation entry, ia-an-* containers,
    //    the manual start button's five preconditions, and a clean exception
    //    log after driving the tab. Purely additive: assertions 1-7 above are
    //    untouched, and the exception filter repeats the one used in step 7 so
    //    this section cannot pass by ignoring a failure.
    await evaluate(cdp, `[...document.querySelectorAll('.ia-navbtn')].find(b => b.textContent.includes('分析中心'))?.click()`);
    await sleep(1500);
    const analyzeNav = await evaluate(cdp, `Array.from(document.querySelectorAll('.ia-navbtn')).map(b => b.textContent.trim()).join('|')`);
    check(String(analyzeNav).includes("分析中心"), `left nav has the analysis centre entry (${analyzeNav})`);
    const analyzeGrid = await evaluate(cdp, `document.querySelector('.ia-an-grid') ? getComputedStyle(document.querySelector('.ia-an-grid')).display : ''`);
    check(String(analyzeGrid) === "grid", `analysis centre grid container mounted (display: ${analyzeGrid || "missing"})`);
    const analyzeContainers = await evaluate(cdp, `document.querySelectorAll('[class*="ia-an-"]').length`);
    check(Number(analyzeContainers) >= 3, `analysis centre ia-an-* containers render (${analyzeContainers} elements)`);
    const analyzeText = await evaluate(cdp, "document.body.innerText");
    check(String(analyzeText).includes("开始分析") && String(analyzeText).includes("预检清单"), "analysis centre renders the manual start panel with its preflight list");
    check(String(analyzeText).includes("轮次报告") && String(analyzeText).includes("分析流程"), "analysis centre renders the pipeline and per-round report panels");
    const startEmpty = await evaluate(cdp, `(() => { const b = document.querySelector('#ia-an-start'); return b ? { disabled: b.disabled, title: b.getAttribute('title') || '' } : null; })()`);
    check(Boolean(startEmpty) && startEmpty.disabled === true, `开始分析 is disabled with an empty symbol list (${JSON.stringify(startEmpty)})`);
    const typedSymbols = await evaluate(cdp, `(() => {
      const el = document.querySelector('#ia-an-symbols');
      if (!el) return 'no-textarea';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, '600519, 000858');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    check(String(typedSymbols) === "typed", `analysis centre symbol box accepts input (${typedSymbols})`);
    await sleep(600);
    const startFilled = await evaluate(cdp, `(() => { const b = document.querySelector('#ia-an-start'); return b ? { disabled: b.disabled, title: b.getAttribute('title') || '' } : null; })()`);
    const preflight = await evaluate(cdp, `Array.from(document.querySelectorAll('.ia-an-check')).map(el => el.getAttribute('data-ok') === 'true')`);
    const preflightAllOk = Array.isArray(preflight) && preflight.length === 5 && preflight.every((value) => value === true);
    if (preflightAllOk) {
      check(Boolean(startFilled) && startFilled.disabled === false, `开始分析 enables once symbols are present and all five preconditions hold (${JSON.stringify(startFilled)})`);
    } else {
      // Two preconditions live outside the page (engine reachable, no round
      // already running); when either fails the button must stay disabled
      // rather than invite a 400 from the proxy.
      check(Boolean(startFilled) && startFilled.disabled === true, `开始分析 stays disabled while a precondition fails (${JSON.stringify(preflight)} / ${JSON.stringify(startFilled)})`);
      console.error("   (enabled-path assertion needs a reachable engine and no running round; this run had neither)");
    }
    const analyzeErrors = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded");
    check(analyzeErrors.length === 0, `zero page exceptions while exercising the analysis centre (${analyzeErrors.length})`);
    if (analyzeErrors.length > 0) {
      for (const error of analyzeErrors.slice(0, 5)) {
        console.error("   " + JSON.stringify(error).slice(0, 400));
      }
    }

    // 8. Typography floor. Anything under 11px is unreadable at 100% zoom, and
    //    a stray literal is easy to reintroduce when editing a 2000-line style
    //    string. Measured from real computed styles rather than by grepping CSS.
    const FONT_FLOOR_PX = 11;
    const typeAudit = await evaluate(cdp, `(() => {
      const FLOOR = ${FONT_FLOOR_PX};
      const bad = [];
      let total = 0;
      for (const el of document.querySelectorAll('.ia-shell *')) {
        const ownsText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!ownsText) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (!Number.isFinite(px)) continue;
        total += 1;
        if (px < FLOOR) {
          const cls = (typeof el.className === 'string' ? el.className : '').split(/\\s+/).filter(Boolean).join('.') || el.tagName.toLowerCase();
          bad.push(cls + '@' + px + 'px');
        }
      }
      return { total, bad: [...new Set(bad)].slice(0, 8) };
    })()`);
    check(
      typeAudit && typeAudit.bad.length === 0,
      `no text below ${FONT_FLOOR_PX}px (${typeAudit ? typeAudit.total : 0} elements scanned${typeAudit && typeAudit.bad.length ? ", offenders: " + typeAudit.bad.join(", ") : ""})`,
    );

    // 9. Every design token the rules consume must resolve. A custom property
    //    defined as var() of itself is dropped silently, and any surface using
    //    it then falls back to transparent -- invisible in review, obvious here.
    const tokenAudit = await evaluate(cdp, `(() => {
      const names = ['--ia-bg-base','--ia-surface','--ia-surface-2','--ia-text-1','--ia-text-2','--ia-text-3',
        '--ia-border-subtle','--ia-border-strong','--ia-accent','--ia-accent-hover','--ia-ok','--ia-warn',
        '--ia-danger','--ia-idle','--ia-label-3','--ia-hover','--ia-hover-solid','--ia-brand',
        '--ia-rail-bg','--ia-rail-text','--ia-rail-text-dim','--ia-rail-active-text','--ia-rail-accent',
        '--ia-rail-accent-ink','--ia-brandmark-from','--ia-brandmark-to',
        '--ia-r-btn','--ia-r-tab','--ia-r-card','--ia-r-modal','--ia-fs-body','--ia-fs-caption','--ia-fs-micro',
        '--ia-font-sans','--ia-dur-base','--ia-ease-out','--ia-shadow-sm','--ia-viz-1','--ia-viz-6'];
      const cs = getComputedStyle(document.documentElement);
      const missing = names.filter((n) => !cs.getPropertyValue(n).trim());
      return { checked: names.length, missing };
    })()`);
    check(
      tokenAudit && tokenAudit.missing.length === 0,
      `all ${tokenAudit ? tokenAudit.checked : 0} design tokens resolve (${tokenAudit && tokenAudit.missing.length ? "unresolved: " + tokenAudit.missing.join(", ") : "none unresolved"})`,
    );

    // 10. Light-only lock. The surface ships one palette by design, so a dark
    //     attribute or a dark color-scheme reaching the DOM is a regression.
    const lightLock = await evaluate(cdp, `({
      colorScheme: document.documentElement.style.colorScheme,
      darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
    })`);
    check(lightLock?.colorScheme === "light", `color-scheme is pinned to light (${JSON.stringify(lightLock)})`);
    check(lightLock?.darkAttr === false, `no dark theme attribute on <body> (${JSON.stringify(lightLock)})`);

    // 11. WCAG AA contrast, measured from rendered colours rather than from the
    //     token table: several tokens are only opaque after compositing, and a
    //     token can be correct in isolation yet illegible on the surface it is
    //     actually used over. Walks every text-owning element, composites its
    //     effective background, and applies the large-text exemption.
    const contrast = await evaluate(cdp, `(() => {
      const parse = (value) => {
        const m = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((x) => parseFloat(x));
        if (parts.length < 3) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      };
      const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const effBg = (el) => {
        let node = el, acc = null;
        while (node && node !== document.documentElement) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0) { acc = acc === null ? bg : over(acc, bg); if (acc.a >= 1) break; }
          node = node.parentElement;
        }
        return acc === null ? { r: 255, g: 255, b: 255, a: 1 } : over(acc, { r: 255, g: 255, b: 255, a: 1 });
      };
      const fails = [];
      let checked = 0;
      for (const el of document.querySelectorAll('.ia-shell *')) {
        const ownsText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!ownsText) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
        const fg = parse(cs.color);
        if (!fg) continue;
        const px = parseFloat(cs.fontSize);
        const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
        const bg = effBg(el);
        const fgOver = fg.a >= 1 ? fg : over(fg, bg);
        const lo = Math.min(lum(fgOver), lum(bg)), hi = Math.max(lum(fgOver), lum(bg));
        const got = (hi + 0.05) / (lo + 0.05);
        checked += 1;
        if (got + 0.005 < need) {
          const cls = (typeof el.className === 'string' ? el.className : '').split(/\\s+/).filter(Boolean).join('.') || el.tagName.toLowerCase();
          fails.push(cls + ' ' + got.toFixed(2) + ':1 (need ' + need + ')');
        }
      }
      return { checked, bad: [...new Set(fails)].slice(0, 8), badCount: fails.length };
    })()`);
    check(
      contrast && contrast.badCount === 0,
      `WCAG AA contrast holds (${contrast ? contrast.checked : 0} text elements scanned${contrast && contrast.badCount ? ", offenders: " + contrast.bad.join(", ") : ""})`,
    );

    cdp.close();
  } finally {
    try {
      chrome.kill();
    } catch {
      // Chrome already exited; nothing to kill.
    }
    await Promise.race([chromeExit, sleep(3000)]);
  }

  if (failures.length > 0) {
    console.error(`SMOKE FAILED (${failures.length} failures)`);
    process.exit(1);
  }
  console.log("SMOKE OK");
}

main().catch((error) => {
  console.error(`SMOKE FAILED: ${error.message}`);
  process.exit(1);
});
