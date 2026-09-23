# <img src="assets/logos/app-icon/voidpp-icon.svg" width="32" height="32" alt="Void++"> Void++

[English](README.md) · [中文](README.zh.md)

## 安装

[![Install userscript](https://img.shields.io/badge/安装-用户脚本-00d26a?style=for-the-badge)](https://cdn.jsdelivr.net/gh/0-V-linuxdo/VoidPP@heads/voidpp/userscript/VoidPP.user.js)

点徽章安装（jsDelivr 默认 `voidpp` 分支，避开 GitHub Raw 的 `CSP: sandbox`）。Tampermonkey 自动更新走 GitHub raw 的 `userscript/VoidPP.meta.js`（`@updateURL`）。

## 变更

### 新增

#### 插件

| 功能 | 默认 | 说明 |
| --- | --- | --- |
| <img src="https://api.iconify.design/lucide/brush-cleaning.svg?color=%238b949e" width="16" height="16" alt=""> Cleaner | 开 | 上游已有该插件；Void++ 改为默认打开。隐藏升级提示、首页横幅、输入栏 SuperGrok 标记、锁定模型，以及 Imagine 页 Upgrade 按钮（`hideImagineUpgrade`）。 |
| <img src="https://api.iconify.design/lucide/images.svg?color=%238b949e" width="16" height="16" alt=""> BetterImagine | 关 | Imagine 增强：收藏筛选/排序/搜索、悬停播放、隐藏审核内容、批量超分与复制、智能文件名。`hideDefaultPreviews` 隐藏首页模板（默认关）。快捷键 i/v/r 仅在收藏页生效。 |
| <img src="https://api.iconify.design/lucide/history.svg?color=%238b949e" width="16" height="16" alt=""> InputHistory | 开 | 在输入框用 ↑ / ↓ 翻看历史提示词，类似终端。可选 `separateImagine` 把 Imagine 提示词单独存一份。 |
| <img src="https://api.iconify.design/lucide/bot-off.svg?color=%238b949e" width="16" height="16" alt=""> NoGrokBot | 开 | 隐藏右上角 Grok Bot 推广按钮。 |
| <img src="https://api.iconify.design/lucide/user-round-x.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarIdentity | 开 | 分开开关，隐藏侧栏和账号菜单里的用户名 / 邮箱。头像保留，账号菜单仍可打开。 |
| <img src="https://api.iconify.design/lucide/user-round-pen.svg?color=%238b949e" width="16" height="16" alt=""> CustomSidebarIdentity | 关 | 替换侧栏头像和显示名。留空则保持官方。Avatar Url 支持粘贴图片或填 `https://` / `data:image`，圆形台可拖拽/缩放裁切。`avatarSize` 可调展开侧栏头像直径（24–64px，默认 40）。折叠轨仍为 32。可选 `applyToMenu` 同时改账号下拉顶栏。 |
| <img src="https://api.iconify.design/lucide/app-window.svg?color=%238b949e" width="16" height="16" alt=""> ChatStateFavicons | 开 | 标签页图标反映会话状态（streaming / done / ready / error），五种叠层样式。 |
| <img src="https://api.iconify.design/lucide/link-2-off.svg?color=%238b949e" width="16" height="16" alt=""> NoShareLink | 开 | 分开开关，隐藏「分享项目」和「创建分享链接」。 |
| <img src="https://api.iconify.design/lucide/mic-off.svg?color=%238b949e" width="16" height="16" alt=""> NoDictation | 开 | 隐藏输入栏语音按钮。可选隐藏设置弹窗 Behavior 里的 Dictation Refinement。 |
| <img src="https://api.iconify.design/lucide/circle-gauge.svg?color=%238b949e" width="16" height="16" alt=""> UsageDisplay | 开 | 聊天栏显示官方 SuperGrok 周用量（聊天和 Imagine）。可选日统计（`usageStats`，默认关）：悬停先看本周，再看今日；点击打开按日历史。 |
| <img src="https://api.iconify.design/lucide/text-cursor-input.svg?color=%238b949e" width="16" height="16" alt=""> Placeholder | 关 | 替换非 Project 首页问候语。项目外默认不换输入框（`heroOnlyOutsideProject`，默认开）。Project 聊天仍用第一句。问候语轮播：进入首页 / 定时 / 点击标题（`mode`、`order`、`intervalSec`）。可选 `imaginePhrases` 用于 Imagine 输入框。 |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | 开 | 工程栏和 Imagine masonry 滚动条跟随主题（`themedScrollbar`，默认开）。可选保持右侧栏关闭（`hideRightPanel`，默认关）。 |
| <img src="https://api.iconify.design/lucide/scroll-text.svg?color=%238b949e" width="16" height="16" alt=""> BetterNavigator | 开 | 把原生消息导航升级成 Notion 式目录。悬停 tick 可看到当前分支的全部消息，含尚未挂载的历史；正在输出的回答以虚线保留，悬停目录相对轨道垂直居中。一轮对话和右侧栏打开时钉在聊天列上。输入框外 ↑/↓ 按目录逐条跳转（`showAssistant`、`hideNativeHover`、`jumpEffect`）。 |
| <img src="https://api.iconify.design/lucide/blend.svg?color=%238b949e" width="16" height="16" alt=""> ComposerOpacity | 开 | 调节输入栏背景透明度和模糊。 |
| <img src="https://api.iconify.design/lucide/layout-grid.svg?color=%238b949e" width="16" height="16" alt=""> RecentTopics | 开 | Ctrl+` 切换最近会话（玻璃卡片、项目名、上轮问答预览）。 |
| <img src="https://api.iconify.design/lucide/minimize-2.svg?color=%238b949e" width="16" height="16" alt=""> CompactModeSelect | 开 | 输入栏模型按钮始终只显示图标，宽屏也不展开成文字。 |
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> ModeSync | 开 | 队列每条显示模式芯片，发出去用该条入队时的模型，点芯片可改。切会话保持 picker，直到 load-responses 结束（`stickyOnNavigate`、`showQueueMode`）。 |
| <img src="https://api.iconify.design/lucide/rotate-ccw.svg?color=%238b949e" width="16" height="16" alt=""> QueuePersist | 开 | 刷新后把本机未发送的排队消息灌回官方队列。 |
| <img src="https://api.iconify.design/lucide/text-quote.svg?color=%238b949e" width="16" height="16" alt=""> UserQuotes | 开 | 自己气泡里的引用行画出可见左竖条，避免 `>` 被 markdown 吃掉后看起来像消失。 |
| <img src="https://api.iconify.design/lucide/message-square-quote.svg?color=%238b949e" width="16" height="16" alt=""> QuoteSticky | 开 | 切到其他会话再切回来时，保留输入框上的引用条。 |
| <img src="https://api.iconify.design/lucide/text-search.svg?color=%238b949e" width="16" height="16" alt=""> QuoteJump | 开 | 点输入框引用芯片（或已发送的引用卡）滚到被引原文，而不是只停在那条消息顶部。 |
| <img src="https://api.iconify.design/lucide/blocks.svg?color=%238b949e" width="16" height="16" alt=""> NoSidebarPlugins | 开 | 把侧栏 Plugins 按钮挪到头像折叠菜单（Void++ / Help 旁边）。 |
| <img src="https://api.iconify.design/lucide/lightbulb.svg?color=%238b949e" width="16" height="16" alt=""> NoBuildStarters | 开 | 隐藏 Build 模式输入框上方的 Ideas 胶囊栏。 |
| <img src="https://api.iconify.design/lucide/circle-check.svg?color=%238b949e" width="16" height="16" alt=""> CompleteToast | 开 | 后台会话完成后弹出 toast，点击打开。可选 `keepUntilDismissed`：一直留到点 X 或打开该会话。可选 `imagineGeneration`（默认关）在离开 Imagine 时提示生成完成。 |
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
| <img src="https://api.iconify.design/lucide/list-ordered.svg?color=%238b949e" width="16" height="16" alt=""> ModeSync | 开 | 出队按这一行记住的模型发送，不再用上一轮写回的选择器。 |
| <img src="https://api.iconify.design/lucide/frame.svg?color=%238b949e" width="16" height="16" alt=""> BetterCanvas | 开 | 保持右侧栏关闭。关闭动作不在 store 快照上时不再把插件启动打死。 |

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
