import {useEffect} from 'react'
import PendingAttachmentItem from './PendingAttachmentItem'

function PendingAttachments({ 
    attachments, 
    expandedAttachments,
    onToggleExpand,
    onRemoveAttachment,
    onRemoveGroup,
    onCopy,
    getIconForType 
}) {
    const groupAttachmentsByOutput = (attachments) => {
        return attachments.reduce((groups, attachment) => {
            const outputId = attachment.output?.id || 'ungrouped'
            if (!groups[outputId]) {
                groups[outputId] = {
                    title: attachment.output?.title || 'Attachments',
                    items: []
                }
            }
            groups[outputId].items.push(attachment)
            return groups
        }, {})
    }

    // Initialize Bootstrap tooltips
    useEffect(() => {
        if (typeof window.bootstrap !== 'undefined') {
            const accordionButtons = document.querySelectorAll('#attachmentAccordion .accordion-button[title]')
            const tooltipInstances = []
            
            accordionButtons.forEach(el => {
                if (el) {
                    const tooltip = new window.bootstrap.Tooltip(el, {
                        trigger: 'hover',
                        placement: 'top'
                    })
                    tooltipInstances.push(tooltip)
                }
            })
            
            return () => {
                tooltipInstances.forEach(tooltip => {
                    tooltip?.dispose()
                })
            }
        }
    }, [attachments])

    if (attachments.length === 0) return null

    const groupedAttachments = groupAttachmentsByOutput(attachments)

    return (
        <div className="pending-attachments-wrapper p-2 border-top bg-light">
            <div className="accordion accordion-flush" id="attachmentAccordion">
                {Object.entries(groupedAttachments).map(([outputId, group]) => (
                    <div className="accordion-item" key={outputId}>
                        <h2 className="accordion-header">
                            <button 
                                className="accordion-button collapsed py-1 px-2" 
                                type="button" 
                                data-bs-toggle="collapse" 
                                data-bs-target={`#collapse-${outputId}`}
                                aria-expanded="false"
                                title={group.title}
                            >
                                <small className="me-2 fw-bold text-truncate group-title">{group.title}</small>
                                <span className="badge bg-secondary badge-sm flex-shrink-0">{group.items.length}</span>
                            </button>
                            <button
                                className="btn btn-sm btn-link text-danger p-0 group-delete-btn"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRemoveGroup(outputId)
                                }}
                                title="Delete group"
                            >
                                <i className="fas fa-trash fa-sm"></i>
                            </button>
                        </h2>
                        <div 
                            id={`collapse-${outputId}`} 
                            className="accordion-collapse collapse"
                            data-bs-parent="#attachmentAccordion"
                        >
                            <div className="accordion-body p-2">
                                <div className="d-flex flex-column gap-2">
                                    {group.items.map((attachment) => (
                                        <PendingAttachmentItem
                                            key={attachment.id}
                                            attachment={attachment}
                                            isExpanded={expandedAttachments.has(attachment.id)}
                                            onToggleExpand={onToggleExpand}
                                            onRemove={onRemoveAttachment}
                                            onCopy={onCopy}
                                            getIconForType={getIconForType}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default PendingAttachments
