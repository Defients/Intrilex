import{a as se,b as ie,c as re,d as oe,e as ce}from"./chunk-chunk-EUUY4EEM.js?v=75c53031ef21";import{a as Q,b as ue}from"./chunk-chunk-ILSVVRSS.js?v=75c53031ef21";import{b as M,c as K,d as _,e as ae,f as ne,i as le,j as de}from"./chunk-chunk-DG4G7KH7.js?v=75c53031ef21";import{b as ee,d as te}from"./chunk-chunk-FCW4XEE4.js?v=75c53031ef21";import{a as U,c as B}from"./chunk-chunk-SOZ76MXY.js?v=75c53031ef21";import{g as H,h as pe}from"./chunk-chunk-4TQT2SU7.js?v=75c53031ef21";var it=Object.freeze({NOT_PRIORITY_HOLDER:{code:"NOT_PRIORITY_HOLDER",shortText:"You do not currently hold priority.",detailedText:"This action becomes available during your next legal response or proactive window, unless its source leaves your hand first.",ruleRef:"Priority rules \u2014 only the priority holder may declare actions.",visibilitySafe:!0},WRONG_PHASE:{code:"WRONG_PHASE",shortText:"This action is not legal in the current phase.",detailedText:"The current phase does not permit this action type. Wait for the appropriate phase.",ruleRef:"Phase rules \u2014 actions are restricted by phase.",visibilitySafe:!0},WRONG_WINDOW:{code:"WRONG_WINDOW",shortText:"This action is not legal in the current window.",detailedText:"The current window (proactive, response, interrupt, or resolution) does not permit this action type.",ruleRef:"Window rules \u2014 timing classes restrict when actions can be declared.",visibilitySafe:!0},QUICK_ONLY:{code:"QUICK_ONLY",shortText:"Only Quick actions are legal right now.",detailedText:"The current window permits Quick actions only. Other action types must wait for a proactive window.",ruleRef:"Quick timing \u2014 Quick actions can be declared in specific windows.",visibilitySafe:!0},INTERRUPT_ONLY:{code:"INTERRUPT_ONLY",shortText:"Only Interrupt actions are legal right now.",detailedText:"The current window permits Interrupt actions only. Other action types must wait for a proactive window.",ruleRef:"Interrupt timing \u2014 Interrupts can be declared in response windows.",visibilitySafe:!0},RESPONSE_ONLY:{code:"RESPONSE_ONLY",shortText:"Only Response actions are legal right now.",detailedText:"The current window permits Response actions only. You may respond to the pending declaration or decline.",ruleRef:"Response timing \u2014 Response actions react to pending declarations.",visibilitySafe:!0},FULL_TURN_REQUIRED:{code:"FULL_TURN_REQUIRED",shortText:"This action requires a Full Turn commitment.",detailedText:"This action can only be declared during your Full Turn Action Phase, not during a response window.",ruleRef:"Full Turn rules \u2014 some actions require the Action Phase.",visibilitySafe:!0},SOURCE_NOT_AVAILABLE:{code:"SOURCE_NOT_AVAILABLE",shortText:"The source card is not available.",detailedText:"The source card is not in a zone from which it can be played, or it has already been committed this turn.",ruleRef:"Source availability \u2014 cards must be in the correct zone and uncommitted.",visibilitySafe:!0},SOURCE_ALREADY_COMMITTED:{code:"SOURCE_ALREADY_COMMITTED",shortText:"This card has already been used this turn.",detailedText:"The source card has already been committed to another action this turn and cannot be reused.",ruleRef:"Commitment rules \u2014 a card can only be used once per turn.",visibilitySafe:!0},INSUFFICIENT_COMPONENTS:{code:"INSUFFICIENT_COMPONENTS",shortText:"Not enough components to declare this action.",detailedText:"This action requires multiple component cards (e.g., a Super requires two same-rank cards). You do not have enough eligible components.",ruleRef:"Component rules \u2014 multi-card actions require sufficient eligible sources.",visibilitySafe:!0},SUPER_REQUIREMENT_NOT_MET:{code:"SUPER_REQUIREMENT_NOT_MET",shortText:"Super requirements not met.",detailedText:"A Super declaration requires two cards of the same rank. You do not have two eligible same-rank cards in the required zone.",ruleRef:"Super rules \u2014 two same-rank cards are required for a Super declaration.",visibilitySafe:!0},NO_LEGAL_TARGET:{code:"NO_LEGAL_TARGET",shortText:"No legal target available.",detailedText:"This action requires a target, but no legal target exists in the current game state.",ruleRef:"Targeting rules \u2014 actions with targets require at least one legal target.",visibilitySafe:!0},TARGET_PROTECTED:{code:"TARGET_PROTECTED",shortText:"The target is protected.",detailedText:"The selected target has an Aegis or other protection effect that prevents this action from affecting it.",ruleRef:"Protection rules \u2014 Aegis and similar effects prevent targeting.",visibilitySafe:!0},TARGET_IMMUNE:{code:"TARGET_IMMUNE",shortText:"The target is immune.",detailedText:"The selected target is immune to this type of effect.",ruleRef:"Immunity rules \u2014 some effects grant immunity to specific action types.",visibilitySafe:!0},ACTION_ALREADY_USED:{code:"ACTION_ALREADY_USED",shortText:"This action has already been used.",detailedText:"This specific action has already been declared and cannot be repeated.",ruleRef:"Action frequency \u2014 some actions can only be declared once.",visibilitySafe:!0},SCORE_REQUIREMENT_NOT_MET:{code:"SCORE_REQUIREMENT_NOT_MET",shortText:"Scoring requirements not met.",detailedText:"This scoring action requires specific conditions (e.g., sufficient points, correct phase) that are not currently satisfied.",ruleRef:"Scoring rules \u2014 scoring actions have specific requirements.",visibilitySafe:!0},PROFILE_DISABLED:{code:"PROFILE_DISABLED",shortText:"This action is not available in the current rules profile.",detailedText:"The current rules profile does not permit this action type.",ruleRef:"Profile rules \u2014 each profile enables or disables specific mechanics.",visibilitySafe:!0},HIDDEN_INFORMATION_REQUIRED:{code:"HIDDEN_INFORMATION_REQUIRED",shortText:"This action requires information you do not have.",detailedText:"This action requires knowledge of hidden cards or state that is not available to you.",ruleRef:"Visibility rules \u2014 some actions require authorized visibility.",visibilitySafe:!0},GAME_ALREADY_TERMINAL:{code:"GAME_ALREADY_TERMINAL",shortText:"The match has already ended.",detailedText:"No further actions can be declared because the match has reached a terminal state.",ruleRef:"Terminal rules \u2014 no actions are legal after the match ends.",visibilitySafe:!0},NOT_HUMAN_DECISION:{code:"NOT_HUMAN_DECISION",shortText:"No human decision is pending.",detailedText:"The engine is not currently waiting for your input. The game may have advanced or the opponent may be deciding.",ruleRef:"Session state \u2014 actions can only be submitted when a human decision is pending.",visibilitySafe:!0},SESSION_MISMATCH:{code:"SESSION_MISMATCH",shortText:"Session mismatch.",detailedText:"The action was submitted for a different session. This may happen if you have multiple tabs open.",ruleRef:"Session integrity \u2014 actions must match the active session.",visibilitySafe:!0},STALE_REVISION:{code:"STALE_REVISION",shortText:"The game state has changed.",detailedText:"The action was submitted for an older state. The current frame has been re-rendered with updated legal actions.",ruleRef:"State revision \u2014 actions must match the current state revision.",visibilitySafe:!0},STALE_FRAME:{code:"STALE_FRAME",shortText:"The decision frame has changed.",detailedText:"The legal actions have changed since this action was selected. Please review the current options.",ruleRef:"Frame integrity \u2014 actions must match the current decision frame.",visibilitySafe:!0},UNKNOWN_ACTION:{code:"UNKNOWN_ACTION",shortText:"Unknown action.",detailedText:"The selected action is not in the current set of legal actions. It may have been removed by a state change.",ruleRef:"Action validity \u2014 only current legal actions can be submitted.",visibilitySafe:!0},ENGINE_REJECTION:{code:"ENGINE_REJECTION",shortText:"The engine rejected this action.",detailedText:"The engine determined this action is not legal in the current state. This should not happen during normal play \u2014 it indicates a state desynchronization.",ruleRef:"Engine authority \u2014 the engine has final say on legality.",visibilitySafe:!0},INVALID_SAVE_FORMAT:{code:"INVALID_SAVE_FORMAT",shortText:"Invalid save format.",detailedText:"The save file is not a valid Intrilex player save. It may be corrupted or from an incompatible version.",ruleRef:"Save format \u2014 saves must match the expected format.",visibilitySafe:!0},INCOMPATIBLE_ENGINE_VERSION:{code:"INCOMPATIBLE_ENGINE_VERSION",shortText:"Incompatible engine version.",detailedText:"The save was created with a different engine version. The match cannot be resumed.",ruleRef:"Version compatibility \u2014 saves require matching engine versions.",visibilitySafe:!0},INCOMPATIBLE_RULES_VERSION:{code:"INCOMPATIBLE_RULES_VERSION",shortText:"Incompatible rules version.",detailedText:"The save was created with different rules. The match cannot be resumed.",ruleRef:"Version compatibility \u2014 saves require matching rules versions.",visibilitySafe:!0},SAVE_HASH_MISMATCH:{code:"SAVE_HASH_MISMATCH",shortText:"Save integrity check failed.",detailedText:"The save file's integrity hash does not match. The save may be corrupted or tampered with.",ruleRef:"Save integrity \u2014 hashes must match for resume.",visibilitySafe:!0},DUPLICATE_TAB:{code:"DUPLICATE_TAB",shortText:"This match is active in another tab.",detailedText:"Another browser tab is currently controlling this match. You can open read-only, take control, or cancel.",ruleRef:"Session lease \u2014 only one tab can control a match at a time.",visibilitySafe:!0},UNSUPPORTED_CONFIGURATION:{code:"UNSUPPORTED_CONFIGURATION",shortText:"Unsupported configuration.",detailedText:"The current game configuration is not supported by the engine.",ruleRef:"Configuration \u2014 only supported configurations can be played.",visibilitySafe:!0},ORCHESTRATION_LIMIT:{code:"ORCHESTRATION_LIMIT",shortText:"Orchestration limit exceeded.",detailedText:"The engine exceeded its maximum orchestration steps. This indicates a rules loop or engine issue.",ruleRef:"Engine safety \u2014 orchestration has a maximum step count.",visibilitySafe:!0},ADVANCE_EXCEPTION:{code:"ADVANCE_EXCEPTION",shortText:"Engine error during advance.",detailedText:"The engine encountered an error while advancing the game state.",ruleRef:"Engine safety \u2014 exceptions are caught and reported.",visibilitySafe:!0},AI_POLICY_EXCEPTION:{code:"AI_POLICY_EXCEPTION",shortText:"AI policy error.",detailedText:"The AI policy encountered an error while selecting an action.",ruleRef:"AI safety \u2014 policy exceptions are caught and reported.",visibilitySafe:!0},AI_NO_SELECTION:{code:"AI_NO_SELECTION",shortText:"AI made no selection.",detailedText:"The AI policy returned no action selection. This indicates a policy issue.",ruleRef:"AI safety \u2014 policies must return a selection.",visibilitySafe:!0},UNKNOWN_STATUS:{code:"UNKNOWN_STATUS",shortText:"Unknown engine status.",detailedText:"The engine returned an unrecognized status. This indicates an engine issue.",ruleRef:"Engine safety \u2014 unknown statuses are treated as errors.",visibilitySafe:!0}});function X(e){let t=it[e];return t||{code:e??"UNKNOWN",shortText:"Unknown reason.",detailedText:"An unknown error occurred.",ruleRef:"",visibilitySafe:!0}}function he(e){return X(e).shortText}function fe(e){return X(e).detailedText}function me(e){return X(e).ruleRef}var D=Object.freeze({OFF:"OFF",ESSENTIAL:"ESSENTIAL",GUIDED:"GUIDED",DETAILED:"DETAILED"});function ge(e,t,a=D.GUIDED){if(a===D.OFF)return{title:"",body:"",passInfo:""};if(!e)return{title:"",body:"",passInfo:""};let{isHumanPriority:n,windowType:s,stackDepth:i,canPass:r,nextOnPass:o}=e;if(!n)return{title:"Opponent is deciding",body:i>0?"A declaration is on the stack. The opponent may respond.":"The opponent is choosing their next move.",passInfo:""};let p=rt(s),d=t?.length??0,c=`Your Priority \u2014 ${p}`,u="";if(d===0)u="You have no legal actions. The engine will force an Exhausted Pass.";else if(d===1)u=`You have 1 legal action: ${t[0].displayLabel}.`;else{let f=ot(t);u=`You have ${d} legal actions:
${f}`}let h="";return r&&o&&(h=o),{title:c,body:u,passInfo:h}}function ye(e,t,a=D.GUIDED){if(a===D.OFF)return null;let n=e.form??se(e),s=re(e),i=ie(e,t),r=e.costs??[],o=e.targets??{},p=e.preview??{};return{label:e.displayLabel??"Unknown action",timing:ct(e.timingClass,n),costs:r.map(c=>c.description),targets:lt(o,t),preview:dt(p,n,s),ruleRef:ut(n,s,i)}}function be(e,t=D.GUIDED){if(t===D.OFF)return{shortText:"",detailedText:"",ruleRef:""};let a=he(e);return t===D.ESSENTIAL?{shortText:a,detailedText:"",ruleRef:""}:{shortText:a,detailedText:fe(e),ruleRef:me(e)}}function rt(e){return{proactive:"Proactive Window",response:"Response Window",interrupt:"Interrupt Window",resolution:"Resolution",transition:"Phase Transition"}[e]??"Unknown Window"}function ot(e){let t={};for(let a of e){let n=a.form??"other";t[n]=(t[n]??0)+1}return Object.entries(t).map(([a,n])=>`\u2022 ${n} ${a} action${n>1?"s":""}`).join(`
`)}function ct(e,t){let n={ACTION:"Action (Full Turn commitment)",QUICK:"Quick",INSTANT:"Instant",INTERRUPT:"Interrupt",SETUP:"Setup"}[e]??e??"";return t==="super"?`${n} \u2014 Super declaration`:n}function lt(e,t){if(!e.required)return"No target required.";let a=e.legalTargetIds??[];if(a.length===0)return"Target required but none available.";let n=a.map(s=>t?.[s]?.identity??s);return`Target${a.length>1?"s":""}: ${n.join(", ")}`}function dt(e,t,a){let n=[];return e.opensResponseWindow&&n.push("Opens a response window."),e.isFullTurnCommitment&&n.push("Uses your Action Phase for this Full Turn."),e.resolutionUncertain&&n.push("Resolution is not guaranteed."),a&&(n.push("Super declaration \u2014 consumes multiple components."),e.superEffectId&&n.push(`Effect: ${e.superEffectId}.`)),n.length>0?n.join(" "):"No preview available."}function ut(e,t,a){return t?"Super rules \u2014 two same-rank cards required for declaration.":a?"Spades rules \u2014 Spades cards have mechanically distinct play forms.":e==="score"?"Scoring rules \u2014 cards played to Point Row for points.":e==="response"?"Response rules \u2014 reactive actions in response windows.":e==="pass"?"Pass rules \u2014 Exhausted Pass or Response Decline.":""}var ve=Object.freeze({rusher:{description:"Aggressive tempo player that scores early and often, sacrificing defense for speed.",playStyle:"Aggressive tempo \u2014 scores early, sacrifices defense",traits:["aggressive","fast","risk-taking"]},defender:{description:"Reactive strategist that counters opponent plays and builds late-game advantage.",playStyle:"Reactive \u2014 counters opponent plays, builds late-game advantage",traits:["reactive","patient","counter-focused"]},trickster:{description:"Misdirection specialist that manipulates the swap bar and leverages effect-heavy plays.",playStyle:"Misdirection \u2014 swap bar manipulation, effect-heavy",traits:["cunning","unpredictable","effect-focused"]},sniper:{description:"Precision remover that targets key cards and maximizes resource efficiency.",playStyle:"Precision \u2014 targets key cards, resource-efficient",traits:["precise","efficient","targeting"]},support:{description:"Utility-focused controller that manipulates the stack and protects own cards.",playStyle:"Utility \u2014 stack manipulation, protects own cards",traits:["supportive","protective","stack-focused"]},tank:{description:"Endurance grinder that relies on high-defense plays and grinds out value over long games.",playStyle:"Endurance \u2014 high-defense, grinds out value over long games",traits:["defensive","endurance","grinding"]},baseline:{description:"Balanced generalist that adapts to the game state without a strong preference.",playStyle:"Balanced \u2014 adapts to game state",traits:["balanced","adaptive"]}});function Ie(e){return ve[e]??ve.baseline}var Y={rusher:{score:["Speed is everything!","Too slow to stop me.","Points on the board!","Catch me if you can!","First strike advantage!","No time to react!"],counter:["Ha, nice try!","Not fast enough.","I saw that coming.","Too slow!","Predictable trajectory."],super:["Full throttle!","No holding back!","Overwhelming force!","Maximum velocity!","No brakes!"],win:["Speed wins every time!","Was there ever any doubt?","GG \u2014 too fast for you.","Victory at maximum speed!","You couldn't keep up."],loss:["Impossible... I was faster!","Next time I'll be even quicker.","You got lucky \u2014 speed doesn't lie.","I underestimated your tempo."],"early-game":["Let's set the pace early.","First blood matters.","I'm coming out swinging!"],"mid-game":["The pressure is building.","Can you feel the tempo shifting?","Full acceleration mode."],"late-game":["Final push!","No time left to recover!","Sprinting to the finish!"],"close-game":["Every point counts now!","Don't blink!","This is where speed decides everything."],dominating:["The gap is widening!","You can't close this distance!","Speed gap is insurmountable!"],comeback:["I let you get ahead \u2014 mistake corrected!","Thought you had me? Think again!","The rush isn't over yet!"]},defender:{score:["Patiently building.","Every point is fortified.","Slow and steady.","A foundation of stone.","Methodical progress."],counter:["Not so fast.","I expected that.","Predictable.","Blocked and logged.","Your aggression is noted."],super:["The walls rise up!","Fortress activated.","Defense becomes offense.","The bastion strikes!","Impenetrable!"],win:["Patience always wins.","Your aggression was your undoing.","GG \u2014 well defended.","The fortress held.","Time was always on my side."],loss:["My defenses crumbled...","I'll rebuild stronger next time.","Even walls can fall.","I misjudged the siege."],"early-game":["Let them come. I'll be ready.","Building the foundation.","Patience is a weapon."],"mid-game":["The walls are thickening.","They're wearing themselves down.","Steady as she goes."],"late-game":["The endgame favors the prepared.","My fortress endures.","Time to close the gates."],"close-game":["One mistake and it's over for either of us.","The fortress is tested.","Nerve is everything now."],dominating:["The gap is insurmountable.","They cannot breach these walls.","This position is fortified."],comeback:["You thought you'd broken through?","The walls rebuild!","Defense becomes offense \u2014 now!"]},trickster:{score:["Did you see that coming?","Misdirection scores again!","While you were looking elsewhere...","Smoke and mirrors!","The hand is quicker than the eye."],counter:["Tricked you!","Wrong move!","Just as I planned.","You fell for it!","Classic misdirection."],super:"Now you see it, now you don't!",win:["The trick was on you all along!","Misdirection wins!","GG \u2014 outsmarted.","You never saw it coming.","The illusion was perfect."],loss:["You saw through my tricks...","Clever. Very clever.","The mirror cracked.","Even illusions fail eventually."],"early-game":["Setting the stage...","Pay attention to the wrong hand.","The game begins."],"mid-game":["Which move is real?","You're second-guessing now, aren't you?","The web is spinning."],"late-game":["The final trick awaits.","You think you know what's coming?","One last illusion."],"close-game":["One wrong read decides it all.","Can you spot the real threat?","The sleight is ready."],dominating:["You're chasing shadows!","Every move is a mirage!","You can't trust what you see."],comeback:["The trick was just a setup!","You let your guard down!","The real illusion was the comeback!"]},sniper:{score:["Precision strike!","Right on target.","Calculated and executed.","Surgical.","Bullseye."],counter:["Eliminated.","Target neutralized.","Clean removal.","Threat assessed and removed.","Efficient."],super:["One shot, one kill.","Perfect precision!","Bullseye!","Lethal accuracy!"],win:["Precision beats brute force.","Every shot counted.","GG \u2014 clean victory.","Calculated victory.","No wasted moves."],loss:["My aim was off...","I'll recalibrate next time.","You dodged the critical shot.","Miscalculated."],"early-game":["Assessing the field.","Identifying priority targets.","Patience before the shot."],"mid-game":["The target is in sight.","Range calculated.","Steady aim."],"late-game":["The final shot is loaded.","One clean hit wins this.","No room for error."],"close-game":["One shot decides it all.","The target is clear.","Hold steady."],dominating:["The range is mine.","Every target eliminated.","You can't hide from precision."],comeback:["I was just adjusting my scope.","The real target was the comeback!","You walked right into the crosshairs!"]},support:{score:["Teamwork makes the dream work.","Supported into position.","Steady progress.","Every piece contributes.","Coordinated advance."],counter:["Protected!","Shielded from harm.","Not on my watch.","Defense in depth.","Covered."],super:["Full support deployed!","The stack is mine!","Reinforcements!","Maximum utility!"],win:["Utility wins the day!","Every piece in its place.","GG \u2014 well supported.","The foundation held.","Coordinated victory."],loss:["My support wasn't enough...","I'll adapt my strategy.","The formation broke.","I needed more coverage."],"early-game":["Setting up the network.","Establishing support lines.","Building the infrastructure."],"mid-game":["The network is strong.","Every connection matters.","Coordinated pressure."],"late-game":["Full deployment.","The support network is complete.","Every resource allocated."],"close-game":["One slip in support decides it.","The formation is tested.","Hold the line."],dominating:["The network is unbreakable.","Full coverage achieved.","You can't penetrate the support grid."],comeback:["The support was just repositioning!","Reinforcements arrived!","The network adapts and recovers!"]},tank:{score:["Grinding forward.","One step at a time.","Unstoppable progress.","Slow but inevitable.","Each point is earned."],counter:["I absorb and endure.","You can't break through.","Armor holds.","Minimal damage.","Shrug it off."],super:["Unbreakable!","The fortress strikes!","Endurance pays off!","Maximum armor!"],win:["Endurance always wins.","You ran out of steam.","GG \u2014 outlasted.","The grind paid off.","Persistence is power."],loss:["Even the tank falls...","I'll reinforce my defenses.","The armor cracked.","I needed more endurance."],"early-game":["Let them waste resources.","I'm just getting started.","The armor is thickening."],"mid-game":["The grind is working.","They're running low.","Steady pressure."],"late-game":["Endurance decides this.","I can outlast anyone.","The final grind."],"close-game":["One breach and it's over.","The armor is holding \u2014 barely.","Nerve and endurance."],dominating:["The gap is too wide to close.","I've outlasted everything.","Endurance is victory."],comeback:["You thought I was worn down?","The tank has reserves!","Armor repaired \u2014 advancing again!"]},baseline:{score:["Good play.","Points secured.","Solid move.","Steady.","Effective."],counter:["Nice counter.","Good response.","Well played.","Noted.","Solid defense."],super:["Big move!","Going all in!","Time to shine!","Major play!"],win:["GG!","Well played.","Good game.","Solid match.","Clean win."],loss:["GG!","Well played.","Better luck next time.","Good match.","I'll learn from this."],"early-game":["Let's see how this develops.","Standard opening.","Feeling out the board."],"mid-game":"The game is taking shape.","late-game":"Time to close this out.","close-game":"Every decision matters now.",dominating:"The advantage is clear.",comeback:"The game isn't over yet!"}};function Xa(e,t,a,n={}){if(!e||!e.type)return null;let s=Y[t]??Y.baseline,i=null,r=e.type.toLowerCase();if(r.includes("score")||r.includes("point")?i="score":r.includes("counter")||r.includes("disrupt")||r.includes("interrupt")?i="counter":(r.includes("super")||r.includes("ultra"))&&(i="super"),!i)return null;let o=n.gamePhase,p=n.scoreDiff??0;if((n.isComeback??!1)&&s.comeback){let h=Array.isArray(s.comeback)?s.comeback:[s.comeback];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(p>=10&&s.dominating){let h=Array.isArray(s.dominating)?s.dominating:[s.dominating];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(Math.abs(p)<=3&&p!==0&&s["close-game"]){let h=Array.isArray(s["close-game"])?s["close-game"]:[s["close-game"]];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(o&&s[o]){let h=Array.isArray(s[o])?s[o]:[s[o]];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}let c=s[i];if(!c)return null;let u=Array.isArray(c)?c:[c];return u[Math.floor(Math.random()*u.length)]}function Te(e,t){let a=Y[e]??Y.baseline,n=t?"win":"loss",s=a[n]??Y.baseline[n],i=Array.isArray(s)?s:[s];return i[Math.floor(Math.random()*i.length)]}var R=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),Ee=Object.freeze({"first-contact-trigger-closure":{label:"First Contact",icon:"\u{1F4D6}",short:"Learn the basics",full:"A simplified rule set that teaches core mechanics: draw cards, play for points, and reach the goal score. No advanced effects, no royal cards, no counters. Perfect for your first match.",systems:"Draw \xB7 Score \xB7 Goal",recommendedFor:"New players"},"core-advanced-authority":{label:"Advanced Core",icon:"\u2694",short:"Full standard rules",full:"The complete Intrilex rule set at the standard competitive level. Includes all card effects, royal cards (Jack, Queen, King, Ace), counters, the Swap Bar, and the priority-pass system. Some advanced systems (hidden-choice supers, generated-effect copy, sudden death) are replay-only in this profile.",systems:"All standard systems \xB7 4 advanced systems replay-only",recommendedFor:"Players who know the basics"},"core-unrestricted-authority":{label:"Unrestricted",icon:"\u{1F525}",short:"All systems active",full:"The full rule set with every system autonomously playable, including hidden-choice supers, generated-effect copy, and sudden death. The most complex and complete Intrilex experience. Use this when you want no limits.",systems:"All systems fully playable",recommendedFor:"Experienced players"}}),pt=Object.freeze({easy:"Forgiving opponent that makes simple decisions and rarely counters. Good for learning card interactions.",normal:"Balanced opponent that plays competently and responds to your moves. A fair test of your strategy.",hard:"Skilled opponent that optimizes plays, counters aggressively, and punishes mistakes. Expect a real challenge.",nightmare:"Ruthless opponent that plays near-optimally. Every decision matters. For experienced players only."});function ht(e){if(!e)return"";let t=Ee[e.profileId]?.label??e.profileId??"Unknown",a=e.turnNumber!=null?`Turn ${e.turnNumber}`:"In progress";return`<div class="setup-resume-prompt" data-testid="setup-resume-prompt">
    <div class="setup-resume-info">
      <span class="setup-resume-icon" aria-hidden="true">\u25B6</span>
      <div class="setup-resume-body">
        <strong>Resume match</strong>
        <small>${R(t)} \xB7 ${R(a)}${e.seed!=null?` \xB7 Seed ${R(e.seed)}`:""}</small>
      </div>
    </div>
    <button type="button" class="setup-resume-button" data-testid="resume-match" data-save-id="${R(e.saveId??"")}">Continue</button>
  </div>`}function ft(e){return e?`<div class="setup-compat-warning" data-testid="setup-compat-warning" role="alert">
    <span class="setup-compat-icon" aria-hidden="true">\u26A0</span>
    <div class="setup-compat-body">
      <strong>Compatibility notice</strong>
      <small>${R(e.message)}</small>
    </div>
  </div>`:""}function mt(e,t={}){let{saveInfo:a=null,compatInfo:n=null}=t,s=Object.entries(Ee).map(([u,h])=>({id:u,...h})),i=[{id:"P1",label:"First",icon:"\u2460"},{id:"P2",label:"Second",icon:"\u2461"},{id:"random",label:"Random",icon:"\u{1F3B2}"}],r=new Map;for(let u of e){let h=u.traits?.difficulty??"normal";r.has(h)||r.set(h,[]),r.get(h).push(u)}let o=["easy","normal","hard","nightmare"],p={easy:"Easy",normal:"Normal",hard:"Hard",nightmare:"Nightmare"},d=ht(a),c=ft(n);return`<div class="play-setup" data-testid="play-setup">
    <a class="play-setup-back" href="#/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</a>
    <h1>New Match</h1>
    <a class="academy-entry-link" href="#/play/academy" data-testid="academy-entry-link">
      <span class="academy-entry-icon" aria-hidden="true">\u{1F393}</span>
      <span class="academy-entry-body"><strong>Academy</strong><small>New to Intrilex? Start with guided lessons.</small></span>
      <span class="academy-entry-arrow" aria-hidden="true">\u2192</span>
    </a>
    ${d}
    ${c}
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset class="setup-section">
        <legend>Rule profile</legend>
        <div class="setup-card-grid">
          ${s.map(u=>`<label class="setup-card" data-testid="profile-card-${R(u.id)}">
            <input type="radio" name="profile" value="${R(u.id)}" ${u.id==="core-advanced-authority"?"checked":""}>
            <span class="setup-card-icon" aria-hidden="true">${u.icon}</span>
            <span class="setup-card-body">
              <strong>${R(u.label)}</strong>
              <small>${R(u.short)}</small>
            </span>
          </label>`).join("")}
        </div>
        <div class="setup-profile-explainer" data-testid="profile-explainer" role="region" aria-label="Rule profile explanation">
          ${s.map(u=>`<div class="profile-explanation" data-profile="${R(u.id)}" ${u.id==="core-advanced-authority"?"":"hidden"}>
            <p class="profile-explanation-full">${R(u.full)}</p>
            <div class="profile-explanation-meta">
              <span class="profile-explanation-systems" aria-label="Active systems">${R(u.systems)}</span>
              <span class="profile-explanation-audience" aria-label="Recommended for">${R(u.recommendedFor)}</span>
            </div>
          </div>`).join("")}
        </div>
      </fieldset>
      <fieldset class="setup-section">
        <legend>Your seat</legend>
        <div class="setup-seat-row">
          ${i.map(u=>`<label class="setup-seat-option">
            <input type="radio" name="seat" value="${R(u.id)}" ${u.id==="P1"?"checked":""}>
            <span class="setup-seat-icon" aria-hidden="true">${u.icon}</span>
            <span>${R(u.label)}</span>
          </label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="setup-section">
        <legend>AI opponent</legend>
        ${(()=>{let u=!1;return o.map(h=>{let f=r.get(h)??[];if(f.length===0)return"";let b=pt[h]??"";return`<div class="difficulty-group" data-difficulty="${R(h)}">
            <div class="difficulty-header">
              <span class="difficulty-pill">${R(p[h]??h)}</span>
              <span class="difficulty-description">${R(b)}</span>
            </div>
            <div class="ai-personality-grid">
              ${f.map(g=>{let m=g.traits?.archetype??"",y=Ie(m),E=u?"":" checked";return u=!0,`<label class="ai-personality-card" title="${R(y.playStyle)}">
                  <input type="radio" name="ai-policy" value="${R(g.policyId)}"${E}>
                  <span class="ai-personality-name">${R(m||g.policyId)}</span>
                  <span class="ai-personality-desc">${R(y.description)}</span>
                </label>`}).join("")}
            </div>
          </div>`}).join("")})()}
      </fieldset>
      <details class="setup-advanced" data-testid="setup-advanced">
        <summary>Advanced options</summary>
        <fieldset class="setup-section setup-seed-section">
          <legend>Seed</legend>
          <input type="number" name="seed" min="1" max="4294967295" placeholder="Random" class="seed-input">
          <small class="seed-hint">Set a specific seed to reproduce a match. Leave blank for a random seed each game.</small>
        </fieldset>
      </details>
      <div class="setup-actions">
        <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
      </div>
    </form>
  </div>`}var F=Object.freeze(["light","dark","cosmotech","corrupture"]),J=Object.freeze({light:"Light",dark:"Dark",cosmotech:"CosmoTech\u2122",corrupture:"Corrupture\u2122"}),V=Object.freeze({light:"\u2600",dark:"\u263E",cosmotech:"\u2726",corrupture:"\u25C8"}),we="dark",$e="intrilex:gameplaySkin",Ae=new Set(F);function Re(e){return typeof e=="string"&&Ae.has(e)?e:we}function tn(){try{let e=globalThis.localStorage?.getItem($e);return Re(e)}catch{return we}}function an(e){let t=Re(e);if(!Ae.has(e))return!1;try{return globalThis.localStorage?.setItem($e,t),!0}catch{return!1}}var Ne="1.1.0";function Pe(e,t=null,a=null){if(!e||!e.state)return ke("MISSING_SNAPSHOT","No authorized snapshot available");let n=e.state,s=yt(n);if(!s.valid)return ke("PRIVACY_VIOLATION",s.reason);let i=e.humanPlayerId??n.seatOrder?.[0]??"P1",r=n.seatOrder?.find(E=>E!==i)??"P2",o=n.seatOrder?.indexOf(i)??0,p=o===0?1:0,d=Se(n,i,o,!0,t),c=Se(n,r,p,!1,null),u=vt(n,i),h=kt(e),f=new Set;for(let E of h)for(let T of E.sourceEntityIds??[])f.add(T);let b=Et(n,i,r,o,f),g=At(n),m=St(e),y=a??{kind:"LOCAL_AI",label:"LOCAL \xB7 VS AI",networkRanked:!1};return{schemaVersion:Ne,sessionId:e.sessionId??null,status:Pt(n,e),mode:y,match:{fullTurnSequence:n.fullTurnSequence??0,phase:n.phase??"SETUP",activePlayerId:n.activePlayerId??null,priorityOwnerId:n.priorityOwnerId??null,windowLabel:n.windowLabel??"",goalMayBeDynamic:!0,globalStates:Nt(n),terminationReason:n.terminationReason??null,winner:n.winner??null},human:d,opponent:c,zones:u,battlefield:b,stack:g,actions:h,chat:m,privacy:{opponentHandIdentifiersPresent:!1,rawCommandsPresent:!1}}}function ke(e,t,a=null){return{schemaVersion:Ne,sessionId:null,status:"ERROR",mode:a??{kind:"LOCAL_AI",label:"LOCAL \xB7 VS AI",networkRanked:!1},match:{fullTurnSequence:0,phase:"ERROR",activePlayerId:null,priorityOwnerId:null,windowLabel:"",goalMayBeDynamic:!0,terminationReason:null,winner:null},human:Ce(),opponent:Ce(),zones:It(),battlefield:wt(),stack:[],actions:[],chat:[],privacy:{opponentHandIdentifiersPresent:!1,rawCommandsPresent:!1},error:{code:e,reason:t}}}function yt(e){let t=e.seatOrder?.[1]??"P2",a=e.players?.[t]?.hand??[];if(Array.isArray(a)){for(let n of a)if(n&&(n.identity||n.rank||n.suit))return{valid:!1,reason:`Opponent hand exposes card identity: ${n.identity??n.rank??"unknown"}`}}return e._rawCommands||e._commandVault?{valid:!1,reason:"Raw commands present in snapshot"}:{valid:!0,reason:null}}function Se(e,t,a,n,s){let i=e.players?.[t]??{},r=i.securedPoints??0,o=i.goal??e.startingGoal??21,p=!n&&i.isHuman===!0,d=n?s?.displayName??"You":i.displayName??(p?"Opponent":"AI"),c=p?i.rating??null:null,u=p?i.rank??null:null;return{playerId:t,seatIndex:a,displayName:d,isHuman:n||p,isLocalPlayer:n,monogram:n?"H":p?"P":"A",secured:r,goal:o,goalLabel:r>=o?"REACHED":`${r}/${o}`,rating:n?s?.rating??null:c,rank:n?s?.rank??null:u,aiRating:!n&&!p?i.aiRating??null:null,badges:n?s?.badges??[]:[],connectionState:i.connectionState??null,statusIndicators:bt(i)}}function Ce(){return{playerId:"",seatIndex:0,displayName:"",isHuman:!0,isLocalPlayer:!0,monogram:"?",secured:0,goal:21,goalLabel:"0/21",rating:null,rank:null,aiRating:null,badges:[],connectionState:null,statusIndicators:[]}}function bt(e){let t=[];return e.isActive&&t.push({type:"ACTIVE",label:"Active"}),e.hasPriority&&t.push({type:"PRIORITY",label:"Priority"}),t}function vt(e,t){let a=e.drawPile??[],n=e.graveyard??e.discard??[],s=e.exile??[],i=Array.isArray(a)?a.length:a.count??0,r=Array.isArray(n)?n.length:n.count??0,o=Array.isArray(n)?n.length>0?x(n[n.length-1]):null:n.topCard??null,p=Array.isArray(s)?s.length:s.count??0,d=Array.isArray(s)?s.length>0?x(s[s.length-1]):null:s.newestVisibleCard??null;return{draw:{count:i},discard:{count:r,topCard:o},exile:{count:p,newestCard:d},swap:Tt(e)}}function It(){return{draw:{count:0},discard:{count:0,topCard:null},exile:{count:0,newestCard:null},swap:[]}}function Tt(e){return(e.swapBar??e.swap??[]).map((a,n)=>({slotId:n,entityId:a?.id??null,card:a&&!a.faceDown?x(a):null,faceDown:a?a.faceDown===!0:!0,swapAvailable:e.swapAvailable??!0}))}function Et(e,t,a,n,s=new Set){let i=e.players?.[t]??{},r=e.players?.[a]??{},o=(i.pointRow??i.pr??[]).map(x),p=(i.enduringRow??i.er??[]).map(x),d=(r.pointRow??r.pr??[]).map(x),c=(r.enduringRow??r.er??[]).map(x),u=(Array.isArray(i.hand)?i.hand:[]).map(y=>{let E=$t(y);return E&&s.has(E.entityId)&&(E.legalSource=!0),E}),h=Array.isArray(r.hand)?r.hand.length:r.hand?.count??0;return{topPR:n===1?o:d,topER:n===1?p:c,bottomPR:n===1?d:o,bottomER:n===1?c:p,humanHand:u,opponentHandCount:h,humanSeatIndex:n}}function wt(){return{topPR:[],topER:[],bottomPR:[],bottomER:[],humanHand:[],opponentHandCount:0,humanSeatIndex:0}}function x(e){return e?{entityId:e.entityId??e.id??null,identity:e.identity??null,rank:e.rank??null,suit:e.suit??null,pointValue:e.pointValue??e.effectivePoints??null,isGeneratedCopy:e.isGeneratedCopy===!0,statusMarkers:Oe(e),zone:e.zone??null,ownerId:e.ownerId??e.controllerId??null}:null}function $t(e){return e?{entityId:e.entityId??e.id??null,identity:e.identity??null,rank:e.rank??null,suit:e.suit??null,pointValue:e.pointValue??e.effectivePoints??null,isGeneratedCopy:e.isGeneratedCopy===!0,statusMarkers:Oe(e),zone:e.zone??"HAND",ownerId:e.ownerId??e.controllerId??null,legalSource:e.legalSource===!0,superEligible:e.superEligible===!0}:null}function Oe(e){let t=[];return e.tapped&&t.push({type:"TAPPED",label:"Tapped"}),e.aegis&&t.push({type:"AEGIS",label:"Aegis"}),e.guard&&t.push({type:"GUARD",label:"Guard"}),e.exileBound&&t.push({type:"EXILE_BOUND",label:"Exile-Bound"}),e.revealedUntilStart&&t.push({type:"REVEALED",label:"Revealed"}),e.isAttachment&&t.push({type:"ATTACHMENT",label:"Attachment"}),e.selected&&t.push({type:"SELECTED",label:"Selected"}),e.legalTarget&&t.push({type:"LEGAL_TARGET",label:"Target"}),e.isResolving&&t.push({type:"RESOLVING",label:"Resolving"}),t}function At(e){let t=e.stack??e.resolutionStack??[],a=e.humanPlayerId??e.seatOrder?.[0]??"P1",n={},s=r=>{r?.id&&(n[r.id]=r.identity??null)},i=e.players?.[a]??{};(i.hand??[]).forEach(s),(i.pointRow??i.pr??[]).forEach(s),(i.enduringRow??i.er??[]).forEach(s);for(let r of e.seatOrder??[]){if(r===a)continue;let o=e.players?.[r]??{};(o.pointRow??o.pr??[]).forEach(s),(o.enduringRow??o.er??[]).forEach(s)}return(e.swapBar??e.swap??[]).forEach(s),e.graveyard?.topCard&&s(e.graveyard.topCard),t.map(r=>({stackIndex:r.stackIndex??r.index??0,actionFamily:r.actionFamily??r.family??null,actionMode:r.actionMode??r.mode??null,actionType:r.actionType??null,stackClass:r.stackClass??null,sourcePlayerId:r.sourcePlayerId??r.actorId??r.controllerId??null,sourceCardIds:r.sourceCardIds??[],targetCardIds:r.targetCardIds??[],isHuman:r.isHuman??r.controllerId===a,actorName:r.actorName??null,isResolving:r.isResolving===!0||r.status==="resolving",status:r.status??null,description:r.description??Rt(r,n)}))}function Rt(e,t){let a=e.actionType??e.actionFamily??e.family??null,n=e.stackClass??null,s=e.kind??null,i=a??n??s??"Action";i=i.replace(/-/g," ").replace(/\b\w/g,u=>u.toUpperCase());let r=e.sourceCardIds??[],o=e.targetCardIds??[],p=r.map(u=>t[u]).filter(Boolean),d=o.map(u=>t[u]).filter(Boolean),c=i;return p.length>0&&(c+=` \u2014 ${p.join(", ")}`),d.length>0&&(c+=` \u2192 ${d.join(", ")}`),c}function kt(e){return(e.legalActions??e.authorizedActions??[]).map(n=>{let s=oe(n,{});return{actionId:s.optionId,family:s.family,mode:s.mode,form:s.form??null,timingClass:s.timingClass??"ACTION",requiresSource:s.sourceEntityIds.length>0,requiresTarget:s.targets?.required??!1,targetCount:s.targets?.minimum??0,targetZone:null,sourceCardId:s.sourceEntityIds[0]??null,sourceEntityIds:s.sourceEntityIds,displayLabel:ae({family:s.family,mode:s.mode})||s.displayLabel||n.description||"Unknown",shortLabel:ne({family:s.family,mode:s.mode})||s.displayLabel||"Unknown",timingLabel:_(s.timingClass),isSuper:s.isSuper??!1,isSpadesVariant:s.isSpadesVariant??!1,costs:s.costs??[],targets:s.targets??{required:!1,legalTargetIds:[]},description:n.description??s.displayLabel??`${s.family??"Action"} ${s.mode??""}`.trim(),isPass:s.isExhaustedPass||s.isDecline||s.family==="pass"||s.family==="exhausted-pass"||s.family==="response-decline",isDecline:s.isDecline??!1,isExhaustedPass:s.isExhaustedPass??!1,isResponse:s.isResponse??!1,preview:s.preview??null}})}function St(e){return(e.chat??e.matchChat??[]).map(a=>({sender:a.sender??"system",text:Ct(a.text??a.message??""),timestamp:a.timestamp??null,isHuman:a.isHuman===!0,isAi:a.isAi===!0,isSystem:a.isSystem===!0||!a.isHuman&&!a.isAi}))}function Ct(e){return String(e).slice(0,500).replace(/[<>]/g,"")}function Nt(e){let t=[],a=e.voltage??e.voltageLevel;return a&&a>0&&t.push({key:"voltage",label:`VOLTAGE ${a}`,icon:"\u26A1"}),(e.boardLock===!0||e.boardLocked===!0)&&t.push({key:"boardLock",label:"BOARD LOCK",icon:"\u{1F512}"}),(e.suddenDeath===!0||e.suddenDeathMode===!0)&&t.push({key:"suddenDeath",label:"SUDDEN DEATH",icon:"\u26A0"}),e.timeBomb!==void 0&&e.timeBomb!==null&&e.timeBomb>0&&t.push({key:"timeBomb",label:`TIME BOMB ${e.timeBomb}`,icon:"\u23F0"}),e.windowLabel&&(e.windowLabel.includes("response")||e.windowLabel.includes("Response"))&&t.push({key:"responseWindow",label:"RESPONSE WINDOW",icon:"\u21A9"}),t}function Pt(e,t){if(e.terminationReason)return"TERMINAL";let a=t.isNetworkMatch===!0,n=t.decision?.isHuman;if(n===!0)return"HUMAN_DECISION";if(n===!1)return a?"OPPONENT_DECISION":"AI_DECISION";let s=t.humanPlayerId??e.seatOrder?.[0];return e.activePlayerId===s?"HUMAN_DECISION":a?"OPPONENT_DECISION":"AI_DECISION"}var Ot="intrilex-local-profile-v1",Lt="1.1.0",G={schemaVersion:Lt,displayName:"You",rating:{scope:"LOCAL_AI",value:1200,provisional:!0,ratedMatches:0},badges:[],record:{wins:0,losses:0,draws:0},verifiedResults:[],streakData:{currentStreak:0,bestStreak:0,lastResult:null},ratingHistory:[],archetypeBreakdown:{}};function j(){try{let e=localStorage.getItem(Ot);if(!e)return{...G};let t=JSON.parse(e);return xt(t)}catch{return{...G}}}function cn(){try{let e="__intrilex_storage_test__";return localStorage.setItem(e,"1"),localStorage.removeItem(e),!0}catch{return!1}}function Dt(e){return e?e.startsWith("hybrix-")?e.replace("hybrix-","").replace(/-(hard|easy|nightmare|normal)$/,""):e:null}function xt(e){if(!e.schemaVersion)return{...G};e.rating||(e.rating={...G.rating}),e.badges||(e.badges=[]),e.record||(e.record={...G.record}),e.verifiedResults||(e.verifiedResults=[]),e.streakData||(e.streakData={...G.streakData}),e.ratingHistory||(e.ratingHistory=[]),e.archetypeBreakdown||(e.archetypeBreakdown={});for(let t of e.verifiedResults)t.aiDifficulty||(t.aiDifficulty=Mt(t.aiPolicyId)),t.aiArchetype||(t.aiArchetype=Dt(t.aiPolicyId)),t.ratingDelta===void 0&&(t.ratingDelta=0);return e}function Mt(e){return e?e.endsWith("-hard")?"hard":e.endsWith("-easy")?"easy":e.endsWith("-nightmare")?"nightmare":"normal":"normal"}var w=Object.freeze({PLAY:"play",SCORE:"score",MANIPULATE:"manipulate",RESPOND:"respond",SYSTEM:"system"}),_t=Object.freeze({[w.PLAY]:"Play",[w.SCORE]:"Score",[w.MANIPULATE]:"Manipulate",[w.RESPOND]:"Respond",[w.SYSTEM]:"System"}),Ht=Object.freeze({[w.PLAY]:"\u2663",[w.SCORE]:"\u2605",[w.MANIPULATE]:"\u21C4",[w.RESPOND]:"\u26E8",[w.SYSTEM]:"\u2699"}),Ut=Object.freeze({"effect-three":"\u21AF","effect-four":"\u2610","effect-five":"\u21BA","effect-six":"\u26CF","effect-seven":"\u21DF","effect-nine":"\u22A5","effect-ace":"\u2726","effect-red-joker":"\u{1F0CF}","effect-board-lock":"\u{1F512}","effect-row-clear":"\u232B","effect-bounce":"\u21A9","effect-tap":"\u{1F446}","effect-goal-shift":"\u{1F3AF}","effect-jack-control":"\u2693","effect-private-choice":"?",anchor:"\u2693","anchor-guard":"\u2693","anchor-private-choice":"\u2693",attachment:"\u{1F517}",scuttle:"\u2694",score:"\u2605","play-for-points":"\u2605","swap-bar":"\u21C4",draw:"\u2193",counter:"\u{1F6E1}",disrupt:"\u{1F4A5}",interrupt:"\u26A1",instant:"\u26A1",quick:"\u26A1",voltage:"\u26A1","solo-wild":"\u{1F0CF}",ultra:"\u{1F48E}",rank10:"\u2469","response-decline":"\u2298","exhausted-pass":"\u2298",phase:"\u23ED","private-choice":"?","royal-marriage":"\u26AD","queens-court":"\u2655","wild-sovereignty":"\u{1F0CF}","super-ace":"\u2726","king-spade-counter":"\u2693","board-lock":"\u{1F512}","sudden-death-autonomy":"\u2620"});function Le(e){return Ut[e]??""}var Bt=new Set(["effect-three","effect-four","effect-five","effect-six","effect-seven","effect-nine","effect-ace","effect-red-joker","effect-board-lock","effect-row-clear","effect-bounce","effect-tap","effect-goal-shift","effect-jack-control","effect-private-choice"]),Gt=new Set(["solo-wild","ultra","scuttle","anchor","anchor-guard","anchor-private-choice","attachment","rank10","voltage","royal-marriage","queens-court","wild-sovereignty","super-ace","king-spade-counter","board-lock","sudden-death-autonomy"]),Yt=new Set(["score","play-for-points"]),Ft=new Set(["swap-bar"]),Vt=new Set(["counter","disrupt","interrupt","instant","quick","response-decline"]),jt=new Set(["draw","phase","exhausted-pass","private-choice"]);function Wt(e,t){let a=e??"unknown";return Bt.has(a)||Gt.has(a)?w.PLAY:Yt.has(a)?w.SCORE:Ft.has(a)?w.MANIPULATE:Vt.has(a)?w.RESPOND:jt.has(a)?w.SYSTEM:t?.isResponse?w.RESPOND:t?.isExhaustedPass||t?.isDecline?w.SYSTEM:w.PLAY}var C=Object.freeze({DIRECT:"direct",SOURCE:"source",VARIANT:"variant",COMBINATION:"combination",TARGET:"target"});function zt(e){let t=e?.family??"unknown",a=e?.mode??null;return t==="swap-bar"?`swap-bar|${a}`:t==="phase"?`phase|${a}`:t==="anchor"?`anchor|${a}`:t}function qt(e){if(!e||e.length<=1)return C.DIRECT;let t=r=>r?.targetHandles??r?.targets?.legalTargetIds??[];if(new Set(e.map(r=>t(r).join(","))).size>1)return C.TARGET;if(new Set(e.map(r=>r?.mode??"")).size>1)return C.VARIANT;let s=r=>r?.sourceHandles??r?.sourceEntityIds??[];if(new Set(e.map(r=>s(r).slice().sort().join(","))).size>1){let r=new Set(e.map(o=>s(o).length));return r.has(1)&&r.size===1?C.SOURCE:C.COMBINATION}return C.DIRECT}function Kt(e,t){let a=e?.family??"unknown",n=e?.mode??null,s=e?.sourceHandles??e?.sourceEntityIds??[],i=e?.targetHandles??e?.targets?.legalTargetIds??[],r=K(a,n);if(a==="solo-wild")return r||n;if(a==="ultra"){let d=(s??[]).map(c=>t?.[c]?.identity??"?");return`${r||n} (${d.join(" + ")})`}if(a==="score"||a==="play-for-points"){let d=s?.[0];return(d?t?.[d]:null)?.identity??"Points"}if(a.startsWith("effect-")||a==="anchor"||a==="anchor-guard"){let d=s?.[0];return(d?t?.[d]:null)?.identity??M(a)??r??"Effect"}if(a==="swap-bar"&&n==="face-up-draw"){let d=i?.[0];return(d?t?.[d]:null)?.identity??"Swap Card"}if(a==="swap-bar"&&n==="face-down"){let d=s?.[0];return(d?t?.[d]:null)?.identity??"Face-down"}if(["counter","disrupt","interrupt","instant","quick"].includes(a))return r||n||(M(a)??a);if(r&&r!==M(a))return r;let o=s?.[0];return(o?t?.[o]:null)?.identity??r??n??"Variant"}function Qt(e){let{family:t,category:a,selectionType:n,actions:s}=e;if(a===w.RESPOND)return t==="response-decline"?"Pass priority without responding.":"Counter or interrupt the current stack item.";if(t==="draw")return"Draw a card from the top of the Draw Pile.";if(t==="phase")return"Advance to the Action Phase.";if(t==="exhausted-pass")return"No legal action \u2014 forced pass.";if(t==="score"||t==="play-for-points")return"Play a card to your Point Row for its value.";if(t==="swap-bar")return e.mode==="face-down"?"Place a hand card face-down onto the Swap Bar.":"Take a face-up Swap card into your hand.";if(t==="solo-wild")return"Copy a rank 3\u20137 effect using this wild card.";if(t==="ultra")return"Declare a color-recipe Ultra play for powerful effects.";if(t==="scuttle")return"Remove a legal card from an opponent's row.";if(t.startsWith("effect-"))return`${M(t)} \u2014 play this card for its rank effect.`;if(t==="anchor"||t==="anchor-guard"){let i=e.mode;return i==="king"?"Place the King on the Enduring Row as an Anchor (anchor value 7/9).":i==="queen"?"Place the Queen on the Enduring Row as an Anchor with Aegis.":i==="ace"?"Place the Ace on the Enduring Row as an Anchor (anchor value 0).":"Place an Anchor on the Enduring Row for persistent defense."}return t==="attachment"?"Attach a Jack to an opposing card to gain control.":""}function De(e,t={}){let{cardRegistry:a=null,selectedSourceCardId:n=null}=t;if(!e||e.length===0)return[];let s=new Map;for(let o of e){if(!o)continue;let p=zt(o);s.has(p)||s.set(p,[]),s.get(p).push(o)}let i=[];for(let[o,p]of s){let d=p[0]??{},c=d.family??"unknown",u=Wt(c,d),h=qt(p),f=new Set;for(let I of p)if(I)for(let $ of I.sourceHandles??I.sourceEntityIds??[])f.add($);let b=new Set;for(let I of p){if(!I)continue;let $=I.targetHandles??I.targets?.legalTargetIds??[];for(let S of $)b.add(S)}let m=M(c)??"Unknown";if(c==="swap-bar"&&(m=d.mode==="face-down"?"Face-down Swap":"Take Swap Card"),c==="phase"&&(m="Enter Action Phase"),c==="anchor"){let I=K(c,d.mode);m=I?`${I} Anchor`:"Anchor"}c==="response-decline"&&(m="Decline Response"),c==="exhausted-pass"&&(m="Exhausted Pass");let y=p.length;h===C.DIRECT&&(y=1);let E=!1;n&&f.has(n)&&(E=!0);let T={id:o,family:c,mode:d.mode??null,category:u,label:m,description:null,selectionType:h,actions:p,sourceCardIds:Array.from(f),targetIds:Array.from(b),variantCount:y,selectedCardMatch:E,timingClass:d.timingClass??"ACTION",timingLabel:_(d.timingClass??"ACTION"),isResponse:d.isResponse??!1,isDecline:d.isDecline??!1,isExhaustedPass:d.isExhaustedPass??!1,isPrivateChoice:d.isPrivateChoice??!1,isPass:d.isExhaustedPass||d.isDecline||c==="pass"||c==="exhausted-pass"||c==="response-decline",isFullTurn:d.timingClass==="ACTION"&&!d.isResponse,scoreValue:null,variants:null};if(T.description=Qt(T),(c==="score"||c==="play-for-points")&&a&&p[0]?.sourceHandles?.[0]){let I=a[p[0].sourceHandles[0]];I?.pointValue!=null&&(T.scoreValue=I.pointValue)}if(h!==C.DIRECT&&p.length>1){let I=new Set;T.variants=[];for(let $ of p){let S={actionId:$.actionId??$.optionId,label:Kt($,a),sourceHandles:$.sourceHandles??$.sourceEntityIds??[],targetHandles:$.targetHandles??$.targets?.legalTargetIds??[],family:$.family,mode:$.mode},A=`${S.label}|${S.sourceHandles.slice().sort().join(",")}`;I.has(A)||(I.add(A),T.variants.push(S))}}i.push(T)}let r=[w.RESPOND,w.PLAY,w.SCORE,w.MANIPULATE,w.SYSTEM];return i.sort((o,p)=>{let d=r.indexOf(o.category),c=r.indexOf(p.category);return d!==c?d-c:o.selectedCardMatch!==p.selectedCardMatch?o.selectedCardMatch?-1:1:(o.label??"").localeCompare(p.label??"")}),i}function xe(e){return _t[e]??e}function Me(e){return Ht[e]??""}function _e(e){let t=new Set,a=[];for(let n of e)t.has(n.category)||(t.add(n.category),a.push(n.category));return a}function He(e,t){return e.filter(a=>a.category===t)}function Ue(e){return e.some(t=>t.category===w.RESPOND&&!t.isDecline)}function hn(e,t=null){if(!e?.actions)return null;if(e.actions.length===1)return e.actions[0];if(t){let a=e.actions.find(n=>n?(n.sourceHandles??n.sourceEntityIds??[]).includes(t):!1);if(a)return a}return e.selectionType===C.DIRECT?e.actions[0]:null}var N=Object.freeze({PROACTIVE:"proactive",RESPONSE:"response",INTERRUPT:"interrupt",RESOLUTION:"resolution",TRANSITION:"transition"});function Be(e,t){if(!e)return ea();let a=e.match??{},n=e.human??{},s=e.playerView??{};if(e.status==="TERMINAL"||a.winner)return{holder:"system",phase:a.phase??"",windowType:N.TRANSITION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:0,reasonCode:"GAME_ALREADY_TERMINAL",nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1};if(e.status==="AI_DECISION")return{holder:"opponent",phase:a.phase??"",windowType:N.PROACTIVE,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:s.stack?.length??0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!0};if(e.status==="HUMAN_DECISION"&&t){let i=t.kind??"ACTION",r=s.stack??[],o=r.length,p=t.actorId===n.playerId,d=Xt(i,o),c=Jt(t),u=o>0?r[o-1]?.declarationId??null:null;return{holder:p?"human":"opponent",phase:a.phase??"",windowType:d,canAct:!0,canPass:c,pendingDeclarationId:u,stackDepth:o,reasonCode:null,nextOnPass:Zt(d,o),isHumanPriority:p,isOpponentPriority:!p,decisionKind:i}}return{holder:"system",phase:a.phase??"",windowType:N.RESOLUTION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:s.stack?.length??0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1}}function Xt(e,t){return e==="RESPONSE"?N.RESPONSE:e==="EXHAUSTED_PASS"?N.PROACTIVE:e==="PHASE"?N.TRANSITION:e==="PRIVATE_CHOICE"?N.PROACTIVE:t>0?N.RESPONSE:N.PROACTIVE}function Jt(e){return e?.legalActions?e.legalActions.some(t=>t.isDecline||t.isExhaustedPass):!1}function Zt(e,t){return e===N.RESPONSE?t>1?"Passing lets the current declaration continue. Other actors may still respond.":"Passing lets the declaration continue toward resolution.":e===N.PROACTIVE?"You are in a proactive window. There is no pending declaration to pass on.":null}function Ge(e){return{[N.PROACTIVE]:"Proactive Window",[N.RESPONSE]:"Response Window",[N.INTERRUPT]:"Interrupt Window",[N.RESOLUTION]:"Resolution",[N.TRANSITION]:"Phase Transition"}[e]??"Unknown Window"}function ea(){return{holder:"system",phase:"",windowType:N.TRANSITION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1}}function ta(e,t){if(!e)return null;let a=e.type??"UNKNOWN",n=e.controllerId??e.payload?.controllerId??null,s=aa(e,t);return{index:e.index??0,type:a,description:s,actorId:n,details:na(e,t)}}function Ye(e,t){return!e||e.length===0?[]:e.map((a,n)=>{let s=ta(a,t);return s&&(s.index=n+1),s}).filter(Boolean)}function aa(e,t){let a=e.type??"",n=e.payload??{};if(a.includes("DRAW"))return`${k(e)} drew a card.`;if(a.includes("SCORE")||a.includes("POINTS")){let s=O(n.cardId,t);return`${k(e)} scored ${s}.`}if(a.includes("SCUTTLE")){let s=O(n.targetId,t);return`${k(e)} scuttled ${s}.`}if(a.includes("SWAP"))return`${k(e)} used the Swap Bar.`;if(a.includes("COUNTER")){let s=O(n.targetId,t);return`${k(e)} countered ${s}.`}if(a.includes("DISCARD"))return`${k(e)} discarded a card.`;if(a.includes("EXILE"))return`${k(e)} exiled a card.`;if(a.includes("BOUNCE")){let s=O(n.targetId,t);return`${k(e)} bounced ${s}.`}if(a.includes("TAP")){let s=O(n.targetId,t);return`${k(e)} tapped ${s}.`}if(a.includes("PURGE"))return`${k(e)} purged a card.`;if(a.includes("ROW_CLEAR"))return`${k(e)} cleared a row.`;if(a.includes("ANCHOR_ENTERED")){let s=O(n.sourceCardId,t);return`${k(e)} placed ${s} as an anchor on the Enduring Row.`}if(a.includes("ATTACHMENT_RESOLVED")){let s=O(n.jackCardId,t),i=O(n.hostCardId,t);return`${k(e)} attached ${s} to ${i}.`}if(a.includes("RED_JOKER"))return`${k(e)} used a Red Joker effect.`;if(a.includes("BOARD_LOCK"))return`${k(e)} activated Board Lock.`;if(a.includes("ENTER_ACTION"))return"Entered the Action Phase.";if(a.includes("BEGIN_START"))return"Start phase began.";if(a.includes("CARD_MOVED"))return"A card was moved.";if(a.includes("CARD_TAKEN"))return`${k(e)} took a card.`;if(a.includes("GOAL_CHANGED"))return`${k(e)}'s goal changed.`;if(a.includes("TARGET_REMOVED"))return"A target was removed.";if(a.includes("MARKER_SET"))return"A marker was set on a card.";if(a.includes("TRIGGER_QUEUED"))return"A trigger was queued.";if(a.includes("STACK_ITEM_REBOUND"))return"A stack item rebounded.";if(a.includes("RESPONSE_WINDOW_CLOSED")||a.includes("PRIORITY_CLOSED"))return"The response window closed.";if(a.includes("RESPONSE_DECLINED")||a.includes("PRIORITY_PASSED"))return`${k(e)} passed priority.`;if(a.includes("RESOLVE"))return`${n.kind??"effect"} resolved.`;if(a.includes("CANCEL"))return`${n.kind??"effect"} was cancelled.`;if(a.includes("PASS"))return`${k(e)} passed.`;if(a.includes("PHASE"))return`Phase transition: ${n.phase??"unknown"}.`;if(a.includes("TURN"))return`Turn ${n.turnNumber??""} began.`;if(a.includes("TERMINAL")||a.includes("GAME_OVER"))return`Match ended. Winner: ${n.winner??"unknown"}.`;if(a.includes("SUPER"))return`${k(e)} declared a Super.`;if(a.includes("DECLARATION")||a.includes("DECLARE_PRIMARY")){let s=n.kind??"action";return`${k(e)} declared ${s}.`}return`${a.replace(/_/g," ").toLowerCase()}.`}function k(e){let t=e.controllerId??e.payload?.controllerId;return t?t==="P1"?"Player 1":t==="P2"?"Player 2":t:"The game"}function O(e,t){if(!e||!t)return"a card";let a=t[e];return a?a.identity??"a card":"a card"}function na(e,t){let a=e.payload??{},n={};return a.cardId&&(n.source=O(a.cardId,t)),a.targetId&&(n.target=O(a.targetId,t)),a.effectName&&(n.effectName=a.effectName),a.result&&(n.result=a.result),a.prevented&&(n.prevented=a.prevented),a.modified&&(n.modified=a.modified),n}function Fe(e){if(!e||!e.match)return null;let t=[sa(e),ia(e),ra(e),oa(e),ca(e)].filter(Boolean);return t.length===0?null:t[0]}function sa(e){let t=e.match.fullTurnSequence??0,a=e.human??{},n=e.opponent??{},s=a.secured??0,i=n.secured??0;return t<=6&&s<i?{title:"Early Pressure",insight:`The match ended in only ${t} turns \u2014 the opponent secured an early lead.`,tip:"In short games, responding to early threats is critical. Consider blocking or countering sooner.",category:"tempo"}:null}function ia(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=a.secured??0,i=n-s;return i<-8?{title:"Margin Analysis",insight:`You trailed by ${Math.abs(i)} IR at game end \u2014 a significant gap.`,tip:"Large margins often indicate a positioning disadvantage. Review the midgame to find where the gap widened.",category:"positioning"}:i>8?{title:"Dominant Performance",insight:`You won by ${i} IR \u2014 a commanding margin.`,tip:"Analyze what worked: which cards created the advantage? Look for patterns to replicate.",category:"tempo"}:null}function ra(e){let t=e.human??{},a=t.cardsDrawn??0,n=t.cardsPlayed??0,s=e.zones??{};return(s.drawPile?.count??s.drawPile?.length??0)===0&&a>0?{title:"Deck Exhaustion",insight:"You drew through your entire deck \u2014 every card was available.",tip:"When the deck is empty, hand management becomes critical. Did you hold cards too long or play them too freely?",category:"efficiency"}:null}function oa(e){let a=(e.human??{}).passes??0,n=e.match.fullTurnSequence??0;if(a>3&&n>0){let s=a/n;if(s>.3)return{title:"Pass Frequency",insight:`You passed ${a} times in ${n} turns (${Math.round(s*100)}% of turns).`,tip:"Frequent passing cedes tempo. Consider whether some passes could have been actions \u2014 even a defensive play maintains pressure.",category:"tempo"}}return null}function ca(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=t.goal??21,i=s>0?n/s:0,r=e.match.winner,o=e.human?.playerId;return i>=.8&&r!==o&&r!==null?{title:"So Close",insight:`You reached ${n}/${s} IR (${Math.round(i*100)}% of goal) but couldn't close it out.`,tip:"Endgame positioning matters. When close to goal, prioritize defense \u2014 the opponent needs fewer points to catch up.",category:"defense"}:null}function Ve(e){if(!e||!e.match)return null;let t=[la(e),da(e),ua(e),pa(e)].filter(Boolean);return t.length===0?null:t[0]}function la(e){let a=(e.human??{}).passes??0;return a>=4?{title:"Beginner Trap: Passing Too Much",insight:`You passed ${a} times. Passing gives your opponent free tempo.`,tip:"Try to play a card instead of passing, even if it's a defensive move. Every pass is a missed opportunity.",category:"tempo"}:null}function da(e){let a=(e.human??{}).cardsPlayed??0,n=e.match.fullTurnSequence??0;return n>8&&a<n*.5?{title:"Beginner Trap: Underutilizing Cards",insight:`You played only ${a} cards in ${n} turns. Your hand is your main resource.`,tip:"Holding cards too long means missing opportunities. Look for moments to play cards that advance your position.",category:"efficiency"}:null}function ua(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=a.secured??0,i=e.match.fullTurnSequence??0;return i<=5&&s-n>=5?{title:"Beginner Trap: Slow Start",insight:`The opponent built a ${s-n} IR lead in only ${i} turns.`,tip:"In the opening turns, focus on establishing board presence. Don't wait to see what the opponent does \u2014 act first.",category:"tempo"}:null}function pa(e){let a=(e.human??{}).counters??0;return((e.opponent??{}).cardsPlayed??0)>5&&a===0?{title:"Beginner Trap: Not Countering",insight:"You didn't counter any of your opponent's plays.",tip:"Countering is a key defensive tool. When the opponent plays a high-value card, a counter can negate their tempo.",category:"defense"}:null}function je(e){return e?`<div class="teaching-moment" data-testid="teaching-moment" data-category="${e.category}">
    <h3 class="teaching-moment-title">\u{1F4A1} ${e.title}</h3>
    <p class="teaching-moment-insight">${e.insight}</p>
    <p class="teaching-moment-tip" data-testid="teaching-moment-tip">${e.tip}</p>
  </div>`:""}var L=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);function W(e){return e?String(e).replace(/_/g," ").toLowerCase().replace(/\b\w/g,t=>t.toUpperCase()):""}function We(e){return e?String(e).replace(/_/g," ").toLowerCase().replace(/\b\w/g,t=>t.toUpperCase()):"Unknown"}function ze(e,t){let a=e.match.winner??null,n=e.human?.playerId??null,i=a==null||e.match.terminationReason==="CANONICAL_DRAW"?"draw":a===n?"win":"loss",r=i==="win"?"VICTORY":i==="loss"?"DEFEAT":"DRAW",o=i==="win"?"\u{1F3C6}":i==="loss"?"\u{1F480}":"\u{1F91D}",p=e.opponent?.archetype??"",d=Te(p,i==="loss");return`<div class="play-terminal ${i}" data-testid="play-terminal">
    <div class="terminal-result-banner ${i}">
      <span class="terminal-result-icon" aria-hidden="true">${o}</span>
      <h2>Match Complete</h2>
      <p class="terminal-result" data-testid="terminal-result">${r==="VICTORY"?"You won!":r==="DEFEAT"?"You lost.":"Draw."}</p>
      <p class="terminal-banter" data-testid="terminal-banter">${L(d)}</p>
    </div>
    <dl class="terminal-details">
      <dt>Winner</dt><dd data-testid="terminal-winner">${L(i==="win"?"You":i==="loss"?"AI":"Draw")}</dd>
      <dt>Termination</dt><dd>${L(We(e.match.terminationReason||"UNKNOWN"))}</dd>
      <dt>Full Turns</dt><dd>${e.match.fullTurnSequence??0}</dd>
    </dl>
    ${fa(t)}
    ${t.achievementSummaryHtml||""}
    ${ha(e,t)}
    ${je(Fe(e)||Ve(e))}
    <div class="terminal-actions">
      <button class="primary-button" data-testid="watch-replay" data-action="watch-replay">Watch replay</button>
      ${t.isNetworkMatch?'<button class="secondary-button" data-testid="download-replay" data-action="download-replay">Download certified replay</button>':""}
      ${t.isNetworkMatch?'<button class="secondary-button" data-testid="network-rematch" data-action="network-rematch">Request rematch</button>':""}
      ${t.isNetworkMatch?"":'<button class="secondary-button" data-testid="rematch-same-seed" data-action="rematch">Rematch same seed</button>'}
      ${t.isNetworkMatch?"":'<button class="secondary-button" data-testid="new-seed" data-action="new-seed">New seed</button>'}
      <a class="secondary-button" data-testid="open-rank-anatomy" href="#/ranks">Open Rank Anatomy</a>
      <a class="secondary-button" data-testid="open-history" href="#/history">Open History</a>
      <a class="secondary-button" data-testid="open-achievements" href="#/achievements">View Achievements</a>
      ${t.academyLessonId?'<a class="primary-button" data-testid="back-to-academy" href="#/play/academy">Back to Academy</a>':'<button class="secondary-button" data-testid="return-to-hub" data-action="return-to-hub">Return to Play hub</button>'}
      ${t.academyLessonId&&t.academyRecap?'<button class="primary-button" data-testid="view-academy-recap" data-action="view-academy-recap">View lesson recap</button>':""}
    </div>
  </div>`}function qe(e,t){return`<div class="play-error" data-testid="play-error" role="alert">
    <h2>Session Error</h2>
    <p>${L(e.error?.reason||e.error||"Unknown error")}</p>
    <button class="secondary-button" data-action="return-to-hub">Return to Play hub</button>
  </div>`}function ha(e,t){if(!e||!e.match)return"";let a=e.human??{},n=e.opponent??{},s=e.zones??{},i=e.match??{},r=i.fullTurnSequence??0,o=a.secured??0,p=n.secured??0,d=o-p,c=a.goal??21,u=n.goal??21,h=c>0?Math.min(100,Math.round(o/c*100)):0,f=u>0?Math.min(100,Math.round(p/u*100)):0,b=s.drawPile?.count??s.drawPile?.length??0,g=s.discard?.count??s.discard?.length??0,m=We(i.terminationReason||"UNKNOWN"),y=d>0?`+${d}`:String(d),E=d>0?"intel-margin-positive":d<0?"intel-margin-negative":"intel-margin-neutral",I=t.isNetworkMatch===!0?"Opponent":"AI";return`<div class="intel-card" data-testid="match-intelligence-card">
    <h3 class="intel-title">Match Intelligence</h3>
    <div class="intel-grid">
      <div class="intel-stat" data-testid="intel-turns">
        <span class="intel-stat-label">Turns</span>
        <span class="intel-stat-value">${r}</span>
      </div>
      <div class="intel-stat" data-testid="intel-margin">
        <span class="intel-stat-label">IR Margin</span>
        <span class="intel-stat-value ${E}">${L(y)}</span>
      </div>
      <div class="intel-stat" data-testid="intel-draw-remaining">
        <span class="intel-stat-label">Draw Pile</span>
        <span class="intel-stat-value">${b}</span>
      </div>
      <div class="intel-stat" data-testid="intel-discard">
        <span class="intel-stat-label">Cards Played</span>
        <span class="intel-stat-value">${g}</span>
      </div>
    </div>
    <div class="intel-goal-bars">
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">You</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-human" style="width:${h}%"></div></div>
        <span class="intel-goal-bar-value">${o}/${c}</span>
      </div>
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">${L(I)}</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-opponent" style="width:${f}%"></div></div>
        <span class="intel-goal-bar-value">${p}/${u}</span>
      </div>
    </div>
    <p class="intel-termination" data-testid="intel-termination">Ended: ${L(m)}</p>
  </div>`}function fa(e){let t=e.rankResult;if(t&&typeof t=="object"){let a=Math.max((t.ratedMatchesBefore??1)-1,0),n=t.ratedMatchesAfter??t.ratedMatchesBefore??1,s=H(t.ratingBefore,{ratedMatches:a}),i=H(t.ratingAfter,{ratedMatches:n}),r=Math.round((t.ratingAfter??0)-(t.ratingBefore??0)),o=r>0?"+":"",p=r>0?"rank-result-delta-up":r<0?"rank-result-delta-down":"",d=pe(i,s),c=d>0,u=d<0,h=B({tier:s.tier,division:s.division,size:96,showDivision:!0,decorative:!0,className:"rank-result-before-glyph"}),f=B({tier:i.tier,division:i.division,size:96,showDivision:!0,decorative:!1,className:"rank-result-after-glyph"}),b=c||u?'<span class="rank-result-arrow" aria-hidden="true">\u2192</span>':"",g=c?'<p class="rank-result-banner rank-up" data-testid="rank-result-banner">RANK UP</p>':u?'<p class="rank-result-banner rank-down" data-testid="rank-result-banner">RANK DOWN</p>':"",m=t.ratingBefore!=null?String(t.ratingBefore):"\u2014",y=t.ratingAfter!=null?String(t.ratingAfter):"\u2014";return`<div class="rank-result-block" data-testid="rank-result-block">
      ${g}
      <div class="rank-result-glyphs">
        ${c||u?`${h}${b}${f}`:f}
      </div>
      <p class="rank-result-tier" data-testid="rank-result-tier">${L(U(i.tier,i.division))}</p>
      <p class="rank-result-rating ${p}" data-testid="rank-result-rating">${m} \u2192 ${y} IR <span class="rank-result-delta">${o}${r}</span></p>
    </div>`}try{let a=j();if(!a?.rating)return"";let n=H(a.rating.value,{ratedMatches:a.rating.ratedMatches});return n.isPlacement?`<div class="rank-result-block" data-testid="rank-result-block">
        ${B({tier:n.tier,division:n.division,size:96,showDivision:!1,decorative:!1})}
        <p class="rank-result-tier">${L(U(n.tier,n.division))}</p>
        <p class="rank-result-placement">${n.placementsPlayed} / ${n.placementsRequired} Placements</p>
      </div>`:`<div class="rank-result-block" data-testid="rank-result-block">
      ${B({tier:n.tier,division:n.division,size:96,showDivision:!0,decorative:!1})}
      <p class="rank-result-tier">${L(U(n.tier,n.division))}</p>
      <p class="rank-result-rating">${a.rating.value} IR</p>
    </div>`}catch{return""}}function Ke(){return`<div class="keyboard-help-overlay" data-testid="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
    <h3>Keyboard Shortcuts</h3>
    <dl class="keyboard-help-list">
      <dt><kbd>P</kbd></dt><dd>Pass priority / Decline response</dd>
      <dt><kbd>I</kbd></dt><dd>Open card inspector for selected card</dd>
      <dt><kbd>A</kbd></dt><dd>Open Advanced Card Rules for selected/inspected card</dd>
      <dt><kbd>R</kbd></dt><dd>Toggle stack details</dd>
      <dt><kbd>?</kbd></dt><dd>Toggle this help</dd>
      <dt><kbd>Esc</kbd></dt><dd>Close Advanced View, cancel selection, or close inspector</dd>
      <dt><kbd>Enter</kbd></dt><dd>Confirm selected action</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="keyboard-help-close" aria-label="Close keyboard help">Close</button>
  </div>`}function Qe(e){return`<div class="keyboard-help-overlay" data-testid="rules-help" role="dialog" aria-label="Rules and help">
    <h3>Quick Rules \u2014 ${(e?.decision?.kind??"ACTION")==="RESPOND"?"Response Phase":"Action Phase"}</h3>
    <dl class="keyboard-help-list">
      <dt>Goal</dt><dd>Reduce your opponent's Influence (IR) to 0, or have the higher IR when the Draw Pile is empty.</dd>
      <dt>Draw</dt><dd>Take a card from the Draw Pile each turn. If empty, you must pass.</dd>
      <dt>Score</dt><dd>Play a card to your Point Row for its rank value in IR.</dd>
      <dt>Effects</dt><dd>Play cards for their rank effects (7=Scuttle, 6=Anchor, 5=Swap, 4=Peek, 3=Copy, J=Attach, Q=Ultra).</dd>
      <dt>Respond</dt><dd>When the opponent acts, you may counter or decline (pass priority).</dd>
      <dt>Confirm</dt><dd>Select an action, then click Confirm (or press Enter) to submit it.</dd>
    </dl>
    <p class="keyboard-help-hint">For the full rulebook, visit the <a href="#/rules">Rules page</a>.</p>
    <button class="keyboard-help-close" data-testid="rules-help-close" aria-label="Close rules help">Close</button>
  </div>`}function Xe(e){if(!e)return"";let t=e.human??{},a=e.opponent??{},n=e.match??{},s=e.recentEvents??[];return`<div class="keyboard-help-overlay" data-testid="match-stats" role="dialog" aria-label="Match statistics">
    <h3>Match Statistics</h3>
    <dl class="keyboard-help-list">
      <dt>Your IR</dt><dd>${t.ir??t.influence??"\u2014"}</dd>
      <dt>Opponent IR</dt><dd>${a.ir??a.influence??"\u2014"}</dd>
      <dt>Turn</dt><dd>${n.turn??"\u2014"}</dd>
      <dt>Phase</dt><dd>${e.decision?.kind??"\u2014"}</dd>
      <dt>Recent Events</dt><dd>${s.length} event(s) this session</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="match-stats-close" aria-label="Close match stats">Close</button>
  </div>`}function z(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}function Je(e,t,a,n){let s=e.mode?.label??"LOCAL VS AI",i=e.mode?.isNetwork===!0,r=t.chatHidden===!0,o=e.human?.playerId,p=e.opponent?.playerId,d=(n||[]).map(f=>{let b,g;if(f.isSystem)b="rd-chat-msg system",g="System";else if(i&&f.participantId){let m=f.isHuman===!0;b=m?"rd-chat-msg human":"rd-chat-msg opponent",g=m?e.human?.displayName??"You":e.opponent?.displayName??"Opponent"}else b=f.isHuman?"rd-chat-msg human":"rd-chat-msg ai",g=f.isHuman?e.human?.displayName??"You":e.opponent?.displayName??"AI";return`<div class="${b}" data-message-id="${z(f.messageId??"")}">
      <div class="rd-chat-author">${z(g)}</div>
      <div class="rd-chat-text">${z(f.text)}</div>
    </div>`}).join(""),c=a?"":`<form class="rd-chat-input" data-testid="match-chat-form">
    <input type="text" placeholder="Message..." data-chat-input maxlength="200" aria-label="Chat message" data-testid="match-chat-input">
    <button type="button" class="rd-chat-emote-btn" data-action="chat-emote" aria-label="Emotes" data-testid="chat-emote-btn" title="Emotes">\u263A</button>
    <button type="submit" data-action="chat-send" aria-label="Send">\u27A4</button>
  </form>`,u=(n||[]).length>0,h=i?`<button class="rd-chat-toggle-btn" data-action="${r?"chat-show":"chat-hide"}" data-testid="chat-toggle-btn" title="${r?"Show Match Chat":"Hide Match Chat"}" aria-label="${r?"Show Match Chat":"Hide Match Chat"}">${r?"\u25B6":"\u25BC"}</button>`:"";return r?`<div class="rd-chat-panel rd-chat-hidden" data-chat-empty="${!u}" data-testid="match-chat-panel">
      <div class="rd-chat-header">
        <span class="rd-chat-title">MATCH CHAT</span>
        <span class="rd-chat-mode">HIDDEN</span>
        ${h}
      </div>
    </div>`:`<div class="rd-chat-panel" data-chat-empty="${!u}" data-testid="match-chat-panel">
    <div class="rd-chat-header">
      <span class="rd-chat-title">MATCH CHAT</span>
      <span class="rd-chat-mode">${z(s)} \xB7 LIVE</span>
      ${h}
    </div>
    <div class="rd-chat-messages" data-testid="match-chat-messages" role="log" aria-live="polite" aria-atomic="false">
      ${d||'<div class="rd-chat-empty">No messages yet</div>'}
    </div>
    ${c}
  </div>`}var ma=Je;function ga(e){if(!e)return{};let t=new Set((e.statusMarkers??[]).map(a=>a?.type));return{tapped:t.has("TAPPED"),aegis:t.has("AEGIS"),providesGuard:t.has("GUARD"),exileBound:t.has("EXILE_BOUND"),jackHostId:t.has("ATTACHMENT")?!0:void 0}}var l=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);function ya(e){if(!e||e.state)return e;let t=e.playerView;if(!t)return{sessionId:e.sessionId,status:e.status};let a=e.human?.playerId??t.actorId??"P1",n=t.opponents??[],s=[a,...n.map(r=>r.playerId)],i={};i[a]={securedPoints:t.own?.securedPoints??0,goal:t.own?.goal??21,hand:t.own?.hand??[],pointRow:t.own?.pr??[],enduringRow:t.own?.er??[],isActive:t.activePlayerId===a,hasPriority:t.priority?.ownerId===a};for(let r of n)i[r.playerId]={securedPoints:r.securedPoints??0,goal:r.goal??21,hand:{count:r.handCount??0},pointRow:r.pr??[],enduringRow:r.er??[],displayName:e.opponent?.displayName??"AI",aiRating:e.opponent?.aiRating??null,isHuman:e.opponent?.isHuman??!1,rating:e.opponent?.rating??null,rank:e.opponent?.rank??null,connectionState:e.opponent?.connectionState??null};return{sessionId:e.sessionId,humanPlayerId:a,status:e.status,isNetworkMatch:e.isNetworkMatch===!0,decision:e.decision??null,legalActions:e.decision?.legalActions??[],chat:e.chat??[],state:{seatOrder:s,fullTurnSequence:t.fullTurnSequence??e.match?.fullTurnSequence??0,phase:t.phase??e.match?.phase??"",activePlayerId:t.activePlayerId??e.match?.activePlayerId??null,priorityOwnerId:t.priority?.ownerId??null,windowLabel:t.priority?.windowLabel??"",startingGoal:t.own?.goal??21,players:i,drawPile:{count:t.dpCount??0},graveyard:{count:t.gyCount??(t.gyTopCard?1:0),topCard:t.gyTopCard??null},exile:{count:t.exileCount??0,newestVisibleCard:null},swapBar:t.swapBar??[],stack:t.stack??[],swapAvailable:!0,terminationReason:e.match?.terminationReason??null,winner:e.match?.winner??null}}}function ns(e,t={}){return e?va(e,t):'<div class="play-error">No active session.</div>'}function ba(e,t){if(!t.isNetworkMatch&&!e?.isNetworkMatch)return null;let a=e?.matchMode??"private",n=e?.queueId??null,s;switch(a){case"ranked":s="ONLINE \xB7 RANKED DUEL";break;case"casual":s="ONLINE \xB7 CASUAL DUEL";break;default:s="ONLINE \xB7 DIRECT DUEL";break}return{kind:"NETWORK",label:s,networkRanked:a==="ranked",isNetwork:!0,matchMode:a,queueId:n}}function va(e,t={}){let a=j(),n=ya(e),s=ba(e,t);s?.isNetwork&&e?.human&&(a={...a,displayName:e.human.displayName??a.displayName,rating:e.human.rating!=null?{...a.rating,value:e.human.rating,scope:"NETWORK",provisional:!1}:a.rating});let i=Pe(n,a,s);return i.status==="ERROR"?qe(i,t):i.status==="TERMINAL"?ze(i,t):Ia(i,t,e)}function Ia(e,t,a){let n=t.leaseMode==="READ_ONLY",s=e.status==="HUMAN_DECISION",i=e.status==="AI_DECISION",r=e.status==="OPPONENT_DECISION",o=e.mode?.isNetwork===!0,p=a?Be(a,a.decision):null,d=t.guidanceMode??D.GUIDED,c=p?ge(p,[],d):null,u={},h=e?.battlefield?.humanHand??[];for(let y of h)y.entityId&&(u[y.entityId]=y);let f=e?.battlefield?.topPR??[],b=e?.battlefield?.topER??[],g=e?.battlefield?.bottomPR??[],m=e?.battlefield?.bottomER??[];return[...f,...b,...g,...m].forEach(y=>{y?.entityId&&(u[y.entityId]=y)}),`<div class="ranked-duel-shell" role="main" aria-label="Ranked Duel Match" data-testid="play-board" data-gameplay-skin="${l(t.gameplaySkin)}"${t.isCaster===!0?' data-caster="1"':""}>
    ${Aa(e,t,p,c)}
    <section class="rd-cell rd-enemy-enduring" data-grid="enemyE" aria-label="Opponent Enduring">
      ${et(b,"opponent")}
    </section>
    <section class="rd-cell rd-enemy-points" data-grid="enemyP" aria-label="Opponent Points">
      ${Ze(f,"Points",e.opponent.secured,e.opponent.goalLabel,"opponent")}
    </section>
    <section class="rd-cell rd-enemy-profile" data-grid="enemyProfile" aria-label="Opponent profile">
      ${nt(e.opponent,"opponent",e)}
      ${Ua(e.battlefield.opponentHandCount,t.opponentHandCards)}
    </section>
    <section class="rd-cell rd-piles" data-grid="piles" aria-label="Shared piles">
      <div class="rd-piles-label">SHARED PILES</div>
      <div class="rd-piles-row">
        ${Z("Exile",e.zones.exile.count,e.zones.exile.newestCard,"exile")}
        ${Z("Discard",e.zones.discard.count,e.zones.discard.topCard,"discard")}
        ${Z("Draw",e.zones.draw.count,null,"draw")}
      </div>
    </section>
    <section class="rd-cell rd-swap" data-grid="swap" aria-label="Swap bar">
      ${Ga(e,t,s,n)}
    </section>
    <section class="rd-cell rd-stage" data-grid="stage" data-board="1" aria-label="Active stage">
      ${ka(e,t,a,p,c)}
    </section>
    <section class="rd-cell rd-stack" data-grid="stack" data-stack-depth="${e.stack?.length??0}" aria-label="Resolution stack">
      ${Sa(e)}
    </section>
    <section class="rd-cell rd-player-enduring" data-grid="playerE" aria-label="Your Enduring">
      ${et(m,"human")}
    </section>
    <section class="rd-cell rd-player-points" data-grid="playerP" aria-label="Your Points">
      ${Ze(g,"Points",e.human.secured,e.human.goalLabel,"human")}
    </section>
    <section class="rd-cell rd-gamelog" data-grid="gamelog" data-log-empty="${(a?.recentEvents?.length??0)===0}" aria-label="Game log">
      <div class="rd-rail-section-header">GAME LOG</div>
      ${_a(a?.recentEvents??[],a?.systemEvents??[],u)}
    </section>
    <section class="rd-cell rd-score-rail" data-grid="scoreRail" aria-label="Score rail" data-testid="score-rail">
      ${Ra(e)}
    </section>
    <section class="rd-cell rd-player-profile" data-grid="playerPro" aria-label="Your profile">
      ${nt(e.human,"human",e)}
    </section>
    <section class="rd-cell rd-player-hand" data-grid="playerH" aria-label="Your hand">
      ${Ba(e.battlefield.humanHand,t)}
    </section>
    <section class="rd-cell rd-right-rail-bottom" data-grid="rightRailBottom" aria-label="Actions and chat">
      ${t.rightRailHtml?t.rightRailHtml:Ta(e,t,a,n,s,i,r,p,c,o)}
    </section>
    ${t.academyPanelHtml?`<section class="rd-cell rd-academy-panel" data-grid="academyPanel" aria-label="Lesson objectives">${t.academyPanelHtml}</section>`:""}
    ${t.academyCoachmarkHtml?t.academyCoachmarkHtml:""}
    ${t.academyPanelHtml?'<div class="academy-hint-display" data-testid="academy-hint-display" role="status" aria-live="polite"></div>':""}
    ${o?Ea(e,a):""}
    ${o?wa(e,a,t):""}
    ${t.inspectorCardId?Va(t.inspectorCardId,u,[],d,t.inspectorFaceView):""}
    ${t.showKeyboardHelp?Ke():""}
    ${t.showRulesHelp?Qe(a):""}
    ${t.showMatchStats?Xe(a):""}
  </div>`}function Ta(e,t,a,n,s,i,r,o,p,d){let c=t.chatHidden===!0,u=t.chatSplit??40,h=Ca(e,t,s,i,r,n,o,p),f=ma(e,t,n,(t.chatMessages||[]).slice(-30)),b=d&&!c?'<div class="rd-rail-divider" data-action="rail-drag" role="separator" aria-orientation="horizontal" aria-label="Drag to resize Actions and Chat" tabindex="0" data-testid="rail-divider"><div class="rd-rail-divider-handle"></div></div>':"";return`<div class="rd-right-rail-bottom-inner" data-chat-hidden="${c}" data-chat-split="${u}">
    <div class="rd-rail-actions-section" style="flex: ${c?"1 1 100%":`${100-u} 1 0`}">
      ${h}
    </div>
    ${b}
    ${c?"":`<div class="rd-rail-chat-section" style="flex: ${u} 1 0">${f}</div>`}
  </div>`}function Ea(e,t){if(!t)return"";let a=t.opponent?.connectionState??e.opponent?.connectionState,n=e.status==="TERMINAL";if(a!=="DISCONNECTED"||n)return"";let s=t.opponent?.graceMs??e.opponent?.graceMs??null,i=t.opponent?.disconnectedAt??e.opponent?.disconnectedAt??null,r="";if(typeof s=="number"&&typeof i=="number"){let o=i+s,p=Math.max(0,o-Date.now()),d=Math.ceil(p/1e3);r=`<p class="rd-disconnect-grace" data-testid="reconnect-grace-countdown" data-grace-deadline-ms="${o}">Reconnect grace: <strong>${d}s</strong> remaining</p>`}return`<div class="rd-disconnect-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-disconnect-title" data-testid="disconnect-overlay">
    <div class="rd-disconnect-content">
      <h2 id="rd-disconnect-title" class="rd-disconnect-title">Opponent Disconnected</h2>
      <p class="rd-disconnect-msg">Waiting for the match server to determine the outcome\u2026</p>
      ${r}
      <div class="rd-disconnect-spinner" aria-hidden="true"></div>
    </div>
  </div>`}function wa(e,t,a){if(!t)return"";let n=a.rematchInvite??t.rematchInvite??e.rematchInvite;if(!n)return"";let s=n.fromDisplayName??"Opponent";return`<div class="rd-rematch-invite-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-rematch-title" data-testid="rematch-invite-overlay">
    <div class="rd-rematch-invite-content">
      <h2 id="rd-rematch-title" class="rd-rematch-title">Rematch Request</h2>
      <p class="rd-rematch-msg"><strong>${l(s)}</strong> wants to play again.</p>
      <div class="rd-rematch-actions">
        <button class="primary-button" data-testid="accept-rematch" data-action="accept-rematch" data-invite-code="${l(n.inviteCode??"")}">Accept</button>
        <button class="secondary-button" data-testid="decline-rematch" data-action="decline-rematch">Decline</button>
      </div>
    </div>
  </div>`}function $a(e){let t=F.includes(e)?e:"dark",a=V[t]||V.dark,n=F.map(s=>{let i=s===t;return`<button class="rd-skin-menu-item ${i?"active":""}" data-action="select-skin" data-skin="${l(s)}" role="menuitemradio" aria-checked="${i?"true":"false"}">
      <span class="rd-skin-menu-icon" aria-hidden="true">${V[s]}</span>
      <span class="rd-skin-menu-label">${l(J[s])}</span>
      <span class="rd-skin-menu-check" aria-hidden="true">\u2713</span>
    </button>`}).join("");return`<div class="rd-skin-selector" style="position:relative;display:inline-flex;">
    <button class="rd-skin-trigger" data-action="toggle-skin-menu" data-testid="skin-selector-trigger" title="Appearance: ${l(J[t])}" aria-label="Select appearance skin" aria-haspopup="menu" aria-expanded="false">${a}</button>
    <div class="rd-skin-menu" role="menu" aria-label="Appearance skins" data-testid="skin-selector-menu">${n}</div>
  </div>`}function Aa(e,t,a,n){let s=e.match.fullTurnSequence,i=W(e.match.phase),r=e.status==="HUMAN_DECISION",o=e.status==="AI_DECISION",p=e.status==="OPPONENT_DECISION",d=e.mode?.isNetwork===!0,c=e.match.priorityOwnerId,u=c===e.human.playerId,h=r?"Your action":p?`${l(e.opponent.displayName)} is choosing\u2026`:o?"AI is choosing\u2026":d&&!u&&c?`${l(e.opponent.displayName)} is choosing\u2026`:u?"Your priority":c?`${l(e.opponent.displayName)} has priority`:i||e.match.phase,f=a?Ge(a.windowType):"",b=e.stack?.length??0,g=e.match.globalStates??[],m=g.length>0?`<span class="rd-header-states">${g.map(v=>`<span class="rd-state-badge rd-state-${l(v.key)}" title="${l(v.label)}">${l(v.icon)} ${l(v.label)}</span>`).join("")}</span>`:"",y=e.status==="TERMINAL",E=!d||y||t.isCaster===!0,T=t.isCaster===!0?"#/watch":t.academyLessonId?"#/play/academy":"#/",I=t.isCaster===!0?"Back to Observatory":t.academyLessonId?"Back to Academy":"Back to home",$=E?`<a class="rd-header-back" href="${T}" aria-label="${l(I)}" title="${l(I)}">\u2190</a>`:"",S=t.isCaster===!0?"Exit to Observatory":d&&!y?"Forfeit match":"Return to hub",A=t.isCaster===!0?"exit-caster":d&&!y?"forfeit-match":"exit-match";return`<header class="rd-header" role="banner">
    <div class="rd-header-left">
      ${$}
      <span class="rd-header-logo">INTRILEX</span>
      <span class="rd-header-mode">${l(e.mode.label)}</span>
    </div>
    <div class="rd-header-center" role="status" aria-live="polite">
      <span class="rd-header-turn">Turn ${s}</span>
      <span class="rd-header-sep">\xB7</span>
      <span class="rd-header-phase">${l(i)}</span>
      ${f?`<span class="rd-header-sep">\xB7</span><span class="rd-header-window ${u?"human":"opponent"}">${l(f)}</span>`:""}
      ${b>0?`<span class="rd-header-sep">\xB7</span><span class="rd-header-stack">Stack ${b}</span>`:""}
      <span class="rd-header-owner ${r?"human":o?"ai":""}">${l(h)}</span>
      ${m}
    </div>
    <div class="rd-header-right">
      <div class="rd-toolbar" role="toolbar" aria-label="Utility controls">
        <button class="rd-toolbar-btn" data-action="sound-toggle" data-testid="sound-toggle" title="${t.soundMuted?"Unmute":"Mute"} audio" aria-label="${t.soundMuted?"Unmute audio":"Mute audio"}">${t.soundMuted?"\u{1F507}":"\u{1F50A}"}</button>
        <button class="rd-toolbar-btn" data-action="keyboard-help" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
        <button class="rd-toolbar-btn" data-action="toggle-rules" title="Rules / Help" aria-label="Rules and help">\u2139</button>
        <button class="rd-toolbar-btn" data-action="toggle-stats" title="Match stats" aria-label="Match statistics">\u25C8</button>
        <button class="rd-toolbar-btn" data-action="toggle-inspector" title="Inspector" aria-label="Card inspector">\u25A4</button>
        ${$a(t.gameplaySkin)}
        <button class="rd-toolbar-btn" data-action="${A}" data-testid="exit-match-btn" title="${S}" aria-label="${S}">\u2715</button>
      </div>
    </div>
  </header>`}function Ze(e,t,a,n,s){let r=e.length===0,o=r?"rd-point-row empty":"rd-point-row";return r?`<div class="${o}" data-side="${s}" aria-label="${t} row">
      <span class="rd-row-label">${t}</span>
      <span class="rd-row-empty-text">No secured cards</span>
    </div>`:`<div class="${o}" data-side="${s}" aria-label="${t} row">
    <span class="rd-row-label">${t}</span>
    <div class="rd-row-cards">
      ${e.map(p=>q(p)).join("")}
    </div>
  </div>`}function et(e,t){let n=e.length===0,s=n?"rd-enduring-row empty":"rd-enduring-row";return n?`<div class="${s}" data-side="${t}" aria-label="Enduring effects">
      <span class="rd-row-label">Enduring</span>
      <span class="rd-row-empty-text">None</span>
    </div>`:`<div class="${s}" data-side="${t}" aria-label="Enduring effects">
    <span class="rd-row-label">Enduring</span>
    <div class="rd-row-cards">
      ${e.map(i=>q(i)).join("")}
    </div>
  </div>`}function Z(e,t,a,n){let s=t===0,i=s?"rd-pile-card empty":"rd-pile-card",r=a?`<div class="rd-pile-top" aria-label="Top card">${l(a.identity)}</div>`:"";return`<div class="${i}" data-pile="${n}" aria-label="${e} pile, ${t} cards" role="button" tabindex="0">
    ${n==="draw"&&!s?'<div class="rd-pile-cardback mini" aria-hidden="true"></div>':""}
    <div class="rd-pile-face">
      <div class="rd-pile-label">${e}</div>
      <div class="rd-pile-count">${t}</div>
      ${r}
    </div>
  </div>`}function Ra(e){let t=e.opponent.secured??0,a=e.opponent.goal??21,n=e.human.secured??0,s=e.human.goal??21;return`<div class="rd-score-rail" data-testid="score-rail-inner">
    <div class="rd-score-cell opp" data-score="${t}" data-goal="${a}" aria-label="Opponent score ${t} of ${a}">
      <div class="rd-score-cell-bg" aria-hidden="true"></div>
      <div class="rd-score-cell-content">
        <span class="rd-score-cell-label">OPP</span>
        <span class="rd-score-cell-value">
          <span class="rd-score-cell-current">${t}</span>
          <span class="rd-score-cell-divider">/</span>
          <span class="rd-score-cell-goal">${a}</span>
        </span>
      </div>
    </div>
    <div class="rd-score-cell you" data-score="${n}" data-goal="${s}" aria-label="Your score ${n} of ${s}">
      <div class="rd-score-cell-bg" aria-hidden="true"></div>
      <div class="rd-score-cell-content">
        <span class="rd-score-cell-label">YOU</span>
        <span class="rd-score-cell-value">
          <span class="rd-score-cell-current">${n}</span>
          <span class="rd-score-cell-divider">/</span>
          <span class="rd-score-cell-goal">${s}</span>
        </span>
      </div>
    </div>
  </div>`}function ka(e,t,a,n,s){let i=e.stack??[],r=i.some(b=>b.isResolving),o=i[0],p=e.status==="HUMAN_DECISION",d=e.status==="AI_DECISION",c=e.status==="OPPONENT_DECISION",u=n?.windowType==="response"||n?.windowType==="interrupt";if(o){let b=o.isHuman?"PLAYED BY YOU":`PLAYED BY ${l(e.opponent.displayName).toUpperCase()}`,g=o.isResolving?"RESOLVING":u?"DECLARED":"ACTIVE";return`<div class="rd-active-stage has-card" aria-label="Active card" role="region">
      <div class="rd-stage-glow"></div>
      <div class="rd-stage-card">
        <div class="rd-stage-card-inner">${l(o.description)}</div>
      </div>
      <div class="rd-stage-actor">${l(b)}</div>
      <div class="rd-stage-status ${o.isResolving?"resolving":"pending"}">${g}</div>
      ${u?'<div class="rd-stage-prompt">Response window open</div>':""}
    </div>`}if(d)return`<div class="rd-active-stage ai-thinking" aria-label="AI is deciding" role="region">
      <div class="rd-stage-glow ai"></div>
      <div class="rd-stage-actor">${l(e.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is deciding\u2026</span>
      </div>
    </div>`;if(c)return`<div class="rd-active-stage opponent-thinking" aria-label="Opponent is deciding" role="region">
      <div class="rd-stage-glow opponent"></div>
      <div class="rd-stage-actor">${l(e.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is choosing\u2026</span>
      </div>
    </div>`;if(p){let b=e.actions?.length??0,g=W(e.match.phase),m=t.selectedSourceCardId,y=m?(e.battlefield?.humanHand??[]).find(v=>v.entityId===m||v.cardId===m):null,E=y?.identity??null,T=y?`<div class="rd-stage-card"><div class="rd-stage-card-inner">${l(E||"Selected")}</div></div>`:"",I=y?`${l(E||"Card")} selected \u2014 choose an action below`:"",$=e.match.fullTurnSequence,S=(e.battlefield?.humanHand??[]).length,A=y?"":`<div class="rd-stage-board-context">
      <div class="rd-stage-actor">TURN ${$} \xB7 ${l(g)}</div>
      <div class="rd-stage-handcount">${S} card${S!==1?"s":""} in hand</div>
    </div>`;return`<div class="rd-active-stage awaiting ${y?"has-selection":""}" aria-label="Awaiting your action" role="region">
      <div class="rd-stage-board-art" aria-hidden="true"></div>
      <div class="rd-stage-glow human"></div>
      <div class="rd-stage-idle-content">
        <div class="rd-stage-action-cluster">
          ${y?'<div class="rd-stage-actor">SELECTED</div>':""}
          ${A}
          ${T}
          ${I?`<div class="rd-stage-prompt">${I}</div>`:""}
          ${y?'<div class="rd-stage-cancel"><button class="rd-stage-cancel-btn" data-action="cancel-selection" aria-label="Cancel card selection">\u2715 Cancel</button></div>':""}
        </div>
        <div class="rd-stage-bubble-fx" aria-hidden="true">
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
        </div>
      </div>
    </div>`}let h=e.match.fullTurnSequence,f=W(e.match.phase);return`<div class="rd-active-stage idle" aria-label="Battlefield" role="region">
    <div class="rd-stage-board-art" aria-hidden="true"></div>
    <div class="rd-stage-idle-content">
      <div class="rd-stage-rune" aria-hidden="true"></div>
      <div class="rd-stage-actor">TURN ${h}</div>
      <div class="rd-stage-phase">${l(f)}</div>
      <div class="rd-stage-prompt">Awaiting next action</div>
    </div>
  </div>`}function Sa(e){let t=e.stack??[],a=e.match.priorityOwnerId===e.human.playerId?"YOU":e.match.priorityOwnerId===e.opponent.playerId?e.opponent.displayName.toUpperCase():"";return t.length===0?`<div class="rd-resolution-stack empty" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
      <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">0</span></div>
      <div class="rd-stack-empty">Stack is empty</div>
      ${a?`<div class="rd-stack-priority">PRIORITY: ${l(a)}</div>`:""}
    </div>`:`<div class="rd-resolution-stack" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
    <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">${t.length}</span></div>
    <div class="rd-stack-list">
      ${t.map((n,s)=>{let i=n.isResolving?"rd-stack-entry resolving":"rd-stack-entry",r=n.actorName||(n.isHuman?"You":e.opponent.displayName),o=n.isResolving?"Resolving":n.status??"Pending";return`<div class="${i}" style="--stack-idx:${s}">
          <div class="rd-stack-entry-num">${s+1}</div>
          <div class="rd-stack-entry-body">
            <div class="rd-stack-entry-desc">${l(n.description)}</div>
            <div class="rd-stack-entry-meta">${l(r)} \xB7 ${l(o)}</div>
          </div>
        </div>`}).join("")}
    </div>
    ${a?`<div class="rd-stack-priority">PRIORITY: ${l(a)}</div>`:""}
  </div>`}function Ca(e,t,a,n,s,i,r,o){let p=e.actions.find(v=>v.isPass),d=p&&!i?`<button class="rd-action-pass" data-action-id="${l(p.actionId)}" data-key="P">Pass</button>`:"";if(n)return`<div class="rd-contextual-actions ai-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${l(e.opponent.displayName)} is deciding\u2026</div>
    </div>`;if(s)return`<div class="rd-contextual-actions opponent-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${l(e.opponent.displayName)} is choosing\u2026</div>
    </div>`;if(i)return`<div class="rd-contextual-actions read-only" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">Read-only mode</span>
    </div>`;let c=e.actions||[];if(c.length===0&&!p)return`<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;let u={},h=e?.battlefield?.humanHand??[];for(let v of h)v.entityId&&(u[v.entityId]=v);let f=e?.battlefield?.topPR??[],b=e?.battlefield?.topER??[],g=e?.battlefield?.bottomPR??[],m=e?.battlefield?.bottomER??[];[...f,...b,...g,...m].forEach(v=>{v?.entityId&&(u[v.entityId]=v)});let y=e?.zones?.swap??[],E=["Left","Center","Right"];for(let v=0;v<3;v++){let P=y[v]??null;P&&(P.card?.entityId&&(u[P.card.entityId]=P.card),P.entityId&&(u[P.entityId]={entityId:P.entityId,identity:P.faceDown?E[v]??`Slot ${v+1}`:P.card?.identity??`Slot ${v+1}`,faceDown:P.faceDown===!0,slotIndex:v}))}let T=De(c,{cardRegistry:u,selectedSourceCardId:t.selectedSourceCardId??null});if(T.length===0&&!p)return`<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;let I=t.selectedIntentKey??null,$=t.selectedActionId??null,S=t.selectedSourceCardId??null,A=I?T.find(v=>v.id===I):null;if($){let v=c.find(P=>P.actionId===$);if(v)return v.targets?.required&&!(t.selectedTargets?.length>0)?La(e,t,v,T,d,r,o,u):Da(e,t,v,T,d,r,o,u)}return A&&A.selectionType!==C.DIRECT&&A.variants?.length>1?Pa(e,t,A,d,r,o,u):Na(e,t,T,d,r,o,S,u)}function Na(e,t,a,n,s,i,r,o){let p=_e(a),d=Ue(a),c=e.match.phase==="Start"||e.match.phase==="SETUP",u=d&&i?.passInfo?`<div class="rd-response-hint" data-testid="pass-info">${l(i.passInfo)}</div>`:"",h=e.match.priorityOwnerId===e.human.playerId?"You":e.match.priorityOwnerId===e.opponent.playerId?e.opponent.displayName:"",f=h?`<div class="rd-action-priority">\u25CF Priority: ${l(h)}</div>`:"",b="";if(r){let I=o[r]?.identity??"?",S=a.filter(A=>A.selectedCardMatch).map(A=>A.label).join(" \xB7 ");b=`<div class="rd-selected-card-header" data-testid="selected-card-header">
      <span class="rd-selected-card-label">SELECTED</span>
      <span class="rd-selected-card-id">${l(I)}</span>
      ${S?`<span class="rd-selected-card-intents">${l(S)}</span>`:""}
    </div>`}let g="";if(r){let T=a.filter(I=>I.selectedCardMatch);T.length>0?g=`<div class="rd-action-category rd-card-centric" data-testid="action-card-centric">
        <div class="rd-action-category-body">
          ${T.map(I=>tt(I,r,o,!1)).join("")}
        </div>
      </div>`:g=`<div class="rd-action-category rd-card-centric" data-testid="action-card-centric">
        <div class="rd-action-category-body">
          <div class="rd-group-empty">No actions available for this card.</div>
        </div>
      </div>`}else g=p.map(T=>{let I=He(a,T);if(I.length===0)return"";let $=xe(T),S=Me(T),A=T===w.RESPOND,v=I.map(P=>tt(P,r,o,A)).join("");return`<div class="rd-action-category" data-testid="action-category-${l(T)}">
        <div class="rd-action-category-header">
          <span class="rd-action-category-icon" aria-hidden="true">${S}</span>
          <span class="rd-action-category-label">${l($)}</span>
        </div>
        <div class="rd-action-category-body">${v}</div>
      </div>`}).join("");let m="";if(c&&!r){let T=[];if((e.zones?.draw?.count??0)>0){let v=(e.battlefield?.humanHand?.length??0)===0?"2x Draw (empty hand)":"Draw from Pile";T.push({label:v,desc:"Draw card(s) from the top of the Draw Pile.",icon:"\u2193"})}(e.zones?.swap??[]).some(A=>A&&A.card&&!A.faceDown)&&T.push({label:"Face-up Draw",desc:"Take a face-up card from the Swap Bar.",icon:"\u2191"}),T.length>0&&(m=`<div class="rd-action-category rd-preview-category" data-testid="action-category-preview">
      <div class="rd-action-category-header">
        <span class="rd-action-category-icon" aria-hidden="true">\u29C9</span>
        <span class="rd-action-category-label">Upcoming</span>
      </div>
      <div class="rd-action-category-body">${T.map(v=>`<button class="rd-group-btn preview" disabled aria-label="${l(v.label)} (available in Action Phase)" title="Available after entering Action Phase">
    <span class="rd-group-main">
      <span class="rd-group-label">${l(v.label)}</span>
    </span>
    <span class="rd-group-desc">${l(v.desc)}</span>
    <span class="rd-group-meta"><span class="rd-timing-badge preview-badge">Action Phase</span></span>
  </button>`).join("")}</div>
    </div>`)}let y=a.filter(T=>!T.isPass).length;return`<div class="rd-contextual-actions" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">${d?"RESPONSE":"ACTIONS"}</div>
    ${u}
    ${b}
    
    <div class="rd-action-categories">${g}${m}</div>
    <div class="rd-action-footer">${n}</div>
    ${f}
  </div>`}function tt(e,t,a,n){let s=["rd-group-btn"];e.isPass&&s.push("pass"),e.selectedCardMatch&&s.push("card-match"),n&&s.push("response");let i=e.sourceCardIds.length>0,r=i&&t&&e.sourceCardIds.includes(t);i&&t&&!r?s.push("dimmed"):s.push("available");let o=i&&t&&!r?'disabled aria-disabled="true"':"",p="";if(e.variantCount>1){let f=e.selectionType===C.SOURCE?`${e.variantCount} cards`:e.selectionType===C.COMBINATION?`${e.variantCount} configs`:e.selectionType===C.TARGET?`${e.variantCount} targets`:`${e.variantCount} options`;p=`<span class="rd-group-count">${l(f)}</span>`}let d=e.scoreValue!=null?`<span class="rd-group-score">+${l(e.scoreValue)}</span>`:"",c=e.timingClass&&e.timingClass!=="ACTION"&&e.timingClass!=="ORDINARY"?`<span class="rd-timing-badge">${l(e.timingLabel)}</span>`:"",u=e.isFullTurn?'<span class="rd-turn-badge">Full Turn</span>':"",h=e.description?`<span class="rd-group-desc">${l(e.description)}</span>`:"";return`<button class="${s.join(" ")}" data-group-id="${l(e.id)}" data-action-family="${l(e.family)}" aria-label="${l(e.label)}${e.variantCount>1?` \u2014 ${e.variantCount} options`:""}" ${o}>
    <span class="rd-group-main">
      <span class="rd-group-icon" aria-hidden="true">${l(Le(e.family))}</span>
      <span class="rd-group-label">${l(e.label)}</span>
      ${p}${d}
    </span>
    ${h}
    <span class="rd-group-meta">${c}${u}</span>
  </button>`}function Pa(e,t,a,n,s,i,r){let o=a.variants??[],p=a.category===w.RESPOND,d=o.map(c=>{let u=["rd-variant-btn"];t.selectedSourceCardId&&c.sourceHandles.includes(t.selectedSourceCardId)&&u.push("card-match");let h="";if(c.sourceHandles.length>0){let f=c.sourceHandles.map(b=>r[b]?.identity??"?").join(" + ");f!==c.label&&(h=`<span class="rd-variant-detail">${l(f)}</span>`)}return`<button class="${u.join(" ")}" data-variant-action-id="${l(c.actionId)}" aria-label="${l(c.label)}">
      <span class="rd-variant-label">${l(c.label)}</span>
      ${h}
    </button>`}).join("");return`<div class="rd-contextual-actions variant-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-variant" aria-label="Back to actions">\u2190</button>
      <span class="rd-actions-title">${l(a.label)}</span>
    </div>
    <div class="rd-variant-prompt">Choose ${l(Oa(a))}:</div>
    <div class="rd-variant-list" role="group" aria-label="${l(a.label)} variants">${d}</div>
    <div class="rd-action-footer">
      <button class="rd-cancel-btn" data-action="cancel-variant" aria-label="Cancel variant selection">Cancel</button>
    </div>
  </div>`}function Oa(e){switch(e.selectionType){case C.SOURCE:return"a card";case C.COMBINATION:return"a configuration";case C.TARGET:return"a target";case C.VARIANT:return"an effect";default:return"an option"}}function La(e,t,a,n,s,i,r,o){let p=a.targets?.legalTargetIds??[],d=a.family==="swap-bar"&&a.mode==="face-down";if(d){let g=(a.sourceEntityIds??a.sourceHandles??[])[0];if(g&&n){let m=n.find(y=>y.family==="swap-bar"&&y.mode==="face-down");if(m){let y=new Set;for(let E of m.actions)if((E.sourceHandles??E.sourceEntityIds??[])[0]===g)for(let I of E.targetHandles??E.targets?.legalTargetIds??[])y.add(I);y.size>1&&(p=[...y])}}}let c=p.map(g=>{let m=o[g],y=m?.identity??g;return d&&m?.faceDown&&(y=m?.identity??"Face-down"),`<button class="rd-target-btn ${t.selectedTargets?.includes(g)?"selected":""}" data-testid="target-button" data-target-id="${l(g)}" aria-label="Select target ${l(y)}">
      ${l(y)}
    </button>`}).join(""),u=a.displayLabel??a.shortLabel??"Action",h=t.selectedTargets?.length??0,f=t.selectedActionId??a.actionId,b=h===0?'disabled aria-disabled="true"':"";return`<div class="rd-contextual-actions target-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-target" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">${l(u)}</span>
    </div>
    <div class="rd-target-prompt">Select a target <span class="rd-target-count">(${p.length} available)</span></div>
    <div class="rd-target-list" role="group" aria-label="Select a target">${c}</div>
    <div class="rd-action-footer">
      <button class="rd-play-btn" data-testid="confirm-action" data-action-id="${l(f)}" aria-label="Play ${l(u)}" ${b}>Play</button>
      <button class="rd-cancel-btn" data-action="cancel-target" aria-label="Cancel target selection">Cancel</button>
    </div>
  </div>`}function Da(e,t,a,n,s,i,r,o){let p=a.displayLabel??a.shortLabel??"Action",d=a.sourceEntityIds??[],c=a.targets?.legalTargetIds??[],u=d.map(m=>o[m]?.identity??m).join(", "),h=c.map(m=>o[m]?.identity??m).join(", "),f=a.costs?.length>0?a.costs.map(m=>m.label??m.type??"").join(", "):"",b=a.timingClass==="ACTION"&&!a.isResponse,g=_(a.timingClass??"ACTION");return`<div class="rd-contextual-actions confirm-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-confirm" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">Confirm</span>
    </div>
    <div class="rd-confirm-box" data-testid="action-confirm">
      <div class="rd-confirm-action">${l(p)}</div>
      ${u?`<div class="rd-confirm-sources">Source: ${l(u)}</div>`:""}
      ${h?`<div class="rd-confirm-targets">Target: ${l(h)}</div>`:""}
      ${b?'<div class="rd-confirm-turn">Full Turn commitment</div>':""}
      ${g&&g!=="Action"?`<div class="rd-confirm-timing">${l(g)}</div>`:""}
      ${f?`<div class="rd-confirm-costs">Costs: ${l(f)}</div>`:""}
    </div>
    <div class="rd-action-footer">
      <button class="rd-confirm-btn" data-testid="confirm-action" data-action-id="${l(a.actionId)}" aria-label="Confirm: ${l(p)}">Confirm</button>
      <button class="rd-cancel-btn" data-action="cancel-confirm" aria-label="Cancel">Cancel</button>
    </div>
  </div>`}function xa(e){if(!e)return"system";let t=String(e).toUpperCase();return t.includes("DRAW")?"draw":t.includes("SCORE")||t.includes("POINTS")?"score":t.includes("SCUTTLE")||t.includes("SWAP")||t.includes("COUNTER")||t.includes("DISCARD")||t.includes("EXILE")||t.includes("BOUNCE")||t.includes("TAP")||t.includes("PURGE")||t.includes("ROW_CLEAR")||t.includes("SUPER")||t.includes("DECLARATION")||t.includes("DECLARE_PRIMARY")?"action":t.includes("ANCHOR_ENTERED")||t.includes("ATTACHMENT_RESOLVED")||t.includes("RED_JOKER")||t.includes("BOARD_LOCK")||t.includes("RESOLVE")||t.includes("CANCEL")?"effect":t.includes("RESPONSE_WINDOW_CLOSED")||t.includes("PRIORITY_CLOSED")||t.includes("RESPONSE_DECLINED")||t.includes("PRIORITY_PASSED")?"priority":t.includes("ENTER_ACTION")||t.includes("BEGIN_START")||t.includes("PHASE")||t.includes("TURN")||t.includes("PASS")?"phase":t.includes("TERMINAL")||t.includes("GAME_OVER")?"terminal":"system"}var at={draw:"\u{1F0CF}",score:"\u2605",action:"\u21AF",effect:"\u2726",phase:"\u25C6",priority:"\u22EF",terminal:"\u{1F3C1}",system:"\u2022"};function Ma(e){return e==="P1"?"P1":e==="P2"?"P2":"SYS"}function _a(e,t){let a=arguments[2]??null,n=[];if(e&&e.length>0&&(n=Ye(e,a).filter(o=>{let p=o.description??o.text??"",d=o.type??"";return!(d.includes("SNAPSHOT")||d.includes("VOLTAGE")||d.includes("CORE_INIT")||d.includes("CORE_PREPARE")||d.includes("CORE_PREPARED")||d.includes("CORE_SETUP")||d.includes("CORE_APPLY")||d.includes("AUTONOMY_INIT")||d.includes("AUTONOMY_PREPARE")||p===`${d.replace(/_/g," ").toLowerCase()}.`&&(d.includes("CORE_")&&!d.includes("RESOLVED")&&!d.includes("ENTERED")||d.includes("AUTONOMY_")))}).map(o=>({description:o.description??o.text??"",type:o.type??"",actorId:o.actorId??null,category:xa(o.type),isSystem:!1}))),t&&t.length>0){for(let i of t)if(i.type==="CHAT_VISIBILITY"){let r=i.displayName??"Opponent",o=i.hidden?"has hidden Match Chat.":"has restored Match Chat.";n.push({description:`${r} ${o}`,type:"CHAT_VISIBILITY",actorId:null,category:"system",isSystem:!0})}}let s=n.slice(-40).reverse();return s.length===0?`<div class="rd-game-log" data-testid="event-log" role="log">
      <div class="rd-game-log-empty"><span class="rd-log-empty-icon">\u22EF</span>No events yet</div>
    </div>`:`<div class="rd-game-log" data-testid="event-log" role="log">
    ${s.map((i,r)=>{let o=at[i.category]??at.system,p=Ma(i.actorId),d=r===0;return`<div class="${["rd-log-entry",i.isSystem?"rd-log-system":"",d?"rd-log-new":""].filter(Boolean).join(" ")}" data-event-category="${l(i.category)}">
        <span class="rd-log-actor" data-actor="${l(p)}">${l(p)}</span>
        <span class="rd-log-icon">${o}</span>
        <span class="event-description">${l(i.description)}</span>
      </div>`}).join("")}
  </div>`}function Ha(e){if(!e||!e.length)return"";let t=e.slice(0,4),a=e.length>4?e.length-4:0;return`<div class="rd-plate-badges">
    ${t.map(n=>`<span class="rd-badge" title="${l(n.name)}">${l(n.icon||n.id.slice(0,1).toUpperCase())}</span>`).join("")}
    ${a>0?`<span class="rd-badge-overflow">+${a}</span>`:""}
  </div>`}function nt(e,t,a){let n=Ha(e.badges),s=a.mode?.isNetwork===!0,i=t==="human"||e.isLocalPlayer===!0,r=e.rating?`<span class="rd-plate-rating">${e.rating.value}${e.rating.provisional?"?":""}</span>`:e.aiRating!=null?`<span class="rd-plate-rating">AI ${e.aiRating}</span>`:"",o=a.match.activePlayerId===e.playerId,p;i?p="You":p=e.isHuman?"Human":"AI Opponent";let d=e.isHuman&&e.rating?(()=>{let f=H(e.rating.value,{ratedMatches:e.rating.ratedMatches});return f.isPlacement?"":`<span class="rd-prestige-rank" data-testid="profile-rank-label-${t}">${l(U(f.tier,f.division))}</span>`})():e.isHuman&&e.rank?`<span class="rd-prestige-rank" data-testid="profile-rank-label-${t}">${l(e.rank)}</span>`:"",c=`<div class="rd-prestige-banner rd-prestige-banner-${t}" data-testid="profile-banner-${t}" aria-label="${t==="opponent"?"Opponent":"Player"} prestige banner">
    <div class="rd-prestige-banner-bg" aria-hidden="true"></div>
    <div class="rd-prestige-banner-scrim" aria-hidden="true"></div>
    <div class="rd-prestige-banner-content">
      <span class="rd-prestige-banner-name">${l(e.displayName)}</span>
      <span class="rd-prestige-banner-meta">${l(p)} ${r} ${d} ${n}</span>
    </div>
  </div>`,u=t==="opponent"?"":`<div class="rd-profile-identity">
      <div class="rd-profile-avatar ${t} ${o?"active":""}">${l(e.monogram)}</div>
    </div>`,h=t==="opponent"?`${c}`:`${u}${c}`;return`<div class="rd-profile-block ${t} ${o?"active":""}" data-testid="profile-${t}">
    ${h}
  </div>`}function Ua(e,t=null){if(t&&Array.isArray(t)&&t.length>0){let n=t.slice(0,7).map(i=>q(i)).join(""),s=t.length>7?`<span class="rd-opponent-hand-count">+${t.length-7}</span>`:"";return`<div class="rd-opponent-hand rd-opponent-hand-omniscient" aria-label="Opponent hand, ${t.length} cards (face-up)">
      ${n}
      ${s}
    </div>`}let a=Array.from({length:Math.min(e,7)},()=>'<div class="rd-card-back" aria-hidden="true"></div>').join("");return`<div class="rd-opponent-hand" aria-label="Opponent hand, ${e} cards">
    ${a}
    ${e>7?`<span class="rd-opponent-hand-count">+${e-7}</span>`:""}
  </div>`}function Ba(e,t){return!e||!e.length?'<div class="rd-hand hand-empty" aria-label="Your hand is empty"><span class="hand-empty">Your hand is empty.</span></div>':`<div class="rd-hand" aria-label="Your hand, ${e.length} cards">
    ${e.map(a=>q(a,{isHand:!0,selectedSourceCardId:t.selectedSourceCardId,selectedActionId:t.selectedActionId})).join("")}
  </div>`}function st(e){let t=new Set((e.statusMarkers??[]).map(a=>a?.type));return{id:e.entityId??e.id,identity:e.identity,pointValue:e.pointValue,tapped:t.has("TAPPED"),aegis:t.has("AEGIS"),providesGuard:t.has("GUARD"),exileBound:t.has("EXILE_BOUND"),jackHostId:t.has("ATTACHMENT")?!0:void 0,faceDown:!1}}function q(e,t={}){if(!e)return"";let a=["rd-card"];t.isHand&&a.push("hand-card"),e.statusMarkers?.some(o=>o.type==="TAPPED")&&a.push("tapped"),t.selectedSourceCardId&&e.entityId===t.selectedSourceCardId&&a.push("selected"),e.legalSource&&a.push("legal-source","has-legal-actions"),!e.legalSource&&t.isHand&&a.push("no-legal-actions"),e.isSuper&&a.push("super-eligible"),e.statusMarkers?.some(o=>o.type==="LEGAL_TARGET")&&a.push("legal-target");let n=t.isHand&&e.legalSource?'<span class="legal-action-indicator" aria-label="Has legal actions">\u25CF</span>':"",s=t.isHand&&e.isSuper?'<span class="super-eligible-badge" aria-label="Super eligible">\u2605</span>':"",i=t.isHand?`aria-label="Hand card ${l(e.identity||"?")}${e.legalSource?" \u2014 has legal actions":""}"`:"",r=Q(st(e),{showMechanicIcons:t.isHand===!0});return`<div class="${a.join(" ")}" data-card-id="${l(e.entityId)}" data-card-identity="${l(e.identity??"")}" data-testid="board-card" ${i} title="${l(e.identity||"Card")}">
    ${r}
    ${n}${s}
    ${e.isGeneratedCopy?'<div class="rd-card-copy-badge">Copy</div>':""}
  </div>`}function Ga(e,t,a,n){let{swap:s}=e.zones,i=s&&s.length?s:[null,null,null],r=a&&!n?(e.actions||[]).filter(c=>c.family==="swap-bar"&&c.mode==="face-up-draw"):[],o=new Map;for(let c of r){let u=(c.targetHandles??c.targets?.legalTargetIds??[])[0];u&&o.set(u,c)}let p=[null,null,null];for(let c=0;c<3;c++)p[c]=i[c]??null;return`<div class="rd-swap-bar" aria-label="Swap bar">
    <span class="rd-swap-label">SWAP BAR</span>
    <div class="rd-swap-slots">
      ${Array.from({length:3},(c,u)=>{let h=p[u];if(h&&h.card){let f=st(h.card),b=Q(f,{zoneClass:"swap"}),g=h.card.entityId??h.entityId,m=o.get(g),y=m?`<button class="rd-swap-take-btn" data-action="swap-take" data-action-id="${l(m.actionId)}" data-testid="swap-take-btn" aria-label="Take ${l(h.card.identity??"card")} from swap bar">Take</button>`:"";return`<div class="rd-swap-slot has-card" data-swap-index="${u}" aria-label="Swap slot ${u+1}: ${l(h.card.identity??"card")}">
        ${b}
        ${y}
      </div>`}return h&&h.faceDown?`<div class="rd-swap-slot face-down" data-swap-index="${u}" aria-label="Swap slot ${u+1}: face down" aria-hidden="true">
        ${ue("mini")}
      </div>`:`<div class="rd-swap-slot empty" data-swap-index="${u}" aria-hidden="true"></div>`}).join("")}
    </div>
  </div>`}function Ya(e){let t=String(e??"").toLowerCase();return t.includes("super")?"super":t.includes("instant")||t.includes("interrupt")?"instant":t.includes("quick")?"quick":t.includes("scoring")?"scoring":t.includes("anchor")||t.includes("attachment")?"anchor":t.includes("passive")?"passive":t.includes("action")?"action":"effect"}function Fa(e,t){let a=e.identity;if(!a)return`<div class="inspector-essentials-fallback">
      <span class="inspector-essentials-identity">${l(e.identity??"unknown")}</span>
      <span class="inspector-essentials-points">${e.pointValue??0} points</span>
    </div>`;let n=ee(a);if(!n)return"";let s=te(n.suit),i=n.art,r="center 20%";try{i=le(a),r=de(a)}catch{}let o=[];t.tapped&&o.push({icon:"\u21BB",label:"Tapped",cls:"tapped"}),t.aegis&&o.push({icon:"\u2B21",label:"Aegis",cls:"aegis"}),t.providesGuard&&o.push({icon:"\u25D2",label:"Guard",cls:"guard"}),t.exileBound&&o.push({icon:"\u2298",label:"Exile-Bound",cls:"exile-bound"}),t.jackHostId&&o.push({icon:"\u26D3",label:"Attached",cls:"attached"});let p=(n.abilities??[]).map(c=>{let u=Ya(c.timing),h=c.restrictions?.length?`<div class="inspector-essentials-restrictions" aria-label="${c.restrictions.length} restrictions">${c.restrictions.map(()=>"<i></i>").join("")}</div>`:"";return`<article class="inspector-essentials-ability inspector-essentials-timing-${u}" data-ability-id="${l(c.id)}">
      <div class="inspector-essentials-ability-glow"></div>
      <span class="inspector-essentials-ability-icon" aria-hidden="true">${l(c.icon??"\u25C6")}</span>
      <div class="inspector-essentials-ability-body">
        <div class="inspector-essentials-ability-head">
          <h5>${l(c.title)}</h5>
          ${c.timing?`<span class="inspector-essentials-ability-timing">${l(c.timing)}</span>`:""}
        </div>
        <p>${l(c.summary??"")}</p>
      </div>
      ${h}
    </article>`}).join(""),d=[{label:"Points",value:n.prValue??0,cls:"pr"}];return n.erValue!==null&&n.erValue!==void 0&&d.push({label:"ER",value:n.erValue,cls:"er"}),`<div class="inspector-essentials tcg-suit-${s.id}" data-testid="inspector-essentials" style="--card-accent:${s.accent};--card-accent-2:${s.accent2}">
    <div class="inspector-essentials-banner" role="img" aria-label="${l(a)} card art" style="background-image:url('${l(i??"")}');background-position:${l(r)}">
      <div class="inspector-essentials-banner-overlay"></div>
      <div class="inspector-essentials-banner-content">
        <span class="inspector-essentials-rank">${l(n.rank)}${n.suit?`<span class="inspector-essentials-suit" aria-hidden="true">${l(n.suit)}</span>`:""}</span>
      </div>
    </div>
    <div class="inspector-essentials-values-row">
      ${d.map(c=>`<span class="inspector-essentials-value inspector-essentials-value-${c.cls}"><small>${c.label}</small><b>${l(c.value)}</b></span>`).join("")}
    </div>
    ${n.badges?.length?`<div class="inspector-essentials-badges">${n.badges.map(c=>`<span>${l(c)}</span>`).join("")}</div>`:""}
    ${o.length?`<div class="inspector-essentials-state" aria-label="Current card state">${o.map(c=>`<span class="inspector-essentials-state-chip inspector-essentials-state-${c.cls}"><b aria-hidden="true">${l(c.icon)}</b>${l(c.label)}</span>`).join("")}</div>`:""}
    <section class="inspector-essentials-abilities" aria-label="Card abilities">
      ${p||'<p class="inspector-essentials-no-abilities">Detailed rules pending.</p>'}
    </section>
    <p class="inspector-essentials-motto">${l(n.motto??"")}</p>
  </div>`}function Va(e,t,a,n,s="board"){let i=t?.[e];if(!i)return"";let r=i.identity??null,o=ce(a,e),p=o.length>0,d=o.map(b=>{let g=ye(b,t,n);return`<li class="inspector-action" data-action-id="${l(b.optionId)}">
      <span class="inspector-action-label">${l(b.displayLabel)}</span>
      ${g?.timing?`<span class="inspector-action-timing">${l(g.timing)}</span>`:""}
    </li>`}).join(""),c=p?null:be("SOURCE_NOT_AVAILABLE",n),u=ja(i),h=Wa(i),f=Fa(i,ga(i));return`<aside class="card-inspector" data-testid="card-inspector" role="region" aria-label="Card inspector: ${l(r??"unknown")}">
    <div class="inspector-face-toolbar" role="tablist" aria-label="Card inspector view">
      <span class="inspector-face-tab active" role="tab" aria-selected="true">Essentials</span>
      <button class="inspector-face-tab advanced-rules" data-inspector-advanced-rules="${l(r??"")}" data-card-id="${l(e)}" role="button" aria-label="Open advanced card rules" ${r?"":"disabled"}>Advanced Rules</button>
    </div>
    <div class="inspector-face-stage" data-inspector-face-view="essentials">${f}</div>
    ${u}
    <div class="inspector-actions">
      <h4>Legal actions for this card</h4>
      ${p?`<ul class="inspector-action-list">${d}</ul>`:'<p class="inspector-no-actions">No legal actions for this card right now.</p>'}
      ${c?`<div class="inspector-unavailable-detail" data-testid="inspector-unavailable-detail"><p class="inspector-unavailable-reason">${l(c.shortText)}</p>${c.detailedText?`<p class="inspector-unavailable-detail-text">${l(c.detailedText)}</p>`:""}${c.ruleRef?`<p class="inspector-unavailable-rule-ref">${l(c.ruleRef)}</p>`:""}</div>`:""}
    </div>
    ${h}
    <button class="inspector-close" data-testid="inspector-close" aria-label="Close inspector">Close</button>
  </aside>`}function ja(e){if(!e)return"";let t=e.statusMarkers??[];return t.length===0?"":`<div class="inspector-protection-status" data-testid="inspector-protection-status" role="region" aria-label="Protection and targeting status">
    <h4>Status</h4>
    <div class="inspector-protection-chips">${t.map(n=>{let s=n.label??n.type??"Unknown",i={AEGIS:"\u{1F6E1}",GUARD:"\u{1F6E1}",TAPPED:"\u2715",EXILE_BOUND:"\u27C1",ATTACHMENT:"\u{1F517}"}[n.type]??"\u25C6";return`<span class="inspector-protection-chip" data-status-type="${l(n.type)}"><b aria-hidden="true">${i}</b>${l(s)}</span>`}).join("")}</div>
  </div>`}function Wa(e){if(!e)return"";let t=e.definition??e,a=t.rank??null,n=t.suit??null,s=e.identity??null;if(!a)return"";let i=[];return i.push({href:"#/play/academy",label:"Learn in Academy",icon:"\u{1F393}",testId:"inspector-academy-link"}),i.push({href:"#/puzzles",label:"Practice in Puzzles",icon:"\u{1F9E9}",testId:"inspector-puzzle-link"}),a&&n&&i.push({href:`#/ranks?rank=${l(a)}&suit=${l(n)}`,label:"Rank Anatomy",icon:"\u{1F4CA}",testId:"inspector-rank-link"}),`<div class="inspector-learning-links" data-testid="inspector-learning-links" role="region" aria-label="Learning links">
    <h4>Learn this card</h4>
    <div class="inspector-learning-link-list">${i.map(o=>`<a class="inspector-learning-link" href="${l(o.href)}" data-testid="${l(o.testId)}" role="link"><span class="inspector-learning-link-icon" aria-hidden="true">${o.icon}</span><span>${l(o.label)}</span></a>`).join("")}</div>
  </div>`}export{j as a,cn as b,De as c,hn as d,X as e,D as f,Xa as g,mt as h,F as i,tn as j,an as k,ns as l,va as m};
//# sourceMappingURL=chunk-chunk-PVTPCEBP.js.map
