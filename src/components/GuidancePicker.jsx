import {useState} from 'react'

/**
 * Tier 1 "Conversation Guidance" picker. Applies to the whole conversation:
 * selected prompts' text is folded into the system message on every request
 * (see Chat.jsx's streamResponse), and the selection is persisted with the
 * conversation itself so it survives switching away and back.
 *
 * Props:
 *  - prompts: merged managed + custom prompt list, each {id, label, description?, promptText, managed}
 *  - allowCustom: whether this host allows the user to add their own Tier 1 prompts
 *  - selectedIds: Set<string> of currently-selected prompt ids
 *  - onToggle(id): flip one prompt's selection
 *  - onAddCustomPrompt({label, promptText}): only called when allowCustom is true
 *  - onClose(): dismiss the picker
 */
function GuidancePicker({prompts, allowCustom, selectedIds, onToggle, onAddCustomPrompt, onClose}) {
    const [showAddForm, setShowAddForm] = useState(false)
    const [newLabel, setNewLabel] = useState('')
    const [newPromptText, setNewPromptText] = useState('')
    const [addError, setAddError] = useState(null)

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!newLabel.trim() || !newPromptText.trim()) return
        try {
            await onAddCustomPrompt({label: newLabel.trim(), promptText: newPromptText.trim()})
            setNewLabel('')
            setNewPromptText('')
            setShowAddForm(false)
            setAddError(null)
        } catch (err) {
            setAddError(err?.message || 'Could not save this playbook.')
        }
    }

    return (
        <>
            <div className="modal-backdrop fade show" style={{zIndex: 1040}} onClick={onClose}></div>
            <div
                className="modal d-block"
                tabIndex="-1"
                style={{zIndex: 1050}}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onClose?.()
                }}
            >
                <div
                    className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">
                                <i className="fas fa-shield-alt me-2"></i>
                                Conversation Guidance
                            </h5>
                            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
                        </div>

                        <div className="modal-body">
                            <p className="small mb-3" style={{color: 'var(--light)', opacity: 0.75}}>
                                Selections apply to every message in this conversation.
                                {!allowCustom && ' Managed by your organization -- ask your admin to add or update playbooks.'}
                            </p>

                            {prompts.length === 0 && (
                                <p className="small fst-italic" style={{color: 'var(--light)', opacity: 0.75}}>No guidance playbooks are configured yet.</p>
                            )}

                            <div className="list-group mb-2">
                                {prompts.map((prompt) => (
                                    <label key={prompt.id} className="list-group-item d-flex align-items-start gap-2">
                                        <input
                                            type="checkbox"
                                            className="form-check-input mt-1 flex-shrink-0"
                                            checked={selectedIds.has(prompt.id)}
                                            onChange={() => onToggle(prompt.id)}
                                        />
                                        <span className="flex-grow-1 min-width-0">
                                            <span className="d-flex align-items-center gap-2">
                                                <strong style={{color: 'var(--light)'}}>{prompt.label}</strong>
                                                {prompt.managed && (
                                                    <i className="fas fa-lock fa-xs" style={{color: 'var(--light)', opacity: 0.75}} title="Managed by your organization"></i>
                                                )}
                                            </span>
                                            {prompt.description && (
                                                <span className="d-block small" style={{color: 'var(--light)', opacity: 0.75}}>{prompt.description}</span>
                                            )}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            {allowCustom && (
                                <div className="border-top pt-2 mt-2">
                                    {!showAddForm ? (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-link p-0"
                                            onClick={() => setShowAddForm(true)}
                                        >
                                            <i className="fas fa-plus me-1"></i>
                                            Add your own playbook
                                        </button>
                                    ) : (
                                        <form onSubmit={handleAdd} className="mt-2">
                                            {addError && <div className="alert alert-danger py-1 px-2 small">{addError}</div>}
                                            <div className="mb-2">
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    placeholder="Name"
                                                    value={newLabel}
                                                    onChange={(e) => setNewLabel(e.target.value)}
                                                />
                                            </div>
                                            <div className="mb-2">
                                                <textarea
                                                    className="form-control form-control-sm"
                                                    placeholder="Guidance text sent to the model"
                                                    rows="3"
                                                    value={newPromptText}
                                                    onChange={(e) => setNewPromptText(e.target.value)}
                                                />
                                            </div>
                                            <div className="d-flex gap-2">
                                                <button type="submit" className="btn btn-sm btn-primary">Add</button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-link"
                                                    onClick={() => {
                                                        setShowAddForm(false)
                                                        setAddError(null)
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer d-flex justify-content-between align-items-center">
                            <small className="text-muted">{selectedIds.size} of {prompts.length} selected</small>
                            <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>Done</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default GuidancePicker
