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