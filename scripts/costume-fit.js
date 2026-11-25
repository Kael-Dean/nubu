// Re-skin Nubu's OWN headphones and head with a band costume, keeping the rig's original proportions.
// The AI costume render only supplies TEXTURE (knit) — every shape comes from our layers:
//   cups_<side>.png : our cup outer shell (the oval beyond the seam) filled with the render's knit cup cover,
//                     shaded by our own cup luminance → drawn ABOVE headphones, BELOW face/arms
//   beanie.png      : the render's beanie stretched to our head width, cuff height kept, clipped to our head
//                     → drawn ABOVE body_base, BELOW headphones (our band + cups hide its edges)
//   scarf.png       : unchanged from extract-costume.js (eye-registered)
// usage: node scripts/costume-fit.js <band> <view: front|angle34>
const fs = require('fs');
const sharp = require('sharp');

const ROOT = 'D:/NUBU/';
const [band, view] = process.argv.slice(2);
const CW = 1080, CH = 1269;
const isPurple = (r, g, b) => b > g + 22 && r > g + 8 && (0.3 * r + 0.59 * g + 0.11 * b) < 195;

// per view: which layer holds each cup, the seam that splits shell (outer) from cushion (inner), cup side test
const CFG = {
  front: { layers: 'front', cups: [
    { name: 'L', layer: 'headphones', inCup: (x, y) => x < 330 && y > 380, shell: x => x < 162 },
    { name: 'R', layer: 'headphones', inCup: (x, y) => x > 760 && y > 380, shell: x => x > 919 } ] },
  angle34: { layers: 'angle34', cups: [
    { name: 'near', layer: 'headphones', inCup: (x, y) => ((x - +(process.env.DCX || 872)) / +(process.env.DRX || 98)) ** 2 + ((y - +(process.env.DCY || 584)) / +(process.env.DRY || 162)) ** 2 < 1, shell: () => true },
    { name: 'far', layer: 'cup_far', inCup: () => true, shell: () => true } ] },
};
const V = CFG[view];
const load = async f => (await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const lum = (b, p) => 0.3 * b[p] + 0.59 * b[p + 1] + 0.11 * b[p + 2];
function bbox(test) { let x0 = CW, x1 = -1, y0 = CH, y1 = -1; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (test(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, x1, y0, y1 }; }
function sample(buf, x, y) {   // bilinear RGBA
  x = Math.max(0, Math.min(CW - 1.001, x)); y = Math.max(0, Math.min(CH - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, o = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { const p = ((y0 + dy) * CW + x0 + dx) * 4; for (let c = 0; c < 4; c++) o[c] += buf[p + c] * w; }
  return o;
}
const save = (buf, f) => sharp(buf, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(f);

(async () => {
  const dir = `${ROOT}character/layers/costume/${band}/${view}/`;
  const reg = await load(dir + '_registered.png');          // eye-registered costume render (RGB, from extract-costume.js debug)
  const body = await load(`${ROOT}character/layers/${V.layers}/body_base.png`);
  const purple = new Uint8Array(CW * CH);
  for (let p = 0; p < CW * CH; p++) if (isPurple(reg[p * 4], reg[p * 4 + 1], reg[p * 4 + 2])) purple[p] = 1;
  // connected purple blobs (4-neighbour) with bbox + centre, so each piece (cup L/R, beanie, scarf) is picked whole
  const lab = new Int32Array(CW * CH).fill(-1), blobs = [];
  for (let s0 = 0; s0 < CW * CH; s0++) if (purple[s0] && lab[s0] < 0) {
    const id = blobs.length, st = [s0]; lab[s0] = id; let n = 0, sx = 0, sy = 0, x0 = CW, x1 = -1, y0 = CH, y1 = -1;
    while (st.length) { const p = st.pop(), x = p % CW, y = (p / CW) | 0; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < CW - 1 ? p + 1 : -1, y > 0 ? p - CW : -1, y < CH - 1 ? p + CW : -1]) if (q >= 0 && purple[q] && lab[q] < 0) { lab[q] = id; st.push(q); } }
    blobs.push({ id, n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 });
  }
  if (process.env.DBG) console.log(blobs.filter(b => b.n > 2000).map(b => [b.n, b.cx | 0, b.cy | 0, b.x0, b.x1, b.y0, b.y1].join(',')).join('  '));
  const pick = test => blobs.filter(test).sort((a, b) => b.n - a.n)[0];
  for (let p = 0; p < CW * CH; p++) purple[p] = 0;           // keep only the picked blobs as "purple" below
  const keep = b => { if (b) for (let p = 0; p < CW * CH; p++) if (lab[p] === b.id) purple[p] = 1; return b; };

  // ---- cups: knit cover mapped onto our cup shell
  let knitMean = null;
  for (const cup of V.cups) {
    const ours = await load(`${ROOT}character/layers/${V.layers}/${cup.layer}.png`);
    const shellT = (x, y) => cup.inCup(x, y) && cup.shell(x) && ours[(y * CW + x) * 4 + 3] > 40;
    const T = bbox(shellT);
    // source: the render's purple cup on the same side (largest purple blob inside the same cup test, generous area)
    const side = cup.name === 'L' || cup.name === 'far' ? 'left' : 'right';
    // the render's cups touch its scarf, so take the cup by region: purple, beside the head, above the scarf
    const S = bbox((x, y) => y > 380 && y < +(process.env.CUP_MAXY || 745) && (side === 'left' ? x < +(process.env.CUP_LX || 150) : x > +(process.env.CUP_RX || 930)) && isPurple(reg[(y * CW + x) * 4], reg[(y * CW + x) * 4 + 1], reg[(y * CW + x) * 4 + 2]));
    if (S.x1 < 0) { console.log('no render cup on', side); continue; }
    let mean = 0, n = 0; for (let y = T.y0; y <= T.y1; y++) for (let x = T.x0; x <= T.x1; x++) if (shellT(x, y)) { mean += lum(ours, (y * CW + x) * 4); n++; } mean /= n;
    const out = Buffer.alloc(CW * CH * 4);
    for (let y = T.y0; y <= T.y1; y++) for (let x = T.x0; x <= T.x1; x++) {
      const p = (y * CW + x) * 4; if (!shellT(x, y)) continue;
      const sx = S.x0 + (x - T.x0) / Math.max(1, T.x1 - T.x0) * (S.x1 - S.x0), sy = S.y0 + (y - T.y0) / Math.max(1, T.y1 - T.y0) * (S.y1 - S.y0);
      let k = sample(reg, sx, sy);
      // the render's cup has a cream ring inside the knit: walk outward (away from the face) to the nearest knit pixel
      const dir1 = side === 'left' ? -1 : 1;
      // search outward first, then inward, then vertically, for the nearest knit pixel
      for (let d = 2; d < 160 && !isPurple(k[0], k[1], k[2]); d += 2) {
        for (const [ox, oy] of [[dir1 * d, 0], [-dir1 * d, 0], [0, d], [0, -d]]) { const t = sample(reg, sx + ox, sy + oy); if (isPurple(t[0], t[1], t[2])) { k = t; break; } }
      }
      if (!isPurple(k[0], k[1], k[2])) continue;
      const shade = Math.max(0.55, Math.min(1.25, lum(ours, p) / mean));
      for (let c = 0; c < 3; c++) out[p + c] = Math.max(0, Math.min(255, Math.round(k[c] * shade)));
      out[p + 3] = ours[p + 3];
    }
    // far cup (3/4): it is a thin side sliver — stretching the render's cup onto it smears. Re-colour our own
    // shell instead: deep purple scaled by our luminance + knit texture (high-pass of a knit patch from the render)
    if (cup.name === 'far') {
      const P = { x0: 820, y0: 520, w: 110, h: 150 };          // knit patch on the render's near cup
      let pm = 0; for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) pm += lum(reg, ((P.y0 + j) * CW + P.x0 + i) * 4); pm /= P.w * P.h;
      for (let y = T.y0; y <= T.y1; y++) for (let x = T.x0; x <= T.x1; x++) {
        const p = (y * CW + x) * 4; if (!shellT(x, y)) continue;
        // same colour as the near cup's knit (its average dark-purple), shaded by our own far-cup luminance
        const t = Math.max(0.45, Math.min(1.25, lum(ours, p) / mean));
        const pp = (v, n) => { const m = v % (2 * n); return m < n ? m : 2 * n - 1 - m; }; const tp = ((P.y0 + pp(y, P.h)) * CW + P.x0 + pp(x, P.w)) * 4, hp = (lum(reg, tp) - pm) * 0.8;
        const base = knitMean || [86, 38, 140];
        for (let c = 0; c < 3; c++) out[p + c] = Math.max(0, Math.min(255, Math.round(base[c] * t + hp)));
        out[p + 3] = ours[p + 3];
      }
    }
    if (cup.name !== 'far') {   // remember the knit colour (dark purple only, stripes excluded) for the far cup
      const acc = [0, 0, 0]; let m = 0;
      for (let p = 0; p < CW * CH; p++) if (out[p * 4 + 3] > 200 && lum(out, p * 4) < 110) { for (let c = 0; c < 3; c++) acc[c] += out[p * 4 + c]; m++; }
      if (m) knitMean = acc.map(v => v / m);
    }
    await save(out, dir + `fit_cup_${cup.name}.png`);
    console.log(`cup ${cup.name}: shell ${T.x0}-${T.x1} x ${T.y0}-${T.y1}  <- render ${S.x0}-${S.x1} x ${S.y0}-${S.y1}`);
  }

  // ---- beanie: render beanie (purple blob above the eyes) stretched to our head width, clipped to our head
  const bb = keep(pick(b => b.n > 10000 && b.cy < 520 && b.cx > 250 && b.cx < 830));
  const B = { x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 };
  const cuffY = B.y1;                                          // keep the cuff bottom where the render has it (eye-relative)
  // widest head span over the beanie height (not just the cuff row), so the knit reaches the head outline everywhere
  let hx0 = CW, hx1 = -1;
  for (let y = B.y0; y <= cuffY; y++) for (let x = 0; x < CW; x++) if (body[(y * CW + x) * 4 + 3] > 128) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
  let headTop = CH; for (let y = 0; y < CH; y++) if (body[(y * CW + ((hx0 + hx1) >> 1)) * 4 + 3] > 128) { headTop = y; break; }
  const T = { x0: hx0 - 12, x1: hx1 + 12, y0: headTop - 6, y1: cuffY };
  const bo = Buffer.alloc(CW * CH * 4);
  // inner edges of our band legs per row: the beanie must not stick out past them
  const hp = await load(`${ROOT}character/layers/${V.layers}/headphones.png`);
  const cxH = (hx0 + hx1) >> 1, innerL = new Int32Array(CH).fill(-1), innerR = new Int32Array(CH).fill(CW);
  for (let y = 0; y < CH; y++) {
    for (let x = cxH; x >= 0; x--) if (hp[(y * CW + x) * 4 + 3] > 128) { innerL[y] = x; break; }
    for (let x = cxH; x < CW; x++) if (hp[(y * CW + x) * 4 + 3] > 128) { innerR[y] = x; break; }
  }
  for (let y = Math.max(0, T.y0); y <= T.y1; y++) for (let x = Math.max(0, T.x0); x <= Math.min(CW - 1, T.x1); x++) {
    const p = (y * CW + x) * 4; const ab = body[p + 3]; if (!ab) continue;
    if (view === 'front' && (x < innerL[y] - 6 || x > innerR[y] + 6)) continue;   // front: hide under the band leg, never beyond it
    if (view === 'front' && y > +(process.env.CUFF_CUT_Y || 440) && (x < innerL[y] + 16 || x > innerR[y] - 16)) continue;   // cuff ends stop before the ear cups, following the band leg
    if (view === 'front' && !process.env.KNIT_UNDER_BAND && hp[p + 3] > 20) continue;   // never show knit through the band's soft fur edge
    const sx = B.x0 + (x - T.x0) / (T.x1 - T.x0) * (B.x1 - B.x0), sy = B.y0 + (y - T.y0) / (T.y1 - T.y0) * (B.y1 - B.y0);
    const k = sample(reg, sx, sy); const sp = (Math.round(sy) * CW + Math.round(sx));
    // inside the stretched box everything is knit; render pixels that are not purple (band, antenna) fall back to
    // the nearest purple row below so the crown stays knit under our band
    let src = k;
    if (!(k[2] > k[1] + 12 && k[0] > k[1]) && !purple[sp]) { for (let d = 1; d < 120; d++) { const q = (Math.round(sy) + d) * CW + Math.round(sx); if (q < CW * CH && purple[q]) { src = sample(reg, sx, sy + d); break; } } }
    if (!(src[2] > src[1] + 12 && src[0] > src[1])) continue;   // knit incl. light lavender stripes
    for (let c = 0; c < 3; c++) bo[p + c] = Math.round(src[c]);
    bo[p + 3] = ab > 128 ? 255 : 0;
  }
  // crown fill: from the top-most knit pixel of each column up to our head outline, repeat the knit rows just below
  // (period 34 px) so no fur shows between the band and the beanie
  for (let x = 0; x < CW; x++) {
    let yt = -1; for (let y = 0; y < CH; y++) if (bo[(y * CW + x) * 4 + 3] > 200) { yt = y; break; }
    if (yt < 0) continue;
    for (let y = yt - 1; y >= 0; y--) {
      const p = (y * CW + x) * 4, ab = body[p + 3]; if (ab < 8) break;
      const q = ((yt + 2 + ((yt - y) % 34)) * CW + x) * 4;
      for (let c = 0; c < 3; c++) bo[p + c] = bo[q + c]; bo[p + 3] = ab > 128 ? 255 : 0;
    }
  }
  await save(bo, dir + 'fit_beanie.png');
  console.log(`beanie: render ${B.x0}-${B.x1} x ${B.y0}-${B.y1} -> head ${T.x0}-${T.x1} x ${T.y0}-${T.y1}`);
})().catch(e => { console.error(e); process.exit(1); });
