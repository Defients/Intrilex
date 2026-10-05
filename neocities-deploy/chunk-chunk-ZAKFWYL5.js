import{i as p,k as y}from"./chunk-chunk-R6IKPRTH.js?v=7fd8c38b9b66";import{c as u}from"./chunk-chunk-56S7AKT5.js?v=7fd8c38b9b66";function c(e){return e===null||typeof e!="object"?JSON.stringify(e):Array.isArray(e)?"["+e.map(c).join(",")+"]":"{"+Object.keys(e).sort().map(n=>JSON.stringify(n)+":"+c(e[n])).join(",")+"}"}function h(e){let t=2166136261;for(let a=0;a<e.length;a++)t^=e.charCodeAt(a),t=Math.imul(t,16777619);return(t>>>0).toString(16).padStart(8,"0").repeat(8)}function d(e){return h(c(e))}async function R(e){let t=await e.createCertifiedReplay(),n=await e.createPublicReplay(t),{strictView:a}=await import("./chunk-autonomy-runtime-MNPKU7WW.js?v=7fd8c38b9b66");return e._strategyTerminalScores=Object.fromEntries(["P1","P2"].map(o=>[o,a(e.state,o).own.securedPoints])),{replayId:`R-${e.sessionId}`,sessionId:e.sessionId,completedAt:new Date().toISOString(),profileId:e.setup.profileId,mode:e.setup.mode,seed:e.setup.seed,humanPlayerId:e.setup.humanPlayerId,aiPolicyId:e.setup.aiPolicyId,winner:e.winner,terminationReason:e.terminalReason,fullTurnSequence:e.state?.fullTurnSequence??0,decisionCount:e.decisionJournal.length,certifiedReplay:t,...u(e,t),publicView:n,certifiedReplayHash:t.integrityHash,publicViewHash:n.publicContentHash,contentHash:d({sessionId:e.sessionId,winner:e.winner,terminationReason:e.terminalReason,certifiedReplayHash:t.integrityHash})}}async function g(e){return p(e)}async function x(e){try{let{verifyCertifiedReplay:t}=await import("./chunk-browser-entry-NRYYZ6AK.js?v=7fd8c38b9b66");return t(e.certifiedReplay),{valid:!0}}catch(t){return{valid:!1,error:t.message}}}async function S(e){let t=await e.getReplay();return t?{replayId:`R-${e.matchId}`,sessionId:e.matchId,completedAt:new Date().toISOString(),profileId:null,mode:"network-duel",seed:null,humanPlayerId:e.playerId,aiPolicyId:null,winner:e.currentView?.match?.winner??null,terminationReason:e.currentView?.match?.terminationReason??null,fullTurnSequence:e.currentView?.match?.fullTurnSequence??0,decisionCount:0,certifiedReplay:t,publicView:null,certifiedReplayHash:t.integrityHash??e.replayHash??null,publicViewHash:null,contentHash:d({sessionId:e.matchId,winner:e.currentView?.match?.winner??null,certifiedReplayHash:t.integrityHash??e.replayHash??null}),isNetworkMatch:!0}:null}function f(e,t="private"){return JSON.stringify(t==="public"?{format:"intrilex-public-replay-export",version:1,replayId:e.replayId,completedAt:e.completedAt,profileId:e.profileId,winner:e.winner,publicView:e.publicView,publicViewHash:e.publicViewHash}:{format:"intrilex-private-replay-export",version:1,replayId:e.replayId,completedAt:e.completedAt,profileId:e.profileId,seed:e.seed,humanPlayerId:e.humanPlayerId,aiPolicyId:e.aiPolicyId,winner:e.winner,certifiedReplay:e.certifiedReplay,certifiedReplayHash:e.certifiedReplayHash},null,2)}function H(e,t="private"){let n=f(e,t),a=new Blob([n],{type:"application/json"}),l=URL.createObjectURL(a),i=document.createElement("a");i.href=l,i.download=`${t==="public"?"public":"private"}-replay-${e.replayId}.json`,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(l)}async function P(){return(await y()).map(t=>({replayId:t.replayId,completedAt:t.completedAt,profileId:t.profileId,mode:t.mode,winner:t.winner,humanPlayerId:t.humanPlayerId,terminationReason:t.terminationReason,fullTurnSequence:t.fullTurnSequence,decisionCount:t.decisionCount,aiPolicyId:t.aiPolicyId,certified:!!t.certifiedReplayHash}))}function A(e,t={}){return!e||e.length===0?`<div class="replay-library" data-testid="replay-library">
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
      <tbody>${e.map(a=>{let l=a.winner===(a.humanPlayerId??"P1"),i=a.certified?'<span class="verified-badge" aria-label="Certified verified">\u2713</span>':"",o=l?"Win":a.winner?"Loss":"Draw",s=l?"result-win":a.winner?"result-loss":"result-draw";return`<tr data-replay-id="${r(a.replayId)}" data-testid="replay-row" class="clickable-row" data-watch-replay="${r(a.replayId)}">
      <td>${r(new Date(a.completedAt).toLocaleDateString())}</td>
      <td>${r(a.profileId==="first-contact-trigger-closure"?"First Contact":"Advanced Core")}</td>
      <td class="${s}"><strong>${o}</strong></td>
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
  </div>`}var r=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);export{R as a,g as b,x as c,S as d,f as e,H as f,P as g,A as h};
//# sourceMappingURL=chunk-chunk-ZAKFWYL5.js.map
