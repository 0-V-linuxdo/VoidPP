# <img src="assets/logos/app-icon/voidpp-icon.svg" width="32" height="32" alt="Void++"> Void++

[English](README.md) · [中文](README.zh.md)

## 安装

[![Install userscript](https://img.shields.io/badge/安装-用户脚本-00d26a?style=for-the-badge)](https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp/userscript/VoidPP.user.js)

点徽章安装（jsDelivr，避开 GitHub Raw 的 `CSP: sandbox`，否则只会看到源码、弹不出更新对话框）。Tampermonkey 后台自动更新仍走 GitHub raw 的 `userscript/VoidPP.user.js`（`@updateURL`，5 分钟缓存）。

## 变更

### 新增

#### 插件

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | 开 | 上游已有该插件；Void++ 改为默认打开。隐藏升级提示、首页横幅、输入栏 SuperGrok 标记，以及锁定模型。 |
| <img src="https://api.iconify.design/lucide/history.svg?color=%238b949e" width="16" height="16" alt=""> InputHistory | 开 | 在输入框用 ↑ / ↓ 翻看历史提示词，类似终端。 |
| <img src="https://api.iconify.design/lucide/bot-off.svg?color=%238b949e" width="16" height="16" alt=""> NoGrokBot | 开 | 隐藏右上角 Grok Bot 推广按钮。 |
| <img src="https://api.iconify.design/lucide/user-round-x.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarIdentity | 开 | 分开开关，隐藏侧栏和账号菜单里的用户名 / 邮箱。头像保留，账号菜单仍可打开。 |
| <img src="https://api.iconify.design/lucide/app-window.svg?color=%238b949e" width="16" height="16" alt=""> ChatStateFavicons | 开 | 标签页图标反映会话状态（streaming / done / ready / error），五种叠层样式。 |
| <img src="https://api.iconify.design/lucide/link-2-off.svg?color=%238b949e" width="16" height="16" alt=""> NoShareLink | 开 | 分开开关，隐藏「分享项目」和「创建分享链接」。 |
| <img src="https://api.iconify.design/lucide/mic-off.svg?color=%238b949e" width="16" height="16" alt=""> NoDictation | 开 | 隐藏输入栏语音按钮。可选隐藏设置弹窗 Behavior 里的 Dictation Refinement。 |
| <img src="https://api.iconify.design/lucide/circle-gauge.svg?color=%238b949e" width="16" height="16" alt=""> UsageDisplay | 开 | 聊天栏显示官方 SuperGrok 周用量。可选日统计（`usageStats`，默认关）：悬停先看本周，再看今日；点击打开按日历史。 |
| <img src="https://api.iconify.design/lucide/text-cursor-input.svg?color=%238b949e" width="16" height="16" alt=""> Placeholder | 关 | 替换输入框轮换占位文案。 |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | 开 | 工程栏滚动条跟随主题（`themedScrollbar`，默认开）。可选保持右侧栏关闭（`hideRightPanel`，默认关）。 |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> BetterNavigator | 开 | 把原生消息导航升级成 Notion 式目录。悬停 tick 可同时看到全部消息；一轮对话和右侧栏打开时也会显示（`showAssistant`、`jumpEffect`）。 |
| <img src="https://api.iconify.design/lucide/blend.svg?color=%238b949e" width="16" height="16" alt=""> ComposerOpacity | 开 | 调节输入栏背景透明度和模糊。 |
| <img src="https://api.iconify.design/lucide/layout-grid.svg?color=%238b949e" width="16" height="16" alt=""> RecentTopics | 开 | Ctrl+` 切换最近会话（玻璃卡片、项目名、上轮问答预览）。 |
| <img src="https://api.iconify.design/lucide/minimize-2.svg?color=%238b949e" width="16" height="16" alt=""> CompactModeSelect | 开 | 输入栏模型按钮始终只显示图标，宽屏也不展开成文字。 |
| <img src="https://api.iconify.design/lucide/text-quote.svg?color=%238b949e" width="16" height="16" alt=""> UserQuotes | 开 | 自己气泡里的引用行画出可见左竖条，避免 `>` 被 markdown 吃掉后看起来像消失。 |
| <img src="https://api.iconify.design/lucide/blocks.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarPlugins | 开 | 把侧栏 Plugins 按钮挪到头像折叠菜单（Void++ / Help 旁边）。 |
| <img src="https://api.iconify.design/lucide/panel-left.svg?color=%238b949e" width="16" height="16" alt=""> BetterSidebar | 开 | 侧栏增强：分组标题按钮仅在悬停该分组时显示，Chats 标题增加 New chat 加号，Bots/Projects 分区默认折叠，Chats 分区默认展开（`titleRowHover`、`chatsPlus`、`botsDefaultCollapsed`、`chatsDefaultExpanded`、`projectsDefaultCollapsed`）。 |

#### 设置 UI

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/pin.svg?color=%238b949e" width="16" height="16" alt=""> 插件置顶 | — | 把插件卡片钉在当前分类顶部。 |
| <img src="https://api.iconify.design/lucide/star.svg?color=%238b949e" width="16" height="16" alt=""> 插件收藏 | — | 星标收藏插件；插件页默认进入 Favorites。分类：Favorites / Recent（近 7 天更新）/ All / Chat / UI / Privacy / Other。 |

### 修复

#### 插件

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | 开 | 模型选择器里再次隐藏不可用 / 锁定模型。 |

#### 设置 UI

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/settings-2.svg?color=%238b949e" width="16" height="16" alt=""> 设置 / 图标 | — | Grok 设置侧栏中的 Void++ 标签。头像菜单 Void++ 行使用 16px V++ 字形；脚本 `@icon` 与应用磁贴为同一标记。插件浮层显示各插件图标。 |
| <img src="https://api.iconify.design/lucide/panel-bottom.svg?color=%238b949e" width="16" height="16" alt=""> 聊天栏按钮 | — | Grok 去掉 `ButtonWithTooltipOptimized` 后，聊天栏 Void++ 按钮已恢复。 |

### 删除

#### 插件

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/gauge.svg?color=%238b949e" width="16" height="16" alt=""> RateLimitDisplay | — | Grok 积分规则变更后，旧的按模式速率读数失效，已移除。周用量改由 UsageDisplay 承担。 |
| <img src="https://api.iconify.design/lucide/plus.svg?color=%238b949e" width="16" height="16" alt=""> SidebarHeaderHover | — | 已并入 BetterSidebar（`titleRowHover`、`chatsPlus`）。 |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> ThemedScrollbar | — | 已并入 BetterCanvas。 |
| <img src="https://api.iconify.design/lucide/panel-right-close.svg?color=%238b949e" width="16" height="16" alt=""> NoRightPanel | — | 已并入 BetterCanvas。 |
