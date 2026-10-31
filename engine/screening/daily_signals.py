"""Shared daily-brief signals for cheap screening (no model or network calls)."""
from __future__ import annotations

import hashlib
import json
import math
import re
import statistics
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from engine.paths import runtime_dir

DAILY_CANDIDATE_LIMIT = 10
RESEARCH_LIMIT = 8
SELECTION_VERSION = 2
SELECTION_STRATEGY = "hybrid-h-v1"
_POSITIVE = ("获批", "中标", "增持", "上调评级", "超预期增长", "扭亏", "订单增长", "政策支持", "扩产", "record earnings", "raises guidance", "contract win")
_NEGATIVE = ("下调", "减持", "亏损", "违约", "立案", "处罚", "禁令", "业绩下滑", "裁员", "不及预期", "盈利预警", "未获批", "cuts guidance", "profit warning", "sanctions")


def _matches(term: str, text: str) -> bool:
    if len(term.strip()) < 2:
        return False
    if re.fullmatch(r"[A-Za-z0-9 .&-]+", term):
        return bool(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I))
    return term.casefold() in text.casefold()


def load_daily(now: datetime, root: Path | None = None) -> dict:
    root = root or runtime_dir() / "macro" / "news"
    for path in sorted(root.glob("????-??-??.json"), reverse=True):
        if path.stem > now.date().isoformat():
            continue
        try:
            raw = path.read_bytes()
            payload = json.loads(raw)
            date = datetime.strptime(path.stem, "%Y-%m-%d").date()
            age = sum((date + timedelta(days=i)).weekday() < 5 for i in range(1, (now.date() - date).days + 1))
            freshness = (1.0, 1.0, .65, .35)[min(age, 3)] if age <= 3 else 0
            events, seen = [], set()
            for row in payload.get("events", payload.get("news", [])):
                title = str(row.get("summary") or row.get("title") or "")
                text = str(row.get("title") or "") + " " + title + " " + str(row.get("intro") or "")
                if not text.strip():
                    continue
                # An explicit event id can group syndicated stories. Otherwise
                # canonical URL/title identity prevents repeated-title scoring.
                identity = str(row.get("event_id") or re.sub(r"\W+", "", str(row.get("title") or title)).casefold())
                if identity in seen:
                    continue
                seen.add(identity)
                published = row.get("published_at", row.get("time"))
                if published:
                    try:
                        stamp = float(published)
                    except (TypeError, ValueError):
                        try:
                            stamp = datetime.fromisoformat(str(published).replace("Z", "+00:00")).timestamp()
                        except ValueError:
                            stamp = 0
                    if stamp > now.timestamp():
                        continue
                direction = row.get("direction")
                direction_source = "explicit" if direction in {"positive", "negative", "neutral"} else "keywords"
                if direction not in {"positive", "negative", "neutral"}:
                    pos = any(_matches(word, text) for word in _POSITIVE)
                    neg = any(_matches(word, text) for word in _NEGATIVE)
                    direction = "negative" if neg and not pos else "positive" if pos and not neg else "neutral"
                events.append({
                    "event_id": hashlib.sha256(identity.encode()).hexdigest()[:16],
                    "summary": title[:400], "text": text[:1600],
                    "sectors": row.get("sectors", []), "symbols": row.get("symbols", []),
                    "markets": row.get("markets", []), "direction": direction, "direction_source": direction_source,
                    "importance": row.get("importance", "medium"), "freshness": freshness,
                    "source_url": row.get("url") or next(iter(row.get("source_urls", [])), ""),
                })
            return {"date": path.stem, "hash": hashlib.sha256(raw).hexdigest(), "events": events,
                    "status": "available" if freshness else "background", "candidate_limit": DAILY_CANDIDATE_LIMIT}
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return {"date": None, "hash": None, "events": [], "status": "unavailable", "candidate_limit": DAILY_CANDIDATE_LIMIT}


def signals_for(row: Mapping[str, Any], daily: Mapping[str, Any], market: str) -> dict:
    hits, delta, relevance = [], 0.0, 0.0
    symbol = str(row.get("symbol", ""))
    aliases = [str(row.get("name") or ""), *row.get("aliases", [])]
    sectors = [str(row.get(key) or "") for key in ("sector", "industry")]
    for event in daily.get("events", []):
        if event.get("markets") and market not in event["markets"]:
            continue
        text = event["text"]
        explicit_only = event.get("entity_resolved", False)
        direct = symbol in event.get("symbols", []) or (not explicit_only and market != "etf" and any(_matches(name, text) for name in aliases))
        if not direct and not explicit_only and market == "us" and len(symbol) >= 2:
            direct = bool(re.search(r"(?:\$|NASDAQ[:：]\s*|NYSE[:：]\s*)" + re.escape(symbol) + r"\b", text, re.I))
        sector = any(_matches(str(topic), value) or _matches(value, str(topic)) for topic in event.get("sectors", []) for value in sectors if value)
        association = 1.0 if direct else .6 if sector else 0
        if not association:
            continue
        weight = {"high": 1, "medium": .6, "low": .3}.get(event["importance"], .6)
        strength = association * weight * event["freshness"]
        adjustment = 15 * strength * {"positive": 1, "negative": -1}.get(event["direction"], 0)
        delta += adjustment
        relevance += strength
        hits.append({key: event[key] for key in ("event_id", "summary", "source_url", "direction") } |
                    {key: event[key] for key in ("event_type", "evidence") if key in event} |
                    {"adjustment": round(adjustment, 2), "association": "company" if direct else "industry"})
    return {"daily_adjustment": round(max(-15, min(15, delta)), 2), "daily_relevance": relevance, "daily_events": hits[:6]}


def preselect(rows: Sequence[dict], limit: int, daily: Mapping[str, Any], market: str, cheap_score) -> list[dict]:
    enriched = [dict(row, **signals_for(row, daily, market)) for row in rows]
    ranked = sorted(enriched, key=lambda row: (-cheap_score(row), str(row["symbol"])))
    news = sorted((row for row in enriched if row["daily_relevance"] > 0), key=lambda row: (-row["daily_relevance"], -cheap_score(row), str(row["symbol"])))[:min(DAILY_CANDIDATE_LIMIT, limit)]
    chosen = {row["symbol"]: row for row in ranked[:max(0, limit - len(news))]}
    for row in news + ranked:
        if row["symbol"] not in chosen and len(chosen) < limit:
            chosen[row["symbol"]] = row
    return list(chosen.values())


def price_correlations(snapshots: Mapping[str, Any], symbols: Sequence[str]) -> dict:
    """Aligned daily returns, never join returns spanning different sessions."""
    series = {}
    for symbol in symbols:
        prices = {}
        for bar in snapshots.get(symbol, {}).get("history", []):
            try:
                close = float(bar["close"])
                if close > 0 and math.isfinite(close):
                    prices[str(bar["date"])] = close
            except (KeyError, ValueError, TypeError):
                continue
        ordered = sorted(prices.items())[-60:]
        series[symbol] = {(a[0], b[0]): b[1] / a[1] - 1 for a, b in zip(ordered, ordered[1:])}
    result = {}
    for index, left in enumerate(symbols):
        for right in symbols[index + 1:]:
            dates = sorted(series[left].keys() & series[right].keys())
            if len(dates) < 30:
                continue
            x, y = [series[left][d] for d in dates], [series[right][d] for d in dates]
            if statistics.pstdev(x) <= 1e-12 or statistics.pstdev(y) <= 1e-12:
                continue
            result[tuple(sorted((left, right)))] = max(-1.0, min(1.0, statistics.correlation(x, y)))
    return result


def rank_and_select(scored: Sequence[dict], daily: Mapping[str, Any], market: str, *, limit: int = 8,
                    snapshots: Mapping[str, Any] | None = None) -> tuple[list[dict], list[dict]]:
    ranked = []
    for row in scored:
        base = .55 * row.get("potential", 0) + .45 * row.get("score", 0)
        signal = signals_for(row, daily, market)
        ranked.append(dict(row, **signal, quant_score=round(base, 2), selection_score=round(base + signal["daily_adjustment"], 2)))
    base_order = {row["symbol"]: i + 1 for i, row in enumerate(sorted(ranked, key=lambda x: (-x["quant_score"], x["symbol"])))}
    ranked.sort(key=lambda row: (-row["selection_score"], row["symbol"]))
    for i, row in enumerate(ranked):
        row.update(rank=i + 1, quant_rank=base_order[row["symbol"]], rank_change=base_order[row["symbol"]] - i - 1)
    candidates = ranked[:20]
    correlations = price_correlations(snapshots or {}, [row["symbol"] for row in candidates])
    remaining, selected = list(candidates), []
    while remaining and len(selected) < min(RESEARCH_LIMIT, max(1, limit)):
        for row in remaining:
            industry = row.get("industry") or row.get("sector")
            event = next(iter(row.get("daily_events", [])), {}).get("event_id")
            penalty = sum(6 for other in selected if industry and industry == (other.get("industry") or other.get("sector")))
            penalty += sum(4 for other in selected if event and any(hit["event_id"] == event for hit in other["daily_events"]))
            rho = max([0.0] + [correlations.get(tuple(sorted((row["symbol"], other["symbol"]))), 0.0) for other in selected])
            row["correlation_penalty"] = round(8 * max(0.0, rho - .75) / .25, 4)
            row["max_selected_correlation"] = round(rho, 4)
            row["diversity_penalty"] = max(min(12, penalty), row["correlation_penalty"])
            row["research_score"] = round(row["selection_score"] - row["diversity_penalty"], 2)
        best = max(remaining, key=lambda row: (row["research_score"], -row["rank"]))
        if len(selected) >= 4 and best["research_score"] < selected[3]["research_score"] - 10:
            break
        selected.append(best)
        remaining.remove(best)
    selected_codes = {row["symbol"] for row in selected}
    for row in candidates:
        row["research_selected"] = row["symbol"] in selected_codes
    return candidates, selected
