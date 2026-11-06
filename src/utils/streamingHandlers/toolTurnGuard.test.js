import {describe, expect, it} from 'vitest'
import {createToolTurnGuard} from './toolTurnGuard'
import {paginateAttachmentResult} from '../attachmentPaging'

const call = (callId, args = {attachmentId: 'a'}) => ({name: 'fetchAttachmentById', callId, arguments: JSON.stringify(args)})

describe('toolTurnGuard', () => {
    it('moves chart images out of the text result', () => {
        const guard = createToolTurnGuard()
        const shaped = guard.shape(call('1'), {ok: true, attachment: {type: 'chart', data: 'data:image/png;base64,' + 'A'.repeat(100000)}})
        expect(shaped.text.length).toBeLessThan(500)
        expect(shaped.images).toHaveLength(1)
    })

    it('caps oversized text and enforces the turn budget', () => {
        const guard = createToolTurnGuard({turnBudgetChars: 20000})
        const big = {ok: true, attachment: {type: 'code', data: 'x'.repeat(50000)}}
        const first = guard.shape(call('1'), big)
        expect(first.text.length).toBeLessThan(17000)
        expect(JSON.parse(first.text).truncated).toBe(true)
        expect(guard.shape(call('2', {attachmentId: 'b'}), big).failed).toBe(true)
    })

    it('blocks duplicate calls until the earlier output is compacted', () => {
        const guard = createToolTurnGuard({keepRecentRounds: 1})
        guard.shape(call('1'), {ok: true, attachment: {type: 'code', data: 'y'.repeat(1000)}})
        expect(guard.check(call('2'))?.ok).toBe(false)
        const messages = [
            {role: 'assistant', tool_calls: [{id: '1'}]},
            {role: 'tool', tool_call_id: '1', content: 'y'.repeat(1000)},
            {role: 'assistant', tool_calls: [{id: '2'}]},
            {role: 'tool', tool_call_id: '2', content: 'z'.repeat(1000)},
        ]
        const out = guard.compactToolHistory(messages)
        expect(out[1].content).toMatch(/omitted/)
        expect(out[3].content).toBe(messages[3].content)
        expect(guard.check(call('3'))).toBeNull()
    })

    it('limits calls per turn', () => {
        const guard = createToolTurnGuard({maxCallsPerTurn: 1})
        expect(guard.check(call('1'))).toBeNull()
        expect(guard.check(call('2', {attachmentId: 'z'}))?.ok).toBe(false)
    })
})

describe('paginateAttachmentResult', () => {
    it('pages text and leaves charts alone', () => {
        const result = {ok: true, attachment: {type: 'code', data: 'a'.repeat(30000)}}
        const page = paginateAttachmentResult(result, {})
        expect(page.attachment.data).toHaveLength(12000)
        expect(page.nextOffset).toBe(12000)
        const last = paginateAttachmentResult(result, {offset: 24000})
        expect(last.hasMore).toBe(false)
        const chart = {ok: true, attachment: {type: 'chart', data: 'data:image/png;base64,AAAA'}}
        expect(paginateAttachmentResult(chart, {})).toBe(chart)
    })
})
