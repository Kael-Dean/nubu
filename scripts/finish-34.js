// Final 3/4 touches for an outfit (run after costume-fit.js angle34 + compose-34-outfit.js):
//   fit_scarf_wrap.png : scarf wraps to the body edge on the far side, and continues behind the near arm to the body
//                        edge on the near side (texture mirrored from the wrap, edges extrapolated)
//   cup_far_edge.png   : far ear cup drawn over the head's soft fur fringe so no light halo shows around it
//   badge_fix_for_R.png: counter-flipped "7" badge for the mirrored right view
// usage: node scripts/finish-34.js <band> [minThick=50]
const sharp = require('sharp');
const ROOT = 'D:/NUBU/';
const [band, MT] = process.argv.slice(2);
const MIN_T = +MT || 50, W = 1080, H = 1269;
const A = `${ROOT}character/layers/costume/${band}/angle34/`, L = `${ROOT}character/layers/angle34/`;
const load = async f => sharp(f).ensureAlpha().raw().toBuffer();
const save = (b, f) => sharp(b, { raw: { width: W, height: H, channels: 4 } }).png().toFile(f);

(async () => {
  const sc = await load(A + 'fit_scarf.png'), bd = await load(L + 'body_base.png'), out = Buffer.from(sc);
  const top = x => { for (let y = 680; y < 900; y++) if (sc[(y * W + x) * 4 + 3] > 200) return y; return -1; };
  const bot = x => { let b = -1; for (let y = 680; y < 900; y++) if (sc[(y * W + x) * 4 + 3] > 200) b = y; return b; };
  const fit = (f, x0, x1) => { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (let x = x0; x <= x1; x += 2) { const y = f(x); if (y < 0) continue; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; } const b = (n * sxy - sx * sy) / (n * sxx - sx * sx); return { a: (sy - b * sx) / n, b }; };
  // far side (left): continue the wrap from its left end to the body edge, following its top/bottom edges
  {
    let xl = -1; for (let x = 0; x < 500 && xl < 0; x++) if (top(x) > 0) xl = x;
    const XS = xl + 6, XE = xl + 60, TL = fit(top, XS, XE), BL = fit(bot, XS, XE);
    for (let x = XS - 1; x >= 0; x--) {
      const tt = TL.a + TL.b * x, bt = Math.max(tt + MIN_T, BL.a + BL.b * x), ph = (XS - 1 - x) % 100, sx = XS + (ph < 50 ? ph : 99 - ph), ts = top(sx), bs = bot(sx);
      if (ts < 0) continue; const sh = 1 - 0.3 * Math.min(1, (XS - x) / 120);
      for (let y = 680; y < 900; y++) { const p = (y * W + x) * 4; out[p + 3] = 0; }
      for (let y = Math.floor(tt); y <= Math.ceil(bt); y++) { const p = (y * W + x) * 4, ab = bd[p + 3]; if (ab < 8) continue;
        const q = (Math.round(ts + (y - tt) / (bt - tt) * (bs - ts)) * W + sx) * 4, edge = Math.max(0, Math.min(1, (y - tt + 1) / 2, (bt - y + 1) / 2));
        for (let c = 0; c < 3; c++) out[p + c] = Math.round(sc[q + c] * sh); out[p + 3] = Math.round(Math.min(sc[q + 3], ab) * edge); }
    }
  }
  // near side (right): continue behind the arm to the body edge
  const X0 = 630, X1 = 680, XC = 680, T = fit(top, X0, X1), B = fit(bot, X0, X1);
  for (let x = XC; x < W; x++) for (let y = 600; y < 900; y++) out[(y * W + x) * 4 + 3] = 0;
  for (let x = XC; x < W; x++) {
    const tt = T.a + T.b * x, bt = Math.max(tt + MIN_T, B.a + B.b * x), ph = (x - XC) % 100, sx = X1 - (ph < 50 ? ph : 99 - ph), ts = top(sx), bs = bot(sx);
    if (ts < 0) continue; const sh = 1 - 0.25 * Math.min(1, (x - XC) / 250);
    for (let y = Math.floor(tt); y <= Math.ceil(bt); y++) { const p = (y * W + x) * 4, ab = bd[p + 3]; if (ab < 8) continue;
      const q = (Math.round(ts + (y - tt) / (bt - tt) * (bs - ts)) * W + sx) * 4, edge = Math.max(0, Math.min(1, (y - tt + 1) / 2, (bt - y + 1) / 2));
      for (let c = 0; c < 3; c++) out[p + c] = Math.round(sc[q + c] * sh); out[p + 3] = Math.round(Math.min(sc[q + 3], ab) * edge); }
  }
  // the scarf passes BEHIND the near ear cup: hide it wherever the cup (our cup shape) is
  { const hp = await load(L + 'headphones.png'), fn = await load(A + 'fit_cup_near.png'), cm = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++) { const x = p % W, y = (p / W) | 0; if ((x > 700 && y > 380 && hp[p * 4 + 3] > 40) || fn[p * 4 + 3] > 40) cm[p] = 255; }
    const cs = await sharp(cm, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer();
    for (let p = 0; p < W * H; p++) out[p * 4 + 3] = Math.round(out[p * 4 + 3] * (1 - cs[p] / 255)); }
  await save(out, A + 'fit_scarf_wrap.png');
  if (process.env.FULLHEAD) { console.log('whole-head mode: far cup comes from the render; skipping cup edge work'); }
  // far cup over the fur fringe
  const cf = process.env.FULLHEAD ? Buffer.alloc(W * H * 4) : await load(A + 'fit_cup_far.png'), bo = await load(A + 'body_outfit.png'), ov = Buffer.alloc(W * H * 4);
  // where the head borders the far cup, replace the soft fur fringe (which turns grey over purple) by a clean
  // smooth edge: alpha from the blurred head alpha, thresholded
  {
    const al = Buffer.alloc(W * H); for (let p = 0; p < W * H; p++) al[p] = bo[p * 4 + 3];
    const bl = await sharp(al, { raw: { width: W, height: H, channels: 1 } }).blur(4).extractChannel(0).raw().toBuffer();
    // dilate the cup area a little so the whole border zone is treated
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const p = y * W + x;
      let near = false; for (const q of [p, p - 3, p + 3, p - 3 * W, p + 3 * W]) if (cf[q * 4 + 3] > 10) { near = true; break; }
      if (!near) continue;
      const a = Math.max(0, Math.min(1, (bl[p] / 255 - 0.45) / 0.1));
      if (a > 0 && bo[p * 4 + 3] < 40) { // no fur colour here: borrow from the nearest solid pixel to the right
        for (let d = 1; d < 30; d++) if (bo[(p + d) * 4 + 3] > 200) { for (let c = 0; c < 3; c++) bo[p * 4 + c] = bo[(p + d) * 4 + c]; break; } }
      bo[p * 4 + 3] = Math.round(a * 255);
      // the outermost ~5 px carry the render's dark matting rim: take the colour from 6 px further inside
      if (a > 0 && bl[p] / 255 < 0.92) { for (let d = 4; d <= 24; d += 2) { const q = p + d; if (bo[q * 4 + 3] > 200 && bl[q] / 255 >= 0.94) { for (let c = 0; c < 3; c++) bo[p * 4 + c] = bo[q * 4 + c]; break; } } }
      // below the beanie cuff a purple pixel on the head's edge is a strip of the render's own far cup: drop it (our cup is behind)
      if (y > +(process.env.CUFF_Y || 470)) { const r = bo[p * 4], g = bo[p * 4 + 1], b = bo[p * 4 + 2]; if (b > g + 22 && r > g + 8) bo[p * 4 + 3] = 0; }
    }
  }
  // far end of the band: tuck its squared tip under the knit (cut perpendicular to the band, filled with knit)
  {
    const isP = p => { const r = bo[p * 4], g = bo[p * 4 + 1], b = bo[p * 4 + 2]; return b > g + 22 && r > g + 8; };
    const isCream = p => bo[p * 4 + 3] > 200 && !isP(p) && (bo[p * 4] + bo[p * 4 + 1] + bo[p * 4 + 2]) / 3 > 185;
    // band pixels on the far side = cream with knit within 70 px below
    const bandPx = (x, y) => { const p = y * W + x; if (!isCream(p)) return false; for (let d = 4; d < 70; d += 4) if (y + d < H && isP(p + d * W)) return true; return false; };
    let xt = -1, yt = 0; for (let x = 120; x < 420 && xt < 0; x++) { let n = 0, sy = 0; for (let y = 230; y < 440; y++) if (bandPx(x, y)) { n++; sy += y; } if (n >= 5) { xt = x; yt = sy / n; } }
    if (xt > 0 && !process.env.FULLHEAD) {   // whole-head mode: the cleanup render already ends the band cleanly
      const cen = x0 => { let n = 0, sy = 0; for (let x = x0; x < x0 + 20; x++) for (let y = 200; y < 440; y++) if (bandPx(x, y)) { n++; sy += y; } return n ? sy / n : yt; };
      const y1 = cen(xt + 5), y2 = cen(xt + 45), len = Math.hypot(40, y2 - y1), dx = 40 / len, dy = (y2 - y1) / len, TUCK = +(process.env.TUCK || 34);
      let n = 0; const tucked = new Uint8Array(W * H);
      const tuck = (x, y) => { const p = y * W + x; tucked[p] = 1;
        if (bd[p * 4 + 3] < 128) { bo[p * 4 + 3] = 0; return; }            // outside our head: the tip simply ends (no floating knit)
        for (let d = 2; d < 90; d += 2) { const q = (y + d) * W + x; if (isP(q)) { const t = (y + d + 6) * W + x; for (let c = 0; c < 4; c++) bo[p * 4 + c] = bo[(isP(t) ? t : q) * 4 + c]; n++; return; } }
        bo[p * 4 + 3] = 0; };
      for (let y = Math.round(yt) - 80; y < Math.round(yt) + 80; y++) for (let x = xt - 5; x < xt + 90; x++) {
        if (!bandPx(x, y)) continue; const proj = (x - xt) * dx + (y - yt) * dy; if (proj > TUCK) continue; tuck(x, y); }
      // clean-up: anti-aliased leftovers hugging the tip (within 4 px of a tucked pixel, not knit, not fur below the cuff)
      const near = []; for (let y = Math.round(yt) - 84; y < Math.round(yt) + 84; y++) for (let x = xt - 9; x < xt + 94; x++) { const p = y * W + x; if (tucked[p] || !bo[p * 4 + 3] || isP(p)) continue;
        let nb = false; for (let dy2 = -4; dy2 <= 4 && !nb; dy2++) for (let dx2 = -4; dx2 <= 4; dx2++) if (tucked[p + dy2 * W + dx2]) { nb = true; break; } if (nb && (x - xt) * dx + (y - yt) * dy <= TUCK + 3) near.push([x, y]); }
      for (const [x, y] of near) tuck(x, y);
      console.log('band tip tucked at', xt, Math.round(yt), 'px', n);
    }
  }
  // band → near ear cup joint: the render leaves a concave notch where the band meets the cushion ring.
  // Morphological closing of the outline in that box (radius R) fills it; new pixels take the nearest band colour.
  { const X0 = +(process.env.JX0 || 770), X1 = +(process.env.JX1 || 920), Y0 = +(process.env.JY0 || 340), Y1 = +(process.env.JY1 || 480), R = +(process.env.JR || 16);
    const bd2 = await load(L + 'body_base.png'), hp2 = await load(L + 'headphones.png');
    const inA = (x, y) => { const p = (y * W + x) * 4; return bo[p + 3] > 128 && bo[p] > 185 && bo[p + 1] > 170; },   // cream (band + cushion), so the knit wedge between them closes too
     _u = 0, disk = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) disk.push([dx, dy]);
    const dil = new Uint8Array(W * H); for (let y = Y0 - R; y < Y1 + R; y++) for (let x = X0 - R; x < X1 + R; x++) { for (const [dx, dy] of disk) if (inA(x + dx, y + dy)) { dil[y * W + x] = 1; break; } }
    let n = 0; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { if (inA(x, y)) continue; let all = true; for (const [dx, dy] of disk) if (!dil[(y + dy) * W + x + dx]) { all = false; break; } if (!all) continue;
      const p = y * W + x; if (Math.max(bd2[p * 4 + 3], hp2[p * 4 + 3]) < 100) continue;   // stay inside our outline
      if (bo[p * 4 + 3] > 128) continue;      // only fill transparent gaps in the outline
      // colour: nearest opaque cream pixel up-left (the band)
      for (let d = 1; d < 40; d++) { let q = -1; for (const [ox, oy] of [[-d, 0], [0, -d], [-d, -d], [d, -d]]) { const r = (y + oy) * W + x + ox; const c = bo[r * 4]; if (bo[r * 4 + 3] > 200 && c > 190 && bo[r * 4 + 2] < c + 10) { q = r; break; } } if (q >= 0) { for (let c = 0; c < 3; c++) bo[p * 4 + c] = bo[q * 4 + c]; bo[p * 4 + 3] = 255; n++; break; } } }
    console.log('band-cup joint filled px', n); }
  // close thin cracks in the outline (radius 5): transparent pixels whose whole disk neighbourhood is covered after dilation
  { const R = 5, op = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) op[p] = bo[p * 4 + 3] > 128 ? 1 : 0;
    const dil = new Uint8Array(W * H); for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { if (op[y * W + x]) { dil[y * W + x] = 1; continue; } let hit = 0; for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R && op[(y + dy) * W + x + dx]) { hit = 1; break; } dil[y * W + x] = hit; }
    let n = 0; for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { const p = y * W + x; if (op[p] || !dil[p]) continue; let all = 1; for (let dy = -R; dy <= R && all; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R && !dil[(y + dy) * W + x + dx]) { all = 0; break; }
      if (!all) continue; const acc = [0, 0, 0]; let k = 0; for (let d = 1; d <= 6 && k < 3; d++) for (const q of [p - d, p + d, p - d * W, p + d * W]) if (op[q]) { for (let c = 0; c < 3; c++) acc[c] += bo[q * 4 + c]; k++; }
      if (k) { for (let c = 0; c < 3; c++) bo[p * 4 + c] = Math.round(acc[c] / k); bo[p * 4 + 3] = 255; n++; } }
    console.log('cracks closed px', n); }
  // semi-transparent slits inside solid material (the render's matting cracks): a pixel ringed by solid pixels becomes solid
  { let n = 0; const src = Buffer.from(bo); for (let pass = 0; pass < 1; pass++) for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) { const p = y * W + x; if (src[p * 4 + 3] >= 250) continue;
      let solid = 0; const acc = [0, 0, 0]; for (let a = 0; a < 16; a++) { const t = a * Math.PI / 8, q = Math.round(y + 5 * Math.sin(t)) * W + Math.round(x + 5 * Math.cos(t)); if (src[q * 4 + 3] >= 240) { solid++; for (let c = 0; c < 3; c++) acc[c] += src[q * 4 + c]; } }
      if (solid >= 10) { if (src[p * 4 + 3] < 200) for (let c = 0; c < 3; c++) bo[p * 4 + c] = Math.round(acc[c] / solid); bo[p * 4 + 3] = 255; n++; } }
    console.log('slits made solid px', n); }
  // fill enclosed holes (transparent pixels not connected to the canvas border) with the colour of their opaque neighbours
  { const seen = new Uint8Array(W * H), st = []; for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) { const p = st.pop(); if (seen[p] || bo[p * 4 + 3] > 128) continue; seen[p] = 1; const x = p % W, y = (p / W) | 0; if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W); }
    let holes = []; for (let p = 0; p < W * H; p++) if (!seen[p] && bo[p * 4 + 3] <= 128) holes.push(p);
    for (let pass = 0; pass < 40 && holes.length; pass++) { const left = []; for (const p of holes) { const acc = [0, 0, 0]; let k = 0; for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) if (bo[q * 4 + 3] > 200) { for (let c = 0; c < 3; c++) acc[c] += bo[q * 4 + c]; k++; }
        if (k >= 2) { for (let c = 0; c < 3; c++) bo[p * 4 + c] = Math.round(acc[c] / k); bo[p * 4 + 3] = 255; } else left.push(p); } holes = left; }
    console.log('enclosed holes filled'); }
  // remove tiny floating islands (leftover specks) from the outfit body
  { const lab = new Int32Array(W * H).fill(-1); for (let s0 = 0; s0 < W * H; s0++) if (bo[s0 * 4 + 3] > 20 && lab[s0] < 0) { const st = [s0], px = []; lab[s0] = 1;
      while (st.length) { const p = st.pop(); px.push(p); const x = p % W, y = (p / W) | 0; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && bo[q * 4 + 3] > 20 && lab[q] < 0) { lab[q] = 1; st.push(q); } }
      if (px.length < 400) for (const p of px) bo[p * 4 + 3] = 0; } }
  // the far cup's own inner edge used to hide under the head's fur fringe: extend the cup 28 px under the head
  { for (let y = 0; y < H; y++) { let xr = -1; for (let x = W - 1; x >= 0; x--) if (cf[(y * W + x) * 4 + 3] > 200) { xr = x; break; } if (xr < 0) continue;
      for (let k = 1; k <= 28 && xr + k < W; k++) { const p = (y * W + xr + k) * 4, q = (y * W + xr - 3 - ((k - 1) % 16)) * 4; if (cf[q + 3] < 250) continue; for (let c = 0; c < 3; c++) cf[p + c] = cf[q + c]; cf[p + 3] = 255; }
    }
    await save(cf, A + 'fit_cup_far.png'); }
  await save(bo, A + 'body_outfit.png');
  await save(ov, A + 'cup_far_edge.png');   // kept (empty) for layer-list compatibility
  // "7" badge for the right view (Rive mirrors the whole 3/4 view)
  const L0 = 494, T0 = 830, BW = 102, BH = 100;
  const fl = await sharp(await sharp(A + 'fit_scarf_wrap.png').extract({ left: L0, top: T0, width: BW, height: BH }).png().toBuffer()).flop().raw().toBuffer();
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const d = Math.min(x, y, BW - 1 - x, BH - 1 - y), i = y * BW + x; fl[i * 4 + 3] = Math.min(fl[i * 4 + 3], d * 50); }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(fl, { raw: { width: BW, height: BH, channels: 4 } }).png().toBuffer(), left: L0, top: T0 }]).png().toFile(A + 'badge_fix_for_R.png');
  console.log('finish-34 done (scarf wrap, far cup edge, R badge)');
})().catch(e => { console.error(e); process.exit(1); });
