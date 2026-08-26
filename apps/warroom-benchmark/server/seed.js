import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, slugify } from './db.js';
import { loadStackAdaptDirectory } from './ingest/stackadapt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Ensure StackAdapt library is loaded (idempotent via UPSERT).
const libDir = join(__dirname, '..', 'data', 'stackadapt');
const summary = loadStackAdaptDirectory(db, libDir);
summary.forEach((s) => console.log(`  ${s.rows.toString().padStart(6)}  ${s.file}`));
const total = db.prepare('SELECT COUNT(*) AS n FROM benchmarks').get().n;
console.log(`Benchmark library: ${total} rows.`);

// 2. Create a demo client + report bound to a slice.
const clientName = 'Acme Corp';
const clientSlug = slugify(clientName);
let client = db.prepare('SELECT * FROM clients WHERE slug = ?').get(clientSlug);
if (!client) {
  const info = db.prepare('INSERT INTO clients (slug, name, industry) VALUES (?, ?, ?)')
    .run(clientSlug, clientName, 'Retail');
  client = { id: info.lastInsertRowid, slug: clientSlug };
}

const reportSlug = 'stackadapt-video-us-demo';
let report = db.prepare('SELECT * FROM reports WHERE slug = ?').get(reportSlug);
if (!report) {
  const info = db.prepare(`
    INSERT INTO reports (
      slug, client_id, title, period_start, period_end, status, summary,
      benchmark_source, benchmark_period, benchmark_channel, benchmark_country
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reportSlug, client.id, 'Video Benchmark — May 2026 (US)',
    '2026-05-01', '2026-05-31', 'published',
    'Video CPMs, CTRs and completion rates benchmarked against the StackAdapt US library.',
    'StackAdapt Benchmarks', 'May 2026', 'Video', 'United States'
  );
  report = { id: info.lastInsertRowid, slug: reportSlug };
} else {
  db.prepare(`
    UPDATE reports SET
      status = 'published',
      benchmark_source = 'StackAdapt Benchmarks',
      benchmark_period = 'May 2026',
      benchmark_channel = 'Video',
      benchmark_country = 'United States'
    WHERE id = ?
  `).run(report.id);
}

console.log(`\nDemo report: http://localhost:4600/r/${reportSlug}`);
console.log(`Admin:       http://localhost:4600/admin.html`);
