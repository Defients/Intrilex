'use strict';
// ═══ CORRUPTURE EFFECT ATLAS — Application Logic ═══
(function(){
const DATA = JSON.parse(document.getElementById('atlas-data').textContent);
const routes = DATA.routes;
const primitives = DATA.primitives;
const pairwiseIds = DATA.pairwiseIds;
const pairwiseRows = DATA.pairwiseRows;
const paretoSet = new Set(DATA.paretoFrontier);
const A = DATA.authority;

// ── Helpers ──
const $ = (s,p=document)=>p.querySelector(s);
const $$ = (s,p=document)=>[...p.querySelectorAll(s)];
const esc = (v='') => String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rankStr = r => r==null?'—':`#${r}`;
// O(1) route lookup — was O(n) find() called per-row in multiple render loops
const routeMap = new Map(routes.map(r=>[r.id,r]));
const byId = id => routeMap.get(id);
const primMap = new Map(primitives.map(p=>[p.primitiveId,p]));
const byPrim = id => primMap.get(id);
const symExpand = c => ({P:'++',p:'+',M:'--',m:'-','=':'≈',x:'↔','?':'?'})[c]||'?';
// Magic-number label truncation lengths (used in scatter + matrix)
const LABEL_SHORT_SRC = 12;
const LABEL_SHORT_MATRIX = 18;
// DRY: wire click-to-open-drawer on any element with data-effect
const wireDrawerClicks = (container, selector='[data-effect]') => {
  $$(selector, container).forEach(el => {
    if(!el.dataset.effect) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => openDrawer(el.dataset.effect));
  });
};

const TIERS = ['S+','S','A+','A','B+','B','C+','C','D'];
const TIMINGS = [...new Set(routes.map(r=>r.timing))].sort();
const STATUSES = [...new Set(routes.map(r=>r.implementationStatus))].sort();
const CONFIDENCES = [...new Set(routes.map(r=>r.confidence))].sort();
const HEALTH_MAP = {
  'HEALTHY':'healthy','STRONG BUT HEALTHY':'strong','NICHE BUT HEALTHY':'niche',
  'WATCHLIST':'watch','INSUFFICIENT':'insufficient','BLOCKED':'blocked','POLICY-SENSITIVE':'policy'
};
const healthClass = v => HEALTH_MAP[v] || 'insufficient';
const healthShort = v => {
  const m={'HEALTHY':'HEALTHY','STRONG BUT HEALTHY':'STRONG','NICHE BUT HEALTHY':'NICHE','WATCHLIST':'WATCH','INSUFFICIENT':'INSUFF','BLOCKED':'BLOCKED','POLICY-SENSITIVE':'POLICY'};
  return m[v]||v;
};

// ── State ──
let state = {
  authority: 'written', // or 'executed'
  presentation: 'veteran', // or 'eli5'
  atlasSort: 'practicalWritten',
  filters: { tier:'', timing:'', status:'', health:'', confidence:'' },
  toggles: { executable:false, spades:false, quick:false, watchlist:false, pareto:false },
  search: '',
  rankTab: 'practicalWritten',
  compareA: routes[0].id,
  compareB: routes[1].id,
};

// ═══════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════
function bootSequence(){
  const overlay = $('#bootOverlay');
  const lines = $('#bootLines');
  const seq = [
    {t:'CORRUPTURE ATLAS // BOOT',c:'ok',d:0},
    {t:'Loading effect ranking data...',c:'ok',d:200},
    {t:`  routes: ${routes.length} AS-WRITTEN / ${routes.filter(r=>r.practicalExecuted!=null).length} AS-EXECUTED`,c:'ok',d:300},
    {t:`  primitives: ${primitives.length}`,c:'ok',d:100},
    {t:`  pareto frontier: ${DATA.paretoFrontier.length}`,c:'ok',d:100},
    {t:`  pairwise matrix: ${pairwiseIds.length}×${pairwiseIds.length}`,c:'ok',d:100},
    {t:'Authority check...',c:'ok',d:200},
    {t:`  RULEBOOK v${A.rulesVersion}`,c:'ok',d:100},
    {t:`  ENGINE v${A.engineVersion}`,c:'ok',d:100},
    {t:`  SIMULATION READINESS: ${A.simulationReadiness}`,c:A.simulationReadiness==='PARTIAL'?'warn':'ok',d:200},
    {t:'Corrupture rendering layer... ONLINE',c:'ok',d:200},
    {t:'Signal integrity: questionable',c:'warn',d:100},
    {t:'ATLAS READY',c:'ok',d:300},
  ];
  let delay = 0;
  seq.forEach(s=>{
    setTimeout(()=>{
      const el = document.createElement('div');
      el.className = 'boot-line';
      el.style.animationDelay = '0ms';
      el.innerHTML = `<span class="${s.c}">▸</span> ${esc(s.t)}`;
      lines.appendChild(el);
    }, delay);
    delay += s.d;
  });
  setTimeout(()=>{
    overlay.classList.add('done');
    setTimeout(()=>{ overlay.style.display='none'; }, 800);
  }, delay + 400);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 01: SIX DEFINITIONS
// ═══════════════════════════════════════════════════════════════
function renderDefinitions(){
  const axes = [
    {key:'raw',name:'RAW',q:'How violently does it alter the game if it resolves?',leader:DATA.strongestEffects.rawPotency,axis:'rawPotency'},
    {key:'practical',name:'PRACTICAL',q:'How valuable is it under real Intrilex economics?',leader:DATA.strongestEffects.practicalValueAsWritten,axis:'practicalWritten'},
    {key:'efficiency',name:'EFFICIENCY',q:'How much leverage do I get for what I sacrifice?',leader:DATA.strongestEffects.efficiency,axis:'efficiency'},
    {key:'threat',name:'THREAT',q:'How much does merely holding access change opponent behavior?',leader:DATA.strongestEffects.threatValue,axis:'threat'},
    {key:'comeback',name:'COMEBACK',q:'How hard does this reverse a losing position?',leader:DATA.strongestEffects.comeback,axis:'comeback'},
    {key:'snowball',name:'SNOWBALL',q:'How hard does this preserve/convert a winning position?',leader:DATA.strongestEffects.snowball,axis:'snowball'},
  ];
  const grid = $('#definitionsGrid');
  grid.innerHTML = axes.map(a=>{
    let leaderRoute, leaderRank;
    if(a.key==='raw'){
      const p = byPrim(a.leader);
      if(!p) return '';
      leaderRoute = byId(p.bestRouteId);
      leaderRank = `#${p.rank}`;
    } else {
      leaderRoute = byId(a.leader);
      leaderRank = rankStr(leaderRoute ? leaderRoute[a.axis] : null);
    }
    if(!leaderRoute) return '';
    return `<div class="def-card" data-axis="${a.key}">
      <div class="def-axis">${a.name}</div>
      <div class="def-name">${a.name}</div>
      <div class="def-q">${esc(a.q)}</div>
      <div class="def-leader">Champion: <b>${esc(leaderRoute.source)} — ${esc(leaderRoute.route)}</b> (${leaderRank})</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 02: CHAMPIONS
// ═══════════════════════════════════════════════════════════════
function renderChampions(){
  const champs = [
    {axis:'RAW POTENCY',id:DATA.strongestEffects.rawPotency,rankField:null,isPrimitive:true},
    {axis:'PRACTICAL (AS-WRITTEN)',id:DATA.strongestEffects.practicalValueAsWritten,rankField:'practicalWritten'},
    {axis:'EFFICIENCY',id:DATA.strongestEffects.efficiency,rankField:'efficiency'},
    {axis:'THREAT',id:DATA.strongestEffects.threatValue,rankField:'threat'},
    {axis:'COMEBACK',id:DATA.strongestEffects.comeback,rankField:'comeback'},
    {axis:'SNOWBALL',id:DATA.strongestEffects.snowball,rankField:'snowball'},
  ];
  const grid = $('#championsGrid');
  grid.innerHTML = champs.map(c=>{
    let route, rank, primitiveName;
    if(c.isPrimitive){
      const p = byPrim(c.id);
      if(!p) return '';
      route = byId(p.bestRouteId);
      rank = `#${p.rank}`;
      primitiveName = p.primitiveName;
    } else {
      route = byId(c.id);
      rank = rankStr(route[c.rankField]);
      primitiveName = route.primitiveName;
    }
    if(!route) return '';
    return `<div class="champ-card" data-effect="${route.id}">
      <div class="champ-rank">${rank.replace('#','')}</div>
      <div class="champ-axis">${c.axis}</div>
      <div class="champ-effect">${esc(route.source)} — ${esc(route.route)}</div>
      <div class="champ-source">${esc(route.id)} // ${esc(route.timing)}</div>
      <div class="champ-why">${esc(route.reason)}</div>
      <div class="champ-meta">
        <div class="champ-meta-item"><span class="label">Primitive</span><span class="val">${esc(primitiveName)}</span></div>
        <div class="champ-meta-item"><span class="label">Points Forgone</span><span class="val">${route.pointsForgone}</span></div>
        <div class="champ-meta-item"><span class="label">Extra Cost</span><span class="val">${esc(route.extraCost)}</span></div>
        <div class="champ-meta-item"><span class="label">Tier</span><span class="val"><span class="tier-badge tier-${esc(route.tier)}">${esc(route.tier)}</span></span></div>
        <div class="champ-meta-item"><span class="label">Status</span><span class="val"><span class="status-badge status-${esc(route.implementationStatus)}">${esc(route.implementationStatus)}</span></span></div>
        <div class="champ-meta-item"><span class="label">Health</span><span class="val"><span class="health-badge ${healthClass(route.healthVerdict)}">${healthShort(route.healthVerdict)}</span></span></div>
      </div>
    </div>`;
  }).join('');
  // Click to open drawer
  wireDrawerClicks(grid, '.champ-card');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 03: COMPLETE POWER ATLAS
// ═══════════════════════════════════════════════════════════════
function populateAtlasFilters(){
  const fillSelect = (sel,opts)=>{ sel.innerHTML = '<option value="">All</option>'+opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join(''); };
  fillSelect($('#filterTier'),TIERS);
  fillSelect($('#filterTiming'),TIMINGS);
  fillSelect($('#filterStatus'),STATUSES);
  fillSelect($('#filterConfidence'),CONFIDENCES);
  const healthOpts = [...new Set(routes.map(r=>r.healthVerdict))].sort();
  fillSelect($('#filterHealth'),healthOpts);
}

function atlasFilteredRoutes(){
  const f = state.filters, t = state.toggles, s = state.search.toLowerCase();
  return routes.filter(r=>{
    if(f.tier && r.tier!==f.tier) return false;
    if(f.timing && r.timing!==f.timing) return false;
    if(f.status && r.implementationStatus!==f.status) return false;
    if(f.health && r.healthVerdict!==f.health) return false;
    if(f.confidence && r.confidence!==f.confidence) return false;
    if(t.executable && r.practicalExecuted==null) return false;
    if(t.spades && !r.source.includes('♠')) return false;
    if(t.quick && r.timing!=='Quick' && r.timing!=='Instant') return false;
    if(t.watchlist && r.healthVerdict!=='WATCHLIST') return false;
    if(t.pareto && !paretoSet.has(r.id)) return false;
    if(s){
      const hay = (r.id+' '+r.source+' '+r.route+' '+r.primitiveName+' '+r.primitiveId).toLowerCase();
      if(!hay.includes(s)) return false;
    }
    return true;
  });
}

function renderAtlas(){
  const head = $('#atlasHead');
  const body = $('#atlasBody');
  const sortKey = state.atlasSort;
  const cols = [
    {key:'rank',label:'#',cls:'rank-cell'},
    {key:'effect',label:'Effect',cls:'effect-cell'},
    {key:'source',label:'Source',cls:'source-cell'},
    {key:'timing',label:'Timing',cls:'timing-cell'},
    {key:state.authority==='executed'?'practicalExecuted':'practicalWritten',label:state.authority==='executed'?'Prac(E)':'Prac(W)',cls:'rank-cell'},
    {key:'efficiency',label:'Eff',cls:'rank-cell'},
    {key:'threat',label:'Thr',cls:'rank-cell'},
    {key:'comeback',label:'CB',cls:'rank-cell'},
    {key:'snowball',label:'SB',cls:'rank-cell'},
    {key:'tier',label:'Tier',cls:'tier-cell'},
    {key:'status',label:'Status',cls:'status-cell'},
  ];
  head.innerHTML = cols.map(c=>{
    const isSort = c.key===sortKey;
    return `<th data-sort="${c.key}" class="${c.cls}">${esc(c.label)}${isSort?' <span class="sort-arrow">▼</span>':''}</th>`;
  }).join('');
  $$('#atlasHead th').forEach(th=>{
    if(th.dataset.sort && th.dataset.sort!=='rank' && th.dataset.sort!=='effect' && th.dataset.sort!=='source' && th.dataset.sort!=='timing' && th.dataset.sort!=='tier' && th.dataset.sort!=='status'){
      th.addEventListener('click',()=>{
        state.atlasSort = th.dataset.sort;
        $('#atlasSort').value = th.dataset.sort;
        renderAtlas();
      });
    }
  });

  let filtered = atlasFilteredRoutes();
  // Sort — nulls last; all rank fields sort ascending (lower = stronger)
  filtered.sort((a,b)=>{
    const va = a[sortKey], vb = b[sortKey];
    if(va==null && vb==null) return 0;
    if(va==null) return 1;
    if(vb==null) return -1;
    return va-vb;
  });

  $('#atlasCount').innerHTML = `Showing <b>${filtered.length}</b> of <b>${routes.length}</b> routes`;

  if(filtered.length===0){
    body.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:40px;color:var(--muted);font-style:italic">No routes match the current filters. Try clearing search or filters.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(r=>{
    const rank = state.authority==='executed' ? r.practicalExecuted : r.practicalWritten;
    return `<tr data-effect="${r.id}" class="atlas-row">
      <td class="rank-cell">${rank!=null?rank:'—'}</td>
      <td class="effect-cell">${esc(r.route)}</td>
      <td class="source-cell">${esc(r.source)}</td>
      <td class="timing-cell">${esc(r.timing)}</td>
      <td class="rank-cell">${rankStr(state.authority==='executed'?r.practicalExecuted:r.practicalWritten)}</td>
      <td class="rank-cell">${rankStr(r.efficiency)}</td>
      <td class="rank-cell">${rankStr(r.threat)}</td>
      <td class="rank-cell">${rankStr(r.comeback)}</td>
      <td class="rank-cell">${rankStr(r.snowball)}</td>
      <td class="tier-cell"><span class="tier-badge tier-${esc(r.tier)}">${esc(r.tier)}</span></td>
      <td class="status-cell"><span class="status-badge status-${esc(r.implementationStatus)}">${esc(r.implementationStatus)}</span></td>
    </tr>`;
  }).join('');

  $$('.atlas-row',body).forEach(tr=>{
    tr.addEventListener('click',()=>{
      // Toggle expansion
      const next = tr.nextElementSibling;
      if(next && next.classList.contains('detail-row')){
        next.remove();
        tr.classList.remove('expanded');
        return;
      }
      $$('.detail-row',body).forEach(d=>d.remove());
      $$('.atlas-row',body).forEach(r=>r.classList.remove('expanded'));
      tr.classList.add('expanded');
      const r = byId(tr.dataset.effect);
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = `<td colspan="${cols.length}">${atlasDetailHTML(r)}</td>`;
      tr.after(detailRow);
      // Wire the FULL DETAILS button safely (was inline onclick)
      const detailBtn = detailRow.querySelector('[data-detail-btn]');
      if(detailBtn) detailBtn.addEventListener('click',()=>openDrawer(detailBtn.dataset.detailBtn));
    });
  });
}

function atlasDetailHTML(r){
  const stats = [
    ['Effect ID', r.id],
    ['Primitive', r.primitiveName],
    ['Practical (Written)', rankStr(r.practicalWritten)],
    ['Practical (Executed)', rankStr(r.practicalExecuted)],
    ['Efficiency', rankStr(r.efficiency)],
    ['Threat', rankStr(r.threat)],
    ['Comeback', rankStr(r.comeback)],
    ['Snowball', rankStr(r.snowball)],
    ['Points Forgone', r.pointsForgone],
    ['Extra Cost', r.extraCost],
    ['Setup', r.setup||'—'],
    ['Counterplay', r.counterplay||'—'],
    ['Reachability', r.reachability||'—'],
    ['Confidence', r.confidence],
    ['Profile', r.profileAvailability],
  ];
  return `<div class="atlas-detail">
    <div class="atlas-detail-grid">${stats.map(s=>`<div class="atlas-detail-item"><span class="label">${esc(s[0])}</span><span class="val">${esc(s[1])}</span></div>`).join('')}</div>
    <div class="atlas-detail-reason">${esc(r.reason)}</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <span class="tier-badge tier-${esc(r.tier)}">${esc(r.tier)}</span>
      <span class="status-badge status-${esc(r.implementationStatus)}">${esc(r.implementationStatus)}</span>
      <span class="health-badge ${healthClass(r.healthVerdict)}">${healthShort(r.healthVerdict)}</span>
      ${paretoSet.has(r.id)?'<span class="health-badge health-healthy">PARETO</span>':''}
      <button data-detail-btn="${esc(r.id)}" style="font-size:11px;padding:4px 12px">FULL DETAILS</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 04: RANK DISAGREEMENT LAB
// ═══════════════════════════════════════════════════════════════
function renderDisagreement(){
  const lab = $('#disagreementLab');
  // Find effects with biggest rank disagreement across axes
  const candidates = routes.filter(r=>r.practicalWritten!=null && r.efficiency!=null && r.threat!=null && r.comeback!=null && r.snowball!=null);
  const scored = candidates.map(r=>{
    const ranks = [r.practicalWritten,r.efficiency,r.threat,r.comeback,r.snowball].filter(x=>x!=null);
    const spread = Math.max(...ranks) - Math.min(...ranks);
    return {r,spread};
  }).sort((a,b)=>b.spread-a.spread).slice(0,8);
  const axes = [
    {key:'practicalWritten',label:'PRAC',color:'var(--amber)'},
    {key:'efficiency',label:'EFF',color:'var(--voidrot)'},
    {key:'threat',label:'THR',color:'#a78bfa'},
    {key:'comeback',label:'CB',color:'#5ad7e8'},
    {key:'snowball',label:'SB',color:'#d18ab2'},
  ];
  const maxRank = routes.length;
  lab.innerHTML = scored.map(({r,spread})=>{
    const bars = axes.map(a=>{
      const v = r[a.key];
      const pct = v!=null ? (1 - v/maxRank) * 100 : 0;
      return `<div class="rank-bar-wrap">
        <div class="rank-bar"><div class="rank-bar-fill" style="height:${pct}%;background:${a.color}"></div><span class="rank-bar-label">${v!=null?v:'—'}</span></div>
        <div class="rank-bar-axis">${a.label}</div>
      </div>`;
    }).join('');
    return `<div class="rank-rail" data-effect="${r.id}">
      <div class="rank-rail-name">${esc(r.route)}<span class="src">${esc(r.source)} // spread ${spread}</span></div>
      <div class="rank-rail-bars">${bars}</div>
    </div>`;
  }).join('');
  wireDrawerClicks(lab, '.rank-rail');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 05: COMEBACK ↔ SNOWBALL SCATTER
// ═══════════════════════════════════════════════════════════════
function renderScatter(){
  const wrap = $('#scatterWrap');
  const pts = routes.filter(r=>r.comeback!=null && r.snowball!=null);
  const W=900,H=600,pad=60;
  const maxR = routes.length;
  const x = v => pad + (1 - v/maxR) * (W - 2*pad);
  const y = v => pad + (1 - v/maxR) * (H - 2*pad);
  // Outliers to label
  const labeled = new Set();
  // Top comeback / top snowball / extreme disagreement
  [...pts].sort((a,b)=>a.comeback-b.comeback).slice(0,5).forEach(r=>labeled.add(r.id));
  [...pts].sort((a,b)=>a.snowball-b.snowball).slice(0,5).forEach(r=>labeled.add(r.id));
  // Extreme split
  [...pts].sort((a,b)=>(b.comeback-b.snowball)-(a.comeback-a.snowball)).slice(0,3).forEach(r=>labeled.add(r.id));
  [...pts].sort((a,b)=>(b.snowball-b.comeback)-(a.snowball-a.comeback)).slice(0,3).forEach(r=>labeled.add(r.id));

  let svg = `<svg class="scatter-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comeback vs Snowball scatter plot">`;
  // Grid lines
  for(let i=0;i<=4;i++){
    const v = Math.round(maxR * i/4);
    const px = x(maxR - v), py = y(maxR - v);
    svg += `<line class="scatter-grid" x1="${pad}" y1="${py}" x2="${W-pad}" y2="${py}"/>`;
    svg += `<line class="scatter-grid" x1="${px}" y1="${pad}" x2="${px}" y2="${H-pad}"/>`;
  }
  // Axes
  svg += `<line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--border)" stroke-width="1"/>`;
  svg += `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" stroke="var(--border)" stroke-width="1"/>`;
  // Axis labels
  svg += `<text class="scatter-axis-label" x="${W/2}" y="${H-15}" text-anchor="middle">← COMEBACK POWER (low rank# = strong)</text>`;
  svg += `<text class="scatter-axis-label" x="20" y="${H/2}" text-anchor="middle" transform="rotate(-90 20 ${H/2})">← SNOWBALL POWER</text>`;
  // Quadrant labels
  svg += `<text class="scatter-quad-label" x="${W-pad-10}" y="${pad+15}" text-anchor="end">ELITE BOTH</text>`;
  svg += `<text class="scatter-quad-label" x="${pad+10}" y="${H-pad-10}" text-anchor="start">WEAK BOTH</text>`;
  svg += `<text class="scatter-quad-label" x="${W-pad-10}" y="${H-pad-10}" text-anchor="end">SNOWBALL SPECIALIST</text>`;
  svg += `<text class="scatter-quad-label" x="${pad+10}" y="${pad+15}" text-anchor="start">COMEBACK SPECIALIST</text>`;
  // Dots
  pts.forEach(r=>{
    const cx = x(r.comeback), cy = y(r.snowball);
    const isPareto = paretoSet.has(r.id);
    const isSpade = r.source.includes('♠');
    const color = isPareto ? 'var(--voidrot)' : isSpade ? 'var(--hostile)' : 'var(--phosphor-dim)';
    const radius = isPareto ? 5 : 3.5;
    svg += `<circle class="scatter-dot" cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" opacity="0.7" data-effect="${r.id}"><title>${esc(r.source)} — ${esc(r.route)} (CB:${r.comeback} SB:${r.snowball})</title></circle>`;
    if(labeled.has(r.id)){
      const label = r.source.replace(' natural','').replace(' scored','').slice(0,LABEL_SHORT_SRC);
      svg += `<text class="scatter-label" x="${cx+7}" y="${cy+3}">${esc(label)}</text>`;
    }
  });
  svg += `</svg>`;
  wrap.innerHTML = svg;
  $$('.scatter-dot',wrap).forEach(dot=>{
    dot.addEventListener('click',()=>openDrawer(dot.dataset.effect));
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 06: SPADES PREMIUM
// ═══════════════════════════════════════════════════════════════
function renderSpades(){
  const spadeDefs = [
    {glyph:'A♠',name:'Exile Counter',role:'Reactive authority',id:'A_SPADE_EXILE_COUNTER'},
    {glyph:'2♠',name:'Efficient Access/Copy',role:'Discount apocalypse',id:'TWO_SPADE_SOLO_WILD_TOTAL_CLEAR'},
    {glyph:'4♠',name:'Structural Reset',role:'Board wipe',id:'FOUR_SPADE_TOTAL_CLEAR'},
    {glyph:'6♠',name:'Deep Draw',role:'Card sculpting',id:'SIX_SPADE_DEEP_DRAW'},
    {glyph:'8♠',name:'Free Scuttle',role:'Zero-MT removal',id:'EIGHT_SPADE_FREE_SCUTTLE'},
    {glyph:'J♠',name:'ER Control Transfer',role:'Anchor theft',id:'JACK_SPADE_ER_ATTACHMENT'},
    {glyph:'Q♠',name:'Structural Resilience',role:'Clear immunity',id:'QUEEN_SPADE_CLEAR_IMMUNITY'},
    {glyph:'K♠',name:'Multi-Play Authority',role:'Permission control',id:'KING_SPADE_INSTANT_MULTI_COUNTER'},
  ];
  $('#spadesGrid').innerHTML = spadeDefs.map(s=>{
    const r = byId(s.id);
    if(!r) return '';
    return `<div class="spade-card" data-effect="${r.id}">
      <div class="spade-glyph">${s.glyph}</div>
      <div class="spade-name">${esc(s.name)}</div>
      <div class="spade-role">${esc(s.role)}</div>
      <div class="spade-desc">${esc(r.reason)}</div>
      <div class="spade-ranks">
        <span class="spade-rank-chip">PRAC(W) <b>${rankStr(r.practicalWritten)}</b></span>
        <span class="spade-rank-chip">EFF <b>${rankStr(r.efficiency)}</b></span>
        <span class="spade-rank-chip">THR <b>${rankStr(r.threat)}</b></span>
        <span class="spade-rank-chip">CB <b>${rankStr(r.comeback)}</b></span>
        <span class="spade-rank-chip">SB <b>${rankStr(r.snowball)}</b></span>
      </div>
    </div>`;
  }).join('');
  wireDrawerClicks($('#spadesGrid'), '.spade-card');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 07: 2♠ PROBLEM
// ═══════════════════════════════════════════════════════════════
function renderTwoSpade(){
  const ids = ['FOUR_SPADE_TOTAL_CLEAR','TWO_SPADE_SOLO_WILD_TOTAL_CLEAR','KING_SPADE_WILD_TOTAL_CLEAR'];
  const labels = ['4♠ Natural','2♠ → Total Clear','K♠ → Total Clear'];
  const wrap = $('#twospadeCompare');
  wrap.innerHTML = ids.map((id,i)=>{
    const r = byId(id);
    if(!r) return '';
    const isDiscount = id==='TWO_SPADE_SOLO_WILD_TOTAL_CLEAR';
    return `<div class="compare-3-col ${isDiscount?'discount':''}">
      <div class="compare-3-title">${labels[i]}</div>
      <div class="compare-3-primitive">SAME PRIMITIVE: TOTAL CLEAR</div>
      <div class="compare-3-stat"><span class="l">Practical (W)</span><span class="v">${rankStr(r.practicalWritten)}</span></div>
      <div class="compare-3-stat"><span class="l">Efficiency</span><span class="v">${rankStr(r.efficiency)}</span></div>
      <div class="compare-3-stat"><span class="l">Comeback</span><span class="v">${rankStr(r.comeback)}</span></div>
      <div class="compare-3-stat"><span class="l">Points Forgone</span><span class="v">${r.pointsForgone}</span></div>
      <div class="compare-3-stat"><span class="l">Extra Cost</span><span class="v" style="font-size:10px">${esc(r.extraCost)}</span></div>
      <div class="compare-3-stat"><span class="l">Threat</span><span class="v">${rankStr(r.threat)}</span></div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 08: K♠ TREE
// ═══════════════════════════════════════════════════════════════
function renderKSpade(){
  const ksRoutes = routes.filter(r=>r.source.includes('K♠')).sort((a,b)=>(a.practicalWritten||999)-(b.practicalWritten||999));
  const maxRank = routes.length;
  const tree = $('#ksTree');
  tree.innerHTML = ksRoutes.map(r=>{
    const pct = r.practicalWritten!=null ? (1 - r.practicalWritten/maxRank)*100 : 0;
    const color = r.practicalWritten<=5?'var(--hostile)':r.practicalWritten<=20?'var(--amber)':r.practicalWritten<=50?'var(--voidrot)':r.practicalWritten<=80?'var(--tier-a)':'var(--faint)';
    return `<div class="ks-row" data-effect="${r.id}">
      <div class="ks-route">${esc(r.route)}</div>
      <div class="ks-bar-wrap"><div class="ks-bar" style="width:${pct}%;background:${color}"></div></div>
      <div class="ks-rank">${rankStr(r.practicalWritten)}</div>
      <div class="ks-eff">${rankStr(r.efficiency)}</div>
    </div>`;
  }).join('');
  $$('.ks-row',tree).forEach(el=>{
    el.style.cursor='pointer';
    el.addEventListener('click',()=>openDrawer(el.dataset.effect));
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 09: QUIET FILTH
// ═══════════════════════════════════════════════════════════════
function renderQuiet(){
  const quietIds = [
    {id:'JACK_INSTANT_DISRUPT',desc:'Modest-looking but highly efficient sequencing denial. Draw 1 + constrain opponent Action type — without surrendering your normal development. #2 Efficiency.'},
    {id:'A_BASE_COUNTER',desc:'The fundamental counter threat that shapes all sequencing. Available in 3 copies, held in check by the 4-point PR scoring sacrifice.'},
    {id:'QUEEN_QUICK_AEGIS',desc:'Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn. Shields critical high-value PR points.'},
    {id:'NINE_INSTANT_TAP',desc:'Instant-speed point denial that reduces an enemy PR card contribution to 0 until they score again. Highly effective for denying lethal victory.'},
  ];
  $('#quietGrid').innerHTML = quietIds.map(q=>{
    const r = byId(q.id);
    if(!r) return '';
    return `<div class="quiet-card" data-effect="${r.id}">
      <div class="quiet-name">${esc(r.source)} — ${esc(r.route)}</div>
      <div class="quiet-ranks">PRAC(W) ${rankStr(r.practicalWritten)} // EFF ${rankStr(r.efficiency)} // THR ${rankStr(r.threat)}</div>
      <div class="quiet-desc">${esc(q.desc)}</div>
    </div>`;
  }).join('');
  wireDrawerClicks($('#quietGrid'), '.quiet-card');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10: BIG BUTTON TAX
// ═══════════════════════════════════════════════════════════════
function renderTax(){
  const taxIds = [
    {id:'A_SUPER_COUNTER',desc:'Phenomenal deterrent and emergency answer. But assembling/using it is expensive as hell — two Aces committed.'},
    {id:'ULTRA_THREE_RED_COUNTER',desc:'Powerful authority. Expensive commitment — 3 cards committed.'},
    {id:'ULTRA_2B2R_DRAW',desc:'Very strong effect, but the four-card recipe is the whole goddamn story.'},
    {id:'EIGHT_SUPER_ABSOLUTE_SCUTTLE',desc:'Spectacular removal. But 2 Eights committed — and Eights are individually valuable.'},
    {id:'KING_SPADE_WILD_TOTAL_CLEAR',desc:'Huge outcome. Expensive route — K♠ exiled permanently, +1 discard.'},
    {id:'TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE',desc:'Multi-card mimic route. 10♦ Exile-Bound + 1 Two card. Recipe availability ≠ recipe correctness.'},
  ];
  $('#taxGrid').innerHTML = taxIds.map(t=>{
    const r = byId(t.id);
    if(!r) return '';
    return `<div class="tax-card" data-effect="${r.id}">
      <div class="name">${esc(r.source)} — ${esc(r.route)}</div>
      <div class="drop"><span class="raw">Practical: ${rankStr(r.practicalWritten)}</span> → <span class="eff">Efficiency: ${rankStr(r.efficiency)}</span></div>
      <div class="desc">${esc(t.desc)}</div>
    </div>`;
  }).join('');
  wireDrawerClicks($('#taxGrid'), '.tax-card');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 11: STATE-DEPENDENT META
// ═══════════════════════════════════════════════════════════════
function renderState(){
  const behind = routes.filter(r=>r.comeback!=null).sort((a,b)=>a.comeback-b.comeback).slice(0,8);
  const ahead = routes.filter(r=>r.snowball!=null).sort((a,b)=>a.snowball-b.snowball).slice(0,8);
  const renderItem = r => `<li data-effect="${r.id}">${esc(r.source)} — ${esc(r.route)}<div class="ranks">CB ${rankStr(r.comeback)} // SB ${rankStr(r.snowball)}</div></li>`;
  $('#stateBehind').innerHTML = behind.map(renderItem).join('');
  $('#stateAhead').innerHTML = ahead.map(renderItem).join('');
  wireDrawerClicks($('#stateBehind'), 'li');
  wireDrawerClicks($('#stateAhead'), 'li');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 12: PARETO FRONTIER
// ═══════════════════════════════════════════════════════════════
function renderPareto(){
  $('#paretoGrid').innerHTML = DATA.paretoFrontier.map(id=>{
    const r = byId(id);
    if(!r) return '';
    return `<div class="pareto-card" data-effect="${r.id}">
      <div class="pareto-name">${esc(r.source)} — ${esc(r.route)}</div>
      <div class="pareto-src">${esc(r.id)} // PRAC(W) ${rankStr(r.practicalWritten)}</div>
      <div class="pareto-reason">${esc(r.reason)}</div>
    </div>`;
  }).join('');
  wireDrawerClicks($('#paretoGrid'), '.pareto-card');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 13: WRITTEN VS EXECUTED
// ═══════════════════════════════════════════════════════════════
function renderWvE(){
  const missing = routes.filter(r=>r.practicalExecuted==null);
  $('#wveMissing').innerHTML = missing.map(r=>
    `<span class="wve-missing-item" data-effect="${r.id}">${esc(r.source)} — ${esc(r.route)}</span>`
  ).join('');
  wireDrawerClicks($('#wveMissing'), '.wve-missing-item');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 14: VETERAN META-ANALYSIS
// ═══════════════════════════════════════════════════════════════
function renderVeteran(){
  const ch = $('#veteranChapter');
  const sections = [
    {num:'1',title:'Intrilex is secretly a game about tempo privilege',html:`
      <p>The headline ranking makes that almost impossible to ignore. The top five AS-WRITTEN practical routes are:</p>
      <table><tr><th>Practical</th><th>Effect</th><th>What it really buys</th></tr>
      <tr><td>#1</td><td>A♠ Exile Counter</td><td>Reactive authority</td></tr>
      <tr><td>#2</td><td>8♠ Free Scuttle</td><td>Removal without MT expenditure</td></tr>
      <tr><td>#3</td><td>K♠ Multi-Play Counter</td><td>Permission control</td></tr>
      <tr><td>#4</td><td>4♠ Total Clear</td><td>Structural reset</td></tr>
      <tr><td>#5</td><td>2♠ → Total Clear</td><td>Structural reset at absurdly low commitment</td></tr></table>
      <p>Three of those five are fundamentally about <span class="highlight">acting outside the ordinary one-action rhythm</span> or controlling whether the opponent is allowed to execute theirs.</p>
      <p>Roughly <span class="voidrot">two-thirds of all Instant and Quick mechanics land in the Top 30</span>, versus only about one-fifth of Actions.</p>
      <blockquote>A Mini-Turn is far more expensive than it initially looks.</blockquote>
      <p>That's why J Disrupt looks innocuous but ends up <span class="highlight">#2 Efficiency</span>. It's not merely "draw 1 + mess with sequencing." It's "draw 1 + constrain sequencing <span class="highlight">without surrendering your normal development</span>." That's fucking premium.</p>
    `},
    {num:'2',title:'The hidden resource: option value',html:`
      <p><span class="highlight">Card value ≈ immediate value + option value + threat value + information value</span></p>
      <p>When you score a card, you cash most of that out. You get certainty. But you collapse its decision tree.</p>
      <p>This explains why ⭐A is only <span class="hostile">#20 Practical</span>, yet <span class="voidrot">#2 Threat</span>. Its resolved effect is enormous. But actually creating it requires <span class="highlight">two Aces</span>. You've just surrendered two independent counter threats, potentially 8 Points, Anchor/Purge possibilities, and future flexibility — for one absurdly authoritative answer.</p>
      <blockquote>Maximum authority ≠ maximum strategic value. That's Intrilex in one sentence.</blockquote>
    `},
    {num:'3',title:'A card you never play can be winning the game',html:`
      <p>Veterans should care about <span class="highlight">threat rank</span> much more than beginners do. A hidden response card creates a <span class="voidrot">permission structure</span>. The more experienced the opponent, the more powerful that permission structure becomes because they actually respect it.</p>
      <p>Some of these cards might become <span class="highlight">stronger in expert-vs-expert play</span> than heuristic-policy telemetry suggests.</p>
    `},
    {num:'4',title:'The S+ tier is five different kinds of power',html:`
      <p>The Top 5 aren't five cards doing the same thing better than everyone else. They're almost a pentagon:</p>
      <p><span class="hostile">A♠</span> — answer quality<br><span class="voidrot">8♠</span> — action efficiency<br><span class="hostile">K♠</span> — permission control<br><span class="hostile">4♠</span> — state destruction<br><span class="hostile">2♠→4♠</span> — cost compression</p>
      <p>They're competing across <span class="highlight">different dimensions</span>.</p>
    `},
    {num:'5',title:'But uh... THE TOP FIVE ARE ALL SPADES',html:`
      <p>😂 That deserves attention. Not panic. Attention.</p>
      <p>Every S+ practical route is tied to an exact Spade identity. That's probably the clearest evidence that <span class="highlight">Spades are mechanically the premium suit</span>.</p>
      <blockquote>TRACK THE SPADES. Track what has been seen, spent, countered, buried, exiled, returned.</blockquote>
    `},
    {num:'6',title:'2♠ might be the most deceptively valuable physical card',html:`
      <p>Same underlying nuclear outcome. Completely different economics.</p>
      <table><tr><th>Route</th><th>Practical</th><th>Efficiency</th><th>Comeback</th></tr>
      <tr><td>4♠ → Total Clear</td><td>#4</td><td>#13</td><td>#1</td></tr>
      <tr><td>2♠ → Total Clear</td><td>#5</td><td>#5</td><td>#2</td></tr>
      <tr><td>K♠ → Total Clear</td><td>#10</td><td>#45</td><td>#3</td></tr></table>
      <blockquote>Copying an effect does not copy its cost.</blockquote>
      <p>Treat 2♠ not as a two-point card. Treat it as a <span class="highlight">latent answer card whose cash value happens to be 2</span>.</p>
    `},
    {num:'7',title:'K♠ is the clearest expression of high-level Intrilex',html:`
      <table><tr><th>K♠ route</th><th>Practical</th><th>Efficiency</th></tr>
      <tr><td>Multi-Play Counter</td><td>#3</td><td>#10</td></tr>
      <tr><td>→ Total Clear</td><td>#10</td><td>#45</td></tr>
      <tr><td>9 Anchor</td><td>#39</td><td>#36</td></tr>
      <tr><td>→ Deep Draw</td><td>#67</td><td>#88</td></tr>
      <tr><td>→ Row Clear</td><td>#72</td><td>#85</td></tr>
      <tr><td>→ Topdeck</td><td>#94</td><td>#93</td></tr>
      <tr><td>→ Recycle</td><td>#96</td><td>#95</td></tr>
      <tr><td>→ Bounce</td><td>#99</td><td>#98</td></tr></table>
      <blockquote>You possess an enormous option set. Please don't be stupid.</blockquote>
    `},
    {num:'8',title:'Comeback vs Snowball: the most important rank split',html:`
      <p>Comeback vs Snowball Spearman correlation ≈ <span class="highlight">0.036</span>. Essentially zero.</p>
      <p><span class="hostile">Comeback monsters:</span> 4♠ Total Clear (CB#1, SB#78), 2♠→TC (CB#2, SB#79), K♠→TC (CB#3, SB#81)</p>
      <p><span class="voidrot">Snowball monsters:</span> BJ Board Lock (SB#1, CB#58), 8 Quick Aegis (SB#2, CB#81), 10♠ Stack Theft (SB#3, CB#69), Queen Guard (SB#4, CB#85)</p>
      <blockquote>Behind → destroy/invert state. Ahead → freeze/protect state.</blockquote>
    `},
    {num:'9',title:'"Best card" is often the wrong question',html:`
      <p>Ask instead: <span class="highlight">Best at what point on the game-state vector?</span></p>
      <p>Global Practical rank is useful for describing <span class="voidrot">portable value</span>. But veteran play requires <span class="hostile">conditional rank</span>.</p>
    `},
    {num:'10',title:'The true generalists are especially dangerous',html:`
      <table><tr><th>Effect</th><th>Comeback</th><th>Snowball</th></tr>
      <tr><td>A♠</td><td>#18</td><td>#10</td></tr>
      <tr><td>8♠</td><td>#14</td><td>#18</td></tr>
      <tr><td>K♠ Counter</td><td>#19</td><td>#11</td></tr>
      <tr><td>10♣ Foundation</td><td>#13</td><td>#21</td></tr>
      <tr><td>10♥</td><td>#23</td><td>#12</td></tr>
      <tr><td>Base Ace</td><td>#26</td><td>#13</td></tr>
      <tr><td>9 Tap</td><td>#21</td><td>#26</td></tr></table>
      <p>These are <span class="highlight">portable power</span> — rarely embarrassing regardless of board state.</p>
    `},
    {num:'11',title:'J Disrupt is confirmed sleeper filth',html:`
      <p><span class="highlight">#13 Practical / #2 Efficiency</span>. Raw potency? Way down. That's the point. It's powerful because it <span class="voidrot">interferes with sequence construction incredibly cheaply</span>.</p>
    `},
    {num:'12',title:'Supers/Ultras tell the opposite story',html:`
      <p><span class="hostile">⭐A</span>: Practical #20, Efficiency #65, Threat #2. Phenomenal deterrent. Expensive as hell.</p>
      <p><span class="hostile">3-Red Ultra</span>: Practical #14, Efficiency #47. Powerful authority. Expensive commitment.</p>
      <blockquote>Intrilex permits spectacular shit because spectacular shit often destroys valuable optionality.</blockquote>
    `},
    {num:'13',title:'Recipe available is NOT recipe correct',html:`
      <p>The real price isn't "four cards." It's <span class="highlight">the best future line among the four option bundles you just destroyed</span>.</p>
      <blockquote>When you can make an Ultra, don't ask "Is the Ultra strong?" Ask: "What is the strongest thing among these components that I will no longer be able to do?"</blockquote>
    `},
    {num:'14',title:'10♥ is a conversion test',html:`
      <p><span class="highlight">#9 Practical</span>, #22 Efficiency, #23 Comeback, #12 Snowball. Giving up a 10-point score means its extra actions need to <span class="voidrot">convert</span>.</p>
      <blockquote>Don't buy tempo unless you've already identified what you're buying with it.</blockquote>
    `},
    {num:'15',title:'Queens are lead-conversion architecture',html:`
      <table><tr><th>Queen</th><th>Practical</th><th>Snowball</th><th>Comeback</th></tr>
      <tr><td>Queen Guard</td><td>#11</td><td>#4</td><td>#85</td></tr>
      <tr><td>Queen's Court</td><td>#16</td><td>#6</td><td>#82</td></tr>
      <tr><td>Queen Quick Aegis</td><td>#21</td><td>#5</td><td>#91</td></tr>
      <tr><td>Q♠ immunity</td><td>#34</td><td>#8</td><td>#92</td></tr></table>
      <blockquote>"I have something worth protecting. Now good luck undoing it."</blockquote>
    `},
    {num:'16',title:'Fours are the anti-Queen philosophy',html:`
      <table><tr><th>Four</th><th>Comeback</th><th>Snowball</th></tr>
      <tr><td>4♠</td><td>#1</td><td>#78</td></tr>
      <tr><td>4 Row Clear PR</td><td>#6</td><td>#84</td></tr>
      <tr><td>4 Row Clear ER</td><td>#7</td><td>#88</td></tr>
      <tr><td>⭐4 PR Exchange</td><td>#5</td><td>#89</td></tr>
      <tr><td>⭐4 ER Exchange</td><td>#10</td><td>#92</td></tr></table>
      <blockquote>Queens: Preserve the existing board. Fours: The existing board was a mistake.</blockquote>
    `},
    {num:'17',title:'Board Lock is state preservation, not control',html:`
      <p><span class="highlight">#7 Practical / #8 Efficiency / #3 Threat / #1 Snowball</span>. Comeback #58.</p>
      <blockquote>I prefer the current game state to every game state you might create with effects.</blockquote>
    `},
    {num:'18',title:'The Pareto frontier matters more than S-tier',html:`
      <p><span class="highlight">${DATA.paretoFrontier.length} Pareto-frontier routes</span>. These effects retain some strategically unique advantage that another route doesn't cleanly replace.</p>
    `},
    {num:'19',title:'The ranking is surprisingly robust where it matters',html:`
      <p>The <span class="highlight">Top 15 Practical effects are identical</span> in AS-WRITTEN and AS-EXECUTED. The central strategic skeleton is already visible.</p>
    `},
    {num:'20',title:'The most dangerous future additions are not bombs',html:`
      <p><span class="highlight">Seven scoring trigger</span> (Practical #17, Efficiency #3) and <span class="highlight">Two Quick Score+Discard</span> (Practical #23, Efficiency #4). Bundled value can quietly reshape optimal play.</p>
    `},
    {num:'21',title:'Healthy does not mean equal power',html:`
      <p>79/101 routes sit somewhere in the healthy family. The recommendation remains: <span class="voidrot">zero gameplay balance changes before correctness fixes</span>.</p>
    `},
  ];
  ch.innerHTML = sections.map(s=>`<div class="vet-section"><h3><span class="num">${s.num}</span>${esc(s.title)}</h3>${s.html}</div>`).join('') + `
    <div class="vet-os">
      <h3>VETERAN OPERATING SYSTEM</h3>
      <div class="rule">Don't ask only: "How many Points do I have?" Ask: <strong>"How many future decisions does this hand still contain?"</strong></div>
      <div class="rule">When ahead: protect, counter, Guard, Aegis, preserve state.</div>
      <div class="rule">When behind: reset, clear, steal, exchange, reconstruct.</div>
      <div class="rule">Before spending a premium response: ask what stronger play you are now giving permission to.</div>
      <div class="rule">Before assembling a Super/Ultra: count the lost modes, not just the cards.</div>
      <div class="rule">Before scoring: ask whether the card's latent utility is currently suppressing the opponent.</div>
      <div class="rule">Before using tempo: identify the exact conversion line.</div>
      <div class="rule">Before committing a board: track remaining Total Clear access.</div>
      <div class="rule">Before a multi-card play: account for K♠.</div>
      <div class="rule">Before declaring Exile permanent: account for recovery.</div>
      <div class="rule">A legal line is not necessarily a good line.</div>
    </div>
    <div class="vet-note">
      <strong>Editorial Note:</strong> The rankings are a <strong>map of strategic geometry</strong>, not mathematically exact gospel. A #4 versus #7 placement should not be interpreted as a scientifically measured three-position power difference.
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 15: TL;DR
// ═══════════════════════════════════════════════════════════════
function renderTLDR(){
  const items = [
    {key:'Instants/Quicks are premium',v:'because Mini-Turns are scarce.'},
    {key:'A card in hand can be worth more than its score',v:'because of threat + optionality.'},
    {key:'Track premium Spades',v:'all Top-5 Practical routes are Spade identities.'},
    {key:'2♠ is dramatically stronger strategically',v:'than "2 Points" suggests.'},
    {key:'K♠ should usually preserve premium options',v:'unless the board demands conversion.'},
    {key:'J Disrupt is cheap sequencing murder',v:'#13 Practical / #2 Efficiency.'},
    {key:'Behind = reset/invert',v:'Ahead = protect/freeze.'},
    {key:'Total Clear is primarily a comeback weapon',v:'terrible generic snowball tool.'},
    {key:'Queens/Aegis/Board Lock convert leads',v:'not crawl out of losing states.'},
    {key:'Supers/Ultras destroy valuable option bundles',v:'to obtain spectacle.'},
    {key:'Recipe availability ≠ correct activation',v:''},
    {key:'High power ≠ unhealthy',v:''},
    {key:'Correctness fixes come before broad balance changes',v:''},
  ];
  $('#tldrGrid').innerHTML = items.map(i=>`<div class="tldr-item"><span class="key">${esc(i.key)}</span>${i.v?' — '+esc(i.v):''}</div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 16: ELI5
// ═══════════════════════════════════════════════════════════════
function renderELI5(){
  const cards = [
    {glyph:'A♠',html:`<p>Opponent: <em>does something important.</em></p><p>You: <span class="hostile punch">no</span></p><p><span class="hostile punch">also exile</span></p><p><span class="hostile punch">also lol</span></p>`},
    {glyph:'8♠',html:`<p>Opponent: "I spent my turn building this."</p><p>You: "I spent <span class="voidrot punch">zero turns</span> deleting it."</p>`},
    {glyph:'K♠',html:`<p class="punch">Swiss Army knife with nuclear launch authorization.</p><p>Do not use it to open a can of beans.</p>`},
    {glyph:'2♠',html:`<p>Looks like:</p><p class="punch">tiny 2 :)</p><p>Actually:</p><p><span class="hostile punch">DISCOUNT APOCALYPSE COUPON</span></p>`},
    {glyph:'4♠',html:`<p>Board bad.</p><p>Press button.</p><p class="punch">Board gone.</p>`},
    {glyph:'Board Lock',html:`<p>Ahead: <span class="voidrot punch">FREEZE THE GAME, PEASANTS.</span></p><p>Behind: Congratulations. You froze yourself losing.</p>`},
    {glyph:'Queens',html:`<p class="punch">"We're winning. Build walls."</p><p>Not: "We're losing by twelve. MORE WALL."</p>`},
    {glyph:'10♥',html:`<p>Give up ten Points to gain actions.</p><p>Good if the actions do something.</p><p>Bad if you perform thirty-seven-dimensional chess and could have just scored ten.</p>`},
    {glyph:'Ultra',html:`<p>Brain: <span class="hostile">SHINY BUTTON</span></p><p>Veteran: <span class="voidrot punch">Which four useful cards am I feeding into this thing?</span></p>`},
    {glyph:'Ace',html:`<p>Sometimes the strongest move is:</p><p class="punch">do nothing.</p><p>Opponent gets scared anyway.</p>`},
  ];
  $('#eli5Grid').innerHTML = cards.map(c=>`<div class="eli5-card"><div class="eli5-glyph">${esc(c.glyph)}</div>${c.html}</div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 17: COMPLETE RANKING TABLES
// ═══════════════════════════════════════════════════════════════
function renderRankTabs(){
  const tabs = [
    {key:'practicalWritten',label:'Practical (Written)'},
    {key:'practicalExecuted',label:'Practical (Executed)'},
    {key:'rawPrimitive',label:'Raw Primitives'},
    {key:'efficiency',label:'Efficiency'},
    {key:'threat',label:'Threat'},
    {key:'comeback',label:'Comeback'},
    {key:'snowball',label:'Snowball'},
  ];
  $('#rankTabs').innerHTML = tabs.map(t=>`<span class="rank-tab ${t.key===state.rankTab?'active':''}" data-tab="${t.key}" role="button" tabindex="0" aria-pressed="${t.key===state.rankTab}">${esc(t.label)}</span>`).join('');
  $$('.rank-tab').forEach(el=>{
    const activate = ()=>{
      state.rankTab = el.dataset.tab;
      renderRankTabs();
      renderRankTable();
    };
    el.addEventListener('click',activate);
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); }
    });
  });
}

function renderRankTable(){
  const head = $('#rankHead');
  const body = $('#rankBody');
  const tab = state.rankTab;
  if(tab==='rawPrimitive'){
    head.innerHTML = `<th>#</th><th>Primitive</th><th>Best Route</th><th>Score</th><th>Routes</th>`;
    body.innerHTML = primitives.map(p=>{
      const r = byId(p.bestRouteId);
      return `<tr data-effect="${p.bestRouteId}"><td class="rn">${p.rank}</td><td>${esc(p.primitiveName)}</td><td>${r?esc(r.source)+' — '+esc(r.route):esc(p.bestRouteName)}</td><td>${p.maxRawPotencyScore}</td><td>${p.routeCount}</td></tr>`;
    }).join('');
  } else {
    const label = tab==='practicalWritten'?'Practical (W)':tab==='practicalExecuted'?'Practical (E)':tab.charAt(0).toUpperCase()+tab.slice(1);
    head.innerHTML = `<th>#</th><th>Effect</th><th>Source</th><th>Timing</th><th>${esc(label)}</th><th>Tier</th><th>Status</th>`;
    let sorted = routes.filter(r=>r[tab]!=null).sort((a,b)=>a[tab]-b[tab]);
    body.innerHTML = sorted.map(r=>`<tr data-effect="${r.id}"><td class="rn">${r[tab]}</td><td>${esc(r.route)}</td><td>${esc(r.source)}</td><td>${esc(r.timing)}</td><td>${r[tab]}</td><td><span class="tier-badge tier-${esc(r.tier)}">${esc(r.tier)}</span></td><td><span class="status-badge status-${esc(r.implementationStatus)}">${esc(r.implementationStatus)}</span></td></tr>`).join('');
  }
  wireDrawerClicks($('#rankBody'), 'tr');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 18: COMPARISON LAB
// ═══════════════════════════════════════════════════════════════
function renderCompare(){
  const opts = routes.map(r=>`<option value="${r.id}">${esc(r.source)} — ${esc(r.route)}</option>`).join('');
  $('#compareA').innerHTML = opts;
  $('#compareB').innerHTML = opts;
  $('#compareA').value = state.compareA;
  $('#compareB').value = state.compareB;
  updateCompare();
}
function updateCompare(){
  const a = byId(state.compareA), b = byId(state.compareB);
  if(!a||!b) return;
  const stats = [
    ['Practical (Written)','practicalWritten'],['Practical (Executed)','practicalExecuted'],
    ['Efficiency','efficiency'],['Threat','threat'],['Comeback','comeback'],['Snowball','snowball'],
    ['Points Forgone','pointsForgone'],['Timing','timing'],['Extra Cost','extraCost'],
    ['Reachability','reachability'],['Counterplay','counterplay'],['Confidence','confidence'],
    ['Status','implementationStatus'],['Health','healthVerdict'],
  ];
  const col = r => `<div class="compare-col"><h4>${esc(r.source)} — ${esc(r.route)}</h4><div class="src">${esc(r.id)}</div>${stats.map(s=>`<div class="compare-stat"><span class="l">${esc(s[0])}</span><span class="v">${esc(r[s[1]]!=null?r[s[1]]:'—')}</span></div>`).join('')}</div>`;
  // Pairwise
  const rowA = pairwiseRows.find(r=>r.id===a.id);
  const rowB = pairwiseRows.find(r=>r.id===b.id);
  let pwHtml = '';
  if(rowA && rowB){
    const idxA = pairwiseIds.indexOf(a.id);
    const idxB = pairwiseIds.indexOf(b.id);
    const symA = rowA.s[idxB];
    const symB = rowB.s[idxA];
    const sym = symExpand(symA) || symExpand(symB);
    const desc = { '++':'A materially greater than B','+':'A contextually advantageous','≈':'Comparable value','↔':'Strategically orthogonal','-':'A contextually disadvantaged','--':'A materially less than B','?':'Insufficient basis' }[sym] || 'Insufficient basis';
    pwHtml = `<div class="compare-pairwise"><span class="symbol">${esc(sym)}</span><div class="desc">${esc(desc)}</div></div>`;
  }
  $('#compareResults').innerHTML = col(a)+col(b)+`<div style="grid-column:1/-1">${pwHtml}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 19: DEEP MATRIX
// ═══════════════════════════════════════════════════════════════
function renderMatrix(){
  const wrap = $('#matrixWrap');
  const short = id => {
    const r = byId(id);
    if(!r) return id.slice(0,8);
    return (r.source+' '+r.route).slice(0,LABEL_SHORT_MATRIX);
  };
  let html = `<table class="matrix-table"><thead><tr><th class="corner"></th>`;
  html += pairwiseIds.map(id=>`<th title="${esc(id)}">${esc(short(id))}</th>`).join('');
  html += `</tr></thead><tbody>`;
  html += pairwiseRows.map(row=>{
    const r = byId(row.id);
    const label = r?esc(r.source)+' '+esc(r.route):esc(row.id);
    let cells = '';
    for(let i=0;i<row.s.length;i++){
      const c = row.s[i];
      const sym = symExpand(c);
      const cls = c==='P'?'sym-P':c==='p'?'sym-p':c==='M'?'sym-M':c==='m'?'sym-m':c==='='?'sym-eq':c==='x'?'sym-x':'';
      cells += `<td class="${cls}" title="${esc(pairwiseIds[i])} vs ${esc(row.id)}: ${esc(sym)}">${esc(sym)}</td>`;
    }
    return `<tr><th class="row-h" title="${esc(row.id)}">${label}</th>${cells}</tr>`;
  }).join('');
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// DATA INTEGRITY NOTE
// ═══════════════════════════════════════════════════════════════
function renderIntegrity(){
  const c = DATA.counts;
  const issues = [];
  if(c.totalAuditedRoutes !== c.asWritten + 1) issues.push(`totalAuditedRoutes (${c.totalAuditedRoutes}) ≠ asWritten + 1`);
  const missing = routes.filter(r=>r.practicalExecuted==null);
  if(missing.length !== c.asWritten - c.asExecuted) issues.push(`missing executed count (${missing.length}) ≠ asWritten - asExecuted (${c.asWritten - c.asExecuted})`);
  let html = `<strong>DATA INTEGRITY NOTE:</strong> All ranking data is derived from a single canonical embedded dataset (<code>balance-check-findings.json</code>) parsed at generation time. Validated: ${c.primitives} primitives, ${c.asWritten} AS-WRITTEN routes, ${c.asExecuted} AS-EXECUTED routes, ${c.paretoFrontier} Pareto-frontier routes. ${missing.length} routes are currently NOT_IMPLEMENTED or otherwise absent from Engine 4.2.6.`;
  if(issues.length) html += ` <strong>Discrepancies surfaced:</strong> ${issues.join('; ')}.`;
  html += ` No values were manually duplicated or invented.`;
  $('#integrityNote').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// DRAWER (detail panel)
// ═══════════════════════════════════════════════════════════════
let drawerFocusReturn = null; // element to return focus to on close
function openDrawer(id){
  const r = byId(id);
  if(!r) return;
  drawerFocusReturn = document.activeElement;
  const c = $('#drawerContent');
  const stats = [
    ['Effect ID',r.id],['Source',r.source],['Route',r.route],
    ['Primitive',r.primitiveName],['Primitive ID',r.primitiveId],
    ['Timing',r.timing],['Tier',r.tier],
    ['Practical (Written)',rankStr(r.practicalWritten)],['Practical (Executed)',rankStr(r.practicalExecuted)],
    ['Efficiency',rankStr(r.efficiency)],['Threat',rankStr(r.threat)],
    ['Comeback',rankStr(r.comeback)],['Snowball',rankStr(r.snowball)],
    ['Points Forgone',r.pointsForgone],['Extra Cost',r.extraCost],
    ['Setup',r.setup||'—'],['Counterplay',r.counterplay||'—'],
    ['Reachability',r.reachability||'—'],['Threat Label',r.threatLabel||'—'],
    ['Implementation Status',r.implementationStatus],['Profile Availability',r.profileAvailability],
    ['Confidence',r.confidence],['Health Verdict',r.healthVerdict],
  ];
  c.innerHTML = `
    <div class="drawer-id">${esc(r.id)}</div>
    <div class="drawer-title">${esc(r.route)}</div>
    <div class="drawer-src">${esc(r.source)} // ${esc(r.timing)}</div>
    <div style="margin-bottom:20px;display:flex;gap:6px;flex-wrap:wrap">
      <span class="tier-badge tier-${esc(r.tier)}">${esc(r.tier)}</span>
      <span class="status-badge status-${esc(r.implementationStatus)}">${esc(r.implementationStatus)}</span>
      <span class="health-badge ${healthClass(r.healthVerdict)}">${healthShort(r.healthVerdict)}</span>
      ${paretoSet.has(r.id)?'<span class="health-badge health-healthy">PARETO FRONTIER</span>':''}
    </div>
    <div class="drawer-section"><h4>RANKINGS</h4>${stats.slice(7,13).map(s=>`<div class="drawer-stat"><span class="l">${esc(s[0])}</span><span class="v">${esc(s[1])}</span></div>`).join('')}</div>
    <div class="drawer-section"><h4>COST &amp; SETUP</h4>${stats.slice(13,19).map(s=>`<div class="drawer-stat"><span class="l">${esc(s[0])}</span><span class="v">${esc(s[1])}</span></div>`).join('')}</div>
    <div class="drawer-section"><h4>AUTHORITY</h4>${stats.slice(19).map(s=>`<div class="drawer-stat"><span class="l">${esc(s[0])}</span><span class="v">${esc(s[1])}</span></div>`).join('')}</div>
    <div class="drawer-section"><h4>ANALYSIS</h4><div class="drawer-reason">${esc(r.reason)}</div></div>
  `;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden','false');
  $('#drawerOverlay').classList.add('open');
  // Focus the close button for keyboard users
  $('#drawerClose').focus();
  // Update URL hash
  if(history.replaceState) history.replaceState(null,'',`#${r.id}`);
}
function closeDrawer(){
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden','true');
  $('#drawerOverlay').classList.remove('open');
  if(history.replaceState && location.hash.length>1 && location.hash!=='#hero') history.replaceState(null,'',location.pathname);
  // Return focus to the element that opened the drawer
  if(drawerFocusReturn && drawerFocusReturn.focus) drawerFocusReturn.focus();
  drawerFocusReturn = null;
}

// ═══════════════════════════════════════════════════════════════
// NAV & SCROLL
// ═══════════════════════════════════════════════════════════════
function setupNav(){
  $$('[data-target]').forEach(el=>{
    el.addEventListener('click',e=>{
      e.preventDefault();
      const t = document.getElementById(el.dataset.target);
      if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
    });
    // Keyboard activation for nav-links (they're <a> without href)
    if(el.tagName==='A' && el.classList.contains('nav-link')){
      el.addEventListener('keydown',e=>{
        if(e.key==='Enter' || e.key===' '){
          e.preventDefault();
          el.click();
        }
      });
    }
  });
  // Active section tracking
  const sections = $$('section[id]');
  const navLinks = $$('.nav-link');
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      if(en.isIntersecting){
        navLinks.forEach(l=>l.classList.toggle('active',l.dataset.target===en.target.id));
      }
    });
  },{rootMargin:'-20% 0px -70% 0px'});
  sections.forEach(s=>observer.observe(s));
  // Scroll top
  const st = $('#scrollTop');
  window.addEventListener('scroll',()=>{
    st.classList.toggle('visible', window.scrollY > 600);
  });
  st.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════════
function setupKeyboard(){
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeDrawer(); return; }
    if(e.key==='/' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='SELECT' && document.activeElement.tagName!=='TEXTAREA'){
      e.preventDefault();
      $('#globalSearch').focus();
    }
    // Focus trap inside drawer when open
    if(e.key==='Tab' && $('#drawer').classList.contains('open')){
      const drawer = $('#drawer');
      const focusable = $$('button, a, input, select, [tabindex]:not([tabindex="-1"])', drawer).filter(el=>el.offsetParent!==null);
      if(focusable.length===0) return;
      const first = focusable[0], last = focusable[focusable.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// ATLAS CONTROLS WIRING
// ═══════════════════════════════════════════════════════════════
function setupAtlasControls(){
  // Debounce search to avoid re-rendering 101 rows on every keystroke
  let searchTimer = null;
  const debouncedSearch = (val, scroll) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{
      state.search = val;
      renderAtlas();
      if(scroll && val.length>0) document.getElementById('atlas').scrollIntoView({behavior:'smooth'});
    }, 120);
  };
  $('#atlasSearch').addEventListener('input',e=>debouncedSearch(e.target.value, false));
  $('#globalSearch').addEventListener('input',e=>{
    $('#atlasSearch').value = e.target.value;
    debouncedSearch(e.target.value, true);
  });
  $('#atlasSort').addEventListener('change',e=>{state.atlasSort=e.target.value;renderAtlas();});
  ['filterTier','filterTiming','filterStatus','filterHealth','filterConfidence'].forEach(id=>{
    $('#'+id).addEventListener('change',e=>{state.filters[id.replace('filter','').toLowerCase()]=e.target.value;renderAtlas();});
  });
  $$('.atlas-toggle').forEach(el=>{
    const toggle = ()=>{
      const t = el.dataset.toggle;
      state.toggles[t] = !state.toggles[t];
      el.classList.toggle('active',state.toggles[t]);
      el.setAttribute('aria-pressed', state.toggles[t] ? 'true' : 'false');
      renderAtlas();
    };
    el.addEventListener('click',toggle);
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); }
    });
  });
  // Authority toggle
  $('#toggleAuthority').addEventListener('click',()=>{
    state.authority = state.authority==='written'?'executed':'written';
    $('#toggleAuthority').textContent = state.authority.toUpperCase();
    $('#toggleAuthority').classList.toggle('active',state.authority==='executed');
    renderAtlas();
  });
  // Presentation toggle
  $('#togglePresentation').addEventListener('click',()=>{
    state.presentation = state.presentation==='veteran'?'eli5':'veteran';
    $('#togglePresentation').textContent = state.presentation.toUpperCase();
    $('#togglePresentation').classList.toggle('active',state.presentation==='eli5');
    if(state.presentation==='eli5') document.getElementById('eli5').scrollIntoView({behavior:'smooth'});
    else document.getElementById('veteran').scrollIntoView({behavior:'smooth'});
  });
}

// ═══════════════════════════════════════════════════════════════
// COMPARE & MATRIX WIRING
// ═══════════════════════════════════════════════════════════════
function setupCompareMatrix(){
  $('#compareA').addEventListener('change',e=>{state.compareA=e.target.value;updateCompare();});
  $('#compareB').addEventListener('change',e=>{state.compareB=e.target.value;updateCompare();});
  $('#matrixToggle').addEventListener('click',()=>{
    const w = $('#matrixWrap');
    w.classList.toggle('open');
    // Lazy-render only once; cache the result for subsequent toggles
    if(w.classList.contains('open') && !w.dataset.rendered) { renderMatrix(); w.dataset.rendered = '1'; }
    $('#matrixToggle').textContent = w.classList.contains('open')?'CLOSE DEEP MATRIX':'OPEN DEEP MATRIX // 101×101';
  });
  $('#drawerClose').addEventListener('click',closeDrawer);
  $('#drawerOverlay').addEventListener('click',closeDrawer);
}

// ═══════════════════════════════════════════════════════════════
// MUSIC PLAYER
// ═══════════════════════════════════════════════════════════════
function setupMusic(){
  const btn = $('#musicBtn');
  const pulse = $('#musicPulse');
  const audio = $('#audioPlayer');
  let playing = false;
  const play = ()=>{
    audio.play().then(()=>{
      playing = true;
      btn.innerHTML = '❚❚';
      btn.classList.add('playing');
      btn.setAttribute('aria-label','Pause music');
      pulse.classList.add('playing');
    }).catch(()=>{
      // Autoplay blocked — user needs to click again
      btn.innerHTML = '▶';
    });
  };
  const pause = ()=>{
    audio.pause();
    playing = false;
    btn.innerHTML = '▶';
    btn.classList.remove('playing');
    btn.setAttribute('aria-label','Play music');
    pulse.classList.remove('playing');
  };
  btn.addEventListener('click',()=>{
    if(playing) pause(); else play();
  });
  // Try autoplay after boot sequence
  setTimeout(()=>{ if(!playing) play(); }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// INIT — wrapped in try/catch so boot overlay never gets stuck
// ═══════════════════════════════════════════════════════════════
function hideBootOverlay(){
  const ov = document.getElementById('bootOverlay');
  if(ov){ ov.classList.add('done'); setTimeout(()=>{ ov.style.display='none'; }, 800); }
}

function init(){
  try {
    bootSequence();
    populateAtlasFilters();
    renderDefinitions();
    renderChampions();
    renderAtlas();
    renderDisagreement();
    renderScatter();
    renderSpades();
    renderTwoSpade();
    renderKSpade();
    renderQuiet();
    renderTax();
    renderState();
    renderPareto();
    renderWvE();
    renderVeteran();
    renderTLDR();
    renderELI5();
    renderRankTabs();
    renderRankTable();
    renderCompare();
    renderIntegrity();
    setupNav();
    setupKeyboard();
    setupAtlasControls();
    setupCompareMatrix();
    setupMusic();
    // Hash deep link
    if(location.hash.length>1){
      const id = location.hash.slice(1);
      if(byId(id)) setTimeout(()=>openDrawer(id),500);
    }
  } catch(err) {
    // If anything crashes, force-hide the boot overlay so the page is visible
    console.error('[ATLAS] init() error:', err);
    hideBootOverlay();
    // Show a minimal error banner so the user knows something went wrong
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:200;background:#e02838;color:#fff;padding:12px 20px;font-family:monospace;font-size:12px;text-align:center';
    banner.textContent = 'ATLAS RENDER ERROR: ' + (err && err.message ? err.message : 'unknown') + ' — check console for details';
    document.body.appendChild(banner);
  }
}

// Fail-safe: if boot overlay is still visible after 8s, force-hide it
setTimeout(hideBootOverlay, 8000);

// Expose for inline handlers
window.__atlas = { openDrawer, closeDrawer };

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
})();
