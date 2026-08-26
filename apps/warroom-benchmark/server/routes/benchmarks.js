import { Router } from 'express';
import multer from 'multer';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db.js';
import { loadStackAdaptDirectory } from '../ingest/stackadapt.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
export const benchmarks = Router();

benchmarks.get('/meta', (_req, res) => {
  res.json({
    sources: db.prepare('SELECT DISTINCT source FROM benchmarks ORDER BY source').all().map((r) => r.source),
    periods: db.prepare('SELECT DISTINCT period FROM benchmarks ORDER BY period').all().map((r) => r.period),
    channels: db.prepare('SELECT DISTINCT channel FROM benchmarks ORDER BY channel').all().map((r) => r.channel),
    countries: db.prepare(`SELECT DISTINCT country FROM benchmarks WHERE country IS NOT NULL ORDER BY country`).all().map((r) => r.country),
  });
});

benchmarks.get('/facets', (req, res) => {
  const clauses = [];
  const params = [];
  for (const k of ['source', 'period', 'channel', 'country']) {
    if (req.query[k]) { clauses.push(`${k} = ?`); params.push(req.query[k]); }
  }
  const facet = (col) => {
    const all = [...clauses, `${col} IS NOT NULL`];
    const sql = `SELECT DISTINCT ${col} AS v FROM benchmarks WHERE ${all.join(' AND ')} ORDER BY ${col}`;
    return db.prepare(sql).all(...params).map((r) => r.v);
  };
  res.json({ categories: facet('category'), brand_categories: facet('brand_category') });
});

benchmarks.get('/', (req, res) => {
  const where = [];
  const params = [];
  for (const k of ['source', 'period', 'channel', 'category', 'brand_category', 'country']) {
    if (req.query[k]) { where.push(`${k} = ?`); params.push(req.query[k]); }
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db.prepare(`SELECT * FROM benchmarks ${sql} ORDER BY channel, category, brand_category, country LIMIT ?`).all(...params, limit);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM benchmarks ${sql}`).get(...params).n;
  res.json({ count, rows });
});

benchmarks.post('/load-stackadapt', upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'files required' });
  const tmp = mkdtempSync(join(tmpdir(), 'wr-bench-'));
  req.files.forEach((f) => writeFileSync(join(tmp, f.originalname), f.buffer));
  try {
    const summary = loadStackAdaptDirectory(db, tmp);
    const total = db.prepare('SELECT COUNT(*) AS n FROM benchmarks').get().n;
    res.json({ ok: true, summary, total });
  } catch (err) {
    res.status(400).json({ error: 'load failed', detail: String(err.message || err) });
  }
});
