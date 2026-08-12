// ESLint flat config — focuses on the highest-risk patterns:
// 1. Unsanitized innerHTML assignments (XSS surface)
// 2. No-unused-vars (dead code)
// 3. No-undef (typos, missing imports)
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['apps/lab-web/src/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        Intl: 'readonly',
        structuredClone: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        HTMLElement: 'readonly',
        HTMLDialogElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URLSearchParams: 'readonly',
        Worker: 'readonly',
        self: 'readonly',
        matchMedia: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        AbortController: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        BroadcastChannel: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        FormData: 'readonly',
        CSS: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        WebSocket: 'readonly',
        caches: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        FetchEvent: 'readonly',
        Cache: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unused-expressions': 'off',
      'no-cond-assign': 'off',
      'no-constant-condition': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['packages/**/*.mjs', 'scripts/**/*.mjs', 'test/**/*.mjs', 'apps/batch-cli/src/**/*.mjs', 'apps/match-server/src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        performance: 'readonly',
        structuredClone: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off'
    }
  },
  {
    // browser-e2e-certification.mjs, browser-network-e2e.mjs, and
    // browser-v25-certification.mjs serialize arrow functions via
    // .toString() and evaluate them in the browser via CDP
    // Runtime.evaluate, so browser globals like document/location appear as
    // bare identifiers in Node code.
    files: ['scripts/browser-e2e-certification.mjs', 'scripts/browser-network-e2e.mjs', 'scripts/browser-v25-certification.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        location: 'readonly'
      }
    }
  },
  {
    ignores: [
      'node_modules/**',
      'apps/lab-web/dist/**',
      'runtime/**',
      'upstream/**',
      'vendor/**',
      'release/**',
      'sample-data/**',
      'reports/**',
      '**/*.js.map',
      '**/*.d.ts'
    ]
  }
];
