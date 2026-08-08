#!/usr/bin/env python3
"""Independent Python 3 verifier for Intrilex certified replay envelopes.

This verifier intentionally shares no TypeScript runtime code. It validates the
canonical JSON hashes, envelope integrity, checkpoint/event ranges, hash-chain
continuity, RNG trace commitments, and public replay projections.
"""
from __future__ import annotations
import hashlib, json, sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPLAYS = ROOT / "replays"
REPORTS = ROOT / "reports"

def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def h(value: Any) -> str:
    return sha(canonical(value))

def without(mapping: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {k: v for k, v in mapping.items() if k not in keys}

def verify_authorized(path: Path) -> list[str]:
    d = json.loads(path.read_text(encoding="utf-8")); failures: list[str] = []
    label = path.name
    if (d.get("format"), d.get("version"), d.get("codec"), d.get("rulesVersion")) != ("intrilex-replay", 2, "canonical-json-v1", "4.1"):
        failures.append(f"{label}: unsupported envelope")
    if h(d.get("initialState")) != d.get("initialStateHash"): failures.append(f"{label}: initialStateHash")
    events = d.get("events", []); checkpoints = d.get("checkpoints", [])
    if sha(canonical(events)) != d.get("eventLogHash"): failures.append(f"{label}: eventLogHash")
    if sha(canonical(checkpoints)) != d.get("checkpointLogHash"): failures.append(f"{label}: checkpointLogHash")
    trace = [{"commandIndex":c.get("commandIndex"),"commandId":c.get("commandId"),"before":c.get("rngBefore"),"after":c.get("rngAfter")} for c in checkpoints]
    if sha(canonical(trace)) != d.get("rngTraceHash"): failures.append(f"{label}: rngTraceHash")
    content = without(d, "contentHash", "integrityHash")
    if h(content) != d.get("contentHash"): failures.append(f"{label}: contentHash")
    if sha("intrilex-certified-replay-v2:" + str(d.get("contentHash"))) != d.get("integrityHash"): failures.append(f"{label}: integrityHash")
    commands = d.get("commands", []); accepted = d.get("accepted", [])
    if not (len(commands) == len(accepted) == len(checkpoints)): failures.append(f"{label}: command/checkpoint cardinality")
    prior = d.get("initialStateHash"); prior_revision = d.get("initialState", {}).get("revision")
    for i,c in enumerate(checkpoints):
        start,end = c.get("eventStartIndex"),c.get("eventEndIndex")
        if c.get("commandIndex") != i: failures.append(f"{label}: checkpoint[{i}] commandIndex")
        if i < len(commands) and c.get("commandId") != commands[i].get("id"): failures.append(f"{label}: checkpoint[{i}] commandId")
        if i < len(accepted) and c.get("accepted") != accepted[i]: failures.append(f"{label}: checkpoint[{i}] accepted")
        if not isinstance(start,int) or not isinstance(end,int) or start < 0 or end < start or end > len(events):
            failures.append(f"{label}: checkpoint[{i}] event range"); continue
        if sha(canonical(events[start:end])) != c.get("eventRangeHash"): failures.append(f"{label}: checkpoint[{i}] eventRangeHash")
        if c.get("stateHashBefore") != prior: failures.append(f"{label}: checkpoint[{i}] state chain")
        if c.get("revisionBefore") != prior_revision: failures.append(f"{label}: checkpoint[{i}] revision chain")
        for j,event in enumerate(events[start:end], start=start):
            expected_previous = c.get("stateHashBefore") if j == start else events[j-1].get("stateHash")
            if event.get("previousStateHash") != expected_previous: failures.append(f"{label}: event[{j}] previousStateHash")
        if end > start and events[end-1].get("stateHash") != c.get("stateHashAfter"): failures.append(f"{label}: checkpoint[{i}] terminal state hash")
        prior = c.get("stateHashAfter"); prior_revision = c.get("revisionAfter")
    if checkpoints and checkpoints[-1].get("stateHashAfter") != d.get("finalStateHash"): failures.append(f"{label}: finalStateHash chain")
    return failures

def verify_public(path: Path) -> list[str]:
    d = json.loads(path.read_text(encoding="utf-8")); failures: list[str]=[]; label=path.name
    if (d.get("format"),d.get("version"),d.get("codec")) != ("intrilex-public-replay",2,"canonical-json-v1"): failures.append(f"{label}: public envelope")
    events=d.get("events",[])
    if sha(canonical(events)) != d.get("publicEventLogHash"): failures.append(f"{label}: publicEventLogHash")
    if h(without(d,"publicContentHash")) != d.get("publicContentHash"): failures.append(f"{label}: publicContentHash")
    text=canonical(d)
    forbidden=("rngBefore","rngAfter","stateHashBefore","stateHashAfter","initialStateHash","finalStateHash","selectedCardId")
    for token in forbidden:
        if token in text: failures.append(f"{label}: leaked {token}")
    for i,c in enumerate(d.get("checkpoints",[])):
        start,end=c.get("eventStartIndex"),c.get("eventEndIndex")
        if isinstance(start,int) and isinstance(end,int) and sha(canonical(events[start:end])) != c.get("eventRangeHash"):
            failures.append(f"{label}: checkpoint[{i}] public eventRangeHash")
    return failures

def main() -> int:
    authorized=sorted(p for p in REPLAYS.glob("*.certified.replay.json") if not p.name.endswith(".public.certified.replay.json"))
    public=sorted(REPLAYS.glob("*.public.certified.replay.json"))
    failures=[]
    for p in authorized: failures.extend(verify_authorized(p))
    for p in public: failures.extend(verify_public(p))
    auth_ids={p.name.removesuffix(".certified.replay.json") for p in authorized}
    pub_ids={p.name.removesuffix(".public.certified.replay.json") for p in public}
    if auth_ids != pub_ids: failures.append("authorized/public certified replay ID sets differ")
    core={
      "runtime":"Python " + sys.version.split()[0],
      "algorithm":"independent canonical-hash/checkpoint verifier v1",
      "authorizedReplayCount":len(authorized),
      "publicReplayCount":len(public),
      "verifiedPairCount":len(auth_ids & pub_ids),
      "failureCount":len(failures),
      "failures":failures,
      "corpusHash":h(sorted(auth_ids)),
    }
    report={"verdict":"PASS" if not failures else "FAIL",**core,"aggregateHash":h(core)}
    REPORTS.mkdir(exist_ok=True)
    (REPORTS/"independent-python-replay-verification.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    (REPORTS/"independent-python-replay-verification.md").write_text(
      "# Independent Python Replay Verification\n\n"
      f"**Verdict: {report['verdict']}**\n\n"
      f"- Runtime: `{report['runtime']}`\n- Authorized replays: **{len(authorized)}**\n- Public replays: **{len(public)}**\n"
      f"- Verified pairs: **{report['verifiedPairCount']}**\n- Failures: **{len(failures)}**\n- Aggregate: `{report['aggregateHash']}`\n",
      encoding="utf-8")
    print(f"PYTHON REPLAY VERIFICATION {report['verdict']}: {report['verifiedPairCount']} pairs; aggregate={report['aggregateHash']}")
    if failures:
      print("\n".join(failures[:20]),file=sys.stderr)
      return 1
    return 0

if __name__ == "__main__": raise SystemExit(main())
