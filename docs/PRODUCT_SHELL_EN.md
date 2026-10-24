# Product shell

[简体中文](PRODUCT_SHELL.md) · [Language support](LANGUAGE_SUPPORT.md)

The 2.4.0 application embeds exactly DSH `0.2.1-rc.3`. Four product pages provide Overview, Investment assistant, Investment research and Settings. The assistant keeps the upstream conversation, streaming, attachments, tool cards and model configuration components.

## Composition and services

`investment-web` composes the browser surface; `investment` is the internal headless profile. Each profile separates shipped definitions in `product/cordis.patch.yml` from the root `cordis.patch.yml` written by Settings. Seeding refreshes product bundles and preserves user overrides. Known legacy product patches are backed up before conversion; unfamiliar custom legacy patches stop startup for explicit reconciliation.

The product shell owns the root slot. It exposes a keyed, root-scoped `main` slot (conversation key `conversation`), single root `sidebar`, `rightbar`, `shell.bottom` and `shell.leading` slots, and a list `shell.overlay` slot. It provides the shared `panelInfo` source and navigation cancellation through the `layout` service. Native rightbar components receive width, viewport width and availability; their full-screen presentation remains supported.

The host maintains one workspace rooted at `DSH_HOME`. Session creation and archiving go through `uiWorkspace`; opening, searching and renaming use the session services. Subagent sessions stay outside the user-facing list. Internal scheduled research uses a separate home. Old session files are retained by upstream generation migration; retaining originals does not make newly written V4 sessions readable by rc.6.

The investment host proxy serves `/api/investment/*`. Engine credentials stay on the host and are not sent to browser JavaScript. Settings uses the upstream model surface and product-owned configuration sections. The language preference is the active profile's `locale` configuration; desktop synchronization uses the native locale bridge.

## Generated code and release inputs

Maintain UI strings in `app/locales/product.json`, the dashboard in `app/plugins/dsh-product-shell/src/dashboard.js`, and generated Markdown/icon sources in their corresponding generator inputs. Run the generators with `--check` in CI. Native conversation hero and placeholder strings are patched by semantic dictionary key with strict match counts after `npm ci`.

Prepare a new source directory using `scripts/prepare-release-source.ps1 -Destination <new-directory> -Revision <commit>`. Install dependencies from its lockfile, run `app/scripts/brand-dist.mjs`, provide the bundled runtimes, and build the desktop there. `build-installer.ps1` and `build-windows-release.ps1` verify the source receipt and product allowlist before copying files. Both distributions include the DSH application and language resources. Source receipt, application version and DSH version identify the candidate; packaging alone does not complete installation, upgrade or model-quality acceptance.
