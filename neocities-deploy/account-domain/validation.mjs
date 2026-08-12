// ═══════════════════════════════════════════════════════════════
// validation.mjs — Handle and display name validation
//
// Handle: globally unique, normalized, URL-safe, case-insensitive.
// Display name: user-editable, non-unique, friendly, sanitized.
// ═══════════════════════════════════════════════════════════════

const HANDLE_MIN_LENGTH = 3;
const HANDLE_MAX_LENGTH = 24;
const HANDLE_PATTERN = /^[a-zA-Z0-9_]+$/;

// Reserved names — cannot be claimed as handles.
// Normalized to lowercase for comparison.
const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'intrilex', 'moderator', 'mod',
  'system', 'support', 'null', 'anonymous', 'guest', 'official',
  'dev', 'developer', 'staff', 'team', 'help', 'api', 'root',
  'superuser', 'operator', 'security', 'abuse', 'contact',
]);

/**
 * Validate a handle against deterministic constraints.
 *
 * Rules:
 *   - 3–24 characters
 *   - letters, numbers, underscore only
 *   - not a reserved name
 *   - case-insensitive uniqueness (enforced at DB level)
 *
 * @param {string} handle - The handle to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateHandle(handle) {
  if (typeof handle !== 'string') {
    return { valid: false, error: 'Handle must be a string' };
  }
  if (handle.length < HANDLE_MIN_LENGTH) {
    return { valid: false, error: `Handle must be at least ${HANDLE_MIN_LENGTH} characters` };
  }
  if (handle.length > HANDLE_MAX_LENGTH) {
    return { valid: false, error: `Handle must be at most ${HANDLE_MAX_LENGTH} characters` };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return { valid: false, error: 'Handle may contain only letters, numbers, and underscore' };
  }
  if (RESERVED_HANDLES.has(handle.toLowerCase())) {
    return { valid: false, error: 'This handle is reserved' };
  }
  return { valid: true };
}

/**
 * Normalize a handle for case-insensitive comparison.
 * @param {string} handle
 * @returns {string}
 */
export function normalizeHandle(handle) {
  return typeof handle === 'string' ? handle.toLowerCase() : '';
}

/**
 * Check if a handle is reserved (case-insensitive).
 * @param {string} handle
 * @returns {boolean}
 */
export function isReservedHandle(handle) {
  return RESERVED_HANDLES.has(normalizeHandle(handle));
}

// ── Display name validation ──

const DISPLAY_NAME_MIN_LENGTH = 1;
const DISPLAY_NAME_MAX_LENGTH = 32;

/**
 * Sanitize a display name.
 * - Trims whitespace
 * - Collapses internal whitespace to single spaces
 * - Strips control characters
 * - Enforces length constraints
 *
 * @param {string} name - The raw display name
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
export function sanitizeDisplayName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Display name must be a string' };
  }
  // Strip control characters (except tab/newline which we handle next)
  // Using char code filter to avoid no-control-regex lint rule
  let sanitized = Array.from(name).filter(ch => {
    const code = ch.charCodeAt(0);
    return !(code >= 0 && code <= 8) && code !== 11 && code !== 12 && !(code >= 14 && code <= 31) && code !== 127;
  }).join('');
  // Collapse whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (sanitized.length < DISPLAY_NAME_MIN_LENGTH) {
    return { valid: false, error: 'Display name cannot be empty' };
  }
  if (sanitized.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, error: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters` };
  }
  return { valid: true, sanitized };
}

/**
 * Generate a safe default display name from provider metadata.
 * Falls back to 'Player' if no usable metadata.
 * @param {string|null} [discordUsername]
 * @param {string|null} [email]
 * @returns {string}
 */
export function defaultDisplayName(discordUsername = null, email = null) {
  if (discordUsername && typeof discordUsername === 'string') {
    const result = sanitizeDisplayName(discordUsername);
    if (result.valid) return result.sanitized;
  }
  if (email && typeof email === 'string') {
    const localPart = email.split('@')[0];
    if (localPart) {
      const result = sanitizeDisplayName(localPart);
      if (result.valid) return result.sanitized;
    }
  }
  return 'Player';
}

// ── Avatar URL sanitization ──

/**
 * Sanitize an avatar URL — restrict to https only.
 * Rejects javascript:, data:text/html, and other unsafe schemes.
 * @param {string|null} url
 * @returns {string|null}
 */
export function sanitizeAvatarUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (url.length > 2048) return null;
  // Only allow https: URLs
  if (url.startsWith('https://')) return url;
  // Reject everything else (javascript:, data:, http:, etc.)
  return null;
}
