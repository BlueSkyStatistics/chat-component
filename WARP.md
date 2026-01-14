# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

A React-based chat component library designed for Electron applications. It provides a full-featured chat interface with support for markdown rendering, code syntax highlighting, and attachments (code snippets, charts, tables). The component is built as a UMD library that can be integrated into Electron apps with custom storage providers.

## Development Commands

### Basic Development
```bash
# Install dependencies
npm install

# Start development server (runs on port 5173)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Build with watch mode (auto-rebuild on changes)
npm run watch

# Preview production build
npm run preview
```

### Build Output
- The build produces UMD format files in `dist/`:
  - `chat-component.umd.cjs` - Main JavaScript bundle
  - `chat.css` - Styles

### Release Process
- The project uses GitHub Actions for automated releases
- On push to main, it builds and creates a release with:
  - `chat-component.zip` - Archive of dist files
  - `chat-component.asar` - Electron-ready ASAR package
- Version is auto-incremented (patch) on each release
- Manual releases can be triggered via workflow_dispatch

## Architecture

### Component Structure

The application follows a clean component hierarchy:

```
main.jsx (Entry point)
  └── Chat.jsx (Main chat component)
      ├── Settings.jsx (Model configuration UI)
      └── attachmentFormatters.js (Template processing)
```

**Key architectural points:**

1. **Entry Point (`main.jsx`)**: Provides `initChatComponent()` function for integration. In development mode, auto-initializes with LocalStorage provider. In production, exposes initialization to consuming applications.

2. **Chat Component (`Chat.jsx`)**: Core component managing:
   - Message history with role-based rendering (user/assistant/error)
   - Streaming response handling with abort capability
   - Model selection and switching
   - Attachment lifecycle (pending → attached to message)
   - Auto-scroll with user scroll detection

3. **Settings Component (`Settings.jsx`)**: Manages AI model configurations (name, endpoint, API key).

4. **Attachment System (`attachmentFormatters.js`)**: Template-based formatting system that converts structured attachment objects into markdown for the AI model.

### Storage Interface Pattern

The codebase uses a **storage interface pattern** to allow different storage backends:

```javascript
ModelStorageInterface (abstract)
  └── LocalStorageProvider (browser implementation)
```

**Integration pattern:**
- Custom storage providers must implement `ModelStorageInterface`
- Methods: `getModels()`, `saveModels()`, `getSelectedModel()`, `saveSelectedModel()`
- Pass storage provider to `initChatComponent(containerId, modelStorage)`
- This enables Electron apps to use their own storage (e.g., electron-store)

### Template System

**Two-tier template mechanism:**

1. **Build-time templates**: Files in `attachmentTemplates/` are preloaded during Vite build via `__PRELOADED_TEMPLATES__` global
2. **Runtime templates**: Can be overridden via `window.attachmentTemplates` object

**Template types:**
- `code.template` - Format code attachments (default: markdown code blocks)
- `chart.template` - Format chart images (default: markdown images)
- `table.template` - Format tables (default: raw HTML)

**Template syntax:**
- Uses `{{variable}}` placeholders
- Variables: `{{data}}`, `{{language}}`, `{{title}}`, plus any metadata fields

**How it works:**
1. Templates loaded at build time from `attachmentTemplates/` directory
2. When attachment added, `formatAttachment()` applies template substitution
3. Before sending to AI, `formatMessage()` converts all attachments to text and appends to message content
4. This gives AI context about code/charts/tables in a readable format

### Electron Integration

**Communication flow:**
1. Electron main process → preload script → renderer process
2. Preload script should expose `window.electronApi.sendOutputToChat(element)`
3. Chat component listens for `outputElement` window events
4. Elements become pending attachments, shown above input field
5. On message send, attachments join the message and are formatted for AI context

**OutputElement structure:**
```javascript
{
  id?: string | number, // Optional unique ID for duplicate detection
  type: 'code' | 'chart' | 'table',
  data: string,  // Code text, image data URL, or HTML table
  metadata: {
    language?: string,  // For code
    title?: string,     // Item title (displayed on card)
    href?: string,      // Optional link URL (makes title clickable)
    // ... custom fields
  },
  output: {             // Optional grouping information
    id: string,         // Unique identifier for this output group
    title: string       // Display title for the group
  }
}
```

**Duplicate detection:**
- If an element includes an `id` field, the component checks if an attachment with that ID already exists
- If the ID exists, the new element is skipped (prevents duplicates)
- If no `id` is provided, a unique ID is auto-generated and the element is always added
- This allows Electron apps to safely re-send outputs without creating duplicates

**Grouping behavior:**
- Attachments with the same `output.id` are grouped together in a collapsible accordion
- Each group displays as a Bootstrap card with the `output.title` as the header
- Items within a group show as individual cards with titles from `metadata.title` or `type`
- If `metadata.href` is provided, the item title becomes a clickable link
- Both individual items and entire groups can be removed with delete buttons
- Attachments without an `output` object are grouped under "Ungrouped Items"

### Message Flow

1. **User input** → Creates message with `role: 'user'` and any `pendingAttachments`
2. **Format for API**: `formatMessage()` converts attachments to text using templates
3. **Streaming response**: Empty assistant message created, content streams in
4. **Display**: ReactMarkdown renders with syntax highlighting for code blocks

### State Management

Uses React hooks exclusively (no Redux/Context):
- `messages` - Full chat history
- `selectedModel` - Current AI model configuration
- `pendingAttachments` - Attachments waiting to be sent
- `isStreaming` - Controls UI during streaming responses
- `shouldAutoScroll` - Tracks if user wants auto-scroll during streaming

## Key Integration Points

### For Electron Apps

When integrating into an Electron app:

1. **Storage Provider**: Create custom implementation of `ModelStorageInterface` for Electron's storage system
2. **Preload Script**: Expose `sendOutputToChat` via contextBridge for security
3. **Initialization**: Call `initChatComponent('container-id', customStorageProvider)`
4. **Templates**: Optionally provide custom templates by setting `window.attachmentTemplates`

### Adding Output from Electron

```javascript
// In renderer process - single ungrouped attachment
window.electronApi.sendOutputToChat({
  type: 'code',
  data: '# Python code here',
  metadata: { 
    language: 'python',
    title: 'Data Analysis Script'
  }
});

// Grouped attachments from same output with duplicate prevention
const outputId = 'analysis-2024-01-01';
const outputTitle = 'Analysis Results';

window.electronApi.sendOutputToChat({
  id: 'cell-1-output',  // Unique ID prevents duplicates
  type: 'code',
  data: 'import pandas as pd\n...',
  metadata: { 
    language: 'python',
    title: 'Data Processing',
    href: '#cell-1'  // Makes title clickable
  },
  output: { id: outputId, title: outputTitle }
});

window.electronApi.sendOutputToChat({
  id: 'cell-2-output',  // Different ID for second item
  type: 'chart',
  data: 'data:image/png;base64,...',
  metadata: { 
    title: 'Revenue Chart',
    href: '#cell-2'
  },
  output: { id: outputId, title: outputTitle }
});

// Re-sending with same ID won't create duplicate
window.electronApi.sendOutputToChat({
  id: 'cell-1-output',  // Same ID - will be skipped
  type: 'code',
  data: 'import pandas as pd\n...',
  metadata: { language: 'python', title: 'Data Processing' },
  output: { id: outputId, title: outputTitle }
});
```

This adds the output to pending attachments. Grouped items appear together in a collapsible group. Users can remove individual items or entire groups, then send with their message.

## Styling

- `Chat.css` - Main chat component styles
- `Settings.css` - Settings panel styles
- Uses CSS custom properties for theming
- Code highlighting via `react-syntax-highlighter` with vscDarkPlus theme

## Dependencies

**Runtime:**
- React 18.3.1 & ReactDOM
- react-markdown (with remark-gfm for GitHub Flavored Markdown)
- react-syntax-highlighter (code highlighting)

**External (Provided by Host App):**
- **Bootstrap 5**: CSS and JS (window.bootstrap must be available globally)
- **FontAwesome 5**: CSS classes for icons

**Build:**
- Vite 7.x (bundler)
- @vitejs/plugin-react (React support & Fast Refresh)

## Important Notes

- **No test suite**: Project currently has no automated tests
- **UMD build**: Externalizes React/ReactDOM, Bootstrap, and FontAwesome (host app must provide)
- **Development mode**: 
  - Auto-creates mock `window.electronApi` for browser testing
  - Automatically loads Bootstrap 5 and FontAwesome 5 from node_modules
  - In production, host app must provide these libraries globally
- **CORS enabled**: Development server allows cross-origin requests
- **Port**: Development server runs on 5173
- **External dependencies**: The component expects Bootstrap 5 CSS/JS and FontAwesome 5 CSS to be available. In development, these are loaded automatically from `index.html`. In production (Electron app), the host application must include these libraries.
