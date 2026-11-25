// 3/4 view: make the headphone band sit ON the beanie on the camera side and slip BEHIND the beanie's curve on the
// far side.
//   1) crown volume: the knit grows a little beyond the head outline above the cuff (beanie thickness)
//   2) fit_beanie_over.png: the far part of the crown, drawn ABOVE the headphone band with a soft left→right fade,
//      so the band disappears gradually behind the hat
// usage: node scripts/beanie-wrap-34.js <band> [thick=14] [fullX=300] [zeroX=500]
const sharp = require('sharp');
const ROOT = 'D:/NUBU/';
const [band, T0, X0, X1] = process.argv.slice(2);
const THICK = +T0 || 14, FULL = +X0 || 300, ZERO = +X1 || 500;
const CW = 1080, CH = 1269;
const dir = `${ROOT}character/layers/costume/${band}/angle34/`;
const load = async f => (await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

(async () => {
  const bo = await load(dir + 'fit_beanie.png');
  const body = await load(`${ROOT}character/layers/angle34/body_base.png`);
  // cuff bottom per column = lowest knit pixel; crown region = above it
  const cuffBot = new Int32Array(CW).fill(-1), top = new Int32Array(CW).fill(-1);
  for (let x = 0; x < CW; x++) for (let y = 0; y < CH * 0.5; y++) if (bo[(y * CW + x) * 4 + 3] > 128) { if (top[x] < 0) top[x] = y; cuffBot[x] = y; }
  // 1) crown volume: dilate the head outline by THICK px above the cuff, fill with knit copied from below
  const head = new Uint8Array(CW * CH);
  for (let p = 0; p < CW * CH; p++) if (body[p * 4 + 3] > 128) head[p] = 1;
  const grown = new Uint8Array(CW * CH);
  for (let y = 0; y < CH * 0.5; y++) for (let x = 0; x < CW; x++) {
    if (head[y * CW + x]) continue;
    let near = false; for (let d = 1; d <= THICK && !near; d++) for (const [dx, dy] of [[0, d], [d, d >> 1], [-d, d >> 1], [d, 0], [-d, 0]]) { const q = (y + dy) * CW + x + dx; if (q >= 0 && q < CW * CH && head[q]) { near = true; break; } }
    if (near) grown[y * CW + x] = 1;
  }
  for (let x = 0; x < CW; x++) {
    if (cuffBot[x] < 0) continue;
    for (let y = 0; y < cuffBot[x] - 10; y++) {
      const p = y * CW + x; if (!grown[p] || bo[p * 4 + 3] > 200) continue;
      // copy knit from straight below (first opaque knit pixel), shaded slightly darker toward the rim
      let q = -1; for (let d = 1; d < 80; d++) { const r = (y + d) * CW + x; if (bo[r * 4 + 3] > 200) { q = r; break; } }
      if (q < 0) continue;
      const dist = (() => { for (let d = 1; d <= THICK; d++) for (const [dx, dy] of [[0, d], [d, 0], [-d, 0]]) { const r = (y + dy) * CW + x + dx; if (r >= 0 && r < CW * CH && head[r]) return d; } return THICK; })();
      const shade = 1 - 0.25 * (dist / THICK);
      for (let c = 0; c < 3; c++) bo[p * 4 + c] = Math.round(bo[q * 4 + c] * shade);
      bo[p * 4 + 3] = Math.round(255 * Math.min(1, (THICK + 1 - dist) / 3));   // soft outer edge
    }
  }
  await sharp(bo, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(dir + 'fit_beanie.png');
  // 2) far-side overlay above the band, fading out toward the camera side
  const over = Buffer.alloc(CW * CH * 4);
  for (let y = 0; y < CH * 0.5; y++) for (let x = 0; x < CW; x++) {
    const p = (y * CW + x) * 4; if (!bo[p + 3]) continue;
    const w = x <= FULL ? 1 : 0;   // hard edge: no fade
    if (w <= 0) continue;
    if (cuffBot[x] >= 0 && y > cuffBot[x] - 4) continue;   // only the crown, never the cuff edge
    for (let c = 0; c < 3; c++) over[p + c] = bo[p + c];
    over[p + 3] = bo[p + 3] > 128 ? 255 : 0;
  }
  await sharp(over, { raw: { width: CW, height: CH, channels: 4 } }).png().toFile(dir + 'fit_beanie_over.png');
  console.log('beanie crown grown', THICK, 'px; far overlay full<=', FULL, 'zero>=', ZERO);
})().catch(e => { console.error(e); process.exit(1); });
