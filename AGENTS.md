# Void++

Follow `.rules`. Extra constraint for this fork:

## Channels

Three script identities, one data store. Do not enable two copies. Switch by disabling or deleting the old script first; settings survive because storage is shared. Do not add a channel suffix to `window.VoidPP`, IndexedDB `VoidPP`, `VoidPPSettings`, `voidpp-cookies`, or `queue-persist:v1`.

| Branch | Role | `@namespace` | `@environment` | Publish |
| --- | --- | --- | --- | --- |
| `dev` | Development line. Daily work lands here. | `https://github.com/0-V-linuxdo/VoidPP/dev` | Development | GitHub raw `…/dev/userscript/VoidPP.user.js`. No README badge. |
| `voidpp-beta` | Published Beta / test. The install badge. Default branch. | `https://github.com/0-V-linuxdo/VoidPP/voidpp-beta` | Beta | GitHub raw `…/voidpp-beta/userscript/VoidPP.user.js` |
| `voidpp-stable` | Published Stable. Opt-in, not the install badge. | `https://github.com/0-V-linuxdo/VoidPP/voidpp-stable` | Production | GitHub raw `…/voidpp-stable/userscript/VoidPP.user.js`. No README badge. |

`bun run build` reads the current git branch and stamps that channel into `@namespace`, `@environment`, `@downloadURL`, and `@updateURL`. `bun run build:dev` (`--dev`) is local only: sourcemaps, `.dev` plugins, and it forces the `dev` namespace so a local install does not replace the Beta record. Do not commit a `--dev` build. `--stable` (`bun run build:stable`) forces `voidpp-stable` / Production even when the checkout is another branch; do not commit that onto `dev` or `voidpp-beta`. Do not pass `--dev` and `--stable` together.

After a merge into `dev`, `voidpp-beta`, or `voidpp-stable`, run `bun run build` again on that branch before pushing. The userscript header is baked, so a merge can carry the other channel's header.

New changes go on `dev`. During development, push **only** `dev`. Do not push, cherry-pick, or merge onto `voidpp-beta` or `voidpp-stable` unless the user explicitly says to promote that channel. "脚本更新后,立即推github" means push `dev`. After that push, give the user the GitHub raw URL of the userscript just pushed. `[20260925.3]` BetterCanvas was pushed to both `dev` and `voidpp-beta`; that beta push was not requested. Promote to `voidpp-beta` only when the user asks to ship Beta, then to `voidpp-stable` only when the user asks to ship Stable. The `Void++` branch is retired — do not recreate or fast-forward it. `upstream-main` is the frozen upstream snapshot; do not treat it as a publish line. `bots-default-collapsed` is deleted; do not recreate it. The old branch name `voidpp` is retired; do not recreate it or point `@updateURL` at it.

Canonical **Beta auto-update** URL (both `@downloadURL` and `@updateURL` — GitHub raw, `max-age=300`):

`https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/voidpp-beta/userscript/VoidPP.user.js`

Canonical **Beta click-to-install** URL (README badge — jsDelivr `@heads/voidpp-beta`, no `CSP: sandbox`):

`https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp-beta/userscript/VoidPP.user.js`

Development auto-update (no badge):

`https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/dev/userscript/VoidPP.user.js`

Stable auto-update (no badge; click-to-install is jsDelivr, not this raw URL):

`https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/voidpp-stable/userscript/VoidPP.user.js`

`https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp-stable/userscript/VoidPP.user.js`

Do not point the README badge at `raw.githubusercontent.com`. That origin sends `Content-Security-Policy: sandbox`, so Chrome MV3 Tampermonkey never intercepts the `.user.js` navigation and the tab just dumps source. Do not use `main`, `voidpp`, `Void++`, `userscript/Void.user.js`, or jsDelivr `@voidpp` / `@voidpp-beta` without `heads/` (404). Tampermonkey auto-update follows whatever `@updateURL` is already baked into the installed copy; keep that on GitHub raw so a 7-day CDN cache cannot hide a VERSION_DATE bump.

Before any push to `dev`, `voidpp-beta`, or `voidpp-stable`:

1. Run `bun run build` on the branch you are pushing (not `--dev`, and not `--stable` unless that channel is the target) so `userscript/VoidPP.user.js` is regenerated.
2. Commit that userscript with the matching source. Do not push source-only.
3. Confirm the userscript header:
   - `// @version` matches `VERSION_DATE` in `build.ts`. Tampermonkey only reads that header — bumping `build.ts` alone leaves the bundle stale and Check for updates will not fire.
   - `@namespace` is `https://github.com/0-V-linuxdo/VoidPP/<channel>` for that branch (`dev`, `voidpp-beta`, or `voidpp-stable`).
   - `@environment` is Development on `dev`, Beta on `voidpp-beta`, Production on `voidpp-stable`.
   - `@downloadURL` and `@updateURL` are the GitHub raw URL of **that** branch, not the other channel.
4. The Install section in `README.md` and `README.zh.md` must name the branch you are pushing. Its badge points at that branch's jsDelivr `@heads/<branch>` URL, never at GitHub raw. After a merge, rewrite that section if it still describes another channel.
5. After a `voidpp-beta` push, purge jsDelivr for the Beta file only:
   `curl -s https://purge.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp-beta/userscript/VoidPP.user.js`
6. After the push succeeds, reply with the GitHub raw link of that channel's userscript. Do not stop at the commit hash. `dev` is `https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/dev/userscript/VoidPP.user.js`. Beta and Stable use the raw URLs listed above.

Do not write `userscript/Void.user.js`. The hop is gone. Old Tampermonkey installs that already ate `[20260911.8]` or `[20260911.9]` follow `@updateURL` to `VoidPP.user.js`. Anyone still on a pre-hop `@updateURL` must reinstall from the canonical file. `[20260925.2]` moves the Beta identity from `…/voidpp` to `…/voidpp-beta`. That is a new script; the old branch does not update it in place.

Tampermonkey `@version` must stay plain numeric (`20260925.2`), never `[20260925.2]`. Bracketed versions parse as equal and Check for updates will not fire.

## Runtime ids

Canonical:

- `window.VoidPP` (`window.Void` stays the same object; do not drop the alias)
- IndexedDB `VoidPP` — read `Void` once, copy, delete the old database. Never write `Void` after `[20260912]`
- Settings key `VoidPPSettings` — read `VoidSettings` once, flush to the new key, delete the old key. Never write `VoidSettings` after `[20260912]`. GM is shared across every `@match` origin and is read before grok.com IndexedDB. A bag with no plugin keys is a miss — fall through to IDB. `save()` must not write `{plugins:{}}`, and must not write at all until `initSettings` calls `markReady()`. Preview frames skip `initSettings`, so they cannot flush. `[20260925.3]` let the `grokusercontent` preview iframe evaluate SettingsStore and `beforeunload`-flush an empty bag into GM.
- Preview iframe scrollbars: `bootstrapPreviewFrame` paints from `prefers-color-scheme` immediately, then HELLO. `replyFrame` always uses `"*"`. `frameCss` targets `*::-webkit-scrollbar`, not just `html,body`. Parent also sets `color-scheme` on Preview/grokusercontent iframes. The white H-bar on project file preview is the opaque `srcdoc` child (`allow-scripts` without `allow-same-origin`) inside `artifacts.grokusercontent.com`. `contentDocument` is blocked; prepend `frameCss` into `iframe.srcdoc` and watch the `srcdoc` attribute. Do not add `allow-same-origin`.
- `hideRightPanel` still blocks `source:"auto"` and `willRestoreRightPanelByIntent`. A manual open is `Toggle Right Panel`, Options / Settings / Files / Preview, a click inside an open pane, or a click in the sidebar Projects group (`Add project` / `All projects` / `Projects`). Do not treat every `menuitem` as manual. A click that is not one of those clears the 3s hold. `collapseCanvas` and `enforce` close only when the pane goes from closed to open, when the conversation id changes without that hold, or when `hideRightPanel` flips off to on. A later workspace tick must not close a pane the user already opened. A chat-row click is not manual — restore must still close the panel. `onSettingsChange` force-closes only when `hideRightPanel` flips off to on. A `themedScrollbar` change refreshes CSS and must not close a manual pane. Turning `hideRightPanel` off does not reopen the pane. Do not close every `sidePanelContent.type === "rightPanel"` write. Do not add `allow-same-origin` to preview iframes.
- Cookie bridge `voidpp-cookies`
- Settings tab ids `voidpp_*_tab` and nav group `voidpp`

The Settings dialog is the lazy chunk that contains `pressed_cmd_settings`, not the initial HTML chunks. Append Void++ tabs at the visible filter, which is now `oK.filter(e=>e.visible(ctx)&&!(flag&&"team-overview"===e.id))`. `[20260926.20]` Grok stopped filtering `tab.group === "team-management"`. The old `\i.filter(\i=>\i.visible(\i)&&!(\i&&"team-management"===\i.group))` no longer matches, so `_tabEntries()` never joins the list. Sidebar labels Account / Appearance / Behavior are tab ids inside groups `general` / `grok` / `payments` / `data` / `other` — do not treat them as new group ids. The group array is still `["general","grok","payments","data","other","team-management"]`. An empty `voidpp` group renders nothing (`0===n.length?null`), and `setTab("voidpp_*_tab")` misses the list and falls back to the first official tab. Do not restore the `team-management` group filter.

Do not rename:

- Firefox id `firefox@void.prism`
- CSS / dataset prefix `void-`
- AccountSwitcher crypto key `VoidCryptoRootHKDF`
- `@name Void++`. `@namespace` is the channel URL above, not the repo root.

## BetterAvatarPlugins

`NoSidebarPlugins` was renamed to `BetterAvatarPlugins`. The settings bag, pin, star, known, and PluginsFlyout keys migrate 1:1. Do not fold this into BetterSidebar.

## CustomGreeting

Query-bar empty placeholder is Tiptap `p.is-editor-empty::before { content: attr(data-placeholder) }`. Official `float` + `height:0` plus editor `overflow-y:auto` lets a long phrase wrap and show a scrollbar. Empty editor must stay one line: `overflow-y:hidden` and `::before` `position:absolute; white-space:nowrap`.

Do not `setAttribute("data-placeholder", …)`. Tiptap Placeholder `Decoration.node` rewrites that attr on every transaction (focus/selection). A DOM clamp flashes, then the full phrase returns; CSS `text-overflow:clip` then silently crops the tail with no ellipsis.

`text-overflow:ellipsis` + `nowrap` clips at the glyph, not the word (`do f...`). `ellipsis-word` never shipped. `word-break:keep-all` is a no-op under `nowrap`.

Correct path:

- `heroOnlyOutsideProject` (BOOLEAN, default true; a missing key counts as true). Outside a project (`!route.workspaceId`) only the home greeting changes. `_phrases()` returns null, so `_inputPlaceholder()` leaves Grok's value alone and `paintInput()` clears the overlay. Project chats ignore the switch and always replace the input.
- With the switch off, non-project chats use the same phrase list. `_inputPlaceholder()` replaces a string with the first phrase and an array with the full list, so Grok's 8s `CyclingPlaceholderOverlay` rotates custom phrases. That overlay is `div.absolute.inset-0.pointer-events-none[aria-hidden=true]` (`whitespace-nowrap`), a sibling of the textarea, not `.tiptap::before`. Do not `paintInput()` `list[0]` while it is mounted — that stacks the first phrase on the cycling line. A one-item list or a string stays a static placeholder; the Tiptap overlay may clamp that string. Imagine always returns the original value; do not feed Imagine into `_phrases()` / `_inputPlaceholder()`.
- Logged-in home passes `query-bar-placeholder.tip.*` (first item: "Switch to Build Mode to create apps") into QueryBar as an array. The old `whats-on-your-mind` patch no longer exists in the bundle. QueryBar still funnels the normal placeholder through `voice-connecting-placeholder` → `eF`. TextareaEditor drops the native `placeholder` when that array has length > 1 and mounts the cycling overlay instead. Feeding the custom list there is what put a second phrase under the overlay in [20260923.9].
- Logged-out home is `LoggedOutHomeComposer`: a `<textarea placeholder>` string, not Tiptap. Patch that `placeholder:` argument.
- The home title is `HeroHeading`'s `h1`, not `WdRefreshHeading`. Stamp `data-void-ph-hero` there. Hero still paints from the stored phrase list and may wrap.
- `_phrases()` / `_inputPlaceholder()` keep the full phrase. Settings and the home Hero stay full text. Do not put a clamped string into `_phrases()` — resize and folder chips will not refresh the decoration.
- Measure the empty `p` (`clientWidth` of the `inset-inline:0` box) with a same-font, `white-space:nowrap` probe. A wrapping probe under-measures and the clamp bails out (`do for` with no `…`).
- `clampToWidth` drops whole trailing words and appends `…`. Do not cut inside a word.
- Paint the clamped string with `registerStyle("placeholderInput")` on the empty paragraph `::before { content:"…" !important }`, and set `.query-bar .tiptap::before { content:none }` in the same sheet so Grok's root-node placeholder cannot stack (`Askenot`). Do not paint it outside a project while `heroOnlyOutsideProject` is on, or while the cycling overlay is mounted. ResizeObserver plus `data-placeholder` / `class` mutations reschedule. Typing drops `is-editor-empty` and the overlay unregisters. Pages without a Tiptap editor skip the overlay; the QueryBar / LoggedOutHomeComposer patches cover those.
- Overlay and lock CSS only when the editor is wholly empty (`p.is-editor-empty` or `p.is-empty:only-child`). Tiptap `is-editor-empty` is the whole document; `is-empty` is this node. Official CSS for "placeholder only on an empty editor" is `p.is-editor-empty:first-child`. `p.is-empty:first-child` matches a blank first line after Enter (`1` on line two). Default `showOnlyCurrent` hangs `data-placeholder` on that node only after focus, so the overlay used to paint the phrase as `--fg-primary` body text. `::before` color is the official muted placeholder (`--fg-secondary`), not `--fg-primary`.
- Imagine (`page` starts with `imagine`, or pathname `/imagine`) uses `imaginePhrases` (short, one line) via the same overlay. Empty list keeps official `Type to imagine`. Do not feed Imagine into `_phrases()` / `_inputPlaceholder()`.

Do not touch ComposerOpacity, InputHistory, BetterCanvas, or real-input autosize for this.

## BetterQuotes

QuoteJump and QuoteSticky are one plugin. `jump.ts` scrolls; `sticky.ts` persists. `icon.ts` replaces the official composer quote chip's left text-block glyph with MessageSquareQuote while the plugin is on. Do not fold any of them into UserQuotes. Do not couple the icon swap to BetterQueue, the stop button, or the scroll math in `jump.ts`.

The in-message quote is `button[aria-label="Jump to quoted message"]` with class `group/quote`, a direct child of `#response-{childId}`. It is no longer wrapped by `[data-testid=user-message]`. Official click is `useScrollToResponse(sourceResponseId)`. Read `sourceResponseId` off the button fiber (the prop itself, or one object level, or `metadata.parentQuoteSource`), never the child `#response-*` id. If that source id exists, `preventDefault` and scroll `#response-{source}` with `pane.scrollTo` after hydrate. `useScrollToResponse` does not mount a virtual row. A quote with no `sourceResponseId` is not a button and has no `group/quote` class (`[20260926.21]`, host `response-6a0b9629`). `sentQuote` must still catch that short muted card inside `#response-*` (`whitespace-pre-wrap` plus `text-secondary` / `bg-surface`, or a flex row with an svg, height ≤ 160) when the host row's `parentQuotedText` matches. Do not require `[data-testid=user-message]`. Do not treat the message body as the card. `[20260926.22]` stamps `data-void-qj-preview` on that card only, and CSS sets `cursor: pointer` on the card and its children. Do not set it on `#response-*`. Do not wrap the card in a button. Do not use `ChatPageStore.quotedText` for a sent card. `propsId` only sees a top-level id and the UUID regex is unanchored, so `id="response-{child}"` must be stripped to the bare uuid and still must not be used as the source. An id is not the source unless visible text (not a jump button) contains the needle — `parentResponseId` is often the previous assistant turn, not the passage. Host pick uses the first 48 characters, else the longest line clip, over `clipLen / messageLen`. Score the visible body first, then the thought body. `0.08` only drops a long parent when a tighter mounted host exists — do not drop the only hit. A target after the citing child is not the source. Store text is `content.message`, then `content.query`, then `nodeToResponse`. Host pick still uses a 48-character clip. The highlight does not: match each `p` / `li` with whitespace and backticks stripped, and paint the whole block. A line clip that dies on a link or a `code` node must not drop the rest of the quote. Do not paint `td` / `th`. Do not paint a block shorter than 8 characters that is only a substring of a longer quote line. Scroll is not `ranges[0]`: group the painted blocks by a 240px vertical gap and scroll the first line of the longest cluster. If that line box is empty, scroll the message root with `getBoundingClientRect`, not `scrollIntoView`. `/project/` leaves `ResponseStore.byId` empty. Do not outline a host the needle missed.

Reverse (source → quotes) is a `.void-qj-back` badge on the source host, not a click on the message body. Selecting text there must still create a new quote. Anchor stays the `[20260926.16]` formula: `box.right - 28` and `Math.max(8, box.top + 8)` on `#response-*`. Do not move it onto a prose box or clamp it to `window.innerWidth` — `[20260926.17]` and `[20260926.18]` did, and the official Jump card plus the avatar menu stayed dead. The glyph is MessageSquareQuote, built with `createElementNS` inside `jump.ts`. Do not `import` `icon.ts` from `jump.ts`. Do not `innerHTML`. A count above 1 is a `.void-qj-count` child, not a replacement of the icon. `onClick` stays the `.16` gate. `/project/` keeps messages in `MessageStore.conversations[cid].nodes`; `ResponseStore.byId` can be empty, so do not scan only that store. A backlink requires non-empty `parentQuotedText`. The source id is `metadata.parentQuoteSource.sourceResponseId`, else `parentResponseId` — never a bare thread `parentId` with an empty quote. Mounted jump buttons and a live composer (`quotePopupData.responseId`, else `quotedText` inside the source body) are the same index. One cite jumps; more than one opens `.void-qj-menu`. Scroll the citing card with `pane.scrollTo`, not `scrollIntoView`. Host the badge on `document.body`. React will delete a child of `#response-*`.

The transcript is `[data-testid=chat-transcript-scroller]` (`data-transcript-renderer=plane`). Rows are `absolute` + `translateY`. `scrollIntoView` on `#response-*` no-ops. Scroll with `getBoundingClientRect()` (includes the transform) and `pane.scrollTo(scrollTop + delta)`. Do not call `scrollIntoView` on a response root. Only `metadata.parentQuoteSource.sourceResponseId` is a hard source. `parentResponseId` is the previous turn — `[20260926.24]` child `6a0b9629` had an empty `sourceResponseId` and `parentResponseId` `e7ca918c`, a mounted thought card whose body does not contain the quote. Do not `land` that id when `blobScore` is 0, and do not add `.void-qj-hit` to `#response-*` when `findRanges` is empty. Search the store for a non-citing message (`parentQuotedText` does not cover the needle), then instant-scroll until that row mounts. Do not treat a neighboring cite as the source.

Swap the official composer quote chip's leading glyph in place: same `<svg>`, MessageSquareQuote paths only. The official mark is the three-bar text block (horizontal `<line>`s or short `H` paths such as Lucide Menu). Do not treat an empty icon button or `line.length >= 2` as the dismiss X — `[20260923.23]` did, so `leadingSvg` skipped the bars and the chip stayed `≡`. The X is a crossing path or the right-hand glyph, never the leftmost bars. Watch `childList` and attribute `d`: React rewrites `d` on the same `<path>` nodes and a childList-only observer never repaints. Do not `display:none` the svg and do not insert a sibling — `[20260923.22]` collapsed the row and hid the X. The fallback `.void-qs-mark` uses the same svg. Imagine stays unpainted.

`quotedText` / `quotePopupData` are one global pair. There is no `quotedTextByConversationId`. Only drafts use `queryByConversationId`. After conversation hydrate the official composer does not remount a chip from `setQuotedText` plus a cloned popup. Persist UI is the fallback chip.

Snap (`saved` Map) dies only on explicit dismiss or `sendMessage` / `queueMessage` / `sendResponse` that carries a user body. Drop the snap before the host send returns, and keep a short `consumedUntil` so an empty `quotedText` cannot restore it. Do not `setQuotedText("")` or `setQuotePopupData(null)` on the Send pointerdown or composer Enter — Grok reads those fields when it builds the turn, and that read happens after pointerdown. Clear the store only after `sendMessage` / `queueMessage` / `sendResponse` returns. Do not require `parentQuotedText` on the payload — Grok may attach the quote from `ChatPageStore` and omit that field. A query-bar Send/Submit press and Enter in the composer (not Shift+Enter) drop the snap the same way, without clearing the store first. Do not `markConsumed` from `fetch` to `/rest/app-chat/conversations`. Nav draft-save POSTs the same shape (`message` / `text` / `fileAttachments` + `parentQuotedText`). During dest empty, `ownKey()` falls back to `lastKey` and that fetch would delete the outgoing chat's snap.

Remember as soon as `quotedText` is non-empty. Key is `conversationId`, or `pathCid` while the store id is still empty. Dest empty must still remember. Refusing remember is why the official chip looked fine until the first switch.

`destKey` for apply / `clearLive` is `conversationId` only. Do not fold in `optimisticConversationId`, path, or route agreement. Dest empty or path/store disagree: hide the chip, do not drop snap, do not `clearLive` (except a settled home with no path, route, or cid — then clear the live store so a blank composer does not keep the last quote). Path-first dest leaks the chip onto the next chat. Triple-source agreement plus `clearLive` on flicker drops the chip on switch-back.

Do not treat `lastText` as the only copy. After dest flips to B, lastText is wiped; the Map is source of truth. `stashOutgoing` after that wipe is a no-op.

Do not use `ownKey() = destKey() || lastKey` to drop snaps. During dest empty it points at the chat you just left.

Host the fallback as a sibling of `.query-bar` (form / composer shell / `document.body` overlay), never as a React child of the query bar. React remounts those children and deletes the node. Observer may re-paint only while dest has a snap.

`officialVisible` matching 12 chars inside `.query-bar` can hide the fallback when the draft editor still contains the quote snippet. Official chip will not be there after hydrate — do not treat that match as "chip already shown".

Do not wrap `setChatPageLoaded` to fight hydrate. That fought ModeSync. Restore on dest settle plus observer paint is enough.

Docked DevTools can collapse `innerHeight` and `visualViewport.height` to about 1px. Grok then `setState`s `quotedText` empty and calls `setConversationId` without going through `setQuotedText`. That frame is not navigation. While either height is under 80px, pin the snap, do not `clearLive`, and do not retarget `lastKey`. Restore when the viewport is tall again. A raw store subscription must remember a non-empty `quotedText`, because the setter wrapper never sees a `setState` write. `/project/` is not home: dest empty must not `clearLive` only because `pathCid()` is empty. Do not store the project id in `pathCid`. `officialVisible` must ignore the Tiptap editor and hidden nodes, or the fallback chip is removed while the official chip is already gone.

## BetterQueue

ModeSync and QueuePersist are one plugin. `mode.ts` captures each queued row's mode, paints the chip, and sends with that mode. `persist.ts` writes the same rows to IndexedDB key `queue-persist:v1` and replays them after refresh. Do not split them back into two plugins. Do not add a second `queueMessage` wrapper — `noteEnqueue` / `afterEnqueue` run inside the mode wrapper. Keep `Symbol.for("voidpp.modeSync.enqueueIntent")` and `Symbol.for("voidpp.modeSync.intent")`. Do not rename the IDB key or `.void-ms-*` classes.

Settings: `showQueueMode`, `stickyOnNavigate`, `persistAcrossRefresh`, all default on. First register migrates `plugins.ModeSync.enabled === false` onto the first two flags and `plugins.QueuePersist.enabled === false` onto `persistAcrossRefresh`, then deletes the old keys (and pin/star/known entries). Both old plugins explicitly off also turns BetterQueue off. Imagine stays skipped.

`qid` reads `queue_item_id` / `queueItemId`, then the same fields (and `.id`) on `.item`, then a top-level `.id` when the object is not a gateway envelope (`type` string). `idForRow` zips by index only when the row text matches that item (or the item text is still empty), and otherwise stamps `row:${body}`. A row must contain the Remove / Edit / Send now rail. Do not treat the header `span.line-clamp-2` ("Queued messages") as a row, and do not restore that `.line-clamp-2` fallback — `[20260923.25]` did, so the collapsed header grew a second chip. `aria-expanded="false"` paints nothing and strips chips inside the toggle. Keep `rail.before(chip)` on real rows. The chip menu marks the row, not the composer. Match `modeSlug` of `chip.dataset.mode` / `itemIntent` / `intent` / `liveIntent`, and also the chip `aria-label` / `title` against the choice label or `CATALOG`. Selected row is `.void-ms-qopt-on` with `aria-checked` and a check. Do not rely on `--fg-accent` alone — `[20260923.27]` did, so Build looked unselected.

Jump reads the chip text (including `.void-qs-chip`). It does not need the official chip. Click-to-line uses `Range.getClientRects()[0]` plus visual viewport mid-Y, not `scrollIntoView` on the message root.

Settings: `jumpToPassage` and `persistAcrossChats`, both default on. First register migrates `plugins.QuoteJump.enabled === false` and `plugins.QuoteSticky.enabled === false` onto those flags, then deletes the old keys (and pin/star entries) before orphan prune. Both old plugins explicitly off also turns BetterQuotes off.

Regression table:

- 22.15 path-first dest — leak onto the next chat
- 22.16 three-source dest + `clearLive` on disagree — loss on switch-back
- 22.17 store dest + dest empty refuses remember + fetch consume — loss on switch-back
- 22.18 `conversationId` dest, remember on any `quotedText`, no fetch consume, sibling host — persist without leak
- 25.13 DevTools viewport collapses to 1px and `setState` clears `quotedText` — loss on console toggle
- 26.9 send clears `quotedText`; 25.13 restore treated that as a hydrate gap — leftover chip after send
- 26.9 source → quote used `ResponseStore` only — no badge on `/project/` where `byId` is empty
- 26.9 `pickMessage` trusted `parentResponseId` — Jump outlined the previous turn when the passage lived on an older message
- 26.9 Send `pointerdown` cleared `quotedText` before Grok built the turn — official quote was not sent
- 26.10 numbered lines: quote text drops `1.` / `2.` while the passage keeps them, so the first 48 characters miss and Jump outlines the previous turn
- 26.11 newest-first + short line clips — Jump landed on a later turn that embedded the same quote
- 26.12 coverage floor `0.08` plus `preventDefault` — official Jump did nothing when the only hit was a long parent or an unmounted source
- 26.13 `findRange` returned the first 48-character clip inside one text node — a numbered quote lit only one middle line
- 26.14 line clips skipped a spaced intro and a `code` line — only list items 1 and 2 lit
- 26.15 `ranges[0]` was a 5-character table cell — Jump scrolled to the message top instead of the numbered passage
- 26.23 three cites of one passage — `pickMessage` landed on the nearer card while `#response-{source}` was unmounted
- 26.24 empty `sourceResponseId` — `parentResponseId` outlined the previous turn (`e7ca918c`) that did not contain the quote
