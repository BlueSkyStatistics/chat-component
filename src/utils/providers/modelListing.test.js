import {afterEach, describe, expect, it, vi} from 'vitest'
vi.mock('./azureAuth', () => ({
    getAzureAccessToken: vi.fn().mockResolvedValue('azure-token'),
}))
import {listCredentialModels} from './modelListing'

describe('model listing', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('uses the OpenAI default URL and normalizes model IDs', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({data: [{id: 'gpt-4o-mini'}, {id: 'gpt-4o'}]}),
        })
        vi.stubGlobal('fetch', fetch)

        await expect(listCredentialModels({
            provider: 'openai',
            apiKey: 'test-key',
            modelListEnabled: true,
        })).resolves.toEqual(['gpt-4o', 'gpt-4o-mini'])
        expect(fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/models',
            {headers: {Authorization: 'Bearer test-key'}}
        )
    })

    it('normalizes Azure Resource Manager deployment names', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({value: [{name: 'production'}, {name: 'staging'}]}),
        })
        vi.stubGlobal('fetch', fetch)

        await expect(listCredentialModels({
            provider: 'azure',
            clientId: 'client',
            tenantId: 'tenant',
            modelListEnabled: true,
            modelListUrl: 'https://management.azure.com/deployments',
            modelListScopes: 'https://management.azure.com/.default',
        })).resolves.toEqual(['production', 'staging'])
        expect(fetch).toHaveBeenCalledWith(
            'https://management.azure.com/deployments',
            {headers: {Authorization: 'Bearer azure-token'}}
        )
    })
})
