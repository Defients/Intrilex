# Visual QA

Status: **PASS**

Rendered Chromium screenshots were inspected directly:

- `visual-qa/mobile-390.png`: single-column metrics, readable controls, no horizontal overflow.
- `visual-qa/tablet-768.png`: persistent experiment rail and two-column analytical surfaces.
- `visual-qa/desktop-1366.png`: dense Atlas/evidence split with legible confidence and evidence badges.
- `visual-qa/theatre-1920.png`: expanded canonical board and timeline suitable for capture.
- `visual-qa/reduced-motion.png`: reduced-motion presentation retains all semantic information.

A visual semantic defect was caught and fixed: automatic priority-advance rows are hidden by default; the visible timeline retains only the closure summary unless developer orchestration is enabled.
