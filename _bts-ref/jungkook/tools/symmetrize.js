// Make both arms/hands come from ONE drawing: armR = mirrored armL + tattoo ink; hands R = tattooed back-of-hand set
// moved to the mirrored wrist and tone-matched; hands L = the same hands mirrored with the ink removed.
// usage: node symmetrize.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const P = rig.pieces, J = rig.joints, MX = 1400; // mirror axis (body centre)
const POSES = ['relaxed', 'fist', 'wave', 'peace', 'thumbsup', 'point', 'fingerheart', 'bigheart_half'];
const b = f => fs.readFileSync(path.join(dir, f)).toString('base64');
const mir = p => [2 * MX - p[0], p[1]];
const NJ = { shoulderR: mir(J.shoulderL), elbowR: mir(J.elbowL), wristR: mir(J.wristL) };
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ files, P, HP, J, NJ, MX, POSES }) => {
    const W = 2759, H = 4096;
    const ld = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
    const enc = async c => { const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); };
    const fullOf = async (f, x, y, mirror) => { const c = new OffscreenCanvas(W, H), cx = c.getContext('2d'); const im = await ld(files[f]); if (mirror) { cx.translate(2 * MX, 0); cx.scale(-1, 1); } cx.drawImage(im, x, y); return cx.getImageData(0, 0, W, H); };
    const bbox = d => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; };
    const crop = async (img) => { const bb = bbox(img.data); const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1; const c = new OffscreenCanvas(W, H); c.getContext('2d').putImageData(img, 0, 0); const o = new OffscreenCanvas(w, h); o.getContext('2d').drawImage(c, -bb.x0, -bb.y0); return { x: bb.x0, y: bb.y0, w, h, png: await enc(o) }; };
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // skin reference = median of light pixels of armL
    const L = await fullOf(P.armL.file, P.armL.x, P.armL.y, false); const sk = [[], [], []];
    for (let i = 0; i < W * H * 4; i += 4 * 7) if (L.data[i + 3] > 250 && lum(L.data, i) > 150) for (let c = 0; c < 3; c++) sk[c].push(L.data[i + c]);
    const skin = sk.map(a => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
    // ---------- armR = mirrored armL + ink from the current tattoo armR (bone-space warp R master → mirrored joints)
    const base = await fullOf(P.armL.file, P.armL.x, P.armL.y, true); const T = await fullOf(P.armR.file, P.armR.x, P.armR.y, false);
    // tattoo-arm skin reference
    const tk = [[], [], []]; for (let i = 0; i < W * H * 4; i += 4 * 5) if (T.data[i + 3] > 250 && lum(T.data, i) > 170) for (let c = 0; c < 3; c++) tk[c].push(T.data[i + c]);
    const tskin = tk.map(a => { a.sort((p, q) => p - q); return a[Math.floor(a.length * 0.6)]; });
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], dot = (p, q) => p[0] * q[0] + p[1] * q[1];
    const seg = (a, c) => { const d = sub(c, a), Lg = Math.hypot(...d), u = [d[0] / Lg, d[1] / Lg]; return { a, L: Lg, u, n: [-u[1], u[0]] }; };
    const tU = seg(NJ.shoulderR, NJ.elbowR), tF = seg(NJ.elbowR, NJ.wristR), sU = seg(J.shoulderR, J.elbowR), sF = seg(J.elbowR, J.wristR);
    const bis = (() => { const v = [tU.u[0] + tF.u[0], tU.u[1] + tF.u[1]], Lg = Math.hypot(...v); return [v[0] / Lg, v[1] / Lg]; })();
    const samp = (d, x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null; const i = (yi * W + xi) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const out = new ImageData(new Uint8ClampedArray(base.data), W, H); const od = out.data;
    for (let y = 600; y < 2300; y++) for (let x = 300; x < 1300; x++) { const i = (y * W + x) * 4; if (od[i + 3] < 8) continue;
      const Pp = [x, y]; const map = (m, s) => { const v = sub(Pp, m.a); const t = dot(v, m.u) / m.L, dd = dot(v, m.n); return [s.a[0] + s.u[0] * s.L * t + s.n[0] * dd, s.a[1] + s.u[1] * s.L * t + s.n[1] * dd]; };
      const side = dot(sub(Pp, NJ.elbowR), bis); const w = Math.max(0, Math.min(1, (side + 20) / 40));
      const pu = map(tU, sU), pf = map(tF, sF); const q = [pu[0] * (1 - w) + pf[0] * w, pu[1] * (1 - w) + pf[1] * w];
      const s = samp(T.data, q[0], q[1]); if (!s || s[3] < 128) continue;
      const dist = Math.hypot(s[0] - tskin[0], s[1] - tskin[1], s[2] - tskin[2]); const a = Math.max(0, Math.min(1, (dist - 30) / 60)); if (!a) continue;
      // ink colour with the tattoo arm's own skin removed, laid over the mirrored skin (keeps muscle shading)
      for (let c = 0; c < 3; c++) { const ink = Math.min(255, s[c] * (skin[c] / Math.max(1, tskin[c]))); const shade = od[i + c] / skin[c]; od[i + c] = Math.round(od[i + c] * (1 - a) + Math.min(255, ink * Math.min(1.1, shade)) * a); } }
    const armR = await crop(out);
    // ---------- hands
    const fW = (img, wrist, u) => { const n = [-u[1], u[0]]; let w = 0; const c = [wrist[0] - u[0] * 45, wrist[1] - u[1] * 45]; for (const sg of [1, -1]) for (let r = 0; r < 200; r++) { const p = samp(img, c[0] + n[0] * r * sg, c[1] + n[1] * r * sg); if (!p || p[3] < 128) { w += r; break; } } return w; };
    const oldW = fW(T.data, J.wristR, sF.u), newW = fW(out.data, NJ.wristR, tF.u); const hs = newW / oldW;
    const ang = Math.atan2(tF.u[1], tF.u[0]) - Math.atan2(sF.u[1], sF.u[0]);
    const handsR = {}, handsL = {};
    for (const p of POSES) { const hp = HP['handR_' + p]; if (!hp) continue; const im = await ld(files[hp.file]);
      const c = new OffscreenCanvas(W, H), cx = c.getContext('2d'); cx.translate(NJ.wristR[0], NJ.wristR[1]); cx.rotate(ang); cx.scale(hs, hs); cx.translate(-J.wristR[0], -J.wristR[1]); cx.drawImage(im, hp.x, hp.y);
      const hd = cx.getImageData(0, 0, W, H); const d = hd.data;
      // tone-match: hand skin → arm skin
      const hk = [[], [], []]; for (let i = 0; i < W * H * 4; i += 4 * 3) if (d[i + 3] > 250 && lum(d, i) > 150) for (let k = 0; k < 3; k++) hk[k].push(d[i + k]);
      const hsk = hk.map(a => { a.sort((x, y) => x - y); return a[a.length >> 1] || 1; });
      for (let i = 0; i < W * H * 4; i += 4) if (d[i + 3]) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, d[i + k] * skin[k] / hsk[k]);
      handsR[p] = await crop(hd);
      // left = mirror, ink removed (ink mask = far from skin), harmonic fill from skin neighbours
      const m = new ImageData(new Uint8ClampedArray(W * H * 4), W, H); const md = m.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, t = (y * W + (2 * MX - x)) * 4; if (2 * MX - x < 0 || 2 * MX - x >= W) continue; for (let k = 0; k < 4; k++) md[t + k] = d[s + k]; }
      const bb = bbox(md); const ink = []; const isInk = new Uint8Array(W * H);
      for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) { const i = y * W + x; if (md[i * 4 + 3] < 200) continue; const dd = Math.hypot(md[i * 4] - skin[0], md[i * 4 + 1] - skin[1], md[i * 4 + 2] - skin[2]); if (dd > 55 && lum(md, i * 4) < 175) isInk[i] = 1; }
      // dilate 2px (inside the hand only)
      const ink2 = new Uint8Array(isInk); for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) { const i = y * W + x; if (!isInk[i]) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; if (md[j * 4 + 3] > 200) ink2[j] = 1; } }
      // outline pixels (dark, on the edge) are lines, not ink: keep pixels within 3px of transparency
      for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) { const i = y * W + x; if (!ink2[i]) continue; let edge = false; for (let r = 1; r <= 3 && !edge; r++) for (const j of [i - r, i + r, i - r * W, i + r * W]) if (md[j * 4 + 3] < 100) { edge = true; break; } if (edge) ink2[i] = 0; else ink.push(i); }
      const f = new Float32Array(ink.length * 3).fill(0); const idx = new Map(ink.map((v, k) => [v, k]));
      for (let k = 0; k < ink.length; k++) for (let c = 0; c < 3; c++) f[k * 3 + c] = skin[c];
      for (let it = 0; it < 300; it++) for (let k = 0; k < ink.length; k++) { const i = ink[k]; let n = 0; const acc = [0, 0, 0]; for (const j of [i - 1, i + 1, i - W, i + W]) { if (md[j * 4 + 3] < 200) continue; const kj = idx.get(j); n++; for (let c = 0; c < 3; c++) acc[c] += kj === undefined ? md[j * 4 + c] : f[kj * 3 + c]; } if (n) for (let c = 0; c < 3; c++) f[k * 3 + c] = acc[c] / n; }
      for (let k = 0; k < ink.length; k++) for (let c = 0; c < 3; c++) md[ink[k] * 4 + c] = f[k * 3 + c];
      handsL[p] = await crop(m);
    }
    // ---------- capR from torso + new armR
    const cc = new OffscreenCanvas(W, H), cx = cc.getContext('2d'); cx.drawImage(await ld(files[P.torso.file]), P.torso.x, P.torso.y); const ac = new OffscreenCanvas(W, H); ac.getContext('2d').putImageData(out, 0, 0); cx.drawImage(ac, 0, 0);
    const C = P.capR, r = (C.w - 1) / 2, cap = new OffscreenCanvas(C.w, C.h), kx = cap.getContext('2d'); kx.drawImage(cc, -C.x, -C.y); const cd = kx.getImageData(0, 0, C.w, C.h);
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const dd = Math.hypot(x - r, y - r), k = (y * C.w + x) * 4; const f = dd >= r ? 0 : dd <= r - 30 ? 1 : (r - dd) / 30; cd.data[k + 3] = Math.round(cd.data[k + 3] * f * f * (3 - 2 * f)); }
    kx.putImageData(cd, 0, 0);
    return { armR, handsR, handsL, cap: await enc(cap), skin, tskin, hs, angDeg: ang * 180 / Math.PI };
  }, { files: Object.fromEntries([P.armL.file, P.armR.file, P.torso.file, ...POSES.map(p => rig.handPoses['handR_' + p] && rig.handPoses['handR_' + p].file).filter(Boolean)].map(f => [f, b(f)])), P, HP: rig.handPoses, J, NJ, MX, POSES });
  const bk = path.join(dir, '_before_symmetry'); fs.mkdirSync(path.join(bk, 'hands'), { recursive: true });
  for (const f of ['armR.png', 'capR.png', 'handR.png', 'handL.png']) if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(bk, f));
  for (const f of fs.readdirSync(path.join(dir, 'hands')).filter(f => f.endsWith('.png'))) fs.copyFileSync(path.join(dir, 'hands', f), path.join(bk, 'hands', f));
  const w = (rel, d) => fs.writeFileSync(path.join(dir, rel), Buffer.from(d, 'base64'));
  w('armR.png', res.armR.png); rig.pieces.armR = { file: 'armR.png', x: res.armR.x, y: res.armR.y, w: res.armR.w, h: res.armR.h };
  w('capR.png', res.cap);
  for (const [p, v] of Object.entries(res.handsR)) { w(`hands/handR_${p}.png`, v.png); rig.handPoses['handR_' + p] = { file: `hands/handR_${p}.png`, x: v.x, y: v.y, w: v.w, h: v.h, bindTo: 'handR' }; }
  for (const [p, v] of Object.entries(res.handsL)) { w(`hands/handL_${p}.png`, v.png); rig.handPoses['handL_' + p] = { file: `hands/handL_${p}.png`, x: v.x, y: v.y, w: v.w, h: v.h, bindTo: 'handL', note: 'mirror of handR_' + p + ' without tattoos' }; }
  rig.pieces.handR = { ...rig.handPoses.handR_relaxed }; rig.pieces.handL = { ...rig.handPoses.handL_relaxed };
  rig.joints.elbowR = NJ.elbowR; rig.joints.wristR = NJ.wristR; rig.joints.shoulderR = NJ.shoulderR;
  rig.symmetry = 'armR = mirror(armL) + tattoo ink; all hands = one back-of-hand set (R tattooed, L mirrored without ink)';
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log('skin', res.skin, 'tattoo skin', res.tskin, 'hand scale', res.hs.toFixed(3), 'rot', res.angDeg.toFixed(1), 'armR', res.armR.x, res.armR.y, res.armR.w + 'x' + res.armR.h);
  await br.close();
})();
