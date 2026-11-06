import ToolCallTrace from './ToolCallTrace'

const summarizeStatuses = (messages) => {
    const counts = {running: 0, failed: 0}
    messages.forEach((message) => {
        const status = message.toolCall?.status
        if (status === 'running' || status === 'requesting' || status === 'requested') counts.running += 1
        else if (status === 'failed') counts.failed += 1
    })
    return counts
}

// Renders consecutive tool call traces of one assistant turn as a single
// message item, with each call as a collapsible entry inside it.
function ToolCallGroup({messages, onCopy, onDelete}) {
    const copyPayload = () => {
        try {
            return JSON.stringify(messages.map((message) => message.toolCall || {}), null, 2)
        } catch {
            return ''
        }
    }
    const {running, failed} = summarizeStatuses(messages)
    const count = messages.length

    return (
        <div className="message assistant tool-call-group">
            <div className="message-actions">
                <div className="btn-group btn-group-sm shadow-sm my-0" role="group">
                    <button
                        className="m-0 btn btn-light"
                        onClick={() => onCopy(copyPayload())}
                        title="Copy to clipboard"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor"
                                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                    </button>
                    <button
                        className="text-danger m-0 btn btn-light"
                        onClick={() => onDelete(messages.map((message) => message.id))}
                        title="Delete tool calls"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor"
                                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div className="tool-call-group-header small text-muted">
                <i className="fas fa-wrench me-2"></i>
                {count === 1 ? '1 tool call' : `${count} tool calls`}
                {running > 0 && <span className="ms-2">· {running} running</span>}
                {failed > 0 && <span className="ms-2 text-danger">· {failed} failed</span>}
            </div>

            <div className="message-content tool-call-list">
                {messages.map((message) => (
                    <ToolCallTrace key={message.id} toolCall={message.toolCall}/>
                ))}
            </div>
        </div>
    )
}

export default ToolCallGroup
