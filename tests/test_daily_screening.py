import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from engine.screening import daily_signals as daily

NOW = datetime(2026, 10, 30, 12, tzinfo=ZoneInfo("Asia/Shanghai"))


def brief(symbols=(), direction="positive"):
    return {"events": [{"event_id": "event1", "text": "", "summary": "Verified event", "source_url": "https://example.test/event",
                        "symbols": list(symbols), "sectors": [], "markets": [], "direction": direction, "importance": "high", "freshness": 1}]}


def test_daily_reserves_ten_places_before_quantitative_cutoff():
    rows = [{"symbol": str(i), "q": 100-i} for i in range(100)]
    selected = daily.preselect(rows, 60, brief(map(str, range(80,100))), "cn", lambda r:r["q"])
    assert len(selected) == 60
    assert {str(i) for i in range(50)} <= {r["symbol"] for r in selected}
    assert len([r for r in selected if int(r["symbol"]) >= 80]) == 10
    assert len({r["symbol"] for r in selected}) == 60


def test_duplicate_daily_members_free_places_for_quantitative_rows():
    rows = [{"symbol": str(i), "q": 100-i} for i in range(100)]
    selected = daily.preselect(rows, 60, brief(map(str, range(5))), "cn", lambda r:r["q"])
    assert [r["symbol"] for r in selected] == [str(i) for i in range(60)]


def test_missing_daily_keeps_quantitative_order():
    rows = [{"symbol": str(i), "q": 100-i} for i in range(100)]
    selected = daily.preselect(rows, 60, {"events":[]}, "cn", lambda r:r["q"])
    assert len(selected) == 60
    assert selected[0]["symbol"] == "0"


def test_news_moves_ranking_and_eight_is_a_total_not_plus_holdings():
    rows = [{"symbol": str(i), "score": 90-i, "potential":90-i} for i in range(30)]
    candidates, research = daily.rank_and_select(rows, brief(["12"]), "cn")
    assert len(candidates) == 20 and len(research) == 8
    assert candidates[0]["symbol"] == "12"
    assert candidates[0]["rank_change"] == 12
    negative, _ = daily.rank_and_select(rows, brief(["0"],"negative"), "cn")
    assert next(r for r in negative if r["symbol"] == "0")["rank_change"] < 0


def test_clear_score_gap_stops_at_four_and_sparse_pool_stays_sparse():
    rows = [{"symbol": str(i), "score": s, "potential":s} for i,s in enumerate([90,89,88,87,50,49,48,47])]
    assert len(daily.rank_and_select(rows, {}, "cn")[1]) == 4
    assert len(daily.rank_and_select(rows[:2], {}, "cn")[1]) == 2


def test_hybrid_uses_correlated_returns_and_leaves_short_history_unknown():
    from datetime import timedelta
    history = []
    price = 100
    for i in range(60):
        price *= 1 + (i % 7 - 3) / 1000
        history.append({"date": (NOW + timedelta(days=i)).date().isoformat(), "close": price})
    rows = [{"symbol": f"S{i}", "score": 80-i*.1, "potential": 80-i*.1} for i in range(10)]
    snapshots = {s: {"history": history} for s in ("S0", "S1")}
    _, selected = daily.rank_and_select(rows, {}, "us", snapshots=snapshots)
    assert selected[0]["symbol"] == "S0" and selected[1]["symbol"] == "S2"
    assert ("S0", "S1") not in daily.price_correlations({s:{"history":history[:20]} for s in snapshots}, ["S0", "S1"])
    assert len(selected) == 8


def test_etf_short_name_is_not_a_company_news_match():
    report = brief()
    report["events"][0]["text"] = "芯片企业收入增长"
    assert daily.signals_for({"symbol":"588000", "name":"芯片"}, report, "etf")["daily_relevance"] == 0


def test_unknown_direction_recalls_without_raising_score():
    signal = daily.signals_for({"symbol":"AAPL"}, brief(["AAPL"],"neutral"), "us")
    assert signal["daily_relevance"] > 0
    assert signal["daily_adjustment"] == 0


def test_direct_alias_and_industry_do_not_stack_for_same_event():
    report = brief()
    report["events"][0].update(text="苹果新产品", sectors=["消费电子"])
    signal = daily.signals_for({"symbol":"AAPL","aliases":["苹果"],"industry":"消费电子"},report,"us")
    assert signal["daily_adjustment"] == 15
    assert len(signal["daily_events"]) == 1


def test_daily_deduplication_future_exclusion_and_expiry(tmp_path):
    items = [{"title":"相同事件","symbols":["AAPL"],"direction":"positive","importance":"high"}]*2
    items += [{"title":"未来事件","published_at":"2030-01-01T00:00:00+08:00"}]
    (tmp_path/"2026-10-30.json").write_text(json.dumps({"news":items}),encoding="utf-8")
    report = daily.load_daily(NOW,tmp_path)
    assert len(report["events"]) == 1
    assert daily.signals_for({"symbol":"AAPL"},report,"us")["daily_adjustment"] == 15
    later = daily.load_daily(datetime(2026,11,6,tzinfo=NOW.tzinfo),tmp_path)
    assert later["status"] == "background"
    assert daily.signals_for({"symbol":"AAPL"},later,"us")["daily_adjustment"] == 0


def test_over_eight_rejected_before_creating_run(monkeypatch,tmp_path):
    from engine import analysis_runs, analysis_rounds
    monkeypatch.setattr(analysis_runs,"runtime_dir",lambda:tmp_path)
    with pytest.raises(ValueError,match="8"):
        analysis_rounds.start({"cycle_id":"too-many","market":"us","symbols":[f"T{i}" for i in range(9)]})
    assert analysis_runs.get("too-many") is None


def test_configuration_reload_cross_process_and_auto_off(monkeypatch,tmp_path):
    from engine.config import AppConfig
    from engine import scheduler
    path=tmp_path/"config.yaml"
    path.write_text("autonomous:\n  enabled: true\nschedule:\n  auto_rounds_enabled: true\n",encoding="utf-8")
    first,second=AppConfig(path),AppConfig(path)
    monkeypatch.setattr(scheduler,"cfg",second)
    assert scheduler._auto_rounds_enabled()
    path.write_text("autonomous:\n  enabled: false\nschedule:\n  auto_rounds_enabled: true\n",encoding="utf-8")
    first.reload()
    assert not scheduler._auto_rounds_enabled()


def test_mode_switch_preserves_analysis_and_execution_flags(monkeypatch,tmp_path):
    from engine.config import AppConfig
    from engine.investment import service
    path=tmp_path/"config.yaml"
    path.write_text("autonomous:\n  enabled: false\n  auto_execute: false\n",encoding="utf-8")
    monkeypatch.setattr(service,"cfg",AppConfig(path))
    monkeypatch.setattr("engine.config_api.cfg",service.cfg)
    result=service._save_operation_mode("automatic")
    assert result["enabled"] is False and result["auto_execute"] is False


def test_cancelled_research_never_spawns_process(monkeypatch):
    from engine import analysis_runs, research_process
    monkeypatch.setattr(analysis_runs,"is_cancelled",lambda cycle: True)
    monkeypatch.setattr("engine.trading.control.load_state",lambda:{})
    monkeypatch.setattr(research_process.subprocess,"Popen",lambda *a,**kw:pytest.fail("must not spawn"))
    with pytest.raises(InterruptedError):
        research_process.run_headless(["unused"],cycle_id="cancelled",timeout=1,env={})


def test_stop_ends_real_child_tree_and_closes_inherited_pipes(monkeypatch):
    import os
    import sys
    import time
    from engine import analysis_runs, research_process
    from engine.subprocess_utils import hidden_subprocess_kwargs
    calls = 0
    def stopped(cycle):
        nonlocal calls
        calls += 1
        return calls >= 4
    monkeypatch.setattr(analysis_runs,"is_cancelled",stopped)
    monkeypatch.setattr("engine.trading.control.load_state",lambda:{})
    # A grandchild inherits the captured stdout pipe. Killing only its parent
    # would leave communicate() waiting for the full 30-second sleep.
    script = "import subprocess,sys,time; subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'], creationflags=" + str(hidden_subprocess_kwargs().get("creationflags",0)) + "); time.sleep(30)"
    start = time.monotonic()
    with pytest.raises(InterruptedError):
        research_process.run_headless([sys.executable,"-c",script],cycle_id="tree-test",timeout=40,env=dict(os.environ),**hidden_subprocess_kwargs())
    assert time.monotonic()-start < 8


def test_daily_recalls_outside_discovery_then_obeys_user_filter(monkeypatch,tmp_path):
    from engine.screening import engine
    from engine.data import securities
    rows=[{"symbol":str(600000+i),"name":f"Company{i}","price":100,"amount":1e9,"market_cap":1e10} for i in range(70)]
    daily_row={"symbol":"900001","name":"EventCo","price":100,"amount":1e9,"market_cap":1e10}
    report=brief(["900001"])
    monkeypatch.setattr(engine,"SCREENING_DIR",tmp_path)
    monkeypatch.setattr(engine,"get_screening_store",lambda settings:None)
    monkeypatch.setattr(engine.fetcher,"market_list",lambda *a,**kw:{"data":rows})
    monkeypatch.setattr(daily,"load_daily",lambda now:report)
    monkeypatch.setattr(securities,"load_catalog",lambda market:{"data":[daily_row]})
    loaded=[]
    def snapshots(symbols,workers):
        loaded.extend(symbols)
        return {code:{"realtime":{**daily_row,"symbol":code},"indicators":{"change":{"d5":2,"d20":4}}} for code in symbols},{}
    args=dict(held_symbols=["999999"],configured_symbols=[],fallback_symbols=[],settings={"snapshot_limit":60,"shortlist_size":20},
              autonomous_config={"max_universe_size":30},snapshot_loader=snapshots,now=NOW)
    result=engine.run_screening("cn",**args)
    assert result.audit["daily_added_count"] == 1
    assert len(result.audit["research_symbols"]) <= 8
    assert "900001" in result.audit["research_symbols"]
    assert "999999" not in result.audit["research_symbols"]
    assert len(result.audit["candidates"]) == 20
    assert loaded.count("900001") == 1
    filtered=engine.run_screening("cn",**args,conditions=[{"field":"symbol","operator":"!=","value":"900001"}])
    assert "900001" not in filtered.audit["candidate_symbols"]
