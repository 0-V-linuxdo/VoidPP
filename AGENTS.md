# Void++

Follow `.rules`. Extra constraint for this fork:

## Push

Working line is `voidpp` only. The `Void++` branch is retired — do not recreate or fast-forward it. `upstream-main` is the frozen upstream snapshot; do not treat it as a publish line.

Canonical **auto-update** URL (both `@downloadURL` and `@updateURL` — GitHub raw, `max-age=300`):

`https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/voidpp/userscript/VoidPP.user.js`

Canonical **click-to-install / click-to-update** URL (README badge — jsDelivr `@heads/voidpp`, no `CSP: sandbox`):

`https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp/userscript/VoidPP.user.js`

Do not point the README badge at `raw.githubusercontent.com`. That origin sends `Content-Security-Policy: sandbox`, so Chrome MV3 Tampermonkey never intercepts the `.user.js` navigation and the tab just dumps source. Do not use `main`, `Void++`, `userscript/Void.user.js`, or jsDelivr `@voidpp` (no `heads/` — 404). Tampermonkey auto-update follows whatever `@updateURL` is already baked into the installed copy; keep that on GitHub raw so a 7-day CDN cache cannot hide a VERSION_DATE bump.

Before any push to `voidpp`:

1. Run `bun run build` so `userscript/VoidPP.user.js` is regenerated.
2. Commit that userscript with the matching source. Do not push source-only.
3. Confirm the userscript header:
   - `// @version` matches `VERSION_DATE` in `build.ts`. Tampermonkey only reads that header — bumping `build.ts` alone leaves the bundle stale (source `.20` / userscript `.19`) and Check for updates will not fire.
   - `@downloadURL` and `@updateURL` are exactly the canonical raw URL above.
4. README install badges are the jsDelivr click URL above, not GitHub raw.
5. Purge jsDelivr for the canonical file only (so the badge is not a week behind):
   `curl -s https://purge.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp/userscript/VoidPP.user.js`

Do not write `userscript/Void.user.js`. The hop is gone. Old Tampermonkey installs that already ate `[20260911.8]` or `[20260911.9]` follow `@updateURL` to `VoidPP.user.js`. Anyone still on a pre-hop `@updateURL` must reinstall from the canonical file.

Tampermonkey `@version` must stay plain numeric (`20260922.18`), never `[20260922.18]`. Bracketed versions parse as equal and Check for updates will not fire.

## Runtime ids

Canonical:

- `window.VoidPP` (`window.Void` stays the same object; do not drop the alias)
- IndexedDB `VoidPP` — read `Void` once, copy, delete the old database. Never write `Void` after `[20260912]`
- Settings key `VoidPPSettings` — read `VoidSettings` once, flush to the new key, delete the old key. Never write `VoidSettings` after `[20260912]`
- Cookie bridge `voidpp-cookies`
- Settings tab ids `voidpp_*_tab` and nav group `voidpp`

Do not rename:

- Firefox id `firefox@void.prism`
- CSS / dataset prefix `void-`
- AccountSwitcher crypto key `VoidCryptoRootHKDF`
- `@name Void++` / `@namespace https://github.com/0-V-linuxdo/VoidPP`

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

Swap the official composer quote chip's leading glyph in place: same `<svg>`, MessageSquareQuote paths only. The official mark is the three-bar text block (horizontal `<line>`s or short `H` paths such as Lucide Menu). Do not treat an empty icon button or `line.length >= 2` as the dismiss X — `[20260923.23]` did, so `leadingSvg` skipped the bars and the chip stayed `≡`. The X is a crossing path or the right-hand glyph, never the leftmost bars. Watch `childList` and attribute `d`: React rewrites `d` on the same `<path>` nodes and a childList-only observer never repaints. Do not `display:none` the svg and do not insert a sibling — `[20260923.22]` collapsed the row and hid the X. The fallback `.void-qs-mark` uses the same svg. Imagine stays unpainted.

`quotedText` / `quotePopupData` are one global pair. There is no `quotedTextByConversationId`. Only drafts use `queryByConversationId`. After conversation hydrate the official composer does not remount a chip from `setQuotedText` plus a cloned popup. Persist UI is the fallback chip.

Snap (`saved` Map) dies only on explicit dismiss or `sendMessage` / `queueMessage` that carries a user body. Do not `markConsumed` from `fetch` to `/rest/app-chat/conversations`. Nav draft-save POSTs the same shape (`message` / `text` / `fileAttachments` + `parentQuotedText`). During dest empty, `ownKey()` falls back to `lastKey` and that fetch would delete the outgoing chat's snap.

Remember as soon as `quotedText` is non-empty. Key is `conversationId`, or `pathCid` while the store id is still empty. Dest empty must still remember. Refusing remember is why the official chip looked fine until the first switch.

`destKey` for apply / `clearLive` is `conversationId` only. Do not fold in `optimisticConversationId`, path, or route agreement. Dest empty or path/store disagree: hide the chip, do not drop snap, do not `clearLive` (except a settled home with no path, route, or cid — then clear the live store so a blank composer does not keep the last quote). Path-first dest leaks the chip onto the next chat. Triple-source agreement plus `clearLive` on flicker drops the chip on switch-back.

Do not treat `lastText` as the only copy. After dest flips to B, lastText is wiped; the Map is source of truth. `stashOutgoing` after that wipe is a no-op.

Do not use `ownKey() = destKey() || lastKey` to drop snaps. During dest empty it points at the chat you just left.

Host the fallback as a sibling of `.query-bar` (form / composer shell / `document.body` overlay), never as a React child of the query bar. React remounts those children and deletes the node. Observer may re-paint only while dest has a snap.

`officialVisible` matching 12 chars inside `.query-bar` can hide the fallback when the draft editor still contains the quote snippet. Official chip will not be there after hydrate — do not treat that match as "chip already shown".

Do not wrap `setChatPageLoaded` to fight hydrate. That fought ModeSync. Restore on dest settle plus observer paint is enough.

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
