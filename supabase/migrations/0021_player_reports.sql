-- ═══════════════════════════════════════════════════════════════
-- Migration 0021: player_reports
--
-- Player-submitted reports for moderation. The existing
-- account_moderation table tracks moderation STATUS (banned,
-- suspended); this table tracks the REPORT SUBMISSIONS that
-- feed moderation decisions.
--
-- Server-authoritative: only the service role can INSERT/UPDATE.
-- Players can INSERT via a SECURITY DEFINER RPC that validates
-- the reporter's auth.uid and prevents self-reports.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.player_reports (
  report_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code     text NOT NULL
    CHECK (reason_code IN (
      'HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER'
    )),
  description     text,
  match_ref        text,
  status          text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'REVIEWED', 'DISMISSED', 'ACTIONED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewer_notes  text
);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

-- Players can see their own submitted reports only
CREATE POLICY player_reports_select_own ON public.player_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE for authenticated role.
-- Reports are submitted via a SECURITY DEFINER RPC.

-- Index for moderation queries
CREATE INDEX IF NOT EXISTS idx_player_reports_reported_id
  ON public.player_reports(reported_id, status);
CREATE INDEX IF NOT EXISTS idx_player_reports_reporter_id
  ON public.player_reports(reporter_id, created_at);

-- ── submit_player_report RPC ──
-- Allows an authenticated player to submit a report.
-- Prevents self-reports and validates reason codes.
CREATE OR REPLACE FUNCTION public.submit_player_report(
  p_reported_id uuid,
  p_reason_code text,
  p_description text DEFAULT NULL,
  p_match_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  -- Validate reporter is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Prevent self-reports
  IF auth.uid() = p_reported_id THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = '44000';
  END IF;

  -- Validate reason code
  IF p_reason_code NOT IN ('HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid reason code' USING ERRCODE = '23514';
  END IF;

  -- Insert the report
  INSERT INTO player_reports (reporter_id, reported_id, reason_code, description, match_ref)
  VALUES (auth.uid(), p_reported_id, p_reason_code, p_description, p_match_ref)
  RETURNING report_id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_report TO authenticated;
