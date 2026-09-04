import { canonicalClone } from "./canonical-json.js";
import { applyAegis, applyTap, hasAegis, markExileBound, revealUntilStart } from "./lifecycle.js";
import { evaluateProtection, revalidateAttachments } from "./interactions.js";
import { cardPointValue, parseIdentity, resolveRankAction } from "./ranks.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
import { enumerateCoreEffectCandidates, resolveCoreEffect } from "./core-effects.js";
import { isCorePrivateChoiceEffect } from "./core-private-choice.js";
import { phase8Runtime } from "./phase8.js";
import type { CardId, CoreAdvancedAction, EngineState, MimicCopiedAction, PlayerId, RankAction, Visibility } from "./types.js";

export const CORE_ADVANCED_AUTHORITY_PROFILE = Object.freeze({
  id: "core-advanced-authority" as const,
  displayName: "Advanced Core Authority — Audited Public Supers, Rank 10, Ultras, Voltage & Royal Marriage",
  rulesVersion: "4.1",
  engineVersion: "4.2.6",
  playerCount: 2,
  enabledModules: [] as const,
  supportedFamilies: [
    "royal-marriage", "queens-court", "super-two-score", "super-two-hold", "super-four-exchange", "super-eight", "super-jack",
    "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "rank10-diamond-mimic", "rank10-club-foundation",
    "super-ace", "king-spade-counter", "wild-sovereignty", "board-lock", "ultra-three-black-public", "ultra-three-red",
    "ultra-two-black-two-red", "voltage-five-gy-bottom", "voltage-three-choice", "voltage-four-prediction",
    "voltage-five-refine", "special-scoring-riders"
  ] as const,
  excludedSystems: [
    "super-three-private", "super-five-private", "super-six-private", "super-seven-sequential",
    "rank10-generated-effect-copy",
    "sudden-death-autonomy", "optional-modules", "multiplayer"
  ] as const,
  rationale: "Engine-owned advanced public Core slice. Queen's Court, 10♣ Foundation, ⭐2 Hold, Voltage 3/4/5 Refine, scoring riders, and Black Joker Board Lock Quick are now supported. Hidden Super branches (⭐3/5/6/7), generated effect copy, and Sudden Death remain fail-closed."
});

export const CORE_UNRESTRICTED_AUTHORITY_PROFILE = Object.freeze({
  id: "core-unrestricted-authority" as const,
  displayName: "Unrestricted Core Authority — Complete Core including Hidden Supers, Generated Effects, Sudden Death",
  rulesVersion: "4.1",
  engineVersion: "4.2.6",
  playerCount: 2,
  enabledModules: [] as const,
  supportedFamilies: [
    "royal-marriage", "queens-court", "super-two-score", "super-two-hold", "super-four-exchange", "super-eight", "super-jack",
    "super-three-raid", "super-five-recycle", "super-six-dig", "super-seven-topdeck",
    "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "rank10-diamond-mimic", "rank10-club-foundation",
    "rank10-generated-effect-copy",
    "super-ace", "king-spade-counter", "wild-sovereignty", "board-lock", "ultra-three-black-public", "ultra-three-red",
    "ultra-two-black-two-red", "voltage-five-gy-bottom", "voltage-three-choice", "voltage-four-prediction",
    "voltage-five-refine", "special-scoring-riders",
    "sudden-death-autonomy"
  ] as const,
  excludedSystems: [
    "optional-modules", "multiplayer"
  ] as const,
  rationale: "Complete unrestricted Core. All advanced systems including hidden Super branches, generated effect copy, and Sudden Death are supported. Only optional modules and multiplayer remain excluded."
});

type Event = { type: string; payload: Record<string, unknown>; visibility?: Visibility };
export type AdvancedResolution = { ok: true; state: EngineState; events: Event[] } | { ok: false; code: string; message: string; details?: unknown };
const fail=(code:string,message:string,details?:unknown):AdvancedResolution=>details===undefined?{ok:false,code,message}:{ok:false,code,message,details};
const rank=(s:EngineState,id:CardId)=>parseIdentity(s.cards[id]?.identity ?? "")?.rank;
const suit=(s:EngineState,id:CardId)=>parseIdentity(s.cards[id]?.identity ?? "")?.suit;
const inHand=(s:EngineState,id:CardId,p:PlayerId)=>s.cards[id]?.controllerId===p&&s.cards[id]?.zone===`${p}_HAND`;
const profile=(s:EngineState)=>{const pid=(s.metadata.coreAuthority as any)?.profileId;return pid===CORE_ADVANCED_AUTHORITY_PROFILE.id||pid===CORE_UNRESTRICTED_AUTHORITY_PROFILE.id;};
const isUnrestricted=(s:EngineState)=>(s.metadata.coreAuthority as any)?.profileId===CORE_UNRESTRICTED_AUTHORITY_PROFILE.id;
const sourceSet=(ids:readonly CardId[])=>new Set(ids).size===ids.length;
const futureStart=(s:EngineState,p:PlayerId)=>({playerId:p,startSequence:(s.startPhaseSequenceByPlayer[p]??0)+1});
function color(s:EngineState,id:CardId):"black"|"red"|null{const x=suit(s,id);return x==="♣"||x==="♠"?"black":x==="♦"||x==="♥"?"red":null;}
function allRank(s:EngineState,ids:readonly CardId[],r:string,p:PlayerId){return sourceSet(ids)&&ids.every(id=>inHand(s,id,p)&&rank(s,id)===r);}
function exileBoundDestination(s:EngineState,id:CardId){return s.cards[id]?.state.exileBound===true?"EXILE":"GY" as const;}
function consumeRank10(s:EngineState,p:PlayerId,id:CardId):string|null{if(!inHand(s,id,p)||rank(s,id)!=="10")return "Rank-10 source must be controlled in hand";if(s.players[p]!.limits.rank10PlayedThisFT)return "Rank-10 effect limit already used";s.players[p]!.limits.rank10PlayedThisFT=true;markExileBound(s.cards[id]!);return null;}
function consumeUltra(s:EngineState,p:PlayerId,ids:readonly CardId[],recipe:"3-black"|"3-red"|"2-black-2-red"):string|null{if(s.players[p]!.limits.ultraPlayedThisFT)return "Ultra limit already used";if(!sourceSet(ids)||!ids.every(id=>inHand(s,id,p)))return "Ultra sources must be distinct controlled hand cards";const cs=ids.map(id=>color(s,id));if(recipe==="3-black"&&(ids.length!==3||cs.some(c=>c!=="black")))return "3 Black requires exactly three black cards";if(recipe==="3-red"&&(ids.length!==3||cs.some(c=>c!=="red")))return "3 Red requires exactly three red cards";if(recipe==="2-black-2-red"&&(ids.length!==4||cs.filter(c=>c==="black").length!==2||cs.filter(c=>c==="red").length!==2))return "2 Black + 2 Red requires two of each color";s.players[p]!.limits.ultraPlayedThisFT=true;return null;}

export function isAdvancedProfile(s:Readonly<EngineState>):boolean{const pid=(s.metadata.coreAuthority as any)?.profileId;return pid===CORE_ADVANCED_AUTHORITY_PROFILE.id||pid===CORE_UNRESTRICTED_AUTHORITY_PROFILE.id;}

export function advancedSourceIds(a:CoreAdvancedAction):CardId[]{
  switch(a.kind){
    case "advanced-royal-marriage": return [a.kingCardId,a.queenCardId];
    case "advanced-queens-court": return [...a.queenCardIds];
    case "advanced-super-two":case "advanced-super-four-exchange":case "advanced-super-eight-scuttle":case "advanced-super-j-tempo":case "advanced-super-three-raid":case "advanced-super-five-recycle":case "advanced-super-six-dig":case "advanced-super-seven-topdeck":case "advanced-ultra-three-black":case "advanced-ultra-two-black-two-red": return [...a.sourceCardIds];
    case "advanced-rank10-club-foundation":case "advanced-rank10-heart-tempo":case "advanced-rank10-spade-recovery": return [a.sourceCardId];
    case "advanced-rank10-diamond-mimic": { const ids:CardId[]=[a.sourceCardId]; if(a.pairedTwoId!==undefined) ids.push(a.pairedTwoId); return ids; }
    case "advanced-sudden-death-declare": return [...a.sourceCardIds];
    default:return [];
  }
}
export function advancedTargetIds(a:CoreAdvancedAction):CardId[]{switch(a.kind){case "advanced-super-two":case "advanced-super-eight-scuttle":return [a.targetCardId];case "advanced-rank10-club-foundation":return a.bonusScoreCardId!==undefined?[a.bonusScoreCardId]:[];case "advanced-rank10-spade-recovery":return [a.recoverCardId];case "advanced-rank10-diamond-mimic":return a.mimicAction.kind==="absolute-scuttle"?[a.mimicAction.targetCardId]:[];case "advanced-sudden-death-declare":return [a.scrapTargetCardId];default:return [];}}
export function advancedStackClass(a:CoreAdvancedAction):"super"|"ultra"|"royal-marriage"|"queens-court"|"rank10"|"voltage"{if(a.kind==="advanced-royal-marriage")return "royal-marriage";if(a.kind==="advanced-queens-court")return "queens-court";if(a.kind.startsWith("advanced-super"))return "super";if(a.kind.startsWith("advanced-ultra"))return "ultra";if(a.kind.startsWith("advanced-rank10"))return "rank10";return "voltage";}

export function resolveAdvancedCoreAction(input:EngineState,actorId:PlayerId,a:CoreAdvancedAction):AdvancedResolution{
  if(!profile(input))return fail("CORE_ADVANCED_PROFILE","Advanced Core Authority profile is not active");
  const s=canonicalClone(input),events:Event[]=[];
  switch(a.kind){
    case "advanced-royal-marriage":{
      if(!inHand(s,a.kingCardId,actorId)||!inHand(s,a.queenCardId,actorId)||rank(s,a.kingCardId)!=="K"||rank(s,a.queenCardId)!=="Q"||suit(s,a.kingCardId)!==suit(s,a.queenCardId))return fail("ROYAL_MARRIAGE","Royal Marriage requires same-suit King and Queen in hand");
      moveCard(s,a.kingCardId,`${actorId}_ER`,actorId);moveCard(s,a.queenCardId,`${actorId}_ER`,actorId);s.cards[a.kingCardId]!.state.anchorValue=suit(s,a.kingCardId)==="♠"?9:7;s.cards[a.queenCardId]!.state.anchorValue=0;applyAegis(s.cards[a.queenCardId]!,"Royal-Marriage-entry",futureStart(s,actorId));events.push({type:"CORE_ADVANCED_ROYAL_MARRIAGE_RESOLVED",payload:{kingCardId:a.kingCardId,queenCardId:a.queenCardId,suit:suit(s,a.kingCardId),isCombo:false}});break;
    }
    case "advanced-queens-court":{
      if(!sourceSet(a.queenCardIds)||a.queenCardIds.length!==2)return fail("QUEENS_COURT","Queen's Court requires exactly two distinct Queens");
      if(!a.queenCardIds.every(id=>inHand(s,id,actorId)&&rank(s,id)==="Q"))return fail("QUEENS_COURT","Queen's Court requires two Queens in hand");
      if(s.players[actorId]!.limits.queensCourtPlayedThisFT)return fail("QUEENS_COURT","Queen's Court already played this Full Turn");
      s.players[actorId]!.limits.queensCourtPlayedThisFT=true;
      for(const id of a.queenCardIds){moveCard(s,id,`${actorId}_ER`,actorId);s.cards[id]!.state.anchorValue=0;applyAegis(s.cards[id]!,"Queens-Court-entry",futureStart(s,actorId));}
      events.push({type:"CORE_ADVANCED_QUEENS_COURT_RESOLVED",payload:{queenCardIds:a.queenCardIds,actorId}});
      break;
    }
    case "advanced-super-two":{
      if(!allRank(s,a.sourceCardIds,"2",actorId))return fail("SUPER_TWO_SOURCE","⭐2 requires two Twos in hand");const t=s.cards[a.targetCardId];if(!t||t.controllerId===actorId||(!t.zone.endsWith("_PR")&&!t.zone.endsWith("_ER")))return fail("SUPER_TWO_TARGET","⭐2 requires enemy OTT target");const ev=evaluateProtection(s,actorId,t.id,{channel:"effect",shape:"single-target",hostile:true,operation:"control-change",bypasses:["guard","rank-effect-immunity"]});if(!ev.legal)return fail("PROTECTION_BLOCK",`⭐2 blocked by ${ev.blockedBy.join(", ")}`,ev);const row=t.zone.endsWith("_PR")?"PR":"ER";for(const id of a.sourceCardIds)moveCard(s,id,"GY");moveCard(s,t.id,`${actorId}_${row}`,actorId);if(a.disposition==="hold"){applyTap(t,{kind:"start-phase",sourceRef:"⭐2",expiresAt:futureStart(s,actorId)});}else{moveCard(s,t.id,`${actorId}_PR`,actorId);delete t.state.tapped;delete t.state.tapState;}events.push(...revalidateAttachments(s).map(e=>({type:e.type,payload:e.payload as Record<string,unknown>})));events.push({type:"CORE_ADVANCED_SUPER_TWO_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,targetCardId:t.id,disposition:a.disposition}});break;
    }
    case "advanced-super-four-exchange":{
      if(!allRank(s,a.sourceCardIds,"4",actorId))return fail("SUPER_FOUR_SOURCE","⭐4 requires two Fours in hand");const opp=s.players[a.targetPlayerId];if(!opp||a.targetPlayerId===actorId)return fail("SUPER_FOUR_TARGET","⭐4 requires opponent row");for(const id of a.sourceCardIds)moveCard(s,id,"GY");const own=[...(a.row==="pr"?s.players[actorId]!.pr:s.players[actorId]!.er)],theirs=[...(a.row==="pr"?opp.pr:opp.er)];for(const id of own)moveCard(s,id,`${a.targetPlayerId}_${a.row.toUpperCase()}` as import("./types.js").ZoneName,a.targetPlayerId);for(const id of theirs)moveCard(s,id,`${actorId}_${a.row.toUpperCase()}` as import("./types.js").ZoneName,actorId);for(const id of [...own,...theirs])if(rank(s,id)!=="9")applyAegis(s.cards[id]!,"Super-Four-exchange",futureStart(s,s.cards[id]!.controllerId));events.push(...revalidateAttachments(s).map(e=>({type:e.type,payload:e.payload as Record<string,unknown>})));events.push({type:"CORE_ADVANCED_SUPER_FOUR_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,row:a.row,targetPlayerId:a.targetPlayerId,actorCards:own,opponentCards:theirs}});break;
    }
    case "advanced-super-eight-scuttle":{
      if(!allRank(s,a.sourceCardIds,"8",actorId))return fail("SUPER_EIGHT_SOURCE","⭐8 requires two Eights in hand");const t=s.cards[a.targetCardId];if(!t||t.controllerId===actorId||!t.zone.endsWith("_PR")||hasAegis(t))return fail("SUPER_EIGHT_TARGET","⭐8 requires enemy non-Aegis PR target");for(const id of a.sourceCardIds)moveCard(s,id,"GY");moveCard(s,t.id,"GY");events.push(...revalidateAttachments(s).map(e=>({type:e.type,payload:e.payload as Record<string,unknown>})));events.push({type:"CORE_ADVANCED_SUPER_EIGHT_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,targetCardId:t.id}});break;
    }
    case "advanced-super-j-tempo":{
      if(!allRank(s,a.sourceCardIds,"J",actorId))return fail("SUPER_J_SOURCE","⭐J requires two Jacks in hand");for(const id of a.sourceCardIds)moveCard(s,id,"GY");const p=s.players[actorId]!;p.limits.miniTurnsRemaining=Math.min(3,p.limits.miniTurnsRemaining+2);events.push({type:"CORE_ADVANCED_SUPER_J_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,miniTurnsRemaining:p.limits.miniTurnsRemaining}});break;
    }
    case "advanced-super-three-raid":{
      if(!isUnrestricted(input))return fail("UNRESTRICTED_REQUIRED","⭐3 Raid requires the unrestricted Core authority profile");
      if(!allRank(s,a.sourceCardIds,"3",actorId))return fail("SUPER_THREE_SOURCE","⭐3 requires two Threes in hand");
      const opp=s.players[a.targetPlayerId];if(!opp||a.targetPlayerId===actorId)return fail("SUPER_THREE_TARGET","⭐3 requires an opponent");
      for(const id of a.takeCardIds){if(!opp.hand.includes(id))return fail("SUPER_THREE_TARGET","⭐3 raid target must be in opponent's hand");}
      for(const id of a.sourceCardIds)moveCard(s,id,"GY");
      for(const id of a.takeCardIds)moveCard(s,id,`${actorId}_HAND`,actorId);
      events.push({type:"CORE_ADVANCED_SUPER_THREE_RAID_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,targetPlayerId:a.targetPlayerId,takeCardIds:a.takeCardIds}});
      break;
    }
    case "advanced-super-five-recycle":{
      if(!isUnrestricted(input))return fail("UNRESTRICTED_REQUIRED","⭐5 Recycle requires the unrestricted Core authority profile");
      if(!allRank(s,a.sourceCardIds,"5",actorId))return fail("SUPER_FIVE_SOURCE","⭐5 requires two Fives in hand");
      for(const id of a.sourceCardIds)moveCard(s,id,"GY");
      const milled=s.zones.dp.splice(0,Math.min(4,s.zones.dp.length));
      for(const id of milled){s.cards[id]!.zone="VOID";moveCard(s,id,"GY");}
      const rummaged:CardId[]=[];
      for(const id of a.rummageCardIds){if(!s.zones.gy.includes(id))return fail("SUPER_FIVE_CHOICE","Rummage cards must be in GY after milling");moveCard(s,id,`${actorId}_HAND`,actorId);revealUntilStart(s.cards[id]!,futureStart(s,actorId));rummaged.push(id);}
      const drawn:CardId[]=[];
      for(let i=0;i<2&&s.zones.gy.length>0;i++){const bottom=s.zones.gy[0]!;moveCard(s,bottom,`${actorId}_HAND`,actorId);drawn.push(bottom);}
      events.push({type:"CORE_ADVANCED_SUPER_FIVE_RECYCLE_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,milled,rummaged,drawn}});
      break;
    }
    case "advanced-super-six-dig":{
      if(!isUnrestricted(input))return fail("UNRESTRICTED_REQUIRED","⭐6 Dig requires the unrestricted Core authority profile");
      if(!allRank(s,a.sourceCardIds,"6",actorId))return fail("SUPER_SIX_SOURCE","⭐6 requires two Sixes in hand");
      if(a.discardCardIds.length<1||a.discardCardIds.length>2||a.discardCardIds.some(id=>a.sourceCardIds.includes(id)||!inHand(s,id,actorId)))return fail("SUPER_SIX_COST","⭐6 requires one or two other hand cards to discard");
      const maxKeep=a.discardCardIds.length===1?5:6;
      if(a.keepCardIds.length>maxKeep)return fail("SUPER_SIX_CHOICE",`⭐6 may keep at most ${maxKeep}`);
      for(const id of a.sourceCardIds)moveCard(s,id,"GY");
      for(const id of a.discardCardIds)moveCard(s,id,"GY");
      const drawn=s.zones.dp.splice(0,Math.min(8,s.zones.dp.length));
      for(const id of drawn)s.cards[id]!.zone="VOID";
      const keepSet=new Set(a.keepCardIds);
      if(a.keepCardIds.some(id=>!drawn.includes(id)))return fail("SUPER_SIX_CHOICE","Every kept card must be among the drawn cards");
      for(const id of drawn){if(keepSet.has(id))moveCard(s,id,`${actorId}_HAND`,actorId);else moveCard(s,id,"DP");}
      events.push({type:"CORE_ADVANCED_SUPER_SIX_DIG_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,discarded:a.discardCardIds,drawn,kept:a.keepCardIds}});
      break;
    }
    case "advanced-super-seven-topdeck":{
      if(!isUnrestricted(input))return fail("UNRESTRICTED_REQUIRED","⭐7 Topdeck requires the unrestricted Core authority profile");
      if(!allRank(s,a.sourceCardIds,"7",actorId))return fail("SUPER_SEVEN_SOURCE","⭐7 requires two Sevens in hand");
      for(const id of a.sourceCardIds)moveCard(s,id,"GY");
      const revealed=s.zones.dp.splice(0,Math.min(4,s.zones.dp.length));
      for(const id of revealed)s.cards[id]!.zone="VOID";
      const allChosen=[...a.handCardIds,...a.effectCardIds,...a.scoreCardIds];
      if(new Set(allChosen).size!==allChosen.length||allChosen.some(id=>!revealed.includes(id)))return fail("SUPER_SEVEN_CHOICE","⭐7 choices must be distinct revealed cards");
      for(const id of revealed){
        if(a.handCardIds.includes(id)){moveCard(s,id,`${actorId}_HAND`,actorId);revealUntilStart(s.cards[id]!,futureStart(s,actorId));}
        else if(a.effectCardIds.includes(id)){moveCard(s,id,"GY",actorId);s.metadata.lastGeneratedEffectCardId=id;}
        else if(a.scoreCardIds.includes(id)){moveCard(s,id,`${actorId}_PR`,actorId);s.cards[id]!.state.pointValue=cardPointValue(s.cards[id]!);}
        else moveCard(s,id,"DP");
      }
      events.push({type:"CORE_ADVANCED_SUPER_SEVEN_TOPDECK_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,revealed,handCardIds:a.handCardIds,effectCardIds:a.effectCardIds,...(a.scoreCardIds.length>0?{scoreCardIds:a.scoreCardIds}:{})}});
      break;
    }
    case "advanced-rank10-club-foundation": {
      if (suit(s, a.sourceCardId) !== "♣" || rank(s, a.sourceCardId) !== "10") return fail("RANK10_SOURCE", "Foundation requires 10♣ in hand");
      if (!inHand(s, a.sourceCardId, actorId)) return fail("RANK10_SOURCE", "10♣ must be in hand");
      const problem = consumeRank10(s, actorId, a.sourceCardId);
      if (problem) return fail("RANK10_LIMIT", problem);
      const before = deriveSecuredPoints(s, actorId);
      moveCard(s, a.sourceCardId, `${actorId}_PR`, actorId);
      s.cards[a.sourceCardId]!.state.pointValue = 10;
      applyAegis(s.cards[a.sourceCardId]!, "10♣-entry", futureStart(s, actorId));
      let bonus: CardId | null = null;
      if (before === 0 && a.bonusScoreCardId !== undefined) {
        if (!inHand(s, a.bonusScoreCardId, actorId)) return fail("RANK10_CHOICE", "Foundation bonus card must be in hand");
        bonus = a.bonusScoreCardId;
        moveCard(s, bonus, `${actorId}_PR`, actorId);
        s.cards[bonus]!.state.pointValue = cardPointValue(s.cards[bonus]!);
      }
      events.push({ type: "CORE_ADVANCED_TEN_CLUB_FOUNDATION_RESOLVED", payload: { sourceCardId: a.sourceCardId, preEntryPoints: before, bonusScoreCardId: bonus } });
      break;
    }
    case "advanced-rank10-heart-tempo":{
      if(suit(s,a.sourceCardId)!=="♥")return fail("RANK10_SOURCE","Tempo Spike requires 10♥");const problem=consumeRank10(s,actorId,a.sourceCardId);if(problem)return fail("RANK10_LIMIT",problem);moveCard(s,a.sourceCardId,"EXILE");const p=s.players[actorId]!;p.limits.miniTurnsRemaining=Math.min(3,p.limits.miniTurnsRemaining+2);const drawn=s.zones.dp[0];if(drawn)moveCard(s,drawn,`${actorId}_HAND`,actorId);events.push({type:"CORE_ADVANCED_TEN_HEART_RESOLVED",payload:{sourceCardId:a.sourceCardId,drawnCardId:drawn??null,miniTurnsRemaining:p.limits.miniTurnsRemaining}});break;
    }
    case "advanced-rank10-spade-recovery":{
      if(suit(s,a.sourceCardId)!=="♠")return fail("RANK10_SOURCE","Exile Recovery requires 10♠");const problem=consumeRank10(s,actorId,a.sourceCardId);if(problem)return fail("RANK10_LIMIT",problem);if(s.cards[a.recoverCardId]?.zone!=="EXILE")return fail("RANK10_TARGET","Exile Recovery target must be in Exile");moveCard(s,a.recoverCardId,`${actorId}_HAND`,actorId);revealUntilStart(s.cards[a.recoverCardId]!,futureStart(s,actorId));moveCard(s,a.sourceCardId,"EXILE");events.push({type:"CORE_ADVANCED_TEN_SPADE_RECOVERY_RESOLVED",payload:{sourceCardId:a.sourceCardId,recoverCardId:a.recoverCardId}});break;
    }
    case "advanced-rank10-diamond-mimic":{
      const rankAction: RankAction = { kind: "mimic-ten-diamond", sourceCardId: a.sourceCardId, ...(a.pairedTwoId !== undefined ? { pairedTwoId: a.pairedTwoId } : {}), mimickedRank: a.mimickedRank, effectKey: a.effectKey, mimicAction: a.mimicAction };
      const resolved = resolveRankAction(s, actorId, rankAction);
      if (!resolved.ok) return fail(resolved.code, resolved.message, resolved.details);
      Object.assign(s, resolved.state);
      events.push(...resolved.events);
      break;
    }
    case "advanced-ultra-three-black":{
      const problem=consumeUltra(s,actorId,a.sourceCardIds,"3-black");if(problem)return fail("ULTRA_RECIPE",problem);if(new Set([a.scoreCardId,a.castCardId,a.exileCardId]).size!==3||![a.scoreCardId,a.castCardId,a.exileCardId].every(id=>a.sourceCardIds.includes(id)))return fail("ULTRA_ROLES","3 Black roles must partition the sources");const scoreIdentity=s.cards[a.scoreCardId]!.identity;if(rank(s,a.scoreCardId)==="7"||scoreIdentity==="BJ")return fail("ULTRA_SCORE_RIDER_UNSUPPORTED","3 Black score role cannot use a card with an uncertified scoring rider");moveCard(s,a.scoreCardId,`${actorId}_PR`,actorId);s.cards[a.scoreCardId]!.state.pointValue=cardPointValue(s.cards[a.scoreCardId]!);let castResolved=false;if(a.castEffect.sourceCardId===a.castCardId){const cast=resolveCoreEffect(s,actorId,a.castEffect);if(cast.ok){Object.assign(s,cast.state);events.push(...cast.events);castResolved=true;}}if(!castResolved&&s.cards[a.castCardId]?.zone===`${actorId}_HAND`)moveCard(s,a.castCardId,"GY");moveCard(s,a.exileCardId,"EXILE");events.push({type:"CORE_ADVANCED_ULTRA_THREE_BLACK_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,scoreCardId:a.scoreCardId,castCardId:a.castCardId,exileCardId:a.exileCardId,castResolved,castFizzled:!castResolved,priorityWindowsInside:0}});break;
    }
    case "advanced-ultra-two-black-two-red":{
      const problem=consumeUltra(s,actorId,a.sourceCardIds,"2-black-2-red");if(problem)return fail("ULTRA_RECIPE",problem);for(const id of a.sourceCardIds)moveCard(s,id,"GY");const p=s.players[actorId]!;p.limits.miniTurnsRemaining=Math.min(3,p.limits.miniTurnsRemaining+2);let moved:CardId[]=[];if(a.branch==="draw-two"){for(let i=0;i<2&&s.zones.dp.length;i++){const id=s.zones.dp[0]!;moveCard(s,id,`${actorId}_HAND`,actorId);moved.push(id);}}else if(a.rummageCardId&&s.cards[a.rummageCardId]?.zone==="EXILE"){moveCard(s,a.rummageCardId,`${actorId}_HAND`,actorId);moved=[a.rummageCardId];}events.push({type:"CORE_ADVANCED_ULTRA_2B2R_RESOLVED",payload:{sourceCardIds:a.sourceCardIds,branch:a.branch,movedCardIds:moved,miniTurnsRemaining:p.limits.miniTurnsRemaining}});break;
    }
    case "advanced-voltage-three": {
      const rt = phase8Runtime(s);
      const snap = rt.voltageSnapshots[actorId];
      if (!snap) return fail("VOLTAGE_SNAPSHOT", "Voltage snapshot is missing");
      const used = rt.voltageUsedThisFT[actorId] ?? { "3": false, "4": false, "5": false };
      if (used["3"]) return fail("VOLTAGE_LIMIT", "Voltage 3 already used");
      if ((snap.rank3 ?? 0) < 3) return fail("VOLTAGE_THRESHOLD", "Voltage 3 threshold not met");
      const top = s.zones.dp[0];
      if (!top) return fail("VOLTAGE_TARGET", "Voltage 3 requires a draw-pile card");
      used["3"] = true;
      rt.voltageUsedThisFT[actorId] = used;
      s.metadata.phase8 = rt;
      if (a.disposition === "points") {
        moveCard(s, top, `${actorId}_PR`, actorId);
        s.cards[top]!.state.pointValue = cardPointValue(s.cards[top]!);
      } else {
        moveCard(s, top, `${actorId}_HAND`, actorId);
      }
      events.push({ type: "CORE_ADVANCED_VOLTAGE_THREE_RESOLVED", payload: { disposition: a.disposition, cardId: top } });
      break;
    }
    case "advanced-voltage-four": {
      const rt = phase8Runtime(s);
      const snap = rt.voltageSnapshots[actorId];
      if (!snap) return fail("VOLTAGE_SNAPSHOT", "Voltage snapshot is missing");
      const used = rt.voltageUsedThisFT[actorId] ?? { "3": false, "4": false, "5": false };
      if (used["4"]) return fail("VOLTAGE_LIMIT", "Voltage 4 already used");
      if ((snap.rank4 ?? 0) < 4) return fail("VOLTAGE_THRESHOLD", "Voltage 4 threshold not met");
      const top = s.zones.dp[0];
      if (!top) return fail("VOLTAGE_TARGET", "Voltage 4 requires a draw-pile card");
      used["4"] = true;
      rt.voltageUsedThisFT[actorId] = used;
      s.metadata.phase8 = rt;
      const topIdentity = s.cards[top]!.identity;
      const parsed = parseIdentity(topIdentity);
      const rankMatch = parsed?.rank === a.guessRank;
      const suitMatch = parsed?.suit === a.guessSuit;
      if (rankMatch && suitMatch) {
        moveCard(s, top, `${actorId}_PR`, actorId);
        s.cards[top]!.state.pointValue = cardPointValue(s.cards[top]!);
        events.push({ type: "CORE_ADVANCED_VOLTAGE_FOUR_RESOLVED", payload: { guessRank: a.guessRank, guessSuit: a.guessSuit, matched: true, cardId: top, disposition: a.rankMatchDisposition } });
      } else {
        events.push({ type: "CORE_ADVANCED_VOLTAGE_FOUR_RESOLVED", payload: { guessRank: a.guessRank, guessSuit: a.guessSuit, matched: false, cardId: top, disposition: null } });
      }
      break;
    }
    case "advanced-voltage-five": {
      const rt = phase8Runtime(s);
      const snap = rt.voltageSnapshots[actorId];
      if (!snap) return fail("VOLTAGE_SNAPSHOT", "Voltage snapshot is missing");
      const used = rt.voltageUsedThisFT[actorId] ?? { "3": false, "4": false, "5": false };
      if (used["5"]) return fail("VOLTAGE_LIMIT", "Voltage 5 already used");
      const rank5Value = snap.rank5 ?? 0;
      if (rank5Value < 5) return fail("VOLTAGE_THRESHOLD", "Voltage 5 threshold not met");
      used["5"] = true;
      rt.voltageUsedThisFT[actorId] = used;
      s.metadata.phase8 = rt;
      if (a.branch === "gy-bottom") {
        const bottom = s.zones.gy[0];
        if (!bottom) return fail("VOLTAGE_TARGET", "Voltage Five GY-bottom branch requires a GY card");
        moveCard(s, bottom, `${actorId}_HAND`, actorId);
        events.push({ type: "CORE_ADVANCED_VOLTAGE_FIVE_RESOLVED", payload: { branch: a.branch, cardId: bottom } });
      } else {
        // refine: discard a card from hand, draw a replacement from DP
        if (!a.discardCardId || !inHand(s, a.discardCardId, actorId)) return fail("VOLTAGE_TARGET", "Voltage Five refine requires a hand card to discard");
        moveCard(s, a.discardCardId, "GY");
        const drawn = s.zones.dp[0];
        if (drawn) moveCard(s, drawn, `${actorId}_HAND`, actorId);
        events.push({ type: "CORE_ADVANCED_VOLTAGE_FIVE_RESOLVED", payload: { branch: a.branch, discardCardId: a.discardCardId, drawnCardId: drawn ?? null } });
      }
      break;
    }
    case "advanced-sudden-death-declare": {
      if (!isUnrestricted(input)) return fail("UNRESTRICTED_REQUIRED", "Sudden Death requires the unrestricted Core authority profile");
      const rt = phase8Runtime(s);
      if (rt.suddenDeath) return fail("SUDDEN_DEATH_ACTIVE", "Sudden Death is already active");
      if (a.targetPlayerId === actorId) return fail("SUDDEN_DEATH_TARGET", "Cannot declare Sudden Death on yourself");
      if (!s.players[a.targetPlayerId]) return fail("SUDDEN_DEATH_TARGET", "Target player does not exist");
      // Recipe validation: Red Joker + Black Joker, or four cards of the same rank.
      // Per rulebook v4.3.1 §11.1: "Declare Sudden Death as one multi-card play using either:
      //   Red Joker + Black Joker; or four cards of the same rank."
      const sources = a.sourceCardIds;
      if (!sourceSet(sources) || !sources.every((id) => inHand(s, id, actorId)))
        return fail("SUDDEN_DEATH_SOURCE", "Sudden Death sources must be distinct controlled hand cards");
      const isRjBj = sources.length === 2 && sources.every((id) => s.cards[id]?.identity === "RJ" || s.cards[id]?.identity === "BJ") &&
        sources.some((id) => s.cards[id]?.identity === "RJ") && sources.some((id) => s.cards[id]?.identity === "BJ");
      const isFourOfAKind = sources.length === 4 && sources.every((id) => rank(s, id) !== null && rank(s, id) === rank(s, sources[0]!));
      if (!isRjBj && !isFourOfAKind)
        return fail("SUDDEN_DEATH_RECIPE", "Sudden Death requires Red Joker + Black Joker, or four cards of the same rank");
      // Scrap target: one Vulnerable enemy OTT card.
      // Per rulebook v4.3.1 §11.1: "Choose one Vulnerable enemy OTT card as the Scrap target."
      // Per rulebook v4.3.1 §17: "A card is Vulnerable to a particular interaction only when it is
      //   a legal target, has no Aegis, has no relevant rank/state immunity."
      const scrap = s.cards[a.scrapTargetCardId];
      if (!scrap) return fail("SUDDEN_DEATH_SCRAP", "Scrap target does not exist");
      if (scrap.controllerId === actorId) return fail("SUDDEN_DEATH_SCRAP", "Scrap target must be an enemy card");
      if (!scrap.zone.endsWith("_PR") && !scrap.zone.endsWith("_ER")) return fail("SUDDEN_DEATH_SCRAP", "Scrap target must be an OTT card");
      if (hasAegis(scrap)) return fail("SUDDEN_DEATH_SCRAP", "Scrap target must be Vulnerable (no Aegis)");
      // Move source cards to GY (they are spent)
      for (const id of sources) moveCard(s, id, "GY");
      // Scrap the target
      moveCard(s, a.scrapTargetCardId, "GY");
      // Set Sudden Counter to 2 per rulebook §11.2
      rt.suddenDeath = { activatorId: actorId, remaining: 2, activationFullTurnSequence: s.fullTurnSequence ?? 0 };
      s.metadata.phase8 = rt;
      events.push({ type: "CORE_ADVANCED_SUDDEN_DEATH_DECLARED", payload: { declaredBy: actorId, targetPlayerId: a.targetPlayerId, scrapTargetCardId: a.scrapTargetCardId, sourceCardIds: sources, remaining: 2 } });
      break;
    }
  }
  return {ok:true,state:s,events};
}

export interface AdvancedCoreCandidate {
  family: string;
  mode: string;
  timingClass: "ACTION" | "INSTANT" | "INTERRUPT";
  sourceCardIds: CardId[];
  targetCardIds: CardId[];
  advanced: CoreAdvancedAction;
  featureVector: Record<string, number | boolean | string | null>;
}
function combos<T>(v:readonly T[],n:number):T[][]{const out:T[][]=[];const walk=(i:number,c:T[])=>{if(c.length===n){out.push([...c]);return;}for(let x=i;x<v.length;x++){c.push(v[x]!);walk(x+1,c);c.pop();}};walk(0,[]);return out;}
export function enumerateAdvancedCoreCandidates(state:Readonly<EngineState>,actorId:PlayerId):AdvancedCoreCandidate[]{
  if(!isAdvancedProfile(state))return [];
  const s=state as EngineState,p=s.players[actorId];if(!p)return [];
  const out:AdvancedCoreCandidate[]=[];
  const byRank=(r:string)=>p.hand.filter(id=>rank(s,id)===r).sort();
  const opponents=s.turnOrder.filter(id=>id!==actorId);
  for(const k of byRank("K"))for(const q of byRank("Q"))if(suit(s,k)===suit(s,q))out.push({family:"royal-marriage",mode:String(suit(s,k)),timingClass:"ACTION",sourceCardIds:[k,q],targetCardIds:[],advanced:{kind:"advanced-royal-marriage",kingCardId:k,queenCardId:q},featureVector:{multiCard:true,anchorValue:suit(s,k)==="♠"?9:7,guard:true}});
  if(!p.limits.queensCourtPlayedThisFT)for(const pair of combos(byRank("Q"),2))out.push({family:"queens-court",mode:"queens-court",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[],advanced:{kind:"advanced-queens-court",queenCardIds:[pair[0]!,pair[1]!]},featureVector:{multiCard:true,anchorValue:0,guard:true,queensCourt:true}});
  for (const pair of combos(byRank("2"), 2)) {
    for (const oid of opponents) {
      for (const targetId of [...s.players[oid]!.pr, ...s.players[oid]!.er]) {
        const legality = evaluateProtection(s, actorId, targetId, {
          channel: "effect",
          shape: "single-target",
          hostile: true,
          operation: "control-change",
          bypasses: ["guard", "rank-effect-immunity"]
        });
        if (!legality.legal) continue;
        out.push({
          family: "super",
          mode: "two-score",
          timingClass: "ACTION",
          sourceCardIds: [...pair],
          targetCardIds: [targetId],
          advanced: {
            kind: "advanced-super-two",
            sourceCardIds: pair as [CardId, CardId],
            targetCardId: targetId,
            disposition: "score"
          },
          featureVector: { controlChange: true, disposition: "score" }
        });
        out.push({
          family: "super",
          mode: "two-hold",
          timingClass: "ACTION",
          sourceCardIds: [...pair],
          targetCardIds: [targetId],
          advanced: {
            kind: "advanced-super-two",
            sourceCardIds: pair as [CardId, CardId],
            targetCardId: targetId,
            disposition: "hold"
          },
          featureVector: { controlChange: true, disposition: "hold", holdChild: true }
        });
      }
    }
  }
  for(const pair of combos(byRank("4"),2))for(const oid of opponents)for(const row of ["pr","er"] as const)out.push({family:"super",mode:`four-exchange-${row}`,timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[],advanced:{kind:"advanced-super-four-exchange",sourceCardIds:pair as [CardId,CardId],targetPlayerId:oid,row},featureVector:{structural:true,row}});
  for (const pair of combos(byRank("8"), 2)) {
    for (const oid of opponents) {
      for (const targetId of s.players[oid]!.pr) {
        if (hasAegis(s.cards[targetId]!)) continue;
        out.push({
          family: "super",
          mode: "eight-absolute-scuttle",
          timingClass: "ACTION",
          sourceCardIds: [...pair],
          targetCardIds: [targetId],
          advanced: {
            kind: "advanced-super-eight-scuttle",
            sourceCardIds: pair as [CardId, CardId],
            targetCardId: targetId
          },
          featureVector: { scuttle: true, absolute: true }
        });
      }
    }
  }
  for(const pair of combos(byRank("J"),2))out.push({family:"super",mode:"jack-tempo",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[],advanced:{kind:"advanced-super-j-tempo",sourceCardIds:pair as [CardId,CardId]},featureVector:{miniTurns:2}});
  for(const id of byRank("10")){
    const su=suit(s,id);
    if(su==="♣"&&!p.limits.rank10PlayedThisFT){const before=deriveSecuredPoints(s,actorId);if(before===0){for(const bonusId of p.hand)if(bonusId!==id)out.push({family:"rank10",mode:"club-foundation-bonus",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[bonusId],advanced:{kind:"advanced-rank10-club-foundation",sourceCardId:id,bonusScoreCardId:bonusId},featureVector:{foundation:true,bonus:true}});}out.push({family:"rank10",mode:"club-foundation",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-club-foundation",sourceCardId:id},featureVector:{foundation:true}});}
    if(su==="♥")out.push({family:"rank10",mode:"heart-tempo",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-heart-tempo",sourceCardId:id},featureVector:{miniTurns:2,draw:1}});
    if(su==="♠")for(const x of s.zones.exile.slice(0,12))out.push({family:"rank10",mode:"spade-recovery",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[x],advanced:{kind:"advanced-rank10-spade-recovery",sourceCardId:id,recoverCardId:x},featureVector:{recovery:true}});
    if(su==="♦"&&!p.limits.rank10PlayedThisFT){
      for(const oid of opponents)for(const row of ["pr","er"] as const)
        out.push({family:"rank10",mode:`diamond-mimic-row-exchange-${row}`,timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,mimickedRank:"4",effectKey:"row-exchange",mimicAction:{kind:"row-exchange",targetPlayerId:oid,row}},featureVector:{mimic:true,rowExchange:true,row}});
      const twosInHand=p.hand.filter(twoId=>rank(s,twoId)==="2"&&twoId!==id);
      for(const twoId of twosInHand){
        for(const oid of opponents)for(const row of ["pr","er"] as const)
          out.push({family:"rank10",mode:`diamond-mimic-paired-row-exchange-${row}`,timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"4",effectKey:"row-exchange",mimicAction:{kind:"row-exchange",targetPlayerId:oid,row}},featureVector:{mimic:true,paired:true,rowExchange:true,row}});
        for(const oid of opponents)for(const targetId of s.players[oid]!.pr)if(!hasAegis(s.cards[targetId]!))
          out.push({family:"rank10",mode:"diamond-mimic-paired-absolute-scuttle",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[targetId],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"8",effectKey:"absolute-scuttle",mimicAction:{kind:"absolute-scuttle",targetCardId:targetId}},featureVector:{mimic:true,paired:true,absoluteScuttle:true}});
        out.push({family:"rank10",mode:"diamond-mimic-paired-super-j-tempo",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"J",effectKey:"super-j-tempo",mimicAction:{kind:"super-j-tempo"}},featureVector:{mimic:true,paired:true,miniTurns:2}});
      }
    }
  }
  const hand=[...p.hand].sort();
  for(const set of combos(hand.filter(id=>color(s,id)==="black"),3).slice(0,12)){
    for(const castCardId of set){const remaining=set.filter(id=>id!==castCardId);for(const scoreCardId of remaining){if(rank(s,scoreCardId)==="7"||s.cards[scoreCardId]!.identity==="BJ")continue;const exileCardId=remaining.find(id=>id!==scoreCardId)!;for(const effect of enumerateCoreEffectCandidates(s,actorId).filter(c=>c.effect.sourceCardId===castCardId&&!isCorePrivateChoiceEffect(c.effect)).slice(0,4))out.push({family:"ultra",mode:`three-black-${effect.mode}`,timingClass:"ACTION",sourceCardIds:[...set],targetCardIds:[...effect.targetCardIds],advanced:{kind:"advanced-ultra-three-black",sourceCardIds:set as [CardId,CardId,CardId],scoreCardId,castCardId,exileCardId,castEffect:effect.effect},featureVector:{atomic:true,score:true,internalCast:true,exile:true}});}}
  }
  for(const set of combos(hand.filter(id=>color(s,id)!==null),4).slice(0,20)){if(set.filter(id=>color(s,id)==="black").length===2&&set.filter(id=>color(s,id)==="red").length===2){out.push({family:"ultra",mode:"2-black-2-red-draw",timingClass:"ACTION",sourceCardIds:[...set],targetCardIds:[],advanced:{kind:"advanced-ultra-two-black-two-red",sourceCardIds:set as [CardId,CardId,CardId,CardId],branch:"draw-two"},featureVector:{miniTurns:2,draw:2}});for(const x of s.zones.exile.slice(0,4))out.push({family:"ultra",mode:"2-black-2-red-rummage",timingClass:"ACTION",sourceCardIds:[...set],targetCardIds:[x],advanced:{kind:"advanced-ultra-two-black-two-red",sourceCardIds:set as [CardId,CardId,CardId,CardId],branch:"rummage-exile",rummageCardId:x},featureVector:{miniTurns:2,recovery:true}});}}
  const phase8=phase8Runtime(s),snap=phase8.voltageSnapshots[actorId],used=phase8.voltageUsedThisFT[actorId]??{"3":false,"4":false,"5":false};
  if(s.phase==="Start"&&(snap?.rank3 ?? 0)>=3&&!used["3"]&&s.zones.dp.length)out.push({family:"voltage",mode:"three-hand",timingClass:"INSTANT",sourceCardIds:[],targetCardIds:[],advanced:{kind:"advanced-voltage-three",disposition:"hand"},featureVector:{rank:3,draw:1}});
  if(s.phase==="Start"&&(snap?.rank3 ?? 0)>=3&&!used["3"]&&s.zones.dp.length)out.push({family:"voltage",mode:"three-points",timingClass:"INSTANT",sourceCardIds:[],targetCardIds:[],advanced:{kind:"advanced-voltage-three",disposition:"points"},featureVector:{rank:3,score:true}});
  if(s.phase==="Start"&&(snap?.rank4 ?? 0)>=4&&!used["4"]&&s.zones.dp.length){const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];const suits=["♣","♦","♥","♠"];for(const r of ranks)for(const su of suits)out.push({family:"voltage",mode:`four-guess-${r}-${su}`,timingClass:"INSTANT",sourceCardIds:[],targetCardIds:[],advanced:{kind:"advanced-voltage-four",guessRank:r,guessSuit:su,rankMatchDisposition:"points"},featureVector:{rank:4,prediction:true}});}
  if(s.phase==="Start"&&(snap?.rank5 ?? 0)>=5&&!used["5"]&&s.zones.gy.length)out.push({family:"voltage",mode:"five-gy-bottom",timingClass:"INSTANT",sourceCardIds:[],targetCardIds:[],advanced:{kind:"advanced-voltage-five",branch:"gy-bottom"},featureVector:{rank:5,recovery:true,publicBranch:true}});
  if(s.phase==="Start"&&(snap?.rank5 ?? 0)>=5&&!used["5"]&&p.hand.length>0&&s.zones.dp.length)for(const discardId of p.hand)out.push({family:"voltage",mode:"five-refine",timingClass:"INSTANT",sourceCardIds:[discardId],targetCardIds:[],advanced:{kind:"advanced-voltage-five",branch:"refine",discardCardId:discardId},featureVector:{rank:5,refine:true,draw:1}});
  // Hidden Super branches (unrestricted only)
  if(isUnrestricted(s)){
    for(const pair of combos(byRank("3"),2))for(const oid of opponents){
      const opp=s.players[oid]!;
      for(const takeId of opp.hand.slice(0,6))out.push({family:"super",mode:"three-raid",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[takeId],advanced:{kind:"advanced-super-three-raid",sourceCardIds:pair as [CardId,CardId],targetPlayerId:oid,takeCardIds:[takeId]},featureVector:{raid:true,handTheft:true}});
    }
    for(const pair of combos(byRank("5"),2))out.push({family:"super",mode:"five-recycle",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[],advanced:{kind:"advanced-super-five-recycle",sourceCardIds:pair as [CardId,CardId],rummageCardIds:[]},featureVector:{recycle:true,mill:4}});
    for(const pair of combos(byRank("6"),2)){
      const otherHand=[...p.hand].filter(id=>!pair.includes(id));
      for(const d1 of otherHand)out.push({family:"super",mode:"six-dig",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[d1],advanced:{kind:"advanced-super-six-dig",sourceCardIds:pair as [CardId,CardId],discardCardIds:[d1],keepCardIds:[]},featureVector:{dig:true,draw:8}});
    }
    for(const pair of combos(byRank("7"),2))out.push({family:"super",mode:"seven-topdeck",timingClass:"ACTION",sourceCardIds:[...pair],targetCardIds:[],advanced:{kind:"advanced-super-seven-topdeck",sourceCardIds:pair as [CardId,CardId],handCardIds:[],effectCardIds:[],scoreCardIds:[]},featureVector:{topdeck:true,reveal:4}});
    // 10♦ Mimic — per rulebook v4.3.1 §10♦:
    //   Solo: mimic one ⭐ effect from ranks 3-7
    //   Paired with any 2: mimic one ⭐ effect from ranks 3-8, Ace, Jack
    // The resolver supports: row-exchange (4), absolute-scuttle (8), super-j-tempo (J),
    // topdeck-seven (7), recycle-five (5).
    for(const id of byRank("10"))if(suit(s,id)==="♦"&&!p.limits.rank10PlayedThisFT){
      // Solo mimic options (ranks 3-7)
      out.push({family:"rank10",mode:"diamond-mimic-topdeck-seven",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,mimickedRank:"7",effectKey:"topdeck-seven",mimicAction:{kind:"topdeck-seven"}},featureVector:{mimic:true,generatedEffect:true}});
      out.push({family:"rank10",mode:"diamond-mimic-recycle-five",timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,mimickedRank:"5",effectKey:"recycle-five",mimicAction:{kind:"recycle-five"}},featureVector:{mimic:true,generatedEffect:true}});
      // Solo row-exchange (rank 4) — requires an opponent
      for(const oid of opponents)for(const row of ["pr","er"] as const){
        out.push({family:"rank10",mode:`diamond-mimic-row-exchange-${row}`,timingClass:"ACTION",sourceCardIds:[id],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,mimickedRank:"4",effectKey:"row-exchange",mimicAction:{kind:"row-exchange",targetPlayerId:oid,row}},featureVector:{mimic:true,generatedEffect:true}});
      }
      const twosInHand=p.hand.filter(twoId=>rank(s,twoId)==="2"&&twoId!==id);
      for(const twoId of twosInHand){
        // Paired mimic options (ranks 3-8, A, J)
        out.push({family:"rank10",mode:"diamond-mimic-paired-topdeck-seven",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"7",effectKey:"topdeck-seven",mimicAction:{kind:"topdeck-seven"}},featureVector:{mimic:true,paired:true,generatedEffect:true}});
        out.push({family:"rank10",mode:"diamond-mimic-paired-recycle-five",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"5",effectKey:"recycle-five",mimicAction:{kind:"recycle-five"}},featureVector:{mimic:true,paired:true,generatedEffect:true}});
        // Paired row-exchange (rank 4)
        for(const oid of opponents)for(const row of ["pr","er"] as const){
          out.push({family:"rank10",mode:`diamond-mimic-paired-row-exchange-${row}`,timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"4",effectKey:"row-exchange",mimicAction:{kind:"row-exchange",targetPlayerId:oid,row}},featureVector:{mimic:true,paired:true,generatedEffect:true}});
        }
        // Paired absolute-scuttle (rank 8) — requires enemy PR target
        for(const oid of opponents)for(const targetId of s.players[oid]!.pr){
          out.push({family:"rank10",mode:"diamond-mimic-paired-absolute-scuttle",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[targetId],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"8",effectKey:"absolute-scuttle",mimicAction:{kind:"absolute-scuttle",targetCardId:targetId}},featureVector:{mimic:true,paired:true,generatedEffect:true}});
        }
        // Paired super-j-tempo (rank J)
        out.push({family:"rank10",mode:"diamond-mimic-paired-super-j-tempo",timingClass:"ACTION",sourceCardIds:[id,twoId],targetCardIds:[],advanced:{kind:"advanced-rank10-diamond-mimic",sourceCardId:id,pairedTwoId:twoId,mimickedRank:"J",effectKey:"super-j-tempo",mimicAction:{kind:"super-j-tempo"}},featureVector:{mimic:true,paired:true,generatedEffect:true}});
      }
    }
    // Sudden Death declaration — requires RJ+BJ or four-of-a-kind, plus a Vulnerable enemy OTT scrap target.
    // Per rulebook v4.3.1 §11.1.
    const rjInHand = p.hand.find((id) => s.cards[id]?.identity === "RJ");
    const bjInHand = p.hand.find((id) => s.cards[id]?.identity === "BJ");
    const rjBjSources: CardId[] = [];
    if (rjInHand && bjInHand) rjBjSources.push(rjInHand, bjInHand);
    const fourOfAKindSources: CardId[][] = [];
    for (const r of ["A","2","3","4","5","6","7","8","9","10","J","Q","K"] as const) {
      const sameRank = p.hand.filter((id) => rank(s, id) === r);
      if (sameRank.length >= 4) fourOfAKindSources.push(sameRank.slice(0, 4));
    }
    const sdSources = [rjBjSources, ...fourOfAKindSources].filter((arr) => arr.length > 0);
    if (sdSources.length > 0) {
      // Find Vulnerable enemy OTT cards (no Aegis, enemy PR or ER)
      for (const oid of opponents) {
        const enemyOtt: CardId[] = [];
        for (const id of [...s.players[oid]!.pr, ...s.players[oid]!.er]) {
          const c = s.cards[id];
          if (c && !hasAegis(c)) enemyOtt.push(id);
        }
        for (const sources of sdSources) {
          for (const scrapTargetId of enemyOtt) {
            out.push({family:"sudden-death",mode:"declare",timingClass:"INTERRUPT",sourceCardIds:[...sources],targetCardIds:[scrapTargetId],advanced:{kind:"advanced-sudden-death-declare",targetPlayerId:oid,sourceCardIds:[...sources],scrapTargetCardId:scrapTargetId},featureVector:{suddenDeath:true,interrupt:true}});
          }
        }
      }
    }
  }
  return out;
}

