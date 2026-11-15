## 20261114.40

- Rebuild Void++ on the Userscript++ framework (plugin lifecycle, settings, Themes / Quick CSS, slots).
- Keep live grok.com desktop settings injection (DesktopSettingsDialog / lucide nav icons).
- Migrate VoidPPSettings into the Userscript++ store.
- Drop USPP `@noframes` / `@sandbox` / `@inject-into` so Violentmonkey still injects into grok.com.
- `filters` proxy is callable before `bindApi(U)` so top-level `waitFor(filters.byProps(...))` no longer aborts the IIFE.
