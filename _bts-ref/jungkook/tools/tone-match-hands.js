// Tone-match every hand pose to the arm skin (median of light skin pixels on armL). usage: node tone-match-hands.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const med = async b64 => pg.evaluate(async b64 => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, i.width, i.height).data; const a = [[], [], []];
    for (let k = 0; k < d.length; k += 4) { if (d[k + 3] < 250) continue; const L = .299 * d[k] + .587 * d[k + 1] + .114 * d[k + 2]; const sat = Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]); if (L > 150 && sat > 40) for (let c2 = 0; c2 < 3; c2++) a[c2].push(d[k + c2]); }
    return a.map(v => { v.sort((p, q) => p - q); return v[v.length >> 1]; }); }, b64);
  const target = await med(fs.readFileSync(path.join(dir, rig.pieces.armL.file)).toString('base64'));
  for (const [n, hp] of Object.entries(rig.handPoses)) {
    const f = path.join(dir, hp.file); const b64 = fs.readFileSync(f).toString('base64'); const src = await med(b64);
    const out = await pg.evaluate(async ({ b64, src, target }) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d'); x.drawImage(i, 0, 0); const id = x.getImageData(0, 0, i.width, i.height); const d = id.data;
      for (let k = 0; k < d.length; k += 4) { if (!d[k + 3]) continue; const sat = Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]); if (sat < 25 && (d[k] + d[k + 1] + d[k + 2]) < 240) continue; /* keep black mic / ink lines */ for (let c2 = 0; c2 < 3; c2++) d[k + c2] = Math.min(255, d[k + c2] * target[c2] / src[c2]); }
      x.putImageData(id, 0, 0); const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); }, { b64, src, target });
    fs.writeFileSync(f, Buffer.from(out, 'base64')); console.log(n, src.join(','), '->', target.join(','));
  }
  await br.close();
})();
