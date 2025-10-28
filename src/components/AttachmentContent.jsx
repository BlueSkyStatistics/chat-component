import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism'

function AttachmentContent({ attachment, onCopy }) {
    return (
        <div className="attachment-content-wrapper">
            {attachment.type === 'code' && (
                <div className="code-block-wrapper">
                    <button
                        className="code-copy-button"
                        onClick={() => onCopy(attachment.data)}
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
    )
}

export default AttachmentContent
