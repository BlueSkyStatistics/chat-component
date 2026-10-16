export const ATTACHMENT_PAGE_CHARS = 12000

const toInt = (value, fallback) => {
    const number = Number.parseInt(value, 10)
    return Number.isFinite(number) && number >= 0 ? number : fallback
}

// Slices large text/code/table attachment data into pages so a single tool
// result cannot flood the context. Image (chart) data is left untouched: it
// cannot be truncated and is delivered to the model as an image by the
// tool-turn guard instead of as text.
export const paginateAttachmentResult = (result, {offset, limit} = {}) => {
    if (!result?.ok || !result.attachment) return result
    const {attachment} = result
    if (attachment.type === 'chart' || (typeof attachment.data === 'string' && /^data:image\//i.test(attachment.data))) {
        return result
    }
    const full = typeof attachment.data === 'string' ? attachment.data : JSON.stringify(attachment.data ?? '')
    const totalChars = full.length
    const start = Math.min(toInt(offset, 0), totalChars)
    const pageSize = Math.max(1, Math.min(toInt(limit, ATTACHMENT_PAGE_CHARS) || ATTACHMENT_PAGE_CHARS, ATTACHMENT_PAGE_CHARS))
    const end = Math.min(start + pageSize, totalChars)
    if (start === 0 && end === totalChars && typeof attachment.data === 'string') return result
    const {output, initialMessage, ...rest} = attachment
    return {
        ...result,
        attachment: {...rest, data: full.slice(start, end)},
        totalChars,
        offset: start,
        returnedChars: end - start,
        hasMore: end < totalChars,
        ...(end < totalChars ? {nextOffset: end} : {}),
    }
}
