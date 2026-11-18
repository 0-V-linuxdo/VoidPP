import { U } from "../../u.js";
export {
    MenuItem,
    MenuSub,
    MenuSubTrigger,
    MenuSubContent,
    VoidPPContextMenuItems,
} from "../../../../src/api/ContextMenus.tsx";
const SLOTS = { conversation: "conversationMenu", message: "messageMenu", user: "userMenu" };
export function addContextMenuItem(location, id, def) {
    return U.addSlotItem(SLOTS[location] || location, id, def);
}
export function removeContextMenuItem(location, id) {
    return U.removeSlotItem(SLOTS[location] || location, id);
}
