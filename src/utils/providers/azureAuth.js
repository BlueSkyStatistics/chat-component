import {InteractionRequiredAuthError, PublicClientApplication} from '@azure/msal-browser'

const _clients = new Map()

const parseScopes = (value, fallback) => {
    const scopes = Array.isArray(value) ? value : String(value || '').split(',')
    return scopes.map((scope) => scope.trim()).filter(Boolean).length
        ? scopes.map((scope) => scope.trim()).filter(Boolean)
        : fallback
}


const getClient = (credential, clients) => {
    const key = `${credential.clientId}:${credential.tenantId}`
    if (!clients.has(key)) {
        const client = new PublicClientApplication({
            auth: {
                clientId: credential.clientId,
                authority: `https://login.microsoftonline.com/${credential.tenantId}`,
                redirectUri: credential.redirectUri || (import.meta.env.DEV ? window.location.origin : 'http://localhost')
            },
            cache: {cacheLocation: import.meta.env.DEV ? 'localStorage' : 'memoryStorage'},
        })
        clients.set(key, client)
    }
    return clients.get(key)
}

const getAzureTokenBrowser = async (credential, scopes, clients) => {
    const client = getClient(credential, clients)
    await client.initialize()
    const account = client.getAllAccounts()[0]
    if (account) {
        try {
            const result = await client.acquireTokenSilent({account, scopes})
            return result.accessToken
        } catch (error) {
            if (!(error instanceof InteractionRequiredAuthError)) {
                throw error
            }
        }
    }

    const result = await client.loginPopup({account, scopes})
    return result.accessToken
}

const getTokenFn = () => window.electronApi?.getAzureToken || getAzureTokenBrowser

export const getAzureAccessToken = async (credential, scopeValue, fallbackScopes) => {
    if (!credential?.clientId || !credential?.tenantId) {
        throw new Error('Azure credentials require a client ID and tenant ID.')
    }

    const scopes = parseScopes(scopeValue, fallbackScopes)
    if (!scopes.length) {
        throw new Error('Azure credentials require at least one scope.')
    }

    const tokenFn = getTokenFn()
    return tokenFn(credential, scopes, _clients)
}
