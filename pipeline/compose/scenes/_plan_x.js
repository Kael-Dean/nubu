// Concert floor plan, centre stage with X runways (layout after a stadium show map, no text/logos):
// three stand tiers in different colours, floor blocks between the arms, VIP blocks near the stage,
// octagon stage in the middle, four diagonal runways to end platforms, scoreboard at the top.
// NB.planX(c, cfg.plan) builds into c.world and returns update(t).
// cfg.plan: {x, y, scale, at, lightsAt, lightsFull, beamsAt, exitAt}
(function () {
  NB.planX = function (c, PL) {
    const sc = PL.scale || 2.0, X = 200, Y = 250;
    const r = NB.rng(77);
    const line = 'oklch(0.9 0.04 302)', ink = 'oklch(0.24 0.06 300)';
    const P = (a, rx, ry) => [X + Math.cos(a) * rx, Y + Math.sin(a) * ry];
    const f = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
    const ring = (a0, a1, rx0, ry0, rx1, ry1) => `M${f(P(a0, rx1, ry1))} A${rx1},${ry1} 0 0 1 ${f(P(a1, rx1, ry1))} L${f(P(a1, rx0, ry0))} A${rx0},${ry0} 0 0 0 ${f(P(a0, rx0, ry0))} Z`;
    // stand tiers: [rx0, ry0, rx1, ry1, blocks, colour]
    const TIERS = [
      [132, 178, 152, 202, 30, 'oklch(0.52 0.15 262)'],   // inner: blue
      [156, 206, 178, 232, 34, 'oklch(0.78 0.13 85)'],    // middle: amber
      [182, 236, 206, 264, 38, 'oklch(0.66 0.13 165)'],   // outer: green / teal
    ];
    const gap = 0.16;                                       // scoreboard gap at the top (rad, half width)
    const stands = [];
    TIERS.forEach(([rx0, ry0, rx1, ry1, n, col], ti) => {
      const span = Math.PI * 2 - gap * 2, step = span / n;
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + gap + i * step + 0.01, a1 = a0 + step - 0.02;
        const am = (a0 + a1) / 2, m = P(am, (rx0 + rx1) / 2, (ry0 + ry1) / 2);
        stands.push({ d: ring(a0, a1, rx0, ry0, rx1, ry1), col, ti, a0, a1, rx0, ry0, rx1, ry1, cx: m[0], cy: m[1] });
      }
    });
    // floor: ellipse rx 122, ry 168. X arms from the centre at ±40° from vertical, out to end platforms.
    const FX = 122, FY = 168;
    const armAng = [-50, -130, 50, 130].map((d) => d * Math.PI / 180);   // screen angles: up-right, up-left, down-right, down-left
    const armLen = 128, armW = 9;
    const ends = armAng.map((a) => [X + Math.cos(a) * armLen * 0.78, Y + Math.sin(a) * armLen]);
    const distToSeg = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, u = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return Math.hypot(px - ax - u * vx, py - ay - u * vy); };
    const nearArm = (x, y, pad) => ends.some(([ex, ey]) => distToSeg(x, y, X, Y, ex, ey) < armW + pad);
    const floor = [];
    const BW = 22, BH = 26;
    for (let gy = Y - FY + 6; gy < Y + FY - BH; gy += BH + 4) {
      for (let gx = X - FX + 4; gx < X + FX - BW; gx += BW + 4) {
        const cx = gx + BW / 2, cy = gy + BH / 2;
        const inE = ((cx - X) / (FX - 12)) ** 2 + ((cy - Y) / (FY - 12)) ** 2 < 1;
        if (!inE || nearArm(cx, cy, 13) || Math.hypot(cx - X, cy - Y) < 44) continue;
        const vip = Math.abs(cx - X) < 46 && Math.abs(cy - Y) < 110;
        floor.push({ x: gx, y: gy, w: BW, h: BH, vip, cx, cy });
      }
    }
    // lightstick dots in stands and floor; each lights up later the further it is from the stage
    const dots = [];
    const add = (x, y) => dots.push({ x, y, d: Math.hypot(x - X, y - Y), ph: r() * 6.28, sp: 1.6 + r() * 2.4, rr: 1.2 + r() * 1.2 });
    for (const s of stands) for (let k = 0; k < 9; k++) { const a = s.a0 + (s.a1 - s.a0) * r(), u = 0.15 + 0.7 * r(); add(...P(a, s.rx0 + (s.rx1 - s.rx0) * u, s.ry0 + (s.ry1 - s.ry0) * u)); }
    for (const b of floor) for (let k = 0; k < 7; k++) add(b.x + 3 + r() * (b.w - 6), b.y + 3 + r() * (b.h - 6));
    const maxD = Math.max(...dots.map((d) => d.d));
    const dotSvg = dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.rr.toFixed(1)}" fill="oklch(0.85 0.17 302)" opacity="0"/>`).join('');
    const oct = (cx, cy, rad) => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return f([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }).join(' ');
    const arm = ([ex, ey]) => { const a = Math.atan2(ey - Y, ex - X), nx = -Math.sin(a) * armW / 2, ny = Math.cos(a) * armW / 2; return `${f([X + nx, Y + ny])} ${f([ex + nx, ey + ny])} ${f([ex - nx, ey - ny])} ${f([X - nx, Y - ny])}`; };
    const g = NB.el('div', 'abs', c.world, `<svg width="${400 * sc}" height="${500 * sc}" viewBox="0 0 400 500" style="overflow:visible">
      <defs>
        <radialGradient id="pglow"><stop offset="0" stop-color="oklch(0.66 0.22 302)" stop-opacity=".85"/><stop offset="1" stop-color="oklch(0.66 0.22 302)" stop-opacity="0"/></radialGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.96 0.05 302)" stop-opacity=".7"/><stop offset="1" stop-color="oklch(0.85 0.15 302)" stop-opacity="0"/></linearGradient>
        <filter id="pgl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
      </defs>
      <ellipse class="pglow" cx="${X}" cy="${Y}" rx="270" ry="320" fill="url(#pglow)" opacity="0"/>
      <ellipse class="rim" cx="${X}" cy="${Y}" rx="212" ry="270" fill="${ink}" fill-opacity="0" stroke="${line}" stroke-width="2.2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      <rect class="score" x="${X - 26}" y="${Y - 270 + 4}" width="52" height="12" rx="2" fill="oklch(0.2 0.04 300)" stroke="${line}" stroke-width="1" opacity="0"/>
      <g class="stands">${stands.map((s) => `<path d="${s.d}" fill="${s.col}" fill-opacity=".9" stroke="${ink}" stroke-width=".8" opacity="0"/>`).join('')}</g>
      <ellipse class="field" cx="${X}" cy="${Y}" rx="${FX}" ry="${FY}" fill="oklch(0.2 0.05 300)" stroke="${line}" stroke-opacity=".55" stroke-width="1" opacity="0"/>
      <g class="floor">${floor.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${b.vip ? 'oklch(0.62 0.2 305)' : 'oklch(0.58 0.19 18)'}" fill-opacity=".9" opacity="0"/>`).join('')}</g>
      <g class="beams" opacity="0">${armAng.map((a, k) => `<polygon class="bm" data-a="${a}" points="${X},${Y} ${X - 16},${Y - 150} ${X + 16},${Y - 150}" fill="url(#beam)" style="mix-blend-mode:screen"/>`).join('')}</g>
      <g class="arms">${ends.map((e) => `<polygon points="${arm(e)}" fill="oklch(0.94 0.02 302)" stroke="${ink}" stroke-width=".8" opacity="0"/>`).join('')}</g>
      <g class="plats">${ends.map(([ex, ey]) => `<polygon points="${oct(ex, ey, 11)}" fill="oklch(0.94 0.02 302)" stroke="${ink}" stroke-width=".8" opacity="0"/>`).join('')}</g>
      <g class="stage" opacity="0">
        <polygon points="${oct(X, Y, 30)}" fill="oklch(0.96 0.015 302)" stroke="${ink}" stroke-width="1.4"/>
        <polygon class="led" points="${oct(X, Y, 22)}" fill="oklch(0.7 0.2 302)" opacity=".35"/>
        <text x="${X}" y="${Y + 4}" text-anchor="middle" font-family="IBM Plex Sans Thai Looped, sans-serif" font-weight="700" font-size="10.5" letter-spacing="1.5" fill="oklch(0.22 0.06 300)">STAGE</text>
      </g>
      <g class="rings" fill="none" stroke="oklch(0.88 0.13 302)">${[0, 1, 2].map(() => `<ellipse cx="${X}" cy="${Y}" rx="30" ry="30" stroke-width="2" opacity="0"/>`).join('')}</g>
      <g class="pdots" filter="url(#pgl)">${dotSvg}</g>
      <g class="pdots2">${dotSvg}</g>
    </svg>`);
    NB.css(g, { left: (PL.x ?? 540) - X * sc + 'px', top: (PL.y ?? 860) - Y * sc + 'px' });
    const q = (s) => g.querySelector(s), qa = (s) => [...g.querySelectorAll(s)];
    const E_ = { glow: q('.pglow'), rim: q('.rim'), score: q('.score'), stands: qa('.stands path'), field: q('.field'), floor: qa('.floor rect'),
      beams: q('.beams'), bm: qa('.bm'), arms: qa('.arms polygon'), plats: qa('.plats polygon'), stage: q('.stage'), led: q('.led'), rings: qa('.rings ellipse'),
      d1: qa('.pdots circle'), d2: qa('.pdots2 circle') };
    const at = PL.at ?? c.start, la = PL.lightsAt ?? at + 2.5, lf = PL.lightsFull ?? la + 2.5, ba = PL.beamsAt ?? la;
    return function update(t) {
      const E = NB.ease;
      NB.enter(g, t, at - 0.1, { dy: 30, scale: 0.97, drot: 0, dur: 0.7, exitAt: PL.exitAt });
      const draw = E.inOutCubic(NB.p(t, at, 1.0));
      E_.rim.setAttribute('stroke-dashoffset', (1 - draw).toFixed(4));
      E_.rim.setAttribute('fill-opacity', (0.55 * E.inOutSine(NB.p(t, at + 0.6, 0.6))).toFixed(3));
      E_.score.setAttribute('opacity', E.outCubic(NB.p(t, at + 0.8, 0.3)).toFixed(3));
      // stands sweep in clockwise from the top, tier by tier
      E_.stands.forEach((el, i) => {
        const s = stands[i], order = ((s.a0 + s.a1) / 2 + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
        el.setAttribute('opacity', (0.92 * E.outCubic(NB.p(t, at + 0.3 + order * 0.8 + s.ti * 0.12, 0.25))).toFixed(3));
      });
      E_.field.setAttribute('opacity', E.outCubic(NB.p(t, at + 0.5, 0.5)).toFixed(3));
      // stage pops, arms shoot out, platforms land, then floor blocks fill outward from the stage
      const st = E.outBack(NB.p(t, at + 0.7, 0.45));
      E_.stage.setAttribute('opacity', Math.min(1, st * 1.3).toFixed(3));
      E_.stage.setAttribute('transform', `translate(${X} ${Y}) scale(${(0.4 + 0.6 * st).toFixed(3)}) translate(${-X} ${-Y})`);
      E_.arms.forEach((el, k) => {
        const p = E.outCubic(NB.p(t, at + 0.95 + k * 0.08, 0.45));
        el.setAttribute('opacity', Math.min(1, p * 2).toFixed(3));
        el.setAttribute('transform', `translate(${X} ${Y}) scale(${p.toFixed(3)}) translate(${-X} ${-Y})`);
      });
      E_.plats.forEach((el, k) => el.setAttribute('opacity', E.outCubic(NB.p(t, at + 1.35 + k * 0.08, 0.3)).toFixed(3)));
      E_.floor.forEach((el, i) => { const b = floor[i], d = Math.hypot(b.cx - X, b.cy - Y) / 170; el.setAttribute('opacity', E.outCubic(NB.p(t, at + 1.4 + d * 0.7, 0.25)).toFixed(3)); });
      // lights: dots switch on outward from the stage, then twinkle
      const L = E.inOutSine(NB.p(t, la, lf - la));
      E_.glow.setAttribute('opacity', (0.12 + 0.5 * L).toFixed(3));
      const front = L * (maxD + 60);
      dots.forEach((d, i) => {
        const on = Math.max(0, Math.min(1, (front - d.d) / 50));
        const o = on * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph)));
        E_.d1[i].setAttribute('opacity', o.toFixed(3)); E_.d2[i].setAttribute('opacity', (o * 0.85).toFixed(3));
      });
      E_.led.setAttribute('opacity', (0.35 + 0.6 * L * (0.5 + 0.5 * Math.sin(t * 5.2))).toFixed(3));
      // beams sweep out along the arms, sound rings pulse from the stage
      const B = E.inOutSine(NB.p(t, ba, 0.8));
      E_.beams.setAttribute('opacity', (0.32 * B).toFixed(3));
      E_.bm.forEach((el, k) => {
        const base = +el.dataset.a * 180 / Math.PI + 90, ang = base + Math.sin(t * 0.9 + k * 1.7) * 14;
        el.setAttribute('transform', `rotate(${ang.toFixed(2)} ${X} ${Y})`);
      });
      E_.rings.forEach((el, i) => {
        const ph = ((((t - la) / 1.6 + i / 3) % 1) + 1) % 1, live = t >= la ? 1 : 0;
        el.setAttribute('rx', (30 + ph * 200).toFixed(1)); el.setAttribute('ry', (30 + ph * 250).toFixed(1));
        el.setAttribute('opacity', (live * L * 0.4 * (1 - ph)).toFixed(3));
      });
    };
  };
})();
