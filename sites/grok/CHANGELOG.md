## 20261114.54

- `.53` froze the Grok project chat after first paint (white pane, main thread busy). Overlay Search was `position:fixed` plus `position-anchor` to `#app-sidebar` while Library was already a fixed descendant of that same anchor; drop the Library-only `:only-child` collapse and keep Search `position:absolute` like `.52`.
- BetterSidebar: find `ENABLE_GROK_BOT_RELAY_CLIENT` as a string. The old regex find started with `\i`, never hit, and scanned every factory (~38s in the chunk bench).

## 20261114.53

- Re-target live desktop patches after `.52`: settings nav lucide on `"data-settings-tab"`, CustomGreeting `placeholderClassName`, BetterCanvas `source:"auto",view:"browser"`, New bot IconButton `data-void-bots-plus`, NoBuildStarters `BuildStarters` return null.
- Mark dead `.48` alternates `noWarn` (collapsed-storage keys, nav group array, skills-and-connectors hide, UserCard `avatarSize:"md"`).
- BetterSidebar: overlay Search is `position:fixed` with `position-anchor` (32px ghost, 4px left of compact +). Collapse the empty Library-only row. Setting off restores Grok's header. CSS only — no document `MutationObserver`.

## 20261114.52

- Restore `.48` plugin and store sources. `.49`–`.51` hung the project chat (`RESULT_CODE_HUNG`); those Search-placement, store-scan, pin-wrap, and NoTelemetry edits are reverted until the cause is isolated.

## 20261114.51

- Store `search()` waits until the module cache is quiet (or 2s). `.50` still scanned factory source on every cache-size change from 250ms intervals and MessageStars paint, which froze the project chat again.
- `whenCommon` no longer walks modules on every `onModuleLoad`. BetterModeSelect retries store watches on an interval. Overlay Search glyph is 20px like Toggle / +.

## 20261114.50

- BetterSidebar: place overlay Search with the sidebar's bounding rect (Helium's tab strip made `left: 254px` sit off the Grok header). 32px ghost, 4px left of compact +.
- BetterModeSelect / UsageDisplay: do not scan Routing/Settings stores on every module load (`onModuleLoad` + Infinity `proxyLazy` froze the project chat: `RESULT_CODE_HUNG`). Retry on an interval; cache store finds by module-cache size.
- BetterModeSelect: wrap desktop `"data-query-bar-mode-select":""` children with a 2500-char gap so project `form[data-composer]` gets pins.

## 20261114.49

- BetterSidebar: overlay Search is a 32px ghost left of compact New chat. `position:fixed` plus z-index so it is not clipped behind the sidebar; `@supports (anchor-name)` still sets `position:fixed`.
- BetterModeSelect: pins mount once Routing/Settings/Message stores resolve (`findStore`, named `useRoutingStore`, SettingsStore no longer dies after 50 `findByPropsLazy` retries). Desktop wrap is `"data-query-bar-mode-select":""` children.
- NoTelemetry: `/api/log_metric` also matches `(0,ident)(...)` and sendBeacon without a json Blob type.
- Settings nav leading lucide: `jsx(ident,{name:map[id]})`, not only `ident.f` + `map.X`.

## 20261114.48

- BetterSidebar: compact Library matches the live desktop button (`#icon-xs-library`, no aria-label) and moves overlay Search without requiring it to be a sibling of `#app-sidebar`.

## 20261114.47

- BetterSidebar: compact Library into the Search slot and move overlay Search left of the compact New chat plus. Default on.

## 20261114.46

- Mode pins and the usage button are Grok buttons again. Grok's buttons moved to stylex and the old wrapper is gone, so pins fell back to a bare 16×18 headless button and usage to a plain fallback with no hover panel. Pins are 36px ghost circles with a 0.25rem gap; usage is a ghost pill with its panel.
- Void++ plugin CSS goes through the Userscript++ style registry. Turning a `managedStyle` plugin off removes its CSS again, and the "样式 X 未注册" warnings are gone.
- The Void++ mark has its arc and two bars back. The bell uses the current lucide paths.
- Settings → Void++ rows (Plugins, Themes, Quick CSS) open those tabs instead of Account.
- Toast titles are regular weight again (the rule left with the core Settings plugin).
- `Switch` no longer falls back to Base UI's `{Root, Thumb}` namespace, which crashed Void++ setting components (React #130).

## 20261114.45

- Restore plugin option values from the Void++ store (GM / IndexedDB). The first migrate copied them before Userscript++ settings were ready, so only `enabled` was ever saved. Values the Userscript++ store already has are kept.
- Quick CSS migrates to `customCSS` / `customCSSEnabled`, the keys Userscript++ reads.
- Account-menu leading icons are muted again, and the Settings nav has the Usage → Void++ hairline. Grok's own Notifications tab keeps its icon.
- Void++ submenu rows (plugins, Themes, Quick CSS, Backup) open Grok Settings again.

## 20261114.44

- Account-menu Void++ row and GrokMenus slots use desktop kit (`accountMenuParts`) instead of Radix `DropdownMenuSub` / `SignoutIcon`. Same class as UsageDisplay: host patched in, factory/renderer stale.

## 20261114.43

- GrokChatBar desktop inject: live composer uses `"data-query-bar-mode-select":""` and compiler temps, not `:!0`. Put UsageDisplay (and other chat-bar buttons) in the dictate/send cell so they sit left of Send.

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
