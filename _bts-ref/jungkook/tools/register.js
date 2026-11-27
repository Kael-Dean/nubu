// Find the scale + offset that best aligns image B onto master A inside a region (brute-force search on a
// downsampled luminance map). usage: node register.js <A.webp> <B.webp> <x0> <y0> <x1> <y1>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright'); const fs = require('fs');
(async () => {
  const [A, B, x0, y0, x1, y1] = process.argv.slice(2);
  const br = await chromium.launch(); const pg = await br.newPage();
  const r = await pg.evaluate(async ({ a, b, R }) => {
    const ld = async d => { const i = new Image(); i.src = 'data:image/webp;base64,' + d; await i.decode(); return i; };
    const ia = await ld(a), ib = await ld(b); const D = 4; // work at 1/4 res
    const grab = (im, s, dx, dy) => { const w = Math.ceil(ia.width / D), h = Math.ceil(ia.height / D); const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
      x.setTransform(s / D, 0, 0, s / D, dx / D, dy / D); x.drawImage(im, 0, 0); return { d: x.getImageData(0, 0, w, h).data, w }; };
    const A = grab(ia, 1, 0, 0); const [rx0, ry0, rx1, ry1] = R.map(v => Math.round(v / D));
    const score = g => { let s = 0, n = 0; for (let y = ry0; y < ry1; y += 1) for (let x = rx0; x < rx1; x += 1) { const i = (y * A.w + x) * 4; if (A.d[i + 3] < 200 || g.d[i + 3] < 200) { s += 120; n++; continue; } s += Math.abs(A.d[i] - g.d[i]) + Math.abs(A.d[i + 1] - g.d[i + 1]) + Math.abs(A.d[i + 2] - g.d[i + 2]); n++; } return s / n; };
    let best = { e: 1e9 };
    for (let s = 0.96; s <= 1.04; s += 0.01) for (let dx = -60; dx <= 60; dx += 8) for (let dy = -60; dy <= 60; dy += 8) { const e = score(grab(ib, s, dx, dy)); if (e < best.e) best = { e, s, dx, dy }; }
    const b0 = best; for (let s = b0.s - 0.008; s <= b0.s + 0.008; s += 0.002) for (let dx = b0.dx - 8; dx <= b0.dx + 8; dx += 2) for (let dy = b0.dy - 8; dy <= b0.dy + 8; dy += 2) { const e = score(grab(ib, s, dx, dy)); if (e < best.e) best = { e, s, dx, dy }; }
    return { ...best, bw: ib.width, bh: ib.height };
  }, { a: fs.readFileSync(A).toString('base64'), b: fs.readFileSync(B).toString('base64'), R: [+x0, +y0, +x1, +y1] });
  console.log(JSON.stringify(r)); await br.close();
})();
