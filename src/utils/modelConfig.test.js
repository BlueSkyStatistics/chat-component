import {describe, expect, it} from 'vitest'
import {
    getRuntimeModel,
    getSelectedModelId,
    migrateModelConfiguration,
    parseModelNames,
} from './modelConfig'

describe('model configuration', () => {
    it('migrates legacy models into linked manual credentials', () => {
        const result = migrateModelConfiguration([
            {name: 'gpt-4o', endpoint: 'https://example.test/chat', apiKey: 'secret'},
        ], [])

        expect(result.changed).toBe(true)
        expect(result.credentials).toHaveLength(1)
        expect(result.credentials[0]).toMatchObject({
            provider: 'manual',
            endpoint: 'https://example.test/chat',
            apiKey: 'secret',
        })
        expect(result.models[0]).toMatchObject({
            name: 'gpt-4o',
            credentialId: result.credentials[0].id,
        })
    })

    it('parses unique comma-separated model names and preserves stable selection', () => {
        expect(parseModelNames(' gpt-4o, gpt-4o-mini, gpt-4o ')).toEqual([
            'gpt-4o',
            'gpt-4o-mini',
        ])
        const models = [{id: 'model-1', name: 'gpt-4o'}, {id: 'model-2', name: 'gpt-4o-mini'}]
        expect(getSelectedModelId(models, 'model-2')).toBe('model-2')
        expect(getSelectedModelId(models, 'missing')).toBe('model-1')
    })

    it('resolves OpenAI and Azure runtime endpoints from credentials', () => {
        expect(getRuntimeModel(
            {id: 'model-1', name: 'gpt-4o'},
            {provider: 'openai', apiKey: 'key'}
        )).toMatchObject({
            endpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'key',
        })
        expect(getRuntimeModel(
            {id: 'model-2', name: 'deployment-a'},
            {provider: 'azure', resourceName: 'example-resource', apiVersion: '2025-04-01-preview'}
        ).endpoint).toBe(
            'https://example-resource.openai.azure.com/openai/deployments/deployment-a/chat/completions?api-version=2025-04-01-preview'
        )
    })
})
