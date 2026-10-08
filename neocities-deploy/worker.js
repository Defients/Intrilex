import { BROWSER_CAPACITY, assertBrowserCapacity, evidenceBudget, jsonBytes, runAcknowledgedCampaign } from './evolution/browser-capacity.mjs?v=5e0a78513ea5';
import { RULES_VERSION } from './version.js?v=5e0a78513ea5';
const engineModule = import('./engine/browser-entry.js?v=5e0a78513ea5');
const autonomyModule = import('./autonomy-runtime.js?v=5e0a78513ea5');
const analyticsModule = import('./browser-analytics.js?v=5e0a78513ea5');
let strategyStudyAbort=null;
// Streaming aggregation accumulator — the main thread posts
// run-autonomy-aggregate-begin, any number of -chunk messages, then -finish.
// Bounded by the analysis union (transient, worker-scoped) rather than by
// main-thread UI state.
let _aggregateChunks=null, _aggregateBudget=null;
let campaignCredit=null;

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
  if(type==='autonomy-campaign-ack'){
    const credit=campaignCredit,x=event.data;
    if(credit && JSON.stringify(x.execution)===JSON.stringify(credit.execution) && x.workerIndex===credit.workerIndex && x.batchSequence===credit.batchSequence){campaignCredit=null;clearTimeout(credit.timer);credit.resolve();}
    return;
  }
  if(type==='cancel-strategy-study'){strategyStudyAbort?.abort();return;}
  if(type==='run-strategy-study'||type==='run-information-study'){
    const token=event.data.token??event.data.plan.artifactId;
    strategyStudyAbort=new AbortController();
    try {
      const auto=await autonomyModule,{IntrilexEngine}=await engineModule,{executeStrategyBranch}=await import('./evolution/strategy-branch.mjs?v=5e0a78513ea5'),{validateCheckpoint}=await import('./evolution/evolution-domain.mjs?v=5e0a78513ea5'),{LAB_IDENTITY}=await import('./evolution/identity.mjs?v=5e0a78513ea5'),engine=new IntrilexEngine();
      const input=event.data;
      const authority={createState:auto.createState,execute:(state,command)=>engine.execute(state,command),view:auto.strictView,validateCheckpoint,
        frame:state=>{const advanced=auto.advance(state,256),actions=advanced.legalActionFrame?.actions??[];return {...advanced,policyActions:actions.map(a=>auto.actionView(a,input.event.identity.rulesProfile)),resolve:id=>actions.find(a=>a.actionId===id)?.command};}};
      let study;
      if(type==='run-information-study'){
        const {prepareInformationStudy,executeInformationStudy}=await import('./evolution/strategy-information.mjs?v=5e0a78513ea5');
        const prepared=prepareInformationStudy({...input,identity:LAB_IDENTITY,authority});
        self.postMessage({type:'information-plan',token,...prepared});
        await new Promise((resolve,reject)=>{const receive=e=>{if(e.data.type==='information-plan-committed'&&e.data.token===token){self.removeEventListener('message',receive);resolve();}if(e.data.type==='cancel-strategy-study'){self.removeEventListener('message',receive);reject(new Error('INFORMATION_PLAN_CANCELLED'));}};self.addEventListener('message',receive);});
        study=await executeInformationStudy({...prepared,event:input.event,checkpoints:input.checkpoints,identity:LAB_IDENTITY,authority,continueMatch:config=>auto.runBrowserPolicyMatch(config),signal:strategyStudyAbort.signal,onProgress:p=>self.postMessage({type:'strategy-progress',token,...p})});
      }else study=await executeStrategyBranch({event:input.event,replay:input.replay,checkpoints:input.checkpoints,plan:input.plan,identity:LAB_IDENTITY,authority,
        continueMatch:config=>auto.runBrowserPolicyMatch(config),signal:strategyStudyAbort.signal,onProgress:p=>self.postMessage({type:'strategy-progress',token,...p})});
      self.postMessage({type:'strategy-study',token,study});
    }catch(error){self.postMessage({type:'strategy-fault',token,error:error.message});}
    finally{strategyStudyAbort=null;}
    return;
  }
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
      const cfg=event.data.config??{};assertBrowserCapacity(cfg);
      if(cfg.batchSize)throw new Error('CAMPAIGN_ACK_PROTOCOL_REQUIRED');
      // Batched mode: emit bounded autonomy-campaign-batch messages; the
      // worker never holds more than one batch plus the folded core.
      if (cfg.batchSize) {
        const campaignResult=runBrowserCampaign({...cfg,onBatch:batch=>self.postMessage({type:'autonomy-campaign-batch',workerIndex:event.data.workerIndex??0,ordinalStart:batch.ordinalStart,ordinalEnd:batch.ordinalEnd,summariesJson:JSON.stringify(batch.summaries)})},(progress)=>self.postMessage({type:'autonomy-campaign-progress',progress}));
        const payload={type:'autonomy-campaign-result',ok:true,workerIndex:event.data.workerIndex??0,result:{...campaignResult,durationMs:Math.round(performance.now()-started)}};
        self.postMessage(payload);
        return;
      }
      const campaignResult=runBrowserCampaign(cfg,(progress)=>self.postMessage({type:'autonomy-campaign-progress',progress}));
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
  if (type === 'run-evolution-game') {
    const { epoch, workerIndex, ordinal } = event.data;
    try {
      const { runBrowserPolicyMatch } = await autonomyModule;
      const domain = await import('./evolution/evolution-domain.mjs?v=5e0a78513ea5');
      const { LAB_IDENTITY } = await import('./evolution/identity.mjs?v=5e0a78513ea5');
      const run = event.data.run;
      domain.assertIdentity(run.identity, LAB_IDENTITY);
      domain.labConfig(run.config);assertBrowserCapacity(run.config);
      run.checkpoints.forEach(cp => domain.validateCheckpoint(cp, LAB_IDENTITY));
      const plan = domain.gamePlan(run.config, ordinal);
      let evidence;
      const started = performance.now();
      try {
        const summary = runBrowserPolicyMatch({ seed: plan.seed, ordinal, policyIds: plan.policyIds, checkpointIds:(plan.swapped ? [...run.checkpoints].reverse() : run.checkpoints).map(cp=>cp.checkpointId), revisionIds:(plan.swapped ? [...(run.arenaProfiles?.snapshots ?? [null,null])].reverse() : (run.arenaProfiles?.snapshots ?? [null,null])).map(s=>s?.profile?.activeRevisionId ?? null), subjectSnapshots:plan.swapped ? [...(run.arenaProfiles?.snapshots ?? [null,null])].reverse() : (run.arenaProfiles?.snapshots ?? [null,null]), policyStates:(plan.swapped ? [...run.checkpoints].reverse() : run.checkpoints).map(cp=>cp.schemaVersion===2 ? cp.policyState : null), adaptiveConfigs:(plan.swapped ? [...run.checkpoints].reverse() : run.checkpoints).map(cp=>cp.schemaVersion===2 ? (cp.adaptive ?? null) : null),
          profileId: run.config.profileId, decisionLimit: run.config.decisionLimit, orchestrationCommandLimit: run.config.orchestrationCommandLimit, recordReplay: true, strategicTelemetryEnabled:true,strategicTrace:run.config.strategicTrace===true, ...(run.config.strategicTrace ? {strategyIdentities:await import('./evolution/strategy-contracts.mjs?v=5e0a78513ea5').then(m=>[1,2].map(seat=>m.decisionIdentity(run,plan,seat)))}:{}) });
        const record = domain.gameEvidence(summary, plan, run, summary.replay, performance.now()-started);
        const keep = event.data.retainReplay || !domain.CLEAN_REASONS.includes(record.terminationReason);
        evidence = { record, replay: keep ? summary.replay : null };
      } catch (error) { evidence = { record: domain.gameFault(error, plan, run, performance.now()-started), replay: null }; }
      self.postMessage({ type: 'evolution-evidence', epoch, workerIndex, evidence });
    } catch (error) { self.postMessage({ type: 'evolution-fault', epoch, workerIndex, error: error?.message ?? String(error) }); }
    return;
  }
  if (type === 'inspect-evolution-replay') {
    try {
      const domain = await import('./evolution/evolution-domain.mjs?v=5e0a78513ea5');
      const { LAB_IDENTITY } = await import('./evolution/identity.mjs?v=5e0a78513ea5');
      const runtime = await autonomyModule;
      const { IntrilexEngine, hashCanonical } = await engineModule;
      const run = domain.validateArtifact(event.data.artifact, LAB_IDENTITY);
      const evidence = run.replays.find(r => r.replayId === event.data.replayId);
      const record = run.records.find(r => r.ordinal === evidence?.ordinal);
      const replay = domain.validateReplay(evidence, record, run);
      const initial = runtime.createState({ profileId: run.config.profileId, playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], enabledModules: [], seed: record.seed });
      if (hashCanonical(initial) !== record.initialStateHash) throw new Error('SEED_INITIAL_STATE_MISMATCH');
      const engine = new IntrilexEngine();
      let state = initial;
      const steps = [{ index: 0, revision: state.revision, turn: state.fullTurnSequence, phase: state.phase, scores: { P1: 0, P2: 0 }, command: 'INITIAL', events: [] }];
      for (const [index, command] of replay.commands.entries()) {
        const result = engine.execute(state, command);
        if (!result.accepted && !(record.terminationReason === 'ENGINE_REJECTION' && index === replay.commands.length-1)) throw new Error(`REPLAY_REJECTED_AT_${index}`);
        state = result.state;
        steps.push({ index: index+1, revision: state.revision, turn: state.fullTurnSequence, phase: state.phase,
          scores: { P1: runtime.strictView(state, 'P1').own.securedPoints, P2: runtime.strictView(state, 'P2').own.securedPoints },
          command: command.type, actor: command.actorId ?? null, events: result.events.map(e => e.type) });
      }
      if (hashCanonical(state) !== record.finalStateHash) throw new Error('REPLAY_FINAL_STATE_MISMATCH');
      self.postMessage({ type: 'evolution-inspection', ok: true, replayId: evidence.replayId, finalStateHash: record.finalStateHash, steps });
    } catch (error) { self.postMessage({ type: 'evolution-inspection', ok: false, error: error?.message ?? String(error) }); }
    return;
  }
  if (type === 'run-autonomy-segment') {
    const post=x=>self.postMessage({...x,...(event.data.execution?{execution:event.data.execution}:{})});
    try {
      const { runBrowserCampaign, createCampaignCoreCollector } = await autonomyModule;
      const cfg=event.data.config??{};
      assertBrowserCapacity(cfg);
      // Batched mode: each segment streams bounded batches; committed
      // evidence flows to the store one batch at a time.
      if (cfg.batchSize) {
        const campaignResult=await runAcknowledgedCampaign(cfg,{runCampaign:runBrowserCampaign,collector:createCampaignCoreCollector(),
          send:batch=>new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{campaignCredit=null;reject(new Error('CAMPAIGN_COMMIT_ACK_TIMEOUT'));},180000);
            campaignCredit={resolve,timer,execution:event.data.execution,workerIndex:event.data.workerIndex,batchSequence:batch.batchSequence};
            post({type:'autonomy-campaign-batch',workerIndex:event.data.workerIndex,...batch});
          }),onProgress:progress=>post({type:'autonomy-campaign-progress',progress:{...progress,workerIndex:event.data.workerIndex}})});
        post({ type:'autonomy-segment-result', ok:true, workerIndex:event.data.workerIndex, result:campaignResult });
        return;
      }
      const campaignResult=runBrowserCampaign(cfg,(progress)=>post({type:'autonomy-campaign-progress',progress:{completed:progress.completed,total:progress.total,workerIndex:event.data.workerIndex}}));
      post({ type:'autonomy-segment-result', ok:true, workerIndex:event.data.workerIndex, summariesJson:JSON.stringify(campaignResult.summaries??[]) });
    } catch(error){ post({ type:'autonomy-segment-result', ok:false, workerIndex:event.data.workerIndex, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-mutation-segment') {
    // Rule Mutation Chamber: executes a pre-built list of matched A/B match
    // specs (built by mutation-domain.mjs in the workspace). Each spec already
    // carries its arm identity, seed, seat order, policies and scoped rule
    // overrides — the worker never derives seeds or mutates rules itself.
    try {
      const { runBrowserPolicyMatch } = await autonomyModule;
      const specs = event.data.specs ?? [];
      const results = [];
      for (const spec of specs) {
        try {
          const summary = runBrowserPolicyMatch({
            seed: spec.seed, ordinal: spec.ordinal, profileId: spec.profileId,
            seatOrder: spec.seatOrder, seatSwapped: spec.seatSwapped, pairedRunId: spec.pairedRunId, pairedLeg: spec.pairedLeg ?? null,
            policyIds: spec.policyIds, decisionLimit: spec.decisionLimit,
            ...(spec.ruleOverrides ? { ruleOverrides: spec.ruleOverrides } : {}),
          });
          results.push({ arm: spec.arm, pairIndex: spec.pairIndex, pairedRunId: spec.pairedRunId, specOrdinal: spec.ordinal, ok: true, summary });
        } catch (error) {
          // A failed game stays visible — never silently dropped.
          results.push({ arm: spec.arm, pairIndex: spec.pairIndex, pairedRunId: spec.pairedRunId, specOrdinal: spec.ordinal, seed: spec.seed, policyId: spec.policyId, ruleOverrides: spec.ruleOverrides ?? null, ok: false, error: error?.message ?? String(error) });
        }
        self.postMessage({ type: 'mutation-segment-progress', workerIndex: event.data.workerIndex, completed: results.length, total: specs.length });
      }
      self.postMessage({ type: 'mutation-segment-result', ok: true, workerIndex: event.data.workerIndex, resultsJson: JSON.stringify(results) });
    } catch (error) { self.postMessage({ type: 'mutation-segment-result', ok: false, workerIndex: event.data.workerIndex, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-autonomy-aggregate-begin') {
    _aggregateChunks=[];_aggregateBudget=evidenceBudget();
    return;
  }
  if (type === 'run-autonomy-aggregate-chunk') {
    try {
      if(!_aggregateChunks)throw new Error('AGGREGATE_NOT_STARTED');
      if(jsonBytes(event.data.summariesJson)>BROWSER_CAPACITY.batchBytes)throw new Error('AGGREGATE_PAGE_TOO_LARGE');
      const chunk=JSON.parse(event.data.summariesJson??'[]');_aggregateBudget.add(chunk);_aggregateChunks.push(...chunk);
      self.postMessage({type:'autonomy-aggregate-ack',sequence:event.data.sequence,metrics:_aggregateBudget.metrics});
    }catch(error){_aggregateChunks=null;self.postMessage({type:'autonomy-aggregate-result',ok:false,error:error.message});}
    return;
  }
  if (type === 'run-autonomy-aggregate-finish') {
    try {
      const { campaignAggregate, buildObservatoryAnalytics } = await analyticsModule;
      const summaries=_aggregateChunks??[];
      _aggregateChunks=null;
      const semantic=event.data.semantic??{};
      const aggregate=campaignAggregate(summaries,semantic);
      const observatory=buildObservatoryAnalytics({summaries,aggregate});
      self.postMessage({ type:'autonomy-aggregate-result', ok:true, aggregateJson:JSON.stringify(aggregate), observatoryJson:JSON.stringify(observatory) });
    } catch(error){ _aggregateChunks=null; self.postMessage({ type:'autonomy-aggregate-result', ok:false, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-autonomy-aggregate') {
    try {
      const { campaignAggregate, buildObservatoryAnalytics } = await analyticsModule;
      const summaries=JSON.parse(event.data.summariesJson??'[]');evidenceBudget().add(summaries);
      const semantic=event.data.semantic??{};
      const aggregate=campaignAggregate(summaries,semantic);
      const observatory=buildObservatoryAnalytics({summaries,aggregate});
      self.postMessage({ type:'autonomy-aggregate-result', ok:true, aggregateJson:JSON.stringify(aggregate), observatoryJson:JSON.stringify(observatory), summariesJson:JSON.stringify(summaries) });
    } catch(error){ self.postMessage({ type:'autonomy-aggregate-result', ok:false, error:error?.stack??String(error) }); }
    return;
  }
  if (type === 'run-counterfactual') {
    try {
      const { runCounterfactualBranch } = await import('./decision-intelligence.js?v=5e0a78513ea5');
      const result = runCounterfactualBranch(event.data.config ?? {});
      self.postMessage({ type: 'counterfactual-result', ok: true, result });
    } catch (error) { self.postMessage({ type: 'counterfactual-result', ok: false, error: error?.stack ?? String(error) }); }
    return;
  }
  if (type === 'run-paired-counterfactual') {
    try {
      const { runPairedCounterfactual } = await import('./decision-intelligence.js?v=5e0a78513ea5');
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
      const { getCheckpointLegalActions } = await import('./decision-intelligence.js?v=5e0a78513ea5');
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
      const { getCheckpointLegalActions, runCounterfactualBranch } = await import('./decision-intelligence.js?v=5e0a78513ea5');
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
      const { diagnosePolicy } = await import('./decision-intelligence.js?v=5e0a78513ea5');
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
