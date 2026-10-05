import { esc } from '../state.js?v=e1685673b001';
import { LAB_IDENTITY } from './identity.mjs?v=e1685673b001';
import { LAB_PROFILES } from './evolution-domain.mjs?v=e1685673b001';
import { executeBrowserSeries } from './evolution-browser-runner.mjs?v=e1685673b001';
import { EvolutionStore } from './evolution-store.mjs?v=e1685673b001';
import { TRAIT_CATALOG, TEMPLATE_CATALOG, GENOME_DEFINITION, canExecuteCheckpoint, canCompareMeasurements, resolveEra, sameHead, CONTRACTS } from './profile-contracts.mjs?v=e1685673b001';
import { ProfileStore, IndexedDbBackend, promotionAuthority } from './profile-store.mjs?v=e1685673b001';
import { startSeries, runSeries, cancelSeries, prepareHeldOut, runPlannedMeasurement, prepareChallenge, runChallenge, promoteChallenger } from './profile-science.mjs?v=e1685673b001';
import { buildDossier } from './profile-journal.mjs?v=e1685673b001';

// Profile-centered Lab workflows. Presentation only: every scientific or
// head-changing action goes through ProfileStore / profile-science.

const short = (id, n = 14) => id ? `${String(id).slice(0, n)}…` : '—';
const commandId = () => globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmt = (v, d = 3) => v === null || v === undefined || !Number.isFinite(v) ? 'unavailable' : Number(v).toFixed(d);
const badge = (text, kind = '') => `<span class="evo-badge ${kind ? `evo-badge-${kind}` : ''}">${esc(text)}</span>`;
const TABS = [['overview', 'Overview'], ['learn', 'Learn'], ['analyze', 'Analyze & history'], ['tune', 'Tune & research']];

export function mountProfileWorkspace(root) {
  const ui = { profiles: [], selected: null, view: null, tab: 'overview', controller: null, progress: 'No Profile operation running.', error: '', notice: '', preview: null, journalId: null, compare: [null, null], v1: null, superseded: false };
  const store = new ProfileStore(new IndexedDbBackend({ onSuperseded: () => { ui.superseded = true; ui.error = 'PROFILE_STORAGE_SUPERSEDED: another tab upgraded Profile storage. Reload this page before making changes.'; render(); } }), { identity: LAB_IDENTITY });
  const busy = () => !!ui.controller;
  const attempt = async (fn, notice) => {
    ui.error = ''; ui.notice = '';
    try { await fn(); if (notice) ui.notice = notice; } catch (error) { ui.error = `${error.code ?? 'ERROR'}: ${error.detail ? JSON.stringify(error.detail) : error.message}`; }
    await reload();
  };
  async function reload() {
    try {
      ui.profiles = await store.listProfiles();
      ui.view = ui.selected ? await store.profileView(ui.selected) : null;
    } catch (error) { ui.error ||= `${error.code ?? 'STORAGE'}: ${error.message}`; }
    render();
  }
  const operate = async (label, fn) => {
    if (busy()) return;
    ui.controller = new AbortController(); ui.progress = `${label} started.`; render();
    await attempt(async () => { await fn(ui.controller.signal); }, `${label} finished.`);
    ui.controller = null; render();
  };
  const onProgress = p => {
    ui.progress = p.stage ? `${p.stage} · generation ${p.generationIndex ?? '—'}${p.candidateIndex !== undefined ? ` · candidate ${p.candidateIndex}` : ''}${p.outcome ? ` · ${p.outcome}` : ''}` : `${p.purpose ?? p.role ?? 'Measurement'} · ${p.opponent ?? ''} · ${p.completed ?? 0}/${p.total ?? '?'} games`;
    const el = root.querySelector('#ap-progress'); if (el) el.textContent = ui.progress;
  };

  // ── Derived view helpers ──
  const art = id => ui.view?.artifacts.find(a => a.id === id);
  const kind = k => ui.view?.artifacts.filter(a => a.kind === k) ?? [];
  const cp = id => ui.view?.checkpoints.find(c => c.checkpointId === id);
  const revision = () => art(ui.view.head.activeRevisionId);
  const objective = () => art(revision().body.objectiveInstanceId);
  const currentEra = () => resolveEra({ identity: LAB_IDENTITY, objective: objective() });
  const op = id => ui.view?.operations.find(o => o.operationId === id);

  function rosterHtml() {
    const rows = ui.profiles.map(p => `<li><button data-ap-select="${esc(p.agentProfileId)}" aria-current="${p.agentProfileId === ui.selected}">${esc(p.displayName)}</button>
      <small>v${p.head?.headVersion ?? '—'} · ${esc(p.origin)}${p.forkOf ? ' · fork' : ''}</small></li>`).join('');
    const traits = TRAIT_CATALOG.map(t => `<label>${esc(t.label)} <small id="ap-desc-${t.traitId}">${esc(t.description)} Range ${t.min}…${t.max}.</small>
      <input type="number" data-ap-create-trait="${t.traitId}" min="${t.min}" max="${t.max}" step="1" value="0" aria-describedby="ap-desc-${t.traitId}"></label>`).join('');
    return `<section class="evo-workbench ap-roster" aria-labelledby="ap-roster-title"><h4 id="ap-roster-title">Roster</h4>
      ${rows ? `<ul class="ap-roster-list">${rows}</ul>` : '<div class="evo-empty"><h3>No Profiles yet</h3><p>Create a named mind from semantic traits. No archetype is required.</p></div>'}
      <details ${ui.profiles.length ? '' : 'open'}><summary>Create custom Profile</summary><form id="ap-create-form" class="ap-form">
        <label>Name (required)<input id="ap-create-name" required maxlength="80" placeholder="GRAVE MAW"></label>
        <label>Intended identity statement<textarea id="ap-create-statement" maxlength="600" placeholder="What should this mind be?"></textarea></label>
        <fieldset><legend>Semantic traits (compiled to concrete parameters by ${esc(CONTRACTS.compiler.id)} v${CONTRACTS.compiler.version})</legend>${traits}</fieldset>
        <label>Rules profile (objective target)<select id="ap-create-rules">${LAB_PROFILES.map(p => `<option>${esc(p)}</option>`).join('')}</select></label>
        <label>Optional starting prior (not an identity class)<select id="ap-create-template"><option value="">None — traits only</option>${TEMPLATE_CATALOG.map(t => `<option value="${esc(t.templateId)}@${t.templateVersion}">${esc(t.label)} v${t.templateVersion}</option>`).join('')}</select></label>
        <button type="submit" ${busy() ? 'disabled' : ''}>Create Profile</button></form></details>
      <details><summary>Import or link</summary>
        <label>Import Profile bundle<input type="file" id="ap-import" accept="application/json,.json" ${busy() ? 'disabled' : ''}></label>
        <label class="evo-check"><input type="checkbox" id="ap-import-fork">Import as a new fork (never overwrites a local head)</label>
        <button id="ap-v1-list" ${busy() ? 'disabled' : ''}>List V1 research checkpoints</button>
        ${ui.v1 ? (ui.v1.length ? `<label>V1 checkpoint<select id="ap-v1-select">${ui.v1.map((x, i) => `<option value="${i}">${esc(x.label)}</option>`).join('')}</select></label><label>Profile name<input id="ap-v1-name" maxlength="80"></label><button id="ap-v1-link">Link as new Profile</button><p>The original V1 checkpoint ID and hash are preserved; V1 evidence stays historical.</p>` : '<p>No trainable V1 checkpoints found in local research history.</p>') : ''}
      </details></section>`;
  }

  function overviewHtml() {
    const v = ui.view, head = v.head, rev = revision(), obj = objective(), champion = cp(head.championCheckpointId), exec = canExecuteCheckpoint(champion, LAB_IDENTITY);
    const eraCurrent = currentEra().id === head.requiredEvaluationEraId, lastEvent = v.events.at(-1);
    const measurements = kind('MEASUREMENT_RESULT').filter(m => m.body.subjectCheckpointId === head.championCheckpointId && m.body.status === 'COMPLETE' && m.body.purpose !== 'TRAINING');
    const latest = measurements.at(-1), decisions = kind('CHALLENGE_DECISION');
    return `<dl class="ap-facts">
      <div><dt>Agent Profile</dt><dd>${esc(v.profile.displayName)} <code>${esc(head.agentProfileId)}</code></dd></div>
      <div><dt>Active head</dt><dd>headVersion ${head.headVersion} · ${badge(lastEvent.type)} ${badge(`Evidence: ${lastEvent.evidenceStatus}`, lastEvent.evidenceStatus === 'PROMOTION_CHALLENGE_APPROVED' ? 'evaluation' : 'unavailable')}</dd></div>
      <div><dt>Champion checkpoint</dt><dd><code>${esc(short(head.championCheckpointId, 22))}</code> · derivation ${esc(champion?.mutation?.kind ?? 'V1/ROOT')} · genome ${esc(Object.entries(champion?.policyState.weights ?? {}).map(([k, w]) => `${k} ${w}`).join(', '))}</dd></div>
      <div><dt>Authored identity (revision ${rev.body.revisionNumber}, ${esc(rev.body.origin)})</dt><dd>${esc(rev.body.intendedIdentity.statement || 'No statement.')} · traits ${esc(JSON.stringify(rev.body.intendedIdentity.traits))}</dd></div>
      <div><dt>Capability Objective</dt><dd>${esc(obj.body.definitionId)} v${obj.body.definitionVersion} on ${esc(obj.body.rulesProfileId)} · <code>${esc(short(obj.id, 20))}</code></dd></div>
      <div><dt>Execution capability</dt><dd>${exec.ok ? badge('Executable in this implementation', 'evaluation') : badge(`Not executable: ${exec.reasons.join(', ')}`, 'danger')}</dd></div>
      <div><dt>Evidence freshness</dt><dd>${eraCurrent ? badge('Required era matches current implementation') : badge('Required era is not current — new challenges need a context change', 'warning')}</dd></div>
      <div><dt>Latest measurement of the Champion</dt><dd>${latest ? `${esc(latest.body.purpose)} · objective score ${fmt(latest.body.aggregate.objectiveScore)} · ${latest.body.matchups.reduce((s, m) => s + m.metrics.pairCount, 0)} pairs / ${latest.body.matchups.reduce((s, m) => s + m.metrics.games, 0)} games · era ${esc(short(latest.body.eraId))}` : 'Not measured (unevaluated).'}</dd></div>
      <div><dt>Challenges</dt><dd>${decisions.length ? decisions.map(d => badge(`${d.body.decision}`, d.body.decision === 'APPROVE' ? 'evaluation' : d.body.decision === 'INVALID' ? 'danger' : 'warning')).join('') : 'None.'}</dd></div>
    </dl>
    ${eraCurrent ? '' : `<p class="evo-historical-banner">This Profile's required Evaluation Era was produced by a different implementation or objective context. <button data-ap-action="change-era">Adopt current era (bumps headVersion)</button></p>`}
    <div class="toolbar"><button data-ap-action="play" ${exec.ok ? '' : 'disabled'}>Play against ${esc(v.profile.displayName)}</button><button data-ap-action="export">Export bundle</button>
      <label>Fork name<input id="ap-fork-name" maxlength="80" placeholder="${esc(v.profile.displayName)} fork"></label><button data-ap-action="fork" ${busy() ? 'disabled' : ''}>Fork</button>
      <label>Rename (display only)<input id="ap-rename" maxlength="80" value="${esc(v.profile.displayName)}"></label><button data-ap-action="rename">Rename</button></div>`;
  }

  function seriesHtml(series) {
    const v = ui.view, operation = op(series.id), outcome = kind('SERIES_OUTCOME').find(o => o.body.seriesId === series.id);
    const selections = kind('GENERATION_SELECTION').filter(s => s.body.seriesId === series.id).sort((a, b) => a.body.generationIndex - b.body.generationIndex);
    const nomination = kind('CHALLENGER_NOMINATION').find(n => n.body.seriesId === series.id);
    const fromCurrent = sameHead(series.body.headToken, v.head);
    const status = outcome ? outcome.body.status : operation?.status ?? 'NOT_STARTED';
    const rows = selections.map(s => `<tr><th scope="row">${s.body.generationIndex}</th><td>${esc(s.body.outcome)}</td><td>${s.body.candidates.map(c => `${c.index}:${c.role}${c.mutation ? ` ${esc(c.mutation.parameter)} ${c.mutation.delta >= 0 ? '+' : ''}${c.mutation.delta}` : ''}`).join('<br>')}</td>
      <td>${s.body.ranking.map(r => `${r.index}: ${fmt(r.fitness)}`).join('<br>') || '—'}</td><td>${s.body.disqualified.map(d => `${esc(short(d.checkpointId))} ${esc(d.reason)}`).join('<br>') || '—'}</td><td><code>${esc(short(s.body.selectedCheckpointId))}</code></td></tr>`).join('');
    const challenges = nomination ? kind('CHALLENGE_MANIFEST').filter(c => c.body.nominationId === nomination.id).sort((a, b) => a.body.attempt.number - b.body.attempt.number) : [];
    const heldOut = nomination ? kind('MEASUREMENT_MANIFEST').filter(m => m.body.purpose === 'HELD_OUT_EVALUATION' && m.body.subjectCheckpointId === nomination.body.checkpointId) : [];
    const challengeRows = challenges.map(c => {
      const d = kind('CHALLENGE_DECISION').find(x => x.body.challengeId === c.id), auth = d ? promotionAuthority({ decision: d, manifest: c, head: v.head }) : null;
      const s = d?.body.statistics;
      return `<tr><th scope="row">#${c.body.attempt.number}</th><td>${c.body.attempt.automaticEligible ? 'Eligible' : 'Repeat — manual only'}</td><td>${d ? `${esc(d.body.decision)}<br><small>${esc(d.body.reasons.join(', '))}</small>` : esc(op(c.id)?.status ?? 'NOT RUN')}</td>
        <td>${s?.available ? `mean ${fmt(s.mean, 4)}<br>95% one-sided [${fmt(s.lower, 4)}, ${fmt(s.upper, 4)}]<br>${s.blocks} blocks · ${s.games} games` : 'unavailable'}</td>
        <td>${!d ? `<button data-ap-run-challenge="${esc(c.id)}" ${busy() ? 'disabled' : ''}>Run / resume challenge</button>` : auth.ok ? `<button data-ap-promote="${esc(d.id)}" ${busy() ? 'disabled' : ''}>Promote (atomic)</button>` : `<small>Not authorized: ${esc(auth.reasons.join(', '))}</small>`}
        ${d && !sameHead(c.body.expectedHead, v.head) ? `<br><button data-ap-rechallenge="${esc(nomination.id)}" ${busy() ? 'disabled' : ''}>Re-challenge current head</button>` : ''}</td></tr>`;
    }).join('');
    return `<article class="evo-workbench" aria-labelledby="ap-series-${esc(series.id)}"><header><h4 id="ap-series-${esc(series.id)}">Series <code>${esc(short(series.id))}</code></h4>${badge(status)}${fromCurrent ? badge('From current head') : badge('From an older head', 'warning')}</header>
      <p>Source <code>${esc(short(series.body.sourceCheckpointId))}</code> (head v${series.body.headToken.headVersion}) · revision <code>${esc(short(series.body.revisionId))}</code> · objective <code>${esc(short(series.body.objectiveInstanceId))}</code> · ${series.body.optimizer.config.generations} generations × ${series.body.optimizer.config.candidates} mutations · step ${series.body.optimizer.config.mutationStep} · TRAINING pack <code>${esc(short(series.body.trainingPackId))}</code></p>
      ${!outcome && operation?.status !== 'CANCELLED' ? `<div class="toolbar"><button data-ap-run-series="${esc(series.id)}" ${busy() ? 'disabled' : ''}>${operation ? 'Resume Series' : 'Run Series'}</button><button data-ap-cancel-series="${esc(series.id)}" ${busy() ? 'disabled' : ''}>Cancel Series</button></div>` : ''}
      ${rows ? `<div class="evo-table-scroll"><table><caption>TRAINING selections (held-out and challenge evidence cannot enter)</caption><thead><tr><th scope="col">Gen</th><th scope="col">Outcome</th><th scope="col">Candidates</th><th scope="col">Training fitness</th><th scope="col">Disqualified</th><th scope="col">Selected</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      ${outcome ? `<p>${nomination ? `Challenger nominated: <code>${esc(short(nomination.body.checkpointId, 22))}</code> (${esc(nomination.body.rule.id)}).` : `No Challenger: ${esc(outcome.body.noChangeReason)}. This is a truthful no-change result.`}</p>` : ''}
      ${nomination ? `<div class="toolbar"><label>Held-out pairs<input type="number" id="ap-heldout-pairs-${esc(nomination.id)}" min="1" max="500" value="${revision().body.defaults.heldOutPairs}"></label><button data-ap-heldout="${esc(nomination.id)}" ${busy() ? 'disabled' : ''}>Measure held-out (cannot change selection)</button>
        <button data-ap-challenge="${esc(nomination.id)}" ${busy() || nomination.body.checkpointId === v.head.championCheckpointId ? 'disabled' : ''}>Start promotion challenge</button></div>
        ${heldOut.length ? `<p>Held-out: ${heldOut.map(m => { const r = kind('MEASUREMENT_RESULT').find(x => x.body.manifestId === m.id); return r ? `${fmt(r.body.aggregate.objectiveScore)} (${r.body.status})` : `<button data-ap-run-measure="${esc(m.id)}" ${busy() ? 'disabled' : ''}>Run planned held-out</button>`; }).join(' · ')}</p>` : ''}
        ${challengeRows ? `<div class="evo-table-scroll"><table><caption>Promotion challenges (fixed budget, fresh disjoint seeds)</caption><thead><tr><th scope="col">Attempt</th><th scope="col">Automatic eligibility</th><th scope="col">Decision</th><th scope="col">Paired estimate</th><th scope="col">Action</th></tr></thead><tbody>${challengeRows}</tbody></table></div>` : ''}
        <details><summary>Manual activation (human decision; waives evidence adequacy only)</summary><label>Reason (required)<textarea id="ap-manual-reason-${esc(nomination.id)}" maxlength="500"></textarea></label><button data-ap-manual="${esc(nomination.id)}" ${busy() ? 'disabled' : ''}>Manually activate this checkpoint</button></details>` : ''}
    </article>`;
  }
  function learnHtml() {
    const d = revision().body.defaults.series, series = kind('SERIES_MANIFEST').sort((a, b) => b.id.localeCompare(a.id));
    return `<section class="evo-workbench"><h4>Continue training from the active Champion</h4><form id="ap-series-form" class="toolbar">
      <label>Generations<input type="number" id="ap-s-generations" min="1" max="100" value="${d.generations}"></label><label>Mutations per generation<input type="number" id="ap-s-candidates" min="1" max="4" value="${d.candidates}"></label>
      <label>Mutation step<input type="number" id="ap-s-step" min="1" max="1000" value="${d.mutationStep}"></label><label>Training seed pairs<input type="number" id="ap-s-pairs" min="1" max="500" value="${d.trainingPairs}"></label>
      <label>Workers (operational only)<select id="ap-s-workers">${[1, 2, 3, 4].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button type="submit" ${busy() ? 'disabled' : ''}>Freeze manifest and start Series</button></form>
      <p>The manifest pins the head token, checkpoint, revision, objective instance, era, optimizer, TRAINING pack and rules before any game runs.</p></section>
      ${busy() ? '<div class="toolbar"><button data-ap-action="stop">Stop operation (keeps accepted evidence)</button></div>' : ''}
      ${series.map(seriesHtml).join('') || '<div class="evo-empty"><h3>No Series yet</h3><p>A Series selects descendants using TRAINING evidence only. It may truthfully retain the parent.</p></div>'}`;
  }

  function analyzeHtml() {
    const v = ui.view, journal = ui.journalId ? art(ui.journalId) : null;
    const events = v.events.map(e => `<tr><th scope="row">${e.sequence}</th><td>${esc(e.type)}</td><td>${esc(e.evidenceStatus)}</td><td><code>${esc(short(e.after.championCheckpointId))}</code></td><td><code>${esc(short(e.after.activeRevisionId))}</code></td><td>${esc(e.recordedAt)}</td>
      <td><button data-ap-journal="${esc(e.journalId)}">Journal</button>${e.sequence < v.head.headVersion ? ` <button data-ap-rollback="${e.sequence}" ${busy() ? 'disabled' : ''}>Roll back to this pair</button>` : ' (active)'}</td></tr>`).join('');
    const measurements = kind('MEASUREMENT_RESULT').filter(m => m.body.status === 'COMPLETE');
    const experiences = kind('EXPERIENCE_RECORD');
    const dossier = buildDossier({ head: v.head, revision: revision(), measurements, identityConstraints: revision().body.identityConstraints });
    const eraTables = dossier.eras.map(era => `<h5>Era <code>${esc(short(era.eraId, 18))}</code> ${era.current ? badge('required era') : badge('different era — no deltas across this boundary', 'warning')}</h5>
      ${Object.entries(era.purposes).filter(([, list]) => list.length).map(([purpose, list]) => `<div class="evo-table-scroll"><table><caption>${esc(purpose)} measurements</caption><thead><tr><th scope="col">Subject</th><th scope="col">Pack</th><th scope="col">Objective score</th><th scope="col">Per opponent: paired score [interval] · pairs/games · non-clean · decisions</th></tr></thead><tbody>
        ${list.map(m => `<tr><th scope="row"><code>${esc(short(m.subjectCheckpointId))}</code></th><td><code>${esc(short(m.packId))}</code></td><td>${fmt(m.objectiveScore)}</td><td>${m.perOpponent.map(o => `${esc(o.opponent)}: ${fmt(o.pairedScore)} [${o.interval95 ? o.interval95.map(x => fmt(x, 2)).join(', ') : 'n/a'}] · ${o.pairs}/${o.games} · ${esc(JSON.stringify(o.nonClean))} · ${o.decisions}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`).join('')}`).join('') || '<p>No complete measurements yet. Unevaluated is not zero.</p>';
    const [a, b] = ui.compare.map(id => measurements.find(m => m.id === id)), verdict = a && b ? canCompareMeasurements(a, b) : null;
    const options = selected => `<option value="">Choose…</option>${measurements.map(m => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.body.purpose)} · ${esc(short(m.body.subjectCheckpointId))} · pack ${esc(short(m.body.packId, 10))} · era ${esc(short(m.body.eraId, 10))}</option>`).join('')}`;
    const comparison = verdict ? verdict.ok ? `<div class="evo-table-scroll"><table><caption>Compatible paired comparison (same era and pack)</caption><thead><tr><th scope="col">Opponent</th><th scope="col">A</th><th scope="col">B</th><th scope="col">B − A</th></tr></thead><tbody>${a.body.matchups.map((m, i) => { const n = b.body.matchups[i]; return `<tr><th scope="row">${esc(m.opponentPolicyId)}</th><td>${fmt(m.metrics.pairedScore)}</td><td>${fmt(n?.metrics.pairedScore)}</td><td>${m.metrics.pairedScore === null || n?.metrics.pairedScore == null ? 'unavailable' : fmt(n.metrics.pairedScore - m.metrics.pairedScore)}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<p role="status">No delta shown: ${esc(verdict.reasons.join(', '))}. Re-evaluate both under a common era and pack to compare.</p>` : '';
    return `<section class="evo-workbench"><h4>Head history (append-only)</h4><div class="evo-table-scroll"><table><caption>Profile events in transaction order</caption><thead><tr><th scope="col">Seq</th><th scope="col">Transition</th><th scope="col">Evidence status</th><th scope="col">Champion</th><th scope="col">Revision</th><th scope="col">Recorded (descriptive)</th><th scope="col">Actions</th></tr></thead><tbody>${events}</tbody></table></div>
      <label>Rollback reason<input id="ap-rollback-reason" maxlength="300"></label></section>
      ${journal ? `<section class="evo-workbench" aria-labelledby="ap-journal-title"><h4 id="ap-journal-title">Learning Journal · ${esc(journal.body.kind)}</h4><p>${esc(journal.body.sections.interpretation)}</p>
        <dl class="ap-facts">${['parameterChange', 'behaviorChange', 'performanceChange', 'tradeoffs', 'decision', 'evidenceQuality', 'references'].map(k => `<div><dt>${esc(k)}</dt><dd><pre>${esc(JSON.stringify(journal.body.sections[k], null, 2))}</pre></dd></div>`).join('')}</dl></section>` : ''}
      <section class="evo-workbench"><h4>Dossier</h4><p>${esc(dossier.note)}</p>${eraTables}
        ${dossier.observedIdentity.length ? `<h5>Intended constraints beside observations</h5><pre>${esc(JSON.stringify(dossier.observedIdentity, null, 2))}</pre>` : ''}</section>
      <section class="evo-workbench" data-testid="profile-experience"><h4>Experience</h4><p>${experiences.length} recorded encounters. Observations do not train or promote this Profile.</p>
        ${experiences.length ? `<div class="evo-table-scroll"><table><caption>Experience encounters (up to 20 shown; not evaluation evidence)</caption><thead><tr><th scope="col">Encounter</th><th scope="col">Checkpoint</th><th scope="col">Winner</th><th scope="col">Termination</th></tr></thead><tbody>${experiences.slice(0, 20).map(e => `<tr><th scope="row">${esc(e.body.encounterId)}</th><td><code>${esc(short(e.body.agent.checkpointId))}</code></td><td>${esc(e.body.outcome.winner ?? 'Draw / unavailable')}</td><td>${esc(e.body.outcome.terminationReason ?? 'unavailable')}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
      <section class="evo-workbench"><h4>Compare measurements</h4><div class="toolbar"><label>A<select data-ap-compare="0">${options(ui.compare[0])}</select></label><label>B<select data-ap-compare="1">${options(ui.compare[1])}</select></label></div>${comparison}</section>`;
  }

  function tuneHtml() {
    const rev = revision(), head = ui.view.head, champion = cp(head.championCheckpointId);
    const traits = TRAIT_CATALOG.map(t => `<label>${esc(t.label)} <small>${t.min}…${t.max} → ${esc(t.parameter)} (×20)</small><input type="number" data-ap-trait="${t.traitId}" min="${t.min}" max="${t.max}" step="1" value="${rev.body.intendedIdentity.traits[t.traitId] ?? Math.round((champion?.policyState.weights[t.parameter] ?? 0) / 20)}"></label>`).join('');
    const constraints = GENOME_DEFINITION.parameters.map(p => { const c = rev.body.mutationConstraints[p.name] ?? { mode: 'FREE' }; return `<tr><th scope="row">${esc(p.name)}</th><td><select data-ap-constraint="${p.name}" aria-label="${esc(p.name)} mutation mode">${['FREE', 'FIXED', 'BOUNDED'].map(m => `<option ${m === c.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></td>
      <td><input type="number" data-ap-min="${p.name}" aria-label="${esc(p.name)} minimum" min="${p.min}" max="${p.max}" value="${c.min ?? p.min}"></td><td><input type="number" data-ap-max="${p.name}" aria-label="${esc(p.name)} maximum" min="${p.min}" max="${p.max}" value="${c.max ?? p.max}"></td><td>${esc(p.meaning)}</td></tr>`; }).join('');
    const drafts = kind('PROFILE_REVISION').filter(r => r.id !== head.activeRevisionId && r.body.origin === 'AUTHORED_EDIT').sort((a, b) => b.body.revisionNumber - a.body.revisionNumber);
    const preview = ui.preview ? `<div class="evo-table-scroll"><table><caption>Full genome delta for draft <code>${esc(short(ui.preview.revision.id))}</code></caption><thead><tr><th scope="col">Parameter</th><th scope="col">Current</th><th scope="col">Draft</th><th scope="col">Δ</th><th scope="col">Current provenance</th><th scope="col">Replaces learned value?</th></tr></thead><tbody>
      ${ui.preview.preview.map(r => `<tr><th scope="row">${esc(r.parameter)}</th><td>${r.before}</td><td>${r.after}</td><td>${r.delta}</td><td>${esc(r.currentProvenance)}</td><td>${r.replacesLearnedValue ? '<strong>Yes — learned value replaced</strong>' : 'No'}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<section class="evo-workbench"><h4>Draft an authored revision (the active head does not move)</h4><form id="ap-draft-form" class="ap-form">
      <label>Intended identity statement<textarea id="ap-d-statement" maxlength="600">${esc(rev.body.intendedIdentity.statement)}</textarea></label>
      <fieldset><legend>Semantic traits (changed traits compile onto the active Champion; others copy unchanged)</legend>${traits}</fieldset>
      <label>Rules profile (a change resolves a new immutable objective instance)<select id="ap-d-rules">${LAB_PROFILES.map(p => `<option ${p === objective().body.rulesProfileId ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <div class="evo-table-scroll"><table><caption>Allowed mutation bounds (fixed intended identity during learning)</caption><thead><tr><th scope="col">Parameter</th><th scope="col">Mode</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">Runtime meaning</th></tr></thead><tbody>${constraints}</tbody></table></div>
      <fieldset><legend>Behavioral identity constraint (optional; missing measurements never pass)</legend><div class="toolbar">
        <label>Metric<select id="ap-d-metric"><option value="">None</option><option>ACTION_FAMILY_RATE</option><option>MECHANIC_RATE</option></select></label><label>Family / tag<input id="ap-d-key" maxlength="80" placeholder="counter"></label>
        <label>Min rate<input type="number" id="ap-d-cmin" min="0" max="1" step="0.01" placeholder="none"></label><label>Max rate<input type="number" id="ap-d-cmax" min="0" max="1" step="0.01" placeholder="none"></label><label>Minimum decisions<input type="number" id="ap-d-cden" min="1" value="200"></label></div>
        <p>Existing: ${esc(JSON.stringify(rev.body.identityConstraints))}</p></fieldset>
      <button type="submit" ${busy() ? 'disabled' : ''}>Save draft and preview</button></form>${preview}</section>
      <section class="evo-workbench"><h4>Draft revisions</h4>${drafts.map(r => `<div class="evo-replay-row"><span>Revision ${r.body.revisionNumber} · ${r.body.executableChange ? 'executable change' : 'configuration only'} · <code>${esc(short(r.id))}</code> · parent <code>${esc(short(r.body.parentRevisionId))}</code></span>
        <button data-ap-activate="${esc(r.id)}" ${busy() || r.body.parentRevisionId !== head.activeRevisionId ? 'disabled' : ''}>Activate authored revision</button></div>`).join('') || '<p>No drafts.</p>'}
        <p>Activation is an explicit head transition recorded as an authored intervention, never as learning.</p></section>
      <details class="evo-workbench"><summary>Exact contracts, hashes and references</summary><pre>${esc(JSON.stringify({ headToken: head, revision: rev, objective: objective(), champion, contracts: CONTRACTS, implementation: LAB_IDENTITY }, null, 2))}</pre></details>`;
  }

  function render() {
    const v = ui.view;
    root.innerHTML = `<div class="evo-workspace-title"><div><span class="evo-eyebrow">AGENT PROFILES</span><h3>Persistent agent profiles</h3><p>Named minds with authored intent, exact active checkpoints, and evidence that survives the next release.</p></div></div>
      <p class="danger" role="alert" id="ap-error">${esc(ui.error)}</p><p role="status" id="ap-notice">${esc(ui.notice)}</p><p role="status" id="ap-progress" aria-live="polite">${esc(ui.progress)}</p>
      <div class="ap-layout">${rosterHtml()}<section class="ap-main" aria-label="Selected Profile">${v ? `<header class="ap-header"><h3>${esc(v.profile.displayName)}</h3>${v.profile.origin !== 'LOCAL' ? badge(v.profile.origin === 'MIGRATED_FROM_V1' ? 'Migrated from V1' : 'Imported — unverified', 'warning') : ''}${v.profile.forkOf ? badge(`Fork of ${short(v.profile.forkOf.agentProfileId, 12)}`) : ''}</header>
        <div class="evo-tabs" role="tablist" aria-label="Profile workflows">${TABS.map(([k, label]) => `<button role="tab" id="ap-tab-${k}" aria-controls="ap-panel" aria-selected="${ui.tab === k}" data-ap-tab="${k}" tabindex="${ui.tab === k ? 0 : -1}">${label}</button>`).join('')}</div>
        <div id="ap-panel" role="tabpanel" aria-labelledby="ap-tab-${ui.tab}">${{ overview: overviewHtml, learn: learnHtml, analyze: analyzeHtml, tune: tuneHtml }[ui.tab]()}</div>` : '<div class="evo-empty"><h3>Select or create a Profile</h3><p>Evolution becomes biography: every head change keeps its evidence.</p></div>'}</section></div>`;
  }

  // ── Event handling ──
  const head = () => ui.view.head, id = () => ui.selected;
  const number = sel => Number(root.querySelector(sel)?.value);
  const click = async event => {
    const b = event.target.closest('button'); if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.apSelect) { ui.selected = d.apSelect; ui.preview = null; ui.journalId = null; ui.compare = [null, null]; return reload(); }
    if (d.apTab) { ui.tab = d.apTab; render(); root.querySelector(`#ap-tab-${ui.tab}`)?.focus(); return; }
    if (d.apJournal) { ui.journalId = d.apJournal; render(); root.querySelector('#ap-journal-title')?.scrollIntoView?.(); return; }
    if (d.apAction === 'stop') { ui.controller?.abort(); return; }
    if (d.apAction === 'play') { location.hash = `#/play/agent/${encodeURIComponent(id())}`; return; }
    if (d.apAction === 'export') return attempt(async () => { const bundle = await store.exportProfile(id()); const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = `${id()}.profile.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, 'Bundle exported from a consistent snapshot.');
    if (d.apAction === 'fork') return attempt(async () => { const r = await store.fork({ commandId: commandId(), sourceAgentProfileId: id(), displayName: root.querySelector('#ap-fork-name').value || `${ui.view.profile.displayName} fork` }); ui.selected = r.agentProfileId; ui.tab = 'tune'; }, 'Fork created. The source Profile is unchanged.');
    if (d.apAction === 'rename') return attempt(() => store.renameProfile(id(), root.querySelector('#ap-rename').value), 'Display name updated (not a scientific revision).');
    if (d.apAction === 'change-era') { const era = currentEra(); return attempt(() => store.changeContext({ commandId: commandId(), agentProfileId: id(), expectedHead: head(), requiredEvaluationEraId: era.id, eraArtifact: era }), 'Required era updated; earlier authorizations are now stale.'); }
    if (d.apRunSeries) { const workerCount = number('#ap-s-workers') || 4; return operate('Series', signal => runSeries({ store, seriesId: d.apRunSeries, executeSeries: executeBrowserSeries, workerCount, signal, onProgress })); }
    if (d.apCancelSeries) return attempt(() => cancelSeries({ store, seriesId: d.apCancelSeries }), 'Series cancelled; accepted evidence retained, nothing nominated.');
    if (d.apHeldout) { const nom = art(d.apHeldout), pairs = number(`#ap-heldout-pairs-${CSS.escape(nom.id)}`); return operate('Held-out measurement', async signal => { const m = await prepareHeldOut({ store, agentProfileId: id(), checkpointId: nom.body.checkpointId, commandId: commandId(), pairs }); await runPlannedMeasurement({ store, manifestId: m.id, executeSeries: executeBrowserSeries, workerCount: 4, signal, onProgress }); }); }
    if (d.apRunMeasure) return operate('Held-out measurement', signal => runPlannedMeasurement({ store, manifestId: d.apRunMeasure, executeSeries: executeBrowserSeries, workerCount: 4, signal, onProgress }));
    if (d.apChallenge || d.apRechallenge) return operate('Promotion challenge', async signal => { const c = await prepareChallenge({ store, agentProfileId: id(), nominationId: d.apChallenge ?? d.apRechallenge, commandId: commandId() }); await runChallenge({ store, challengeId: c.id, executeSeries: executeBrowserSeries, workerCount: 4, signal, onProgress }); });
    if (d.apRunChallenge) return operate('Promotion challenge', signal => runChallenge({ store, challengeId: d.apRunChallenge, executeSeries: executeBrowserSeries, workerCount: 4, signal, onProgress }));
    if (d.apPromote) return attempt(() => promoteChallenger({ store, agentProfileId: id(), decisionId: d.apPromote, commandId: commandId() }), 'Promotion committed atomically with record, event, Journal and receipt.');
    if (d.apManual) { const nom = art(d.apManual), rec = kind('CHALLENGE_DECISION').find(x => art(x.body.challengeId)?.body.nominationId === nom.id); return attempt(() => store.manualActivate({ commandId: commandId(), agentProfileId: id(), expectedHead: head(), checkpointId: nom.body.checkpointId, reason: root.querySelector(`#ap-manual-reason-${CSS.escape(nom.id)}`).value, recommendationDecisionId: rec?.id ?? null }), 'Manual activation recorded with its reason and preserved recommendation.'); }
    if (d.apRollback) return attempt(() => store.rollback({ commandId: commandId(), agentProfileId: id(), expectedHead: head(), targetSequence: Number(d.apRollback), reason: root.querySelector('#ap-rollback-reason')?.value ?? '' }), 'Rolled back with a fresh head version; old authorizations remain stale.');
    if (d.apActivate) return attempt(() => store.activateAuthoredRevision({ commandId: commandId(), agentProfileId: id(), expectedHead: head(), revisionId: d.apActivate }), 'Authored revision activated. Continue Training now starts from this checkpoint.');
    if (b.id === 'ap-v1-list') return attempt(async () => {
      const v1 = new EvolutionStore(LAB_IDENTITY), envelopes = await v1.read('research'); v1.close();
      ui.v1 = (envelopes ?? []).flatMap(e => (e.payload?.checkpoints ?? []).filter(c => c.schemaVersion === 2).map(c => ({ checkpoint: c, label: `${e.payload.experiment.name} · ${c.agentId} · generation ${c.generation} · ${short(c.checkpointId)}${c.identity.fingerprint === LAB_IDENTITY.fingerprint ? '' : ' · historical implementation'}`,
        context: { experimentId: e.payload.experiment.experimentId, scientificId: e.payload.experiment.scientificId, packs: (e.payload.packs ?? []).map(p => ({ packId: p.packId, purpose: p.purpose, seeds: p.seeds })) } })));
    });
    if (b.id === 'ap-v1-link') { const x = ui.v1[Number(root.querySelector('#ap-v1-select').value)]; return attempt(async () => { const r = await store.linkV1Checkpoint({ commandId: commandId(), displayName: root.querySelector('#ap-v1-name').value || 'Linked V1 mind', checkpoint: x.checkpoint, v1Context: x.context }); ui.selected = r.agentProfileId; }, 'V1 checkpoint linked with its original ID and hash.'); }
  };
  const submit = async event => {
    const form = event.target; if (!root.contains(form)) return;
    event.preventDefault();
    if (form.id === 'ap-create-form') {
      const traits = Object.fromEntries([...root.querySelectorAll('[data-ap-create-trait]')].map(i => [i.dataset.apCreateTrait, Number(i.value)]).filter(([, v]) => v !== 0));
      const tpl = root.querySelector('#ap-create-template').value, [templateId, version] = tpl.split('@');
      return attempt(async () => { const r = await store.createProfile({ commandId: commandId(), displayName: root.querySelector('#ap-create-name').value, statement: root.querySelector('#ap-create-statement').value, traits, rulesProfileId: root.querySelector('#ap-create-rules').value, template: tpl ? { templateId, templateVersion: Number(version) } : null }); ui.selected = r.agentProfileId; ui.tab = 'overview'; }, 'Profile created with an unevaluated initial Champion.');
    }
    if (form.id === 'ap-series-form') {
      // Capture authored inputs before operate/reload replaces the form DOM.
      const overrides = { generations: number('#ap-s-generations'), candidates: number('#ap-s-candidates'), mutationStep: number('#ap-s-step'), trainingPairs: number('#ap-s-pairs') }, workerCount = number('#ap-s-workers') || 4;
      return operate('Series', async signal => {
      const series = await startSeries({ store, agentProfileId: id(), commandId: commandId(), overrides });
      await reload();
      await runSeries({ store, seriesId: series.id, executeSeries: executeBrowserSeries, workerCount, signal, onProgress });
    });
    }
    if (form.id === 'ap-draft-form') return attempt(async () => {
      const traits = Object.fromEntries([...root.querySelectorAll('[data-ap-trait]')].map(i => [i.dataset.apTrait, Number(i.value)]));
      const mutationConstraints = Object.fromEntries([...root.querySelectorAll('[data-ap-constraint]')].map(s => { const n = s.dataset.apConstraint; return [n, s.value === 'BOUNDED' ? { mode: 'BOUNDED', min: number(`[data-ap-min="${n}"]`), max: number(`[data-ap-max="${n}"]`) } : { mode: s.value }]; }).filter(([, c]) => c.mode !== 'FREE'));
      const metric = root.querySelector('#ap-d-metric').value, optional = sel => root.querySelector(sel).value === '' ? null : number(sel);
      const identityConstraints = [...revision().body.identityConstraints, ...(metric ? [{ metricId: metric, metricVersion: 1, key: root.querySelector('#ap-d-key').value, min: optional('#ap-d-cmin'), max: optional('#ap-d-cmax'), minDenominator: number('#ap-d-cden') }] : [])];
      ui.preview = await store.saveDraftRevision({ agentProfileId: id(), baseRevisionId: head().activeRevisionId, traits, statement: root.querySelector('#ap-d-statement').value, mutationConstraints, identityConstraints, rulesProfileId: root.querySelector('#ap-d-rules').value, sourceCheckpointId: head().championCheckpointId });
    }, 'Draft saved. The active head has not moved; review the delta and activate explicitly.');
  };
  const change = async event => {
    const el = event.target; if (!root.contains(el)) return;
    if (el.dataset.apCompare !== undefined) { ui.compare[Number(el.dataset.apCompare)] = el.value || null; render(); return; }
    if (el.id === 'ap-import') { const file = el.files?.[0]; if (!file) return; const asFork = root.querySelector('#ap-import-fork').checked;
      return attempt(async () => { if (file.size > 40 * 1024 * 1024) throw Object.assign(new Error('Bundle exceeds 40 MiB'), { code: 'IMPORT_TOO_LARGE' }); const r = await store.importBundle(await file.text(), asFork ? { asFork: true, commandId: commandId() } : {}); ui.selected = r.agentProfileId; }, asFork ? 'Imported as a new local fork. Imported claims remain unverified.' : 'Imported. Claims remain externally unverified; local promotion needs a fresh local challenge.'); }
  };
  const keydown = event => {
    const tab = event.target.closest('[data-ap-tab]');
    if (!tab || !root.contains(tab) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const index = TABS.findIndex(([name]) => name === tab.dataset.apTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    ui.tab = TABS[next][0]; render(); root.querySelector(`#ap-tab-${ui.tab}`)?.focus();
  };
  root.addEventListener('click', click); root.addEventListener('submit', submit); root.addEventListener('change', change); root.addEventListener('keydown', keydown);
  reload();
  return { reload, store, cleanup() { ui.controller?.abort(); root.removeEventListener('click', click); root.removeEventListener('submit', submit); root.removeEventListener('change', change); root.removeEventListener('keydown', keydown); store.backend.close(); } };
}
