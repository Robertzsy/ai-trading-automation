"""Idempotent usage ledger and compact rollups; unknown usage is never zero."""
from collections import defaultdict
from typing import Mapping


def _count(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def normalize_request(payload):
    if not isinstance(payload, Mapping):
        raise ValueError("model usage request must be an object")
    request_id = str(payload.get("request_id", ""))[:120]
    if not request_id:
        raise ValueError("model usage request_id is required")
    row = {key: str(payload.get(key) or "")[:200] for key in (
        "channel", "provider", "model", "purpose", "stage", "label", "agent_id", "attribution",
        "reasoning_effort", "tool_schema_version", "started_at", "finished_at", "finish_reason", "error")}
    row.update(request_id=request_id, max_tokens=_count(payload.get("max_tokens")),
               tool_count=_count(payload.get("tool_count")), system_chars=_count(payload.get("system_chars")))
    usage = payload.get("usage")
    if isinstance(usage, Mapping) and all(_count(usage.get(key)) is not None for key in ("input_tokens", "output_tokens")):
        row["usage"] = {key: _count(usage.get(key)) for key in (
            "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "uncached_input_tokens", "reasoning_tokens", "native_searches")}
        if row["usage"]["cache_read_tokens"] is not None and row["usage"]["cache_read_tokens"] > row["usage"]["input_tokens"]:
            raise ValueError("cache_read_tokens exceeds input_tokens")
        cached, uncached = row["usage"]["cache_read_tokens"], row["usage"]["uncached_input_tokens"]
        if cached is not None and uncached is not None and cached + uncached != row["usage"]["input_tokens"]:
            raise ValueError("cache and uncached input totals do not match input_tokens")
    else:
        row["usage"] = None
    return row


def summarize(requests):
    groups = defaultdict(list)
    for row in requests.values():
        groups[(row["channel"], row["model"], row["stage"], row["label"])].append(row)

    def aggregate(rows):
        valid = [row["usage"] for row in rows if row.get("usage") is not None]
        result = {"requests": len(rows), "metered_requests": len(valid), "unknown_usage_requests": len(rows) - len(valid),
                  "input_tokens": sum(value["input_tokens"] for value in valid), "output_tokens": sum(value["output_tokens"] for value in valid)}
        result["cache_details_requests"] = sum(value["cache_read_tokens"] is not None for value in valid)
        result["cache_read_tokens"] = sum(value["cache_read_tokens"] or 0 for value in valid)
        result["uncached_input_tokens"] = sum(value["uncached_input_tokens"] or 0 for value in valid)
        complete = len(valid) == len(rows) and result["cache_details_requests"] == len(rows)
        result["cache_hit_pct"] = 100 * result["cache_read_tokens"] / result["input_tokens"] if complete and result["input_tokens"] else None
        result["total_tokens"] = result["input_tokens"] + result["output_tokens"]
        result["coverage"] = "complete" if len(valid) == len(rows) else "partial"
        return result

    return {"schema_version": 1, "request_coverage": "observed_requests", "totals": aggregate(list(requests.values())), "groups": [
        {"channel": key[0], "model": key[1], "stage": key[2], "label": key[3], **aggregate(rows)} for key, rows in groups.items()],
        "billing": {"status": "not_reconciled", "reason": "Token usage only; actual charges require provider tariff and billing reconciliation"}}
