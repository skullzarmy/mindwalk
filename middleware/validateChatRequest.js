import { sanitizeMessage } from '../utils/sanitize.js';

const VALID_ROLES = ['system', 'user', 'assistant'];
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 10000;
// Rough token estimate: ~4 chars per token; leave headroom for the response
const MAX_INPUT_TOKENS = 3500;
const CHARS_PER_TOKEN = 4;

/**
 * Express middleware that validates and sanitizes the /api/chat request body.
 *
 * Checks performed (Phase 1):
 *  - messages must be a non-empty array
 *  - at most MAX_MESSAGES entries
 *  - each entry must have a valid role ('system' | 'user' | 'assistant')
 *  - each entry's content must be a non-empty string ≤ MAX_CONTENT_LENGTH chars
 *
 * Sanitization (Phase 2):
 *  - HTML / script tags stripped
 *  - control characters removed
 *  - whitespace normalised
 *  - content capped at 5 000 chars after sanitisation
 *
 * Token budget (Phase 3):
 *  - Rough token estimate rejects requests that would exceed MAX_INPUT_TOKENS
 */
export function validateChatRequest(req, res, next) {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: 'Invalid request',
      details: 'messages must be an array',
    });
  }

  if (messages.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      details: 'messages array cannot be empty',
    });
  }

  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({
      error: 'Too many messages',
      details: `Maximum ${MAX_MESSAGES} messages per request`,
    });
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg || typeof msg !== 'object') {
      return res.status(400).json({
        error: `Invalid message at index ${i}`,
        details: 'Each message must be an object with role and content',
      });
    }

    if (!msg.role || !VALID_ROLES.includes(msg.role)) {
      return res.status(400).json({
        error: `Invalid role at index ${i}`,
        details: `role must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    if (typeof msg.content !== 'string' || msg.content.length === 0) {
      return res.status(400).json({
        error: `Invalid content at index ${i}`,
        details: 'content must be a non-empty string',
      });
    }

    if (msg.content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({
        error: `Message ${i} too long`,
        details: `Maximum ${MAX_CONTENT_LENGTH} characters per message`,
      });
    }

    // Phase 2 – sanitize in place
    msg.content = sanitizeMessage(msg.content);
  }

  // Phase 3 – rough token budget check
  const estimatedTokens = messages.reduce(
    (sum, msg) => sum + Math.ceil(msg.content.length / CHARS_PER_TOKEN) + 4,
    0
  );

  if (estimatedTokens > MAX_INPUT_TOKENS) {
    return res.status(400).json({
      error: 'Input too long',
      details: `Estimated ${estimatedTokens} tokens exceeds the ${MAX_INPUT_TOKENS}-token limit. Try shorter messages or fewer turns.`,
    });
  }

  next();
}
