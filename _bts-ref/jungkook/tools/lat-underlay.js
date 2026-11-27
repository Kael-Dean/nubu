// Cut armpit + lat ("wing") skin from the generated T-pose, aligned to master coords, as underlay pieces drawn BEHIND
// torso and arms. They fill the side of the chest that opens up when the arms rise.
// usage: node lat-underlay.js <tpose_nobg.webp> <cutDir> <s> <dx> <dy>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [tp, dir, s, dx, dy] = process.argv.slice(2); const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const POLY = {
  latR: [[880, 1060], [930, 950], [1150, 780], [1175, 800], [1135, 960], [1075, 1185], [1020, 1185], [965, 1070]],
  latL: [[1625, 800], [1650, 780], [1870, 950], [1925, 1060], [1835, 1070], [1780, 1185], [1725, 1185], [1665, 960]],
};
const FEATHER = 18;
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ b64, POLY, s, dx, dy, FEATHER }) => {
    const i = new Image(); i.src = 'data:image/webp;base64,' + b64; await i.decode();
    const out = {};
    for (const [n, P] of Object.entries(POLY)) {
      const xs = P.map(p => p[0]), ys = P.map(p => p[1]); const x0 = Math.min(...xs) - 4, y0 = Math.min(...ys) - 4, w = Math.max(...xs) - x0 + 8, h = Math.max(...ys) - y0 + 8;
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.setTransform(s, 0, 0, s, dx - x0, dy - y0); x.drawImage(i, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
      const d = x.getImageData(0, 0, w, h);
      // polygon mask + distance-to-edge feather
      const inPoly = (px, py) => { let ins = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xa, ya] = P[a], [xb, yb] = P[b]; if (((ya > py) !== (yb > py)) && (px < (xb - xa) * (py - ya) / (yb - ya) + xa)) ins = !ins; } return ins; };
      const segD = (px, py) => { let m = 1e9; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [x1, y1] = P[b], [x2, y2] = P[a]; const vx = x2 - x1, vy = y2 - y1; const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy))); m = Math.min(m, Math.hypot(px - x1 - t * vx, py - y1 - t * vy)); } return m; };
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const k = (y * w + xx) * 4; const px = xx + x0, py = y + y0;
        if (!inPoly(px, py)) { d.data[k + 3] = 0; continue; }
        const L = 0.299 * d.data[k] + 0.587 * d.data[k + 1] + 0.114 * d.data[k + 2]; if (L < 80) { d.data[k + 3] = 0; continue; } // drop tank-top pixels, keep skin
        const f = Math.min(1, segD(px, py) / FEATHER); d.data[k + 3] = Math.round(d.data[k + 3] * f); }
      x.putImageData(d, 0, 0); const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      out[n] = { x: x0, y: y0, w, h, png: btoa(st) };
    }
    return out;
  }, { b64: fs.readFileSync(tp).toString('base64'), POLY, s: +s, dx: +dx, dy: +dy, FEATHER });
  for (const [n, v] of Object.entries(res)) { fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(v.png, 'base64')); rig.pieces[n] = { file: n + '.png', x: v.x, y: v.y, w: v.w, h: v.h, bindTo: 'chest', note: 'behind torso+arms; show (opacity 1) only while the arm is raised > ~30°' }; console.log(n, v.x, v.y, v.w + 'x' + v.h); }
  rig.drawOrder = ['latR', 'latL', 'thighR', 'shinR', 'thighL', 'shinL', 'shoeR', 'shoeL', 'pelvis', 'armL', 'handL', 'torso', 'capL', 'head', 'armR', 'handR', 'capR'];
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
