const slug = location.pathname.split('/').pop();

const KPI_METRICS = ['ROAS', 'CTR', 'CPA', 'CVR', 'CPM', 'CPC', 'eCPM', 'eCPC', 'eCPE'];

function fmt(value, unit) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (unit === '%' || unit === 'percent') return `${n.toFixed(2)}%`;
  if (unit === '$' || unit === 'usd') return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (unit === 'x' || unit === 'ratio') return `${n.toFixed(2)}x`;
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function fmtMoney(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}`; }
function fmtPct(n)   { return n == null ? '—' : `${Number(n).toFixed(2)}%`; }
function fmtInt(n)   { return n == null ? '—' : Number(n).toLocaleString(); }

function deltaPct(clientV, benchV) {
  if (clientV == null || benchV == null || !benchV) return null;
  return ((clientV - benchV) / benchV) * 100;
}

function isGood(clientV, benchV, better = 'higher') {
  if (clientV == null || benchV == null) return null;
  return better.toLowerCase() === 'lower' ? clientV <= benchV : clientV >= benchV;
}

function renderClientRows(rows) {
  if (!rows.length) return '';
  const byChannel = new Map();
  rows.forEach((r) => {
    if (!byChannel.has(r.channel)) byChannel.set(r.channel, []);
    byChannel.get(r.channel).push(r);
  });
  return `
    <section class="wr-section">
      <div class="wr-section-head"><h2>Client Performance</h2></div>
      <div class="wr-grid channels">
        ${[...byChannel.entries()].map(([ch, metrics]) => `
          <div class="wr-channel">
            <h3>${ch}</h3>
            ${metrics.map((r) => {
              const good = isGood(r.client_value, r.benchmark_value, r.better);
              const d = deltaPct(r.client_value, r.benchmark_value);
              const cmp = good == null ? '' : good ? 'good' : 'bad';
              const dTxt = d == null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
              return `
                <div class="wr-metric-row">
                  <div class="name">${r.metric}${r.unit ? ` (${r.unit})` : ''}</div>
                  <div class="val">${fmt(r.client_value, r.unit)} <span style="color: var(--wr-fg-dim);">/ ${fmt(r.benchmark_value, r.unit)}</span></div>
                  <div class="cmp ${cmp}">${dTxt}</div>
                </div>`;
            }).join('')}
          </div>`).join('')}
      </div>
    </section>`;
}

function renderBenchmarkKPIs(bench) {
  const { agg, filters } = bench;
  const ecpm = agg.ecpm_low != null && agg.ecpm_high != null
    ? `${fmtMoney(agg.ecpm_low)} – ${fmtMoney(agg.ecpm_high)}`
    : fmtMoney(agg.ecpm_low ?? agg.ecpm_high);
  const kpis = [
    { label: 'eCPM',  value: ecpm },
    { label: 'eCPC',  value: fmtMoney(agg.ecpc) },
    { label: 'eCPE',  value: fmtMoney(agg.ecpe) },
    { label: 'CTR',   value: fmtPct(agg.ctr) },
    { label: 'Video Completion', value: fmtPct(agg.video_completion) },
    { label: 'Audio Completion', value: fmtPct(agg.audio_completion) },
  ].filter((k) => k.value !== '—');

  const filterChips = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `<span class="wr-chip">${k.replace(/_/g, ' ')}: <strong>${v}</strong></span>`)
    .join('');

  return `
    <section class="wr-section">
      <div class="wr-section-head">
        <h2>Industry Benchmark</h2>
        <div class="wr-meta-line">${agg.matches} rows · ${fmtInt(agg.total_impressions)} impressions</div>
      </div>
      <div class="wr-chips">${filterChips}</div>
      <div class="wr-grid kpis" style="margin-top: 16px;">
        ${kpis.map((k) => `
          <div class="wr-card">
            <div class="label">${k.label}</div>
            <div class="value">${k.value}</div>
          </div>`).join('')}
      </div>
    </section>`;
}

function renderBenchmarkTable(rows) {
  if (!rows.length) return '';
  return `
    <section class="wr-section">
      <div class="wr-section-head"><h2>Top Segments</h2></div>
      <div style="overflow-x: auto;">
        <table class="wr-table">
          <thead><tr>
            <th>Channel</th><th>Category</th><th>Brand Category</th><th>Country</th>
            <th style="text-align:right;">Impressions</th>
            <th style="text-align:right;">eCPM</th>
            <th style="text-align:right;">eCPC</th>
            <th style="text-align:right;">CTR</th>
            <th style="text-align:right;">VCR</th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${r.channel}</td>
                <td>${r.category || '—'}</td>
                <td>${r.brand_category || '—'}</td>
                <td>${r.country || '—'}</td>
                <td style="text-align:right;">${fmtInt(r.impressions)}</td>
                <td style="text-align:right;">${r.ecpm_low != null && r.ecpm_high != null ? fmtMoney(r.ecpm_low) + '–' + fmtMoney(r.ecpm_high) : '—'}</td>
                <td style="text-align:right;">${fmtMoney(r.ecpc)}</td>
                <td style="text-align:right;">${fmtPct(r.ctr)}</td>
                <td style="text-align:right;">${fmtPct(r.video_completion)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

async function main() {
  document.getElementById('footer-date').textContent = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(`/api/report/${slug}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    document.title = `${data.title} — War Room`;
    document.getElementById('nav-meta').textContent = data.client?.name || 'Benchmark Report';

    const app = document.getElementById('app');
    const period = data.period?.start && data.period?.end
      ? `${data.period.start} → ${data.period.end}` : '';
    const eyebrow = data.benchmark?.filters?.channel
      ? `${data.benchmark.filters.channel} · Benchmark`
      : `${data.client?.industry || 'Paid Media'} · Benchmark`;

    app.innerHTML = `
      <section class="wr-hero">
        <div class="wr-shell">
          <div class="eyebrow">${eyebrow}</div>
          <h1>${data.title}</h1>
          <p class="subtitle">${data.summary || 'Performance benchmarked against industry averages.'}</p>
          ${period ? `<div class="period">Reporting period ${period}</div>` : ''}
        </div>
      </section>
      <div class="wr-shell">
        ${data.benchmark ? renderBenchmarkKPIs(data.benchmark) : ''}
        ${renderClientRows(data.rows)}
        ${data.benchmark ? renderBenchmarkTable(data.benchmark.rows) : ''}
      </div>
    `;
  } catch (err) {
    document.getElementById('app').innerHTML =
      `<div class="wr-shell"><div class="wr-empty">Report not found or unpublished.<br><small>${err.message}</small></div></div>`;
  }
}

main();
