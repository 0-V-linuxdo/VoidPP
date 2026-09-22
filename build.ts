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
const VERSION_DATE = "20260922.11";
const displayVersion = `[${VERSION_DATE}] v${pkg.version}`;
