import{a as d,g as v,k as m}from"./chunk-chunk-HAJNM37S.js?v=e2bd7e8507fa";import"./chunk-chunk-TO4GXBBJ.js?v=e2bd7e8507fa";import"./chunk-chunk-TB45ROLV.js?v=e2bd7e8507fa";var p={FIRST_STEPS:"First Steps",CORE_SYSTEMS:"Core Systems",STACK_COUNTERPLAY:"Stack & Counterplay",CARD_MASTERY:"Card Mastery",TACTICAL_WINS:"Tactical Wins",PLAYSTYLE:"Playstyle",PROGRESSION:"Progression"},h={COMMON:"#8a9ba8",CLEVER:"#00c8dc",RARE:"#a020f0",INTRILEX:"#ff4080"};async function R(e){let a=m();await a.init();let t=a.getSummary(),r=v(),i="all",s="all",n=()=>{let c=a.getGalleryData({filter:i,category:s!=="all"?s:void 0});e.innerHTML=`
      <div class="achievements-workspace">
        <div class="achievements-header">
          <h1>Achievements</h1>
          <div class="achievements-summary">
            <span class="ach-stat"><b>${t.earned}</b> / ${t.total} Unlocked</span>
            <span class="ach-stat"><b class="ach-ap">${t.ap}</b> / ${t.maxAp} AP</span>
          </div>
        </div>

        <div class="achievements-filters">
          ${y(i)}
          <div class="achievements-filter-divider"></div>
          ${u(s)}
        </div>

        <div class="achievements-grid">
          ${c.map(l=>$(l)).join("")}
        </div>
      </div>
    `};e.addEventListener("click",c=>{let l=c.target.closest("[data-filter]");if(l){i=l.dataset.filter,n();return}let o=c.target.closest("[data-category-filter]");o&&(s=o.dataset.categoryFilter,n())}),n()}function y(e){return[{id:"all",label:"All"},{id:"earned",label:"Earned"},{id:"locked",label:"Locked"}].map(t=>{let r=t.id===e;return`<button data-filter="${t.id}" class="achievement-filter-btn${r?" active":""}">${t.label}</button>`}).join("")}function u(e){return[{id:"all",label:"All Categories"},...Object.values(d).map(t=>({id:t,label:p[t]??t}))].map(t=>{let r=t.id===e;return`<button data-category-filter="${t.id}" class="achievement-category-btn${r?" active":""}">${t.label}</button>`}).join("")}function $(e){let a=h[e.rarity]??"#8a9ba8",t=e.raritySymbol??"\u25CF",r=e.earned?"achievement-card-earned":"achievement-card-locked",i="";if(e.progress&&!e.earned){let n=e.progress.target?Math.min(100,e.progress.current/e.progress.target*100):0;i=`
      <div class="achievement-progress">
        <div class="achievement-progress-label">
          <span>${e.progress.current} / ${e.progress.target}</span>
        </div>
        <div class="achievement-progress-bar">
          <div class="achievement-progress-fill" style="width:${n}%;background:${a}"></div>
        </div>
      </div>
    `}let s="";if(e.earned&&e.earnedAt)try{s=`<div class="achievement-earned-date">Earned ${new Date(e.earnedAt).toLocaleDateString()}</div>`}catch{}return`
    <div class="achievement-card ${r}" style="border-color:${e.earned?a:"rgba(255,255,255,0.08)"}">
      <div class="achievement-card-inner">
        <div class="achievement-card-symbol" style="color:${a}" aria-hidden="true">${t}</div>
        <div class="achievement-card-body">
          <div class="achievement-card-name" style="color:${e.earned?"#e0f0ff":"#8a9ba8"}">${g(e.name)}</div>
          <div class="achievement-card-desc">${g(e.description)}</div>
          <div class="achievement-card-meta">
            <span class="achievement-card-rarity" style="color:${a}">${e.rarity}</span>
            <span class="achievement-card-ap" style="color:${a}">+${e.achievementPoints} AP</span>
            <span class="achievement-card-category">${p[e.category]??e.category}</span>
          </div>
          ${i}
          ${s}
        </div>
      </div>
    </div>
  `}function g(e){let a=document.createElement("div");return a.textContent=e,a.innerHTML}export{R as renderAchievementsWorkspace};
//# sourceMappingURL=chunk-achievement-ui-IO5LE6TH.js.map
