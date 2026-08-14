// ═══════════════════════════════════════════════════════════════
// handlers/report-handlers.mjs — B12: Player report flow v1
//
// Handles REPORT_PLAYER messages from authenticated players who
// want to report another player for harassment, cheating, etc.
//
// Reports are persisted to Supabase via the submit_player_report
// SECURITY DEFINER RPC. The handler uses the reporter's auth.uid
// (from their Supabase access token) — not a client-supplied ID.
// ═══════════════════════════════════════════════════════════════

import { validateReportPlayer } from '@intrilex/network-protocol';
import { error as errorMsg, ReasonCode } from '@intrilex/network-protocol';

/**
 * Create report handlers.
 * @param {Object} ctx
 * @param {Map} ctx.connections
 * @param {object|null} [ctx.supabaseClient] - Supabase service-role client
 * @param {Function} ctx.send
 * @param {Function} ctx.logEvent
 * @returns {Object}
 */
export function createReportHandlers(ctx) {
  const { connections, supabaseClient = null, send, logEvent } = ctx;

  async function handleReportPlayer(connectionId, ws, payload, requestId) {
    const check = validateReportPlayer(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }

    const conn = connections.get(connectionId);
    if (!conn || !conn.account) {
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required to report', requestId));
    }

    if (!supabaseClient) {
      logEvent('report_no_supabase', { connectionId });
      return send(ws, errorMsg('REPORT_UNAVAILABLE', 'Reporting is not available on this server', requestId));
    }

    const reporterAccountId = conn.account.accountId;
    const reportedPlayerId = payload.reportedPlayerId;

    // Prevent self-reports
    if (reporterAccountId === reportedPlayerId) {
      return send(ws, errorMsg('REPORT_SELF_DENIED', 'Cannot report yourself', requestId));
    }

    try {
      // Call the SECURITY DEFINER RPC
      const { data, error: rpcError } = await supabaseClient.rpc('submit_player_report', {
        p_reported_id: reportedPlayerId,
        p_reason_code: payload.reasonCode,
        p_description: payload.description ?? null,
        p_match_ref: payload.matchRef ?? null,
      });

      if (rpcError) {
        logEvent('report_rpc_error', {
          connectionId,
          reporterId: reporterAccountId,
          error: rpcError.message,
        });
        return send(ws, errorMsg('REPORT_SUBMIT_FAILED', rpcError.message, requestId));
      }

      send(ws, {
        type: 'REPORT_SUBMITTED',
        requestId: requestId ?? undefined,
        payload: {
          reportId: data,
          status: 'SUBMITTED',
        },
      });
      logEvent('report_submitted', {
        connectionId,
        reporterId: reporterAccountId,
        reportedId: reportedPlayerId,
        reasonCode: payload.reasonCode,
      });
    } catch (err) {
      logEvent('report_exception', {
        connectionId,
        error: err?.message,
      });
      send(ws, errorMsg('REPORT_SUBMIT_FAILED', 'Failed to submit report', requestId));
    }
  }

  return { handleReportPlayer };
}
