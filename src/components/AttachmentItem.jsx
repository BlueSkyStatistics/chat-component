import AttachmentContent from './AttachmentContent'

function AttachmentItem({ 
    attachment, 
    isExpanded, 
    onToggleExpand, 
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
        <div className="attachment-item">
            <div className="d-flex justify-content-between align-items-center p-2 gap-2">
                <div className="d-flex align-items-center flex-grow-1 min-w-0">
                    <i className={`fas fa-${getIconForType(attachment.type)} me-2 flex-shrink-0`}></i>
                    {itemHref ? (
                        <a 
                            href={itemHref} 
                            className="text-decoration-none text-truncate fw-medium"
                            style={{fontSize: '0.9em'}}
                            title={itemTitle}
                            onClick={handleHrefClick}
                        >
                            {itemTitle}
                        </a>
                    ) : (
                        <span className="text-truncate fw-medium" style={{fontSize: '0.9em'}} title={itemTitle}>
                            {itemTitle}
                        </span>
                    )}
                </div>
                <button
                    className="btn btn-sm btn-secondary flex-shrink-0 m-0"
                    onClick={() => onToggleExpand(attachment.id)}
                    title={isExpanded ? 'Hide content' : 'View content'}
                >
                    <i className={`fas fa-${isExpanded ? 'eye-slash' : 'eye'}`}></i>
                </button>
            </div>
            {isExpanded && (
                <AttachmentContent attachment={attachment} onCopy={onCopy} />
            )}
        </div>
    )
}

export default AttachmentItem
