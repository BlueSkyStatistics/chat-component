/**
 * Flat chip row for staged Tier 2 quick prompts, shown above the composer
 * next to any pending attachments. Purely a display + remove affordance --
 * selection state itself lives in Chat.jsx.
 */
function PendingQuickPrompts({prompts, onRemove}) {
    if (!prompts || prompts.length === 0) return null

    return (
        <div className="d-flex flex-wrap gap-2 px-2 pt-2">
            {prompts.map((prompt) => (
                <span
                    key={prompt.id}
                    className="badge rounded-pill bg-primary-subtle text-primary-emphasis border border-primary-subtle d-inline-flex align-items-center gap-1 fw-normal"
                    style={{fontSize: '0.75rem', padding: '0.35rem 0.6rem'}}
                >
                    <i className="fas fa-check fa-xs"></i>
                    {prompt.label}
                    <button
                        type="button"
                        className="btn-close btn-close-sm"
                        style={{fontSize: '0.55rem'}}
                        onClick={() => onRemove(prompt.id)}
                        aria-label={`Remove ${prompt.label}`}
                    ></button>
                </span>
            ))}
        </div>
    )
}

export default PendingQuickPrompts
