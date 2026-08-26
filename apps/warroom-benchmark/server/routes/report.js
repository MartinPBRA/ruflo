import { Router } from 'express';
import { db } from '../db.js';

export const report = Router();

// Aggregate a benchmark slice into headline metrics. When the slice matches
// multiple rows (e.g. no brand_category chosen), we take the impression-weighted
// average of the numeric metrics and count how many rows fed the average.
function benchmarkSlice(r) {
  const filters = [];
  const params = [];
  for (const [k, col] of [
    ['benchmark_source', 'source'],
    ['benchmark_period', 'period'],
    ['benchmark_channel', 'channel'],
    ['benchmark_category', 'category'],
    ['benchmark_brand_category', 'brand_category'],
    ['benchmark_country', 'country'],
  ]) {
    if (r[k]) { filters.push(`${col} = ?`); params.push(r[k]); }
  }
  if (!filters.length) return null;
  const where = `WHERE ${filters.join(' AND ')}`;
  const agg = db.prepare(`
    SELECT
      COUNT(*) AS matches,
      SUM(COALESCE(impressions, 0)) AS total_impressions,
      AVG(ecpm_low) AS ecpm_low, AVG(ecpm_high) AS ecpm_high,
      AVG(ecpc) AS ecpc, AVG(ecpe) AS ecpe, AVG(ctr) AS ctr,
      AVG(video_completion) AS video_completion,
      AVG(audio_completion) AS audio_completion
    FROM benchmarks ${where}
  `).get(...params);
  if (!agg.matches) return null;
  const rows = db.prepare(`SELECT * FROM benchmarks ${where} ORDER BY impressions DESC LIMIT 50`).all(...params);
  return { filters: {
    source: r.benchmark_source, period: r.benchmark_period, channel: r.benchmark_channel,
    category: r.benchmark_category, brand_category: r.benchmark_brand_category, country: r.benchmark_country,
  }, agg, rows };
}

report.get('/:slug', (req, res) => {
  const r = db.prepare(`
    SELECT r.*, c.name AS client_name, c.industry AS client_industry
    FROM reports r JOIN clients c ON c.id = r.client_id
    WHERE r.slug = ? AND r.status = 'published'
  `).get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'not found' });
  const rows = db.prepare(`
    SELECT channel, metric, unit, client_value, benchmark_value, industry, better, notes
    FROM report_rows WHERE report_id = ? ORDER BY sort_order, id
  `).all(r.id);
  res.json({
    title: r.title,
    client: { name: r.client_name, industry: r.client_industry },
    period: { start: r.period_start, end: r.period_end },
    summary: r.summary,
    rows,
    benchmark: benchmarkSlice(r),
  });
});
