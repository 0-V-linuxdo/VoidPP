/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuItem, removeContextMenuItem } from "@api/ContextMenus";
import { showToast, ToastType } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button, ConfirmDialog, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, Text } from "@components";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { TrashIcon, UsersRoundIcon } from "@components/icons";
import type { GrokUser } from "@grok-types/common/User";
import { getPlanName } from "@turbopack/common/plan";
import { React, useState } from "@turbopack/common/react";
import { SessionStore, SubscriptionsStore } from "@turbopack/common/stores";
import { findExportedComponentLazy } from "@turbopack/turbopack";
import { Devs } from "@utils/constants";
import { classes, classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { randomId } from "@utils/misc";
import definePlugin from "@utils/types";

import { captureSnapshots, CookieAccessError, type CookieDomainSnapshot, replaceAllCookies } from "./cookies";
import { decryptForAccount, type EncryptedBlob, encryptForAccount, isEncryptedBlob } from "./crypto";

const logger = new Logger("AccountSwitcher");
const cl = classNameFactory("void-as-");

const UsersIcon = findExportedComponentLazy("UsersIcon");
const CheckIcon = findExportedComponentLazy("CheckIcon");
const PlusIcon = findExportedComponentLazy("PlusIcon");
const RefreshCwIcon = findExportedComponentLazy("RefreshCwIcon");

const AVATAR_FETCH_TIMEOUT_MS = 4000;
const AVATAR_MAX_BYTES = 256 * 1024;

const PRESERVE_PREFIXES = ["VoidPP", "Void"];

interface AccountPayload {
    readonly schemaVersion: 2;
    readonly cookies: readonly CookieDomainSnapshot[];
    readonly local: Record<string, string>;
    readonly session: Record<string, string>;
}

interface SavedAccount {
    readonly id: string;
    readonly userId: string;
    readonly label: string;
    readonly email: string;
    readonly givenName: string;
    readonly profileImageUrl: string;
    readonly profileImageData?: string;
    readonly plan: string;
    readonly encryptedCookies: EncryptedBlob;
    readonly savedAt: number;
}

const settings = definePluginSettings({}).withPrivateSettings<{ accounts: SavedAccount[] }>();


function shouldPreserve(key: string) {
    for (const p of PRESERVE_PREFIXES) if (key.startsWith(p)) return true;
    return false;
}

function snapshotStorage(store: Storage): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key == null || shouldPreserve(key)) continue;
        const v = store.getItem(key);
        if (v != null) out[key] = v;
    }
    return out;
}

function restoreStorage(store: Storage, entries: Record<string, string>) {
    for (let i = store.length - 1; i >= 0; i--) {
        const key = store.key(i);
        if (key != null && !shouldPreserve(key)) store.removeItem(key);
    }
    for (const [key, value] of Object.entries(entries)) {
        try { store.setItem(key, value); }
        catch (e) { logger.warn("storage restore failed", key, e); }
    }
}

const EPHEMERAL_IDB_DATABASES = ["mixpanelBrowserDb"];

async function wipeEphemeralDbs() {
    await Promise.all(EPHEMERAL_IDB_DATABASES.map(name =>
        new Promise<void>(resolve => {
            try {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
            } catch { resolve(); }
        }),
    ));
}

function decodePayload(plaintext: string): AccountPayload {
    const parsed = JSON.parse(plaintext) as unknown;
    if (Array.isArray(parsed)) {
        return { schemaVersion: 2, cookies: parsed as CookieDomainSnapshot[], local: {}, session: {} };
    }
    const p = parsed as AccountPayload;
    if (!Array.isArray(p?.cookies)) throw new Error("Stored session is corrupt.");
    return { schemaVersion: 2, cookies: p.cookies, local: p.local ?? {}, session: p.session ?? {} };
}

async function snapshotAvatar(url: string): Promise<string | null> {
    if (!url) return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), AVATAR_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        if (!res.ok) return null;

        const blob = await res.blob();
        if (blob.size > AVATAR_MAX_BYTES) return null;

        return await new Promise<string | null>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        logger.warn("Avatar snapshot failed", e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function persistCurrent(user: GrokUser): Promise<SavedAccount> {
    const cookies = await captureSnapshots();
    const totalCookies = cookies.reduce((n, s) => n + s.cookies.length, 0);
    if (!totalCookies) throw new CookieAccessError("No cookies returned for grok.com or accounts.x.ai.");

    const payload: AccountPayload = {
        schemaVersion: 2,
        cookies,
        local: snapshotStorage(localStorage),
        session: snapshotStorage(sessionStorage),
    };

    const accounts = settings.plain.accounts ?? [];
    const existingIdx = accounts.findIndex(a => a.userId === user.userId);
    const id = existingIdx >= 0 ? accounts[existingIdx].id : randomId();
    const [encryptedCookies, profileImageData] = await Promise.all([
        encryptForAccount(id, JSON.stringify(payload)),
        snapshotAvatar(user.profileImageUrl),
    ]);
    const fallbackLabel = user.givenName || user.email.split("@")[0] || "Account";
    const { bestSubscription } = SubscriptionsStore.useSubscriptionsStore.getState();

    const account: SavedAccount = {
        id,
        userId: user.userId,
        label: accounts[existingIdx]?.label || fallbackLabel,
        email: user.email,
        givenName: user.givenName,
        profileImageUrl: user.profileImageUrl,
        profileImageData: profileImageData ?? accounts[existingIdx]?.profileImageData,
        plan: getPlanName(bestSubscription, user.xSubscriptionType),
        encryptedCookies,
        savedAt: Date.now(),
    };

    settings.store.accounts = existingIdx >= 0
        ? accounts.map((a, i) => i === existingIdx ? account : a)
        : [...accounts, account];

    return account;
}

async function saveCurrent(user: GrokUser) {
    try {
        const accounts = settings.plain.accounts ?? [];
        const existed = accounts.some(a => a.userId === user.userId);
        const account = await persistCurrent(user);
        showToast(existed ? `Updated ${account.label}.` : `Saved ${account.label}.`, ToastType.SUCCESS);
    } catch (e) {
        logger.error("Save failed", e);
        showToast(e instanceof Error ? e.message : "Failed to save account.", ToastType.ERROR);
    }
}

async function switchTo(account: SavedAccount) {
    try {
        const currentUser = SessionStore.getSessionStoreState().user;
        if (currentUser?.userId === account.userId) return;
        const alreadySaved = currentUser && (settings.plain.accounts ?? []).some(a => a.userId === currentUser.userId);
        if (currentUser && alreadySaved) {
            try { await persistCurrent(currentUser); }
            catch (e) { logger.warn("Failed to refresh current account before switch", e); }
        }

        const plaintext = await decryptForAccount(account.id, account.encryptedCookies);
        const payload = decodePayload(plaintext);
        if (!payload.cookies.length) throw new Error("Stored session is empty or corrupt.");

        showToast(`Switching to ${account.label}…`, ToastType.LOADING);
        await wipeEphemeralDbs();
        restoreStorage(localStorage, payload.local);
        restoreStorage(sessionStorage, payload.session);
        const result = await replaceAllCookies(payload.cookies);
        if (result.failures.length) throw new Error(`Cookie swap had ${result.failures.length} failure(s): ${result.failures.join("; ")}`);

        location.reload();
    } catch (e) {
        logger.error("Switch failed", e);
        showToast(e instanceof Error ? e.message : "Failed to switch account.", ToastType.ERROR);
    }
}

function deleteAccount(id: string) {
    settings.store.accounts = (settings.plain.accounts ?? []).filter(a => a.id !== id);
}

function AccountRow({ account, isActive, onSwitch, onDelete }: {
    account: SavedAccount;
    isActive: boolean;
    onSwitch: () => void;
    onDelete: () => void;
}) {
    const fallbackInitial = (account.label || account.givenName || account.email || "?").charAt(0).toUpperCase();
    const avatarSrc = account.profileImageData ?? account.profileImageUrl;

    return (
        <div className={classes(cl("row-wrap"), isActive ? cl("row-active") : "")}>
            <DropdownMenuItem onSelect={onSwitch} className={cl("row")}>
                {avatarSrc
                    ? <img src={avatarSrc} alt="" className={cl("avatar")} loading="lazy" referrerPolicy="no-referrer" />
                    : <div className={cl("avatar", "avatar-fallback")}>{fallbackInitial}</div>}
                <div className={cl("row-info")}>
                    <Text as="span" size="sm" weight="medium" className={cl("row-label")}>{account.label}</Text>
                    <Text as="span" size="xs" color="secondary" className={cl("row-plan")}>{account.plan || "Free"}</Text>
                </div>
                {isActive && <CheckIcon className={cl("icon-check")} />}
            </DropdownMenuItem>
            <Button
                variant="tertiary"
                size="xs"
                shape="square"
                aria-label={`Delete ${account.label}`}
                className={cl("row-delete")}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            >
                <TrashIcon size={14} />
            </Button>
        </div>
    );
}

function AccountMenu() {
    const accounts = settings.use(["accounts"]).accounts ?? [];
    const { user } = SessionStore.useSession();
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const pending = accounts.find(a => a.id === pendingDeleteId);
    const hasCurrent = accounts.some(a => a.userId === user?.userId);

    return (
        <>
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className={cl("trigger")}>
                    <UsersIcon className={cl("icon-lead")} />
                    <Text as="span" size="sm">Accounts</Text>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={cl("content")}>
                    {accounts.length > 0 && (
                        <div className={cl("heading")}>
                            <Text as="span" size="xs" color="secondary">Saved Accounts</Text>
                        </div>
                    )}
                    {accounts.map(a => (
                        <AccountRow
                            key={a.id}
                            account={a}
                            isActive={user?.userId === a.userId}
                            onSwitch={() => void switchTo(a)}
                            onDelete={() => setPendingDeleteId(a.id)}
                        />
                    ))}
                    {accounts.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={() => user && void saveCurrent(user)} disabled={!user} className={cl("save")}>
                        {hasCurrent ? <RefreshCwIcon className={cl("icon-lead")} /> : <PlusIcon className={cl("icon-lead")} />}
                        <Text as="span" size="sm">{hasCurrent ? "Update current account" : "Save current account"}</Text>
                    </DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
            <ConfirmDialog
                open={pendingDeleteId != null}
                onOpenChange={open => { if (!open) setPendingDeleteId(null); }}
                title="Delete saved account"
                description={`Remove ${pending?.label ?? ""} from saved accounts? This only forgets the session on this device.`}
                confirmText="Delete"
                danger
                onConfirm={() => { if (pendingDeleteId != null) deleteAccount(pendingDeleteId); setPendingDeleteId(null); }}
            />
        </>
    );
}

function migrateLegacyAccounts() {
    const { accounts } = settings.plain;
    if (!Array.isArray(accounts) || !accounts.length) return;
    const valid = accounts.filter(a => isEncryptedBlob((a as { encryptedCookies?: unknown }).encryptedCookies));
    if (valid.length === accounts.length) return;

    logger.warn(`Dropping ${accounts.length - valid.length} unencrypted legacy account(s).`);
    settings.store.accounts = valid;
}

export default definePlugin({
    name: "AccountSwitcher",
    icon: UsersRoundIcon,
    description: "Easily switch between your accounts.",
    authors: [Devs.Prism],
    tags: ["navigation"],
    settings,

    start() {
        migrateLegacyAccounts();
        addContextMenuItem("user", "accountSwitcher", {
            label: "Accounts",
            render: ErrorBoundary.wrap(AccountMenu),
            order: -10,
        });
    },

    stop() {
        removeContextMenuItem("user", "accountSwitcher");
    },
});
