import { parse as parseCsv } from 'csv-parse/sync';
import xlsx from 'xlsx';

const HEADER_ALIASES = {
  channel: ['channel', 'platform', 'source'],
  metric: ['metric', 'kpi', 'measure'],
  unit: ['unit', 'units'],
  client_value: ['client', 'client_value', 'your_value', 'value', 'client value'],
  benchmark_value: ['benchmark', 'benchmark_value', 'industry_avg', 'industry average', 'benchmark value'],
  industry: ['industry', 'vertical', 'sector'],
  better: ['better', 'direction', 'higher_is_better'],
  notes: ['notes', 'comment', 'comments'],
};

function normalizeHeader(h) {
  const key = String(h || '').toLowerCase().trim().replace(/\s+/g, '_');
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key) || aliases.includes(key.replace(/_/g, ' '))) return canonical;
  }
  return null;
}

function normalizeBetter(v) {
  const s = String(v || '').toLowerCase().trim();
  if (['lower', 'low', 'less', 'down', 'false', '0', 'no'].includes(s)) return 'lower';
  return 'higher';
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[,$%\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function rowsFromMatrix(matrix) {
  if (!matrix || matrix.length < 2) return [];
  const rawHeaders = matrix[0];
  const headers = rawHeaders.map(normalizeHeader);
  const out = [];
  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!raw || raw.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = raw[idx];
    });
    if (!obj.channel && !obj.metric) continue;
    out.push({
      channel: String(obj.channel || '').trim(),
      metric: String(obj.metric || '').trim(),
      unit: obj.unit ? String(obj.unit).trim() : null,
      client_value: toNumber(obj.client_value),
      benchmark_value: toNumber(obj.benchmark_value),
      industry: obj.industry ? String(obj.industry).trim() : null,
      better: normalizeBetter(obj.better),
      notes: obj.notes ? String(obj.notes).trim() : null,
    });
  }
  return out;
}

export function parseSpreadsheet(buffer, filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'tsv') {
    const text = buffer.toString('utf8');
    const records = parseCsv(text, { skip_empty_lines: true, relax_column_count: true });
    return rowsFromMatrix(records);
  }
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const matrix = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });
  return rowsFromMatrix(matrix);
}
