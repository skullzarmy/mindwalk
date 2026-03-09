const MAX_SANITIZED_LENGTH = 5000;
const TRUNCATION_SUFFIX = '... [truncated]';

/**
 * Sanitizes a single message string before it is forwarded to the AI provider.
 *
 * Steps:
 *  1. Remove angle brackets to eliminate all HTML / XML markup.
 *     Stripping '<' and '>' entirely is the most robust way to prevent tag
 *     injection; the content is sent to an AI API, not rendered in a browser,
 *     so angle brackets carry no meaningful semantic value for end users.
 *  2. Remove ASCII control characters except newline (0x0A) and tab (0x09).
 *  3. Normalise runs of spaces/tabs to a single space and trim leading/trailing
 *     whitespace. Newlines are preserved so multi-line messages remain readable.
 *  4. Truncate to MAX_SANITIZED_LENGTH characters.
 *
 * @param {string} content - Raw message content from the client.
 * @returns {string} Sanitized content safe to forward to the AI provider.
 */
export function sanitizeMessage(content) {
  if (typeof content !== 'string') return '';

  // 1. Strip angle brackets to remove all HTML / XML markup entirely.
  //    This prevents tag injection without fragile regex-based tag parsing.
  let clean = content.replace(/[<>]/g, '');

  // 2. Remove control characters except \t (0x09) and \n (0x0A)
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Normalise whitespace
  clean = clean.replace(/[ \t]+/g, ' ').trim();

  // 4. Hard-cap length; append truncation marker so callers know.
  //    Subtract suffix length so the final string does not exceed the cap.
  if (clean.length > MAX_SANITIZED_LENGTH) {
    clean = clean.substring(0, MAX_SANITIZED_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
  }

  return clean;
}
