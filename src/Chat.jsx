import {useState, useEffect, useRef, useCallback} from 'react'
import {formatMessage} from './attachmentFormatters'
import 'katex/dist/katex.min.css'
import './Chat.css'
import Settings from './Settings'
import Conversations from './Conversations'
import Message from './components/Message'
import PendingAttachments from './components/PendingAttachments'
import {deriveConversationTitle, makeConversationId} from './utils/conversationIO'

const makeModelId = (model) => `${model.name}-${model.endpoint}`;

const DEFAULT_TITLE = 'New Conversation'
const AUTOSAVE_DEBOUNCE_MS = 500

const makeGreetingMessage = () => ({
    content: 'Hi, how can I help you?',
    role: 'assistant',
    id: Date.now(),
    showRaw: false,
    showAttachments: false,
})

// A conversation is considered "worth persisting" only once the user has
// actually contributed something. Otherwise we'd spam storage with empty
// greeting-only placeholders on every page load.
const hasUserActivity = (messages) =>
    Array.isArray(messages) && messages.some((m) => m && m.role === 'user')

function Chat({modelStorage, conversationStorage, onConversationError}) {
    // Lazy init so we don't allocate a fresh greeting object + `Date.now()` id
    // on every render (useState ignores subsequent values anyway).
    const [messages, setMessages] = useState(() => [makeGreetingMessage()])
    const [inputValue, setInputValue] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [showConversations, setShowConversations] = useState(false)
    const [models, setModels] = useState([])
    const [selectedModel, setSelectedModel] = useState(null)
    const [isStreaming, setIsStreaming] = useState(false)
    const [pendingAttachments, setPendingAttachments] = useState([])
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
    const [expandedAttachments, setExpandedAttachments] = useState(new Set())
    const [showAttachmentBar, setShowAttachmentBar] = useState(false)
    const [activeConversationId, setActiveConversationId] = useState(null)
    const [conversationMeta, setConversationMeta] = useState({
        title: DEFAULT_TITLE,
        createdAt: null,
    })
    const abortControllerRef = useRef(null)
    const messagesEndRef = useRef(null)
    const chatMessagesRef = useRef(null)
    const inputRef = useRef(null)
    const autosaveTimerRef = useRef(null)
    const conversationHydratedRef = useRef(false)

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
    // When no conversationStorage is provided the whole conversation manager
    // (listing, restore, rename, delete, export/import, autosave) is disabled
    // and the eraser button falls back to "just clear messages".
    const conversationStorageRef = useRef(conversationStorage || null);
    const hasConversationStorage = !!conversationStorage;
    // Keep the ref in sync with prop swaps so a host app can change provider
    // without remounting the component.
    useEffect(() => {
        conversationStorageRef.current = conversationStorage || null
    }, [conversationStorage])

    // Callback ref for storage errors so host apps can surface them in their
    // own UI. Updated via effect to avoid stale closures inside long-lived
    // callbacks (hydration / autosave).
    const onConversationErrorRef = useRef(onConversationError)
    useEffect(() => {
        onConversationErrorRef.current = onConversationError
    }, [onConversationError])
    const reportStorageError = useCallback((err) => {
        console.error(err)
        try {
            onConversationErrorRef.current?.(err)
        } catch (cbErr) {
            console.error('onConversationError callback threw:', cbErr)
        }
    }, [])

    // When set, skip exactly one run of the autosave effect. Used after
    // hydration / restore so merely opening a conversation does not bump its
    // updatedAt timestamp with identical content.
    const skipNextAutosaveRef = useRef(false)

    // Mirror of conversationMeta used inside the autosave callback so that
    // renaming a conversation does NOT retrigger the autosave (the rename
    // path already persists the new title explicitly).
    const conversationMetaRef = useRef({title: DEFAULT_TITLE, createdAt: null})

    // Mirror of messages, kept in sync via effect. Lets async callbacks
    // (notably hydration) check the latest value without re-running whenever
    // messages change.
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const refreshModels = useCallback(async () => {
        const savedModels = await storageProviderRef.current.getModels();
        const savedModelId = await storageProviderRef.current.getSelectedModel();

        setModels(savedModels || []);
        if (savedModels && savedModels.length > 0) {
            let next = savedModels[0];
            if (savedModelId) {
                const found = savedModels.find(m => makeModelId(m) === savedModelId);
                if (found) next = found;
            }
            setSelectedModel(next);
            await storageProviderRef.current.saveSelectedModel(makeModelId(next));
        } else {
            setSelectedModel(null);
            await storageProviderRef.current.saveSelectedModel(null);
        }
    }, []);

    // Save selected model when it changes
    useEffect(() => {
        if (selectedModel) {
            const modelId = makeModelId(selectedModel);
            storageProviderRef.current.saveSelectedModel(modelId);
        }
    }, [selectedModel]);

    // Load saved models and restore selected model
    useEffect(() => {
        refreshModels();
    }, [refreshModels])

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

    // Cancel any in-flight streaming without mutating the message list.
    // Used when switching/clearing a conversation so the old assistant response
    // does not continue populating the freshly-loaded one.
    const abortActiveStream = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setIsStreaming(false)
    }, [])

    // Load messages from a stored conversation into the UI.
    // The autosave effect is suppressed for exactly one run after this so that
    // merely opening a conversation does not bump its updatedAt timestamp.
    const loadConversation = useCallback(async (id) => {
        if (!id) return
        const storage = conversationStorageRef.current
        if (!storage) return
        abortActiveStream()
        let full
        try {
            full = await storage.getConversation(id)
        } catch (err) {
            reportStorageError(err)
            return
        }
        if (!full) {
            // Stale pointer in storage; forget it so we start fresh next time.
            try {
                await storage.setActiveConversationId(null)
            } catch (err) {
                reportStorageError(err)
            }
            return
        }
        skipNextAutosaveRef.current = true
        setMessages(Array.isArray(full.messages) ? full.messages : [])
        setPendingAttachments([])
        setActiveConversationId(full.id)
        setConversationMeta({
            title: full.title || DEFAULT_TITLE,
            createdAt: full.createdAt || null,
        })
        try {
            await storage.setActiveConversationId(full.id)
        } catch (err) {
            reportStorageError(err)
        }
    }, [abortActiveStream, reportStorageError])

    // Reset the UI to a brand-new, unsaved conversation (greeting only).
    // When a storage provider is configured the previously-active conversation
    // remains in storage untouched; otherwise this is just a local "clear".
    // Autosave is naturally skipped here because `[greeting]` has no user
    // activity, so we intentionally do NOT touch conversationHydratedRef.
    const startNewConversation = useCallback(async () => {
        abortActiveStream()
        setMessages([makeGreetingMessage()])
        setPendingAttachments([])
        setActiveConversationId(null)
        setConversationMeta({title: DEFAULT_TITLE, createdAt: null})
        const storage = conversationStorageRef.current
        if (storage) {
            try {
                await storage.setActiveConversationId(null)
            } catch (err) {
                reportStorageError(err)
            }
        }
    }, [abortActiveStream, reportStorageError])

    // One-shot hydration from storage on mount. Skipped entirely when no
    // conversation storage provider has been configured.
    //
    // While hydration is in flight, the user can already type and send a
    // message. To avoid clobbering that input, we only overwrite `messages`
    // when the user has not yet contributed anything (i.e. the array is still
    // the untouched greeting-only placeholder).
    useEffect(() => {
        if (!conversationStorageRef.current) {
            conversationHydratedRef.current = true
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const storage = conversationStorageRef.current
                const activeId = await storage.getActiveConversationId()
                if (cancelled) return
                if (!activeId) {
                    conversationHydratedRef.current = true
                    return
                }
                const full = await storage.getConversation(activeId)
                if (cancelled) return
                if (full) {
                    // Bail if the user has already started typing / sending
                    // during the async window; a remote provider could take
                    // long enough for this to matter.
                    if (hasUserActivity(messagesRef.current)) {
                        return
                    }
                    skipNextAutosaveRef.current = true
                    setMessages(Array.isArray(full.messages) ? full.messages : [])
                    setActiveConversationId(full.id)
                    setConversationMeta({
                        title: full.title || DEFAULT_TITLE,
                        createdAt: full.createdAt || null,
                    })
                } else {
                    await storage.setActiveConversationId(null)
                }
            } catch (err) {
                reportStorageError(err)
            } finally {
                if (!cancelled) conversationHydratedRef.current = true
            }
        })()
        return () => {
            cancelled = true
        }
    }, [reportStorageError])

    // Keep the meta ref current so the autosave callback always sees the
    // latest title/createdAt without needing them in its dependency array.
    useEffect(() => {
        conversationMetaRef.current = conversationMeta
    }, [conversationMeta])

    // Autosave the active conversation whenever messages change. Debounced so
    // streamed responses don't produce dozens of writes per second. Skipped
    // entirely when no storage provider has been configured.
    //
    // Title / createdAt intentionally are NOT in the dep array: rename and
    // restore already persist what they need to persist, and including them
    // here would produce redundant writes that only bump updatedAt.
    useEffect(() => {
        if (!conversationStorageRef.current) return
        if (!conversationHydratedRef.current) return
        if (!hasUserActivity(messages)) return
        if (skipNextAutosaveRef.current) {
            skipNextAutosaveRef.current = false
            return
        }

        const timerId = setTimeout(async () => {
            try {
                const storage = conversationStorageRef.current
                if (!storage) return
                const now = Date.now()
                const id = activeConversationId || makeConversationId()
                const meta = conversationMetaRef.current
                const createdAt = meta.createdAt || now
                // Keep a user-edited title; otherwise re-derive from messages.
                const title = meta.title && meta.title !== DEFAULT_TITLE
                    ? meta.title
                    : deriveConversationTitle(messages)
                const conversation = {
                    id,
                    title,
                    createdAt,
                    updatedAt: now,
                    messages,
                    version: 1,
                }
                await storage.saveConversation(conversation)
                if (!activeConversationId) {
                    setActiveConversationId(id)
                    try {
                        await storage.setActiveConversationId(id)
                    } catch (err) {
                        reportStorageError(err)
                    }
                }
                if (meta.title !== title || meta.createdAt !== createdAt) {
                    setConversationMeta({title, createdAt})
                }
            } catch (err) {
                reportStorageError(err)
            }
        }, AUTOSAVE_DEBOUNCE_MS)
        autosaveTimerRef.current = timerId

        return () => {
            clearTimeout(timerId)
        }
    }, [messages, activeConversationId, reportStorageError])

    // Called from the Conversations modal when the user renames the active
    // conversation; keeps the in-memory title in sync.
    const handleActiveConversationRenamed = useCallback((updated) => {
        if (!updated) return
        setConversationMeta((prev) => ({
            ...prev,
            title: updated.title,
            createdAt: updated.createdAt ?? prev.createdAt,
        }))
    }, [])

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

    const handleRefreshModels = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await refreshModels();
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
                <div className="d-flex align-items-center gap-1">
                    {hasConversationStorage && (
                        <>
                            <button
                                className="btn btn-sm btn-link p-1 m-0"
                                onClick={() => setShowConversations(true)}
                                title="Conversations"
                            >
                                <i className="fas fa-comments"></i>
                            </button>
                            <button
                                className="btn btn-sm btn-link p-1 m-0"
                                onClick={startNewConversation}
                                title="New conversation"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </>
                    )}
                    {!hasConversationStorage && (<button
                        className="btn btn-sm text-danger m-0"
                        onClick={startNewConversation}
                        title={hasConversationStorage
                            ? "Clear conversation (starts a new one)"
                            : "Clear conversation"}
                    >
                        <i className="fas fa-eraser"></i>
                    </button>)}
                    {hasConversationStorage && conversationMeta.title && (
                        <span
                            className="small text-truncate ms-2 d-none d-md-inline"
                            style={{maxWidth: '220px'}}
                            title={conversationMeta.title}
                        >
                            {conversationMeta.title}
                        </span>
                    )}
                </div>

                <div className="d-flex align-items-center gap-2">
                    {selectedModel && (
                        <span className="">
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
                            <i className="fas fa-cog"></i>
                        </button>
                        <div className="dropdown-menu dropdown-menu-end" style={{minWidth: '250px'}}>
                            <div className="px-3 py-2">
                                <label className="form-label mb-1 small text-muted">Select Model</label>
                                <div className="d-flex gap-2 mb-2">
                                    <select 
                                        className="form-select form-select-sm flex-grow-1"
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
                                        className="btn btn-sm btn-primary"
                                        onClick={handleRefreshModels}
                                        title="Refresh models list"
                                    >
                                        <i className="fas fa-sync"></i>
                                    </button>
                                </div>
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

            <div className="flex-grow-1 py-2 overflow-auto" style={{scrollBehavior: 'smooth', overscrollBehavior: 'contain'}} ref={chatMessagesRef}>
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
            {hasConversationStorage && showConversations && (
                <Conversations
                    conversationStorage={conversationStorageRef.current}
                    activeConversationId={activeConversationId}
                    onRestore={loadConversation}
                    onNew={startNewConversation}
                    onClose={() => setShowConversations(false)}
                    onActiveConversationDeleted={startNewConversation}
                    onActiveConversationChanged={handleActiveConversationRenamed}
                    onStorageError={reportStorageError}
                />
            )}
        </>
    )
}

export default Chat
