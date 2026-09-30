const key = 'intrilex:board-presentation';
let override = null;

export function getBoardPresentation() {
  if (override) return override;
  try {
    return globalThis.localStorage?.getItem(key) === 'tactical' ? 'tactical' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setBoardPresentation(value) {
  if (value !== 'tactical' && value !== 'classic') return false;
  override = value;
  try { globalThis.localStorage?.setItem(key, value); } catch {}
  return true;
}
