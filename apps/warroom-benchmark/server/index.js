import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { admin } from './routes/admin.js';
import { report } from './routes/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4600);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/admin', admin);
app.use('/api/report', report);

app.use(express.static(join(__dirname, '..', 'public')));
app.get('/r/:slug', (_req, res) => res.sendFile(join(__dirname, '..', 'public', 'report.html')));

app.listen(PORT, () => {
  console.log(`\n  War Room Benchmark`);
  console.log(`  ─────────────────────`);
  console.log(`  Admin:  http://localhost:${PORT}/admin.html`);
  console.log(`  Report: http://localhost:${PORT}/r/<slug>\n`);
});
