import {useState} from 'react'

/**
 * Tier 2 "Quick Prompts" picker -- message-level, not conversation-level.
 * Selections stay checked in this menu (and reflected in the toggle button's
 * badge count) and are folded into the *next* outgoing message only;
 * Chat.jsx clears the selection right after send.
 *
 * Props:
 *  - prompts: merged managed + custom prompt list, each {id, label, promptText, managed}
 *  - allowCustom: whether this host allows the user to add their own Tier 2 prompts
 *  - selectedIds: Set<string>
 *  - onToggle(id)
 *  - onAddCustomPrompt({label, promptText})
 */
function QuickPromptsMenu({prompts, allowCustom, selectedIds, onToggle, onAddCustomPrompt}) {
    const [showAddForm, setShowAddForm] = useState(false)
    const [newLabel, setNewLabel] = useState('')
    const [newPromptText, setNewPromptText] = useState('')
    const [addError, setAddError] = useState(null)

    const handleAdd = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!newLabel.trim() || !newPromptText.trim()) return
        try {
            await onAddCustomPrompt({label: newLabel.trim(), promptText: newPromptText.trim()})
            setNewLabel('')
            setNewPromptText('')
            setShowAddForm(false)
            setAddError(null)
        } catch (err) {
            setAddError(err?.message || 'Could not save this prompt.')
        }
    }

    return (
        <div className="dropup">
            <button
                type="button"
                className={`btn m-0 mr-2 d-inline-flex align-items-center justify-content-center ${selectedIds.size > 0 ? 'btn-primary' : 'btn-secondary'}`}
                style={{position: 'relative', width: '38px', height: '38px', padding: 0}}
                data-bs-toggle="dropdown"
                data-bs-boundary="viewport"
                aria-expanded="false"
                title="Quick prompts"
            >
                <i className="fas fa-clipboard-check"></i>
                {selectedIds.size > 0 && (
                    <span
                        className="badge rounded-pill bg-primary"
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            transform: 'translate(50%, -50%)',
                        }}
                    >
                        {selectedIds.size}
                    </span>
                )}
            </button>
            <div className="dropdown-menu quick-prompts-dropdown p-2" style={{minWidth: '270px'}} onClick={(e) => e.stopPropagation()}>
                <div className="px-2 pb-2 mb-2 border-bottom">
                    <strong className="small">Quick Prompts</strong>
                    <div className="small text-muted">Added to this message only -- cleared after you send.</div>
                </div>

                {prompts.length === 0 && (
                    <p className="small text-muted fst-italic px-2">No quick prompts are configured yet.</p>
                )}

                <div className="list-group list-group-flush mb-3" style={{maxHeight: '220px', overflowY: 'auto'}}>
                    {prompts.map((prompt) => (
                        <label key={prompt.id} className="list-group-item py-1 px-2 d-flex align-items-center gap-2">
                            <input
                                type="checkbox"
                                className="form-check-input flex-shrink-0"
                                style={{
                                    position: 'static',
                                    margin: 0,
                                    width: '1em',
                                    height: '1em',
                                    minWidth: '1em',
                                    minHeight: '1em',
                                }}
                                checked={selectedIds.has(prompt.id)}
                                onChange={() => onToggle(prompt.id)}
                            />
                            <span className="small">{prompt.label}</span>
                        </label>
                    ))}
                </div>

                {allowCustom && (
                    <div className="border-top pt-3 px-2">
                        {!showAddForm ? (
                            <button
                                type="button"
                                className="btn btn-sm btn-link p-0"
                                onClick={() => setShowAddForm(true)}
                            >
                                <i className="fas fa-plus me-1"></i>
                                Add your own
                            </button>
                        ) : (
                            <div className="mt-2">
                                {addError && <div className="alert alert-danger py-1 px-2 small">{addError}</div>}
                                <input
                                    type="text"
                                    className="form-control form-control-sm mb-2"
                                    placeholder="Name"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                />
                                <textarea
                                    className="form-control form-control-sm mb-2"
                                    placeholder="Prompt text"
                                    rows="2"
                                    value={newPromptText}
                                    onChange={(e) => setNewPromptText(e.target.value)}
                                />
                                <div className="d-flex gap-2">
                                    <button type="button" className="btn btn-sm btn-primary" onClick={handleAdd}>Add</button>
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
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default QuickPromptsMenu
