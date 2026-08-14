import{i as d,k as p}from"./chunk-chunk-W442IWZJ.js?v=1dab37cbe597";function o(e){return e===null||typeof e!="object"?JSON.stringify(e):Array.isArray(e)?"["+e.map(o).join(",")+"]":"{"+Object.keys(e).sort().map(n=>JSON.stringify(n)+":"+o(e[n])).join(",")+"}"}function s(e){let t=2166136261;for(let a=0;a<e.length;a++)t^=e.charCodeAt(a),t=Math.imul(t,16777619);return(t>>>0).toString(16).padStart(8,"0").repeat(8)}function c(e){return s(o(e))}async function I(e){let t=await e.createCertifiedReplay(),n=await e.createPublicReplay(t);return{replayId:`R-${e.sessionId}`,sessionId:e.sessionId,completedAt:new Date().toISOString(),profileId:e.setup.profileId,mode:e.setup.mode,seed:e.setup.seed,humanPlayerId:e.setup.humanPlayerId,aiPolicyId:e.setup.aiPolicyId,winner:e.winner,terminationReason:e.terminalReason,fullTurnSequence:e.state?.fullTurnSequence??0,decisionCount:e.decisionJournal.length,certifiedReplay:t,publicView:n,certifiedReplayHash:t.integrityHash,publicViewHash:n.publicContentHash,contentHash:c({sessionId:e.sessionId,winner:e.winner,terminationReason:e.terminalReason,certifiedReplayHash:t.integrityHash})}}async function w(e){return d(e)}async function R(e){try{let{verifyCertifiedReplay:t}=await import("./chunk-browser-entry-TDAZKOVP.js?v=1dab37cbe597");return t(e.certifiedReplay),{valid:!0}}catch(t){return{valid:!1,error:t.message}}}async function g(e){let t=await e.getReplay();return t?{replayId:`R-${e.matchId}`,sessionId:e.matchId,completedAt:new Date().toISOString(),profileId:null,mode:"network-duel",seed:null,humanPlayerId:e.playerId,aiPolicyId:null,winner:e.currentView?.match?.winner??null,terminationReason:e.currentView?.match?.terminationReason??null,fullTurnSequence:e.currentView?.match?.fullTurnSequence??0,decisionCount:0,certifiedReplay:t,publicView:null,certifiedReplayHash:t.integrityHash??e.replayHash??null,publicViewHash:null,contentHash:c({sessionId:e.matchId,winner:e.currentView?.match?.winner??null,certifiedReplayHash:t.integrityHash??e.replayHash??null}),isNetworkMatch:!0}:null}function h(e,t="private"){return JSON.stringify(t==="public"?{format:"intrilex-public-replay-export",version:1,replayId:e.replayId,completedAt:e.completedAt,profileId:e.profileId,winner:e.winner,publicView:e.publicView,publicViewHash:e.publicViewHash}:{format:"intrilex-private-replay-export",version:1,replayId:e.replayId,completedAt:e.completedAt,profileId:e.profileId,seed:e.seed,humanPlayerId:e.humanPlayerId,aiPolicyId:e.aiPolicyId,winner:e.winner,certifiedReplay:e.certifiedReplay,certifiedReplayHash:e.certifiedReplayHash},null,2)}function x(e,t="private"){let n=h(e,t),a=new Blob([n],{type:"application/json"}),l=URL.createObjectURL(a),i=document.createElement("a");i.href=l,i.download=`${t==="public"?"public":"private"}-replay-${e.replayId}.json`,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(l)}async function H(){return(await p()).map(t=>({replayId:t.replayId,completedAt:t.completedAt,profileId:t.profileId,mode:t.mode,winner:t.winner,humanPlayerId:t.humanPlayerId,terminationReason:t.terminationReason,fullTurnSequence:t.fullTurnSequence,decisionCount:t.decisionCount,aiPolicyId:t.aiPolicyId,certified:!!t.certifiedReplayHash}))}function S(e,t={}){return!e||e.length===0?`<div class="replay-library" data-testid="replay-library">
      <a class="play-hub-back" href="#/" aria-label="Back to home">\u2190 Back</a>
      <h1>Replay Library</h1>
      <p class="replay-empty">No completed matches yet. Play a match to build your library.</p>
      <a href="#/" class="secondary-button">Back to Home</a>
    </div>`:`<div class="replay-library" data-testid="replay-library">
    <a class="play-hub-back" href="#/" aria-label="Back to home">\u2190 Back</a>
    <h1>Replay Library</h1>
    <table class="replay-table" data-testid="replay-table">
      <thead>
        <tr><th>Date</th><th>Profile</th><th>Result</th><th>Turns</th><th>Decisions</th><th>AI</th><th>Verified</th><th>Actions</th></tr>
      </thead>
      <tbody>${e.map(a=>{let l=a.winner===(a.humanPlayerId??"P1"),i=a.certified?'<span class="verified-badge" aria-label="Certified verified">\u2713</span>':"",u=l?"Win":a.winner?"Loss":"Draw",y=l?"result-win":a.winner?"result-loss":"result-draw";return`<tr data-replay-id="${r(a.replayId)}" data-testid="replay-row" class="clickable-row" data-watch-replay="${r(a.replayId)}">
      <td>${r(new Date(a.completedAt).toLocaleDateString())}</td>
      <td>${r(a.profileId==="first-contact-trigger-closure"?"First Contact":"Advanced Core")}</td>
      <td class="${y}"><strong>${u}</strong></td>
      <td>${r(a.fullTurnSequence??0)}</td>
      <td>${r(a.decisionCount??0)}</td>
      <td>${r(a.aiPolicyId??"\u2014")}</td>
      <td>${i}</td>
      <td class="replay-actions">
        <button class="secondary-button" data-action="watch-replay" data-replay-id="${r(a.replayId)}">Watch</button>
        <button class="secondary-button" data-action="export-private" data-replay-id="${r(a.replayId)}">Export private</button>
        <button class="secondary-button" data-action="export-public" data-replay-id="${r(a.replayId)}">Export public</button>
        <button class="secondary-button danger" data-action="delete-replay" data-replay-id="${r(a.replayId)}">Delete</button>
      </td>
    </tr>`}).join("")}</tbody>
    </table>
    <a href="#/" class="secondary-button">Back to Home</a>
  </div>`}var r=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);export{I as a,w as b,R as c,g as d,h as e,x as f,H as g,S as h};
//# sourceMappingURL=chunk-chunk-USSUKPP2.js.map
