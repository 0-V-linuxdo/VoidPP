import type { LoadingStatus } from "../common/LoadingStatus";
import type { ZustandStore } from "../zustand";

export interface Mode {
    id: string;
    title: string;
}

/**
 * Zustand state for custom conversation modes (preset prompts
 * with specific configurations). Fetched lazily when the mode picker is opened.
 */
export interface ModesStoreState {
    /** List of available custom modes. */
    modes: Mode[];
    /** Default mode ID, empty string if none. */
    defaultModeId: string;
    /** Loading status of the modes list. */
    status: LoadingStatus;
    /** Currently selected mode ID, empty string if none. */
    selectedModeId: string;

    /** Fetch the modes list from the API. */
    fetchModes: () => Promise<void>;
    /** Ensure the modes list is loaded (no-op if already loaded). */
    ensureLoaded: () => Promise<void>;
    /** Set the selected mode by ID. */
    setSelectedModeId: (id: string, opts?: { source?: "user" | "sync" }) => void;
    /**
     * Cycle to the next available primary mode (same list as the model-select hotkey).
     * Returns that mode, or undefined when there is nothing to switch to.
     */
    cycleSelectedMode?: () => Mode | undefined;
    /** Internal: Reconcile the selected mode ID against available modes. */
    _reconcileSelectedModeId: () => void;
}

/** Module exports for the Modes store. */
export interface ModesStoreModule {
    /** Zustand store hook for modes state. */
    useModesStore: ZustandStore<ModesStoreState>;
}
