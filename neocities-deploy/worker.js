import { RULES_VERSION } from './version.js?v=659a089d50b6';
const engineModule = import('./engine/browser-entry.js?v=659a089d50b6');
const autonomyModule = import('./autonomy-runtime.js?v=659a089d50b6');
const analyticsModule = import('./browser-analytics.js?v=659a089d50b6');

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

// Inline bootstrap-style CI for the mean (avoids @intrilex/statistics node:crypto dependency)
function bootstrapMeanCIInline(values, _alpha = 0.05) {
  const clean = (values ?? []).filter(Number.isFinite);
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.length > 1 ? clean.reduce((s, v) => s + (v - mean) ** 2, 0) / (clean.length - 1) : 0;
  const se = Math.sqrt(variance) / Math.sqrt(clean.length);
  const n = clean.length;
  const tCritical = n >= 30 ? 1.959963984540054 : n >= 10 ? 2.262 : n >= 5 ? 2.776 : 3.182;
  const margin = tCritical * se;
  return [Number((mean - margin).toFixed(4)), Number((mean + margin).toFixed(4))];
}

self.onmessage = async (event) => {
  const { type, records, fixtureIds } = event.data ?? {};
  if (type === 'aggregate') {
    const result = records.reduce((acc, item) => {
      acc.replays += 1; acc.commands += item.commandCount; acc.events += item.eventCount; acc.rejected += item.rejectedCount;
      return acc;
    }, { replays: 0, commands: 0, events: 0, rejected: 0 });
    self.postMessage({ type: 'aggregate-result', result }); return;
  }
  if (type === 'run-autonomy-match') {
    try {
      const { runBrowserPolicyMatch } = await autonomyModule;
      const cfg = event.data.config ?? {};
      if (event.data.enableTraces) cfg.decisionTracesEnabled = true;
      const result = runBrowserPolicyMatch(cfg);
      // runBrowserPolicyMatch returns the summary object directly (winner, winningSeat, etc.
      // are top-level fields), not wrapped in { summary, decisions }. Wrap it here so the
      // tournament consumer can access result.result.summary.winner.
      const payload = { type:'autonomy-match-result', ok:true, result: { summary: result, decisions: result.decisions ?? [] } };
      if (result.decisionTraces) payload.result.decisionTraces = result.decisionTraces;
      if (result.replay) payload.result.replay = result.replay;
      self.postMessage(payload);
    } catch(error){ self.postMessage({ type:'autonomy-match-result', ok:false, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-autonomy-campaign') {
    try {
      const { runBrowserCampaign, LAB_VERSION } = await autonomyModule;
      const { campaignAggregate, buildObservatoryAnalytics } = await analyticsModule;
      const started=performance.now();
      const campaignResult=runBrowserCampaign(event.data.config??{},(progress)=>self.postMessage({type:'autonomy-campaign-progress',progress}));
      const summaries=campaignResult.summaries??[];
      const semantic={experimentHash:campaignResult.canonicalResultHash,profileId:campaignResult.profileId,engineVersion:campaignResult.engineVersion,rulesVersion:RULES_VERSION,labVersion:LAB_VERSION,canonicalResultHash:campaignResult.canonicalResultHash};
      const aggregate=campaignAggregate(summaries,semantic);
      const observatory=buildObservatoryAnalytics({summaries,aggregate});
      const { summaries:_s, ...resultCore } = campaignResult;
      const payload = { type:'autonomy-campaign-result', ok:true, result:{...resultCore,durationMs:Math.round(performance.now()-started)}, aggregateJson:JSON.stringify(aggregate), observatoryJson:JSON.stringify(observatory), summariesJson:JSON.stringify(summaries) };
      self.postMessage(payload);
    } catch(error){ self.postMessage({ type:'autonomy-campaign-result', ok:false, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-autonomy-segment') {
    try {
      const { runBrowserCampaign } = await autonomyModule;
      const cfg=event.data.config??{};
      const campaignResult=runBrowserCampaign(cfg,(progress)=>self.postMessage({type:'autonomy-campaign-progress',progress:{completed:progress.completed,total:progress.total,workerIndex:event.data.workerIndex}}));
      self.postMessage({ type:'autonomy-segment-result', ok:true, workerIndex:event.data.workerIndex, summariesJson:JSON.stringify(campaignResult.summaries??[]) });
    } catch(error){ self.postMessage({ type:'autonomy-segment-result', ok:false, workerIndex:event.data.workerIndex, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-autonomy-aggregate') {
    try {
      const { campaignAggregate, buildObservatoryAnalytics } = await analyticsModule;
      const summaries=JSON.parse(event.data.summariesJson??'[]');
      const semantic=event.data.semantic??{};
      const aggregate=campaignAggregate(summaries,semantic);
      const observatory=buildObservatoryAnalytics({summaries,aggregate});
      self.postMessage({ type:'autonomy-aggregate-result', ok:true, aggregateJson:JSON.stringify(aggregate), observatoryJson:JSON.stringify(observatory), summariesJson:JSON.stringify(summaries) });
    } catch(error){ self.postMessage({ type:'autonomy-aggregate-result', ok:false, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-counterfactual') {
    try {
      const { runCounterfactualBranch } = await import('./decision-intelligence.js?v=659a089d50b6');
      const result = runCounterfactualBranch(event.data.config ?? {});
      self.postMessage({ type: 'counterfactual-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'counterfactual-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-paired-counterfactual') {
    try {
      const { runPairedCounterfactual } = await import('./decision-intelligence.js?v=659a089d50b6');
      const cfg = event.data.config ?? {};
      // Load the authorized replay if not already provided in config
      if (!cfg.replay && cfg.fixtureId) {
        const replayUrl = cfg.replayKind === 'autonomy'
          ? `data/autonomy/replays/authorized/${cfg.fixtureId}.authorized.replay.json`
          : `data/replays/authorized/${cfg.fixtureId}.json`;
        cfg.replay = await fetchJson(replayUrl);
      }
      const result = runPairedCounterfactual(cfg);
      self.postMessage({ type: 'paired-counterfactual-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'paired-counterfactual-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'get-legal-actions') {
    try {
      const { getCheckpointLegalActions } = await import('./decision-intelligence.js?v=659a089d50b6');
      const { replay, checkpointIndex, profileId, fixtureId, replayKind } = event.data;
      let replayObj = replay;
      if (!replayObj && fixtureId) {
        const replayUrl = replayKind === 'autonomy'
          ? `data/autonomy/replays/authorized/${fixtureId}.authorized.replay.json`
          : `data/replays/authorized/${fixtureId}.json`;
        replayObj = await fetchJson(replayUrl);
      }
      const result = getCheckpointLegalActions(replayObj, checkpointIndex, profileId);
      self.postMessage({ type: 'legal-actions-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'legal-actions-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-all-actions') {
    try {
      const { getCheckpointLegalActions, runCounterfactualBranch } = await import('./decision-intelligence.js?v=659a089d50b6');
      const { replay, checkpointIndex, profileId, fixtureId, replayKind, rolloutCount, continuationPolicyIds, baseSeed, seatOrder, matchId } = event.data;
      let replayObj = replay;
      if (!replayObj && fixtureId) {
        const replayUrl = replayKind === 'autonomy'
          ? `data/autonomy/replays/authorized/${fixtureId}.authorized.replay.json`
          : `data/replays/authorized/${fixtureId}.json`;
        replayObj = await fetchJson(replayUrl);
      }
      const legalInfo = getCheckpointLegalActions(replayObj, checkpointIndex, profileId);
      if (legalInfo.status !== 'OK') {
        self.postMessage({ type: 'all-actions-result', ok: false, error: `Legal actions failed: ${legalInfo.reason ?? 'unknown'}` });
        return;
      }
      const historicalActionId = legalInfo.selectedActionId;
      const rankings = [];
      for (const action of legalInfo.legalActions) {
        const cfg = {
          replay: replayObj,
          checkpointIndex,
          profileId,
          selectedActionId: historicalActionId,
          alternativeActionId: action.actionId,
          rolloutCount,
          continuationPolicyIds,
          baseSeed: baseSeed ?? legalInfo.baseSeed,
          seatOrder: seatOrder ?? legalInfo.seatOrder,
          matchId: matchId ?? legalInfo.matchId,
          focalSeat: 1,
        };
        const branchResult = runCounterfactualBranch(cfg);
        const sum = branchResult.summary ?? {};
        rankings.push({
          actionId: action.actionId,
          isHistorical: action.isHistorical,
          meanFocalUtility: sum.meanFocalUtility,
          focalWinRate: sum.focalWinRate,
          completedCount: sum.completedCount,
          totalRollouts: sum.totalRollouts,
          utilityCI: sum.focalUtilityDistribution?.length >= 2 ? bootstrapMeanCIInline(sum.focalUtilityDistribution) : null,
        });
        self.postMessage({ type: 'all-actions-progress', completed: rankings.length, total: legalInfo.legalActions.length });
      }
      // Compute utility delta relative to historical
      const historical = rankings.find(r => r.isHistorical);
      const historicalUtil = historical?.meanFocalUtility ?? 0;
      for (const r of rankings) {
        r.utilityDelta = r.meanFocalUtility != null ? r.meanFocalUtility - historicalUtil : null;
      }
      // Sort by mean utility descending
      rankings.sort((a, b) => (b.meanFocalUtility ?? -Infinity) - (a.meanFocalUtility ?? -Infinity));
      self.postMessage({
        type: 'all-actions-result',
        ok: true,
        result: { rankings, checkpointIndex, rolloutCount, continuationPolicyIds, historicalActionId },
      });
    } catch (error) { self.postMessage({ type: 'all-actions-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-diagnostics') {
    try {
      const { diagnosePolicy } = await import('./decision-intelligence.js?v=659a089d50b6');
      const summaries = JSON.parse(event.data.summariesJson ?? '[]');
      const decisions = JSON.parse(event.data.decisionsJson ?? '[]');
      const baseline = diagnosePolicy(summaries, decisions, event.data.baselinePolicyId);
      const candidate = diagnosePolicy(summaries, decisions, event.data.candidatePolicyId);
      self.postMessage({ type: 'diagnostics-result', ok: true, baseline, candidate });
    } catch (error) { self.postMessage({ type: 'diagnostics-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'verify-corpus') {
    try {
      const { verifyCertifiedReplay, hashCanonical } = await engineModule;
      const summaries = []; const started = performance.now();
      for (const fixtureId of fixtureIds) {
        const replay = await fetchJson(`data/certified-replays/${encodeURIComponent(fixtureId)}.certified.replay.json`);
        const verified = verifyCertifiedReplay(replay);
        summaries.push({ fixtureId, contentHash: replay.contentHash, finalStateHash: replay.finalStateHash, accepted: verified.accepted.length, events: verified.events.length });
      }
      self.postMessage({ type: 'verify-corpus-result', ok: true, result: { replayCount:summaries.length, commandCount:summaries.reduce((sum,item)=>sum+item.accepted,0), eventCount:summaries.reduce((sum,item)=>sum+item.events,0), aggregateHash:hashCanonical(summaries), durationMs:Math.round(performance.now()-started) }});
    } catch (error) { self.postMessage({ type: 'verify-corpus-result', ok: false, error: error?.stack ?? String(error) }); }
  }
};
