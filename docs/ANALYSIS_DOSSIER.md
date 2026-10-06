# Analysis Dossier

The **Analysis Dossier** is the canonical research-state export for the Intrilex
Observatory / Evolution Lab. One click produces a single coherent document that
captures everything a frontier AI model or independent researcher needs to
analyze current findings, anomalies, balance questions, strategies,
contradictions, evidence gaps and open questions — without screenshots or a
guided tour of the UI.

```
Run experiments / simulations / Arena / Evolution Lab
  → collect evidence
  → Export Analysis Dossier (JSON and/or Markdown)
  → hand the file to an AI or another researcher
  → ask about anomalies, balance, strategies, contradictions, gaps, next experiments
```

## Files

| File | Role |
|------|------|
| `apps/lab-web/src/analysis-dossier.js` | Canonical builder + deterministic Markdown renderer. Isomorphic (Node tests + browser dist). |
| `apps/lab-web/src/analysis-dossier-export.js` | Browser glue: collects the lab snapshot from IndexedDB + the live Evolution Lab surface, builds and downloads the dossier. |
| `apps/lab-web/src/workspaces/evolution-dashboard.js` | Exposes `liveLabSnapshot()` — the read-only boundary for live Arena/session state. |
| `test/analysis-dossier.test.mjs` | Contract tests. |
| `scripts/generate-analysis-dossier.mjs` | Emits `sample-data/observatory/analysis-dossier.sample.{json,md}` from the shipped fixtures. |

## Canonical schema (`format: "intrilex-analysis-dossier"`, schemaVersion `1.0.0`)

The **JSON is authoritative**. Markdown is rendered deterministically from the
exact same dossier object — the two can never diverge semantically.

```text
format, schemaVersion, dossierVersion
generatedAt            — volatile; excluded from dossierHash
exportId               — <generatedAt-compact>-<dossierHash:12>
dossierHash, hashScope — SHA-256 over canonical JSON of the dossier minus
                         generatedAt / exportId / dossierHash

identity               — engine/rules/lab/analytics versions, authority
                         profile + hash, release identity hash, capability
                         hash, lab fingerprint, implementation hashes
scope                  — datasetOrigin (CERTIFIED_CORPUS | EVOLUTION_LAB),
                         authority profile, experiment/canonical result
                         hashes, Arena view filters, lab run/matrix/experiment/
                         checkpoint ids
provenance             — observatoryHash, aggregateHash, sourceHashes,
                         evidenceEpoch, postRulesParityRepair, index hashes,
                         extractHash, per-artifact content hashes and
                         origin/historical flags, collectionNotes

executiveSummary       — deterministic prose lines
dataset                — observatory counts, aggregate campaign metrics,
                         corpus + replay-index summaries, lab counts
integrity              — completeness, reconciliation, campaignHealth,
                         quarantineLedger, telemetry presence flags, errors
policies               — full per-policy analytic rows
mechanics              — full mechanic analytics rows (registry status,
                         quarantine, opportunity counts, pick rates, raw and
                         adjusted win associations, CIs, p/q-values, evidence
                         grades, formula hashes, replay refs)
synergies              — modelled pairs + diagnostics + candidate set
motifs                 — causal motif counts with match refs
ranks                  — rankPower (ladder, axis coverage, balance
                         qualification), rank counters, swap matrix,
                         ten-suit expansion, rank authority, anatomy registry
variants               — variant analytics (or explicit error)
pairedAnalysis         — matched AB/BA seat-swap results (McNemar, bootstrap)
choiceAnalysis         — conditional choice-set coverage, contexts, entities
anomalies              — integrity anomaly list with severity + baselines

strategy               — evidence corpus inventory: provenance cohorts,
                         per-source metadata, origin/fidelity breakdowns,
                         store row counts (the Strategy bundle stays
                         authoritative for decision-level evidence)
arena                  — focus-run arena analytics: summary, seat splits,
                         paired-score interval, action families, opportunity
                         rows, strategic telemetry aggregates, policy
                         fingerprints, similarity distance, diagnostics,
                         bounded curves/histograms/scatter
batchExperiments       — live matrix view (verified via batchMatrixView) +
                         persisted manifest rows (participants, cells, runRefs)
evolution              — run projections (config, checkpoints, metrics,
                         telemetry coverage, compact record rows, replay
                         retention refs), research project summaries with
                         evaluation leaderboards, historicalArtifacts list

findings               — normalized machine-readable findings
uncertainties          — explicit uncertainty statements
recommendations        — extract recommendations + derived actions
openQuestions          — derived research questions
evidenceGaps           — structured gap records {domain, gap, severity,
                         suggestedEvidence}
interpretationBoundaries — verbatim boundary statements from every layer
unavailable            — explicit {domain, reason, source} declarations
analysisExtract        — the embedded extractAnalysis() projection (superset
                         of the legacy extract export)
metricRegistry         — formula registry verbatim
rankAnatomyRegistry    — verbatim
```

## Missing-data semantics

- `available: false` + `reason` on a section means **not measured / not
  accessible** — never a fabricated zero.
- `null` on a field means the underlying model did not produce a value.
- A measured `0` is always the number `0` and is never emitted where a value
  was not measured.
- Failed/corrupt artifacts are surfaced (`status: "CORRUPT"` /
  `"UNREADABLE"`) with a `collectionNotes` entry in provenance.

## Provenance and historical evidence

Every dossier records the authority fingerprint chain: engine/rules/lab
versions, `authorityHash`, `releaseIdentityHash`, `capabilityHash`,
`observatoryHash`, `aggregateHash`, `sourceHashes`, `evidenceEpoch`,
`postRulesParityRepair`, plus per-artifact content hashes for persisted lab
runs, matrices and research projects.

Artifacts whose `identity.fingerprint` differs from the current lab identity
are flagged `historical: true` and listed in `evolution.historicalArtifacts`.
Imported evidence (`evidenceOrigin: "IMPORTED_UNVERIFIED"`) retains its origin
marker. Neither is silently merged into current-authority claims.

`dossierHash` is `SHA-256` over the canonical (key-sorted) JSON of the dossier
with `generatedAt`, `exportId` and `dossierHash` removed. Rebuilding from the
same analytical state reproduces the hash regardless of field order or export
time.

## Interpretation boundaries

The dossier carries, verbatim and as top-level declarations:

- Associations and win rates are policy-, seat-, profile- and
  telemetry-conditioned observations — not causal proof, not balance canon.
- Synergy estimates are model-dependent (stratified odds-ratio).
- Unsupported or uninstrumented branches fail closed (`available:false`).
- Small samples and incomplete choice opportunities limit interpretation;
  `choiceSupport` and confidence intervals are preserved throughout.
- Specialized artifacts remain authoritative: Evolution run envelopes
  (`intrilex-evolution-lab` schema 1), Batch Matrix artifacts/manifests
  (`intrilex-matchup-lab` schema 2), research envelopes, strategy evidence
  bundles, chart exports and profile bundles are **not** replaced by this
  export — the dossier references their IDs and content hashes.

## Size discipline

Raw match summaries, retained replay bodies, decision traces and seat-level
telemetry are **not** embedded. The dossier carries counts, references
(matchIds, replayIds, hashes) and bounded structured projections (per-record
slim rows, aggregate metrics, histograms). Record rows carry
telemetry-presence flags so an analyst can tell measured-but-empty from
never-instrumented.

## Downstream usage

Suggested prompts for an AI receiving the dossier:

- "Summarize the strongest and weakest mechanics by evidence grade; flag any
  findings whose confidence intervals cross zero."
- "List anomalies and contradictions, and which specialized artifacts I should
  request to verify them."
- "Which balance questions can this evidence actually answer, and which
  require new experiments? Propose concrete follow-up runs."
- "Where do marginal and model-based synergy directions disagree?"
- "Which evidence is imported/historical and must not be treated as
  current-authority?"

## Exporting

- **UI:** command palette / Evidence workspace → *Export Analysis Dossier*
  (JSON, Markdown, or Both). Filenames:
  `intrilex-analysis-dossier-<UTC timestamp>-<hash12>.{json,md}`.
- **Node:** `node scripts/generate-analysis-dossier.mjs` writes the sample
  pair under `sample-data/observatory/`. `DOSSIER_GENERATED_AT` overrides the
  timestamp for reproducible regeneration.
- **Programmatic:**

  ```js
  import { buildAnalysisDossier, serializeAnalysisDossier, renderAnalysisDossierMarkdown }
    from '../apps/lab-web/src/analysis-dossier.js';
  const dossier = buildAnalysisDossier(input, { generatedAt });
  const json = serializeAnalysisDossier(dossier);        // canonical JSON
  const markdown = renderAnalysisDossierMarkdown(dossier); // same object
  ```

## Relationship to the legacy "Extract analysis"

`showExtract(format)` still exists (command palette → *Extract analysis*) but
is repaired: it copies the canonical dossier serialization — JSON or the
deterministic Markdown projection — to the clipboard. The previous contract
(`extractAnalysis(state.observatory, format)` returning a clipboard string)
was incompatible with `extractAnalysis({ analytics, aggregate })` and could
not produce a usable export; it now delegates to the dossier builder, which
embeds the extract's full output under `analysisExtract`.
