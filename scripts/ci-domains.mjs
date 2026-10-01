export const CI_DOMAINS = ['integrity', 'static', 'engine', 'client', 'network', 'security', 'browser', 'release'];

/** A stage has exactly one reporting owner; the master runner keeps its ordering. */
export function ciDomain(name) {
  if (/^(vendor-integrity|engine-patch-integrity|truth-drift-check|release-provenance|release-inventory)$/.test(name)) return 'integrity';
  if (/^(package-graph|typecheck|client-types|lint|lint-ratchet|test-coverage-meta)/.test(name)) return 'static';
  if (/^(deploy-parity|manifest-verify|self-audit|release-package|release-verify|release-identity|release-truth|certification|v1\.0\.0-certified)/.test(name)) return 'release';
  if (/auth|security|secret|supabase|persistence|persistor|outbox|backup|reconnect|rating|ranked-leaderboard/.test(name)) return 'security';
  if (/browser|a11y|accessibility/.test(name)) return 'browser';
  if (/network|match-store|matchmaking|websocket|spectator|connection|rate-limit|competitive-journey|tournament|chat/.test(name)) return 'network';
  if (/engine|conformance|determin|privacy|hidden|autonomy|unit|integration|policy|policies|scoring|rank7|rank-legality|rules|wild-sovereignty|queens-court|board-lock|mimic|continuation|analytics|telemetry|statistics|benchmark|falsification|package-smoke/.test(name)) return 'engine';
  return 'client';
}
