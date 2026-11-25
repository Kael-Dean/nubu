// Extract registered eye / mouth layers for the 3/4-left view.
const sharp = require('sharp');
const fs = require('fs');
const SRC = 'D:/NUBU/character/source/angle34/';
const OUT = 'D:/NUBU/character/layers/angle34/face/';
const CANVAS_OFF = [57, 19];
const STD_FAR = [338, 567], STD_NEAR = [583, 594];   // eye centres of the reference render (source coords)
const EYE_WIN = { far: { c: STD_FAR, half: 80, rx: 55, ry: 75 }, near: { c: STD_NEAR, half: 92, rx: 75, ry: 75 } };
const MOUTH_ROI = { x0: 365, y0: 540, w: 185, h: 175 };

const JOBS = [
  { file: 'nubu_34L_m_closed_v1', eyes: 'open', mouth: 'm_closed' },
  { file: 'nubu_34L_a_small_v1', mouth: 'a_small' },
  { file: 'nubu_34L_a_wide_v1', mouth: 'a_wide' },
  { file: 'nubu_34L_o_round_v1', mouth: 'o_round' },
  { file: 'nubu_34L_e_smile_v1', mouth: 'e_smile' },
  { file: 'nubu_34L_blink_v1', eyes: 'blink', manual: [0, -36] },
];

function darkComps(data, W, H, x0, y0, x1, y1, thr, minN) {
  const dark = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = y * W + x; if ((data[p*3] + data[p*3+1] + data[p*3+2]) / 3 < thr) dark[p] = 1; }
  const seen = new Uint8Array(W * H), out = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const s = y * W + x; if (!dark[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1; let n = 0, sx = 0, sy = 0;
    while (st.length) { const p = st.pop(); n++; sx += p % W; sy += (p / W) | 0; for (const q of [p-1, p+1, p-W, p+W]) if (dark[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
    if (n >= minN) out.push({ n, cx: sx / n, cy: sy / n });
  }
  return out.sort((a, b) => b.n - a.n);
}
function bilinear(data, W, H, x, y, c) {
  x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, g = (xx, yy) => data[(yy * W + xx) * 3 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}
// std (reference frame) -> source (image) mapping
function makeMap(job, eyes) {
  if (job.manual) return (x, y) => [x + job.manual[0], y + job.manual[1]];
  const p1 = [eyes[0].cx, eyes[0].cy], p2 = [eyes[1].cx, eyes[1].cy], q1 = STD_FAR, q2 = STD_NEAR;
  const dp = [p2[0] - p1[0], p2[1] - p1[1]], dq = [q2[0] - q1[0], q2[1] - q1[1]];
  const s = Math.hypot(...dq) / Math.hypot(...dp), th = Math.atan2(dq[1], dq[0]) - Math.atan2(dp[1], dp[0]);
  const pm = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], qm = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
  const cos = Math.cos(-th), sin = Math.sin(-th);
  process.stdout.write(`  scale ${s.toFixed(3)} rot ${(th * 180 / Math.PI).toFixed(2)}deg\n`);
  return (x, y) => { const dx = (x - qm[0]) / s, dy = (y - qm[1]) / s; return [pm[0] + cos * dx - sin * dy, pm[1] + sin * dx + cos * dy]; };
}
function sampleWindow(img, map, x0, y0, w, h) {
  const rgb = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [sx, sy] = map(x0 + i, y0 + j); for (let c = 0; c < 3; c++) rgb[(j * w + i) * 3 + c] = bilinear(img.data, img.W, img.H, sx, sy, c); }
  return rgb;
}
function fillHoles(mask, w, h) {
  const reach = new Uint8Array(w * h), st = [];
  const push = (x, y) => { const p = y * w + x; if (!mask[p] && !reach[p]) { reach[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let p = 0; p < w * h; p++) if (!mask[p] && !reach[p]) mask[p] = 1;
}
function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = comps.length, st = [s]; lab[s] = id; const px = []; let touch = false, sx = 0, sy = 0;
    while (st.length) { const p = st.pop(); px.push(p); const x = p % w, y = (p / w) | 0; sx += x; sy += y; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && mask[q] && lab[q] < 0) { lab[q] = id; st.push(q); } }
    comps.push({ px, touch, n: px.length, cx: sx / px.length, cy: sy / px.length });
  }
  return comps;
}
async function toPng(rgb, mask, w, h, file) {
  const a = Buffer.alloc(w * h); for (let p = 0; p < w * h; p++) a[p] = mask[p] ? 255 : 0;
  const soft = await sharp(a, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const buf = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) { for (let c = 0; c < 3; c++) buf[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[p * 3 + c]))); buf[p * 4 + 3] = soft[p]; }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}
function featureMask(rgb, w, h, pink) {
  const m = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { const r = rgb[p*3], g = rgb[p*3+1], b = rgb[p*3+2], l = (r + g + b) / 3; if (l < 150) m[p] = 1; else if (pink && r - g > 60 && l < 225) m[p] = 1; }
  return m;
}

(async () => {
  fs.mkdirSync(OUT + 'eyes', { recursive: true }); fs.mkdirSync(OUT + 'mouths', { recursive: true });
  const manifest = { canvas: { w: 1080, h: 1269 }, eyes: {}, mouths: {} };
  for (const job of JOBS) {
    const { data, info } = await sharp(SRC + job.file + '.webp').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data, W: info.width, H: info.height };
    let eyes = null;
    if (!job.manual) {
      eyes = darkComps(data, img.W, img.H, 250, 440, 700, 720, 75, 1200).filter(c => c.cx < 700).slice(0, 2).sort((a, b) => a.cx - b.cx);
      if (eyes.length < 2) throw new Error('eyes not found in ' + job.file);
      process.stdout.write(`${job.file}: far (${eyes[0].cx.toFixed(0)},${eyes[0].cy.toFixed(0)}) near (${eyes[1].cx.toFixed(0)},${eyes[1].cy.toFixed(0)})\n`);
    } else process.stdout.write(`${job.file}: manual shift ${job.manual}\n`);
    const map = makeMap(job, eyes);
    if (job.eyes) {
      for (const side of ['far', 'near']) {
        const ew = EYE_WIN[side], x0 = ew.c[0] - ew.half, y0 = ew.c[1] - ew.half, w = ew.half * 2, h = ew.half * 2;
        const rgb = sampleWindow(img, map, x0, y0, w, h);
        const mask = featureMask(rgb, w, h, false);
        for (const c of components(mask, w, h)) {
          const gx = x0 + c.cx, gy = y0 + c.cy;
          const inside = ((gx - ew.c[0]) / ew.rx) ** 2 + ((gy - ew.c[1]) / ew.ry) ** 2 <= 1 || (job.eyes === 'blink' && ((gx - ew.c[0]) / ew.rx) ** 2 + ((gy - ew.c[1] - 25) / ew.ry) ** 2 <= 1);
          if (c.touch || c.n < 25 || !inside) for (const p of c.px) mask[p] = 0;
        }
        fillHoles(mask, w, h);
        const name = `eye_${job.eyes}_${side}`;
        await toPng(rgb, mask, w, h, OUT + 'eyes/' + name + '.png');
        manifest.eyes[name] = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
      }
    }
    if (job.mouth) {
      const { x0, y0, w, h } = MOUTH_ROI;
      const rgb = sampleWindow(img, map, x0, y0, w, h);
      const mask = featureMask(rgb, w, h, true);
      for (const c of components(mask, w, h)) if (c.touch || c.n < 12) for (const p of c.px) mask[p] = 0;
      fillHoles(mask, w, h);
      const name = `mouth_${job.mouth}`;
      await toPng(rgb, mask, w, h, OUT + 'mouths/' + name + '.png');
      manifest.mouths[name] = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
    }
  }
  fs.writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 2));
  console.log('done', Object.keys(manifest.eyes).length, 'eye layers,', Object.keys(manifest.mouths).length, 'mouths');
})();
