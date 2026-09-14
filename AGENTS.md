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
