import { U } from "../u.js";
import { common } from "../common.js";

function R() {
    return common.React || U?.findReact?.() || U?.react;
}

const react = new Proxy(function () {}, {
    apply(_, __, args) { return R().createElement(...args); },
    get(_, key) {
        if (key === "__esModule") return true;
        if (key === "default") return react;
        const r = R();
        return r ? r[key] : undefined;
    },
});
export default react;
export const createElement = (...a) => R().createElement(...a);
export const Fragment = Symbol.for("react.fragment");
