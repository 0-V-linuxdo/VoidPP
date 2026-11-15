import { U } from "../../u.js";
export { VoidPPChatBarButtons } from "../../../../src/api/ChatBarButtons.tsx";
export function addChatBarButton(id, def) { return U.addSlotItem("chatBar", id, def); }
export function removeChatBarButton(id) { return U.removeSlotItem("chatBar", id); }
