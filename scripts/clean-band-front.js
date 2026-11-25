// Front view: a clean-edged copy of the headphones layer for outfits.
// The original band's inner edge carries a soft fur fringe + small dark notches from the cutout, which only show
// once a hat sits under it. Above the ear cups (y < CUP_TOP) the alpha is rebuilt from a blurred threshold (smooth,
// solid edge), and fur-coloured fringe pixels are replaced by the nearest solid band colour.
// usage: node scripts/clean-band-front.js <band>   → character/layers/costume/<band>/front/headphones_outfit.png
const sharp = require('sharp');
const [band] = process.argv.slice(2);
const W = 1080, H = 1269, CUP_TOP = +(process.env.CUP_TOP || 470);
(async () => {
  const src = `D:/NUBU/character/layers/front/headphones.png`, out = `D:/NUBU/character/layers/costume/${band}/front/headphones_outfit.png`;
  const d = await sharp(src).ensureAlpha().raw().toBuffer();
  const a = Buffer.alloc(W * H); for (let p = 0; p < W * H; p++) a[p] = d[p * 4 + 3] > 200 ? 255 : 0;   // solid core only
  // close small notches (radius 3) then smooth
  const bl = await sharp(a, { raw: { width: W, height: H, channels: 1 } }).blur(2.2).extractChannel(0).raw().toBuffer();
  const o = Buffer.from(d);
  for (let y = 0; y < CUP_TOP; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, v = bl[p] / 255, na = Math.max(0, Math.min(1, (v - 0.42) / 0.16));
    o[p * 4 + 3] = Math.round(na * 255);
    if (na > 0 && d[p * 4 + 3] < 230) {   // edge pixel: take the colour of the nearest solid band pixel (search 1..8 px in 8 directions)
      let done = false; for (let r = 1; r <= 8 && !done; r++) for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
        const q = (y + dy) * W + x + dx; if (q >= 0 && q < W * H && d[q * 4 + 3] > 240) { for (let c = 0; c < 3; c++) o[p * 4 + c] = d[q * 4 + c]; done = true; break; } }
    }
  }
  await sharp(o, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
  console.log('clean band ->', out);
})().catch(e => { console.error(e); process.exit(1); });
