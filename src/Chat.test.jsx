// @vitest-environment jsdom
import React from 'react'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import Chat from './Chat'

vi.mock('./Settings', () => ({default: () => null}))
vi.mock('./Conversations', () => ({default: () => null}))
vi.mock('./components/Message', () => ({
    default: ({message}) => <div data-testid={`message-${message.id}`}>{message.content || message.role}</div>
}))
vi.mock('./components/PendingAttachments', () => ({default: () => null}))
vi.mock('./attachmentFormatters', () => ({
    formatMessage: (message) => message,
    getSystemMessage: () => '',
}))
vi.mock('./utils/modelConfig', () => ({
    getRuntimeModel: (model) => model,
    getSelectedModelId: (models, savedId) => savedId || models[0]?.id || null,
    makeLegacyModelId: (model) => model?.name || 'legacy-model',
    migrateModelConfiguration: (models, credentials) => ({changed: false, models, credentials}),
}))
vi.mock('./utils/streamingHandlers/tooling', () => ({
    executeRegisteredToolCall: vi.fn(),
    getRegisteredModelTools: vi.fn(() => []),
    registerModelTool: vi.fn(() => () => {}),
}))

const makeModelStorage = () => ({
    getModels: vi.fn().mockResolvedValue([{id: 'model-1', name: 'Test model', credentialId: 'cred-1'}]),
    getSelectedModel: vi.fn().mockResolvedValue('model-1'),
    getCredentials: vi.fn().mockResolvedValue([{id: 'cred-1', label: 'Test credentials'}]),
    saveSelectedModel: vi.fn().mockResolvedValue(undefined),
    saveModels: vi.fn().mockResolvedValue(undefined),
    saveCredentials: vi.fn().mockResolvedValue(undefined),
})

const flushPromises = async () => {
    await Promise.resolve()
    await Promise.resolve()
}

describe('Chat auto-scroll', () => {
    let resizeObserverCallback = null

    beforeEach(() => {
        vi.restoreAllMocks()
        global.ResizeObserver = class {
            constructor(callback) {
                resizeObserverCallback = callback
            }
            observe() {}
            disconnect() {}
        }
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb()
            return 1
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
        resizeObserverCallback = null
    })

    const setup = async (messageStreamingHandler = vi.fn().mockResolvedValue(undefined)) => {
        const modelStorage = makeModelStorage()
        const view = render(
            <Chat
                modelStorage={modelStorage}
                conversationStorage={null}
                onConversationError={() => {}}
                options={{addModelsAllowed: true}}
                messageStreamingHandler={messageStreamingHandler}
            />
        )
        await waitFor(() => expect(modelStorage.getModels).toHaveBeenCalled())
        await flushPromises()
        const scrollContainer = view.container.querySelector('.chat-messages')
        let scrollTopValue = 0
        let scrollHeightValue = 600
        let clientHeightValue = 300

        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            get: () => scrollTopValue,
            set: (value) => {
                scrollTopValue = value
            },
        })
        Object.defineProperty(scrollContainer, 'scrollHeight', {
            configurable: true,
            get: () => scrollHeightValue,
            set: (value) => {
                scrollHeightValue = value
            },
        })
        Object.defineProperty(scrollContainer, 'clientHeight', {
            configurable: true,
            get: () => clientHeightValue,
            set: (value) => {
                clientHeightValue = value
            },
        })
        scrollContainer.scrollTo = vi.fn(({top}) => {
            scrollTopValue = top
        })

        return {
            ...view,
            modelStorage,
            messageStreamingHandler,
            scrollContainer,
            setScrollMetrics: ({scrollTop, scrollHeight, clientHeight}) => {
                if (scrollTop !== undefined) scrollTopValue = scrollTop
                if (scrollHeight !== undefined) scrollHeightValue = scrollHeight
                if (clientHeight !== undefined) clientHeightValue = clientHeight
            },
            getScrollTop: () => scrollTopValue,
            triggerResize: () => resizeObserverCallback?.(),
        }
    }

    it('keeps the view pinned while streaming when user is at the bottom', async () => {
        const streamingHandler = vi.fn(async (_messages, onUpdate) => {
            onUpdate('chunk 1')
            onUpdate('chunk 2')
        })
        const {scrollContainer, getScrollTop} = await setup(streamingHandler)

        fireEvent.change(screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)'), {
            target: {value: 'hello'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Send'}))

        await waitFor(() => expect(streamingHandler).toHaveBeenCalled())
        expect(getScrollTop()).toBe(scrollContainer.scrollHeight)
        expect(screen.queryByRole('button', {name: 'Scroll to latest'})).toBeNull()
    })

    it('stops auto-following when user scrolls away from the bottom and shows jump button', async () => {
        let onUpdateStreamingMessage
        const streamingHandler = vi.fn(async (_messages, onUpdate) => {
            onUpdateStreamingMessage = onUpdate
        })
        const {scrollContainer, setScrollMetrics, getScrollTop} = await setup(streamingHandler)

        fireEvent.change(screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)'), {
            target: {value: 'hello'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Send'}))
        await waitFor(() => expect(streamingHandler).toHaveBeenCalled())

        setScrollMetrics({scrollTop: 100, scrollHeight: 600, clientHeight: 300})
        fireEvent.scroll(scrollContainer)
        const before = getScrollTop()

        onUpdateStreamingMessage('new chunk')
        await flushPromises()

        expect(getScrollTop()).toBe(before)
        expect(screen.getByRole('button', {name: 'Scroll to latest'})).toBeTruthy()
    })

    it('re-pins and smooth-scrolls when jump button is clicked', async () => {
        let onUpdateStreamingMessage
        const streamingHandler = vi.fn(async (_messages, onUpdate) => {
            onUpdateStreamingMessage = onUpdate
        })
        const {scrollContainer, setScrollMetrics} = await setup(streamingHandler)

        fireEvent.change(screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)'), {
            target: {value: 'hello'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Send'}))
        await waitFor(() => expect(streamingHandler).toHaveBeenCalled())

        setScrollMetrics({scrollTop: 100, scrollHeight: 600, clientHeight: 300})
        fireEvent.scroll(scrollContainer)
        onUpdateStreamingMessage('new chunk')
        await flushPromises()

        fireEvent.click(screen.getByRole('button', {name: 'Scroll to latest'}))
        expect(scrollContainer.scrollTo).toHaveBeenCalledWith({top: scrollContainer.scrollHeight, behavior: 'smooth'})
    })
})
describe('Chat tool call visibility', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        }
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb()
            return 1
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
    })

    const renderChat = (options) => (
        <Chat
            modelStorage={makeModelStorage()}
            conversationStorage={null}
            onConversationError={() => {}}
            options={{addModelsAllowed: true, ...options}}
            messageStreamingHandler={async (_messages, onUpdate, _model, _signal, {onToolCallEvent}) => {
                onToolCallEvent({callId: 'call-1', name: 'list_dataset_variables', status: 'completed'})
                onUpdate('done')
            }}
        />
    )

    const sendMessage = async (container) => {
        await waitFor(() => expect(screen.getByRole('button', {name: 'Send'})).toBeTruthy())
        await flushPromises()
        fireEvent.change(screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)'), {
            target: {value: 'hello'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Send'}))
        await waitFor(() => expect(container.textContent).toContain('done'))
    }

    it('shows tool calls by default', async () => {
        const {container} = render(renderChat())
        await sendMessage(container)
        expect(container.querySelector('.tool-call-group')).not.toBeNull()
    })

    it('hides tool calls when showToolCalls is false and shows them again when re-enabled', async () => {
        const {container, rerender} = render(renderChat({showToolCalls: false}))
        await sendMessage(container)
        expect(container.querySelector('.tool-call-group')).toBeNull()

        rerender(renderChat({showToolCalls: true}))
        expect(container.querySelector('.tool-call-group')).not.toBeNull()
        expect(container.textContent).toContain('done')
    })
})

describe('Chat request errors', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        }
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb()
            return 1
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
    })

    const send = async (messageStreamingHandler, options = {}) => {
        const view = render(
            <Chat
                modelStorage={makeModelStorage()}
                conversationStorage={null}
                onConversationError={() => {}}
                options={{addModelsAllowed: true, ...options}}
                messageStreamingHandler={messageStreamingHandler}
            />
        )
        await waitFor(() => expect(screen.getByRole('button', {name: 'Send'})).toBeTruthy())
        await flushPromises()
        fireEvent.change(screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)'), {
            target: {value: 'hello'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Send'}))
        return view
    }

    const errorTexts = (container) => [...container.querySelectorAll('[data-testid^="message-"]')]
        .map((el) => el.textContent)
        .filter((text) => text.includes('**'))

    it('replaces the pending reply with a timeout error when the request goes quiet', async () => {
        // Never settles and ignores the abort signal, like a hung connection.
        const handler = vi.fn(() => new Promise(() => {}))
        const {container} = await send(handler, {requestTimeoutMs: 50})
        await waitFor(() => expect(container.textContent).toContain('Request timed out'))
        expect(container.querySelector('.chat-thinking')).toBeNull()
        expect(screen.getByRole('button', {name: 'Send'})).toBeTruthy()
        expect(errorTexts(container)).toHaveLength(1)
    })

    it('keeps waiting while data keeps arriving', async () => {
        const handler = vi.fn(async (_messages, onUpdate, _model, _signal, {onActivity}) => {
            for (let i = 0; i < 5; i += 1) {
                await new Promise((resolve) => setTimeout(resolve, 30))
                onActivity()
            }
            onUpdate('slow but fine')
        })
        const {container} = await send(handler, {requestTimeoutMs: 60})
        await waitFor(() => expect(container.textContent).toContain('slow but fine'))
        expect(container.textContent).not.toContain('timed out')
    })

    it('does not time out while a tool is running', async () => {
        const handler = vi.fn(async (_messages, onUpdate, _model, _signal, {onToolCallEvent}) => {
            onToolCallEvent({callId: 'c1', name: 'slow_tool', status: 'running'})
            await new Promise((resolve) => setTimeout(resolve, 150))
            onToolCallEvent({callId: 'c1', name: 'slow_tool', status: 'succeeded'})
            onUpdate('tool done')
        })
        const {container} = await send(handler, {requestTimeoutMs: 50})
        await waitFor(() => expect(container.textContent).toContain('tool done'))
        expect(container.textContent).not.toContain('timed out')
    })

    it('shows the error in place of the empty reply when the handler throws', async () => {
        const handler = vi.fn(async () => {
            throw new TypeError('Failed to fetch')
        })
        const {container} = await send(handler)
        await waitFor(() => expect(container.textContent).toContain('Network error'))
        expect(errorTexts(container)).toHaveLength(1)
    })

    it('keeps partial text and adds the error after it', async () => {
        const handler = vi.fn(async (_messages, onUpdate) => {
            onUpdate('partial answer')
            throw new Error('stream cut')
        })
        const {container} = await send(handler)
        await waitFor(() => expect(container.textContent).toContain('stream cut'))
        expect(container.textContent).toContain('partial answer')
    })

    it('reports an empty response', async () => {
        const {container} = await send(vi.fn(async () => {}))
        await waitFor(() => expect(container.textContent).toContain('empty response'))
    })

    it('shows nothing when the user presses Stop', async () => {
        const handler = vi.fn(() => new Promise(() => {}))
        const {container} = await send(handler, {requestTimeoutMs: 0})
        await waitFor(() => expect(screen.getByRole('button', {name: 'Stop'})).toBeTruthy())
        fireEvent.click(screen.getByRole('button', {name: 'Stop'}))
        await waitFor(() => expect(screen.getByRole('button', {name: 'Send'})).toBeTruthy())
        expect(errorTexts(container)).toHaveLength(0)
    })
})
