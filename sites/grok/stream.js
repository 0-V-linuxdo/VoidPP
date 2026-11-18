// streamEnd 事件:监听 Grok 的回复状态、消息树节点状态与聊天页的流式消息 ID
import { U } from "./u.js";

let logger = null;
const IN_FLIGHT = new Set(["queued", "sending", "sent", "optimistic", "streaming", "reconnecting", "pending"]);
const recent = new Map(); // responseId -> 时间戳,避免两条来源重复触发

function fire(responseId) {
    if (!responseId) return;
    const now = Date.now();
    const last = recent.get(responseId);
    if (last && now - last < 5000) return;
    recent.set(responseId, now);
    if (recent.size > 200) recent.delete(recent.keys().next().value);
    U.dispatch("streamEnd", { responseId });
}

function watchResponses(store) {
    let prev = new Map();
    const snapshot = state => {
        const m = new Map();
        const byId = state?.byId;
        if (byId && typeof byId === "object") {
            for (const id of Object.keys(byId)) {
                const r = byId[id];
                const st = r?.state ?? r?.status;
                if (typeof st === "string") m.set(id, { state: st, role: r.role ?? r.sender });
            }
        }
        return m;
    };
    prev = snapshot(store.getState());
    store.subscribe(state => {
        const next = snapshot(state);
        for (const [id, cur] of next) {
            const old = prev.get(id);
            if (old && IN_FLIGHT.has(old.state) && !IN_FLIGHT.has(cur.state)) {
                const role = String(cur.role ?? "assistant").toLowerCase();
                if (role !== "human" && role !== "user") fire(id);
            }
        }
        prev = next;
    });
}

function watchChatPage(store) {
    let last = store.getState()?.streamedMessageId;
    store.subscribe(state => {
        const cur = state?.streamedMessageId;
        if (last && !cur) fire(last);
        last = cur;
    });
}

// 新版 Grok:消息在 MessageStore.conversations[会话].nodes 里,助手节点 status 变为 complete 即结束
const DONE = new Set(["complete", "completed", "done", "finished", "success"]);
const FAILED = new Set(["error", "failed", "cancelled", "canceled", "aborted", "stopped"]);
const nodeStatus = n => { const st = n?.status ?? n?.state; return typeof st === "string" ? st.toLowerCase() : null; };
const isAssistant = n => { const r = String(n?.role ?? n?.sender ?? "").toLowerCase(); return r === "assistant" || r === "model" || r === "grok"; };

function watchMessages(store) {
    const convCache = new Map();   // 会话 ID -> 上次见到的 nodes 对象
    const nodeCache = new WeakSet(); // 已处理过的节点对象
    const inFlight = new Set();    // 进行中的节点 ID / responseId / inflightResponseId
    const keysOf = (id, n) => [id, n.responseId, n.inflightResponseId, n.id].filter(k => typeof k === "string" && k);
    const scan = (state, initial) => {
        const convs = state?.conversations;
        if (!convs || typeof convs !== "object") return;
        for (const cid of Object.keys(convs)) {
            const nodes = convs[cid]?.nodes;
            if (!nodes || typeof nodes !== "object" || convCache.get(cid) === nodes) continue;
            convCache.set(cid, nodes);
            for (const id of Object.keys(nodes)) {
                const n = nodes[id];
                if (!n || typeof n !== "object" || nodeCache.has(n)) continue;
                nodeCache.add(n);
                if (!isAssistant(n)) continue;
                const st = nodeStatus(n);
                if (!st) continue;
                const keys = keysOf(id, n);
                if (DONE.has(st) || FAILED.has(st)) {
                    const was = keys.some(k => inFlight.has(k));
                    keys.forEach(k => inFlight.delete(k));
                    if (was && !initial && DONE.has(st)) fire(n.responseId || id);
                } else {
                    keys.forEach(k => inFlight.add(k));
                }
            }
        }
    };
    scan(store.getState(), true);
    store.subscribe(state => { try { scan(state, false); } catch (e) { logger.error("处理消息状态出错", e); } });
}

let started = false;
export function startStreamEvents() {
    if (started) return;
    started = true;
    logger = new U.Logger("Stream", "#bef264");
    const attach = (name, fn) => {
        const s = U.findStore(name);
        if (s) { try { fn(s); } catch (e) { logger.error(`订阅 ${name} 失败`, e); } return; }
        U.waitFor(U.filters.byStoreName(name), m => {
            try { fn(m[`use${name}Store`]); } catch (e) { logger.error(`订阅 ${name} 失败`, e); }
        });
    };
    attach("Response", watchResponses);
    attach("ChatPage", watchChatPage);
    attach("Message", watchMessages);
}
