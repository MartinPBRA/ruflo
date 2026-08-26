import { Router } from 'express';
import { db } from '../db.js';

export const report = Router();

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
  });
});
