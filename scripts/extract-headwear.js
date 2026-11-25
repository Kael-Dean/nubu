// Build ONE "headwear" layer per view (headphone band + beanie + ear cups) straight from the costume render,
// so the outfit replaces the original cream headphones instead of being stacked on top of them.
// usage: node scripts/extract-headwear.js <band> <cutoutFront.png> <cutout34.png>
//   cutouts = scripts/cutout.js output of character/source/costumes/nubu_costume_<band>_{front,34L}_v4.webp
// out (character/layers/costume/<band>/):
//   front/headwear.png                     → goes in the slot ABOVE the (hidden) headphones, BELOW the face
//   angle34/headwear.png, angle34/headwear_far.png (far cup, drawn behind the body)
//   front|angle34 beanie.png / cups.png / cup_near.png / cup_far.png are replaced by transparent images
// Registration = similarity from the two eye centres (same as extract-costume.js).
// Region = everything of the render above the beanie cuff + the ear cups, minus the antennae (above a robust
// quadratic fit of the band's outer edge).
const fs = require('fs');
const sharp = require('sharp');

const ROOT = 'D:/NUBU/';
const [band, cutFront, cut34] = process.argv.slice(2);
const CW = 1080, CH = 1269;
const isPurple = (r, g, b) => b > g + 22 && r > g + 8;

const VIEWS = {
  front: { ref: 'character/source/nubu_front_v1.webp', src: `character/source/costumes/nubu_costume_${band}_front_v4.webp`, cut: cutFront, off: [57, 2],
    beanieMaxY: 560, cupSide: x => (x < 330 ? 'L' : x > 870 ? 'R' : null) },
  angle34: { ref: 'character/source/nubu_3q-left_v1.webp', src: `character/source/costumes/nubu_costume_${band}_34L_v4.webp`, cut: cut34, off: [57, 19],
    beanieMaxY: 545, cupSide: x => (x < 270 ? 'far' : x > 760 ? 'near' : null) },
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
function quadFit(pts) {           // least squares y = a + b x + c x^2
  let S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (const [x, y] of pts) { const xs = [1, x, x * x, x * x * x, x * x * x * x]; for (let k = 0; k < 5; k++) S[k] += xs[k]; T[0] += y; T[1] += y * x; T[2] += y * x * x; }
  const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A), sol = [];
  for (let k = 0; k < 3; k++) { const M = A.map((row, i) => row.map((v, j) => (j === k ? T[i] : v))); sol.push(det(M) / D); }
  return x => sol[0] + sol[1] * x + sol[2] * x * x;
}
async function save(buf, file) { await sharp(buf, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(file); }

(async () => {
  for (const [view, V] of Object.entries(VIEWS)) {
    const er = await eyes(ROOT + V.ref), es = await eyes(ROOT + V.src);
    const vr = [er[1].x - er[0].x, er[1].y - er[0].y], vs = [es[1].x - es[0].x, es[1].y - es[0].y];
    const s = Math.hypot(...vs) / Math.hypot(...vr), rot = Math.atan2(vs[1], vs[0]) - Math.atan2(vr[1], vr[0]);
    const mr = [(er[0].x + er[1].x) / 2, (er[0].y + er[1].y) / 2], ms = [(es[0].x + es[1].x) / 2, (es[0].y + es[1].y) / 2];
    const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const toSrc = (x, y) => { const dx = x - mr[0], dy = y - mr[1]; return [ms[0] + cs * dx - sn * dy, ms[1] + sn * dx + cs * dy]; };
    const C = await sharp(V.cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = Buffer.alloc(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const [sx, sy] = toSrc(x + V.off[0], y + V.off[1]), p = (y * CW + x) * 4;
      for (let c = 0; c < 4; c++) img[p + c] = Math.round(bilinear4(C.data, C.info.width, C.info.height, sx, sy, c));
    }
    const R = (x, y) => [x + V.off[0], y + V.off[1]];   // canvas -> reference source coords
    // beanie cuff bottom per column (lowest purple pixel above beanieMaxY, not in the cup columns)
    const cuff = new Float32Array(CW).fill(-1);
    for (let x = 0; x < CW; x++) { const [rx] = R(x, 0); if (V.cupSide(rx)) continue;
      for (let y = 0; y < CH; y++) { const [, ry] = R(x, y); if (ry > V.beanieMaxY) break; const p = (y * CW + x) * 4;
        if (img[p + 3] > 128 && isPurple(img[p], img[p + 1], img[p + 2])) cuff[x] = y; } }
    // smooth the cuff line (median of 15) and remember the beanie span
    const cuffS = new Float32Array(CW).fill(-1); let bx0 = CW, bx1 = -1;
    for (let x = 0; x < CW; x++) { const w = []; for (let k = -7; k <= 7; k++) { const v = cuff[x + k]; if (v > 0) w.push(v); }
      if (w.length > 7) { w.sort((a, b) => a - b); cuffS[x] = w[w.length >> 1]; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); } }
    // band outer edge: top-most opaque pixel per column inside the beanie span, robust quadratic fit (drops antennae)
    let pts = []; for (let x = bx0; x <= bx1; x += 3) for (let y = 0; y < CH; y++) if (img[(y * CW + x) * 4 + 3] > 160) { pts.push([x, y]); break; }
    let fit = quadFit(pts);
    for (let it = 0; it < 4; it++) { pts = pts.filter(([x, y]) => y > fit(x) - 12); fit = quadFit(pts); }
    const near = [], far = [];
    const out = Buffer.alloc(CW * CH * 4), outFar = Buffer.alloc(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const p = (y * CW + x) * 4; if (!img[p + 3]) continue;
      const [rx, ry] = R(x, y), side = V.cupSide(rx);
      let a = 0;
      if (side) { if (ry > 360 && ry < 790) a = 1; }                                 // ear cup column: whole cup incl. cream rim
      else if (cuffS[x] > 0) { if (y <= cuffS[x] + 1 && y >= fit(x) - 3) a = 1; }    // band + beanie, antennae removed
      else if (ry < 600 && (x < bx0 || x > bx1) && y >= fit(Math.max(bx0, Math.min(bx1, x))) - 3) a = 1; // band legs beside the beanie
      if (!a) continue;
      const dst = view === 'angle34' && side === 'far' ? outFar : out;
      for (let c = 0; c < 4; c++) dst[p + c] = img[p + c];
    }
    const dir = `${ROOT}character/layers/costume/${band}/${view}/`;
    await save(out, dir + 'headwear.png');
    if (view === 'angle34') await save(outFar, dir + 'headwear_far.png');
    console.log(`${view}: scale ${(1 / s).toFixed(3)} beanie span ${bx0}-${bx1} -> headwear.png${view === 'angle34' ? ' + headwear_far.png' : ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
