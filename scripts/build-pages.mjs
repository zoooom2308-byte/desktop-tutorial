// Gradi statičnu stranicu za GitHub Pages u mapu docs/ (Pages: Deploy from a branch → /docs).
import fs from 'node:fs';
import path from 'node:path';
const API = process.env.NR_API || 'https://dqfukfvhatuiaziviloc.supabase.co/functions/v1/api';
fs.rmSync('docs', { recursive: true, force: true });
fs.cpSync('public', 'docs', { recursive: true });
for (const f of ['region.js', 'text.js', 'match.js', 'maps.js']) fs.copyFileSync(path.join('lib', f), path.join('docs', f));
fs.writeFileSync('docs/config.js', `globalThis.NR_CONFIG = { api: ${JSON.stringify(API)} };\n`);
fs.writeFileSync('docs/.nojekyll', '');
console.log('docs/ spreman, API =', API);
