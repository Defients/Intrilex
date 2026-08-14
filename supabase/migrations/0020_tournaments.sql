-- ═══════════════════════════════════════════════════════════════
-- Migration 0020: tournaments + tournament_participants + tournament_matches
--
-- Persistent human tournament infrastructure.
-- Written by the match server (service role) for tournament lifecycle:
--   creation, registration, bracket generation, result reporting.
-- Clients can read public tournament data; no client writes.
--
-- Tournament state is server-authoritative: the match server owns
-- bracket progression, pairing, and result recording. Clients
-- display server-provided data and never mutate bracket state.
-- ═══════════════════════════════════════════════════════════════

-- ── tournaments ──
CREATE TABLE IF NOT EXISTS public.tournaments (
  tournament_id    text PRIMARY KEY,
  name             text NOT NULL DEFAULT 'Untitled Tournament',
  format           text NOT NULL DEFAULT 'SINGLE_ELIM'
    CHECK (format IN ('SINGLE_ELIM', 'SWISS')),
  best_of          integer NOT NULL DEFAULT 1
    CHECK (best_of >= 1 AND best_of <= 7),
  max_players      integer NOT NULL DEFAULT 16
    CHECK (max_players >= 2 AND max_players <= 128),
  status           text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'REGISTRATION', 'IN_PROGRESS', 'FINALIZING', 'COMPLETED', 'CANCELLED')),
  swiss_rounds     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can browse tournaments
CREATE POLICY tournaments_select ON public.tournaments
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write tournament state.

-- ── tournament_participants ──
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  tournament_id     text NOT NULL REFERENCES public.tournaments(tournament_id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_player_id  text NOT NULL,
  display_name      text NOT NULL DEFAULT 'Player',
  handle            text,
  seed              integer NOT NULL DEFAULT 1,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see tournament participants
CREATE POLICY tournament_participants_select ON public.tournament_participants
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can register participants.

-- ── tournament_matches ──
-- Bracket matches within a tournament. Distinct from public.matches
-- (which records completed game matches). tournament_matches tracks
-- the bracket structure: rounds, pairings, scores, and winners.
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  match_id         text PRIMARY KEY,
  tournament_id    text NOT NULL REFERENCES public.tournaments(tournament_id) ON DELETE CASCADE,
  round            integer NOT NULL DEFAULT 1,
  player_a_id      text,
  player_b_id      text,
  status           text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'BYE')),
  winner_id        text,
  score_a          integer,
  score_b          integer,
  match_ref        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see bracket matches
CREATE POLICY tournament_matches_select ON public.tournament_matches
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write bracket state.

-- Index for efficient tournament lookups
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
  ON public.tournament_matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id
  ON public.tournament_participants(tournament_id);
