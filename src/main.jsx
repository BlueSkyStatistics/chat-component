import React from 'react'
import ReactDOM from 'react-dom/client'
import Chat from './Chat'
import { LocalStorageProvider, ModelStorageInterface } from './storage/modelStorage'
import {
  ConversationStorageInterface,
  LocalStorageConversationProvider,
} from './storage/conversationStorage'

// Store the root instance
let root = null;

// Initialize the chat component inside a DOM container.
//
// Parameters:
//   containerId         - DOM id to mount into
//   modelStorage        - optional ModelStorageInterface implementation
//                         (defaults to LocalStorageProvider)
//   conversationStorage - optional ConversationStorageInterface implementation
//                         (defaults to LocalStorageConversationProvider)
function initChatComponent(containerId, modelStorage, conversationStorage) {
  console.log(`Chat Component v${__CHAT_VERSION__}`);
  const container = document.getElementById(containerId)
  if (container) {
    if (!root) {
      root = ReactDOM.createRoot(container);
    }
    const modelStorageProvider = modelStorage || new LocalStorageProvider()
    // conversationStorage is intentionally NOT defaulted: callers that do not
    // supply a provider opt out of the conversation manager entirely and only
    // keep the basic "clear conversation" behaviour.
    root.render(
      <React.StrictMode>
        <Chat
          modelStorage={modelStorageProvider}
          conversationStorage={conversationStorage}
        />
      </React.StrictMode>
    );
  }
}

// Development mode
if (import.meta.env.DEV) {
  initChatComponent('chat-container', new LocalStorageProvider(), new LocalStorageConversationProvider())
}

// // Production mode
// if (typeof window !== 'undefined') {
//   window.initChatComponent = initChatComponent
//   window.ModelStorageInterface = ModelStorageInterface
//   window.ConversationStorageInterface = ConversationStorageInterface
// }

export {
  initChatComponent,
  ModelStorageInterface,
  LocalStorageProvider,
  ConversationStorageInterface,
  LocalStorageConversationProvider,
}
