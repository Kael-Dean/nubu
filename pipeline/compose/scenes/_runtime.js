// Nubu scene runtime: deterministic seek(t) pages. No wall clocks, no CSS animations/transitions.
// A scene page calls NB.define({ build(ctx), afterFonts?(ctx), update(t, ctx) }). The capturer calls
//   await window.setup(payload)  then  await window.seek(tAbs)  for every frame.
//
// Visual language (v2, "fan zine"): flat band colour + riso grain, hand-cut paper stickers (NB.sticker),
// ink line icons with one spot fill (NB.icon), a highlighter swipe for the key word (NB.hl / NB.swipe),
// marker ticks that draw themselves (NB.draw). Motion: stickers are placed, not bounced: short
// exponential ease-out from a slightly lifted, slightly turned position. No overshoot anywhere.
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
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutSine: (p) => (1 - Math.cos(Math.PI * p)) / 2,
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    // kept for old configs: now an exponential ease-out, no overshoot
    outBack: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
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
  NB.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // entrance: placed like a sticker. Starts a touch lifted/turned, settles with exponential ease-out.
  // o: {dur, dx, dy, scale, drot, exitAt, exitDur, exitDy, extra}. Element rest rotation = el._rot (deg).
  NB.enter = function (el, t, at, o = {}) {
    const dur = o.dur ?? 0.42, dy = o.dy ?? 22, dx = o.dx ?? 0, s0 = o.scale ?? 1.04, dr = o.drot ?? 1.6;
    const p = NB.p(t, at, dur);
    const e = NB.ease.outExpo(p);
    const ex = o.exitAt != null ? NB.ease.inOutSine(NB.p(t, o.exitAt, o.exitDur ?? 0.3)) : 0;
    const sc = s0 + (1 - s0) * e;
    const rot = (el._rot || 0) + dr * (1 - e);
    el.style.opacity = String(clamp(p * 3.2) * (1 - ex));
    el.style.transform = `translate(${dx * (1 - e)}px, ${dy * (1 - e) - (o.exitDy ?? 14) * ex}px) rotate(${rot}deg) scale(${sc})` + (o.extra || '');
    el.style.visibility = p <= 0 || ex >= 1 ? 'hidden' : 'visible';
    return p;
  };

  // ---------- hand-cut sticker shapes ----------
  // Rounded rectangle with jittered corner radii and slightly wavy straight edges (scissors, not a vector tool).
  // o.notch: x position of a ticket perforation (half-round notches top and bottom + dashed rule).
  function cutPath(w, h, o, r) {
    const R0 = o.r ?? 20, wob = o.wob ?? 1.8, step = o.step ?? 64;
    const rad = () => R0 * (0.65 + 0.7 * r());
    const c = [rad(), rad(), rad(), rad()]; // tl tr br bl
    const j = () => (r() - 0.5) * 2 * wob;
    const pts = [];
    const edge = (x0, y0, x1, y1, nx, ny, notchAt) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / step));
      for (let i = 1; i < n; i++) {
        const q = i / n, x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q;
        if (notchAt != null && Math.abs(x - notchAt) < 30) continue;
        pts.push(['L', x + nx * j(), y + ny * j()]);
      }
    };
    const N = o.notch, nr = 15;
    let d = `M${c[0]} ${j()}`;
    // top edge (with notch)
    pts.length = 0;
    if (N != null) {
      edge(c[0], 0, N - nr, 0, 0, 1, null);
      d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
      d += `L${N - nr} 0A${nr} ${nr} 0 0 0 ${N + nr} 0`;
      pts.length = 0; edge(N + nr, 0, w - c[1], 0, 0, 1, null);
    } else edge(c[0], 0, w - c[1], 0, 0, 1, null);
    d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
    d += `L${w - c[1]} ${j()}Q${w + j()} ${j()} ${w + j()} ${c[1]}`;
    pts.length = 0; edge(w, c[1], w, h - c[2], 1, 0); d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
    d += `L${w + j()} ${h - c[2]}Q${w + j()} ${h + j()} ${w - c[2]} ${h + j()}`;
    pts.length = 0;
    if (N != null) {
      edge(w - c[2], h, N + nr, h, 0, 1, null);
      d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
      d += `L${N + nr} ${h}A${nr} ${nr} 0 0 0 ${N - nr} ${h}`;
      pts.length = 0; edge(N - nr, h, c[3], h, 0, 1, null);
    } else edge(w - c[2], h, c[3], h, 0, 1, null);
    d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
    d += `L${c[3]} ${h + j()}Q${j()} ${h + j()} ${j()} ${h - c[3]}`;
    pts.length = 0; edge(0, h - c[3], 0, c[0], 1, 0); d += pts.map((p) => `${p[0]}${p[1].toFixed(1)} ${p[2].toFixed(1)}`).join('');
    d += `L${j()} ${c[0]}Q${j()} ${j()} ${c[0]} ${j()}Z`;
    return d;
  }
  const FILL = { paper: 'var(--paper)', accent: 'var(--accent)', ink: 'var(--ink)', theme: 'var(--th-main)', soft: 'var(--th-soft)' };
  // Draw the paper shape behind el's content. Call after fonts are ready (sizes are final): use afterFonts().
  // o: {seed, fill:'paper'|'accent'|'ink'|'theme'|'soft', rot (deg, default seeded ±1.3), r, wob, notch, bleed}
  NB.sticker = function (el, o = {}) {
    const r = NB.rng((o.seed || 1) * 7919 + 13);
    const w = el.offsetWidth, h = el.offsetHeight, b = o.bleed ?? 0;
    const old = el.querySelector(':scope > svg.cut'); if (old) old.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cut');
    svg.setAttribute('width', w + 2 * b); svg.setAttribute('height', h + 2 * b);
    svg.style.left = -b + 'px'; svg.style.top = -b + 'px';
    let inner = `<path d="${cutPath(w + 2 * b, h + 2 * b, o, r)}" style="fill:${FILL[o.fill || 'paper'] || o.fill}"/>`;
    if (o.notch != null) inner += `<path d="M${o.notch + b} ${18 + b} V${h + b - 18}" style="stroke:var(--paper-2);stroke-width:4;stroke-dasharray:2 11;stroke-linecap:round;fill:none"/>`;
    if (o.inkEdge) inner += `<path d="${cutPath(w + 2 * b, h + 2 * b, o, NB.rng((o.seed || 1) * 7919 + 13))}" style="fill:none;stroke:var(--ink);stroke-width:4"/>`;
    svg.innerHTML = inner;
    el.insertBefore(svg, el.firstChild);
    el._rot = o.rot != null ? o.rot : (r() - 0.5) * 2.6;
    return el;
  };

  // ---------- highlighter ----------
  // NB.hl('word') → inline span with a marker swipe behind it; NB.swipe(container, t, at, dur) wipes it on.
  NB.hl = (html, seed = 1) => {
    const r = NB.rng(seed * 31 + 7), a = () => (r() * 3).toFixed(1);
    return `<span class="hlw"><span class="mark"><svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M1 ${3 + +a()} Q25 ${1 + +a()} 50 ${2 + +a()} T99 ${2 + +a()} L100 ${15 + +a()} Q75 ${18 + +a()} 50 ${16 + +a()} T0 ${17 + +a()} Z" style="fill:var(--accent)"/></svg></span>${html}</span>`;
  };
  // multi-line variant: inline marker band per line fragment
  NB.hlInline = (html) => `<span class="hli">${html}</span>`;
  NB.swipe = function (root, t, at, dur = 0.38) {
    const e = NB.ease.outCubic(NB.p(t, at, dur));
    for (const m of root.querySelectorAll('.hlw > .mark')) m.style.clipPath = `inset(-20% ${(1 - e) * 100}% -20% 0)`;
    for (const m of root.querySelectorAll('.hli')) m.style.backgroundSize = `${e * 100}% 100%`;
  };
  // marker strokes that draw themselves: paths with class "draw" and pathLength="1"
  NB.draw = function (root, t, at, dur = 0.3) {
    const list = root.querySelectorAll('.draw');
    const per = dur / Math.max(1, list.length);
    list.forEach((pth, i) => {
      const e = NB.ease.outCubic(NB.p(t, at + i * per, per));
      pth.style.strokeDasharray = '1 1';
      pth.style.strokeDashoffset = String(1 - e);
      pth.style.opacity = e > 0 ? '1' : '0';
    });
  };

  // ---------- icons: one drawing style (ink line 6.5/100, round joins, one spot fill) ----------
  const I = {};
  const carBody = (fc) => `<path class="${fc}" d="M13 66 L19 47 Q22 39 31 39 H69 Q78 39 81 47 L87 66 V76 H13Z"/><path class="k" d="M13 66 L19 47 Q22 39 31 39 H69 Q78 39 81 47 L87 66 V76 H13Z"/><path class="kt" d="M25 54 L29 46 H71 L75 54Z"/><path class="k" d="M22 76 V84 M78 76 V84"/><circle class="fi" cx="25" cy="65" r="3.6"/><circle class="fi" cx="75" cy="65" r="3.6"/>`;
  I.ticket = () => `<path class="f" d="M10 30 H90 V43 A8 8 0 0 0 90 59 V72 H10 V59 A8 8 0 0 0 10 43Z"/><path class="k" d="M10 30 H90 V43 A8 8 0 0 0 90 59 V72 H10 V59 A8 8 0 0 0 10 43Z"/><path class="kt" d="M67 35 V67" style="stroke-dasharray:3 8"/><path class="fi" d="M38 63 C29 57 25 52 25 47 A6.2 6.2 0 0 1 38 44 A6.2 6.2 0 0 1 51 47 C51 52 47 57 38 63Z"/>`;
  I.idcard = () => `<rect class="f" x="9" y="23" width="82" height="56" rx="8"/><rect class="k" x="9" y="23" width="82" height="56" rx="8"/><circle class="k" cx="32" cy="46" r="7.5"/><path class="k" d="M20 68 Q32 55 44 68"/><path class="k" d="M56 43 H79 M56 57 H72"/>`;
  I.camera = () => `<path class="f" d="M11 37 Q11 30 18 30 H31 L37 21 H63 L69 30 H82 Q89 30 89 37 V72 Q89 79 82 79 H18 Q11 79 11 72Z"/><path class="k" d="M11 37 Q11 30 18 30 H31 L37 21 H63 L69 30 H82 Q89 30 89 37 V72 Q89 79 82 79 H18 Q11 79 11 72Z"/><circle class="fp" cx="50" cy="54" r="15"/><circle class="k" cx="50" cy="54" r="15"/><circle class="fa" cx="50" cy="54" r="7"/><path class="kt" d="M75 40 H80"/>`;
  I.phone = () => `<rect class="f" x="29" y="9" width="42" height="82" rx="9"/><rect class="k" x="29" y="9" width="42" height="82" rx="9"/><rect class="fp" x="35" y="20" width="30" height="54" rx="3"/><path class="kt" d="M44 15 H56"/><circle class="fi" cx="50" cy="82" r="3.4"/><circle class="k" cx="50" cy="44" r="8" style="stroke-width:4.5"/><circle class="fa" cx="50" cy="44" r="4"/>`;
  I.battery = () => `<rect class="fa" x="17" y="37" width="58" height="26" rx="3"/><rect class="k" x="10" y="30" width="72" height="40" rx="8"/><path class="k" d="M89 43 V57"/><path class="fi" d="M51 38 L39 53 H48 L44 63 L57 47 H48 L53 38Z"/>`;
  I.cash = () => `<rect class="f" x="8" y="27" width="84" height="48" rx="6"/><rect class="k" x="8" y="27" width="84" height="48" rx="6"/><circle class="fp" cx="50" cy="51" r="14"/><circle class="kt" cx="50" cy="51" r="14"/><path class="kt" d="M50 40 V62 M45 45 H52 A3.2 3.2 0 0 1 52 51 H45 Z M45 51 H53 A3.4 3.4 0 0 1 53 57.6 H45 Z"/><path class="kt" d="M17 36 v5 M83 61 v5"/>`;
  I.car = () => carBody('f');
  I.taxi = () => `<rect class="fp" x="39" y="26" width="22" height="11" rx="3"/><rect class="kt" x="39" y="26" width="22" height="11" rx="3"/>` + carBody('fa');
  I.moto = () => `<circle class="k" cx="23" cy="70" r="12"/><circle class="k" cx="77" cy="70" r="12"/><path class="fa" d="M36 55 H63 L58 67 H42Z"/><path class="k" d="M23 70 L38 53 H63 L71 40 H80 M63 53 L77 70 M36 55 H63 L58 67 H42Z"/><circle class="f" cx="49" cy="25" r="9"/><circle class="k" cx="49" cy="25" r="9"/>`;
  I.bus = () => `<rect class="f" x="15" y="14" width="70" height="64" rx="11"/><rect class="k" x="15" y="14" width="70" height="64" rx="11"/><rect class="fp" x="22" y="24" width="56" height="26" rx="4"/><rect class="kt" x="22" y="24" width="56" height="26" rx="4"/><circle class="fa" cx="28" cy="63" r="4.5"/><circle class="fa" cx="72" cy="63" r="4.5"/><path class="k" d="M24 78 V87 M76 78 V87"/>`;
  I.train = () => `<rect class="f" x="22" y="10" width="56" height="68" rx="15"/><rect class="k" x="22" y="10" width="56" height="68" rx="15"/><rect class="fp" x="30" y="21" width="40" height="23" rx="5"/><rect class="kt" x="30" y="21" width="40" height="23" rx="5"/><circle class="fa" cx="36" cy="61" r="4.5"/><circle class="fa" cx="64" cy="61" r="4.5"/><path class="k" d="M31 78 L22 91 M69 78 L78 91"/>`;
  I.pin = () => `<path class="fa" d="M50 93 C50 93 20 61 20 40 A30 30 0 0 1 80 40 C80 61 50 93 50 93Z"/><path class="k" d="M50 93 C50 93 20 61 20 40 A30 30 0 0 1 80 40 C80 61 50 93 50 93Z"/><circle class="fp" cx="50" cy="40" r="11"/><circle class="kt" cx="50" cy="40" r="11"/>`;
  I.heart = () => `<path class="f" d="M50 86 C21 66 9 50 9 34 A20 20 0 0 1 50 25 A20 20 0 0 1 91 34 C91 50 79 66 50 86Z"/><path class="k" d="M50 86 C21 66 9 50 9 34 A20 20 0 0 1 50 25 A20 20 0 0 1 91 34 C91 50 79 66 50 86Z"/>`;
  // marker marks: draw themselves via NB.draw
  I.tick = () => `<path class="k draw" pathLength="1" d="M16 55 L39 77 L86 20" style="stroke-width:12"/>`;
  I.check = () => `<path class="fa" d="M50 7 C78 5 95 24 93 50 C91 78 72 94 47 93 C20 92 6 73 7 48 C8 24 25 9 50 7Z"/>` + I.tick();
  I.cross = () => `<path class="k draw" pathLength="1" d="M20 18 C40 40 62 62 82 84" style="stroke-width:12"/><path class="k draw" pathLength="1" d="M83 17 C62 39 40 62 18 85" style="stroke-width:12"/>`;
  I.warn = () => `<path class="fa" d="M50 10 L92 84 H8Z" style="stroke:var(--accent);stroke-width:10;stroke-linejoin:round"/><path class="k" d="M50 10 L92 84 H8Z"/><path class="k" d="M50 36 V60" style="stroke-width:8"/><circle class="fi" cx="50" cy="72" r="5"/>`;
  I.comment = () => `<path class="f" d="M13 22 Q13 13 22 13 H78 Q87 13 87 22 V60 Q87 69 78 69 H43 L25 85 V69 H22 Q13 69 13 60Z"/><path class="k" d="M13 22 Q13 13 22 13 H78 Q87 13 87 22 V60 Q87 69 78 69 H43 L25 85 V69 H22 Q13 69 13 60Z"/><circle class="fi" cx="34" cy="41" r="5"/><circle class="fi" cx="50" cy="41" r="5"/><circle class="fi" cx="66" cy="41" r="5"/>`;
  I.bell = () => `<path class="fa" d="M50 13 Q29 13 28 39 V57 L17 72 H83 L72 57 V39 Q71 13 50 13Z"/><path class="k" d="M50 13 Q29 13 28 39 V57 L17 72 H83 L72 57 V39 Q71 13 50 13Z"/><path class="k" d="M41 81 Q50 90 59 81"/><path class="k" d="M50 6 V13"/>`;
  I.stadium = () => `<ellipse class="f" cx="50" cy="55" rx="43" ry="25"/><ellipse class="k" cx="50" cy="55" rx="43" ry="25"/><ellipse class="kt" cx="50" cy="55" rx="27" ry="13"/><path class="kt" d="M50 42 V68"/>`;
  I.clock = (a1 = 0, a2 = 0) => {
    const h = (a, l) => `${50 + l * Math.sin(a)} ${50 - l * Math.cos(a)}`;
    let ticks = ''; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ticks += `M${50 + 33 * Math.sin(a)} ${50 - 33 * Math.cos(a)} L${50 + 37 * Math.sin(a)} ${50 - 37 * Math.cos(a)} `; }
    return `<circle class="fa" cx="50" cy="50" r="43"/><circle class="k" cx="50" cy="50" r="43"/><path class="kt" d="${ticks}"/><path class="k" d="M50 50 L${h(a1, 19)}" style="stroke-width:8"/><path class="k" d="M50 50 L${h(a2, 29)}"/><circle class="fi" cx="50" cy="50" r="5.5"/><path class="k" d="M42 4 H58 M50 4 V7"/>`;
  };
  // EP02 additions (same ink-line style)
  I.mask = () => `<path class="fp" d="M18 38 Q50 28 82 38 L84 66 Q50 82 16 66Z"/><path class="k" d="M18 38 Q50 28 82 38 L84 66 Q50 82 16 66Z"/><path class="kt" d="M18 48 Q50 42 82 48 M17 58 Q50 54 83 58"/><path class="kt" d="M18 40 Q6 40 6 52 Q6 62 17 63 M82 40 Q94 40 94 52 Q94 62 83 63"/>`;
  I.laptop = () => `<rect class="f" x="18" y="20" width="64" height="44" rx="5"/><rect class="k" x="18" y="20" width="64" height="44" rx="5"/><rect class="fp" x="25" y="27" width="50" height="30" rx="2"/><path class="k" d="M8 74 H92 L86 82 H14Z"/><circle class="fa" cx="50" cy="42" r="6"/>`;
  I.chip = () => `<rect class="fa" x="26" y="26" width="48" height="48" rx="7"/><rect class="k" x="26" y="26" width="48" height="48" rx="7"/><path class="kt" d="M38 14 V26 M50 14 V26 M62 14 V26 M38 74 V86 M50 74 V86 M62 74 V86 M14 38 H26 M14 50 H26 M14 62 H26 M74 38 H86 M74 50 H86 M74 62 H86"/><path class="k" d="M41 60 L50 38 L59 60 M44 53 H56" style="stroke-width:5"/>`;
  I.music = () => `<path class="k" d="M38 70 V22 L80 12 V60"/><ellipse class="fa" cx="29" cy="72" rx="12" ry="9"/><ellipse class="k" cx="29" cy="72" rx="12" ry="9"/><ellipse class="fa" cx="71" cy="62" rx="12" ry="9"/><ellipse class="k" cx="71" cy="62" rx="12" ry="9"/><path class="k" d="M38 34 L80 24"/>`;
  I.globe = () => `<circle class="f" cx="50" cy="50" r="38"/><circle class="k" cx="50" cy="50" r="38"/><path class="kt" d="M12 50 H88 M50 12 Q30 50 50 88 M50 12 Q70 50 50 88 M20 30 Q50 38 80 30 M20 70 Q50 62 80 70"/>`;
  I.hourglass = () => `<path class="fp" d="M28 14 H72 Q72 40 50 50 Q72 60 72 86 H28 Q28 60 50 50 Q28 40 28 14Z"/><path class="fa" d="M36 78 Q50 62 64 78 V82 H36Z"/><path class="fa" d="M38 28 H62 Q58 40 50 44 Q42 40 38 28Z"/><path class="k" d="M28 14 H72 Q72 40 50 50 Q72 60 72 86 H28 Q28 60 50 50 Q28 40 28 14Z"/><path class="k" d="M20 12 H80 M20 88 H80"/>`;
  I.cap = () => `<path class="f" d="M50 20 L92 38 L50 56 L8 38Z"/><path class="k" d="M50 20 L92 38 L50 56 L8 38Z"/><path class="k" d="M26 47 V66 Q50 80 74 66 V47"/><path class="kt" d="M86 41 V64"/><circle class="fa" cx="86" cy="68" r="6"/>`;
  I.briefcase = () => `<rect class="f" x="12" y="32" width="76" height="50" rx="7"/><rect class="k" x="12" y="32" width="76" height="50" rx="7"/><path class="k" d="M37 32 V24 Q37 18 43 18 H57 Q63 18 63 24 V32"/><path class="kt" d="M12 52 H88"/><rect class="fa" x="43" y="46" width="14" height="12" rx="3"/>`;
  I.house = () => `<path class="f" d="M16 46 L50 18 L84 46 V84 H16Z"/><path class="k" d="M10 50 L50 16 L90 50 M18 44 V84 H82 V44"/><rect class="fa" x="40" y="58" width="20" height="26" rx="3"/><rect class="kt" x="40" y="58" width="20" height="26" rx="3"/>`;
  I.family = () => `<circle class="f" cx="32" cy="30" r="12"/><circle class="k" cx="32" cy="30" r="12"/><circle class="f" cx="68" cy="30" r="12"/><circle class="k" cx="68" cy="30" r="12"/><path class="k" d="M14 84 V64 Q14 48 32 48 Q50 48 50 64 V84 M50 84 V64 Q50 48 68 48 Q86 48 86 64 V84"/><circle class="fa" cx="50" cy="62" r="9"/><circle class="k" cx="50" cy="62" r="9"/>`;
  I.calendar = () => `<rect class="fp" x="12" y="20" width="76" height="66" rx="8"/><rect class="k" x="12" y="20" width="76" height="66" rx="8"/><path class="k" d="M12 38 H88 M32 12 V26 M68 12 V26"/><circle class="fa" cx="66" cy="64" r="9"/>`;
  I.glowstick = () => `<rect class="fa" x="38" y="8" width="24" height="60" rx="12" style="fill:var(--th-soft)"/><rect class="k" x="38" y="8" width="24" height="60" rx="12"/><rect class="fi" x="36" y="66" width="28" height="26" rx="6"/><path class="kt" d="M22 20 L30 26 M78 20 L70 26 M18 40 H28 M82 40 H72"/>`;
  NB.icons = I;
  // NB.icon(name, size, ...args): args after size are icon parameters (old colour arguments are ignored)
  NB.icon = (name, size = 96, ...args) => {
    const a = name === 'clock' ? args.filter((x) => typeof x === 'number') : [];
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 100 100">${I[name](...a)}</svg>`;
  };

  // ---------- stock slot ----------
  // slot = { kind:'video'|'image', frames:[urls] | image:url, credit } or null -> fallback(t)
  // rect.frame = true → the footage is mounted like a print: paper border, two strips of tape, slight turn
  // (api.box is then the mount; the picture keeps near-natural colour, graded in ffmpeg, no purple wash).
  NB.stockSlot = function (parent, rect, stock, ctx) {
    let mount = null, box;
    if (rect.frame) {
      mount = NB.el('div', 'mount', parent);
      NB.css(mount, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
      mount._rot = rect.rot ?? -1;
      box = NB.el('div', 'stock', mount);
      NB.css(box, { left: '14px', top: '14px', width: rect.w - 28 + 'px', height: rect.h - 28 + 'px' });
      const tp = rect.tape ?? [[-4, -18, -8], [rect.w - 150, -16, 6]];
      for (const [x, y, a] of tp) { const e = NB.el('div', 'tape', mount); NB.css(e, { left: x + 'px', top: y + 'px', transform: 'rotate(' + a + 'deg)' }); }
    } else {
      box = NB.el('div', 'stock', parent);
      NB.css(box, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px', borderRadius: (rect.r || 0) + 'px' });
    }
    const api = { box: mount || box, pic: box, active: !!stock, fallback: null };
    if (stock) {
      const img = NB.el('img', 'stockimg', box);
      if (!rect.frame) { NB.el('div', 'tint', box); NB.el('div', 'tint2', box); }
      if (stock.credit) {
        const cr = NB.el('div', 'credit', mount || parent, stock.credit);
        if (mount) NB.css(cr, { right: '30px', top: '30px' });
        else NB.css(cr, { left: rect.x + 16 + 'px', top: rect.y + rect.h - 48 + 'px' });
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
          img.style.transform = 'scale(' + (1.02 + 0.05 * NB.ease.inOutSine(p)) + ')';
        }
        if (src !== last) { img.src = src; last = src; try { await img.decode(); } catch (e) {} }
      };
    } else {
      api.update = async () => {};
    }
    return api;
  };

  // ---------- theme layer: the episode's zine page (grid paper, halftone, hand-drawn stage frame, doodles) ----------
  // deco (compose.json "themeDeco"): { doodles:[{kind,x,y,size,rot,depth,alpha}], stamp:'7', frameInset, frameTape }
  const DOODLE = {
    heart: () => '<path d="M50 84 C22 64 10 49 10 34 A19 19 0 0 1 50 26 A19 19 0 0 1 90 34 C90 49 78 64 50 84Z" style="fill:var(--th-main);stroke:var(--paper);stroke-width:5;stroke-linejoin:round"/>',
    heartline: () => '<path d="M50 84 C22 64 10 49 10 34 A19 19 0 0 1 50 26 A19 19 0 0 1 90 34 C90 49 78 64 50 84Z" style="fill:none;stroke:var(--th-soft);stroke-width:6;stroke-linejoin:round"/>',
    star: () => '<path d="M50 6 C54 36 64 46 94 50 C64 54 54 64 50 94 C46 64 36 54 6 50 C36 46 46 36 50 6Z" style="fill:var(--accent)"/>',
    starline: () => '<path d="M50 6 C54 36 64 46 94 50 C64 54 54 64 50 94 C46 64 36 54 6 50 C36 46 46 36 50 6Z" style="fill:none;stroke:var(--th-soft);stroke-width:5;stroke-linejoin:round"/>',
    ticket: () => '<path d="M8 28 H92 V42 A8 8 0 0 0 92 58 V72 H8 V58 A8 8 0 0 0 8 42Z" style="fill:var(--paper)"/><path d="M68 32 V68" style="stroke:var(--th-soft);stroke-width:4;stroke-dasharray:3 6"/><path d="M38 61 C30 56 26 52 26 47 A5.5 5.5 0 0 1 38 44 A5.5 5.5 0 0 1 50 47 C50 52 46 56 38 61Z" style="fill:var(--th-main)"/>',
    stamp: (d) => '<circle cx="50" cy="50" r="42" style="fill:none;stroke:var(--th-soft);stroke-width:5"/><circle cx="50" cy="50" r="33" style="fill:none;stroke:var(--th-soft);stroke-width:2.5"/><text x="50" y="66" text-anchor="middle" style="font-family:var(--font-display);font-weight:var(--display-weight);font-size:46px;fill:var(--th-soft)">' + (d.stamp || '7') + '</text>',
    squiggle: () => '<path d="M6 60 C18 30 30 30 38 56 S58 82 66 52 S86 28 94 44" style="fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round"/>',
    dots: () => [[20, 30], [50, 22], [80, 34], [34, 60], [66, 62], [50, 86]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="6" style="fill:var(--th-soft)"/>').join(''),
  };
  NB.doodles = DOODLE;
  NB.themeLayer = function (c) {
    const d = c.deco || {}, W = c.W, H = c.H;
    const root = NB.el('div', 'theme', c.world);
    c.world.insertBefore(root, c.bg.nextSibling);
    const grid = NB.el('div', 'th-grid', root);
    NB.el('div', 'th-tone th-tone-a', root); NB.el('div', 'th-tone th-tone-b', root);
    const inset = d.frameInset ?? 30, r = NB.rng(77);
    const j = () => +((r() - 0.5) * 5).toFixed(1);
    const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset, R = 46;
    const fd = 'M' + (x0 + R) + ' ' + (y0 + j()) + ' L' + W / 2 + ' ' + (y0 + j()) + ' L' + (x1 - R) + ' ' + (y0 + j()) + ' Q' + x1 + ' ' + y0 + ' ' + (x1 + j()) + ' ' + (y0 + R) +
      ' L' + (x1 + j()) + ' ' + H / 2 + ' L' + (x1 + j()) + ' ' + (y1 - R) + ' Q' + x1 + ' ' + y1 + ' ' + (x1 - R) + ' ' + (y1 + j()) + ' L' + W / 2 + ' ' + (y1 + j()) +
      ' L' + (x0 + R) + ' ' + (y1 + j()) + ' Q' + x0 + ' ' + y1 + ' ' + (x0 + j()) + ' ' + (y1 - R) + ' L' + (x0 + j()) + ' ' + H / 2 + ' L' + (x0 + j()) + ' ' + (y0 + R) + ' Q' + x0 + ' ' + y0 + ' ' + (x0 + R) + ' ' + y0 + 'Z';
    const fr = NB.el('div', 'abs', root, '<svg width="' + W + '" height="' + H + '"><path d="' + fd + '" style="fill:none;stroke:var(--th-soft);stroke-width:4;opacity:.42;stroke-linejoin:round"/><path d="' + fd + '" transform="translate(10 10)" style="fill:none;stroke:var(--th-soft);stroke-width:3;opacity:.2;stroke-dasharray:2 12;stroke-linecap:round"/></svg>');
    NB.css(fr, { left: 0, top: 0 });
    for (const [x, y, a] of d.frameTape || [[inset + 40, inset - 16, -9], [W - inset - 190, H - inset - 22, -6]]) { const e = NB.el('div', 'tape', root); NB.css(e, { left: x + 'px', top: y + 'px', transform: 'rotate(' + a + 'deg)', opacity: 0.8 }); }
    const ds = (d.doodles || []).map((o, i) => {
      const s = o.size || 70;
      const e = NB.el('div', 'abs th-doodle', root, '<svg width="' + s + '" height="' + s + '" viewBox="0 0 100 100" style="overflow:visible">' + (DOODLE[o.kind] || DOODLE.star)(d) + '</svg>');
      NB.css(e, { left: o.x - s / 2 + 'px', top: o.y - s / 2 + 'px', opacity: o.alpha ?? 0.6 });
      return { e, o, ph: i * 1.7 };
    });
    return (t) => {
      grid.style.transform = 'translate(' + ((-t * 3) % 64) + 'px, ' + ((-t * 5) % 64) + 'px)';
      for (const q of ds) {
        const k = q.o.depth ?? 1;
        q.e.style.transform = 'translate(' + (Math.sin(t * 0.35 + q.ph) * 6 * k) + 'px, ' + (Math.sin(t * 0.5 + q.ph * 1.3) * 9 * k) + 'px) rotate(' + ((q.o.rot || 0) + Math.sin(t * 0.4 + q.ph) * 4) + 'deg)';
      }
    };
  };

  // ---------- Rajamangala, drawn: 2.5D bowl in the ink + flat-fill style ----------
  // Layers: ground shadow → back floodlight tower → outer facade wall with arches → upper stands (two tones)
  // → cantilever roof over the main stand → terracotta track → green pitch → front floodlight tower.
  // Centre (X, Y) = middle of the bowl's top rim. Footprint ≈ 280 × 200 (+ towers ≈ 150 up).
  NB.stadium = function (X, Y) {
    const RX = 130, RY = 80, H = 30;               // rim radii, wall height
    const ink = 'stroke:var(--ink);stroke-linejoin:round;stroke-linecap:round';
    const facade = 'oklch(0.84 0.018 290)', facadeDk = 'oklch(0.70 0.025 290)', arch = 'oklch(0.36 0.04 290)';
    const standA = 'oklch(0.80 0.06 300)', standB = 'oklch(0.66 0.11 300)';
    const track = 'oklch(0.62 0.13 42)', grass = 'oklch(0.70 0.15 145)', grass2 = 'oklch(0.66 0.15 145)';
    const ex = (a, rx, ry, cy) => [X + rx * Math.cos(a), cy + ry * Math.sin(a)];
    const f = (n) => n.toFixed(1);
    // Rajamangala floodlight tower: two broad tapered concrete legs (front face + darker side face),
    // a heavy head frame joining them near the top, a lamp bank on top. No lattice.
    const conc = 'oklch(0.80 0.012 280)', concDk = 'oklch(0.62 0.018 280)';
    const tower = (gx, gy, h) => {
      const top = gy - h, hy = top + 22;
      const leg = (b0, b1, a0, a1) => {           // bottom x0,x1 → top x0,x1 (at hy)
        const m0 = b0 + (b1 - b0) * 0.68, m1 = a0 + (a1 - a0) * 0.68;
        return '<path d="M' + f(b0) + ' ' + f(gy) + ' L' + f(a0) + ' ' + f(hy) + ' L' + f(m1) + ' ' + f(hy) + ' L' + f(m0) + ' ' + f(gy) + ' Z" style="fill:' + conc + '"/>' +
          '<path d="M' + f(m0) + ' ' + f(gy) + ' L' + f(m1) + ' ' + f(hy) + ' L' + f(a1) + ' ' + f(hy) + ' L' + f(b1) + ' ' + f(gy) + ' Z" style="fill:' + concDk + '"/>' +
          '<path d="M' + f(b0) + ' ' + f(gy) + ' L' + f(a0) + ' ' + f(hy) + ' L' + f(a1) + ' ' + f(hy) + ' L' + f(b1) + ' ' + f(gy) + ' Z" style="fill:none;' + ink + ';stroke-width:3.5"/>';
      };
      let o = leg(gx - 30, gx - 13, gx - 22, gx - 10) + leg(gx + 8, gx + 25, gx + 7, gx + 19);
      // head frame: heavy block with a darker underside
      o += '<rect x="' + f(gx - 30) + '" y="' + f(top + 6) + '" width="56" height="22" rx="2" style="fill:' + conc + ';' + ink + ';stroke-width:3.5"/>';
      o += '<rect x="' + f(gx - 28) + '" y="' + f(top + 20) + '" width="52" height="6" style="fill:' + concDk + '"/>';
      // lamp bank
      o += '<rect x="' + f(gx - 27) + '" y="' + f(top - 8) + '" width="50" height="15" rx="2" style="fill:var(--paper);' + ink + ';stroke-width:3"/>';
      for (let i = 0; i < 4; i++) o += '<rect x="' + f(gx - 23 + i * 11.5) + '" y="' + f(top - 5) + '" width="8" height="9" rx="1.5" style="fill:var(--accent);stroke:var(--ink);stroke-width:1.5"/>';
      return o;
    };
    let s = '';
    // ground shadow
    s += '<ellipse cx="' + (X + 8) + '" cy="' + (Y + H + 14) + '" rx="' + (RX + 14) + '" ry="' + (RY + 8) + '" style="fill:oklch(0.35 0.05 300);opacity:.16"/>';
    // back tower (behind the bowl)
    s += tower(X + RX - 10, Y - RY + 36, 190);
    // outer wall (front half of a short cylinder) with the arcade
    s += '<path d="M' + (X - RX) + ' ' + Y + ' A' + RX + ' ' + RY + ' 0 0 0 ' + (X + RX) + ' ' + Y + ' L' + (X + RX) + ' ' + (Y + H) + ' A' + RX + ' ' + RY + ' 0 0 1 ' + (X - RX) + ' ' + (Y + H) + ' Z" style="fill:' + facade + ';' + ink + ';stroke-width:5"/>';
    for (let k = 0; k < 15; k++) {
      const a = Math.PI * (0.06 + 0.88 * (k + 0.5) / 15);
      const sn = Math.sin(a), w = 4 + 8 * sn;
      const [x, yt] = ex(a, RX, RY, Y);
      const y0 = yt + 8, y1 = yt + H - 3;
      s += '<path d="M' + f(x - w / 2) + ' ' + f(y1) + ' V' + f(y0 + w / 2) + ' A' + f(w / 2) + ' ' + f(w / 2) + ' 0 0 1 ' + f(x + w / 2) + ' ' + f(y0 + w / 2) + ' V' + f(y1) + ' Z" style="fill:' + arch + '"/>';
    }
    s += '<path d="M' + (X - RX) + ' ' + (Y + 7) + ' A' + RX + ' ' + RY + ' 0 0 0 ' + (X + RX) + ' ' + (Y + 7) + '" style="fill:none;stroke:' + facadeDk + ';stroke-width:3"/>';
    // rim + stands (two tones), rows
    s += '<ellipse cx="' + X + '" cy="' + Y + '" rx="' + RX + '" ry="' + RY + '" style="fill:' + standA + ';' + ink + ';stroke-width:5"/>';
    s += '<ellipse cx="' + X + '" cy="' + (Y + 3) + '" rx="' + (RX - 22) + '" ry="' + (RY - 15) + '" style="fill:' + standB + '"/>';
    for (const k of [0.92, 0.84]) s += '<ellipse cx="' + X + '" cy="' + Y + '" rx="' + f(RX * k) + '" ry="' + f(RY * k) + '" style="fill:none;stroke:oklch(0.55 0.08 300);stroke-width:2;opacity:.6"/>';
    // track + pitch
    s += '<ellipse cx="' + X + '" cy="' + (Y + 5) + '" rx="' + (RX - 44) + '" ry="' + (RY - 31) + '" style="fill:' + track + ';' + ink + ';stroke-width:3.5"/>';
    s += '<ellipse cx="' + X + '" cy="' + (Y + 5) + '" rx="' + (RX - 50) + '" ry="' + (RY - 36) + '" style="fill:none;stroke:oklch(0.9 0.03 60);stroke-width:1.5;opacity:.7"/>';
    const pw = 108, ph = 52, px = X - pw / 2, py = Y + 5 - ph / 2;
    s += '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="5" style="fill:' + grass + ';' + ink + ';stroke-width:3"/>';
    for (let i = 0; i < 6; i += 2) s += '<rect x="' + (px + i * pw / 6) + '" y="' + py + '" width="' + pw / 6 + '" height="' + ph + '" style="fill:' + grass2 + '"/>';
    s += '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="5" style="fill:none;' + ink + ';stroke-width:3"/>';
    s += '<g style="fill:none;stroke:oklch(0.98 0.01 145);stroke-width:2">' +
      '<path d="M' + X + ' ' + (py + 4) + ' V' + (py + ph - 4) + '"/><ellipse cx="' + X + '" cy="' + (Y + 5) + '" rx="9" ry="7"/>' +
      '<rect x="' + (px + 4) + '" y="' + (Y - 7) + '" width="13" height="24"/><rect x="' + (px + pw - 17) + '" y="' + (Y - 7) + '" width="13" height="24"/>' +
      '<rect x="' + (px + 4) + '" y="' + (py + 4) + '" width="' + (pw - 8) + '" height="' + (ph - 8) + '" rx="2"/></g>';
    // cantilever roof over the main (far) stand
    const a0 = Math.PI * 1.13, a1 = Math.PI * 1.87, lift = 16;
    const [o0x, o0y] = ex(a0, RX + 6, RY + 6, Y - lift), [o1x, o1y] = ex(a1, RX + 6, RY + 6, Y - lift);
    const [i1x, i1y] = ex(a1, RX - 30, RY - 24, Y - lift + 6), [i0x, i0y] = ex(a0, RX - 30, RY - 24, Y - lift + 6);
    s += '<path d="M' + f(o0x) + ' ' + f(o0y) + ' A' + (RX + 6) + ' ' + (RY + 6) + ' 0 0 1 ' + f(o1x) + ' ' + f(o1y) + ' L' + f(i1x) + ' ' + f(i1y) + ' A' + (RX - 30) + ' ' + (RY - 24) + ' 0 0 0 ' + f(i0x) + ' ' + f(i0y) + ' Z" style="fill:var(--paper);' + ink + ';stroke-width:4.5"/>';
    for (const a of [1.3, 1.5, 1.7]) { const [x0, y0] = ex(Math.PI * a, RX + 6, RY + 6, Y - lift), [x1, y1] = ex(Math.PI * a, RX - 30, RY - 24, Y - lift + 6); s += '<path d="M' + f(x0) + ' ' + f(y0) + ' L' + f(x1) + ' ' + f(y1) + '" style="fill:none;stroke:oklch(0.7 0.02 290);stroke-width:2.5"/>'; }
    // front tower (in front of the bowl)
    s += tower(X - RX + 18, Y + RY + 4, 200);
    return s;
  };
  // badge for the icon that rides a line: paper disc, line-colour ring, ink rim, centred train front, soft shadow
  NB.trainBadge = function (color, size = 84) {
    const c = size / 2;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="overflow:visible;filter:drop-shadow(0 6px 8px oklch(0.2 0.06 302 / .35))">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + (c - 2) + '" style="fill:var(--ink)"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + (c - 5) + '" style="fill:' + color + '"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + (c - 13) + '" style="fill:var(--paper);stroke:var(--ink);stroke-width:2.5"/>' +
      '<g transform="translate(' + (c - 15) + ' ' + (c - 17) + ')" style="stroke:var(--ink);stroke-width:3;stroke-linejoin:round;stroke-linecap:round">' +
      '<rect x="1.5" y="1.5" width="27" height="28" rx="7" style="fill:var(--th-soft)"/>' +
      '<rect x="6" y="6" width="18" height="9" rx="2.5" style="fill:var(--paper)"/>' +
      '<circle cx="8.5" cy="22" r="2" style="fill:var(--accent);stroke-width:2"/><circle cx="21.5" cy="22" r="2" style="fill:var(--accent);stroke-width:2"/>' +
      '<path d="M7 30 L4.5 34 M23 30 L25.5 34" style="fill:none"/></g></svg>';
  };

  // ---------- stacking: items that have exited free their slot ----------
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

  // ---------- cut-paper hearts (band colour), few and slow ----------
  NB.hearts = function (parent, o) {
    const r = NB.rng(o.seed || 3);
    const list = Array.from({ length: o.n || 8 }, (_, i) => {
      const size = (o.min || 34) + r() * ((o.max || 70) - (o.min || 34));
      const fill = ['var(--th-main)', 'var(--th-soft)', 'var(--th-main)'][i % 3];
      const el = NB.el('div', 'abs', parent, `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="overflow:visible;filter:drop-shadow(0 6px 8px oklch(0.12 0.05 302 / .35))"><path d="M50 88 C19 67 6 50 6 33 A21 21 0 0 1 50 23 A21 21 0 0 1 94 33 C94 50 81 67 50 88Z" style="fill:var(--paper)"/><path d="M50 80 C24 62 14 48 14 35 A15 15 0 0 1 50 30 A15 15 0 0 1 86 35 C86 48 76 62 50 80Z" style="fill:${fill}"/></svg>`);
      return { el, size, x: o.x0 + r() * (o.x1 - o.x0), speed: (o.speed || 40) * (0.6 + r() * 0.8), ph: r() * 10, sway: 8 + r() * 18, w: 0.4 + r() * 0.5, rot: (r() - 0.5) * 36 };
    });
    return (t) => {
      const span = (o.y1 - o.y0) + 200;
      for (const h of list) {
        const travel = ((t - (o.at || 0)) * h.speed + h.ph * 97) % span;
        const y = o.y1 + 100 - travel;
        const x = h.x + Math.sin(t * h.w + h.ph) * h.sway;
        const fadeIn = NB.p(t, o.at || 0, 0.8);
        const lifeA = Math.min(1, travel / 160, (span - travel) / 220);
        h.el.style.opacity = String(Math.max(0, lifeA) * fadeIn * (o.alpha ?? 0.9));
        h.el.style.transform = `translate(${x - h.size / 2}px, ${y}px) rotate(${h.rot + Math.sin(t * h.w) * 6}deg)`;
      }
    };
  };

  // ---------- setup / seek ----------
  let def = null, ctx = null;
  NB.define = (d) => { def = d; };

  window.setup = async function (payload) {
    const { W, H } = payload;
    if (payload.theme) for (const k in payload.theme) if (k[0] !== '_') document.documentElement.style.setProperty('--' + k, payload.theme[k]);
    document.documentElement.style.width = W + 'px';
    const frame = NB.el('div', '', document.body); frame.id = 'frame';
    NB.css(frame, { width: W + 'px', height: H + 'px' });
    document.body.classList.add('layout-' + payload.layout);
    const world = NB.el('div', '', frame); world.id = 'world';
    const bg = NB.el('div', '', world); bg.id = 'bg';
    const fxc = NB.el('canvas', '', frame); fxc.id = 'fx'; fxc.width = W; fxc.height = H;
    const floor = NB.el('div', 'shadow-floor', frame);
    const ui = NB.el('div', '', frame); ui.id = 'ui';
    // grain sits over the world (page, map, footage) and under the stickers
    const grain = NB.el('div', 'grain', frame); frame.insertBefore(grain, fxc);
    ctx = Object.assign({}, payload, { frame, world, bg, ui, fx: fxc, floor, cfg: payload.scene });
    if (payload.scene.theme !== false) ctx.themeUpd = NB.themeLayer(Object.assign({}, ctx, { deco: payload.deco }));
    if (payload.stock && payload.scene.stockAs === 'background' && payload.scene.stockFrame) {
      ctx.stockBg = NB.stockSlot(world, Object.assign({ frame: true }, payload.scene.stockFrame), payload.stock, ctx);
      ctx.stockBg.framed = true;
    } else if (payload.stock && payload.scene.stockAs === 'background') {
      const sb = NB.stockSlot(world, { x: 0, y: 0, w: W, h: H }, payload.stock, ctx);
      world.insertBefore(sb.box, world.children[1]);
      const shade = NB.el('div', 'abs', sb.box);
      NB.css(shade, { inset: '0', background: payload.scene.stockShade || 'linear-gradient(180deg, oklch(0.2 0.08 302 / 0.35) 0%, oklch(0.2 0.08 302 / 0.5) 60%, oklch(0.2 0.08 302 / 0.9) 100%)' });
      ctx.stockBg = sb;
    }
    if (def.build) await def.build(ctx);
    await document.fonts.ready;
    // fonts are in: sizes are final, cut the sticker shapes
    if (def.afterFonts) await def.afterFonts(ctx);
    const imgs = [...document.images].filter((i) => i.src);
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return true;
  };

  window.seek = async function (t) {
    const c = ctx;
    // slow push-in over the scene
    const p = NB.p(t, c.start, Math.max(0.1, c.end - c.start));
    const push = c.scene.push ?? 0.025;
    const o = c.scene.pushOrigin || '42% 40%';
    c.world.style.transformOrigin = o;
    c.world.style.transform = `scale(${1 + push * NB.ease.inOutSine(p)})`;
    // floor shadow under Nubu (same track as the ffmpeg overlay)
    if (c.nubu && c.scene.floor !== false) {
      const r = NubuTrack.rectAt(t - (c.timeOffset || 0), c.nubu.keys, c.nubu.modes);
      const w = r.w * 0.66, h = r.w * 0.09;
      NB.css(c.floor, { left: r.x + r.w * 0.5 - w / 2 + 'px', top: r.y + r.h * 0.975 - h / 2 + 'px', width: w + 'px', height: h + 'px', display: 'block' });
    } else c.floor.style.display = 'none';
    if (c.themeUpd) c.themeUpd(t);
    if (c.stockBg) {
      const u = c.scene.stockUntil;
      if (c.stockBg.framed) NB.enter(c.stockBg.box, t, c.start, { dy: 16, scale: 1.02, drot: 1.5, dur: 0.5, exitAt: u });
      else c.stockBg.box.style.opacity = String(u != null ? 1 - NB.ease.inOutSine(NB.p(t, u, 0.6)) : 1);
      await c.stockBg.update(t);
    }
    if (def.update) await def.update(t, c);
  };
})();
