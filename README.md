# <img src="assets/logos/app-icon/voidpp-icon.svg" width="32" height="32" alt="Void++"> Void++

[English](README.md) · [中文](README.zh.md)

## Install

This branch is published **Beta** (`voidpp-beta`). It is the default branch. The script header is `@environment Beta`, and auto-update follows this branch only.

[![Install userscript](https://img.shields.io/badge/Install-userscript-00d26a?style=for-the-badge)](https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp-beta/userscript/VoidPP.user.js)

Click the badge to install (jsDelivr, no GitHub `CSP: sandbox`). Tampermonkey auto-update follows the header `@updateURL`: GitHub raw `userscript/VoidPP.user.js` on `voidpp-beta`.

**Development** ([`dev`](https://github.com/0-V-linuxdo/VoidPP/tree/dev)) moves first. **Stable** ([`voidpp-stable`](https://github.com/0-V-linuxdo/VoidPP/tree/voidpp-stable)) is opt-in. Do not enable two copies. Switch by turning the old copy off first; settings and IndexedDB stay shared.

## Changes

### Added

#### Plugin

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | On | Upstream plugin; Void++ turns it on by default. Hides upgrade nags, the home banner, the composer SuperGrok chip, locked models, and the Imagine Upgrade button (`hideImagineUpgrade`). |
| <img src="https://api.iconify.design/lucide/images.svg?color=%238b949e" width="16" height="16" alt=""> BetterImagine | Off | Imagine polish: favorites filter/sort/search, hover-to-play, hide moderated, bulk upscale + copy, smart filenames. `hideDefaultPreviews` hides home templates (off by default). Shortcuts i/v/r only on Favorites. |
| <img src="https://api.iconify.design/lucide/history.svg?color=%238b949e" width="16" height="16" alt=""> InputHistory | On | Recall previous chat prompts with Arrow Up and Arrow Down, like a shell. Optional `separateImagine` keeps Imagine prompts in their own list. |
| <img src="https://api.iconify.design/lucide/bot-off.svg?color=%238b949e" width="16" height="16" alt=""> NoGrokBot | On | Hide the top-right Grok Bot promo button. |
| <img src="https://api.iconify.design/lucide/user-round-x.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarIdentity | On | Hide username and/or email in the Grok sidebar and account menu (separate toggles). Avatar stays so the account menu still opens. |
| <img src="https://api.iconify.design/lucide/user-round-pen.svg?color=%238b949e" width="16" height="16" alt=""> CustomSidebarIdentity | Off | Replace the sidebar avatar and display name. Empty fields keep the official values. Paste a picture into Avatar Url (or type `https://` / `data:image`), then drag/zoom the circle to crop. `avatarSize` sets the expanded-sidebar avatar diameter (24–64px, default 40). Collapsed rail stays 32. Optional `applyToMenu` also covers the account dropdown header. |
| <img src="https://api.iconify.design/lucide/app-window.svg?color=%238b949e" width="16" height="16" alt=""> ChatStateFavicons | On | Tab favicon reflects chat state (streaming, done, ready, error) with five overlay styles. |
| <img src="https://api.iconify.design/lucide/link-2-off.svg?color=%238b949e" width="16" height="16" alt=""> NoShareLink | On | Hide Share Project (in a project) and Create share link (top-right of chats); separate toggles. |
| <img src="https://api.iconify.design/lucide/mic-off.svg?color=%238b949e" width="16" height="16" alt=""> NoDictation | On | Hide the Dictation (voice input) button from the chat input bar. Optional toggle hides Dictation Refinement in Settings → Behavior. |
| <img src="https://api.iconify.design/lucide/circle-gauge.svg?color=%238b949e" width="16" height="16" alt=""> UsageDisplay | On | Shows official weekly SuperGrok usage in the chat bar (chat and Imagine). Optional daily stats (`usageStats`, off by default): hover week first, then today; click opens per-day history. |
| <img src="https://api.iconify.design/lucide/message-circle.svg?color=%238b949e" width="16" height="16" alt=""> CustomGreeting | Off | Replace the non-project home greeting. Outside projects the input keeps Grok's placeholder (`heroOnlyOutsideProject`, on by default). Project chats still use the first phrase. Greeting rotation: visit / timer / click (`mode`, `order`, `intervalSec`). Optional `imaginePhrases` for the Imagine query bar. |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | On | Theme the project pane and Imagine masonry scrollbar (`themedScrollbar`, on by default). Optional: keep the right panel closed (`hideRightPanel`, off by default). |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> BetterNavigator | On | Upgrade the chat message rail into a Notion-style outline. Hover the ticks to see every message on the active branch, including ones Grok has not mounted yet; a reply that is still streaming stays listed as a dashed tick, and the hover menu stays vertically centered. Pinned to the chat column on one-turn chats and while the right panel is open. ↑/↓ outside the composer step through every listed message (`showAssistant`, `hideNativeHover`, `jumpEffect`). |
| <img src="https://api.iconify.design/lucide/blend.svg?color=%238b949e" width="16" height="16" alt=""> ComposerOpacity | On | Customizable chat input background opacity and blur. |
| <img src="https://api.iconify.design/lucide/layout-grid.svg?color=%238b949e" width="16" height="16" alt=""> RecentTopics | On | Switch recently opened chats with Ctrl+` (glass cards, project name, last Q&A preview). |
| <img src="https://api.iconify.design/lucide/minimize-2.svg?color=%238b949e" width="16" height="16" alt=""> BetterModeSelect | On | Pin 1–N chat modes as always-visible chips. Click a chip to switch without opening the menu. |
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> BetterQueue | On | Each queued message keeps the mode it was queued with (`showQueueMode`). Switching chats keeps the picker (`stickyOnNavigate`). Unsent rows come back after a refresh (`persistAcrossRefresh`). |
| <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 6H8'/%3E%3Cpath d='M21 12H8'/%3E%3Cpath d='M3 6v6'/%3E%3Cpath d='M21 18H3'/%3E%3C/svg%3E" width="16" height="16" alt=""> UserQuotes | On | Keep quoted lines in your own bubbles marked with a visible left bar after markdown hides `>`. |
| <img src="https://api.iconify.design/lucide/message-square-quote.svg?color=%238b949e" width="16" height="16" alt=""> BetterQuotes | On | Scroll a composer quote chip or a sent Jump-to-quoted-message card to the exact passage (`jumpToPassage`). Keep that quote card when switching chats (`persistAcrossChats`). |
| <img src="https://api.iconify.design/lucide/blocks.svg?color=%238b949e" width="16" height="16" alt=""> BetterAvatarPlugins | On | Move the sidebar Plugins button into the avatar menu (next to Void++ / Help). |
| <img src="https://api.iconify.design/lucide/lightbulb.svg?color=%238b949e" width="16" height="16" alt=""> NoBuildStarters | On | Hide the Build mode Ideas chips above the input. |
| <img src="https://api.iconify.design/lucide/circle-check.svg?color=%238b949e" width="16" height="16" alt=""> CompleteToast | On | Toast when another chat finishes; click to open it. Optional `keepUntilDismissed` keeps it until X or opening that chat. Optional `imagineGeneration` (off) toasts Imagine completions in the background. |
| <img src="https://api.iconify.design/lucide/panel-left.svg?color=%238b949e" width="16" height="16" alt=""> BetterSidebar | On | Sidebar improvements: section-header action hover, New chat plus on Chats, Bots/Projects default collapsed, and Chats default expanded (`titleRowHover`, `chatsPlus`, `botsDefaultCollapsed`, `chatsDefaultExpanded`, `projectsDefaultCollapsed`). |

#### Settings UI

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/pin.svg?color=%238b949e" width="16" height="16" alt=""> Plugin pin | — | Pin plugin cards to the top of the current category. |
| <img src="https://api.iconify.design/lucide/star.svg?color=%238b949e" width="16" height="16" alt=""> Plugin favorites | — | Star a plugin to collect it in the Favorites tab (the default Plugins view). Categories: Favorites, Recent (last 7 days), All, Chat, UI, Privacy, Other. |

### Fixed

#### Plugin

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | On | Hide inaccessible models in the model selector again. |
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> BetterQueue | On | The queue chip menu checks that row's mode. |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | On | Keep the right panel closed without crashing plugin start when the closer is not on the store snapshot. |

#### Settings UI

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/settings-2.svg?color=%238b949e" width="16" height="16" alt=""> Settings / icons | — | Void++ tabs in the Grok settings sidebar. Avatar-menu Void++ row uses a 16px V++ glyph; script `@icon` is the same mark on the app tile. The Plugins flyout shows each plugin’s icon. |
| <img src="https://api.iconify.design/lucide/panel-bottom.svg?color=%238b949e" width="16" height="16" alt=""> Chat bar buttons | — | Restored after Grok removed `ButtonWithTooltipOptimized`. |

### Removed

#### Plugin

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/gauge.svg?color=%238b949e" width="16" height="16" alt=""> RateLimitDisplay | — | Dropped after Grok credit rules changed; the old per-mode rate-limit readout no longer works. Weekly usage now lives in UsageDisplay. |
| <img src="https://api.iconify.design/lucide/plus.svg?color=%238b949e" width="16" height="16" alt=""> SidebarHeaderHover | — | Merged into BetterSidebar (`titleRowHover`, `chatsPlus`). |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> ThemedScrollbar | — | Merged into BetterCanvas. |
| <img src="https://api.iconify.design/lucide/panel-right-close.svg?color=%238b949e" width="16" height="16" alt=""> NoRightPanel | — | Merged into BetterCanvas. |
| <img src="https://api.iconify.design/lucide/message-square-quote.svg?color=%238b949e" width="16" height="16" alt=""> QuoteSticky | — | Merged into BetterQuotes (`persistAcrossChats`). |
| <img src="https://api.iconify.design/lucide/text-search.svg?color=%238b949e" width="16" height="16" alt=""> QuoteJump | — | Merged into BetterQuotes (`jumpToPassage`). |
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> ModeSync | — | Merged into BetterQueue (`showQueueMode`, `stickyOnNavigate`). |
| <img src="https://api.iconify.design/lucide/rotate-ccw.svg?color=%238b949e" width="16" height="16" alt=""> QueuePersist | — | Merged into BetterQueue (`persistAcrossRefresh`). |
