import { hashCanonical } from '@intrilex/shared';
import { effectiveAdaptiveMode } from './adaptive-strategy.mjs';

/** Portable canonical inputs. Labels and occurrences never enter a sample key. */
export function sampleIdentity(config, implementation) {
  if (!implementation?.fingerprint || implementation?.identityContract !== 'intrilex-implementation@2') throw new Error('EVIDENCE_IMPLEMENTATION_REQUIRED');
  const policyIds = config.policyIds ?? ['random-legal', 'random-legal'];
  const subjects = policyIds.map((policyId, i) => ({
    policyId, implementationHash: implementation.policyImplementationHash,
    policyState: config.policyStates?.[i] ?? null,
    adaptive: effectiveAdaptiveMode(config.adaptiveConfigs?.[i]) === 'OFF' ? null : config.adaptiveConfigs[i],
    checkpointId: config.checkpointIds?.[i] ?? null, revisionId: config.revisionIds?.[i] ?? null,
    snapshotDigest: config.subjectSnapshots?.[i]?.snapshotDigest ?? null,
  }));
  const subjectDigests = subjects.map(subject => `SUB2-${hashCanonical(subject)}`);
  const inputs = { contract: 'intrilex-sample@3', executionFingerprint: implementation.fingerprint,
    rulesVersion: implementation.rulesVersion, profileId: config.profileId,
    ruleOverrides: config.ruleOverrides ?? null, seatOrder: config.seatOrder ?? ['P1', 'P2'], subjectDigests,
    seed: (config.seed >>> 0) || 1, seedStreamVersion: config.seedStreamVersion ?? 'POLICY_V4',
    seedCatalogVersion: config.seedCatalogVersion ?? 'INTRILEX_LAB_SEED_CATALOG_V1',
    decisionLimit: config.decisionLimit ?? 1800, orchestrationCommandLimit: config.orchestrationCommandLimit ?? 16,
    initialStateHash: config.initialState ? hashCanonical(config.initialState) : null };
  return { schemaVersion: '2.0.0', matchIdVersion: 3, deterministicSampleId: `M3-${hashCanonical(inputs)}`,
    executableHash: hashCanonical(subjects), subjectDigests, executionFingerprint: implementation.fingerprint,
    analysisFingerprint: implementation.analysisFingerprint, sampleInputs: inputs };
}


export const commandStreamStart = () => hashCanonical({ contract: 'intrilex-command-stream@1' });
export const nextCommandDigest = (previous, command) => hashCanonical({ previous, command });
export function outcomeIdentity(summary, commandDigest) {
  const outcome = { contract: 'intrilex-outcome@1', commandDigest, profileId: summary.profileId,
    terminationReason: summary.terminationReason, winner: summary.winner,
    finalStateHash: summary.finalStateHash, finalScores: summary.finalScores };
  return { outcomeContract: outcome.contract, commandDigest, outcomeDigest: hashCanonical(outcome) };
}
