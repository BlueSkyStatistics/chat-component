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
//   containerId           - DOM id to mount into
//   modelStorage          - optional ModelStorageInterface implementation
//                           (defaults to LocalStorageProvider)
//   conversationStorage   - optional ConversationStorageInterface implementation.
//                           When omitted the conversation manager (listing,
//                           autosave, restore, rename, delete, export/import)
//                           is disabled. Pass LocalStorageConversationProvider
//                           explicitly to opt in with the bundled default.
//   onConversationError   - optional callback invoked with any error thrown by
//                           the storage provider (e.g. localStorage quota
//                           exceeded). Useful for surfacing the error in the
//                           host application's UI.
function initChatComponent(containerId, modelStorage, conversationStorage, onConversationError, options={addModelsAllowed: true}) {
  console.log(`Chat Component v${__CHAT_VERSION__}`);
  const container = document.getElementById(containerId)
  if (container) {
    if (!root) {
      root = ReactDOM.createRoot(container);
    }
    const modelStorageProvider = modelStorage || new LocalStorageProvider()
    root.render(
      <React.StrictMode>
        <Chat
          modelStorage={modelStorageProvider}
          conversationStorage={conversationStorage}
          onConversationError={onConversationError}
          options={options}
        />
      </React.StrictMode>
    );
  }
}

// Development mode: opt in to the bundled localStorage conversation provider
// so the full conversation manager UI is exercised while developing.
// if (import.meta.env.DEV) {
//   initChatComponent('chat-container', new LocalStorageProvider(), new LocalStorageConversationProvider())
// }

export {
  initChatComponent,
  ModelStorageInterface,
  LocalStorageProvider,
  ConversationStorageInterface,
  LocalStorageConversationProvider,
}
