// Split Nubu front cutout into layers (full-canvas PNGs so all parts stay registered).
// usage: node split.js debug|build
const sharp = require('sharp');
const SP = 'C:/Users/User/AppData/Local/Temp/claude/b07903fc8a0237cd/4148788e-ce7b-417a-809b-8d03b54de117/scratchpad/';
const SRC = 'D:/NUBU/character/layers/nubu_front_cutout.png';
const OUT = 'D:/NUBU/character/layers/front/';

const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const poly = pts => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// part definitions in cutout coordinates (1080 x 1269)
const PARTS = {
  antenna_L: (x, y) => poly([[185, 15], [472, 15], [472, 246], [395, 246], [335, 290], [300, 290], [250, 272], [185, 215]])(x, y) || poly([[398, 240], [458, 240], [468, 336], [426, 344], [404, 262]])(x, y),
  antenna_R: (x, y) => poly([[605, 15], [905, 15], [905, 215], [835, 278], [765, 282], [705, 246], [618, 246], [605, 150]])(x, y) || poly([[640, 240], [696, 240], [684, 300], [658, 344], [618, 338], [628, 290]])(x, y),
  eye_L: ell(390, 583, 51, 51),
  eye_R: ell(695, 583, 51, 51),
  mouth: ell(545, 632, 90, 62),
};
// fur-detail donor offset for filled holes
const DONOR = { antenna_L: [70, 0], antenna_R: [-70, 0], eye_L: [0, -140], eye_R: [0, -140], mouth: [0, 185] };
// pixels of a part's mask that must be re-filled in the body (inside the body/headband), by part
const FILL_ZONE = {
  antenna_L: (x, y) => y >= 249 && x >= 398 && x <= 472,
  antenna_R: (x, y) => y >= 249 && x >= 616 && x <= 700,
  eye_L: () => true, eye_R: () => true, mouth: () => true,
};

async function main(mode) {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;

  if (mode === 'debug') {
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    const colors = { antenna_L: '#ff2d55', antenna_R: '#ff9500', eye_L: '#00c853', eye_R: '#00b8d4', mouth: '#aa00ff' };
    for (const [name, fn] of Object.entries(PARTS)) {
      // trace boundary pixels
      let dots = '';
      for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
        const m = fn(x, y);
        if (m && (!fn(x - 1, y) || !fn(x + 1, y) || !fn(x, y - 1) || !fn(x, y + 1))) dots += `<rect x="${x}" y="${y}" width="2" height="2" fill="${colors[name]}"/>`;
      }
      svg += dots;
    }
    svg += '</svg>';
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } })
      .composite([{ input: SRC }, { input: Buffer.from(svg) }]).png().toFile(SP + 'debug_masks.png');
    console.log('debug written');
    return;
  }

  // build masks (soft: 1.2px blur) and layers
  const masks = {};
  for (const [name, fn] of Object.entries(PARTS)) {
    const m = Buffer.alloc(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = fn(x, y) ? 255 : 0;
    masks[name] = await sharp(m, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer();
  }

  // blurred copy for detail extraction + diffusion fill target
  const blurred = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).blur(5).raw().toBuffer();

  const body = Buffer.from(data);
  const holes = new Uint8Array(N);
  const layers = {};
  for (const [name, m] of Object.entries(masks)) {
    const L = Buffer.alloc(N * 4);
    for (let p = 0; p < N; p++) {
      const k = m[p] / 255;
      if (k <= 0) continue;
      L[p * 4] = data[p * 4]; L[p * 4 + 1] = data[p * 4 + 1]; L[p * 4 + 2] = data[p * 4 + 2];
      L[p * 4 + 3] = Math.round(data[p * 4 + 3] * k);
      const y = (p / W) | 0, x = p % W;
      if (k > 0.02 && data[p * 4 + 3] > 200 && FILL_ZONE[name](x, y)) holes[p] = 1;
      if (k > 0.9) body[p * 4 + 3] = 0;
    }
    layers[name] = L;
  }
  // re-opaque hole pixels (to be filled)
  for (let p = 0; p < N; p++) if (holes[p]) body[p * 4 + 3] = 255;

  // diffusion fill for holes: start from nearest known, iterate Jacobi
  const col = new Float32Array(N * 3), known = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!holes[p] && data[p * 4 + 3] > 200 && !isInAny(p % W, (p / W) | 0)) { known[p] = 1; for (let c = 0; c < 3; c++) col[p * 3 + c] = data[p * 4 + c]; }
  }
  function isInAny(x, y) { for (const fn of Object.values(PARTS)) if (fn(x, y)) return true; return false; }
  // seed holes with average of known 8-neighbours repeatedly (grow), then smooth
  let frontier = true, guard = 0;
  while (frontier && guard++ < 120) {
    frontier = false;
    const add = [];
    for (let p = 0; p < N; p++) if (holes[p] && !known[p]) {
      const x = p % W, y = (p / W) | 0; let s0 = 0, s1 = 0, s2 = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx; if (known[q]) { s0 += col[q * 3]; s1 += col[q * 3 + 1]; s2 += col[q * 3 + 2]; n++; }
      }
      if (n) add.push([p, s0 / n, s1 / n, s2 / n]); else frontier = true;
    }
    for (const [p, a, b, c] of add) { known[p] = 1; col[p * 3] = a; col[p * 3 + 1] = b; col[p * 3 + 2] = c; }
    if (add.length) frontier = true;
  }
  const colBuf = Buffer.alloc(N * 3); for (let p = 0; p < N * 3; p++) colBuf[p] = Math.max(0, Math.min(255, Math.round(col[p])));
  const smooth = await sharp(colBuf, { raw: { width: W, height: H, channels: 3 } }).blur(9).raw().toBuffer();
  for (let p = 0; p < N; p++) if (holes[p]) { for (let c = 0; c < 3; c++) col[p * 3 + c] = smooth[p * 3 + c]; }
  const delta = {};
  for (const [name, fn] of Object.entries(PARTS)) {
    const off = DONOR[name]; if ((!off[0] && !off[1]) || name.startsWith('antenna')) continue; let sa = [0,0,0], sd = [0,0,0], n = 0;
    for (let p = 0; p < N; p++) if (holes[p]) { const x = p % W, y = (p / W) | 0; if (!fn(x, y)) continue; if (name.startsWith('eye') && y > 565) continue; const q = Math.min(H - 1, Math.max(0, y + off[1])) * W + x; for (let c = 0; c < 3; c++) { sa[c] += col[p * 3 + c]; sd[c] += data[q * 4 + c]; } n++; }
    delta[name] = n ? sa.map((v, c) => (v - sd[c]) / n) : [0,0,0];
  }
  for (let p = 0; p < N; p++) if (holes[p]) {
    const x = p % W, y = (p / W) | 0;
    // find part for donor offset
    let off = [0, 0], curPart = '', best = 0;
    for (const name of Object.keys(PARTS)) if (masks[name][p] > best) { best = masks[name][p]; curPart = name; off = DONOR[name]; }
    const dx = Math.min(W - 1, Math.max(0, x + off[0])), dy = Math.min(H - 1, Math.max(0, y + off[1]));
    const q = dy * W + dx;
    for (let c = 0; c < 3; c++) {
      const detail = off[1] === 0 && off[0] === 0 ? 0 : data[q * 4 + c] - blurred[q * 4 + c];
      body[p * 4 + c] = Math.max(0, Math.min(255, Math.round(((off[0] === 0 && off[1] === 0) ? col[p * 3 + c] : (curPart.startsWith('antenna') ? 0 : 0.2) * col[p * 3 + c] + (curPart.startsWith('antenna') ? 1 : 0.8) * (data[q * 4 + c] + (delta[curPart] ? delta[curPart][c] : 0))))));
    }
  }

  require('fs').mkdirSync(OUT, { recursive: true });
  const save = (buf, name) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(OUT + name + '.png');
  await save(body, 'body_base');
  for (const [name, L] of Object.entries(layers)) await save(L, name);

  // recomposition check vs cutout
  const order = ['body_base', 'antenna_L', 'antenna_R', 'eye_L', 'eye_R', 'mouth'];
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } })
    .composite(order.map(n => ({ input: OUT + n + '.png' }))).png().toFile(SP + 'recomposed.png');
  // body only on dark
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 30, g: 30, b: 50 } } })
    .composite([{ input: OUT + 'body_base.png' }]).png().toFile(SP + 'body_only.png');
  console.log('layers written:', ['body_base', ...Object.keys(layers)].join(', '));
}
main(process.argv[2] || 'debug');
