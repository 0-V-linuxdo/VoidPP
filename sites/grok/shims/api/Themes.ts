import { U } from "../../u.js";
function api() { return U; }
export const getThemes = () => api().getThemes();
export const addTheme = (...a) => api().addTheme(...a);
export const addLocalTheme = (...a) => api().addLocalTheme(...a);
export const updateLocalTheme = (...a) => api().updateLocalTheme(...a);
export const removeTheme = (...a) => api().removeTheme(...a);
export const enableTheme = (...a) => api().enableTheme(...a);
export const disableTheme = (...a) => api().disableTheme(...a);
export const isThemesEnabled = () => api().isThemesEnabled();
export const setThemesEnabled = v => api().setThemesEnabled(v);
export const isOnlineThemesEnabled = () => api().isOnlineThemesEnabled();
export const setOnlineThemesEnabled = v => api().setOnlineThemesEnabled(v);
export async function loadSavedThemes() {}
