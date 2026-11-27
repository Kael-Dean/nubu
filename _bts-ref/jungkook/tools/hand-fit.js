// Fit generated hand-pose panels (forearm + hand, same framing as the master) onto the master wrist, then cut each
// at the master hand line so it swaps in for handR/handL exactly. usage: node hand-fit.js <master.webp> <panelDir> <R|L> <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [master, pdir, side, cut] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(cut, 'rig.json')));
const POSES = process.env.POSES ? process.env.POSES.split(',') : ['relaxed', 'fist', 'wave', 'peace', 'thumbsup', 'point', 'fingerheart', 'bigheart_half'];
const WIN = process.env.WIN ? JSON.parse(process.env.WIN) : (side === 'R' ? [420, 1500, 1050, 2250] : [1760, 1500, 2420, 2250]);
const files = fs.readdirSync(pdir).filter(f => f.endsWith('.png')).sort();
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ FORCE_S, MROW, FEATHER_CUT, FOREARM, mb64, panels, WIN, J, side }) => {
    const ld = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    const M = await ld(mb64, 'webp'); const [wx0, wy0, wx1, wy1] = WIN, WW = wx1 - wx0, WH = wy1 - wy0;
    const mc = new OffscreenCanvas(WW, WH), mx = mc.getContext('2d'); mx.drawImage(M, -wx0, -wy0); const md = mx.getImageData(0, 0, WW, WH).data;
    const elbow = J['elbow' + side], wrist = J['wrist' + side]; const dx = wrist[0] - elbow[0], dy = wrist[1] - elbow[1], L = Math.hypot(dx, dy);
    const along = (x, y) => ((x - wrist[0]) * dx + (y - wrist[1]) * dy) / L;
    // master content bbox in the window (arm side only)
    let bx0 = WW, by0 = WH, bx1 = 0, by1 = 0; for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) if (md[(y * WW + x) * 4 + 3] > 128) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    const D = 3, sw = Math.ceil(WW / D), sh = Math.ceil(WH / D);
    const small = (img, s, ox, oy) => { const c = new OffscreenCanvas(sw, sh), x = c.getContext('2d'); x.setTransform(s / D, 0, 0, s / D, ox / D, oy / D); x.drawImage(img, 0, 0); return x.getImageData(0, 0, sw, sh).data; };
    const MS = (() => { const c = new OffscreenCanvas(sw, sh), x = c.getContext('2d'); x.drawImage(mc, 0, 0, sw, sh); return x.getImageData(0, 0, sw, sh).data; })();
    const score = (pd, forearmOnly) => { let s = 0, n = 0; for (let y = 0; y < sh; y++) { const my = y * D + wy0; if (forearmOnly && along(wx0 + sw / 2 * D, my) > -60 && my > wrist[1] - 60) continue; for (let x = 0; x < sw; x++) { const mxp = x * D + wx0; if (forearmOnly && along(mxp, my) > -60) continue; const i = (y * sw + x) * 4; const a = MS[i + 3] > 128, b = pd[i + 3] > 128; if (!a && !b) continue; n++; if (a !== b) { s += 300; continue; } s += Math.abs(MS[i] - pd[i]) + Math.abs(MS[i + 1] - pd[i + 1]) + Math.abs(MS[i + 2] - pd[i + 2]); } } return n ? s / n : 1e9; };
    const out = []; let base = null;
    for (let k = 0; k < panels.length; k++) {
      const img = await ld(panels[k], 'png');
      let best = { e: 1e9 };
      if (k === 0 && FOREARM) { // fit panel 1 on the forearm only (master hand differs); scale from forearm widths
        const pc = new OffscreenCanvas(img.width, img.height), px = pc.getContext('2d'); px.drawImage(img, 0, 0); const pd = px.getImageData(0, 0, img.width, img.height).data;
        const rowW = (d, w, y) => { let a = -1, b2 = -1; for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { if (a < 0) a = x; b2 = x; } return [a, b2]; };
        const [pa, pb] = rowW(pd, img.width, 20); const my = (MROW || 1580) - wy0; const [ma, mb] = rowW(md, WW, my);
        const s0 = FORCE_S || (mb - ma) / (pb - pa);
        for (let s = FORCE_S ? s0 : s0 * 0.9; s <= (FORCE_S ? s0 : s0 * 1.1); s += s0 * 0.02) { const ox0 = FORCE_S ? (ma + mb) / 2 - s * (pa + pb) / 2 : ma - pa * s, oy0 = my - 20 * s; for (let ox = ox0 - 40; ox <= ox0 + 40; ox += 4) for (let oy = oy0 - 60; oy <= oy0 + 60; oy += 4) { const e = score(small(img, s, ox, oy), true); if (e < best.e) best = { e, s, ox, oy }; } }
        const b = best; for (let s = FORCE_S ? b.s : b.s * 0.985; s <= (FORCE_S ? b.s : b.s * 1.015); s += b.s * 0.005) for (let ox = b.ox - 5; ox <= b.ox + 5; ox += 1) for (let oy = b.oy - 5; oy <= b.oy + 5; oy += 1) { const e = score(small(img, s, ox, oy), true); if (e < best.e) best = { e, s, ox, oy }; }
        base = { ...best, pa };
      } else if (k === 0) { // full search on the relaxed hand (same pose as master)
        const s0 = (by1 - by0) / img.height;
        for (let s = s0 * 0.85; s <= s0 * 1.15; s += s0 * 0.02) { const ox0 = bx0 + (bx1 - bx0) / 2 - img.width * s / 2, oy0 = by0; for (let ox = ox0 - 60; ox <= ox0 + 60; ox += 6) for (let oy = oy0 - 60; oy <= oy0 + 60; oy += 6) { const e = score(small(img, s, ox, oy), false); if (e < best.e) best = { e, s, ox, oy }; } }
        const b = best; for (let s = b.s * 0.985; s <= b.s * 1.015; s += b.s * 0.005) for (let ox = b.ox - 6; ox <= b.ox + 6; ox += 1.5) for (let oy = b.oy - 6; oy <= b.oy + 6; oy += 1.5) { const e = score(small(img, s, ox, oy), false); if (e < best.e) best = { e, s, ox, oy }; }
        base = best;
      } else if (FOREARM) { // same framing in every panel: anchor on the forearm's left edge in the top row, then a small refine
        const s = base.s; const pc = new OffscreenCanvas(img.width, img.height), px = pc.getContext('2d'); px.drawImage(img, 0, 0); const pd = px.getImageData(0, 0, img.width, img.height).data;
        const leftAt = (d, w, y) => { for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) return x; return 0; };
        const pk = leftAt(pd, img.width, 20); const ox0 = base.ox + s * (base.pa - pk), oy0 = base.oy; /* same framing */
        for (let ox = ox0 - 8; ox <= ox0 + 8; ox += 1) for (let oy = oy0 - 8; oy <= oy0 + 8; oy += 1) { const e = score(small(img, s, ox, oy), true); if (e < best.e) best = { e, s, ox, oy }; }
      } else { // same scale; align the forearm (top of panel) to the master forearm
        const s = base.s;
        for (let ox = base.ox - 120; ox <= base.ox + 120; ox += 4) for (let oy = base.oy - 60; oy <= base.oy + 60; oy += 4) { const e = score(small(img, s, ox, oy), true); if (e < best.e) best = { e, s, ox, oy }; }
        const b = best; for (let ox = b.ox - 4; ox <= b.ox + 4; ox += 1) for (let oy = b.oy - 4; oy <= b.oy + 4; oy += 1) { const e = score(small(img, s, ox, oy), true); if (e < best.e) best = { e, s, ox, oy }; }
      }
      // render at full res into the window and keep only the hand part (master hand-line rule: along > -35)
      const c = new OffscreenCanvas(WW, WH), x = c.getContext('2d'); x.setTransform(best.s, 0, 0, best.s, best.ox, best.oy); x.drawImage(img, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
      const d = x.getImageData(0, 0, WW, WH); let x0 = WW, y0 = WH, x1 = -1, y1 = -1;
      for (let y = 0; y < WH; y++) for (let xx = 0; xx < WW; xx++) { const q = (y * WW + xx) * 4; const al = along(xx + wx0, y + wy0); if (FEATHER_CUT) { if (al <= -150) { d.data[q + 3] = 0; continue; } if (al < -90) d.data[q + 3] = Math.round(d.data[q + 3] * (al + 150) / 60); } else if (al <= -35) { d.data[q + 3] = 0; continue; } if (d.data[q + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      x.putImageData(d, 0, 0); const w = x1 - x0 + 1, h = y1 - y0 + 1; const oc = new OffscreenCanvas(w, h); oc.getContext('2d').drawImage(c, -x0, -y0);
      const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      out.push({ x: wx0 + x0, y: wy0 + y0, w, h, err: Math.round(best.e), s: +best.s.toFixed(4), png: btoa(st) });
    }
    return out;

  }, { FORCE_S: +(process.env.FORCE_S || 0), MROW: +(process.env.MROW || 0), FEATHER_CUT: !!process.env.FEATHER_CUT, FOREARM: !!process.env.FOREARM, mb64: fs.readFileSync(master).toString("base64"), panels: files.map(f => fs.readFileSync(path.join(pdir, f)).toString('base64')), WIN, J: rig.joints, side });
  const hdir = path.join(cut, 'hands'); fs.mkdirSync(hdir, { recursive: true }); rig.handPoses = rig.handPoses || {};
  res.forEach((r, k) => { const n = `hand${side}_${POSES[k]}`; fs.writeFileSync(path.join(hdir, n + '.png'), Buffer.from(r.png, 'base64'));
    rig.handPoses[n] = { file: `hands/${n}.png`, x: r.x, y: r.y, w: r.w, h: r.h, bindTo: 'hand' + side, fitError: r.err }; console.log(n, r.x, r.y, r.w + 'x' + r.h, 'scale', r.s, 'err', r.err); });
  fs.writeFileSync(path.join(cut, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
