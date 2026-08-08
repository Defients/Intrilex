# Intrilex Engine v4.2.4 — Advanced Core Authority

## Authority boundary

`core-advanced-authority` is a strict, fail-closed superset of v4.2.3. Policies receive semantic legal actions and authorized projections. The private command vault resolves selected action IDs to engine commands, and all state mutation remains inside `IntrilexEngine.execute`.

## Governing rules

The rules authority is Intrilex v4.1 with the v4.1.1 timing hotfix. Interrupt is a timing keyword only. No generic skip or turn tax exists. Stack Theft and Time Bomb Defuse keep only their printed penalties.

## Supported advanced families

- Royal Marriage: same-suit King + Queen as one multi-card Anchor Play.
- ⭐2 Commandeer: certified Score disposition only.
- ⭐4 Row Exchange: PR or ER structural exchange, attachment revalidation, fresh Aegis under post-exchange controllers; existing tap states remain.
- ⭐8 Absolute Scuttle: bypasses rank, suit, and ordinary Scuttle immunity, but not Aegis.
- ⭐J Tempo Force: +2 Mini-Turns, still capped at 3.
- 10♥ Tempo Spike: +2 Mini-Turns capped at 3, then draw 1; Rank-10 limit and Exile-Bound apply.
- 10♠ Exile Recovery: one Exile card to hand as Revealed-Until-Start; Rank-10 limit and Exile-Bound apply.
- 10♠ Stack Theft: printed Full-Turn skips only; the stolen play preserves paid costs and declaration history.
- ⭐A and K♠ response authority.
- 3 Black Ultra: Score → internal Base cast → Exile, atomically, with no internal priority window.
- 3 Red Ultra: Instant Ultra counter plus counter-resistant bottom-GY draw rider.
- 2 Black + 2 Red Ultra: +2 Mini-Turns capped at 3, then public Draw 2 or Exile-rummage branch.
- Voltage 5: public bottom-of-GY branch only, based on the Start snapshot and once per FT.

## Explicitly unavailable

The following are absent from legal action frames and rejected if submitted directly:

- 10♣ Foundation scoring trigger;
- 10♦ Mimic;
- ⭐2 Hold and its Start child play;
- private-choice Supers for ranks 3, 5, 6, and 7;
- Voltage 3, Voltage 4, and Voltage 5 refine;
- special scoring riders for Seven, 10♣, and Black Joker in this profile;
- Sudden Death autonomy;
- modules and multiplayer.

## Safety properties

- Invalid advanced declarations exact-rewind with zero events.
- Policies never receive raw `CoreAdvancedAction` payloads or command-vault contents.
- Object-form and legacy boolean Aegis both block ⭐8 and control-change effects where required.
- Already-Jacked hosts are excluded before policy selection and rejected at resolution.
- Ultra internal-cast failure fizzles that step while later roles continue.
- Every advertised advanced family is exercised in the 500-match certification corpus.
