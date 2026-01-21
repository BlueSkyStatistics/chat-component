// Initialize templates object in window if it doesn't exist
if (typeof window !== 'undefined' && !window.attachmentTemplates) {
    window.attachmentTemplates = '__PRELOADED_TEMPLATES__' in window ? {...__PRELOADED_TEMPLATES__} : {}
    // Initialize with preloaded templates from Vite build
}

// Map of attachment types to their default templates
const defaultAttachmentTemplates = {
    code: '```{{language}}\n{{data}}\n```',
    // chart: '![{{title}}]({{data}})',
    table: '{{data}}',
};

// Get template from window object or fallback to default
const getTemplate = (type) => {
    if (type === 'chart') {
        // Charts are handled as images, no template needed
        return null;
    }
    if (typeof window !== 'undefined' && window.attachmentTemplates[type]) {
        return typeof window.attachmentTemplates[type] === 'function' ?
            window.attachmentTemplates[type]() :
            window.attachmentTemplates[type]
    }
    return defaultAttachmentTemplates[type] || null;
};

// Allow runtime updates to templates
export const setTemplate = (type, template) => {
    if (typeof window !== 'undefined') {
        window.attachmentTemplates = window.attachmentTemplates || {};
        window.attachmentTemplates[type] = template;
    }
};

const applyTemplate = (template, data, metadata = {}) => {
    let result = template;
    // Replace metadata placeholders
    for (const [key, value] of Object.entries(metadata)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    // Replace data placeholder
    result = result.replace(/{{data}}/g, data);
    return result;
};

/**
 * Format a single attachment based on its type
 * @param {Object} attachment - The attachment object to format
 * @param {string} attachment.type - The type of attachment ('code', 'chart', 'table')
 * @param {string} attachment.data - The attachment data
 * @param {Object} attachment.metadata - Additional metadata for the attachment
 * @returns {string} Formatted attachment string
 */
export const formatAttachment = (attachment) => {
    const template = getTemplate(attachment.type);
    console.log('Formatting attachment:', attachment, 'Using template:', template);
    return template ? applyTemplate(template, attachment.data, attachment.metadata) : attachment.data;
};

/**
 * Format a message with its attachments
 * @param {Object} message - The message object to format
 * @param {string} message.role - The role of the message sender
 * @param {string} message.content - The message content
 * @param {Array} message.attachments - Array of attachment objects
 * @returns {Object} Formatted message with attachments integrated into content
 */
export const formatMessage = (message) => {
    if (!message.attachments || message.attachments.length === 0) {
        return {role: message.role, content: message.content};
    }

    // Check if any attachments are charts (images)
    const hasCharts = message.attachments.some(att => att.type === 'chart');

    if (hasCharts) {
        // Use OpenAI Vision API format with content array
        const contentArray = [];

        // Add text content first
        if (message.content.trim()) {
            contentArray.push({
                type: 'text',
                text: message.content
            });
        }

        // Add each attachment
        message.attachments.forEach(attachment => {
            if (attachment.type === 'chart') {
                // Image attachment - use image_url format
                contentArray.push({
                    type: 'image_url',
                    image_url: {
                        url: attachment.data
                    }
                });
            } else {
                // Non-image attachment (code, table) - format as text
                const formatted = formatAttachment(attachment);
                if (formatted) {
                    contentArray.push({
                        type: 'text',
                        text: formatted
                    });
                }
            }
        });

        return {
            role: message.role,
            content: contentArray
        };
    } else {
        // No images - use simple string format for backwards compatibility
        const formattedAttachments = message.attachments
            .map(formatAttachment)
            .filter(content => !!content);

        return {
            role: message.role,
            content: [message.content, ...formattedAttachments].join('\n\n')
        };
    }
};
