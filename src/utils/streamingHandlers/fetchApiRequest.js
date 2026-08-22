const apiCallStreaming = async (messages, onUpdateStreamingMessage, selectedModel, abortSignal, additionalHeaders = {}) => {
    const response = await fetch(selectedModel.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(selectedModel.apiKey && {'Authorization': `Bearer ${selectedModel.apiKey}`}),
            ...additionalHeaders
        },
        body: JSON.stringify({
            messages: messages,
            stream: true,
            model: selectedModel.name
        }),
        signal: abortSignal
    })

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json()
            errorData = errorData.error
        } catch (e) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        throw new Error(`HTTP error! type: ${errorData.type}\nmessage: ${errorData.message}`)

    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulatedResponse = ''

    while (true) {
        const {done, value} = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6))
                    if (data.choices[0]?.delta?.content) {
                        accumulatedResponse += data.choices[0].delta.content
                        onUpdateStreamingMessage(accumulatedResponse)

                    }
                } catch (e) {
                    console.error('Error parsing streaming response:', e)
                }
            }
        }
    }
}

export {apiCallStreaming}