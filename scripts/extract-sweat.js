// Extract the "sweat" expression (tired half-closed eyes, wavy mouth, blue sweat drop) into the front face layers.
// usage: node scripts/extract-sweat.js
// The sweat render has narrower eye lines than the open-eye renders, so it is NOT registered by eye spacing:
// scale = body width ratio vs the bare-body plate (the render's body came out ~5% smaller), eye midpoint -> standard midpoint.
// Adds eye_sweat_L/R, mouth_sweat and fx_sweatdrop to character/layers/face/ + manifest.json (same frame as extract-faces.js).
const fs = require('fs');
const sharp = require('sharp');

const SRC = 'D:/NUBU/character/source/expressions/nubu_exp_sweat_v1.webp';
const PLATE = 'D:/NUBU/character/source/nubu_front_barebody_v1.webp';
const OUT = 'D:/NUBU/character/layers/face/';
const CANVAS_OFF = [57, 2];
const STD_EYE_L = [446, 588], STD_EYE_R = [750, 586];
const STD_MID = [(STD_EYE_L[0] + STD_EYE_R[0]) / 2, (STD_EYE_L[1] + STD_EYE_R[1]) / 2];
const EYE_HALF = 92;
const MOUTH_ROI = { x0: 505, y0: 565, w: 190, h: 165 };
const DROP_ROI = { x0: 700, y0: 360, w: 180, h: 210 };

function bilinear(data, W, H, x, y, c) {
  x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, g = (xx, yy) => data[(yy * W + xx) * 3 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}
function sampleWindow(img, tf, x0, y0, w, h) {
  const rgb = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = tf.m[0] + (x0 + i - STD_MID[0]) / tf.s, sy = tf.m[1] + (y0 + j - STD_MID[1]) / tf.s;
    for (let c = 0; c < 3; c++) rgb[(j * w + i) * 3 + c] = bilinear(img.data, img.W, img.H, sx, sy, c);
  }
  return rgb;
}
function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = comps.length, st = [s]; lab[s] = id; const px = []; let touch = false;
    while (st.length) { const p = st.pop(); px.push(p); const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && mask[q] && lab[q] < 0) { lab[q] = id; st.push(q); } }
    comps.push({ px, touch, n: px.length });
  }
  return comps;
}
function fillHoles(mask, w, h) {
  const reach = new Uint8Array(w * h), st = [];
  const push = (x, y) => { const p = y * w + x; if (!mask[p] && !reach[p]) { reach[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let p = 0; p < w * h; p++) if (!mask[p] && !reach[p]) mask[p] = 1;
}
async function toPng(rgb, mask, w, h, file) {
  const a = Buffer.alloc(w * h); for (let p = 0; p < w * h; p++) a[p] = mask[p] ? 255 : 0;
  const soft = await sharp(a, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const buf = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) { for (let c = 0; c < 3; c++) buf[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[p * 3 + c]))); buf[p * 4 + 3] = soft[p]; }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}
async function bodyWidth(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; let best = 0;
  for (let y = Math.round(H * 0.45); y < H * 0.75; y += 4) { let x0 = -1, x1 = -1;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; const l = (data[i] + data[i + 1] + data[i + 2]) / 3; if (l > 215) { if (x0 < 0) x0 = x; x1 = x; } }
    if (x0 >= 0) best = Math.max(best, x1 - x0); }
  return best;
}

(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data, W: info.width, H: info.height };
  // eye-line centres (dark, low chroma)
  const W = img.W, H = img.H, m = new Uint8Array(W * H);
  for (let y = 450; y < 680; y++) for (let x = 250; x < 950; x++) { const i = y * W + x, r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]; if (r < 70 && g < 70 && b < 70) m[i] = 1; }
  const eyes = components(m, W, H).filter(c => c.n > 80).sort((a, b) => b.n - a.n).slice(0, 2)
    .map(c => ({ x: c.px.reduce((s, p) => s + p % W, 0) / c.n, y: c.px.reduce((s, p) => s + ((p / W) | 0), 0) / c.n })).sort((a, b) => a.x - b.x);
  const s = (await bodyWidth(PLATE)) / (await bodyWidth(SRC));
  const tf = { s, m: [(eyes[0].x + eyes[1].x) / 2, (eyes[0].y + eyes[1].y) / 2] };
  console.log(`sweat: eye lines (${eyes.map(e => e.x.toFixed(0) + ',' + e.y.toFixed(0)).join(') (')}) body scale ${s.toFixed(3)}`);

  const manifest = JSON.parse(fs.readFileSync(OUT + 'manifest.json', 'utf8'));
  manifest.fx ||= {};
  for (const [side, std] of [['L', STD_EYE_L], ['R', STD_EYE_R]]) {
    const x0 = std[0] - EYE_HALF, y0 = std[1] - EYE_HALF, w = EYE_HALF * 2, h = EYE_HALF * 2;
    const rgb = sampleWindow(img, tf, x0, y0, w, h), mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) if ((rgb[p * 3] + rgb[p * 3 + 1] + rgb[p * 3 + 2]) / 3 < 150) mask[p] = 1;
    for (const c of components(mask, w, h)) if (c.touch || c.n < 25) for (const p of c.px) mask[p] = 0;
    fillHoles(mask, w, h);
    const name = `eye_sweat_${side}`;
    await toPng(rgb, mask, w, h, OUT + 'eyes/' + name + '.png');
    manifest.eyes[name] = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
  }
  {
    const { x0, y0, w, h } = MOUTH_ROI;
    const rgb = sampleWindow(img, tf, x0, y0, w, h), mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) { const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2]; if ((r + g + b) / 3 < 150 || (r - g > 60 && (r + g + b) / 3 < 225)) mask[p] = 1; }
    for (const c of components(mask, w, h)) if (c.touch || c.n < 12) for (const p of c.px) mask[p] = 0;
    fillHoles(mask, w, h);
    await toPng(rgb, mask, w, h, OUT + 'mouths/mouth_sweat.png');
    manifest.mouths.mouth_sweat = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
  }
  {
    const { x0, y0, w, h } = DROP_ROI;
    const rgb = sampleWindow(img, tf, x0, y0, w, h), mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) { const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2]; if (b - r > 25) mask[p] = 1; }
    const comps = components(mask, w, h).sort((a, b) => b.n - a.n);
    for (const c of comps.slice(1)) for (const p of c.px) mask[p] = 0;   // keep the drop only
    fillHoles(mask, w, h);
    fs.mkdirSync(OUT + 'fx', { recursive: true });
    await toPng(rgb, mask, w, h, OUT + 'fx/fx_sweatdrop.png');
    manifest.fx.fx_sweatdrop = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
    console.log('drop px', comps[0] ? comps[0].n : 0, comps[0] && comps[0].touch ? '(touches ROI edge — enlarge ROI)' : '');
  }
  fs.writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 2));
  console.log('done: eye_sweat_L/R, mouth_sweat, fx_sweatdrop');
})().catch(e => { console.error(e); process.exit(1); });
