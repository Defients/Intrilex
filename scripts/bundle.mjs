/**
 * esbuild bundler — minifies and hashes the main browser JS and CSS.
 * Must run AFTER build.mjs has copied src + engine to dist.
 *
 * Produces:
 *   dist/app.[hash].js   (minified, ES2020 target, bundled)
 *   dist/styles.[hash].css (minified)
 *   dist/BUNDLE_MANIFEST.json  (maps logical names → hashed filenames)
 *
 * The dev server uses the manifest to serve hashed assets with long-lived
 * cache headers, while non-hashed assets get shorter cache durations.
 */
import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');

async function bundle() {
  const entryJs = path.join(dist, 'app.js');
  const entryCss = path.join(dist, 'styles.css');

  if (!existsSync(entryJs)) {
    console.error('bundle: dist/app.js not found — run build.mjs first');
    process.exit(1);
  }

  // Bundle and minify JS — all imports resolve from dist/ where engine files exist
  const jsResult = await esbuild.build({
    entryPoints: [entryJs],
    bundle: true,
    minify: true,
    target: 'es2020', // Aligned with browserslist: last 2 versions, >0.2%, not dead
    format: 'esm',
    sourcemap: true,
    write: false,
    logLevel: 'info',
    absWorkingDir: dist
  });

  // Bundle and minify CSS — inline @import statements
  // Mark asset URLs as external so esbuild doesn't try to resolve font/image files
  const cssResult = await esbuild.build({
    entryPoints: [entryCss],
    bundle: true,
    minify: true,
    write: false,
    logLevel: 'info',
    external: ['*.ttf', '*.otf', '*.woff2', '*.png', '*.jpg', '*.jpeg', '*.svg', '*.gif', '*.webp', '/assets/*']
  });

  // Hash the outputs
  const jsContent = jsResult.outputFiles[0].contents;
  const cssContent = cssResult.outputFiles[0].text;
  const jsHash = createHash('sha256').update(jsContent).digest('hex').slice(0, 12);
  const cssHash = createHash('sha256').update(cssContent).digest('hex').slice(0, 12);

  const jsFileName = `app.${jsHash}.js`;
  const cssFileName = `styles.${cssHash}.css`;

  // Write hashed files to dist
  await writeFile(path.join(dist, jsFileName), jsContent);
  await writeFile(path.join(dist, cssFileName), cssContent);

  // Write source map
  if (jsResult.outputFiles[1]) {
    await writeFile(path.join(dist, `${jsFileName}.map`), jsResult.outputFiles[1].contents);
  }

  // Write bundle manifest
  const manifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    assets: {
      app: { file: jsFileName, hash: jsHash, type: 'js' },
      styles: { file: cssFileName, hash: cssHash, type: 'css' }
    }
  };
  await writeFile(path.join(dist, 'BUNDLE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Update index.html to reference hashed assets
  const indexHtmlPath = path.join(dist, 'index.html');
  if (existsSync(indexHtmlPath)) {
    let html = await readFile(indexHtmlPath, 'utf8');
    html = html.replace(/styles\.css/g, cssFileName);
    html = html.replace(/src="app\.js"/g, `src="${jsFileName}"`);
    // Inject browser-safe runtime config as an external JS file (CSP-compliant).
    // Contains: Supabase publishable credentials + match server WebSocket URL.
    // NEVER inject server secrets (SUPABASE_SECRET_KEY) here — this file is browser-visible.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const matchServerUrl = process.env.INTRILEX_MATCH_SERVER_URL || '';
    const hasSupabase = supabaseUrl && supabaseKey;
    const hasMatchServer = !!matchServerUrl;
    if ((hasSupabase || hasMatchServer) && !html.includes('__INTRILEX_CONFIG__')) {
      const configParts = [];
      if (hasSupabase) {
        configParts.push(`supabase:{url:${JSON.stringify(supabaseUrl)},publishableKey:${JSON.stringify(supabaseKey)}}`);
      }
      if (hasMatchServer) {
        configParts.push(`matchServerUrl:${JSON.stringify(matchServerUrl)}`);
      }
      const configBody = `window.__INTRILEX_CONFIG__={${configParts.join(',')}};`;
      // Content-hash the config file so the service worker can safely
      // cache it as an immutable asset (like app.[hash].js). When the
      // config changes between builds, the hash changes, the <script>
      // src changes, and the SW fetches the new file instead of serving
      // a stale cached version.
      const configHash = createHash('sha256').update(configBody).digest('hex').slice(0, 12);
      const configFileName = `__intrilex-config.${configHash}.js`;
      await writeFile(path.join(dist, configFileName), configBody);
      html = html.replace('</head>', `<script src="/${configFileName}"></script>\n</head>`);
      // Also write the unhashed name for dev-server compatibility and
      // as a fallback for SW versions that still special-case it.
      await writeFile(path.join(dist, '__intrilex-config.js'), configBody);
      if (hasMatchServer) {
        console.log(`bundle: injected match server URL: ${matchServerUrl}`);
      }
      console.log(`bundle: wrote ${configFileName}`);
    }

    // Inject production WebSocket endpoint into CSP connect-src directive.
    // This prevents mixed-content blocking when the frontend is on HTTPS
    // and the match server is on a separate WSS host.
    if (matchServerUrl && matchServerUrl.startsWith('wss://')) {
      const cspWsHost = matchServerUrl; // Full wss:// URL for CSP
      // Add the WSS endpoint to connect-src if not already present
      if (html.includes('connect-src') && !html.includes(cspWsHost)) {
        html = html.replace(
          /(connect-src[^;]*?)(;)/,
          `$1 ${cspWsHost}$2`
        );
        console.log(`bundle: added ${cspWsHost} to CSP connect-src`);
      }
    }

    await writeFile(indexHtmlPath, html);
    console.log(`bundle: updated index.html with hashed asset references`);
  }

  console.log(`bundle: wrote ${jsFileName} (${(jsContent.length / 1024).toFixed(1)} KB)`);
  console.log(`bundle: wrote ${cssFileName} (${(cssContent.length / 1024).toFixed(1)} KB)`);
  console.log(`bundle: manifest at BUNDLE_MANIFEST.json`);

  return manifest;
}

await bundle();
