const getStatusClass = (status) => {
    switch (status) {
        case 'succeeded':
            return 'success';
        case 'failed':
            return 'danger';
        case 'running':
        case 'requesting':
            return 'warning';
        default:
            return 'secondary';
    }
}

const formatStructured = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return ''
        try {
            return JSON.stringify(JSON.parse(trimmed), null, 2)
        } catch {
            return value
        }
    }
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

// One tool call rendered as a collapsible entry: the header shows the tool
// name and status, the body (collapsed by default) holds arguments and result.
function ToolCallTrace({toolCall}) {
    if (!toolCall) return null
    const status = toolCall.status || 'requested'
    const args = formatStructured(toolCall.arguments)
    const result = formatStructured(toolCall.result)
    const error = formatStructured(toolCall.error)
    const name = toolCall.name || 'Function call'
    const callId = toolCall.callId || 'n/a'

    return (
        <details className="tool-call-entry">
            <summary className="tool-call-entry-header">
                <span className="fw-semibold text-break">{name}</span>
                <span className={`badge text-bg-${getStatusClass(status)} ms-auto`}>{status}</span>
            </summary>
            <div className="tool-call-entry-body">
                <div className="small text-muted text-break">id: {callId}</div>
                <div className="tool-call-label">Request arguments</div>
                <pre className="tool-call-pre">{args || '(none)'}</pre>
                <div className="tool-call-label">Result</div>
                <pre className="tool-call-pre">
                    {error || result || (status === 'failed' ? '(error unavailable)' : '(pending)')}
                </pre>
            </div>
        </details>
    )
}

export default ToolCallTrace
