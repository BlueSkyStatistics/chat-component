import {getAzureAccessToken} from '../providers/azureAuth'
import {apiCallStreaming} from './fetchApiRequest'
import {executeRegisteredToolCall, getRegisteredModelTools} from './tooling'

const normalizeRole = (role) => {
    if (['system', 'user', 'assistant', 'developer'].includes(role)) return role
    return 'user'
}

const normalizeContentPart = (part) => {
    if (!part) return null
    if (part.type === 'text') {
        return {type: 'input_text', text: part.text || ''}
    }
    if (part.type === 'image_url') {
        return {
            type: 'input_image',
            image_url: typeof part.image_url === 'string'
                ? part.image_url
                : part.image_url?.url || '',
        }
    }
    return null
}

const toResponsesInput = (messages) => {
    return (Array.isArray(messages) ? messages : []).map((message) => {
        const role = normalizeRole(message?.role)
        if (typeof message?.content === 'string') {
            return {role, content: message.content}
        }
        if (Array.isArray(message?.content)) {
            const parts = message.content.map(normalizeContentPart).filter(Boolean)
            return {role, content: parts.length > 0 ? parts : [{type: 'input_text', text: ''}]}
        }
        return {role, content: String(message?.content || '')}
    })
}

const toolKeyFromEvent = (event) => event?.item_id || `tool-${event?.output_index ?? -1}`
const toolKeyFromItem = (item, outputIndex) => item?.id || item?.call_id || `tool-${outputIndex ?? -1}`
const MAX_TOOL_ROUNDS = 6

// Streams a Responses API request using the renderer's native fetch + SSE
// parsing. Avoids bundling the OpenAI SDK, whose environment/streaming
// detection is unreliable inside an Electron renderer and caused fetch errors.
const streamResponses = async ({
    endpoint,
    headers,
    model,
    messages,
    onUpdateStreamingMessage,
    abortSignal,
    callbacks = {},
}) => {
    const emitToolEvent = (payload) => {
        if (typeof callbacks.onToolCallEvent === 'function') {
            callbacks.onToolCallEvent(payload)
        }
    }

    let finalResponseText = ''
    let pendingInput = toResponsesInput(messages)
    let previousResponseId = null

    const handleEvent = (dataJson, state) => {
        let event
        try {
            event = JSON.parse(dataJson)
        } catch (e) {
            console.error('Error parsing responses event:', e)
            return
        }

        const {type} = event

        switch (type) {
            case 'response.output_text.delta': {
                finalResponseText += event.delta || ''
                onUpdateStreamingMessage(finalResponseText)
                return
            }
            case 'response.created': {
                state.responseId = event.response?.id || state.responseId
                return
            }
            case 'response.output_item.added': {
                if (event.item?.type === 'function_call') {
                    const key = toolKeyFromItem(event.item, event.output_index)
                    const next = {
                        callId: event.item?.call_id || event.item?.id || `tool-${event.output_index}`,
                        name: event.item?.name || 'function_call',
                        arguments: event.item?.arguments || '',
                        result: '',
                        error: '',
                        status: 'requesting',
                    }
                    state.toolCalls.set(key, next)
                    emitToolEvent(next)
                    state.shouldExecuteTools = true
                }
                return
            }
            case 'response.function_call_arguments.delta': {
                const key = toolKeyFromEvent(event)
                const previous = state.toolCalls.get(key) || {
                    callId: event.item_id || `tool-${event.output_index}`,
                    name: 'function_call',
                    arguments: '',
                    result: '',
                    error: '',
                    status: 'requesting',
                }
                const next = {
                    ...previous,
                    arguments: `${previous.arguments || ''}${event.delta || ''}`,
                    status: 'requesting',
                }
                state.toolCalls.set(key, next)
                emitToolEvent(next)
                return
            }
            case 'response.function_call_arguments.done': {
                const key = toolKeyFromEvent(event)
                const previous = state.toolCalls.get(key) || {
                    callId: event.item_id || `tool-${event.output_index}`,
                    name: 'function_call',
                    arguments: '',
                    result: '',
                    error: '',
                }
                const next = {
                    ...previous,
                    arguments: event.arguments || previous.arguments || '',
                    status: 'requested',
                }
                state.toolCalls.set(key, next)
                emitToolEvent(next)
                return
            }
            case 'response.output_item.done': {
                if (event.item?.type === 'function_call') {
                    const key = toolKeyFromItem(event.item, event.output_index)
                    const previous = state.toolCalls.get(key) || {
                        callId: event.item?.call_id || event.item?.id || `tool-${event.output_index}`,
                        name: event.item?.name || 'function_call',
                        arguments: '',
                        result: '',
                        error: '',
                    }
                    const next = {
                        ...previous,
                        arguments: event.item?.arguments || previous.arguments || '',
                        status: 'requested',
                    }
                    state.toolCalls.set(key, next)
                    emitToolEvent(next)
                }
                if (event.item?.type === 'function_call_output') {
                    const key = toolKeyFromItem(event.item, event.output_index)
                    const previous = state.toolCalls.get(key) || {
                        callId: event.item?.call_id || event.item?.id || `tool-${event.output_index}`,
                        name: 'function_call',
                        arguments: '',
                        result: '',
                        error: '',
                    }
                    const next = {
                        ...previous,
                        result: event.item?.output || '',
                        error: '',
                        status: 'succeeded',
                    }
                    state.toolCalls.set(key, next)
                    emitToolEvent(next)
                }
                return
            }
            case 'response.failed': {
                throw new Error(event.response?.error?.message || 'Response request failed.')
            }
            case 'error': {
                throw new Error(event.message || event.error?.message || 'Response stream error.')
            }
            default:
                return
        }
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const tools = getRegisteredModelTools()
        const body = previousResponseId
            ? {model, previous_response_id: previousResponseId, input: pendingInput, stream: true, tools, tool_choice: 'auto'}
            : {model, input: pendingInput, stream: true, tools, tool_choice: 'auto'}
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
            signal: abortSignal,
        })

        if (!response.ok) {
            let message = `HTTP error! status: ${response.status}`
            try {
                const errorData = await response.json()
                message = `HTTP error! ${errorData?.error?.message || JSON.stringify(errorData)}`
            } catch (_) {
                // response body wasn't JSON; keep the status-only message
            }
            throw new Error(message)
        }

        const state = {
            responseId: null,
            toolCalls: new Map(),
            shouldExecuteTools: false,
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const {done, value} = await reader.read()
            if (done) break
            buffer += decoder.decode(value, {stream: true})

            let newlineIndex
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex)
                buffer = buffer.slice(newlineIndex + 1)
                if (line.startsWith('data: ')) {
                    const dataJson = line.slice(6)
                    if (dataJson === '[DONE]') continue
                    handleEvent(dataJson, state)
                }
            }
        }

        if (buffer.startsWith('data: ')) {
            const dataJson = buffer.slice(6)
            if (dataJson && dataJson !== '[DONE]') handleEvent(dataJson, state)
        }

        previousResponseId = state.responseId || previousResponseId
        if (!state.shouldExecuteTools || state.toolCalls.size === 0) {
            return
        }

        const toolOutputs = []
        for (const toolCall of state.toolCalls.values()) {
            if (toolCall.status !== 'requested') continue
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
            toolOutputs.push({
                type: 'function_call_output',
                call_id: toolCall.callId,
                output: formattedResult,
            })
        }

        if (toolOutputs.length === 0) {
            return
        }
        pendingInput = toolOutputs
    }

    throw new Error(`Exceeded maximum tool-calling rounds (${MAX_TOOL_ROUNDS}).`)
}

const streamManualResponse = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks = {}) => {
    return apiCallStreaming(messages, onUpdateStreamingMessage, selectedModel, abortSignal, {}, callbacks)
}

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'

const streamOpenAIResponse = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks = {}) => {
    const apiKey = selectedModel.apiKey || selectedModel.credential?.apiKey || ''
    return streamResponses({
        endpoint: OPENAI_RESPONSES_ENDPOINT,
        headers: apiKey ? {Authorization: `Bearer ${apiKey}`} : {},
        model: selectedModel.name,
        messages,
        onUpdateStreamingMessage,
        abortSignal,
        callbacks,
    })
}

const streamAzureResponse = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks = {}) => {
    const accessToken = await getAzureAccessToken(
        selectedModel.credential,
        selectedModel.credential.chatScopes,
        ['https://cognitiveservices.azure.com/.default']
    )
    const endpoint = `https://${selectedModel.credential.resourceName}.openai.azure.com/openai/v1/responses`
    return streamResponses({
        endpoint,
        headers: {Authorization: `Bearer ${accessToken}`},
        model: selectedModel.name,
        messages,
        onUpdateStreamingMessage,
        abortSignal,
        callbacks,
    })
}

const providerStreaming = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks = {}) => {
    const provider = selectedModel?.credential?.provider || 'manual'
    if (provider === 'azure') {
        return streamAzureResponse(messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks)
    }
    if (provider === 'openai') {
        return streamOpenAIResponse(messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks)
    }
    return streamManualResponse(messages, onUpdateStreamingMessage, selectedModel, abortSignal, callbacks)
}

export {providerStreaming}
