// v2: use the AI "bare body" plate as body_base; lift arms + headphones from the filled v1 body.
// usage: node split2.js debug|build
const sharp = require('sharp');
const fs = require('fs');
const SP = 'C:/Users/User/AppData/Local/Temp/claude/b07903fc8a0237cd/4148788e-ce7b-417a-809b-8d03b54de117/scratchpad/';
const DIR = 'D:/NUBU/character/layers/';
const W = 1080, H = 1269;
const BARE_OFF = [152 - 57, 269 - 2]; // bare cutout crop origin in cutout coordinates

const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

const E_OUT = ell(540, 522, 368, 282);
const poly = pts => (x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const E_IN = poly([[248, 480], [248, 455], [270, 425], [300, 395], [330, 372], [400, 330], [450, 312], [540, 305], [632, 312], [682, 330], [752, 372], [782, 395], [812, 425], [834, 455], [834, 480]]);
const MASKS = {
  headphones: (x, y) => (E_OUT(x, y) && !E_IN(x, y) && y < 470) || ell(165, 586, 90, 144)(x, y) || ell(918, 586, 90, 144)(x, y),
  arm_L: ell(120, 848, 108, 124),
  arm_R: ell(958, 848, 108, 124),
};

async function main(mode) {
  const N = W * H;
  if (mode === 'debug') {
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    const colors = { headphones: '#ff2d55', arm_L: '#00c853', arm_R: '#00b8d4' };
    for (const [name, fn] of Object.entries(MASKS)) {
      let dots = '';
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (fn(x, y) && (!fn(x - 1, y) || !fn(x + 1, y) || !fn(x, y - 1) || !fn(x, y + 1))) dots += `<rect x="${x}" y="${y}" width="2" height="2" fill="${colors[name]}"/>`;
      }
      svg += dots;
    }
    svg += '</svg>';
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } })
      .composite([{ input: DIR + 'front/body_base.png' }, { input: Buffer.from(svg) }]).png().toFile(SP + 'debug2.png');
    console.log('debug2 written');
    return;
  }

  // v1 filled body (has arms + headphones + antenna-base fills) is the source for these parts
  const src = fs.existsSync(DIR + 'front/_v1_body_filled.png') ? DIR + 'front/_v1_body_filled.png' : DIR + 'front/body_base.png';
  if (!fs.existsSync(DIR + 'front/_v1_body_filled.png')) fs.copyFileSync(DIR + 'front/body_base.png', DIR + 'front/_v1_body_filled.png');
  const { data } = await sharp(DIR + 'front/_v1_body_filled.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const layers = {};
  for (const [name, fn] of Object.entries(MASKS)) {
    const m = Buffer.alloc(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = fn(x, y) ? 255 : 0;
    const soft = await sharp(m, { raw: { width: W, height: H, channels: 1 } }).blur(1.4).extractChannel(0).raw().toBuffer();
    const L = Buffer.alloc(N * 4);
    for (let p = 0; p < N; p++) {
      const k = soft[p] / 255; if (k <= 0) continue;
      L[p * 4] = data[p * 4]; L[p * 4 + 1] = data[p * 4 + 1]; L[p * 4 + 2] = data[p * 4 + 2];
      L[p * 4 + 3] = Math.round(data[p * 4 + 3] * k);
    }
    layers[name] = L;
  }
  const save = (buf, name) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(DIR + 'front/' + name + '.png');
  for (const [name, L] of Object.entries(layers)) await save(L, name);

  // new body_base = bare plate placed on the canvas
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: DIR + 'nubu_barebody_cutout.png', left: BARE_OFF[0], top: BARE_OFF[1] }])
    .png().toFile(DIR + 'front/body_base.png');

  const order = ['body_base', 'arm_L', 'arm_R', 'headphones', 'eye_L', 'eye_R', 'mouth', 'antenna_L', 'antenna_R'];
  const stack = order.map(n => ({ input: DIR + 'front/' + n + '.png' }));
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite(stack).png().toFile(SP + 'recomposed2.png');
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 30, g: 30, b: 50 } } }).composite([{ input: DIR + 'front/body_base.png' }]).png().toFile(SP + 'body_only2.png');
  console.log('v2 layers written');
}
main(process.argv[2] || 'debug');
