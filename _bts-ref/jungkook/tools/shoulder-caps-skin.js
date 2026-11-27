// Shoulder caps built from SKIN ONLY: the arm piece (skin + tattoo ink) plus the torso's skin pixels inside a disc —
// no tank-top fabric, so a rotating cap never drags a copy of the strap. usage: node shoulder-caps-skin.js <cutDir> '<capsJSON>'
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [dir, cj] = process.argv.slice(2); const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'))); const CAPS = JSON.parse(cj); const P = rig.pieces;
const b = f => fs.readFileSync(path.join(dir, f)).toString('base64');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ CAPS, P, files }) => {
    const ld = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
    const out = {};
    for (const [n, { c, r, arm, feather }] of Object.entries(CAPS)) {
      const s = r * 2 + 1, x0 = c[0] - r, y0 = c[1] - r;
      const tc = new OffscreenCanvas(s, s), tx = tc.getContext('2d'); tx.drawImage(await ld(files.torso), P.torso.x - x0, P.torso.y - y0); const T = tx.getImageData(0, 0, s, s).data;
      const ac = new OffscreenCanvas(s, s), axx = ac.getContext('2d'); axx.drawImage(await ld(files[arm]), P[arm].x - x0, P[arm].y - y0); const A = axx.getImageData(0, 0, s, s).data;
      const o = new ImageData(s, s); const d = o.data;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const k = (y * s + x) * 4; const dist = Math.hypot(x - r, y - r); if (dist >= r) continue;
        const f = dist <= r - feather ? 1 : (r - dist) / feather; const fs2 = f * f * (3 - 2 * f);
        let src = null;
        if (A[k + 3] > 8) src = A;                                                             // arm: skin + tattoo
        else if (T[k + 3] > 8 && (0.299 * T[k] + 0.587 * T[k + 1] + 0.114 * T[k + 2]) > 105) src = T; // torso skin only
        if (!src) continue; for (let q = 0; q < 3; q++) d[k + q] = src[k + q]; d[k + 3] = Math.round(src[k + 3] * fs2); }
      const cv = new OffscreenCanvas(s, s); cv.getContext('2d').putImageData(o, 0, 0);
      const bl = await cv.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      out[n] = { x: x0, y: y0, w: s, h: s, png: btoa(st) };
    }
    return out;
  }, { CAPS, P, files: { torso: b(P.torso.file), armR: b(P.armR.file), armL: b(P.armL.file) } });
  for (const [n, v] of Object.entries(res)) { fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(v.png, 'base64')); rig.pieces[n] = { file: n + '.png', x: v.x, y: v.y, w: v.w, h: v.h, bindTo: n === 'capR' ? 'clavR' : 'clavL', note: 'skin-only cap (no tank fabric)' }; console.log(n, v.x, v.y, v.w); }
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
