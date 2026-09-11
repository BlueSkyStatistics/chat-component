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
        })
        return result
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
