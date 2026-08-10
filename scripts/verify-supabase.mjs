// Quick verification that the match server starts with real Supabase credentials
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const { startServer } = await import('../apps/match-server/src/server.mjs');
const s = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', persistent: false });
console.log('Server started OK');
console.log('Persistor:', s.matchResultPersistor.constructor.name);
console.log('Auth mode:', process.env.INTRILEX_AUTH_MODE);
console.log('Supabase URL:', process.env.SUPABASE_URL);
await s.close();
process.exit(0);
