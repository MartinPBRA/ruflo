const slug = location.pathname.split('/').pop();

const KPI_METRICS = ['ROAS', 'CTR', 'CPA', 'CVR', 'CPM', 'CPC'];

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

function deltaPct(clientV, benchV) {
  if (clientV === null || benchV === null || !benchV) return null;
  return ((clientV - benchV) / benchV) * 100;
}

function isGood(row) {
  if (row.client_value === null || row.benchmark_value === null) return null;
  const better = (row.better || 'higher').toLowerCase();
  if (better === 'lower') return row.client_value <= row.benchmark_value;
  return row.client_value >= row.benchmark_value;
}

function renderKPIs(rows) {
  const wanted = new Set(KPI_METRICS.map((m) => m.toLowerCase()));
  const pick = rows.filter((r) => wanted.has(String(r.metric).toLowerCase())).slice(0, 6);
  if (!pick.length) return '';
  return `
    <section class="wr-section">
      <div class="wr-section-head"><h2>Headline KPIs</h2></div>
      <div class="wr-grid kpis">
        ${pick.map((r) => {
          const good = isGood(r);
          const d = deltaPct(r.client_value, r.benchmark_value);
          const dClass = good === null ? '' : good ? 'good' : 'bad';
          const dTxt = d === null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}% vs benchmark`;
          return `
            <div class="wr-card">
              <div class="label">${r.channel} · ${r.metric}</div>
              <div class="value">${fmt(r.client_value, r.unit)}</div>
              <div class="delta ${dClass}">${dTxt || '&nbsp;'}</div>
              <div class="bench">Benchmark: ${fmt(r.benchmark_value, r.unit)}${r.industry ? ` · ${r.industry}` : ''}</div>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderChannels(rows) {
  const byChannel = new Map();
  rows.forEach((r) => {
    if (!byChannel.has(r.channel)) byChannel.set(r.channel, []);
    byChannel.get(r.channel).push(r);
  });
  if (!byChannel.size) return '<div class="wr-empty">No data yet.</div>';
  return `
    <section class="wr-section">
      <div class="wr-section-head"><h2>By Channel</h2></div>
      <div class="wr-grid channels">
        ${[...byChannel.entries()].map(([ch, metrics]) => `
          <div class="wr-channel">
            <h3>${ch}</h3>
            ${metrics.map((r) => {
              const good = isGood(r);
              const d = deltaPct(r.client_value, r.benchmark_value);
              const cmpClass = good === null ? '' : good ? 'good' : 'bad';
              const cmpTxt = d === null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
              return `
                <div class="wr-metric-row">
                  <div class="name">${r.metric}${r.unit ? ` (${r.unit})` : ''}</div>
                  <div class="val">${fmt(r.client_value, r.unit)}</div>
                  <div class="cmp ${cmpClass}">${cmpTxt}</div>
                </div>`;
            }).join('')}
          </div>`).join('')}
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
    app.innerHTML = `
      <section class="wr-hero">
        <div class="wr-shell">
          <div class="eyebrow">${data.client?.industry || 'Paid Media'} · Benchmark</div>
          <h1>${data.title}</h1>
          <p class="subtitle">${data.summary || 'Performance benchmarked against industry averages.'}</p>
          ${period ? `<div class="period">Reporting period ${period}</div>` : ''}
        </div>
      </section>
      <div class="wr-shell">
        ${renderKPIs(data.rows)}
        ${renderChannels(data.rows)}
      </div>
    `;
  } catch (err) {
    document.getElementById('app').innerHTML =
      `<div class="wr-shell"><div class="wr-empty">Report not found or unpublished.<br><small>${err.message}</small></div></div>`;
  }
}

main();
