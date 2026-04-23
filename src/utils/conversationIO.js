// Helpers for exporting/importing conversations and generating new ones.
//
// The on-disk export format is intentionally simple so other tools can
// produce / consume it:
//
//   {
//     "format": "bluesky.chat.conversations",
//     "version": 1,
//     "exportedAt": <epoch millis>,
//     "conversations": [ <conversation>, ... ]
//   }
//
// A single-conversation export uses the same top-level shape with a
// one-element array. For convenience, the importer also accepts:
//   * a bare conversation object with an `id` + `messages`
//   * a bare array of conversation objects

export const EXPORT_FORMAT = 'bluesky.chat.conversations';
export const EXPORT_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Generate a reasonably unique conversation id. Uses the platform's secure
 * RNG when available (all modern browsers + Electron) and falls back to a
 * timestamp+Math.random() hybrid otherwise.
 */
export const makeConversationId = () => {
    if (typeof globalThis !== 'undefined'
        && globalThis.crypto
        && typeof globalThis.crypto.randomUUID === 'function') {
        return `conv-${globalThis.crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `conv-${Date.now().toString(36)}-${rand}`;
};

/**
 * Derive a short, human-friendly title from a conversation's messages.
 * Falls back to "New Conversation" when no user content is available yet.
 */
export const deriveConversationTitle = (messages) => {
    if (!Array.isArray(messages)) return 'New Conversation';
    const firstUser = messages.find((m) => m && m.role === 'user' && typeof m.content === 'string');
    const raw = firstUser?.content?.trim();
    if (!raw) return 'New Conversation';
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    const max = 60;
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}\u2026` : singleLine;
};

/**
 * Trigger a JSON file download in the browser. Works in Electron renderer
 * processes as well (the anchor will be intercepted by the OS save dialog).
 */
export const downloadJson = (payload, filename) => {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || 'conversations.json';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        // Give the browser a tick to start the download before revoking.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
};

const sanitizeFilenamePart = (s) => String(s || 'conversation')
    .replace(/[^a-z0-9_\-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'conversation';

/**
 * Build an export payload for one or more conversations.
 * Input may be a single conversation or an array.
 */
export const buildExportPayload = (conversations) => {
    const list = Array.isArray(conversations) ? conversations : [conversations];
    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        conversations: list.map((c) => normalizeConversationForExport(c)),
    };
};

const normalizeConversationForExport = (c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    version: c.version ?? CURRENT_SCHEMA_VERSION,
    messages: Array.isArray(c.messages) ? c.messages : [],
});

/**
 * Export a single conversation with a filename derived from its title.
 */
export const exportConversation = (conversation) => {
    const payload = buildExportPayload([conversation]);
    const filename = `conversation-${sanitizeFilenamePart(conversation?.title)}.json`;
    downloadJson(payload, filename);
};

/**
 * Export many conversations into one file.
 */
export const exportAllConversations = (conversations) => {
    const payload = buildExportPayload(conversations);
    const filename = `conversations-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(payload, filename);
};

/**
 * Validate+normalize raw JSON text that a user is importing.
 * Accepts several shapes (see module header) and always returns an array of
 * fresh conversation objects ready for saving. New ids are generated so an
 * import never overwrites an existing conversation silently.
 *
 * Throws an Error with a user-friendly message if the input is not valid.
 */
export const parseImportedConversations = (text, {existingTitles = []} = {}) => {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error('File is not valid JSON.');
    }

    let rawList;
    if (Array.isArray(parsed)) {
        rawList = parsed;
    } else if (parsed && Array.isArray(parsed.conversations)) {
        // A top-level envelope can declare its own format/version. We only
        // reject envelopes that claim to be a DIFFERENT format or a newer
        // version than we understand — a bare envelope without these fields
        // (which some third-party tools may produce) is still accepted.
        if (typeof parsed.format === 'string' && parsed.format !== EXPORT_FORMAT) {
            throw new Error(`Unsupported file format "${parsed.format}" (expected "${EXPORT_FORMAT}").`);
        }
        if (typeof parsed.version === 'number' && parsed.version > EXPORT_VERSION) {
            throw new Error(`Unsupported export version ${parsed.version}; this build understands version ${EXPORT_VERSION} or older.`);
        }
        rawList = parsed.conversations;
    } else if (parsed && typeof parsed === 'object' && (parsed.id || parsed.messages)) {
        rawList = [parsed];
    } else {
        throw new Error('Unrecognized conversation file format.');
    }

    if (rawList.length === 0) {
        throw new Error('No conversations found in file.');
    }

    const now = Date.now();
    const takenTitles = new Set(existingTitles);
    return rawList.map((raw, idx) => {
        if (!raw || typeof raw !== 'object') {
            throw new Error(`Entry #${idx + 1} is not a conversation object.`);
        }
        const messages = Array.isArray(raw.messages) ? raw.messages : [];
        let title = typeof raw.title === 'string' && raw.title.trim()
            ? raw.title.trim()
            : deriveConversationTitle(messages);
        if (takenTitles.has(title)) {
            let candidate = `${title} (imported)`;
            let n = 2;
            while (takenTitles.has(candidate)) {
                candidate = `${title} (imported ${n++})`;
            }
            title = candidate;
        }
        takenTitles.add(title);
        return {
            id: makeConversationId(),
            title,
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
            updatedAt: now,
            version: CURRENT_SCHEMA_VERSION,
            messages,
        };
    });
};
