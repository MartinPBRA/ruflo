const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const CHANNELS = ['Overview', 'Display', 'Video', 'Native', 'CTV', 'DOOH'];
const CHANNEL_COLORS = { Display: 'pink', Video: 'purple', Native: 'green', CTV: 'peach', DOOH: 'teal', Overview: 'blue' };
const state = {
  channel: 'Overview',
  country: '',
  category: '',
  brand_category: '',
  sort: { key: 'impressions', dir: 'desc' },
};

function fmtInt(n)   { return n == null ? '—' : Math.round(Number(n)).toLocaleString(); }
function fmtMoney(n) { return n == null || !Number.isFinite(Number(n)) ? '—' : `$${Number(n).toFixed(2)}`; }
function fmtPct(n)   { return n == null || !Number.isFinite(Number(n)) ? '—' : `${Number(n).toFixed(2)}%`; }
function fmtRange(lo, hi) {
  if (lo == null && hi == null) return '—';
  if (lo == null) return fmtMoney(hi);
  if (hi == null || Math.abs(hi - lo) < 0.005) return fmtMoney(lo);
  return `${fmtMoney(lo)}–${fmtMoney(hi)}`;
}

function renderTabs() {
  $('#tabs').innerHTML = CHANNELS.map((c) =>
    `<button class="dash-tab ${c === state.channel ? 'active' : ''}" data-ch="${c}">${c}</button>`).join('');
  $$('.dash-tab').forEach((b) => b.addEventListener('click', () => {
    state.channel = b.dataset.ch;
    renderTabs();
    load();
  }));
}

async function loadMeta() {
  const meta = await fetch('/api/benchmarks/meta').then((r) => r.json());
  const country = $('#f-country');
  country.innerHTML = `<option value="">All</option>` + meta.countries.map((c) => `<option>${c}</option>`).join('');
  await refreshFacets();
}

async function refreshFacets() {
  const params = new URLSearchParams();
  if (state.country) params.set('country', state.country);
  if (state.channel !== 'Overview') params.set('channel', state.channel);
  const facets = await fetch('/api/benchmarks/facets?' + params).then((r) => r.json());
  const catSel = $('#f-category');
  const brandSel = $('#f-brand');
  const prevCat = state.category, prevBrand = state.brand_category;
  catSel.innerHTML = `<option value="">All</option>` + facets.categories.map((c) => `<option${c === prevCat ? ' selected' : ''}>${c}</option>`).join('');
  brandSel.innerHTML = `<option value="">All</option>` + facets.brand_categories.map((c) => `<option${c === prevBrand ? ' selected' : ''}>${c}</option>`).join('');
  if (!facets.categories.includes(prevCat)) state.category = '';
  if (!facets.brand_categories.includes(prevBrand)) state.brand_category = '';
}

async function load() {
  await refreshFacets();
  const params = new URLSearchParams();
  if (state.channel !== 'Overview') params.set('channel', state.channel);
  if (state.country) params.set('country', state.country);
  if (state.category) params.set('category', state.category);
  if (state.brand_category) params.set('brand_category', state.brand_category);

  const data = await fetch('/api/benchmarks/aggregate?' + params).then((r) => r.json());

  $('#dash-title').textContent = state.channel === 'Overview' ? 'Platform Benchmarks' : `${state.channel} Benchmarks`;
  $('#dash-sub').textContent = `StackAdapt · May 2026 · ${fmtInt(data.summary.matches)} rows · ${fmtInt(data.summary.impressions)} impressions`;
  $('#table-meta').textContent = `Top ${Math.min(data.top_segments.length, 100)} of ${fmtInt(data.summary.matches)} segments (impression-sorted)`;

  renderSummary(data.summary);
  renderTiles(data);
  renderTable(data.top_segments);
}

function renderSummary(s) {
  $('#summary').innerHTML = `
    <div class="brand">
      <div class="label">${state.channel === 'Overview' ? 'All Channels' : state.channel}</div>
      <div class="title">Summary</div>
    </div>
    <div class="stat"><div class="label">eCPM</div><div class="value">${fmtRange(s.ecpm_low, s.ecpm_high)}</div></div>
    <div class="stat"><div class="label">eCPC</div><div class="value">${fmtMoney(s.ecpc)}</div></div>
    <div class="stat"><div class="label">CTR</div><div class="value">${fmtPct(s.ctr)}</div></div>
    <div class="stat"><div class="label">VCR</div><div class="value">${fmtPct(s.video_completion)}</div></div>
    <div class="stat"><div class="label">Segments</div><div class="value">${fmtInt(s.matches)}</div></div>
  `;
}

function renderTiles(data) {
  const target = $('#tiles');
  if (state.channel === 'Overview') {
    // One colored tile per channel, showing eCPM range + CTR/VCR
    target.innerHTML = data.by_channel.map((c) => {
      const color = CHANNEL_COLORS[c.channel] || 'gray';
      const isVideoish = c.video_completion != null;
      return `
        <div class="tile w4 ${color}">
          <div class="tile-hd">${c.channel}</div>
          <div class="tile-body">
            <div class="tile-metric"><span class="lbl">eCPM</span><span class="val small">${fmtRange(c.ecpm_low, c.ecpm_high)}</span></div>
            <div class="tile-metric"><span class="lbl">${isVideoish ? 'VCR' : 'CTR'}</span><span class="val small">${isVideoish ? fmtPct(c.video_completion) : fmtPct(c.ctr)}</span></div>
          </div>
          <div class="tile-name">${fmtInt(c.matches)} segments · ${fmtInt(c.impressions)} imp</div>
        </div>`;
    }).join('');
  } else {
    // Category breakdown tiles when a specific channel is picked
    const palette = ['pink', 'purple', 'green', 'peach', 'teal', 'yellow', 'gray', 'mint'];
    target.innerHTML = data.by_category.slice(0, 8).map((c, i) => `
      <div class="tile w3 ${palette[i % palette.length]}">
        <div class="tile-hd">${(c.category || 'Uncategorized').replace(/ \(Legacy\)$/, '')}</div>
        <div class="tile-body">
          <div class="tile-metric"><span class="lbl">eCPM</span><span class="val small">${fmtRange(c.ecpm_low, c.ecpm_high)}</span></div>
          <div class="tile-metric"><span class="lbl">CTR</span><span class="val small">${fmtPct(c.ctr)}</span></div>
        </div>
        <div class="tile-name">${fmtInt(c.impressions)} imp · ${fmtInt(c.matches)} segments</div>
      </div>
    `).join('') || '<div class="tile w12 gray"><div class="tile-hd">No category breakdown available for this slice.</div></div>';
  }
}

function renderTable(rows) {
  const { key, dir } = state.sort;
  const sorted = [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number') return dir === 'asc' ? av - bv : bv - av;
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  $$('#segments thead th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === key) th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  $('#segments tbody').innerHTML = sorted.map((r) => `
    <tr>
      <td>${r.channel}</td>
      <td>${(r.category || '—').replace(/ \(Legacy\)$/, '')}</td>
      <td>${r.brand_category || '—'}</td>
      <td>${r.country || '—'}</td>
      <td class="num">${fmtInt(r.impressions)}</td>
      <td class="num">${fmtRange(r.ecpm_low, r.ecpm_high)}</td>
      <td class="num">${fmtMoney(r.ecpc)}</td>
      <td class="num">${fmtPct(r.ctr)}</td>
      <td class="num">${fmtPct(r.video_completion)}</td>
    </tr>
  `).join('');
}

$$('#segments thead th').forEach((th) => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  else state.sort = { key, dir: 'desc' };
  // Re-render only table (no need to refetch)
  const rows = [...$$('#segments tbody tr')];
  if (rows.length) load();
}));

for (const [id, key] of [['#f-country', 'country'], ['#f-category', 'category'], ['#f-brand', 'brand_category']]) {
  $(id).addEventListener('change', (e) => { state[key] = e.target.value; load(); });
}
$('#f-reset').addEventListener('click', () => {
  state.country = state.category = state.brand_category = '';
  $('#f-country').value = ''; $('#f-category').value = ''; $('#f-brand').value = '';
  load();
});

$('#footer-date').textContent = new Date().toISOString().slice(0, 10);
renderTabs();
loadMeta().then(load);
