import { strategyDigest, STRATEGY_CONTRACTS, verifyStrategy, strategyFail } from '../evolution/strategy-contracts.mjs';
import { validateStrategyEvidence, eventIndexRow, strategyScopeKey, strategyBundle, validateStrategyBundle } from '../evolution/strategy-evidence.mjs';
import { createStrategyAggregate, strategyEventMatches, validateStrategyClaim } from '../evolution/strategy-analysis.mjs';

export const STRATEGY_STORAGE = Object.freeze({database:'intrilex-strategy-intelligence',version:1,maxGameBytes:8*1024*1024,maxPortableBytes:40*1024*1024,decisionPage:40});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const storageError=error=>error?.name==='QuotaExceededError'?new Error('STRATEGY_STORAGE_PRESSURE: export evidence or free browser storage, then retry.'):error;
export class StrategyStore {
  constructor(factory=globalThis.indexedDB){this.factory=factory;this.db=null;this.opening=null;}
  async open(){
    if(this.db)return this.db;if(this.opening)return this.opening.promise;
    if(!this.factory)strategyFail('STRATEGY_INDEXEDDB_UNAVAILABLE');
    const pending={promise:null,reject:null};this.opening=pending;
    pending.promise=new Promise((resolve,reject)=>{
      pending.reject=reject;
      const fail=error=>{if(this.opening===pending)this.opening=null;reject(error);};
      let request;try{request=this.factory.open(STRATEGY_STORAGE.database,STRATEGY_STORAGE.version);}catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        if(this.opening!==pending){request.transaction.abort();return;}
        const db=request.result;
        for(const [name,keyPath] of [['evidence','artifactId'],['sources','artifactId'],['events','eventId'],['replays','replayHash'],['studies','artifactId'],['claims','artifactId'],['archives','archiveId']])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath});
        const events=request.transaction.objectStore('events');
        if(!events.indexNames.contains('subject'))events.createIndex('subject','scopeKeys',{multiEntry:true});
        for(const [name,key] of [['cohort','cohortKey'],['policy','policyKey'],['matchup','matchupKey'],['maturity','maturityKey']])if(!events.indexNames.contains(name))events.createIndex(name,key);
        for(const [name,key] of [['cleanCohort','cleanCohortKey'],['cleanMaturity','cleanMaturityKey']])if(!events.indexNames.contains(name))events.createIndex(name,key);
      };
      request.onerror=()=>fail(request.error??new Error('STRATEGY_STORAGE_OPEN_FAILED'));
      request.onblocked=()=>fail(new Error('STRATEGY_STORAGE_BLOCKED: close another Intrilex tab and retry.'));
      request.onsuccess=()=>{const db=request.result;if(this.opening!==pending){db.close();return;}this.db=db;this.opening=null;db.onversionchange=()=>{db.close();if(this.db===db)this.db=null;};resolve(db);};
    });
    return pending.promise;
  }
  async get(name,key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),r=tx.objectStore(name).get(key);let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(storageError(tx.error??new Error('STRATEGY_STORAGE_READ_FAILED')));});}
  async count(name,index,key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),r=tx.objectStore(name).index(index).count(globalThis.IDBKeyRange.only(key));let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??new Error('STRATEGY_STORAGE_COUNT_FAILED'));});}
  async scan(name,{index,key,limit=Infinity,visit=()=>{}}={}){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(name,'readonly'),store=tx.objectStore(name),source=index?store.index(index):store;
      const req=source.openCursor(key===undefined?undefined:globalThis.IDBKeyRange.only(key));let count=0,diagnostic;
      req.onsuccess=()=>{const cursor=req.result;if(!cursor||count>=limit)return;try{const proceed=visit(cursor.value);count++;if(proceed!==false)cursor.continue();}catch(error){diagnostic=error;tx.abort();}};
      tx.oncomplete=()=>resolve(count);tx.onabort=()=>reject(diagnostic??storageError(tx.error??new Error('STRATEGY_STORAGE_READ_FAILED')));
    });
  }
  async insert(rows){
    const unique=new Map();
    for(const row of rows){const key=strategyDigest({store:row.store,key:row.key}),prior=unique.get(key);if(prior&&strategyDigest(prior.value)!==strategyDigest(row.value))strategyFail('STRATEGY_IMMUTABLE_CONFLICT');unique.set(key,row);}
    rows=[...unique.values()];
    if(!rows.length)return;
    const db=await this.open(),names=[...new Set(rows.map(r=>r.store))];
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(names,'readwrite');let diagnostic;
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(diagnostic??storageError(tx.error??new Error('STRATEGY_STORAGE_ABORTED')));tx.onerror=()=>{};
      for(const row of rows){const store=tx.objectStore(row.store),get=store.get(row.key);get.onsuccess=()=>{if(get.result){
        // Event identity de-duplicates imported copies and mirrored source imports.
        const old=row.store==='events'?get.result.event:row.store==='sources'?{...get.result,origin:null}:get.result,newValue=row.store==='events'?row.value.event:row.store==='sources'?{...row.value,origin:null}:row.value;
        if(strategyDigest(old)!==strategyDigest(newValue)){diagnostic=new Error('STRATEGY_IMMUTABLE_CONFLICT');tx.abort();}
      }else store.add(row.value);};}
    });
  }
  async addEvidence(evidence,replay=null,{retainEvents=true,originOverride=null}={}){
    validateStrategyEvidence(evidence);
    if(bytes(evidence)>STRATEGY_STORAGE.maxGameBytes)strategyFail('STRATEGY_GAME_STORAGE_BUDGET');
    if(replay && (strategyDigest({initialState:replay.initialState,commands:replay.commands})!==evidence.replayHash || bytes(replay)>STRATEGY_STORAGE.maxPortableBytes))strategyFail('STRATEGY_REPLAY_DIGEST');
    const s=evidence.source;
    const meta={artifactId:evidence.artifactId,...s,origin:originOverride??s.origin,fidelity:evidence.fidelity,clean:evidence.clean,eventCount:evidence.events.length,retainedEvents:retainEvents,replayHash:evidence.replayHash,bytes:bytes(evidence),subjects:[...new Set(evidence.events.flatMap(e=>e.candidates.flatMap(c=>c.subjects)))].sort(),policyIds:[...new Set(evidence.events.map(e=>e.identity.policyId))],checkpointIds:evidence.checkpoints.map(c=>c.checkpointId),agentProfileIds:[...new Set(evidence.events.map(e=>e.identity.agentProfileId).filter(Boolean))],profileHeads:[...new Set(evidence.events.map(e=>e.identity.profileHead).filter(h=>h!==null))]};
    const rows=[{store:'evidence',key:evidence.artifactId,value:evidence},{store:'sources',key:evidence.artifactId,value:meta}];
    // Event rows are the indexed query path; envelope preserves portable evidence.
    const nextByActor=new Map();
    if(retainEvents)for(const event of [...evidence.events].reverse()){
      const row=eventIndexRow(event,evidence.artifactId,originOverride??s.origin);row.cohortKey=[s.fingerprint,s.rulesProfile,s.eraId];
      row.cleanCohortKey=[...row.cohortKey,event.outcomes.clean?'CLEAN':'FAULT'];row.cleanMaturityKey=[...row.cleanCohortKey,event.maturity.bucket];
      const next=nextByActor.get(event.actorId)??new Map();
      row.subsequent=Object.fromEntries([...next].map(([subject,ordinal])=>[subject,ordinal-event.decisionOrdinal]));
      for(const subject of event.candidates.find(c=>c.actionId===event.selectedActionId).subjects)next.set(subject,event.decisionOrdinal);
      nextByActor.set(event.actorId,next);
      rows.push({store:'events',key:row.eventId,value:row});
    }
    if(replay)rows.push({store:'replays',key:evidence.replayHash,value:{replayHash:evidence.replayHash,replay}});
    await this.insert(rows);return meta;
  }
  async listSources(){const rows=[];await this.scan('sources',{visit:row=>rows.push(row),limit:10000});return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  async aggregate(scope){
    const aggregate=createStrategyAggregate(scope);
    await this.scan('events',{index:'subject',key:strategyScopeKey(scope.fingerprint,scope.rulesProfile,scope.eraId,scope.subject),visit:row=>aggregate.add(row)});
    const result=aggregate.finish(),cohort=[scope.fingerprint,scope.rulesProfile,scope.eraId],filters=scope.filters??{};
    let total=0,phases=Object.fromEntries(result.timing.map(t=>[t.bucket,0]));
    if(!Object.keys(filters).length){[total,phases]=await Promise.all([this.count('events','cleanCohort',[...cohort,'CLEAN']),Promise.all(result.timing.map(async t=>[t.bucket,await this.count('events','cleanMaturity',[...cohort,'CLEAN',t.bucket])])).then(Object.fromEntries)]);}
    else {
      const indexed=filters.policyId?['policy',filters.policyId]:filters.opponentPolicyId?['matchup',filters.opponentPolicyId]:filters.maturity?['maturity',filters.maturity]:['cohort',null];
      await this.scan('events',{index:indexed[0],key:indexed[1]?[...cohort,indexed[1]]:cohort,visit:row=>{if(row.event.outcomes.clean&&strategyEventMatches(row.event,filters)){total++;phases[row.event.maturity.bucket]++;}}});
    }
    result.total.decisions=total;result.total.opportunityRate=total?result.total.opportunities/total:null;
    for(const t of result.timing){t.decisions=phases[t.bucket];t.opportunityRate=t.decisions?t.opportunities/t.decisions:null;}
    return result;
  }
  async decisions(scope){
    const result=[];
    await this.scan('events',{index:'subject',key:strategyScopeKey(scope.fingerprint,scope.rulesProfile,scope.eraId,scope.subject),visit:row=>{if(strategyEventMatches(row.event,scope.filters))result.push(row);return result.length<STRATEGY_STORAGE.decisionPage;}});
    return result;
  }
  async saveStudy(study,claims){verifyStrategy(study,STRATEGY_CONTRACTS.branch);claims.forEach(validateStrategyClaim);await this.insert([{store:'studies',key:study.artifactId,value:study},...claims.map(c=>({store:'claims',key:c.artifactId,value:c}))]);}
  async studies(scope){const rows=[];await this.scan('studies',{visit:row=>{if(row.plan.fingerprint===scope.fingerprint && row.plan.rulesProfile===scope.rulesProfile && row.plan.eraId===scope.eraId&&strategyEventMatches({identity:row.sourceIdentity,context:row.context,seat:row.seat,maturity:row.maturity},scope.filters))rows.push(row);},limit:1000});return rows;}
  async importedResearch(scope){const rows=[];await this.scan('archives',{visit:row=>{const s=row.payload.scope??row.payload.plan;if(s?.fingerprint===scope.fingerprint&&s.rulesProfile===scope.rulesProfile&&s.eraId===scope.eraId)rows.push(row);},limit:1000});return rows;}
  async exportBundle(scope){
    const evidence=[],replays=[],studies=await this.studies(scope),claims=[],seen=new Set();let size=0;
    const sources=(await this.listSources()).filter(s=>s.fingerprint===scope.fingerprint && s.rulesProfile===scope.rulesProfile && s.eraId===scope.eraId);
    for(const source of sources){const e=await this.get('evidence',source.artifactId);size+=bytes(e);if(size>STRATEGY_STORAGE.maxPortableBytes)strategyFail('STRATEGY_EXPORT_TOO_LARGE: export smaller source groups.');evidence.push(e);if(e.replayHash&&!seen.has(e.replayHash)){seen.add(e.replayHash);const r=await this.get('replays',e.replayHash);if(r){replays.push(r);size+=bytes(r);}}}
    await this.scan('claims',{visit:c=>{if(c.scope.fingerprint===scope.fingerprint&&c.scope.rulesProfile===scope.rulesProfile&&c.scope.eraId===scope.eraId)claims.push(c);}});
    const importedResearch=await this.importedResearch(scope),sourceOrigins=sources.map(s=>({artifactId:s.artifactId,origin:s.origin}));
    const bundle=strategyBundle({evidence,replays,studies,claims,importedResearch,sourceOrigins});if(bytes(bundle)>STRATEGY_STORAGE.maxPortableBytes)strategyFail('STRATEGY_EXPORT_TOO_LARGE');return bundle;
  }
  async importBundle(text){
    if(typeof text!=='string' || new TextEncoder().encode(text).byteLength>STRATEGY_STORAGE.maxPortableBytes)strategyFail('STRATEGY_IMPORT_BUDGET');
    const bundle=validateStrategyBundle(JSON.parse(text));
    // Import is an append-only copy with explicit origin, never trust-by-checksum.
    for(const e of bundle.evidence)await this.addEvidence(e,bundle.replays.find(r=>r.replayHash===e.replayHash)?.replay??null,{originOverride:'IMPORTED_UNVERIFIED'});
    const archives=[...bundle.importedResearch,...bundle.studies.map(payload=>({archiveId:payload.artifactId,kind:'BRANCH',origin:'IMPORTED_UNVERIFIED',payload})),...bundle.claims.map(payload=>({archiveId:payload.artifactId,kind:'CLAIM',origin:'IMPORTED_UNVERIFIED',payload}))];
    for(const archive of archives)await this.insert([{store:'archives',key:archive.archiveId,value:archive}]);
    // External branch/claim artifacts survive verbatim in a separate inspection archive.
    return bundle.evidence.length;
  }
  close(){const p=this.opening;this.opening=null;p?.reject(new Error('STRATEGY_STORAGE_CLOSED'));this.db?.close();this.db=null;}
}
