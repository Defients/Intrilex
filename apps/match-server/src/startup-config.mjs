/** Validate before opening SQLite, listeners, workers, or maintenance timers. */
export function validateStartupConfig(opts, env = process.env) {
  const authMode = opts.authMode ?? env.INTRILEX_AUTH_MODE ?? 'disabled';
  if (!['required', 'disabled'].includes(authMode)) throw new Error('Invalid INTRILEX_AUTH_MODE; use required or disabled.');
  const allowedOrigins = opts.allowedOrigins ?? (env.INTRILEX_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some(value => typeof value !== 'string')) throw new Error('Allowed origins must be an array of origins.');
  if (env.NODE_ENV === 'production') {
    if (authMode !== 'required') throw new Error('Production requires explicit INTRILEX_AUTH_MODE=required.');
    if (!allowedOrigins.length || allowedOrigins.some(value => {
      try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value || url.hostname.includes('*') || Boolean(url.username || url.password); }
      catch { return true; }
    })) throw new Error('Production requires explicit HTTPS allowed origins without wildcards, credentials or paths.');
    if (opts.persistent === false || opts.dbPath === ':memory:' || opts.dbPath === '') throw new Error('Production requires file-backed match persistence.');
    if (opts.outboxDurable === false || opts.outboxPath === ':memory:' || opts.outboxPath === '') throw new Error('Production requires a durable file-backed terminal outbox.');
    if (opts.allowFakePersistor) throw new Error('Production forbids allowFakePersistor.');
    if (opts.matchResultPersistor?.constructor?.name === 'FakeMatchResultPersistor') throw new Error('Production forbids FakeMatchResultPersistor.');
  }
  return { authMode, allowedOrigins };
}
