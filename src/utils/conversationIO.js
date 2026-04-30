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
 * Trigger an HTML file download in the browser. Mirrors `downloadJson`.
 */
export const downloadHtml = (html, filename) => {
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || 'conversations.html';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
};

const escapeHtmlAttr = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Encode a JSON payload safely so it can be embedded inside an inline
// `<script type="application/json">` tag without prematurely closing it.
const encodeJsonForScriptTag = (obj) => JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * Build a self-contained HTML viewer for one or more conversations.
 *
 * The returned string is a complete HTML document. When opened in a browser
 * it shows a sidebar listing every exported conversation and renders the
 * selected conversation's messages (markdown, code blocks and any embedded
 * attachments) in the main area. The original export envelope is embedded
 * verbatim inside a `<script type="application/json">` tag so the file also
 * works as a portable archive.
 */
export const buildConversationsHtml = (conversations) => {
    const payload = buildExportPayload(conversations);
    const list = payload.conversations;
    const docTitle = list.length === 1
        ? `Conversation: ${list[0].title || 'Untitled'}`
        : `Conversations (${list.length})`;
    const exportedAtIso = new Date(payload.exportedAt).toISOString();

    const styles = `
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        color: #1f2328; background: #f6f8fa;
      }
      .app { display: grid; grid-template-columns: 320px 1fr; height: 100vh; }
      @media (max-width: 720px) { .app { grid-template-columns: 1fr; height: auto; } }
      .sidebar {
        border-right: 1px solid #d0d7de; background: #fff; overflow-y: auto;
        display: flex; flex-direction: column;
      }
      .sidebar-header { padding: 16px; border-bottom: 1px solid #d0d7de; }
      .sidebar-header h1 { font-size: 16px; margin: 0 0 4px; }
      .sidebar-header .meta { color: #57606a; font-size: 12px; }
      .conv-list { display: flex; flex-direction: column; }
      .conv {
        display: block; padding: 12px 16px; border-bottom: 1px solid #eaeef2;
        text-decoration: none; color: inherit; cursor: pointer;
      }
      .conv:hover { background: #f6f8fa; }
      .conv-active { background: #ddf4ff !important; }
      .conv-title { font-weight: 600; font-size: 14px; word-break: break-word; }
      .conv-meta { color: #57606a; font-size: 12px; margin-top: 2px; }
      .content { overflow-y: auto; padding: 24px; }
      .conv-header h2 { margin: 0 0 4px; font-size: 22px; }
      .conv-sub { color: #57606a; font-size: 13px; margin: 0 0 24px; }
      .empty { color: #57606a; }
      .msg {
        background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
        padding: 12px 16px; margin-bottom: 16px;
      }
      .msg-role {
        font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
        color: #57606a; margin-bottom: 6px; font-weight: 600;
      }
      .msg-user { background: #ddf4ff; border-color: #b6e3ff; }
      .msg-assistant { background: #fff; }
      .msg-error { background: #ffebe9; border-color: #ffcecb; }
      .msg-body { line-height: 1.55; word-wrap: break-word; }
      .msg-body p:first-child { margin-top: 0; }
      .msg-body p:last-child { margin-bottom: 0; }
      .msg-body pre {
        background: #0d1117; color: #e6edf3; padding: 12px; border-radius: 6px;
        overflow: auto; font-size: 13px;
      }
      .msg-body code { background: rgba(175,184,193,.2); padding: 1px 4px; border-radius: 4px; font-size: .9em; }
      .msg-body pre code { background: transparent; padding: 0; }
      .msg-body table { border-collapse: collapse; }
      .msg-body th, .msg-body td { border: 1px solid #d0d7de; padding: 4px 8px; }
      .atts { margin: 8px 0; }
      .atts > summary { cursor: pointer; color: #57606a; font-size: 13px; }
      .att { border: 1px solid #d0d7de; border-radius: 6px; margin-top: 8px; overflow: hidden; }
      .att-title { padding: 6px 10px; background: #f6f8fa; font-size: 12px; font-weight: 600; border-bottom: 1px solid #d0d7de; }
      .att-code pre { margin: 0; border-radius: 0; }
      .att-chart img { max-width: 100%; display: block; }
      .att-html { padding: 8px; overflow-x: auto; }
      .att-html table { border-collapse: collapse; }
      .att-html th, .att-html td { border: 1px solid #d0d7de; padding: 4px 8px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0d1117; color: #e6edf3; }
        .sidebar { background: #161b22; border-color: #30363d; }
        .sidebar-header, .conv { border-color: #21262d; }
        .conv:hover { background: #21262d; }
        .conv-active { background: #1f6feb33 !important; }
        .conv-meta, .conv-sub, .sidebar-header .meta, .empty { color: #8b949e; }
        .msg { background: #161b22; border-color: #30363d; }
        .msg-user { background: #1f6feb22; border-color: #1f6feb55; }
        .msg-error { background: #f8514922; border-color: #f8514955; }
        .att { border-color: #30363d; }
        .att-title { background: #21262d; border-color: #30363d; }
        .msg-body code { background: rgba(110,118,129,.4); }
        .msg-body th, .msg-body td, .att-html th, .att-html td { border-color: #30363d; }
      }
    `;

    const viewerScript = `
      (function () {
        var el = document.getElementById('conversations-data');
        var raw = el ? el.textContent : '';
        var data;
        try { data = JSON.parse(raw); } catch (e) {
          document.body.innerHTML = '<p style="padding:24px;color:#cf222e">Failed to parse embedded conversation data.</p>';
          return;
        }
        var conversations = (data && Array.isArray(data.conversations)) ? data.conversations : [];

        function escapeHtml(s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        function formatDate(ts) {
          if (!ts) return '';
          try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
        }
        function renderMarkdown(text) {
          var t = text == null ? '' : String(text);
          if (typeof window.marked !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
            try { return window.marked.parse(t, { breaks: true, gfm: true }); }
            catch (e) { /* fall through */ }
          }
          return '<pre>' + escapeHtml(t) + '</pre>';
        }
        function renderAttachment(att) {
          var type = (att && att.type) || '';
          var meta = (att && att.metadata) || {};
          var title = meta.title || type || 'attachment';
          var titleHtml = '<div class="att-title">' + escapeHtml(title) + '</div>';
          if (type === 'code') {
            var lang = meta.language ? String(meta.language) : '';
            return '<div class="att att-code">' + titleHtml +
              '<pre><code class="language-' + escapeHtml(lang) + '">' + escapeHtml(att.data || '') + '</code></pre>' +
              '</div>';
          }
          if (type === 'chart') {
            return '<div class="att att-chart">' + titleHtml +
              '<img src="' + escapeHtml(att.data || '') + '" alt="' + escapeHtml(title) + '" />' +
              '</div>';
          }
          if (type === 'table') {
            // Tables are exported as raw HTML by the chat component; trust the
            // author's own data here so the table renders as it did in chat.
            return '<div class="att att-table">' + titleHtml +
              '<div class="att-html">' + (att.data || '') + '</div>' +
              '</div>';
          }
          return '<div class="att">' + titleHtml + '</div>';
        }
        function renderMessage(m) {
          var role = (m && m.role) || 'assistant';
          var atts = Array.isArray(m && m.attachments) ? m.attachments : [];
          var attHtml = '';
          if (atts.length) {
            attHtml = '<details class="atts"><summary>' + atts.length + ' attachment' +
              (atts.length === 1 ? '' : 's') + '</summary>' + atts.map(renderAttachment).join('') + '</details>';
          }
          return '<article class="msg msg-' + escapeHtml(role) + '">' +
            '<header class="msg-role">' + escapeHtml(role) + '</header>' +
            attHtml +
            '<div class="msg-body">' + renderMarkdown(m && m.content) + '</div>' +
            '</article>';
        }
        function renderSidebar(activeId) {
          var sidebar = document.getElementById('conv-list');
          sidebar.innerHTML = conversations.map(function (c, i) {
            var msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
            var id = c.id || ('idx-' + i);
            return '<a href="#" data-id="' + escapeHtml(id) + '" class="conv' +
              (id === activeId ? ' conv-active' : '') + '">' +
              '<div class="conv-title">' + escapeHtml(c.title || 'Untitled') + '</div>' +
              '<div class="conv-meta">' + msgCount + ' message' + (msgCount === 1 ? '' : 's') +
              (c.updatedAt ? ' \u00b7 ' + escapeHtml(formatDate(c.updatedAt)) : '') +
              '</div></a>';
          }).join('');
        }
        function renderContent(c) {
          var content = document.getElementById('conv-content');
          if (!c) { content.innerHTML = '<p class="empty">Select a conversation to view it.</p>'; return; }
          var msgs = Array.isArray(c.messages) ? c.messages : [];
          content.innerHTML =
            '<header class="conv-header"><h2>' + escapeHtml(c.title || 'Untitled') + '</h2>' +
            '<p class="conv-sub">' + msgs.length + ' message' + (msgs.length === 1 ? '' : 's') +
            (c.updatedAt ? ' \u00b7 updated ' + escapeHtml(formatDate(c.updatedAt)) : '') + '</p></header>' +
            msgs.map(renderMessage).join('');
          content.scrollTop = 0;
        }
        function selectConversation(id) {
          var c = null;
          for (var i = 0; i < conversations.length; i++) {
            var cid = conversations[i].id || ('idx-' + i);
            if (cid === id) { c = conversations[i]; break; }
          }
          renderSidebar(id);
          renderContent(c);
          if (c) {
            try { history.replaceState(null, '', '#' + encodeURIComponent(c.id || ('idx-' + conversations.indexOf(c)))); }
            catch (e) { /* ignore */ }
          }
        }
        document.getElementById('conv-list').addEventListener('click', function (e) {
          var a = e.target && e.target.closest && e.target.closest('a[data-id]');
          if (!a) return;
          e.preventDefault();
          selectConversation(a.getAttribute('data-id'));
        });

        renderSidebar();
        var initial = conversations[0];
        var hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
        if (hash) {
          for (var j = 0; j < conversations.length; j++) {
            var cid2 = conversations[j].id || ('idx-' + j);
            if (cid2 === hash) { initial = conversations[j]; break; }
          }
        }
        if (initial) selectConversation(initial.id || ('idx-' + conversations.indexOf(initial)));
        else renderContent(null);
      })();
    `;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtmlAttr(docTitle)}</title>
<!-- Optional markdown rendering. The viewer falls back to a <pre> block when offline. -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>${styles}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>${escapeHtmlAttr(docTitle)}</h1>
      <div class="meta">${list.length} conversation${list.length === 1 ? '' : 's'} \u00b7 exported ${escapeHtmlAttr(exportedAtIso)}</div>
    </div>
    <nav id="conv-list" class="conv-list" aria-label="Conversations"></nav>
  </aside>
  <main id="conv-content" class="content"><p class="empty">Select a conversation to view it.</p></main>
</div>
<script id="conversations-data" type="application/json">${encodeJsonForScriptTag(payload)}</script>
<script>${viewerScript}</script>
</body>
</html>
`;
};

/**
 * Export a single conversation as a self-contained HTML viewer.
 */
export const exportConversationAsHtml = (conversation) => {
    const html = buildConversationsHtml([conversation]);
    const filename = `conversation-${sanitizeFilenamePart(conversation?.title)}.html`;
    downloadHtml(html, filename);
};

/**
 * Export many conversations into a single self-contained HTML viewer.
 */
export const exportAllConversationsAsHtml = (conversations) => {
    const html = buildConversationsHtml(conversations);
    const filename = `conversations-${new Date().toISOString().slice(0, 10)}.html`;
    downloadHtml(html, filename);
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
