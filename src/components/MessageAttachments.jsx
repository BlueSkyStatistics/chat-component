import AttachmentItem from './AttachmentItem'

function MessageAttachments({ 
    attachments, 
    showAttachments,
    expandedAttachments,
    onToggleShow,
    onToggleExpand,
    onCopy,
    getIconForType 
}) {
    if (!attachments || attachments.length === 0) return null

    return (
        <div className="message-attachments-container mt-2">
            <button
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
                onClick={onToggleShow}
            >
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d={
                        showAttachments
                            ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                            : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                    }/>
                </svg>
                <span>{attachments.length} Attachment{attachments.length !== 1 ? 's' : ''}</span>
            </button>
            {showAttachments && (
                <div className="d-flex flex-column gap-2 mt-2">
                    {attachments.map((attachment) => (
                        <AttachmentItem
                            key={attachment.id}
                            attachment={attachment}
                            isExpanded={expandedAttachments.has(attachment.id)}
                            onToggleExpand={onToggleExpand}
                            onCopy={onCopy}
                            getIconForType={getIconForType}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default MessageAttachments
