// Flat-gray background matting for Nubu renders (v2: chroma-based, pocket removal).
// usage: node cutout.js <in> <out.png>
const sharp = require('sharp');

const R = 20;            // soft-edge band (px) around the background region
const POCKET_MIN = 250;  // enclosed gray pockets bigger than this are background
const C_LO = 3, C_HI = 14;   // chroma alpha ramp
const W_LO = 205, W_HI = 232; // white-highlight alpha ramp (min channel)

async function run(inp, out) {
  const { data, info } = await sharp(inp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;

  const border = [[], [], []];
  const push = (x, y) => { const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) border[c].push(data[i + c]); };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  const B = border.map(a => a.sort((p, q) => p - q)[a.length >> 1]);

  const chroma = new Uint8Array(N), minc = new Uint8Array(N), cand = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    chroma[p] = mx - mn; minc[p] = mn;
    const lum = (r + g + b) / 3;
    const dr = r - B[0], dg = g - B[1], db = b - B[2];
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    cand[p] = ((mx - mn) <= 5 && lum > 110 && lum < 212) || d < 12 ? 1 : 0;
  }

  const isBg = new Uint8Array(N);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  const seed = (x, y) => { const p = y * W + x; if (!isBg[p] && cand[p]) { isBg[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (qh < qt) {
    const p = q[qh++], x = p % W, y = (p / W) | 0;
    if (x > 0) seed(x - 1, y); if (x < W - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1); if (y < H - 1) seed(x, y + 1);
  }

  // enclosed gray pockets (e.g. between headband and head)
  const seen = new Uint8Array(N); let pockets = 0;
  for (let s = 0; s < N; s++) {
    if (!cand[s] || isBg[s] || seen[s]) continue;
    const comp = []; seen[s] = 1; comp.push(s);
    for (let i = 0; i < comp.length; i++) {
      const p = comp[i], x = p % W, y = (p / W) | 0;
      const nb = [];
      if (x > 0) nb.push(p - 1); if (x < W - 1) nb.push(p + 1);
      if (y > 0) nb.push(p - W); if (y < H - 1) nb.push(p + W);
      for (const n of nb) if (cand[n] && !isBg[n] && !seen[n]) { seen[n] = 1; comp.push(n); }
    }
    const cy = (comp[0] / W) | 0; if (comp.length > (cy < 470 ? 30 : POCKET_MIN)) { for (const p of comp) isBg[p] = 1; pockets++; }
  }

  const steps = new Uint8Array(N).fill(255);
  qh = 0; qt = 0;
  for (let p = 0; p < N; p++) if (isBg[p]) { steps[p] = 0; q[qt++] = p; }
  while (qh < qt) {
    const p = q[qh++]; const s = steps[p]; if (s >= R) continue;
    const x = p % W, y = (p / W) | 0;
    const nb = [];
    if (x > 0) nb.push(p - 1); if (x < W - 1) nb.push(p + 1);
    if (y > 0) nb.push(p - W); if (y < H - 1) nb.push(p + W);
    for (const n of nb) if (steps[n] === 255) { steps[n] = s + 1; q[qt++] = n; }
  }

  const clamp01 = v => Math.min(1, Math.max(0, v));
  const rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    let a;
    if (isBg[p]) a = 0;
    else if (steps[p] > R) a = 1;
    else { const top = ((p / W) | 0) < 295; const lo = top ? 12 : C_LO, hi = top ? 26 : C_HI; a = Math.max(clamp01((chroma[p] - lo) / (hi - lo)), clamp01((minc[p] - W_LO) / (W_HI - W_LO))); }
    for (let c = 0; c < 3; c++) {
      let v = data[p * 3 + c];
      if (a > 0 && a < 1) v = (v - (1 - a) * B[c]) / a;
      rgba[p * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    rgba[p * 4 + 3] = Math.round(a * 255);
  }

  const al = Buffer.alloc(N); for (let p = 0; p < N; p++) al[p] = rgba[p*4+3];
  const bl = await sharp(al, { raw: { width: W, height: H, channels: 1 } }).blur(1.1).extractChannel(0).raw().toBuffer();
  for (let p = 0; p < N; p++) if (((p / W) | 0) < 295 && steps[p] <= R) rgba[p*4+3] = bl[p];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rgba[(y * W + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = 16;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png().toFile(out);
  console.log(inp.split('/').pop(), '-> bg', B, 'pockets', pockets, 'bbox', x0, y0, x1, y1);
}

(async () => { await run(process.argv[2], process.argv[3]); })();
