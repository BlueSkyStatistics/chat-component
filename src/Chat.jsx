import {useState, useEffect, useRef} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {formatMessage} from './attachmentFormatters'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism'
import './Chat.css'
import Settings from './Settings'

const makeModelId = (model) => `${model.name}-${model.endpoint}`;

function Chat({modelStorage}) {
    const [messages, setMessages] = useState([
        {
            content: 'Hi, how can I help you?',
            role: 'assistant',
            id: Date.now(),
            showRaw: false
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [models, setModels] = useState([])
    const [selectedModel, setSelectedModel] = useState(null)
    const [isStreaming, setIsStreaming] = useState(false)
    const [pendingAttachments, setPendingAttachments] = useState([])
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
    const abortControllerRef = useRef(null)
    const messagesEndRef = useRef(null)
    const chatMessagesRef = useRef(null)

    // Handle scroll events to determine if we should auto-scroll
    const handleScroll = () => {
        if (!chatMessagesRef.current || !isStreaming) return;

        const {scrollTop, scrollHeight, clientHeight} = chatMessagesRef.current;
        const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;

        if (shouldAutoScroll && !isAtBottom) {
            setShouldAutoScroll(false);
        }
    };

    const storageProviderRef = useRef(modelStorage);

    // Save selected model when it changes
    useEffect(() => {
        if (selectedModel) {
            const modelId = makeModelId(selectedModel);
            storageProviderRef.current.saveSelectedModel(modelId);
        }
    }, [selectedModel]);

    // Load saved models and restore selected model
    useEffect(() => {
        async function loadModels() {
            const savedModels = await storageProviderRef.current.getModels();
            const savedModelId = await storageProviderRef.current.getSelectedModel();

            if (savedModels && savedModels.length > 0) {
                setModels(savedModels);

                // Try to restore the previously selected model
                if (savedModelId) {
                    const savedModel = savedModels.find(m => `${m.name}-${m.endpoint}` === savedModelId);
                    if (savedModel) {
                        setSelectedModel(savedModel);
                    } else {
                        // If saved model not found, use the first available model
                        setSelectedModel(savedModels[0]);
                        await storageProviderRef.current.saveSelectedModel(makeModelId(savedModels[0]));
                    }
                } else {
                    // If no model was previously selected, use the first one
                    setSelectedModel(savedModels[0]);
                    await storageProviderRef.current.saveSelectedModel(makeModelId(savedModels[0]));
                }
            }
        }

        loadModels();
    }, [])

    // Listen for output elements from Electron
    useEffect(() => {
        const handleOutput = (element) => {
            const attachment = {
                id: Date.now(),
                type: element.type, // 'code', 'chart', 'table'
                data: element.data,
                metadata: element.metadata || {}
            }
            setPendingAttachments(prev => [...prev, attachment])
        };

        // For development/testing in browser environment
        if (import.meta.env.DEV && !window.electronApi) {
            window.electronApi = {
                sendOutputToChat: handleOutput
            };
        }

        const outputHandler = (e) => handleOutput(e.detail);
        window.addEventListener('outputElement', outputHandler);

        return () => {
            window.removeEventListener('outputElement', outputHandler);
        };
    }, [])

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text)
        } catch (err) {
            console.error('Failed to copy text: ', err)
        }
    }

    const deleteMessage = (messageId) => {
        setMessages(messages.filter(msg => msg.id !== messageId))
    }

    const toggleMessageView = (messageId) => {
        setMessages(messages.map(msg =>
            msg.id === messageId ? {...msg, showRaw: !msg.showRaw} : msg
        ))
    }

    // Set up scroll event listener
    useEffect(() => {
        const chatMessages = chatMessagesRef.current;
        if (chatMessages) {
            chatMessages.addEventListener('scroll', handleScroll);
            return () => chatMessages.removeEventListener('scroll', handleScroll);
        }
    }, []);

    // Handle auto-scrolling when messages change
    useEffect(() => {
        if (shouldAutoScroll && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [messages, shouldAutoScroll]);

    const stopStreaming = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
            setIsStreaming(false)
        }
    }

    async function streamResponse(userMessage) {
        if (!selectedModel) {
            setMessages(prev => [...prev, {
                id: Date.now(),
                content: 'Please configure and select an AI model first', 
                role: 'error'
            }])
            return
        }

        const newMessages = [...messages, {
            content: userMessage,
            role: 'user',
            id: Date.now(),
            showRaw: false,
            attachments: pendingAttachments
        }]
        setMessages(newMessages)
        setPendingAttachments([]) // Clear pending attachments after adding to message

        // Add an empty assistant message that we'll stream into
        setMessages(prev => [...prev, {
            content: '',
            role: 'assistant',
            id: Date.now() + 1,
            showRaw: false,
            attachments: []
        }])

        abortControllerRef.current = new AbortController()
        setIsStreaming(true)

        try {
            const response = await fetch(selectedModel.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(selectedModel.apiKey && {'Authorization': `Bearer ${selectedModel.apiKey}`})
                },
                body: JSON.stringify({
                    messages: newMessages
                        .filter(msg => ['user', 'assistant', 'system', 'tool'].includes(msg.role))
                        .map(formatMessage),
                    stream: true,
                    model: selectedModel.name
                }),
                signal: abortControllerRef.current.signal
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
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
                                setMessages(prev => {
                                    const newMessages = [...prev]
                                    newMessages[newMessages.length - 1].content = accumulatedResponse
                                    return newMessages
                                })
                            }
                        } catch (e) {
                            console.error('Error parsing streaming response:', e)
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return // Normal abort, do nothing
            }
            setMessages(prev => [...prev, {
                content: `Error: ${error.message}`,
                role: 'error',
                id: Date.now() + 2
            }])
        } finally {
            setIsStreaming(false)
            abortControllerRef.current = null
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (inputValue.trim()) {
            const userMessage = inputValue.trim()
            setInputValue('')
            await streamResponse(userMessage)
        }
    }

    const handleSaveSettings = async (newModels) => {
        setModels(newModels);
        await storageProviderRef.current.saveModels(newModels);

        // Handle selected model when models list changes
        if (newModels.length > 0) {
            if (!selectedModel) {
                // No model was selected, select the first one
                setSelectedModel(newModels[0]);
                await storageProviderRef.current.saveSelectedModel(makeModelId(newModels[0]));
            } else {
                // Check if currently selected model still exists
                const currentModel = newModels.find(m => makeModelId(m) === makeModelId(selectedModel));
                if (!currentModel) {
                    // Selected model was removed, switch to the first available model
                    setSelectedModel(newModels[0]);
                    await storageProviderRef.current.saveSelectedModel(makeModelId(newModels[0]));
                } else if (currentModel !== selectedModel) {
                    // Model with same name exists but might have different settings
                    setSelectedModel(currentModel);
                    await storageProviderRef.current.saveSelectedModel(makeModelId(currentModel));
                }
            }
        } else {
            // No models left
            setSelectedModel(null);
            await storageProviderRef.current.saveSelectedModel(null);
        }
    }

    return (
        <>
            <div className="chat-header">
                <select
                    className="model-selector"
                    value={selectedModel ? makeModelId(selectedModel) : ''}
                    onChange={(e) => {
                        const newModel = models.find(m => makeModelId(m) === e.target.value)
                        setSelectedModel(newModel)
                        if (newModel) {
                            localStorage.setItem('selectedModel', makeModelId(newModel))
                        }
                    }}
                >
                    {models.length === 0 && <option value="">No models configured</option>}
                    {models.map((model, index) => (
                        <option key={index} value={makeModelId(model)}>{model.name}</option>
                    ))}
                </select>
                <button
                    className="settings-button"
                    onClick={() => setShowSettings(true)}
                >
                    Settings
                </button>
            </div>

            <div className="chat-messages" ref={chatMessagesRef}>
                {messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                        <div className="message-actions">
                            <button
                                className="action-button"
                                onClick={() => copyToClipboard(message.content)}
                                title="Copy to clipboard"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path fill="currentColor"
                                          d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                </svg>
                            </button>
                            <button
                                className="action-button"
                                onClick={() => toggleMessageView(message.id)}
                                title={message.showRaw ? "Show formatted" : "Show raw"}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path fill="currentColor"
                                          d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                                </svg>
                            </button>
                            <button
                                className="action-button delete"
                                onClick={() => deleteMessage(message.id)}
                                title="Delete message"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path fill="currentColor"
                                          d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                            </button>
                        </div>
                        {message.attachments && message.attachments.length > 0 && (
                            <div className="message-attachments">
                                {message.attachments.map((attachment) => (
                                    <div key={attachment.id} className={`attachment attachment-${attachment.type}`}>
                                        {attachment.type === 'code' && (
                                            <div className="code-block-wrapper">
                                                <button
                                                    className="code-copy-button"
                                                    onClick={() => copyToClipboard(attachment.data)}
                                                    title="Copy code"
                                                >
                                                    <svg viewBox="0 0 24 24" width="16" height="16">
                                                        <path fill="currentColor"
                                                              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                                    </svg>
                                                </button>
                                                <SyntaxHighlighter
                                                    style={vscDarkPlus}
                                                    language={attachment.metadata.language || 'plaintext'}
                                                    PreTag="div"
                                                >
                                                    {attachment.data}
                                                </SyntaxHighlighter>
                                            </div>
                                        )}
                                        {attachment.type === 'chart' && (
                                            <div className="chart-wrapper">
                                                <img src={attachment.data} alt={attachment.metadata.title || 'Chart'}/>
                                            </div>
                                        )}
                                        {attachment.type === 'table' && (
                                            <div className="table-wrapper">
                                                <div dangerouslySetInnerHTML={{__html: attachment.data}}/>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="message-content">
                            {message.showRaw ? (
                                <pre className="raw-content">{message.content}</pre>
                            ) : (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        code({node, inline, className, children, ...props}) {
                                            const match = /language-(\w+)/.exec(className || '')
                                            const codeString = String(children).replace(/\n$/, '')

                                            if (!inline && match) {
                                                return (
                                                    <div className="code-block-wrapper">
                                                        <button
                                                            className="code-copy-button"
                                                            onClick={() => copyToClipboard(codeString)}
                                                            title="Copy code"
                                                        >
                                                            <svg viewBox="0 0 24 24" width="16" height="16">
                                                                <path fill="currentColor"
                                                                      d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                                            </svg>
                                                        </button>
                                                        <SyntaxHighlighter
                                                            style={vscDarkPlus}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            {...props}
                                                        >
                                                            {codeString}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            )
                                        }
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            )}
                        </div>
                        <div className="message-footer">
                            {
                                isStreaming &&
                                message.role === 'assistant' && (
                                    <button
                                        className="follow-stream-button"
                                        onClick={() => setShouldAutoScroll(prevState => !prevState)}
                                    >
                                        <svg viewBox="0 0 24 24" width="16" height="16">
                                            <path fill="currentColor" d="M16 13h-3V3h-2v10H8l4 4 4-4zM4 19v2h16v-2H4z"/>
                                        </svg>
                                        {shouldAutoScroll ? 'Stop Following' : 'Follow Stream'}
                                    </button>
                                )}
                        </div>
                    </div>
                ))}
            </div>

            {pendingAttachments.length > 0 && (
                <div className="pending-attachments">
                    {pendingAttachments.map((attachment) => (
                        <div key={attachment.id} className="pending-attachment">
                            <span className="attachment-type">{attachment.type}</span>
                            <button
                                className="remove-attachment"
                                onClick={() => setPendingAttachments(prev =>
                                    prev.filter(a => a.id !== attachment.id)
                                )}
                                title="Remove attachment"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path fill="currentColor"
                                          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <form onSubmit={handleSubmit} className="chat-input-form">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type a message..."
                    className="chat-input"
                />

                <button
                    type="submit"
                    className={`chat-submit ${isStreaming ? 'streaming' : ''}`}
                    onClick={isStreaming ? stopStreaming : undefined}
                    title={isStreaming ? "Stop streaming" : "Send message"}
                >
                    {isStreaming ? 'Stop' : 'Send'}
                </button>
            </form>
            <div ref={messagesEndRef}/>
            {showSettings && (
                <Settings
                    models={models}
                    onSave={handleSaveSettings}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </>
    )
}

export default Chat
