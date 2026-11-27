// 1) Paint the chest/shoulder tattoo continuation onto the master torso skin (right side only, stops before the
//    sternum and below the neck). 2) Replace handR with the back-of-hand tattoo version, fitted to the master wrist.
// 3) Rebuild capR from torso+armR. usage: node chest-hand-tattoo.js <new_nobg.webp> <cutDir> '<cfgJSON>'
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [newImg, dir, cfgS] = process.argv.slice(2); const cfg = JSON.parse(cfgS);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const P = rig.pieces, J = rig.joints; const b = f => fs.readFileSync(path.join(dir, f)).toString('base64');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const o = await pg.evaluate(async ({ nb, torso, arm, T, A, C, J, cfg }) => {
    const ld = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    const W = 2759, H = 4096; const NIm = await ld(nb, 'webp');
    const al = new OffscreenCanvas(W, H), ax = al.getContext('2d'); ax.setTransform(cfg.s, 0, 0, cfg.s, cfg.dx, cfg.dy); ax.drawImage(NIm, 0, 0); const N = ax.getImageData(0, 0, W, H).data;
    // ---- chest: blend tattoo pixels onto master torso skin inside the allowed region
    const tc = new OffscreenCanvas(T.w, T.h), tx = tc.getContext('2d'); tx.drawImage(await ld(torso, 'png'), 0, 0); const td = tx.getImageData(0, 0, T.w, T.h);
    const skin = [238, 190, 152]; let painted = 0;
    const regionW = (x, y) => { // allowed area weight: right side of the chest/shoulder, below the neck, not past the sternum
      if (y < cfg.yTop || y > cfg.yBot) return 0;
      if (x > cfg.xMid) return 0; const fx = Math.min(1, (cfg.xMid - x) / cfg.fade);
      const fy = Math.min(1, (y - cfg.yTop) / 25) * Math.min(1, (cfg.yBot - y) / cfg.fade);
      if (x > cfg.neckX0 && y < cfg.neckY) return 0; // keep the neck clean
      return fx * fy; };
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) { const gx = x + T.x, gy = y + T.y, k = (y * T.w + x) * 4; if (td.data[k + 3] < 200) continue;
      const L = 0.299 * td.data[k] + 0.587 * td.data[k + 1] + 0.114 * td.data[k + 2]; if (L < 115) continue; // only master skin, never the tank top
      const w = regionW(gx, gy); if (!w) continue; const n = (gy * W + gx) * 4; if (N[n + 3] < 200) continue;
      const d = Math.hypot(N[n] - skin[0], N[n + 1] - skin[1], N[n + 2] - skin[2]); const t = Math.max(0, Math.min(1, (d - 45) / 55)) * w; if (t <= 0) continue;
      for (let c = 0; c < 3; c++) td.data[k + c] = Math.round(td.data[k + c] * (1 - t) + N[n + c] * t); painted++; }
    tx.putImageData(td, 0, 0);
    // ---- hand: new back-of-hand past the new wrist line, similarity-fitted onto the master wrist
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], dot = (p, q) => p[0] * q[0] + p[1] * q[1];
    const nU = (() => { const d = sub(cfg.wrist, cfg.elbow), L = Math.hypot(...d); return [d[0] / L, d[1] / L]; })();
    const mU = (() => { const d = sub(J.wristR, J.elbowR), L = Math.hypot(...d); return [d[0] / L, d[1] / L]; })();
    const ang = Math.atan2(mU[1], mU[0]) - Math.atan2(nU[1], nU[0]);
    // master forearm width just above the wrist, from the arm piece
    const ac = new OffscreenCanvas(W, H), acx = ac.getContext('2d'); acx.drawImage(await ld(arm, 'png'), A.x, A.y); const AD = acx.getImageData(0, 0, W, H).data;
    const width = (img, c, u) => { const n = [-u[1], u[0]]; let w = 0; for (const s of [1, -1]) for (let r = 0; r < 200; r++) { const x = Math.round(c[0] + n[0] * r * s), y = Math.round(c[1] + n[1] * r * s); if (img[(y * W + x) * 4 + 3] < 128) { w += r; break; } } return w; };
    const mW = width(AD, [J.wristR[0] - mU[0] * 40, J.wristR[1] - mU[1] * 40], mU), nW = width(N, [cfg.wrist[0] - nU[0] * 40 + 0, cfg.wrist[1] - nU[1] * 40], nU);
    const hs = mW / nW;
    const src = new OffscreenCanvas(W, H), sx = src.getContext('2d'); const sd = new ImageData(new Uint8ClampedArray(N), W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!sd.data[i + 3]) continue; if (x > 1080 || y < 1700 || dot(sub([x, y], cfg.wrist), nU) <= -35) sd.data[i + 3] = 0; }
    { // keep only the blob connected to the hand (drops pants/pocket pixels that sit next to it)
      const seed = [Math.round(cfg.wrist[0] + nU[0] * 80), Math.round(cfg.wrist[1] + nU[1] * 80)]; const keep = new Uint8Array(W * H); const st = [seed[1] * W + seed[0]]; keep[st[0]] = 1;
      const lumN = i => 0.299 * sd.data[i * 4] + 0.587 * sd.data[i * 4 + 1] + 0.114 * sd.data[i * 4 + 2];
      while (st.length) { const p = st.pop(); for (const q of [p - 1, p + 1, p - W, p + W]) if (!keep[q] && sd.data[q * 4 + 3] > 40 && !(lumN(q) < 60 && Math.abs(sd.data[q * 4] - sd.data[q * 4 + 2]) < 12 && (q % W) > cfg.wrist[0] + 90)) { keep[q] = 1; st.push(q); } }
      for (let i = 0; i < W * H; i++) if (!keep[i]) sd.data[i * 4 + 3] = 0; }
    sx.putImageData(sd, 0, 0);
    const hw = 700, hh = 700, hx0 = Math.round(J.wristR[0] - 350), hy0 = Math.round(J.wristR[1] - 150);
    const hc = new OffscreenCanvas(hw, hh), hx = hc.getContext('2d'); hx.translate(J.wristR[0] - hx0, J.wristR[1] - hy0); hx.rotate(ang); hx.scale(hs, hs); hx.translate(-cfg.wrist[0], -cfg.wrist[1]); hx.drawImage(src, 0, 0);
    const hd = hx.getImageData(0, 0, hw, hh).data; let x0 = hw, y0 = hh, x1 = -1, y1 = -1; for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (hd[(y * hw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const hcrop = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); hcrop.getContext('2d').drawImage(hc, -x0, -y0);
    // ---- capR from torso(tattooed) + armR
    const cc = new OffscreenCanvas(W, H), cx = cc.getContext('2d'); cx.drawImage(tc, T.x, T.y); cx.drawImage(ac, 0, 0);
    const r = (C.w - 1) / 2, cap = new OffscreenCanvas(C.w, C.h), kx = cap.getContext('2d'); kx.drawImage(cc, -C.x, -C.y); const cd = kx.getImageData(0, 0, C.w, C.h);
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const dd = Math.hypot(x - r, y - r), k = (y * C.w + x) * 4; const f = dd >= r ? 0 : dd <= r - 30 ? 1 : (r - dd) / 30; cd.data[k + 3] = Math.round(cd.data[k + 3] * f * f * (3 - 2 * f)); }
    kx.putImageData(cd, 0, 0);
    const enc = async c => { const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); };
    return { torso: await enc(tc), hand: await enc(hcrop), hx: hx0 + x0, hy: hy0 + y0, hw: x1 - x0 + 1, hh: y1 - y0 + 1, cap: await enc(cap), painted, hs, angDeg: ang * 180 / Math.PI, mW, nW };
  }, { nb: fs.readFileSync(newImg).toString('base64'), torso: b(P.torso.file), arm: b(P.armR.file), T: P.torso, A: P.armR, C: P.capR, J, cfg });
  const bk = path.join(dir, '_before_chest'); fs.mkdirSync(bk, { recursive: true });
  for (const f of ['torso.png', 'handR.png', 'capR.png']) fs.copyFileSync(path.join(dir, f), path.join(bk, f));
  fs.writeFileSync(path.join(dir, 'torso.png'), Buffer.from(o.torso, 'base64'));
  fs.writeFileSync(path.join(dir, 'handR.png'), Buffer.from(o.hand, 'base64'));
  fs.writeFileSync(path.join(dir, 'capR.png'), Buffer.from(o.cap, 'base64'));
  rig.pieces.handR = { file: 'handR.png', x: o.hx, y: o.hy, w: o.hw, h: o.hh };
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log('chest px painted', o.painted, '| hand scale', o.hs.toFixed(3), 'rot', o.angDeg.toFixed(1), 'widths', o.mW, o.nW, '| handR', o.hx, o.hy, o.hw + 'x' + o.hh);
  await br.close();
})();
