# War Room Benchmark

Client-facing paid-media benchmark report + admin backend.

- **Backend**: Express + SQLite (`better-sqlite3`).
- **Ingest**: CSV / XLSX upload → normalized rows.
- **Frontend**: static HTML/CSS/JS. Dark War Room–style theme (placeholder tokens in `public/assets/brand.css`).

## Run

```bash
cd apps/warroom-benchmark
npm install
npm run seed      # optional — creates Acme demo report
npm start
```

- Admin: <http://localhost:4600/admin.html>
- Sample report (after seed): <http://localhost:4600/r/q3-2026-paid-media-benchmark-demo>

## Spreadsheet format

Headers (case-insensitive; aliases in `server/ingest/parse.js`):

| column            | required | notes                                        |
|-------------------|----------|----------------------------------------------|
| `channel`         | yes      | Meta, Google Search, TikTok, LinkedIn, …     |
| `metric`          | yes      | CPM, CTR, CPA, ROAS, CVR, CPC, Spend, …      |
| `unit`            | no       | `$`, `%`, `x`                                |
| `client_value`    | no       | number                                       |
| `benchmark_value` | no       | number                                       |
| `industry`        | no       | e.g. Retail, B2B                             |
| `better`          | no       | `higher` (default) or `lower`                |
| `notes`           | no       | free text                                    |

See `examples/sample-benchmark.csv`.

## Data model

- `clients` — name, industry, slug
- `reports` — belongs to client, has title/period/status (draft|published)/summary
- `report_rows` — flat rows per report (channel × metric)

Uploading replaces rows for that report by default; add `?mode=append` to append.

## Branding

Colors, type, and layout tokens live in `public/assets/brand.css` (`:root` vars). The current values are War Room–style placeholders (near-black + red accent + white, condensed display type). Swap the `--wr-*` values and the triangle logo mark in `.wr-logo::before` when the real assets arrive.

## Deploy

Any Node host that can run `node server/index.js` and mount a persistent volume for `data/warroom.db`. Set `PORT` and `WARROOM_DB` env vars as needed.
