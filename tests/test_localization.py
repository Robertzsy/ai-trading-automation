"""Cross-layer language contracts: preferences, durable rounds and artifacts."""
from __future__ import annotations
import json
import re
import subprocess
import shutil
from pathlib import Path
import pytest
from engine import analysis_runs, analysis_reports, localization
from engine.config import cfg, AppConfig, _default_config_path
from engine.research.plan_cache import save_plan, load_plan

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture
def preferences(monkeypatch):
    monkeypatch.delenv("DSH_HOME",raising=False)
    monkeypatch.setattr(cfg,"_data",{"ui":{"language":"zh"},"research":{"output_language":"follow-ui"}})
    return cfg._data


def test_relative_config_path_stays_in_selected_data_root(tmp_path,monkeypatch):
    monkeypatch.setenv("AI_TRADING_AUTOMATION_DATA_DIR",str(tmp_path))
    monkeypatch.setenv("CONFIG_PATH","config/config.yaml")
    assert _default_config_path() == tmp_path / "config/config.yaml"
    absolute = tmp_path / "explicit.yaml"
    monkeypatch.setenv("CONFIG_PATH",str(absolute))
    assert _default_config_path() == absolute


def test_host_preference_and_setup_updates_preserve_other_rows(tmp_path,monkeypatch,preferences):
    home = tmp_path / "home"
    profile = home / "profiles/investment-web/cordis.patch.yml"
    profile.parent.mkdir(parents=True)
    original = '- id: llm\n  config:\n    model: !!js process.env.MODEL\n- id: locale\n  config:\n    preference: en\n'
    profile.write_text(original,encoding="utf-8")
    monkeypatch.setenv("DSH_HOME",str(home))
    assert localization.ui_language() == "en"
    from engine import config_api
    updates=[]
    monkeypatch.setattr(config_api,"apply_config_changes",lambda changes:updates.append(changes))
    localization.persist_ui_language("zh")
    result=profile.read_text(encoding="utf-8")
    assert 'model: !!js process.env.MODEL' in result
    assert result.count('id: locale') == 1
    assert localization.ui_language() == "zh"
    assert updates == [{"ui.language":"zh"}]
    with pytest.raises(ValueError): localization.persist_ui_language(["en"])


def test_new_round_freezes_language_and_old_rounds_stay_chinese(tmp_path,monkeypatch,preferences):
    directory=tmp_path / "runs";directory.mkdir()
    monkeypatch.setattr(analysis_runs,"_directory",lambda:directory)
    preferences["ui"]["language"]="en"
    run=analysis_runs.start_or_resume({"cycle_id":"language-round","market":"us","symbols":["MSFT"]})
    assert run["output_language"] == "en"
    assert run["prompt_template_version"] == localization.TEMPLATE_VERSION
    preferences["ui"]["language"]="zh"
    assert analysis_runs.start_or_resume({"cycle_id":"language-round","market":"us"})["output_language"] == "en"
    with pytest.raises(ValueError,match="cannot change"):
        analysis_runs.start_or_resume({"cycle_id":"language-round","market":"us","output_language":"zh"})
    english=analysis_reports.render_round_report({**run,"decisions":[{"symbol":"MSFT","action":"BUY","target_weight":0,"confidence":.72,"reason":"Await confirmation","evidence_ids":["ev:unchanged"]}]})
    assert 'Decision summary' in english and 'MSFT' in english and 'ev:unchanged' in english
    assert 'Watch (zero weight)' in english
    assert not re.search('[\u4e00-\u9fff]',english)
    legacy={k:v for k,v in run.items()if k!="output_language"}
    preferences["ui"]["language"]="en"
    assert '分析轮次报告' in analysis_reports.render_round_report(legacy)


def test_prose_plan_cache_partitions_languages_and_templates(tmp_path):
    args=("hk","00700","2026-10-24")
    save_plan(*args,"中文计划",root=tmp_path)
    assert not load_plan(*args,root=tmp_path,language="en",template=localization.TEMPLATE_VERSION)["found"]
    save_plan(*args,"English plan",root=tmp_path,language="en",template=localization.TEMPLATE_VERSION)
    assert load_plan(*args,root=tmp_path)["plan"] == "中文计划"
    assert load_plan(*args,root=tmp_path,language="en",template=localization.TEMPLATE_VERSION)["plan"] == "English plan"
    with pytest.raises(ValueError):save_plan(*args,"bad",root=tmp_path,language="../en")


def test_english_hold_classification_does_not_lose_categories():
    from engine.feedback import _classify
    for chinese,english in [("置信度不足","insufficient confidence"),("均线未修复","moving average not repaired"),("营收与估值","revenue and valuation"),("流动性不足","liquidity unavailable"),("仓位上限","position limit")]:
        assert _classify(chinese) == _classify(english)


def test_setup_escapes_source_path_and_keeps_language_options():
    from engine.api.setup_page import render_setup_page
    page=render_setup_page(suggested='</script><img src=x>',language="en")
    assert '<html lang="en">' in page
    assert '</script><img' not in page
    assert 'value="zh"' in page and 'value="en"' in page
    assert 'id="importFrom"' in page


def test_resource_keys_and_placeholders_match_across_layers():
    import xml.etree.ElementTree as ET
    for path in [ROOT/'app/locales/product.json',ROOT/'engine/locales/messages.json',ROOT/'engine/locales/setup.json',ROOT/'scripts/macro-environment/locales.json',ROOT/'app/plugins/dsh-investment-tools/lib/messages.json']:
        for key,row in json.loads(path.read_text(encoding="utf-8")).items():
            assert set(row)=={"zh","en"},(path,key)
            assert row["en"].strip(),(path,key)
            assert sorted(re.findall(r"\{([A-Za-z0-9_]+)\}",row["zh"]))==sorted(re.findall(r"\{([A-Za-z0-9_]+)\}",row["en"])),(path,key)
    resources=ROOT/'windows/desktop/Resources'
    names=lambda path:{element.attrib['name']for element in ET.parse(path).findall('data')}
    assert names(resources/'Strings.resx')==names(resources/'Strings.en.resx')


def test_macro_english_template_retains_original_sources(tmp_path,monkeypatch):
    if not shutil.which('node'):pytest.skip('Node required')
    news=tmp_path/'news';news.mkdir()
    data={"window":{"endDate":"2026-10-24"},"stats":{"total":1,"high":1,"medium":0,"low":0},"news":[{"importance":"high","title":"原始标题","intro":"原始节选","categories":["货币政策"],"source":"Original source","time":1792800000,"url":"https://example.org/source"}],"market_data":{}}
    (news/'2026-10-24.json').write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")
    import os
    env={**os.environ,"MACRO_DATA_DIR":str(tmp_path),"MACRO_OUTPUT_LANGUAGE":"en"}
    result=subprocess.run(['node',str(ROOT/'scripts/macro-environment/report.js'),'daily','--date','2026-10-25'],env=env,capture_output=True,text=True,encoding="utf-8")
    assert result.returncode==0,result.stderr
    assert 'Daily macro briefing' in result.stdout
    assert '原始标题' in result.stdout and 'https://example.org/source' in result.stdout
    assert 'Monetary policy' in result.stdout
