// Interface describing the storage contract for conversations.
// Electron apps (or any host) can provide their own implementation
// (for example backed by electron-store, SQLite, or a remote API) and
// pass it to `initChatComponent` to replace the default behaviour.
//
// All methods are async so implementations are free to perform I/O.
//
// Conversation shape persisted by implementations:
// {
//   id:         string        // stable unique identifier
//   title:      string        // user-facing title (auto-derived if omitted)
//   createdAt:  number        // epoch millis
//   updatedAt:  number        // epoch millis
//   messages:   Array<Object> // same objects Chat.jsx holds in state
//   version:    number        // schema version for future migrations
// }
//
// Implementations should store the index (list of lightweight metadata
// entries, without `messages`) separately from individual conversation
// payloads so that listing is cheap.
export class ConversationStorageInterface {
    /**
     * @returns {Promise<Array<{id:string,title:string,createdAt:number,updatedAt:number,messageCount:number}>>}
     */
    async listConversations() {
        throw new Error('Not implemented');
    }

    /**
     * Return the full conversation payload, or null if it does not exist.
     * @param {string} id
     */
    async getConversation(id) {
        throw new Error('Not implemented');
    }

    /**
     * Persist a conversation. Should create-or-update based on `conversation.id`.
     * Implementations are responsible for updating their internal index.
     * @param {object} conversation
     */
    async saveConversation(conversation) {
        throw new Error('Not implemented');
    }

    /**
     * Delete a conversation by id. Should be a no-op if it doesn't exist.
     * @param {string} id
     */
    async deleteConversation(id) {
        throw new Error('Not implemented');
    }

    /**
     * Remove all conversations (but not the rest of the chat component state).
     */
    async clearAll() {
        throw new Error('Not implemented');
    }

    /**
     * Return the id of the conversation the user was last viewing,
     * or null if none is known.
     * @returns {Promise<string|null>}
     */
    async getActiveConversationId() {
        throw new Error('Not implemented');
    }

    /**
     * Remember which conversation is currently active (or null to clear).
     * @param {string|null} id
     */
    async setActiveConversationId(id) {
        throw new Error('Not implemented');
    }
}

const INDEX_KEY = 'bsc.conversations.index';
const ACTIVE_KEY = 'bsc.activeConversationId';
const conversationKey = (id) => `bsc.conversation.${id}`;

// Default implementation backed by the browser's localStorage.
// Host apps (e.g. Electron) are encouraged to replace this with
// their own storage when they need larger quotas or multi-device sync.
export class LocalStorageConversationProvider extends ConversationStorageInterface {
    _readIndex() {
        try {
            const raw = localStorage.getItem(INDEX_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.error('Failed to read conversations index:', err);
            return [];
        }
    }

    // Writes are not swallowed: localStorage can throw QuotaExceededError or
    // similar on large payloads, and callers (notably the autosave effect in
    // Chat.jsx) rely on that error surfacing so host apps can react to it.
    _writeIndex(index) {
        try {
            localStorage.setItem(INDEX_KEY, JSON.stringify(index));
        } catch (err) {
            throw new Error(
                `Failed to write conversations index (${err && err.name ? err.name : 'unknown error'}): ${err && err.message ? err.message : err}`,
                {cause: err}
            );
        }
    }

    async listConversations() {
        // Return a defensive copy, sorted newest first for convenient display.
        const index = this._readIndex();
        return [...index].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    async getConversation(id) {
        if (!id) return null;
        try {
            const raw = localStorage.getItem(conversationKey(id));
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.error(`Failed to read conversation ${id}:`, err);
            return null;
        }
    }

    async saveConversation(conversation) {
        if (!conversation || !conversation.id) {
            throw new Error('saveConversation requires an object with an id');
        }
        const toPersist = {
            version: 1,
            ...conversation,
        };
        const key = conversationKey(toPersist.id);
        try {
            localStorage.setItem(key, JSON.stringify(toPersist));
        } catch (err) {
            throw new Error(
                `Failed to write conversation ${toPersist.id} (${err && err.name ? err.name : 'unknown error'}): ${err && err.message ? err.message : err}`,
                {cause: err}
            );
        }

        const index = this._readIndex();
        const existingIdx = index.findIndex((c) => c.id === toPersist.id);
        const meta = {
            id: toPersist.id,
            title: toPersist.title,
            createdAt: toPersist.createdAt,
            updatedAt: toPersist.updatedAt,
            messageCount: Array.isArray(toPersist.messages) ? toPersist.messages.length : 0,
        };
        if (existingIdx >= 0) {
            index[existingIdx] = meta;
        } else {
            index.push(meta);
        }
        // If the index write fails we try to roll back the per-conversation
        // payload write we just did, so the index never gets out of sync with
        // actually-present conversation bodies.
        try {
            this._writeIndex(index);
        } catch (err) {
            try {
                localStorage.removeItem(key);
            } catch (_) {
                // best-effort rollback
            }
            throw err;
        }
    }

    async deleteConversation(id) {
        if (!id) return;
        localStorage.removeItem(conversationKey(id));
        const index = this._readIndex().filter((c) => c.id !== id);
        this._writeIndex(index);

        // If the deleted conversation was active, forget the active pointer.
        const active = localStorage.getItem(ACTIVE_KEY);
        if (active === id) {
            localStorage.removeItem(ACTIVE_KEY);
        }
    }

    async clearAll() {
        const index = this._readIndex();
        for (const meta of index) {
            localStorage.removeItem(conversationKey(meta.id));
        }
        localStorage.removeItem(INDEX_KEY);
        localStorage.removeItem(ACTIVE_KEY);
    }

    async getActiveConversationId() {
        const value = localStorage.getItem(ACTIVE_KEY);
        return value || null;
    }

    async setActiveConversationId(id) {
        if (id) {
            localStorage.setItem(ACTIVE_KEY, id);
        } else {
            localStorage.removeItem(ACTIVE_KEY);
        }
    }
}
