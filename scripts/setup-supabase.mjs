#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/setup-supabase.mjs — Interactive Supabase setup helper
//
// Run: node scripts/setup-supabase.mjs
//
// Automates:
//   1. Checks if Docker is available (for local Supabase)
//   2. Checks if supabase CLI is installed
//   3. Creates .env file from .env.example if missing
//   4. Guides through either local (Docker) or cloud Supabase setup
//   5. Applies migrations
//   6. Prints the keys you need to paste into .env
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('════════════════════════════════════════════════════════════');
console.log('  Intrilex Supabase Setup Helper');
console.log('════════════════════════════════════════════════════════════');
console.log();

// Step 1: Check prerequisites
console.log('Step 1: Checking prerequisites...');

let hasSupabaseCli = false;
try {
  execSync('supabase --version', { stdio: 'pipe' });
  hasSupabaseCli = true;
  console.log('  [OK] Supabase CLI is installed');
} catch {
  console.log('  [MISSING] Supabase CLI — install with: npm install -g supabase');
}

let hasDocker = false;
try {
  execSync('docker --version', { stdio: 'pipe' });
  hasDocker = true;
  console.log('  [OK] Docker is installed');
} catch {
  console.log('  [MISSING] Docker — required for local Supabase only');
}

console.log();

// Step 2: Create .env file if missing
console.log('Step 2: Checking .env file...');
const envPath = path.join(root, '.env');
const envExamplePath = path.join(root, '.env.example');

if (existsSync(envPath)) {
  console.log('  [OK] .env file already exists');
  // Check if it has real values
  const envContent = readFileSync(envPath, 'utf8');
  const hasPlaceholders = envContent.includes('your-') || envContent.includes('your_project');
  if (hasPlaceholders) {
    console.log('  [WARNING] .env still has placeholder values — fill in real keys below');
  }
} else if (existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log('  [CREATED] .env file copied from .env.example');
  console.log('  [ACTION] You need to fill in real values — see instructions below');
} else {
  console.log('  [ERROR] No .env.example found — cannot create .env');
}

console.log();

// Step 3: Print setup instructions
console.log('════════════════════════════════════════════════════════════');
console.log('  Setup Instructions');
console.log('════════════════════════════════════════════════════════════');
console.log();

if (hasDocker) {
  console.log('  OPTION A: Local Supabase (Docker required — you have it)');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  1. Start local Supabase:');
  console.log('     supabase start');
  console.log();
  console.log('  2. Apply migrations:');
  console.log('     supabase db reset');
  console.log('     (This creates all tables from supabase/migrations/*.sql)');
  console.log();
  console.log('  3. Get your local keys (printed by `supabase start`):');
  console.log('     - API URL:        http://127.0.0.1:54321');
  console.log('     - anon key:       (printed in the startup output)');
  console.log('     - service_role:   (printed in the startup output)');
  console.log();
  console.log('  4. Paste them into .env:');
  console.log('     SUPABASE_URL=http://127.0.0.1:54321');
  console.log('     SUPABASE_PUBLISHABLE_KEY=<anon key from step 3>');
  console.log('     SUPABASE_SECRET_KEY=<service_role key from step 3>');
  console.log();
  console.log('  5. Run the dev server:');
  console.log('     pnpm run dev:network');
  console.log();
} else {
  console.log('  OPTION A: Local Supabase — NOT AVAILABLE (Docker not installed)');
  console.log('  Install Docker Desktop: https://www.docker.com/products/docker-desktop/');
  console.log();
}

console.log('  OPTION B: Cloud Supabase (no Docker needed)');
console.log('  ─────────────────────────────────────────────────────');
console.log('  1. Create a free account at https://supabase.com');
console.log('  2. Create a new project (pick any name, e.g. "intrilex")');
console.log('  3. Wait for provisioning (~2 minutes)');
console.log('  4. Get your keys from Settings → API:');
console.log('     - Project URL:     https://xxxxx.supabase.co');
console.log('     - anon public:     eyJhbGci... (publishable key)');
console.log('     - service_role:    eyJhbGci... (secret key — KEEP PRIVATE!)');
console.log();
console.log('  5. Link the project (optional, for migrations via CLI):');
console.log('     supabase link --project-ref <your-project-ref>');
console.log();
console.log('  6. Apply migrations:');
if (hasSupabaseCli) {
  console.log('     supabase db push');
  console.log('     (This applies all files in supabase/migrations/*.sql)');
} else {
  console.log('     Go to SQL Editor in Supabase dashboard');
  console.log('     Paste and run each file from supabase/migrations/ in order:');
  console.log('     0001_profiles.sql → 0002_account_settings.sql → ... → 0007_migration_meta.sql');
}
console.log();
console.log('  7. Paste keys into .env:');
console.log('     SUPABASE_URL=https://xxxxx.supabase.co');
console.log('     SUPABASE_PUBLISHABLE_KEY=<anon public key>');
console.log('     SUPABASE_SECRET_KEY=<service_role key>');
console.log();
console.log('  8. (Optional) Enable Discord OAuth in Supabase dashboard:');
console.log('     Auth → Providers → Discord → Enable');
console.log('     Create a Discord app at https://discord.com/developers/applications');
console.log('     Set redirect URL to: https://xxxxx.supabase.co/auth/v1/callback');
console.log('     Paste Client ID + Client Secret into Supabase dashboard');
console.log();
console.log('  9. Run the dev server:');
console.log('     pnpm run dev:network');
console.log();

console.log('════════════════════════════════════════════════════════════');
console.log('  What the .env file should look like when done:');
console.log('════════════════════════════════════════════════════════════');
console.log();
console.log('  SUPABASE_URL=https://your-project.supabase.co');
console.log('  SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5... (anon key)');
console.log('  SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5... (service_role key)');
console.log('  INTRILEX_AUTH_MODE=required');
console.log();
console.log('════════════════════════════════════════════════════════════');
console.log('  Verification');
console.log('════════════════════════════════════════════════════════════');
console.log();
console.log('  After setup, verify with:');
console.log('    node -e "import(\'./apps/match-server/src/server.mjs\').then(async m => { const s = await m.startServer({ port: 0, host: \'127.0.0.1\', dbPath: \':memory:\', persistent: false }); console.log(\'Auth:\', s.matchResultPersistor.constructor.name); s.close(); })"');
console.log();
console.log('  You should see: "Auth: SupabaseMatchResultPersistor"');
console.log('  (If you see "FakeMatchResultPersistor", the env vars are not being read)');
console.log();
