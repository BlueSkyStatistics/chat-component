// Keeps tool-calling loops from overflowing the model's context window.
//
// - Image attachments (charts are base64 data URLs) cannot be truncated, and
//   sending them as JSON text is far more expensive than sending them as an
//   image. They are pulled out of the tool result and handed back as image
//   parts for a follow-up user message.
// - Remaining text results are capped, and a per-turn budget limits the total
//   amount of tool output (and number of calls) that one user turn can pull in.
// - compactToolHistory() shrinks tool outputs from earlier rounds so they are
//   not resent on every later round (Chat Completions path only).

export const TOOL_LIMITS = {
    maxResultChars: 16000,
    turnBudgetChars: 60000,
    maxCallsPerTurn: 20,
    maxImagesPerTurn: 4,
    keepRecentRounds: 1,
}

const IMAGE_PLACEHOLDER = '[image omitted from text; attached as an image in the following message]'
const COMPACTED_PREFIX = '[Earlier tool output omitted to save context'
const MIN_COMPACT_CHARS = 300

const isImageDataUrl = (value) => typeof value === 'string' && /^data:image\//i.test(value)

const stableKey = (toolCall) => {
    const raw = toolCall?.arguments
    let args = raw
    if (typeof raw === 'string') {
        try {
            args = JSON.parse(raw)
        } catch {
            args = raw
        }
    }
    const normalized = args && typeof args === 'object'
        ? JSON.stringify(Object.keys(args).sort().map((key) => [key, args[key]]))
        : String(args ?? '')
    return `${toolCall?.name || ''}:${normalized}`
}

const extractImages = (payload) => {
    const data = payload?.attachment?.data
    if (!isImageDataUrl(data)) return {payload, images: []}
    return {
        payload: {...payload, attachment: {...payload.attachment, data: IMAGE_PLACEHOLDER}},
        images: [data],
    }
}

export const createToolTurnGuard = (limits = {}) => {
    const config = {...TOOL_LIMITS, ...limits}
    const seen = new Map() // key -> callId of the successful call
    const compacted = new Set() // callIds whose output was elided from history
    const imageMessages = new WeakSet()
    let calls = 0
    let usedChars = 0
    let usedImages = 0

    // Returns a failed execution result when the call must not run, else null.
    const check = (toolCall) => {
        calls += 1
        if (calls > config.maxCallsPerTurn) {
            return {
                ok: false,
                error: `Tool call limit reached for this turn (${config.maxCallsPerTurn}). Answer with the information already retrieved, or ask the user to narrow the request.`,
            }
        }
        const priorCallId = seen.get(stableKey(toolCall))
        if (priorCallId && !compacted.has(priorCallId)) {
            return {
                ok: false,
                error: 'This exact tool call was already made in this turn and its result is earlier in the conversation. Reuse it instead of calling again.',
            }
        }
        return null
    }

    // Turns a raw execution into {text, images, failed, error} that is safe to send.
    const shape = (toolCall, execution) => {
        if (execution?.ok === false) {
            const error = execution.error || 'Tool call failed.'
            return {text: JSON.stringify({ok: false, error}), images: [], failed: true, error}
        }

        const extracted = extractImages(execution)
        let payload = extracted.payload
        let images = extracted.images
        let imageNote = ''
        if (images.length > 0 && usedImages + images.length > config.maxImagesPerTurn) {
            images = []
            imageNote = `Image omitted: at most ${config.maxImagesPerTurn} images can be fetched per turn.`
            payload = {...payload, attachment: {...payload.attachment, data: imageNote}}
        }

        let text = JSON.stringify(payload)
        if (text.length > config.maxResultChars) {
            const totalChars = text.length
            text = JSON.stringify({
                ok: true,
                truncated: true,
                totalChars,
                note: 'Tool output exceeded the size limit and was cut. Request a narrower slice if the tool supports it.',
                content: text.slice(0, config.maxResultChars),
            })
        }

        if (usedChars + text.length > config.turnBudgetChars) {
            const error = 'Tool output budget for this turn is exhausted. Do not call more tools; answer using the information already retrieved, or ask the user to narrow the request.'
            return {text: JSON.stringify({ok: false, error}), images: [], failed: true, error}
        }

        usedChars += text.length
        usedImages += images.length
        seen.set(stableKey(toolCall), toolCall.callId)
        return {text, images, failed: false, error: ''}
    }

    // Builds the user message that carries images for a set of tool calls.
    // Must be appended after all tool-result messages of the round.
    const makeImageMessage = (entries, {responsesApi = false} = {}) => {
        const parts = []
        entries.forEach(({toolCall, images}) => {
            if (images.length === 0) return
            const label = `Image(s) returned by tool call ${toolCall.name} (${toolCall.callId}).`
            parts.push(responsesApi ? {type: 'input_text', text: label} : {type: 'text', text: label})
            images.forEach((url) => {
                parts.push(responsesApi
                    ? {type: 'input_image', image_url: url}
                    : {type: 'image_url', image_url: {url}})
            })
        })
        if (parts.length === 0) return null
        const message = {role: 'user', content: parts}
        imageMessages.add(message)
        return message
    }

    const compactToolHistory = (messages) => {
        const roundStarts = []
        messages.forEach((message, index) => {
            if (message?.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                roundStarts.push(index)
            }
        })
        if (roundStarts.length <= config.keepRecentRounds) return messages
        const cutoff = roundStarts[roundStarts.length - config.keepRecentRounds]
        return messages.map((message, index) => {
            if (index >= cutoff) return message
            if (imageMessages.has(message)) {
                return {role: 'user', content: `${COMPACTED_PREFIX}: image(s)]`}
            }
            if (message?.role === 'tool' && typeof message.content === 'string'
                && !message.content.startsWith(COMPACTED_PREFIX)
                && message.content.length > MIN_COMPACT_CHARS) {
                compacted.add(message.tool_call_id)
                return {
                    ...message,
                    content: `${COMPACTED_PREFIX}, was ${message.content.length} chars. Call the tool again if you still need it.]`,
                }
            }
            return message
        })
    }

    return {check, shape, makeImageMessage, compactToolHistory}
}
