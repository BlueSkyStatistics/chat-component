// @vitest-environment jsdom
import React from 'react'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import Settings from './Settings'

afterEach(cleanup)

describe('Settings', () => {
    it('validates credentials and creates a manual credential', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined)
        render(
            <Settings
                models={[]}
                credentials={[]}
                onSave={onSave}
                onClose={() => {}}
                addModelFormVisible
            />
        )

        fireEvent.click(screen.getByRole('button', {name: 'Credentials'}))
        fireEvent.click(screen.getByRole('button', {name: 'Add Credentials'}))
        expect(screen.getByText('OpenAI credentials require an API key.')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', {name: 'Manual'}))
        fireEvent.change(screen.getByLabelText('Chat completion endpoint URL'), {
            target: {value: 'https://example.test/chat/completions'},
        })
        fireEvent.click(screen.getByRole('button', {name: 'Add Credentials'}))

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
        expect(onSave.mock.calls[0][1][0]).toMatchObject({
            provider: 'manual',
            endpoint: 'https://example.test/chat/completions',
        })
    })

    it('groups models under credentials and cascades deletion', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined)
        const credentials = [{id: 'credential-1', provider: 'manual', label: 'Local gateway'}]
        const models = [{id: 'model-1', name: 'chat-model', credentialId: 'credential-1'}]
        render(
            <Settings
                models={models}
                credentials={credentials}
                onSave={onSave}
                onClose={() => {}}
                addModelFormVisible
            />
        )

        expect(screen.getByText('Local gateway')).toBeTruthy()
        expect(screen.queryByText('chat-model')).toBeNull()
        fireEvent.click(screen.getByRole('button', {name: /Local gateway.*1 model/}))
        expect(screen.getByText('chat-model')).toBeTruthy()
        const deleteButtons = screen.getAllByRole('button')
            .filter((button) => button.querySelector('.fa-trash-alt'))
        fireEvent.click(deleteButtons[0])

        await waitFor(() => expect(onSave).toHaveBeenCalledWith([], []))
    })

    it('shows only a restricted credential label and no mutation controls', () => {
        render(
            <Settings
                models={[{id: 'model-1', name: 'company-model', credentialId: 'credential-1'}]}
                credentials={[{
                    id: 'credential-1',
                    provider: 'manual',
                    label: 'Company AI',
                    endpoint: 'https://private.example.test/chat',
                    restricted: true,
                }]}
                onSave={() => {}}
                onClose={() => {}}
                addModelFormVisible
            />
        )

        expect(screen.getByText('Company AI')).toBeTruthy()
        expect(screen.queryByText('manual')).toBeNull()
        expect(screen.getByTitle('Restricted credentials')).toBeTruthy()
        expect(screen.queryAllByRole('button')
            .some((button) => button.querySelector('.fa-edit, .fa-trash-alt'))).toBe(false)
    })
})
