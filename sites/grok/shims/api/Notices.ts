import { U } from "../../u.js";
export const NoticeType = Object.freeze({ INFO: "info", WARNING: "warning", ERROR: "error", SUCCESS: "success" });
export function showNotice(opts) {
    const message = typeof opts === "string" ? opts : opts?.message;
    return U.showNotice(message, opts);
}
export function closeNotice() { return U.closeNotice(); }
