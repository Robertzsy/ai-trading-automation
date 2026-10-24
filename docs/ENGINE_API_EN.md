# Engine API: desktop integration

The engine binds to loopback. Desktop requests authenticate with `X-ATA-Token`; the legacy token/header remains readable for compatible clients. The DSH host proxies browser requests and keeps engine credentials off the browser. These endpoints do not expose a live broker.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Application version and service health |
| `/api/status` | GET | Operation mode, controls, mandate and schedule |
| `/api/config` | GET | Configuration with secrets redacted |
| `/api/config/update` | POST | Atomic, explicitly allowed configuration updates |
| `/api/locale` | GET / POST | Read/save the interface preference (`zh` / `en`) |
| `/api/analysis/rounds/start` | POST | Start or explicitly retry one durable research round |
| `/api/analysis/run?cycle_id=...` | GET | Persisted round and language snapshot |
| `/api/analysis/runs` | GET | Research history |
| `/api/analysis/evidence` | GET | Complete saved stage evidence |
| `/api/research/plan` | GET / POST | Prose plan cache, with `language` and `template` partitions |
| `/api/credentials/records` | GET / POST | Authenticated encrypted credential records with CAS revisions |

Configuration writes use `{ "changes": { "research.output_language": "follow-ui" } }`. Research output accepts `follow-ui`, `zh` and `en`. `ui.language` is the engine's resolved mirror; use the native language selector or `/api/locale` for a durable interface preference. Trading mode is fixed to `paper` and remains outside this write contract.

A new round freezes its output language. An explicit attempt to change the language of the same `cycle_id` is rejected. Retry preserves completed stage evidence and never silently recomputes a terminal failed round. Research-only requests do not authorize order submission.

Credential references and structured records use distinct DPAPI-encrypted namespaces. Record writes require the revision returned by the previous read. A concurrent update returns HTTP 409, requiring a fresh read. Reference and record change events are distinct. Updating/revoking a credential does not leave an application-side 60-second credential cache.

Source data keeps original units, currencies, reporting periods, dates and evidence IDs. English presentation does not turn HKD or CNY balances into USD, nor does WATCH imply a simulated fill.

See [language support](LANGUAGE_SUPPORT.md), [desktop usage](DESKTOP_USAGE_EN.md) and the [full Chinese API reference](ENGINE_API.md).
