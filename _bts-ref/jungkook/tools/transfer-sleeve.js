// Copy the coherent shoulder+chest+sleeve tattoo from a regenerated image onto the master's SKIN only (right side),
// keeping the master's outline and tank top. usage: node transfer-sleeve.js <master.webp> <src.webp> <out.webp> s dx dy
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs');
const [m, src, out, s, dx, dy] = process.argv.slice(2);
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const png = await pg.evaluate(async ({ mb, sb, s, dx, dy }) => {
    const ld = async d => { const i = new Image(); i.src = 'data:image/webp;base64,' + d; await i.decode(); return i; };
    const W = 2759, H = 4096; const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(await ld(mb), 0, 0); const M = x.getImageData(0, 0, W, H);
    const c2 = new OffscreenCanvas(W, H), x2 = c2.getContext('2d'); x2.setTransform(s, 0, 0, s, dx, dy); x2.drawImage(await ld(sb), 0, 0); const S = x2.getImageData(0, 0, W, H).data;
    const d = M.data; let n = 0;
    for (let y = 700; y < 1960; y++) for (let xx = 400; xx < 1400; xx++) { const i = (y * W + xx) * 4; if (d[i + 3] < 200 || S[i + 3] < 200) continue;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; if (L < 105) continue;              // master tank top / dark → keep
      if (xx > 1280 && y < 795) continue;                                                              // neck stays clean
      if (xx > 1150 && y > 1000) continue;                                                             // below the neckline = tank
      let w = 1; if (xx > 1350) w = Math.max(0, (1395 - xx) / 45); if (y > 1860) w = Math.min(w, (1960 - y) / 100); // fade at sternum and wrist
      if (w <= 0) continue; for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * (1 - w) + S[i + k] * w); n++; }
    x.putImageData(M, 0, 0); const bl = await c.convertToBlob({ type: 'image/webp', quality: 1 }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return { b: btoa(st), n };
  }, { mb: fs.readFileSync(m).toString('base64'), sb: fs.readFileSync(src).toString('base64'), s: +s, dx: +dx, dy: +dy });
  fs.writeFileSync(out, Buffer.from(png.b, 'base64')); console.log('pixels replaced', png.n); await br.close();
})();
