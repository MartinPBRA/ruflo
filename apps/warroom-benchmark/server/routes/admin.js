import { Router } from 'express';
import multer from 'multer';
import { db, slugify } from '../db.js';
import { parseSpreadsheet } from '../ingest/parse.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const admin = Router();

admin.get('/clients', (_req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all());
});

admin.post('/clients', (req, res) => {
  const { name, industry } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = slugify(name);
  const info = db.prepare('INSERT INTO clients (slug, name, industry) VALUES (?, ?, ?)')
    .run(slug, name, industry || null);
  res.json({ id: info.lastInsertRowid, slug, name, industry });
});

admin.get('/reports', (_req, res) => {
  const rows = db.prepare(`
    SELECT r.*, c.name AS client_name, c.slug AS client_slug
    FROM reports r JOIN clients c ON c.id = r.client_id
    ORDER BY r.updated_at DESC
  `).all();
  res.json(rows);
});

admin.post('/reports', (req, res) => {
  const { client_id, title, period_start, period_end, summary } = req.body || {};
  if (!client_id || !title) return res.status(400).json({ error: 'client_id and title required' });
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const info = db.prepare(`
    INSERT INTO reports (slug, client_id, title, period_start, period_end, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(slug, client_id, title, period_start || null, period_end || null, summary || null);
  res.json({ id: info.lastInsertRowid, slug });
});

admin.get('/reports/:id', (req, res) => {
  const report = db.prepare(`
    SELECT r.*, c.name AS client_name, c.slug AS client_slug
    FROM reports r JOIN clients c ON c.id = r.client_id WHERE r.id = ?
  `).get(req.params.id);
  if (!report) return res.status(404).json({ error: 'not found' });
  const rows = db.prepare('SELECT * FROM report_rows WHERE report_id = ? ORDER BY sort_order, id').all(report.id);
  res.json({ report, rows });
});

admin.patch('/reports/:id', (req, res) => {
  const {
    title, period_start, period_end, status, summary,
    benchmark_source, benchmark_period, benchmark_channel,
    benchmark_category, benchmark_brand_category, benchmark_country,
  } = req.body || {};
  db.prepare(`
    UPDATE reports SET
      title = COALESCE(?, title),
      period_start = COALESCE(?, period_start),
      period_end = COALESCE(?, period_end),
      status = COALESCE(?, status),
      summary = COALESCE(?, summary),
      benchmark_source = COALESCE(?, benchmark_source),
      benchmark_period = COALESCE(?, benchmark_period),
      benchmark_channel = COALESCE(?, benchmark_channel),
      benchmark_category = COALESCE(?, benchmark_category),
      benchmark_brand_category = COALESCE(?, benchmark_brand_category),
      benchmark_country = COALESCE(?, benchmark_country),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title, period_start, period_end, status, summary,
    benchmark_source, benchmark_period, benchmark_channel,
    benchmark_category, benchmark_brand_category, benchmark_country,
    req.params.id,
  );
  res.json({ ok: true });
});

admin.delete('/reports/:id', (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

admin.post('/reports/:id/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const reportId = Number(req.params.id);
  const report = db.prepare('SELECT id FROM reports WHERE id = ?').get(reportId);
  if (!report) return res.status(404).json({ error: 'report not found' });

  let rows;
  try {
    rows = parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: 'parse failed', detail: String(err.message || err) });
  }
  if (!rows.length) return res.status(400).json({ error: 'no rows parsed', hint: 'headers must include channel + metric' });

  const replace = req.query.mode !== 'append';
  const tx = db.transaction((all) => {
    if (replace) db.prepare('DELETE FROM report_rows WHERE report_id = ?').run(reportId);
    const insert = db.prepare(`
      INSERT INTO report_rows
      (report_id, channel, metric, unit, client_value, benchmark_value, industry, better, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    all.forEach((r, i) => insert.run(
      reportId, r.channel, r.metric, r.unit, r.client_value, r.benchmark_value,
      r.industry, r.better, r.notes, i
    ));
    db.prepare('UPDATE reports SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(reportId);
  });
  tx(rows);
  res.json({ ok: true, inserted: rows.length, mode: replace ? 'replace' : 'append' });
});

admin.post('/reports/:id/rows', (req, res) => {
  const { channel, metric, unit, client_value, benchmark_value, industry, better, notes } = req.body || {};
  if (!channel || !metric) return res.status(400).json({ error: 'channel and metric required' });
  const info = db.prepare(`
    INSERT INTO report_rows
    (report_id, channel, metric, unit, client_value, benchmark_value, industry, better, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, channel, metric, unit || null, client_value ?? null, benchmark_value ?? null,
    industry || null, better || 'higher', notes || null);
  res.json({ id: info.lastInsertRowid });
});

admin.delete('/rows/:id', (req, res) => {
  db.prepare('DELETE FROM report_rows WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
