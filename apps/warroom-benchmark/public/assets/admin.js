const $ = (sel) => document.querySelector(sel);
const api = (path, opts) => fetch(`/api/admin${path}`, opts).then((r) => r.json());
const bapi = (path) => fetch(`/api/benchmarks${path}`).then((r) => r.json());

let clients = [];
let reports = [];
let currentReport = null;
let benchMeta = { sources: [], periods: [], channels: [], countries: [] };

async function loadClients() {
  clients = await api('/clients');
  $('#clients-table tbody').innerHTML = clients.map((c) =>
    `<tr><td>${c.name}</td><td>${c.industry || '—'}</td><td><code>${c.slug}</code></td></tr>`).join('');
  $('#report-client').innerHTML = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadReports() {
  reports = await api('/reports');
  $('#reports-table tbody').innerHTML = reports.map((r) => `
    <tr data-id="${r.id}">
      <td><a href="#" class="open-report" data-id="${r.id}">${r.title}</a></td>
      <td>${r.client_name}</td>
      <td>${(r.period_start || '?') + ' → ' + (r.period_end || '?')}</td>
      <td><span class="wr-badge ${r.status}">${r.status}</span></td>
      <td>${[r.benchmark_channel, r.benchmark_country, r.benchmark_category, r.benchmark_brand_category].filter(Boolean).join(' · ') || '—'}</td>
      <td><button class="wr-btn danger delete-report" data-id="${r.id}">Delete</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('.open-report').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); openReport(el.dataset.id); }));
  document.querySelectorAll('.delete-report').forEach((el) =>
    el.addEventListener('click', () => deleteReport(el.dataset.id)));
}

async function loadBenchMeta() {
  benchMeta = await bapi('/meta');
  populateSelect('#bs-source', benchMeta.sources);
  populateSelect('#bs-period', benchMeta.periods);
  populateSelect('#bs-channel', benchMeta.channels);
  populateSelect('#bs-country', benchMeta.countries);
  await refreshFacets();
}

function populateSelect(sel, values, selected = '') {
  const el = $(sel);
  el.innerHTML = `<option value="">— any —</option>` + values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
}

async function refreshFacets() {
  const params = new URLSearchParams();
  for (const [k, id] of [['source', '#bs-source'], ['period', '#bs-period'], ['channel', '#bs-channel'], ['country', '#bs-country']]) {
    if ($(id).value) params.set(k, $(id).value);
  }
  const facets = await bapi('/facets?' + params.toString());
  const cat = $('#bs-category').value;
  const brand = $('#bs-brand').value;
  populateSelect('#bs-category', facets.categories, facets.categories.includes(cat) ? cat : '');
  populateSelect('#bs-brand', facets.brand_categories, facets.brand_categories.includes(brand) ? brand : '');
  updateSlicePreview();
}

async function updateSlicePreview() {
  const params = new URLSearchParams();
  for (const [k, id] of [
    ['source', '#bs-source'], ['period', '#bs-period'], ['channel', '#bs-channel'],
    ['country', '#bs-country'], ['category', '#bs-category'], ['brand_category', '#bs-brand'],
  ]) if ($(id).value) params.set(k, $(id).value);
  params.set('limit', '1');
  const r = await bapi('/?' + params.toString());
  $('#slice-preview').textContent = `Slice matches ${r.count} rows.`;
}

async function openReport(id) {
  const data = await api(`/reports/${id}`);
  currentReport = data.report;
  $('#editor').style.display = 'block';
  $('#editor-title').textContent = `${data.report.title} — ${data.report.client_name}`;
  $('#editor-summary').value = data.report.summary || '';
  $('#toggle-publish').textContent = data.report.status === 'published' ? 'Unpublish' : 'Publish';
  $('#view-link').href = `/r/${data.report.slug}`;

  populateSelect('#bs-source', benchMeta.sources, data.report.benchmark_source || '');
  populateSelect('#bs-period', benchMeta.periods, data.report.benchmark_period || '');
  populateSelect('#bs-channel', benchMeta.channels, data.report.benchmark_channel || '');
  populateSelect('#bs-country', benchMeta.countries, data.report.benchmark_country || '');
  await refreshFacets();
  populateSelect('#bs-category', [...$('#bs-category').options].map((o) => o.value).filter(Boolean), data.report.benchmark_category || '');
  populateSelect('#bs-brand', [...$('#bs-brand').options].map((o) => o.value).filter(Boolean), data.report.benchmark_brand_category || '');
  await updateSlicePreview();

  renderRows(data.rows);
  $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRows(rows) {
  $('#rows-table tbody').innerHTML = rows.map((r) => `
    <tr>
      <td>${r.channel}</td><td>${r.metric}</td><td>${r.unit || ''}</td>
      <td>${r.client_value ?? ''}</td><td>${r.benchmark_value ?? ''}</td>
      <td>${r.industry || ''}</td><td>${r.better || ''}</td>
      <td><button class="wr-btn danger delete-row" data-id="${r.id}">×</button></td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center; color: var(--wr-fg-muted);">No client rows — bind a benchmark slice above, or upload a client performance CSV.</td></tr>';
  document.querySelectorAll('.delete-row').forEach((el) =>
    el.addEventListener('click', async () => {
      await fetch(`/api/admin/rows/${el.dataset.id}`, { method: 'DELETE' });
      openReport(currentReport.id);
    }));
}

$('#create-client').addEventListener('click', async () => {
  const name = $('#client-name').value.trim();
  if (!name) return;
  await api('/clients', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, industry: $('#client-industry').value.trim() }),
  });
  $('#client-name').value = ''; $('#client-industry').value = '';
  loadClients();
});

$('#create-report').addEventListener('click', async () => {
  const title = $('#report-title').value.trim();
  const client_id = Number($('#report-client').value);
  if (!title || !client_id) return;
  await api('/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id, title,
      period_start: $('#report-start').value || null,
      period_end: $('#report-end').value || null,
    }),
  });
  $('#report-title').value = '';
  loadReports();
});

async function deleteReport(id) {
  if (!confirm('Delete this report?')) return;
  await fetch(`/api/admin/reports/${id}`, { method: 'DELETE' });
  if (currentReport?.id == id) { currentReport = null; $('#editor').style.display = 'none'; }
  loadReports();
}

$('#save-summary').addEventListener('click', async () => {
  if (!currentReport) return;
  await fetch(`/api/admin/reports/${currentReport.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: $('#editor-summary').value,
      benchmark_source: $('#bs-source').value || null,
      benchmark_period: $('#bs-period').value || null,
      benchmark_channel: $('#bs-channel').value || null,
      benchmark_country: $('#bs-country').value || null,
      benchmark_category: $('#bs-category').value || null,
      benchmark_brand_category: $('#bs-brand').value || null,
    }),
  });
  loadReports();
});

$('#toggle-publish').addEventListener('click', async () => {
  if (!currentReport) return;
  const next = currentReport.status === 'published' ? 'draft' : 'published';
  await fetch(`/api/admin/reports/${currentReport.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: next }),
  });
  openReport(currentReport.id);
  loadReports();
});

$('#upload-btn').addEventListener('click', async () => {
  if (!currentReport) return;
  const file = $('#upload-file').files[0];
  if (!file) { $('#upload-msg').textContent = 'Choose a file first.'; return; }
  const mode = $('#append-mode').checked ? 'append' : 'replace';
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch(`/api/admin/reports/${currentReport.id}/upload?mode=${mode}`, { method: 'POST', body: fd });
  const body = await res.json();
  if (!res.ok) { $('#upload-msg').innerHTML = `<span style="color: var(--wr-bad);">Error: ${body.error}${body.hint ? ' — ' + body.hint : ''}</span>`; return; }
  $('#upload-msg').innerHTML = `<span style="color: var(--wr-good);">Inserted ${body.inserted} rows (${body.mode}).</span>`;
  $('#upload-file').value = '';
  openReport(currentReport.id);
});

$('#lib-load').addEventListener('click', async () => {
  const files = $('#lib-files').files;
  if (!files.length) return;
  const fd = new FormData();
  [...files].forEach((f) => fd.append('files', f));
  $('#lib-status').textContent = 'Loading…';
  const res = await fetch('/api/benchmarks/load-stackadapt', { method: 'POST', body: fd });
  const body = await res.json();
  if (!res.ok) { $('#lib-status').innerHTML = `<span style="color: var(--wr-bad);">Error: ${body.error}</span>`; return; }
  $('#lib-status').textContent = `Loaded ${body.summary.reduce((a, s) => a + s.rows, 0)} rows. Library now: ${body.total} rows.`;
  await loadBenchMeta();
});

document.addEventListener('change', (e) => {
  if (e.target.classList.contains('bench-slice')) {
    if (['bs-source', 'bs-period', 'bs-channel', 'bs-country'].includes(e.target.id)) refreshFacets();
    else updateSlicePreview();
  }
});

(async () => {
  await loadClients();
  await loadReports();
  await loadBenchMeta();
})();
