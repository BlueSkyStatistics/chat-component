import {useEffect, useRef, useState} from 'react'
import {
    exportAllConversations,
    exportAllConversationsAsHtml,
    exportConversation,
    exportConversationAsHtml,
    parseImportedConversations,
} from './utils/conversationIO'

const formatDateTime = (ts) => {
    if (!ts) return ''
    try {
        return new Date(ts).toLocaleString()
    } catch {
        return ''
    }
}
/**
 * Format bytes as human-readable text.
 *
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 *
 * @return Formatted string.
 */
const formatFileSize = (bytes, si = false, dp = 1) => {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

    return bytes.toFixed(dp) + ' ' + units[u];
}

/**
 * Conversation manager modal.
 *
 * Props:
 *  - conversationStorage: storage provider (see ConversationStorageInterface)
 *  - activeConversationId: id of the conversation currently loaded in Chat
 *  - onRestore(id): called when the user picks a conversation to continue
 *  - onNew(): called when the user wants to start a new conversation
 *  - onClose(): close the modal
 *  - onActiveConversationDeleted(): invoked when the active conversation is
 *      removed so Chat can fall back to a fresh conversation
 *  - onActiveConversationChanged(conversation): called when the user renames
 *      the currently active conversation so Chat can reflect the new title
 *  - onStorageError(err): optional, forwards any storage provider error up to
 *      the chat component so host apps can surface it in their own UI
 */
function Conversations({
                           conversationStorage,
                           activeConversationId,
                           onRestore,
                           onNew,
                           onClose,
                           onActiveConversationDeleted,
                           onActiveConversationChanged,
                           onStorageError,
                       }) {
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [importError, setImportError] = useState(null)
    const [importSuccess, setImportSuccess] = useState(null)
    const [renamingId, setRenamingId] = useState(null)
    const [renameValue, setRenameValue] = useState('')
    const [confirmDeleteId, setConfirmDeleteId] = useState(null)
    const fileInputRef = useRef(null)

    const reportError = (err, userMessage) => {
        console.error(err)
        if (onStorageError) {
            try {
                onStorageError(err)
            } catch (cbErr) {
                console.error('onStorageError callback threw:', cbErr)
            }
        }
        setError(userMessage)
    }

    const refresh = async () => {
        setLoading(true)
        setError(null)
        try {
            const list = await conversationStorage.listConversations()
            setConversations(list || [])
        } catch (err) {
            reportError(err, 'Failed to load conversations.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationStorage])

    // Close on Escape for keyboard users.
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose?.()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const handleRestore = async (id, close = true) => {
        if (onRestore) await onRestore(id)
        close && onClose()
    }

    const handleNew = async () => {
        if (onNew) await onNew()
        onClose()
    }

    const handleDelete = async (id) => {
        try {
            await conversationStorage.deleteConversation(id)
            if (id === activeConversationId && onActiveConversationDeleted) {
                await onActiveConversationDeleted()
            }
            setConfirmDeleteId(null)
            await refresh()
        } catch (err) {
            reportError(err, 'Failed to delete conversation.')
        }
    }

    const beginRename = (meta) => {
        setRenamingId(meta.id)
        setRenameValue(meta.title || '')
    }

    const commitRename = async () => {
        if (!renamingId) return
        const id = renamingId
        const newTitle = renameValue.trim()
        setRenamingId(null)
        if (!newTitle) return
        try {
            const existing = await conversationStorage.getConversation(id)
            if (!existing) return
            const updated = {
                ...existing,
                title: newTitle,
                updatedAt: Date.now(),
            }
            await conversationStorage.saveConversation(updated)
            if (id === activeConversationId && onActiveConversationChanged) {
                onActiveConversationChanged(updated)
            }
            await refresh()
        } catch (err) {
            reportError(err, 'Failed to rename conversation.')
        }
    }

    const handleExportOne = async (id) => {
        try {
            const full = await conversationStorage.getConversation(id)
            if (!full) return
            exportConversation(full)
        } catch (err) {
            reportError(err, 'Failed to export conversation.')
        }
    }

    const handleExportOneAsHtml = async (id) => {
        try {
            const full = await conversationStorage.getConversation(id)
            if (!full) return
            exportConversationAsHtml(full)
        } catch (err) {
            reportError(err, 'Failed to export conversation as HTML.')
        }
    }

    // Load every saved conversation in full. Shared by both export-all flows
    // (JSON and HTML) so they stay in sync if storage changes.
    const loadAllForExport = async () => {
        const metas = await conversationStorage.listConversations()
        const fullList = await Promise.all(
            (metas || []).map((m) => conversationStorage.getConversation(m.id))
        )
        return fullList.filter(Boolean)
    }

    const handleExportAll = async () => {
        try {
            const toExport = await loadAllForExport()
            if (toExport.length === 0) {
                setError('There are no conversations to export.')
                return
            }
            exportAllConversations(toExport)
        } catch (err) {
            reportError(err, 'Failed to export conversations.')
        }
    }

    const handleExportAllAsHtml = async () => {
        try {
            const toExport = await loadAllForExport()
            if (toExport.length === 0) {
                setError('There are no conversations to export.')
                return
            }
            exportAllConversationsAsHtml(toExport)
        } catch (err) {
            reportError(err, 'Failed to export conversations as HTML.')
        }
    }

    const handleImportClick = () => {
        setImportError(null)
        setImportSuccess(null)
        fileInputRef.current?.click()
    }

    const handleImportChange = async (e) => {
        const file = e.target.files?.[0]
        e.target.value = '' // allow re-selecting the same file later
        if (!file) return
        try {
            const text = await file.text()
            const existingTitles = (await conversationStorage.listConversations() || [])
                .map((c) => c.title)
            const imported = parseImportedConversations(text, {existingTitles})
            for (const conversation of imported) {
                await conversationStorage.saveConversation(conversation)
            }
            setImportSuccess(`Imported ${imported.length} conversation${imported.length === 1 ? '' : 's'}.`)
            await refresh()
        } catch (err) {
            console.error('Import failed:', err)
            setImportError(err.message || 'Import failed.')
            if (onStorageError) {
                try {
                    onStorageError(err)
                } catch (cbErr) {
                    console.error('onStorageError callback threw:', cbErr)
                }
            }
        }
    }

    return (
        <>
            {/* Clicking the backdrop dismisses the modal, matching Bootstrap's default behaviour. */}
            <div
                className="modal-backdrop fade show"
                style={{zIndex: 1040}}
                onClick={onClose}
            ></div>

            <div
                className="modal d-block"
                tabIndex="-1"
                style={{zIndex: 1050}}
                onMouseDown={(e) => {
                    // Only close when the mousedown originated on the dialog
                    // wrapper itself (i.e. the dim area); clicks that start
                    // inside .modal-content must never dismiss the modal.
                    if (e.target === e.currentTarget) onClose?.()
                }}
            >
                <div
                    className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">
                                <i className="fas fa-comments me-2"></i>
                                Conversations
                            </h5>
                            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
                        </div>

                        <div className="modal-body">
                            <div className="d-flex flex-wrap gap-2 mb-3">
                                <button className="btn btn-primary btn-sm" onClick={handleNew}>
                                    <i className="fas fa-plus me-1"></i> New Conversation
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleImportClick}>
                                    <i className="fas fa-file-import me-1"></i> Import
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleExportAll}
                                    disabled={conversations.length === 0}
                                    title="Export all conversations as a JSON file"
                                >
                                    <i className="fas fa-file-export me-1"></i> Export All
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleExportAllAsHtml}
                                    disabled={conversations.length === 0}
                                    title="Export all conversations as a self-contained HTML viewer"
                                >
                                    <i className="fas fa-file-code me-1"></i> Export All (HTML)
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/json,.json"
                                    style={{display: 'none'}}
                                    onChange={handleImportChange}
                                />
                            </div>

                            {error && (
                                <div className="alert alert-danger py-2 small mb-2" role="alert">
                                    {error}
                                </div>
                            )}
                            {importError && (
                                <div className="alert alert-danger py-2 small mb-2" role="alert">
                                    Import failed: {importError}
                                </div>
                            )}
                            {importSuccess && (
                                <div className="alert alert-success py-2 small mb-2" role="alert">
                                    {importSuccess}
                                </div>
                            )}

                            {loading ? (
                                <p className="text-muted small mb-0">Loading conversations&hellip;</p>
                            ) : conversations.length === 0 ? (
                                <p className="text-muted small mb-0">
                                    No saved conversations yet. Start chatting and your conversation will be saved
                                    automatically.
                                </p>
                            ) : (
                                <div className="list-group">
                                    {conversations.map((meta) => {
                                        const isActive = meta.id === activeConversationId
                                        const isRenaming = renamingId === meta.id
                                        const isConfirmingDelete = confirmDeleteId === meta.id
                                        return (
                                            <a
                                                key={meta.id}
                                                className={`list-group-item list-group-item-action ${isActive ? 'list-group-item-primary' : ''}`}
                                                href={'#'}
                                                onClick={(e) => e.preventDefault() || handleRestore(meta.id, false)}
                                            >
                                                <div className="d-flex justify-content-between align-items-start gap-2">
                                                    <div className="flex-grow-1 min-w-0">
                                                        {isRenaming ? (
                                                            <div className="d-flex gap-2 align-items-center">
                                                                <input
                                                                    type="text"
                                                                    className="form-control form-control-sm"
                                                                    value={renameValue}
                                                                    autoFocus
                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') commitRename()
                                                                        if (e.key === 'Escape') setRenamingId(null)
                                                                    }}
                                                                />
                                                                <button
                                                                    className="btn btn-sm btn-success"
                                                                    onClick={commitRename}
                                                                    title="Save name"
                                                                >
                                                                    <i className="fas fa-check"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-light"
                                                                    onClick={() => setRenamingId(null)}
                                                                    title="Cancel"
                                                                >
                                                                    <i className="fas fa-times"></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="fw-semibold text-truncate"
                                                                     title={meta.title}>
                                                                    {isActive && (
                                                                        <span className="badge bg-primary me-2">
                                                                            Active
                                                                        </span>
                                                                    )}
                                                                    {meta.title || 'Untitled'}
                                                                </div>
                                                                <div className="text-muted small">
                                                                    {meta.messageCount ?? 0} message{meta.messageCount === 1 ? '' : 's'}
                                                                    {meta.updatedAt ? ` \u00b7 updated ${formatDateTime(meta.updatedAt)}` : ''}
                                                                    {meta.size ? ` \u00b7 updated ${formatFileSize(meta.size)}` : ''}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    {!isRenaming && (
                                                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                                            {isConfirmingDelete && (
                                                                <span className="text-danger small">
                                                                    Click again to confirm
                                                                </span>
                                                            )}
                                                            <div className="btn-group btn-group-sm" role="group">
                                                                <button
                                                                    className="btn btn-outline-secondary"
                                                                    onClick={() => beginRename(meta)}
                                                                    title="Rename"
                                                                >
                                                                    <i className="fas fa-pen"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-outline-secondary"
                                                                    onClick={() => handleExportOne(meta.id)}
                                                                    title="Export as JSON"
                                                                >
                                                                    <i className="fas fa-file-export"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-outline-secondary"
                                                                    onClick={() => handleExportOneAsHtml(meta.id)}
                                                                    title="Export as HTML"
                                                                >
                                                                    <i className="fas fa-file-code"></i>
                                                                </button>
                                                                <button
                                                                    className={`btn ${isConfirmingDelete ? 'btn-danger' : 'btn-outline-danger'}`}
                                                                    onClick={async () => {
                                                                        if (isConfirmingDelete) {
                                                                            await handleDelete(meta.id)
                                                                        } else {
                                                                            setConfirmDeleteId(meta.id)
                                                                        }
                                                                    }}
                                                                    onBlur={() => setConfirmDeleteId((cur) => (cur === meta.id ? null : cur))}
                                                                    title={isConfirmingDelete ? 'Click again to confirm' : 'Delete conversation'}
                                                                >
                                                                    <i className="fas fa-trash-alt"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </a>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button onClick={onClose} className="btn btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Conversations
