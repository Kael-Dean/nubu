// Rebuild front arm layers with a soft inner edge (where the arm used to overlap the body).
const sharp = require('sharp');
const L = 'D:/NUBU/character/layers/front/';
const W = 1080, H = 1269;
const ARMS = { arm_L: [120, 848, 108, 124], arm_R: [958, 848, 108, 124] };
(async () => {
  const src = await sharp(L + '_v1_body_filled.png').ensureAlpha().raw().toBuffer();
  const bare = await sharp(L + 'body_base.png').ensureAlpha().raw().toBuffer();
  for (const [name, [cx, cy, rx, ry]] of Object.entries(ARMS)) {
    const out = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2); if (r >= 1.02) continue;
      const p = (y * W + x) * 4, inside = bare[p + 3] > 128;
      const a = Math.max(0, Math.min(1, (1 - r) / (inside ? 0.16 : 0.012)));
      if (a <= 0) continue;
      out[p] = src[p]; out[p + 1] = src[p + 1]; out[p + 2] = src[p + 2]; out[p + 3] = Math.round(src[p + 3] * a);
    }
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(L + name + '.png');
  }
  console.log('arms rebuilt');
})();
