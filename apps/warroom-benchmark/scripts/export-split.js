// Emit the dashboard as four small files instead of one giant HTML:
//   export/dashboard-split/
//     index.html         (~4 KB)   layout shell + <link>/<script src>
//     dashboard.css      (~15 KB)  brand + dashboard styles concatenated
//     dashboard.js       (~10 KB)  runtime with a client-side aggregator
//     benchmarks.json    (~20 MB)  the data (also written as .json.gz)
//
// The runtime is the same UI as the live dashboard, but instead of hitting
// /api/benchmarks/* it fetches benchmarks.json once on load and slices it
// client-side. Also produces a .zip of the folder for easy FTP upload.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { db } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(__dirname, '..', 'export', 'dashboard-split');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// ------- Data -------
const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
const rawRows = db.prepare(`
  SELECT period, period_sort, channel, category, brand_category, country,
         impressions, ecpm_low, ecpm_high, ecpc, ecpe, ctr,
         video_completion, audio_completion
  FROM benchmarks
`).all();
const rows = rawRows.map((r) => ({
  period: r.period, channel: r.channel,
  category: r.category, brand_category: r.brand_category, country: r.country,
  impressions: r.impressions,
  ecpm_low: round(r.ecpm_low), ecpm_high: round(r.ecpm_high),
  ecpc: round(r.ecpc), ecpe: round(r.ecpe), ctr: round(r.ctr),
  video_completion: round(r.video_completion),
  audio_completion: round(r.audio_completion),
}));

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && v !== ''))];
const periodPairs = uniq(rawRows.map((r) => r.period))
  .map((p) => ({ period: p, sort: rawRows.find((r) => r.period === p)?.period_sort || p }))
  .sort((a, b) => b.sort.localeCompare(a.sort));

const dataset = {
  meta: {
    periods: periodPairs.map((p) => p.period),
    countries: uniq(rows.map((r) => r.country)).sort(),
    channels: uniq(rows.map((r) => r.channel)).sort(),
  },
  rows,
};

const jsonPath = join(outDir, 'benchmarks.json');
const jsonStr = JSON.stringify(dataset);
writeFileSync(jsonPath, jsonStr);
writeFileSync(jsonPath + '.gz', gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 }));

// ------- CSS -------
const brandCss = readFileSync(join(__dirname, '..', 'public', 'assets', 'brand.css'), 'utf8');
const dashCss = readFileSync(join(__dirname, '..', 'public', 'assets', 'dashboard.css'), 'utf8');
writeFileSync(join(outDir, 'dashboard.css'), `${brandCss}\n\n/* ---- dashboard ---- */\n${dashCss}`);

// ------- JS runtime -------
// Adapt public/assets/dashboard.js: replace the three fetch()-driven functions
// with a client-side aggregator over an in-memory __STATE__.dataset.
const dashJsSrc = readFileSync(join(__dirname, '..', 'public', 'assets', 'dashboard.js'), 'utf8');
const runtime = dashJsSrc
  .replace(/async function loadMeta\(\)[\s\S]*?await refreshFacets\(\);\n\}/, `
async function loadMeta() {
  const res = await fetch('benchmarks.json');
  if (!res.ok) throw new Error('Could not load benchmarks.json (' + res.status + ')');
  const payload = await res.json();
  __DATASET__ = payload.rows;
  meta = payload.meta;
  populate('#f-period', meta.periods, meta.periods[0] || '', false);
  state.period = meta.periods[0] || '';
  populate('#f-country', meta.countries);
  await refreshFacets();
}`)
  .replace(/async function refreshFacets\(\)[\s\S]*?if \(!facets\.brand_categories\.includes\(prev\.brand_category\)\) state\.brand_category = '';\n\}/, `
async function refreshFacets() {
  const matching = __DATASET__.filter((r) =>
    (!state.period  || r.period === state.period) &&
    (!state.country || r.country === state.country) &&
    (state.channel === 'Overview' || r.channel === state.channel));
  const facets = {
    categories:       [...new Set(matching.map((r) => r.category).filter(Boolean))].sort(),
    brand_categories: [...new Set(matching.map((r) => r.brand_category).filter(Boolean))].sort(),
  };
  const prev = { ...state };
  populate('#f-category', facets.categories, prev.category);
  populate('#f-brand', facets.brand_categories, prev.brand_category);
  if (!facets.categories.includes(prev.category)) state.category = '';
  if (!facets.brand_categories.includes(prev.brand_category)) state.brand_category = '';
}

function avg(arr, key) {
  const vals = arr.map((r) => r[key]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}`)
  .replace(/async function load\(\)[\s\S]*?renderTable\(data\.top_segments\);\n\}/, `
async function load() {
  await refreshFacets();
  const matching = __DATASET__.filter((r) =>
    (!state.period  || r.period === state.period) &&
    (state.channel === 'Overview' || r.channel === state.channel) &&
    (!state.country || r.country === state.country) &&
    (!state.category || r.category === state.category) &&
    (!state.brand_category || r.brand_category === state.brand_category));

  const summary = {
    matches: matching.length,
    impressions: matching.reduce((a, r) => a + (r.impressions || 0), 0),
    ecpm_low: avg(matching, 'ecpm_low'), ecpm_high: avg(matching, 'ecpm_high'),
    ecpc: avg(matching, 'ecpc'), ecpe: avg(matching, 'ecpe'),
    ctr: avg(matching, 'ctr'),
    video_completion: avg(matching, 'video_completion'),
    audio_completion: avg(matching, 'audio_completion'),
  };

  const channelWide = __DATASET__.filter((r) =>
    (!state.period || r.period === state.period) &&
    (!state.country || r.country === state.country) &&
    (!state.category || r.category === state.category) &&
    (!state.brand_category || r.brand_category === state.brand_category));
  const byChannelMap = new Map();
  for (const r of channelWide) {
    if (!byChannelMap.has(r.channel)) byChannelMap.set(r.channel, []);
    byChannelMap.get(r.channel).push(r);
  }
  const by_channel = [...byChannelMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([channel, arr]) => ({
    channel,
    matches: arr.length,
    impressions: arr.reduce((a, r) => a + (r.impressions || 0), 0),
    ecpm_low: avg(arr, 'ecpm_low'), ecpm_high: avg(arr, 'ecpm_high'),
    ecpc: avg(arr, 'ecpc'), ecpe: avg(arr, 'ecpe'),
    ctr: avg(arr, 'ctr'),
    video_completion: avg(arr, 'video_completion'),
    audio_completion: avg(arr, 'audio_completion'),
  }));

  const catMap = new Map();
  for (const r of matching) {
    if (!r.category) continue;
    if (!catMap.has(r.category)) catMap.set(r.category, []);
    catMap.get(r.category).push(r);
  }
  const by_category = [...catMap.entries()].map(([category, arr]) => ({
    category,
    matches: arr.length,
    impressions: arr.reduce((a, r) => a + (r.impressions || 0), 0),
    ecpm_low: avg(arr, 'ecpm_low'), ecpm_high: avg(arr, 'ecpm_high'),
    ecpc: avg(arr, 'ecpc'), ctr: avg(arr, 'ctr'),
    video_completion: avg(arr, 'video_completion'),
  })).sort((a, b) => b.impressions - a.impressions).slice(0, 15);

  const top_segments = [...matching]
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 100);

  const data = { summary, by_channel, top_segments, by_category };

  $('#dash-title').textContent = state.channel === 'Overview' ? 'Platform Benchmarks' : (state.channel + ' Benchmarks');
  $('#table-meta').textContent = 'Top ' + Math.min(data.top_segments.length, 100) + ' of ' + fmtInt(data.summary.matches) + ' segments (impression-sorted)';

  renderSummary(data.summary);
  renderTiles(data);
  renderTable(data.top_segments);
}`);

writeFileSync(join(outDir, 'dashboard.js'), `let __DATASET__ = [];\n${runtime}`);

// ------- HTML shell -------
// Reuse the DOM from public/dashboard.html but swap absolute /assets/ paths
// for relative ones and drop the extra stylesheet <link> tags.
const dashHtml = readFileSync(join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const bodyMatch = dashHtml.match(/<body>([\s\S]*)<\/body>/);
const bodyMarkup = bodyMatch[1]
  .replace(/<link rel="stylesheet"[^>]*\/?>/g, '')
  .replace(/<script src="\/assets\/dashboard\.js"><\/script>/, '');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>War Room — Benchmark Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Ancizar+Serif:ital,wght@0,400;0,700;0,800;1,400&family=Noto+Sans:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="dashboard.css">
</head>
<body>
${bodyMarkup}
<script src="dashboard.js"></script>
</body>
</html>
`;
writeFileSync(join(outDir, 'index.html'), html);

// ------- Package as .zip for FTP upload -------
const zipPath = outDir + '.zip';
if (existsSync(zipPath)) rmSync(zipPath);
try {
  execSync(`cd ${JSON.stringify(dirname(outDir))} && zip -qr ${JSON.stringify(zipPath)} ${JSON.stringify(dashboardDirName(outDir))}`, { stdio: 'pipe' });
} catch (err) {
  console.warn(`(zip step failed — install zip if you want the bundle: ${err.message.trim()})`);
}

function dashboardDirName(p) { return p.split('/').pop(); }

// ------- Report -------
const sizes = {
  html:   Buffer.byteLength(html),
  css:    Buffer.byteLength(readFileSync(join(outDir, 'dashboard.css'))),
  js:     Buffer.byteLength(readFileSync(join(outDir, 'dashboard.js'))),
  json:   Buffer.byteLength(readFileSync(join(outDir, 'benchmarks.json'))),
  gz:     Buffer.byteLength(readFileSync(join(outDir, 'benchmarks.json.gz'))),
};
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`Wrote split bundle to ${outDir}:`);
console.log(`  index.html          ${kb(sizes.html)}`);
console.log(`  dashboard.css       ${kb(sizes.css)}`);
console.log(`  dashboard.js        ${kb(sizes.js)}`);
console.log(`  benchmarks.json     ${mb(sizes.json)} (${mb(sizes.gz)} gzipped)`);
if (existsSync(zipPath)) console.log(`  ${zipPath.split('/').pop()}       ${mb(Buffer.byteLength(readFileSync(zipPath)))}`);
console.log(`\n${rows.length.toLocaleString()} rows embedded across ${dataset.meta.periods.length} periods.`);
