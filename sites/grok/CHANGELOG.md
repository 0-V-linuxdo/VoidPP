## 20261114.42

- Backfill `enabled: true` from Void++ IndexedDB/GM so plugins the user already had on (CustomGreeting, CustomSidebarIdentity, ResponseNotification, MessageStars) stay on after the Userscript++ migrate.
- CustomGreeting and ResponseNotification are on by default. CustomSidebarIdentity stays opt-in; the backfill restores this profile's previous on-state.

## 20261114.41

- MessageStars is on by default so the header star survives a clean Userscript++ settings store.

## 20261114.40

- Rebuild Void++ on the Userscript++ framework (plugin lifecycle, settings, Themes / Quick CSS, slots).
- Keep live grok.com desktop settings injection (DesktopSettingsDialog / lucide nav icons).
- Migrate VoidPPSettings into the Userscript++ store.
- Drop USPP `@noframes` / `@sandbox` / `@inject-into` so Violentmonkey still injects into grok.com.
- `filters` proxy is callable before `bindApi(U)` so top-level `waitFor(filters.byProps(...))` no longer aborts the IIFE.
