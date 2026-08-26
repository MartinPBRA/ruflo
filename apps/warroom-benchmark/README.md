# War Room Benchmark

Client-facing paid-media benchmark report + admin backend.

- **Backend**: Express + SQLite (`better-sqlite3`).
- **Benchmark library**: StackAdapt monthly CSVs (Display / Native / Video / DOOH / CTV) loaded into a `benchmarks` table (~20,800 rows for May 2026).
- **Client rows**: optional per-report CSV / XLSX upload for the client's actual performance, shown alongside the industry slice.
- **Frontend**: static HTML/CSS/JS. Dark War Room–style theme (placeholder tokens in `public/assets/brand.css`).

## Run

```bash
cd apps/warroom-benchmark
npm install
npm run seed      # loads StackAdapt library + creates the Video/US demo report
npm start
```

- Admin: <http://localhost:4600/admin.html>
- Demo report (after seed): <http://localhost:4600/r/stackadapt-video-us-demo>

## Benchmark library

StackAdapt files live in `data/stackadapt/`. The loader handles the format quirks:

- `$2.24  ~ $2.63` → `ecpm_low = 2.24`, `ecpm_high = 2.63`
- `N/A` → `NULL`
- `"6,681"` → `6681`
- `0.25%` → `0.25`

Load or refresh via one of:

```bash
node server/load-benchmarks.js                 # upsert everything under data/stackadapt/
node server/load-benchmarks.js --reset         # wipe + reload
node server/load-benchmarks.js /path/to/dir    # custom directory
```

Or upload CSVs in the admin UI under **Benchmark Library** — same loader.

Filenames encode source, channel, and period: `StackAdapt_Benchmarks__Video__May_2026.csv` → source `StackAdapt Benchmarks`, channel `Video`, period `May 2026`.

### Benchmark schema

```
benchmarks(id, source, period, channel, category, brand_category, country,
           impressions, ecpm_low, ecpm_high, ecpc, ecpe, ctr,
           video_completion, audio_completion)
```

Unique on `(source, period, channel, category, brand_category, country)`; re-loading a file upserts.

## Reports

A report is a slice of the benchmark library, optionally overlaid with client-supplied rows.

1. In the admin, create a client and a report.
2. In **Benchmark slice**, pick channel / country / category / brand-category. Leaving fields blank averages across all matching rows (weighted by impressions in the top-segments table).
3. (Optional) Upload a client performance CSV with columns `channel, metric, unit, client_value, benchmark_value, industry, better, notes` — these render in a **Client Performance** section with % deltas.
4. Toggle **Publish**. The public URL is `/r/<slug>` and only serves published reports.

The public API is `GET /api/report/:slug` — returns title, client, period, summary, client rows, and the benchmark aggregate + top segments.

## Data model

```
clients (id, slug, name, industry)
  └─ reports (id, slug, title, period_start, period_end, status, summary,
              benchmark_source, benchmark_period, benchmark_channel,
              benchmark_category, benchmark_brand_category, benchmark_country)
       └─ report_rows (id, channel, metric, unit, client_value, benchmark_value,
                       industry, better, notes)
benchmarks (see above)
```

## Branding

Colors, type, and layout tokens live in `public/assets/brand.css` (`:root { --wr-* }`). Current values are War Room–style placeholders (near-black + red accent + condensed display type). Swap the `--wr-*` values and the triangle logo mark in `.wr-logo::before` when the real assets arrive.

## Static export

Bake a single self-contained HTML file (CSS + report data inlined) for a
published report:

```bash
npm run export -- <report-slug> [output-path]
# e.g. npm run export -- stackadapt-video-us-demo ./export/video-us.html
```

The output only needs Google Fonts on first load; everything else is
embedded, so it opens directly in a browser and can be emailed or shared
as a file. Output dir defaults to `export/` (git-ignored).

## Deploy

Any Node host that can run `node server/index.js` and mount a persistent volume for `data/warroom.db`. Set `PORT` and `WARROOM_DB` env vars as needed. No auth yet — add basic auth or an env-gated token before exposing `/admin.html` or `/api/admin/*` publicly.
