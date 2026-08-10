-- ═══════════════════════════════════════════════════════════════
-- Migration 0004: matches + match_participants
--
-- Authoritative completed match summaries.
-- Written by the match server (service role) on terminal match.
-- Clients can read their own match history; no client writes.
--
-- No participant tokens stored here — those live in the match server's
-- SQLite store for active match reconnect.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.matches (
  match_id              text PRIMARY KEY,
  rules_profile_id      text NOT NULL,
  status                text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('COMPLETED', 'ABORTED', 'EXPIRED')),
  started_at            timestamptz NOT NULL,
  ended_at              timestamptz NOT NULL DEFAULT now(),
  termination_reason    text,
  winner_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replay_hash           text,
  server_version        text,
  rules_version         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── match_participants ──
-- Created BEFORE the matches RLS policy so the policy can reference it.

CREATE TABLE IF NOT EXISTS public.match_participants (
  match_id      text NOT NULL REFERENCES public.matches(match_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat          text NOT NULL CHECK (seat IN ('P1', 'P2')),
  result        text NOT NULL CHECK (result IN ('WIN', 'LOSS', 'DRAW', 'ABORT')),
  rating_before integer,
  rating_after  integer,
  rating_delta  integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

-- Enable RLS on both tables before creating policies

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Owner can read matches they participated in
CREATE POLICY matches_participant_select ON public.matches
  FOR SELECT TO authenticated
  USING (
    winner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = matches.match_id AND mp.user_id = auth.uid()
    )
  );

-- Owner can read their own participation records
CREATE POLICY match_participants_owner_select ON public.match_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write match results.
