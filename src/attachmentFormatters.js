// Format code attachments into markdown code blocks
export const formatCodeAttachment = (attachment) => {
  return `\`\`\`${attachment.metadata.language || ''}\n${attachment.data}\n\`\`\``;
};

// Format chart attachments into markdown images
export const formatChartAttachment = (attachment) => {
  return `![${attachment.metadata.title || 'Chart'}](${attachment.data})`;
};

// Format table attachments (keeping HTML structure)
export const formatTableAttachment = (attachment) => {
  return attachment.data;
};

// Map of attachment types to their formatters
const attachmentFormatters = {
  code: formatCodeAttachment,
  chart: formatChartAttachment,
  table: formatTableAttachment,
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
  const formatter = attachmentFormatters[attachment.type];
  return formatter ? formatter(attachment) : '';
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
    .filter(content => content !== '');

  return {
    role: message.role,
    content: [message.content, ...formattedAttachments].join('\n\n')
  };
};
