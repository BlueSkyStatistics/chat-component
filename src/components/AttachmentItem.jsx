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

    return (
        <div className="attachment-item">
            <div className="attachment-header">
                <div className="attachment-title-section">
                    <i className={`fas fa-${getIconForType(attachment.type)} me-2 text-muted`}></i>
                    {itemHref ? (
                        <a 
                            href={itemHref} 
                            className="attachment-title-link"
                            title={itemTitle}
                        >
                            {itemTitle}
                        </a>
                    ) : (
                        <span className="attachment-title" title={itemTitle}>
                            {itemTitle}
                        </span>
                    )}
                </div>
                <button
                    className="btn btn-sm btn-outline-secondary view-button"
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
