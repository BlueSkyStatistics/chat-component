import {getAzureAccessToken} from '../providers/azureAuth'
import {apiCallStreaming} from './fetchApiRequest'

const streamAzureResponse = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal) => {
    const accessToken = await getAzureAccessToken(
        selectedModel.credential,
        selectedModel.credential.chatScopes,
        ['https://cognitiveservices.azure.com/.default']
    )

    return apiCallStreaming(messages, onUpdateStreamingMessage, selectedModel, abortSignal, {
        Authorization: `Bearer ${accessToken}`,
    })
}

const providerStreaming = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal) => {
    if (selectedModel?.credential?.provider === 'azure') {
        return streamAzureResponse(messages, onUpdateStreamingMessage, selectedModel, abortSignal)
    }
    return apiCallStreaming(messages, onUpdateStreamingMessage, selectedModel, abortSignal)
}

export {providerStreaming}
