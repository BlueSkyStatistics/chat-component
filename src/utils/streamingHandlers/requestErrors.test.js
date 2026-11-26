import {afterEach, describe, expect, it, vi} from 'vitest'
import {
    EmptyResponseError,
    HttpError,
    RequestTimeoutError,
    createIdleTimeout,
    describeRequestError,
    httpErrorFromResponse,
    streamEventErrorMessage,
} from './requestErrors'

describe('createIdleTimeout', () => {
    afterEach(() => vi.useRealTimers())

    it('aborts with a RequestTimeoutError after the idle period', () => {
        vi.useFakeTimers()
        const idle = createIdleTimeout(undefined, 1000)
        idle.touch()
        vi.advanceTimersByTime(999)
        expect(idle.signal.aborted).toBe(false)
        vi.advanceTimersByTime(1)
        expect(idle.signal.aborted).toBe(true)
        expect(idle.timedOut()).toBe(true)
        expect(idle.signal.reason).toBeInstanceOf(RequestTimeoutError)
    })

    it('restarts on touch and does not count paused time', () => {
        vi.useFakeTimers()
        const idle = createIdleTimeout(undefined, 1000)
        idle.touch()
        vi.advanceTimersByTime(800)
        idle.touch()
        vi.advanceTimersByTime(800)
        expect(idle.signal.aborted).toBe(false)
        idle.pause()
        vi.advanceTimersByTime(10000)
        expect(idle.signal.aborted).toBe(false)
        idle.touch()
        vi.advanceTimersByTime(1000)
        expect(idle.timedOut()).toBe(true)
    })

    it('follows the parent signal without reporting a timeout', () => {
        vi.useFakeTimers()
        const parent = new AbortController()
        const idle = createIdleTimeout(parent.signal, 1000)
        idle.touch()
        parent.abort()
        expect(idle.signal.aborted).toBe(true)
        vi.advanceTimersByTime(5000)
        expect(idle.timedOut()).toBe(false)
    })

    it('is disabled when the timeout is 0', () => {
        vi.useFakeTimers()
        const idle = createIdleTimeout(undefined, 0)
        idle.touch()
        vi.advanceTimersByTime(1e9)
        expect(idle.signal.aborted).toBe(false)
    })
})

describe('request error messages', () => {
    it('reads the provider message out of an HTTP error body', async () => {
        const response = new Response(JSON.stringify({error: {message: 'Invalid API key'}}), {status: 401})
        const error = await httpErrorFromResponse(response)
        expect(error).toBeInstanceOf(HttpError)
        expect(error.status).toBe(401)
        expect(describeRequestError(error)).toContain('Authentication failed')
        expect(describeRequestError(error)).toContain('Invalid API key')
    })

    it('keeps a non-JSON body as the detail', async () => {
        const error = await httpErrorFromResponse(new Response('Bad Gateway', {status: 502}))
        expect(error.detail).toBe('Bad Gateway')
    })

    it('describes timeouts, network errors, empty replies and unknown errors', () => {
        expect(describeRequestError(new RequestTimeoutError(30000))).toContain('timed out')
        expect(describeRequestError(new RequestTimeoutError(30000))).toContain('30 seconds')
        expect(describeRequestError(new TypeError('Failed to fetch'))).toContain('Network error')
        expect(describeRequestError(new EmptyResponseError())).toContain('empty response')
        expect(describeRequestError(new Error('boom'))).toContain('boom')
        expect(describeRequestError('plain string')).toContain('plain string')
        expect(describeRequestError(undefined)).toContain('Something went wrong')
    })

    it('finds error payloads in stream events', () => {
        expect(streamEventErrorMessage({error: {message: 'overloaded'}})).toBe('overloaded')
        expect(streamEventErrorMessage({error: 'nope'})).toBe('nope')
        expect(streamEventErrorMessage({choices: []})).toBe('')
    })
})
