// ═══════════════════════════════════════════════════════════════
// fc-telemetry.mjs — First Contact onboarding telemetry
//
// A deliberately small, privacy-safe event log stored in localStorage
// under `intrilex:fc-telemetry`. It records *what happened* (lesson
// reached, coach tool used, rejection reason code, guidance-off)
// — never card contents beyond what the engine itself broadcasts, and
// never personal data. The product questions it answers:
//
//   - Where do new players get confused?     (coach-used, rejections)
//   - Where do they leave?                   (abandoned at lesson)
//   - Which explanations get reopened?       (repeated coach-used)
//   - Does guidance actually let go?         (guidance-off reached)
//
// In Node tests there is no localStorage — the module degrades to an
// in-memory buffer so behaviour stays observable and testable.
// ═══════════════════════════════════════════════════════════════

export const FC_TELEMETRY_KEY = 'intrilex:fc-telemetry';
export const FC_TELEMETRY_SCHEMA = '1.0.0';
const MAX_EVENTS = 500;

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readAll(store) {
  if (!store) return [];
  try {
    const raw = store.getItem(FC_TELEMETRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append a First Contact telemetry event.
 * @param {string} kind — e.g. 'match-started', 'lesson-entered',
 *   'lesson-completed', 'coach-used', 'action-rejected',
 *   'guidance-off', 'abandoned', 'completed'
 * @param {object} [data] — small JSON-safe detail payload
 */
export function recordFcEvent(kind, data = {}) {
  const store = storage();
  const entry = {
    schemaVersion: FC_TELEMETRY_SCHEMA,
    kind,
    at: Date.now(),
    ...data,
  };
  if (!store) {
    _memory.push(entry);
    if (_memory.length > MAX_EVENTS) _memory.splice(0, _memory.length - MAX_EVENTS);
    return entry;
  }
  try {
    const events = readAll(store);
    events.push(entry);
    while (events.length > MAX_EVENTS) events.shift();
    store.setItem(FC_TELEMETRY_KEY, JSON.stringify(events));
  } catch {
    // Telemetry must never break gameplay.
  }
  return entry;
}

/** Read the recorded event log (tests, diagnostics). */
export function readFcEvents() {
  const store = storage();
  return store ? readAll(store) : [..._memory];
}

/** Clear the log (tests, "reset onboarding data" UIs). */
export function clearFcEvents() {
  _memory.length = 0;
  try { storage()?.removeItem(FC_TELEMETRY_KEY); } catch { /* non-fatal */ }
}

const _memory = [];
