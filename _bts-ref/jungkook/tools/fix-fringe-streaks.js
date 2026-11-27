// Tone down the bright skin slivers between the bangs (they read as white streaks across the face).
// Gaps between strands are recoloured to the forehead skin in the hair's shadow, so the strand shapes stay intact.
// A pixel is treated as a gap when it is light-orange skin inside the fringe box (master coords) with dark hair within GAP px
// on BOTH the left and the right. Always starts from the backup in _before_streakfix.
// usage: node fix-fringe-streaks.js <cutDir> <pieceKey...>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [dir, ...keys] = process.argv.slice(2); const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const find = k => rig.pieces[k] || (rig.face || {})[k] || (rig.head34 || {})[k] || ((rig.faceSwaps || {})[k]);
const BOX = [1150, 190, 1660, 430], GAP = +(process.env.GAP || 14), SHADE = +(process.env.SHADE || 0.84);
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage(); const bk = path.join(dir, '_before_streakfix'); fs.mkdirSync(bk, { recursive: true });
  for (const k of keys) { const p = find(k); if (!p) { console.log('no piece', k); continue; } const f = path.join(dir, p.file);
    const src = path.join(bk, path.basename(f)); if (!fs.existsSync(src)) fs.copyFileSync(f, src);
    const r = await pg.evaluate(async ({ b64, px, py, BOX, GAP, SHADE, TONE }) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const W = i.width, H = i.height;
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(i, 0, 0); const id = x.getImageData(0, 0, W, H), d = id.data; const o = new Uint8ClampedArray(d);
      const L = k => 0.299 * o[k] + 0.587 * o[k + 1] + 0.114 * o[k + 2];
      const hair = k => o[k + 3] > 100 && L(k) < 70;
      const skin = k => o[k + 3] > 100 && o[k] > 165 && o[k + 1] > 105 && o[k + 2] < 180 && o[k] - o[k + 2] > 40 && L(k) > 115;
      const inBox = (xx, y) => xx + px >= BOX[0] && xx + px <= BOX[2] && y + py >= BOX[1] && y + py <= BOX[3];
      // forehead tone: median-ish average of skin pixels in the box that have no hair within GAP on either side
      let sr = 0, sg = 0, sb = 0, sn = 0; const near = (xx, y, dir) => { for (let t = 1; t <= GAP; t++) { const q = xx + dir * t; if (q < 0 || q >= W) return false; if (hair((y * W + q) * 4)) return true; } return false; };
      for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W; xx += 2) { if (!inBox(xx, y)) continue; const k = (y * W + xx) * 4; if (skin(k) && !near(xx, y, -1) && !near(xx, y, 1)) { sr += o[k]; sg += o[k + 1]; sb += o[k + 2]; sn++; } }
      if (TONE) { [sr, sg, sb] = TONE; } else { if (!sn) return { png: null, n: 0 }; sr = sr / sn * SHADE; sg = sg / sn * SHADE; sb = sb / sn * SHADE; }
      let n = 0;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { if (!inBox(xx, y)) continue; const k = (y * W + xx) * 4; if (o[k + 3] < 100 || hair(k)) continue;
        if (!(near(xx, y, -1) && near(xx, y, 1))) continue;
        // weight: full for clear skin, partial for antialiased edge pixels (between hair and skin)
        const l = L(k); const w = skin(k) ? 1 : Math.max(0, Math.min(1, (l - 70) / 60)) * 0.8; if (w <= 0) continue;
        // keep the edge darkness: target = shadow skin scaled by how dark the original pixel is relative to bright skin
        const tr = Math.min(sr, o[k]), tg = Math.min(sg, o[k + 1]), tb = Math.min(sb, o[k + 2]);
        d[k] = o[k] * (1 - w) + tr * w; d[k + 1] = o[k + 1] * (1 - w) + tg * w; d[k + 2] = o[k + 2] * (1 - w) + tb * w; n++; }
      x.putImageData(id, 0, 0); const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      return { png: btoa(s), n, tone: [sr | 0, sg | 0, sb | 0] };
    }, { b64: fs.readFileSync(src).toString('base64'), px: p.x, py: p.y, BOX, GAP, SHADE, TONE: process.env.TONE ? process.env.TONE.split(',').map(Number) : null });
    if (r.png) fs.writeFileSync(f, Buffer.from(r.png, 'base64')); console.log(k, p.file, 'pixels', r.n, 'tone', JSON.stringify(r.tone)); }
  await br.close();
})();
