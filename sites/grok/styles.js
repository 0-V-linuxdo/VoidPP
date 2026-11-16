// Grok 适配的样式:把框架界面的 --uspp-* 配色映射到 Grok 自己的变量,另加聊天栏按钮的样式
export const GROK_CSS = `
:root, :root[data-uspp-theme] { --uspp-surface-base:var(--surface-base);--uspp-surface-l1:var(--surface-l1);--uspp-surface-l2:var(--surface-l2);--uspp-surface-l3:var(--surface-l3);--uspp-fg-primary:var(--fg-primary);--uspp-fg-secondary:var(--fg-secondary);--uspp-fg-tertiary:var(--fg-tertiary);--uspp-fg-danger:var(--fg-danger);--uspp-border-l1:var(--border-l1);--uspp-border-l2:var(--border-l2);--uspp-ring:var(--ring);--uspp-button-ghost-hover:var(--button-ghost-hover); }
.uspp-chatbar { display: inline-flex; align-items: center; gap: 2px; }
.uspp-chatbar-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 9999px; border: none; background: transparent; color: var(--uspp-fg-secondary); cursor: pointer; font: inherit; }
.uspp-chatbar-btn:hover:not(:disabled) { background: var(--uspp-button-ghost-hover); color: var(--uspp-fg-primary); }
.uspp-chatbar-btn[data-active="true"] { color: var(--uspp-fg-primary); background: var(--uspp-button-ghost-hover); }
.uspp-chatbar-btn:disabled { opacity: .4; cursor: default; }
.uspp-popover { position: fixed; z-index: 2147483001; min-width: 160px; padding: 8px; border-radius: 14px; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); box-shadow: 0 8px 32px rgb(0 0 0 / .25); }
[data-sonner-toast] [data-title] { font-weight: 400; }
.void-settings-menu-icon { width: var(--grok-icon-size, 16px); height: var(--grok-icon-size, 16px); color: var(--fg-secondary, var(--grok-text-secondary)); flex-shrink: 0; }
[role="menu"] :is([role="menuitem"], [role="menuitemradio"]) > span:first-child svg, [role="menu"] :is([role="menuitem"], [role="menuitemradio"]) > svg { color: var(--fg-secondary, var(--grok-text-secondary)) !important; }
.void-menu-glyph-gap { width: 1rem; height: 1rem; margin-inline-end: 0.5rem; }
.void-settings-sep { height: 1px; width: 100%; margin: 0.25rem 0; border: 0; background: var(--border-l1, var(--grok-border-l1, var(--border))); }
.void-native-input { box-sizing: border-box; height: 2rem; padding: 0 0.625rem; border-radius: 0.5rem; border: 1px solid var(--border-l1, var(--grok-border-l1, var(--border))); background: transparent; color: var(--fg-primary, var(--grok-text-primary)); font: inherit; outline: none; }
.void-native-input:focus, .void-native-input:focus-visible { border-color: var(--border-l2, var(--fg-secondary)); }
.void-settings-nav-icon { width: 18px; height: 18px; display: block; flex-shrink: 0; color: inherit; pointer-events: none; }
button[data-settings-tab]:not([data-settings-tab^="uspp_"]) + button[data-settings-tab^="uspp_"] { position: relative; margin-top: 8px; }
button[data-settings-tab]:not([data-settings-tab^="uspp_"]) + button[data-settings-tab^="uspp_"]::before { content: ""; position: absolute; inset-inline: 12px; top: -8px; height: 1px; pointer-events: none; background: var(--border-l1, var(--grok-border-l1, rgb(255 255 255 / 8%))); }
`;
