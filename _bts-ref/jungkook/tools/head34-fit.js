// Fit a generated 3/4 head image (made from the master head crop at 1050,130 700×760) back onto the master by its
// unchanged shoulders/tank, then cut the head + hair + neck as a swap piece whose neck fades into the torso.
// usage: node head34-fit.js <master.webp> <turned_nobg.webp> <cutDir> <name>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [master, img, dir, name] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const r = await pg.evaluate(async ({ mb, tb }) => {
    const ld = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    const W = 2759, H = 4096; const M = await ld(mb, 'webp'), T = await ld(tb, 'webp');
    const R = [1090, 720, 1710, 900]; // score window: straps, neckline, shoulders (unchanged in the edit)
    const D = 3, sw = Math.ceil((R[2] - R[0]) / D), sh = Math.ceil((R[3] - R[1]) / D);
    const grab = (im, s, ox, oy) => { const c = new OffscreenCanvas(sw, sh), x = c.getContext('2d'); x.setTransform(s / D, 0, 0, s / D, (ox - R[0]) / D, (oy - R[1]) / D); x.drawImage(im, 0, 0); return x.getImageData(0, 0, sw, sh).data; };
    const MD = grab(M, 1, 0, 0);
    const score = d => { let e = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const a = MD[i + 3] > 128, b = d[i + 3] > 128; if (!a && !b) continue; n++; if (a !== b) { e += 300; continue; } e += Math.abs(MD[i] - d[i]) + Math.abs(MD[i + 1] - d[i + 1]) + Math.abs(MD[i + 2] - d[i + 2]); } return n ? e / n : 1e9; };
    const s0 = 700 / T.width; let best = { e: 1e9 };
    for (let s = s0 * 0.85; s <= s0 * 1.15; s += s0 * 0.01) for (let ox = 1050 - 90; ox <= 1050 + 90; ox += 6) for (let oy = 130 - 120; oy <= 130 + 120; oy += 6) { const e = score(grab(T, s, ox, oy)); if (e < best.e) best = { e, s, ox, oy }; }
    const b0 = best; for (let s = b0.s * 0.99; s <= b0.s * 1.01; s += b0.s * 0.002) for (let ox = b0.ox - 6; ox <= b0.ox + 6; ox += 1) for (let oy = b0.oy - 6; oy <= b0.oy + 6; oy += 1) { const e = score(grab(T, s, ox, oy)); if (e < best.e) best = { e, s, ox, oy }; }
    // render aligned at full res in a window around the head
    const X0 = 1050, Y0 = 60, WW = 700, WH = 900; const c = new OffscreenCanvas(WW, WH), x = c.getContext('2d'); x.setTransform(best.s, 0, 0, best.s, best.ox - X0, best.oy - Y0); x.drawImage(T, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
    const id = x.getImageData(0, 0, WW, WH); const d = id.data;
    for (let y = 0; y < WH; y++) for (let xx = 0; xx < WW; xx++) { const k = (y * WW + xx) * 4; if (!d[k + 3]) continue; const gx = xx + X0, gy = y + Y0;
      const L = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2], sat = Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]);
      const tank = L < 70 && sat < 18 && gy > 690;
      if (gy > 690 && (gx < 1255 || gx > 1545)) { d[k + 3] = 0; continue; }   // shoulders/straps stay on the torso
      if (tank) { d[k + 3] = 0; continue; }
      if (gy > 880) { d[k + 3] = 0; continue; }
      if (gy > 800) d[k + 3] = Math.round(d[k + 3] * (880 - gy) / 80);          // neck fades into the torso's neck
    }
    x.putImageData(id, 0, 0);
    let x0 = WW, y0 = WH, x1 = -1, y1 = -1; for (let y = 0; y < WH; y++) for (let xx = 0; xx < WW; xx++) if (d[(y * WW + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const o = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0);
    const bl = await o.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
    return { png: btoa(st), x: X0 + x0, y: Y0 + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, fit: best };
  }, { mb: fs.readFileSync(master).toString('base64'), tb: fs.readFileSync(img).toString('base64') });
  fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(r.png, 'base64'));
  rig.head34 = rig.head34 || {}; rig.head34[name] = { file: name + '.png', x: r.x, y: r.y, w: r.w, h: r.h, bindTo: 'head', note: 'whole 3/4 head (hair+face+neck), neutral expression; neck fades out over y 800-880 into the torso neck', fit: r.fit };
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log(name, r.x, r.y, r.w + 'x' + r.h, 'fit', JSON.stringify(r.fit)); await br.close();
})();
