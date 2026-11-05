(() => {
  const R = RASAD;
  const $ = id => document.getElementById(id);
  const SEED = 42;
  const ORDER = { red: 0, orange: 1, amber: 2, green: 3 };
  const LEVEL_TEXT = { red: 'Red', orange: 'Orange', amber: 'Amber', green: 'Green' };
  const MODE_TEXT = { truck: 'Truck convoy', air: 'Helicopter sortie', drone: 'Logistics drone' };
  const fmt = R.fmtN;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let S, used, plans, selected, audit, extraPlan;

  function init() {
    S = R.demoState(SEED);
    used = { truck: 0, air: 0, drone: 0 };
    selected = 'FP-07';
    audit = [{ day: S.day, t: '06:00', text: 'Console opened. Ten posts loaded from synthetic sector data.' }];
    extraPlan = null;
    buildPlans();
    renderAll();
  }

  const assessAll = () => S.posts.map(p => R.assess(S, p));
  const assessOf = id => R.assess(S, S.posts.find(p => p.id === id));
  const free = () => ({ truck: R.TRUCKS_PER_DAY - used.truck, air: R.HELI_PER_DAY - used.air, drone: R.DRONES - used.drone });

  function buildPlans() {
    const keep = (plans || []).filter(p => p.day === S.day && p.status !== 'pending');
    const list = assessAll().filter(a => a.level !== 'green').sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.slack - b.slack);
    const fresh = [];
    list.forEach(a => {
      if (keep.some(k => k.postId === a.post.id && k.status === 'approved')) return;
      const p = R.plan(S, a);
      if (p) { p.status = 'pending'; fresh.push(p); }
    });
    plans = keep.concat(fresh);
  }

  function log(text) {
    audit.unshift({ day: S.day, t: new Date().toTimeString().slice(0, 5), text });
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- KPIs ----------
  function renderKPIs() {
    const all = assessAll();
    const c = { red: 0, orange: 0, amber: 0, green: 0 };
    all.forEach(a => c[a.level]++);
    const f = free();
    $('kpis').innerHTML = `
      <div class="kpi red"><span class="label">Red · move today</span><b>${c.red}</b></div>
      <div class="kpi orange"><span class="label">Orange · plan now</span><b>${c.orange}</b></div>
      <div class="kpi amber"><span class="label">Amber · watch</span><b>${c.amber}</b></div>
      <div class="kpi green"><span class="label">Green · lasts</span><b>${c.green}</b></div>
      <div class="kpi"><span class="label">Trucks free today</span><b class="num">${f.truck}/${R.TRUCKS_PER_DAY}</b></div>
      <div class="kpi"><span class="label">Heli sorties free</span><b class="num">${f.air}/${R.HELI_PER_DAY}</b></div>
      <div class="kpi"><span class="label">Emergency sorties so far</span><b class="num">${S.metrics.emergency}</b></div>`;
    $('date').textContent = R.fmtDate(S.day);
  }

  // ---------- Map ----------
  const node = id => R.DEPOTS.find(d => d.id === id) || R.PASSES.find(p => p.id === id) || R.POSTS.find(p => p.id === id);
  function passStyle(passId) {
    const pass = R.passById(S, passId);
    if (pass.closed) return { stroke: 'var(--red)', dash: '9 7', state: 'shut' };
    const o = R.routeOutlook(S, { path: [passId] });
    if (!o.seasonal && o.inDays <= R.HORIZON) return { stroke: 'var(--amber)', dash: '9 7', state: 'risk' };
    return { stroke: 'var(--road)', dash: '', state: 'open' };
  }
  function renderMap() {
    const all = assessAll();
    const edges = [['D1', 'K', 'K'], ['K', 'D2', 'K'], ['D2', 'S', 'S'], ['S', 'R', 'R'], ['D2', 'M', 'M'], ['D2', 'W', 'W']];
    R.POSTS.forEach(p => {
      const last = p.path[p.path.length - 1];
      edges.push([last === 'K' ? 'D2' : last, p.id, last]);
    });
    let svg = `<svg viewBox="0 0 1000 620" role="img" aria-label="Map of Sector North with depots, passes and ten forward posts">
      <rect x="0" y="0" width="1000" height="620" fill="var(--terrain-2)"/>
      <polygon points="0,0 1000,0 1000,330 920,280 840,320 760,250 690,300 600,240 520,280 440,230 360,290 280,250 200,300 120,270 0,320" fill="var(--terrain-3)"/>
      <polygon points="0,620 0,500 120,470 230,500 330,450 430,480 540,430 650,470 760,430 880,470 1000,440 1000,620" fill="var(--terrain-1)"/>
      <g fill="none" stroke="var(--contour)" stroke-width="1.5">
        <ellipse cx="760" cy="120" rx="160" ry="70"/><ellipse cx="760" cy="120" rx="95" ry="40"/>
        <ellipse cx="300" cy="170" rx="170" ry="80"/><ellipse cx="300" cy="170" rx="100" ry="45"/>
        <ellipse cx="560" cy="200" rx="120" ry="55"/>
      </g>
      <g fill="var(--snow)" opacity=".85">
        <polygon points="730,140 760,92 792,140"/><polygon points="885,120 920,70 955,120"/><polygon points="270,190 300,140 332,190"/><polygon points="535,215 560,170 588,215"/><polygon points="150,170 175,128 202,170"/>
      </g>
      <path d="M0,585 C150,560 260,600 380,560 S620,520 720,560 S900,600 1000,570" fill="none" stroke="var(--water)" stroke-width="5" stroke-linecap="round"/>`;
    edges.forEach(([a, b, pid]) => {
      const A = node(a), B = node(b), st = passStyle(pid);
      svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${st.stroke}" stroke-width="4" stroke-linecap="round" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''}/>`;
    });
    R.PASSES.forEach(p => {
      const st = passStyle(p.id);
      const live = R.passById(S, p.id);
      const left = ['R', 'M', 'W'].includes(p.id);
      svg += `<g><polygon points="${p.x - 11},${p.y + 9} ${p.x},${p.y - 11} ${p.x + 11},${p.y + 9}" fill="${st.state === 'shut' ? 'var(--red)' : st.state === 'risk' ? 'var(--amber)' : 'var(--surface)'}" stroke="var(--road)" stroke-width="2"/>
        <text x="${left ? p.x - 15 : p.x + 15}" y="${p.y + 5}" text-anchor="${left ? 'end' : 'start'}" font-family="IBM Plex Sans, sans-serif" font-size="15" font-weight="600" fill="var(--ink)">${esc(p.name)}</text>
        <text x="${left ? p.x - 15 : p.x + 15}" y="${p.y + 22}" text-anchor="${left ? 'end' : 'start'}" font-family="IBM Plex Mono, monospace" font-size="12" fill="var(--muted)">${p.alt} m · snow ${Math.round(live.pack)}/${p.thr} cm</text></g>`;
    });
    R.DEPOTS.forEach(d => {
      svg += `<g><rect x="${d.x - 12}" y="${d.y - 12}" width="24" height="24" rx="3" fill="var(--accent)"/><text x="${d.x + 18}" y="${d.y + 5}" font-family="IBM Plex Sans, sans-serif" font-size="15" font-weight="600" fill="var(--ink)">${esc(d.name)}</text></g>`;
    });
    all.forEach(a => {
      const p = a.post, sel = p.id === selected;
      svg += `<g class="post" tabindex="0" role="button" data-id="${p.id}" aria-label="${p.id} ${esc(p.name)}, ${LEVEL_TEXT[a.level]}">
        <circle class="ring" cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="${sel ? 'var(--ink)' : 'transparent'}" stroke-width="3"/>
        <circle cx="${p.x}" cy="${p.y}" r="14" fill="var(--${a.level})" stroke="var(--surface)" stroke-width="3"/>
        <text x="${p.x}" y="${p.y + 38}" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-size="19" font-weight="700" fill="var(--ink)">${p.id}</text>
      </g>`;
    });
    svg += `</svg>`;
    $('map').innerHTML = svg;
    $('map').querySelectorAll('.post').forEach(g => {
      const go = () => { selected = g.dataset.id; renderMap(); renderDetail(); };
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ---------- Post detail ----------
  function clocksSVG(a) {
    const r = a.route, need = r.inDays + r.length, supply = a.minDays;
    const maxD = Math.min(240, Math.max(120, need + 15, supply + 15));
    const W = 560, L = 118, Rr = 20, x = d => L + (Math.min(d, maxD) / maxD) * (W - L - Rr);
    const col = `var(--${a.level})`;
    let s = `<svg viewBox="0 0 ${W} 150" role="img" aria-label="Supply clock ${Math.round(supply)} days against route closure in ${r.inDays} days for ${r.length} days">`;
    s += `<text x="0" y="36" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600" fill="var(--ink)">Supply clock</text>`;
    s += `<rect x="${L}" y="22" width="${x(supply) - L}" height="20" rx="3" fill="${col}"/>`;
    s += `<text x="${Math.min(x(supply) + 6, W - 150)}" y="37" font-family="IBM Plex Mono, monospace" font-size="12" fill="var(--ink)">${Math.round(supply)} d</text>`;
    s += `<text x="0" y="80" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600" fill="var(--ink)">Route clock</text>`;
    if (r.inDays > 0) s += `<rect x="${L}" y="66" width="${x(r.inDays) - L}" height="20" rx="3" fill="var(--green-soft)" stroke="var(--green)"/>`;
    s += `<rect x="${x(r.inDays)}" y="66" width="${x(need) - x(r.inDays)}" height="20" rx="3" fill="var(--red-soft)" stroke="var(--red)" stroke-dasharray="4 3"/>`;
    s += `<text x="${x(r.inDays) + 6}" y="81" font-family="IBM Plex Mono, monospace" font-size="12" fill="var(--red)">shut ~${r.length} d</text>`;
    if (supply < need) s += `<rect x="${x(supply)}" y="20" width="${x(need) - x(supply)}" height="68" fill="var(--red)" opacity=".12"/>`;
    s += `<line x1="${x(need)}" y1="12" x2="${x(need)}" y2="96" stroke="var(--ink)" stroke-width="2" stroke-dasharray="3 3"/>`;
    s += `<text x="${Math.min(x(need), W - 4)}" y="10" text-anchor="end" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--muted)">cover needed: ${need} d</text>`;
    s += `<line x1="${L}" y1="108" x2="${W - Rr}" y2="108" stroke="var(--line)"/>`;
    for (let d = 0; d <= maxD; d += 30) s += `<line x1="${x(d)}" y1="104" x2="${x(d)}" y2="112" stroke="var(--muted)"/><text x="${x(d)}" y="128" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--muted)">${d}</text>`;
    s += `<text x="${W - Rr}" y="146" text-anchor="end" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--muted)">days from today</text></svg>`;
    return s;
  }

  function sparkSVG(a) {
    const post = a.post, it = a.short, cap = post.cap[it.id];
    const past = post.hist.slice(-30).map(h => h[it.id]);
    const fut = []; for (let k = 1; k <= 30; k++) fut.push(Math.max(0, it.stock - R.useOver(S, post, it.id, 0, k)));
    const W = 560, H = 120, P = 30, n = past.length + fut.length;
    const top = Math.max(...past, ...fut, it.stock, 1) * 1.15;
    const x = i => P + (i / (n - 1)) * (W - P - 8), y = v => H - 18 - (v / top) * (H - 30);
    const line = (arr, off) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${it.name} stock, last 30 days and 30-day forecast">`;
    [0, .5, 1].forEach(f => s += `<line x1="${P + 14}" x2="${W - 8}" y1="${y(top / 1.15 * f)}" y2="${y(top / 1.15 * f)}" stroke="var(--line)"/><text x="${P + 10}" y="${y(top / 1.15 * f) + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">${f ? fmt(top / 1.15 * f / 1000) + 'k' : '0'}</text>`);
    s += `<path d="${line(past, 0)} L${x(past.length - 1)},${H - 18} L${x(0)},${H - 18} Z" fill="var(--accent)" opacity=".12"/>`;
    s += `<path d="${line(past, 0)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
    s += `<path d="${line([past[past.length - 1] ?? it.stock].concat(fut), past.length - 1)}" fill="none" stroke="var(--${a.level})" stroke-width="2.5" stroke-dasharray="6 4"/>`;
    s += `<circle cx="${x(past.length - 1)}" cy="${y(it.stock)}" r="4" fill="var(--accent)"/>`;
    s += `<text x="${x(past.length - 1)}" y="${H - 2}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--muted)">today</text>`;
    s += `<text x="${W - 8}" y="${H - 2}" text-anchor="end" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--muted)">forecast →</text></svg>`;
    return s;
  }

  function verdict(a) {
    const r = a.route, need = r.inDays + r.length;
    if (a.level === 'red' && !r.open) return `Route is shut and ${a.short.name.toLowerCase()} lasts only ${Math.round(a.minDays)} days. Air resupply needed.`;
    if (a.level === 'red') return `Stock lasts ${Math.round(a.minDays)} days but ${r.pass.name} likely shuts in ${r.inDays} days for ~${r.length}. Short by ${Math.round(need - a.minDays)} days. Move stock while the road is open.`;
    if (a.level === 'orange') return `Short by ${Math.round(need - a.minDays)} days against the expected closure of ${r.pass.name}. Plan a convoy now.`;
    if (a.level === 'amber') return `Stock covers the closure with only ${Math.round(a.slack)} days to spare. Watch daily.`;
    return `Stock covers the expected closure with ${Math.round(a.slack)} days to spare.`;
  }

  function renderDetail() {
    const a = assessOf(selected), p = a.post, r = a.route;
    const inTransit = p.inTransit.length ? p.inTransit.map(t => `${fmt(t.qty)} ${R.ITEMS.find(i => i.id === t.item).unit} ${R.ITEMS.find(i => i.id === t.item).name.toLowerCase()} by ${t.mode}, arrives ${R.fmtDate(t.arrive)}`).join('; ') : 'Nothing in transit';
    $('detail').innerHTML = `
      <div class="post-h">
        <div><span class="label">Selected post</span><h2>${p.id} ${esc(p.name)}</h2>
        <div class="meta">${p.alt.toLocaleString('en-IN')} m · ${p.troops} troops · via ${p.path.map(id => R.passById(S, id).name).join(' → ')}</div></div>
        <span class="pill ${a.level}">${LEVEL_TEXT[a.level]}</span>
      </div>
      <div class="clocks">${clocksSVG(a)}</div>
      <div class="verdict ${a.level}">${verdict(a)}${r.seasonal ? ' <span class="note">(closure date from seasonal pattern; the 14-day forecast shows no closure yet)</span>' : ' <span class="note">(closure from the 14-day snow forecast)</span>'}</div>
      <div class="tbl-wrap"><table>
        <tr><th>Item</th><th>Stock</th><th class="r">Use / day</th><th class="r">Lasts</th></tr>
        ${a.items.map(i => `<tr><td>${i.name}</td><td><div class="num">${fmt(i.stock)} / ${fmt(i.cap)} ${i.unit}</div><div class="bar"><span class="${i.stock / i.cap < 0.2 ? 'low' : ''}" style="width:${Math.min(100, (i.stock / i.cap) * 100).toFixed(0)}%"></span></div></td><td class="r num">${fmt(i.rate)}</td><td class="r num">${Math.round(i.days)} d</td></tr>`).join('')}
      </table></div>
      <div><span class="label">${a.short.name} · last 30 days and forecast</span>${sparkSVG(a)}</div>
      <p class="note">${esc(inTransit)}</p>`;
  }

  // ---------- Plans ----------
  function planCard(p) {
    const post = S.posts.find(x => x.id === p.postId);
    const v = p.validation || R.validate(S, p, used);
    const items = p.items.map(l => { const it = R.ITEMS.find(i => i.id === l.item); return `<span class="chip num">${fmt(l.qty)} ${it.unit} ${it.name.toLowerCase()}</span>`; }).join('');
    const status = p.status === 'approved' ? '<span class="pill green">Approved</span>' : p.status === 'rejected' ? '<span class="pill red">Blocked</span>' : '';
    const acts = p.status === 'pending' ? `<button class="primary" data-act="approve" data-id="${p.id}" type="button">Approve</button><button data-act="reject" data-id="${p.id}" type="button">Reject</button>` : status;
    return `<article class="plan ${p.status === 'rejected' ? 'rejected' : p.level} ${p.status === 'approved' ? 'done' : ''}">
      <div class="body">
        <h3>${p.postId} ${esc(post.name)} · ${MODE_TEXT[p.mode]} × ${p.units}</h3>
        <div class="chips">${items}<span class="chip">via ${esc(p.via.join(' → '))}</span><span class="chip">ETA ${R.fmtDate(S.day + p.eta)}</span></div>
        <div class="note">${esc(p.reason)}</div>
        <ul class="checks">${v.checks.map(c => `<li class="${c.ok ? '' : 'bad'}">${esc(c.text)}</li>`).join('')}</ul>
      </div>
      <div class="acts">${acts}</div>
    </article>`;
  }
  function renderPlans() {
    const f = free();
    $('pool').textContent = `Today: ${f.truck} of ${R.TRUCKS_PER_DAY} trucks (${fmt(R.TRUCK_CAP)} each), ${f.air} of ${R.HELI_PER_DAY} helicopter sorties (${fmt(R.HELI_CAP)} each) and ${f.drone} drones (${R.DRONE_CAP} kg each) free. Plans are sorted by urgency.`;
    const list = (extraPlan ? [extraPlan] : []).concat(plans);
    $('plans').innerHTML = list.length ? list.map(planCard).join('') : '<p class="note">No post needs a dispatch today. Advance the day to watch the forecast change.</p>';
  }
  function approve(id) {
    const p = plans.find(x => x.id === id); if (!p || p.status !== 'pending') return false;
    const v = R.validate(S, p, used);
    p.validation = v;
    if (v.ok) {
      R.dispatch(S, p); used[p.mode] += p.units; p.status = 'approved';
      log(`Approved: ${p.postId} ${MODE_TEXT[p.mode].toLowerCase()} × ${p.units}, ${fmt(p.total)} units via ${p.via.join(' → ')}.`);
      return true;
    }
    p.status = 'rejected';
    log(`Guardrail blocked ${p.postId}: ${v.checks.filter(c => !c.ok).map(c => c.text).join('; ')}.`);
    return false;
  }
  $('plans').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const p = plans.find(x => x.id === b.dataset.id);
    if (b.dataset.act === 'approve') { const ok = approve(b.dataset.id); toast(ok ? `Approved. ${p.postId} convoy logged.` : `Blocked by guardrail: see the red check.`); }
    else { p.status = 'rejected'; p.validation = { checks: [{ ok: false, text: 'Rejected by officer' }] }; log(`Officer rejected the plan for ${p.postId}.`); }
    renderAll(false);
  });
  $('approveAll').addEventListener('click', () => {
    let n = 0, blocked = 0;
    plans.filter(p => p.status === 'pending').forEach(p => {
      if (R.validate(S, p, used).ok) { approve(p.id); n++; } else blocked++;
    });
    toast(`${n} plan${n === 1 ? '' : 's'} approved${blocked ? `, ${blocked} left: not enough vehicles today` : ''}.`);
    renderAll(false);
  });
  $('unsafe').addEventListener('click', () => {
    const shut = S.posts.find(p => p.path.some(id => R.passById(S, id).closed));
    const post = shut || S.posts.find(p => p.id === selected);
    const p = {
      id: 'unsafe-' + S.day, postId: post.id, mode: 'truck', units: shut ? 1 : 2,
      items: [{ item: 'fuel', qty: shut ? 3000 : 9000 }], total: shut ? 3000 : 9000,
      via: post.path.map(id => R.passById(S, id).name), eta: post.path.length, level: 'red', day: S.day,
      reason: shut ? 'Test: a truck plan through a pass that is already shut.' : 'Test: 9,000 L loaded on 2 trucks (8,000 L limit).',
    };
    p.validation = R.validate(S, p, used); p.status = p.validation.ok ? 'pending' : 'rejected';
    extraPlan = p;
    log(`Guardrail test on ${post.id}: ${p.validation.ok ? 'passed' : 'blocked: ' + p.validation.checks.filter(c => !c.ok).map(c => c.text).join('; ')}.`);
    toast('Unsafe plan blocked before it reached the officer.');
    renderAll(false);
  });

  // ---------- Feed & audit ----------
  function renderFeed() {
    const rows = [];
    S.posts.forEach(p => {
      const h = p.hist, a = h[h.length - 1], b = h[h.length - 2];
      if (!a) return;
      [['kero', 'Kerosene tank', 'L'], ['fuel', 'Fuel drums', 'L']].forEach(([k, name, u]) => {
        const d = b ? a[k] - b[k] : 0;
        rows.push(`<li><time>${R.fmtDate(S.day - 1)}</time><span><b>ESP32-${p.id.slice(3)}</b> · ${name} <span class="num">${fmt(a[k])} ${u}</span> <span class="note num">(${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))})</span></span></li>`);
      });
    });
    $('feed').innerHTML = rows.join('');
    $('audit').innerHTML = audit.slice(0, 40).map(x => `<li><time>${R.fmtDate(x.day)} ${x.t}</time><span>${esc(x.text)}</span></li>`).join('');
  }

  // ---------- Ask ----------
  const SUGGEST = ['Which posts are at risk?', 'Why is FP-07 red?', 'Plan for FP-03', 'Which passes close soon?', 'How many trucks are free?'];
  $('suggest').innerHTML = SUGGEST.map(q => `<button type="button">${q}</button>`).join('');
  $('suggest').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('ask').value = b.textContent; answer(b.textContent); } });
  $('askForm').addEventListener('submit', e => { e.preventDefault(); answer($('ask').value); });
  function answer(q) {
    const t = q.toLowerCase(); let out;
    const m = t.match(/fp[\s-]?(\d{1,2})/);
    const all = assessAll().sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.slack - b.slack);
    if (m) {
      const id = 'FP-' + m[1].padStart(2, '0');
      const post = S.posts.find(p => p.id === id);
      if (!post) out = `I can't find ${id}. Posts run from FP-01 to FP-10.`;
      else {
        const a = R.assess(S, post); selected = id;
        if (/plan|send|what|do/.test(t)) {
          const p = R.plan(S, a, free());
          out = p ? `${id} ${post.name}: send ${p.items.map(l => fmt(l.qty) + ' ' + R.ITEMS.find(i => i.id === l.item).unit + ' ' + R.ITEMS.find(i => i.id === l.item).name.toLowerCase()).join(', ')} by ${MODE_TEXT[p.mode].toLowerCase()} × ${p.units} via ${p.via.join(' → ')}, arriving ${R.fmtDate(S.day + p.eta)}.\nGuardrails: ${R.validate(S, p, used).checks.map(c => (c.ok ? '✓ ' : '✕ ') + c.text).join('; ')}.` : `${id} ${post.name} needs nothing today, or no vehicles are free.`;
        } else {
          out = `${id} ${post.name} is ${LEVEL_TEXT[a.level].toUpperCase()}.\n${verdict(a)}\nShortest item: ${a.short.name}, ${fmt(a.short.stock)} ${a.short.unit} at ${fmt(a.short.rate)} ${a.short.unit}/day (forecast for the cold ahead).`;
        }
        renderMap(); renderDetail();
      }
    } else if (/risk|danger|red|urgent|which post/.test(t)) {
      const risky = all.filter(a => a.level === 'red' || a.level === 'orange');
      out = risky.length ? `${risky.length} posts need action:\n` + risky.map(a => `• ${a.post.id} ${a.post.name} (${LEVEL_TEXT[a.level]}): ${R.plan(S, a) ? R.plan(S, a).reason : verdict(a)}`).join('\n') : 'No post is red or orange today.';
    } else if (/pass|road|route|clos|snow/.test(t)) {
      out = S.passes.map(p => { const o = R.routeOutlook(S, { path: [p.id] }); return `• ${p.name} (${p.alt} m): ${p.closed ? 'SHUT' : o.seasonal ? `open, seasonal closure in ~${o.inDays} days` : `open, forecast to shut in ${o.inDays} days`} · snow ${Math.round(p.pack)}/${p.thr} cm`; }).join('\n');
    } else if (/truck|vehicle|heli|drone|capacity|free/.test(t)) {
      const f = free(); out = `Free today: ${f.truck} trucks, ${f.air} helicopter sorties, ${f.drone} drones. Pending plans: ${plans.filter(p => p.status === 'pending').length}.`;
    } else {
      out = 'Try: "Which posts are at risk?", "Why is FP-07 red?", "Plan for FP-03", "Which passes close soon?" or "How many trucks are free?"';
    }
    $('answer').textContent = out;
  }

  // ---------- Day controls ----------
  function advance(n) {
    for (let i = 0; i < n; i++) {
      const before = S.metrics.emergency;
      R.step(S, 'manual');
      used = { truck: 0, air: 0, drone: 0 };
      S.passes.forEach((p, k) => { const was = S.passHist[S.passHist.length - 2]; if (was && was[k] !== p.closed) log(`${p.name} ${p.closed ? 'shut by snow' : 'reopened'}.`); });
      if (S.metrics.emergency > before) log(`Emergency helicopter sortie: a post ran dry (${S.metrics.emergency - before} sortie${S.metrics.emergency - before > 1 ? 's' : ''}).`);
      if (S.day >= R.SEASON_DAYS) break;
    }
    extraPlan = null;
    buildPlans();
    renderAll();
  }
  $('adv1').addEventListener('click', () => advance(1));
  $('adv7').addEventListener('click', () => advance(7));
  $('reset').addEventListener('click', () => { init(); toast('Reset to 31 Oct.'); });
  $('storm').addEventListener('click', () => {
    for (let k = 1; k <= 3; k++) { const w = S.weather[S.day + k]; if (w) { w.snow += 45; w.t4000 -= 6; } }
    log('Weather update: heavy snowstorm forecast for the next 3 days.');
    buildPlans(); renderAll(); toast('Snowstorm added to the forecast. Watch the route clocks.');
  });

  function renderAll(rebuild) {
    if (rebuild !== false) buildPlans();
    renderKPIs(); renderMap(); renderDetail(); renderPlans(); renderFeed();
  }

  // ---------- Tabs ----------
  function show(tab) {
    const bt = tab === 'bt';
    $('ops').hidden = bt; $('bt').hidden = !bt;
    $('tab-ops').setAttribute('aria-selected', String(!bt)); $('tab-bt').setAttribute('aria-selected', String(bt));
    if (bt) renderBacktest();
  }
  $('tab-ops').addEventListener('click', () => show('ops'));
  $('tab-bt').addEventListener('click', () => show('bt'));

  // ---------- Backtest ----------
  const WINTERS = [[42, 'Winter A'], [2, 'Winter B'], [7, 'Winter C'], [11, 'Winter D'], [23, 'Winter E']];
  $('seed').innerHTML = WINTERS.map(([s, n]) => `<option value="${s}">${n}</option>`).join('');
  $('btPost').innerHTML = R.POSTS.map(p => `<option value="${p.id}">${p.id} ${esc(p.name)}</option>`).join('');
  $('btPost').value = 'FP-07';
  const cache = {};
  const runPair = seed => cache[seed] || (cache[seed] = { fixed: R.runSeason(seed, 'fixed'), rasad: R.runSeason(seed, 'rasad') });
  $('seed').addEventListener('change', renderBacktest);
  $('btPost').addEventListener('change', renderBacktest);
  const dryDays = post => post.hist.filter(h => R.ITEMS.some(it => h[it.id] <= 0)).length;

  function renderBacktest() {
    const seed = +$('seed').value, pid = $('btPost').value, pair = runPair(seed);
    const F = pair.fixed.metrics, Q = pair.rasad.metrics;
    const card = (label, f, r, unit, better) => `<div class="cmp"><span class="label">${label}</span>
      <div class="row fixed"><span>Fixed calendar</span><b class="num">${f}${unit || ''}</b></div>
      <div class="row rasad"><span>RASAD</span><b class="num">${r}${unit || ''}</b></div>
      <span class="note">${better}</span></div>`;
    $('compare').innerHTML =
      card('Stockout post-days', F.stockoutDays, Q.stockoutDays, '', 'Days a post had an item at zero') +
      card('Emergency air sorties', F.emergency, Q.emergency, '', 'Helicopters sent after a post ran dry') +
      card('Planned air sorties', F.plannedAir, Q.plannedAir, '', 'Air resupply booked in advance') +
      card('Truck trips', F.trucks, Q.trucks, '', 'Convoys on open roads') +
      card('Stock left on 30 Mar', F.endFill, Q.endFill, '%', 'Average fill of storage at season end');
    // chart
    const fp = pair.fixed.state.posts.find(p => p.id === pid), rp = pair.rasad.state.posts.find(p => p.id === pid);
    const cap = fp.cap.kero, W = 760, H = 300, L = 46, B = 34, T = 14, Rr = 12;
    const x = d => L + (d / (R.SEASON_DAYS - 1)) * (W - L - Rr), y = v => T + (1 - v / cap) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kerosene stock at ${pid} across the winter under both policies">`;
    const ph = pair.rasad.state.passHist, idx = fp.path.map(id => R.PASSES.findIndex(p => p.id === id));
    let start = null;
    for (let d = 0; d <= ph.length; d++) {
      const shut = d < ph.length && idx.some(i => ph[d][i]);
      if (shut && start === null) start = d;
      if (!shut && start !== null) { s += `<rect x="${x(start)}" y="${T}" width="${x(d - 1) - x(start)}" height="${H - T - B}" fill="var(--muted)" opacity=".13"/>`; start = null; }
    }
    [0, .25, .5, .75, 1].forEach(f => s += `<line x1="${L}" x2="${W - Rr}" y1="${y(cap * f)}" y2="${y(cap * f)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(cap * f) + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--muted)">${f * 100}%</text>`);
    [[0, 'Oct'], [31, 'Nov'], [61, 'Dec'], [92, 'Jan'], [123, 'Feb'], [151, 'Mar']].forEach(([d, m]) => s += `<text x="${x(d)}" y="${H - 12}" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="var(--muted)">${m}</text>`);
    const path = st => st.hist.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.kero).toFixed(1)}`).join(' ');
    s += `<path d="${path(fp)}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="7 5"/>`;
    s += `<path d="${path(rp)}" fill="none" stroke="var(--accent)" stroke-width="3"/>`;
    fp.hist.forEach((h, i) => { if (h.kero <= 0) s += `<circle cx="${x(i)}" cy="${y(0)}" r="3.5" fill="var(--red)"/>`; });
    s += `<g font-family="IBM Plex Sans, sans-serif" font-size="12"><line x1="${L + 10}" x2="${L + 40}" y1="${T + 10}" y2="${T + 10}" stroke="var(--accent)" stroke-width="3"/><text x="${L + 46}" y="${T + 14}" fill="var(--ink)">RASAD</text>
      <line x1="${L + 110}" x2="${L + 140}" y1="${T + 10}" y2="${T + 10}" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="7 5"/><text x="${L + 146}" y="${T + 14}" fill="var(--ink)">Fixed calendar</text>
      <circle cx="${L + 266}" cy="${T + 10}" r="4" fill="var(--red)"/><text x="${L + 276}" y="${T + 14}" fill="var(--ink)">Ran dry</text></g></svg>`;
    $('chart').innerHTML = s;
    $('chartTitle').textContent = `Kerosene stock at ${pid}`;
    const rows = R.POSTS.map(p => {
      const f = dryDays(pair.fixed.state.posts.find(x => x.id === p.id)), r = dryDays(pair.rasad.state.posts.find(x => x.id === p.id));
      return `<tr><td>${p.id} ${esc(p.name)}</td><td class="r num">${p.alt.toLocaleString('en-IN')} m</td><td class="r num">${f}</td><td class="r num"><b>${r}</b></td></tr>`;
    }).join('');
    $('btTable').innerHTML = `<tr><th>Post</th><th class="r">Altitude</th><th class="r">Fixed</th><th class="r">RASAD</th></tr>${rows}`;
  }

  init();
})();
