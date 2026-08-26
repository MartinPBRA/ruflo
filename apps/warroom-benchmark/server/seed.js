import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, slugify } from './db.js';
import { parseSpreadsheet } from './ingest/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const clientName = 'Acme Corp';
const clientIndustry = 'Retail';
const reportTitle = 'Q3 2026 Paid Media Benchmark';

const clientSlug = slugify(clientName);
let client = db.prepare('SELECT * FROM clients WHERE slug = ?').get(clientSlug);
if (!client) {
  const info = db.prepare('INSERT INTO clients (slug, name, industry) VALUES (?, ?, ?)')
    .run(clientSlug, clientName, clientIndustry);
  client = { id: info.lastInsertRowid, slug: clientSlug };
}

const reportSlug = `${slugify(reportTitle)}-demo`;
let report = db.prepare('SELECT * FROM reports WHERE slug = ?').get(reportSlug);
if (!report) {
  const info = db.prepare(`
    INSERT INTO reports (slug, client_id, title, period_start, period_end, status, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(reportSlug, client.id, reportTitle, '2026-07-01', '2026-09-30', 'published',
    'Cross-channel paid media performance benchmarked against retail industry averages.');
  report = { id: info.lastInsertRowid, slug: reportSlug };
}

const csv = readFileSync(join(__dirname, '..', 'examples', 'sample-benchmark.csv'));
const rows = parseSpreadsheet(csv, 'sample-benchmark.csv');
db.prepare('DELETE FROM report_rows WHERE report_id = ?').run(report.id);
const insert = db.prepare(`
  INSERT INTO report_rows
  (report_id, channel, metric, unit, client_value, benchmark_value, industry, better, notes, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
rows.forEach((r, i) => insert.run(
  report.id, r.channel, r.metric, r.unit, r.client_value, r.benchmark_value,
  r.industry, r.better, r.notes, i
));

console.log(`Seeded ${rows.length} rows.`);
console.log(`Report URL: http://localhost:4600/r/${reportSlug}`);
