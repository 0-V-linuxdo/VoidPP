# <img src="assets/logos/app-icon/voidpp-icon.svg" width="32" height="32" alt="Void++"> Void++

[English](README.md) · [中文](README.zh.md)

## Install

[![Install userscript](https://img.shields.io/badge/Install-userscript-00d26a?style=for-the-badge)](https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp/userscript/VoidPP.user.js)

Install by clicking the badge (jsDelivr, no GitHub `CSP: sandbox`). Tampermonkey auto-update still uses GitHub raw `userscript/VoidPP.user.js` (`@updateURL`, 5 min cache).

## Changes

### Added

#### Plugin

| Feature | Default | What it does |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | On | Upstream plugin; Void++ turns it on by default. Hides upgrade nags, the home banner, the composer SuperGrok chip, and locked models. |
| <img src="https://api.iconify.design/lucide/history.svg?color=%238b949e" width="16" height="16" alt=""> InputHistory | On | Recall previous chat prompts with Arrow Up and Arrow Down, like a shell. |
| <img src="https://api.iconify.design/lucide/bot-off.svg?color=%238b949e" width="16" height="16" alt=""> NoGrokBot | On | Hide the top-right Grok Bot promo button. |
| <img src="https://api.iconify.design/lucide/user-round-x.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarIdentity | On | Hide username and/or email in the Grok sidebar and account menu (separate toggles). Avatar stays so the account menu still opens. |
| <img src="https://api.iconify.design/lucide/app-window.svg?color=%238b949e" width="16" height="16" alt=""> ChatStateFavicons | On | Tab favicon reflects chat state (streaming, done, ready, error) with five overlay styles. |
| <img src="https://api.iconify.design/lucide/link-2-off.svg?color=%238b949e" width="16" height="16" alt=""> NoShareLink | On | Hide Share Project (in a project) and Create share link (top-right of chats); separate toggles. |
| <img src="https://api.iconify.design/lucide/mic-off.svg?color=%238b949e" width="16" height="16" alt=""> NoDictation | On | Hide the Dictation (voice input) button from the chat input bar. Optional toggle hides Dictation Refinement in Settings → Behavior. |
| <img src="https://api.iconify.design/lucide/circle-gauge.svg?color=%238b949e" width="16" height="16" alt=""> UsageDisplay | On | Shows official weekly SuperGrok usage in the chat bar. Optional daily stats (`usageStats`, off by default): hover week first, then today; click opens per-day history. |
| <img src="https://api.iconify.design/lucide/text-cursor-input.svg?color=%238b949e" width="16" height="16" alt=""> Placeholder | Off | Replace the rotating chat input placeholder and the non-project home greeting. Greeting rotation: visit / timer / click (`mode`, `order`, `intervalSec`). |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | On | Theme the project pane scrollbar (`themedScrollbar`, on by default). Optional: keep the right panel closed (`hideRightPanel`, off by default). |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> BetterNavigator | On | Upgrade the chat message rail into a Notion-style outline. Hover the ticks to see every message; pinned to the chat column on one-turn chats and while the right panel is open. ↑/↓ outside the composer step through every listed message (`showAssistant`, `hideNativeHover`, `jumpEffect`). |
| <img src="https://api.iconify.design/lucide/blend.svg?color=%238b949e" width="16" height="16" alt=""> ComposerOpacity | On | Customizable chat input background opacity and blur. |
| <img src="https://api.iconify.design/lucide/layout-grid.svg?color=%238b949e" width="16" height="16" alt=""> RecentTopics | On | Switch recently opened chats with Ctrl+` (glass cards, project name, last Q&A preview). |
| <img src="https://api.iconify.design/lucide/minimize-2.svg?color=%238b949e" width="16" height="16" alt=""> CompactModeSelect | On | Keep the chat input model selector as an icon at every width. |
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> ModeSync | On | Queued messages send with the current picker. Switching chats keeps the selected mode until load settles (`stickyOnNavigate`). |
| <img src="https://api.iconify.design/lucide/text-quote.svg?color=%238b949e" width="16" height="16" alt=""> UserQuotes | On | Keep quoted lines in your own bubbles marked with a visible left bar after markdown hides `>`. |
| <img src="https://api.iconify.design/lucide/blocks.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarPlugins | On | Move the sidebar Plugins button into the avatar menu (next to Void++ / Help). |
| <img src="https://api.iconify.design/lucide/lightbulb.svg?color=%238b949e" width="16" height="16" alt=""> NoBuildStarters | On | Hide the Build mode Ideas chips above the input. |
| <img src="https://api.iconify.design/lucide/circle-check.svg?color=%238b949e" width="16" height="16" alt=""> CompleteToast | On | Toast when another chat finishes; click to open it. Optional `keepUntilDismissed` keeps it until X or opening that chat. |
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
