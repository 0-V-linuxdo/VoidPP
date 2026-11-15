/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type {
    AccordionContentProps, AccordionItemProps, AccordionProps, AccordionTriggerProps,
    AlertDialogContentProps, AlertDialogProps, AvatarProps, BadgeProps, ButtonProps, ButtonWithPopoverProps, ButtonWithTooltipProps,
    CardContentProps, CardHeaderProps, CardProps, CardTitleProps, CheckboxProps,
    CommandEmptyProps, CommandGroupProps, CommandInputProps, CommandItemProps, CommandListProps, CommandProps,
    DialogContentProps, DialogHeaderProps, DialogOverlayProps, DialogPortalProps, DialogProps, DialogTriggerProps,
    DrawerContentProps, DrawerDescriptionProps, DrawerFooterProps, DrawerHeaderProps, DrawerProps, DrawerTitleProps, DrawerTriggerProps,
    DropdownMenuCheckboxItemProps, DropdownMenuContentProps, DropdownMenuItemProps, DropdownMenuPortalProps,
    DropdownMenuProps, DropdownMenuRadioGroupProps, DropdownMenuRadioItemProps, DropdownMenuSeparatorProps,
    DropdownMenuSubContentProps, DropdownMenuSubProps, DropdownMenuSubTriggerProps, DropdownMenuTriggerProps,
    HoverCardContentProps, HoverCardProps, HoverCardTriggerProps,
    InputProps, LabelProps, MotionProps,
    PopoverArrowProps, PopoverContentProps, PopoverProps, PopoverTriggerProps, PortalProps,
    RadixSubProps, ResponsiveDialogProps,
    SelectContentProps, SelectItemProps, SelectProps, SelectTriggerProps, SelectValueProps,
    SeparatorProps,
    SkeletonProps, SliderProps, SpinnerProps, SwitchProps,
    TableBodyProps, TableCellProps, TableHeaderProps, TableHeadProps, TableProps, TableRowProps,
    TabsContentProps, TabsListProps, TabsProps, TabsTriggerProps, TextareaProps,
    TooltipContentProps, TooltipProps, TooltipProviderProps, TooltipTriggerProps,
} from "@grok-types";
import type { ComponentType } from "react";

import { getFnSource } from "../fnSource";
import { getModuleCache, syncLazyModules } from "../patchTurbopack";
import { filters, findByProps, findByPropsLazy, findExportedComponent, requireModule, search, waitFor } from "../turbopack";
import { type AnyComponent, createElement, LazyComponent } from "./react";
import { SettingsDescription, SettingsRow, SettingsSwitch, SettingsTitle } from "./settingsPrimitives";

export type * from "@grok-types";

function createModuleLazy(...filterProps: string[]) {
    let mod: Record<string, ComponentType> | null = null;
    waitFor(filters.byProps(...filterProps), m => { mod = m; });
    return <P = {}>(name: string): ComponentType<P> =>
        LazyComponent(name, () => (mod?.[name] ?? findExportedComponent(name)) as AnyComponent | null) as unknown as ComponentType<P>;
}

function lazyExport<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => findExportedComponent(name)) as unknown as ComponentType<P>;
}

const DROPDOWN_ROOTS = ["DropdownMenu", "DropdownMenuContent", "DropdownMenuTrigger"] as const;

function isDropdownModule(mod: unknown): mod is Record<string, ComponentType> {
    if (mod == null || typeof mod !== "object") return false;
    const exp = mod as Record<string, unknown>;
    return DROPDOWN_ROOTS.every(key => exp[key] != null);
}

function isStyledDropdown(mod: Record<string, ComponentType>): boolean {
    const item = mod.DropdownMenuItem as unknown;
    return typeof item === "function" && getFnSource(item).includes("useKeepLegacy");
}

/** Desktop menu parts. `String(fn)` is the factory body (`menu:` / `keepLegacy`), not the `name:"DropdownMenu…",Legacy:` call. Radix still exports `DropdownMenuSub`; reject `__scopeDropdownMenu`. */
function readStyledDropdown(mod: Record<string, unknown>): Record<string, ComponentType> | null {
    const mapped: Record<string, ComponentType> = {};
    for (const value of Object.values(mod)) {
        if (typeof value !== "function") continue;
        let src: string;
        try {
            src = getFnSource(value);
        } catch {
            continue;
        }
        if (src.includes("__scopeDropdownMenu") || src.includes("__scopeMenu")) continue;
        const fromCall = /name:"(DropdownMenu[A-Za-z]*)",Legacy:/.exec(src)?.[1];
        const displayName = (value as { displayName?: unknown }).displayName;
        const fromName = typeof displayName === "string" && /^DropdownMenu[A-Za-z]*$/.test(displayName)
            && (src.includes("keepLegacy") || src.includes("menu:"))
            ? displayName
            : "";
        const name = fromCall || fromName;
        if (!name || mapped[name]) continue;
        mapped[name] = value as ComponentType;
    }
    if (!mapped.DropdownMenu || !mapped.DropdownMenuItem || !mapped.DropdownMenuSub || !mapped.DropdownMenuSubTrigger) return null;
    return mapped;
}

let styledDropdown: Record<string, ComponentType> | null = null;
let legacyDropdown: Record<string, ComponentType> | null = null;
let dropdownCacheSize = -1;

function dropdownModule(): Record<string, ComponentType> | null {
    if (styledDropdown) return styledDropdown;
    syncLazyModules();
    let legacy = legacyDropdown;
    for (const [, exp] of getModuleCache()) {
        try {
            if (exp == null || typeof exp !== "object") continue;
            const styled = readStyledDropdown(exp as Record<string, unknown>);
            if (styled) {
                styledDropdown = styled;
                return styled;
            }
            if (!isDropdownModule(exp)) continue;
            if (isStyledDropdown(exp)) {
                styledDropdown = exp;
                return exp;
            }
            if (!legacy) legacy = exp;
        } catch {}
    }
    legacyDropdown = legacy;
    const size = getModuleCache().size;
    if (legacy && size === dropdownCacheSize) return legacy;
    dropdownCacheSize = size;
    return null;
}

function dropdownLazy<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => (dropdownModule()?.[name] ?? null) as AnyComponent | null) as unknown as ComponentType<P>;
}

let accountMenuKitCache: Record<string, AnyComponent> | null = null;

function menuPartFn(value: unknown): AnyComponent | null {
    if (typeof value === "function") return value as AnyComponent;
    if (value && typeof value === "object" && ("render" in value || "$$typeof" in value)) return value as AnyComponent;
    return null;
}

/** Desktop account menu exports `k` with `SubmenuRoot` / `SubmenuTrigger` (`Menu.SubmenuTrigger`). Radix `DropdownMenuSub` throws `MenuSub must be used within Menu` inside that root. */
function readAccountMenuKit(mod: Record<string, unknown>): Record<string, AnyComponent> | null {
    const buckets: Record<string, unknown>[] = [];
    const push = (obj: unknown) => {
        if (!obj || typeof obj !== "object" || !("SubmenuTrigger" in obj)) return;
        buckets.push(obj as Record<string, unknown>);
    };
    push(mod);
    for (const key of Object.getOwnPropertyNames(mod)) {
        try {
            push(mod[key]);
        } catch { /* getter */ }
    }
    for (const obj of buckets) {
        const trigger = menuPartFn(obj.SubmenuTrigger);
        if (!trigger) continue;
        const src = componentSource(trigger);
        if (!src.includes("Menu.SubmenuTrigger") || src.includes("__scope")) continue;
        const item = menuPartFn(obj.Item);
        const content = menuPartFn(obj.SubmenuContent);
        const root = menuPartFn(obj.SubmenuRoot);
        if (!item || !content || !root || !componentSource(item).includes("Menu.Item")) continue;
        const mapped: Record<string, AnyComponent> = {
            SubmenuRoot: root,
            SubmenuTrigger: trigger,
            SubmenuContent: content,
            Item: item,
        };
        const sep = menuPartFn(obj.Separator);
        if (sep) mapped.Separator = sep;
        return mapped;
    }
    return null;
}

function accountMenuKit(): Record<string, AnyComponent> | null {
    if (accountMenuKitCache) return accountMenuKitCache;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (accountMenuKitCache || exp == null || typeof exp !== "object") return;
        const read = readAccountMenuKit(exp as Record<string, unknown>);
        if (read) accountMenuKitCache = read;
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (accountMenuKitCache) return accountMenuKitCache;
    for (const id of Object.keys(search("Menu.SubmenuTrigger"))) {
        consider(requireModule(Number(id)));
        if (accountMenuKitCache) return accountMenuKitCache;
    }
    return null;
}

export interface AccountMenuParts {
    Sub: AnyComponent;
    Trigger: AnyComponent;
    Content: AnyComponent;
    Item: AnyComponent;
    Separator: AnyComponent;
    desktop: boolean;
}

/** Desktop `Item` closes on `onClick`. The legacy dropdown still uses `onSelect`. */
export function accountMenuSelect(desktop: boolean, run: (event?: unknown) => void) {
    return desktop ? { onClick: run } : { onSelect: run };
}

/** First child of a desktop menu row. `displayName` must end in `Icon` or Grok will not mount it in the Glyph slot. Desktop icons are 16px, the same as `--grok-icon-size`; `1em` is 14px in that row and shifts the label. */
export function MenuGlyphIcon(props: { icon: ComponentType<{ className?: string; width?: number | string; height?: number | string }>; className?: string; desktop?: boolean }) {
    const Icon = props.icon;
    if (!createElement || !Icon) return null;
    const desktop = props.desktop !== false;
    const className = [props.className, desktop ? "" : "void-menu-glyph-gap"].filter(Boolean).join(" ");
    return createElement(Icon, {
        ...(className ? { className } : {}),
        ...(desktop ? { width: 16, height: 16 } : {}),
    });
}
MenuGlyphIcon.displayName = "MenuGlyphIcon";

const LEGACY_BUTTON_VARIANT: Record<string, string> = {
    tertiary: "ghost",
    secondary: "muted",
    danger: "destructive",
    text: "ghost",
    textsecondary: "ghost",
};

function buttonExportSource(value: unknown): string {
    try {
        if (typeof value === "function") return getFnSource(value);
        const render = value && typeof value === "object" ? (value as { render?: unknown }).render : null;
        if (typeof render === "function") return getFnSource(render);
    } catch {}
    return "";
}

/** Styled query-bar button. Names `Button` / `IconButton` are the headless primitive, which drops variant classes. */
function isStyledButtonExport(value: unknown): value is AnyComponent {
    const src = buttonExportSource(value);
    return src.includes(".Button") && src.includes('"chrome"===');
}

let styledButton: AnyComponent | null = null;

function styledButtonExport(): AnyComponent | null {
    if (styledButton) return styledButton;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (styledButton || exp == null || typeof exp !== "object") return;
        for (const value of Object.values(exp as Record<string, unknown>)) {
            if (isStyledButtonExport(value)) {
                styledButton = value;
                return;
            }
        }
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (styledButton) return styledButton;
    for (const id of Object.keys(search('"chrome"==='))) {
        consider(requireModule(Number(id)));
        if (styledButton) return styledButton;
    }
    return null;
}

function renderButton(props: ButtonProps) {
    const Inner = styledButtonExport() ?? findExportedComponent("Button");
    if (!Inner || !createElement) return null;
    const variant = typeof props.variant === "string" ? LEGACY_BUTTON_VARIANT[props.variant] ?? props.variant : props.variant;
    return createElement(Inner, variant === props.variant ? props : { ...props, variant });
}

export const Button = renderButton as ComponentType<ButtonProps>;

function buttonWithTooltip(props: ButtonWithTooltipProps) {
    const { tooltipContent, tooltipProps, tooltipContentProps, stayOpenOnClick, ...rest } = props;
    if (!createElement) return null;
    return createElement(Button, {
        ...rest,
        tooltip: tooltipContent == null ? undefined : {
            content: tooltipContent,
            props: tooltipProps,
            contentProps: tooltipContentProps,
            stayOpenOnClick,
        },
    });
}

export const ButtonWithTooltip = buttonWithTooltip as ComponentType<ButtonWithTooltipProps>;
export const ButtonWithTooltipOptimized = ButtonWithTooltip;

function componentDisplayName(value: unknown): string {
    if (value == null || (typeof value !== "function" && typeof value !== "object")) return "";
    const named = value as { displayName?: unknown; render?: { displayName?: unknown } };
    if (typeof named.displayName === "string") return named.displayName;
    if (typeof named.render?.displayName === "string") return named.render.displayName;
    return "";
}

/** Short exports keep `displayName` (`Select`, `Card`, …). Skip radix parts that still mention `__scope`. */
function readDisplayNames(mod: Record<string, unknown>, names: readonly string[]): Record<string, AnyComponent> | null {
    const wanted = new Set(names);
    const mapped: Record<string, AnyComponent> = {};
    for (const value of Object.values(mod)) {
        const displayName = componentDisplayName(value);
        if (!wanted.has(displayName) || mapped[displayName]) continue;
        if (componentSource(value).includes("__scope")) continue;
        mapped[displayName] = value as AnyComponent;
    }
    if (!names.every(name => mapped[name])) return null;
    return mapped;
}

function moduleByDisplayNames(anchor: string, names: readonly string[], cache: { current: Record<string, AnyComponent> | null }): Record<string, AnyComponent> | null {
    if (cache.current) return cache.current;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (cache.current || exp == null || typeof exp !== "object") return;
        const read = readDisplayNames(exp as Record<string, unknown>, names);
        if (read) cache.current = read;
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (cache.current) return cache.current;
    for (const id of Object.keys(search(anchor))) {
        consider(requireModule(Number(id)));
        if (cache.current) return cache.current;
    }
    return null;
}

const CARD_PARTS = ["Card", "CardHeader", "CardTitle", "CardContent"] as const;
const cardCache: { current: Record<string, AnyComponent> | null } = { current: null };

function cardModule(): Record<string, AnyComponent> | null {
    return moduleByDisplayNames('displayName="CardContent"', CARD_PARTS, cardCache);
}

function cardPart<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => (cardModule()?.[name] ?? findExportedComponent(name)) as AnyComponent | null) as unknown as ComponentType<P>;
}

export const Card = cardPart<CardProps>("Card");
export const CardContent = cardPart<CardContentProps>("CardContent");
export const CardHeader = cardPart<CardHeaderProps>("CardHeader");
export const CardTitle = cardPart<CardTitleProps>("CardTitle");

function componentSource(value: unknown): string {
    try {
        if (typeof value === "function") return getFnSource(value);
        const render = value && typeof value === "object" ? (value as { render?: unknown }).render : null;
        if (typeof render === "function") return getFnSource(render);
    } catch {}
    return "";
}

function readStyledDialog(mod: Record<string, unknown>): Record<string, AnyComponent> | null {
    const entries: { value: AnyComponent; src: string }[] = [];
    for (const value of Object.values(mod)) {
        const src = componentSource(value);
        if (!src || src.includes("__scopeDialog")) continue;
        entries.push({ value: value as AnyComponent, src });
    }
    const pick = (pred: (src: string) => boolean) => entries.find(entry => pred(entry.src))?.value ?? null;
    const Dialog = pick(src => src.includes("keepLegacy") && src.includes("onOpenChange:"));
    const DialogContent = pick(src => src.includes("overlayClassname:"));
    if (!Dialog || !DialogContent) return null;
    const mapped: Record<string, AnyComponent> = { Dialog, DialogContent };
    const extra: [string, AnyComponent | null][] = [
        ["DialogTrigger", pick(src => src.includes("aria-haspopup"))],
        ["DialogClose", pick(src => src.includes("asChild:") && src.includes("onClick:") && !src.includes("aria-haspopup"))],
        ["DialogHeader", pick(src => src.includes("flex flex-col") && src.includes("layout:") && !src.includes("overlayClassname:"))],
        ["DialogTitle", pick(src => src.includes("DialogTitle"))],
        ["DialogDescription", pick(src => src.includes("DialogDescription"))],
        ["DialogFooter", pick(src => src.includes("DialogFooter") && src.includes("orientation:"))],
    ];
    for (const [key, value] of extra) if (value) mapped[key] = value;
    return mapped;
}

let styledDialog: Record<string, AnyComponent> | null = null;

function dialogModule(): Record<string, AnyComponent> | null {
    if (styledDialog) return styledDialog;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (styledDialog || exp == null || typeof exp !== "object") return;
        const read = readStyledDialog(exp as Record<string, unknown>);
        if (read) styledDialog = read;
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (styledDialog) return styledDialog;
    for (const id of Object.keys(search("overlayClassname:"))) {
        consider(requireModule(Number(id)));
        if (styledDialog) return styledDialog;
    }
    return null;
}

function dialogPart<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => (dialogModule()?.[name] ?? findExportedComponent(name)) as AnyComponent | null) as unknown as ComponentType<P>;
}

export const Dialog = dialogPart<DialogProps>("Dialog");
export const DialogContent = dialogPart<DialogContentProps>("DialogContent");
export const DialogHeader = dialogPart<DialogHeaderProps>("DialogHeader");
export const DialogTitle = dialogPart<RadixSubProps>("DialogTitle");
export const DialogDescription = dialogPart<RadixSubProps>("DialogDescription");
export const DialogFooter = dialogPart<RadixSubProps>("DialogFooter");
export const DialogClose = dialogPart<RadixSubProps>("DialogClose");
export const DialogTrigger = dialogPart<DialogTriggerProps>("DialogTrigger");
export const DialogOverlay = dialogPart<DialogOverlayProps>("DialogOverlay");
export const DialogPortal = dialogPart<DialogPortalProps>("DialogPortal");

const drawerLazy = createModuleLazy("Drawer", "DrawerContent", "DrawerTrigger");
export const Drawer = drawerLazy<DrawerProps>("Drawer");
export const DrawerContent = drawerLazy<DrawerContentProps>("DrawerContent");
export const DrawerTrigger = drawerLazy<DrawerTriggerProps>("DrawerTrigger");
export const DrawerDescription = drawerLazy<DrawerDescriptionProps>("DrawerDescription");
export const DrawerFooter = drawerLazy<DrawerFooterProps>("DrawerFooter");
export const DrawerHeader = drawerLazy<DrawerHeaderProps>("DrawerHeader");
export const DrawerTitle = drawerLazy<DrawerTitleProps>("DrawerTitle");
export const ResponsiveDialog = drawerLazy<ResponsiveDialogProps>("ResponsiveDialog");

export const DropdownMenu = dropdownLazy<DropdownMenuProps>("DropdownMenu");
export const DropdownMenuTrigger = dropdownLazy<DropdownMenuTriggerProps>("DropdownMenuTrigger");
export const DropdownMenuContent = dropdownLazy<DropdownMenuContentProps>("DropdownMenuContent");
export const DropdownMenuItem = dropdownLazy<DropdownMenuItemProps>("DropdownMenuItem");
export const DropdownMenuCheckboxItem = dropdownLazy<DropdownMenuCheckboxItemProps>("DropdownMenuCheckboxItem");
export const DropdownMenuRadioGroup = dropdownLazy<DropdownMenuRadioGroupProps>("DropdownMenuRadioGroup");
export const DropdownMenuRadioItem = dropdownLazy<DropdownMenuRadioItemProps>("DropdownMenuRadioItem");
export const DropdownMenuSeparator = dropdownLazy<DropdownMenuSeparatorProps>("DropdownMenuSeparator");
export const DropdownMenuSub = dropdownLazy<DropdownMenuSubProps>("DropdownMenuSub");
export const DropdownMenuSubTrigger = dropdownLazy<DropdownMenuSubTriggerProps>("DropdownMenuSubTrigger");
export const DropdownMenuSubContent = dropdownLazy<DropdownMenuSubContentProps>("DropdownMenuSubContent");
export const DropdownMenuPortal = dropdownLazy<DropdownMenuPortalProps>("DropdownMenuPortal");

export function accountMenuParts(): AccountMenuParts {
    const kit = accountMenuKit();
    if (kit) {
        return {
            Sub: kit.SubmenuRoot,
            Trigger: kit.SubmenuTrigger,
            Content: kit.SubmenuContent,
            Item: kit.Item,
            Separator: kit.Separator ?? (DropdownMenuSeparator as unknown as AnyComponent),
            desktop: true,
        };
    }
    return {
        Sub: DropdownMenuSub as unknown as AnyComponent,
        Trigger: DropdownMenuSubTrigger as unknown as AnyComponent,
        Content: DropdownMenuSubContent as unknown as AnyComponent,
        Item: DropdownMenuItem as unknown as AnyComponent,
        Separator: DropdownMenuSeparator as unknown as AnyComponent,
        desktop: false,
    };
}

const hoverCardLazy = createModuleLazy("HoverCard", "HoverCardContent", "HoverCardTrigger");
export const HoverCard = hoverCardLazy<HoverCardProps>("HoverCard");
export const HoverCardContent = hoverCardLazy<HoverCardContentProps>("HoverCardContent");
export const HoverCardTrigger = hoverCardLazy<HoverCardTriggerProps>("HoverCardTrigger");

function renderInput(props: InputProps) {
    const Inner = findExportedComponent("Input");
    const src = Inner ? componentSource(Inner) : "";
    const combobox = /Combobox|useComboboxRootContext/.test(src);
    if (!createElement) return null;
    if (Inner && !combobox) return createElement(Inner, props);
    const className = ["void-native-input", props.className].filter(Boolean).join(" ");
    return createElement("input", { ...props, className });
}

export const Input = renderInput as ComponentType<InputProps>;
export const Label = lazyExport<LabelProps>("Label");
export const MotionDiv: ComponentType<MotionProps> = LazyComponent("MotionDiv", () => findByProps("motion")?.motion?.div);
export const Portal = lazyExport<PortalProps>("Portal");

const SELECT_PARTS = ["Select", "SelectTrigger", "SelectContent", "SelectItem", "SelectValue"] as const;
const selectCache: { current: Record<string, AnyComponent> | null } = { current: null };

function selectModule(): Record<string, AnyComponent> | null {
    return moduleByDisplayNames('name:"SelectTrigger"', SELECT_PARTS, selectCache);
}

function selectPart<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => (selectModule()?.[name] ?? findExportedComponent(name)) as AnyComponent | null) as unknown as ComponentType<P>;
}

export const Select = selectPart<SelectProps>("Select");
export const SelectTrigger = selectPart<SelectTriggerProps>("SelectTrigger");
export const SelectContent = selectPart<SelectContentProps>("SelectContent");
export const SelectItem = selectPart<SelectItemProps>("SelectItem");
export const SelectValue = selectPart<SelectValueProps>("SelectValue");

let styledSeparator: AnyComponent | null = null;
let separatorMissAt = -1;

function separatorExport(): AnyComponent | null {
    if (styledSeparator) return styledSeparator;
    syncLazyModules();
    if (getModuleCache().size === separatorMissAt) return null;
    const take = (value: unknown): AnyComponent | null => {
        const src = componentSource(value);
        if (!src || src.includes("__scope") || src.includes("ContextMenu") || src.includes("SelectSeparator")) return null;
        if (src.includes('role:"separator"') && src.includes("decorative")) return value as AnyComponent;
        return null;
    };
    const scan = (exp: unknown) => {
        if (styledSeparator || exp == null || typeof exp !== "object") return;
        for (const value of Object.values(exp as Record<string, unknown>)) {
            const hit = take(value);
            if (hit) {
                styledSeparator = hit;
                return;
            }
        }
    };
    for (const [, exp] of getModuleCache()) scan(exp);
    if (!styledSeparator) {
        const hit = take(findExportedComponent("Separator"));
        if (hit) styledSeparator = hit;
    }
    if (!styledSeparator) {
        for (const id of Object.keys(search('displayName="Separator"'))) {
            scan(requireModule(Number(id)));
            if (styledSeparator) break;
        }
    }
    if (!styledSeparator) {
        for (const [, exp] of getModuleCache()) scan(exp);
    }
    if (!styledSeparator) separatorMissAt = getModuleCache().size;
    return styledSeparator;
}

function renderSeparator(props: SeparatorProps) {
    if (!createElement) return null;
    const Inner = separatorExport();
    if (Inner) return createElement(Inner, props);
    const className = ["void-settings-sep", props?.className].filter(Boolean).join(" ");
    return createElement("div", { ...props, role: "separator", className });
}

export const Separator = renderSeparator as ComponentType<SeparatorProps>;

export { SettingsDescription, SettingsRow, SettingsSwitch, SettingsTitle };

export const Skeleton = lazyExport<SkeletonProps>("Skeleton");
export const Slider = lazyExport<SliderProps>("Slider");
let styledSwitch: AnyComponent | null = null;

function isStyledSwitchExport(value: unknown): value is AnyComponent {
    const src = componentSource(value);
    return src.includes('"control"===') && src.includes(".Switch") && !src.includes("useFormContext") && !src.includes("useFieldRootContext") && !src.includes("__scopeSwitch");
}

function styledSwitchExport(): AnyComponent | null {
    if (styledSwitch) return styledSwitch;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (styledSwitch || exp == null || typeof exp !== "object") return;
        for (const value of Object.values(exp as Record<string, unknown>)) {
            if (isStyledSwitchExport(value)) {
                styledSwitch = value;
                return;
            }
        }
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (styledSwitch) return styledSwitch;
    for (const id of Object.keys(search('"control"==='))) {
        consider(requireModule(Number(id)));
        if (styledSwitch) return styledSwitch;
    }
    return null;
}

export const Switch = LazyComponent("Switch", () => styledSwitchExport() ?? findExportedComponent("Switch")) as unknown as ComponentType<SwitchProps>;

const tableLazy = createModuleLazy("Table", "TableBody", "TableCell");
export const Table = tableLazy<TableProps>("Table");
export const TableBody = tableLazy<TableBodyProps>("TableBody");
export const TableCell = tableLazy<TableCellProps>("TableCell");
export const TableHead = tableLazy<TableHeadProps>("TableHead");
export const TableHeader = tableLazy<TableHeaderProps>("TableHeader");
export const TableRow = tableLazy<TableRowProps>("TableRow");

let styledTooltip: Record<string, AnyComponent> | null = null;

function readStyledTooltip(mod: Record<string, unknown>): Record<string, AnyComponent> | null {
    let Tooltip: AnyComponent | null = null;
    let TooltipTrigger: AnyComponent | null = null;
    let TooltipContent: AnyComponent | null = null;
    let TooltipProvider: AnyComponent | null = null;
    for (const value of Object.values(mod)) {
        const src = componentSource(value);
        if (!src || src.includes("__scopeTooltip")) continue;
        if (!Tooltip && src.includes("keepLegacy:") && src.includes("desktopUi:")) Tooltip = value as AnyComponent;
        else if (!TooltipProvider && src.includes("disableHoverableContent:") && src.includes(".TooltipProvider")) TooltipProvider = value as AnyComponent;
        else if (!TooltipContent && src.includes("{...e,desktop:")) TooltipContent = value as AnyComponent;
        else if (!TooltipTrigger && src.includes("{...o,desktop:")) TooltipTrigger = value as AnyComponent;
    }
    if (!Tooltip || !TooltipTrigger || !TooltipContent) return null;
    const mapped: Record<string, AnyComponent> = { Tooltip, TooltipTrigger, TooltipContent };
    if (TooltipProvider) mapped.TooltipProvider = TooltipProvider;
    return mapped;
}

function tooltipModule(): Record<string, AnyComponent> | null {
    if (styledTooltip) return styledTooltip;
    syncLazyModules();
    const consider = (exp: unknown) => {
        if (styledTooltip || exp == null || typeof exp !== "object") return;
        const read = readStyledTooltip(exp as Record<string, unknown>);
        if (read) styledTooltip = read;
    };
    for (const [, exp] of getModuleCache()) consider(exp);
    if (styledTooltip) return styledTooltip;
    for (const id of Object.keys(search("desktopUi:"))) {
        consider(requireModule(Number(id)));
        if (styledTooltip) return styledTooltip;
    }
    return null;
}

function tooltipPart<P = {}>(name: string): ComponentType<P> {
    return LazyComponent(name, () => (tooltipModule()?.[name] ?? findExportedComponent(name)) as AnyComponent | null) as unknown as ComponentType<P>;
}

export const Tooltip = tooltipPart<TooltipProps>("Tooltip");
export const TooltipTrigger = tooltipPart<TooltipTriggerProps>("TooltipTrigger");
export const TooltipContent = tooltipPart<TooltipContentProps>("TooltipContent");
export const TooltipProvider = tooltipPart<TooltipProviderProps>("TooltipProvider");

export const Textarea = lazyExport<TextareaProps>("Textarea");
export const Checkbox = lazyExport<CheckboxProps>("Checkbox");
export const Spinner = lazyExport<SpinnerProps>("Spinner");
export const Avatar = lazyExport<AvatarProps>("Avatar");

const popoverLazy = createModuleLazy("Popover", "PopoverContent", "PopoverTrigger");
export const Popover = popoverLazy<PopoverProps>("Popover");
export const PopoverTrigger = popoverLazy<PopoverTriggerProps>("PopoverTrigger");
export const PopoverContent = popoverLazy<PopoverContentProps>("PopoverContent");
export const PopoverArrow = popoverLazy<PopoverArrowProps>("PopoverArrow");

function buttonWithPopover({ popoverContent, popoverProps, popoverContentProps, children, ...rest }: ButtonWithPopoverProps) {
    if (!createElement) return null;
    return createElement(
        Popover,
        popoverProps,
        createElement(PopoverTrigger, { asChild: true }, createElement(Button, rest, children)),
        createElement(PopoverContent, popoverContentProps, popoverContent),
    );
}

export const ButtonWithPopover = buttonWithPopover as ComponentType<ButtonWithPopoverProps>;

const tabsLazy = createModuleLazy("Tabs", "TabsList", "TabsTrigger", "TabsContent");
export const Tabs = tabsLazy<TabsProps>("Tabs");
export const TabsList = tabsLazy<TabsListProps>("TabsList");
export const TabsTrigger = tabsLazy<TabsTriggerProps>("TabsTrigger");
export const TabsContent = tabsLazy<TabsContentProps>("TabsContent");

const accordionLazy = createModuleLazy("Accordion", "AccordionContent", "AccordionItem");
export const Accordion = accordionLazy<AccordionProps>("Accordion");
export const AccordionItem = accordionLazy<AccordionItemProps>("AccordionItem");
export const AccordionTrigger = accordionLazy<AccordionTriggerProps>("AccordionTrigger");
export const AccordionContent = accordionLazy<AccordionContentProps>("AccordionContent");

const commandLazy = createModuleLazy("Command", "CommandInput", "CommandList", "CommandItem");
export const Command = commandLazy<CommandProps>("Command");
export const CommandInput = commandLazy<CommandInputProps>("CommandInput");
export const CommandList = commandLazy<CommandListProps>("CommandList");
export const CommandItem = commandLazy<CommandItemProps>("CommandItem");
export const CommandGroup = commandLazy<CommandGroupProps>("CommandGroup");
export const CommandEmpty = commandLazy<CommandEmptyProps>("CommandEmpty");

export const Badge = lazyExport<BadgeProps>("Badge");

const alertDialogLazy = createModuleLazy("AlertDialog", "AlertDialogContent", "AlertDialogAction");
export const AlertDialog = alertDialogLazy<AlertDialogProps>("AlertDialog");
export const AlertDialogTrigger = alertDialogLazy<RadixSubProps>("AlertDialogTrigger");
export const AlertDialogContent = alertDialogLazy<AlertDialogContentProps>("AlertDialogContent");
export const AlertDialogHeader = alertDialogLazy<RadixSubProps>("AlertDialogHeader");
export const AlertDialogFooter = alertDialogLazy<RadixSubProps>("AlertDialogFooter");
export const AlertDialogTitle = alertDialogLazy<RadixSubProps>("AlertDialogTitle");
export const AlertDialogDescription = alertDialogLazy<RadixSubProps>("AlertDialogDescription");
export const AlertDialogAction = alertDialogLazy<RadixSubProps>("AlertDialogAction");
export const AlertDialogCancel = alertDialogLazy<RadixSubProps>("AlertDialogCancel");

const toggleGroupLazy = createModuleLazy("ToggleGroup", "ToggleGroupItem");
export const ToggleGroup = toggleGroupLazy<RadixSubProps>("ToggleGroup");
export const ToggleGroupItem = toggleGroupLazy<RadixSubProps>("ToggleGroupItem");

export const SidebarComponents = findByPropsLazy("Sidebar", "SidebarContent", "SidebarProvider");
export const AnimatePresence = lazyExport("AnimatePresence");
