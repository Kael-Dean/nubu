// Extract per-band costume layers (beanie, scarf, ear-cup covers) from an AI render of Nubu wearing the costume.
// usage: node scripts/extract-costume.js <band> [debug]
//   front: character/source/costumes/nubu_costume_<band>_front_v4.webp  (registered to nubu_front_v1 by the two eye centres)
//   3/4  : character/source/costumes/nubu_costume_<band>_34L_v4.webp    (registered to nubu_3q-left_v1 by the two eye centres)
// out: character/layers/costume/<band>/{front,angle34}/*.png — full-canvas 1080x1269 layers, same canvas as the body layers
//   front canvas = source - (57,2) · 3/4 canvas = source - (57,19)
// Costume pixels = saturated purple / lavender (b > g+22 and r > g+8); the glowing antennae are excluded by region
// (pixels above the headphone band are not costume) and by keeping only components connected to the big costume blobs.
const fs = require('fs');
const sharp = require('sharp');

const ROOT = 'D:/NUBU/';
const band = process.argv[2] || 'bts';
const DEBUG = process.argv[3] === 'debug';
const CW = 1080, CH = 1269;

const VIEWS = {
  front: {
    ref: 'character/source/nubu_front_v1.webp',
    src: `character/source/costumes/nubu_costume_${band}_front_v4.webp`,
    off: [57, 2],
    // split rules in REFERENCE source coords (eye line ~ y 588, mouth bottom ~ y 700, cups at x < 300 / x > 900)
    split: (x, y) => (x < 330 || x > 870) && y > 380 && y < 760 ? 'cups' : y < 560 ? 'beanie' : 'scarf',
  },
  angle34: {
    ref: 'character/source/nubu_3q-left_v1.webp',
    src: `character/source/costumes/nubu_costume_${band}_34L_v4.webp`,
    off: [57, 19],
    // near cup on the right side of the image, far cup on the left edge
    split: (x, y) => (x > 760 && y > 380 && y < 780) ? 'cup_near' : (x < 270 && y > 380 && y < 720) ? 'cup_far' : y < 545 ? 'beanie' : 'scarf',
  },
};

async function eyes(data, W, H) {
  const m = new Uint8Array(W * H);
  for (let y = Math.round(H * 0.3); y < H * 0.65; y++) for (let x = Math.round(W * 0.15); x < W * 0.85; x++) {
    const i = y * W + x, r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (r < 60 && g < 60 && b < 60 && Math.abs(r - b) < 20) m[i] = 1;
  }
  const lab = new Int32Array(W * H), comps = [];
  for (let i = 0; i < W * H; i++) if (m[i] && !lab[i]) {
    let sx = 0, sy = 0, c = 0; const st = [i]; lab[i] = 1;
    while (st.length) { const j = st.pop(); sx += j % W; sy += (j / W) | 0; c++; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && m[k] && !lab[k]) { lab[k] = 1; st.push(k); } }
    comps.push({ x: sx / c, y: sy / c, c });
  }
  return comps.sort((a, b) => b.c - a.c).slice(0, 2).sort((a, b) => a.x - b.x);
}

function bilinear(data, W, H, x, y, c) {
  x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, g = (xx, yy) => data[(yy * W + xx) * 3 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}

const isCostume = (r, g, b) => b > g + 22 && r > g + 8;

(async () => {
  for (const [view, V] of Object.entries(VIEWS)) {
    if (!fs.existsSync(ROOT + V.src)) { console.log('skip', view, '(no source)'); continue; }
    const R = await sharp(ROOT + V.ref).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const S = await sharp(ROOT + V.src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = S.info.width, H = S.info.height;
    const er = await eyes(R.data, R.info.width, R.info.height), es = await eyes(S.data, W, H);
    // similarity transform ref -> src (scale + rotation + translation from the two eye centres)
    const vr = [er[1].x - er[0].x, er[1].y - er[0].y], vs = [es[1].x - es[0].x, es[1].y - es[0].y];
    const s = Math.hypot(...vs) / Math.hypot(...vr), rot = Math.atan2(vs[1], vs[0]) - Math.atan2(vr[1], vr[0]);
    const mr = [(er[0].x + er[1].x) / 2, (er[0].y + er[1].y) / 2], ms = [(es[0].x + es[1].x) / 2, (es[0].y + es[1].y) / 2];
    const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const toSrc = (x, y) => { const dx = x - mr[0], dy = y - mr[1]; return [ms[0] + cs * dx - sn * dy, ms[1] + sn * dx + cs * dy]; };
    console.log(`${view}: scale ${(1 / s).toFixed(3)} rot ${(rot * 180 / Math.PI).toFixed(2)}° eyes ref ${er.map(e => e.x.toFixed(0) + ',' + e.y.toFixed(0))} src ${es.map(e => e.x.toFixed(0) + ',' + e.y.toFixed(0))}`);

    // resample costume render into the reference frame (canvas coords)
    const rgb = new Float32Array(CW * CH * 3), mask = new Uint8Array(CW * CH);
    let bandTop = CH; // top of the headphone band area is approximated by the topmost costume pixel row with a wide run
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const [sx, sy] = toSrc(x + V.off[0], y + V.off[1]);
      const p = y * CW + x;
      for (let c = 0; c < 3; c++) rgb[p * 3 + c] = bilinear(S.data, W, H, sx, sy, c);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      if (isCostume(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])) mask[p] = 1;
    }
    // keep components larger than 1500 px (costume pieces); antennae glow is not connected to them
    const lab = new Int32Array(CW * CH).fill(-1), comps = [];
    for (let s0 = 0; s0 < CW * CH; s0++) if (mask[s0] && lab[s0] < 0) {
      const id = comps.length, st = [s0], px = []; lab[s0] = id; let minY = CH;
      while (st.length) { const p = st.pop(); px.push(p); const y = (p / CW) | 0; if (y < minY) minY = y; const x = p % CW;
        for (const q of [x > 0 ? p - 1 : -1, x < CW - 1 ? p + 1 : -1, y > 0 ? p - CW : -1, y < CH - 1 ? p + CW : -1]) if (q >= 0 && mask[q] && lab[q] < 0) { lab[q] = id; st.push(q); } }
      comps.push({ px, n: px.length, minY });
    }
    // antennae: components whose top is in the top 300 px of the canvas and that are not huge
    for (const c of comps) if (c.n < 1500 || (c.minY < 260 && c.n < 40000)) for (const p of c.px) mask[p] = 0;
    // fill small holes (stars/patch highlights) inside pieces
    const reach = new Uint8Array(CW * CH), st = [];
    const push = p => { if (!mask[p] && !reach[p]) { reach[p] = 1; st.push(p); } };
    for (let x = 0; x < CW; x++) { push(x); push((CH - 1) * CW + x); } for (let y = 0; y < CH; y++) { push(y * CW); push(y * CW + CW - 1); }
    while (st.length) { const p = st.pop(), x = p % CW, y = (p / CW) | 0; if (x > 0) push(p - 1); if (x < CW - 1) push(p + 1); if (y > 0) push(p - CW); if (y < CH - 1) push(p + CW); }
    // holes larger than 2500 px are real gaps (e.g. cream cup rim) — only fill small ones
    const holeLab = new Int32Array(CW * CH).fill(-1);
    for (let s0 = 0; s0 < CW * CH; s0++) if (!mask[s0] && !reach[s0] && holeLab[s0] < 0) {
      const q = [s0], px = []; holeLab[s0] = 1;
      while (q.length) { const p = q.pop(); px.push(p); const x = p % CW, y = (p / CW) | 0;
        for (const n of [x > 0 ? p - 1 : -1, x < CW - 1 ? p + 1 : -1, y > 0 ? p - CW : -1, y < CH - 1 ? p + CW : -1]) if (n >= 0 && !mask[n] && !reach[n] && holeLab[n] < 0) { holeLab[n] = 1; q.push(n); } }
      if (px.length < 2500) for (const p of px) mask[p] = 1;
    }
    // dilate 1 px so the soft edge covers the fur fringe underneath
    const alpha = Buffer.alloc(CW * CH);
    for (let p = 0; p < CW * CH; p++) alpha[p] = mask[p] ? 255 : 0;
    const soft = await sharp(alpha, { raw: { width: CW, height: CH, channels: 1 } }).blur(0.9).extractChannel(0).raw().toBuffer();

    const outDir = `${ROOT}character/layers/costume/${band}/${view}/`;
    fs.mkdirSync(outDir, { recursive: true });
    const parts = {};
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const p = y * CW + x; if (!soft[p]) continue;
      const part = V.split(x + V.off[0], y + V.off[1]);
      (parts[part] ||= Buffer.alloc(CW * CH * 4));
      const b = parts[part];
      for (let c = 0; c < 3; c++) b[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[p * 3 + c])));
      b[p * 4 + 3] = soft[p];
    }
    // beanie crown: our headphone band sits higher on the head than in the AI render, so extend the knit
    // upward (copying the crown rows just below, period 36 px) until the head outline of body_base ends
    if (parts.beanie) {
      const body = await sharp(`${ROOT}character/layers/${view}/body_base.png`).ensureAlpha().extractChannel(3).raw().toBuffer();
      const b = parts.beanie, PER = 36;
      for (let x = 0; x < CW; x++) {
        let yt = -1; for (let y = 0; y < CH * 0.5; y++) if (b[(y * CW + x) * 4 + 3] > 200) { yt = y; break; }
        if (yt < 0) continue;
        for (let y = yt - 1; y >= 0; y--) {
          const a = body[y * CW + x]; if (a < 8) break;
          const sy = yt + 2 + ((yt - y) % PER), p = y * CW + x, q = sy * CW + x;
          for (let c = 0; c < 3; c++) b[p * 4 + c] = b[q * 4 + c];
          b[p * 4 + 3] = a;
        }
      }
      // the AI beanie is a little wider than our head: clip it to the head silhouette so no knit sticks out
      for (let p = 0; p < CW * CH; p++) b[p * 4 + 3] = Math.min(b[p * 4 + 3], body[p]);
    }
    for (const [name, buf] of Object.entries(parts)) {
      await sharp(buf, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(outDir + name + '.png');
      let n = 0; for (let p = 0; p < CW * CH; p++) if (buf[p * 4 + 3] > 128) n++;
      console.log(`  ${view}/${name}.png  ${n} px`);
    }
    if (DEBUG) {
      const full = Buffer.alloc(CW * CH * 3);
      for (let p = 0; p < CW * CH; p++) for (let c = 0; c < 3; c++) full[p * 3 + c] = Math.round(rgb[p * 3 + c]);
      await sharp(full, { raw: { width: CW, height: CH, channels: 3 } }).png().toFile(outDir + '_registered.png');
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
