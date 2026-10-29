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

const cardLazy = createModuleLazy("Card", "CardContent", "CardHeader", "CardTitle");
export const Card = cardLazy<CardProps>("Card");
export const CardContent = cardLazy<CardContentProps>("CardContent");
export const CardHeader = cardLazy<CardHeaderProps>("CardHeader");
export const CardTitle = cardLazy<CardTitleProps>("CardTitle");

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

const hoverCardLazy = createModuleLazy("HoverCard", "HoverCardContent", "HoverCardTrigger");
export const HoverCard = hoverCardLazy<HoverCardProps>("HoverCard");
export const HoverCardContent = hoverCardLazy<HoverCardContentProps>("HoverCardContent");
export const HoverCardTrigger = hoverCardLazy<HoverCardTriggerProps>("HoverCardTrigger");

export const Input = lazyExport<InputProps>("Input");
export const Label = lazyExport<LabelProps>("Label");
export const MotionDiv: ComponentType<MotionProps> = LazyComponent("MotionDiv", () => findByProps("motion")?.motion?.div);
export const Portal = lazyExport<PortalProps>("Portal");

const selectLazy = createModuleLazy("Select", "SelectContent", "SelectTrigger");
export const Select = selectLazy<SelectProps>("Select");
export const SelectTrigger = selectLazy<SelectTriggerProps>("SelectTrigger");
export const SelectContent = selectLazy<SelectContentProps>("SelectContent");
export const SelectItem = selectLazy<SelectItemProps>("SelectItem");
export const SelectValue = selectLazy<SelectValueProps>("SelectValue");

export const Separator = lazyExport<SeparatorProps>("Separator");

export { SettingsDescription, SettingsRow, SettingsSwitch, SettingsTitle };

export const Skeleton = lazyExport<SkeletonProps>("Skeleton");
export const Slider = lazyExport<SliderProps>("Slider");
export const Switch = lazyExport<SwitchProps>("Switch");

const tableLazy = createModuleLazy("Table", "TableBody", "TableCell");
export const Table = tableLazy<TableProps>("Table");
export const TableBody = tableLazy<TableBodyProps>("TableBody");
export const TableCell = tableLazy<TableCellProps>("TableCell");
export const TableHead = tableLazy<TableHeadProps>("TableHead");
export const TableHeader = tableLazy<TableHeaderProps>("TableHeader");
export const TableRow = tableLazy<TableRowProps>("TableRow");

const tooltipLazy = createModuleLazy("Tooltip", "TooltipTrigger", "TooltipContent");
export const Tooltip = tooltipLazy<TooltipProps>("Tooltip");
export const TooltipTrigger = tooltipLazy<TooltipTriggerProps>("TooltipTrigger");
export const TooltipContent = tooltipLazy<TooltipContentProps>("TooltipContent");
export const TooltipProvider = tooltipLazy<TooltipProviderProps>("TooltipProvider");

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
