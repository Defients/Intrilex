# Intrilex Engine v4.1.4 — Private Choice Authority Certification

## Verdict

`PASS` for the declared `first-contact-private-choice` teaching override.

Complete First Contact remains `REPLAY_ONLY` because Seven's independent scoring trigger is not part of this patch.

## Executed evidence

- Engine tests: **144/144**
- Original conformance fixtures: **121/121**
- Original conformance aggregate: `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`
- Certified vendor payload: **651 files**, payload `707377ea9fa94f449c293b6a4dcd8dc4b40dd058bcd6f9e5dd874339859cf168`
- Integration scenarios: **10/10**
- Final inherited certification: **121 certified replays**, at least **600 invariant fuzz cases**, **120/120 canonical source IDs**
- Independent Python replay corpus: **121 pairs**
- Private-choice stress cohort: **500 matches**
  - 495 normal victories
  - 5 Exhausted resolutions
  - 0 canonical draws
  - 0 decision-limit terminations
  - 0 engine rejections
  - 0 unsupported configurations
- Sealed private-choice decisions: **1,544**
- Counter/disrupt declarations: **1,308**
- Stress result hash: `95dbb2283ac94eeeffd389b4e21f38b5f8e168af7d1c1132269d66fee9fa2684`
- Browser proof: real Chromium main thread plus Web Worker
- Browser replay aggregate: `f7cd65a7f766265c569ef10571923cee8f34d1b3da5418a69d27a145a95ae322`
- Browser private-choice final state: `e988cc319aa97348cb86709226ad3d7fb1799587de0421be566d81b8a6625a63`
- Browser private-choice decision hash: `06db224172b4485a13a78c196735cec478109f189939bd7a3cc302f6a7c83e6d`

## Choice-family coverage

| Choice kind | Stress occurrences |
|---|---:|
| Rank 3 present | 153 |
| Rank 3 take | 134 |
| Rank 3 discard | 133 |
| Rank 5 rummage | 293 |
| Rank 6 dig | 238 |
| Rank 7 assignment | 272 |
| Rank 7 generated effect | 271 |
| Nine Anchor discard | 50 |

## Security conclusion

The patch exposes only viewer-authorized semantic actions. Choice tokens, legal option IDs, stable hidden card IDs, and private selections do not enter public state, event, legacy replay, or certified-v2 replay projections. Tampered, stale, malformed, and wrong-viewer submissions reject before mutation with zero events.

## Boundary conclusion

The patch lawfully closes generic mid-resolution choices for Three, Five, Six, Seven effect, and Nine Anchor while preserving v4.1.3 response authority. It does not certify Seven's scoring trigger, optional modules, suit-specific variants, Supers, Ultras, or multiplayer autonomy.
