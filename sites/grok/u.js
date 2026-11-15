// 本适配接触框架的唯一途径:工厂参数 U(本脚本自己的框架实例,站点工厂被调用时填入)
export let U = null;
export const bindApi = api => { U = api; };

// 界面直接用 Grok 自己的 React:补丁在 Grok 渲染期间调用这些函数,那时它一定可用
const R = () => U.findReact();
export const Fragment = Symbol.for("react.fragment");
export function h(type, props, ...children) {
    const React = R();
    return React.createElement(type === Fragment ? React.Fragment : type, props, ...children);
}
const hook = name => (...args) => R()[name](...args);
export const useState = hook("useState");
export const useEffect = hook("useEffect");
export const useLayoutEffect = hook("useLayoutEffect");
export const useRef = hook("useRef");
export const useReducer = hook("useReducer");
export function useSubscription(subscribe) {
    const [, force] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(() => force()), []);
}
/** 订阅某个注入点的变化 */
export const slotSubscriber = slot => fn => U.onSlotChange(slot, fn);
// 错误边界也用 Grok 的 React 建,单项渲染出错只隐藏它自己
let EB = null;
function boundaryClass() {
    if (EB) return EB;
    const React = R();
    EB = class UsppGrokBoundary extends React.Component {
        constructor(props) { super(props); this.state = { error: null }; }
        static getDerivedStateFromError(error) { return { error }; }
        componentDidCatch(error, info) { console.error(`[${U.scriptName}] 组件渲染出错`, this.props.label || "", error, info?.componentStack); }
        render() {
            if (this.state.error) { const fb = this.props.fallback; return typeof fb === "function" ? fb(this.state.error) : (fb ?? null); }
            return this.props.children ?? null;
        }
    };
    return EB;
}
export const ErrorBoundary = props => h(boundaryClass(), props);
