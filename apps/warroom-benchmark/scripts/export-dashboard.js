// Bake a self-contained HTML snapshot of the dashboard.
// The output embeds the full benchmark dataset + all filter facets and works
// entirely offline (Google Fonts is the only remote call).
//
//   npm run export:dashboard [output-path]
//
// The runtime uses the same UI/renderers as the live dashboard but reads
// from an embedded __DATASET__ instead of hitting the API.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || join(__dirname, '..', 'export', 'dashboard.html');

const rows = db.prepare(`
  SELECT channel, category, brand_category, country,
         impressions, ecpm_low, ecpm_high, ecpc, ecpe, ctr,
         video_completion, audio_completion
  FROM benchmarks
`).all();

const meta = {
  countries: [...new Set(rows.map((r) => r.country).filter(Boolean))].sort(),
  categories: [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(),
  brand_categories: [...new Set(rows.map((r) => r.brand_category).filter(Boolean))].sort(),
};

const brandCss = readFileSync(join(__dirname, '..', 'public', 'assets', 'brand.css'), 'utf8');
const dashCss = readFileSync(join(__dirname, '..', 'public', 'assets', 'dashboard.css'), 'utf8');
const dashJs = readFileSync(join(__dirname, '..', 'public', 'assets', 'dashboard.js'), 'utf8');
const dashHtml = readFileSync(join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

// Strip the raw dashboard.js of its live-fetch calls and inject a
// client-side aggregator that queries __DATASET__.
const bakedJs = dashJs
  .replace(/async function loadMeta\(\)[\s\S]*?await refreshFacets\(\);\n\}/, `
async function loadMeta() {
  const country = $('#f-country');
  country.innerHTML = '<option value="">All</option>' + __META__.countries.map((c) => '<option>' + c + '</option>').join('');
  await refreshFacets();
}`)
  .replace(/async function refreshFacets\(\)[\s\S]*?if \(!facets\.brand_categories\.includes\(prevBrand\)\) state\.brand_category = '';\n\}/, `
async function refreshFacets() {
  const matching = __DATASET__.filter((r) =>
    (!state.country || r.country === state.country) &&
    (state.channel === 'Overview' || r.channel === state.channel));
  const cats = [...new Set(matching.map((r) => r.category).filter(Boolean))].sort();
  const brands = [...new Set(matching.map((r) => r.brand_category).filter(Boolean))].sort();
  const prevCat = state.category, prevBrand = state.brand_category;
  $('#f-category').innerHTML = '<option value="">All</option>' + cats.map((c) => '<option' + (c === prevCat ? ' selected' : '') + '>' + c + '</option>').join('');
  $('#f-brand').innerHTML = '<option value="">All</option>' + brands.map((c) => '<option' + (c === prevBrand ? ' selected' : '') + '>' + c + '</option>').join('');
  if (!cats.includes(prevCat)) state.category = '';
  if (!brands.includes(prevBrand)) state.brand_category = '';
}`)
  .replace(/async function load\(\)[\s\S]*?renderTable\(data\.top_segments\);\n\}/, `
function avg(arr, key) {
  const vals = arr.map((r) => r[key]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function load() {
  await refreshFacets();
  const matching = __DATASET__.filter((r) =>
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
  $('#dash-sub').textContent = 'StackAdapt · May 2026 · ' + fmtInt(data.summary.matches) + ' rows · ' + fmtInt(data.summary.impressions) + ' impressions';
  $('#table-meta').textContent = 'Top ' + Math.min(data.top_segments.length, 100) + ' of ' + fmtInt(data.summary.matches) + ' segments (impression-sorted)';

  renderSummary(data.summary);
  renderTiles(data);
  renderTable(data.top_segments);
}`);

// Extract just the <body> markup from dashboard.html
const bodyMatch = dashHtml.match(/<body>([\s\S]*)<\/body>/);
const bodyMarkup = bodyMatch[1]
  .replace(/<link rel="stylesheet"[^>]*\/>/g, '')
  .replace(/<script src="\/assets\/dashboard\.js"><\/script>/, '');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>War Room — Benchmark Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${brandCss}</style>
<style>${dashCss}</style>
</head>
<body>
${bodyMarkup}
<script>
const __META__ = ${JSON.stringify(meta)};
const __DATASET__ = ${JSON.stringify(rows)};
${bakedJs}
</script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Wrote ${outPath} — ${(html.length / 1024).toFixed(1)} KB, ${rows.length} rows embedded.`);
