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

function ToolCallTrace({toolCall}) {
    if (!toolCall) return null
    const status = toolCall.status || 'requested'
    const args = formatStructured(toolCall.arguments)
    const result = formatStructured(toolCall.result)
    const error = formatStructured(toolCall.error)
    const name = toolCall.name || 'Function call'
    const callId = toolCall.callId || 'n/a'

    return (
        <div className="tool-call-card">
            <div className="tool-call-header">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="fw-semibold">{name}</span>
                    <span className={`badge text-bg-${getStatusClass(status)}`}>{status}</span>
                </div>
                <div className="small text-muted text-break">id: {callId}</div>
            </div>

            <details className="tool-call-section">
                <summary>Request arguments</summary>
                <pre className="tool-call-pre mb-0">{args || '(none)'}</pre>
            </details>
            <details className="tool-call-section">
                <summary>Result</summary>
                <pre className="tool-call-pre mb-0">
                    {error || result || (status === 'failed' ? '(error unavailable)' : '(pending)')}
                </pre>
            </details>
        </div>
    )
}

export default ToolCallTrace
