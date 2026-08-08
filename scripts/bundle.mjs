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

  // Minify CSS
  const cssResult = await esbuild.build({
    entryPoints: [entryCss],
    minify: true,
    write: false,
    logLevel: 'info'
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
    await writeFile(indexHtmlPath, html);
    console.log(`bundle: updated index.html with hashed asset references`);
  }

  console.log(`bundle: wrote ${jsFileName} (${(jsContent.length / 1024).toFixed(1)} KB)`);
  console.log(`bundle: wrote ${cssFileName} (${(cssContent.length / 1024).toFixed(1)} KB)`);
  console.log(`bundle: manifest at BUNDLE_MANIFEST.json`);

  return manifest;
}

await bundle();
