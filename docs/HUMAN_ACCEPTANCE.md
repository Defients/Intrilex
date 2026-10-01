# Release candidate human acceptance

Status: **BLOCKED - no participant or isolated staging project available**, confirmed by Deffy on October 1, 2026 (America/New_York).

Automated Chrome checks are supporting evidence. They do not establish human keyboard, screen reader, player comprehension, or classic-board parity acceptance.

## Session record

Record candidate Git commit/tree, artifact SHA-256, participant, absolute date/time, OS/device, browser/version, assistive technology/version, viewport/input method, result for every journey, and issue/reproduction steps. Use PASS, FAIL, or NOT_RUN; blank results do not pass. Save records in ignored `reports/release/human/` and bind their provenance to the candidate.

## Required journeys

1. Keyboard only: landing navigation, Sign In open/Tab/Shift+Tab/Escape/focus return, standard overlays, game setup, action composer, inspect, cancel, private choice, terminal result and rematch. Focus must stay visible and reach every required action without a mouse.
2. Screen reader: landmarks and heading order, dialog names and modality, hidden-card privacy, legal actions and disabled explanations, ordered event announcements, private choices, turn/response ownership, terminal result and replay controls. Exercise NVDA with supported Windows Chrome or Firefox, and VoiceOver with Safari before claiming those combinations accepted.
3. Player: start/complete a local game, understand response windows and private choices, resume a saved game, inspect a card, enter Academy/Guided play, and find terminal evidence. Record misunderstandings as issues instead of silently changing rules.
4. Caster: public projection and explicitly authorized omniscient replay, read-only status, stepping/playback, WAIT WHAT, annotations, exit, narrow viewport and reduced motion. Compare the displayed evidence against the replay.
5. Online, on isolated staging: two accounts, reconnect, authorized replay/projection, terminal delivery and rematch. Use the companion staging security procedure. A development fake is not a hosted ranked-write proof.
6. Classic retirement: run every item in `STABILIZATION_CAMPAIGN.md`'s parity checklist against Homecoming and classic. Removal requires recorded acceptance; retaining classic is the current decision.

## Device/browser evidence

Windows Chrome automated coverage exists; Chromium viewport emulation is not a physical mobile-device test. Firefox, Safari, actual touch devices and human assistive-technology sessions remain NOT_RUN until recorded. Do not publish an expanded supported matrix from engine replay parity alone.

## Completion gate

Resolve every blocking issue, repeat the affected journey on the final candidate, and record acceptance. Hosted security and provider revocation use their own evidence; this document grants no production or credential operation approval.
