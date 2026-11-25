// 3/4 view headwear from the AI costume render (its band already lies ON the beanie and hides behind it on the far
// side). The render's cups line up with ours (scale ~1.02), so:
//   headwear34.png  = render band + beanie (above the cuff), antennae removed, antenna stubs on the band erased
//   hp_cups34.png   = OUR headphones layer with the band removed (near cup only) — knit cover is fit_cup_near.png
//   band_over34.png = band strip around our antenna stems, drawn ABOVE the antennae so the stems tuck into the band
// usage: node scripts/headwear-34.js <band> <cutout34.png>
const sharp = require('sharp');
const ROOT = 'D:/NUBU/';
const [band, cut34] = process.argv.slice(2);
const CW = 1080, CH = 1269, OFF = [57, 19];
const dir = `${ROOT}character/layers/costume/${band}/angle34/`;
const isPurple = (r, g, b) => b > g + 22 && r > g + 8 && (0.3 * r + 0.59 * g + 0.11 * b) < 195;
const load = async f => (await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const save = (b, f) => sharp(b, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(f);

async function eyes(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, m = new Uint8Array(W * H);
  for (let y = Math.round(H * 0.3); y < H * 0.65; y++) for (let x = Math.round(W * 0.15); x < W * 0.85; x++) { const i = y * W + x, r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]; if (r < 60 && g < 60 && b < 60 && Math.abs(r - b) < 20) m[i] = 1; }
  const lab = new Uint8Array(W * H), comps = [];
  for (let i = 0; i < W * H; i++) if (m[i] && !lab[i]) { let sx = 0, sy = 0, c = 0; const st = [i]; lab[i] = 1;
    while (st.length) { const j = st.pop(); sx += j % W; sy += (j / W) | 0; c++; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && m[k] && !lab[k]) { lab[k] = 1; st.push(k); } }
    comps.push({ x: sx / c, y: sy / c, c }); }
  return comps.sort((a, b) => b.c - a.c).slice(0, 2).sort((a, b) => a.x - b.x);
}
function bil(d, W, H, x, y, c) { if (x < 0 || y < 0 || x > W - 1.001 || y > H - 1.001) return 0; const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, g = (a, b) => d[(b * W + a) * 4 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy; }

(async () => {
  const er = await eyes(`${ROOT}character/source/nubu_3q-left_v1.webp`), es = await eyes(`${ROOT}character/source/costumes/nubu_costume_${band}_34L_v4.webp`);
  const vr = [er[1].x - er[0].x, er[1].y - er[0].y], vs = [es[1].x - es[0].x, es[1].y - es[0].y];
  const s = Math.hypot(...vs) / Math.hypot(...vr), rot = Math.atan2(vs[1], vs[0]) - Math.atan2(vr[1], vr[0]);
  const mr = [(er[0].x + er[1].x) / 2, (er[0].y + er[1].y) / 2], ms = [(es[0].x + es[1].x) / 2, (es[0].y + es[1].y) / 2], cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  const C = await sharp(cut34).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cos = Buffer.alloc(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const dx = x + OFF[0] - mr[0], dy = y + OFF[1] - mr[1], sx = ms[0] + cs * dx - sn * dy, sy = ms[1] + sn * dx + cs * dy, p = (y * CW + x) * 4;
    for (let c = 0; c < 4; c++) cos[p + c] = Math.round(bil(C.data, C.info.width, C.info.height, sx, sy, c)); }

  // knit top / cuff bottom per column over the beanie span (x 150..780 — beyond that are the cups)
  const kTop = new Int32Array(CW).fill(-1), kBot = new Int32Array(CW).fill(-1);
  for (let x = 150; x < 790; x++) for (let y = 150; y < 560; y++) { const p = (y * CW + x) * 4; if (cos[p + 3] > 128 && isPurple(cos[p], cos[p + 1], cos[p + 2])) { if (kTop[x] < 0) kTop[x] = y; kBot[x] = y; } }
  // band = opaque non-knit pixels from the knit top up to BAND px above it; antennae rise higher and are dropped
  const BAND = +(process.env.BAND || 58);
  const hw = Buffer.alloc(CW * CH * 4);
  for (let x = 120; x < 820; x++) {
    // smooth top reference: min knit top within ±30 px (columns at the beanie ends have no knit)
    let ref = 1e9; for (let k = -30; k <= 30; k++) { const v = kTop[x + k]; if (v > 0) ref = Math.min(ref, v); }
    if (ref > 1e8) continue;
    let bot = -1; for (let k = -6; k <= 6; k++) bot = Math.max(bot, kBot[x + k]);
    for (let y = Math.max(0, ref - BAND); y <= Math.max(bot, ref) + 1; y++) { const p = (y * CW + x) * 4; if (cos[p + 3] < 8) continue; for (let c = 0; c < 4; c++) hw[p + c] = cos[p + c]; }
  }
  // erase antenna stubs on the band: narrow opaque runs just above the band top
  const stubRow = x => { let ref = 1e9; for (let k = -30; k <= 30; k++) { const v = kTop[x + k]; if (v > 0) ref = Math.min(ref, v); } return ref - BAND - 4; };
  const cols = []; for (let x = 121; x < 819; x++) { const y = stubRow(x); if (y > 0 && y < 1e8 && cos[(y * CW + x) * 4 + 3] > 200) cols.push(x); }
  const runs = []; for (const x of cols) { const r = runs[runs.length - 1]; if (r && x - r[1] <= 3) r[1] = x; else runs.push([x, x]); }
  for (const [r0, r1] of runs.filter(r => r[1] - r[0] > 8 && r[1] - r[0] < 70)) {
    const xL = r0 - 6, xR = r1 + 6; let y0 = 1e9, y1 = 0; for (let x = xL; x <= xR; x++) { const t = stubRow(x) + 4; y0 = Math.min(y0, t); y1 = Math.max(y1, kTop[x] > 0 ? kTop[x] : t + BAND); }
    for (let y = y0; y <= y1; y++) { const pl = (y * CW + xL - 1) * 4, pr = (y * CW + xR + 1) * 4; if (hw[pl + 3] < 200 || hw[pr + 3] < 200) continue;
      for (let x = xL; x <= xR; x++) { const t = (x - xL + 1) / (xR - xL + 2), p = (y * CW + x) * 4; for (let c = 0; c < 4; c++) hw[p + c] = Math.round(hw[pl + c] * (1 - t) + hw[pr + c] * t); } }
  }
  await save(hw, dir + 'headwear34.png');
  // our headphones without the band: keep the near cup (oval area) only
  const hp = await load(`${ROOT}character/layers/angle34/headphones.png`);
  const cupOnly = Buffer.alloc(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const p = (y * CW + x) * 4; if (x > 690 && y > 410) for (let c = 0; c < 4; c++) cupOnly[p + c] = hp[p + c]; }
  await save(cupOnly, dir + 'hp_cups34.png');
  // band_over: band strip around our antenna stems (drawn above the antennae)
  const over = Buffer.alloc(CW * CH * 4);
  for (const a of ['antenna_L', 'antenna_R']) {
    const am = await load(`${ROOT}character/layers/angle34/${a}.png`);
    const xs = new Uint8Array(CW); for (let y = 240; y < 420; y++) for (let x = 0; x < CW; x++) if (am[(y * CW + x) * 4 + 3] > 100) for (let k = -40; k <= 40; k++) if (x + k >= 0 && x + k < CW) xs[x + k] = 1;
    for (let x = 0; x < CW; x++) if (xs[x]) for (let y = 0; y < 460; y++) { const p = (y * CW + x) * 4; if (hw[p + 3] && !isPurple(hw[p], hw[p + 1], hw[p + 2])) for (let c = 0; c < 4; c++) over[p + c] = hw[p + c]; }
  }
  await save(over, dir + 'band_over34.png');
  console.log('3/4 headwear: scale', (1 / s).toFixed(3), 'stubs erased', runs.filter(r => r[1] - r[0] > 8 && r[1] - r[0] < 70).length);
})().catch(e => { console.error(e); process.exit(1); });
