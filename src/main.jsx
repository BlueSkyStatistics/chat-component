import React from 'react'
import ReactDOM from 'react-dom/client'
import Chat from './Chat'
import { LocalStorageProvider, ModelStorageInterface } from './storage/modelStorage'

// Store the root instance
let root = null;

// Create a function to initialize the chat component
function initChatComponent(containerId, modelStorage) {
  console.log(`Chat Component v${__CHAT_VERSION__}`);
  const container = document.getElementById(containerId)
  if (container) {
    if (!root) {
      root = ReactDOM.createRoot(container);
    }
    const modelStorageProvider = modelStorage || new LocalStorageProvider()
    root.render(
      <React.StrictMode>
        <Chat modelStorage={modelStorageProvider} />
      </React.StrictMode>
    );
  }
}

// Development mode
if (import.meta.env.DEV) {
  initChatComponent('chat-container', new LocalStorageProvider())
}

// // Production mode
// if (typeof window !== 'undefined') {
//   window.initChatComponent = initChatComponent
//   window.ModelStorageInterface = ModelStorageInterface
// }

export { initChatComponent, ModelStorageInterface }
