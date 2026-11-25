const sharp = require('sharp');
const fs = require('fs');
const L = 'D:/NUBU/character/layers/';
const SP = 'D:/NUBU/character/layers/';
const W = 1080, H = 1269, PAD = 150, W2 = W + 2 * PAD;
const man = JSON.parse(fs.readFileSync(L + 'face/manifest.json', 'utf8'));
const PIVOT = { arm_L: [175, 790], arm_R: [905, 790] };
const ID = { rot: 0, scale: 1, tx: 0, ty: 0 };
const POSES = {
  rest:        { face: ['open', 'a_small'], arm_L: ID, arm_R: ID },
  wave:        { face: ['open', 'happy'],   arm_L: ID, arm_R: { rot: -95, scale: 1, tx: 0, ty: 0 } },
  cheer:       { face: ['laugh', 'laugh'],  arm_L: { rot: 115, scale: 1, tx: 0, ty: 0 }, arm_R: { rot: -115, scale: 1, tx: 0, ty: 0 } },
  cover_mouth: { face: ['shock', 'shock'], arm_L: ID, arm_R: { rot: -25, scale: 0.85, tx: -392, ty: -156 } },
  hold_cheeks: { face: ['swoon', 'swoon'], arm_L: { rot: 0, scale: 0.7, tx: 128, ty: -131 }, arm_R: { rot: 0, scale: 0.7, tx: -127, ty: -131 } },
  gasp:        { face: ['shock', 'shock'], arm_L: { rot: 0, scale: 0.7, tx: 279, ty: -116 }, arm_R: { rot: 0, scale: 0.7, tx: -277, ty: -116 } },
  point:       { face: ['open', 'a_wide'],  arm_L: ID, arm_R: { rot: -35, scale: 1.15, tx: 0, ty: 0 } },
};
function bil(data, x, y, c) {
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const g = (xx, yy) => data[(yy * W + xx) * 4 + c];
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x1, y0) * fx * (1 - fy) + g(x0, y1) * (1 - fx) * fy + g(x1, y1) * fx * fy;
}
function transform(data, pivot, t) {
  const out = Buffer.alloc(W2 * H * 4), th = t.rot * Math.PI / 180, c = Math.cos(-th), s = Math.sin(-th), k = 1 / t.scale;
  for (let y = 0; y < H; y++) for (let xo = 0; xo < W2; xo++) {
    const x = xo - PAD;
    const dx = x - pivot[0] - t.tx, dy = y - pivot[1] - t.ty;
    const sx = pivot[0] + k * (c * dx - s * dy), sy = pivot[1] + k * (s * dx + c * dy);
    const a = bil(data, sx, sy, 3); if (a <= 0) continue;
    const p = (y * W2 + xo) * 4; out[p] = bil(data, sx, sy, 0); out[p + 1] = bil(data, sx, sy, 1); out[p + 2] = bil(data, sx, sy, 2); out[p + 3] = Math.round(a);
  }
  return out;
}
(async () => {
  const arms = {};
  for (const n of ['arm_L', 'arm_R']) arms[n] = await sharp(L + 'front/' + n + '.png').ensureAlpha().raw().toBuffer();
  const cw = 420, ch = 345, comps = [];
  let i = 0;
  for (const [name, p] of Object.entries(POSES)) {
    const stack = ['body_base', 'headphones'].map(n => ({ input: L + 'front/' + n + '.png', left: PAD, top: 0 }));
    const [eyes, mouth] = p.face;
    for (const s of ['L', 'R']) { const k = `eye_${eyes}_${s}`; stack.push({ input: L + 'face/eyes/' + k + '.png', left: man.eyes[k].x + PAD, top: man.eyes[k].y }); }
    const mk = `mouth_${mouth}`; stack.push({ input: L + 'face/mouths/' + mk + '.png', left: man.mouths[mk].x + PAD, top: man.mouths[mk].y });
    for (const n of ['arm_L', 'arm_R']) {
      const buf = transform(arms[n], PIVOT[n], p[n]);
      if (p[n] !== ID) { // soft drop shadow so a moved arm reads as an object in front of the face
        const sh = Buffer.alloc(W2 * H * 4);
        for (let y = 0; y < H - 14; y++) for (let x = 0; x < W2 - 8; x++) { const a = buf[(y * W2 + x) * 4 + 3]; if (!a) continue; const o = ((y + 14) * W2 + (x + 8)) * 4; sh[o] = 110; sh[o + 1] = 70; sh[o + 2] = 60; sh[o + 3] = Math.round(a * 0.34); }
        stack.push({ input: await sharp(sh, { raw: { width: W2, height: H, channels: 4 } }).blur(9).png().toBuffer() });
      }
      stack.push({ input: await sharp(buf, { raw: { width: W2, height: H, channels: 4 } }).png().toBuffer() });
    }
    stack.push({ input: L + 'front/antenna_L.png', left: PAD, top: 0 }, { input: L + 'front/antenna_R.png', left: PAD, top: 0 });
    const full = await sharp({ create: { width: W2, height: H, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite(stack).png().toBuffer();
    fs.writeFileSync(SP + 'pose_' + name + '.png', full);
    const label = Buffer.from(`<svg width="${cw}" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="170" height="28" fill="#000"/><text x="6" y="21" font-size="19" fill="#fff" font-family="Arial">${name}</text></svg>`);
    comps.push({ input: await sharp(full).resize(cw, ch, { fit: "contain", background: "#3cc8aa" }).png().toBuffer(), left: (i % 3) * cw, top: Math.floor(i / 3) * ch }, { input: label, left: (i % 3) * cw, top: Math.floor(i / 3) * ch });
    i++;
  }
  await sharp({ create: { width: cw * 3, height: ch * 3, channels: 3, background: "#999" } }).composite(comps).png().toFile(SP + 'poses_sheet.png');
  console.log('ok');
})();
