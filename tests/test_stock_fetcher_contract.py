"""Contract tests for the bundled Node stock fetcher."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "stock-fetcher.js"


def _detect(value: str) -> dict | None:
    js = (
        f"const {{detectMarket}} = require({json.dumps(str(SCRIPT))});"
        f"console.log(JSON.stringify(detectMarket({json.dumps(value)})));"
    )
    proc = subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True)
    return json.loads(proc.stdout)


def test_bare_five_digit_code_is_hong_kong():
    assert _detect("00700") == {"market": "hk", "code": "00700"}


def test_existing_market_formats_still_work():
    assert _detect("600519") == {"market": "cn", "code": "sh600519"}
    assert _detect("hk00700") == {"market": "hk", "code": "00700"}
    assert _detect("AAPL") == {"market": "us", "code": "AAPL"}


def test_us_history_recovers_wrong_exchange_and_share_class_suffix():
    js = """
const assert = require('node:assert/strict');
const {getTencentHistory, tencentHistoryCodes} = require(process.argv[1]);
const calls = [];
const loader = async url => {
  const code = new URL(url).searchParams.get('param').split(',')[0]; calls.push(code);
  const count = code.endsWith('.N') ? 60 : 1;
  return JSON.stringify({code:0,data:{[code]:{qfqday:Array.from({length:count},(_,i)=>['2026-01-'+i,1,2,3,1,100])}}});
};
(async () => {
  assert.equal((await getTencentHistory('us','LLY','day',1023,'qfq',loader)).count,60);
  assert.deepEqual(calls,['usLLY.OQ','usLLY.N']);
  assert.equal(tencentHistoryCodes('us','BRK.B')[0],'usBRK.B.OQ');
  assert.deepEqual(tencentHistoryCodes('us','LLY.N'),['usLLY.N']);
  calls.length=0;
  const bad = async url => JSON.stringify({code:0,data:{wrong:{qfqday:Array(60).fill(['x',1,2,3,1,100])}}});
  assert.equal((await getTencentHistory('us','LLY','day',1023,'qfq',bad)).count,0);
})();
"""
    subprocess.run(["node", "-e", js, str(SCRIPT)], check=True, capture_output=True, text=True)


def test_history_command_does_not_silently_truncate_to_sixty_rows():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "const recent60 = allData.slice(-60);" not in source
    assert "const requestedLimit = Number.parseInt(option, 10);" in source
    assert "data: historyData" in source


def test_watchlist_is_stored_under_project_runtime():
    source = SCRIPT.read_text(encoding="utf-8")
    assert 'path.join(__dirname, "..", "runtime", "data", "watchlist.json")' in source
    assert "fs.mkdirSync(path.dirname(WATCHLIST_FILE), { recursive: true })" in source


def test_market_list_defaults_to_full_market_and_sina_is_paginated():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "async function getSinaMarketPage" in source
    assert "for (let page = 1; page <= 100; page += 1)" in source
    assert "batch.length === 0 || added === 0" in source
    assert 'scope: boundedLimit > 0 ? "bounded" : "full-market"' in source
    assert "option === undefined ? 0 : Number(option)" in source
    assert '"--retry", "2"' in source
