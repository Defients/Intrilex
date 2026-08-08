from __future__ import annotations
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def limits():
    return {
        "miniTurnsUsed": 0,
        "miniTurnsRemaining": 1,
        "swapBarUsedThisFT": False,
        "rank10PlayedThisFT": False,
        "ultraPlayedThisFT": False,
        "pendingFullTurnSkips": 0,
        "pendingActionPhaseSkips": 0,
    }


def state(players=("P1", "P2"), active="P1"):
    return {
        "schemaVersion": 1,
        "rulesVersion": "4.1",
        "revision": 0,
        "phase": "Action",
        "activePlayerId": active,
        "turnOrder": list(players),
        "fullTurnSequence": 12,
        "startPhaseSequenceByPlayer": {p: 5 + i for i, p in enumerate(players)},
        "players": {p: {"id": p, "teamId": None, "goal": 21, "hand": [], "pr": [], "er": [], "limits": limits()} for p in players},
        "cards": {},
        "zones": {"dp": [], "gy": [], "exile": [], "swapBar": [], "staging": []},
        "stack": [],
        "triggerQueue": [],
        "suspendedStackItemIds": [],
        "pendingDeclaration": None,
        "priority": None,
        "rng": {"algorithm": "xorshift32", "seed": 439041101, "cursor": 0},
        "winner": None,
        "metadata": {},
    }


def add(s, cid, identity, owner, zone, controller=None, state_data=None):
    controller = controller or owner
    s["cards"][cid] = {
        "id": cid,
        "identity": identity,
        "originalOwnerId": owner,
        "controllerId": controller,
        "zone": zone,
        "state": state_data or {},
    }
    if zone == "DP": s["zones"]["dp"].append(cid)
    elif zone == "GY": s["zones"]["gy"].append(cid)
    elif zone == "EXILE": s["zones"]["exile"].append(cid)
    elif zone == "SWAP_BAR": s["zones"]["swapBar"].append(cid)
    elif zone.endswith("_HAND"): s["players"][zone[:-5]]["hand"].append(cid)
    elif zone.endswith("_PR"): s["players"][zone[:-3]]["pr"].append(cid)
    elif zone.endswith("_ER"): s["players"][zone[:-3]]["er"].append(cid)
    else: raise ValueError(zone)


def play(kind, controller, sources, targets=(), req=(), reval="none", instructions=(), dest="GY", tags=()):
    return {
        "kind": kind,
        "controllerId": controller,
        "sourceCardIds": list(sources),
        "targetCardIds": list(targets),
        "requirements": list(req),
        "revalidationClass": reval,
        "instructions": list(instructions),
        "sourceDestination": dest,
        "tags": list(tags),
    }


def declare(cid, actor, p, costs=None, response=False):
    d = {"id": cid, "type": "RESPOND_WITH_PLAY" if response else "DECLARE_PLAY", "actorId": actor, "play": p}
    if costs is not None: d["stagedCostIds"] = costs
    return d


def passp(cid, actor): return {"id": cid, "type": "PASS_PRIORITY", "actorId": actor}
def resolve(cid, actor): return {"id": cid, "type": "RESOLVE_TOP", "actorId": actor}
def counter(cid, actor, sources): return {"id": cid, "type": "COUNTER_TOP", "actorId": actor, "sourceCardIds": list(sources)}
def noop(cid, actor, label): return {"id": cid, "type": "NOOP", "actorId": actor, "label": label}

def fixture(fid, title, purpose, s, commands, final, accepted=None):
    expectation = {"final": final}
    if accepted is not None: expectation["accepted"] = accepted
    return {"id": fid, "title": title, "sourceTestId": fid, "purpose": purpose, "initialState": s, "commands": commands, "expectation": expectation}

F=[]

# CT-006 — 6♠ only hand card illegal and fully rewound.
s=state(); add(s,"CT006-S6","6♠","P1","P1_HAND"); add(s,"CT006-A","A♣","P1","DP"); add(s,"CT006-3D","3♦","P1","DP")
p=play("deep-draw-6s","P1",["CT006-S6"],req=[{"kind":"other-hand-cards","playerId":"P1","minimum":1,"excludingSourceIds":["CT006-S6"]}])
F.append(fixture("CT-006","6♠ as the only hand card is illegal","Prove declaration staging rewinds byte-for-byte when 6♠ leaves no other hand card.",s,[declare("CT006-C1","P1",p)],{"hands":{"P1":["CT006-S6"],"P2":[]},"zones":{"dp":["CT006-A","CT006-3D"],"gy":[],"staging":[]},"stackDepth":0},[False]))

# CT-007 — legal Deep Draw.
s=state();
for cid,ident,zone in [("CT007-S6","6♠","P1_HAND"),("CT007-3C","3♣","P1_HAND"),("CT007-A","A♣","DP"),("CT007-4D","4♦","DP"),("CT007-7H","7♥","DP"),("CT007-KC","K♣","DP")]: add(s,cid,ident,"P1",zone)
p=play("deep-draw-6s","P1",["CT007-S6"],req=[{"kind":"other-hand-cards","playerId":"P1","minimum":1,"excludingSourceIds":["CT007-S6"]}],instructions=[{"op":"discard","playerId":"P1","cardIds":["CT007-3C"],"requiredMinimum":1},{"op":"draw-keep-return","playerId":"P1","drawCount":6,"keepIds":["CT007-A","CT007-4D","CT007-7H"],"returnIds":["CT007-KC"]}])
cmd=[declare("CT007-C1","P1",p),passp("CT007-C2","P2"),passp("CT007-C3","P1"),resolve("CT007-C4","P1")]
F.append(fixture("CT-007","6♠ with one other card resolves by discarding one","Execute legal declaration, ordered discard, short-deck draw, keep, return, and source cleanup.",s,cmd,{"hands":{"P1":["CT007-A","CT007-4D","CT007-7H"],"P2":[]},"zones":{"dp":["CT007-KC"],"gy":["CT007-3C","CT007-S6"]},"stackDepth":0},[True]*4))

# CT-008 — declaration legal, later fizzle because response takes final discardable card.
s=state();
for cid,ident,owner,zone in [("CT008-S6","6♠","P1","P1_HAND"),("CT008-3C","3♣","P1","P1_HAND"),("CT008-3D","3♦","P2","P2_HAND"),("CT008-A","A♣","P1","DP"),("CT008-4D","4♦","P1","DP")]: add(s,cid,ident,owner,zone)
p1=play("deep-draw-6s","P1",["CT008-S6"],req=[{"kind":"other-hand-cards","playerId":"P1","minimum":1,"excludingSourceIds":["CT008-S6"]}],instructions=[{"op":"discard","playerId":"P1","cardIds":["CT008-3C"],"requiredMinimum":1},{"op":"draw-keep-return","playerId":"P1","drawCount":6,"keepIds":["CT008-A","CT008-4D"],"returnIds":[]}])
p2=play("hand-raid-response","P2",["CT008-3D"],instructions=[{"op":"take-card","cardId":"CT008-3C","playerId":"P2","revealUntilStart":True}])
cmd=[declare("CT008-C1","P1",p1),declare("CT008-C2","P2",p2,response=True),passp("CT008-C3","P1"),passp("CT008-C4","P2"),resolve("CT008-C5","P2"),passp("CT008-C6","P2"),passp("CT008-C7","P1"),resolve("CT008-C8","P1")]
F.append(fixture("CT-008","Legal 6♠ later fizzles when no discard remains","Separate declaration legality from resolution-time required instruction failure.",s,cmd,{"hands":{"P1":[],"P2":["CT008-3C"]},"zones":{"dp":["CT008-A","CT008-4D"],"gy":["CT008-3D","CT008-S6"]},"stackDepth":0},[True]*8))

# CT-009 — goal shift with discard.
s=state(); add(s,"CT009-9S","9♠","P1","P1_HAND"); add(s,"CT009-2C","2♣","P1","P1_HAND")
p=play("goal-shift-plus-five","P1",["CT009-9S"],instructions=[{"op":"change-goal","playerId":"P2","delta":5},{"op":"discard","playerId":"P1","cardIds":["CT009-2C"],"requiredMinimum":1}])
cmd=[declare("CT009-C1","P1",p),passp("CT009-C2","P2"),passp("CT009-C3","P1"),resolve("CT009-C4","P1")]
F.append(fixture("CT-009","Nine +5 Goal Shift identifies the discard actor","Increase the opponent Goal, then discard from the controller hand in printed order.",s,cmd,{"hands":{"P1":[],"P2":[]},"goals":{"P1":21,"P2":26},"zones":{"gy":["CT009-2C","CT009-9S"]},"stackDepth":0},[True]*4))

# CT-010 — no discard available, earlier goal mutation remains.
s=state(); add(s,"CT010-9S","9♠","P1","P1_HAND")
p=play("goal-shift-plus-five","P1",["CT010-9S"],instructions=[{"op":"change-goal","playerId":"P2","delta":5},{"op":"discard","playerId":"P1","cardIds":[],"requiredMinimum":0}])
cmd=[declare("CT010-C1","P1",p),passp("CT010-C2","P2"),passp("CT010-C3","P1"),resolve("CT010-C4","P1")]
F.append(fixture("CT-010","Nine +5 persists when controller has no discard","Prove ordered resolution does not roll back an already completed Goal increase.",s,cmd,{"goals":{"P1":21,"P2":26},"zones":{"gy":["CT010-9S"]},"stackDepth":0},[True]*4))

# CT-011 — source intercept rebinds controller-relative generated play.
s=state(); add(s,"CT011-7C","7♣","P1","P1_HAND"); add(s,"CT011-5H","5♥","P2","P2_HAND"); add(s,"CT011-3H","3♥","P1","DP")
p1=play("generated-topdeck-play","P1",["CT011-7C"],instructions=[{"op":"take-card","cardId":"CT011-3H","playerId":"P1","revealUntilStart":True},{"op":"record","label":"controllerRelative","data":"P1"}])
p2=play("source-intercept","P2",["CT011-5H"],instructions=[{"op":"rebind-stack-item","stackItemId":"SI-CT011-C1","controllerId":"P2","replacementInstructions":[{"op":"take-card","cardId":"CT011-3H","playerId":"P2","revealUntilStart":True},{"op":"record","label":"controllerRelative","data":"P2"}]},{"op":"record","label":"interceptor","data":"P2"}])
cmd=[declare("CT011-C1","P1",p1),declare("CT011-C2","P2",p2,response=True),passp("CT011-C3","P1"),passp("CT011-C4","P2"),resolve("CT011-C5","P2"),passp("CT011-C6","P1"),passp("CT011-C7","P2"),resolve("CT011-C8","P2")]
F.append(fixture("CT-011","Source Intercept rebinds controller-relative text","Change generated-play controller without redeclaration and resolve controller-relative instructions for the interceptor.",s,cmd,{"hands":{"P1":[],"P2":["CT011-3H"]},"zones":{"gy":["CT011-5H","CT011-7C"]},"metadata":{"controllerRelative":"P2","interceptor":"P2"},"stackDepth":0},[True]*8))

# CT-026 — visible illegal target rewinds.
s=state(); add(s,"CT026-3C","3♣","P1","P1_HAND"); add(s,"CT026-8H","8♥","P2","P2_PR",state_data={"aegis":True,"pointValue":8})
p=play("single-target-bounce","P1",["CT026-3C"],["CT026-8H"],req=[{"kind":"card-in-zone","cardId":"CT026-8H","zone":"P2_PR"},{"kind":"target-unprotected","cardId":"CT026-8H"}],reval="single-required-target",instructions=[{"op":"move-card","cardId":"CT026-8H","zone":"DP"}])
F.append(fixture("CT-026","Visible illegal target rewinds completely","Reject an Aegised target after staging and restore all source and limit state.",s,[declare("CT026-C1","P1",p)],{"hands":{"P1":["CT026-3C"],"P2":[]},"stackDepth":0,"zones":{"staging":[]}},[False]))

# CT-027 — illegal Defuse rolls back staged costs.
s=state(); add(s,"CT027-3C","3♣","P1","P1_HAND"); add(s,"CT027-4D","4♦","P1","P1_HAND"); add(s,"CT027-QS","Q♠","P2","P2_PR",state_data={"aegis":True,"timeBombStage":2,"pointValue":6})
p=play("defuse","P1",[],["CT027-QS"],req=[{"kind":"target-unprotected","cardId":"CT027-QS"},{"kind":"hand-cost-available","playerId":"P1","cardIds":["CT027-3C","CT027-4D"]}],reval="single-required-target",instructions=[{"op":"remove-target","cardId":"CT027-QS","destination":"GY"}])
F.append(fixture("CT-027","Illegal Defuse rewinds staged discard costs","Prove declaration costs are staged transactionally and restored when public protection rejects the play.",s,[declare("CT027-C1","P1",p,["CT027-3C","CT027-4D"])],{"hands":{"P1":["CT027-3C","CT027-4D"],"P2":[]},"zones":{"gy":[],"staging":[]},"stackDepth":0},[False]))

# CT-028 — target leaves OTT during response; original play fizzles.
s=state(); add(s,"CT028-3C","3♣","P1","P1_HAND"); add(s,"CT028-3D","3♦","P2","P2_HAND"); add(s,"CT028-8H","8♥","P2","P2_PR",state_data={"pointValue":8})
p1=play("single-target-bounce","P1",["CT028-3C"],["CT028-8H"],req=[{"kind":"card-in-zone","cardId":"CT028-8H","zone":"P2_PR"}],reval="single-required-target",instructions=[{"op":"move-card","cardId":"CT028-8H","zone":"DP"}])
p2=play("response-remove-target","P2",["CT028-3D"],["CT028-8H"],reval="single-required-target",instructions=[{"op":"remove-target","cardId":"CT028-8H","destination":"GY"}])
cmd=[declare("CT028-C1","P1",p1),declare("CT028-C2","P2",p2,response=True),passp("CT028-C3","P1"),passp("CT028-C4","P2"),resolve("CT028-C5","P2"),passp("CT028-C6","P2"),passp("CT028-C7","P1"),resolve("CT028-C8","P1")]
F.append(fixture("CT-028","Legal declaration later fizzles after target leaves OTT","Revalidate the sole required target immediately before resolution and use failed-play destinations.",s,cmd,{"zones":{"gy":["CT028-8H","CT028-3D","CT028-3C"]},"stackDepth":0},[True]*8))

# CT-029 — Royal Marriage classification does not trigger Combo-only response.
s=state(); add(s,"CT029-KC","K♣","P1","P1_HAND"); add(s,"CT029-QC","Q♣","P1","P1_HAND"); add(s,"CT029-4H","4♥","P2","P2_ER",state_data={"faceDownTrap":True})
p=play("royal-marriage","P1",["CT029-KC","CT029-QC"],instructions=[{"op":"move-card","cardId":"CT029-KC","zone":"P1_ER"},{"op":"move-card","cardId":"CT029-QC","zone":"P1_ER"},{"op":"record","label":"comboTrapTriggered","data":False}],tags=["multi-card","anchor-play","royal-marriage"])
cmd=[declare("CT029-C1","P1",p),passp("CT029-C2","P2"),passp("CT029-C3","P1"),resolve("CT029-C4","P1")]
F.append(fixture("CT-029","Royal Marriage is not a Combo","Keep Royal Marriage as its own multi-card Anchor Play class and suppress Combo-only trigger logic.",s,cmd,{"metadata":{"comboTrapTriggered":False},"stackDepth":0},[True]*4))

# CT-030 — actual Combo can be countered by Combo Breaker skeleton.
s=state(); add(s,"CT030-3C","3♣","P1","P1_HAND"); add(s,"CT030-3D","3♦","P1","P1_HAND"); add(s,"CT030-4H","4♥","P2","P2_HAND")
p=play("combo","P1",["CT030-3C","CT030-3D"],instructions=[{"op":"record","label":"comboResolved","data":True}],tags=["combo"])
cmd=[declare("CT030-C1","P1",p),counter("CT030-C2","P2",["CT030-4H"]),passp("CT030-C3","P1"),passp("CT030-C4","P2"),resolve("CT030-C5","P2")]
F.append(fixture("CT-030","Combo-only counter answers a true Combo","Exercise counter skeleton and classification gate against an actual Combo stack item.",s,cmd,{"zones":{"gy":["CT030-3C","CT030-3D","CT030-4H"]},"metadata":{},"stackDepth":0},[True]*5))

# CT-031 — illegal response declaration leaves pending stack byte-equivalent.
s=state(); add(s,"CT031-3C","3♣","P1","P1_HAND"); add(s,"CT031-A","A♣","P2","DP")
p=play("ordinary-effect","P1",["CT031-3C"],instructions=[{"op":"record","label":"ordinaryResolved","data":True}])
invalid=play("counter","P2",["CT031-A"])
cmd=[declare("CT031-C1","P1",p),declare("CT031-C2","P2",invalid,response=True),passp("CT031-C3","P2"),passp("CT031-C4","P1"),resolve("CT031-C5","P1")]
F.append(fixture("CT-031","Illegal response rewinds without disturbing pending play","Reject a response source outside hand while preserving the older stack item and priority path.",s,cmd,{"metadata":{"ordinaryResolved":True},"zones":{"dp":["CT031-A"],"gy":["CT031-3C"]},"stackDepth":0},[True,False,True,True,True]))

# CT-032 — counter chain: countering counter preserves underlying play.
s=state(); add(s,"CT032-3C","3♣","P1","P1_HAND"); add(s,"CT032-AC","A♣","P2","P2_HAND"); add(s,"CT032-AD","A♦","P1","P1_HAND")
p=play("ordinary-effect","P1",["CT032-3C"],instructions=[{"op":"record","label":"underlyingResolved","data":True}])
cmd=[declare("CT032-C1","P1",p),counter("CT032-C2","P2",["CT032-AC"]),counter("CT032-C3","P1",["CT032-AD"]),passp("CT032-C4","P2"),passp("CT032-C5","P1"),resolve("CT032-C6","P1"),passp("CT032-C7","P2"),passp("CT032-C8","P1"),resolve("CT032-C9","P1")]
F.append(fixture("CT-032","Countering a counter preserves the underlying play","Resolve a two-deep counter chain with LIFO destinations and resume the original item.",s,cmd,{"metadata":{"underlyingResolved":True},"zones":{"gy":["CT032-AC","CT032-AD","CT032-3C"]},"stackDepth":0},[True]*9))

# CT-043 — response resolves before parent.
s=state(); add(s,"CT043-3C","3♣","P1","P1_HAND"); add(s,"CT043-4D","4♦","P2","P2_HAND")
p1=play("parent-effect","P1",["CT043-3C"],instructions=[{"op":"record","label":"parentOrder","data":2}])
p2=play("response-effect","P2",["CT043-4D"],instructions=[{"op":"record","label":"responseOrder","data":1}])
cmd=[declare("CT043-C1","P1",p1),declare("CT043-C2","P2",p2,response=True),passp("CT043-C3","P1"),passp("CT043-C4","P2"),resolve("CT043-C5","P2"),passp("CT043-C6","P2"),passp("CT043-C7","P1"),resolve("CT043-C8","P1")]
F.append(fixture("CT-043","LIFO response resolves before parent","Prove response stack order and renewed priority after the top item resolves.",s,cmd,{"metadata":{"responseOrder":1,"parentOrder":2},"stackDepth":0},[True]*8))

# CT-044 — repeatable event and hash stream.
s=state(); add(s,"CT044-3C","3♣","P1","P1_HAND")
p=play("determinism-smoke","P1",["CT044-3C"],instructions=[{"op":"record","label":"determinism","data":"stable"}])
cmd=[declare("CT044-C1","P1",p),passp("CT044-C2","P2"),passp("CT044-C3","P1"),resolve("CT044-C4","P1"),noop("CT044-C5","P1","post-resolution-stability")]
F.append(fixture("CT-044","Identical commands produce identical events and hashes","Certify command/event determinism without wall-clock or unordered iteration inputs.",s,cmd,{"metadata":{"determinism":"stable"},"zones":{"gy":["CT044-3C"]},"stackDepth":0},[True]*5))

# CT-045 — queued trigger flushes only after atomic parent finishes.
s=state(); add(s,"CT045-7C","7♣","P1","P1_HAND")
trigger={"id":"CT045-T1","controllerId":"P1","kind":"scoring-trigger","instructions":[{"op":"record","label":"triggerResolved","data":True}]}
p=play("trigger-producing-effect","P1",["CT045-7C"],instructions=[{"op":"record","label":"parentFinished","data":True},{"op":"enqueue-trigger","trigger":trigger}])
cmd=[declare("CT045-C1","P1",p),passp("CT045-C2","P2"),passp("CT045-C3","P1"),resolve("CT045-C4","P1"),passp("CT045-C5","P2"),passp("CT045-C6","P1"),resolve("CT045-C7","P1")]
F.append(fixture("CT-045","Triggers queue during atomic resolution","Finish the parent atomically, flush generated triggers, reopen priority, then resolve the trigger.",s,cmd,{"metadata":{"parentFinished":True,"triggerResolved":True},"stackDepth":0,"triggerQueueDepth":0},[True]*7))

# CT-046 — multiplayer priority order.
s=state(("P1","P2","P3")); add(s,"CT046-3C","3♣","P1","P1_HAND")
p=play("three-player-effect","P1",["CT046-3C"],instructions=[{"op":"record","label":"priorityCycle","data":["P2","P3","P1"]}])
cmd=[declare("CT046-C1","P1",p),passp("CT046-C2","P2"),passp("CT046-C3","P3"),passp("CT046-C4","P1"),resolve("CT046-C5","P1")]
F.append(fixture("CT-046","Priority rotates through every player","Require one complete consecutive-pass cycle in turn order before resolution.",s,cmd,{"metadata":{"priorityCycle":["P2","P3","P1"]},"stackDepth":0},[True]*5))

# CT-047 — ordinary counter removes target and source.
s=state(); add(s,"CT047-3C","3♣","P1","P1_HAND"); add(s,"CT047-AC","A♣","P2","P2_HAND")
p=play("ordinary-effect","P1",["CT047-3C"],instructions=[{"op":"record","label":"mustNotResolve","data":True}])
cmd=[declare("CT047-C1","P1",p),counter("CT047-C2","P2",["CT047-AC"]),passp("CT047-C3","P1"),passp("CT047-C4","P2"),resolve("CT047-C5","P2")]
F.append(fixture("CT-047","Counter removes the pending item","Apply default counter destinations and prevent the underlying instructions from running.",s,cmd,{"zones":{"gy":["CT047-3C","CT047-AC"]},"metadata":{},"stackDepth":0},[True]*5))

# CT-048 — self-counter after opponent pass.
s=state(); add(s,"CT048-3C","3♣","P1","P1_HAND"); add(s,"CT048-AC","A♣","P1","P1_HAND")
p=play("ordinary-effect","P1",["CT048-3C"],instructions=[{"op":"record","label":"mustNotResolve","data":True}])
cmd=[declare("CT048-C1","P1",p),passp("CT048-C2","P2"),counter("CT048-C3","P1",["CT048-AC"]),passp("CT048-C4","P2"),passp("CT048-C5","P1"),resolve("CT048-C6","P1")]
F.append(fixture("CT-048","A player may counter their own pending play","Exercise self-response timing after priority returns to the original controller.",s,cmd,{"zones":{"gy":["CT048-3C","CT048-AC"]},"metadata":{},"stackDepth":0},[True]*6))

# CT-049 — child stack item suspends and parent resumes.
s=state(); add(s,"CT049-7C","7♣","P1","P1_HAND"); add(s,"CT049-3D","3♦","P1","P1_HAND")
parent=play("sequential-parent","P1",["CT049-7C"],instructions=[{"op":"record","label":"parentResumed","data":True}])
child=play("child-play","P1",["CT049-3D"],instructions=[{"op":"record","label":"childResolved","data":True}])
cmd=[declare("CT049-C1","P1",parent),passp("CT049-C2","P2"),declare("CT049-C3","P1",child,response=True),passp("CT049-C4","P2"),passp("CT049-C5","P1"),resolve("CT049-C6","P1"),passp("CT049-C7","P2"),passp("CT049-C8","P1"),resolve("CT049-C9","P1")]
F.append(fixture("CT-049","Child play resolves before suspended parent resumes","Keep the older frame intact while a separate child stack item receives its own priority window.",s,cmd,{"metadata":{"childResolved":True,"parentResumed":True},"stackDepth":0},[True]*9))

# CT-050 — independent multi-target partial revalidation.
s=state(); add(s,"CT050-4C","4♣","P1","P1_HAND"); add(s,"CT050-3D","3♦","P2","P2_HAND"); add(s,"CT050-2C","2♣","P2","P2_PR",state_data={"pointValue":2}); add(s,"CT050-3H","3♥","P2","P2_PR",state_data={"pointValue":3})
p1=play("independent-multi-target-clear","P1",["CT050-4C"],["CT050-2C","CT050-3H"],reval="independent-targets",instructions=[{"op":"remove-target","cardId":"CT050-2C","destination":"GY"},{"op":"remove-target","cardId":"CT050-3H","destination":"GY"}])
p2=play("response-remove-one","P2",["CT050-3D"],["CT050-2C"],reval="single-required-target",instructions=[{"op":"remove-target","cardId":"CT050-2C","destination":"GY"}])
cmd=[declare("CT050-C1","P1",p1),declare("CT050-C2","P2",p2,response=True),passp("CT050-C3","P1"),passp("CT050-C4","P2"),resolve("CT050-C5","P2"),passp("CT050-C6","P2"),passp("CT050-C7","P1"),resolve("CT050-C8","P1")]
F.append(fixture("CT-050","Independent targets revalidate separately","Skip an already removed target while resolving the remaining legal target atomically.",s,cmd,{"zones":{"gy":["CT050-2C","CT050-3D","CT050-3H","CT050-4C"]},"stackDepth":0},[True]*8))

# CT-120 — hidden authoritative replay and public redaction.
s=state(); add(s,"CT120-CARD-01","A♠","P1","P1_HAND"); add(s,"CT120-CARD-02","K♣","P2","P2_HAND")
cmd=[{"id":"CT120-C1","type":"HIDDEN_CHOICE","actorId":"P1","choiceId":"private-order","payload":{"selectedCardId":"CT120-CARD-01","order":["CT120-CARD-01","CT120-CARD-02"]},"visibility":"authorized"},noop("CT120-C2","P1","replay-boundary")]
F.append(fixture("CT-120","Authorized replay preserves hidden choice without public leak","Store complete hidden decision payload for deterministic replay while public projection redacts identities and payload.",s,cmd,{"hands":{"P1":["CT120-CARD-01"],"P2":["CT120-CARD-02"]},"metadata":{"hiddenChoices":{"private-order":{"selectedCardId":"CT120-CARD-01","order":["CT120-CARD-01","CT120-CARD-02"]}}},"stackDepth":0},[True,True]))

out=ROOT/'fixtures'/'phase2-4-conformance.json'
out.write_text(json.dumps(F,ensure_ascii=False,indent=2)+"\n",encoding='utf-8')
print(f"wrote {len(F)} fixtures to {out}")
