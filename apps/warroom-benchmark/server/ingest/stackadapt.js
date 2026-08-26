import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

// Parse a StackAdapt-style value: "$2.24  ~ $2.63" -> {low: 2.24, high: 2.63}
// "$1.16 " -> {low: 1.16, high: 1.16}
// "0.25%" -> {low: 0.25, high: 0.25}  (caller decides where to store it)
// "N/A" -> null
// "6,681" -> {low: 6681, high: 6681}
export function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === 'N/A' || s === '-') return null;
  const cleaned = s.replace(/[$,%\s]/g, '').replace(/\s+/g, '');
  if (cleaned.includes('~')) {
    const [lo, hi] = cleaned.split('~').map((p) => Number(p));
    if (Number.isFinite(lo) && Number.isFinite(hi)) return { low: lo, high: hi };
    if (Number.isFinite(lo)) return { low: lo, high: lo };
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? { low: n, high: n } : null;
}

function scalar(raw) {
  const p = parseValue(raw);
  return p ? p.low : null;
}

function integer(raw) {
  const p = parseValue(raw);
  return p ? Math.round(p.low) : null;
}

// Filenames look like "StackAdapt_Benchmarks__Video__May_2026.csv".
function metaFromFilename(name) {
  const base = basename(name, '.csv');
  const parts = base.split('__');
  return {
    source: parts[0]?.replace(/_/g, ' ') || 'StackAdapt Benchmarks',
    channel: parts[1] || 'Unknown',
    period: parts[2]?.replace(/_/g, ' ') || 'Unknown',
  };
}

export function parseStackAdaptCsv(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const { source, period, channel } = metaFromFilename(filePath);
  return records.map((r) => {
    const ecpm = parseValue(r.eCPM);
    return {
      source, period, channel,
      category: r.Category || null,
      brand_category: r['Brand Category'] || null,
      country: r.Country || null,
      impressions: integer(r.Impressions),
      ecpm_low: ecpm?.low ?? null,
      ecpm_high: ecpm?.high ?? null,
      ecpc: scalar(r.eCPC),
      ecpe: scalar(r.eCPE),
      ctr: scalar(r.CTR),
      video_completion: scalar(r['Video Completion Rate']),
      audio_completion: scalar(r['Audio Completion Rate']),
    };
  });
}

export function loadStackAdaptDirectory(db, dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.csv'));
  const insert = db.prepare(`
    INSERT INTO benchmarks
    (source, period, channel, category, brand_category, country, impressions,
     ecpm_low, ecpm_high, ecpc, ecpe, ctr, video_completion, audio_completion)
    VALUES (@source, @period, @channel, @category, @brand_category, @country, @impressions,
            @ecpm_low, @ecpm_high, @ecpc, @ecpe, @ctr, @video_completion, @audio_completion)
    ON CONFLICT(source, period, channel, category, brand_category, country) DO UPDATE SET
      impressions = excluded.impressions,
      ecpm_low = excluded.ecpm_low,
      ecpm_high = excluded.ecpm_high,
      ecpc = excluded.ecpc,
      ecpe = excluded.ecpe,
      ctr = excluded.ctr,
      video_completion = excluded.video_completion,
      audio_completion = excluded.audio_completion
  `);
  const summary = [];
  const tx = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  for (const f of files) {
    const rows = parseStackAdaptCsv(join(dirPath, f));
    tx(rows);
    summary.push({ file: f, rows: rows.length });
  }
  return summary;
}
