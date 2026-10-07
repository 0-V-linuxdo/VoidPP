/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { type ContextMenuLocationMap, MenuItem, MenuSub, MenuSubContent, MenuSubTrigger } from "@api/ContextMenus";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { DownloadIcon, FileDownIcon } from "@components/icons";
import type { GrokResponse } from "@grok-types";
import { React } from "@turbopack/common/react";
import { ConversationStore } from "@turbopack/common/stores";
import { ApiClients, FileUtils } from "@turbopack/common/utils";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { safeUrl, sanitizeFilename } from "@utils/misc";
import { useIsStreaming } from "@utils/react";
import { escapeHtml } from "@utils/text";
import definePlugin from "@utils/types";

const logger = new Logger("ExportChat");

function buildExportMessage(r: GrokResponse) {
    return {
        id: r.responseId,
        sender: r.sender,
        message: r.message,
        query: r.query,
        createTime: r.createTime,
        model: r.requestMetadata?.model ?? r.model,
        ...(r.thinkingTrace && { thinkingTrace: r.thinkingTrace }),
        ...(r.webSearchResults?.length && { webSearchResults: r.webSearchResults }),
        ...(r.generatedImageUrls?.length && { generatedImageUrls: r.generatedImageUrls }),
        ...(r.fileAttachments?.length && { fileAttachments: r.fileAttachments }),
        ...(r.steps?.length && { steps: r.steps }),
    };
}

type ExportMessage = ReturnType<typeof buildExportMessage>;

function formatTs(ts?: string): string {
    return ts ? new Date(ts).toLocaleString() : "";
}

function sender(s: string): string {
    return s.toLowerCase() === "human" ? "You" : "Grok";
}

function toMarkdown(title: string, messages: ExportMessage[]): string {
    const lines: string[] = [`# ${title}`, ""];

    for (const m of messages) {
        const ts = formatTs(m.createTime);
        lines.push(`## ${sender(m.sender)}${ts ? ` — ${ts}` : ""}${m.model ? ` (${m.model})` : ""}`, "");

        if (m.thinkingTrace) lines.push("<details><summary>Thinking</summary>", "", m.thinkingTrace, "", "</details>", "");
        const mdText = m.query || m.message;
        if (mdText) lines.push(mdText, "");

        if (m.generatedImageUrls?.length) {
            for (const url of m.generatedImageUrls) lines.push(`![image](${url})`);
            lines.push("");
        }

        if (m.webSearchResults?.length) {
            lines.push("**Web search results:**", "");
            for (const r of m.webSearchResults) {
                const { title: t, url } = r as { title?: string; url?: string };
                if (url) lines.push(`- [${t ?? url}](${url})`);
            }
            lines.push("");
        }

        lines.push("---", "");
    }

    return lines.join("\n");
}

function toPlainText(title: string, messages: ExportMessage[]): string {
    const lines: string[] = [title, "=".repeat(title.length), ""];

    for (const m of messages) {
        const ts = formatTs(m.createTime);
        lines.push(`[${sender(m.sender)}]${ts ? ` ${ts}` : ""}${m.model ? ` (${m.model})` : ""}`, "");

        if (m.thinkingTrace) lines.push("[Thinking]", m.thinkingTrace, "");
        const txtText = m.query || m.message;
        if (txtText) lines.push(txtText, "");

        if (m.generatedImageUrls?.length) {
            for (const url of m.generatedImageUrls) lines.push(`  ${url}`);
            lines.push("");
        }

        if (m.webSearchResults?.length) {
            for (const r of m.webSearchResults) {
                const { title: t, url } = r as { title?: string; url?: string };
                if (url) lines.push(`  ${t ?? ""} - ${url}`);
            }
            lines.push("");
        }

        lines.push("-".repeat(40), "");
    }

    return lines.join("\n");
}

const HTML_HEAD = [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">",
    "<style>",
    "body{font-family:system-ui,sans-serif;max-width:50rem;margin:2rem auto;padding:0 1rem;background:#0d0d0d;color:#e0e0e0}",
    ".m{margin:1.5rem 0;padding:1rem;border-radius:.5rem;border:1px solid #222}",
    ".h{background:#1a1a2e}.g{background:#111}",
    ".s{font-weight:600;margin-bottom:.5rem;color:#aaa}.t{font-size:.8rem;color:#666}",
    ".th{margin:.5rem 0;padding:.5rem;background:#1a1a1a;border-left:3px solid #444;font-size:.9rem;color:#999}",
    "a{color:#6ea8fe}",
    "</style></head><body>",
].join("\n");

function toHtml(title: string, messages: ExportMessage[]): string {
    const p: string[] = [HTML_HEAD, `<h1>${escapeHtml(title)}</h1>`];

    for (const m of messages) {
        const cls = m.sender.toLowerCase() === "human" ? "h" : "g";
        const ts = formatTs(m.createTime);

        p.push(`<div class="m ${cls}"><div class="s">${sender(m.sender)} <span class="t">${ts ? escapeHtml(ts) : ""}${m.model ? ` · ${escapeHtml(m.model)}` : ""}</span></div>`);

        if (m.thinkingTrace) p.push(`<details><summary>Thinking</summary><div class="th">${escapeHtml(m.thinkingTrace)}</div></details>`);

        const text = m.query || m.message;
        if (text) p.push(`<div>${escapeHtml(text).replaceAll("\n", "<br>")}</div>`);

        if (m.generatedImageUrls?.length) {
            for (const url of m.generatedImageUrls) {
                const safe = safeUrl(url);
                if (safe) p.push(`<img src="${escapeHtml(safe, true)}" style="max-width:100%;margin:.5rem 0">`);
            }
        }

        if (m.webSearchResults?.length) {
            p.push("<ul>");
            for (const r of m.webSearchResults) {
                const { title: t, url } = r as { title?: string; url?: string };
                if (!url) continue;
                const safe = safeUrl(url);
                if (safe) p.push(`<li><a href="${escapeHtml(safe, true)}" rel="noopener noreferrer">${escapeHtml(t ?? safe)}</a></li>`);
                else p.push(`<li>${escapeHtml(t ?? url)}</li>`);
            }
            p.push("</ul>");
        }

        p.push("</div>");
    }

    p.push("</body></html>");
    return p.join("\n");
}

type Format = "json" | "md" | "txt" | "html";

const FORMATS: { fmt: Format; label: string }[] = [
    { fmt: "json", label: "JSON" },
    { fmt: "md", label: "Markdown" },
    { fmt: "txt", label: "Plain Text" },
    { fmt: "html", label: "HTML" },
];

async function exportChat(conversationId: string, format: Format) {
    const { responses } = await ApiClients.chatApi.chatListResponses({ conversationId }) ?? {};
    if (!responses?.length) return;

    const conversation = ConversationStore.useConversationStore.getState().byId[conversationId];
    const title = conversation?.title ?? "Untitled Chat";
    const messages = responses.map(buildExportMessage);
    const filename = sanitizeFilename(title, "chat");

    let content: string;
    let mime: string;
    switch (format) {
        case "json": content = JSON.stringify({ conversationId, title, exportedAt: new Date().toISOString(), messages }, null, 2); mime = "application/json"; break;
        case "md": content = toMarkdown(title, messages); mime = "text/markdown"; break;
        case "txt": content = toPlainText(title, messages); mime = "text/plain"; break;
        case "html": content = toHtml(title, messages); mime = "text/html"; break;
    }

    await FileUtils.downloadBlob(new Blob([content], { type: mime }), `${filename}.${format}`);
}

function ExportMenu({ conversationId }: ContextMenuLocationMap["conversation"]) {
    const streaming = useIsStreaming(conversationId);

    return (
        <MenuSub>
            <MenuSubTrigger disabled={streaming}>
                <DownloadIcon size={16} className="void-export-icon" />
                Export
            </MenuSubTrigger>
            <MenuSubContent>
                {FORMATS.map(({ fmt, label }) => (
                    <MenuItem key={fmt} onSelect={() => exportChat(conversationId, fmt).catch(e => logger.error("Failed to export chat", e))}>
                        {label}
                    </MenuItem>
                ))}
            </MenuSubContent>
        </MenuSub>
    );
}

export default definePlugin({
    name: "ExportChat",
    icon: FileDownIcon,
    description: "Export conversations in multiple formats from the right-click menu.",
    authors: [Devs.Prism],
    tags: ["chats"],

    contextMenuItems: {
        conversation: {
            label: "Export",
            render: ErrorBoundary.wrap(ExportMenu),
        },
    },
});
