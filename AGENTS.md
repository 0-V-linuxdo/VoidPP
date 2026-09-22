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

## Placeholder

Query-bar empty placeholder is Tiptap `p.is-editor-empty::before { content: attr(data-placeholder) }`. Official `float` + `height:0` plus editor `overflow-y:auto` lets a long phrase wrap and show a scrollbar. Empty editor must stay one line: `overflow-y:hidden` and `::before` `position:absolute; white-space:nowrap`.

Do not `setAttribute("data-placeholder", …)`. Tiptap Placeholder `Decoration.node` rewrites that attr on every transaction (focus/selection). A DOM clamp flashes, then the full phrase returns; CSS `text-overflow:clip` then silently crops the tail with no ellipsis.

`text-overflow:ellipsis` + `nowrap` clips at the glyph, not the word (`do f...`). `ellipsis-word` never shipped. `word-break:keep-all` is a no-op under `nowrap`.

Correct path:

- Home (`page === "main"` and no `workspaceId`) and other non-project chats keep Grok's short query-bar placeholders. `_phrases()` / `_inputPlaceholder()` / `placeholderInput` run only when `workspaceId` is set. Feeding a custom long phrase into the home query-bar stacks Grok's root-node `::before` on top of the paragraph overlay (`Askenot`). Hero still paints from the stored phrase list and may wrap.
- `_phrases()` / `_inputPlaceholder()` keep the full phrase. Settings and the home Hero stay full text. Do not put a clamped string into `_phrases()` — resize and folder chips will not refresh the decoration.
- Measure the empty `p` (`clientWidth` of the `inset-inline:0` box) with a same-font, `white-space:nowrap` probe. A wrapping probe under-measures and the clamp bails out (`do for` with no `…`).
- `clampToWidth` drops whole trailing words and appends `…`. Do not cut inside a word.
- Paint the clamped string with `registerStyle("placeholderInput")` on `::before { content:"…" !important }` (same overlay idea as the Hero). ResizeObserver plus `data-placeholder` / `class` mutations reschedule. Typing drops `is-editor-empty` and the overlay unregisters. Leaving a project unregisters the overlay.
- Overlay and lock CSS only when the editor is wholly empty (`p.is-editor-empty` or `p.is-empty:only-child`). Tiptap `is-editor-empty` is the whole document; `is-empty` is this node. Official CSS for "placeholder only on an empty editor" is `p.is-editor-empty:first-child`. `p.is-empty:first-child` matches a blank first line after Enter (`1` on line two). Default `showOnlyCurrent` hangs `data-placeholder` on that node only after focus, so the overlay used to paint the phrase as `--fg-primary` body text. `::before` color is the official muted placeholder (`--fg-secondary`), not `--fg-primary`.
- Imagine (`page` starts with `imagine`, or pathname `/imagine`) uses `imaginePhrases` (short, one line) via the same overlay. Empty list keeps official `Type to imagine`. Do not feed Imagine into `_phrases()` / `_inputPlaceholder()`.

Do not touch ComposerOpacity, InputHistory, BetterCanvas, or real-input autosize for this.

## QuoteSticky

`quotedText` / `quotePopupData` are one global pair. There is no `quotedTextByConversationId`. Only drafts use `queryByConversationId`. After conversation hydrate the official composer does not remount a chip from `setQuotedText` plus a cloned popup. Persist UI is the fallback chip.

Snap (`saved` Map) dies only on explicit dismiss or `sendMessage` / `queueMessage` that carries a user body. Do not `markConsumed` from `fetch` to `/rest/app-chat/conversations`. Nav draft-save POSTs the same shape (`message` / `text` / `fileAttachments` + `parentQuotedText`). During dest empty, `ownKey()` falls back to `lastKey` and that fetch would delete the outgoing chat's snap.

Remember as soon as `quotedText` is non-empty. Key is `conversationId`, or `pathCid` while the store id is still empty. Dest empty must still remember. Refusing remember is why the official chip looked fine until the first switch.

`destKey` for apply / `clearLive` is `conversationId` only. Do not fold in `optimisticConversationId`, path, or route agreement. Dest empty or path/store disagree: hide the chip, do not drop snap, do not `clearLive` (except a settled home with no path, route, or cid — then clear the live store so a blank composer does not keep the last quote). Path-first dest leaks the chip onto the next chat. Triple-source agreement plus `clearLive` on flicker drops the chip on switch-back.

Do not treat `lastText` as the only copy. After dest flips to B, lastText is wiped; the Map is source of truth. `stashOutgoing` after that wipe is a no-op.

Do not use `ownKey() = destKey() || lastKey` to drop snaps. During dest empty it points at the chat you just left.

Host the fallback as a sibling of `.query-bar` (form / composer shell / `document.body` overlay), never as a React child of the query bar. React remounts those children and deletes the node. Observer may re-paint only while dest has a snap.

`officialVisible` matching 12 chars inside `.query-bar` can hide the fallback when the draft editor still contains the quote snippet. Official chip will not be there after hydrate — do not treat that match as "chip already shown".

Do not wrap `setChatPageLoaded` to fight hydrate. That fought ModeSync. Restore on dest settle plus observer paint is enough.

QuoteJump reads the chip text (including `.void-qs-chip`). It does not need the official chip. Click-to-line uses `Range.getClientRects()[0]` plus visual viewport mid-Y, not `scrollIntoView` on the message root. Do not couple QuoteSticky persist fixes to ModeSync, the stop button, or that scroll math.

Regression table:

- 22.15 path-first dest — leak onto the next chat
- 22.16 three-source dest + `clearLive` on disagree — loss on switch-back
- 22.17 store dest + dest empty refuses remember + fetch consume — loss on switch-back
- 22.18 `conversationId` dest, remember on any `quotedText`, no fetch consume, sibling host — persist without leak
