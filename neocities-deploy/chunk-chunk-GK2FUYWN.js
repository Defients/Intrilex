import{a as oe,b as ce,c as le,d as de,e as ue}from"./chunk-chunk-EUUY4EEM.js?v=996c6abdc087";import{a as X,b as fe}from"./chunk-chunk-IAVEWXXF.js?v=996c6abdc087";import{b as M,c as Q,d as _,e as ie,f as re,k as pe,l as he}from"./chunk-chunk-IMA3LJ6W.js?v=996c6abdc087";import{b as ne,d as se}from"./chunk-chunk-HSRWCMXW.js?v=996c6abdc087";import{a as U,c as B}from"./chunk-chunk-SOZ76MXY.js?v=996c6abdc087";import{g as H,h as me}from"./chunk-chunk-4TQT2SU7.js?v=996c6abdc087";var dt=Object.freeze({NOT_PRIORITY_HOLDER:{code:"NOT_PRIORITY_HOLDER",shortText:"You do not currently hold priority.",detailedText:"This action becomes available during your next legal response or proactive window, unless its source leaves your hand first.",ruleRef:"Priority rules \u2014 only the priority holder may declare actions.",visibilitySafe:!0},WRONG_PHASE:{code:"WRONG_PHASE",shortText:"This action is not legal in the current phase.",detailedText:"The current phase does not permit this action type. Wait for the appropriate phase.",ruleRef:"Phase rules \u2014 actions are restricted by phase.",visibilitySafe:!0},WRONG_WINDOW:{code:"WRONG_WINDOW",shortText:"This action is not legal in the current window.",detailedText:"The current window (proactive, response, interrupt, or resolution) does not permit this action type.",ruleRef:"Window rules \u2014 timing classes restrict when actions can be declared.",visibilitySafe:!0},QUICK_ONLY:{code:"QUICK_ONLY",shortText:"Only Quick actions are legal right now.",detailedText:"The current window permits Quick actions only. Other action types must wait for a proactive window.",ruleRef:"Quick timing \u2014 Quick actions can be declared in specific windows.",visibilitySafe:!0},INTERRUPT_ONLY:{code:"INTERRUPT_ONLY",shortText:"Only Interrupt actions are legal right now.",detailedText:"The current window permits Interrupt actions only. Other action types must wait for a proactive window.",ruleRef:"Interrupt timing \u2014 Interrupts can be declared in response windows.",visibilitySafe:!0},RESPONSE_ONLY:{code:"RESPONSE_ONLY",shortText:"Only Response actions are legal right now.",detailedText:"The current window permits Response actions only. You may respond to the pending declaration or decline.",ruleRef:"Response timing \u2014 Response actions react to pending declarations.",visibilitySafe:!0},FULL_TURN_REQUIRED:{code:"FULL_TURN_REQUIRED",shortText:"This action requires a Full Turn commitment.",detailedText:"This action can only be declared during your Full Turn Action Phase, not during a response window.",ruleRef:"Full Turn rules \u2014 some actions require the Action Phase.",visibilitySafe:!0},SOURCE_NOT_AVAILABLE:{code:"SOURCE_NOT_AVAILABLE",shortText:"The source card is not available.",detailedText:"The source card is not in a zone from which it can be played, or it has already been committed this turn.",ruleRef:"Source availability \u2014 cards must be in the correct zone and uncommitted.",visibilitySafe:!0},SOURCE_ALREADY_COMMITTED:{code:"SOURCE_ALREADY_COMMITTED",shortText:"This card has already been used this turn.",detailedText:"The source card has already been committed to another action this turn and cannot be reused.",ruleRef:"Commitment rules \u2014 a card can only be used once per turn.",visibilitySafe:!0},INSUFFICIENT_COMPONENTS:{code:"INSUFFICIENT_COMPONENTS",shortText:"Not enough components to declare this action.",detailedText:"This action requires multiple component cards (e.g., a Super requires two same-rank cards). You do not have enough eligible components.",ruleRef:"Component rules \u2014 multi-card actions require sufficient eligible sources.",visibilitySafe:!0},SUPER_REQUIREMENT_NOT_MET:{code:"SUPER_REQUIREMENT_NOT_MET",shortText:"Super requirements not met.",detailedText:"A Super declaration requires two cards of the same rank. You do not have two eligible same-rank cards in the required zone.",ruleRef:"Super rules \u2014 two same-rank cards are required for a Super declaration.",visibilitySafe:!0},NO_LEGAL_TARGET:{code:"NO_LEGAL_TARGET",shortText:"No legal target available.",detailedText:"This action requires a target, but no legal target exists in the current game state.",ruleRef:"Targeting rules \u2014 actions with targets require at least one legal target.",visibilitySafe:!0},TARGET_PROTECTED:{code:"TARGET_PROTECTED",shortText:"The target is protected.",detailedText:"The selected target has an Aegis or other protection effect that prevents this action from affecting it.",ruleRef:"Protection rules \u2014 Aegis and similar effects prevent targeting.",visibilitySafe:!0},TARGET_IMMUNE:{code:"TARGET_IMMUNE",shortText:"The target is immune.",detailedText:"The selected target is immune to this type of effect.",ruleRef:"Immunity rules \u2014 some effects grant immunity to specific action types.",visibilitySafe:!0},ACTION_ALREADY_USED:{code:"ACTION_ALREADY_USED",shortText:"This action has already been used.",detailedText:"This specific action has already been declared and cannot be repeated.",ruleRef:"Action frequency \u2014 some actions can only be declared once.",visibilitySafe:!0},SCORE_REQUIREMENT_NOT_MET:{code:"SCORE_REQUIREMENT_NOT_MET",shortText:"Scoring requirements not met.",detailedText:"This scoring action requires specific conditions (e.g., sufficient points, correct phase) that are not currently satisfied.",ruleRef:"Scoring rules \u2014 scoring actions have specific requirements.",visibilitySafe:!0},PROFILE_DISABLED:{code:"PROFILE_DISABLED",shortText:"This action is not available in the current rules profile.",detailedText:"The current rules profile does not permit this action type.",ruleRef:"Profile rules \u2014 each profile enables or disables specific mechanics.",visibilitySafe:!0},HIDDEN_INFORMATION_REQUIRED:{code:"HIDDEN_INFORMATION_REQUIRED",shortText:"This action requires information you do not have.",detailedText:"This action requires knowledge of hidden cards or state that is not available to you.",ruleRef:"Visibility rules \u2014 some actions require authorized visibility.",visibilitySafe:!0},GAME_ALREADY_TERMINAL:{code:"GAME_ALREADY_TERMINAL",shortText:"The match has already ended.",detailedText:"No further actions can be declared because the match has reached a terminal state.",ruleRef:"Terminal rules \u2014 no actions are legal after the match ends.",visibilitySafe:!0},NOT_HUMAN_DECISION:{code:"NOT_HUMAN_DECISION",shortText:"No human decision is pending.",detailedText:"The engine is not currently waiting for your input. The game may have advanced or the opponent may be deciding.",ruleRef:"Session state \u2014 actions can only be submitted when a human decision is pending.",visibilitySafe:!0},SESSION_MISMATCH:{code:"SESSION_MISMATCH",shortText:"Session mismatch.",detailedText:"The action was submitted for a different session. This may happen if you have multiple tabs open.",ruleRef:"Session integrity \u2014 actions must match the active session.",visibilitySafe:!0},STALE_REVISION:{code:"STALE_REVISION",shortText:"The game state has changed.",detailedText:"The action was submitted for an older state. The current frame has been re-rendered with updated legal actions.",ruleRef:"State revision \u2014 actions must match the current state revision.",visibilitySafe:!0},STALE_FRAME:{code:"STALE_FRAME",shortText:"The decision frame has changed.",detailedText:"The legal actions have changed since this action was selected. Please review the current options.",ruleRef:"Frame integrity \u2014 actions must match the current decision frame.",visibilitySafe:!0},UNKNOWN_ACTION:{code:"UNKNOWN_ACTION",shortText:"Unknown action.",detailedText:"The selected action is not in the current set of legal actions. It may have been removed by a state change.",ruleRef:"Action validity \u2014 only current legal actions can be submitted.",visibilitySafe:!0},ENGINE_REJECTION:{code:"ENGINE_REJECTION",shortText:"The engine rejected this action.",detailedText:"The engine determined this action is not legal in the current state. This should not happen during normal play \u2014 it indicates a state desynchronization.",ruleRef:"Engine authority \u2014 the engine has final say on legality.",visibilitySafe:!0},INVALID_SAVE_FORMAT:{code:"INVALID_SAVE_FORMAT",shortText:"Invalid save format.",detailedText:"The save file is not a valid Intrilex player save. It may be corrupted or from an incompatible version.",ruleRef:"Save format \u2014 saves must match the expected format.",visibilitySafe:!0},INCOMPATIBLE_ENGINE_VERSION:{code:"INCOMPATIBLE_ENGINE_VERSION",shortText:"Incompatible engine version.",detailedText:"The save was created with a different engine version. The match cannot be resumed.",ruleRef:"Version compatibility \u2014 saves require matching engine versions.",visibilitySafe:!0},INCOMPATIBLE_RULES_VERSION:{code:"INCOMPATIBLE_RULES_VERSION",shortText:"Incompatible rules version.",detailedText:"The save was created with different rules. The match cannot be resumed.",ruleRef:"Version compatibility \u2014 saves require matching rules versions.",visibilitySafe:!0},SAVE_HASH_MISMATCH:{code:"SAVE_HASH_MISMATCH",shortText:"Save integrity check failed.",detailedText:"The save file's integrity hash does not match. The save may be corrupted or tampered with.",ruleRef:"Save integrity \u2014 hashes must match for resume.",visibilitySafe:!0},DUPLICATE_TAB:{code:"DUPLICATE_TAB",shortText:"This match is active in another tab.",detailedText:"Another browser tab is currently controlling this match. You can open read-only, take control, or cancel.",ruleRef:"Session lease \u2014 only one tab can control a match at a time.",visibilitySafe:!0},UNSUPPORTED_CONFIGURATION:{code:"UNSUPPORTED_CONFIGURATION",shortText:"Unsupported configuration.",detailedText:"The current game configuration is not supported by the engine.",ruleRef:"Configuration \u2014 only supported configurations can be played.",visibilitySafe:!0},ORCHESTRATION_LIMIT:{code:"ORCHESTRATION_LIMIT",shortText:"Orchestration limit exceeded.",detailedText:"The engine exceeded its maximum orchestration steps. This indicates a rules loop or engine issue.",ruleRef:"Engine safety \u2014 orchestration has a maximum step count.",visibilitySafe:!0},ADVANCE_EXCEPTION:{code:"ADVANCE_EXCEPTION",shortText:"Engine error during advance.",detailedText:"The engine encountered an error while advancing the game state.",ruleRef:"Engine safety \u2014 exceptions are caught and reported.",visibilitySafe:!0},AI_POLICY_EXCEPTION:{code:"AI_POLICY_EXCEPTION",shortText:"AI policy error.",detailedText:"The AI policy encountered an error while selecting an action.",ruleRef:"AI safety \u2014 policy exceptions are caught and reported.",visibilitySafe:!0},AI_NO_SELECTION:{code:"AI_NO_SELECTION",shortText:"AI made no selection.",detailedText:"The AI policy returned no action selection. This indicates a policy issue.",ruleRef:"AI safety \u2014 policies must return a selection.",visibilitySafe:!0},UNKNOWN_STATUS:{code:"UNKNOWN_STATUS",shortText:"Unknown engine status.",detailedText:"The engine returned an unrecognized status. This indicates an engine issue.",ruleRef:"Engine safety \u2014 unknown statuses are treated as errors.",visibilitySafe:!0}});function J(e){let t=dt[e];return t||{code:e??"UNKNOWN",shortText:"Unknown reason.",detailedText:"An unknown error occurred.",ruleRef:"",visibilitySafe:!0}}function ge(e){return J(e).shortText}function ye(e){return J(e).detailedText}function be(e){return J(e).ruleRef}var x=Object.freeze({OFF:"OFF",ESSENTIAL:"ESSENTIAL",GUIDED:"GUIDED",DETAILED:"DETAILED"});function ve(e,t,a=x.GUIDED){if(a===x.OFF)return{title:"",body:"",passInfo:""};if(!e)return{title:"",body:"",passInfo:""};let{isHumanPriority:n,windowType:s,stackDepth:i,canPass:r,nextOnPass:c}=e;if(!n)return{title:"Opponent is deciding",body:i>0?"A declaration is on the stack. The opponent may respond.":"The opponent is choosing their next move.",passInfo:""};let p=ut(s),o=t?.length??0,l=`Your Priority \u2014 ${p}`,d="";if(o===0)d="You have no legal actions. The engine will force an Exhausted Pass.";else if(o===1)d=`You have 1 legal action: ${t[0].displayLabel}.`;else{let f=pt(t);d=`You have ${o} legal actions:
${f}`}let h="";return r&&c&&(h=c),{title:l,body:d,passInfo:h}}function Ie(e,t,a=x.GUIDED){if(a===x.OFF)return null;let n=e.form??oe(e),s=le(e),i=ce(e,t),r=e.costs??[],c=e.targets??{},p=e.preview??{};return{label:e.displayLabel??"Unknown action",timing:ht(e.timingClass,n),costs:r.map(l=>l.description),targets:ft(c,t),preview:mt(p,n,s),ruleRef:gt(n,s,i)}}function $e(e,t=x.GUIDED){if(t===x.OFF)return{shortText:"",detailedText:"",ruleRef:""};let a=ge(e);return t===x.ESSENTIAL?{shortText:a,detailedText:"",ruleRef:""}:{shortText:a,detailedText:ye(e),ruleRef:be(e)}}function ut(e){return{proactive:"Proactive Window",response:"Response Window",interrupt:"Interrupt Window",resolution:"Resolution",transition:"Phase Transition"}[e]??"Unknown Window"}function pt(e){let t={};for(let a of e){let n=a.form??"other";t[n]=(t[n]??0)+1}return Object.entries(t).map(([a,n])=>`\u2022 ${n} ${a} action${n>1?"s":""}`).join(`
`)}function ht(e,t){let n={ACTION:"Action (Full Turn commitment)",QUICK:"Quick",INSTANT:"Instant",INTERRUPT:"Interrupt",SETUP:"Setup"}[e]??e??"";return t==="super"?`${n} \u2014 Super declaration`:n}function ft(e,t){if(!e.required)return"No target required.";let a=e.legalTargetIds??[];if(a.length===0)return"Target required but none available.";let n=a.map(s=>t?.[s]?.identity??s);return`Target${a.length>1?"s":""}: ${n.join(", ")}`}function mt(e,t,a){let n=[];return e.opensResponseWindow&&n.push("Opens a response window."),e.isFullTurnCommitment&&n.push("Uses your Action Phase for this Full Turn."),e.resolutionUncertain&&n.push("Resolution is not guaranteed."),a&&(n.push("Super declaration \u2014 consumes multiple components."),e.superEffectId&&n.push(`Effect: ${e.superEffectId}.`)),n.length>0?n.join(" "):"No preview available."}function gt(e,t,a){return t?"Super rules \u2014 two same-rank cards required for declaration.":a?"Spades rules \u2014 Spades cards have mechanically distinct play forms.":e==="score"?"Scoring rules \u2014 cards played to Point Row for points.":e==="response"?"Response rules \u2014 reactive actions in response windows.":e==="pass"?"Pass rules \u2014 Exhausted Pass or Response Decline.":""}var Z=Object.freeze({rusher:{description:"Aggressive tempo player that scores early and often, sacrificing defense for speed.",playStyle:"Aggressive tempo \u2014 scores early, sacrifices defense",traits:["aggressive","fast","risk-taking"]},defender:{description:"Reactive strategist that counters opponent plays and builds late-game advantage.",playStyle:"Reactive \u2014 counters opponent plays, builds late-game advantage",traits:["reactive","patient","counter-focused"]},trickster:{description:"Misdirection specialist that manipulates the swap bar and leverages effect-heavy plays.",playStyle:"Misdirection \u2014 swap bar manipulation, effect-heavy",traits:["cunning","unpredictable","effect-focused"]},sniper:{description:"Precision remover that targets key cards and maximizes resource efficiency.",playStyle:"Precision \u2014 targets key cards, resource-efficient",traits:["precise","efficient","targeting"]},support:{description:"Utility-focused controller that manipulates the stack and protects own cards.",playStyle:"Utility \u2014 stack manipulation, protects own cards",traits:["supportive","protective","stack-focused"]},tank:{description:"Endurance grinder that relies on high-defense plays and grinds out value over long games.",playStyle:"Endurance \u2014 high-defense, grinds out value over long games",traits:["defensive","endurance","grinding"]},baseline:{description:"Balanced generalist that adapts to the game state without a strong preference.",playStyle:"Balanced \u2014 adapts to game state",traits:["balanced","adaptive"]}});function Te(e){return Z[e]??Z.baseline}function dn(e){if(!e)return"AI";if(!e.startsWith("hybrix-"))return e.split("-").map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(" ");let t=e.replace("hybrix-","").replace(/-(hard|easy|nightmare|normal)$/,""),n=Z[t]&&t!=="baseline"?t:"Baseline";return`Hybrix ${n.charAt(0).toUpperCase()+n.slice(1)}`}function un(e){return!e||!e.startsWith("hybrix-")?"":e.endsWith("-easy")?"EASY":e.endsWith("-hard")?"HARD":e.endsWith("-nightmare")?"NIGHTMARE":e.endsWith("-normal")?"NORMAL":""}var Y={rusher:{score:["Speed is everything!","Too slow to stop me.","Points on the board!","Catch me if you can!","First strike advantage!","No time to react!"],counter:["Ha, nice try!","Not fast enough.","I saw that coming.","Too slow!","Predictable trajectory."],super:["Full throttle!","No holding back!","Overwhelming force!","Maximum velocity!","No brakes!"],win:["Speed wins every time!","Was there ever any doubt?","GG \u2014 too fast for you.","Victory at maximum speed!","You couldn't keep up."],loss:["Impossible... I was faster!","Next time I'll be even quicker.","You got lucky \u2014 speed doesn't lie.","I underestimated your tempo."],"early-game":["Let's set the pace early.","First blood matters.","I'm coming out swinging!"],"mid-game":["The pressure is building.","Can you feel the tempo shifting?","Full acceleration mode."],"late-game":["Final push!","No time left to recover!","Sprinting to the finish!"],"close-game":["Every point counts now!","Don't blink!","This is where speed decides everything."],dominating:["The gap is widening!","You can't close this distance!","Speed gap is insurmountable!"],comeback:["I let you get ahead \u2014 mistake corrected!","Thought you had me? Think again!","The rush isn't over yet!"]},defender:{score:["Patiently building.","Every point is fortified.","Slow and steady.","A foundation of stone.","Methodical progress."],counter:["Not so fast.","I expected that.","Predictable.","Blocked and logged.","Your aggression is noted."],super:["The walls rise up!","Fortress activated.","Defense becomes offense.","The bastion strikes!","Impenetrable!"],win:["Patience always wins.","Your aggression was your undoing.","GG \u2014 well defended.","The fortress held.","Time was always on my side."],loss:["My defenses crumbled...","I'll rebuild stronger next time.","Even walls can fall.","I misjudged the siege."],"early-game":["Let them come. I'll be ready.","Building the foundation.","Patience is a weapon."],"mid-game":["The walls are thickening.","They're wearing themselves down.","Steady as she goes."],"late-game":["The endgame favors the prepared.","My fortress endures.","Time to close the gates."],"close-game":["One mistake and it's over for either of us.","The fortress is tested.","Nerve is everything now."],dominating:["The gap is insurmountable.","They cannot breach these walls.","This position is fortified."],comeback:["You thought you'd broken through?","The walls rebuild!","Defense becomes offense \u2014 now!"]},trickster:{score:["Did you see that coming?","Misdirection scores again!","While you were looking elsewhere...","Smoke and mirrors!","The hand is quicker than the eye."],counter:["Tricked you!","Wrong move!","Just as I planned.","You fell for it!","Classic misdirection."],super:"Now you see it, now you don't!",win:["The trick was on you all along!","Misdirection wins!","GG \u2014 outsmarted.","You never saw it coming.","The illusion was perfect."],loss:["You saw through my tricks...","Clever. Very clever.","The mirror cracked.","Even illusions fail eventually."],"early-game":["Setting the stage...","Pay attention to the wrong hand.","The game begins."],"mid-game":["Which move is real?","You're second-guessing now, aren't you?","The web is spinning."],"late-game":["The final trick awaits.","You think you know what's coming?","One last illusion."],"close-game":["One wrong read decides it all.","Can you spot the real threat?","The sleight is ready."],dominating:["You're chasing shadows!","Every move is a mirage!","You can't trust what you see."],comeback:["The trick was just a setup!","You let your guard down!","The real illusion was the comeback!"]},sniper:{score:["Precision strike!","Right on target.","Calculated and executed.","Surgical.","Bullseye."],counter:["Eliminated.","Target neutralized.","Clean removal.","Threat assessed and removed.","Efficient."],super:["One shot, one kill.","Perfect precision!","Bullseye!","Lethal accuracy!"],win:["Precision beats brute force.","Every shot counted.","GG \u2014 clean victory.","Calculated victory.","No wasted moves."],loss:["My aim was off...","I'll recalibrate next time.","You dodged the critical shot.","Miscalculated."],"early-game":["Assessing the field.","Identifying priority targets.","Patience before the shot."],"mid-game":["The target is in sight.","Range calculated.","Steady aim."],"late-game":["The final shot is loaded.","One clean hit wins this.","No room for error."],"close-game":["One shot decides it all.","The target is clear.","Hold steady."],dominating:["The range is mine.","Every target eliminated.","You can't hide from precision."],comeback:["I was just adjusting my scope.","The real target was the comeback!","You walked right into the crosshairs!"]},support:{score:["Teamwork makes the dream work.","Supported into position.","Steady progress.","Every piece contributes.","Coordinated advance."],counter:["Protected!","Shielded from harm.","Not on my watch.","Defense in depth.","Covered."],super:["Full support deployed!","The stack is mine!","Reinforcements!","Maximum utility!"],win:["Utility wins the day!","Every piece in its place.","GG \u2014 well supported.","The foundation held.","Coordinated victory."],loss:["My support wasn't enough...","I'll adapt my strategy.","The formation broke.","I needed more coverage."],"early-game":["Setting up the network.","Establishing support lines.","Building the infrastructure."],"mid-game":["The network is strong.","Every connection matters.","Coordinated pressure."],"late-game":["Full deployment.","The support network is complete.","Every resource allocated."],"close-game":["One slip in support decides it.","The formation is tested.","Hold the line."],dominating:["The network is unbreakable.","Full coverage achieved.","You can't penetrate the support grid."],comeback:["The support was just repositioning!","Reinforcements arrived!","The network adapts and recovers!"]},tank:{score:["Grinding forward.","One step at a time.","Unstoppable progress.","Slow but inevitable.","Each point is earned."],counter:["I absorb and endure.","You can't break through.","Armor holds.","Minimal damage.","Shrug it off."],super:["Unbreakable!","The fortress strikes!","Endurance pays off!","Maximum armor!"],win:["Endurance always wins.","You ran out of steam.","GG \u2014 outlasted.","The grind paid off.","Persistence is power."],loss:["Even the tank falls...","I'll reinforce my defenses.","The armor cracked.","I needed more endurance."],"early-game":["Let them waste resources.","I'm just getting started.","The armor is thickening."],"mid-game":["The grind is working.","They're running low.","Steady pressure."],"late-game":["Endurance decides this.","I can outlast anyone.","The final grind."],"close-game":["One breach and it's over.","The armor is holding \u2014 barely.","Nerve and endurance."],dominating:["The gap is too wide to close.","I've outlasted everything.","Endurance is victory."],comeback:["You thought I was worn down?","The tank has reserves!","Armor repaired \u2014 advancing again!"]},baseline:{score:["Good play.","Points secured.","Solid move.","Steady.","Effective."],counter:["Nice counter.","Good response.","Well played.","Noted.","Solid defense."],super:["Big move!","Going all in!","Time to shine!","Major play!"],win:["GG!","Well played.","Good game.","Solid match.","Clean win."],loss:["GG!","Well played.","Better luck next time.","Good match.","I'll learn from this."],"early-game":["Let's see how this develops.","Standard opening.","Feeling out the board."],"mid-game":"The game is taking shape.","late-game":"Time to close this out.","close-game":"Every decision matters now.",dominating:"The advantage is clear.",comeback:"The game isn't over yet!"}};function pn(e,t,a,n={}){if(!e||!e.type)return null;let s=Y[t]??Y.baseline,i=null,r=e.type.toLowerCase();if(r.includes("score")||r.includes("point")?i="score":r.includes("counter")||r.includes("disrupt")||r.includes("interrupt")?i="counter":(r.includes("super")||r.includes("ultra"))&&(i="super"),!i)return null;let c=n.gamePhase,p=n.scoreDiff??0;if((n.isComeback??!1)&&s.comeback){let h=Array.isArray(s.comeback)?s.comeback:[s.comeback];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(p>=10&&s.dominating){let h=Array.isArray(s.dominating)?s.dominating:[s.dominating];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(Math.abs(p)<=3&&p!==0&&s["close-game"]){let h=Array.isArray(s["close-game"])?s["close-game"]:[s["close-game"]];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}if(c&&s[c]){let h=Array.isArray(s[c])?s[c]:[s[c]];if(h.length>0)return h[Math.floor(Math.random()*h.length)]}let l=s[i];if(!l)return null;let d=Array.isArray(l)?l:[l];return d[Math.floor(Math.random()*d.length)]}function we(e,t){let a=Y[e]??Y.baseline,n=t?"win":"loss",s=a[n]??Y.baseline[n],i=Array.isArray(s)?s:[s];return i[Math.floor(Math.random()*i.length)]}var R=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),Ee=Object.freeze({"first-contact-trigger-closure":{label:"First Contact",icon:"\u{1F4D6}",short:"Learn the basics",full:"A simplified rule set that teaches core mechanics: draw cards, play for points, and reach the goal score. No advanced effects, no royal cards, no counters. Perfect for your first match.",systems:"Draw \xB7 Score \xB7 Goal",recommendedFor:"New players"},"core-advanced-authority":{label:"Advanced Core",icon:"\u2694",short:"Full standard rules",full:"The complete Intrilex rule set at the standard competitive level. Includes all card effects, royal cards (Jack, Queen, King, Ace), counters, the Swap Bar, and the priority-pass system. Some advanced systems (hidden-choice supers, generated-effect copy, sudden death) are replay-only in this profile.",systems:"All standard systems \xB7 4 advanced systems replay-only",recommendedFor:"Players who know the basics"},"core-unrestricted-authority":{label:"Unrestricted",icon:"\u{1F525}",short:"All systems active",full:"The full rule set with every system autonomously playable, including hidden-choice supers, generated-effect copy, and sudden death. The most complex and complete Intrilex experience. Use this when you want no limits.",systems:"All systems fully playable",recommendedFor:"Experienced players"}}),yt=Object.freeze({easy:"Forgiving opponent that makes simple decisions and rarely counters. Good for learning card interactions.",normal:"Balanced opponent that plays competently and responds to your moves. A fair test of your strategy.",hard:"Skilled opponent that optimizes plays, counters aggressively, and punishes mistakes. Expect a real challenge.",nightmare:"Ruthless opponent that plays near-optimally. Every decision matters. For experienced players only."});function bt(e){if(!e)return"";let t=Ee[e.profileId]?.label??e.profileId??"Unknown",a=e.turnNumber!=null?`Turn ${e.turnNumber}`:"In progress";return`<div class="setup-resume-prompt" data-testid="setup-resume-prompt">
    <div class="setup-resume-info">
      <span class="setup-resume-icon" aria-hidden="true">\u25B6</span>
      <div class="setup-resume-body">
        <strong>Resume match</strong>
        <small>${R(t)} \xB7 ${R(a)}${e.seed!=null?` \xB7 Seed ${R(e.seed)}`:""}</small>
      </div>
    </div>
    <button type="button" class="setup-resume-button" data-testid="resume-match" data-save-id="${R(e.saveId??"")}">Continue</button>
  </div>`}function vt(e){return e?`<div class="setup-compat-warning" data-testid="setup-compat-warning" role="alert">
    <span class="setup-compat-icon" aria-hidden="true">\u26A0</span>
    <div class="setup-compat-body">
      <strong>Compatibility notice</strong>
      <small>${R(e.message)}</small>
    </div>
  </div>`:""}function It(e,t={}){let{saveInfo:a=null,compatInfo:n=null}=t,s=Object.entries(Ee).map(([d,h])=>({id:d,...h})),i=[{id:"P1",label:"First",icon:"\u2460"},{id:"P2",label:"Second",icon:"\u2461"},{id:"random",label:"Random",icon:"\u{1F3B2}"}],r=new Map;for(let d of e){let h=d.traits?.difficulty??"normal";r.has(h)||r.set(h,[]),r.get(h).push(d)}let c=["easy","normal","hard","nightmare"],p={easy:"Easy",normal:"Normal",hard:"Hard",nightmare:"Nightmare"},o=bt(a),l=vt(n);return`<div class="play-setup" data-testid="play-setup">
    <a class="play-setup-back" href="#/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</a>
    <h1>New Match</h1>
    <a class="academy-entry-link" href="#/play/academy" data-testid="academy-entry-link">
      <span class="academy-entry-icon" aria-hidden="true">\u{1F393}</span>
      <span class="academy-entry-body"><strong>Academy</strong><small>New to Intrilex? Start with guided lessons.</small></span>
      <span class="academy-entry-arrow" aria-hidden="true">\u2192</span>
    </a>
    <a class="academy-entry-link" href="#/puzzles" data-testid="puzzles-entry-link">
      <span class="academy-entry-icon" aria-hidden="true">\u{1F9E9}</span>
      <span class="academy-entry-body"><strong>Puzzles</strong><small>Tactical challenges &middot; progressive ladder</small></span>
      <span class="academy-entry-arrow" aria-hidden="true">\u2192</span>
    </a>
    <a class="academy-entry-link" href="#/play/guided" data-testid="guided-entry-link">
      <span class="academy-entry-icon" aria-hidden="true">\u{1F3AD}</span>
      <span class="academy-entry-body"><strong>Guided Exhibition</strong><small>Watch a scripted match with expert commentary &middot; ~10 min</small></span>
      <span class="academy-entry-arrow" aria-hidden="true">\u2192</span>
    </a>
    ${o}
    ${l}
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset class="setup-section">
        <legend>Rule profile</legend>
        <div class="setup-card-grid">
          ${s.map(d=>`<label class="setup-card" data-testid="profile-card-${R(d.id)}">
            <input type="radio" name="profile" value="${R(d.id)}" ${d.id==="core-advanced-authority"?"checked":""}>
            <span class="setup-card-icon" aria-hidden="true">${d.icon}</span>
            <span class="setup-card-body">
              <strong>${R(d.label)}</strong>
              <small>${R(d.short)}</small>
            </span>
          </label>`).join("")}
        </div>
        <div class="setup-profile-explainer" data-testid="profile-explainer" role="region" aria-label="Rule profile explanation">
          ${s.map(d=>`<div class="profile-explanation" data-profile="${R(d.id)}" ${d.id==="core-advanced-authority"?"":"hidden"}>
            <p class="profile-explanation-full">${R(d.full)}</p>
            <div class="profile-explanation-meta">
              <span class="profile-explanation-systems" aria-label="Active systems">${R(d.systems)}</span>
              <span class="profile-explanation-audience" aria-label="Recommended for">${R(d.recommendedFor)}</span>
            </div>
          </div>`).join("")}
        </div>
      </fieldset>
      <fieldset class="setup-section">
        <legend>Your seat</legend>
        <div class="setup-seat-row">
          ${i.map(d=>`<label class="setup-seat-option">
            <input type="radio" name="seat" value="${R(d.id)}" ${d.id==="P1"?"checked":""}>
            <span class="setup-seat-icon" aria-hidden="true">${d.icon}</span>
            <span>${R(d.label)}</span>
          </label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="setup-section">
        <legend>AI opponent</legend>
        ${(()=>{let d=!1;return c.map(h=>{let f=r.get(h)??[];if(f.length===0)return"";let m=yt[h]??"";return`<div class="difficulty-group" data-difficulty="${R(h)}">
            <div class="difficulty-header">
              <span class="difficulty-pill">${R(p[h]??h)}</span>
              <span class="difficulty-description">${R(m)}</span>
            </div>
            <div class="ai-personality-grid">
              ${f.map(y=>{let g=y.traits?.archetype??"",b=Te(g),v=d?"":" checked";return d=!0,`<label class="ai-personality-card" title="${R(b.playStyle)}">
                  <input type="radio" name="ai-policy" value="${R(y.policyId)}"${v}>
                  <span class="ai-personality-name">${R(g||y.policyId)}</span>
                  <span class="ai-personality-desc">${R(b.description)}</span>
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
  </div>`}var F=Object.freeze(["light","dark","cosmotech","corrupture"]),ee=Object.freeze({light:"Light",dark:"Dark",cosmotech:"CosmoTech\u2122",corrupture:"Corrupture\u2122"}),W=Object.freeze({light:"\u2600",dark:"\u263E",cosmotech:"\u2726",corrupture:"\u25C8"}),Ae="dark",Re="intrilex:gameplaySkin",ke=new Set(F);function Se(e){return typeof e=="string"&&ke.has(e)?e:Ae}function gn(){try{let e=globalThis.localStorage?.getItem(Re);return Se(e)}catch{return Ae}}function yn(e){let t=Se(e);if(!ke.has(e))return!1;try{return globalThis.localStorage?.setItem(Re,t),!0}catch{return!1}}var Oe="1.1.0";function Le(e,t=null,a=null){if(!e||!e.state)return Ce("MISSING_SNAPSHOT","No authorized snapshot available");let n=e.state,s=Tt(n);if(!s.valid)return Ce("PRIVACY_VIOLATION",s.reason);let i=e.humanPlayerId??n.seatOrder?.[0]??"P1",r=n.seatOrder?.find(v=>v!==i)??"P2",c=n.seatOrder?.indexOf(i)??0,p=c===0?1:0,o=Pe(n,i,c,!0,t),l=Pe(n,r,p,!1,null),d=Et(n,i),h=Ot(e),f=new Set;for(let v of h)for(let I of v.sourceEntityIds??[])f.add(I);let m=kt(n,i,r,c,f),y=Pt(n),g=Lt(e),b=a??{kind:"LOCAL_AI",label:"LOCAL \xB7 VS AI",networkRanked:!1};return{schemaVersion:Oe,sessionId:e.sessionId??null,status:Mt(n,e),mode:b,match:{fullTurnSequence:n.fullTurnSequence??0,phase:n.phase??"SETUP",activePlayerId:n.activePlayerId??null,priorityOwnerId:n.priorityOwnerId??null,windowLabel:n.windowLabel??"",goalMayBeDynamic:!0,globalStates:Dt(n),terminationReason:n.terminationReason??null,winner:n.winner??null},human:o,opponent:l,zones:d,battlefield:m,stack:y,actions:h,chat:g,privacy:{opponentHandIdentifiersPresent:!1,rawCommandsPresent:!1}}}function Ce(e,t,a=null){return{schemaVersion:Oe,sessionId:null,status:"ERROR",mode:a??{kind:"LOCAL_AI",label:"LOCAL \xB7 VS AI",networkRanked:!1},match:{fullTurnSequence:0,phase:"ERROR",activePlayerId:null,priorityOwnerId:null,windowLabel:"",goalMayBeDynamic:!0,terminationReason:null,winner:null},human:Ne(),opponent:Ne(),zones:At(),battlefield:St(),stack:[],actions:[],chat:[],privacy:{opponentHandIdentifiersPresent:!1,rawCommandsPresent:!1},error:{code:e,reason:t}}}function Tt(e){let t=e.seatOrder?.[1]??"P2",a=e.players?.[t]?.hand??[];if(Array.isArray(a)){for(let n of a)if(n&&(n.identity||n.rank||n.suit))return{valid:!1,reason:`Opponent hand exposes card identity: ${n.identity??n.rank??"unknown"}`}}return e._rawCommands||e._commandVault?{valid:!1,reason:"Raw commands present in snapshot"}:{valid:!0,reason:null}}function Pe(e,t,a,n,s){let i=e.players?.[t]??{},r=i.securedPoints??0,c=i.goal??e.startingGoal??21,p=!n&&i.isHuman===!0,o=n?s?.displayName??"You":i.displayName??(p?"Opponent":"AI"),l=p?i.rating??null:null,d=p?i.rank??null:null;return{playerId:t,seatIndex:a,displayName:o,isHuman:n||p,isLocalPlayer:n,monogram:n?"H":p?"P":"A",secured:r,goal:c,goalLabel:r>=c?"REACHED":`${r}/${c}`,rating:n?s?.rating??null:l,rank:n?s?.rank??null:d,aiRating:!n&&!p?i.aiRating??null:null,difficulty:!n&&!p?i.difficulty??"":"",badges:n?s?.badges??[]:[],connectionState:i.connectionState??null,statusIndicators:wt(i)}}function Ne(){return{playerId:"",seatIndex:0,displayName:"",isHuman:!0,isLocalPlayer:!0,monogram:"?",secured:0,goal:21,goalLabel:"0/21",rating:null,rank:null,aiRating:null,difficulty:"",badges:[],connectionState:null,statusIndicators:[]}}function wt(e){let t=[];return e.isActive&&t.push({type:"ACTIVE",label:"Active"}),e.hasPriority&&t.push({type:"PRIORITY",label:"Priority"}),t}function Et(e,t){let a=e.drawPile??[],n=e.graveyard??e.discard??[],s=e.exile??[],i=Array.isArray(a)?a.length:a.count??0,r=Array.isArray(n)?n.length:n.count??0,c=Array.isArray(n)?n.length>0?D(n[n.length-1]):null:n.topCard??null,p=Array.isArray(s)?s.length:s.count??0,o=Array.isArray(s)?s.length>0?D(s[s.length-1]):null:s.newestVisibleCard??null;return{draw:{count:i},discard:{count:r,topCard:c},exile:{count:p,newestCard:o},swap:Rt(e)}}function At(){return{draw:{count:0},discard:{count:0,topCard:null},exile:{count:0,newestCard:null},swap:[]}}function Rt(e){return(e.swapBar??e.swap??[]).map((a,n)=>({slotId:n,entityId:a?.id??null,card:a&&!a.faceDown?D(a):null,faceDown:a?a.faceDown===!0:!0,swapAvailable:e.swapAvailable??!0}))}function kt(e,t,a,n,s=new Set){let i=e.players?.[t]??{},r=e.players?.[a]??{},c=(i.pointRow??i.pr??[]).map(D),p=(i.enduringRow??i.er??[]).map(D),o=(r.pointRow??r.pr??[]).map(D),l=(r.enduringRow??r.er??[]).map(D),d=(Array.isArray(i.hand)?i.hand:[]).map(b=>{let v=Ct(b);return v&&s.has(v.entityId)&&(v.legalSource=!0),v}),h=Array.isArray(r.hand)?r.hand.length:r.hand?.count??0;return{topPR:n===1?c:o,topER:n===1?p:l,bottomPR:n===1?o:c,bottomER:n===1?l:p,humanHand:d,opponentHandCount:h,humanSeatIndex:n}}function St(){return{topPR:[],topER:[],bottomPR:[],bottomER:[],humanHand:[],opponentHandCount:0,humanSeatIndex:0}}function D(e){return e?{entityId:e.entityId??e.id??null,identity:e.identity??null,rank:e.rank??null,suit:e.suit??null,pointValue:e.pointValue??e.effectivePoints??null,isGeneratedCopy:e.isGeneratedCopy===!0,statusMarkers:xe(e),zone:e.zone??null,ownerId:e.ownerId??e.controllerId??null}:null}function Ct(e){return e?{entityId:e.entityId??e.id??null,identity:e.identity??null,rank:e.rank??null,suit:e.suit??null,pointValue:e.pointValue??e.effectivePoints??null,isGeneratedCopy:e.isGeneratedCopy===!0,statusMarkers:xe(e),zone:e.zone??"HAND",ownerId:e.ownerId??e.controllerId??null,legalSource:e.legalSource===!0,superEligible:e.superEligible===!0}:null}function xe(e){let t=[];return e.tapped&&t.push({type:"TAPPED",label:"Tapped"}),e.aegis&&t.push({type:"AEGIS",label:"Aegis"}),e.guard&&t.push({type:"GUARD",label:"Guard"}),e.exileBound&&t.push({type:"EXILE_BOUND",label:"Exile-Bound"}),e.revealedUntilStart&&t.push({type:"REVEALED",label:"Revealed"}),e.isAttachment&&t.push({type:"ATTACHMENT",label:"Attachment"}),e.selected&&t.push({type:"SELECTED",label:"Selected"}),e.legalTarget&&t.push({type:"LEGAL_TARGET",label:"Target"}),e.isResolving&&t.push({type:"RESOLVING",label:"Resolving"}),t}function Pt(e){let t=e.stack??e.resolutionStack??[],a=e.humanPlayerId??e.seatOrder?.[0]??"P1",n={},s=r=>{r?.id&&(n[r.id]=r.identity??null)},i=e.players?.[a]??{};(i.hand??[]).forEach(s),(i.pointRow??i.pr??[]).forEach(s),(i.enduringRow??i.er??[]).forEach(s);for(let r of e.seatOrder??[]){if(r===a)continue;let c=e.players?.[r]??{};(c.pointRow??c.pr??[]).forEach(s),(c.enduringRow??c.er??[]).forEach(s)}return(e.swapBar??e.swap??[]).forEach(s),e.graveyard?.topCard&&s(e.graveyard.topCard),t.map(r=>({stackIndex:r.stackIndex??r.index??0,actionFamily:r.actionFamily??r.family??null,actionMode:r.actionMode??r.mode??null,actionType:r.actionType??null,stackClass:r.stackClass??null,sourcePlayerId:r.sourcePlayerId??r.actorId??r.controllerId??null,sourceCardIds:r.sourceCardIds??[],targetCardIds:r.targetCardIds??[],isHuman:r.isHuman??r.controllerId===a,actorName:r.actorName??null,isResolving:r.isResolving===!0||r.status==="resolving",status:r.status??null,description:r.description??Nt(r,n)}))}function Nt(e,t){let a=e.actionType??e.actionFamily??e.family??null,n=e.stackClass??null,s=e.kind??null,i=a??n??s??"Action";i=i.replace(/-/g," ").replace(/\b\w/g,d=>d.toUpperCase());let r=e.sourceCardIds??[],c=e.targetCardIds??[],p=r.map(d=>t[d]).filter(Boolean),o=c.map(d=>t[d]).filter(Boolean),l=i;return p.length>0&&(l+=` \u2014 ${p.join(", ")}`),o.length>0&&(l+=` \u2192 ${o.join(", ")}`),l}function Ot(e){return(e.legalActions??e.authorizedActions??[]).map(n=>{let s=de(n,{});return{actionId:s.optionId,family:s.family,mode:s.mode,form:s.form??null,timingClass:s.timingClass??"ACTION",requiresSource:s.sourceEntityIds.length>0,requiresTarget:s.targets?.required??!1,targetCount:s.targets?.minimum??0,targetZone:null,sourceCardId:s.sourceEntityIds[0]??null,sourceEntityIds:s.sourceEntityIds,displayLabel:ie({family:s.family,mode:s.mode})||s.displayLabel||n.description||"Unknown",shortLabel:re({family:s.family,mode:s.mode})||s.displayLabel||"Unknown",timingLabel:_(s.timingClass),isSuper:s.isSuper??!1,isSpadesVariant:s.isSpadesVariant??!1,costs:s.costs??[],targets:s.targets??{required:!1,legalTargetIds:[]},description:n.description??s.displayLabel??`${s.family??"Action"} ${s.mode??""}`.trim(),isPass:s.isExhaustedPass||s.isDecline||s.family==="pass"||s.family==="exhausted-pass"||s.family==="response-decline",isDecline:s.isDecline??!1,isExhaustedPass:s.isExhaustedPass??!1,isResponse:s.isResponse??!1,preview:s.preview??null}})}function Lt(e){return(e.chat??e.matchChat??[]).map(a=>({sender:a.sender??"system",text:xt(a.text??a.message??""),timestamp:a.timestamp??null,isHuman:a.isHuman===!0,isAi:a.isAi===!0,isSystem:a.isSystem===!0||!a.isHuman&&!a.isAi}))}function xt(e){return String(e).slice(0,500).replace(/[<>]/g,"")}function Dt(e){let t=[],a=e.voltage??e.voltageLevel;return a&&a>0&&t.push({key:"voltage",label:`VOLTAGE ${a}`,icon:"\u26A1"}),(e.boardLock===!0||e.boardLocked===!0)&&t.push({key:"boardLock",label:"BOARD LOCK",icon:"\u{1F512}"}),(e.suddenDeath===!0||e.suddenDeathMode===!0)&&t.push({key:"suddenDeath",label:"SUDDEN DEATH",icon:"\u26A0"}),e.timeBomb!==void 0&&e.timeBomb!==null&&e.timeBomb>0&&t.push({key:"timeBomb",label:`TIME BOMB ${e.timeBomb}`,icon:"\u23F0"}),e.windowLabel&&(e.windowLabel.includes("response")||e.windowLabel.includes("Response"))&&t.push({key:"responseWindow",label:"RESPONSE WINDOW",icon:"\u21A9"}),t}function Mt(e,t){if(e.terminationReason)return"TERMINAL";let a=t.isNetworkMatch===!0,n=t.decision?.isHuman;if(n===!0)return"HUMAN_DECISION";if(n===!1)return a?"OPPONENT_DECISION":"AI_DECISION";let s=t.humanPlayerId??e.seatOrder?.[0];return e.activePlayerId===s?"HUMAN_DECISION":a?"OPPONENT_DECISION":"AI_DECISION"}var _t="intrilex-local-profile-v1",Ht="1.1.0",G={schemaVersion:Ht,displayName:"You",rating:{scope:"LOCAL_AI",value:1200,provisional:!0,ratedMatches:0},badges:[],record:{wins:0,losses:0,draws:0},verifiedResults:[],streakData:{currentStreak:0,bestStreak:0,lastResult:null},ratingHistory:[],archetypeBreakdown:{}};function j(){try{let e=localStorage.getItem(_t);if(!e)return{...G};let t=JSON.parse(e);return Bt(t)}catch{return{...G}}}function Tn(){try{let e="__intrilex_storage_test__";return localStorage.setItem(e,"1"),localStorage.removeItem(e),!0}catch{return!1}}function Ut(e){return e?e.startsWith("hybrix-")?e.replace("hybrix-","").replace(/-(hard|easy|nightmare|normal)$/,""):e:null}function Bt(e){if(!e.schemaVersion)return{...G};e.rating||(e.rating={...G.rating}),e.badges||(e.badges=[]),e.record||(e.record={...G.record}),e.verifiedResults||(e.verifiedResults=[]),e.streakData||(e.streakData={...G.streakData}),e.ratingHistory||(e.ratingHistory=[]),e.archetypeBreakdown||(e.archetypeBreakdown={});for(let t of e.verifiedResults)t.aiDifficulty||(t.aiDifficulty=Gt(t.aiPolicyId)),t.aiArchetype||(t.aiArchetype=Ut(t.aiPolicyId)),t.ratingDelta===void 0&&(t.ratingDelta=0);return e}function Gt(e){return e?e.endsWith("-hard")?"hard":e.endsWith("-easy")?"easy":e.endsWith("-nightmare")?"nightmare":"normal":"normal"}var w=Object.freeze({PLAY:"play",SCORE:"score",MANIPULATE:"manipulate",RESPOND:"respond",SYSTEM:"system"}),Yt=Object.freeze({[w.PLAY]:"Play",[w.SCORE]:"Score",[w.MANIPULATE]:"Manipulate",[w.RESPOND]:"Respond",[w.SYSTEM]:"System"}),Ft=Object.freeze({[w.PLAY]:"\u2663",[w.SCORE]:"\u2605",[w.MANIPULATE]:"\u21C4",[w.RESPOND]:"\u26E8",[w.SYSTEM]:"\u2699"}),Wt=Object.freeze({"effect-three":"\u21AF","effect-four":"\u2610","effect-five":"\u21BA","effect-six":"\u26CF","effect-seven":"\u21DF","effect-nine":"\u22A5","effect-ace":"\u2726","effect-red-joker":"\u{1F0CF}","effect-board-lock":"\u{1F512}","effect-row-clear":"\u232B","effect-bounce":"\u21A9","effect-tap":"\u{1F446}","effect-goal-shift":"\u{1F3AF}","effect-jack-control":"\u2693","effect-private-choice":"?",anchor:"\u2693","anchor-guard":"\u2693","anchor-private-choice":"\u2693",attachment:"\u{1F517}",scuttle:"\u2694",score:"\u2605","play-for-points":"\u2605","swap-bar":"\u21C4",draw:"\u2193",counter:"\u{1F6E1}",disrupt:"\u{1F4A5}",interrupt:"\u26A1",instant:"\u26A1",quick:"\u26A1",voltage:"\u26A1","solo-wild":"\u{1F0CF}",ultra:"\u{1F48E}",rank10:"\u2469","response-decline":"\u2298","exhausted-pass":"\u2298",phase:"\u23ED","private-choice":"?","royal-marriage":"\u26AD","queens-court":"\u2655","wild-sovereignty":"\u{1F0CF}","super-ace":"\u2726","king-spade-counter":"\u2693","board-lock":"\u{1F512}","sudden-death-autonomy":"\u2620"});function De(e){return Wt[e]??""}var jt=new Set(["effect-three","effect-four","effect-five","effect-six","effect-seven","effect-nine","effect-ace","effect-red-joker","effect-board-lock","effect-row-clear","effect-bounce","effect-tap","effect-goal-shift","effect-jack-control","effect-private-choice"]),Vt=new Set(["solo-wild","ultra","scuttle","anchor","anchor-guard","anchor-private-choice","attachment","rank10","voltage","royal-marriage","queens-court","wild-sovereignty","super-ace","king-spade-counter","board-lock","sudden-death-autonomy"]),zt=new Set(["score","play-for-points"]),qt=new Set(["swap-bar"]),Kt=new Set(["counter","disrupt","interrupt","instant","quick","response-decline"]),Qt=new Set(["draw","phase","exhausted-pass","private-choice"]);function Xt(e,t){let a=e??"unknown";return jt.has(a)||Vt.has(a)?w.PLAY:zt.has(a)?w.SCORE:qt.has(a)?w.MANIPULATE:Kt.has(a)?w.RESPOND:Qt.has(a)?w.SYSTEM:t?.isResponse?w.RESPOND:t?.isExhaustedPass||t?.isDecline?w.SYSTEM:w.PLAY}var C=Object.freeze({DIRECT:"direct",SOURCE:"source",VARIANT:"variant",COMBINATION:"combination",TARGET:"target"});function Jt(e){let t=e?.family??"unknown",a=e?.mode??null;return t==="swap-bar"?`swap-bar|${a}`:t==="phase"?`phase|${a}`:t==="anchor"?`anchor|${a}`:t}function Zt(e){if(!e||e.length<=1)return C.DIRECT;let t=r=>r?.targetHandles??r?.targets?.legalTargetIds??[];if(new Set(e.map(r=>t(r).join(","))).size>1)return C.TARGET;if(new Set(e.map(r=>r?.mode??"")).size>1)return C.VARIANT;let s=r=>r?.sourceHandles??r?.sourceEntityIds??[];if(new Set(e.map(r=>s(r).slice().sort().join(","))).size>1){let r=new Set(e.map(c=>s(c).length));return r.has(1)&&r.size===1?C.SOURCE:C.COMBINATION}return C.DIRECT}function ea(e,t){let a=e?.family??"unknown",n=e?.mode??null,s=e?.sourceHandles??e?.sourceEntityIds??[],i=e?.targetHandles??e?.targets?.legalTargetIds??[],r=Q(a,n);if(a==="solo-wild")return r||n;if(a==="ultra"){let o=(s??[]).map(l=>t?.[l]?.identity??"?");return`${r||n} (${o.join(" + ")})`}if(a==="score"||a==="play-for-points"){let o=s?.[0];return(o?t?.[o]:null)?.identity??"Points"}if(a.startsWith("effect-")||a==="anchor"||a==="anchor-guard"){let o=s?.[0];return(o?t?.[o]:null)?.identity??M(a)??r??"Effect"}if(a==="swap-bar"&&n==="face-up-draw"){let o=i?.[0];return(o?t?.[o]:null)?.identity??"Swap Card"}if(a==="swap-bar"&&n==="face-down"){let o=s?.[0];return(o?t?.[o]:null)?.identity??"Face-down"}if(["counter","disrupt","interrupt","instant","quick"].includes(a))return r||n||(M(a)??a);if(r&&r!==M(a))return r;let c=s?.[0];return(c?t?.[c]:null)?.identity??r??n??"Variant"}function ta(e){let{family:t,category:a,selectionType:n,actions:s}=e;if(a===w.RESPOND)return t==="response-decline"?"Pass priority without responding.":"Counter or interrupt the current stack item.";if(t==="draw")return"Draw a card from the top of the Draw Pile.";if(t==="phase")return"Advance to the Action Phase.";if(t==="exhausted-pass")return"No legal action \u2014 forced pass.";if(t==="score"||t==="play-for-points")return"Play a card to your Point Row for its value.";if(t==="swap-bar")return e.mode==="face-down"?"Place a hand card face-down onto the Swap Bar.":"Take a face-up Swap card into your hand.";if(t==="solo-wild")return"Copy a rank 3\u20137 effect using this wild card.";if(t==="ultra")return"Declare a color-recipe Ultra play for powerful effects.";if(t==="scuttle")return"Remove a legal card from an opponent's row.";if(t.startsWith("effect-"))return`${M(t)} \u2014 play this card for its rank effect.`;if(t==="anchor"||t==="anchor-guard"){let i=e.mode;return i==="king"?"Place the King on the Enduring Row as an Anchor (anchor value 7/9).":i==="queen"?"Place the Queen on the Enduring Row as an Anchor with Aegis.":i==="ace"?"Place the Ace on the Enduring Row as an Anchor (anchor value 0).":"Place an Anchor on the Enduring Row for persistent defense."}return t==="attachment"?"Attach a Jack to an opposing card to gain control.":""}function Me(e,t={}){let{cardRegistry:a=null,selectedSourceCardId:n=null}=t;if(!e||e.length===0)return[];let s=new Map;for(let c of e){if(!c)continue;let p=Jt(c);s.has(p)||s.set(p,[]),s.get(p).push(c)}let i=[];for(let[c,p]of s){let o=p[0]??{},l=o.family??"unknown",d=Xt(l,o),h=Zt(p),f=new Set;for(let $ of p)if($)for(let E of $.sourceHandles??$.sourceEntityIds??[])f.add(E);let m=new Set;for(let $ of p){if(!$)continue;let E=$.targetHandles??$.targets?.legalTargetIds??[];for(let S of E)m.add(S)}let g=M(l)??"Unknown";if(l==="swap-bar"&&(g=o.mode==="face-down"?"Face-down Swap":"Take Swap Card"),l==="phase"&&(g="Enter Action Phase"),l==="anchor"){let $=Q(l,o.mode);g=$?`${$} Anchor`:"Anchor"}l==="response-decline"&&(g="Decline Response"),l==="exhausted-pass"&&(g="Exhausted Pass");let b=p.length;h===C.DIRECT&&(b=1);let v=!1;n&&f.has(n)&&(v=!0);let I={id:c,family:l,mode:o.mode??null,category:d,label:g,description:null,selectionType:h,actions:p,sourceCardIds:Array.from(f),targetIds:Array.from(m),variantCount:b,selectedCardMatch:v,timingClass:o.timingClass??"ACTION",timingLabel:_(o.timingClass??"ACTION"),isResponse:o.isResponse??!1,isDecline:o.isDecline??!1,isExhaustedPass:o.isExhaustedPass??!1,isPrivateChoice:o.isPrivateChoice??!1,isPass:o.isExhaustedPass||o.isDecline||l==="pass"||l==="exhausted-pass"||l==="response-decline",isFullTurn:o.timingClass==="ACTION"&&!o.isResponse,scoreValue:null,variants:null};if(I.description=ta(I),(l==="score"||l==="play-for-points")&&a&&p[0]?.sourceHandles?.[0]){let $=a[p[0].sourceHandles[0]];$?.pointValue!=null&&(I.scoreValue=$.pointValue)}if(h!==C.DIRECT&&p.length>1){let $=new Set;I.variants=[];for(let E of p){let S={actionId:E.actionId??E.optionId,label:ea(E,a),sourceHandles:E.sourceHandles??E.sourceEntityIds??[],targetHandles:E.targetHandles??E.targets?.legalTargetIds??[],family:E.family,mode:E.mode},A=`${S.label}|${S.sourceHandles.slice().sort().join(",")}`;$.has(A)||($.add(A),I.variants.push(S))}}i.push(I)}let r=[w.RESPOND,w.PLAY,w.SCORE,w.MANIPULATE,w.SYSTEM];return i.sort((c,p)=>{let o=r.indexOf(c.category),l=r.indexOf(p.category);return o!==l?o-l:c.selectedCardMatch!==p.selectedCardMatch?c.selectedCardMatch?-1:1:(c.label??"").localeCompare(p.label??"")}),i}function _e(e){return Yt[e]??e}function He(e){return Ft[e]??""}function Ue(e){let t=new Set,a=[];for(let n of e)t.has(n.category)||(t.add(n.category),a.push(n.category));return a}function Be(e,t){return e.filter(a=>a.category===t)}function Ge(e){return e.some(t=>t.category===w.RESPOND&&!t.isDecline)}function kn(e,t=null){if(!e?.actions)return null;if(e.actions.length===1)return e.actions[0];if(t){let a=e.actions.find(n=>n?(n.sourceHandles??n.sourceEntityIds??[]).includes(t):!1);if(a)return a}return e.selectionType===C.DIRECT?e.actions[0]:null}var P=Object.freeze({PROACTIVE:"proactive",RESPONSE:"response",INTERRUPT:"interrupt",RESOLUTION:"resolution",TRANSITION:"transition"});function Ye(e,t){if(!e)return ia();let a=e.match??{},n=e.human??{},s=e.playerView??{};if(e.status==="TERMINAL"||a.winner)return{holder:"system",phase:a.phase??"",windowType:P.TRANSITION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:0,reasonCode:"GAME_ALREADY_TERMINAL",nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1};if(e.status==="AI_DECISION")return{holder:"opponent",phase:a.phase??"",windowType:P.PROACTIVE,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:s.stack?.length??0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!0};if(e.status==="HUMAN_DECISION"&&t){let i=t.kind??"ACTION",r=s.stack??[],c=r.length,p=t.actorId===n.playerId,o=aa(i,c),l=na(t),d=c>0?r[c-1]?.declarationId??null:null;return{holder:p?"human":"opponent",phase:a.phase??"",windowType:o,canAct:!0,canPass:l,pendingDeclarationId:d,stackDepth:c,reasonCode:null,nextOnPass:sa(o,c),isHumanPriority:p,isOpponentPriority:!p,decisionKind:i}}return{holder:"system",phase:a.phase??"",windowType:P.RESOLUTION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:s.stack?.length??0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1}}function aa(e,t){return e==="RESPONSE"?P.RESPONSE:e==="EXHAUSTED_PASS"?P.PROACTIVE:e==="PHASE"?P.TRANSITION:e==="PRIVATE_CHOICE"?P.PROACTIVE:t>0?P.RESPONSE:P.PROACTIVE}function na(e){return e?.legalActions?e.legalActions.some(t=>t.isDecline||t.isExhaustedPass):!1}function sa(e,t){return e===P.RESPONSE?t>1?"Passing lets the current declaration continue. Other actors may still respond.":"Passing lets the declaration continue toward resolution.":e===P.PROACTIVE?"You are in a proactive window. There is no pending declaration to pass on.":null}function Fe(e){return{[P.PROACTIVE]:"Proactive Window",[P.RESPONSE]:"Response Window",[P.INTERRUPT]:"Interrupt Window",[P.RESOLUTION]:"Resolution",[P.TRANSITION]:"Phase Transition"}[e]??"Unknown Window"}function ia(){return{holder:"system",phase:"",windowType:P.TRANSITION,canAct:!1,canPass:!1,pendingDeclarationId:null,stackDepth:0,reasonCode:null,nextOnPass:null,isHumanPriority:!1,isOpponentPriority:!1}}function ra(e,t){if(!e)return null;let a=e.type??"UNKNOWN",n=e.controllerId??e.payload?.controllerId??null,s=oa(e,t);return{index:e.index??0,type:a,description:s,actorId:n,details:ca(e,t)}}function We(e,t){return!e||e.length===0?[]:e.map((a,n)=>{let s=ra(a,t);return s&&(s.index=n+1),s}).filter(Boolean)}function oa(e,t){let a=e.type??"",n=e.payload??{};if(a.includes("DRAW"))return`${k(e)} drew a card.`;if(a.includes("SCORE")||a.includes("POINTS")){let s=O(n.cardId,t);return`${k(e)} scored ${s}.`}if(a.includes("SCUTTLE")){let s=O(n.targetId,t);return`${k(e)} scuttled ${s}.`}if(a.includes("SWAP"))return`${k(e)} used the Swap Bar.`;if(a.includes("COUNTER")){let s=O(n.targetId,t);return`${k(e)} countered ${s}.`}if(a.includes("DISCARD"))return`${k(e)} discarded a card.`;if(a.includes("EXILE"))return`${k(e)} exiled a card.`;if(a.includes("BOUNCE")){let s=O(n.targetId,t);return`${k(e)} bounced ${s}.`}if(a.includes("TAP")){let s=O(n.targetId,t);return`${k(e)} tapped ${s}.`}if(a.includes("PURGE"))return`${k(e)} purged a card.`;if(a.includes("ROW_CLEAR"))return`${k(e)} cleared a row.`;if(a.includes("ANCHOR_ENTERED")){let s=O(n.sourceCardId,t);return`${k(e)} placed ${s} as an anchor on the Enduring Row.`}if(a.includes("ATTACHMENT_RESOLVED")){let s=O(n.jackCardId,t),i=O(n.hostCardId,t);return`${k(e)} attached ${s} to ${i}.`}if(a.includes("RED_JOKER"))return`${k(e)} used a Red Joker effect.`;if(a.includes("BOARD_LOCK"))return`${k(e)} activated Board Lock.`;if(a.includes("ENTER_ACTION"))return"Entered the Action Phase.";if(a.includes("BEGIN_START"))return"Start phase began.";if(a.includes("CARD_MOVED"))return"A card was moved.";if(a.includes("CARD_TAKEN"))return`${k(e)} took a card.`;if(a.includes("GOAL_CHANGED"))return`${k(e)}'s goal changed.`;if(a.includes("TARGET_REMOVED"))return"A target was removed.";if(a.includes("MARKER_SET"))return"A marker was set on a card.";if(a.includes("TRIGGER_QUEUED"))return"A trigger was queued.";if(a.includes("STACK_ITEM_REBOUND"))return"A stack item rebounded.";if(a.includes("RESPONSE_WINDOW_CLOSED")||a.includes("PRIORITY_CLOSED"))return"The response window closed.";if(a.includes("RESPONSE_DECLINED")||a.includes("PRIORITY_PASSED"))return`${k(e)} passed priority.`;if(a.includes("RESOLVE"))return`${n.kind??"effect"} resolved.`;if(a.includes("CANCEL"))return`${n.kind??"effect"} was cancelled.`;if(a.includes("PASS"))return`${k(e)} passed.`;if(a.includes("PHASE"))return`Phase transition: ${n.phase??"unknown"}.`;if(a.includes("TURN"))return`Turn ${n.turnNumber??""} began.`;if(a.includes("TERMINAL")||a.includes("GAME_OVER"))return`Match ended. Winner: ${n.winner??"unknown"}.`;if(a.includes("SUPER"))return`${k(e)} declared a Super.`;if(a.includes("DECLARATION")||a.includes("DECLARE_PRIMARY")){let s=n.kind??"action";return`${k(e)} declared ${s}.`}return`${a.replace(/_/g," ").toLowerCase()}.`}function k(e){let t=e.controllerId??e.payload?.controllerId;return t?t==="P1"?"Player 1":t==="P2"?"Player 2":t:"The game"}function O(e,t){if(!e||!t)return"a card";let a=t[e];return a?a.identity??"a card":"a card"}function ca(e,t){let a=e.payload??{},n={};return a.cardId&&(n.source=O(a.cardId,t)),a.targetId&&(n.target=O(a.targetId,t)),a.effectName&&(n.effectName=a.effectName),a.result&&(n.result=a.result),a.prevented&&(n.prevented=a.prevented),a.modified&&(n.modified=a.modified),n}function je(e){if(!e||!e.match)return null;let t=[la(e),da(e),ua(e),pa(e),ha(e)].filter(Boolean);return t.length===0?null:t[0]}function la(e){let t=e.match.fullTurnSequence??0,a=e.human??{},n=e.opponent??{},s=a.secured??0,i=n.secured??0;return t<=6&&s<i?{title:"Early Pressure",insight:`The match ended in only ${t} turns \u2014 the opponent secured an early lead.`,tip:"In short games, responding to early threats is critical. Consider blocking or countering sooner.",category:"tempo"}:null}function da(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=a.secured??0,i=n-s;return i<-8?{title:"Margin Analysis",insight:`You trailed by ${Math.abs(i)} IR at game end \u2014 a significant gap.`,tip:"Large margins often indicate a positioning disadvantage. Review the midgame to find where the gap widened.",category:"positioning"}:i>8?{title:"Dominant Performance",insight:`You won by ${i} IR \u2014 a commanding margin.`,tip:"Analyze what worked: which cards created the advantage? Look for patterns to replicate.",category:"tempo"}:null}function ua(e){let t=e.human??{},a=t.cardsDrawn??0,n=t.cardsPlayed??0,s=e.zones??{};return(s.drawPile?.count??s.drawPile?.length??0)===0&&a>0?{title:"Deck Exhaustion",insight:"You drew through your entire deck \u2014 every card was available.",tip:"When the deck is empty, hand management becomes critical. Did you hold cards too long or play them too freely?",category:"efficiency"}:null}function pa(e){let a=(e.human??{}).passes??0,n=e.match.fullTurnSequence??0;if(a>3&&n>0){let s=a/n;if(s>.3)return{title:"Pass Frequency",insight:`You passed ${a} times in ${n} turns (${Math.round(s*100)}% of turns).`,tip:"Frequent passing cedes tempo. Consider whether some passes could have been actions \u2014 even a defensive play maintains pressure.",category:"tempo"}}return null}function ha(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=t.goal??21,i=s>0?n/s:0,r=e.match.winner,c=e.human?.playerId;return i>=.8&&r!==c&&r!==null?{title:"So Close",insight:`You reached ${n}/${s} IR (${Math.round(i*100)}% of goal) but couldn't close it out.`,tip:"Endgame positioning matters. When close to goal, prioritize defense \u2014 the opponent needs fewer points to catch up.",category:"defense"}:null}function Ve(e){if(!e||!e.match)return null;let t=[fa(e),ma(e),ga(e),ya(e)].filter(Boolean);return t.length===0?null:t[0]}function fa(e){let a=(e.human??{}).passes??0;return a>=4?{title:"Beginner Trap: Passing Too Much",insight:`You passed ${a} times. Passing gives your opponent free tempo.`,tip:"Try to play a card instead of passing, even if it's a defensive move. Every pass is a missed opportunity.",category:"tempo"}:null}function ma(e){let a=(e.human??{}).cardsPlayed??0,n=e.match.fullTurnSequence??0;return n>8&&a<n*.5?{title:"Beginner Trap: Underutilizing Cards",insight:`You played only ${a} cards in ${n} turns. Your hand is your main resource.`,tip:"Holding cards too long means missing opportunities. Look for moments to play cards that advance your position.",category:"efficiency"}:null}function ga(e){let t=e.human??{},a=e.opponent??{},n=t.secured??0,s=a.secured??0,i=e.match.fullTurnSequence??0;return i<=5&&s-n>=5?{title:"Beginner Trap: Slow Start",insight:`The opponent built a ${s-n} IR lead in only ${i} turns.`,tip:"In the opening turns, focus on establishing board presence. Don't wait to see what the opponent does \u2014 act first.",category:"tempo"}:null}function ya(e){let a=(e.human??{}).counters??0;return((e.opponent??{}).cardsPlayed??0)>5&&a===0?{title:"Beginner Trap: Not Countering",insight:"You didn't counter any of your opponent's plays.",tip:"Countering is a key defensive tool. When the opponent plays a high-value card, a counter can negate their tempo.",category:"defense"}:null}function ba(e){return{tempo:[{label:"Academy: Draw & Score",href:"#/play/academy"},{label:"Try Puzzles",href:"#/puzzles"}],defense:[{label:"Academy: Respond & Counter",href:"#/play/academy"},{label:"Try Puzzles",href:"#/puzzles"}],efficiency:[{label:"Academy: Card Effects",href:"#/play/academy"},{label:"Try Puzzles",href:"#/puzzles"}],positioning:[{label:"Academy: Royal Cards",href:"#/play/academy"},{label:"Review Match Replay",href:"#/history"}]}[e]??[{label:"Back to Academy",href:"#/play/academy"}]}function ze(e){if(!e)return"";let a=ba(e.category).map(n=>`<a class="teaching-moment-next-step" href="${n.href}" data-testid="teaching-moment-next-step">${n.label} \u2192</a>`).join("");return`<div class="teaching-moment" data-testid="teaching-moment" data-category="${e.category}">
    <h3 class="teaching-moment-title">\u{1F4A1} ${e.title}</h3>
    <p class="teaching-moment-insight">${e.insight}</p>
    <p class="teaching-moment-tip" data-testid="teaching-moment-tip">${e.tip}</p>
    <div class="teaching-moment-next" data-testid="teaching-moment-next">
      <span class="teaching-moment-next-label">What to try next:</span>
      ${a}
    </div>
  </div>`}function te(e,t={}){if(!e?.frames?.length)return[];let a=t.perspectivePlayerId??"P1",n=e.frames,s=[];return s.push(...va(n,a)),s.push(...Ia(n,a)),s.push(...$a(n,a)),s.push(...Ta(n,a)),s.sort((i,r)=>i.frameIndex-r.frameIndex)}function va(e,t){let a=[],n=t==="P1"?"P2":"P1";for(let s=1;s<e.length;s++){let i=e[s-1]?.state,r=e[s]?.state;if(!i||!r)continue;let c=qe(i,t),p=qe(r,t),o=p-c;if(Math.abs(o)>=3){let l=o>0,d=e[s]?.command,h=d?.action?.kind??d?.type??"unknown",f=r.turn??s;a.push({id:`pivotal-${s}`,category:"pivotal",frameIndex:s,title:l?`Pivotal gain (+${o} IR)`:`Pivotal loss (${o} IR)`,observation:`At turn ${f}, the ${h} action shifted the IR margin by ${o>0?"+":""}${o} points.`,alternative:l?"This was a strong play. Consider bookmarking it to study the setup that enabled it.":"A different action here might have preserved the margin. Consider exploring an alternate line from this frame.",consequence:`The margin went from ${c>0?"+":""}${c} to ${p>0?"+":""}${p} IR.`,lesson:l?"Recognizing and capitalizing on pivotal moments is a core skill. This frame shows a decisive play.":"Pivotal losses often come from underestimating the opponent's response. Review this frame to identify the misread.",bookmarkLabel:l?`Pivotal gain (F${s}, +${o})`:`Pivotal loss (F${s}, ${o})`})}}return a}function Ia(e,t){let a=[];for(let n=1;n<e.length;n++){let s=e[n],i=s?.command;if(!i)continue;let r=String(i?.action?.kind??i?.type??"").toLowerCase();if(r!=="pass"&&r!=="end_turn")continue;let c=s?.state;if(!c)continue;let p=c?.players?.[t];if(!p)continue;let o=p.hand?.length??0;if(o===0)continue;let l=c.turn??n;a.push({id:`tempo-${n}`,category:"tempo",frameIndex:n,title:`Tempo pass with ${o} card${o!==1?"s":""} in hand`,observation:`At turn ${l}, a pass was played while holding ${o} card${o!==1?"s":""}.`,alternative:"With cards available, consider whether a defensive play or counter would have preserved tempo better than passing.",consequence:"Passing cedes the initiative. The opponent gained a free turn to develop their position.",lesson:"Passing with cards in hand is sometimes correct (waiting for a better moment), but frequent passes while holding cards often indicate missed opportunities.",bookmarkLabel:`Tempo pass (F${n}, ${o} cards)`})}return a}function $a(e,t){let a=[];for(let n=1;n<e.length;n++){let s=e[n]?.state;if(!s)continue;let i=s?.drawPile;if((Array.isArray(i)?i.length:i?.count??0)!==0)continue;let p=e[n-1]?.state?.drawPile;if((Array.isArray(p)?p.length:p?.count??0)===0)continue;let d=s?.players?.[t]?.hand?.length??0,h=s.turn??n;a.push({id:`efficiency-${n}`,category:"efficiency",frameIndex:n,title:`Deck exhausted with ${d} card${d!==1?"s":""} in hand`,observation:`At turn ${h}, the draw pile ran out. You have ${d} card${d!==1?"s":""} remaining in hand.`,alternative:"When the deck is nearly empty, plan to conserve high-value cards for critical moments rather than spending them early.",consequence:"With no more draws available, every remaining card is precious. Hand management becomes the deciding factor.",lesson:"Deck exhaustion is a natural inflection point. Players who reach it with a well-managed hand have a significant advantage.",bookmarkLabel:`Deck exhausted (F${n}, ${d} in hand)`})}return a}function Ta(e,t){let a=[],n=t==="P1"?"P2":"P1";for(let s=1;s<e.length;s++){let i=e[s-1]?.state,r=e[s]?.state;if(!i||!r)continue;let c=V(i,n),p=V(r,n),o=p-c;if(o<2)continue;let l=e[s]?.command,d=l?.actorId??l?.playerId??"";if(d!==n&&d!==`Player${n}`)continue;let h=i?.players?.[t]?.hand?.length??0;if(h===0)continue;let f=r.turn??s;a.push({id:`counter-${s}`,category:"defense",frameIndex:s-1,title:`Opponent scored ${o} IR \u2014 counter opportunity?`,observation:`At turn ${f}, the opponent gained ${o} IR. You had ${h} card${h!==1?"s":""} in hand at the prior frame.`,alternative:"Review the prior frame to see if a counter, block, or disruption play was available. Even delaying the opponent by one turn can change the outcome.",consequence:`The opponent's score went from ${c} to ${p} IR.`,lesson:"Defensive awareness is as important as offensive planning. When the opponent scores heavily, check whether the prior frame offered a counter.",bookmarkLabel:`Counter opportunity (F${s-1}, -${o})`})}return a}function qe(e,t){let a=t==="P1"?"P2":"P1";return V(e,t)-V(e,a)}function V(e,t){let a=e?.players?.[t];return a?a.secured??a.points??a.score??a.ir??0:0}function On(e,t={}){return te(e,t).map(n=>({frameIndex:n.frameIndex,commentary:`${n.title}: ${n.observation} ${n.lesson}`,category:n.category}))}function Ln(e,t){if(!e||!t)return null;let n={tempo:"WIN_WITHIN_TURNS",defense:"SURVIVE_TURNS",efficiency:"WIN_THIS_TURN",positioning:"WIN_WITHIN_TURNS",pivotal:"WIN_THIS_TURN"}[e.category]??"WIN_WITHIN_TURNS";return{frameIndex:e.frameIndex,objectiveType:n,reason:`Practice ${e.category}: ${e.lesson}`}}function wa(e){if(!e)return"";let t=(a="")=>String(a).replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]);return`<div class="trace-insight" data-testid="trace-insight" data-category="${t(e.category)}" data-frame="${e.frameIndex}">
    <div class="trace-insight-header">
      <span class="trace-insight-category" data-testid="trace-insight-category">${t(e.category)}</span>
      <span class="trace-insight-frame">Frame ${e.frameIndex}</span>
    </div>
    <h4 class="trace-insight-title">${t(e.title)}</h4>
    <p class="trace-insight-observation">${t(e.observation)}</p>
    <p class="trace-insight-alternative"><strong>Alternative:</strong> ${t(e.alternative)}</p>
    <p class="trace-insight-consequence"><strong>Result:</strong> ${t(e.consequence)}</p>
    <p class="trace-insight-lesson">${t(e.lesson)}</p>
    ${e.bookmarkLabel?`<button class="trace-insight-bookmark" data-forensic-action="add-bookmark-from-insight" data-frame="${e.frameIndex}" data-label="${t(e.bookmarkLabel)}" data-testid="trace-insight-bookmark">Bookmark this frame</button>`:""}
    <button class="trace-insight-practice" data-forensic-action="practice-from-insight" data-frame="${e.frameIndex}" data-category="${t(e.category)}" data-testid="trace-insight-practice">Practice this position</button>
  </div>`}function Ke(e){return!e||e.length===0?'<div class="trace-insights-empty" data-testid="trace-insights-empty">No trace insights generated for this replay.</div>':`<div class="trace-insights" data-testid="trace-insights">${e.map(wa).join("")}</div>`}var L=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);function z(e){return e?String(e).replace(/_/g," ").toLowerCase().replace(/\b\w/g,t=>t.toUpperCase()):""}function Qe(e){return e?String(e).replace(/_/g," ").toLowerCase().replace(/\b\w/g,t=>t.toUpperCase()):"Unknown"}function Xe(e,t){let a=e.match.winner??null,n=e.human?.playerId??null,i=a==null||e.match.terminationReason==="CANONICAL_DRAW"?"draw":a===n?"win":"loss",r=i==="win"?"VICTORY":i==="loss"?"DEFEAT":"DRAW",c=i==="win"?"\u{1F3C6}":i==="loss"?"\u{1F480}":"\u{1F91D}",p=e.opponent?.archetype??"",o=we(p,i==="loss");return`<div class="play-terminal ${i}" data-testid="play-terminal">
    <div class="terminal-result-banner ${i}">
      <span class="terminal-result-icon" aria-hidden="true">${c}</span>
      <h2>Match Complete</h2>
      <p class="terminal-result" data-testid="terminal-result">${r==="VICTORY"?"You won!":r==="DEFEAT"?"You lost.":"Draw."}</p>
      <p class="terminal-banter" data-testid="terminal-banter">${L(o)}</p>
    </div>
    <dl class="terminal-details">
      <dt>Winner</dt><dd data-testid="terminal-winner">${L(i==="win"?"You":i==="loss"?"AI":"Draw")}</dd>
      <dt>Termination</dt><dd>${L(Qe(e.match.terminationReason||"UNKNOWN"))}</dd>
      <dt>Full Turns</dt><dd>${e.match.fullTurnSequence??0}</dd>
    </dl>
    ${Ra(t)}
    ${t.achievementSummaryHtml||""}
    ${Ea(e,t)}
    ${ze(je(e)||Ve(e))}
    ${Aa(t)}
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
  </div>`}function Je(e,t){return`<div class="play-error" data-testid="play-error" role="alert">
    <h2>Session Error</h2>
    <p>${L(e.error?.reason||e.error||"Unknown error")}</p>
    <button class="secondary-button" data-action="return-to-hub">Return to Play hub</button>
  </div>`}function Ea(e,t){if(!e||!e.match)return"";let a=e.human??{},n=e.opponent??{},s=e.zones??{},i=e.match??{},r=i.fullTurnSequence??0,c=a.secured??0,p=n.secured??0,o=c-p,l=a.goal??21,d=n.goal??21,h=l>0?Math.min(100,Math.round(c/l*100)):0,f=d>0?Math.min(100,Math.round(p/d*100)):0,m=s.drawPile?.count??s.drawPile?.length??0,y=s.discard?.count??s.discard?.length??0,g=Qe(i.terminationReason||"UNKNOWN"),b=o>0?`+${o}`:String(o),v=o>0?"intel-margin-positive":o<0?"intel-margin-negative":"intel-margin-neutral",$=t.isNetworkMatch===!0?"Opponent":"AI";return`<div class="intel-card" data-testid="match-intelligence-card">
    <h3 class="intel-title">Match Intelligence</h3>
    <div class="intel-grid">
      <div class="intel-stat" data-testid="intel-turns">
        <span class="intel-stat-label">Turns</span>
        <span class="intel-stat-value">${r}</span>
      </div>
      <div class="intel-stat" data-testid="intel-margin">
        <span class="intel-stat-label">IR Margin</span>
        <span class="intel-stat-value ${v}">${L(b)}</span>
      </div>
      <div class="intel-stat" data-testid="intel-draw-remaining">
        <span class="intel-stat-label">Draw Pile</span>
        <span class="intel-stat-value">${m}</span>
      </div>
      <div class="intel-stat" data-testid="intel-discard">
        <span class="intel-stat-label">Cards Played</span>
        <span class="intel-stat-value">${y}</span>
      </div>
    </div>
    <div class="intel-goal-bars">
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">You</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-human" style="width:${h}%"></div></div>
        <span class="intel-goal-bar-value">${c}/${l}</span>
      </div>
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">${L($)}</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-opponent" style="width:${f}%"></div></div>
        <span class="intel-goal-bar-value">${p}/${d}</span>
      </div>
    </div>
    <p class="intel-termination" data-testid="intel-termination">Ended: ${L(g)}</p>
  </div>`}function Aa(e){let t=e?.certifiedReplay;if(!t?.frames?.length)return"";let a=e?.humanPlayerId??"P1",n=te(t,{perspectivePlayerId:a});return n.length===0?"":`<div class="trace-insights-card" data-testid="trace-insights-card">
    <h3 class="trace-insights-card-title">Frame-Level Analysis</h3>
    <p class="trace-insights-card-desc">Key moments from this match, with alternatives and consequences.</p>
    ${Ke(n)}
  </div>`}function Ra(e){let t=e.rankResult;if(t&&typeof t=="object"){let a=Math.max((t.ratedMatchesBefore??1)-1,0),n=t.ratedMatchesAfter??t.ratedMatchesBefore??1,s=H(t.ratingBefore,{ratedMatches:a}),i=H(t.ratingAfter,{ratedMatches:n}),r=Math.round((t.ratingAfter??0)-(t.ratingBefore??0)),c=r>0?"+":"",p=r>0?"rank-result-delta-up":r<0?"rank-result-delta-down":"",o=me(i,s),l=o>0,d=o<0,h=B({tier:s.tier,division:s.division,size:96,showDivision:!0,decorative:!0,className:"rank-result-before-glyph"}),f=B({tier:i.tier,division:i.division,size:96,showDivision:!0,decorative:!1,className:"rank-result-after-glyph"}),m=l||d?'<span class="rank-result-arrow" aria-hidden="true">\u2192</span>':"",y=l?'<p class="rank-result-banner rank-up" data-testid="rank-result-banner">RANK UP</p>':d?'<p class="rank-result-banner rank-down" data-testid="rank-result-banner">RANK DOWN</p>':"",g=t.ratingBefore!=null?String(t.ratingBefore):"\u2014",b=t.ratingAfter!=null?String(t.ratingAfter):"\u2014";return`<div class="rank-result-block" data-testid="rank-result-block">
      ${y}
      <div class="rank-result-glyphs">
        ${l||d?`${h}${m}${f}`:f}
      </div>
      <p class="rank-result-tier" data-testid="rank-result-tier">${L(U(i.tier,i.division))}</p>
      <p class="rank-result-rating ${p}" data-testid="rank-result-rating">${g} \u2192 ${b} IR <span class="rank-result-delta">${c}${r}</span></p>
    </div>`}try{let a=j();if(!a?.rating)return"";let n=H(a.rating.value,{ratedMatches:a.rating.ratedMatches});return n.isPlacement?`<div class="rank-result-block" data-testid="rank-result-block">
        ${B({tier:n.tier,division:n.division,size:96,showDivision:!1,decorative:!1})}
        <p class="rank-result-tier">${L(U(n.tier,n.division))}</p>
        <p class="rank-result-placement">${n.placementsPlayed} / ${n.placementsRequired} Placements</p>
      </div>`:`<div class="rank-result-block" data-testid="rank-result-block">
      ${B({tier:n.tier,division:n.division,size:96,showDivision:!0,decorative:!1})}
      <p class="rank-result-tier">${L(U(n.tier,n.division))}</p>
      <p class="rank-result-rating">${a.rating.value} IR</p>
    </div>`}catch{return""}}function Ze(){return`<div class="keyboard-help-overlay" data-testid="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
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
  </div>`}function et(e){return`<div class="keyboard-help-overlay" data-testid="rules-help" role="dialog" aria-label="Rules and help">
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
  </div>`}function tt(e){if(!e)return"";let t=e.human??{},a=e.opponent??{},n=e.match??{},s=e.recentEvents??[];return`<div class="keyboard-help-overlay" data-testid="match-stats" role="dialog" aria-label="Match statistics">
    <h3>Match Statistics</h3>
    <dl class="keyboard-help-list">
      <dt>Your IR</dt><dd>${t.ir??t.influence??"\u2014"}</dd>
      <dt>Opponent IR</dt><dd>${a.ir??a.influence??"\u2014"}</dd>
      <dt>Turn</dt><dd>${n.turn??"\u2014"}</dd>
      <dt>Phase</dt><dd>${e.decision?.kind??"\u2014"}</dd>
      <dt>Recent Events</dt><dd>${s.length} event(s) this session</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="match-stats-close" aria-label="Close match stats">Close</button>
  </div>`}function q(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}function at(e,t,a,n){let s=e.mode?.label??"LOCAL VS AI",i=e.mode?.isNetwork===!0,r=t.chatHidden===!0,c=e.human?.playerId,p=e.opponent?.playerId,o=(n||[]).map(f=>{let m,y;if(f.isSystem)m="rd-chat-msg system",y="System";else if(i&&f.participantId){let g=f.isHuman===!0;m=g?"rd-chat-msg human":"rd-chat-msg opponent",y=g?e.human?.displayName??"You":e.opponent?.displayName??"Opponent"}else m=f.isHuman?"rd-chat-msg human":"rd-chat-msg ai",y=f.isHuman?e.human?.displayName??"You":e.opponent?.displayName??"AI";return`<div class="${m}" data-message-id="${q(f.messageId??"")}">
      <div class="rd-chat-author">${q(y)}</div>
      <div class="rd-chat-text">${q(f.text)}</div>
    </div>`}).join(""),l=a?"":`<form class="rd-chat-input" data-testid="match-chat-form">
    <input type="text" placeholder="Message..." data-chat-input maxlength="200" aria-label="Chat message" data-testid="match-chat-input">
    <button type="button" class="rd-chat-emote-btn" data-action="chat-emote" aria-label="Emotes" data-testid="chat-emote-btn" title="Emotes">\u263A</button>
    <button type="submit" data-action="chat-send" aria-label="Send">\u27A4</button>
  </form>`,d=(n||[]).length>0,h=i?`<button class="rd-chat-toggle-btn" data-action="${r?"chat-show":"chat-hide"}" data-testid="chat-toggle-btn" title="${r?"Show Match Chat":"Hide Match Chat"}" aria-label="${r?"Show Match Chat":"Hide Match Chat"}">${r?"\u25B6":"\u25BC"}</button>`:"";return r?`<div class="rd-chat-panel rd-chat-hidden" data-chat-empty="${!d}" data-testid="match-chat-panel">
      <div class="rd-chat-header">
        <span class="rd-chat-title">MATCH CHAT</span>
        <span class="rd-chat-mode">HIDDEN</span>
        ${h}
      </div>
    </div>`:`<div class="rd-chat-panel" data-chat-empty="${!d}" data-testid="match-chat-panel">
    <div class="rd-chat-header">
      <span class="rd-chat-title">MATCH CHAT</span>
      <span class="rd-chat-mode">${q(s)} \xB7 LIVE</span>
      ${h}
    </div>
    <div class="rd-chat-messages" data-testid="match-chat-messages" role="log" aria-live="polite" aria-atomic="false">
      ${o||'<div class="rd-chat-empty">No messages yet</div>'}
    </div>
    ${l}
  </div>`}var ka=at;function Sa(e){if(!e)return{};let t=new Set((e.statusMarkers??[]).map(a=>a?.type));return{tapped:t.has("TAPPED"),aegis:t.has("AEGIS"),providesGuard:t.has("GUARD"),exileBound:t.has("EXILE_BOUND"),jackHostId:t.has("ATTACHMENT")?!0:void 0}}var u=(e="")=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);function Ca(e){if(!e||e.state)return e;let t=e.playerView;if(!t)return{sessionId:e.sessionId,status:e.status};let a=e.human?.playerId??t.actorId??"P1",n=t.opponents??[],s=[a,...n.map(r=>r.playerId)],i={};i[a]={securedPoints:t.own?.securedPoints??0,goal:t.own?.goal??21,hand:t.own?.hand??[],pointRow:t.own?.pr??[],enduringRow:t.own?.er??[],isActive:t.activePlayerId===a,hasPriority:t.priority?.ownerId===a};for(let r of n)i[r.playerId]={securedPoints:r.securedPoints??0,goal:r.goal??21,hand:{count:r.handCount??0},pointRow:r.pr??[],enduringRow:r.er??[],displayName:e.opponent?.displayName??"AI",aiRating:e.opponent?.aiRating??null,difficulty:e.opponent?.difficulty??"",isHuman:e.opponent?.isHuman??!1,rating:e.opponent?.rating??null,rank:e.opponent?.rank??null,connectionState:e.opponent?.connectionState??null};return{sessionId:e.sessionId,humanPlayerId:a,status:e.status,isNetworkMatch:e.isNetworkMatch===!0,decision:e.decision??null,legalActions:e.decision?.legalActions??[],chat:e.chat??[],state:{seatOrder:s,fullTurnSequence:t.fullTurnSequence??e.match?.fullTurnSequence??0,phase:t.phase??e.match?.phase??"",activePlayerId:t.activePlayerId??e.match?.activePlayerId??null,priorityOwnerId:t.priority?.ownerId??null,windowLabel:t.priority?.windowLabel??"",startingGoal:t.own?.goal??21,players:i,drawPile:{count:t.dpCount??0},graveyard:{count:t.gyCount??(t.gyTopCard?1:0),topCard:t.gyTopCard??null},exile:{count:t.exileCount??0,newestVisibleCard:null},swapBar:t.swapBar??[],stack:t.stack??[],swapAvailable:!0,terminationReason:e.match?.terminationReason??null,winner:e.match?.winner??null}}}function $s(e,t={}){return e?Na(e,t):'<div class="play-error">No active session.</div>'}function Pa(e,t){if(!t.isNetworkMatch&&!e?.isNetworkMatch)return null;let a=e?.matchMode??"private",n=e?.queueId??null,s;switch(a){case"ranked":s="ONLINE \xB7 RANKED DUEL";break;case"casual":s="ONLINE \xB7 CASUAL DUEL";break;default:s="ONLINE \xB7 DIRECT DUEL";break}return{kind:"NETWORK",label:s,networkRanked:a==="ranked",isNetwork:!0,matchMode:a,queueId:n}}function Na(e,t={}){let a=j(),n=Ca(e),s=Pa(e,t);s?.isNetwork&&e?.human&&(a={...a,displayName:e.human.displayName??a.displayName,rating:e.human.rating!=null?{...a.rating,value:e.human.rating,scope:"NETWORK",provisional:!1}:a.rating});let i=Le(n,a,s);return i.status==="ERROR"?Je(i,t):i.status==="TERMINAL"?Xe(i,t):Oa(i,t,e)}function Oa(e,t,a){let n=t.leaseMode==="READ_ONLY",s=e.status==="HUMAN_DECISION",i=e.status==="AI_DECISION",r=e.status==="OPPONENT_DECISION",c=e.mode?.isNetwork===!0,p=a?Ye(a,a.decision):null,o=t.guidanceMode??x.GUIDED,l=p?ve(p,[],o):null,d={},h=e?.battlefield?.humanHand??[];for(let v of h)v.entityId&&(d[v.entityId]=v);let f=e?.battlefield?.topPR??[],m=e?.battlefield?.topER??[],y=e?.battlefield?.bottomPR??[],g=e?.battlefield?.bottomER??[];[...f,...m,...y,...g].forEach(v=>{v?.entityId&&(d[v.entityId]=v)});let b=new Map;for(let v of e.actions??[])for(let I of v.sourceEntityIds??[]){b.has(I)||b.set(I,[]);let $=v.shortLabel||v.displayLabel||"Action";b.get(I).includes($)||b.get(I).push($)}return t={...t,cardActionHints:b,isHumanTurn:s,isResponseWindow:l?.isResponseWindow===!0},`<div class="ranked-duel-shell" role="main" aria-label="Ranked Duel Match" data-testid="play-board" data-gameplay-skin="${u(t.gameplaySkin)}"${t.isCaster===!0?' data-caster="1"':""}>
    ${_a(e,t,p,l)}
    <section class="rd-cell rd-enemy-enduring" data-grid="enemyE" aria-label="Opponent Enduring">
      ${st(m,"opponent")}
    </section>
    <section class="rd-cell rd-enemy-points" data-grid="enemyP" aria-label="Opponent Points">
      ${nt(f,"Points",e.opponent.secured,e.opponent.goalLabel,"opponent")}
    </section>
    <section class="rd-cell rd-enemy-profile" data-grid="enemyProfile" aria-label="Opponent profile">
      ${ct(e.opponent,"opponent",e)}
      ${Xa(e.battlefield.opponentHandCount,t.opponentHandCards)}
    </section>
    <section class="rd-cell rd-piles" data-grid="piles" aria-label="Shared piles">
      <div class="rd-piles-label">SHARED PILES</div>
      <div class="rd-piles-row">
        ${ae("Exile",e.zones.exile.count,e.zones.exile.newestCard,"exile")}
        ${ae("Discard",e.zones.discard.count,e.zones.discard.topCard,"discard")}
        ${ae("Draw",e.zones.draw.count,null,"draw")}
      </div>
    </section>
    <section class="rd-cell rd-swap" data-grid="swap" aria-label="Swap bar">
      ${Za(e,t,s,n)}
    </section>
    <section class="rd-cell rd-stage" data-grid="stage" data-board="1" aria-label="Active stage">
      ${Ua(e,t,a,p,l)}
    </section>
    <section class="rd-cell rd-stack" data-grid="stack" data-stack-depth="${e.stack?.length??0}" aria-label="Resolution stack">
      ${Ba(e)}
    </section>
    <section class="rd-cell rd-player-enduring" data-grid="playerE" aria-label="Your Enduring">
      ${st(g,"human")}
    </section>
    <section class="rd-cell rd-player-points" data-grid="playerP" aria-label="Your Points">
      ${nt(y,"Points",e.human.secured,e.human.goalLabel,"human")}
    </section>
    <section class="rd-cell rd-gamelog" data-grid="gamelog" data-log-empty="${(a?.recentEvents?.length??0)===0}" aria-label="Game log">
      <div class="rd-rail-section-header">GAME LOG</div>
      ${Ka(a?.recentEvents??[],a?.systemEvents??[],d,qa(e.human.playerId,e.opponent.displayName),e.human.playerId)}
    </section>
    <section class="rd-cell rd-score-rail" data-grid="scoreRail" aria-label="Score rail" data-testid="score-rail">
      ${Ha(e)}
    </section>
    <section class="rd-cell rd-player-profile" data-grid="playerPro" aria-label="Your profile">
      ${ct(e.human,"human",e)}
    </section>
    <section class="rd-cell rd-player-hand" data-grid="playerH" aria-label="Your hand">
      ${Ja(e.battlefield.humanHand,t)}
    </section>
    <section class="rd-cell rd-right-rail-bottom" data-grid="rightRailBottom" aria-label="Actions and chat">
      ${t.rightRailHtml?t.rightRailHtml:La(e,t,a,n,s,i,r,p,l,c)}
    </section>
    ${t.academyPanelHtml?`<section class="rd-cell rd-academy-panel" data-grid="academyPanel" aria-label="Lesson objectives">${t.academyPanelHtml}</section>`:""}
    ${t.academyCoachmarkHtml?t.academyCoachmarkHtml:""}
    ${t.academyPanelHtml?'<div class="academy-hint-display" data-testid="academy-hint-display" role="status" aria-live="polite"></div>':""}
    ${c?xa(e,a):""}
    ${c?Da(e,a,t):""}
    ${t.inspectorCardId?an(t.inspectorCardId,d,[],o,t.inspectorFaceView):""}
    ${t.showKeyboardHelp?Ze():""}
    ${t.showRulesHelp?et(a):""}
    ${t.showMatchStats?tt(a):""}
  </div>`}function La(e,t,a,n,s,i,r,c,p,o){let l=t.chatHidden===!0,d=t.chatSplit??40,h=Ga(e,t,s,i,r,n,c,p),f=ka(e,t,n,(t.chatMessages||[]).slice(-30)),m=o&&!l?'<div class="rd-rail-divider" data-action="rail-drag" role="separator" aria-orientation="horizontal" aria-label="Drag to resize Actions and Chat" tabindex="0" data-testid="rail-divider"><div class="rd-rail-divider-handle"></div></div>':"";return`<div class="rd-right-rail-bottom-inner" data-chat-hidden="${l}" data-chat-split="${d}">
    <div class="rd-rail-actions-section" style="flex: ${l?"1 1 100%":`${100-d} 1 0`}">
      ${h}
    </div>
    ${m}
    ${l?"":`<div class="rd-rail-chat-section" style="flex: ${d} 1 0">${f}</div>`}
  </div>`}function xa(e,t){if(!t)return"";let a=t.opponent?.connectionState??e.opponent?.connectionState,n=e.status==="TERMINAL";if(a!=="DISCONNECTED"||n)return"";let s=t.opponent?.graceMs??e.opponent?.graceMs??null,i=t.opponent?.disconnectedAt??e.opponent?.disconnectedAt??null,r="";if(typeof s=="number"&&typeof i=="number"){let c=i+s,p=Math.max(0,c-Date.now()),o=Math.ceil(p/1e3);r=`<p class="rd-disconnect-grace" data-testid="reconnect-grace-countdown" data-grace-deadline-ms="${c}">Reconnect grace: <strong>${o}s</strong> remaining</p>`}return`<div class="rd-disconnect-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-disconnect-title" data-testid="disconnect-overlay">
    <div class="rd-disconnect-content">
      <h2 id="rd-disconnect-title" class="rd-disconnect-title">Opponent Disconnected</h2>
      <p class="rd-disconnect-msg">Waiting for the match server to determine the outcome\u2026</p>
      ${r}
      <div class="rd-disconnect-spinner" aria-hidden="true"></div>
    </div>
  </div>`}function Da(e,t,a){if(!t)return"";let n=a.rematchInvite??t.rematchInvite??e.rematchInvite;if(!n)return"";let s=n.fromDisplayName??"Opponent";return`<div class="rd-rematch-invite-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-rematch-title" data-testid="rematch-invite-overlay">
    <div class="rd-rematch-invite-content">
      <h2 id="rd-rematch-title" class="rd-rematch-title">Rematch Request</h2>
      <p class="rd-rematch-msg"><strong>${u(s)}</strong> wants to play again.</p>
      <div class="rd-rematch-actions">
        <button class="primary-button" data-testid="accept-rematch" data-action="accept-rematch" data-invite-code="${u(n.inviteCode??"")}">Accept</button>
        <button class="secondary-button" data-testid="decline-rematch" data-action="decline-rematch">Decline</button>
      </div>
    </div>
  </div>`}function Ma(e){let t=F.includes(e)?e:"dark",a=W[t]||W.dark,n=F.map(s=>{let i=s===t;return`<button class="rd-skin-menu-item ${i?"active":""}" data-action="select-skin" data-skin="${u(s)}" role="menuitemradio" aria-checked="${i?"true":"false"}">
      <span class="rd-skin-menu-icon" aria-hidden="true">${W[s]}</span>
      <span class="rd-skin-menu-label">${u(ee[s])}</span>
      <span class="rd-skin-menu-check" aria-hidden="true">\u2713</span>
    </button>`}).join("");return`<div class="rd-skin-selector" style="position:relative;display:inline-flex;">
    <button class="rd-skin-trigger" data-action="toggle-skin-menu" data-testid="skin-selector-trigger" title="Appearance: ${u(ee[t])}" aria-label="Select appearance skin" aria-haspopup="menu" aria-expanded="false">${a}</button>
    <div class="rd-skin-menu" role="menu" aria-label="Appearance skins" data-testid="skin-selector-menu">${n}</div>
  </div>`}function _a(e,t,a,n){let s=e.match.fullTurnSequence,i=z(e.match.phase),r=e.status==="HUMAN_DECISION",c=e.status==="AI_DECISION",p=e.status==="OPPONENT_DECISION",o=e.mode?.isNetwork===!0,l=e.match.priorityOwnerId,d=l===e.human.playerId,h=r?"Your action":p?`${u(e.opponent.displayName)} is choosing\u2026`:c?"AI is choosing\u2026":o&&!d&&l?`${u(e.opponent.displayName)} is choosing\u2026`:d?"Your priority":l?`${u(e.opponent.displayName)} has priority`:i||e.match.phase,f=a?Fe(a.windowType):"",m=e.stack?.length??0,y=e.match.globalStates??[],g=y.length>0?`<span class="rd-header-states">${y.map(T=>`<span class="rd-state-badge rd-state-${u(T.key)}" title="${u(T.label)}">${u(T.icon)} ${u(T.label)}</span>`).join("")}</span>`:"",b=e.status==="TERMINAL",v=!o||b||t.isCaster===!0,I=t.isCaster===!0?"#/watch":t.academyLessonId?"#/play/academy":"#/",$=t.isCaster===!0?"Back to Observatory":t.academyLessonId?"Back to Academy":"Back to home",E=v?`<a class="rd-header-back" href="${I}" aria-label="${u($)}" title="${u($)}">\u2190</a>`:"",S=t.isCaster===!0?"Exit to Observatory":o&&!b?"Forfeit match":"Return to hub",A=t.isCaster===!0?"exit-caster":o&&!b?"forfeit-match":"exit-match";return`<header class="rd-header" role="banner">
    <div class="rd-header-left">
      ${E}
      <span class="rd-header-logo">INTRILEX</span>
      <span class="rd-header-mode">${u(e.mode.label)}</span>
    </div>
    <div class="rd-header-center" role="status" aria-live="polite">
      <span class="rd-header-turn">Turn ${s}</span>
      <span class="rd-header-sep">\xB7</span>
      <span class="rd-header-phase">${u(i)}</span>
      ${f?`<span class="rd-header-sep">\xB7</span><span class="rd-header-window ${d?"human":"opponent"}">${u(f)}</span>`:""}
      ${m>0?`<span class="rd-header-sep">\xB7</span><span class="rd-header-stack">Stack ${m}</span>`:""}
      <span class="rd-header-owner ${r?"human":c?"ai":""}">${u(h)}</span>
      ${g}
    </div>
    <div class="rd-header-right">
      <div class="rd-toolbar" role="toolbar" aria-label="Utility controls">
        <button class="rd-toolbar-btn" data-action="sound-toggle" data-testid="sound-toggle" title="${t.soundMuted?"Unmute":"Mute"} audio" aria-label="${t.soundMuted?"Unmute audio":"Mute audio"}">${t.soundMuted?"\u{1F507}":"\u{1F50A}"}</button>
        <button class="rd-toolbar-btn" data-action="keyboard-help" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
        <button class="rd-toolbar-btn" data-action="toggle-rules" title="Rules / Help" aria-label="Rules and help">\u2139</button>
        <button class="rd-toolbar-btn" data-action="toggle-stats" title="Match stats" aria-label="Match statistics">\u25C8</button>
        <button class="rd-toolbar-btn" data-action="toggle-inspector" title="Inspector" aria-label="Card inspector">\u25A4</button>
        <button class="rd-toolbar-btn" data-action="toggle-board" data-testid="toggle-board" title="Switch to Astra board" aria-label="Switch to Astra board">\u25C6</button>
        ${Ma(t.gameplaySkin)}
        <button class="rd-toolbar-btn" data-action="${A}" data-testid="exit-match-btn" title="${S}" aria-label="${S}">\u2715</button>
      </div>
    </div>
  </header>`}function nt(e,t,a,n,s){let r=e.length===0,c=r?"rd-point-row empty":"rd-point-row";return r?`<div class="${c}" data-side="${s}" aria-label="${t} row">
      <span class="rd-row-label">${t}</span>
      <span class="rd-row-empty-text">No secured cards</span>
    </div>`:`<div class="${c}" data-side="${s}" aria-label="${t} row">
    <span class="rd-row-label">${t}</span>
    <div class="rd-row-cards">
      ${e.map(p=>K(p)).join("")}
    </div>
  </div>`}function st(e,t){let n=e.length===0,s=n?"rd-enduring-row empty":"rd-enduring-row";return n?`<div class="${s}" data-side="${t}" aria-label="Enduring effects">
      <span class="rd-row-label">Enduring</span>
      <span class="rd-row-empty-text">None</span>
    </div>`:`<div class="${s}" data-side="${t}" aria-label="Enduring effects">
    <span class="rd-row-label">Enduring</span>
    <div class="rd-row-cards">
      ${e.map(i=>K(i)).join("")}
    </div>
  </div>`}function ae(e,t,a,n){let s=t===0,i="";n==="draw"&&(s?i="depleted":t<=4?i="low":t<=12?i="medium":i="high");let r=s?"rd-pile-card empty":"rd-pile-card",c=i?` data-depletion="${u(i)}"`:"",p=a?`<div class="rd-pile-top" aria-label="Top card">${u(a.identity)}</div>`:"",o="";if(n==="draw"&&!s){let d=i==="high"?4:i==="medium"?3:2,h=Array.from({length:d},(f,m)=>`<div class="rd-pile-cardback mini" style="--pile-layer:${m}" aria-hidden="true"></div>`).join("");o=`<div class="rd-pile-stack" data-tiers="${d}" aria-hidden="true">${h}</div>`}return`<div class="${r}" data-pile="${n}"${c} aria-label="${e} pile, ${t} cards" role="button" tabindex="0">
    ${o}
    <div class="rd-pile-face">
      <div class="rd-pile-label">${e}</div>
      <div class="rd-pile-count">${t}</div>
      ${p}
      ${n==="draw"&&s?'<div class="rd-pile-exhausted" aria-label="Draw pile exhausted">Exhausted</div>':""}
    </div>
  </div>`}function Ha(e){let t=e.opponent.secured??0,a=e.opponent.goal??21,n=e.human.secured??0,s=e.human.goal??21;return`<div class="rd-score-rail" data-testid="score-rail-inner">
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
  </div>`}function Ua(e,t,a,n,s){let i=e.stack??[],r=i.some(m=>m.isResolving),c=i[0],p=e.status==="HUMAN_DECISION",o=e.status==="AI_DECISION",l=e.status==="OPPONENT_DECISION",d=n?.windowType==="response"||n?.windowType==="interrupt";if(c){let m=c.isHuman?"PLAYED BY YOU":`PLAYED BY ${u(e.opponent.displayName).toUpperCase()}`,y=c.isResolving?"RESOLVING":d?"DECLARED":"ACTIVE";return`<div class="rd-active-stage has-card" aria-label="Active card" role="region">
      <div class="rd-stage-glow"></div>
      <div class="rd-stage-card">
        <div class="rd-stage-card-inner">${u(c.description)}</div>
      </div>
      <div class="rd-stage-actor">${u(m)}</div>
      <div class="rd-stage-status ${c.isResolving?"resolving":"pending"}">${y}</div>
      ${d?'<div class="rd-stage-prompt">Response window open</div>':""}
    </div>`}if(o)return`<div class="rd-active-stage ai-thinking" aria-label="AI is deciding" role="region">
      <div class="rd-stage-glow ai"></div>
      <div class="rd-stage-actor">${u(e.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is deciding\u2026</span>
      </div>
    </div>`;if(l)return`<div class="rd-active-stage opponent-thinking" aria-label="Opponent is deciding" role="region">
      <div class="rd-stage-glow opponent"></div>
      <div class="rd-stage-actor">${u(e.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is choosing\u2026</span>
      </div>
    </div>`;if(p){let m=e.actions?.length??0,y=z(e.match.phase),g=t.selectedSourceCardId,b=g?(e.battlefield?.humanHand??[]).find(T=>T.entityId===g||T.cardId===g):null,v=b?.identity??null,I=b?`<div class="rd-stage-card"><div class="rd-stage-card-inner">${u(v||"Selected")}</div></div>`:"",$=b?`${u(v||"Card")} selected \u2014 choose an action below`:"",E=e.match.fullTurnSequence,S=(e.battlefield?.humanHand??[]).length,A=b?"":`<div class="rd-stage-board-context">
      <div class="rd-stage-actor">TURN ${E} \xB7 ${u(y)}</div>
      <div class="rd-stage-handcount">${S} card${S!==1?"s":""} in hand</div>
    </div>`;return`<div class="rd-active-stage awaiting ${b?"has-selection":""}" aria-label="Awaiting your action" role="region">
      <div class="rd-stage-board-art" aria-hidden="true"></div>
      <div class="rd-stage-glow human"></div>
      <div class="rd-stage-idle-content">
        <div class="rd-stage-action-cluster">
          ${b?'<div class="rd-stage-actor">SELECTED</div>':""}
          ${A}
          ${I}
          ${$?`<div class="rd-stage-prompt">${$}</div>`:""}
          ${b?'<div class="rd-stage-cancel"><button class="rd-stage-cancel-btn" data-action="cancel-selection" aria-label="Cancel card selection">\u2715 Cancel</button></div>':""}
        </div>
        <div class="rd-stage-bubble-fx" aria-hidden="true">
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
        </div>
      </div>
    </div>`}let h=e.match.fullTurnSequence,f=z(e.match.phase);return`<div class="rd-active-stage idle" aria-label="Battlefield" role="region">
    <div class="rd-stage-board-art" aria-hidden="true"></div>
    <div class="rd-stage-idle-content">
      <div class="rd-stage-rune" aria-hidden="true"></div>
      <div class="rd-stage-actor">TURN ${h}</div>
      <div class="rd-stage-phase">${u(f)}</div>
      <div class="rd-stage-prompt">Awaiting next action</div>
    </div>
  </div>`}function Ba(e){let t=e.stack??[],a=e.match.priorityOwnerId===e.human.playerId?"YOU":e.match.priorityOwnerId===e.opponent.playerId?e.opponent.displayName.toUpperCase():"";if(t.length===0){let n=a?a==="YOU"?"Your priority \u2014 no pending effects":`${u(a)} has priority \u2014 no pending effects`:"No pending effects";return`<div class="rd-resolution-stack empty" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
      <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">0</span></div>
      <div class="rd-stack-empty">${u(n)}</div>
      ${a?`<div class="rd-stack-priority">PRIORITY: ${u(a)}</div>`:""}
    </div>`}return`<div class="rd-resolution-stack" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
    <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">${t.length}</span></div>
    <div class="rd-stack-list">
      ${t.map((n,s)=>{let i=n.isResolving?"rd-stack-entry resolving":"rd-stack-entry",r=n.actorName||(n.isHuman?"You":e.opponent.displayName),c=n.isResolving?"Resolving":n.status??"Pending";return`<div class="${i}" style="--stack-idx:${s}">
          <div class="rd-stack-entry-num">${s+1}</div>
          <div class="rd-stack-entry-body">
            <div class="rd-stack-entry-desc">${u(n.description)}</div>
            <div class="rd-stack-entry-meta">${u(r)} \xB7 ${u(c)}</div>
          </div>
        </div>`}).join("")}
    </div>
    ${a?`<div class="rd-stack-priority">PRIORITY: ${u(a)}</div>`:""}
  </div>`}function Ga(e,t,a,n,s,i,r,c){let p=e.actions.find(T=>T.isPass),o=p&&!i?`<button class="rd-action-pass" data-action-id="${u(p.actionId)}" data-key="P">Pass</button>`:"";if(n)return`<div class="rd-contextual-actions ai-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${u(e.opponent.displayName)} is deciding\u2026</div>
    </div>`;if(s)return`<div class="rd-contextual-actions opponent-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${u(e.opponent.displayName)} is choosing\u2026</div>
    </div>`;if(i)return`<div class="rd-contextual-actions read-only" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">Read-only mode</span>
    </div>`;let l=e.actions||[];if(l.length===0&&!p)return`<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;let d={},h=e?.battlefield?.humanHand??[];for(let T of h)T.entityId&&(d[T.entityId]=T);let f=e?.battlefield?.topPR??[],m=e?.battlefield?.topER??[],y=e?.battlefield?.bottomPR??[],g=e?.battlefield?.bottomER??[];[...f,...m,...y,...g].forEach(T=>{T?.entityId&&(d[T.entityId]=T)});let b=e?.zones?.swap??[],v=["Left","Center","Right"];for(let T=0;T<3;T++){let N=b[T]??null;N&&(N.card?.entityId&&(d[N.card.entityId]=N.card),N.entityId&&(d[N.entityId]={entityId:N.entityId,identity:N.faceDown?v[T]??`Slot ${T+1}`:N.card?.identity??`Slot ${T+1}`,faceDown:N.faceDown===!0,slotIndex:T}))}let I=Me(l,{cardRegistry:d,selectedSourceCardId:t.selectedSourceCardId??null});if(I.length===0&&!p)return`<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;let $=t.selectedIntentKey??null,E=t.selectedActionId??null,S=t.selectedSourceCardId??null,A=$?I.find(T=>T.id===$):null;if(E){let T=l.find(N=>N.actionId===E);if(T)return T.targets?.required&&!(t.selectedTargets?.length>0)?ja(e,t,T,I,o,r,c,d):Va(e,t,T,I,o,r,c,d)}return A&&A.selectionType!==C.DIRECT&&A.variants?.length>1?Fa(e,t,A,o,r,c,d):Ya(e,t,I,o,r,c,S,d)}function Ya(e,t,a,n,s,i,r,c){let p=Ue(a),o=Ge(a),l=e.match.phase==="Start"||e.match.phase==="SETUP",d=o&&i?.passInfo?`<div class="rd-response-hint" data-testid="pass-info">${u(i.passInfo)}</div>`:"",h=e.match.priorityOwnerId===e.human.playerId?"You":e.match.priorityOwnerId===e.opponent.playerId?e.opponent.displayName:"",f=h?`<div class="rd-action-priority">\u25CF Priority: ${u(h)}</div>`:"",m="";if(r){let $=c[r]?.identity??"?",S=a.filter(A=>A.selectedCardMatch).map(A=>A.label).join(" \xB7 ");m=`<div class="rd-selected-card-header" data-testid="selected-card-header">
      <span class="rd-selected-card-label">SELECTED</span>
      <span class="rd-selected-card-id">${u($)}</span>
      ${S?`<span class="rd-selected-card-intents">${u(S)}</span>`:""}
    </div>`}let y="";if(r){let I=a.filter($=>$.selectedCardMatch);I.length>0?y=`<div class="rd-action-category rd-card-centric" data-testid="action-card-centric">
        <div class="rd-action-category-body">
          ${I.map($=>it($,r,c,!1)).join("")}
        </div>
      </div>`:y=`<div class="rd-action-category rd-card-centric" data-testid="action-card-centric">
        <div class="rd-action-category-body">
          <div class="rd-group-empty">No actions available for this card.</div>
        </div>
      </div>`}else y=p.map(I=>{let $=Be(a,I);if($.length===0)return"";let E=_e(I),S=He(I),A=I===w.RESPOND,T=$.map(N=>it(N,r,c,A)).join("");return`<div class="rd-action-category" data-testid="action-category-${u(I)}">
        <div class="rd-action-category-header">
          <span class="rd-action-category-icon" aria-hidden="true">${S}</span>
          <span class="rd-action-category-label">${u(E)}</span>
        </div>
        <div class="rd-action-category-body">${T}</div>
      </div>`}).join("");let g="";if(l&&!r){let I=[];if((e.zones?.draw?.count??0)>0){let T=(e.battlefield?.humanHand?.length??0)===0?"2x Draw (empty hand)":"Draw from Pile";I.push({label:T,desc:"Draw card(s) from the top of the Draw Pile.",icon:"\u2193"})}(e.zones?.swap??[]).some(A=>A&&A.card&&!A.faceDown)&&I.push({label:"Face-up Draw",desc:"Take a face-up card from the Swap Bar.",icon:"\u2191"}),I.length>0&&(g=`<div class="rd-action-category rd-preview-category" data-testid="action-category-preview">
      <div class="rd-action-category-header">
        <span class="rd-action-category-icon" aria-hidden="true">\u29C9</span>
        <span class="rd-action-category-label">Upcoming</span>
      </div>
      <div class="rd-action-category-body">${I.map(T=>`<button class="rd-group-btn preview" disabled aria-label="${u(T.label)} (available in Action Phase)" title="Available after entering Action Phase">
    <span class="rd-group-main">
      <span class="rd-group-label">${u(T.label)}</span>
    </span>
    <span class="rd-group-desc">${u(T.desc)}</span>
    <span class="rd-group-meta"><span class="rd-timing-badge preview-badge">Action Phase</span></span>
  </button>`).join("")}</div>
    </div>`)}let b=a.filter(I=>!I.isPass).length,v=!r&&b>0&&!o?`<div class="rd-action-prompt" data-testid="action-prompt">${b} legal action${b!==1?"s":""}</div>`:"";return`<div class="rd-contextual-actions" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">${o?"RESPONSE":"ACTIONS"}</div>
    ${d}
    ${m}
    ${v}
    <div class="rd-action-categories">${y}${g}</div>
    <div class="rd-action-footer">${n}</div>
    ${f}
  </div>`}function it(e,t,a,n){let s=["rd-group-btn"];e.isPass&&s.push("pass"),e.selectedCardMatch&&s.push("card-match"),n&&s.push("response");let i=e.sourceCardIds.length>0,r=i&&t&&e.sourceCardIds.includes(t);i&&t&&!r?s.push("dimmed"):s.push("available");let c=i&&t&&!r?'disabled aria-disabled="true"':"",p="";if(e.variantCount>1){let f=e.selectionType===C.SOURCE?`${e.variantCount} cards`:e.selectionType===C.COMBINATION?`${e.variantCount} configs`:e.selectionType===C.TARGET?`${e.variantCount} targets`:`${e.variantCount} options`;p=`<span class="rd-group-count">${u(f)}</span>`}let o=e.scoreValue!=null?`<span class="rd-group-score">+${u(e.scoreValue)}</span>`:"",l=e.timingClass&&e.timingClass!=="ACTION"&&e.timingClass!=="ORDINARY"?`<span class="rd-timing-badge">${u(e.timingLabel)}</span>`:"",d=e.isFullTurn?'<span class="rd-turn-badge">Full Turn</span>':"",h=e.description?`<span class="rd-group-desc">${u(e.description)}</span>`:"";return`<button class="${s.join(" ")}" data-group-id="${u(e.id)}" data-action-family="${u(e.family)}" aria-label="${u(e.label)}${e.variantCount>1?` \u2014 ${e.variantCount} options`:""}" ${c}>
    <span class="rd-group-main">
      <span class="rd-group-icon" aria-hidden="true">${u(De(e.family))}</span>
      <span class="rd-group-label">${u(e.label)}</span>
      ${p}${o}
    </span>
    ${h}
    <span class="rd-group-meta">${l}${d}</span>
  </button>`}function Fa(e,t,a,n,s,i,r){let c=a.variants??[],p=a.category===w.RESPOND,o=c.map(l=>{let d=["rd-variant-btn"];t.selectedSourceCardId&&l.sourceHandles.includes(t.selectedSourceCardId)&&d.push("card-match");let h="";if(l.sourceHandles.length>0){let f=l.sourceHandles.map(m=>r[m]?.identity??"?").join(" + ");f!==l.label&&(h=`<span class="rd-variant-detail">${u(f)}</span>`)}return`<button class="${d.join(" ")}" data-variant-action-id="${u(l.actionId)}" aria-label="${u(l.label)}">
      <span class="rd-variant-label">${u(l.label)}</span>
      ${h}
    </button>`}).join("");return`<div class="rd-contextual-actions variant-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-variant" aria-label="Back to actions">\u2190</button>
      <span class="rd-actions-title">${u(a.label)}</span>
    </div>
    <div class="rd-variant-prompt">Choose ${u(Wa(a))}:</div>
    <div class="rd-variant-list" role="group" aria-label="${u(a.label)} variants">${o}</div>
    <div class="rd-action-footer">
      <button class="rd-cancel-btn" data-action="cancel-variant" aria-label="Cancel variant selection">Cancel</button>
    </div>
  </div>`}function Wa(e){switch(e.selectionType){case C.SOURCE:return"a card";case C.COMBINATION:return"a configuration";case C.TARGET:return"a target";case C.VARIANT:return"an effect";default:return"an option"}}function ja(e,t,a,n,s,i,r,c){let p=a.targets?.legalTargetIds??[],o=a.family==="swap-bar"&&a.mode==="face-down";if(o){let y=(a.sourceEntityIds??a.sourceHandles??[])[0];if(y&&n){let g=n.find(b=>b.family==="swap-bar"&&b.mode==="face-down");if(g){let b=new Set;for(let v of g.actions)if((v.sourceHandles??v.sourceEntityIds??[])[0]===y)for(let $ of v.targetHandles??v.targets?.legalTargetIds??[])b.add($);b.size>1&&(p=[...b])}}}let l=p.map(y=>{let g=c[y],b=g?.identity??y;return o&&g?.faceDown&&(b=g?.identity??"Face-down"),`<button class="rd-target-btn ${t.selectedTargets?.includes(y)?"selected":""}" data-testid="target-button" data-target-id="${u(y)}" aria-label="Select target ${u(b)}">
      ${u(b)}
    </button>`}).join(""),d=a.displayLabel??a.shortLabel??"Action",h=t.selectedTargets?.length??0,f=t.selectedActionId??a.actionId,m=h===0?'disabled aria-disabled="true"':"";return`<div class="rd-contextual-actions target-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-target" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">${u(d)}</span>
    </div>
    <div class="rd-target-prompt">Select a target <span class="rd-target-count">(${p.length} available)</span></div>
    <div class="rd-target-list" role="group" aria-label="Select a target">${l}</div>
    <div class="rd-action-footer">
      <button class="rd-play-btn" data-testid="confirm-action" data-action-id="${u(f)}" aria-label="Play ${u(d)}" ${m}>Play</button>
      <button class="rd-cancel-btn" data-action="cancel-target" aria-label="Cancel target selection">Cancel</button>
    </div>
  </div>`}function Va(e,t,a,n,s,i,r,c){let p=a.displayLabel??a.shortLabel??"Action",o=a.sourceEntityIds??[],l=a.targets?.legalTargetIds??[],d=o.map(g=>c[g]?.identity??g).join(", "),h=l.map(g=>c[g]?.identity??g).join(", "),f=a.costs?.length>0?a.costs.map(g=>g.label??g.type??"").join(", "):"",m=a.timingClass==="ACTION"&&!a.isResponse,y=_(a.timingClass??"ACTION");return`<div class="rd-contextual-actions confirm-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-confirm" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">Confirm</span>
    </div>
    <div class="rd-confirm-box" data-testid="action-confirm">
      <div class="rd-confirm-action">${u(p)}</div>
      ${d?`<div class="rd-confirm-sources">Source: ${u(d)}</div>`:""}
      ${h?`<div class="rd-confirm-targets">Target: ${u(h)}</div>`:""}
      ${m?'<div class="rd-confirm-turn">Full Turn commitment</div>':""}
      ${y&&y!=="Action"?`<div class="rd-confirm-timing">${u(y)}</div>`:""}
      ${f?`<div class="rd-confirm-costs">Costs: ${u(f)}</div>`:""}
    </div>
    <div class="rd-action-footer">
      <button class="rd-confirm-btn" data-testid="confirm-action" data-action-id="${u(a.actionId)}" aria-label="Confirm: ${u(p)}">Confirm</button>
      <button class="rd-cancel-btn" data-action="cancel-confirm" aria-label="Cancel">Cancel</button>
    </div>
  </div>`}function za(e){if(!e)return"system";let t=String(e).toUpperCase();return t.includes("DRAW")?"draw":t.includes("SCORE")||t.includes("POINTS")?"score":t.includes("SCUTTLE")||t.includes("SWAP")||t.includes("COUNTER")||t.includes("DISCARD")||t.includes("EXILE")||t.includes("BOUNCE")||t.includes("TAP")||t.includes("PURGE")||t.includes("ROW_CLEAR")||t.includes("SUPER")||t.includes("DECLARATION")||t.includes("DECLARE_PRIMARY")?"action":t.includes("ANCHOR_ENTERED")||t.includes("ATTACHMENT_RESOLVED")||t.includes("RED_JOKER")||t.includes("BOARD_LOCK")||t.includes("RESOLVE")||t.includes("CANCEL")?"effect":t.includes("RESPONSE_WINDOW_CLOSED")||t.includes("PRIORITY_CLOSED")||t.includes("RESPONSE_DECLINED")||t.includes("PRIORITY_PASSED")?"priority":t.includes("ENTER_ACTION")||t.includes("BEGIN_START")||t.includes("PHASE")||t.includes("TURN")||t.includes("PASS")?"phase":t.includes("TERMINAL")||t.includes("GAME_OVER")?"terminal":"system"}var rt={draw:"\u{1F0CF}",score:"\u2605",action:"\u21AF",effect:"\u2726",phase:"\u25C6",priority:"\u22EF",terminal:"\u{1F3C1}",system:"\u2022"};function ot(e){return e==="P1"?"P1":e==="P2"?"P2":"SYS"}function qa(e,t){let n=t||"Opponent",s={};return e==="P1"?(s["Player 1"]="You",s["Player 2"]=n):e==="P2"&&(s["Player 2"]="You",s["Player 1"]=n),Object.keys(s).length===0?null:i=>{if(!i)return i;let r=i;for(let[c,p]of Object.entries(s))r=r.replaceAll(c,p);return r}}function Ka(e,t){let a=arguments[2]??null,n=arguments[3]??null,s=arguments[4]??null,i=[];if(e&&e.length>0&&(i=We(e,a).filter(o=>{let l=o.description??o.text??"",d=o.type??"";return!(d.includes("SNAPSHOT")||d.includes("VOLTAGE")||d.includes("CORE_INIT")||d.includes("CORE_PREPARE")||d.includes("CORE_PREPARED")||d.includes("CORE_SETUP")||d.includes("CORE_APPLY")||d.includes("AUTONOMY_INIT")||d.includes("AUTONOMY_PREPARE")||l===`${d.replace(/_/g," ").toLowerCase()}.`&&(d.includes("CORE_")&&!d.includes("RESOLVED")&&!d.includes("ENTERED")||d.includes("AUTONOMY_")))}).map(o=>({description:n?n(o.description??o.text??""):o.description??o.text??"",type:o.type??"",actorId:o.actorId??null,category:za(o.type),isSystem:!1}))),t&&t.length>0){for(let c of t)if(c.type==="CHAT_VISIBILITY"){let p=c.displayName??"Opponent",o=c.hidden?"has hidden Match Chat.":"has restored Match Chat.";i.push({description:`${p} ${o}`,type:"CHAT_VISIBILITY",actorId:null,category:"system",isSystem:!0})}}let r=i.slice(-40).reverse();return r.length===0?`<div class="rd-game-log" data-testid="event-log" role="log">
      <div class="rd-game-log-empty"><span class="rd-log-empty-icon">\u22EF</span>No events yet</div>
    </div>`:`<div class="rd-game-log" data-testid="event-log" role="log">
    ${r.map((c,p)=>{let o=rt[c.category]??rt.system,l=s&&c.actorId===s?"YOU":ot(c.actorId),d=p===0;return`<div class="${["rd-log-entry",c.isSystem?"rd-log-system":"",d?"rd-log-new":""].filter(Boolean).join(" ")}" data-event-category="${u(c.category)}">
        <span class="rd-log-actor" data-actor="${u(l)}">${u(l)}</span>
        <span class="rd-log-icon">${o}</span>
        <span class="event-description">${u(c.description)}</span>
      </div>`}).join("")}
  </div>`}function Qa(e){if(!e||!e.length)return"";let t=e.slice(0,4),a=e.length>4?e.length-4:0;return`<div class="rd-plate-badges">
    ${t.map(n=>`<span class="rd-badge" title="${u(n.name)}">${u(n.icon||n.id.slice(0,1).toUpperCase())}</span>`).join("")}
    ${a>0?`<span class="rd-badge-overflow">+${a}</span>`:""}
  </div>`}function ct(e,t,a){let n=Qa(e.badges),s=a.mode?.isNetwork===!0,i=t==="human"||e.isLocalPlayer===!0,r=e.rating?`<span class="rd-plate-rating">${e.rating.value}${e.rating.provisional?"?":""}</span>`:e.aiRating!=null?`<span class="rd-plate-rating">AI ${e.aiRating}</span>`:"",c=!i&&!e.isHuman&&e.difficulty?`<span class="rd-plate-difficulty" aria-label="AI difficulty ${u(e.difficulty)}">${u(e.difficulty)}</span>`:"",p=a.match.activePlayerId===e.playerId,o;i?o="You":o=e.isHuman?"Human":"AI Opponent";let l=e.isHuman&&e.rating?(()=>{let m=H(e.rating.value,{ratedMatches:e.rating.ratedMatches});return m.isPlacement?"":`<span class="rd-prestige-rank" data-testid="profile-rank-label-${t}">${u(U(m.tier,m.division))}</span>`})():e.isHuman&&e.rank?`<span class="rd-prestige-rank" data-testid="profile-rank-label-${t}">${u(e.rank)}</span>`:"",d=`<div class="rd-prestige-banner rd-prestige-banner-${t}" data-testid="profile-banner-${t}" aria-label="${t==="opponent"?"Opponent":"Player"} prestige banner">
    <div class="rd-prestige-banner-bg" aria-hidden="true"></div>
    <div class="rd-prestige-banner-scrim" aria-hidden="true"></div>
    <div class="rd-prestige-banner-content">
      <span class="rd-prestige-banner-name">${u(e.displayName)}</span>
      <span class="rd-prestige-banner-meta">${u(o)} ${c} ${r} ${l} ${n}</span>
    </div>
  </div>`,h=t==="opponent"?"":`<div class="rd-profile-identity">
      <div class="rd-profile-avatar ${t} ${p?"active":""}">${u(e.monogram)}</div>
    </div>`,f=t==="opponent"?`${d}`:`${h}${d}`;return`<div class="rd-profile-block ${t} ${p?"active":""}" data-testid="profile-${t}">
    ${f}
  </div>`}function Xa(e,t=null){if(t&&Array.isArray(t)&&t.length>0){let n=t.slice(0,7).map(i=>K(i)).join(""),s=t.length>7?`<span class="rd-opponent-hand-count">+${t.length-7}</span>`:"";return`<div class="rd-opponent-hand rd-opponent-hand-omniscient" aria-label="Opponent hand, ${t.length} cards (face-up)">
      ${n}
      ${s}
    </div>`}let a=Array.from({length:Math.min(e,7)},()=>'<div class="rd-card-back" aria-hidden="true"></div>').join("");return`<div class="rd-opponent-hand" aria-label="Opponent hand, ${e} cards">
    ${a}
    ${e>7?`<span class="rd-opponent-hand-count">+${e-7}</span>`:""}
  </div>`}function Ja(e,t){return!e||!e.length?'<div class="rd-hand hand-empty" aria-label="Your hand is empty"><span class="hand-empty">Your hand is empty.</span></div>':`<div class="rd-hand" aria-label="Your hand, ${e.length} cards">
    ${e.map(a=>K(a,{isHand:!0,selectedSourceCardId:t.selectedSourceCardId,selectedActionId:t.selectedActionId,cardActionHints:t.cardActionHints,isHumanTurn:t.isHumanTurn,isResponseWindow:t.isResponseWindow})).join("")}
  </div>`}function lt(e){let t=new Set((e.statusMarkers??[]).map(a=>a?.type));return{id:e.entityId??e.id,identity:e.identity,pointValue:e.pointValue,tapped:t.has("TAPPED"),aegis:t.has("AEGIS"),providesGuard:t.has("GUARD"),exileBound:t.has("EXILE_BOUND"),jackHostId:t.has("ATTACHMENT")?!0:void 0,faceDown:!1}}function K(e,t={}){if(!e)return"";let a=["rd-card"];t.isHand&&a.push("hand-card"),e.statusMarkers?.some(o=>o.type==="TAPPED")&&a.push("tapped"),t.selectedSourceCardId&&e.entityId===t.selectedSourceCardId&&a.push("selected"),e.legalSource&&a.push("legal-source","has-legal-actions"),!e.legalSource&&t.isHand&&a.push("no-legal-actions"),e.isSuper&&a.push("super-eligible"),e.statusMarkers?.some(o=>o.type==="LEGAL_TARGET")&&a.push("legal-target");let n=t.isHand&&e.legalSource?'<span class="legal-action-indicator" aria-label="Has legal actions">\u25CF</span>':"",s=t.isHand&&e.isSuper?'<span class="super-eligible-badge" aria-label="Super eligible">\u2605</span>':"",i="";if(t.isHand)if(e.legalSource&&t.cardActionHints){let o=t.cardActionHints.get(e.entityId)??[];if(o.length>0){let l=o.slice(0,4),d=o.length>4?`, +${o.length-4} more`:"";i=`${e.identity??"Card"} \u2014 available: ${l.join(", ")}${d}`}else i=`${e.identity??"Card"} \u2014 has legal actions`}else e.legalSource||(e.statusMarkers?.some(l=>l.type==="TAPPED")?i=`${e.identity??"Card"} \u2014 tapped, cannot be used this turn`:t.isResponseWindow?i=`${e.identity??"Card"} \u2014 cannot be used as a response right now`:t.isHumanTurn?i=`${e.identity??"Card"} \u2014 no legal actions with this card right now`:i=`${e.identity??"Card"} \u2014 wait for your turn`);let r=t.isHand?`aria-label="${u(i||e.identity||"Card")}"`:"",c=X(lt(e),{showMechanicIcons:t.isHand===!0}),p=t.isHand&&i?`<div class="rd-card-tooltip" role="tooltip" data-testid="card-tooltip">${u(i)}</div>`:"";return`<div class="${a.join(" ")}" data-card-id="${u(e.entityId)}" data-card-identity="${u(e.identity??"")}" data-testid="board-card" ${r} title="${u(i||e.identity||"Card")}">
    ${c}
    ${n}${s}
    ${e.isGeneratedCopy?'<div class="rd-card-copy-badge">Copy</div>':""}
    ${p}
  </div>`}function Za(e,t,a,n){let{swap:s}=e.zones,i=s&&s.length?s:[null,null,null],r=a&&!n?(e.actions||[]).filter(l=>l.family==="swap-bar"&&l.mode==="face-up-draw"):[],c=new Map;for(let l of r){let d=(l.targetHandles??l.targets?.legalTargetIds??[])[0];d&&c.set(d,l)}let p=[null,null,null];for(let l=0;l<3;l++)p[l]=i[l]??null;return`<div class="rd-swap-bar" aria-label="Swap bar">
    <span class="rd-swap-label">SWAP BAR</span>
    <div class="rd-swap-slots">
      ${Array.from({length:3},(l,d)=>{let h=p[d];if(h&&h.card){let f=lt(h.card),m=X(f,{zoneClass:"swap"}),y=h.card.entityId??h.entityId,g=c.get(y),b=g?`<button class="rd-swap-take-btn" data-action="swap-take" data-action-id="${u(g.actionId)}" data-testid="swap-take-btn" aria-label="Take ${u(h.card.identity??"card")} from swap bar">Take</button>`:"";return`<div class="rd-swap-slot has-card" data-swap-index="${d}" aria-label="Swap slot ${d+1}: ${u(h.card.identity??"card")}">
        ${m}
        ${b}
      </div>`}return h&&h.faceDown?`<div class="rd-swap-slot face-down" data-swap-index="${d}" aria-label="Swap slot ${d+1}: face down" aria-hidden="true">
        ${fe("mini")}
      </div>`:`<div class="rd-swap-slot empty" data-swap-index="${d}" aria-hidden="true"></div>`}).join("")}
    </div>
  </div>`}function en(e){let t=String(e??"").toLowerCase();return t.includes("super")?"super":t.includes("instant")||t.includes("interrupt")?"instant":t.includes("quick")?"quick":t.includes("scoring")?"scoring":t.includes("anchor")||t.includes("attachment")?"anchor":t.includes("passive")?"passive":t.includes("action")?"action":"effect"}function tn(e,t){let a=e.identity;if(!a)return`<div class="inspector-essentials-fallback">
      <span class="inspector-essentials-identity">${u(e.identity??"unknown")}</span>
      <span class="inspector-essentials-points">${e.pointValue??0} points</span>
    </div>`;let n=ne(a);if(!n)return"";let s=se(n.suit),i=n.art,r="center 20%";try{i=pe(a),r=he(a)}catch{}let c=[];t.tapped&&c.push({icon:"\u21BB",label:"Tapped",cls:"tapped"}),t.aegis&&c.push({icon:"\u2B21",label:"Aegis",cls:"aegis"}),t.providesGuard&&c.push({icon:"\u25D2",label:"Guard",cls:"guard"}),t.exileBound&&c.push({icon:"\u2298",label:"Exile-Bound",cls:"exile-bound"}),t.jackHostId&&c.push({icon:"\u26D3",label:"Attached",cls:"attached"});let p=(n.abilities??[]).map(l=>{let d=en(l.timing),h=l.restrictions?.length?`<div class="inspector-essentials-restrictions" aria-label="${l.restrictions.length} restrictions">${l.restrictions.map(()=>"<i></i>").join("")}</div>`:"";return`<article class="inspector-essentials-ability inspector-essentials-timing-${d}" data-ability-id="${u(l.id)}">
      <div class="inspector-essentials-ability-glow"></div>
      <span class="inspector-essentials-ability-icon" aria-hidden="true">${u(l.icon??"\u25C6")}</span>
      <div class="inspector-essentials-ability-body">
        <div class="inspector-essentials-ability-head">
          <h5>${u(l.title)}</h5>
          ${l.timing?`<span class="inspector-essentials-ability-timing">${u(l.timing)}</span>`:""}
        </div>
        <p>${u(l.summary??"")}</p>
      </div>
      ${h}
    </article>`}).join(""),o=[{label:"Points",value:n.prValue??0,cls:"pr"}];return n.erValue!==null&&n.erValue!==void 0&&o.push({label:"ER",value:n.erValue,cls:"er"}),`<div class="inspector-essentials tcg-suit-${s.id}" data-testid="inspector-essentials" style="--card-accent:${s.accent};--card-accent-2:${s.accent2}">
    <div class="inspector-essentials-banner" role="img" aria-label="${u(a)} card art" style="background-image:url('${u(i??"")}');background-position:${u(r)}">
      <div class="inspector-essentials-banner-overlay"></div>
      <div class="inspector-essentials-banner-content">
        <span class="inspector-essentials-rank">${u(n.rank)}${n.suit?`<span class="inspector-essentials-suit" aria-hidden="true">${u(n.suit)}</span>`:""}</span>
      </div>
    </div>
    <div class="inspector-essentials-values-row">
      ${o.map(l=>`<span class="inspector-essentials-value inspector-essentials-value-${l.cls}"><small>${l.label}</small><b>${u(l.value)}</b></span>`).join("")}
    </div>
    ${n.badges?.length?`<div class="inspector-essentials-badges">${n.badges.map(l=>`<span>${u(l)}</span>`).join("")}</div>`:""}
    ${c.length?`<div class="inspector-essentials-state" aria-label="Current card state">${c.map(l=>`<span class="inspector-essentials-state-chip inspector-essentials-state-${l.cls}"><b aria-hidden="true">${u(l.icon)}</b>${u(l.label)}</span>`).join("")}</div>`:""}
    <section class="inspector-essentials-abilities" aria-label="Card abilities">
      ${p||'<p class="inspector-essentials-no-abilities">Detailed rules pending.</p>'}
    </section>
    <p class="inspector-essentials-motto">${u(n.motto??"")}</p>
  </div>`}function an(e,t,a,n,s="board"){let i=t?.[e];if(!i)return"";let r=i.identity??null,c=ue(a,e),p=c.length>0,o=c.map(m=>{let y=Ie(m,t,n);return`<li class="inspector-action" data-action-id="${u(m.optionId)}">
      <span class="inspector-action-label">${u(m.displayLabel)}</span>
      ${y?.timing?`<span class="inspector-action-timing">${u(y.timing)}</span>`:""}
    </li>`}).join(""),l=p?null:$e("SOURCE_NOT_AVAILABLE",n),d=nn(i),h=sn(i),f=tn(i,Sa(i));return`<aside class="card-inspector" data-testid="card-inspector" role="region" aria-label="Card inspector: ${u(r??"unknown")}">
    <div class="inspector-face-toolbar" role="tablist" aria-label="Card inspector view">
      <span class="inspector-face-tab active" role="tab" aria-selected="true">Essentials</span>
      <button class="inspector-face-tab advanced-rules" data-inspector-advanced-rules="${u(r??"")}" data-card-id="${u(e)}" role="button" aria-label="Open advanced card rules" ${r?"":"disabled"}>Advanced Rules</button>
    </div>
    <div class="inspector-face-stage" data-inspector-face-view="essentials">${f}</div>
    ${d}
    <div class="inspector-actions">
      <h4>Legal actions for this card</h4>
      ${p?`<ul class="inspector-action-list">${o}</ul>`:'<p class="inspector-no-actions">No legal actions for this card right now.</p>'}
      ${l?`<div class="inspector-unavailable-detail" data-testid="inspector-unavailable-detail"><p class="inspector-unavailable-reason">${u(l.shortText)}</p>${l.detailedText?`<p class="inspector-unavailable-detail-text">${u(l.detailedText)}</p>`:""}${l.ruleRef?`<p class="inspector-unavailable-rule-ref">${u(l.ruleRef)}</p>`:""}</div>`:""}
    </div>
    ${h}
    <button class="inspector-close" data-testid="inspector-close" aria-label="Close inspector">Close</button>
  </aside>`}function nn(e){if(!e)return"";let t=e.statusMarkers??[];return t.length===0?"":`<div class="inspector-protection-status" data-testid="inspector-protection-status" role="region" aria-label="Protection and targeting status">
    <h4>Status</h4>
    <div class="inspector-protection-chips">${t.map(n=>{let s=n.label??n.type??"Unknown",i={AEGIS:"\u{1F6E1}",GUARD:"\u{1F6E1}",TAPPED:"\u2715",EXILE_BOUND:"\u27C1",ATTACHMENT:"\u{1F517}"}[n.type]??"\u25C6";return`<span class="inspector-protection-chip" data-status-type="${u(n.type)}"><b aria-hidden="true">${i}</b>${u(s)}</span>`}).join("")}</div>
  </div>`}function sn(e){if(!e)return"";let t=e.definition??e,a=t.rank??null,n=t.suit??null,s=e.identity??null;if(!a)return"";let i=[];return i.push({href:"#/play/academy",label:"Learn in Academy",icon:"\u{1F393}",testId:"inspector-academy-link"}),i.push({href:"#/puzzles",label:"Practice in Puzzles",icon:"\u{1F9E9}",testId:"inspector-puzzle-link"}),a&&n&&i.push({href:`#/ranks?rank=${u(a)}&suit=${u(n)}`,label:"Rank Anatomy",icon:"\u{1F4CA}",testId:"inspector-rank-link"}),`<div class="inspector-learning-links" data-testid="inspector-learning-links" role="region" aria-label="Learning links">
    <h4>Learn this card</h4>
    <div class="inspector-learning-link-list">${i.map(c=>`<a class="inspector-learning-link" href="${u(c.href)}" data-testid="${u(c.testId)}" role="link"><span class="inspector-learning-link-icon" aria-hidden="true">${c.icon}</span><span>${u(c.label)}</span></a>`).join("")}</div>
  </div>`}export{te as a,On as b,Ln as c,Ke as d,j as e,Tn as f,Me as g,kn as h,J as i,x as j,dn as k,un as l,pn as m,It as n,F as o,gn as p,yn as q,$s as r,Na as s};
//# sourceMappingURL=chunk-chunk-GK2FUYWN.js.map
