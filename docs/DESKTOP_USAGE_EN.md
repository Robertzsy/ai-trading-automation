# Desktop usage

[简体中文](DESKTOP_USAGE.md) | [English](DESKTOP_USAGE_EN.md)

AI Trading Automation supports Windows 10/11 x64. The installer includes the .NET desktop shell, Python and Node.js 22.19. It installs WebView2 when needed. No separate Python, Node or PowerShell installation is required.

1. Run the per-user installer and choose English or Simplified Chinese. Administrator access is not required.
2. Choose your interface language on first launch. Optionally enter a legacy data directory. Initialization creates separate mainland China, Hong Kong, US equity and ETF simulated accounts, denominated in their respective market currencies. Switching language does not convert balances.
3. Open Settings → Models to configure a provider and API key. Desktop credentials are encrypted with Windows DPAPI.
4. Select a strategy and manual/automatic mode under Settings → Strategy and risk controls. Trading mode remains `paper`; hard risk controls always apply.
5. Overview shows accounts, holdings, prices and recent rounds. Investment assistant manages conversations. Investment research brings together research history, progress and reports.
6. Research supports screening, analysis of selected securities and screening followed by the complete workflow. These actions produce research; they do not approve trading. A BUY recommendation with zero target weight is WATCH, not a fill.
7. Switch between English and 简体中文 under Settings → Interface language. Research output can follow the interface or use a separate language. New rounds freeze their language; active rounds and resumed stages retain that language.
8. Closing the window offers minimize to tray, stop all services and exit, or cancel. The tray provides open, start services, pause investing, logs and Windows startup controls.

Historical reports, conversations, source articles and company names remain in their original language. Switching languages does not invoke models to translate history. After a research failure, inspect the error and explicitly select Resume/Retry to continue from checkpoints. Product repairs require a concrete plan and user approval; completing a repair does not restart research automatically.

Programs install under `%LocalAppData%\Programs\InvestmentAuto`; user data remains under `%LocalAppData%\InvestmentAuto`. Upgrades preserve the data directory. Interactive uninstall keeps data by default; silent uninstall always keeps it.

Version 2.4.0 pins DSH to `0.2.1-rc.3`, an upstream prerelease. Application settings show both application and DSH versions. Writing an old session publishes a new format generation while retaining predecessors. Retained predecessors do not guarantee that an older application can read newly written content. Back up before upgrading. A rollback must preserve business records created after the upgrade; do not overwrite current data with an entire old backup.

Development gates are available in `scripts/release-check.ps1`, `scripts/verify-upgrade.ps1` and the Python, Node and desktop suites. Historical test counts and installer sizes are snapshots, not current guarantees.
