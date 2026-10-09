"""Engine HTTP command API (AI Trading Automation 2.0).

The DSH app (conversation plane) reaches the engine through this loopback API
and through the MCP bridge (P1). The API owns no AI: it dispatches the same
command surface as the CLI (engine.investment.service).
"""
