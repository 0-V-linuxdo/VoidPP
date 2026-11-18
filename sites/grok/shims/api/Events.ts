import { U } from "../../u.js";
function api() { return U; }
export function subscribe(event, handler) { return api().subscribe(event, handler); }
export function dispatch(event, data) { return api().dispatch(event, data); }
