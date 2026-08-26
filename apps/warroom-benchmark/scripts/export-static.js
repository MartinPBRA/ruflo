import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2] || 'stackadapt-video-us-demo';
const outPath = process.argv[3] || join(__dirname, '..', 'export', `${slug}.html`);

const r = db.prepare(`
  SELECT r.*, c.name AS client_name, c.industry AS client_industry
  FROM reports r JOIN clients c ON c.id = r.client_id WHERE r.slug = ?
`).get(slug);
if (!r) { console.error(`Report ${slug} not found`); process.exit(1); }

const rows = db.prepare(`
  SELECT channel, metric, unit, client_value, benchmark_value, industry, better, notes
  FROM report_rows WHERE report_id = ? ORDER BY sort_order, id
`).all(r.id);

function bench(r) {
  const filters = [];
  const params = [];
  for (const [k, col] of [
    ['benchmark_source', 'source'], ['benchmark_period', 'period'],
    ['benchmark_channel', 'channel'], ['benchmark_category', 'category'],
    ['benchmark_brand_category', 'brand_category'], ['benchmark_country', 'country'],
  ]) if (r[k]) { filters.push(`${col} = ?`); params.push(r[k]); }
  if (!filters.length) return null;
  const where = `WHERE ${filters.join(' AND ')}`;
  const agg = db.prepare(`
    SELECT COUNT(*) matches, SUM(COALESCE(impressions,0)) total_impressions,
      AVG(ecpm_low) ecpm_low, AVG(ecpm_high) ecpm_high, AVG(ecpc) ecpc,
      AVG(ecpe) ecpe, AVG(ctr) ctr, AVG(video_completion) video_completion,
      AVG(audio_completion) audio_completion
    FROM benchmarks ${where}
  `).get(...params);
  if (!agg.matches) return null;
  const topRows = db.prepare(`SELECT * FROM benchmarks ${where} ORDER BY impressions DESC LIMIT 50`).all(...params);
  return { filters: {
    source: r.benchmark_source, period: r.benchmark_period, channel: r.benchmark_channel,
    category: r.benchmark_category, brand_category: r.benchmark_brand_category, country: r.benchmark_country,
  }, agg, rows: topRows };
}

const data = {
  title: r.title,
  client: { name: r.client_name, industry: r.client_industry },
  period: { start: r.period_start, end: r.period_end },
  summary: r.summary,
  rows,
  benchmark: bench(r),
};

const css = readFileSync(join(__dirname, '..', 'public', 'assets', 'brand.css'), 'utf8');
const reportJs = readFileSync(join(__dirname, '..', 'public', 'assets', 'report.js'), 'utf8');

// Strip the fetch call and inject data directly.
const inlineJs = reportJs
  .replace(/^const slug = .*/m, `const __DATA__ = ${JSON.stringify(data)};`)
  .replace(/async function main\(\) \{[\s\S]*?const res = await fetch[\s\S]*?const data = await res\.json\(\);/, `async function main() {
    document.getElementById('footer-date').textContent = new Date().toISOString().slice(0, 10);
    try {
      const data = __DATA__;`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${data.title} — War Room</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<nav class="wr-nav">
  <div class="wr-nav-inner">
    <div class="wr-logo">War Room</div>
    <div class="wr-nav-meta" id="nav-meta">${data.client?.name || 'Benchmark Report'}</div>
  </div>
</nav>
<main id="app"><div class="wr-shell wr-empty">Rendering…</div></main>
<footer class="wr-footer wr-shell">
  <span>© War Room Inc. — Paid Media Benchmark</span>
  <span id="footer-date"></span>
</footer>
<script>${inlineJs}</script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
