import React, {useEffect, useRef, useState} from 'react'
import {
    exportAllConversations,
    exportConversation,
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
 */
function Conversations({
    conversationStorage,
    activeConversationId,
    onRestore,
    onNew,
    onClose,
    onActiveConversationDeleted,
    onActiveConversationChanged,
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

    const refresh = async () => {
        setLoading(true)
        setError(null)
        try {
            const list = await conversationStorage.listConversations()
            setConversations(list || [])
        } catch (err) {
            console.error('Failed to list conversations:', err)
            setError('Failed to load conversations.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleRestore = async (id) => {
        if (onRestore) await onRestore(id)
        onClose()
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
            console.error('Failed to delete conversation:', err)
            setError('Failed to delete conversation.')
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
            console.error('Failed to rename conversation:', err)
            setError('Failed to rename conversation.')
        }
    }

    const handleExportOne = async (id) => {
        try {
            const full = await conversationStorage.getConversation(id)
            if (!full) return
            exportConversation(full)
        } catch (err) {
            console.error('Failed to export conversation:', err)
            setError('Failed to export conversation.')
        }
    }

    const handleExportAll = async () => {
        try {
            const metas = await conversationStorage.listConversations()
            const fullList = await Promise.all(
                (metas || []).map((m) => conversationStorage.getConversation(m.id))
            )
            const toExport = fullList.filter(Boolean)
            if (toExport.length === 0) {
                setError('There are no conversations to export.')
                return
            }
            exportAllConversations(toExport)
        } catch (err) {
            console.error('Failed to export all conversations:', err)
            setError('Failed to export conversations.')
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
        }
    }

    return (
        <>
            <div className="modal-backdrop fade show" style={{zIndex: 1040}}></div>

            <div className="modal d-block" tabIndex="-1" style={{zIndex: 1050}}>
                <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
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
                                <button className="btn btn-outline-secondary btn-sm" onClick={handleImportClick}>
                                    <i className="fas fa-file-import me-1"></i> Import
                                </button>
                                <button
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={handleExportAll}
                                    disabled={conversations.length === 0}
                                >
                                    <i className="fas fa-file-export me-1"></i> Export All
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
                                    No saved conversations yet. Start chatting and your conversation will be saved automatically.
                                </p>
                            ) : (
                                <div className="list-group">
                                    {conversations.map((meta) => {
                                        const isActive = meta.id === activeConversationId
                                        const isRenaming = renamingId === meta.id
                                        const isConfirmingDelete = confirmDeleteId === meta.id
                                        return (
                                            <div
                                                key={meta.id}
                                                className={`list-group-item ${isActive ? 'list-group-item-primary' : ''}`}
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
                                                                <div className="fw-semibold text-truncate" title={meta.title}>
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
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    {!isRenaming && (
                                                        <div className="btn-group btn-group-sm flex-shrink-0" role="group">
                                                            <button
                                                                className="btn btn-outline-primary"
                                                                onClick={() => handleRestore(meta.id)}
                                                                disabled={isActive}
                                                                title={isActive ? 'Already active' : 'Open this conversation'}
                                                            >
                                                                <i className="fas fa-folder-open"></i>
                                                            </button>
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
                                                                className={`btn ${isConfirmingDelete ? 'btn-danger' : 'btn-outline-danger'}`}
                                                                onClick={() => {
                                                                    if (isConfirmingDelete) {
                                                                        handleDelete(meta.id)
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
                                                    )}
                                                </div>
                                            </div>
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
