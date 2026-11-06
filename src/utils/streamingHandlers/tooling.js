const chatToolRegistry = new Map()

const parseToolArguments = (rawArguments) => {
    if (rawArguments === null || rawArguments === undefined || rawArguments === '') return {}
    if (typeof rawArguments === 'object') return rawArguments
    try {
        return JSON.parse(String(rawArguments))
    } catch {
        return {}
    }
}

// A tool may return `attachments: [{id, type, data, metadata, output?}]` (same shape as
// payloads passed to electronApi.sendOutputToChat). They are handed to the host chat via
// options.onAttachments so they get stored on the current user message exactly like a manual
// attachment (persisted, shown as chips, resolvable by fetchAttachmentById). The model only
// receives a lightweight manifest here, never the bulky data; it fetches content by id.
const applyResultAttachments = (result, options) => {
    if (!result || typeof result !== 'object' || !Array.isArray(result.attachments)) return result
    const {attachments, ...rest} = result
    if (attachments.length === 0 || typeof options.onAttachments !== 'function') return rest
    options.onAttachments(attachments)
    return {
        ...rest,
        attached: attachments.map((a) => ({id: a.id, type: a.type, title: a.metadata?.title || a.type})),
        note: 'Attached to the conversation. Call fetchAttachmentById with each id to read its content.',
    }
}

export const getRegisteredModelTools = () => {
    return [...chatToolRegistry.values()].map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }))
}

// The Chat Completions API (fetchApiRequest.js) and the Responses API
// (providerStreaming.js's streamResponses, used for the 'openai'/'azure'
// providers) declare function tools with different shapes:
//   - Chat Completions: { type: 'function', function: { name, description, parameters } }
//   - Responses API:    { type: 'function', name, description, parameters } (flat, no
//                        nested "function" object)
// getRegisteredModelTools() above returns the Chat Completions shape. Sending that
// same shape to the Responses API leaves tools[0] without a top-level "name", which
// the API rejects with "Missing required parameter: 'tools[0].name'". This variant
// returns the flat shape the Responses API actually requires.
export const getRegisteredModelToolsForResponsesAPI = () => {
    return [...chatToolRegistry.values()].map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
    }))
}

export const executeRegisteredToolCall = async (toolCall, options = {}) => {
    const name = toolCall?.name || ''
    const argumentsObject = parseToolArguments(toolCall?.arguments)
    const onStatusChange = options.onStatusChange
    if (!name) {
        return {ok: false, error: 'Tool call name is required.'}
    }
    const tool = chatToolRegistry.get(name)
    if (!tool) {
        return {ok: false, error: `Unsupported tool: ${name}`}
    }
    const updateStatus = (status, payload = {}) => {
        if (typeof onStatusChange === 'function') {
            onStatusChange({status, ...payload})
        }
    }
    try {
        const result = await tool.execute({
            arguments: argumentsObject,
            updateStatus,
            toolCall,
            conversationId: options.conversationId,
        })
        return applyResultAttachments(result, options)
    } catch (error) {
        return {
            ok: false,
            error: error?.message || String(error),
        }
    }
}

export const registerModelTool = (
    {
        name,
        description = '',
        parameters = {type: 'object', properties: {}},
        execute
    }) => {
    if (!name || typeof name !== 'string') {
        throw new Error('registerModelTool requires a non-empty string name.')
    }
    if (typeof execute !== 'function') {
        throw new Error(`registerModelTool("${name}") requires an execute function.`)
    }
    chatToolRegistry.set(name, {
        name,
        description,
        parameters,
        execute,
    })
    return () => {
        chatToolRegistry.delete(name)
    }
}
