import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.WARROOM_DB || join(__dirname, '..', 'data', 'warroom.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const reportCols = new Set(db.prepare(`PRAGMA table_info(reports)`).all().map((c) => c.name));
for (const col of [
  'benchmark_source', 'benchmark_period', 'benchmark_channel',
  'benchmark_category', 'benchmark_brand_category', 'benchmark_country',
]) {
  if (!reportCols.has(col)) db.exec(`ALTER TABLE reports ADD COLUMN ${col} TEXT`);
}

export function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'report';
}
