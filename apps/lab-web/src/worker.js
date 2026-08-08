import { RULES_VERSION } from './version.js';
const engineModule = import('./engine/browser-entry.js');
const autonomyModule = import('./autonomy-runtime.js');
const analyticsModule = import('./browser-analytics.js');

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

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
      const { runCounterfactualBranch } = await import('./decision-intelligence.js');
      const result = runCounterfactualBranch(event.data.config ?? {});
      self.postMessage({ type: 'counterfactual-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'counterfactual-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-paired-counterfactual') {
    try {
      const { runPairedCounterfactual } = await import('./decision-intelligence.js');
      const result = runPairedCounterfactual(event.data.config ?? {});
      self.postMessage({ type: 'paired-counterfactual-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'paired-counterfactual-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-diagnostics') {
    try {
      const { diagnosePolicy } = await import('./decision-intelligence.js');
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
