// Front outfit body from a cleanup render that is already pixel-aligned with the rig (same canvas as the reference
// made from the rig: source = canvas + (57,2)). The render's head (band, beanie, cups, fur) is used above the scarf,
// clipped to the rig's own outline (body_base ∪ headphones); the render's eyes / mouth are replaced by our fur so our
// face layers (all expressions, visemes, blinks) sit on clean fur.
// usage: node scripts/compose-front-outfit.js <band> <cutout.png> [cutY=700]
// out: character/layers/costume/<band>/front/body_outfit.png  (replaces body_base + headphones + beanie + cups when outfit is on)
const fs = require('fs');
const sharp = require('sharp');
const [band, cut, CY] = process.argv.slice(2);
const CUT_Y = +CY || 700, W = 1080, H = 1269, OX = 57, OY = 2;
const L = 'D:/NUBU/character/layers/front/', F = 'D:/NUBU/character/layers/face/';
const load = async f => sharp(f).ensureAlpha().raw().toBuffer();
(async () => {
  const C = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const SW = C.info.width;
  const ai = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = ((y + OY) * SW + x + OX) * 4, p = (y * W + x) * 4; for (let c = 0; c < 4; c++) ai[p + c] = C.data[q + c]; }
  const body = await load(L + 'body_base.png'), hp = await load(L + 'headphones.png');
  // face features of the render: dark (eyes, mouth line) or pink mouth interior, dilated — plus every mouth slot
  const feat = new Uint8Array(W * H);
  for (let y = +(process.env.FEAT_Y0 || 520); y < 760; y++) for (let x = 250; x < 830; x++) { const p = (y * W + x) * 4, r = ai[p], g = ai[p + 1], b = ai[p + 2];
    if (ai[p + 3] > 128 && !(b > g + 22 && r > g + 8) && ((r < 100 && g < 100 && b < 100) || (r - g > 60 && r > 160 && g < 150))) for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) feat[(y + dy) * W + x + dx] = 1; }
  const FM = JSON.parse(fs.readFileSync(F + 'manifest.json', 'utf8'));
  for (const k of Object.keys(FM.mouths)) { const b = FM.mouths[k]; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const p = (y * W + x) * 4; if (!(ai[p + 2] > ai[p + 1] + 22)) feat[y * W + x] = 1; } }
  const fS = await sharp(Buffer.from(feat.map(v => v * 255)), { raw: { width: W, height: H, channels: 1 } }).blur(3).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, ab = body[p * 4 + 3] / 255, ah = hp[p * 4 + 3] / 255;
    const sil = Math.max(ab, ah);
    // ours: body under headphones (original look) — used below the cut and for the face features
    const oa = ah + ab * (1 - ah), oc = [0, 1, 2].map(c => (body[p * 4 + c] * ab * (1 - ah) + hp[p * 4 + c] * ah) / Math.max(1e-6, oa));
    const ramp = Math.max(0, Math.min(1, (CUT_Y - y) / 24));            // render above the cut, soft 24 px transition
    const w = ramp * (1 - fS[p] / 255);
    const aa = Math.min(ai[p * 4 + 3] / 255, sil);                     // render coverage, clipped to our outline
    const a = w * aa + (1 - w) * oa;
    if (a <= 0.003) continue;
    for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round((w * aa * ai[p * 4 + c] + (1 - w) * oa * oc[c]) / a);
    out[p * 4 + 3] = Math.round(a * 255);
  }
  // our own band (solid core, smoothed edge) on top above the ear cups: its antenna stems match our antenna layers
  { const a = Buffer.alloc(W * H); for (let p = 0; p < W * H; p++) a[p] = hp[p * 4 + 3] > 200 ? 255 : 0;
    const bl = await sharp(a, { raw: { width: W, height: H, channels: 1 } }).blur(1.4).extractChannel(0).raw().toBuffer();
    const TOP = +(process.env.BAND_MAX_Y || 445);
    for (let y = 0; y < TOP; y++) for (let x = 0; x < W; x++) { const p = y * W + x; let win = 1; const WS = (process.env.BAND_WIN || "").split(",").filter(Boolean).map(r => r.split("-").map(Number)); if (WS.length) { win = 0; for (const [a0, a1] of WS) win = Math.max(win, Math.min(1, (x - a0) / 15, (a1 - x) / 15)); win = Math.max(0, win); } const k = win * Math.max(0, Math.min(1, (bl[p] / 255 - 0.4) / 0.2)) * Math.max(0, Math.min(1, (TOP - y) / 12)); if (!k) continue;
      let src = p; if (hp[p * 4 + 3] < 230) { for (let r = 1; r <= 6; r++) { let f = -1; for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0]]) { const q = (y + dy) * W + x + dx; if (hp[q * 4 + 3] > 240) { f = q; break; } } if (f >= 0) { src = f; break; } } }
      const ao = out[p * 4 + 3] / 255, na = k + ao * (1 - k);
      for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round((hp[src * 4 + c] * k + out[p * 4 + c] * ao * (1 - k)) / Math.max(1e-6, na));
      out[p * 4 + 3] = Math.round(na * 255); } }
  // erase the render's own antenna stems where they cross the band: per row, blend between the band pixels on either side
  for (const [x0, x1] of (process.env.STUBS || '0-0').split(',').map(r => r.split('-').map(Number))) {
    for (let y = 120; y < 360; y++) { const pl = (y * W + x0 - 1) * 4, pr = (y * W + x1 + 1) * 4; 
      const isK = q => out[q + 2] > out[q + 1] + 22 && out[q] > out[q + 1] + 8; if (isK(pl) || isK(pr)) continue;
      for (let x = x0; x <= x1; x++) { const t = (x - x0 + 1) / (x1 - x0 + 2), p = (y * W + x) * 4; for (let c = 0; c < 4; c++) out[p + c] = Math.round(out[pl + c] * (1 - t) + out[pr + c] * t); } } }
  // leftover flat-gray background pixels from the render (e.g. around erased antennae): drop them
  for (let y = 0; y < 460; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 4; if (!out[p + 3]) continue; const r = out[p], g = out[p + 1], b = out[p + 2], l = (r + g + b) / 3; if (Math.abs(r - g) < 9 && Math.abs(g - b) < 9 && Math.abs(r - b) < 12 && l > 150 && l < 222) out[p + 3] = 0; }
  // flatten lighter patches the erase left on the band (old stem bases): per row, pull band pixels that are brighter than
  // the row's typical band colour (median of band pixels within the window ±90 px) back to it, keeping fine texture
  for (const [x0, x1] of (process.env.PATCH_WIN || '310-480,545-720').split(',').map(r => r.split('-').map(Number))) {
    for (let y = 130; y < 360; y++) { const row = []; for (let x = x0 - 90; x <= x1 + 90; x++) { const p = (y * W + x) * 4; if (out[p + 3] < 220) continue; const r = out[p], g = out[p + 1], b = out[p + 2]; if (b > g + 22 && r > g + 8) continue; if (x >= x0 && x <= x1) continue; row.push([r + g + b, r, g, b]); }
      if (row.length < 20) continue; row.sort((a, b) => a[0] - b[0]); const md = row[row.length >> 1];
      for (let x = x0; x <= x1; x++) { const p = (y * W + x) * 4; if (out[p + 3] < 220) continue; const r = out[p], g = out[p + 1], b = out[p + 2]; if (b > g + 22 && r > g + 8) continue; const d = (r + g + b - md[0]) / 3; if (d > 6) { const k = Math.min(1, (d - 6) / 10); out[p] = Math.round(r - (r - md[1]) * k * 0.9); out[p + 1] = Math.round(g - (g - md[2]) * k * 0.9); out[p + 2] = Math.round(b - (b - md[3]) * k * 0.9); } } } }
  const dst = `D:/NUBU/character/layers/costume/${band}/front/body_outfit.png`;
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(dst);
  console.log('front outfit body ->', dst);
})().catch(e => { console.error(e); process.exit(1); });
