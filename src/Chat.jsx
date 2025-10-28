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

    const getTooltipText = (attachment) => {
        if (attachment.metadata.title) {
            return attachment.metadata.title;
        }
        switch(attachment.type) {
            case 'code':
                return attachment.metadata.language ? `${attachment.metadata.language} code` : 'Code snippet';
            case 'chart':
                return 'Chart';
            case 'table':
                return 'Table';
            default:
                return attachment.type;
        }
    }

    const groupAttachmentsByOutput = (attachments) => {
        return attachments.reduce((groups, attachment) => {
            // Group by output.id if available, otherwise use 'ungrouped'
            const outputId = attachment.output?.id || 'ungrouped';
            if (!groups[outputId]) {
                groups[outputId] = {
                    title: attachment.output?.title || 'Attachments',
                    items: []
                };
            }
            groups[outputId].items.push(attachment);
            return groups;
        }, {});
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

    const renderAttachmentContent = (attachment) => {
        return (
            <div className="attachment-content-wrapper">
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
        );
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
            <div className="chat-header">
                <div className="dropdown">
                    <button 
                        className="btn btn-link btn-sm"
                        type="button" 
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                    >
                        <i className="fas fa-cog fa-lg text-secondary"></i>
                    </button>
                    <div className="dropdown-menu dropdown-menu-end">
                        <div className="px-3 py-2" style={{minWidth: '250px'}}>
                            <label className="form-label mb-1 small text-muted">Select Model</label>
                            <select 
                                className="form-select form-select-sm mb-2"
                                value={selectedModel ? makeModelId(selectedModel) : ''}
                                onChange={(e) => {
                                    const newModel = models.find(m => makeModelId(m) === e.target.value)
                                    setSelectedModel(newModel)
                                }}
                            >
                                {models.length === 0 && <option value="">No models configured</option>}
                                {models.map((model, index) => (
                                    <option key={index} value={makeModelId(model)}>{model.name}</option>
                                ))}
                            </select>
                            <button 
                                className="btn btn-sm btn-primary w-100"
                                onClick={() => {
                                    setShowSettings(true);
                                }}
                            >
                                <i className="fas fa-sliders-h me-2"></i>
                                Configure Models
                            </button>
                        </div>
                    </div>
                </div>
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
                            <div className="message-attachments-container">
                                <button
                                    className="attachments-toggle"
                                    onClick={() => {
                                        setMessages(prev => prev.map(msg =>
                                            msg.id === message.id
                                                ? { ...msg, showAttachments: !msg.showAttachments }
                                                : msg
                                        ))
                                    }}
                                >
                                    <svg viewBox="0 0 24 24" width="16" height="16">
                                        <path fill="currentColor" d={
                                            message.showAttachments
                                                ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                                                : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                                        }/>
                                    </svg>
                                    {message.attachments.length} Attachment{message.attachments.length !== 1 ? 's' : ''}
                                </button>
                                {message.showAttachments && (
                                    <div className="message-attachments">
                                        {message.attachments.map((attachment) => {
                                            const itemTitle = attachment.metadata?.title || attachment.type;
                                            const itemHref = attachment.metadata?.href;
                                            const isExpanded = expandedAttachments.has(attachment.id);
                                            
                                            return (
                                                <div key={attachment.id} className="attachment-item">
                                                    <div className="attachment-header">
                                                        <div className="attachment-title-section">
                                                            <i className={`fas fa-${getIconForType(attachment.type)} me-2 text-muted`}></i>
                                                            {itemHref ? (
                                                                <a 
                                                                    href={itemHref} 
                                                                    className="attachment-title-link"
                                                                    title={itemTitle}
                                                                >
                                                                    {itemTitle}
                                                                </a>
                                                            ) : (
                                                                <span className="attachment-title" title={itemTitle}>
                                                                    {itemTitle}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary view-button"
                                                            onClick={() => toggleAttachmentExpanded(attachment.id)}
                                                            title={isExpanded ? 'Hide content' : 'View content'}
                                                        >
                                                            <i className={`fas fa-${isExpanded ? 'eye-slash' : 'eye'}`}></i>
                                                        </button>
                                                    </div>
                                                    {isExpanded && renderAttachmentContent(attachment)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                            {/* {
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
                                )} */}
                        </div>
                    </div>
                ))}
            </div>

            {pendingAttachments.length > 0 && (
                <div className="pending-attachments-wrapper">
                    <div className="accordion-horizontal accordion accordion-flush" id="attachmentAccordion">
                        {Object.entries(groupAttachmentsByOutput(pendingAttachments)).map(([outputId, group]) => (
                            <div className="accordion-item" key={outputId}>
                                <h2 className="accordion-header">
                                    <button 
                                        className="accordion-button collapsed py-1 px-2" 
                                        type="button" 
                                        data-bs-toggle="collapse" 
                                        data-bs-target={`#collapse-${outputId}`}
                                        aria-expanded="false"
                                        title={group.title}
                                    >
                                        <small className="me-2 fw-bold text-truncate group-title">{group.title}</small>
                                        <span className="badge bg-secondary badge-sm flex-shrink-0">{group.items.length}</span>
                                    </button>
                                    <button
                                        className="btn btn-sm btn-link text-danger p-0 group-delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeOutputGroup(outputId);
                                        }}
                                        title="Delete group"
                                    >
                                        <i className="fas fa-trash fa-sm"></i>
                                    </button>
                                </h2>
                                <div 
                                    id={`collapse-${outputId}`} 
                                    className="accordion-collapse collapse"
                                    data-bs-parent="#attachmentAccordion"
                                >
                                    <div className="accordion-body p-2">
                                        <div className="d-flex flex-column gap-2">
                                            {group.items.map((attachment) => {
                                                const itemTitle = attachment.metadata?.title || attachment.type;
                                                const itemHref = attachment.metadata?.href;
                                                
                                                const isExpanded = expandedAttachments.has(attachment.id);
                                                
                                                return (
                                                    <div key={attachment.id} className="pending-attachment-card">
                                                        <div className="pending-attachment-header">
                                                            <div className="d-flex align-items-center flex-grow-1 min-w-0">
                                                                <i className={`fas fa-${getIconForType(attachment.type)} me-2 text-muted flex-shrink-0`}></i>
                                                                {itemHref ? (
                                                                    <a 
                                                                        href={itemHref} 
                                                                        className="text-decoration-none text-primary text-truncate"
                                                                        title={itemTitle}
                                                                    >
                                                                        <small>{itemTitle}</small>
                                                                    </a>
                                                                ) : (
                                                                    <small className="text-truncate" title={itemTitle}>
                                                                        {itemTitle}
                                                                    </small>
                                                                )}
                                                            </div>
                                                            <div className="d-flex gap-1 flex-shrink-0 ms-2">
                                                                <button
                                                                    className="btn btn-sm btn-outline-secondary px-1 py-0"
                                                                    onClick={() => toggleAttachmentExpanded(attachment.id)}
                                                                    title={isExpanded ? 'Hide content' : 'View content'}
                                                                >
                                                                    <i className={`fas fa-${isExpanded ? 'eye-slash' : 'eye'}`}></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-link text-danger p-0"
                                                                    onClick={() => removeAttachment(attachment.id)}
                                                                    title="Remove item"
                                                                >
                                                                    <i className="fas fa-times fa-sm"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="pending-attachment-content">
                                                                {renderAttachmentContent(attachment)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <form onSubmit={handleSubmit} className="chat-input-form">
                <input
                    ref={inputRef}
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
