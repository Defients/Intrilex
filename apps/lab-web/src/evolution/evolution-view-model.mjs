/** UI-only projections. Never write into scientific records or consume RNG. */
export const shortId = (id, length = 17) => id ? String(id).slice(0, length) : 'Unavailable';
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const latestComplete = (project, checkpointId, packId) => project?.evaluations.findLast(e => e.purpose === 'EVALUATION' && e.status === 'COMPLETE' && e.candidateCheckpointId === checkpointId && e.suiteId === project.suite.suiteId && (!packId || e.packId === packId));

export function projectModel(project) {
  if (!project) return { roots: [], heads: [], generations: [], checkpoints: [], coverage: { complete: 0, total: 0 } };
  const byId = new Map(project.checkpoints.map(cp => [cp.checkpointId, cp]));
  const roots = project.experiment.scientific.startingCheckpointIds.map(id => byId.get(id)).filter(Boolean);
  const heads = roots.map(root => {
    const generations = project.generations.filter(g => g.lineageId === root.lineageId);
    const generation = generations.at(-1);
    const checkpoint = byId.get(generation?.selectedCheckpointId) ?? root;
    return { root, checkpoint, generation, generations, evaluation: latestComplete(project, checkpoint.checkpointId) };
  });
  const ids = [...new Set([...roots.map(cp => cp.checkpointId), ...project.generations.map(g => g.selectedCheckpointId)])];
  return { roots, heads, byId, generations: project.generations, checkpoints: project.checkpoints,
    coverage: { total: ids.length, complete: ids.filter(id => latestComplete(project, id)).length } };
}

export function lineageNodes(project, { lineage = 'all', from = 0, to = 100, query = '', findingsOnly = false, faultsOnly = false } = {}) {
  const model = projectModel(project), text = query.trim().toLowerCase();
  return model.heads.flatMap(head => [{ checkpoint: head.root, generation: null }, ...head.generations.map(g => ({ checkpoint: model.byId.get(g.selectedCheckpointId), generation: g }))])
    .filter(n => n.checkpoint).map(node => ({ ...node,
      evaluation: latestComplete(project, node.checkpoint.checkpointId),
      regressions: (project.regressions ?? []).filter(r => r.checkpointId === node.checkpoint.checkpointId),
      faults: project.faults.filter(f => f.checkpointId === node.checkpoint.checkpointId || (f.lineageId === node.checkpoint.lineageId && f.generation === node.checkpoint.generation)) }))
    .filter(n => (lineage === 'all' || n.checkpoint.lineageId === lineage) && n.checkpoint.generation >= from && n.checkpoint.generation <= to && (!findingsOnly || n.regressions.length) && (!faultsOnly || n.faults.length) && (!text || JSON.stringify([n.checkpoint.checkpointId, n.checkpoint.agentId, n.checkpoint.policyId, n.generation?.generationId]).toLowerCase().includes(text)));
}

export function pairFor(project, mode, selectedId) {
  const model = projectModel(project), selected = model.byId?.get(selectedId) ?? model.heads[0]?.checkpoint;
  if (!selected) return [];
  if (mode === 'latest') return model.heads.slice(0, 2).map(h => h.checkpoint.checkpointId);
  if (mode === 'parent') return [selected.parentCheckpointId, selected.checkpointId].filter(Boolean);
  const root = model.roots.find(cp => cp.lineageId === selected.lineageId);
  return root ? [root.checkpointId, selected.checkpointId] : [];
}

export function residualRows(project, checkpoint, features) {
  if (!checkpoint?.policyState?.weights) return [];
  const model = projectModel(project), root = model.roots.find(cp => cp.lineageId === checkpoint.lineageId), parent = model.byId.get(checkpoint.parentCheckpointId);
  return features.map(feature => ({ feature, value: checkpoint.policyState.weights[feature],
    root: root?.policyState?.weights?.[feature] ?? null, parent: parent?.policyState?.weights?.[feature] ?? null,
    rootDelta: root?.policyState?.weights ? checkpoint.policyState.weights[feature] - root.policyState.weights[feature] : null,
    parentDelta: parent?.policyState?.weights ? checkpoint.policyState.weights[feature] - parent.policyState.weights[feature] : null }));
}

export function behaviorPair(project, left, right, opponent = 'control') {
  const pack = project?.packs.find(p => p.purpose === 'EVALUATION');
  if (!pack) return { available: false, reason: 'No held-out pack recorded.' };
  const before = latestComplete(project, left, pack.packId), after = latestComplete(project, right, pack.packId);
  const a = before?.matchups.find(m => m.opponentPolicyId === opponent), b = after?.matchups.find(m => m.opponentPolicyId === opponent);
  if (!a || !b || a.opponentCheckpointId !== b.opponentCheckpointId) return { available: false, reason: 'Complete matching frozen evidence is unavailable.' };
  if (!a.behavior?.availableGames || !b.behavior?.availableGames || !a.behavior.decisions || !b.behavior.decisions) return { available: false, reason: 'Candidate telemetry was not captured in both samples.' };
  return { available: true, before: a.behavior, after: b.behavior, pack, opponent: a.opponentCheckpointId, beforeEvaluationId: before.evaluationId, afterEvaluationId: after.evaluationId };
}

export function filterRecords(records, query = '', fields = []) {
  const text = query.trim().toLowerCase();
  return text ? records.filter(r => JSON.stringify(fields.length ? fields.map(k => r[k]) : r).toLowerCase().includes(text)) : [...records];
}

export function draftWeights(checkpoint, overrides, features, bound) {
  const values = Object.fromEntries(features.map(feature => [feature, overrides?.[feature] ?? checkpoint?.policyState?.weights?.[feature]]));
  const invalid = features.filter(feature => !Number.isInteger(values[feature]) || Math.abs(values[feature]) > bound);
  return { values, invalid, valid: invalid.length === 0, committed: false };
}
