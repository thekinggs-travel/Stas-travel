/* Travel journal — локальная версия. Данные: data.js, фото: photos/<id>/ */
(() => {
'use strict';

const J = window.JOURNAL || { title: 'Путешествия', trips: [], bucket: [] };
J.trips = J.trips || []; J.bucket = J.bucket || [];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RN = new Intl.DisplayNames(['ru'], { type: 'region' });
const NAMES = { KR: 'Южная Корея', KP: 'Северная Корея', US: 'США', GB: 'Великобритания', AE: 'ОАЭ', HK: 'Гонконг', MO: 'Макао', CZ: 'Чехия', VA: 'Ватикан' };
const cname = c => NAMES[c] || (() => { try { return RN.of(c) || c; } catch { return c; } })();
const flag = c => c.length === 2 ? String.fromCodePoint(...[...c.toUpperCase()].map(ch => 0x1F1A5 + ch.charCodeAt(0))) : '';
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_N = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

const tripYear = t => t.start ? +t.start.slice(0, 4) : (+t.year || 0);
function fmtDates(t, short) {
  if (!t.start) return t.year ? String(t.year) : '';
  const [y1, m1, d1] = t.start.split('-').map(Number);
  if (!t.end || t.end === t.start) return short ? `${d1} ${MONTHS[m1-1]}` : `${d1} ${MONTHS[m1-1]} ${y1}`;
  const [y2, m2, d2] = t.end.split('-').map(Number);
  let s;
  if (y1 === y2 && m1 === m2) s = `${d1}–${d2} ${MONTHS[m2-1]}`;
  else if (y1 === y2) s = `${d1} ${MONTHS[m1-1]} – ${d2} ${MONTHS[m2-1]}`;
  else return `${d1} ${MONTHS[m1-1]} ${y1} – ${d2} ${MONTHS[m2-1]} ${y2}`;
  return short ? s : `${s} ${y2}`;
}
const days = t => (t.start && t.end) ? Math.round((new Date(t.end) - new Date(t.start)) / 864e5) + 1 : 0;
const tripTitle = t => t.title || t.cities || (t.countries || []).map(cname).join(', ') || 'Поездка';
const sortTrips = arr => arr.slice().sort((a, b) => (b.start || String(tripYear(b))).localeCompare(a.start || String(tripYear(a))));

let state = { filter: null, editing: false, dir: null, view: 'short' };

/* ---------------- stats & aggregates ---------------- */
function aggregate() {
  const byC = {};
  for (const t of J.trips) for (const c of (t.countries || [])) {
    (byC[c] = byC[c] || { trips: [], years: new Set() }).trips.push(t);
    byC[c].years.add(tripYear(t));
  }
  return byC;
}

function renderHeader() {
  document.title = J.title || 'Путешествия';
  $('#title').textContent = J.title || 'Путешествия';
  const byC = aggregate();
  const abroad = Object.keys(byC).filter(c => c !== J.home);
  const years = J.trips.map(tripYear).filter(Boolean);
  const photos = J.trips.reduce((s, t) => s + (t.photos || []).length, 0);
  const st = [
    [abroad.length, plural(abroad.length, 'страна', 'страны', 'стран').replace(/^\d+ /, '')],
    [J.trips.length, plural(J.trips.length, 'поездка', 'поездки', 'поездок').replace(/^\d+ /, '')],
  ];
  if (years.length) st.push([years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—', 'годы']);
  st.push([photos, plural(photos, 'фото', 'фото', 'фото').replace(/^\d+ /, '')]);
  $('#stats').innerHTML = st.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
  const demo = J.trips.some(t => t.demo);
  $('#banner').innerHTML = demo ? `<div class="banner">Сейчас тут примеры поездок (помечены «пример»). Нажми «Редактировать», выбери эту папку — и можно удалять примеры и добавлять свои поездки с фото.</div>` : '';
}

/* ---------------- map ---------------- */
const W = 1000;
const world = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.countries);
const projection = d3.geoNaturalEarth1().fitWidth(W - 20, world);
const path = d3.geoPath(projection);
const b = path.bounds(world);
projection.translate([projection.translate()[0] + 10 - b[0][0] + 0, projection.translate()[1] + 10 - b[0][1]]);
const H = Math.ceil(path.bounds(world)[1][1] + 10);
const svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`);
svg.append('defs').html(`<pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
  <rect width="5" height="5" fill="#faf7f0"/><rect width="1.6" height="5" fill="#e0703f" opacity=".55"/></pattern>`);
const root = svg.append('g');
root.append('path').datum(d3.geoGraticule10()).attr('class', 'graticule').attr('d', path)
  .attr('clip-path', null);
const gC = root.append('g');
const gP = root.append('g');
const countryPaths = gC.selectAll('path').data(world.features).join('path')
  .attr('class', 'country').attr('d', path);
let zk = 1;
const zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]])
  .on('zoom', e => { root.attr('transform', e.transform); zk = e.transform.k; gP.selectAll('circle').attr('r', d => pinR(d) / Math.sqrt(zk)); });
svg.call(zoom).on('dblclick.zoom', null);
$('#zin').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.7);
$('#zout').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.7);
$('#zreset').onclick = () => { setFilter(null); svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); };
svg.on('click', e => { if (e.target === svg.node() || e.target.classList.contains('graticule')) setFilter(null); });

const tip = $('#tip');
function showTip(e, html) {
  const r = $('.map-card').getBoundingClientRect();
  tip.innerHTML = html; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1;
}
const hideTip = () => tip.style.opacity = 0;
let byCountry = {};
const pinR = d => 3.2 + Math.min(byCountry[d]?.trips.length || 1, 6) * 0.5;

function countryTip(c) {
  const a = byCountry[c];
  let sub = c === J.home ? 'дом' : J.bucket.includes(c) && !a ? 'хочу поехать' : '';
  if (a) sub = `${plural(a.trips.length, 'поездка', 'поездки', 'поездок')} · ${[...a.years].sort().join(', ')}`;
  return `${flag(c)} ${esc(cname(c))}${sub ? `<small>${sub}</small>` : ''}`;
}

function renderMap() {
  byCountry = aggregate();
  countryPaths
    .attr('class', d => 'country' + (byCountry[d.id] && d.id !== J.home ? ' visited' : '') + (d.id === J.home ? ' home' : '')
      + (!byCountry[d.id] && J.bucket.includes(d.id) ? ' bucket' : '') + (state.filter === d.id ? ' sel' : ''))
    .on('mousemove', (e, d) => (byCountry[d.id] || d.id === J.home || J.bucket.includes(d.id)) ? showTip(e, countryTip(d.id)) : hideTip())
    .on('mouseleave', hideTip)
    .on('click', (e, d) => { e.stopPropagation(); if (byCountry[d.id]) { setFilter(d.id); zoomTo(d.id); } });
  const pins = Object.keys(byCountry).filter(c => c !== J.home && WORLD_ANCHORS[c]);
  gP.selectAll('circle').data(pins, d => d).join('circle')
    .attr('class', d => 'pin' + (state.filter === d ? ' sel' : ''))
    .attr('cx', d => projection(WORLD_ANCHORS[d])[0]).attr('cy', d => projection(WORLD_ANCHORS[d])[1])
    .attr('r', d => pinR(d) / Math.sqrt(zk))
    .on('mousemove', (e, d) => showTip(e, countryTip(d))).on('mouseleave', hideTip)
    .on('click', (e, d) => { e.stopPropagation(); setFilter(d); zoomTo(d); });
}

function zoomTo(c) {
  const f = world.features.find(x => x.id === c); if (!f) return;
  let geom = f;
  if (f.geometry.type === 'MultiPolygon') { // берём самый большой кусок (чтобы Франция не тянула за собой Гвиану)
    const big = f.geometry.coordinates.map(p => ({ type: 'Polygon', coordinates: p })).sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
    geom = big;
  }
  const [[x0, y0], [x1, y1]] = path.bounds(geom);
  const k = Math.min(6, 0.55 / Math.max((x1 - x0) / W, (y1 - y0) / H));
  const kk = Math.max(1.4, k);
  svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}

/* ---------------- log ---------------- */
function setFilter(c) {
  state.filter = c; renderMap(); renderLog();
  if (c) document.querySelector('.log').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function thumbOf(p) { return p.thumb || p.src; }
const ENC = window.ENCRYPTED || null;          // онлайн-версия: данные и фото зашифрованы
const PIX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const imgAttr = path => ENC ? `src="${PIX}" data-enc="${esc(path)}"` : `src="${esc(path)}"`;

function renderLog() {
  const list = sortTrips(state.filter ? J.trips.filter(t => (t.countries || []).includes(state.filter)) : J.trips);
  $('#filter').innerHTML = state.filter ? `<div class="filter">${flag(state.filter)} ${esc(cname(state.filter))} <button id="clr" title="Показать все">×</button></div>` : '';
  if (state.filter) $('#clr').onclick = () => setFilter(null);
  const byC = aggregate();
  $('#logSub').textContent = J.trips.length ? `${plural(Object.keys(byC).filter(c => c !== J.home).length, 'страна', 'страны', 'стран')} · ${plural(J.trips.length, 'поездка', 'поездки', 'поездок')}` : '';
  const groups = d3.groups(list, tripYear).sort((a, b) => b[0] - a[0]);
  $('#years').innerHTML = groups.length ? groups.map(([y, ts]) => {
    const cs = [...new Set(ts.flatMap(t => t.countries || []))];
    if (state.view === 'short') return `<div class="year short"><div class="year-num">${y || '—'}</div><div class="chips">${
      cs.map(c => `<button class="chip cbtn" data-y="${y}" data-c="${c}">${flag(c)} ${esc(cname(c))}${ts.some(t => t.demo && (t.countries || []).includes(c)) ? ' <span class="demo">пример</span>' : ''}</button>`).join('')}</div></div>`;
    return `<div class="year"><div><div class="year-num">${y || '—'}</div></div><div>${
      ts.map(t => {
        const ph = (t.photos || []).slice(0, 3);
        const meta = [(t.countries || []).map(cname).join(', '), fmtDates(t, true), days(t) ? plural(days(t), 'день', 'дня', 'дней') : ''].filter(Boolean).join(' · ');
        return `<button class="trip" data-id="${esc(t.id)}"><span class="flags">${(t.countries || []).map(flag).join('')}</span>
          <span class="t"><b>${esc(tripTitle(t))}${t.demo ? '<span class="demo">пример</span>' : ''}</b><span>${esc(meta)}</span></span>
          ${ph.length ? `<span class="thumbs">${ph.map(p => `<img loading="lazy" ${imgAttr(thumbOf(p))} alt="">`).join('')}</span>` : ''}</button>`;
      }).join('')}</div></div>`;
  }).join('') : `<div class="empty">${state.editing ? 'Пока пусто — жми «+ Поездка».' : 'Пока пусто. Нажми «Редактировать», чтобы добавить первую поездку.'}</div>`;
  hydrate(document);
  document.querySelectorAll('.trip').forEach(el => el.onclick = () => openTrip(el.dataset.id));
  document.querySelectorAll('.cbtn').forEach(el => el.onclick = () => {
    const ts = sortTrips(list.filter(t => tripYear(t) === +el.dataset.y && (t.countries || []).includes(el.dataset.c)));
    if (ts.length === 1) openTrip(ts[0].id);
    else if (ts.length > 1) { state.view = 'full'; setFilter(el.dataset.c); }
  });
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('on', el.dataset.view === state.view); el.onclick = () => { state.view = el.dataset.view; renderLog(); }; });

  // список стран
  const cs = Object.keys(byC).sort((a, b) => cname(a).localeCompare(cname(b), 'ru'));
  $('#cSub').textContent = cs.length ? 'нажми, чтобы показать поездки' : 'появятся, когда добавишь поездки';
  $('#clist').innerHTML = cs.map(c => `<button data-c="${c}"><span>${flag(c)} ${esc(cname(c))}</span><small>${[...byC[c].years].sort().join(', ')}</small></button>`).join('');
  document.querySelectorAll('#clist button').forEach(el => el.onclick = () => { setFilter(el.dataset.c); zoomTo(el.dataset.c); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // bucket
  const bl = J.bucket.filter(c => !byC[c]);
  $('#bucket').innerHTML = bl.length ? bl.map(c => `<span class="chip">${flag(c)} ${esc(cname(c))}${state.editing ? ` <button data-rm="${c}" title="Убрать">×</button>` : ''}</span>`).join('') : '<span class="sub">пока пусто</span>';
  document.querySelectorAll('[data-rm]').forEach(el => el.onclick = async () => { J.bucket = J.bucket.filter(x => x !== el.dataset.rm); await save(); renderAll(); });
  $('#bucketAdd').innerHTML = state.editing ? `<div class="field" style="margin:12px 0 0"><input list="countryList" id="bucketIn" placeholder="добавить страну…"></div>` : '';
  if (state.editing) $('#bucketIn').onchange = async e => { const c = codeFromName(e.target.value); if (c && !J.bucket.includes(c)) { J.bucket.push(c); await save(); renderAll(); } else e.target.value = ''; };
}

function renderAll() { renderHeader(); renderMap(); renderLog(); }

/* ---------------- trip view ---------------- */
const modal = $('#modal'), sheet = $('#sheet');
function openModal(html) { sheet.innerHTML = html; modal.hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function openTrip(id) {
  const t = J.trips.find(x => x.id === id); if (!t) return;
  const ph = t.photos || [];
  const cover = ph[0];
  const head = `<h3>${esc(tripTitle(t))}</h3><div class="meta">${(t.countries || []).map(c => flag(c) + ' ' + esc(cname(c))).join(' · ')} · ${esc(fmtDates(t))}</div>`;
  const facts = [
    ['Даты', fmtDates(t) + (days(t) ? ` (${plural(days(t), 'день', 'дня', 'дней')})` : '')],
    ['Города', t.cities], ['Маршрут', t.route], ['Жильё', t.stay], ['С кем', t.with],
  ].filter(f => f[1]);
  openModal(`<button class="close" id="mx">×</button>
    ${cover ? `<div class="hero" ${ENC ? `data-enc-bg="${esc(cover.src)}"` : `style="background-image:url('${esc(cover.src)}')"`}><div class="ht">${head}</div></div>` : `<div class="sheet-head">${head}</div>`}
    <div class="sheet-body">
      <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
      ${ph.length ? `<div class="gallery">${ph.map((p, i) => `<img loading="lazy" ${imgAttr(thumbOf(p))} data-i="${i}" alt="">`).join('')}</div>`
        : `<div class="sub">${state.editing ? 'Фото пока нет — добавь в «Изменить».' : 'Фото пока нет.'}</div>`}
    </div>
    ${state.editing ? `<div class="sheet-foot"><button class="btn danger" id="del">Удалить поездку</button><button class="btn primary" id="ed">Изменить</button></div>` : ''}`);
  $('#mx').onclick = closeModal; hydrate(sheet);
  sheet.querySelectorAll('.gallery img').forEach(img => img.onclick = () => openLB(ph, +img.dataset.i));
  if (state.editing) {
    $('#ed').onclick = () => openForm(t);
    $('#del').onclick = async () => {
      if (!confirm(`Удалить «${tripTitle(t)}» вместе с фото?`)) return;
      J.trips = J.trips.filter(x => x !== t);
      await removePhotoDir(t.id);
      await save(); closeModal(); renderAll(); toast('Поездка удалена');
    };
  }
}

/* ---------------- lightbox ---------------- */
let lb = { list: [], i: 0 };
const lbEl = $('#lb');
function openLB(list, i) { lb = { list, i }; lbEl.hidden = false; showLB(); }
function showLB() { const want = lb.list[lb.i].src; if (ENC) { $('#lbImg').src = PIX; encUrl(want).then(u => { if (lb.list[lb.i].src === want) $('#lbImg').src = u; }); } else $('#lbImg').src = want; $('#lbCnt').textContent = `${lb.i + 1} / ${lb.list.length}`; }
const lbStep = d => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showLB(); };
$('#lbPrev').onclick = () => lbStep(-1); $('#lbNext').onclick = () => lbStep(1); $('#lbX').onclick = () => lbEl.hidden = true;
lbEl.addEventListener('click', e => { if (e.target === lbEl) lbEl.hidden = true; });
let tx = null;
lbEl.addEventListener('touchstart', e => tx = e.touches[0].clientX, { passive: true });
lbEl.addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1); tx = null; });
document.addEventListener('keydown', e => {
  if (!lbEl.hidden) { if (e.key === 'ArrowLeft') lbStep(-1); if (e.key === 'ArrowRight') lbStep(1); if (e.key === 'Escape') lbEl.hidden = true; return; }
  if (!modal.hidden && e.key === 'Escape' && !sheet.querySelector('form')) closeModal();
});

/* ---------------- toast ---------------- */
let toastT;
function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }

/* ---------------- countries list for inputs ---------------- */
const ALL = world.features.map(f => f.id).filter((v, i, a) => a.indexOf(v) === i).map(c => [c, cname(c)]).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
$('#countryList').innerHTML = ALL.map(([c, n]) => `<option value="${esc(n)}">`).join('');
const ALIAS = { 'южная корея': 'KR', 'корея': 'KR', 'сша': 'US', 'америка': 'US', 'англия': 'GB', 'великобритания': 'GB', 'оаэ': 'AE', 'эмираты': 'AE', 'голландия': 'NL', 'чехия': 'CZ', 'северная корея': 'KP', 'белоруссия': 'BY', 'беларусь': 'BY', 'турция': 'TR', 'ватикан': 'VA' };
function codeFromName(s) {
  s = (s || '').trim().toLowerCase().replace(/ё/g, 'е'); if (!s) return null;
  if (ALIAS[s]) return ALIAS[s];
  const norm = n => n.toLowerCase().replace(/ё/g, 'е');
  let hit = ALL.find(([c, n]) => norm(n) === s || c.toLowerCase() === s); if (hit) return hit[0];
  let m = ALL.filter(([c, n]) => norm(n).startsWith(s)); if (m.length === 1) return m[0][0];
  m = ALL.filter(([c, n]) => norm(n).includes(s)); if (m.length === 1) return m[0][0];
  return null;
}

/* ---------------- folder access (File System Access API) ---------------- */
const IDB = { db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('travel-journal', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = this.db || await this.open(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); },
  async set(k, v) { const db = this.db || await this.open(); return new Promise(res => { const tr = db.transaction('kv', 'readwrite'); tr.objectStore('kv').put(v, k); tr.oncomplete = res; tr.onerror = res; }); },
};

async function hasDataJs(dir) { try { await dir.getFileHandle('data.js'); await dir.getFileHandle('index.html'); return true; } catch { return false; } }

async function connectFolder() {
  if (!window.showDirectoryPicker) { alert('Редактирование работает в Google Chrome (или Edge) на компьютере. Открой index.html в Chrome.'); return false; }
  let dir = null;
  try { dir = await IDB.get('dir'); } catch {}
  if (dir) {
    try { if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') dir = null; } catch { dir = null; }
    if (dir && !(await hasDataJs(dir))) dir = null;
  }
  if (!dir) {
    alert('Сейчас Chrome попросит выбрать папку. Выбери ту папку, где лежит этот index.html (и data.js), и разреши запись — тогда страница сможет сохранять поездки и фото прямо туда.');
    try { dir = await showDirectoryPicker({ id: 'travel-journal', mode: 'readwrite' }); } catch { return false; }
    if (!(await hasDataJs(dir))) { alert('В этой папке нет index.html и data.js. Выбери папку журнала.'); return false; }
    await IDB.set('dir', dir);
  }
  state.dir = dir;
  // перечитываем data.js с диска — на случай, если он новее загруженного
  try {
    const txt = await (await (await dir.getFileHandle('data.js')).getFile()).text();
    const m = txt.search(/window\.JOURNAL\s*=/);
    const fresh = JSON.parse(txt.slice(txt.indexOf('{', m), txt.lastIndexOf('}') + 1));
    Object.keys(J).forEach(k => delete J[k]); Object.assign(J, fresh); J.trips = J.trips || []; J.bucket = J.bucket || [];
  } catch (e) { console.warn('data.js reread failed', e); }
  return true;
}

async function writeFile(dir, name, data) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); }

async function save() {
  if (!state.dir) { toast('Папка не подключена — изменения не сохранены'); return; }
  const body = `/* Данные журнала. Этот файл переписывает сама страница в режиме редактирования.\n   Можно править и руками — это обычный JSON внутри window.JOURNAL = ...; */\nwindow.JOURNAL = ${JSON.stringify(J, null, 2)};\n`;
  try {
    // бэкап предыдущей версии (храним последние 20)
    const bdir = await state.dir.getDirectoryHandle('backups', { create: true });
    const old = await (await (await state.dir.getFileHandle('data.js')).getFile()).text();
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    await writeFile(bdir, `data-${stamp}.js`, old);
    const names = []; for await (const [n] of bdir.entries()) if (n.startsWith('data-')) names.push(n);
    names.sort(); for (const n of names.slice(0, Math.max(0, names.length - 20))) await bdir.removeEntry(n);
  } catch (e) { console.warn('backup failed', e); }
  await writeFile(state.dir, 'data.js', body);
}

async function photoDir(id, create = true) {
  const p = await state.dir.getDirectoryHandle('photos', { create });
  return p.getDirectoryHandle(id, { create });
}
async function removePhotoDir(id) { if (!state.dir) return; try { const p = await state.dir.getDirectoryHandle('photos'); await p.removeEntry(id, { recursive: true }); } catch {} }
async function resize(file, max, q) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
  return { blob, w, h };
}

async function addPhotos(t, files) {
  files = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return 0;
  const d = await photoDir(t.id);
  let ok = 0, bad = 0;
  for (let i = 0; i < files.length; i++) {
    toast(`Сохраняю фото ${i + 1} из ${files.length}…`, 60000);
    try {
      const base = Date.now().toString(36) + '-' + i;
      const big = await resize(files[i], 2000, 0.85);
      const sm = await resize(files[i], 480, 0.8);
      await writeFile(d, base + '.jpg', big.blob);
      await d.getDirectoryHandle('thumb', { create: true }).then(td => writeFile(td, base + '.jpg', sm.blob));
      t.photos = t.photos || [];
      t.photos.push({ src: `photos/${t.id}/${base}.jpg`, thumb: `photos/${t.id}/thumb/${base}.jpg`, w: big.w, h: big.h });
      ok++;
    } catch (e) { console.warn(e); bad++; }
  }
  toast(bad ? `Добавлено ${ok}, не получилось ${bad}. Если это HEIC с айфона — экспортируй их как JPEG.` : `Добавлено фото: ${ok}`, bad ? 6000 : 2200);
  return ok;
}
async function removePhotoFilesFix(t, p) {
  try {
    const d = await photoDir(t.id, false);
    const n = p.src.split('/').pop();
    try { await d.removeEntry(n); } catch {}
    try { const td = await d.getDirectoryHandle('thumb'); await td.removeEntry(n); } catch {}
  } catch {}
}

/* ---------------- edit mode & form ---------------- */
$('#editBtn').onclick = async () => {
  if (state.editing) { state.editing = false; document.body.classList.remove('editing'); $('#addBtn').hidden = true; $('#pubBtn').hidden = true; $('#editBtn').textContent = '✎ Редактировать'; renderAll(); return; }
  if (!(await connectFolder())) return;
  state.editing = true; document.body.classList.add('editing'); $('#addBtn').hidden = false; $('#pubBtn').hidden = false; $('#editBtn').textContent = '✓ Готово';
  renderAll(); toast('Режим редактирования: изменения сразу сохраняются в папку');
};
$('#addBtn').onclick = () => openForm(null);
$('#pubBtn').onclick = () => openPublish();

function openForm(orig) {
  const isNew = !orig;
  const t = orig ? JSON.parse(JSON.stringify(orig)) : { id: 't' + Date.now().toString(36), title: '', countries: [], start: '', end: '', year: '', cities: '', route: '', stay: '', with: '', notes: '', photos: [] };
  delete t.demo;
  let added = [];
  const draw = () => {
    openModal(`<form class="form" id="f" autocomplete="off">
      <button type="button" class="close" id="fx">×</button>
      <h3 style="font-size:28px;margin:0 0 18px">${isNew ? 'Новая поездка' : 'Изменить поездку'}</h3>
      <div class="field"><label>Страны</label>
        <div class="chips" id="fc" style="margin-bottom:8px">${t.countries.map(c => `<span class="chip">${flag(c)} ${esc(cname(c))} <button type="button" data-c="${c}">×</button></span>`).join('')}</div>
        <input list="countryList" id="cin" placeholder="начни вводить: Португалия, Грузия…"></div>
      <div class="field"><label>Название (необязательно)</label><input id="ftitle" value="${esc(t.title)}" placeholder="например: Лиссабон и Порту"></div>
      <div class="row">
        <div class="field"><label>С</label><input type="date" id="fs" value="${esc(t.start)}"></div>
        <div class="field"><label>По</label><input type="date" id="fe" value="${esc(t.end)}"></div>
        <div class="field"><label>или только год</label><input type="number" id="fy" min="1950" max="2100" value="${esc(t.year || '')}" placeholder="2015"></div>
      </div>
      <div class="field"><label>Города</label><input id="fcity" value="${esc(t.cities)}" placeholder="Лиссабон, Синтра, Порту"></div>
      <div class="field"><label>Маршрут</label><input id="froute" value="${esc(t.route || '')}" placeholder="Москва → Стамбул → Тель-Авив"></div>
      <div class="field"><label>Жильё</label><input id="fstay" value="${esc(t.stay || '')}" placeholder="отель, квартира…"></div>
      <div class="field"><label>С кем</label><input id="fwith" value="${esc(t.with)}" placeholder="с женой, с друзьями…"></div>
      <div class="field"><label>Заметки</label><textarea id="fnotes" placeholder="Где жили, что понравилось, что запомнилось">${esc(t.notes)}</textarea></div>
      <div class="field"><label>Фото · первое — обложка</label>
        <div class="ph-grid">${t.photos.map((p, i) => `<div class="ph"><img src="${esc(thumbOf(p))}" alt="">
          <div class="ctl">${i ? `<button type="button" title="Сделать обложкой" data-cov="${i}">★</button>` : ''}<button type="button" title="Удалить" data-del="${i}">×</button></div>
          ${i === 0 ? '<span class="cov">обложка</span>' : ''}</div>`).join('')}</div>
        <label class="drop" id="drop">Перетащи фото сюда или нажми, чтобы выбрать<input type="file" id="ffile" accept="image/*" multiple hidden></label>
        <div class="hint">Фото уменьшаются до 2000px и сохраняются в папку photos/. Оригиналы не трогаются.</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button type="button" class="btn" id="fcancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button>
      </div></form>`);
    const collect = () => { t.title = $('#ftitle').value.trim(); t.start = $('#fs').value; t.end = $('#fe').value; t.year = $('#fy').value ? +$('#fy').value : ''; t.cities = $('#fcity').value.trim(); t.route = $('#froute').value.trim(); t.stay = $('#fstay').value.trim(); t.with = $('#fwith').value.trim(); t.notes = $('#fnotes').value; };
    const cancel = async () => { if (isNew) await removePhotoDir(t.id); else for (const p of added) await removePhotoFilesFix(t, p); closeModal(); if (orig) openTrip(orig.id); };
    $('#fx').onclick = cancel; $('#fcancel').onclick = cancel;
    $('#cin').onchange = e => { const c = codeFromName(e.target.value); if (c && !t.countries.includes(c)) { collect(); t.countries.push(c); draw(); $('#cin').focus(); } else if (!c) toast('Не нашёл такую страну — выбери из подсказок'); };
    sheet.querySelectorAll('#fc [data-c]').forEach(b => b.onclick = () => { collect(); t.countries = t.countries.filter(x => x !== b.dataset.c); draw(); });
    sheet.querySelectorAll('[data-cov]').forEach(b => b.onclick = () => { collect(); const [p] = t.photos.splice(+b.dataset.cov, 1); t.photos.unshift(p); draw(); });
    sheet.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { collect(); t._removed = (t._removed || []).concat(t.photos.splice(+b.dataset.del, 1)); draw(); });
    const handle = async files => { if (!state.dir) { toast('Сначала включи редактирование'); return; } collect(); const before = t.photos.length; await addPhotos(t, files); added = added.concat(t.photos.slice(before)); draw(); };
    $('#ffile').onchange = e => handle(e.target.files);
    const drop = $('#drop');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files); };
    $('#f').onsubmit = async e => {
      e.preventDefault(); collect();
      if (!t.countries.length) { toast('Добавь хотя бы одну страну'); return; }
      if (!t.start && !t.year) { toast('Укажи даты или хотя бы год'); return; }
      if (t.start && !t.end) t.end = t.start;
      if (t.start) t.year = '';
      for (const p of t._removed || []) await removePhotoFilesFix(t, p);
      delete t._removed;
      if (isNew) J.trips.push(t); else J.trips[J.trips.indexOf(orig)] = t;
      await save(); closeModal(); renderAll(); openTrip(t.id); toast('Сохранено');
    };
  };
  draw();
}

/* ================= онлайн-версия: расшифровка ================= */
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
async function deriveKey(password, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const importRaw = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
async function encryptBuf(key, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return out;
}
async function decryptBuf(key, buf) { const u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12)); }

let encKey = null; const urlCache = new Map();
function encUrl(path) {
  if (!urlCache.has(path)) urlCache.set(path, fetch(path).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(b => decryptBuf(encKey, b)).then(d => URL.createObjectURL(new Blob([d], { type: 'image/jpeg' }))));
  return urlCache.get(path);
}
function hydrate(rootEl) {
  if (!ENC) return;
  rootEl.querySelectorAll('[data-enc]').forEach(el => { const p = el.dataset.enc; el.removeAttribute('data-enc'); encUrl(p).then(u => el.src = u).catch(() => {}); });
  rootEl.querySelectorAll('[data-enc-bg]').forEach(el => { const p = el.dataset.encBg; el.removeAttribute('data-enc-bg'); encUrl(p).then(u => el.style.backgroundImage = `url('${u}')`).catch(() => {}); });
}

async function unlock(key) {
  const buf = await (await fetch('data.enc', { cache: 'no-cache' })).arrayBuffer();
  const data = JSON.parse(new TextDecoder().decode(await decryptBuf(key, buf)));   // бросит ошибку при неверном ключе
  encKey = key; Object.keys(J).forEach(k => delete J[k]); Object.assign(J, data); J.trips = J.trips || []; J.bucket = J.bucket || [];
}

async function bootEncrypted() {
  $('#editBtn').hidden = true;
  const lock = document.createElement('div');
  lock.className = 'lock';
  lock.innerHTML = `<form class="lock-card" id="lockF"><div class="eyebrow">Travel log</div><h1 style="font-size:34px;margin-bottom:6px">Путешествия</h1>
    <div class="sub">Страница зашифрована. Введи пароль.</div>
    <div class="field"><input type="password" id="lockP" placeholder="пароль" autocomplete="current-password" autofocus></div>
    <label class="sub" style="display:flex;gap:8px;align-items:center;margin:-6px 0 14px"><input type="checkbox" id="lockR" checked> запомнить на этом устройстве</label>
    <button class="btn primary" style="width:100%">Открыть</button><div class="lock-err" id="lockE"></div></form>`;
  document.body.appendChild(lock);
  const done = () => { lock.remove(); renderAll(); };
  const tryRaw = async raw => { try { await unlock(await importRaw(raw)); return true; } catch { return false; } };
  // 1) ключ в ссылке (#k=...)  2) запомненный ключ
  const h = new URLSearchParams(location.hash.slice(1)).get('k');
  if (h && await tryRaw(b64u.dec(h))) { try { localStorage.setItem('tj-key', h); } catch {} history.replaceState(null, '', location.pathname); return done(); }
  let saved = null; try { saved = localStorage.getItem('tj-key'); } catch {}
  if (saved && await tryRaw(b64u.dec(saved))) return done();
  $('#lockF').onsubmit = async e => {
    e.preventDefault(); $('#lockE').textContent = 'Проверяю…';
    try {
      const key = await deriveKey($('#lockP').value, b64u.dec(ENC.salt), ENC.iter);
      await unlock(key);
      if ($('#lockR').checked) try { localStorage.setItem('tj-key', b64u.enc(await crypto.subtle.exportKey('raw', key))); } catch {}
      done();
    } catch { $('#lockE').textContent = 'Неверный пароль'; }
  };
}

/* ================= сборка онлайн-версии (локально, в режиме редактирования) ================= */
const PUBLIC_FILES = ['app.js', 'vendor/d3.min.js', 'vendor/topojson-client.min.js', 'vendor/world.js'];
async function getDirPath(root, parts, create) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
async function readRel(root, rel) { const parts = rel.split('/'); const f = parts.pop(); const d = await getDirPath(root, parts, false); return (await (await d.getFileHandle(f)).getFile()); }
async function writeRel(root, rel, data) { const parts = rel.split('/'); const f = parts.pop(); const d = await getDirPath(root, parts, true); await writeFile(d, f, data); }
async function sha(buf) { return b64u.enc(await crypto.subtle.digest('SHA-256', buf)).slice(0, 22); }

function openPublish() {
  let cache = null;
  openModal(`<form class="form" id="pf"><button type="button" class="close" id="px">×</button>
    <h3 style="font-size:28px;margin:0 0 10px">Онлайн-версия</h3>
    <div class="sub" style="margin-bottom:16px">Соберу зашифрованную копию журнала в папку <b>public</b>. Её можно выкладывать куда угодно (GitHub Pages): без пароля там видны только зашифрованные файлы. Пароль никуда не отправляется.</div>
    <div class="field"><label>Пароль (лучше фраза из 3–4 слов)</label><input type="password" id="pp1" autocomplete="new-password"></div>
    <div class="field"><label>Ещё раз</label><input type="password" id="pp2" autocomplete="new-password"></div>
    <div class="field"><label>Адрес сайта (необязательно — чтобы сразу сделать ссылку для родных)</label><input id="purl" placeholder="https://имя.github.io/travel/"></div>
    <div class="hint" id="pstat"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" class="btn" id="pc">Закрыть</button><button class="btn primary" id="pgo">Собрать</button></div></form>`);
  $('#px').onclick = $('#pc').onclick = closeModal;
  (async () => { try { cache = JSON.parse(await (await readRel(state.dir, 'publish-cache.json')).text()); if (cache.url) $('#purl').value = cache.url; } catch {} })();
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const p1 = $('#pp1').value, p2 = $('#pp2').value, url = $('#purl').value.trim();
    if (p1.length < 12) return toast('Пароль слишком короткий — нужно хотя бы 12 символов');
    if (p1 !== p2) return toast('Пароли не совпадают');
    $('#pgo').disabled = true;
    const st = m => $('#pstat').textContent = m;
    try {
      // соль и кэш: тот же пароль — переиспользуем уже зашифрованные фото
      let salt = cache && cache.salt ? b64u.dec(cache.salt) : crypto.getRandomValues(new Uint8Array(16));
      const ITER = 310000;
      st('Готовлю ключ…');
      let key = await deriveKey(p1, salt, ITER);
      let check = await sha(await crypto.subtle.exportKey('raw', key));
      if (!cache || cache.check !== check) { // новый пароль → новая соль, всё заново
        if (cache) { salt = crypto.getRandomValues(new Uint8Array(16)); key = await deriveKey(p1, salt, ITER); check = await sha(await crypto.subtle.exportKey('raw', key)); }
        cache = { map: {} };
      }
      cache.salt = b64u.enc(salt); cache.check = check; cache.url = url; cache.map = cache.map || {};
      const pub = await state.dir.getDirectoryHandle('public', { create: true });
      // фото
      const all = J.trips.flatMap(t => (t.photos || []).flatMap(p => [p.src, p.thumb].filter(Boolean)));
      const used = new Set(); let n = 0;
      for (const rel of all) {
        n++; st(`Шифрую фото ${n} из ${all.length}…`);
        const f = await readRel(state.dir, rel); const tag = f.size + ':' + f.lastModified;
        let ent = cache.map[rel];
        let exists = false; if (ent) try { await readRel(pub, 'p/' + ent.name); exists = true; } catch {}
        if (!ent || ent.tag !== tag || !exists) {
          const name = b64u.enc(crypto.getRandomValues(new Uint8Array(12))) + '.bin';
          await writeRel(pub, 'p/' + name, await encryptBuf(key, await f.arrayBuffer()));
          ent = cache.map[rel] = { name, tag };
        }
        used.add(ent.name);
      }
      // убрать устаревшие
      try { const pd = await pub.getDirectoryHandle('p'); const del = []; for await (const [nm] of pd.entries()) if (!used.has(nm)) del.push(nm); for (const nm of del) await pd.removeEntry(nm); } catch {}
      for (const k of Object.keys(cache.map)) if (!all.includes(k)) delete cache.map[k];
      // данные (пути фото заменены на зашифрованные файлы)
      st('Шифрую данные…');
      const out = JSON.parse(JSON.stringify(J));
      out.trips.forEach(t => t.photos = (t.photos || []).map(p => ({ src: 'p/' + cache.map[p.src].name, thumb: p.thumb ? 'p/' + cache.map[p.thumb].name : undefined, w: p.w, h: p.h })));
      await writeFile(pub, 'data.enc', await encryptBuf(key, new TextEncoder().encode(JSON.stringify(out))));
      // код страницы
      st('Копирую страницу…');
      for (const rel of PUBLIC_FILES) await writeRel(pub, rel, await (await readRel(state.dir, rel)).arrayBuffer());
      let html = await (await readRel(state.dir, 'index.html')).text();
      html = html.replace('<script src="data.js"></script>', `<script>window.ENCRYPTED = ${JSON.stringify({ salt: cache.salt, iter: ITER })};</script>`)
                 .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">');
      await writeFile(pub, 'index.html', html);
      await writeFile(pub, '.nojekyll', '');
      await writeFile(state.dir, 'publish-cache.json', JSON.stringify(cache, null, 1));
      const raw = b64u.enc(await crypto.subtle.exportKey('raw', key));
      const share = (url || 'https://ИМЯ.github.io/РЕПОЗИТОРИЙ/').replace(/#.*$/, '').replace(/([^/])$/, '$1/') + '#k=' + raw;
      $('#pstat').innerHTML = `<b>Готово.</b> Папка <b>public</b> обновлена (${all.length} фото). Теперь залей её на GitHub.<br><br>
        Ссылка для родных — открывается без пароля, не публикуй её в открытом доступе:<br>
        <input readonly id="pshare" value="${esc(share)}" style="width:100%;margin-top:6px;font:12px monospace;padding:8px;border:1px solid var(--line);border-radius:8px">`;
      $('#pshare').onclick = e => { e.target.select(); navigator.clipboard && navigator.clipboard.writeText(share).then(() => toast('Ссылка скопирована')); };
    } catch (err) { console.error(err); st('Ошибка: ' + (err.message || err)); }
    $('#pgo').disabled = false;
  };
}

if (ENC) bootEncrypted(); else renderAll();
})();
