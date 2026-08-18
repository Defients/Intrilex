import{a as f,b as C,c as b}from"./chunk-chunk-SOZ76MXY.js?v=3dca2dc8fde5";import{a as w,b as k,c as I,d as H,e as U,f as Y,i as D,j as z}from"./chunk-chunk-4TQT2SU7.js?v=3dca2dc8fde5";import"./chunk-chunk-TB45ROLV.js?v=3dca2dc8fde5";function j(e){return(e-1500)/173.7178}function B(e){return e/173.7178}function ae(e){return 173.7178*e+1500}function X(e){return 173.7178*e}function Q(e){return 1/Math.sqrt(1+3*e*e/(Math.PI*Math.PI))}function se(e,t,r){return 1/(1+Math.exp(-Q(r)*(e-t)))}function ne(e,t,r,o,s){let i=Math.log(e*e),n=t*t,a=o*o,l=u=>{let x=Math.exp(u),R=n+r+x;return x*(a-n-r)/(R*R)-(u-i)/(s*s)},c=i,d;if(a>n+r)d=Math.log(a-n-r);else{let u=1;for(;l(i-u*s)<0&&(u++,!(u>50)););d=i-u*s}let p=l(c),h=l(d),m=0;for(;Math.abs(d-c)>1e-6&&m<100;){let u=c+(c-d)*p/(h-p),x=l(u);x*h<=0?(c=d,p=h):p=p/2,d=u,h=x,m++}return Math.exp(c/2)}function W(e,t,r={}){if(!e)throw new Error("glicko2Update: state is required");if(!Array.isArray(t))throw new Error("glicko2Update: opponents must be an array");let o=r.tau??.5,s=Number(e.rating),i=Number(e.ratingDeviation??350),n=Number(e.volatility??.06);if(!Number.isFinite(s))throw new Error("glicko2Update: rating must be finite");if(!Number.isFinite(i)||i<=0)throw new Error("glicko2Update: ratingDeviation must be > 0");if(!Number.isFinite(n)||n<=0)throw new Error("glicko2Update: volatility must be > 0");if(t.length===0){let A=B(i),E=Math.sqrt(A*A+n*n),T=X(E);return{rating:s,ratingDeviation:Math.min(T,350),volatility:n,ratingBefore:s,ratingDelta:0}}let a=j(s),l=B(i),c=0,d=0;for(let A of t){let E=Number(A.rating),T=Number(A.ratingDeviation??350),$=Number(A.score);if(!Number.isFinite(E))throw new Error("glicko2Update: opponent.rating must be finite");if(!Number.isFinite(T)||T<=0)throw new Error("glicko2Update: opponent.ratingDeviation must be > 0");if(!Number.isFinite($)||$<0||$>1)throw new Error("glicko2Update: opponent.score must be in [0, 1]");let re=j(E),K=B(T),M=Q(K),P=se(a,re,K);c+=M*M*P*(1-P),d+=M*($-P)}if(c===0)throw new Error("glicko2Update: variance is zero (opponents may have degenerate RD)");let p=1/c,h=p*d,m=ne(n,l,p,h,o),u=Math.sqrt(l*l+m*m),x=1/Math.sqrt(1/(u*u)+1/p),R=a+x*x*d,q=ae(R),te=X(x);return{rating:q,ratingDeviation:te,volatility:m,ratingBefore:s,ratingDelta:q-s}}function J(e=1200){return{rating:e,ratingDeviation:350,volatility:.06}}var y=1200,ie=0,oe=5e3,G=10;function S(e){return Number.isFinite(e)?Math.max(ie,Math.min(oe,Math.round(e))):y}function Z(e){return e<G}function N({playerA:e,playerB:t,outcome:r}){if(!e||!t)throw new Error("Both players required");if(!e.accountId||!t.accountId)throw new Error("Both players must have accountId");if(e.accountId===t.accountId)throw new Error("Cannot rate a self-match");if(!["WIN_A","WIN_B","DRAW"].includes(r))throw new Error(`Invalid outcome: ${r}`);let o=e.rating??y,s=t.rating??y,i=e.ratingDeviation??350,n=t.ratingDeviation??350,a=e.volatility??.06,l=t.volatility??.06,c,d,p,h;r==="WIN_A"?(c=1,d=0,p="WIN",h="LOSS"):r==="WIN_B"?(c=0,d=1,p="LOSS",h="WIN"):(c=.5,d=.5,p="DRAW",h="DRAW");let m=W({rating:o,ratingDeviation:i,volatility:a},[{rating:s,ratingDeviation:n,score:c}]),u=W({rating:s,ratingDeviation:n,volatility:l},[{rating:o,ratingDeviation:i,score:d}]),x=(e.ratedMatches??0)+1,R=(t.ratedMatches??0)+1;return{playerA:{accountId:e.accountId,ratingBefore:o,ratingAfter:S(m.rating),ratingDelta:S(m.rating)-o,result:p,provisional:Z(x),ratingDeviation:m.ratingDeviation,volatility:m.volatility},playerB:{accountId:t.accountId,ratingBefore:s,ratingAfter:S(u.rating),ratingDelta:S(u.rating)-s,result:h,provisional:Z(R),ratingDeviation:u.ratingDeviation,volatility:u.volatility}}}function V(e){let t=J(y);return{accountId:e,rating:t.rating,ratingDeviation:t.ratingDeviation,volatility:t.volatility,ratedMatches:0,provisional:!0}}var v=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),g=e=>Math.round(e).toLocaleString("en-US");async function Oe(e){if(e){e.innerHTML=ce(),be(e);try{let t=await we(),r=e.querySelector("[data-player-rank-slot]");r&&(r.innerHTML=ue(t))}catch(t){console.warn("[ranking-overlay] player state load failed:",t?.message??t)}}}function ce(){return`<div class="rsx-overlay" data-testid="ranking-system-overlay">
    ${de()}
    <div class="rsx-player-rank-slot" data-player-rank-slot aria-live="polite">
      ${pe()}
    </div>
    ${ge()}
    ${me()}
    ${xe()}
    ${Ie()}
    ${fe()}
  </div>`}function de(){return`<section class="rsx-intro" data-testid="rsx-intro">
    <div class="rsx-intro-crest" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 4l6.5 16.5L56 22l-13 11 4 18-15-9-15 9 4-18L8 22l17.5-1.5z"/>
        <path d="M32 22v22M24 30h16" opacity=".55"/>
      </svg>
    </div>
    <div class="rsx-intro-text">
      <h3 class="rsx-intro-title">Intrilex Ranked</h3>
      <p class="rsx-intro-tagline">Prove it on the table. Climb the hierarchy.</p>
      <p class="rsx-intro-blurb">Every rated duel shapes your <strong>Intrilex Rating (IR)</strong> \u2014 a competitive skill number that moves with every win and loss. Climb eight earned tiers, from <strong>Initiate</strong> to the apex <strong>Intrilex</strong> rank.</p>
    </div>
  </section>`}function pe(){return`<div class="rsx-player-card rsx-player-card--loading" data-testid="rsx-player-loading">
    <span class="rsx-loading-dot" aria-hidden="true"></span>
    <span class="rsx-loading-text">Loading your rank\u2026</span>
  </div>`}function ue(e){if(!e.available)return`<div class="rsx-player-card rsx-player-card--guest" data-testid="rsx-player-guest">
      ${b({tier:w.UNRANKED,size:96,decorative:!0})}
      <div class="rsx-player-info">
        <p class="rsx-player-tier rsx-player-tier--unranked">Unranked</p>
        <p class="rsx-player-sub">Sign in and complete your first Ranked matches to establish a rating.</p>
      </div>
    </div>`;if(e.isPlacement){let n=e.placementsPlayed,a=e.placementsRequired,l=Math.min(100,n/a*100);return`<div class="rsx-player-card rsx-player-card--placement" data-testid="rsx-player-placement">
      ${b({tier:w.UNRANKED,size:96,decorative:!0})}
      <div class="rsx-player-info">
        <p class="rsx-player-tier rsx-player-tier--unranked">Placement</p>
        <p class="rsx-player-ir">${g(e.rating)} IR <span class="rsx-player-provisional">provisional</span></p>
        <div class="rsx-progress" role="progressbar" aria-label="Placement progress" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${a}">
          <div class="rsx-progress-fill" style="width:${l}%"></div>
        </div>
        <p class="rsx-player-sub">${n} / ${a} placement matches complete. Your tier is revealed after placement.</p>
      </div>
    </div>`}let t=z(e.rating,e.ratedMatches||5),r=e.isApex&&e.leaderboardPosition?`${f(e.tier,e.division)} #${e.leaderboardPosition}`:f(e.tier,e.division);if(e.isApex)return`<div class="rsx-player-card rsx-player-card--apex" data-testid="rsx-player-apex">
      ${b({tier:e.tier,division:e.division,size:96,showDivision:!1,decorative:!0,leaderboardPosition:e.leaderboardPosition?`#${e.leaderboardPosition}`:null})}
      <div class="rsx-player-info">
        <p class="rsx-player-tier">${v(r)}</p>
        <p class="rsx-player-ir">${g(e.rating)} IR <span class="rsx-player-apex-tag">apex</span></p>
        <p class="rsx-player-sub">You've reached the top of the ladder. Leaderboard position breaks ties among the elite.</p>
      </div>
    </div>`;let o=Math.round(t.percent),s=t.nextTier?f(t.nextTier,k.III):null,i=e.peakRating!=null&&e.peakTier?`<p class="rsx-player-peak">Season peak: ${f(e.peakTier,e.peakDivision)} \xB7 ${g(e.peakRating)} IR</p>`:"";return`<div class="rsx-player-card" data-testid="rsx-player-ranked">
    ${b({tier:e.tier,division:e.division,size:96,showDivision:!0,decorative:!0})}
    <div class="rsx-player-info">
      <p class="rsx-player-tier">${v(r)}</p>
      <p class="rsx-player-ir">${g(e.rating)} IR</p>
      <div class="rsx-progress" role="progressbar" aria-label="Progress to ${v(s??"next tier")}" aria-valuenow="${o}" aria-valuemin="0" aria-valuemax="100">
        <div class="rsx-progress-fill" style="width:${o}%"></div>
      </div>
      <p class="rsx-player-sub">${o}% toward ${v(s??"the next tier")} <span class="rsx-player-remaining">\xB7 ${g(t.remaining)} IR to go</span></p>
      ${i}
    </div>
  </div>`}function ge(){return`<section class="rsx-section" data-testid="rsx-how-rating-works">
    <h4 class="rsx-section-title">How Rating Works</h4>
    <p class="rsx-section-lede">Your IR rises when you win and falls when you lose. How much it moves depends on the relative strength of both players \u2014 and how settled the system is about each rating.</p>
    <div class="rsx-demo-grid">
      ${ve().map(he).join("")}
    </div>
    <p class="rsx-demo-note">Deltas above are computed from Intrilex's actual rating engine for fresh 1200 IR players. Real matches also factor in each player's uncertainty (see Advanced Details).</p>
  </section>`}function ve(){let e=()=>V("you-demo"),t=a=>({...V("opp-demo"),rating:a}),r=N({playerA:e(),playerB:t(1400),outcome:"WIN_A"}),o=N({playerA:e(),playerB:t(1e3),outcome:"WIN_A"}),s=N({playerA:e(),playerB:t(1400),outcome:"WIN_B"}),i=N({playerA:e(),playerB:t(1e3),outcome:"WIN_B"}),n=a=>Math.round(a.playerA.ratingDelta);return[{label:"Beat a stronger opponent",outcome:"WIN",youRating:1200,oppRating:1400,delta:n(r),positive:!0,blurb:"Bigger reward \u2014 you overperformed expectations."},{label:"Beat a weaker opponent",outcome:"WIN",youRating:1200,oppRating:1e3,delta:n(o),positive:!0,blurb:"Smaller reward \u2014 the win was expected."},{label:"Lose to a stronger opponent",outcome:"LOSS",youRating:1200,oppRating:1400,delta:n(s),positive:!1,blurb:"Smaller penalty \u2014 the loss was expected."},{label:"Lose to a weaker opponent",outcome:"LOSS",youRating:1200,oppRating:1e3,delta:n(i),positive:!1,blurb:"Larger penalty \u2014 you underperformed expectations."}]}function he(e){let t=e.positive?"+":"",r=e.positive?"rsx-delta-up":"rsx-delta-down",o=e.positive?"\u2191":"\u2193",s=e.outcome==="WIN"?"rsx-outcome-win":"rsx-outcome-loss";return`<div class="rsx-demo-card ${e.positive?"rsx-demo-win":"rsx-demo-loss"}">
    <p class="rsx-demo-label">${v(e.label)}</p>
    <div class="rsx-demo-versus">
      <div class="rsx-demo-side"><span class="rsx-demo-side-label">You</span><span class="rsx-demo-side-ir">${g(e.youRating)}</span></div>
      <span class="rsx-demo-vs">vs</span>
      <div class="rsx-demo-side"><span class="rsx-demo-side-label">Opp</span><span class="rsx-demo-side-ir">${g(e.oppRating)}</span></div>
    </div>
    <div class="rsx-demo-result">
      <span class="rsx-demo-outcome ${s}">${v(e.outcome)}</span>
      <span class="rsx-demo-delta ${r}">${o} ${t}${e.delta} IR</span>
    </div>
    <p class="rsx-demo-blurb">${v(e.blurb)}</p>
  </div>`}function me(){return`<section class="rsx-section rsx-ladder-section" data-testid="rsx-rank-ladder">
    <h4 class="rsx-section-title">The Rank Ladder</h4>
    <p class="rsx-section-lede">Eight earned tiers. Each non-apex tier is split into three divisions \u2014 <strong>III</strong>, <strong>II</strong>, <strong>I</strong> \u2014 with I the highest. Select a tier to see its detail.</p>
    <div class="rsx-ladder" role="tablist" aria-label="Intrilex rank ladder" data-rsx-ladder>
      ${I.map((t,r)=>{let o=D(t),s=C(t),i=o?o[0]:0,n=o&&o[1]!==1/0?o[1]:null,a=n==null?`${g(i)}+ IR`:`${g(i)}\u2013${g(n)} IR`,l=U(t),c=Y(t)?'<span class="rsx-rung-divisions">III \xB7 II \xB7 I</span>':l?'<span class="rsx-rung-divisions rsx-rung-divisions--apex">Apex \xB7 leaderboard rank</span>':"",d=r>0?I[r-1]:null,p=r<I.length-1?I[r+1]:null;return`<button class="rsx-rung" data-rsx-tier="${v(t)}" data-rsx-ordinal="${r}" role="tab" aria-selected="false" aria-controls="rsx-rung-detail" tabindex="${r===0?"0":"-1"}">
      ${b({tier:t,size:72,showDivision:!1,decorative:!0})}
      <span class="rsx-rung-name">${v(s?.label??t)}</span>
      <span class="rsx-rung-range">${a}</span>
      ${c}
      <span class="rsx-rung-meaning" hidden data-rsx-meaning>${v(s?.meaning??"")}</span>
      <span class="rsx-rung-prev" hidden data-rsx-prev>${v(d??"")}</span>
      <span class="rsx-rung-next" hidden data-rsx-next>${v(p??"")}</span>
    </button>`}).join("")}
    </div>
    <div class="rsx-rung-detail" id="rsx-rung-detail" data-testid="rsx-rung-detail" aria-live="polite">
      ${ee(I[0])}
    </div>
  </section>`}function ee(e){let t=D(e),r=C(e),o=t?t[0]:0,s=t&&t[1]!==1/0?t[1]:null,i=s==null?`${g(o)} IR and above`:`${g(o)} \u2013 ${g(s)} IR`,n=U(e),a=H(e),l=a>=0&&a<I.length-1?I[a+1]:null,c=a>0?I[a-1]:null,d=l?`Promote to <strong>${v(f(l,k.III))}</strong> at ${g(D(l)[0])} IR.`:"This is the apex \u2014 there is no higher tier.",p=c?`Demote from <strong>${v(f(c,k.I))}</strong> below ${g(o)} IR.`:"This is the entry tier \u2014 the first earned rank after placement.",h=n?'<p class="rsx-detail-line">Intrilex has no divisions. Ties among apex players are broken by <strong>leaderboard position</strong> (e.g. <em>Intrilex #47</em>).</p>':'<p class="rsx-detail-line">Three divisions span this tier: <strong>III</strong> (lowest), <strong>II</strong>, <strong>I</strong> (highest). Each division covers about 67 IR.</p>';return`<div class="rsx-detail-card ${r?.glowClass??""}" data-rsx-detail-tier="${v(e)}">
    <div class="rsx-detail-glyph">${b({tier:e,size:128,showDivision:!1,decorative:!0})}</div>
    <div class="rsx-detail-body">
      <p class="rsx-detail-name">${v(r?.label??e)}</p>
      <p class="rsx-detail-range">${i}</p>
      <p class="rsx-detail-meaning">${v(r?.meaning??"")}</p>
      ${h}
      <p class="rsx-detail-line">${p}</p>
      <p class="rsx-detail-line">${d}</p>
    </div>
  </div>`}function xe(){return`<section class="rsx-section" data-testid="rsx-how-to-climb">
    <h4 class="rsx-section-title">How to Climb</h4>
    <div class="rsx-climb-grid">
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">1</span>
        <strong>Complete placement</strong>
        <p>Play your first ${5} rated matches. You'll be <strong>Unranked</strong> until then \u2014 your tier is revealed once placement finishes.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">2</span>
        <strong>Win to raise your IR</strong>
        <p>Every ranked win adds IR. Beating higher-rated opponents earns bigger gains. Climb through III, II, and I in each tier.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">3</span>
        <strong>Cross the threshold</strong>
        <p>Hit the next tier's rating floor and you promote instantly \u2014 there are no separate promotion matches. Drop below your tier's floor and you demote.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">4</span>
        <strong>Reach Intrilex</strong>
        <p>At ${g(D(w.INTRILEX)[0])} IR you enter the apex tier. From there, leaderboard position decides your standing among the elite.</p>
      </div>
    </div>
  </section>`}function Ie(){return`<section class="rsx-section rsx-advanced-section" data-testid="rsx-advanced-details">
    <h4 class="rsx-section-title">Advanced Details</h4>
    <div class="rsx-advanced-grid">
      <div class="rsx-advanced-item">
        <h5>The rating model \u2014 Glicko-2</h5>
        <p>Intrilex uses <strong>Glicko-2</strong> (Glickman, 2013), not vanilla Elo. As well as your visible IR, the system tracks two hidden values: <strong>rating deviation</strong> (RD \u2014 how unsure it is about your rating) and <strong>volatility</strong> (how much your skill swings). These are server-owned and never shown in player UI.</p>
        <p>New players start at <strong>${g(y)} IR</strong> with high uncertainty. As you play, uncertainty shrinks and your rating settles.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Placement vs. provisional</h5>
        <p><strong>Placement</strong> lasts your first ${5} rated matches \u2014 you're Unranked until it's done. <strong>Provisional</strong> lasts your first ${G} rated matches: during this window the system is still calibrating, so rating swings are larger.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Inactivity</h5>
        <p>If you stop playing rated matches, your <strong>uncertainty (RD) widens</strong> \u2014 your IR number itself doesn't decay, but your next match will move it more until you're settled again.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Seasons &amp; leaderboards</h5>
        <p>Ranked play runs in <strong>seasons</strong>. Your season peak (highest tier and IR) is recorded on your profile, and the leaderboard ranks players within a season. At apex (Intrilex), your leaderboard position is your tiebreaker.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>What there isn't</h5>
        <p>There are no separate promotion or demotion matches, no tier-protection floors, and no hidden MMR separate from your IR \u2014 your visible rating <em>is</em> the matchmaking rating. Tiers and divisions are derived directly from your IR.</p>
      </div>
    </div>
    ${ye()}
  </section>`}function ye(){let e=.5,t=350,r=.06;return`<details class="rsx-math-details" data-testid="rsx-math-details">
    <summary class="rsx-math-summary">Show the math</summary>
    <div class="rsx-math-body">
      <p class="rsx-math-lede">Glicko-2 converts both players to an internal scale, computes an expected score, then updates rating, deviation, and volatility together. Per match, both players are updated simultaneously using each other as the single opponent.</p>
      <div class="rsx-math-block">
        <p class="rsx-math-block-title">Expected score</p>
        <pre class="rsx-math-formula">E = 1 / (1 + 10<sup>\u2212g(\u03C6\u2C7C)(\u03BC\u2212\u03BC\u2C7C)/400</sup>)</pre>
        <p class="rsx-math-note">where g(\u03C6\u2C7C) weights the opponent's uncertainty. Higher opponent uncertainty \u2192 the expected score is pulled less toward the rating gap.</p>
      </div>
      <div class="rsx-math-block">
        <p class="rsx-math-block-title">New rating</p>
        <pre class="rsx-math-formula">R' = R + \u03C6'\xB2 \xB7 g(\u03C6\u2C7C) \xB7 (S \u2212 E)</pre>
        <p class="rsx-math-note">S is the actual score (1 win, 0 loss, 0.5 draw). The update is scaled by the new deviation \u03C6'\xB2 \u2014 so uncertain ratings move more.</p>
      </div>
      <div class="rsx-math-constants">
        <p class="rsx-math-constants-title">Intrilex constants (verified from the engine)</p>
        <ul>
          <li>Default rating: <strong>${g(y)} IR</strong></li>
          <li>System constant \u03C4: <strong>${e}</strong> (controls volatility change)</li>
          <li>Initial rating deviation: <strong>${t}</strong></li>
          <li>Initial volatility: <strong>${r}</strong></li>
          <li>Rating range: <strong>0 \u2013 5,000 IR</strong></li>
        </ul>
      </div>
      <p class="rsx-math-footnote">Full implementation: <code>packages/account-domain/src/glicko2.mjs</code>. A legacy Elo path is retained only for historical parity tests \u2014 it is not the canonical rating transaction.</p>
    </div>
  </details>`}function fe(){return`<section class="rsx-cta-section" data-testid="rsx-cta">
    <a class="rsx-cta-button" href="#/play/online" data-rsx-cta>
      <span>Play Ranked Online</span>
      <span class="rsx-cta-arrow" aria-hidden="true">\u2192</span>
    </a>
    <p class="rsx-cta-sub">Server-authoritative Online Duels are rated. Local vs AI is practice and is not rated.</p>
  </section>`}function be(e){Re(e),Ae(e)}function Re(e){let t=e.querySelector("[data-rsx-ladder]");if(!t)return;let r=[...t.querySelectorAll(".rsx-rung")],o=e.querySelector("#rsx-rung-detail");if(!r.length||!o)return;let s=i=>{r.forEach(a=>{a.setAttribute("aria-selected","false"),a.tabIndex=-1,a.classList.remove("rsx-rung--selected")}),i.setAttribute("aria-selected","true"),i.tabIndex=0,i.classList.add("rsx-rung--selected");let n=i.dataset.rsxTier;o.innerHTML=ee(n)};r.forEach((i,n)=>{i.addEventListener("click",()=>s(i)),i.addEventListener("keydown",a=>{let l=-1;if(a.key==="ArrowRight"||a.key==="ArrowDown")l=(n+1)%r.length;else if(a.key==="ArrowLeft"||a.key==="ArrowUp")l=(n-1+r.length)%r.length;else if(a.key==="Enter"||a.key===" "){a.preventDefault(),s(i);return}else a.key==="Home"?l=0:a.key==="End"&&(l=r.length-1);l>=0&&(a.preventDefault(),r[l].focus(),s(r[l]))})}),s(r[0])}function Ae(e){let t=e.querySelector("[data-rsx-cta]");t&&t.addEventListener("click",()=>{setTimeout(()=>{let r=document.querySelector(".landing-overlay-close");r&&r.click()},0)})}async function we(){try{let{fetchSelfProfile:e}=await import("./chunk-profile-data-UUL7JH54.js?v=3dca2dc8fde5"),t=await e();if(!t||!t.available||!t.profile)return F();let r=t.profile.ranked;return!r||!r.available?{...F(),available:!1}:{available:!0,isPlacement:!!r.isPlacement,tier:r.tier??w.UNRANKED,division:r.division??k.NONE,rating:Number(r.rating??y),leaderboardPosition:r.leaderboardPosition??null,peakRating:r.peakRating!=null?Number(r.peakRating):null,peakTier:r.peakTier??null,peakDivision:r.peakDivision??null,isApex:!!r.isApex,placementsPlayed:Number(r.placementsPlayed??0),placementsRequired:Number(r.placementsRequired??5),ratedMatches:Number(r.games??0)}}catch(e){return console.warn("[ranking-overlay] loadPlayerRankState error:",e?.message??e),F()}}function F(){return{available:!1,isPlacement:!1,tier:w.UNRANKED,division:k.NONE,rating:y,leaderboardPosition:null,peakRating:null,peakTier:null,peakDivision:null,isApex:!1,placementsPlayed:0,placementsRequired:5,ratedMatches:0}}export{ve as computeRatingDemos,Ie as renderAdvancedDetails,ge as renderHowRatingWorks,ue as renderPlayerRankCard,me as renderRankLadder,Oe as renderRankingSystemOverlay,ee as renderRungDetail,F as unavailableState};
//# sourceMappingURL=chunk-ranking-system-overlay-6PPLZ524.js.map
