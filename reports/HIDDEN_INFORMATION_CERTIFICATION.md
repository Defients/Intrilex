# Hidden Information Certification

Status: **PASS**

- Policies receive authorized observations and semantic action IDs only.
- Public replays use replay-scoped opaque handles.
- Public data excludes private card identities, choice candidates, command-vault bodies, raw RNG state, private hashes, and hidden response identities.
- Omniscient analytics never feeds policy observations.
- Chromium selected-player projection showed zero opponent-hand identity leaks.
- Public initial load does not fetch authorized artifacts.
