// Build an outfit BODY layer per view: the costume render (registered by the eyes) above the scarf, blended into
// our own body_base for the face zone, the arm zones and everything below the scarf. In Rive, outfit == band shows
// this layer INSTEAD of body_base + headphones (+ cup_far in 3/4), so no cream headphones get stacked under the
// knit covers. Our face, arms and antennae layers stay on top unchanged.
// usage: node scripts/extract-body-outfit.js <band> <cutoutFront.png> <cutout34.png>
// out: character/layers/costume/<band>/{front,angle34}/body_outfit.png (+ angle34R mirrored)
const fs = require('fs');
const sharp = require('sharp');

const ROOT = 'D:/NUBU/';
const [band, cutFront, cut34] = process.argv.slice(2);
const CW = 1080, CH = 1269;
// knit purple + lavender stripes; the glowing butterflies are brighter (luma > 195) and are excluded
const MARGIN = +(process.env.MARGIN || 60);
const isPurple = (r, g, b) => b > g + 22 && r > g + 8 && (0.3 * r + 0.59 * g + 0.11 * b) < 195;

const VIEWS = {
  front: { ref: 'character/source/nubu_front_v1.webp', src: `character/source/costumes/nubu_costume_${band}_front_v4.webp`, cut: cutFront, off: [57, 2],
    layers: 'front', arms: ['arm_L', 'arm_R'], face: { cx: 541, cy: 625, rx: 255, ry: 120 } },
  angle34: { ref: 'character/source/nubu_3q-left_v1.webp', src: process.env.SRC34 || `character/source/costumes/nubu_costume_${band}_34L_v4.webp`, cut: cut34, off: [57, 19],
    layers: 'angle34', arms: ['arm_far', 'arm_near'], face: { cx: 455, cy: 600, rx: 1, ry: 1 } },
};

async function eyes(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, m = new Uint8Array(W * H);
  for (let y = Math.round(H * 0.3); y < H * 0.65; y++) for (let x = Math.round(W * 0.15); x < W * 0.85; x++) {
    const i = y * W + x, r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (r < 60 && g < 60 && b < 60 && Math.abs(r - b) < 20) m[i] = 1;
  }
  const lab = new Uint8Array(W * H), comps = [];
  for (let i = 0; i < W * H; i++) if (m[i] && !lab[i]) {
    let sx = 0, sy = 0, c = 0; const st = [i]; lab[i] = 1;
    while (st.length) { const j = st.pop(); sx += j % W; sy += (j / W) | 0; c++; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && m[k] && !lab[k]) { lab[k] = 1; st.push(k); } }
    comps.push({ x: sx / c, y: sy / c, c });
  }
  return comps.sort((a, b) => b.c - a.c).slice(0, 2).sort((a, b) => a.x - b.x);
}
function bilinear4(data, W, H, x, y, c) {
  if (x < 0 || y < 0 || x > W - 1.001 || y > H - 1.001) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, g = (xx, yy) => data[(yy * W + xx) * 4 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}
function quadFit(pts) {
  let S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (const [x, y] of pts) { const xs = [1, x, x * x, x * x * x, x * x * x * x]; for (let k = 0; k < 5; k++) S[k] += xs[k]; T[0] += y; T[1] += y * x; T[2] += y * x * x; }
  const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A), sol = [];
  for (let k = 0; k < 3; k++) { const M = A.map((row, i) => row.map((v, j) => (j === k ? T[i] : v))); sol.push(det(M) / D); }
  return x => sol[0] + sol[1] * x + sol[2] * x * x;
}
async function soften(mask, sigma) {   // mask 0/255 -> blurred Float32 0..1
  const b = await sharp(Buffer.from(mask), { raw: { width: CW, height: CH, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  const f = new Float32Array(CW * CH); for (let i = 0; i < CW * CH; i++) f[i] = b[i] / 255; return f;
}

(async () => {
  const report = {};
  for (const [view, V] of Object.entries(VIEWS)) {
    const er = await eyes(ROOT + V.ref), es = await eyes(ROOT + V.src);
    const vr = [er[1].x - er[0].x, er[1].y - er[0].y], vs = [es[1].x - es[0].x, es[1].y - es[0].y];
    const s = Math.hypot(...vs) / Math.hypot(...vr), rot = Math.atan2(vs[1], vs[0]) - Math.atan2(vr[1], vr[0]);
    const mr = [(er[0].x + er[1].x) / 2, (er[0].y + er[1].y) / 2], ms = [(es[0].x + es[1].x) / 2, (es[0].y + es[1].y) / 2];
    const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const toSrc = (x, y) => { const dx = x - mr[0], dy = y - mr[1]; return [ms[0] + cs * dx - sn * dy, ms[1] + sn * dx + cs * dy]; };
    const C = await sharp(V.cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cos = Buffer.alloc(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const [sx, sy] = toSrc(x + V.off[0], y + V.off[1]), p = (y * CW + x) * 4;
      for (let c = 0; c < 4; c++) cos[p + c] = Math.round(bilinear4(C.data, C.info.width, C.info.height, sx, sy, c));
    }
    const body = await sharp(`${ROOT}character/layers/${V.layers}/body_base.png`).ensureAlpha().raw().toBuffer();

    // purple mask + scarf bottom line (lowest purple pixel per column in the scarf band, smoothed), scarf tail kept whole
    const purple = new Uint8Array(CW * CH);
    for (let p = 0; p < CW * CH; p++) if (cos[p * 4 + 3] > 128 && isPurple(cos[p * 4], cos[p * 4 + 1], cos[p * 4 + 2])) purple[p] = 1;
    const scarfBot = new Float32Array(CW).fill(-1);
    for (let x = 0; x < CW; x++) for (let y = 600; y < 900; y++) if (purple[y * CW + x]) scarfBot[x] = y;
    // only the wrap (not the hanging tail): take the 30th percentile of the column runs in a 41 px window
    const wrap = new Float32Array(CW).fill(-1);
    for (let x = 0; x < CW; x++) { const w = []; for (let k = -20; k <= 20; k++) { const v = scarfBot[x + k]; if (v > 0) w.push(v); } if (w.length > 15) { w.sort((a, b) => a - b); wrap[x] = w[Math.floor(w.length * 0.3)]; } }

    // band outer edge fit (to drop the render's own antennae): top-most opaque pixel per column over the head
    let pts = []; for (let x = 200; x < 880; x += 3) for (let y = 0; y < CH; y++) if (cos[(y * CW + x) * 4 + 3] > 160) { pts.push([x, y]); break; }
    let fit = quadFit(pts);
    for (let it = 0; it < 5; it++) { pts = pts.filter(([x, y]) => y > fit(x) - 10); fit = quadFit(pts); }

    // top limit per column = top of the knit (beanie / cup cover) minus the band thickness → drops the render's antennae
    const knitTop = new Float32Array(CW).fill(-1);
    for (let x = 0; x < CW; x++) for (let y = +(process.env.KNIT_Y0 || 150); y < 620; y++) if (purple[y * CW + x]) { knitTop[x] = y; break; }
    const topLim = new Float32Array(CW);
    for (let x = 0; x < CW; x++) { let m = 1e9; for (let k = -25; k <= 25; k++) { const v = knitTop[x + k]; if (v > 0) m = Math.min(m, v); } topLim[x] = m < 1e9 ? m - MARGIN : 1e9; }
    // costume-weight mask: above the scarf wrap (or purple anywhere below, i.e. the tail), below the antenna line
    const use = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const p = y * CW + x; if (!cos[p * 4 + 3]) continue;
      if (y < topLim[x]) continue;
      if (y > 720 && !purple[p] && body[p * 4 + 3] < 20) continue;   // below the head: never outside our body outline
      if ((wrap[x] > 0 && y <= wrap[x] + 2) || purple[p] || (wrap[x] < 0 && y < 760)) use[p] = 255;
    }
    // drop small isolated costume specks (< 600 px)
    { const lab = new Int32Array(CW * CH).fill(-1);
      for (let s0 = 0; s0 < CW * CH; s0++) if (use[s0] && lab[s0] < 0) {
        const st = [s0], px = []; lab[s0] = 1;
        while (st.length) { const p = st.pop(); px.push(p); const x = p % CW, y = (p / CW) | 0;
          for (const q of [x > 0 ? p - 1 : -1, x < CW - 1 ? p + 1 : -1, y > 0 ? p - CW : -1, y < CH - 1 ? p + CW : -1]) if (q >= 0 && use[q] && lab[q] < 0) { lab[q] = 1; st.push(q); } }
        if (px.length < 600) for (const p of px) use[p] = 0;
      } }
    // our own body wins in the face zone (eyes / mouth / blush are separate layers on top) and in the arm zones
    const ours = new Uint8Array(CW * CH);
    const F = V.face;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const dx = (x - F.cx) / F.rx, dy = (y - F.cy) / F.ry; if (dx * dx + dy * dy < 1 && !purple[y * CW + x]) ours[y * CW + x] = 255; }
    // the render's own eyes / mouth (dark, low chroma) and pink mouth interior: always ours (dilated by the blur below)
    const featM = new Uint8Array(CW * CH);
    for (let y = 420; y < 800; y++) for (let x = 0; x < CW; x++) {
      const p = y * CW + x, r = cos[p * 4], g = cos[p * 4 + 1], b = cos[p * 4 + 2];
      if (((x - +(process.env.EYE_CX || 541)) / +(process.env.EYE_RX || 300)) ** 2 + ((y - 610) / 150) ** 2 < 1 && cos[p * 4 + 3] > 128 && !purple[p] && ((r < 110 && g < 110 && b < 110) || (r - g > 70 && r > 180))) {
        for (let dy = -22; dy <= 22; dy++) for (let dx = -22; dx <= 22; dx++) { const q = (y + dy) * CW + x + dx; if (q >= 0 && q < CW * CH && !purple[q]) { ours[q] = 255; featM[q] = 1; } }
      }
    }
    // where our body does not reach (the render's head is a little wider), paint the render's own eye/mouth out with
    // its neighbouring fur (nearest unmasked pixel to the left/right), so the costume can be used there instead
    for (let y = 420; y < 800; y++) for (let x = 0; x < CW; x++) {
      const p = y * CW + x; if (!featM[p] || body[p * 4 + 3] > 200) continue;
      for (let d = 1; d < 120; d++) { let q = -1; if (x - d >= 0 && !featM[p - d]) q = p - d; else if (x + d < CW && !featM[p + d]) q = p + d;
        if (q >= 0) { for (let c = 0; c < 3; c++) cos[p * 4 + c] = cos[q * 4 + c]; break; } }
    }
    for (const a of V.arms) {
      const am = await sharp(`${ROOT}character/layers/${V.layers}/${a}.png`).ensureAlpha().extractChannel(3).raw().toBuffer();
      for (let p = 0; p < CW * CH; p++) if (am[p] > 40 && !purple[p] && p >= +(process.env.ARM_Y0 || 0) * CW) ours[p] = 255;
    }
    const wUse = await soften(use, 3), wOurs = await soften(ours, 7);
    const out = Buffer.alloc(CW * CH * 4);
    for (let p = 0; p < CW * CH; p++) {
      const ac = cos[p * 4 + 3] / 255, ab = body[p * 4 + 3] / 255;
      // "ours" only where our body actually exists — outside it the costume stays (no holes)
      let w = wUse[p] * (1 - wOurs[p] * ab); if (purple[p] && use[p]) w = Math.max(w, 0.98 * wUse[p]);
      // costume OVER our body with opacity w: where the render is transparent our body still shows fully
      // inside our body use only the solid interior of the render (its matting fringe would draw a contour line)
      const acUse = ab > 0.5 ? Math.max(0, Math.min(1, (ac - 0.8) / 0.2)) : ac;
      const wc = w * acUse, a = wc + (1 - wc) * ab;
      if (a <= 0.003) continue;
      for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round((wc * cos[p * 4 + c] + (1 - wc) * ab * body[p * 4 + c]) / a);
      out[p * 4 + 3] = Math.round(a * 255);
    }
    // erase the render's antenna stubs on the band: columns that are opaque just above the cut line, painted over
    // row by row with a linear blend between the band pixels left and right of the stub
    {
      const stubCols = [];
      for (let x = 1; x < CW - 1; x++) { if (topLim[x] > 1e8) continue; const y = Math.round(topLim[x]) - 8; if (y > 0 && cos[(y * CW + x) * 4 + 3] > 200) stubCols.push(x); }
      const runs = []; for (const x of stubCols) { const r = runs[runs.length - 1]; if (r && x - r[1] <= 3) r[1] = x; else runs.push([x, x]); }
      for (const [r0, r1] of runs.filter(r => r[1] - r[0] > 10 && r[1] - r[0] < 70)) {
        const xL = Math.max(0, r0 - 8), xR = Math.min(CW - 1, r1 + 8);
        let y0 = 1e9, y1 = 0; for (let x = xL; x <= xR; x++) { y0 = Math.min(y0, topLim[x]); y1 = Math.max(y1, knitTop[x]); }
        for (let y = Math.max(0, Math.floor(y0)); y <= y1 + 2; y++) {
          const pl = (y * CW + xL - 1) * 4, pr = (y * CW + xR + 1) * 4;
          if (out[pl + 3] < 200 || out[pr + 3] < 200) continue;
          for (let x = xL; x <= xR; x++) { const t = (x - xL + 1) / (xR - xL + 2), p = (y * CW + x) * 4;
            for (let c = 0; c < 4; c++) out[p + c] = Math.round(out[pl + c] * (1 - t) + out[pr + c] * t); }
        }
      }
    }
    // band_over: the band + upper beanie around OUR antenna stems, drawn ABOVE the antennae in Rive so the stems
    // tuck behind the band instead of lying on top of the knit
    const over = Buffer.alloc(CW * CH * 4);
    {
      const stemX = new Uint8Array(CW);
      for (const a of ['antenna_L', 'antenna_R']) {
        const am = await sharp(`${ROOT}character/layers/${V.layers}/${a}.png`).ensureAlpha().extractChannel(3).raw().toBuffer();
        for (let y = 250; y < 380; y++) for (let x = 0; x < CW; x++) if (am[y * CW + x] > 100) for (let k = -45; k <= 45; k++) if (x + k >= 0 && x + k < CW) stemX[x + k] = 1;
      }
      for (let x = 0; x < CW; x++) { if (!stemX[x] || topLim[x] > 1e8) continue;
        for (let y = Math.max(0, Math.floor(topLim[x])); y < 385; y++) { const p = (y * CW + x) * 4; for (let c = 0; c < 4; c++) over[p + c] = out[p + c]; } }
    }
    const dir = `${ROOT}character/layers/costume/${band}/${view}/`;
    await sharp(out, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(dir + 'body_outfit.png');
    await sharp(over, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(dir + 'band_over.png');
    if (view === 'angle34') {
      fs.mkdirSync(`${ROOT}character/layers/costume/${band}/angle34R/`, { recursive: true });
      for (const f of ['body_outfit', 'band_over']) await sharp(dir + f + '.png').flop().png().toFile(`${ROOT}character/layers/costume/${band}/angle34R/${f}.png`);
    }
    // where the render's antenna stems cross the band top (for moving our antenna layers onto the new band):
    // opaque columns just above the cut line, grouped into two runs
    const stem = [];
    for (let x = 1; x < CW - 1; x++) { if (topLim[x] > 1e8) continue; const y = Math.round(topLim[x]) - 6; if (y > 0 && cos[(y * CW + x) * 4 + 3] > 200) stem.push(x); }
    const runs = []; for (const x of stem) { const r = runs[runs.length - 1]; if (r && x - r[1] <= 3) r[1] = x; else runs.push([x, x]); }
    const stems = runs.filter(r => r[1] - r[0] > 12).map(r => ({ x: (r[0] + r[1]) / 2, y: Math.round(topLim[Math.round((r[0] + r[1]) / 2)]) }));
    report[view] = { scale: +(1 / s).toFixed(3), stems };
    console.log(view, JSON.stringify(report[view]));
  }
})().catch(e => { console.error(e); process.exit(1); });
