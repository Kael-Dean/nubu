const { chromium } = require('D:/NUBU/node_modules/playwright'); const fs = require('fs'), path = require('path');
const [filter, out, cols = 6, crop] = process.argv.slice(2);
const names = JSON.parse(fs.readFileSync('frames/shots.json')).filter(n => new RegExp(filter).test(n));
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const r = await p.evaluate(async ({ imgs, names, cols, crop }) => { const L = []; for (const d of imgs) { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); L.push(i); }
    const W = L[0].width, H = L[0].height; const [cx, cy, cw, ch] = crop ? crop.split(',').map(Number).map((v, k) => v * (k % 2 ? H : W)) : [0, 0, W, H];
    const tw = 300, th = Math.round(tw * ch / cw), rows = Math.ceil(L.length / cols); const c = new OffscreenCanvas(tw * cols, (th + 22) * rows), x = c.getContext('2d');
    x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height); x.font = '15px sans-serif'; x.fillStyle = '#fff';
    L.forEach((im, k) => { const X = (k % cols) * tw, Y = Math.floor(k / cols) * (th + 22); x.drawImage(im, cx, cy, cw, ch, X, Y + 22, tw, th); x.fillText(names[k], X + 4, Y + 16); });
    const bl = await c.convertToBlob(); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); },
    { imgs: names.map(n => fs.readFileSync(`frames/${n}.png`).toString('base64')), names, cols: +cols, crop });
  fs.writeFileSync(out, Buffer.from(r, 'base64')); await b.close(); })();
