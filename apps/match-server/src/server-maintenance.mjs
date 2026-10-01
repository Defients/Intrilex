/** Owns connection liveness and expiry; it never resolves gameplay commands. */
export function startServerMaintenance({ connections, disconnect, logEvent,
  heartbeatInterval, matchStore, lobbyTtl, matchTtl, matchmakingQueue,
  onQueueTimeout, bannedIps, authAttempts, authAttemptWindowMs,
  timers = globalThis, now = Date.now }) {
  const heartbeat = timers.setInterval(() => {
    const time = now();
    for (const [cid, conn] of connections) {
      if (time - conn.lastHeartbeat > heartbeatInterval * 2) {
        try { disconnect(cid); } catch (error) { logEvent('heartbeatDisconnectError', { cid, error: error?.message }); }
        try { conn.ws.terminate(); } catch { /* peer already closed */ }
      } else {
        try { conn.ws.ping(); } catch { /* peer closing */ }
      }
    }
  }, heartbeatInterval);
  heartbeat.unref?.();
  const cleanup = timers.setInterval(() => {
    matchStore.cleanExpired({ lobbyTtl, matchTtl, historyTtl: 3600000 });
    for (const cid of matchmakingQueue?.cleanExpired() ?? []) {
      const conn = connections.get(cid);
      if (conn) onQueueTimeout(conn.ws);
    }
    const time = now();
    for (const [ip, expiry] of bannedIps) if (time > expiry) bannedIps.delete(ip);
    const cutoff = time - authAttemptWindowMs;
    for (const [ip, attempts] of authAttempts) {
      while (attempts.length > 0 && attempts[0] < cutoff) attempts.shift();
      if (attempts.length === 0) authAttempts.delete(ip);
    }
  }, 60000);
  cleanup.unref?.();
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      timers.clearInterval(heartbeat);
      timers.clearInterval(cleanup);
    },
  };
}
