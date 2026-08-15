import"./chunk-chunk-TB45ROLV.js?v=9ea1c2f9e91d";var l=t=>String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),$=t=>t?t.substring(0,12):"\u2014",u=(t,e=2)=>t==null?"\u2014":typeof t=="number"?t.toFixed(e):String(t),y=t=>t==null?"\u2014":`${(t*100).toFixed(1)}%`;function H({variantAnalytics:t,rankAnatomyRegistry:e,selectedRank:a,profileFilter:s="all",originFilter:i="all",anatomyTab:c="overall"}){if(!t||!t.rankComparisons)return'<div class="empty-state"><strong>Rank Anatomy not available</strong><p>Variant analytics not loaded. Run an experiment or load the observatory artifact.</p></div>';let n=e?.ranks?.find(b=>b.rankId===a),r=P(t,s),d=r.rankComparisons?.[a];if(!n)return`<div class="empty-state"><strong>Rank ${l(a)} not in registry</strong></div>`;let v=T(a,c,n),p="",h=N(a,r);switch(c){case"overall":p=C(d,n,r);break;case"ordinary":p=A(d,r);break;case"spades":p=R(d,n,r);break;case"supers":p=w(d,n,r);break;case"evidence":p=V(d,n,r);break;default:p=C(d,n,r)}let f=W(i),m=x(s);return`<div class="rank-anatomy-observatory">
    <div class="rank-anatomy-header">
      <h2>Rank Anatomy Observatory</h2>
      <p>Decomposed performance for Rank ${l(a)} \u2014 ordinary baseline, Spades variant, Super declarations, and individual effects</p>
      <div class="rank-anatomy-filters">${f}${m}</div>
    </div>
    ${h}
    ${v}
    <div class="rank-anatomy-content">${p}</div>
  </div>`}function P(t,e){if(!e||e==="all")return t;let a=t.perProfile?.[e];if(!a)return{...t,variantMetrics:{},confidence:{},rankComparisons:{}};let s={};for(let[c,o]of Object.entries(a)){let n=o?.variantOpportunityCount??0;s[c]=n>=100?"HIGH":n>=30?"MEDIUM":n>=8?"LOW":"INSUFFICIENT"}let i={};for(let[c,o]of Object.entries(t.rankComparisons??{})){let n={};for(let[r,d]of Object.entries(o.levels??{}))n[r]=d?{...d,metrics:a[r]??null,confidence:s[r]??"INSUFFICIENT"}:null;i[c]={...o,levels:n}}return{...t,profileId:e,variantMetrics:a,confidence:s,rankComparisons:i}}function N(t,e){let a=[],s=e?.variantMetrics??{},i=t,c=[i,`${i}:normal`,`${i}:spade`,`${i}:super:all`],o=e?.entities??[];for(let r of o)r.rank===t&&r.tier==="super"&&c.push(r.variantKey);for(let r of c){let d=s[r];if(!d)continue;let v=d.variantOpportunityCount??0,p=d.variantSelectionCount??0;p>0&&v===0?a.push({variantKey:r,selections:p}):p>v&&a.push({variantKey:r,selections:p,opportunities:v,type:"overflow"})}return a.length===0?"":`<div class="anatomy-integrity-banner" role="alert" data-testid="anatomy-integrity-banner">
    <strong>DATA INTEGRITY FAILURE:</strong> Selections exist without recorded opportunities.
    Balance conclusions are disabled for this entity.
    <span class="anatomy-integrity-details">${a.map(r=>r.type==="overflow"?`${l(r.variantKey)}: ${r.selections} selections > ${r.opportunities} opportunities`:`${l(r.variantKey)}: ${r.selections} selections with 0 opportunities`).join("; ")}</span>
  </div>`}function T(t,e,a){return`<div class="anatomy-rail" role="tablist" aria-label="Rank anatomy layers">${[{id:"overall",label:"Overall",desc:"Aggregate rank performance"},{id:"ordinary",label:"Ordinary",desc:"Normal \u2663/\u2666/\u2665 baseline"},{id:"spades",label:"Spades",desc:a.spadesEligible?a.spadesVariant.displayName:"Not eligible"},{id:"supers",label:"Supers",desc:`${a.superEffectCount} effect${a.superEffectCount!==1?"s":""}`},{id:"evidence",label:"Evidence",desc:"Authority and provenance"}].map(c=>{let o=c.id===e;return`<button class="anatomy-tab ${o?"active":""}" data-anatomy-tab="${c.id}" role="tab" aria-selected="${o}" aria-controls="anatomy-content">
      <span class="anatomy-tab-label">${l(c.label)}</span>
      <span class="anatomy-tab-desc">${l(c.desc)}</span>
    </button>`}).join("")}</div>`}function C(t,e,a){let s=e.rankId,i=a.variantMetrics?.[s]??{},c=a.confidence?.[s]??"INSUFFICIENT",o=E(t,a),n=j(t,a);return`<div class="anatomy-section">
    <h3>Aggregate Performance</h3>
    <p class="anatomy-note">Variant selections classify the primary variant entity. The Rank Power panel counts aggregate rank participations, including secondary ranks in fractional multi-rank plays, so the totals can legitimately differ.</p>
    <div class="rank-metrics-grid">${g([["Opportunities",i.variantOpportunityCount],["Selections",i.variantSelectionCount],["Selection Rate",y(i.variantPlayRate)],["Victory Contribution",i.variantVictoryContributionCount],["Defeat Exposure",i.variantDefeatExposureCount],["Win Rate",y(i.variantWinRate)],["Secured Points",u(i.variantSecuredPointContribution,1)],["Board Presence",u(i.variantBoardPresenceContribution,1)],["Confidence",c]])}</div>
    ${o}
    ${n}
  </div>`}function A(t,e){if(!t)return'<div class="empty-state"><strong>No variant data</strong></div>';let a=Object.keys(t.levels??{}).find(o=>o.endsWith(":normal"));if(!a)return'<div class="empty-state"><strong>No ordinary baseline data</strong><p>This rank may not have suit variants.</p></div>';let s=t.levels[a],i=s?.metrics??{},c=s?.confidence??"INSUFFICIENT";return`<div class="anatomy-section">
    <h3>Ordinary Baseline (\u2663/\u2666/\u2665)</h3>
    <p class="anatomy-note">Normal-suit tier only (\u2663/\u2666/\u2665). Origin segmentation is not yet recorded, so generated/copied/mimicked/replayed uses may still be present.</p>
    <div class="rank-metrics-grid">${g([["Opportunities",i.variantOpportunityCount],["Selections",i.variantSelectionCount],["Selection Rate",y(i.variantPlayRate)],["Success Count",i.variantSuccessCount],["Success Rate",y(i.variantSuccessRate)],["Win Rate",y(i.variantWinRate)],["Secured Points",u(i.variantSecuredPointContribution,1)],["Board Presence",u(i.variantBoardPresenceContribution,1)],["Tempo Impact",u(i.variantTempoImpact,2)],["Avg Value When Activated",u(i.variantAverageValueWhenActivated,3)],["Confidence",c]])}</div>
  </div>`}function R(t,e,a){if(!e.spadesEligible)return`<div class="anatomy-section">
      <h3>Spades Variant \u2014 Not Eligible</h3>
      <div class="notice info">
        <strong>Rank ${l(e.rankId)} has no mechanically distinct Spades variant</strong>
        <p>Reason: ${l(e.spadesVariant.ineligibilityReason??"NO_DISTINCT_SPADES_EFFECT")}</p>
        ${e.spadesVariant.ineligibilityNote?`<p>${l(e.spadesVariant.ineligibilityNote)}</p>`:""}
      </div>
    </div>`;if(!t)return'<div class="empty-state"><strong>No variant data</strong></div>';let s=`${e.rankId}:spade`,i=`${e.rankId}:normal`,c=t.levels?.[s],o=t.levels?.[i];if(!c)return'<div class="empty-state"><strong>Spades variant data not available</strong><p>Insufficient evidence for this variant.</p></div>';let n=c.metrics??{},r=o?.metrics??{},d=c.confidence??"INSUFFICIENT",v=D(r,n,d);return`${`<div class="anatomy-section">
    <h3>${l(e.spadesVariant.displayName)}</h3>
    <p class="anatomy-note">Card: ${l(e.spadesVariant.cardId)} \xB7 Mode: ${l(e.spadesVariant.mode)}</p>
    ${e.spadesVariant.note?`<p class="anatomy-note">${l(e.spadesVariant.note)}</p>`:""}
  </div>`}${v}`}function w(t,e,a){if(e.superEffectCount===0)return`<div class="anatomy-section">
      <h3>Supers \u2014 None</h3>
      <div class="notice info"><strong>Rank ${l(e.rankId)} has no Super effects</strong></div>
    </div>`;if(!t)return'<div class="empty-state"><strong>No variant data</strong></div>';let s=K(t,e),i=e.supers.map(o=>L(o,t,a)).join("");return`${O(e)}
  <div class="anatomy-section">
    <h3>Super Declaration Funnel</h3>
    ${s}
  </div>
  <div class="anatomy-section">
    <h3>Individual Super Effect Dossiers</h3>
    ${i}
  </div>`}function O(t){let e=t.supers??[];return e.length===0?"":`<div class="anatomy-section">
    <h3>Super Effect Inventory (Registry)</h3>
    <p class="anatomy-note">Canonical Super effect definitions from the rank anatomy registry. These are authoritative regardless of campaign data availability.</p>
    <table class="frequency-potency-table super-inventory-table">
      <thead><tr><th>Effect</th><th>Effect ID</th><th>Mode</th><th>Kind</th><th>Profiles</th><th>Action Modes</th><th>Alt Kinds</th></tr></thead>
      <tbody>${e.map(s=>{let i=(s.profiles??[]).join(", "),c=(s.actionModes??[]).join(", "),o=(s.altKinds??[]).join(", ");return`<tr>
      <td>${l(s.displayName)}</td>
      <td>${l(s.effectId)}</td>
      <td>${l(s.mode)}</td>
      <td>${l(s.kind)}</td>
      <td>${l(i)}</td>
      <td>${l(c)}</td>
      <td>${o?l(o):"\u2014"}</td>
    </tr>`}).join("")}</tbody>
    </table>
  </div>`}function V(t,e,a){let s=e.authority??{},i=a.variantRegistry??{},c=a.sensitivity??{},o=`<div class="anatomy-section">
    <h3>Rank Authority</h3>
    <div class="rank-metrics-grid">${g([["Rank Authority Hash",$(s.authorityHash)],["Engine Version",s.authorityVersion],["Rules Version",s.rulesVersion],["Point Row Value",s.pointRowValue],["Scuttle Order",s.scuttleOrder],["PR Scuttle Immune",s.prScuttleImmune?"Yes":"No"],["PR Effect Target Immune",s.prEffectTargetImmune?"Yes":"No"],["Supported Modes",(s.supportedModes??[]).join(", ")]])}</div>
  </div>`,n=F(t,e,c),r=M(e,c),d=`<div class="anatomy-section">
    <h3>Provenance</h3>
    <div class="rank-metrics-grid">${g([["Variant Analytics Schema",a.schemaVersion],["Telemetry Schema",a.telemetrySchemaVersion],["Variant Registry Schema",i.schemaVersion],["Variant Registry Hash",$(i.authorityHash)],["Entity Count",i.entityCount],["Metric Registry Hash",$(a.metricRegistryHash)],["Aggregate Hash",$(a.aggregateHash)],["Profile",a.profileId??"all"],["Participants",(a.participantIds??[]).join(", ")]])}</div>
  </div>`;return`${o}${n}${r}${d}<div class="anatomy-section">
    <h3>Source Evidence</h3>
    <p class="anatomy-note">These metrics are derived from campaign replays and decision traces. Navigate to the source workspaces to inspect individual records.</p>
    <div class="evidence-source-links">
      <a href="#/traces" class="evidence-source-link" data-anatomy-source="traces">Decision Traces \u2192</a>
      <a href="#/replays" class="evidence-source-link" data-anatomy-source="replays">Campaign Replays \u2192</a>
      <a href="#/diagnostics" class="evidence-source-link" data-anatomy-source="diagnostics">Policy Diagnostics \u2192</a>
    </div>
  </div><div class="footer-note">
    <p><strong>Interpretation boundary:</strong> All metrics are observational associations conditioned on policy, seat, profile, and telemetry. They are not causal claims or balance verdicts.</p>
  </div>`}function F(t,e,a){if(!t)return'<div class="anatomy-section"><h3>Per-Variant Evidence</h3><div class="empty-state"><strong>No variant data</strong></div></div>';let s=t.entityOrder??[],i=t.levels??{},c=s.map(o=>{let n=i[o];if(!n)return"";let r=n.metrics??{},d=n.confidence??"INSUFFICIENT",v=`confidence-${d.toLowerCase()}`,p=a[o]??{},h=n.tier??"",f=I(h),m=n.sampleSize??r.variantOpportunityCount??0;return`<tr class="${v}">
      <td>${f}</td>
      <td>${l(n.displayName??o)}</td>
      <td>${r.variantOpportunityCount??0}</td>
      <td>${r.variantSelectionCount??0}</td>
      <td>${m}</td>
      <td>${d}</td>
      <td>${u(p.policySensitivity,4)}</td>
      <td>${u(p.seatSensitivity,4)}</td>
      <td>${u(p.firstPlayerSensitivity,4)}</td>
    </tr>`}).join("");return`<div class="anatomy-section">
    <h3>Per-Variant Evidence</h3>
    <p class="anatomy-note">Sample sizes and confidence for each variant entity of Rank ${l(e.rankId)}. Sensitivity measures how much the win-rate estimate changes when conditioning on policy, seat, or first-player assignment.</p>
    <table class="frequency-potency-table evidence-table">
      <thead><tr><th>Type</th><th>Entity</th><th>Opps</th><th>Selects</th><th>Sample</th><th>Confidence</th><th>Policy Sens.</th><th>Seat Sens.</th><th>1st-Player Sens.</th></tr></thead>
      <tbody>${c}</tbody>
    </table>
  </div>`}function M(t,e){let a=t.rankId,s=[a,`${a}:normal`,`${a}:spade`,`${a}:super:all`];for(let o of t.supers??[])s.push(`${a}:super:${o.effectId}`);return s.some(o=>e[o]&&(e[o].policySensitivity>0||e[o].seatSensitivity>0))?`<div class="anatomy-section">
    <h3>Sensitivity Analysis</h3>
    <p class="anatomy-note">Sensitivity measures the maximum win-rate swing when conditioning on policy, seat, or first-player. High sensitivity means the metric is confounded by these factors; low sensitivity means it is robust.</p>
    <table class="frequency-potency-table sensitivity-table">
      <thead><tr><th>Variant</th><th>Policy Sens.</th><th>Seat Sens.</th><th>1st-Player Sens.</th><th>Max Level</th></tr></thead>
      <tbody>${s.map(o=>{let n=e[o];if(!n)return"";let r=Math.max(n.policySensitivity??0,n.seatSensitivity??0,n.firstPlayerSensitivity??0),d=r>.1?"HIGH":r>.05?"MEDIUM":r>.01?"LOW":"NEGLIGIBLE";return`<tr>
      <td>${l(o)}</td>
      <td>${u(n.policySensitivity,4)}</td>
      <td>${u(n.seatSensitivity,4)}</td>
      <td>${u(n.firstPlayerSensitivity,4)}</td>
      <td class="sensitivity-${d.toLowerCase()}">${d}</td>
    </tr>`}).join("")}</tbody>
    </table>
  </div>`:`<div class="anatomy-section">
      <h3>Sensitivity Analysis</h3>
      <div class="notice info"><strong>No sensitivity data</strong><p>All sensitivity values are zero for this rank. This indicates either insufficient data or that the metrics are robust across policy/seat/first-player conditions.</p></div>
    </div>`}function E(t,e){if(!t)return"";let a=t.levels??{},s=t.rank,c=(e.variantMetrics?.[s]??{}).variantSecuredPointContribution??0;return`<div class="anatomy-subsection">
    <h4>Contribution Decomposition</h4>
    <p class="anatomy-note">Share of secured-point contribution by component. Non-additive metrics are labeled comparative, not summed.</p>
    <div class="contribution-bars">${[{key:`${s}:normal`,label:"Ordinary \u2663/\u2666/\u2665",color:"#4fd387"},{key:`${s}:spade`,label:"Spades \u2660",color:"#b08cff"},{key:`${s}:super:all`,label:"All Supers",color:"#f07449"}].map(r=>{let v=a[r.key]?.metrics?.variantSecuredPointContribution??0,h=((c>0?v/c:0)*100).toFixed(1);return`<div class="contribution-bar">
      <span class="contribution-label">${l(r.label)}</span>
      <div class="contribution-track"><div class="contribution-fill" style="width:${h}%;background:${r.color}"></div></div>
      <span class="contribution-value">${u(v,1)} (${h}%)</span>
    </div>`}).join("")}</div>
  </div>`}function j(t,e){if(!t)return"";let a=t.entityOrder??[],s=t.levels??{};return`<div class="anatomy-subsection">
    <h4>Frequency\u2013Potency</h4>
    <p class="anatomy-note">Frequency = selection rate when available. Potency = average value when activated. These are separate dimensions; a rare powerful effect must not automatically outrank a frequent dependable one.</p>
    <table class="frequency-potency-table">
      <thead><tr><th>Type</th><th>Entity</th><th>Frequency</th><th>Potency</th><th>Opps</th><th>Selects</th><th>Confidence</th></tr></thead>
      <tbody>${a.map(c=>{let o=s[c];if(!o)return"";let n=o.metrics??{},r=n.variantPlayRate??0,d=n.variantAverageValueWhenActivated??0,v=o.tier??"",p=B(v),h=o.confidence??"INSUFFICIENT",f=`confidence-${h.toLowerCase()}`,m=I(v);return`<tr class="${f}">
      <td>${m}</td>
      <td>${l(o.displayName??c)}</td>
      <td>${y(r)}</td>
      <td>${u(d,3)}</td>
      <td>${n.variantOpportunityCount??0}</td>
      <td>${n.variantSelectionCount??0}</td>
      <td>${h}</td>
    </tr>`}).join("")}</tbody>
    </table>
  </div>`}function D(t,e,a){return`<div class="anatomy-subsection">
    <h4>Ordinary vs Spades Comparison</h4>
    <table class="comparison-table">
      <thead><tr><th>Metric</th><th>Ordinary \u2663/\u2666/\u2665</th><th>Spades \u2660</th><th>\u0394</th></tr></thead>
      <tbody>${[["Opportunity Count",t.variantOpportunityCount,e.variantOpportunityCount],["Selection Count",t.variantSelectionCount,e.variantSelectionCount],["Selection Rate",y(t.variantPlayRate),y(e.variantPlayRate)],["Success Rate",y(t.variantSuccessRate),y(e.variantSuccessRate)],["Win Rate",y(t.variantWinRate),y(e.variantWinRate)],["Secured Points",u(t.variantSecuredPointContribution,1),u(e.variantSecuredPointContribution,1)],["Board Presence",u(t.variantBoardPresenceContribution,1),u(e.variantBoardPresenceContribution,1)],["Tempo Impact",u(t.variantTempoImpact,2),u(e.variantTempoImpact,2)],["Goal Contribution",u(t.variantGoalContribution,2),u(e.variantGoalContribution,2)],["Avg Value When Activated",u(t.variantAverageValueWhenActivated,3),u(e.variantAverageValueWhenActivated,3)],["Confidence",t.confidence??"INSUFFICIENT",e.confidence??a]].map(([c,o,n])=>{let r=o!=="\u2014"&&n!=="\u2014"&&typeof o=="number"&&typeof n=="number"?(n-o).toFixed(2):"\u2014";return`<tr><td>${l(c)}</td><td>${l(o)}</td><td>${l(n)}</td><td>${r}</td></tr>`}).join("")}</tbody>
    </table>
  </div>`}function K(t,e){let a=`${e.rankId}:super:all`,s=t.levels?.[a];if(!s)return'<div class="notice"><strong>No Super data available</strong></div>';let i=s.metrics??{},c=i.variantOpportunityCount??0,o=i.variantSelectionCount??0,n=i.variantActivationCount??i.variantSuccessCount??0,r=i.variantSuccessCount??0,v=(i.variantSecuredPointContribution??0)>0||(i.variantBoardPresenceContribution??0)>0?Math.max(n,1):0,p=[{label:"Legal Opportunity",value:c,desc:"Decision frames with at least one legal Super declaration"},{label:"Selected",value:o,desc:"Super declarations chosen by the player/policy"},{label:"Accepted",value:n,desc:"Declarations that were accepted and began resolving"},{label:"Resolved",value:r,desc:"Declarations that fully resolved"},{label:"Measurable Impact",value:v,desc:"Declarations producing measurable score or board state impact"}];return c===0&&o===0?`<div class="super-funnel">
      <div class="notice info"><strong>Insufficient Super evidence</strong>
        <p>No Super declarations were recorded for Rank ${l(e.rankId)} in this campaign. This may be because the campaign profile does not exercise Super effects, or because no legal Super opportunities arose.</p>
        <p>See the Super Effect Inventory above for canonical effect definitions.</p>
      </div>
    </div>`:`<div class="super-funnel">${p.map((f,m)=>{let b=m>0?p[m-1].value:null,S=b!=null&&b>0&&f.value!=null?f.value/b:null,k=p[0].value>0&&f.value!=null?Math.max(f.value/p[0].value*100,5):5;return`<div class="funnel-stage" style="margin-left:${m*20}px;width:${k}%">
      <span class="funnel-label">${l(f.label)}</span>
      <span class="funnel-value">${f.value??0}</span>
      ${S!=null?`<span class="funnel-rate">${(S*100).toFixed(1)}%</span>`:""}
      <small class="funnel-desc">${l(f.desc)}</small>
    </div>`}).join("")}</div>
    <div class="footer-note"><p>Each stage shows the denominator from the previous stage. A Super with multiple effects remains one declaration; effect components are tracked separately below.</p></div>`}function L(t,e,a){let s=`${t.rank}:super:${t.effectId}`,i=e.levels?.[s],c=i?.confidence??"INSUFFICIENT",o=`confidence-${c.toLowerCase()}`,n=i?.metrics??{},r=(n.variantOpportunityCount??0)>0||(n.variantSelectionCount??0)>0,d=`<div class="dossier-meta">
    <span class="dossier-id">Effect ID: ${l(t.effectId)}</span>
    <span class="dossier-mode">Mode: ${l(t.mode)}</span>
    <span class="dossier-kind">Kind: ${l(t.kind)}</span>
    <span class="dossier-profiles">Profiles: ${l((t.profiles??[]).join(", "))}</span>
  </div>`,v=(t.actionModes??[]).length>0?`<div class="dossier-action-modes"><strong>Action modes:</strong> ${l((t.actionModes??[]).join(", "))}</div>`:"",p=(t.altKinds??[]).length>0?`<div class="dossier-alt-kinds"><strong>Alternative kinds:</strong> ${l((t.altKinds??[]).join(", "))}</div>`:"",h=(t.authorityRefs??[]).length>0?`<div class="dossier-authority-refs"><strong>Authority refs:</strong> ${l((t.authorityRefs??[]).join(", "))}</div>`:"",f=r?`<div class="rank-metrics-grid">${g([["Opportunities",n.variantOpportunityCount],["Selections",n.variantSelectionCount],["Selection Rate",y(n.variantPlayRate)],["Success Count",n.variantSuccessCount],["Success Rate",y(n.variantSuccessRate)],["Win Rate",y(n.variantWinRate)],["Secured Points",u(n.variantSecuredPointContribution,1)],["Board Presence",u(n.variantBoardPresenceContribution,1)],["Tempo Impact",u(n.variantTempoImpact,2)],["Avg Value When Activated",u(n.variantAverageValueWhenActivated,3)],["Confidence",c]])}</div>`:`<div class="notice info"><strong>No campaign data for this effect</strong>
        <p>This Super effect was not exercised in the current campaign. The registry definition above is authoritative.</p>
      </div>`;return`<div class="super-effect-dossier ${o}">
    <h4>${l(t.displayName)}</h4>
    ${d}
    ${v}${p}${h}
    ${f}
  </div>`}function W(){return'<label class="anatomy-filter"><span>Origin</span><select id="origin-filter" aria-label="Origin segmentation unavailable" disabled><option selected>All origins (segmentation unavailable)</option></select></label>'}function x(t){return`<label class="anatomy-filter"><span>Profile</span><select id="variant-profile-filter" aria-label="Filter by authority profile">${[["all","All profiles"],["core-advanced-authority","Advanced Core"],["core-unrestricted-authority","Unrestricted Core"]].map(([s,i])=>`<option value="${s}" ${s===t?"selected":""}>${l(i)}</option>`).join("")}</select></label>`}function g(t){return`<dl class="definition-list">${t.map(([e,a])=>`<dt>${l(e)}</dt><dd>${l(a)}</dd>`).join("")}</dl>`}function B(t){return{rank:"Rank overall",normal:"Normal",spade:"Spades",super:"Super effect","super-aggregate":"All Supers"}[t]??t}function I(t){return{rank:"\u25C6",normal:"\u2663",spade:"\u2660",super:"\u2B50","super-aggregate":"\u2B50\xD7"}[t]??"?"}export{H as renderRankAnatomy};
//# sourceMappingURL=chunk-rank-anatomy-workspace-UXW365NQ.js.map
