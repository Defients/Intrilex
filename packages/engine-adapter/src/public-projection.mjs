import { sha256Text } from '@intrilex/shared';

const sensitiveKey = (key) => {
  const normalized = String(key).replaceAll('-', '').replaceAll('_', '').toLowerCase();
  if (normalized.includes('rng') || normalized.includes('seed')) return true;
  return new Set([
    'integrityhash', 'initialstatehash', 'finalstatehash', 'authoritativestatehash',
    'authorizedstatehash', 'eventloghash', 'checkpointloghash', 'rngtracehash'
  ]).has(normalized);
};

export function createReplayScopedPublicProjector(initialState, opaqueSecret) {
  if (!opaqueSecret || typeof opaqueSecret !== 'string') throw new Error('PUBLIC_PROJECTION_SECRET_REQUIRED');
  const cardIds = Object.keys(initialState?.cards ?? {}).sort();
  const handles = new Map(cardIds.map((cardId) => [
    cardId,
    `PUB-${sha256Text(`${opaqueSecret}\u0000${cardId}`).slice(0, 16)}`
  ]));

  const remapString = (value) => {
    if (handles.has(value)) return handles.get(value);
    let output = value;
    for (const [cardId, handle] of handles) {
      if (output.includes(cardId)) output = output.replaceAll(cardId, handle);
    }
    return output;
  };

  const project = (value) => {
    if (typeof value === 'string') return remapString(value);
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (sensitiveKey(key)) continue;
      output[handles.get(key) ?? key] = project(entry);
    }
    return output;
  };

  return {
    project,
    handleCount: handles.size,
    handles: Object.freeze(Object.fromEntries(handles))
  };
}
