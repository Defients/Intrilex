#!/usr/bin/env python3
import copy, json
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


def base_state():
    return {
        "schemaVersion": 1,
        "rulesVersion": "4.1",
        "revision": 0,
        "phase": "Action",
        "activePlayerId": "P1",
        "turnOrder": ["P1", "P2"],
        "fullTurnSequence": 12,
        "startPhaseSequenceByPlayer": {"P1": 0, "P2": 0},
        "players": {
            "P1": {"id": "P1", "teamId": None, "goal": 21, "hand": [], "pr": [], "er": [], "limits": limits()},
            "P2": {"id": "P2", "teamId": None, "goal": 21, "hand": [], "pr": [], "er": [], "limits": limits()},
        },
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


def add(state, cid, identity, owner, zone, controller=None, marker=None):
    controller = controller or owner
    state["cards"][cid] = {
        "id": cid,
        "identity": identity,
        "originalOwnerId": owner,
        "controllerId": controller,
        "zone": zone,
        "state": marker or {},
    }
    if zone == "DP": state["zones"]["dp"].append(cid)
    elif zone == "GY": state["zones"]["gy"].append(cid)
    elif zone == "EXILE": state["zones"]["exile"].append(cid)
    elif zone == "SWAP_BAR": state["zones"]["swapBar"].append(cid)
    elif zone == "STAGING": state["zones"]["staging"].append(cid)
    elif zone.endswith("_HAND"): state["players"][zone[:-5]]["hand"].append(cid)
    elif zone.endswith("_PR"): state["players"][zone[:-3]]["pr"].append(cid)
    elif zone.endswith("_ER"): state["players"][zone[:-3]]["er"].append(cid)


def fixture(fid, title, purpose, state, commands, final, accepted=None):
    return {
        "id": fid,
        "title": title,
        "sourceTestId": fid,
        "purpose": purpose,
        "initialState": state,
        "commands": commands,
        "expectation": {"accepted": accepted or [True] * len(commands), "final": final},
    }

fixtures=[]

# CT-025 — exact Start ownership survives control change.
s=base_state()
add(s,"CT025-C1","8♦","P2","P2_PR", marker={
    "tapped": True,
    "tapState": {"kind":"start-phase","sourceRef":"⭐2 Commandeer","expiresAt":{"playerId":"P2","startSequence":1}},
    "pointValue":8,
})
fixtures.append(fixture("CT-025","Tap State records an exact future Start after controller change",
    "Prove a Start-based Tap State does not follow a later controller.", s, [
        {"id":"CT025-1","type":"CHANGE_CONTROLLER","actorId":"P1","cardId":"CT025-C1","controllerId":"P1"},
        {"id":"CT025-2","type":"BEGIN_START_PHASE","actorId":"P1","playerId":"P1"},
        {"id":"CT025-3","type":"BEGIN_START_PHASE","actorId":"P2","playerId":"P2"},
    ], {
        "playerZones":{"P2":{"pr":["CT025-C1"]}},
        "controllers":{"CT025-C1":"P1"},
        "absentMarkers":{"CT025-C1":["tapped","tapState"]},
        "startPhaseSequenceByPlayer":{"P1":1,"P2":1},
        "phase":"Start",
    }))

# CT-036 — exact reveal expiry.
s=base_state()
add(s,"CT036-C1","6♦","P1","P1_HAND", marker={"revealedUntil":{"playerId":"P1","startSequence":1}})
fixtures.append(fixture("CT-036","Revealed-Until-Start clears at the recorded Start",
    "Prove reveal visibility survives unrelated Starts and expires at its recorded event.", s, [
        {"id":"CT036-1","type":"BEGIN_START_PHASE","actorId":"P2","playerId":"P2"},
        {"id":"CT036-2","type":"BEGIN_START_PHASE","actorId":"P1","playerId":"P1"},
    ], {
        "hands":{"P1":["CT036-C1"],"P2":[]},
        "absentMarkers":{"CT036-C1":["revealedUntil"]},
        "startPhaseSequenceByPlayer":{"P1":1,"P2":1},
    }))

# CT-037 — reapplication replaces and expiry never drifts with controller.
s=base_state()
add(s,"CT037-C1","Q♣","P1","P1_ER", marker={"pointValue":0})
fixtures.append(fixture("CT-037","Aegis replacement owns one exact expiration event",
    "Prove a fresh Aegis replaces the old source/expiry and changing control does not move it.", s, [
        {"id":"CT037-1","type":"APPLY_AEGIS","actorId":"P1","cardId":"CT037-C1","sourceRef":"Queen entry","expiresAt":{"playerId":"P1","startSequence":1}},
        {"id":"CT037-2","type":"APPLY_AEGIS","actorId":"P2","cardId":"CT037-C1","sourceRef":"Q Quick","expiresAt":{"playerId":"P2","startSequence":2}},
        {"id":"CT037-3","type":"CHANGE_CONTROLLER","actorId":"P2","cardId":"CT037-C1","controllerId":"P2"},
        {"id":"CT037-4","type":"BEGIN_START_PHASE","actorId":"P1","playerId":"P1"},
        {"id":"CT037-5","type":"CHANGE_CONTROLLER","actorId":"P1","cardId":"CT037-C1","controllerId":"P1"},
        {"id":"CT037-6","type":"BEGIN_START_PHASE","actorId":"P2","playerId":"P2"},
        {"id":"CT037-7","type":"BEGIN_START_PHASE","actorId":"P2","playerId":"P2"},
    ], {
        "playerZones":{"P1":{"er":["CT037-C1"]}},
        "controllers":{"CT037-C1":"P1"},
        "absentMarkers":{"CT037-C1":["aegis"]},
        "startPhaseSequenceByPlayer":{"P1":1,"P2":2},
    }))

# CT-038 — destination replacement.
s=base_state()
add(s,"CT038-C1","10♦","P1","P1_PR", marker={"exileBound":True,"playedForEffect":True,"pointValue":10})
fixtures.append(fixture("CT-038","Exile-Bound replaces a would-be GY destination",
    "Prove Total Clear-style GY movement is replaced by Exile without erasing Exile-Bound.", s, [
        {"id":"CT038-1","type":"MOVE_CARD","actorId":"P2","cardId":"CT038-C1","destination":"GY"},
    ], {
        "zones":{"gy":[],"exile":["CT038-C1"]},
        "cardZones":{"CT038-C1":"EXILE"},
        "markers":{"CT038-C1":{"exileBound":True}},
        "absentMarkers":{"CT038-C1":["playedForEffect"]},
    }))

# CT-051 — Nine release follows current controller.
s=base_state()
add(s,"CT051-C1","8♥","P2","P2_PR", marker={"tapped":True,"tapState":{"kind":"nine-score","sourceRef":"9 Tap"},"pointValue":8})
add(s,"CT051-C2","3♣","P1","P1_HAND", marker={"pointValue":3})
fixtures.append(fixture("CT-051","Nine Tap releases when the current controller scores",
    "Prove the Nine condition is controller-dynamic rather than frozen at tap time.", s, [
        {"id":"CT051-1","type":"CHANGE_CONTROLLER","actorId":"P1","cardId":"CT051-C1","controllerId":"P1"},
        {"id":"CT051-2","type":"SCORE_CARD","actorId":"P1","playerId":"P1","cardId":"CT051-C2"},
    ], {
        "playerZones":{"P1":{"hand":[],"pr":["CT051-C2"]},"P2":{"pr":["CT051-C1"]}},
        "controllers":{"CT051-C1":"P1","CT051-C2":"P1"},
        "absentMarkers":{"CT051-C1":["tapped","tapState"]},
    }))

# CT-052 — reveal leaves hand cleanup.
s=base_state()
add(s,"CT052-C1","A♠","P1","P1_HAND", marker={"revealedUntil":{"playerId":"P1","startSequence":1}})
fixtures.append(fixture("CT-052","Reveal marker is removed when its card leaves hand",
    "Prove a revealed card does not regain visibility after later hand re-entry.", s, [
        {"id":"CT052-1","type":"MOVE_CARD","actorId":"P1","cardId":"CT052-C1","destination":"GY"},
        {"id":"CT052-2","type":"MOVE_CARD","actorId":"P1","cardId":"CT052-C1","destination":"P1_HAND","controllerId":"P1"},
    ], {
        "hands":{"P1":["CT052-C1"],"P2":[]},
        "zones":{"gy":[]},
        "absentMarkers":{"CT052-C1":["revealedUntil"]},
    }))

# CT-053 — Played-for-Effect cleanup only when leaving OTT.
s=base_state()
add(s,"CT053-C1","Q♦","P1","P1_PR", marker={"playedForEffect":True,"pointValue":2})
fixtures.append(fixture("CT-053","Played-for-Effect persists across OTT movement and clears on OTT exit",
    "Prove control and row changes do not erase the tag, while departure from OTT does.", s, [
        {"id":"CT053-1","type":"CHANGE_CONTROLLER","actorId":"P2","cardId":"CT053-C1","controllerId":"P2"},
        {"id":"CT053-2","type":"MOVE_CARD","actorId":"P2","cardId":"CT053-C1","destination":"P2_ER","controllerId":"P2"},
        {"id":"CT053-3","type":"MOVE_CARD","actorId":"P2","cardId":"CT053-C1","destination":"GY"},
    ], {
        "zones":{"gy":["CT053-C1"]},
        "cardZones":{"CT053-C1":"GY"},
        "controllers":{"CT053-C1":"P2"},
        "absentMarkers":{"CT053-C1":["playedForEffect"]},
    }))

# CT-054 — Exile-Bound is match-persistent.
s=base_state()
add(s,"CT054-C1","10♠","P1","P1_HAND", marker={"exileBound":True})
fixtures.append(fixture("CT-054","Exile-Bound persists through every zone change",
    "Prove the permanent marker survives scoring, hand return, and final destination replacement.", s, [
        {"id":"CT054-1","type":"MOVE_CARD","actorId":"P1","cardId":"CT054-C1","destination":"P1_PR","controllerId":"P1"},
        {"id":"CT054-2","type":"MOVE_CARD","actorId":"P1","cardId":"CT054-C1","destination":"P1_HAND","controllerId":"P1"},
        {"id":"CT054-3","type":"MOVE_CARD","actorId":"P1","cardId":"CT054-C1","destination":"GY"},
    ], {
        "zones":{"gy":[],"exile":["CT054-C1"]},
        "cardZones":{"CT054-C1":"EXILE"},
        "markers":{"CT054-C1":{"exileBound":True}},
    }))

out=ROOT/'fixtures'/'phase5-lifecycle-conformance.json'
out.write_text(json.dumps(fixtures, indent=2, ensure_ascii=False)+"\n", encoding='utf-8')
print(f"wrote {len(fixtures)} fixtures to {out}")
