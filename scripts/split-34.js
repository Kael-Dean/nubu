// Split the 3/4-left Nubu reference into registered layers, using the AI bare-body plate as body_base.
// usage: node split34.js debug|build
const sharp = require('sharp');
const fs = require('fs');
const SP = 'D:/NUBU/character/layers/angle34/';
const L = 'D:/NUBU/character/layers/angle34/';
const W = 1080, H = 1269;

const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const poly = pts => (x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const or = (...fns) => (x, y) => fns.some(f => f(x, y));

// stems (the part over the band gets filled by cloning band texture)
const STEM_L = poly([[392, 205], [445, 205], [466, 302], [420, 308]]);
const STEM_R = poly([[680, 205], [728, 205], [700, 255], [668, 305], [618, 305], [648, 262]]);
const WING_L = poly([[220, 0], [505, 0], [505, 222], [412, 222], [300, 262], [240, 250], [220, 200]]);
const WING_R = poly([[630, 0], [905, 0], [905, 225], [850, 262], [790, 278], [735, 275], [712, 225], [630, 190]]);

const BAND = poly([
  [240, 395], [262, 365], [300, 328], [350, 290], [410, 258], [470, 238], [520, 228], [580, 230], [640, 242], [700, 265], [760, 300], [815, 345], [850, 390], [868, 430],
  [835, 420], [800, 385], [755, 345], [700, 312], [640, 292], [580, 284], [520, 286], [470, 296], [420, 318], [370, 345], [320, 380], [285, 410], [262, 425],
]);
const CUP_NEAR = ell(835, 592, 141, 169);
const CUP_FAR = ell(200, 535, 92, 140);          // minus bare silhouette (applied in build)
const ARM_FAR = ell(125, 795, 85, 112);
const ARM_NEAR = ell(770, 862, 128, 125);

// strip of head fur just under the band (bare head is slightly smaller than the real head) -> baked into body_base under the bare plate
const HEADFILL = poly([[262, 425], [285, 410], [320, 380], [370, 345], [420, 318], [470, 296], [520, 286], [580, 284], [640, 292], [700, 312], [755, 345], [800, 385], [835, 420], [835, 470], [780, 430], [720, 385], [660, 350], [600, 335], [540, 332], [480, 340], [420, 362], [360, 395], [320, 430], [290, 470], [262, 480]]);
const MASKS = {
  antenna_L: or(WING_L, STEM_L),
  antenna_R: or(WING_R, STEM_R),
  headphones: or(BAND, CUP_NEAR),
  arm_far: ARM_FAR,
  arm_near: ARM_NEAR,
};
const FILL = [ // stem-over-band zones, donor offset
  { zone: (x, y) => STEM_L(x, y) && y >= 252, off: [70, -22] },
  { zone: (x, y) => STEM_R(x, y) && y >= 252, off: [-70, -12] },
];

async function main(mode) {
  const N = W * H;
  if (mode === 'debug') {
    const colors = { antenna_L: '#ff2d55', antenna_R: '#ff9500', headphones: '#00c853', arm_far: '#00b8d4', arm_near: '#aa00ff', cup_far: '#ffd600', head_fill: '#ffffff' };
    const all = { ...MASKS, cup_far: CUP_FAR, head_fill: HEADFILL };
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (const [name, fn] of Object.entries(all)) {
      let dots = '';
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (fn(x, y) && (!fn(x - 1, y) || !fn(x + 1, y) || !fn(x, y - 1) || !fn(x, y + 1))) dots += `<rect x="${x}" y="${y}" width="2" height="2" fill="${colors[name]}"/>`;
      svg += dots;
    }
    for (const f of FILL) { let dots = ''; for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) if (f.zone(x, y)) dots += `<rect x="${x}" y="${y}" width="1" height="1" fill="#ffffff"/>`; svg += dots; }
    svg += '</svg>';
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite([{ input: L + 'ref_canvas.png' }, { input: Buffer.from(svg) }]).png().toFile(SP + 'debug34.png');
    console.log('debug34 written');
    return;
  }

  const ref = await sharp(L + 'ref_canvas.png').ensureAlpha().raw().toBuffer();
  const bare = await sharp(L + 'bare_canvas.png').ensureAlpha().raw().toBuffer();

  // patch stems over the band by cloning band texture
  const patched = Buffer.from(ref);
  for (const f of FILL) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!f.zone(x, y)) continue;
    const q = (Math.min(H - 1, Math.max(0, y + f.off[1])) * W + Math.min(W - 1, Math.max(0, x + f.off[0]))) * 4, p = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) patched[p + c] = ref[q + c];
  }

  const soft = async fn => {
    const m = Buffer.alloc(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = fn(x, y) ? 255 : 0;
    return sharp(m, { raw: { width: W, height: H, channels: 1 } }).blur(1.3).extractChannel(0).raw().toBuffer();
  };
  const lift = (src, m, extra) => {
    const out = Buffer.alloc(N * 4);
    for (let p = 0; p < N; p++) { let k = m[p] / 255; if (extra) k *= extra[p]; if (k <= 0) continue; out[p*4] = src[p*4]; out[p*4+1] = src[p*4+1]; out[p*4+2] = src[p*4+2]; out[p*4+3] = Math.round(src[p*4+3] * k); }
    return out;
  };
  const save = (buf, name) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(L + name + '.png');

  await save(lift(ref, await soft(MASKS.antenna_L)), 'antenna_L');
  await save(lift(ref, await soft(MASKS.antenna_R)), 'antenna_R');
  await save(lift(patched, await soft(MASKS.headphones)), 'headphones');
  await save(lift(patched, await soft(MASKS.arm_far)), 'arm_far');
  await save(lift(patched, await soft(MASKS.arm_near)), 'arm_near');
  // far cup: only the part outside the bare-body silhouette (the crescent that sticks out), sits behind body_base
  const outside = Buffer.alloc(N); for (let p = 0; p < N; p++) outside[p] = bare[p * 4 + 3] > 200 ? 0 : 1;
  await save(lift(patched, await soft(CUP_FAR), outside), 'cup_far');
  await save(lift(patched, await soft(HEADFILL)), 'head_fill');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: L + 'head_fill.png' }, { input: L + 'bare_canvas.png' }]).png().toFile(L + 'body_base.png');

  const order = ['cup_far', 'body_base', 'arm_far', 'arm_near', 'headphones', 'antenna_L', 'antenna_R'];
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite(order.map(n => ({ input: L + n + '.png' }))).png().toFile(SP + 'recomposed34.png');
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 30, g: 30, b: 50 } } }).composite([{ input: L + 'body_base.png' }]).png().toFile(SP + 'body34.png');
  console.log('3/4 layers written');
}
main(process.argv[2] || 'debug');
