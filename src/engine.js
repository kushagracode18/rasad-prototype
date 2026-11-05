// RASAD prototype engine: synthetic sector, weather, demand, two-clock rule, planner, validator, backtest.
const RASAD = (() => {
  const SEASON_DAYS = 180; // 1 Oct -> 30 Mar
  const START = Date.UTC(2026, 9, 1);
  const HORIZON = 14;
  const ITEMS = [
    { id: 'fuel', name: 'Fuel', unit: 'L' },
    { id: 'ration', name: 'Ration', unit: 'kg' },
    { id: 'kero', name: 'Kerosene', unit: 'L' },
  ];
  const FIXED_STOCK_DAY = 40;
  const TRUCK_CAP = 4000, TRUCKS_PER_DAY = 6, HELI_CAP = 1000, HELI_PER_DAY = 2, DRONE_CAP = 40, DRONES = 4;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const DEPOTS = [
    { id: 'D1', name: 'Base Depot', x: 90, y: 560 },
    { id: 'D2', name: 'Forward Depot', x: 400, y: 470 },
  ];
  const PASSES = [
    { id: 'K', name: 'Kharu Pass', alt: 3900, x: 250, y: 520, thr: 110 },
    { id: 'S', name: 'Shila Pass', alt: 4650, x: 600, y: 270, thr: 120 },
    { id: 'R', name: 'Rong Pass', alt: 5150, x: 800, y: 190, thr: 120 },
    { id: 'M', name: 'Domo Pass', alt: 4350, x: 720, y: 390, thr: 120 },
    { id: 'W', name: 'Wari Pass', alt: 4800, x: 300, y: 330, thr: 120 },
  ];
  const POSTS = [
    { id: 'FP-01', name: 'Kestrel', x: 560, y: 380, alt: 4200, troops: 40, path: ['K', 'M'] },
    { id: 'FP-02', name: 'Ibex', x: 660, y: 310, alt: 4700, troops: 30, path: ['K', 'S'] },
    { id: 'FP-03', name: 'Lammergeier', x: 760, y: 120, alt: 5200, troops: 25, path: ['K', 'S', 'R'] },
    { id: 'FP-04', name: 'Snow Leopard', x: 860, y: 360, alt: 4900, troops: 35, path: ['K', 'M'] },
    { id: 'FP-05', name: 'Marmot', x: 760, y: 470, alt: 4400, troops: 45, path: ['K', 'M'] },
    { id: 'FP-06', name: 'Chough', x: 520, y: 190, alt: 5000, troops: 20, path: ['K', 'S'] },
    { id: 'FP-07', name: 'Yak', x: 920, y: 150, alt: 5400, troops: 30, path: ['K', 'S', 'R'] },
    { id: 'FP-08', name: 'Bharal', x: 320, y: 230, alt: 4500, troops: 40, path: ['K', 'W'] },
    { id: 'FP-09', name: 'Kiang', x: 170, y: 140, alt: 5000, troops: 25, path: ['K', 'W'] },
    { id: 'FP-10', name: 'Raven', x: 470, y: 320, alt: 4100, troops: 50, path: ['K'] },
  ];

  const dateOf = d => new Date(START + d * 86400000);
  const fmtDate = d => dateOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // Weather series: per day temperature at 4000 m, storm snowfall (cm at 4500 m).
  function makeWeather(seed) {
    const r = rng(seed * 7919 + 13);
    const days = [];
    for (let d = 0; d < SEASON_DAYS + HORIZON + 5; d++) {
      const season = Math.sin(Math.PI * Math.min(d, 180) / 180);
      const t4000 = 6 - 24 * season + (r() - 0.5) * 6;
      const pStorm = 0.02 + 0.2 * Math.pow(season, 1.5);
      const storm = r() < pStorm;
      const snow = storm ? 15 + r() * 35 : (r() < 0.2 ? r() * 4 : 0);
      days.push({ t4000: storm ? t4000 - 5 : t4000, snow });
    }
    return days;
  }
  const tempAt = (w, alt) => w.t4000 - (alt - 4000) / 150;
  const snowAt = (w, alt) => w.snow * Math.max(0.2, 1 + (alt - 4500) / 1500);

  function rates(post, T) {
    const cold = Math.max(0, -T);
    return {
      fuel: post.troops * (1.6 + 0.02 * cold),
      ration: post.troops * (1.4 + 0.01 * cold),
      kero: post.troops * (1.0 + 0.06 * cold),
    };
  }
  function capacityOf(post) {
    const r = rates(post, -25);
    return { fuel: Math.round(r.fuel * 240), ration: Math.round(r.ration * 240), kero: Math.round(r.kero * 240) };
  }

  function newState(seed) {
    const r = rng(seed);
    const weather = makeWeather(seed);
    const posts = POSTS.map(p => {
      const cap = capacityOf(p);
      const base = rates(p, 0);
      const days = 45 + Math.floor(r() * 40);
      const stock = {}; ITEMS.forEach(it => stock[it.id] = Math.min(cap[it.id], Math.round(base[it.id] * (days + r() * 15))));
      return { ...p, cap, stock, hist: [], inTransit: [] };
    });
    const passes = PASSES.map(p => ({ ...p, pack: 0, closed: false, closedSince: null }));
    return { seed, day: 0, weather, posts, passes, rand: rng(seed + 99), log: [], metrics: { stockoutDays: 0, emergency: 0, plannedAir: 0, trucks: 0, sensors: [] } };
  }

  const passById = (s, id) => s.passes.find(p => p.id === id);

  function stepPass(pass, w) {
    const T = tempAt(w, pass.alt);
    const clear = pass.closed && pass.alt < 4500 ? 7 : 0; // road crews clear lower passes
    pass.pack = Math.max(0, pass.pack * 0.99 + snowAt(w, pass.alt) - Math.max(0, T) * 3 - clear);
    if (!pass.closed && pass.pack > pass.thr) { pass.closed = true; }
    else if (pass.closed && pass.pack < pass.thr * 0.45) { pass.closed = false; }
  }

  // Predict closure for one pass from forecast weather.
  function passOutlook(s, pass) {
    if (pass.closed) return { closed: true, inDays: 0, length: closureLength(pass, s.day) };
    const sim = { ...pass };
    for (let k = 1; k <= HORIZON; k++) {
      const w = s.weather[s.day + k];
      stepPass(sim, w);
      if (sim.closed) return { closed: false, inDays: k, length: closureLength(pass, s.day + k), risk: Math.min(99, Math.round(100 - k * 4)) };
    }
    // Beyond horizon: climatology estimate
    const est = Math.max(HORIZON + 1, Math.round(40 + (5200 - pass.alt) / 20) - s.day);
    const risk = Math.max(5, Math.round((pass.pack / pass.thr) * 60));
    return { closed: false, inDays: est, length: closureLength(pass, s.day + est), risk, seasonal: true };
  }
  function closureLength(pass, startDay) {
    if (pass.alt >= 4600) return Math.max(25, 185 - startDay);
    return 40;
  }

  function routeOutlook(s, post) {
    let worst = null;
    for (const id of post.path) {
      const o = { pass: passById(s, id), ...passOutlook(s, passById(s, id)) };
      if (!worst || o.inDays < worst.inDays || (o.inDays === worst.inDays && o.length > worst.length)) worst = o;
    }
    const open = post.path.every(id => !passById(s, id).closed);
    return { ...worst, open };
  }

  const climT4000 = d => 6 - 24 * Math.sin(Math.PI * Math.min(Math.max(d, 0), 180) / 180) - 1;
  // Days a stock lasts: 14-day weather forecast first, then seasonal climatology.
  function lastDays(s, post, item, stock) {
    let left = stock;
    for (let k = 1; k <= 200; k++) {
      const d = s.day + k;
      const T = k <= HORIZON ? tempAt(s.weather[d], post.alt) : climT4000(d) - (post.alt - 4000) / 150;
      left -= rates(post, T)[item];
      if (left <= 0) return k - 1 + (left + rates(post, T)[item]) / rates(post, T)[item];
    }
    return 200;
  }
  function useOver(s, post, item, from, to) {
    let u = 0;
    for (let k = from + 1; k <= to; k++) {
      const d = s.day + k;
      const T = k <= HORIZON ? tempAt(s.weather[d], post.alt) : climT4000(d) - (post.alt - 4000) / 150;
      u += rates(post, T)[item];
    }
    return u;
  }
  function forecastRates(s, post) {
    // temperature-adjusted demand: average of forecast rates over horizon
    const acc = { fuel: 0, ration: 0, kero: 0 };
    for (let k = 1; k <= HORIZON; k++) {
      const rr = rates(post, tempAt(s.weather[s.day + k], post.alt));
      ITEMS.forEach(it => acc[it.id] += rr[it.id] / HORIZON);
    }
    // blend with seasonal deepening (it gets colder after the horizon)
    const deep = rates(post, tempAt({ t4000: 6 - 24 * Math.sin(Math.PI * Math.min(90, s.day + 30) / 180) }, post.alt));
    ITEMS.forEach(it => acc[it.id] = Math.max(acc[it.id], (acc[it.id] + deep[it.id]) / 2));
    return acc;
  }

  function assess(s, post) {
    const fr = forecastRates(s, post);
    const pending = {}; ITEMS.forEach(it => pending[it.id] = post.inTransit.filter(t => t.item === it.id).reduce((a, t) => a + t.qty, 0));
    const items = ITEMS.map(it => {
      const days = lastDays(s, post, it.id, post.stock[it.id] + pending[it.id]);
      return { ...it, stock: post.stock[it.id], cap: post.cap[it.id], rate: fr[it.id], days, pending: pending[it.id] };
    });
    const route = routeOutlook(s, post);
    const need = route.inDays + route.length;
    const minDays = Math.min(...items.map(i => i.days));
    const slack = minDays - need;
    let level;
    if (route.open && slack < 0 && route.inDays <= HORIZON) level = 'red';
    else if (!route.open && minDays < 20) level = 'red';
    else if (slack < 0) level = 'orange';
    else if (slack < 15) level = 'amber';
    else level = 'green';
    const short = items.reduce((a, b) => (a.days < b.days ? a : b));
    return { post, items, route, need, minDays, slack, level, short };
  }

  function travelDays(post) { return post.path.length; }

  // Planner: builds dispatch plans for posts that need action.
  function plan(s, a, freeUnits) {
    const { post, route } = a;
    const cover = route.open ? route.inDays + route.length + 10 : 30;
    const loads = [];
    a.items.forEach(i => {
      const want = Math.min(i.cap - i.stock - i.pending, Math.max(0, useOver(s, post, i.id, 0, cover) * 1.08 - i.stock - i.pending));
      if (want > 50) loads.push({ item: i.id, qty: Math.round(want / 10) * 10 });
    });
    if (!loads.length) return null;
    const total = loads.reduce((x, l) => x + l.qty, 0);
    let mode, units, cap;
    if (route.open && route.inDays >= travelDays(post)) { mode = 'truck'; cap = TRUCK_CAP; }
    else if (total <= DRONE_CAP * DRONES) { mode = 'drone'; cap = DRONE_CAP; }
    else { mode = 'air'; cap = HELI_CAP; }
    const pool = mode === 'truck' ? TRUCKS_PER_DAY : mode === 'air' ? HELI_PER_DAY : DRONES;
    units = Math.min(Math.ceil(total / cap), pool, freeUnits ? freeUnits[mode] : pool);
    if (units <= 0) return null;
    const carried = Math.min(total, units * cap);
    const scale = carried / total;
    const items = loads.map(l => ({ item: l.item, qty: Math.round(l.qty * scale / 10) * 10 }));
    return {
      id: post.id + '-' + s.day + '-' + mode,
      postId: post.id, mode, units, items, total: carried,
      via: post.path.map(id => passById(s, id).name), eta: mode === 'truck' ? travelDays(post) : 1,
      reason: reasonText(a), level: a.level, day: s.day,
    };
  }

  function reasonText(a) {
    const it = a.short, r = a.route;
    const d = Math.round(it.days);
    if (!r.open) return `${it.name} lasts ${d} days; ${r.pass.name} is already shut.`;
    return `${it.name} lasts ${d} days; ${r.pass.name} likely shuts in ${r.inDays} days for ~${r.length}. Needs ${r.inDays + r.length} days of cover.`;
  }

  // Guardrail validator
  function validate(s, p, used) {
    const post = s.posts.find(x => x.id === p.postId);
    const checks = [];
    const open = post.path.every(id => !passById(s, id).closed);
    const closedName = post.path.map(id => passById(s, id)).filter(x => x.closed).map(x => x.name).join(', ');
    if (p.mode === 'truck') checks.push({ ok: open, text: open ? 'Route open for trucks' : `Route blocked: ${closedName} is shut` });
    const cap = p.mode === 'truck' ? TRUCK_CAP : p.mode === 'air' ? HELI_CAP : DRONE_CAP;
    const okLoad = p.total <= p.units * cap;
    checks.push({ ok: okLoad, text: okLoad ? `Load ${fmtN(p.total)} within ${p.units} × ${fmtN(cap)}` : `Overload: ${fmtN(p.total)} > ${p.units} × ${fmtN(cap)}` });
    const pool = p.mode === 'truck' ? TRUCKS_PER_DAY : p.mode === 'air' ? HELI_PER_DAY : DRONES;
    const left = pool - ((used && used[p.mode]) || 0);
    checks.push({ ok: p.units <= left, text: p.units <= left ? `${p.units} of ${left} ${p.mode === 'truck' ? 'trucks' : p.mode === 'air' ? 'helicopter sorties' : 'drones'} free today` : `Only ${left} ${p.mode} available today` });
    const fits = p.items.every(l => post.stock[l.item] + l.qty <= post.cap[l.item] * 1.001);
    checks.push({ ok: fits, text: fits ? 'Fits post storage' : 'Exceeds post storage' });
    return { ok: checks.every(c => c.ok), checks };
  }

  function dispatch(s, p) {
    const post = s.posts.find(x => x.id === p.postId);
    p.items.forEach(l => post.inTransit.push({ item: l.item, qty: l.qty, arrive: s.day + p.eta, mode: p.mode }));
    if (p.mode === 'truck') s.metrics.trucks += p.units; else s.metrics.plannedAir += p.units;
  }

  // Advance one day. policy: 'rasad' | 'fixed' | 'manual'
  function step(s, policy) {
    const w = s.weather[s.day];
    s.passes.forEach(p => stepPass(p, w));
    (s.passHist = s.passHist || []).push(s.passes.map(p => p.closed));
    const used = { truck: 0, air: 0, drone: 0 };
    s.posts.forEach(post => {
      // arrivals
      post.inTransit = post.inTransit.filter(t => {
        if (t.arrive <= s.day) { post.stock[t.item] = Math.min(post.cap[t.item], post.stock[t.item] + t.qty); return false; }
        return true;
      });
      // consumption
      const T = tempAt(w, post.alt);
      const rr = rates(post, T);
      let out = false;
      ITEMS.forEach(it => {
        const use = rr[it.id] * (0.9 + s.rand() * 0.2);
        post.stock[it.id] = Math.max(0, post.stock[it.id] - use);
        if (post.stock[it.id] <= 0) out = true;
      });
      if (out) {
        s.metrics.stockoutDays++;
        // emergency airlift of the empty items
        ITEMS.forEach(it => { if (post.stock[it.id] <= 0) { post.inTransit.push({ item: it.id, qty: HELI_CAP, arrive: s.day + 1, mode: 'air' }); s.metrics.emergency++; } });
      }
      post.hist.push({ day: s.day, ...post.stock });
    });
    if (policy === 'fixed' && (s.day % 30 === 0 || s.day === FIXED_STOCK_DAY)) {
      s.posts.forEach(post => {
        const open = post.path.every(id => !passById(s, id).closed);
        if (!open) return;
        const scale = rates(post, -10);
        const target = s.day === FIXED_STOCK_DAY ? SEASON_DAYS - s.day + 10 : 40;
        let tot = 0;
        ITEMS.forEach(it => { const q = Math.min(post.cap[it.id], scale[it.id] * target) - post.stock[it.id] - post.inTransit.filter(t => t.item === it.id).reduce((a, t) => a + t.qty, 0); if (q > 0) { post.inTransit.push({ item: it.id, qty: Math.round(q), arrive: s.day + travelDays(post), mode: 'truck' }); tot += q; } });
        s.metrics.trucks += Math.ceil(tot / TRUCK_CAP);
      });
    }
    if (policy === 'rasad') {
      const list = s.posts.map(p => assess(s, p)).filter(a => a.level === 'red' || a.level === 'orange').sort((a, b) => a.slack - b.slack);
      list.forEach(a => {
        const free = { truck: TRUCKS_PER_DAY - used.truck, air: HELI_PER_DAY - used.air, drone: DRONES - used.drone };
        const p = plan(s, a, free);
        if (!p) return;
        if (p.mode !== 'truck' && a.minDays > 10) return; // air only when truly needed
        const v = validate(s, p, used);
        if (v.ok) { dispatch(s, p); used[p.mode] += p.units; }
      });
    }
    s.day++;
  }

  // Interactive demo: posts stocked unevenly by earlier convoys, then 30 days pass.
  const DEMO_DAYS = { 'FP-01': 150, 'FP-02': 95, 'FP-03': 70, 'FP-04': 160, 'FP-05': 140, 'FP-06': 190, 'FP-07': 62, 'FP-08': 120, 'FP-09': 185, 'FP-10': 100 };
  function demoState(seed) {
    const s = newState(seed);
    s.posts.forEach(p => { const r = rates(p, -12); ITEMS.forEach(it => p.stock[it.id] = Math.min(p.cap[it.id], Math.round(r[it.id] * DEMO_DAYS[p.id]))); });
    for (let i = 0; i < 30; i++) step(s, 'manual');
    s.metrics = { stockoutDays: 0, emergency: 0, plannedAir: 0, trucks: 0 };
    return s;
  }
  function runSeason(seed, policy) {
    const s = newState(seed);
    while (s.day < SEASON_DAYS) step(s, policy);
    const over = s.posts.reduce((a, p) => a + ITEMS.reduce((b, it) => b + p.stock[it.id] / p.cap[it.id], 0) / ITEMS.length, 0) / s.posts.length;
    return { state: s, metrics: { ...s.metrics, endFill: Math.round(over * 100) } };
  }

  const fmtN = n => Math.round(n).toLocaleString('en-IN');

  return { ITEMS, DEPOTS, PASSES, POSTS, SEASON_DAYS, HORIZON, TRUCK_CAP, TRUCKS_PER_DAY, HELI_CAP, HELI_PER_DAY, DRONE_CAP, DRONES,
    useOver, newState, demoState, step, assess, FIXED_STOCK_DAY, lastDays, rates, plan, validate, dispatch, runSeason, routeOutlook, fmtDate, fmtN, tempAt, passById };
})();
if (typeof module !== 'undefined') module.exports = RASAD;
