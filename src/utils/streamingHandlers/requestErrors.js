// Shared error types and helpers for chat model requests.
//
// Chat.jsx turns any error a streaming handler throws into a visible error
// message in place of the pending assistant reply, using describeRequestError
// for the text. The idle timeout below is what stops a request that has gone
// quiet, since fetch itself never times out.

export const DEFAULT_REQUEST_TIMEOUT_MS = 120000

export class RequestTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`No response from the model for ${Math.round(timeoutMs / 1000)} seconds.`)
        this.name = 'RequestTimeoutError'
        this.timeoutMs = timeoutMs
    }
}

export class HttpError extends Error {
    constructor(status, detail) {
        super(detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`)
        this.name = 'HttpError'
        this.status = status
        this.detail = detail || ''
    }
}

export class EmptyResponseError extends Error {
    constructor() {
        super('The model returned an empty response.')
        this.name = 'EmptyResponseError'
    }
}

// Builds an HttpError from a failed fetch Response, pulling the provider's
// error message out of a JSON body ({error: {message}} or {message}) when
// there is one, else the raw text.
export const httpErrorFromResponse = async (response) => {
    let detail = ''
    try {
        const text = await response.text()
        try {
            const data = JSON.parse(text)
            const err = data?.error
            detail = (typeof err === 'string' ? err : err?.message)
                || data?.message
                || text
        } catch (_) {
            detail = text
        }
    } catch (_) {
        // body unreadable; status alone it is
    }
    detail = String(detail || '').trim()
    if (detail.length > 1000) detail = `${detail.slice(0, 1000)}...`
    return new HttpError(response.status, detail || response.statusText || '')
}

// Extracts an error message from a streamed event payload, or '' if the
// event is not an error. Covers OpenAI-style {error: {...}} chunks.
export const streamEventErrorMessage = (data) => {
    const err = data?.error
    if (!err) return ''
    if (typeof err === 'string') return err
    return err.message || err.type || JSON.stringify(err)
}

const HTTP_HINTS = {
    400: 'The request was rejected.',
    401: 'Authentication failed. Check the API key or credentials in Settings.',
    403: 'Access denied. Check that the credentials can use this model.',
    404: 'Model or endpoint not found. Check the model name and endpoint in Settings.',
    408: 'The server timed out waiting for the request.',
    413: 'The request is too large. Try removing some attachments.',
    429: 'Rate limit or quota reached. Wait a moment and try again.',
    500: 'The model provider had an internal error. Try again.',
    502: 'The model provider is unavailable (bad gateway). Try again.',
    503: 'The model provider is unavailable. Try again shortly.',
    504: 'The model provider timed out. Try again.',
}

const isNetworkError = (error) =>
    error?.name === 'TypeError'
    && /fetch|network|load failed|connection/i.test(error?.message || '')

// Turns any thrown value into the text shown to the user.
export const describeRequestError = (error) => {
    if (error instanceof RequestTimeoutError || error?.name === 'RequestTimeoutError') {
        return `**Request timed out.** ${error.message} The request was stopped. Check your connection and try again.`
    }
    if (error instanceof HttpError || error?.name === 'HttpError') {
        const hint = HTTP_HINTS[error.status] || 'The request failed.'
        return `**Error ${error.status}.** ${hint}${error.detail ? `\n\n${error.detail}` : ''}`
    }
    if (error instanceof EmptyResponseError || error?.name === 'EmptyResponseError') {
        return `**No response.** ${error.message} Try again or rephrase the question.`
    }
    if (isNetworkError(error)) {
        return `**Network error.** Could not reach the model provider. Check your internet connection and the endpoint in Settings.\n\n${error.message}`
    }
    const message = error instanceof Error
        ? error.message
        : (typeof error === 'string' ? error : '')
    return `**Error.** ${message || 'Something went wrong while getting a response.'}`
}

// An AbortSignal that aborts after `timeoutMs` of inactivity, or when the
// parent signal (the user's Stop button) aborts. Call touch() whenever data
// arrives to restart the countdown, pause() while waiting on something that
// is not the model (e.g. a running tool), and dispose() when done.
// timeoutMs <= 0 or non-finite disables the timer.
export const createIdleTimeout = (parentSignal, timeoutMs) => {
    const controller = new AbortController()
    const enabled = Number.isFinite(timeoutMs) && timeoutMs > 0
    let timer = null
    let timedOut = false
    let disposed = false

    const clear = () => {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }
    const onParentAbort = () => {
        clear()
        controller.abort(parentSignal.reason)
    }
    if (parentSignal) {
        if (parentSignal.aborted) onParentAbort()
        else parentSignal.addEventListener('abort', onParentAbort, {once: true})
    }

    const touch = () => {
        if (!enabled || disposed || controller.signal.aborted) return
        clear()
        timer = setTimeout(() => {
            timer = null
            timedOut = true
            controller.abort(new RequestTimeoutError(timeoutMs))
        }, timeoutMs)
    }

    return {
        signal: controller.signal,
        touch,
        pause: clear,
        timedOut: () => timedOut,
        error: () => new RequestTimeoutError(timeoutMs),
        dispose: () => {
            disposed = true
            clear()
            parentSignal?.removeEventListener?.('abort', onParentAbort)
        },
    }
}
