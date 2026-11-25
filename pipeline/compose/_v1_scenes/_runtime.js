// Nubu scene runtime: deterministic seek(t) pages. No wall clocks, no CSS animations/transitions.
// A scene page calls NB.define({ build(ctx), update(t, ctx) }). The capturer calls
//   await window.setup(payload)  then  await window.seek(tAbs)  for every frame.
(function () {
  const NB = (window.NB = {});

  // ---------- math ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  NB.clamp = clamp;
  NB.lerp = (a, b, p) => a + (b - a) * p;
  NB.p = (t, at, dur) => clamp((t - at) / dur);
  NB.ease = {
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inOutSine: (p) => (1 - Math.cos(Math.PI * p)) / 2,
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    // gentle back: overshoot capped (~3%)
    outBack: (p, s = 0.9) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  };
  NB.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  // keyframed value: keys [[t, v], ...] eased in-out between keys
  NB.keys = function (t, keys, ease = NB.ease.inOutCubic) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        const e = ease((t - t0) / (t1 - t0));
        if (Array.isArray(v0)) return v0.map((x, j) => x + (v1[j] - x) * e);
        return v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };

  // ---------- DOM ----------
  NB.el = function (tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  NB.css = (e, o) => { for (const k in o) e.style[k] = o[k]; return e; };

  // entrance: slide + fade, ease-out (overshoot ≤ 3% when back=true). Returns progress.
  NB.enter = function (el, t, at, o = {}) {
    const dur = o.dur ?? 0.5, dy = o.dy ?? 36, dx = o.dx ?? 0, s0 = o.scale ?? 1;
    const p = NB.p(t, at, dur);
    const e = o.back ? NB.ease.outBack(p, 0.7) : NB.ease.outCubic(p);
    const ex = o.exitAt != null ? NB.ease.inOutSine(NB.p(t, o.exitAt, o.exitDur ?? 0.35)) : 0;
    const sc = s0 + (1 - s0) * e;
    el.style.opacity = String(clamp(p * 2.2) * (1 - ex));
    el.style.transform = `translate(${dx * (1 - e)}px, ${dy * (1 - e) - (o.exitDy ?? 20) * ex}px) scale(${sc})` + (o.extra || '');
    el.style.visibility = p <= 0 || ex >= 1 ? 'hidden' : 'visible';
    return p;
  };

  // ---------- icons (drawn, viewBox 0..100) ----------
  const I = {};
  I.ticket = (c = '#a970ff') => `<path d="M10 28 Q10 22 16 22 H84 Q90 22 90 28 V40 A10 10 0 0 0 90 60 V72 Q90 78 84 78 H16 Q10 78 10 72 V60 A10 10 0 0 0 10 40Z" fill="${c}"/><path d="M66 26 V74" stroke="#fff" stroke-width="3" stroke-dasharray="5 5" opacity=".8"/><path d="M38 38 l4.5 9 10 1.4-7.2 7 1.7 10-9-4.7-9 4.7 1.7-10-7.2-7 10-1.4z" fill="#fff"/>`;
  I.idcard = (c = '#5b8def') => `<rect x="8" y="20" width="84" height="60" rx="9" fill="${c}"/><rect x="8" y="20" width="84" height="14" rx="9" fill="#fff" opacity=".25"/><circle cx="31" cy="50" r="9" fill="#fff"/><path d="M17 70 Q31 54 45 70Z" fill="#fff"/><rect x="52" y="45" width="30" height="6" rx="3" fill="#fff"/><rect x="52" y="58" width="22" height="6" rx="3" fill="#fff" opacity=".8"/>`;
  I.camera = (c = '#3b3355') => `<path d="M14 34 Q14 28 20 28 H34 L40 20 H60 L66 28 H80 Q86 28 86 34 V74 Q86 80 80 80 H20 Q14 80 14 74Z" fill="${c}"/><circle cx="50" cy="54" r="17" fill="#fff"/><circle cx="50" cy="54" r="11" fill="${c}"/><circle cx="46" cy="50" r="3.5" fill="#fff" opacity=".8"/><rect x="70" y="36" width="9" height="5" rx="2" fill="#fff" opacity=".7"/>`;
  I.phone = (c = '#3b3355') => `<rect x="28" y="10" width="44" height="80" rx="9" fill="${c}"/><rect x="33" y="19" width="34" height="58" rx="3" fill="#cdb8ff"/><circle cx="50" cy="83" r="3.2" fill="#fff"/><circle cx="58" cy="28" r="4" fill="${c}" opacity=".7"/>`;
  I.battery = (c = '#2fae66') => `<rect x="12" y="28" width="68" height="44" rx="8" fill="none" stroke="#3b3355" stroke-width="6"/><rect x="82" y="40" width="8" height="20" rx="3" fill="#3b3355"/><rect x="20" y="36" width="15" height="28" rx="3" fill="${c}"/><rect x="38.5" y="36" width="15" height="28" rx="3" fill="${c}"/><rect x="57" y="36" width="15" height="28" rx="3" fill="${c}"/>`;
  I.cash = (c = '#2fae66') => `<rect x="8" y="26" width="84" height="50" rx="7" fill="${c}"/><rect x="14" y="32" width="72" height="38" rx="4" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"/><circle cx="50" cy="51" r="13" fill="#fff"/><text x="50" y="58.5" text-anchor="middle" font-size="20" font-weight="700" fill="${c}" font-family="Leelawadee UI, Tahoma">฿</text>`;
  I.car = (c = '#e5484d') => `<path d="M14 62 L20 44 Q23 36 32 36 H68 Q77 36 80 44 L86 62 V74 Q86 78 82 78 H18 Q14 78 14 74Z" fill="${c}"/><path d="M26 47 Q28 42 33 42 H67 Q72 42 74 47 L76 54 H24Z" fill="#fff" opacity=".85"/><circle cx="30" cy="78" r="8" fill="#241a3a"/><circle cx="70" cy="78" r="8" fill="#241a3a"/><rect x="18" y="62" width="10" height="5" rx="2" fill="#ffe08a"/><rect x="72" y="62" width="10" height="5" rx="2" fill="#ffe08a"/>`;
  I.taxi = () => `<rect x="38" y="20" width="24" height="12" rx="3" fill="#ffd23f"/><text x="50" y="29.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="#22123b" font-family="Leelawadee UI, Tahoma">TAXI</text>` + I.car('#f2588a');
  I.moto = (c = '#ff8a3d') => `<circle cx="24" cy="70" r="12" fill="none" stroke="#241a3a" stroke-width="6"/><circle cx="78" cy="70" r="12" fill="none" stroke="#241a3a" stroke-width="6"/><path d="M24 70 L40 52 H62 L72 40 H80" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 54 H64 L60 66 H42Z" fill="${c}"/><path d="M62 52 L78 70" stroke="#241a3a" stroke-width="6" stroke-linecap="round"/><rect x="34" y="42" width="18" height="7" rx="3" fill="#241a3a"/><circle cx="50" cy="22" r="9" fill="#ffd23f"/><path d="M46 31 L42 46 H56 L54 31Z" fill="#ff8a3d"/>`;
  I.bus = (c = '#3d8bff') => `<rect x="14" y="16" width="72" height="62" rx="11" fill="${c}"/><rect x="21" y="25" width="58" height="26" rx="4" fill="#fff" opacity=".9"/><rect x="21" y="58" width="12" height="8" rx="3" fill="#ffe08a"/><rect x="67" y="58" width="12" height="8" rx="3" fill="#ffe08a"/><rect x="18" y="76" width="14" height="10" rx="3" fill="#241a3a"/><rect x="68" y="76" width="14" height="10" rx="3" fill="#241a3a"/><rect x="38" y="19" width="24" height="4" rx="2" fill="#fff" opacity=".6"/>`;
  I.train = (c = '#a970ff') => `<rect x="22" y="12" width="56" height="66" rx="14" fill="${c}"/><rect x="29" y="22" width="42" height="24" rx="5" fill="#fff" opacity=".92"/><circle cx="34" cy="60" r="5" fill="#ffe08a"/><circle cx="66" cy="60" r="5" fill="#ffe08a"/><path d="M30 78 L22 90 M70 78 L78 90" stroke="#241a3a" stroke-width="6" stroke-linecap="round"/><rect x="42" y="56" width="16" height="6" rx="3" fill="#fff" opacity=".6"/>`;
  I.pin = (c = '#a970ff') => `<path d="M50 92 C50 92 20 60 20 40 A30 30 0 0 1 80 40 C80 60 50 92 50 92Z" fill="${c}"/><circle cx="50" cy="40" r="12" fill="#fff"/>`;
  I.heart = (c = '#b57bff') => `<path d="M50 86 C20 64 8 48 8 32 A20 20 0 0 1 50 24 A20 20 0 0 1 92 32 C92 48 80 64 50 86Z" fill="${c}"/>`;
  I.check = (c = '#2fae66') => `<circle cx="50" cy="50" r="44" fill="${c}"/><path d="M28 51 L43 66 L73 35" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
  I.cross = (c = '#e5484d') => `<circle cx="50" cy="50" r="44" fill="${c}"/><path d="M33 33 L67 67 M67 33 L33 67" stroke="#fff" stroke-width="10" stroke-linecap="round"/>`;
  I.warn = (c = '#e5484d') => `<path d="M50 8 L94 86 Q96 92 90 92 H10 Q4 92 6 86Z" fill="${c}"/><rect x="45" y="34" width="10" height="32" rx="5" fill="#fff"/><circle cx="50" cy="77" r="6" fill="#fff"/>`;
  I.comment = (c = '#a970ff') => `<path d="M14 22 Q14 14 22 14 H78 Q86 14 86 22 V62 Q86 70 78 70 H42 L24 86 V70 H22 Q14 70 14 62Z" fill="${c}"/><circle cx="34" cy="42" r="5.5" fill="#fff"/><circle cx="50" cy="42" r="5.5" fill="#fff"/><circle cx="66" cy="42" r="5.5" fill="#fff"/>`;
  I.bell = (c = '#ffd23f') => `<path d="M50 12 Q30 12 28 38 V58 L18 72 H82 L72 58 V38 Q70 12 50 12Z" fill="${c}"/><circle cx="50" cy="80" r="8" fill="${c}"/>`;
  I.stadium = (c = '#a970ff') => `<ellipse cx="50" cy="56" rx="44" ry="22" fill="${c}"/><ellipse cx="50" cy="52" rx="34" ry="14" fill="#fff" opacity=".9"/><ellipse cx="50" cy="52" rx="20" ry="7" fill="#7ed6a0"/>`;
  I.clock = (c = '#ffffff', a1 = 0, a2 = 0) => `<circle cx="50" cy="50" r="44" fill="${c}"/><circle cx="50" cy="50" r="38" fill="none" stroke="#22123b" stroke-width="3" opacity=".15"/><line x1="50" y1="50" x2="${50 + 20 * Math.sin(a1)}" y2="${50 - 20 * Math.cos(a1)}" stroke="#22123b" stroke-width="7" stroke-linecap="round"/><line x1="50" y1="50" x2="${50 + 31 * Math.sin(a2)}" y2="${50 - 31 * Math.cos(a2)}" stroke="#a970ff" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="50" r="5" fill="#22123b"/>`;
  NB.icons = I;
  NB.icon = (name, size = 96, ...args) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${I[name](...args)}</svg>`;

  // ---------- ambient: sparkles ----------
  function makeSparkles(n, W, H, seed) {
    const r = NB.rng(seed);
    return Array.from({ length: n }, () => ({
      x: r() * W, y: r() * H, vy: 6 + r() * 16, amp: 6 + r() * 18, w: 0.2 + r() * 0.5,
      ph: r() * 6.28, tw: 0.6 + r() * 1.6, size: 1.2 + r() * 2.6, hue: r(),
    }));
  }
  function drawSparkles(ctx2d, list, t, W, H, strength) {
    ctx2d.clearRect(0, 0, W, H);
    for (const s of list) {
      const y = ((s.y - s.vy * t) % (H + 40) + H + 40) % (H + 40) - 20;
      const x = s.x + Math.sin(t * s.w + s.ph) * s.amp;
      const a = (0.25 + 0.75 * Math.pow(Math.abs(Math.sin(t * s.tw + s.ph)), 3)) * strength;
      const r = s.size;
      const g = ctx2d.createRadialGradient(x, y, 0, x, y, r * 5);
      const col = s.hue > 0.6 ? '255,240,255' : '200,170,255';
      g.addColorStop(0, `rgba(${col},${0.55 * a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx2d.fillStyle = g;
      ctx2d.beginPath(); ctx2d.arc(x, y, r * 5, 0, 6.283); ctx2d.fill();
      ctx2d.fillStyle = `rgba(255,255,255,${a})`;
      ctx2d.beginPath();
      ctx2d.moveTo(x, y - r * 2.4); ctx2d.lineTo(x + r * 0.55, y); ctx2d.lineTo(x, y + r * 2.4); ctx2d.lineTo(x - r * 0.55, y); ctx2d.closePath(); ctx2d.fill();
      ctx2d.beginPath();
      ctx2d.moveTo(x - r * 2.4, y); ctx2d.lineTo(x, y + r * 0.55); ctx2d.lineTo(x + r * 2.4, y); ctx2d.lineTo(x, y - r * 0.55); ctx2d.closePath(); ctx2d.fill();
    }
  }

  // ---------- stock slot ----------
  // slot = { kind:'video'|'image', frames:[urls] | image:url, credit } or null -> fallback(t)
  NB.stockSlot = function (parent, rect, stock, ctx) {
    const box = NB.el('div', 'stock', parent);
    NB.css(box, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px', borderRadius: (rect.r || 0) + 'px' });
    const api = { box, active: !!stock, fallback: null };
    if (stock) {
      const img = NB.el('img', 'stockimg', box);
      NB.el('div', 'tint', box); NB.el('div', 'tint2', box);
      if (stock.credit) {
        const cr = NB.el('div', 'credit', parent, stock.credit);
        NB.css(cr, { left: rect.x + 16 + 'px', top: rect.y + rect.h - 40 + 'px' });
        api.credit = cr;
      }
      api.img = img;
      let last = null;
      api.update = async (t) => {
        let src;
        if (stock.kind === 'video') {
          const i = Math.min(stock.frames.length - 1, Math.max(0, Math.floor((t - (stock.at ?? ctx.start)) * (stock.fps || 30))));
          src = stock.frames[i];
        } else {
          src = stock.image;
          const p = NB.p(t, ctx.start, ctx.end - ctx.start);
          img.style.transform = `scale(${1.04 + 0.04 * p})`;
        }
        if (src !== last) { img.src = src; last = src; try { await img.decode(); } catch (e) {} }
      };
    } else {
      api.update = async () => {};
    }
    return api;
  };

  // ---------- stacking: items that have exited free their slot ----------
  // items: [{e, t, until}] absolutely positioned inside a container; y = sum of heights of items still
  // visible when this one enters. Call once after fonts are ready (NB.layoutStack is idempotent).
  NB.layoutStack = function (items, gap = 18) {
    if (items._done) return; items._done = true;
    for (const it of items) { it.e.style.position = 'absolute'; it.e.style.left = '0px'; }
    for (let i = 0; i < items.length; i++) {
      let y = 0;
      for (let j = 0; j < i; j++) {
        const o = items[j];
        if (o.until == null || o.until > items[i].t + 0.01) y = Math.max(y, o.y + o.e.offsetHeight + gap);
      }
      items[i].y = y; items[i].e.style.top = y + 'px';
    }
  };

  // ---------- floating hearts (purple only) ----------
  NB.hearts = function (parent, o) {
    const r = NB.rng(o.seed || 3);
    const list = Array.from({ length: o.n || 14 }, () => {
      const size = (o.min || 28) + r() * ((o.max || 70) - (o.min || 28));
      const el = NB.el('div', 'abs', parent, NB.icon('heart', size, ['#b57bff', '#8f5bff', '#d6b4ff', '#7a3fe0'][Math.floor(r() * 4)]));
      return { el, size, x: o.x0 + r() * (o.x1 - o.x0), speed: (o.speed || 60) * (0.6 + r() * 0.8), ph: r() * 10, sway: 10 + r() * 30, w: 0.5 + r() * 0.8, rot: (r() - 0.5) * 30 };
    });
    return (t) => {
      const span = (o.y1 - o.y0) + 200;
      for (const h of list) {
        const travel = ((t - (o.at || 0)) * h.speed + h.ph * 97) % span;
        const y = o.y1 + 100 - travel;
        const x = h.x + Math.sin(t * h.w + h.ph) * h.sway;
        const fadeIn = NB.p(t, o.at || 0, 0.8);
        const lifeA = Math.min(1, travel / 160, (span - travel) / 220);
        h.el.style.opacity = String(Math.max(0, lifeA) * fadeIn * (o.alpha ?? 0.85));
        h.el.style.transform = `translate(${x - h.size / 2}px, ${y}px) rotate(${h.rot + Math.sin(t * h.w) * 8}deg)`;
      }
    };
  };

  // ---------- setup / seek ----------
  let def = null, ctx = null, sparkList = null, sparkCtx = null;
  NB.define = (d) => { def = d; };

  window.setup = async function (payload) {
    const { W, H } = payload;
    document.documentElement.style.width = W + 'px';
    const frame = NB.el('div', '', document.body); frame.id = 'frame';
    NB.css(frame, { width: W + 'px', height: H + 'px' });
    document.body.classList.add('layout-' + payload.layout);
    const world = NB.el('div', '', frame); world.id = 'world';
    const bg = NB.el('div', '', world); bg.id = 'bg';
    const fxc = NB.el('canvas', '', frame); fxc.id = 'fx'; fxc.width = W; fxc.height = H;
    const floor = NB.el('div', 'shadow-floor', frame);
    const ui = NB.el('div', '', frame); ui.id = 'ui';
    NB.el('div', 'vignette', frame);
    // keep the vignette under UI cards
    frame.insertBefore(frame.lastChild, fxc);
    ctx = Object.assign({}, payload, { frame, world, bg, ui, fx: fxc, floor, cfg: payload.scene });
    sparkList = makeSparkles(payload.scene.sparkles ?? 46, W, H, payload.scene.seed || 7);
    sparkCtx = fxc.getContext('2d');
    if (payload.stock && payload.scene.stockAs === 'background') {
      const sb = NB.stockSlot(world, { x: 0, y: 0, w: W, h: H }, payload.stock, ctx);
      world.insertBefore(sb.box, world.children[1]);
      const shade = NB.el('div', 'abs', sb.box);
      NB.css(shade, { inset: '0', background: payload.scene.stockShade || 'linear-gradient(180deg, rgba(18,6,42,0.35) 0%, rgba(18,6,42,0.55) 60%, rgba(18,6,42,0.92) 100%)' });
      ctx.stockBg = sb;
    }
    if (def.build) await def.build(ctx);
    await document.fonts.ready;
    const imgs = [...document.images].filter((i) => i.src);
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return true;
  };

  window.seek = async function (t) {
    const c = ctx;
    // slow push-in 2.5% over the scene
    const p = NB.p(t, c.start, Math.max(0.1, c.end - c.start));
    const push = c.scene.push ?? 0.025;
    const o = c.scene.pushOrigin || '42% 40%';
    c.world.style.transformOrigin = o;
    c.world.style.transform = `scale(${1 + push * NB.ease.inOutSine(p)})`;
    drawSparkles(sparkCtx, sparkList, t, c.W, c.H, c.scene.sparkleStrength ?? 0.8);
    // floor shadow under Nubu (same track as the ffmpeg overlay)
    if (c.nubu && c.scene.floor !== false) {
      const r = NubuTrack.rectAt(t - (c.timeOffset || 0), c.nubu.keys, c.nubu.modes);
      const w = r.w * 0.66, h = r.w * 0.09;
      NB.css(c.floor, { left: r.x + r.w * 0.5 - w / 2 + 'px', top: r.y + r.h * 0.975 - h / 2 + 'px', width: w + 'px', height: h + 'px', display: 'block' });
    } else c.floor.style.display = 'none';
    if (c.stockBg) {
      const u = c.scene.stockUntil;
      c.stockBg.box.style.opacity = String(u != null ? 1 - NB.ease.inOutSine(NB.p(t, u, 0.6)) : 1);
      await c.stockBg.update(t);
    }
    if (def.update) await def.update(t, c);
  };
})();
