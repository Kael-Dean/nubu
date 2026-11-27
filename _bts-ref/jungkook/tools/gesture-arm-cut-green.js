// Cut a gesture arm that crosses the tank top, from a chroma-green version of the gesture image
// (tank + pants recoloured #00FF00, optionally face skin too). The green image is first aligned to the original gesture
// image (hair + shoes + other arm, which stayed), then placed with the original's registration fit from rig.gestureArms.
// usage: node gesture-arm-cut-green.js <green.png> <orig.png> <cutDir> <name> <R|L> [faceGreen 0|1]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [greenF, origF, dir, name, side, faceGreen = '0', yMax = '2650'] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const key = `${name}_${side}`; const fit = rig.gestureArms[key].fit;
const P = rig.pieces; const b = f => fs.readFileSync(path.join(dir, f)).toString('base64');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ gr, og, torso, head, fit, W, H, J, side, faceGreen, YMAX }) => {
    const ld = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
    const G = await ld(gr), O = await ld(og); const gw = G.width, gh = G.height;
    const px = im => { const c = new OffscreenCanvas(gw, gh), x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, gw, gh).data; };
    const gd = px(G), od = px(O);
    // align green → orig with an integer shift (±14 px) on pixels that are non-green and non-white in both
    let best = { e: 1e18, dx: 0, dy: 0 };
    const isG = (d, k) => d[k + 1] > 200 && d[k] < 90 && d[k + 2] < 90; const isW = (d, k) => d[k] > 235 && d[k + 1] > 235 && d[k + 2] > 235;
    for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) { let e = 0, n = 0;
      for (let y = 20; y < gh - 20; y += 3) for (let x = 20; x < gw - 20; x += 3) { const k = (y * gw + x) * 4, k2 = ((y + dy) * gw + x + dx) * 4; if (isG(gd, k) || isW(gd, k) || isW(od, k2)) continue; n++; e += Math.abs(gd[k] - od[k2]) + Math.abs(gd[k + 1] - od[k2 + 1]) + Math.abs(gd[k + 2] - od[k2 + 2]); }
      if (n && e / n < best.e) best = { e: e / n, dx, dy }; }
    // green image into master space: first shift by -best (to the orig frame), then the orig's registration fit
    const ac = new OffscreenCanvas(W, H), ax = ac.getContext('2d'); ax.setTransform(fit.s, 0, 0, fit.s, fit.ox + (-best.dx) * fit.s, fit.oy + (-best.dy) * fit.s);
    ax.drawImage(G, 0, 0); const A = ax.getImageData(0, 0, W, H).data;
    const pieceMask = async (p) => { const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(await ld(p.b64), p.x, p.y); return x.getImageData(0, 0, W, H).data; };
    const T = await pieceMask(torso), Hd = await pieceMask(head);
    const lum = (d, k) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
    const cand = new Uint8Array(W * H);
    for (let q = 0; q < W * H; q++) { const k = q * 4; if (A[k + 3] < 100) continue;
      const g = A[k + 1] > 170 && A[k] < 120 && A[k + 2] < 120 && A[k + 1] - Math.max(A[k], A[k + 2]) > 80; if (g) continue;
      if (A[k] > 232 && A[k + 1] > 232 && A[k + 2] > 232) continue; // white background
      const inT = T[k + 3] > 100, inH = Hd[k + 3] > 100;
      if (!inT && !inH) { cand[q] = 1; continue; }
      const rigDark = inT && lum(T, k) < 70;            // in front of the tank
      if (rigDark && !inH) { cand[q] = 1; continue; }
      if (faceGreen === '1') { const hair = inH && lum(Hd, k) < 70 && !(T[k + 3] > 100 && lum(T, k) < 70); if (!hair) cand[q] = 1; continue; } // over the rig's (bright) face/neck skin only: hand + mic, never hair
    }
    { const er = (m, r, v) => { const o = new Uint8Array(m); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { const q = y * W + x; if (m[q] === v) continue; if (m[q - r] === v || m[q + r] === v || m[q - r * W] === v || m[q + r * W] === v) o[q] = v; } return o; };
      let m = er(cand, 3, 0); m = er(m, 3, 1); cand.set(m); }
    // connected from the shoulder on this side
    const sj = side === 'R' ? J.shoulderR : J.shoulderL; const lab = new Uint8Array(W * H); const st = [];
    for (let y = sj[1] - 120; y < sj[1] + 200; y++) for (let x = sj[0] - 160; x < sj[0] + 160; x++) { const q = y * W + x; if (cand[q] && (side === 'R' ? x < 1400 : x > 1400)) st.push(q); }
    while (st.length) { const q = st.pop(); if (lab[q] || !cand[q]) continue; { const xx = q % W, yy = (q / W) | 0; if (yy > YMAX || (side === 'R' ? xx > 1650 : xx < 1150)) continue; } lab[q] = 1; const x = q % W; if (x > 0) st.push(q - 1); if (x < W - 1) st.push(q + 1); if (q >= W) st.push(q - W); if (q < W * (H - 1)) st.push(q + W); }
    // despill: pull green fringe toward neutral on the kept pixels
    const o = new ImageData(W, H), d = o.data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let q = 0; q < W * H; q++) { if (!lab[q]) continue; const k = q * 4; let r = A[k], g = A[k + 1], bb = A[k + 2]; const lim = Math.max(r, bb); if (g > lim) g = lim;
      d[k] = r; d[k + 1] = g; d[k + 2] = bb; d[k + 3] = A[k + 3]; const x = q % W, y = (q / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    // soft 1-px edge
    const c = new OffscreenCanvas(W, H); c.getContext('2d').putImageData(o, 0, 0); const cw = x1 - x0 + 1, ch = y1 - y0 + 1; const oc = new OffscreenCanvas(cw, ch); oc.getContext('2d').drawImage(c, -x0, -y0);
    const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
    return { png: btoa(s), x: x0, y: y0, w: cw, h: ch, shift: best };
  }, { gr: fs.readFileSync(greenF).toString('base64'), og: fs.readFileSync(origF).toString('base64'), torso: { ...P.torso, b64: b(P.torso.file) }, head: { ...P.head, b64: b(P.head.file) }, fit, W: rig.canvas[0], H: rig.canvas[1], J: rig.joints, side, faceGreen, YMAX: +yMax });
  fs.writeFileSync(path.join(dir, 'gest', key + '.png'), Buffer.from(res.png, 'base64'));
  Object.assign(rig.gestureArms[key], { x: res.x, y: res.y, w: res.w, h: res.h, source: path.basename(greenF), greenShift: res.shift });
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log(key, res.x, res.y, res.w + 'x' + res.h, 'shift', JSON.stringify(res.shift)); await br.close();
})();
