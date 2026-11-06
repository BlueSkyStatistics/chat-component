import {describe, expect, it} from 'vitest'
import {buildConversationsHtml, buildExportPayload} from './conversationIO'

const trace = (id, name, status = 'succeeded') => ({
    id,
    role: 'assistant',
    content: '',
    attachments: [],
    isToolCallTrace: true,
    toolCall: {callId: `call-${id}`, name, arguments: '{"x":1}', result: {ok: true}, error: '', status},
})

const conversation = {
    id: 'conv-1',
    title: 'Tools',
    createdAt: 1,
    updatedAt: 2,
    messages: [
        {id: 1, role: 'user', content: 'run it'},
        {id: 2, role: 'assistant', content: ''},
        trace(3, 'getData'),
        trace(4, 'fetchAttachment', 'failed'),
        {id: 5, role: 'assistant', content: 'done'},
    ],
}

describe('buildExportPayload', () => {
    it('leaves tool calls and empty placeholders out by default', () => {
        const payload = buildExportPayload(conversation)
        expect(payload.includesToolCalls).toBe(false)
        expect(payload.conversations[0].messages.map((m) => m.id)).toEqual([1, 5])
    })

    it('keeps tool calls when includeToolCalls is set', () => {
        const payload = buildExportPayload(conversation, {includeToolCalls: true})
        expect(payload.includesToolCalls).toBe(true)
        expect(payload.conversations[0].messages.map((m) => m.id)).toEqual([1, 3, 4, 5])
    })

    it('does not modify the stored conversation', () => {
        buildExportPayload(conversation)
        expect(conversation.messages).toHaveLength(5)
    })
})

describe('buildConversationsHtml', () => {
    it('does not embed tool calls by default', () => {
        const html = buildConversationsHtml([conversation])
        expect(html).not.toContain('fetchAttachment')
    })

    it('embeds tool calls and the group renderer when included', () => {
        const html = buildConversationsHtml([conversation], {includeToolCalls: true})
        expect(html).toContain('fetchAttachment')
        expect(html).toContain('renderToolGroup')
    })
})
