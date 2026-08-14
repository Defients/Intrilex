// ═══════════════════════════════════════════════════════════════
// chat-panel.js — T1: Chat panel extracted from ranked-duel-renderer.mjs
//
// Renders the in-match chat panel for both local AI and network matches.
// Extracted for modularity — the renderer delegates to this module
// for all chat-related rendering.
//
// The chat panel supports:
//   - Network match chat (player vs player)
//   - Local AI match chat (player vs AI commentary)
//   - System messages
//   - Hide/show toggle for network matches
//   - Emote button
//   - Message deduplication by messageId
// ═══════════════════════════════════════════════════════════════

/**
 * Escape HTML to prevent XSS in chat messages.
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the match chat panel.
 * @param {object} vm - The view model
 * @param {object} opts - Render options (chatHidden, chatMessages, etc.)
 * @param {boolean} isReadOnly - Whether the chat is read-only (spectator)
 * @param {Array} chatMessages - Array of chat message objects
 * @returns {string} HTML string
 */
export function renderChatPanel(vm, opts, isReadOnly, chatMessages) {
  const modeLabel = vm.mode?.label ?? 'LOCAL VS AI';
  const isNetwork = vm.mode?.isNetwork === true;
  const chatHidden = opts.chatHidden === true;

  // Determine authorship from participantId, NOT from isHuman boolean.
  const localParticipantId = vm.human?.playerId;
  const opponentParticipantId = vm.opponent?.playerId;

  const messages = (chatMessages || []).map(m => {
    let cls, author;
    if (m.isSystem) {
      cls = 'rd-chat-msg system';
      author = 'System';
    } else if (isNetwork && m.participantId) {
      const isLocal = m.isHuman === true;
      cls = isLocal ? 'rd-chat-msg human' : 'rd-chat-msg opponent';
      author = isLocal ? (vm.human?.displayName ?? 'You') : (vm.opponent?.displayName ?? 'Opponent');
    } else {
      cls = m.isHuman ? 'rd-chat-msg human' : 'rd-chat-msg ai';
      author = m.isHuman ? (vm.human?.displayName ?? 'You') : (vm.opponent?.displayName ?? 'AI');
    }
    return `<div class="${cls}" data-message-id="${esc(m.messageId ?? '')}">
      <div class="rd-chat-author">${esc(author)}</div>
      <div class="rd-chat-text">${esc(m.text)}</div>
    </div>`;
  }).join('');

  const inputHtml = isReadOnly ? '' : `<form class="rd-chat-input" data-testid="match-chat-form">
    <input type="text" placeholder="Message..." data-chat-input maxlength="200" aria-label="Chat message" data-testid="match-chat-input">
    <button type="button" class="rd-chat-emote-btn" data-action="chat-emote" aria-label="Emotes" data-testid="chat-emote-btn" title="Emotes">\u263A</button>
    <button type="submit" data-action="chat-send" aria-label="Send">\u27A4</button>
  </form>`;

  const hasMessages = (chatMessages || []).length > 0;
  const hideToggleHtml = isNetwork ? `<button class="rd-chat-toggle-btn" data-action="${chatHidden ? 'chat-show' : 'chat-hide'}" data-testid="chat-toggle-btn" title="${chatHidden ? 'Show Match Chat' : 'Hide Match Chat'}" aria-label="${chatHidden ? 'Show Match Chat' : 'Hide Match Chat'}">${chatHidden ? '\u25B6' : '\u25BC'}</button>` : '';

  if (chatHidden) {
    return `<div class="rd-chat-panel rd-chat-hidden" data-chat-empty="${!hasMessages}" data-testid="match-chat-panel">
      <div class="rd-chat-header">
        <span class="rd-chat-title">MATCH CHAT</span>
        <span class="rd-chat-mode">HIDDEN</span>
        ${hideToggleHtml}
      </div>
    </div>`;
  }

  return `<div class="rd-chat-panel" data-chat-empty="${!hasMessages}" data-testid="match-chat-panel">
    <div class="rd-chat-header">
      <span class="rd-chat-title">MATCH CHAT</span>
      <span class="rd-chat-mode">${esc(modeLabel)} \u00b7 LIVE</span>
      ${hideToggleHtml}
    </div>
    <div class="rd-chat-messages" data-testid="match-chat-messages" role="log" aria-live="polite" aria-atomic="false">
      ${messages || '<div class="rd-chat-empty">No messages yet</div>'}
    </div>
    ${inputHtml}
  </div>`;
}
