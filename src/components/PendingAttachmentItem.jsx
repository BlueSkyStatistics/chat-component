import AttachmentContent from './AttachmentContent'

function PendingAttachmentItem({ 
    attachment, 
    isExpanded, 
    onToggleExpand, 
    onRemove, 
    onCopy,
    getIconForType 
}) {
    const itemTitle = attachment.metadata?.title || attachment.type
    const itemHref = attachment.metadata?.href
    const handleHrefClick = (e) => {
        // Prevent the default link behavior if needed
        e.preventDefault()
        // Custom logic can be added here if necessary
        window.scrollOutputItemIntoView && window.scrollOutputItemIntoView(itemHref.slice(1))
    }

    return (
        <div className="pending-attachment-card">
            <div className="d-flex justify-content-between align-items-center p-2 bg-light">
                <div className="d-flex align-items-center flex-grow-1 min-w-0">
                    <i className={`fas fa-${getIconForType(attachment.type)} me-2 text-muted flex-shrink-0`}></i>
                    {itemHref ? (
                        <a 
                            href={itemHref} 
                            className="text-decoration-none text-primary text-truncate"
                            title={itemTitle}
                            onClick={handleHrefClick}
                        >
                            <small>{itemTitle}</small>
                        </a>
                    ) : (
                        <small className="text-truncate" title={itemTitle}>
                            {itemTitle}
                        </small>
                    )}
                </div>
                <div className="d-flex gap-1 flex-shrink-0">
                    <button
                        className="btn btn-sm px-1 py-0"
                        onClick={() => onToggleExpand(attachment.id)}
                        title={isExpanded ? 'Hide content' : 'View content'}
                    >
                        <i className={`fas fa-${isExpanded ? 'eye-slash' : 'eye'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm btn-link text-danger p-0"
                        onClick={() => onRemove(attachment.id)}
                        title="Remove item"
                    >
                        <i className="fas fa-times fa-sm"></i>
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="p-2 bg-white border-top chat-attachment-container">
                    <AttachmentContent attachment={attachment} onCopy={onCopy} />
                </div>
            )}
        </div>
    )
}

export default PendingAttachmentItem
