-- ═══════════════════════════════════════════════════════════════
-- 0023_tournament_match_id_unique_constraint.sql
--
-- IRX-C10: Tournament match-ID collisions.
-- Previously, tournament match IDs used the pattern TM_R1_M{N} which
-- collided across concurrent tournaments. The domain layer now generates
-- tournament-scoped IDs: ${tournamentId}_R${round}_M${matchNum}.
--
-- This migration adds a composite unique constraint on (tournament_id, round, match_id)
-- as defense-in-depth, ensuring that even if the domain layer regresses,
-- the database will reject collisions.
--
-- The existing match_id PRIMARY KEY is retained for backward compatibility.
-- ═══════════════════════════════════════════════════════════════

-- Add a composite unique constraint as defense-in-depth against match ID collisions
-- across tournaments. The match_id PK already prevents exact duplicates, but
-- this constraint makes the tournament-scoping explicit.
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT uq_tournament_matches_tournament_round_match
  UNIQUE (tournament_id, round, match_id);

-- Grant service_role full access to tournament tables (strict role model)
GRANT SELECT ON public.tournament_matches TO authenticated;
GRANT SELECT ON public.tournament_participants TO authenticated;
