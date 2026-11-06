import React from 'react'
import ReactDOM from 'react-dom/client'
import Chat from './Chat'
import { LocalStorageProvider, ModelStorageInterface } from './storage/modelStorage'
import {
  ConversationStorageInterface,
  LocalStorageConversationProvider,
} from './storage/conversationStorage'
import {
  PromptStorageInterface,
  LocalStoragePromptProvider,
} from './storage/promptStorage'
import {providerStreaming} from "./utils/streamingHandlers/providerStreaming.js";
import {
  executeRegisteredToolCall,
  getRegisteredModelTools,
  registerModelTool
} from "./utils/streamingHandlers/tooling.js";

// Store the root instance
let root = null;
// Props of the last render, so updateChatOptions can re-render the same tree
// with only `options` changed. React keeps Chat's state (messages, open
// conversation, input) because the component type and position don't change.
let chatProps = null;

const renderChat = () => {
  root.render(
    <React.StrictMode>
      <Chat {...chatProps} />
    </React.StrictMode>
  );
}

// Merge a partial options object into the mounted chat's options and
// re-render. Use it for settings the host lets users change at runtime, e.g.
// updateChatOptions({showToolCalls: false}). Returns the merged options, or
// null if the chat has not been initialized yet.
function updateChatOptions(patch = {}) {
  if (!root || !chatProps) return null
  chatProps = {...chatProps, options: {...chatProps.options, ...patch}}
  renderChat()
  return chatProps.options
}

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
//   options               - optional UI settings. `addModelsAllowed` defaults
//                           to true and controls credential/model mutations.
//                           `showCredentialLabel` (default true) shows the credential name
//                           under the model name in the header. `titleMaxChars` (default 20)
//                           caps the conversation title shown in the header.
//                           `showToolCalls` (default true) shows tool call steps
//                           in the conversation; change it at runtime with
//                           updateChatOptions().
//   messageStreamingHandler - optional custom handler. It receives a resolved
//                           runtime model with legacy endpoint/apiKey fields
//                           where applicable plus its `credential` metadata.
//   tier1PromptStorage    - optional PromptStorageInterface implementation for
//                           conversation-level "guidance" playbooks. Omit to
//                           disable the feature entirely (its header button
//                           is hidden, same spirit as omitting conversationStorage).
//   tier2PromptStorage    - optional PromptStorageInterface implementation for
//                           message-level "quick prompts". Independent of
//                           tier1PromptStorage -- a host can offer either, both,
//                           or neither.
function initChatComponent(
  containerId,
  modelStorage,
  conversationStorage,
  onConversationError,
  options={addModelsAllowed: true},
  messageStreamingHandler = providerStreaming,
  tier1PromptStorage,
  tier2PromptStorage,
) {
  console.log(`Chat Component v${__CHAT_VERSION__}`);
  const container = document.getElementById(containerId)
  if (container) {
    if (!root) {
      root = ReactDOM.createRoot(container);
    }
    chatProps = {
      modelStorage: modelStorage || new LocalStorageProvider(),
      conversationStorage,
      onConversationError,
      options,
      messageStreamingHandler,
      tier1PromptStorage,
      tier2PromptStorage,
    }
    renderChat()
  }
  return {getRegisteredModelTools, executeRegisteredToolCall, registerModelTool, updateChatOptions}
}

// Development mode: opt in to the bundled localStorage conversation provider
// so the full conversation manager UI is exercised while developing.
// if (import.meta.env.DEV) {
//   initChatComponent('chat-container', new LocalStorageProvider(), new LocalStorageConversationProvider())
// }

export {
  initChatComponent,
  updateChatOptions,
  ModelStorageInterface,
  LocalStorageProvider,
  ConversationStorageInterface,
  LocalStorageConversationProvider,
  PromptStorageInterface,
  LocalStoragePromptProvider,
}
