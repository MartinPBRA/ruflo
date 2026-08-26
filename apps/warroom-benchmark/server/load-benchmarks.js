import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.js';
import { loadStackAdaptDirectory } from './ingest/stackadapt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dir = positional[0] || join(__dirname, '..', 'data', 'stackadapt');

if (process.argv.includes('--reset')) {
  db.exec('DELETE FROM benchmarks');
  console.log('Cleared benchmarks table.');
}

const summary = loadStackAdaptDirectory(db, dir);
summary.forEach((s) => console.log(`  ${s.rows.toString().padStart(6)}  ${s.file}`));
const total = db.prepare('SELECT COUNT(*) AS n FROM benchmarks').get().n;
console.log(`\nTotal rows in benchmarks table: ${total}`);
const byChannel = db.prepare('SELECT channel, COUNT(*) AS n FROM benchmarks GROUP BY channel ORDER BY channel').all();
byChannel.forEach((c) => console.log(`  ${c.n.toString().padStart(6)}  ${c.channel}`));
