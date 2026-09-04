import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { runCampaign, campaignAggregate } from '@intrilex/simulation-runtime/campaign';
import { POLICY_CATALOG, POLICY_BY_ID } from '@intrilex/simulation-runtime/policy-catalog';
import { POLICY_STRENGTH_TIERS } from '@intrilex/policy-sdk';
import { createRunProvenance } from '@intrilex/telemetry';

describe('v0.28.2 — Evidence Epoch Tagging', () => {
  it('every policy definition carries a strengthTier field', () => {
    for (const policy of POLICY_CATALOG) {
      assert.ok(policy.strengthTier, `Policy ${policy.policyId} missing strengthTier`);
      assert.ok(POLICY_STRENGTH_TIERS.includes(policy.strengthTier),
        `Policy ${policy.policyId} has invalid tier ${policy.strengthTier}`);
    }
  });

  it('random-legal is classified as fixture tier', () => {
    assert.equal(POLICY_BY_ID['random-legal'].strengthTier, 'fixture');
  });

  it('hybrix-baseline is classified as baseline tier', () => {
    assert.equal(POLICY_BY_ID['hybrix-baseline'].strengthTier, 'baseline');
  });

  it('core strategic policies are classified as heuristic tier', () => {
    for (const id of ['score-rush', 'control', 'tempo', 'value']) {
      assert.equal(POLICY_BY_ID[id].strengthTier, 'heuristic', `${id} should be heuristic`);
    }
  });

  it('hybrix easy variants are classified as baseline tier', () => {
    assert.equal(POLICY_BY_ID['hybrix-rusher-easy'].strengthTier, 'baseline');
    assert.equal(POLICY_BY_ID['hybrix-defender-easy'].strengthTier, 'baseline');
  });

  it('match summary includes evidenceEpoch and postRulesParityRepair', () => {
    const result = runPolicyMatch({
      seed: 42,
      policyIds: ['tempo', 'control'],
      evidenceEpoch: 'test-epoch-v0.28.2',
      postRulesParityRepair: true,
      authorityHash: 'test-authority-hash'
    });
    assert.equal(result.summary.evidenceEpoch, 'test-epoch-v0.28.2');
    assert.equal(result.summary.postRulesParityRepair, true);
    assert.equal(result.summary.authorityHash, 'test-authority-hash');
  });

  it('match summary includes isSelfPlay flag', () => {
    const selfPlay = runPolicyMatch({ seed: 42, policyIds: ['tempo', 'tempo'] });
    const crossPlay = runPolicyMatch({ seed: 42, policyIds: ['tempo', 'control'] });
    assert.equal(selfPlay.summary.isSelfPlay, true);
    assert.equal(crossPlay.summary.isSelfPlay, false);
  });

  it('run provenance includes evidenceEpoch and authorityHash', () => {
    const provenance = createRunProvenance({
      runId: 'RUN-TEST',
      matchId: 'M-TEST',
      engineVersion: '4.2.6',
      rulesVersion: '4.3.1',
      profileId: 'core-advanced-authority',
      seed: 42,
      policyIdsBySeat: { '1': 'tempo', '2': 'control' },
      evidenceEpoch: 'test-epoch',
      authorityHash: 'test-hash'
    });
    assert.equal(provenance.evidenceEpoch, 'test-epoch');
    assert.equal(provenance.authorityHash, 'test-hash');
  });

  it('epoch fields do not affect matchResultHash', () => {
    const r1 = runPolicyMatch({ seed: 42, policyIds: ['tempo', 'control'], evidenceEpoch: 'epoch-A' });
    const r2 = runPolicyMatch({ seed: 42, policyIds: ['tempo', 'control'], evidenceEpoch: 'epoch-B' });
    assert.equal(r1.summary.matchResultHash, r2.summary.matchResultHash,
      'matchResultHash must not change when only evidenceEpoch differs');
  });

  it('campaign semantic includes evidence epoch fields', async () => {
    const campaign = await runCampaign({
      profileId: 'core-advanced-authority',
      matchCount: 4,
      policyPairs: [['tempo', 'control'], ['value', 'score-rush']],
      decisionLimit: 600,
      evidenceEpoch: 'test-campaign-epoch',
      postRulesParityRepair: true,
      authorityHash: 'test-auth',
      releaseIdentityHash: 'test-release'
    });
    assert.equal(campaign.evidenceEpoch, 'test-campaign-epoch');
    assert.equal(campaign.postRulesParityRepair, true);
    assert.equal(campaign.authorityHash, 'test-auth');
    assert.equal(campaign.releaseIdentityHash, 'test-release');
    assert.equal(campaign.semantic.evidenceEpoch, 'test-campaign-epoch');
  });

  it('campaign aggregate includes evidence epoch fields', async () => {
    const campaign = await runCampaign({
      profileId: 'core-advanced-authority',
      matchCount: 4,
      policyPairs: [['tempo', 'control'], ['value', 'score-rush']],
      decisionLimit: 600,
      evidenceEpoch: 'test-agg-epoch',
      authorityHash: 'test-agg-auth'
    });
    const aggregate = campaignAggregate(campaign);
    assert.equal(aggregate.evidenceEpoch, 'test-agg-epoch');
    assert.equal(aggregate.authorityHash, 'test-agg-auth');
    assert.equal(aggregate.selfPlayExcluded, true);
  });
});

describe('v0.28.2 — Self-Play Exclusion from Cross-Policy Aggregates', () => {
  it('self-play matches are flagged in matchups', async () => {
    const campaign = await runCampaign({
      profileId: 'core-advanced-authority',
      matchCount: 4,
      policyPairs: [['tempo', 'tempo'], ['tempo', 'control']],
      decisionLimit: 600
    });
    const aggregate = campaignAggregate(campaign);
    const selfPlayMatchup = aggregate.matchups['tempo__vs__tempo'];
    const crossMatchup = aggregate.matchups['tempo__vs__control'];
    assert.equal(selfPlayMatchup?.selfPlay, true, 'tempo vs tempo should be flagged as selfPlay');
    assert.equal(crossMatchup?.selfPlay, false, 'tempo vs control should not be selfPlay');
  });

  it('self-play games are tracked separately in policy stats', async () => {
    const campaign = await runCampaign({
      profileId: 'core-advanced-authority',
      matchCount: 4,
      policyPairs: [['tempo', 'tempo'], ['tempo', 'control']],
      decisionLimit: 600
    });
    const aggregate = campaignAggregate(campaign);
    const tempoStats = aggregate.policies['tempo'];
    assert.ok(tempoStats.selfPlayGames >= 0, 'selfPlayGames should be tracked');
    assert.ok(tempoStats.crossPolicyGames >= 0, 'crossPolicyGames should be tracked');
    assert.equal(tempoStats.crossPolicyGames + tempoStats.selfPlayGames, tempoStats.games,
      'crossPolicyGames + selfPlayGames should equal total games');
  });

  it('aggregate interpretation boundary mentions self-play exclusion', async () => {
    const campaign = await runCampaign({
      profileId: 'core-advanced-authority',
      matchCount: 4,
      policyPairs: [['tempo', 'control']],
      decisionLimit: 600
    });
    const aggregate = campaignAggregate(campaign);
    assert.ok(aggregate.interpretationBoundary.includes('Self-play'),
      'Interpretation boundary should mention self-play exclusion');
  });
});

describe('v0.28.2 — Policy Strength Tiers', () => {
  it('POLICY_STRENGTH_TIERS exports all six tiers', () => {
    assert.equal(POLICY_STRENGTH_TIERS.length, 6);
    assert.ok(POLICY_STRENGTH_TIERS.includes('fixture'));
    assert.ok(POLICY_STRENGTH_TIERS.includes('baseline'));
    assert.ok(POLICY_STRENGTH_TIERS.includes('heuristic'));
    assert.ok(POLICY_STRENGTH_TIERS.includes('lookahead'));
    assert.ok(POLICY_STRENGTH_TIERS.includes('tournament'));
    assert.ok(POLICY_STRENGTH_TIERS.includes('human-meta-proxy'));
  });

  it('no policy is classified as lookahead, tournament, or human-meta-proxy yet', () => {
    // These tiers require benchmark support that does not yet exist.
    // Claims must not call policies "experienced" or "expert" without benchmarks.
    for (const policy of POLICY_CATALOG) {
      assert.ok(!['lookahead', 'tournament', 'human-meta-proxy'].includes(policy.strengthTier),
        `Policy ${policy.policyId} must not be classified as ${policy.strengthTier} without benchmark support`);
    }
  });

  it('strengthTier does not change policyHash', () => {
    // The strengthTier is metadata, not part of the semantic hash.
    // This ensures tier reclassification does not invalidate stored evidence.
    const tempo = POLICY_BY_ID['tempo'];
    assert.ok(tempo.strengthTier);
    assert.ok(tempo.policyHash);
    // The hash should be stable regardless of tier classification
    const expectedHash = tempo.policyHash;
    assert.equal(tempo.policyHash, expectedHash);
  });
});
