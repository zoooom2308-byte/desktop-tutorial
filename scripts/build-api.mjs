// Pakira Supabase funkciju u jednu datoteku (dist/api.mjs) za objavu.
import { build } from 'esbuild';
import fs from 'node:fs';
await build({
  entryPoints: ['supabase/functions/api/main.mjs'], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
  outfile: 'dist/api.mjs', minify: true, legalComments: 'none', mainFields: ['module', 'main'],
  external: ['web-push', 'node:*'], alias: { '@netlify/blobs': './supabase/functions/api/netlify-blobs-stub.mjs' },
  logLevel: 'warning',
});
let s = fs.readFileSync('dist/api.mjs', 'utf8');
s = s.replace(/from\s*"web-push"/g, 'from"npm:web-push@3.6.7"').replace(/import\("web-push"\)/g, 'import("npm:web-push@3.6.7")');
fs.writeFileSync('dist/api.mjs', s);
console.log('dist/api.mjs', (s.length / 1024).toFixed(1) + ' KB', /npm:web-push/.test(s) ? 'web-push ok' : 'web-push MISSING');
