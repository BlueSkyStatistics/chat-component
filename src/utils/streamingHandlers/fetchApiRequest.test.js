import {afterEach, describe, expect, it, vi} from 'vitest'
import {apiCallStreaming} from './fetchApiRequest'
import {HttpError} from './requestErrors'

vi.mock('./tooling', () => ({
    executeRegisteredToolCall: vi.fn(),
    getRegisteredModelTools: vi.fn(() => []),
}))

const streamOf = (chunks) => new ReadableStream({
    start(controller) {
        const encoder = new TextEncoder()
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
    },
})

const model = {endpoint: 'https://example.test/v1/chat/completions', name: 'm'}

describe('apiCallStreaming', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('joins an event split across two chunks and reports activity', async () => {
        const event = 'data: ' + JSON.stringify({choices: [{delta: {content: 'hello'}}]}) + '\n'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(streamOf([event.slice(0, 20), event.slice(20), 'data: [DONE]\n']))))
        const onUpdate = vi.fn()
        const onActivity = vi.fn()
        await apiCallStreaming([], onUpdate, model, undefined, {}, {onActivity})
        expect(onUpdate).toHaveBeenLastCalledWith('hello')
        expect(onActivity).toHaveBeenCalled()
    })

    it('throws on an error event in the stream', async () => {
        const event = 'data: ' + JSON.stringify({error: {message: 'model overloaded'}}) + '\n'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(streamOf([event]))))
        await expect(apiCallStreaming([], vi.fn(), model)).rejects.toThrow('model overloaded')
    })

    it('throws an HttpError with the provider message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({error: {message: 'quota'}}), {status: 429})))
        const error = await apiCallStreaming([], vi.fn(), model).catch((e) => e)
        expect(error).toBeInstanceOf(HttpError)
        expect(error.status).toBe(429)
        expect(error.detail).toBe('quota')
    })
})
