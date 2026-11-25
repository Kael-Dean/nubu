// Extract registered eye / mouth / tear layers from the Nubu expression renders.
// usage: node extract_faces.js
const sharp = require('sharp');
const fs = require('fs');
const SRC = 'D:/NUBU/character/source/expressions/';
const OUT = 'D:/NUBU/character/layers/face/';
const CANVAS_OFF = [57, 2];            // source coords -> body-layer canvas coords
const STD_EYE_L = [446, 588], STD_EYE_R = [750, 586];
const STD_MID = [(STD_EYE_L[0] + STD_EYE_R[0]) / 2, (STD_EYE_L[1] + STD_EYE_R[1]) / 2];
const STD_SPACING = STD_EYE_R[0] - STD_EYE_L[0];
const EYE_HALF = 92;
const MOUTH_ROI = { x0: 505, y0: 565, w: 190, h: 165 };

// image file -> { eyes: state|null, mouth: name, closedEyes?: true }
const JOBS = [
  { file: 'nubu_exp_neutral_v1', eyes: null, mouth: 'neutral' },
  { file: 'nubu_exp_happy_v1', eyes: null, mouth: 'happy' },
  { file: 'nubu_exp_swoon_v1', eyes: 'swoon', mouth: 'swoon' },
  { file: 'nubu_exp_shock_v1', eyes: 'shock', mouth: 'shock' },
  { file: 'nubu_exp_sad_v1', eyes: 'sad', mouth: 'sad' },
  { file: 'nubu_exp_pout_v2', eyes: 'pout', mouth: 'pout' },
  { file: 'nubu_exp_sleepy_v2', eyes: 'sleepy', mouth: 'sleepy', closedEyes: true },
  { file: 'nubu_exp_laugh_v1', eyes: 'laugh', mouth: 'laugh', closedEyes: true },
  { file: 'nubu_mouth_m_closed_v1', eyes: 'open', mouth: 'm_closed' },
  { file: 'nubu_mouth_a_small_v1', eyes: null, mouth: 'a_small' },
  { file: 'nubu_mouth_a_wide_v1', eyes: null, mouth: 'a_wide' },
  { file: 'nubu_mouth_o_round_v1', eyes: null, mouth: 'o_round' },
  { file: 'nubu_mouth_u_pursed_v2', eyes: null, mouth: 'u_pursed' },
  { file: 'nubu_mouth_e_smile_v1', eyes: null, mouth: 'e_smile' },
  { file: 'nubu_mouth_tongue_v1', eyes: null, mouth: 'tongue' },
  { file: 'nubu_mouth_f_teeth_v1', eyes: null, mouth: 'f_teeth' },
  { file: 'nubu_mouth_tongue_up_v1', eyes: null, mouth: 'tongue_up' },
  { file: 'nubu_mouth_s_teeth_v1', eyes: null, mouth: 's_teeth' },
  { file: 'nubu_mouth_a_mid_v1', eyes: null, mouth: 'a_mid' },
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
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const g = (xx, yy) => data[(yy * W + xx) * 3 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}

// sample a window of the standard frame from the source image through the registration transform
function sampleWindow(img, tf, x0, y0, w, h) {
  const rgb = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = tf.m[0] + (x0 + i - STD_MID[0]) / tf.s, sy = tf.m[1] + (y0 + j - STD_MID[1]) / tf.s;
    for (let c = 0; c < 3; c++) rgb[(j * w + i) * 3 + c] = bilinear(img.data, img.W, img.H, sx, sy, c);
  }
  return rgb;
}

function fillHoles(mask, w, h) {
  const reach = new Uint8Array(w * h), st = [];
  const push = (x, y) => { const p = y * w + x; if (!mask[p] && !reach[p]) { reach[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let p = 0; p < w * h; p++) if (!mask[p] && !reach[p]) mask[p] = 1;
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

async function toPng(rgb, mask, w, h, file) {
  const a = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) a[p] = mask[p] ? 255 : 0;
  const soft = await sharp(a, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const buf = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) { for (let c = 0; c < 3; c++) buf[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[p * 3 + c]))); buf[p * 4 + 3] = soft[p]; }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}

function featureMask(rgb, w, h, opts) {
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2], l = (r + g + b) / 3;
    if (l < 150) mask[p] = 1;
    else if (opts.tears && b - r > 3 && l > 120) mask[p] = 1;
    else if (opts.pink && r - g > 60 && l < 225) mask[p] = 1;
  }
  return mask;
}

(async () => {
  fs.mkdirSync(OUT + 'eyes', { recursive: true }); fs.mkdirSync(OUT + 'mouths', { recursive: true });
  const manifest = { canvas: { w: 1080, h: 1269 }, eyes: {}, mouths: {} };
  for (const job of JOBS) {
    const { data, info } = await sharp(SRC + job.file + '.webp').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data, W: info.width, H: info.height };
    let tf;
    if (job.closedEyes) tf = { s: 1, m: STD_MID };
    else {
      const eyes = darkComps(data, img.W, img.H, 300, 440, 900, 760, 70, 2500).slice(0, 2).sort((a, b) => a.cx - b.cx);
      if (eyes.length < 2) throw new Error('eyes not found in ' + job.file);
      const spacing = eyes[1].cx - eyes[0].cx;
      tf = { s: Math.max(0.9, Math.min(1.12, STD_SPACING / spacing)), m: [(eyes[0].cx + eyes[1].cx) / 2, (eyes[0].cy + eyes[1].cy) / 2] };
      process.stdout.write(`${job.file}: eyes (${eyes[0].cx.toFixed(0)},${eyes[0].cy.toFixed(0)}) (${eyes[1].cx.toFixed(0)},${eyes[1].cy.toFixed(0)}) scale ${tf.s.toFixed(3)}\n`);
    }
    // eyes
    if (job.eyes) {
      for (const [side, std] of [['L', STD_EYE_L], ['R', STD_EYE_R]]) {
        const x0 = std[0] - EYE_HALF, y0 = std[1] - EYE_HALF, w = EYE_HALF * 2, h = EYE_HALF * 2;
        const rgb = sampleWindow(img, tf, x0, y0, w, h);
        const mask = featureMask(rgb, w, h, { tears: job.eyes === 'sad' });
        // drop components touching the border (fur bits) and tiny specks
        for (const c of components(mask, w, h)) if (c.touch || c.n < 25) for (const p of c.px) mask[p] = 0;
        fillHoles(mask, w, h);
        const name = `eye_${job.eyes}_${side}`;
        await toPng(rgb, mask, w, h, OUT + 'eyes/' + name + '.png');
        manifest.eyes[name] = { x: x0 - CANVAS_OFF[0], y: y0 - CANVAS_OFF[1], w, h };
      }
    }
    // mouth
    {
      const { x0, y0, w, h } = MOUTH_ROI;
      const rgb = sampleWindow(img, tf, x0, y0, w, h);
      const mask = featureMask(rgb, w, h, { tears: false, pink: true });
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
