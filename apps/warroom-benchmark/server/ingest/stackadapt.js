import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

// Parse a StackAdapt-style value: "$2.24  ~ $2.63" -> {low: 2.24, high: 2.63}
// "$1.16 " -> {low: 1.16, high: 1.16}
// "0.25%" -> {low: 0.25, high: 0.25}
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

const scalar = (raw) => parseValue(raw)?.low ?? null;
const integer = (raw) => { const p = parseValue(raw); return p ? Math.round(p.low) : null; };

const MONTHS = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
function periodSortKey(period) {
  const m = period && period.match(/^(\w+)\s+(\d{4})$/);
  if (!m) return period || 'zzzz';
  return `${m[2]}-${MONTHS[m[1]] || '00'}`;
}

// Filenames can arrive as either:
//   "StackAdapt_Benchmarks__Video__May_2026.csv"      (legacy, double underscore)
//   "StackAdapt Benchmarks - Video - May 2026.csv"    (drive export, space-dash)
function metaFromFilename(name) {
  const base = basename(name, '.csv');
  const parts = base.includes(' - ') ? base.split(' - ') : base.split('__').map((p) => p.replace(/_/g, ' '));
  const [source = 'StackAdapt Benchmarks', channel = 'Unknown', period = 'Unknown'] = parts;
  return { source: source.trim(), channel: channel.trim(), period: period.trim(), period_sort: periodSortKey(period.trim()) };
}

// Lookup helper: pick the first non-empty column value from a row given
// candidate header names (case-insensitive, spaces tolerated).
function pick(row, ...candidates) {
  for (const c of candidates) {
    const hit = Object.keys(row).find((k) => k.trim().toLowerCase() === c.trim().toLowerCase());
    if (hit && row[hit] !== '' && row[hit] !== undefined) return row[hit];
  }
  return null;
}

export function parseStackAdaptCsv(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  const { source, period, channel, period_sort } = metaFromFilename(filePath);
  return records.map((r) => {
    const ecpm = parseValue(pick(r, 'eCPM'));
    return {
      source, period, period_sort, channel,
      category:       pick(r, 'Category'),
      brand_category: pick(r, 'Brand Category'),
      country:        pick(r, 'Country'),
      device:         pick(r, 'Device'),
      video_type:     pick(r, 'Video Type'),
      impressions:    integer(pick(r, 'Impressions')),
      ecpm_low:       ecpm?.low ?? null,
      ecpm_high:      ecpm?.high ?? null,
      ecpc:           scalar(pick(r, 'eCPC')),
      ecpe:           scalar(pick(r, 'eCPE')),
      ctr:            scalar(pick(r, 'CTR')),
      video_completion: scalar(pick(r, 'Video Completion Rate')),
      audio_completion: scalar(pick(r, 'Audio Completion Rate')),
    };
  });
}

export function loadStackAdaptDirectory(db, dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.csv'));
  const insert = db.prepare(`
    INSERT INTO benchmarks
    (source, period, period_sort, channel, category, brand_category, country, device, video_type,
     impressions, ecpm_low, ecpm_high, ecpc, ecpe, ctr, video_completion, audio_completion)
    VALUES (@source, @period, @period_sort, @channel, @category, @brand_category, @country, @device, @video_type,
            @impressions, @ecpm_low, @ecpm_high, @ecpc, @ecpe, @ctr, @video_completion, @audio_completion)
    ON CONFLICT(source, period, channel, category, brand_category, country, device, video_type) DO UPDATE SET
      period_sort = excluded.period_sort,
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
