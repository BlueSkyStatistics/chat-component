export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
export const OPENAI_MODEL_LIST_URL = 'https://api.openai.com/v1/models'

const makeId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const asArray = (value) => Array.isArray(value) ? value : []

export const parseModelNames = (value) => [...new Set(
    String(value || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
)]

export const createCredentialId = () => makeId('credential')
export const createModelId = () => makeId('model')

export const getCredentialLabel = (credential) => {
    if (!credential) return 'Unassigned / external'
    if (credential.label?.trim()) return credential.label.trim()
    if (credential.provider === 'openai') return 'OpenAI'
    if (credential.provider === 'azure') return credential.resourceName || 'Azure OpenAI'
    return credential.endpoint || 'Manual credentials'
}

export const makeLegacyModelId = (model) => `${model.name}-${model.endpoint}`

export const migrateModelConfiguration = (storedModels, storedCredentials) => {
    const credentials = asArray(storedCredentials).map((credential) => ({
        ...credential,
        id: credential.id || createCredentialId(),
    }))
    let changed = credentials.length !== asArray(storedCredentials).length

    const models = asArray(storedModels).map((model, index) => {
        if (model.credentialId || model.external) {
            if (!model.id) changed = true
            return {...model, id: model.id || createModelId()}
        }

        const credentialId = createCredentialId()
        credentials.push({
            id: credentialId,
            provider: 'manual',
            label: model.name ? `${model.name} credentials` : `Manual credentials ${index + 1}`,
            endpoint: model.endpoint || '',
            apiKey: model.apiKey || '',
            modelListUrl: '',
            modelListEnabled: false,
        })
        changed = true
        return {
            id: createModelId(),
            name: model.name || '',
            credentialId,
            external: false,
        }
    })

    return {models, credentials, changed}
}

export const getRuntimeModel = (model, credential) => {
    if (!model) return null
    if (!credential) return {...model}

    if (credential.provider === 'openai') {
        return {
            ...model,
            endpoint: OPENAI_CHAT_ENDPOINT,
            apiKey: credential.apiKey || '',
            credential,
        }
    }

    if (credential.provider === 'azure') {
        const base = `https://${credential.resourceName}.openai.azure.com`
        const version = encodeURIComponent(credential.apiVersion || '2025-04-01-preview')
        return {
            ...model,
            endpoint: `${base}/openai/deployments/${encodeURIComponent(model.name)}/chat/completions?api-version=${version}`,
            credential,
        }
    }

    return {
        ...model,
        endpoint: credential.endpoint || model.endpoint,
        apiKey: credential.apiKey || '',
        credential,
    }
}

export const getSelectedModelId = (models, storedId) => {
    const availableModels = asArray(models)
    if (!storedId) return availableModels[0]?.id || null
    const selected = availableModels.find((model) =>
        model.id === storedId || makeLegacyModelId(model) === storedId
    )
    return selected?.id || availableModels[0]?.id || null
}
