// Transfer the tattoo artwork of a regenerated right arm onto the MASTER arm shape (bone-space warp per segment),
// re-fit the new hand at the master wrist, and rebuild capR. usage:
// node warp-tattoo-arm.js <master.webp> <newAligned.webp> <cutDir> '<newJointsJSON>'
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [master, newImg, dir, nj] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'))); const N = JSON.parse(nj); const J = rig.joints;
const A = rig.pieces.armR, Hd = rig.pieces.handR, T = rig.pieces.torso, C = rig.pieces.capR;
const b = f => fs.readFileSync(path.join(dir, f)).toString('base64');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const out = await pg.evaluate(async ({ nb64, mb64, arm, hand, torso, A, Hd, T, C, J, N }) => {
    const ld = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    const W = 2759, H = 4096;
    const full = async (d, t, ox = 0, oy = 0) => { const im = await ld(d, t); const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(im, ox, oy); return x.getImageData(0, 0, W, H).data; };
    const NI = await full(nb64, 'webp'); const AR = await full(arm, 'png', A.x, A.y);
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], dot = (p, q) => p[0] * q[0] + p[1] * q[1], len = p => Math.hypot(p[0], p[1]);
    const seg = (a, c) => { const d = sub(c, a), L = len(d), u = [d[0] / L, d[1] / L]; return { a, L, u, n: [-u[1], u[0]] }; };
    const mU = seg(J.shoulderR, J.elbowR), mF = seg(J.elbowR, J.wristR), nU = seg(N.shoulderR, N.elbowR), nF = seg(N.elbowR, N.wristR);
    // half-width of an arm (alpha > 128) at a point along a segment, measured across it
    const half = (img, s, t) => { const c = [s.a[0] + s.u[0] * s.L * t, s.a[1] + s.u[1] * s.L * t]; let w = 0; for (const sg of [1, -1]) { for (let r = 0; r < 260; r++) { const x = Math.round(c[0] + s.n[0] * r * sg), y = Math.round(c[1] + s.n[1] * r * sg); if (img[(y * W + x) * 4 + 3] < 128) { w += r; break; } } } return w / 2; };
    const kU = half(NI, nU, 0.6) / half(AR, mU, 0.6), kF = half(NI, nF, 0.5) / half(AR, mF, 0.5);
    const sample = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const r = [0, 0, 0, 0];
      for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { const i = ((y0 + dy) * W + x0 + dx) * 4; for (let k = 0; k < 4; k++) r[k] += NI[i + k] * w; } return r; };
    // elbow split line = bisector at the master elbow
    const bis = (() => { const v = [mU.u[0] + mF.u[0], mU.u[1] + mF.u[1]], L = len(v); return [v[0] / L, v[1] / L]; })();
    const ac = new OffscreenCanvas(A.w, A.h), ax = ac.getContext('2d'); const ad = ax.createImageData(A.w, A.h);
    const BL = 40; // blend band across the elbow line (px)
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const gi = ((y + A.y) * W + x + A.x) * 4; const a = AR[gi + 3]; if (!a) continue;
      const P = [x + A.x, y + A.y];
      const map = (m, n, k) => { const v = sub(P, m.a); const t = dot(v, m.u) / m.L, d = dot(v, m.n); return [n.a[0] + n.u[0] * n.L * t + n.n[0] * d * k, n.a[1] + n.u[1] * n.L * t + n.n[1] * d * k]; };
      const side = dot(sub(P, J.elbowR), bis); // <0 upper arm, >0 forearm
      const pu = map(mU, nU, kU), pf = map(mF, nF, kF); const w = Math.max(0, Math.min(1, (side + BL / 2) / BL));
      const q = [pu[0] * (1 - w) + pf[0] * w, pu[1] * (1 - w) + pf[1] * w]; const c = sample(q[0], q[1]);
      const o = (y * A.w + x) * 4; ad.data[o] = c[0]; ad.data[o + 1] = c[1]; ad.data[o + 2] = c[2];
      // keep the master silhouette; where the new arm has no pixel (outside its outline) fall back to master pixel
      ad.data[o + 3] = c[3] > 200 ? a : 0; if (c[3] <= 200) { ad.data[o] = AR[gi]; ad.data[o + 1] = AR[gi + 1]; ad.data[o + 2] = AR[gi + 2]; ad.data[o + 3] = a; } }
    ax.putImageData(ad, 0, 0);
    // hand: new pixels past the new wrist line, similarity-transformed onto the master wrist
    const ang = Math.atan2(mF.u[1], mF.u[0]) - Math.atan2(nF.u[1], nF.u[0]); const hs = 1 / kF;
    const hw = 640, hh = 640, hx0 = Math.round(J.wristR[0] - 320), hy0 = Math.round(J.wristR[1] - 120);
    const hc = new OffscreenCanvas(hw, hh), hx = hc.getContext('2d'); const nc = new OffscreenCanvas(W, H); const ncx = nc.getContext('2d'); const nid = new ImageData(new Uint8ClampedArray(NI), W, H);
    // mask the new image to the hand only (along new forearm > -35 from the new wrist)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!nid.data[i + 3]) continue; if (x > 1050 || y < 1500 || dot(sub([x, y], N.wristR), nF.u) <= -35) nid.data[i + 3] = 0; }
    ncx.putImageData(nid, 0, 0);
    hx.translate(J.wristR[0] - hx0, J.wristR[1] - hy0); hx.rotate(ang); hx.scale(hs, hs); hx.translate(-N.wristR[0], -N.wristR[1]); hx.drawImage(nc, 0, 0);
    // trim
    const hd = hx.getImageData(0, 0, hw, hh).data; let x0 = hw, y0 = hh, x1 = -1, y1 = -1; for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (hd[(y * hw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const tc = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); tc.getContext('2d').drawImage(hc, -x0, -y0);
    // capR from (torso + new arm) composite, same disc + feather as before
    const cc = new OffscreenCanvas(W, H), cx = cc.getContext('2d'); cx.drawImage(await ld(torso, 'png'), T.x, T.y); cx.drawImage(ac, A.x, A.y);
    const r = (C.w - 1) / 2, cap = new OffscreenCanvas(C.w, C.h), kx = cap.getContext('2d'); kx.drawImage(cc, -C.x, -C.y); const cd = kx.getImageData(0, 0, C.w, C.h);
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const dd = Math.hypot(x - r, y - r), k = (y * C.w + x) * 4; const f = dd >= r ? 0 : dd <= r - 30 ? 1 : (r - dd) / 30; cd.data[k + 3] = Math.round(cd.data[k + 3] * f * f * (3 - 2 * f)); }
    kx.putImageData(cd, 0, 0);
    const enc = async c => { const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); };
    return { arm: await enc(ac), hand: await enc(tc), hand_x: hx0 + x0, hand_y: hy0 + y0, hand_w: x1 - x0 + 1, hand_h: y1 - y0 + 1, cap: await enc(cap), kU, kF, angDeg: ang * 180 / Math.PI };
  }, { nb64: fs.readFileSync(newImg).toString('base64'), mb64: '', arm: b(A.file), hand: b(Hd.file), torso: b(T.file), A, Hd, T, C, J, N });
  fs.mkdirSync(path.join(dir, '_old_tattoo'), { recursive: true });
  for (const f of ['armR.png', 'handR.png', 'capR.png']) fs.copyFileSync(path.join(dir, f), path.join(dir, '_old_tattoo', f));
  fs.writeFileSync(path.join(dir, 'armR.png'), Buffer.from(out.arm, 'base64'));
  fs.writeFileSync(path.join(dir, 'handR.png'), Buffer.from(out.hand, 'base64'));
  fs.writeFileSync(path.join(dir, 'capR.png'), Buffer.from(out.cap, 'base64'));
  rig.pieces.handR = { file: 'handR.png', x: out.hand_x, y: out.hand_y, w: out.hand_w, h: out.hand_h };
  rig.tattooSource = 'real-tattoo regen (sheets/master_realtattoo_aligned.webp), warped onto master arm';
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log('width ratios upper/fore', out.kU.toFixed(3), out.kF.toFixed(3), 'hand rot', out.angDeg.toFixed(1), 'handR', out.hand_x, out.hand_y, out.hand_w + 'x' + out.hand_h);
  await br.close();
})();
