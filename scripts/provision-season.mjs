// ═══════════════════════════════════════════════════════════════
// provision-season.mjs — Ranked season provisioning & lifecycle CLI
//
// Addresses H2: classifyMatch() requires resolveActiveSeasonId to return a
// non-null ACTIVE season. Without an operator path to create/activate a
// season, ranked admission fails closed silently from the player's view.
//
// This script is an operator runbook executable. It uses the Supabase
// service-role key (bypasses RLS) to manage the `ranked_seasons` table.
//
// Env:
//   SUPABASE_URL         — project URL (https://<project>.supabase.co)
//   SUPABASE_SECRET_KEY  — service-role key (server-only; never shipped to client)
//
// Usage:
//   node scripts/provision-season.mjs list
//   node scripts/provision-season.mjs current
//   node scripts/provision-season.mjs provision --ordinal 1 [--name "Season 1"]
//                      [--queue ranked] [--duration-days 90]
//                      [--starts-at <ISO>] [--activate]
//                      [--rules-version 4.3.1]
//   node scripts/provision-season.mjs activate --season-id season-1
//   node scripts/provision-season.mjs finalize --season-id season-1
//                      [--activate-next season-2]
//   node scripts/provision-season.mjs rollover [--queue ranked]
//                      [--auto-provision] [--duration-days 90]
//
// The `ranked_seasons_one_active` unique index permits exactly one ACTIVE
// season per queue. `activate` and `provision --activate` first archive any
// currently-active season in the same queue to respect that invariant.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import {
  SeasonStatus,
  RANKED_QUEUE_ID,
  seasonIdFromOrdinal,
  seasonNameFromOrdinal,
} from '@intrilex/account-domain';

// ── Pure helpers (exported for unit testing) ──

/**
 * Find the next UPCOMING season to activate during a rollover.
 * Selects the UPCOMING season with the lowest ordinal for the given queue.
 * @param {Array<object>} seasons - all seasons for a queue
 * @param {string} [queueId]
 * @returns {object|null} the next upcoming season, or null if none exists
 */
export function findNextUpcomingSeason(seasons, queueId = RANKED_QUEUE_ID) {
  if (!Array.isArray(seasons)) return null;
  const upcoming = seasons
    .filter(s => s.queue_id === queueId && s.status === SeasonStatus.UPCOMING)
    .sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
  return upcoming[0] ?? null;
}

/**
 * Find the currently ACTIVE season for a queue.
 * Works with DB rows (snake_case fields) as used by the provisioning script.
 * @param {Array<object>} seasons - DB rows with snake_case fields
 * @param {string} [queueId]
 * @returns {object|null}
 */
export function findActiveSeason(seasons, queueId = RANKED_QUEUE_ID) {
  if (!Array.isArray(seasons)) return null;
  const active = seasons
    .filter(s => s.queue_id === queueId && s.status === SeasonStatus.ACTIVE)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  return active[0] ?? null;
}

/**
 * Build a ranked_seasons row from CLI-style options.
 * @param {object} opts
 * @returns {{ season_id: string, queue_id: string, name: string, ordinal: number, starts_at: string, ends_at: string, status: string, rules_version?: string }}
 */
export function buildSeasonRow(opts = {}) {
  const ordinal = Number(opts.ordinal);
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new Error('ordinal must be a positive integer');
  }
  const queueId = opts.queueId ?? RANKED_QUEUE_ID;
  const seasonId = opts.seasonId ?? seasonIdFromOrdinal(ordinal);
  const name = opts.name ?? seasonNameFromOrdinal(ordinal);
  const durationMs = (Number(opts.durationDays) || 90) * 24 * 60 * 60 * 1000;
  const startsAt = opts.startsAt ? new Date(opts.startsAt).toISOString()
    : new Date(Date.now()).toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new Error('ends_at must be after starts_at');
  }
  /** @type {Record<string, string|number>} */
  const row = {
    season_id: seasonId,
    queue_id: queueId,
    name,
    ordinal,
    starts_at: startsAt,
    ends_at: endsAt,
    status: opts.activate ? SeasonStatus.ACTIVE : SeasonStatus.UPCOMING,
  };
  if (opts.rulesVersion) row.rules_version = String(opts.rulesVersion);
  return row;
}

/**
 * Parse argv into a command + options object.
 * @param {string[]} argv
 * @returns {{ command: string, opts: Record<string, string|boolean|number> }}
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    throw new Error('usage: provision-season.mjs <list|current|provision|activate|finalize> [...]');
  }
  const command = args[0];
  /** @type {Record<string, string|boolean|number>} */
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  if ('ordinal' in opts) opts.ordinal = Number(opts.ordinal);
  if ('duration-days' in opts || 'durationDays' in opts) {
    opts.durationDays = Number(opts['duration-days'] ?? opts.durationDays);
  }
  return { command, opts };
}

// ── Supabase client ──

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const TABLE = 'ranked_seasons';

/** @param {object} row */
function formatSeason(row) {
  return `${row.season_id}  [${row.status}]  ${row.queue_id}  "${row.name}"  ${row.starts_at} → ${row.ends_at}`;
}

async function listSeasons(client) {
  const { data, error } = await client.from(TABLE).select('*').order('ordinal', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log('No seasons found.');
    return;
  }
  for (const s of data) console.log(formatSeason(s));
}

async function currentSeason(client) {
  const { data, error } = await client.from(TABLE).select('*').order('ordinal', { ascending: true });
  if (error) throw error;
  const active = findActiveSeason(data ?? [], RANKED_QUEUE_ID);
  if (!active) {
    console.log('No ACTIVE season for queue "ranked". Ranked admission will fail closed.');
    return;
  }
  console.log(formatSeason(active));
}

/**
 * Archive any currently-ACTIVE season for a queue, to respect the
 * ranked_seasons_one_active unique index before activating another.
 * @param {object} client
 * @param {string} queueId
 * @returns {Promise<string|null>} the archived season_id, or null
 */
async function archiveActiveSeason(client, queueId) {
  const { data, error } = await client.from(TABLE)
    .select('*')
    .eq('queue_id', queueId)
    .eq('status', SeasonStatus.ACTIVE);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const current = data[0];
  const { error: updErr } = await client.from(TABLE)
    .update({ status: SeasonStatus.ARCHIVED, updated_at: new Date().toISOString() })
    .eq('season_id', current.season_id);
  if (updErr) throw updErr;
  return current.season_id;
}

async function provision(client, opts) {
  const row = buildSeasonRow(opts);
  // Insert (idempotent on season_id via unique constraint — upsert)
  const { error } = await client.from(TABLE).upsert(row, { onConflict: 'season_id' });
  if (error) throw error;
  console.log(`Provisioned: ${formatSeason(row)}`);
  if (opts.activate) {
    if (row.status !== SeasonStatus.ACTIVE) {
      // Row was inserted as UPCOMING; activate it now.
      const archived = await archiveActiveSeason(client, row.queue_id);
      if (archived && archived !== row.season_id) {
        console.log(`Archived previously-active season: ${archived}`);
      }
      const { error: actErr } = await client.from(TABLE)
        .update({ status: SeasonStatus.ACTIVE, updated_at: new Date().toISOString() })
        .eq('season_id', row.season_id);
      if (actErr) throw actErr;
      console.log(`Activated: ${row.season_id}`);
    } else {
      // Inserted directly as ACTIVE; ensure no other active season remains.
      const archived = await archiveActiveSeason(client, row.queue_id);
      if (archived && archived !== row.season_id) {
        console.log(`Archived previously-active season: ${archived}`);
      }
    }
  }
}

async function activate(client, opts) {
  const seasonId = opts['season-id'];
  if (!seasonId) throw new Error('--season-id is required for activate');
  // Fetch the season to learn its queue.
  const { data, error } = await client.from(TABLE).select('*').eq('season_id', seasonId).single();
  if (error) throw error;
  const archived = await archiveActiveSeason(client, data.queue_id);
  if (archived && archived !== seasonId) {
    console.log(`Archived previously-active season: ${archived}`);
  }
  const { error: actErr } = await client.from(TABLE)
    .update({ status: SeasonStatus.ACTIVE, updated_at: new Date().toISOString() })
    .eq('season_id', seasonId);
  if (actErr) throw actErr;
  console.log(`Activated: ${seasonId}`);
}

async function finalize(client, opts) {
  const seasonId = opts['season-id'];
  if (!seasonId) throw new Error('--season-id is required for finalize');
  const { error } = await client.from(TABLE)
    .update({ status: SeasonStatus.ARCHIVED, updated_at: new Date().toISOString() })
    .eq('season_id', seasonId);
  if (error) throw error;
  console.log(`Archived (finalized): ${seasonId}`);
  if (opts['activate-next']) {
    const next = opts['activate-next'];
    const { data, error: nextErr } = await client.from(TABLE).select('*').eq('season_id', next).single();
    if (nextErr) throw nextErr;
    const { error: actErr } = await client.from(TABLE)
      .update({ status: SeasonStatus.ACTIVE, updated_at: new Date().toISOString() })
      .eq('season_id', next);
    if (actErr) throw actErr;
    console.log(`Activated next: ${next}`);
  }
}

/**
 * Atomic season rollover: finalize the current ACTIVE season and activate
 * the next UPCOMING season for the same queue. If no UPCOMING season exists,
 * optionally auto-provision one with --auto-provision.
 *
 * This is the single-command season transition operator runbook action.
 *
 * @param {object} client - Supabase client
 * @param {Record<string, string|boolean|number>} opts
 */
async function rollover(client, opts) {
  const queueId = opts.queue ? String(opts.queue) : RANKED_QUEUE_ID;
  // 1. Fetch all seasons for the queue
  const { data: allSeasons, error: listErr } = await client.from(TABLE)
    .select('*')
    .eq('queue_id', queueId)
    .order('ordinal', { ascending: true });
  if (listErr) throw listErr;
  const seasons = allSeasons ?? [];

  // 2. Find the active season
  const active = findActiveSeason(seasons, queueId);
  if (!active) {
    throw new Error(`No ACTIVE season found for queue "${queueId}". Nothing to roll over.`);
  }

  // 3. Find the next upcoming season
  let next = findNextUpcomingSeason(seasons, queueId);

  // 4. Auto-provision if requested and no upcoming season exists
  if (!next && opts['auto-provision']) {
    const nextOrdinal = Number(active.ordinal) + 1;
    const row = buildSeasonRow({
      ordinal: nextOrdinal,
      queueId,
      rulesVersion: active.rules_version ?? undefined,
      durationDays: opts['duration-days'] ? Number(opts['duration-days']) : undefined,
    });
    const { error: insertErr } = await client.from(TABLE).upsert(row, { onConflict: 'season_id' });
    if (insertErr) throw insertErr;
    console.log(`Auto-provisioned: ${formatSeason(row)}`);
    next = row;
  }

  if (!next) {
    throw new Error(`No UPCOMING season found for queue "${queueId}". ` +
      'Provision one first with `provision --ordinal N`, or use --auto-provision.');
  }

  // 5. Finalize the active season (archive it)
  const { error: finErr } = await client.from(TABLE)
    .update({ status: SeasonStatus.ARCHIVED, updated_at: new Date().toISOString() })
    .eq('season_id', active.season_id);
  if (finErr) throw finErr;
  console.log(`Archived (finalized): ${active.season_id}`);

  // 6. Activate the next season
  const { error: actErr } = await client.from(TABLE)
    .update({ status: SeasonStatus.ACTIVE, updated_at: new Date().toISOString() })
    .eq('season_id', next.season_id);
  if (actErr) throw actErr;
  console.log(`Activated next: ${next.season_id}`);
  console.log(`Rollover complete: ${active.season_id} → ${next.season_id}`);
}

async function main() {
  const { command, opts } = parseArgs(process.argv);
  const client = getClient();
  switch (command) {
    case 'list': return listSeasons(client);
    case 'current': return currentSeason(client);
    case 'provision': return provision(client, opts);
    case 'activate': return activate(client, opts);
    case 'finalize': return finalize(client, opts);
    case 'rollover': return rollover(client, opts);
    default: throw new Error(`unknown command: ${command}`);
  }
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`provision-season: ${err.message ?? err}`);
    process.exit(1);
  });
}

export { main };
