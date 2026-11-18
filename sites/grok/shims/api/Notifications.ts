import { U } from "../../u.js";
export const ToastType = Object.freeze({
    MESSAGE: 0, SUCCESS: 1, ERROR: 2, INFO: 3, WARNING: 4, LOADING: 5,
});
const NAMES = ["MESSAGE", "SUCCESS", "ERROR", "INFO", "WARNING", "LOADING"];
export function showToast(message, type = 0, options) {
    const name = typeof type === "number" ? NAMES[type] : type;
    return U.showToast(message, name, options);
}
export function dismissToast(id) { return U.dismissToast(id); }
