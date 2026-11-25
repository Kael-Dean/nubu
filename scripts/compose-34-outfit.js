// 3/4 outfit body that NEVER leaves the rig's original silhouette.
// base  = our body_base + our headphones (original geometry)
// on it = the AI render's band + beanie (above its cuff) and its near ear cup — but ONLY inside our silhouette
//         (body_base ∪ headphones ∪ cup_far alpha). Face / blush / everything below the cuff stays ours.
// out   = costume/<band>/angle34/body_outfit.png (+ band_over.png, angle34R mirrored)
// usage: node scripts/compose-34-outfit.js <band> <cutout34.png> <src34.webp>
const fs = require('fs');
const sharp = require('sharp');
const ROOT = 'D:/NUBU/';
const [band, cut34, src34] = process.argv.slice(2);
const CW = 1080, CH = 1269, OFF = [57, 19];
const L = `${ROOT}character/layers/angle34/`, dir = `${ROOT}character/layers/costume/${band}/angle34/`;
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
  // register the AI cutout onto the rig canvas by the eyes
  const er = await eyes(`${ROOT}character/source/nubu_3q-left_v1.webp`), es = await eyes(src34);
  const vr = [er[1].x - er[0].x, er[1].y - er[0].y], vs = [es[1].x - es[0].x, es[1].y - es[0].y];
  const s = Math.hypot(...vs) / Math.hypot(...vr), rot = Math.atan2(vs[1], vs[0]) - Math.atan2(vr[1], vr[0]);
  const mr = [(er[0].x + er[1].x) / 2, (er[0].y + er[1].y) / 2], ms = [(es[0].x + es[1].x) / 2, (es[0].y + es[1].y) / 2], cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  const C = await sharp(cut34).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ai = Buffer.alloc(CW * CH * 4);
  // the AI head is larger than ours relative to the eyes, so the headwear is placed by the CUPS instead:
  // horizontal = far-cup left edge .. near-cup right edge mapped onto ours, vertical = eye line, same scale
  // AFFINE="aiFarLeft,oursFarLeft,scale,aiEyeY,oursEyeY" (source px of the AI image -> rig canvas px)
  const AF = (process.env.AFFINE || '').split(',').map(Number);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const dx = x + OFF[0] - mr[0], dy = y + OFF[1] - mr[1], p = (y * CW + x) * 4;
    let sx = ms[0] + cs * dx - sn * dy, sy = ms[1] + sn * dx + cs * dy;
    if (AF.length === 5) { sx = AF[0] + (x - AF[1]) / AF[2]; sy = AF[3] + (y - AF[4]) / AF[2]; }
    for (let c = 0; c < 4; c++) ai[p + c] = Math.round(bil(C.data, C.info.width, C.info.height, sx, sy, c)); }

  const body = await load(L + 'body_base.png'), hp = await load(L + 'headphones.png'), cupFar = await load(L + 'cup_far.png'), fitNear = await load(dir + 'fit_cup_near.png');
  // rig silhouette (front-facing parts only; the far cup is behind the body and handled by fit_cup_far)
  const sil = new Float32Array(CW * CH);
  for (let p = 0; p < CW * CH; p++) sil[p] = Math.max(body[p * 4 + 3], hp[p * 4 + 3]) / 255;

  // AI beanie cuff bottom + knit top per column (knit below the antennae only)
  const kTop = new Int32Array(CW).fill(-1), kBot = new Int32Array(CW).fill(-1);
  for (let x = 0; x < CW; x++) for (let y = 245; y < 600; y++) { const p = (y * CW + x) * 4; if (ai[p + 3] > 128 && isPurple(ai[p], ai[p + 1], ai[p + 2]) && x < 760) { if (kTop[x] < 0) kTop[x] = y; kBot[x] = y; } }
  const smooth = (arr, r, f) => { const o = new Int32Array(CW).fill(-1); for (let x = 0; x < CW; x++) { const w = []; for (let k = -r; k <= r; k++) { const v = arr[x + k]; if (v > 0) w.push(v); } if (w.length > r) { w.sort((a, b) => a - b); o[x] = f(w); } } return o; };
  const top = smooth(kTop, 25, w => w[0]), bot = smooth(kBot, 8, w => w[w.length >> 1]);
  const MARGIN = +(process.env.MARGIN || 55);

  // AI weight: head-top (band + beanie) and near ear cup, inside the silhouette only
  const aiA = Buffer.alloc(CW * CH); for (let p = 0; p < CW * CH; p++) aiA[p] = ai[p * 4 + 3];
  const aiSolid = await sharp(aiA, { raw: { width: CW, height: CH, channels: 1 } }).blur(3).extractChannel(0).raw().toBuffer();
  // the render's own eyes / mouth (dark or pink, in the face zone, dilated) are never used: our face layers go there
  const featM = new Uint8Array(CW * CH);
  // every eye / mouth slot of our 3/4 face (all expressions) is always ours: the render's open mouth must never show under a closed one
  { const FM = JSON.parse(fs.readFileSync(L + 'face/manifest.json', 'utf8')); for (const g of ['eyes', 'mouths']) for (const k of Object.keys(FM[g])) { const b = FM[g][k], pad = g === 'mouths' ? 4 : 0;
      for (let y = Math.max(0, b.y - pad); y < Math.min(CH, b.y + b.h + pad); y++) for (let x = Math.max(0, b.x - pad); x < Math.min(CW, b.x + b.w + pad); x++) { const p = (y * CW + x) * 4, r = ai[p], g2 = ai[p + 1], bb = ai[p + 2]; if (!(bb > g2 + 22 && r > g2 + 8)) featM[y * CW + x] = 1; } } }
  for (let y = 430; y < 760; y++) for (let x = 150; x < 760; x++) { const p = (y * CW + x) * 4, r = ai[p], g = ai[p + 1], b = ai[p + 2];
    if (ai[p + 3] > 128 && !isPurple(r, g, b) && ((r < 100 && g < 100 && b < 100) || (r - g > 60 && r > 160 && g < 150))) for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) featM[(y + dy) * CW + x + dx] = 1; }
  const wAI = Buffer.alloc(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const p = y * CW + x; if (aiSolid[p] < 235 || sil[p] < 0.5) continue;   // only the solid interior of the render (its edge rim is ragged)
    const headTop = top[x] > 0 && y >= top[x] - MARGIN && y <= bot[x] + 2;
    const nearCup = x > 690 && y > 380 && y < 800 && (hp[p * 4 + 3] > 40 || fitNear[p * 4 + 3] > 40 || y < 470);   // our cup shape (+ band joint) only
    const full = process.env.FULLHEAD && y >= top[x] - MARGIN && y < +(process.env.FULLHEAD) && !(featM[p]);   // whole head from the render (face features excluded)
    if (headTop || nearCup || full) wAI[p] = 255;
  }
  const wS = await sharp(wAI, { raw: { width: CW, height: CH, channels: 1 } }).blur(2.5).extractChannel(0).raw().toBuffer();

  // compose: our body, our headphones over it, AI head-top / near cup over that — alpha never exceeds the silhouette
  const out = Buffer.alloc(CW * CH * 4);
  for (let p = 0; p < CW * CH; p++) {
    const ab = body[p * 4 + 3] / 255, ah = hp[p * 4 + 3] / 255;
    let base = [0, 1, 2].map(c => (body[p * 4 + c] * ab * (1 - ah) + hp[p * 4 + c] * ah) / Math.max(1e-6, ab * (1 - ah) + ah));
    { const af = fitNear[p * 4 + 3] / 255; if (af > 0) base = base.map((v, c) => v * (1 - af) + fitNear[p * 4 + c] * af); }   // our knit cup under the AI cup: no cream rim left over
    const aBase = ah + ab * (1 - ah), w = (wS[p] / 255) * Math.min(1, sil[p] * 1.2);
    for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round(base[c] * (1 - w) + ai[p * 4 + c] * w);
    out[p * 4 + 3] = Math.round(Math.min(1, aBase) * 255);   // coverage = rig silhouette exactly
    if (process.env.FULLHEAD) {   // whole-head mode: above the cut the render decides the coverage too (cups, band), clipped to our outline incl. the far cup
      const y = (p / CW) | 0, inSil = Math.max(sil[p], cupFar[p * 4 + 3] / 255);
      if (y < +process.env.FULLHEAD && !featM[p]) { const a = Math.min(ai[p * 4 + 3] / 255, inSil); out[p * 4 + 3] = Math.round(a * 255); for (let k = 0; k < 3; k++) out[p * 4 + k] = ai[p * 4 + k]; }
    }
  }
  await save(out, dir + 'body_outfit.png');
  // band_over: band + top knit around our antenna stems, drawn above the antennae so the stems tuck into the band
  const over = Buffer.alloc(CW * CH * 4);
  for (const a of ['antenna_L', 'antenna_R']) {
    const am = await load(L + a + '.png'); const xs = new Uint8Array(CW);
    for (let y = 240; y < 420; y++) for (let x = 0; x < CW; x++) if (am[(y * CW + x) * 4 + 3] > 100) for (let k = -40; k <= 40; k++) if (x + k >= 0 && x + k < CW) xs[x + k] = 1;
    for (let x = 0; x < CW; x++) if (xs[x] && top[x] > 0) for (let y = Math.max(0, top[x] - MARGIN); y < top[x] + 30; y++) { const p = (y * CW + x) * 4; if (wAI[y * CW + x]) for (let c = 0; c < 4; c++) over[p + c] = out[p + c]; }
  }
  await save(over, dir + 'band_over.png');
  fs.mkdirSync(`${ROOT}character/layers/costume/${band}/angle34R/`, { recursive: true });
  for (const f of ['body_outfit', 'band_over']) await sharp(dir + f + '.png').flop().png().toFile(`${ROOT}character/layers/costume/${band}/angle34R/${f}.png`);
  console.log('3/4 outfit body inside rig silhouette; scale', (1 / s).toFixed(3));
})().catch(e => { console.error(e); process.exit(1); });
