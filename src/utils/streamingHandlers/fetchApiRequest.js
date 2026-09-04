import {executeRegisteredToolCall, getRegisteredModelTools} from './tooling'

const asToolCallId = (toolCall, index) => toolCall?.id || `tool-call-${index}`
const MAX_TOOL_ROUNDS = 6

const apiCallStreaming = async (
    messages,
    onUpdateStreamingMessage,
    selectedModel,
    abortSignal,
    additionalHeaders = {},
    callbacks = {}
) => {
    const emitToolEvent = (payload) => {
        if (typeof callbacks.onToolCallEvent === 'function') {
            callbacks.onToolCallEvent(payload)
        }
    }

    let requestMessages = Array.isArray(messages) ? [...messages] : []
    let finalAssistantResponse = ''

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const toolCallState = new Map()
        let shouldExecuteTools = false
        let currentRoundResponse = ''
        const tools = getRegisteredModelTools()
        const response = await fetch(selectedModel.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(selectedModel.apiKey && {'Authorization': `Bearer ${selectedModel.apiKey}`}),
                ...additionalHeaders
            },
            body: JSON.stringify({
                messages: requestMessages,
                stream: true,
                model: selectedModel.name,
                tools,
                tool_choice: 'auto',
            }),
            signal: abortSignal
        })

        if (!response.ok) {
            let errorData
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
                                    result: '',
                                    error: '',
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
                            shouldExecuteTools = true
                            for (const item of toolCallState.values()) {
                                emitToolEvent({...item, status: 'requested'})
                            }
                        }

                        if (data.choices?.[0]?.delta?.content) {
                            currentRoundResponse += data.choices[0].delta.content
                            finalAssistantResponse += data.choices[0].delta.content
                            onUpdateStreamingMessage(finalAssistantResponse)
                        }
                    } catch (e) {
                        console.error('Error parsing streaming response:', e)
                    }
                }
            }
        }

        if (!shouldExecuteTools || toolCallState.size === 0) {
            return
        }

        const toolCalls = [...toolCallState.values()]
        const assistantToolCallMessage = {
            role: 'assistant',
            content: currentRoundResponse || '',
            tool_calls: toolCalls.map((toolCall) => ({
                id: toolCall.callId,
                type: 'function',
                function: {
                    name: toolCall.name,
                    arguments: toolCall.arguments || '{}',
                },
            })),
        }

        const toolResultMessages = []
        for (const toolCall of toolCalls) {
            emitToolEvent({...toolCall, status: 'running'})
            const execution = await executeRegisteredToolCall(toolCall, {
                onStatusChange: (statusEvent) => {
                    emitToolEvent({
                        ...toolCall,
                        ...statusEvent,
                    })
                },
            })
            const status = execution?.ok === false ? 'failed' : 'succeeded'
            const resultPayload = execution?.ok === false
                ? {ok: false, error: execution.error || 'Tool call failed.'}
                : execution
            const formattedResult = JSON.stringify(resultPayload)
            emitToolEvent({
                ...toolCall,
                result: formattedResult,
                error: status === 'failed' ? (execution?.error || 'Tool call failed.') : '',
                status,
            })
            toolResultMessages.push({
                role: 'tool',
                tool_call_id: toolCall.callId,
                content: formattedResult,
            })
        }

        requestMessages = [
            ...requestMessages,
            assistantToolCallMessage,
            ...toolResultMessages,
        ]
    }

    throw new Error(`Exceeded maximum tool-calling rounds (${MAX_TOOL_ROUNDS}).`)
}

export {apiCallStreaming}
