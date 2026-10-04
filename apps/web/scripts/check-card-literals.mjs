// TRACK_FRONTEND §7: card components must contain no numeric literals; every
// number shown must come from a subscribed field or a format.ts string.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/components/card/', import.meta.url).pathname;
const NUM = /(?<![\w.#$-])\d+(?:\.\d+)?(?![\w])/g;
let failures = 0;

for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
  const src = readFileSync(join(dir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
  src.split('\n').forEach((line, i) => {
    if (/^\s*import\b/.test(line)) return;
    for (const m of line.matchAll(NUM)) {
      failures++;
      console.error(`${file}:${i + 1}: numeric literal "${m[0]}" -> ${line.trim()}`);
    }
  });
}

if (failures) process.exit(1);
console.log('card components: no numeric literals');
