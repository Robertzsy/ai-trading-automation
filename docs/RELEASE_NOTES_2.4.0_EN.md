# 2.4.0 candidate release notes

[简体中文](RELEASE_NOTES_2.4.0.md)

This candidate combines bilingual support and an embedded DSH upgrade. These notes describe candidate source. A formal release still requires installation, upgrade, rollback and bounded live-model acceptance.

## Chinese and English support

- One installation switches between Simplified Chinese and English across the four product pages, model settings, tool cards, setup, desktop status, tray and installer.
- Research output follows the interface or uses a fixed language. New rounds record language and prompt template version; resumed rounds retain them. Historical content keeps its original language.
- Reports, notifications and feedback support English. Symbols, action codes, currencies, numbers and evidence IDs stay unchanged. Source titles, quotations, company names and user input are not automatically translated.
- Repair approval retains reviewed scope, exact file/command permissions, verification and grant revocation. Changing language starts no research or orders.

## Interface and motion

- Product text, forms and status messages are easier to read. Research stages pair progress rings with labels; percentages use recorded task completion and remain indeterminate when counts are unavailable.
- Pages, navigation, tabs, details, drawers and dialogs use consistent transitions. Switching pages retains forms and workspace state; hidden product pages pause their polling.
- Motion preferences support System, Standard and Off, while always respecting system reduced-motion settings. Stop, cancellation and submission actions are handled immediately.
- Desktop startup shows preparation state and shares the web interface's visual treatment. Save, error, empty and refresh feedback is consistent.

## DSH upgrade and compatibility

- On a quick desktop restart, scheduler readiness checks both the heartbeat and process lifetime so a recently exited worker cannot prevent startup.
- Multi-symbol research explicitly runs up to four roles concurrently and queues the rest, keeping CPU-derived workflow defaults from exceeding DSH's child-agent capacity.
- Background research migrates additional known legacy templates with backups, inherits headless overrides and their declared local plugins, and continues to protect unrecognized legacy customizations.
- Desktop startup preserves DSH's authenticated launch URL for readiness checks and WebView2 navigation, fixing a 60-second timeout even after the service has started.
- Embedded DSH moves from `0.1.0-rc.6` to exactly `0.2.1-rc.3`, an upstream prerelease.
- The workflow adapts to PTC execution and the new preset registry, Settings, Credentials and UI services.
- Shipped definitions and user overrides are separate. Known legacy configurations are backed up before conversion; custom legacy overrides are never silently replaced. DPAPI-encrypted credential records use revision checks to prevent stale concurrent refreshes.
- Reading legacy sessions preserves source files; the first write publishes an upstream successor generation. Old software may not read newly created sessions or events. Keep both generations and all new business records when planning rollback.
- Installation paths, data paths and existing business identifiers retain their compatibility rules. Clean-source packaging validates the product allowlist, and the portable package includes the complete DSH application.
- Upgrade replaces the old application-owned DSH dependency tree before copying the new one. The user-data root is outside this cleanup. Verification requires a matching installer checksum, a nonempty existing data snapshot and the expected DLL; a read-only inspection mode is available.

See [Desktop usage](DESKTOP_USAGE_EN.md), [language rules](LANGUAGE_SUPPORT.md) and [product shell](PRODUCT_SHELL_EN.md).
