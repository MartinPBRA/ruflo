CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  status TEXT DEFAULT 'draft',
  summary TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  metric TEXT NOT NULL,
  unit TEXT,
  client_value REAL,
  benchmark_value REAL,
  industry TEXT,
  better TEXT DEFAULT 'higher',
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_rows_report ON report_rows(report_id);
CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);

-- Industry benchmark library (e.g. StackAdapt monthly).
-- Keyed by channel x category x brand_category x country x source x period.
CREATE TABLE IF NOT EXISTS benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  period TEXT NOT NULL,
  channel TEXT NOT NULL,
  category TEXT,
  brand_category TEXT,
  country TEXT,
  impressions INTEGER,
  ecpm_low REAL,
  ecpm_high REAL,
  ecpc REAL,
  ecpe REAL,
  ctr REAL,
  video_completion REAL,
  audio_completion REAL,
  UNIQUE(source, period, channel, category, brand_category, country)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_channel ON benchmarks(channel);
CREATE INDEX IF NOT EXISTS idx_benchmarks_country ON benchmarks(country);
CREATE INDEX IF NOT EXISTS idx_benchmarks_category ON benchmarks(category);
CREATE INDEX IF NOT EXISTS idx_benchmarks_brand ON benchmarks(brand_category);

-- Note: reports gets several optional benchmark_* columns via idempotent
-- ALTER TABLE calls in db.js, since SQLite lacks ADD COLUMN IF NOT EXISTS.
