import {executeRegisteredToolCall, getRegisteredModelTools} from './tooling'
import {createToolTurnGuard} from './toolTurnGuard'
import {httpErrorFromResponse, streamEventErrorMessage} from './requestErrors'

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
    const toolGuard = createToolTurnGuard()

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
            throw await httpErrorFromResponse(response)
        }

        const handleLine = (line) => {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') return
            let data
            try {
                data = JSON.parse(line.slice(6))
            } catch (e) {
                console.error('Error parsing streaming response:', e)
                return
            }
            // Providers report failures mid-stream as an error chunk; surface
            // it instead of silently ending with an empty reply.
            const streamError = streamEventErrorMessage(data)
            if (streamError) {
                throw new Error(streamError)
            }
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

            if (delta.content) {
                currentRoundResponse += delta.content
                finalAssistantResponse += delta.content
                onUpdateStreamingMessage(finalAssistantResponse)
            }
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const {done, value} = await reader.read()
            if (done) break
            callbacks.onActivity?.()

            // Keep a partial trailing line for the next chunk: a JSON event
            // split across two network chunks used to be dropped.
            buffer += decoder.decode(value, {stream: true})
            let newlineIndex
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
                buffer = buffer.slice(newlineIndex + 1)
                handleLine(line)
            }
        }
        buffer += decoder.decode()
        if (buffer.trim()) handleLine(buffer.trim())

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
        const imageEntries = []
        for (const toolCall of toolCalls) {
            emitToolEvent({...toolCall, status: 'running'})
            const execution = toolGuard.check(toolCall) || await executeRegisteredToolCall(toolCall, {
                onStatusChange: (statusEvent) => {
                    emitToolEvent({
                        ...toolCall,
                        ...statusEvent,
                    })
                },
                conversationId: callbacks.conversationId,
                onAttachments: callbacks.onAttachments,
            })
            const shaped = toolGuard.shape(toolCall, execution)
            emitToolEvent({
                ...toolCall,
                result: shaped.text,
                error: shaped.error,
                status: shaped.failed ? 'failed' : 'succeeded',
            })
            toolResultMessages.push({
                role: 'tool',
                tool_call_id: toolCall.callId,
                content: shaped.text,
            })
            imageEntries.push({toolCall, images: shaped.images})
        }
        // Tool messages must directly follow the assistant tool_calls message,
        // so images travel in a user message appended after all of them.
        const imageMessage = toolGuard.makeImageMessage(imageEntries)

        requestMessages = toolGuard.compactToolHistory([
            ...requestMessages,
            assistantToolCallMessage,
            ...toolResultMessages,
            ...(imageMessage ? [imageMessage] : []),
        ])
    }

    throw new Error(`Exceeded maximum tool-calling rounds (${MAX_TOOL_ROUNDS}).`)
}

export {apiCallStreaming}
