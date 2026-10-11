---
name: wrap-up
description: >
  收尾 for Void++. After a userscript change is on the dev branch, use Helium
  DevTools to update the installed Violentmonkey script and check the live
  effect on the user's Grok tab before saying the work is done. Use this
  whenever the user says 收尾, 更新脚本, 检查效果, 看效果, 应用到页面, or
  "update the script and check", and after every dev push of
  userscript/VoidPP.user.js. Do not use it to design the change, and do not
  promote voidpp-beta or voidpp-stable.
---

# wrap-up

收尾 is one loop: the copy Violentmonkey will inject is the version you mean, then the Grok tab the user is looking at is actually running it, then the change is visible. Do not ask the user to update or reload.

Channel policy stays in `AGENTS.md`. This skill does not build, bump `VERSION_DATE`, or push. It starts from a `dev` userscript that is already on GitHub.

## 1. Know the target

Read `userscript/VoidPP.meta.js` on `dev` (or the commit you just pushed). Record `@version` (plain numeric, never `[20261011.3]`), `@namespace` (`https://github.com/0-V-linuxdo/VoidPP/dev` for daily work), and `@environment` (`Development`).

Confirm GitHub raw is that body before blaming Violentmonkey. `curl` the meta URL. Raw sends `Cache-Control: max-age=300` and `Content-Security-Policy: sandbox`. Do not open that URL in a tab — the install intercept never runs and the tab only shows source. The extension's own fetch is not subject to that CSP.

## 2. Read the installed script

Helium only. The manager is Violentmonkey 2.49, Chrome id `jinjaccalgkegednnccohejagnlnfdag`, title 暴力猴.

`new_page` this URL. Extension pages often do not show up in `list_pages`. The page `new_page` just opened is still the selected context for `evaluate_script`. The user clicks around, so selection drifts. Every evaluate must check `location.href` first and bail if it is not this extension page.

```
chrome-extension://jinjaccalgkegednnccohejagnlnfdag/options/index.html
```

Do not `CheckUpdate` across every script. This profile has hundreds. An unbounded check times out the tool, and `force: true` rewrites scripts that did not change.

On the options page, find the `Void++` row (sort 最近更新; it sits at the top right after a push). The row link is `#scripts/<id>`. Then:

```js
const got = await chrome.storage.local.get("code:" + id);
const code = got["code:" + id];
```

`GetData` is `{ cmd: "GetData", data: { id } }` and returns `{ scripts: [{ meta, props, config }] }`. Its `code` field is empty. The body lives in `chrome.storage.local` under `code:<id>`.

Pass only if all of these match the target:

- `meta.version` and the `@version` inside `code:<id>`
- `meta.namespace` is `https://github.com/0-V-linuxdo/VoidPP/dev`
- `meta.downloadURL` / `meta.updateURL` are the `dev` raw userscript URL
- `config.enabled` is `1`
- the new patch text is in `code:<id>` (the `find` string, not just the plugin name)

If the list already shows that version, skip `CheckUpdate`.

## 3. Update only when it is behind

Call this, with the one id, and no `force`:

```js
await chrome.runtime.sendMessage({
  cmd: "CheckUpdate",
  data: { ids: [id] },
})
```

Violentmonkey writes a script only when `@version` is newer. A result of 0 means the installed version is already equal or newer, or raw is still the cached body. Re-read `code:<id>`. Do not reload Grok on the old body. Do not pass `force: true`.

## 4. Reload one Grok tab

Hard-reload only the Grok chat this change is for (the Void++ tab group, the conversation the user is in). Do not reload a different `grok.com` tab. `select_page` on that id immediately before `navigate_page` `{ type: "reload", ignoreCache: true }`. Confirm the href in the next evaluate. If the user focused another tab, select again. Do not bring a random tab forward unless selection will not stick.

`GM_info` is not on the page. The running build is `window.VoidPP.plugins`. After reload the plugin must be `started`, and `patches[0].find` must be the new anchor (the string you put in source). A plugin object left over from the previous document is not success.

## 5. Check the effect

Decide the visible result from the change, then look at that surface. Snapshot or screenshot the control. For a collapse, the closed control is on screen and the expanded list is not. A plugin that merely exists in `window.VoidPP.plugins` is not the effect.

Ignore console noise that is not this patch: sandboxed `about:blank`, other userscripts' bad `@match` patterns, and Grok's own 500s. A new exception whose stack is the patch fails the wrap-up.

## 6. Report

Say the installed `@version`, that the namespace is `dev`, which chat you reloaded, and what the page showed. Give the raw dev URL only if this turn also pushed. Do not claim success from the options list alone.

Stop if the Grok tab for this change is not open. Do not reload a stand-in chat and call that the effect.
