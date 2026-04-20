import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import renderMathInElement from 'katex/contrib/auto-render'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism'
import MessageAttachments from './MessageAttachments'
import {preserveLatexEscapes} from '../utils/preserveLatexEscapes'
import {useEffect, useMemo, useRef} from "react";

// Delimiter pairs recognized by KaTeX auto-render. Order matters: longer /
// more specific delimiters (e.g. `$$`) must come before shorter ones (`$`).
const KATEX_DELIMITERS = [
    {left: '$$', right: '$$', display: true},
    {left: '\\[', right: '\\]', display: true},
    {left: '\\(', right: '\\)', display: false},
    {left: '$', right: '$', display: false},
]

// Coalesce auto-render passes that happen during streaming. Each streamed
// token re-renders the markdown, which would otherwise trigger one KaTeX
// pass per token. Waiting a short moment lets bursts of tokens settle into
// a single pass while still feeling immediate once streaming pauses/stops.
const KATEX_DEBOUNCE_MS = 120

function Message({ 
    message, 
    onCopy,
    onDelete, 
    onToggleView,
    onToggleAttachments,
    getIconForType
}) {
    const actionButtonClass = useMemo(() => {
        return message.role === 'user' ? 'm-0 btn' : 'm-0 btn btn-light'
    }, [message.role])

    // CommonMark would strip the backslashes from `\(`, `\[` before the math
    // ever reaches the rendered DOM, so we rewrite those TeX delimiters into
    // `$` / `$$` up-front. Everything else (including actual `$` delimiters
    // and `\begin{env}...\end{env}` blocks that appear inside `$$...$$`) is
    // recognized natively by KaTeX auto-render below.
    const markdownSource = useMemo(
        () => preserveLatexEscapes(message.content),
        [message.content]
    )

    // KaTeX auto-render pass. Runs after each re-render of the markdown output
    // so that streamed content is re-scanned as new tokens arrive. The
    // `auto-render` walks text nodes and replaces math delimiters in place,
    // so code blocks / inline `<code>` are left untouched automatically.
    //
    // The pass is debounced: during streaming the markdown DOM is rebuilt on
    // every token, so running KaTeX synchronously on every commit wastes work
    // on output that's about to be replaced. The effect's cleanup cancels any
    // pending pass, so the last-committed content is always the one rendered.
    const contentRef = useRef(null)
    useEffect(() => {
        if (!contentRef.current || message.showRaw) return
        const handle = setTimeout(() => {
            if (!contentRef.current) return
            renderMathInElement(contentRef.current, {
                delimiters: KATEX_DELIMITERS,
                throwOnError: false,
                ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
            })
        }, KATEX_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [markdownSource, message.showRaw])
    return (
        <div className={`message ${message.role}`}>
            <div className="message-actions">
                <div className="btn-group btn-group-sm shadow-sm my-0" role="group">
                    <button
                        className={actionButtonClass}
                        onClick={() => onCopy(message.content)}
                        title="Copy to clipboard"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor"
                                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                    </button>
                    <button
                        className={actionButtonClass}
                        onClick={() => onToggleView(message.id)}
                        title={message.showRaw ? "Show formatted" : "Show raw"}
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor"
                                  d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                        </svg>
                    </button>
                    <button
                        className={"text-danger " + actionButtonClass}
                        onClick={() => onDelete(message.id)}
                        title="Delete message"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor"
                                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <MessageAttachments
                attachments={message.attachments}
                showAttachments={message.showAttachments}
                onToggleShow={() => onToggleAttachments(message.id)}
                onCopy={onCopy}
                getIconForType={getIconForType}
            />

            <div className="message-content" ref={contentRef}>
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
                                                onClick={() => onCopy(codeString)}
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
                        {markdownSource}
                    </ReactMarkdown>
                )}
            </div>
            <div className="message-footer">
                {/* Future: Add streaming controls or other footer content */}
            </div>
        </div>
    )
}

export default Message
