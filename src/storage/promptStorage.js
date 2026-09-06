// Interface for guidance-prompt storage. One instance covers a single tier
// (Tier 1 conversation-level "playbooks" or Tier 2 message-level "quick
// prompts") -- the two tiers are never backed by the same instance, so a host
// app's policy for one can never leak into the other.
export class PromptStorageInterface {
    /**
     * @returns {Promise<{allowCustom: boolean, prompts: Array<{id: string, label: string, promptText: string, description?: string, defaultSelected?: boolean, managed: boolean}>}>}
     */
    async getPrompts() {
        throw new Error('Not implemented');
    }

    /**
     * Persists the user's own prompts. Implementations should reject (throw)
     * when `allowCustom` is false rather than silently no-op, so the host UI
     * can surface why the save failed.
     * @param {Array} prompts
     */
    async saveCustomPrompts(prompts) {
        throw new Error('Not implemented');
    }
}

// Local Storage Implementation -- browser-only dev/demo fallback. Always
// allows custom prompts and has no managed/org list, unlike a real host
// provider (e.g. BlueSkyJS's ManagedPromptStorage) which reads an org-pushed
// file and gates custom prompts behind its own independent flag.
export class LocalStoragePromptProvider extends PromptStorageInterface {
    constructor(storageKey) {
        super();
        this.storageKey = storageKey;
    }

    async getPrompts() {
        const saved = localStorage.getItem(this.storageKey);
        const prompts = saved ? JSON.parse(saved) : [];
        return {allowCustom: true, prompts: Array.isArray(prompts) ? prompts : []};
    }

    async saveCustomPrompts(prompts) {
        localStorage.setItem(this.storageKey, JSON.stringify(Array.isArray(prompts) ? prompts : []));
    }
}
