// Initialize templates object in window if it doesn't exist
if (typeof window !== 'undefined' && !window.attachmentTemplates) {
  window.attachmentTemplates = '__PRELOADED_TEMPLATES__' in window ? { ...__PRELOADED_TEMPLATES__ } : {}
    // Initialize with preloaded templates from Vite build
}

// Map of attachment types to their default templates
const defaultAttachmentTemplates = {
    code: '```{{language}}\n{{data}}\n```',
    chart: '![{{title}}]({{data}})',
    table: '{{data}}',
};

// Get template from window object or fallback to default
const getTemplate = (type) => {
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
    return { role: message.role, content: message.content };
  }

  const formattedAttachments = message.attachments
    .map(formatAttachment)
    .filter(content => !!content);

  return {
    role: message.role,
    content: [message.content, ...formattedAttachments].join('\n\n')
  };
};
