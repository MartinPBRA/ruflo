const $ = (sel) => document.querySelector(sel);
const api = (path, opts) => fetch(`/api/admin${path}`, opts).then((r) => r.json());

let clients = [];
let reports = [];
let currentReport = null;

async function loadClients() {
  clients = await api('/clients');
  const tbody = $('#clients-table tbody');
  tbody.innerHTML = clients.map((c) =>
    `<tr><td>${c.name}</td><td>${c.industry || '—'}</td><td><code>${c.slug}</code></td></tr>`).join('');
  const sel = $('#report-client');
  sel.innerHTML = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadReports() {
  reports = await api('/reports');
  const tbody = $('#reports-table tbody');
  tbody.innerHTML = reports.map((r) => `
    <tr data-id="${r.id}">
      <td><a href="#" class="open-report" data-id="${r.id}">${r.title}</a></td>
      <td>${r.client_name}</td>
      <td>${(r.period_start || '?') + ' → ' + (r.period_end || '?')}</td>
      <td><span class="wr-badge ${r.status}">${r.status}</span></td>
      <td></td>
      <td><button class="wr-btn danger delete-report" data-id="${r.id}">Delete</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('.open-report').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); openReport(el.dataset.id); }));
  document.querySelectorAll('.delete-report').forEach((el) =>
    el.addEventListener('click', () => deleteReport(el.dataset.id)));
}

async function openReport(id) {
  const data = await api(`/reports/${id}`);
  currentReport = data.report;
  $('#editor').style.display = 'block';
  $('#editor-title').textContent = `${data.report.title} — ${data.report.client_name}`;
  $('#editor-summary').value = data.report.summary || '';
  $('#toggle-publish').textContent = data.report.status === 'published' ? 'Unpublish' : 'Publish';
  $('#view-link').href = `/r/${data.report.slug}`;
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
  `).join('') || '<tr><td colspan="8" style="text-align:center; color: var(--wr-fg-muted);">No rows yet — upload a spreadsheet above.</td></tr>';
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
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary: $('#editor-summary').value }),
  });
  loadReports();
});

$('#toggle-publish').addEventListener('click', async () => {
  if (!currentReport) return;
  const next = currentReport.status === 'published' ? 'draft' : 'published';
  await fetch(`/api/admin/reports/${currentReport.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
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
  const res = await fetch(`/api/admin/reports/${currentReport.id}/upload?mode=${mode}`, {
    method: 'POST', body: fd,
  });
  const body = await res.json();
  if (!res.ok) {
    $('#upload-msg').innerHTML = `<span style="color: var(--wr-bad);">Error: ${body.error}${body.hint ? ' — ' + body.hint : ''}</span>`;
    return;
  }
  $('#upload-msg').innerHTML = `<span style="color: var(--wr-good);">Inserted ${body.inserted} rows (${body.mode}).</span>`;
  $('#upload-file').value = '';
  openReport(currentReport.id);
});

loadClients().then(loadReports);
