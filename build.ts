import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "fs";
import { basename, dirname, relative, resolve } from "path";

import { Logger } from "./src/utils/Logger";

const isDev = process.argv.includes("--dev");
const isWatch = process.argv.includes("--watch");

const logger = new Logger("Build", "#89b4fa");
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const repoUrl: string = pkg.repository.url.replace(/^git+/, "").replace(/\.git$/, "");

const environment = isDev ? "Development" : "Production";

const FORK_URL = "https://github.com/0-V-linuxdo/VoidPP";
const SCRIPT_CDN = "https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/voidpp";
const VERSION_DATE = "20260914.26";
const displayVersion = `[${VERSION_DATE}] v${pkg.version}`;

const LICENSE_BANNER = `/**
 * Void++ ${displayVersion} — A modification for grok.com
 * (c) ${new Date().getFullYear()} Prism & Void++ Contributors
 * Licensed under GPL-3.0-or-later
 * Source: ${FORK_URL}
 */`;

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         Void++
// @namespace    ${FORK_URL}
// @version      ${displayVersion}
// @description  A modification for grok.com
// @author       ${pkg.author} & Void++ Contributors
// @environment  ${environment}
// @homepageURL  ${FORK_URL}
// @icon         ${SCRIPT_CDN}/assets/logos/app-icon/voidpp-icon.svg
// @match        *://grok.com/*
// @match        *://*.grok-sandbox.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setClipboard
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      *
// @compatible   chrome
// @compatible   firefox
// @compatible   edge
// @compatible   opera
// @license      GPL-3.0-or-later
// @supportURL   ${FORK_URL}
// @downloadURL  ${SCRIPT_CDN}/userscript/VoidPP.user.js
// @updateURL    ${SCRIPT_CDN}/userscript/VoidPP.user.js
// ==/UserScript==
`;
