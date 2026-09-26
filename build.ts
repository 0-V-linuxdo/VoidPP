import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "fs";
import { basename, dirname, relative, resolve } from "path";

import { Logger } from "./src/utils/Logger";

const flagDev = process.argv.includes("--dev");
const flagStable = process.argv.includes("--stable");
const isWatch = process.argv.includes("--watch");
const isDev = flagDev;

if (flagDev && flagStable) {
    throw new Error("Pass only one of --dev or --stable");
}

const logger = new Logger("Build", "#89b4fa");
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const repoUrl: string = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

function gitBranch(): string {
    try {
        const result = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
            cwd: import.meta.dir,
            stderr: "pipe",
        });
        if (!result.success) return "";
        const name = result.stdout.toString().trim();
        return name === "HEAD" ? "" : name;
    } catch {
        return "";
    }
}

type Channel = "dev" | "voidpp-beta" | "voidpp-stable";

function resolveChannel(branch: string): { channel: Channel; environment: "Development" | "Beta" | "Production" } {
    if (flagStable) return { channel: "voidpp-stable", environment: "Production" };
    if (flagDev) return { channel: "dev", environment: "Development" };
    if (branch === "voidpp-stable") return { channel: "voidpp-stable", environment: "Production" };
    if (branch === "dev") return { channel: "dev", environment: "Development" };
    return { channel: "voidpp-beta", environment: "Beta" };
}

const { channel, environment } = resolveChannel(gitBranch());

const FORK_URL = "https://github.com/0-V-linuxdo/VoidPP";
const NAMESPACE = `${FORK_URL}/${channel}`;
const SCRIPT_CDN = `https://raw.githubusercontent.com/0-V-linuxdo/VoidPP/${channel}`;
const VERSION_DATE = "20260926.12";
const displayVersion = `[${VERSION_DATE}] v${pkg.version}`;
const scriptVersion = VERSION_DATE;
