// Cut feathered shoulder caps from the master (deltoid + top of the armhole), drawn ABOVE arm and torso and bound to
// the clavicle, so raising the arm slides it under the cap instead of opening a wedge. usage: node shoulder-caps.js <master_nobg.webp> <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [master, dir] = process.argv.slice(2); const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
// cap centre sits on the top of the deltoid, a bit outside the pivot; radius covers the armhole top
const CAPS = { capR: { c: [985, 905], r: 135 }, capL: { c: [1818, 902], r: 146 } }; const FEATHER = 30;
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ b64, CAPS, FEATHER }) => {
    const i = new Image(); i.src = 'data:image/webp;base64,' + b64; await i.decode(); const W = i.width;
    const out = {};
    for (const [n, { c, r }] of Object.entries(CAPS)) {
      const x0 = c[0] - r, y0 = c[1] - r, s = r * 2 + 1; const cv = new OffscreenCanvas(s, s), x = cv.getContext('2d'); x.drawImage(i, -x0, -y0);
      const d = x.getImageData(0, 0, s, s);
      for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) { const dist = Math.hypot(xx - r, y - r); const k = (y * s + xx) * 4;
        const f = dist >= r ? 0 : dist <= r - FEATHER ? 1 : (r - dist) / FEATHER; d.data[k + 3] = Math.round(d.data[k + 3] * f * f * (3 - 2 * f)); }
      x.putImageData(d, 0, 0); const bl = await cv.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      out[n] = { x: x0, y: y0, w: s, h: s, png: btoa(st) };
    }
    return out;
  }, { b64: fs.readFileSync(master).toString('base64'), CAPS, FEATHER });
  for (const [n, v] of Object.entries(res)) { fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(v.png, 'base64')); rig.pieces[n] = { file: n + '.png', x: v.x, y: v.y, w: v.w, h: v.h, bindTo: n === 'capR' ? 'clavR' : 'clavL' }; console.log(n, v.x, v.y, v.w); }
  rig.drawOrder = ['thighR', 'shinR', 'thighL', 'shinL', 'shoeR', 'shoeL', 'pelvis', 'armL', 'handL', 'torso', 'capL', 'head', 'armR', 'handR', 'capR'];
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
