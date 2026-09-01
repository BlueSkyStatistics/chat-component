const asToolCallId = (toolCall, index) => toolCall?.id || `tool-call-${index}`;

const apiCallStreaming = async (
    messages,
    onUpdateStreamingMessage,
    selectedModel,
    abortSignal,
    additionalHeaders = {},
    callbacks = {}
) => {
    const toolCallState = new Map()
    const emitToolEvent = (payload) => {
        if (typeof callbacks.onToolCallEvent === 'function') {
            callbacks.onToolCallEvent(payload)
        }
    }
    const response = await fetch(selectedModel.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(selectedModel.apiKey && {'Authorization': `Bearer ${selectedModel.apiKey}`}),
            ...additionalHeaders
        },
        body: JSON.stringify({
            messages: messages,
            stream: true,
            model: selectedModel.name
        }),
        signal: abortSignal
    })

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json()
            errorData = errorData.error
        } catch (e) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        throw new Error(`HTTP error! type: ${errorData.type}\nmessage: ${errorData.message}`)

    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulatedResponse = ''

    while (true) {
        const {done, value} = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6))
                    const choice = data.choices?.[0]
                    const delta = choice?.delta || {}

                    if (Array.isArray(delta.tool_calls)) {
                        delta.tool_calls.forEach((toolCall, idx) => {
                            const toolIndex = toolCall?.index ?? idx
                            const previous = toolCallState.get(toolIndex) || {
                                callId: asToolCallId(toolCall, toolIndex),
                                name: '',
                                arguments: '',
                                status: 'requesting',
                            }
                            const next = {
                                callId: toolCall?.id || previous.callId,
                                name: toolCall?.function?.name || previous.name,
                                arguments: `${previous.arguments || ''}${toolCall?.function?.arguments || ''}`,
                                result: previous.result || '',
                                error: previous.error || '',
                                status: 'requesting',
                            }
                            toolCallState.set(toolIndex, next)
                            emitToolEvent(next)
                        })
                    }

                    if (choice?.finish_reason === 'tool_calls') {
                        for (const item of toolCallState.values()) {
                            emitToolEvent({...item, status: 'requested'})
                        }
                    }

                    if (Array.isArray(delta.tool_results)) {
                        delta.tool_results.forEach((resultEvent, idx) => {
                            const callId = resultEvent?.tool_call_id || `tool-call-${idx}`
                            const match = [...toolCallState.entries()].find(([, value]) => value.callId === callId)
                            const key = match ? match[0] : idx
                            const previous = toolCallState.get(key) || {
                                callId,
                                name: resultEvent?.name || '',
                                arguments: '',
                            }
                            const next = {
                                ...previous,
                                callId,
                                result: resultEvent?.result || '',
                                error: resultEvent?.error || '',
                                status: resultEvent?.error ? 'failed' : 'succeeded',
                            }
                            toolCallState.set(key, next)
                            emitToolEvent(next)
                        })
                    }
                    if (data.choices[0]?.delta?.content) {
                        accumulatedResponse += data.choices[0].delta.content
                        onUpdateStreamingMessage(accumulatedResponse)

                    }
                } catch (e) {
                    console.error('Error parsing streaming response:', e)
                }
            }
        }
    }
}

export {apiCallStreaming}