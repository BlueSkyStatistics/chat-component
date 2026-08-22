import {OPENAI_MODEL_LIST_URL} from '../modelConfig'
import {getAzureAccessToken} from './azureAuth'

const toMessage = async (response) => {
    try {
        const body = await response.json()
        return body?.error?.message || body?.message || JSON.stringify(body)
    } catch (_) {
        return response.statusText || `HTTP ${response.status}`
    }
}

const modelNamesFromPayload = (payload) => {
    if (Array.isArray(payload?.data)) {
        return payload.data.map((model) => model?.id).filter(Boolean)
    }
    if (Array.isArray(payload?.value)) {
        return payload.value
            .map((deployment) => deployment?.name || deployment?.properties?.model?.name)
            .filter(Boolean)
    }
    throw new Error('The model list response must contain data[].id or value[].name.')
}

export const credentialHasModelList = (credential) => {
    if (!credential || credential.modelListEnabled === false) return false
    if (credential.provider === 'openai') return true
    return Boolean(credential.modelListUrl?.trim())
}

export const listCredentialModels = async (credential) => {
    if (!credentialHasModelList(credential)) {
        throw new Error('This credential has no enabled model list URL.')
    }

    let url
    let headers = {}
    if (credential.provider === 'openai') {
        url = credential.modelListUrl?.trim() || OPENAI_MODEL_LIST_URL
        headers = credential.apiKey ? {Authorization: `Bearer ${credential.apiKey}`} : {}
    } else if (credential.provider === 'azure') {
        url = credential.modelListUrl.trim()
        const accessToken = await getAzureAccessToken(
            credential,
            credential.modelListScopes,
            ['https://management.azure.com/.default']
        )
        headers = {Authorization: `Bearer ${accessToken}`}
    } else {
        url = credential.modelListUrl.trim()
        headers = credential.apiKey ? {Authorization: `Bearer ${credential.apiKey}`} : {}
    }

    const response = await fetch(url, {headers})
    if (!response.ok) {
        throw new Error(`Could not list models: ${await toMessage(response)}`)
    }
    const payload = await response.json()
    return [...new Set(modelNamesFromPayload(payload))].sort((a, b) => a.localeCompare(b))
}
