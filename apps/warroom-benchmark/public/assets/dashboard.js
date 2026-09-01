const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const CHANNELS = ['Overview', 'Display', 'Video', 'Native', 'CTV', 'DOOH', 'Audio'];
const CHANNEL_COLORS = {
  Overview: 'ink', Display: 'pink', Video: 'purple',
  Native: 'mint', CTV: 'coral', DOOH: 'sky', Audio: 'yellow',
};
const state = {
  channel: 'Overview',
  period: '',
  country: '',
  category: '',
  brand_category: '',
  sort: { key: 'impressions', dir: 'desc' },
};
let meta = { periods: [], countries: [], channels: [] };

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
    renderTabs(); load();
  }));
}

function populate(sel, values, selected = '', includeAll = true) {
  const el = $(sel);
  const opts = (includeAll ? `<option value="">All</option>` : '')
    + values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
  el.innerHTML = opts;
}

async function loadMeta() {
  meta = await fetch('/api/benchmarks/meta').then((r) => r.json());
  populate('#f-period', meta.periods, meta.periods[0] || '', false);
  state.period = meta.periods[0] || '';
  populate('#f-country', meta.countries);
  await refreshFacets();
}

async function refreshFacets() {
  const params = new URLSearchParams();
  if (state.period) params.set('period', state.period);
  if (state.country) params.set('country', state.country);
  if (state.channel !== 'Overview') params.set('channel', state.channel);
  const facets = await fetch('/api/benchmarks/facets?' + params).then((r) => r.json());

  const prev = { ...state };
  populate('#f-category', facets.categories, prev.category);
  populate('#f-brand', facets.brand_categories, prev.brand_category);

  if (!facets.categories.includes(prev.category)) state.category = '';
  if (!facets.brand_categories.includes(prev.brand_category)) state.brand_category = '';
}

async function load() {
  await refreshFacets();
  const params = new URLSearchParams();
  if (state.period) params.set('period', state.period);
  if (state.channel !== 'Overview') params.set('channel', state.channel);
  if (state.country) params.set('country', state.country);
  if (state.category) params.set('category', state.category);
  if (state.brand_category) params.set('brand_category', state.brand_category);

  const data = await fetch('/api/benchmarks/aggregate?' + params).then((r) => r.json());

  $('#dash-title').textContent = state.channel === 'Overview' ? 'Platform Benchmarks' : `${state.channel} Benchmarks`;
  $('#table-meta').textContent = `Top ${Math.min(data.top_segments.length, 100)} of ${fmtInt(data.summary.matches)} segments (impression-sorted)`;

  renderSummary(data.summary);
  renderTiles(data);
  renderTable(data.top_segments);
}

function renderSummary(s) {
  const scopeParts = [];
  if (state.country) scopeParts.push(state.country);
  scopeParts.push(state.channel === 'Overview' ? 'All Channels' : state.channel);
  $('#summary').innerHTML = `
    <div class="brand">
      <div class="label">${scopeParts.join(' · ')}</div>
      <div class="title">Summary</div>
    </div>
    <div class="stat"><div class="label">eCPM</div><div class="value">${fmtRange(s.ecpm_low, s.ecpm_high)}</div></div>
    <div class="stat"><div class="label">eCPC</div><div class="value">${fmtMoney(s.ecpc)}</div></div>
    <div class="stat"><div class="label">CTR</div><div class="value">${fmtPct(s.ctr)}</div></div>
    <div class="stat"><div class="label">${state.channel === 'Audio' ? 'ACR' : 'VCR'}</div><div class="value">${state.channel === 'Audio' ? fmtPct(s.audio_completion) : fmtPct(s.video_completion)}</div></div>
    <div class="stat"><div class="label">Segments</div><div class="value">${fmtInt(s.matches)}</div></div>
  `;
}

function renderTiles(data) {
  const target = $('#tiles');
  if (state.channel === 'Overview') {
    target.innerHTML = data.by_channel.map((c) => {
      const color = CHANNEL_COLORS[c.channel] || 'ink';
      const isVideoish = c.video_completion != null;
      const isAudioish = c.audio_completion != null;
      const secondLabel = isAudioish ? 'ACR' : isVideoish ? 'VCR' : 'CTR';
      const secondValue = isAudioish ? fmtPct(c.audio_completion) : isVideoish ? fmtPct(c.video_completion) : fmtPct(c.ctr);
      return `
        <div class="tile w4 ${color}">
          <div class="tile-hd">${c.channel}</div>
          <div class="tile-body">
            <div class="tile-metric"><span class="lbl">eCPM</span><span class="val small">${fmtRange(c.ecpm_low, c.ecpm_high)}</span></div>
            <div class="tile-metric"><span class="lbl">${secondLabel}</span><span class="val small">${secondValue}</span></div>
          </div>
          <div class="tile-name">${fmtInt(c.matches)} segments · ${fmtInt(c.impressions)} imp</div>
        </div>`;
    }).join('');
  } else {
    const palette = ['sky', 'mint', 'yellow', 'pink', 'coral', 'purple', 'rose', 'ink'];
    target.innerHTML = data.by_category.slice(0, 8).map((c, i) => `
      <div class="tile w3 ${palette[i % palette.length]}">
        <div class="tile-hd">${(c.category || 'Uncategorized').replace(/ \(Legacy\)$/, '')}</div>
        <div class="tile-body">
          <div class="tile-metric"><span class="lbl">eCPM</span><span class="val small">${fmtRange(c.ecpm_low, c.ecpm_high)}</span></div>
          <div class="tile-metric"><span class="lbl">CTR</span><span class="val small">${fmtPct(c.ctr)}</span></div>
        </div>
        <div class="tile-name">${fmtInt(c.impressions)} imp · ${fmtInt(c.matches)} segments</div>
      </div>
    `).join('') || '<div class="tile w12 ink"><div class="tile-hd">No category breakdown available for this slice.</div></div>';
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
      <td class="num">${fmtPct(r.video_completion || r.audio_completion)}</td>
    </tr>
  `).join('');
}

$$('#segments thead th').forEach((th) => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  else state.sort = { key, dir: 'desc' };
  load();
}));

for (const [id, key] of [
  ['#f-period', 'period'], ['#f-country', 'country'],
  ['#f-category', 'category'], ['#f-brand', 'brand_category'],
]) {
  $(id).addEventListener('change', (e) => { state[key] = e.target.value; load(); });
}
$('#f-reset').addEventListener('click', () => {
  state.country = state.category = state.brand_category = '';
  $('#f-country').value = ''; $('#f-category').value = ''; $('#f-brand').value = '';
  load();
});

renderTabs();
loadMeta().then(load);
