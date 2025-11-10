import {useState, useEffect, useRef} from 'react'
import {formatMessage} from './attachmentFormatters'
import './Chat.css'
import Settings from './Settings'
import Message from './components/Message'
import PendingAttachments from './components/PendingAttachments'

const makeModelId = (model) => `${model.name}-${model.endpoint}`;

function Chat({modelStorage}) {
    const [messages, setMessages] = useState([
        {
            content: 'Hi, how can I help you?',
            role: 'assistant',
            id: Date.now(),
            showRaw: false,
            showAttachments: false
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [models, setModels] = useState([])
    const [selectedModel, setSelectedModel] = useState(null)
    const [isStreaming, setIsStreaming] = useState(false)
    const [pendingAttachments, setPendingAttachments] = useState([])
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
    const [expandedAttachments, setExpandedAttachments] = useState(new Set())
    const [showAttachmentBar, setShowAttachmentBar] = useState(false)
    const abortControllerRef = useRef(null)
    const messagesEndRef = useRef(null)
    const chatMessagesRef = useRef(null)
    const inputRef = useRef(null)

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
            // Use element.id if provided, otherwise generate one
            const itemId = element.id !== undefined ? element.id : Date.now() + Math.random();
            
            // Check if this ID already exists in pending attachments
            setPendingAttachments(prev => {
                // If element has an id and it already exists, don't add it again
                if (element.id !== undefined && prev.some(a => a.id === element.id)) {
                    console.log(`Attachment with id "${element.id}" already exists, skipping.`);
                    return prev;
                }
                
                const attachment = {
                    id: itemId,
                    type: element.type, // 'code', 'chart', 'table'
                    data: element.data,
                    metadata: element.metadata || {},
                    output: element.output || null, // { id, title }
                    initialMessage: element.initialMessage,
                }
                
                // console.log('Chat component received:', {
                //     'element.id': element.id,
                //     'element.output': element.output,
                //     'attachment.output': attachment.output,
                //     'attachment.output?.id': attachment.output?.id,
                //     'attachment.output?.title': attachment.output?.title
                // });
                
                const newAttachments = [...prev, attachment];
                
                // Set default message if first attachment and input is empty
                if (attachment.initialMessage && prev.length === 0 && !inputValue.trim()) {
                    setInputValue(attachment.initialMessage);
                    setTimeout(() => inputRef.current?.focus(), 0);
                }
                
                return newAttachments;
            })
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

    const clearConversation = () => {
        // if (window.confirm('Are you sure you want to clear the entire conversation? This action cannot be undone.')) {
            setMessages([])
            setPendingAttachments([])
        // }
    }

    const toggleMessageView = (messageId) => {
        setMessages(messages.map(msg =>
            msg.id === messageId ? {...msg, showRaw: !msg.showRaw} : msg
        ))
    }

    // Helper functions for attachments
    const getIconForType = (type) => {
        switch(type) {
            case 'code': return 'code';
            case 'chart': return 'chart-bar';
            case 'table': return 'table';
            default: return 'file';
        }
    }


    const removeAttachment = (attachmentId) => {
        setPendingAttachments(prev => prev.filter(a => a.id !== attachmentId));
    }

    const removeOutputGroup = (outputId) => {
        setPendingAttachments(prev => 
            prev.filter(a => (a.output?.id || 'ungrouped') !== outputId)
        );
    }

    const toggleAttachmentExpanded = (attachmentId) => {
        setExpandedAttachments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(attachmentId)) {
                newSet.delete(attachmentId);
            } else {
                newSet.add(attachmentId);
            }
            return newSet;
        });
    }

    const toggleMessageAttachments = (messageId) => {
        setMessages(messages.map(msg =>
            msg.id === messageId
                ? { ...msg, showAttachments: !msg.showAttachments }
                : msg
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

    // Initialize Bootstrap tooltips for pending attachments
    useEffect(() => {
        if (typeof window.bootstrap !== 'undefined') {
            // Initialize tooltips for accordion buttons with group titles
            const accordionButtons = document.querySelectorAll('#attachmentAccordion .accordion-button[title]');
            const tooltipInstances = [];
            
            accordionButtons.forEach(el => {
                if (el) {
                    const tooltip = new window.bootstrap.Tooltip(el, {
                        trigger: 'hover',
                        placement: 'top'
                    });
                    tooltipInstances.push(tooltip);
                }
            });
            
            // Cleanup
            return () => {
                tooltipInstances.forEach(tooltip => {
                    tooltip?.dispose();
                });
            };
        }
    }, [pendingAttachments]);

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
            showAttachments: false,
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
            showAttachments: false,
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
            <div className="d-flex justify-content-between align-items-center border-bottom py-1 px-3">
                <button 
                    className="btn btn-sm text-danger m-0"
                    onClick={clearConversation}
                    title="Clear conversation"
                >
                    <i className="fas fa-eraser"></i>
                </button>
                
                <div className="d-flex align-items-center gap-2">
                    {selectedModel && (
                        <span className="text-white">
                            {selectedModel.name}
                        </span>
                    )}
                    <div className="dropdown">
                        <button 
                            className="btn btn-link btn-sm p-1 m-0"
                            type="button" 
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                            title="Settings"
                        >
                            <i className="fas fa-cog text-white"></i>
                        </button>
                        <div className="dropdown-menu dropdown-menu-end" style={{minWidth: '250px'}}>
                            <div className="px-3 py-2">
                                <label className="form-label mb-1 small text-muted">Select Model</label>
                                <select 
                                    className="form-select form-select-sm mb-2"
                                    value={selectedModel ? makeModelId(selectedModel) : ''}
                                    onChange={(e) => {
                                        const newModel = models.find(m => makeModelId(m) === e.target.value);
                                        setSelectedModel(newModel);
                                    }}
                                >
                                    {models.length === 0 && <option value="">No models configured</option>}
                                    {models.map((model, index) => (
                                        <option key={index} value={makeModelId(model)}>{model.name}</option>
                                    ))}
                                </select>
                                <button 
                                    className="btn btn-sm btn-primary w-100"
                                    onClick={() => setShowSettings(true)}
                                >
                                    <i className="fas fa-sliders-h me-2"></i>
                                    Configure Models
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-grow-1 p-3 overflow-auto" style={{scrollBehavior: 'smooth', overscrollBehavior: 'contain'}} ref={chatMessagesRef}>
                {messages.map((message) => (
                    <Message
                        key={message.id}
                        message={message}
                        onCopy={copyToClipboard}
                        onDelete={deleteMessage}
                        onToggleView={toggleMessageView}
                        onToggleAttachments={toggleMessageAttachments}
                        getIconForType={getIconForType}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

{showAttachmentBar && (
                <PendingAttachments
                    attachments={pendingAttachments}
                    expandedAttachments={expandedAttachments}
                    onToggleExpand={toggleAttachmentExpanded}
                    onRemoveAttachment={removeAttachment}
                    onRemoveGroup={removeOutputGroup}
                    onCopy={copyToClipboard}
                    getIconForType={getIconForType}
                />
            )}
            
<form onSubmit={handleSubmit} className="border-top p-2 m-0 pt-3">
                <div className="input-group">
                    {pendingAttachments.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-secondary position-relative m-0 mr-2"
                            onClick={() => setShowAttachmentBar(!showAttachmentBar)}
                            title={showAttachmentBar ? "Hide attachments" : "Show attachments"}
                        >
                            <i className="fas fa-paperclip"></i>
                            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-secondary">
                                {pendingAttachments.length}
                            </span>
                        </button>
                    )}
                    <textarea
                        id='chatUserInput'
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Type a message... (Shift+Enter for new line)"
                        className="form-control px-1"
                        rows="1"
                        style={{resize: 'vertical', minHeight: '38px'}}
                    />
                    <button
                        type="submit"
                        className={`m-0 btn ${isStreaming ? 'btn-danger' : 'btn-primary'}`}
                        onClick={isStreaming ? stopStreaming : undefined}
                        title={isStreaming ? "Stop streaming" : "Send message"}
                    >
                        <i className={`fas fa-${isStreaming ? 'stop' : 'paper-plane'} me-2`}></i>
                        {isStreaming ? 'Stop' : 'Send'}
                    </button>
                </div>
            </form>
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
