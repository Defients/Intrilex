// ═══════════════════════════════════════════════════════════════
// tournament-repository.mjs — Tournament persistence layer
//
// Two implementations sharing the same interface:
//   InMemoryTournamentRepository — dev/test mode (Map-backed)
//   SupabaseTournamentRepository — production (Supabase-backed)
//
// Both implement the TournamentRepository interface:
//   list(status, limit) → TournamentDefinition[]
//   get(tournamentId)   → TournamentDefinition | null
//   save(tournament)    → void (upsert)
//   delete(tournamentId)→ void
//
// The repository stores the full TournamentDefinition as a single
// JSON document in the tournaments row, with participants and matches
// in normalized child tables for query flexibility.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TournamentDefinition
 * @property {string} tournamentId
 * @property {string} name
 * @property {string} format
 * @property {number} bestOf
 * @property {number} maxPlayers
 * @property {string} status
 * @property {string} createdAt
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {Array} players
 * @property {Array} matches
 * @property {number} swissRounds
 */

// ── In-Memory Implementation ──

export class InMemoryTournamentRepository {
  constructor() {
    this._store = new Map();
  }

  async list(status, limit = 100) {
    let tournaments = Array.from(this._store.values());
    if (status) {
      tournaments = tournaments.filter(t => t.status === status);
    }
    const statusOrder = { IN_PROGRESS: 0, REGISTRATION: 1, SCHEDULED: 2, FINALIZING: 3, COMPLETED: 4, CANCELLED: 5 };
    tournaments.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
    return tournaments.slice(0, limit);
  }

  async get(tournamentId) {
    return this._store.get(tournamentId) ?? null;
  }

  async save(tournament) {
    this._store.set(tournament.tournamentId, structuredClone(tournament));
  }

  async delete(tournamentId) {
    this._store.delete(tournamentId);
  }

  clear() {
    this._store.clear();
  }
}

// ── Supabase Implementation ──

export class SupabaseTournamentRepository {
  /**
   * @param {object} opts
   * @param {object} opts.client - Supabase service-role client
   */
  constructor({ client }) {
    if (!client) throw new Error('Supabase client is required');
    this._client = client;
  }

  /**
   * Reconstruct a TournamentDefinition from DB rows.
   * @param {object} tournamentRow
   * @param {Array} participantRows
   * @param {Array} matchRows
   * @returns {TournamentDefinition}
   */
  _reconstruct(tournamentRow, participantRows, matchRows) {
    return {
      tournamentId: tournamentRow.tournament_id,
      name: tournamentRow.name,
      format: tournamentRow.format,
      bestOf: tournamentRow.best_of,
      maxPlayers: tournamentRow.max_players,
      status: tournamentRow.status,
      swissRounds: tournamentRow.swiss_rounds ?? 0,
      createdAt: tournamentRow.created_at,
      startedAt: tournamentRow.started_at,
      completedAt: tournamentRow.completed_at,
      players: (participantRows ?? []).map(p => ({
        publicPlayerId: p.public_player_id,
        displayName: p.display_name,
        handle: p.handle,
        seed: p.seed,
      })),
      matches: (matchRows ?? []).map(m => ({
        matchId: m.match_id,
        round: m.round,
        playerAId: m.player_a_id,
        playerBId: m.player_b_id,
        status: m.status,
        winnerId: m.winner_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        matchRef: m.match_ref,
      })),
    };
  }

  async list(status, limit = 100) {
    let query = this._client
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) {
      console.error('[TournamentRepo] list failed:', error.message);
      return [];
    }
    // Load participants and matches for each tournament
    const result = [];
    for (const row of data ?? []) {
      const [pRes, mRes] = await Promise.all([
        this._client.from('tournament_participants').select('*').eq('tournament_id', row.tournament_id),
        this._client.from('tournament_matches').select('*').eq('tournament_id', row.tournament_id).order('round', { ascending: true }),
      ]);
      result.push(this._reconstruct(row, pRes.data ?? [], mRes.data ?? []));
    }
    // Sort by status priority
    const statusOrder = { IN_PROGRESS: 0, REGISTRATION: 1, SCHEDULED: 2, FINALIZING: 3, COMPLETED: 4, CANCELLED: 5 };
    result.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
    return result;
  }

  async get(tournamentId) {
    const { data: tRow, error: tErr } = await this._client
      .from('tournaments')
      .select('*')
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (tErr || !tRow) return null;

    const [pRes, mRes] = await Promise.all([
      this._client.from('tournament_participants').select('*').eq('tournament_id', tournamentId),
      this._client.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round', { ascending: true }),
    ]);
    return this._reconstruct(tRow, pRes.data ?? [], mRes.data ?? []);
  }

  async save(tournament) {
    const tournamentRow = {
      tournament_id: tournament.tournamentId,
      name: tournament.name,
      format: tournament.format,
      best_of: tournament.bestOf,
      max_players: tournament.maxPlayers,
      status: tournament.status,
      swiss_rounds: tournament.swissRounds ?? 0,
      started_at: tournament.startedAt,
      completed_at: tournament.completedAt,
    };

    // Upsert tournament row
    const { error: tErr } = await this._client
      .from('tournaments')
      .upsert(tournamentRow, { onConflict: 'tournament_id' });
    if (tErr) {
      console.error('[TournamentRepo] save tournament failed:', tErr.message);
      throw new Error(`Tournament save failed: ${tErr.message}`);
    }

    // Replace participants (delete + insert)
    await this._client
      .from('tournament_participants')
      .delete()
      .eq('tournament_id', tournament.tournamentId);
    if (tournament.players.length > 0) {
      const participantRows = tournament.players.map(p => ({
        tournament_id: tournament.tournamentId,
        user_id: p.userId ?? null, // userId may not always be available
        public_player_id: p.publicPlayerId,
        display_name: p.displayName,
        handle: p.handle,
        seed: p.seed,
      }));
      // Filter out rows without user_id (Supabase requires it)
      const validRows = participantRows.filter(r => r.user_id);
      if (validRows.length > 0) {
        const { error: pErr } = await this._client
          .from('tournament_participants')
          .insert(validRows);
        if (pErr) {
          console.error('[TournamentRepo] save participants failed:', pErr.message);
        }
      }
    }

    // Replace matches (delete + insert)
    await this._client
      .from('tournament_matches')
      .delete()
      .eq('tournament_id', tournament.tournamentId);
    if (tournament.matches.length > 0) {
      const matchRows = tournament.matches.map(m => ({
        match_id: m.matchId,
        tournament_id: tournament.tournamentId,
        round: m.round,
        player_a_id: m.playerAId,
        player_b_id: m.playerBId,
        status: m.status,
        winner_id: m.winnerId,
        score_a: m.scoreA,
        score_b: m.scoreB,
        match_ref: m.matchRef,
      }));
      const { error: mErr } = await this._client
        .from('tournament_matches')
        .insert(matchRows);
      if (mErr) {
        console.error('[TournamentRepo] save matches failed:', mErr.message);
      }
    }
  }

  async delete(tournamentId) {
    await this._client.from('tournaments').delete().eq('tournament_id', tournamentId);
  }
}
