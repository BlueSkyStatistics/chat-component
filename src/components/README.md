# Chat Component Architecture

This directory contains the refactored chat component structure, split into smaller, maintainable pieces.

## Component Hierarchy

```
Chat.jsx (Main container)
├── Message.jsx (Individual message display)
│   └── MessageAttachments.jsx (Message attachment section)
│       └── AttachmentItem.jsx (Single attachment with view/hide)
│           └── AttachmentContent.jsx (Renders code/chart/table)
│
└── PendingAttachments.jsx (Pending attachments accordion)
    └── PendingAttachmentItem.jsx (Single pending attachment)
        └── AttachmentContent.jsx (Shared content renderer)
```

## Components

### AttachmentContent.jsx
**Purpose**: Renders the actual content of an attachment (code, chart, or table).

**Props**:
- `attachment` - The attachment object containing type, data, and metadata
- `onCopy` - Function to copy text to clipboard

**Features**:
- Code blocks with syntax highlighting
- Chart image display
- HTML table rendering
- Copy button for code

---

### AttachmentItem.jsx
**Purpose**: Displays a single attachment in a message with title and view/hide toggle.

**Props**:
- `attachment` - The attachment object
- `isExpanded` - Whether the content is currently visible
- `onToggleExpand` - Function to toggle content visibility
- `onCopy` - Function to copy text
- `getIconForType` - Function to get FontAwesome icon for attachment type

**Features**:
- Icon badge showing attachment type
- Clickable title (if href provided)
- Eye/eye-slash icon button to toggle content
- Expandable content area

---

### PendingAttachmentItem.jsx
**Purpose**: Displays a single pending attachment (before message is sent).

**Props**:
- `attachment` - The attachment object
- `isExpanded` - Whether the content is currently visible
- `onToggleExpand` - Function to toggle content visibility
- `onRemove` - Function to remove this attachment
- `onCopy` - Function to copy text
- `getIconForType` - Function to get icon for attachment type

**Features**:
- Compact card layout for pending state
- View/hide icon button
- Remove button (X icon)
- Max-height with scroll for large content

---

### MessageAttachments.jsx
**Purpose**: Container for all attachments in a message with toggle to show/hide the list.

**Props**:
- `attachments` - Array of attachment objects
- `showAttachments` - Whether attachments are currently shown
- `expandedAttachments` - Set of expanded attachment IDs
- `onToggleShow` - Function to toggle attachment list visibility
- `onToggleExpand` - Function to toggle individual attachment content
- `onCopy` - Function to copy text
- `getIconForType` - Function to get icon for type

**Features**:
- Collapsible attachment list
- Shows count of attachments
- Manages list of AttachmentItem components

---

### PendingAttachments.jsx
**Purpose**: Displays all pending attachments in an accordion grouped by output.

**Props**:
- `attachments` - Array of pending attachment objects
- `expandedAttachments` - Set of expanded attachment IDs
- `onToggleExpand` - Function to toggle content visibility
- `onRemoveAttachment` - Function to remove single attachment
- `onRemoveGroup` - Function to remove entire group
- `onCopy` - Function to copy text
- `getIconForType` - Function to get icon for type

**Features**:
- Horizontal accordion layout
- Groups attachments by `output.id`
- Shows badge with item count per group
- Delete button for entire groups
- Bootstrap tooltips for group titles
- Manages bootstrap tooltip lifecycle

---

### Message.jsx
**Purpose**: Renders a complete chat message with all features (content, actions, attachments).

**Props**:
- `message` - The message object (content, role, attachments, etc.)
- `expandedAttachments` - Set of expanded attachment IDs
- `onCopy` - Function to copy text
- `onDelete` - Function to delete this message
- `onToggleView` - Function to toggle raw/formatted view
- `onToggleAttachments` - Function to toggle attachment list visibility
- `onToggleAttachmentExpand` - Function to toggle individual attachment content
- `getIconForType` - Function to get icon for type

**Features**:
- Message actions (copy, raw view, delete)
- Markdown rendering with code highlighting
- Attachment management via MessageAttachments component
- Role-based styling (user/assistant/error)

---

## Benefits of This Structure

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Reusability**: Components like `AttachmentContent` are shared across message and pending attachments
3. **Maintainability**: Easier to find and fix bugs in specific features
4. **Testability**: Smaller components are easier to unit test
5. **Scalability**: New features can be added without modifying core components
6. **Code Organization**: Related code is grouped together

## Adding New Features

### Adding a new attachment type
1. Update `AttachmentContent.jsx` with new rendering logic
2. Add icon mapping in `Chat.jsx` `getIconForType()` function

### Adding new message actions
1. Add button to `Message.jsx` action buttons section
2. Pass handler function from `Chat.jsx`

### Customizing attachment display
1. Modify `AttachmentItem.jsx` or `PendingAttachmentItem.jsx` for layout changes
2. Update CSS in `Chat.css` for styling

## State Management

State is managed in the main `Chat.jsx` component and passed down as props:
- `messages` - Array of all messages
- `pendingAttachments` - Array of attachments waiting to be sent
- `expandedAttachments` - Set tracking which attachments show content
- Event handlers for all user interactions

This follows React's unidirectional data flow pattern.
